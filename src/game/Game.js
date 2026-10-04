import { HeroStudio, heroTitle } from './hero/HeroStudio.js';
import { HeroPresence } from './hero/HeroPresence.js';
import { GamepadInput } from './GamepadInput.js';
import { CombatCoach, defeatAdvice } from './combat/CombatCoach.js';
import { Journey } from './progression/Journey.js';
import { readRun, writeStored } from './progression/Storage.js';
import { Blessings, BLESSINGS } from './progression/Blessings.js';
import { lockFraming } from './LockFraming.js';
import { MathUtils, Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { quality, TOUCH, DynamicBudget } from '../core/Quality.js';
import { TouchControls } from '../ui/TouchControls.js';
import { AIDirector } from './ai/AIDirector.js';
import { PlayerCombat } from './combat/PlayerCombat.js';
import { BowRig } from './combat/BowRig.js';
import { WeaponSet } from './combat/WeaponSet.js';
import { WeaponMotion } from './combat/WeaponMotion.js';
import { DragonForm } from './combat/DragonForm.js';
import { Effects } from './fx/Effects.js';
import { Ribbons } from './fx/Ribbons.js';
import { Magic } from './magic/Magic.js';
import { Sound } from './audio/Sound.js';
import { HUD } from './ui/HUD.js';
import { Screens } from './ui/Screens.js';
import './ui/game.css';

const _v = new Vector3();
const _look = { x: 0, y: 0 };

/**
 * The trial, laid over the template.
 *
 * `App` still owns the renderer, the world, the character, the bodies and the
 * frame loop; this class adds the rules on top through three hooks it calls
 * (`update` after the controller has moved the body, `lateUpdate` after the
 * camera) and a time scale it reads. Every gameplay system hangs off here so
 * each of them can reach the others through one object: the combat asks it to
 * damage a body, the AI asks it where the player is, the magic asks it for the
 * effects, and none of them import each other.
 */
export class Game {
  constructor(app) {
    this.app = app;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.rig.shakeScale = this.reducedMotion ? 0 : TOUCH ? 0.45 : 1;
    this._spiritImpactAt = -Infinity;
    this.quality = quality;
    this.budget = new DynamicBudget(app.renderer);
    this.input = app.input;
    this.touch = new TouchControls(this.input, { visible: TOUCH });
    this.audio = new Sound();
    this.screens = new Screens({ touch: TOUCH });
    this.hud = null;
    this.state = 'loading';
    this.blessings = new Blessings();
    this.cinematic = false;
    this.elapsed = 0;
    this.playTime = 0;
    this.retries = 0;
    this.kills = 0;
    this.score = 0;
    this.boss = null;
    this.stage = null;
    this.flow = null;

    /** Delayed calls on game time: paused with the game, dropped on a retry. */
    this._timers = [];
    this._slow = 1;
    this._slowTimer = 0;
    this._slowScale = 1;
    this.slowFactor = 1;
    this._muted = false;

    document.body.classList.add('game');
    app.renderer.applyPixelRatio(this.budget.pixelRatio);
    app.environment.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    if (TOUCH) {
      // The orbit drag belongs to the right half of the screen, not the whole canvas.
      app.rig.controls.touches = { ONE: null, TWO: null };
    }
    // The mouse itself turns the camera (see GameInput), so no button drags
    // the orbit; the buttons are attack and guard.
    app.rig.controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: null };
    // OrbitControls takes no input at all in the game (its update still runs
    // the orbit); left enabled, it would grab the pointer on every click.
    app.rig.controls.enabled = false;
    this.input.canLock = () => !TOUCH && this.state === 'playing';
    this.input.canJump=()=>{
      const p=this.player;
      if(this.state!=='playing'||this.cinematic||this.form.active||p.state!=='free'||p.air.active||p.character.jump?.locked||p.character.hop?.locked)return false;
      p.arts.cancel();p.guarding=false;p.guardPose.stop();return true;
    };
    // Esc releases the pointer before the page sees the key: treat that as
    // asking for the pause menu.
    this.input.onSuspend = () => this.pause();
    this.input.onUnlock = () => {
      if (this.state === 'playing') this.pause();
    };

    // The samurai's own glow — the green gauntlets and the blade's emissive —
    // was authored for a bright studio. In the rain it reads as the body
    // lighting itself up, so it is turned well down here.
    app.character.model?.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const material of materials) {
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = Math.min(material.emissiveIntensity * 0.18, 0.12);
      }
    });

    app.enemies.maintain = false;
    const scaleUI = () => {
      const u = Math.max(0.78, Math.min(1.3, window.innerHeight / 430));
      document.documentElement.style.setProperty('--u', u.toFixed(3));
      // The portrait cover hides the battle: never let enemies keep attacking beneath it.
      if (window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches && this.state === 'playing') this.pause();
    };
    scaleUI();
    window.addEventListener('resize', scaleUI);

    const rotate = document.createElement('div');
    rotate.className = 'gs-rotate';
    rotate.innerHTML = '<div style="font-size:42px">⟲</div><div>端末を横向きにしてください</div>';
    document.body.appendChild(rotate);
    this.journey = new Journey(this);
    this.gamepad = new GamepadInput(this);
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Build everything that needs the character and the bodies. Called by
   * `App#load` once both are in, before the shader warm-up — so every
   * material the game adds is compiled with the rest.
   */
  async init({ Stage, Flow } = {}) {
    const app = this.app;
    this.enemies = app.enemies;
    this.director = new AIDirector(this);
    this.director.prepare();
    this.fx = new Effects(this);
    this.fx.ribbons = new Ribbons(app.camera);
    this.fx.group.add(this.fx.ribbons.mesh);
    app.scene.add(this.fx.group);
    this.magic = new Magic(this);
    this.player = new PlayerCombat(this);
    this.bow = new BowRig(this);
    this.weapons = new WeaponSet(this);
    // Weapon models load on first use: nothing extra on a phone at start-up.
    this.motion = new WeaponMotion(this);
    this.form = new DragonForm(this);
    app.controller.combat = this.player;
    this.playerTarget = { position: app.character.position, alive: true };
    this.hud = new HUD(this);
    this.coach = new CombatCoach(this);
    this.heroStudio = new HeroStudio(this);
    this.heroPresence = new HeroPresence(this);
    await this.heroPresence.loadScabbard();
    this.hud.setVisible(false);
    this.touch.setVisible(false);

    if (Stage) {
      this.stage = new Stage(this);
      await this.stage.build();
    }
    if (Flow) {
      await this.director.loadAppearances();
      this.flow = new Flow(this);
    }
    this.audio.onThunder = () => this.stage?.lightning();
  }

  /** The loop is running: show the title. */
  ready() {
    this.state = 'title';
    this.app.paused = false;
    this.flow?.preview();
    this.screens.title({
      quality: { low: '軽量', mid: '標準', high: '高' }[quality.name],
      onStart: () => this.start(),
      onContinue: readRun() ? () => this.journey.continueRun() : null,
      onSettings: () => this.journey.settings(() => this.ready()),
      onPractice: () => this.journey.menu(() => this.ready()),
      onHero: () => this.heroStudio.menu(() => this.ready())
    });
  }

  start() {
    this.journey.leavePractice();
    this.journey.importPending = false;
    this.audio.unlock();
    this.form.load();
    // On a phone, take the whole screen and hold it sideways. Both are
    // best-effort: iOS Safari has neither, and a refusal changes nothing.
    if (TOUCH) {
      const root = document.documentElement;
      if (!document.fullscreenElement && root.requestFullscreen) {
        root.requestFullscreen({ navigationUI: 'hide' }).then(
          () => screen.orientation?.lock?.('landscape').catch(() => {}),
          () => {}
        );
      }
    }
    this.audio.play('confirm');
    this.screens.close();
    this.hud.setVisible(true);
    this.touch.setVisible(true);
    this.state = 'playing';
    this.playTime = 0;
    this.kills = 0;
    this.score = 0;
    this.retries = 0;
    this.journey.bossSeen = false;
    this.blessings.restore();
    this.player.revive();
    this.player.stats = { parries: 0, perfectDodges: 0, maxCombo: 0, damageTaken: 0, executions: 0 };
    this.magic.reactionCount = 0;
    if (this.flow) { this.flow.start(); this.journey.save(); }
    else this._sandbox();
  }

  /** No flow: a ring of bodies on the open template stage, for testing. */
  _sandbox() {
    const p = this.playerPosition;
    const types = ['ashigaru', 'ashigaru', 'shinobi', 'archer', 'oni'];
    types.forEach((type, i) => {
      const a = (i / types.length) * Math.PI * 2;
      this.director.spawn(type, p.x + Math.sin(a) * 9, p.z + Math.cos(a) * 9, a + Math.PI, { alert: true });
    });
    this.player.unlocked = [true, true, true];
  }

  /* ------------------------------------------------------------------ */
  /* the frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Run `fn` after `seconds` of play (real seconds, not slowed, paused when paused). */
  after(seconds, fn) {
    this._timers.push({ t: seconds, fn });
  }

  _tickTimers(raw) {
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const timer = this._timers[i];
      timer.t -= raw;
      if (timer.t > 0) continue;
      this._timers.splice(i, 1);
      timer.fn();
    }
  }

  /** Multiplier the App applies to the simulation clock. */
  get timeScale() {
    return this.slowFactor;
  }

  /** Before anything moves: input edges, pause, slow-motion clock. */
  preUpdate(raw) {
    this.heroPresence?.restore();
    if (this.playerPosition) (this._beforeMove ??= new Vector3()).copy(this.playerPosition);
    this.gamepad?.poll(raw);
    this.input.tick(raw);
    this.budget.sample(raw);
    this.journey?.update(this.app.paused ? 0 : raw);

    if (this.input.consume('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }

    if (this._slowTimer > 0) {
      this._slowTimer -= raw;
      this.slowFactor = this._slowTimer > 0 ? this._slowScale : 1;
    } else {
      this.slowFactor = 1;
    }
  }

  /** After the controller moved the body; before the bodies animate. */
  update(dt, raw) {
    if (this.state !== 'playing' && this.state !== 'title') return;
    this.elapsed += dt;
    if (this.state === 'playing') {
      this.playTime += raw;
      this._tickTimers(raw);
    }

    const position = this.app.character.position;
    if (this.stage && this._beforeMove) {
      const blocked = this.stage.moveSafely(position, this._beforeMove, .38);
      if (blocked && this.player.move?.warp.active) {
        for (const at of [this.player.move._from,this.player.move._to,this.player.move._past,this.player.move.warp]) { at.x=position.x;at.z=position.z; }
      }
    } else this.stage?.collide(position, 0.38);

    this._updateLock(raw);

    const ctx = this._ctx ?? (this._ctx = { player: position, director: null, playerDown: false });
    ctx.director = this.director;
    ctx.playerDown = this.player.dead || this.state !== 'playing';
    this.director.update(dt, ctx);
    this.magic.update(dt);
    this.weapons.update(dt);
    this.flow?.update(dt, raw);
    this.stage?.update(dt, raw, position);

    // Footsteps, off the gait's own speed.
    const speed = this.app.controller.speed;
    if (speed > 0.6 && this.player.state === 'free') {
      this._stepAcc = (this._stepAcc ?? 0) + dt * (speed > 3 ? 3.0 : 1.9);
      if (this._stepAcc >= 1) {
        this._stepAcc = 0;
        this.audio.play('step', { volume: speed > 3 ? 0.9 : 0.55, pitch: 0.85 + Math.random() * 0.3 });
      }
    }

    if (this.state === 'playing' && this.player.lockTarget?.alive) {
      this.player.headingOverride = this.player.guarding ? yawTo(position, this.player.lockTarget.position) : null;
    } else {
      this.player.headingOverride = null;
    }
  }

  /** After the camera: effects that follow the final pose, HUD, sound. */
  lateUpdate(dt, raw) {
    const app = this.app;
    // First: the bow's IK re-poses the arms the effects and camera follow.
    this.weapons.fist?.restoreHand();
    this.form.update(dt);
    this.motion.update(dt);
    this.weapons.fist?.lateUpdate();
    this.bow.update(dt, this.player.castTarget);
    this.player.spirit.lateUpdate();
    this.heroPresence?.update(dt);
    this.fx.update(dt, this.elapsed);
    this.fx.ribbons.update(dt);
    this._camera(raw);
    this.stage?.lateUpdate?.(dt, raw);

    const size = app.renderer.size;
    this.hud.update(raw, app.camera, size.width, size.height);
    const p = this.player;
    this.touch.sync({
      element: p.elementIndex,
      special: p.special,
      mp: p.mp,
      mpCost: p.spell.cost,
      execute: !this.form.active && this.executionTarget() !== null,
      transformed: this.form.active,
      skillReady: this.form._skillCd <= 0,
      locked: p.lockTarget?.alive,
      guard: p.guarding,
      available: p.unlocked,
      weapon: this.form.active ? '銀竜' : p.weapon.id==='katana'&&this.weapons.swords.id==='dual'?'二刀流':p.weapon.name,
      attackGlyph: this.form.active ? '爪' : p.air?.airborne ? '撃' : p.weapon.glyph,
      attackLabel: this.form.active ? '連撃' : p.air?.airborne ? '空中追撃' : p.character.jump?.locked||p.character.hop?.locked?'空中技':p.weapon.verb
    });

    this.audio.setListener(app.camera);
    this.audio.update(raw, { rain: this.stage ? 1 : 0.4 });
  }

  /* ------------------------------------------------------------------ */
  /* camera                                                              */
  /* ------------------------------------------------------------------ */

  _camera(raw) {
    const rig = this.app.rig;
    this.input.consumeLook(_look);
    const frame = lockFraming(this.playerPosition, this.state === 'playing' ? this.player.lockTarget : null, this.app.camera.aspect);
    if(this.state==='playing'&&(this.player.character.jump?.weight>0||this.player.character.hop?.weight>0)){
      const c=this.player.character;
      c.root.updateMatrixWorld(true);
      const rise=Math.min(1.5,Math.max(0,c.getBone('Hips').getWorldPosition(new Vector3()).y-c.position.y-c.height*.53));
      frame.y+=rise*.4;frame.distance+=rise*.3;
    }
    if(this.state==='playing'&&this.stage){
      const from=this.playerPosition.clone().add(new Vector3(0,1.3,0)),az=rig.azimuth;
      const desired=from.clone().add(new Vector3(Math.sin(az)*settings.camera.distance,1,Math.cos(az)*settings.camera.distance));
      const base=this.stage.projectileFraction(from,desired);
      if(base<.9){
        let best=base,side=0;
        for(const sign of [-1,1]){const probe=desired.clone().add(new Vector3(Math.cos(az)*sign*.6,0,-Math.sin(az)*sign*.6)),clear=this.stage.projectileFraction(from,probe);if(clear>best+.02){best=clear;side=sign;}}
        frame.x+=Math.cos(az)*side*.45;frame.z-=Math.sin(az)*side*.45;
      }
    }
    const blend = 1 - Math.exp(-Math.max(0, raw) * 5);
    rig.framingOffset.lerp(_v.set(frame.x, frame.y, frame.z), blend);
    rig.distanceBonus += (frame.distance - rig.distanceBonus) * blend;
    const sensitivity = (TOUCH ? 0.0062 : 0.0028) * (this.journey?.options.sensitivity ?? 1);
    if (_look.x || _look.y) rig.orbit(-_look.x * sensitivity, -_look.y * sensitivity * 0.7);

    if (this.state !== 'playing') {
      this.stage?.cameraCollide(rig, raw);
      return;
    }
    const position = this.app.character.position;
    const lock = this.player.lockTarget;
    if (lock?.alive) {
      // Behind the player, looking through them at the target.
      const wanted = Math.atan2(position.x - lock.position.x, position.z - lock.position.z);
      const delta = MathUtils.euclideanModulo(wanted - rig.azimuth + Math.PI, Math.PI * 2) - Math.PI;
      const hand = this.input.lookIdle < 0.6 ? 0.15 : 1;
      const desiredPolar = lockFraming(position, lock).y > 0 ? 1.12 : 1.28;
      const pitch = this.input.lookIdle < 1.2 ? 0 : (desiredPolar - rig.polar) * Math.min(1, raw * 1.5);
      rig.orbit(delta * Math.min(1, raw * 4.5) * hand, pitch);
    } else if (this.input.lookIdle > 1.4 && this.app.controller.speed > 2.5 && this.player.state === 'free') {
      // Drift in behind a running body, gently, once the thumb is off the pad.
      const wanted = this.app.character.facing + Math.PI;
      const delta = MathUtils.euclideanModulo(wanted - rig.azimuth + Math.PI, Math.PI * 2) - Math.PI;
      if (Math.abs(delta) < 2.6) rig.orbit(delta * Math.min(1, raw * 0.9), 0);
    }
    this.stage?.cameraCollide(rig, raw);
    this.coach?.update(this.app.paused ? 0 : raw);
    rig.camera.lookAt(rig.controls.target);
  }

  /* ------------------------------------------------------------------ */
  /* lock-on                                                             */
  /* ------------------------------------------------------------------ */

  _updateLock() {
    const player = this.player;
    if (this.input.consume('lock')) {
      if (player.lockTarget?.alive) player.lockTarget = null;
      else player.lockTarget = this._bestLock();
      this.audio.play('select');
    }
    const tap = this.input.consumeTap();
    if (tap) {
      const picked = this._pickAt(tap.x, tap.y);
      if (picked) {
        player.lockTarget = picked === player.lockTarget ? null : picked;
        this.audio.play('select');
      }
    }
    if (player.lockTarget && !player.lockTarget.alive) {
      // The locked body fell: slide to the next nearest one still in the fight.
      player.lockTarget = this._bestLock();
    }
    if (player.lockTarget && (!this.targetVisible(player.lockTarget) || player.lockTarget.position.distanceTo(this.playerPosition) > 26)) player.lockTarget = null;
  }

  targetVisible(enemy) {
    if (!enemy?.alive) return false;
    const from=this.playerPosition.clone();from.y+=1.3;
    const to=enemy.position.clone();to.y+=Math.min(2.6,(enemy.agent?.type.height??1.8)*.6);
    return (this.stage?.projectileFraction(from,to)??1)>=1;
  }

  _bestLock() {
    const camera = this.app.camera;
    const position = this.playerPosition;
    camera.getWorldDirection(_v);
    let best = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      const dx = enemy.position.x - position.x;
      const dz = enemy.position.z - position.z;
      const d = Math.hypot(dx, dz);
      if (d > 22 || !this.targetVisible(enemy)) continue;
      const align = (dx * _v.x + dz * _v.z) / (d * Math.hypot(_v.x, _v.z) || 1);
      if (align < -.1) continue;
      const score = d * (2.2 - align) * (enemy.agent.type.elite ? 0.6 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  _nearest(range) {
    let best = null;
    let bestD = range;
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      const d = enemy.position.distanceTo(this.playerPosition);
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }

  _pickAt(x, y) {
    const size = this.app.renderer.size;
    let best = null;
    let bestD = 80;
    for (const enemy of this.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      if (!this.targetVisible(enemy)) continue;
      _v.copy(enemy.position);
      _v.y += enemy.agent.type.height * 0.6;
      _v.project(this.app.camera);
      if (_v.z > 1) continue;
      const sx = (_v.x * 0.5 + 0.5) * size.width;
      const sy = (-_v.y * 0.5 + 0.5) * size.height;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* queries                                                             */
  /* ------------------------------------------------------------------ */

  get playerPosition() {
    return this.app.character.position;
  }

  get rig() {
    return this.app.rig;
  }

  /** World heading the stick is pushed toward, or null. */
  stickHeading() {
    const axis = this.input.axis;
    if (!axis.x && !axis.y) return null;
    const azimuth = this.app.rig.azimuth;
    const sin = Math.sin(azimuth);
    const cos = Math.cos(azimuth);
    const x = axis.y * -sin + axis.x * cos;
    const z = axis.y * -cos + axis.x * -sin;
    return Math.atan2(x, z);
  }

  /** A broken body close enough to be executed, or null. */
  executionTarget() {
    if (!this.player || this.state !== 'playing') return null;
    const position = this.playerPosition;
    const lock = this.player.lockTarget;
    if (lock?.agent?.executable && lock.position.distanceTo(position) < 4.2) return lock;
    let best = null;
    let bestD = 3.6;
    for (const agent of this.director.agents) {
      if (!agent.executable) continue;
      const d = agent.position.distanceTo(position);
      if (d < bestD + agent.radius) {
        bestD = d;
        best = agent.enemy;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------------ */
  /* time                                                                */
  /* ------------------------------------------------------------------ */

  hitStop(seconds, scale = 0.06) {
    const app = this.app;
    if (seconds >= app._hitStop) {
      app._hitStop = seconds;
      app._hitStopScale = scale;
    }
  }

  slowMo(seconds, scale) {
    if (this._slowTimer > 0 && this._slowScale <= scale && this._slowTimer > seconds) return;
    this._slowTimer = seconds;
    this._slowScale = scale;
  }

  /* ------------------------------------------------------------------ */
  /* combat events                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * One blow (or spell, or reaction) lands on one body. The single place
   * damage is applied, so numbers, sound, sparks and score never disagree.
   */
  damageEnemy(enemy, hit) {
    const agent = enemy.agent;
    if (!agent || !enemy.alive) return null;
    if (hit.source === 'melee') hit = { ...hit, damage: hit.damage * this.blessings.damageMultiplier };
    hit = this.player.spirit.prepareHit(hit);
    const result = agent.takeHit(hit);
    this.player.spirit.landed(hit, result, enemy);
    if (!result) return null;
    const height = agent.type.height;
    _v.set(enemy.position.x - hit.dirX * agent.radius * 0.6, enemy.position.y + height * 0.6, enemy.position.z - hit.dirZ * agent.radius * 0.6);

    if (result.evaded) {
      this.hud.damage(enemy.position, '見切', { height: height * 0.9, color: '#c890ff' });
      return result;
    }

    if (result.damage > 0 && (hit.dragonPulse || hit.force?.spiritCalm) && this.elapsed - this._spiritImpactAt >= 0.15) {
      this._spiritImpactAt = this.elapsed;
      this.hitStop(hit.dragonPulse ? 0.075 : 0.1, 0.06);
      this.rig.shake(hit.dragonPulse ? 0.12 : 0.16);
      this.audio.play('heavyHit', { pos: enemy.position, volume: 0.65, pitch: 0.72 });
    }
    const crit = hit.execute || hit.heavy || result.broke || agent.state === 'recoil';
    if (result.damage > 0) this.hud.damage(enemy.position, result.damage, {
      crit,
      height: height * 0.85,
      color: hit.element ? { fire: '#ffb070', thunder: '#cfe0ff', ice: '#aef4ff' }[hit.element] : hit.source === 'burn' ? '#ff9050' : null
    });
    this.score += result.damage;

    if (!hit.quiet) {
      if (hit.source === 'melee' || hit.source === 'deflect') {
        this.fx.hit(_v, hit.dirX, hit.dirZ, { heavy: crit });
        this.audio.play(crit ? 'heavyHit' : hit.force?.sfx === 'kick' ? 'kick' : 'slash', { pos: enemy.position, pitch: 0.9 + Math.random() * 0.2 });
        if (hit.force?.slices !== false) this.app.blood.emit(_v, _v2(hit.dirX, 0.2, hit.dirZ), crit ? 60 : 24, crit ? 4.5 : 3);
      }
    }

    if (result.killed) this._kill(enemy, hit);
    else if (result.broke) this.player.special = Math.min(1, this.player.special + 0.06);
    return result;
  }

  _kill(enemy, hit) {
    const agent = enemy.agent;
    const force = {
      impulse: hit.force?.impulse ?? 4.5,
      lift: hit.force?.lift ?? 3.5,
      spin: hit.force?.spin ?? 1.6,
      slices: (hit.force?.slices ?? false) && hit.source === 'melee'
    };
    this.enemies.kill(enemy, hit.dirX || Math.sin(this.app.character.facing), hit.dirZ || Math.cos(this.app.character.facing), force);
    this.director.releaseToken(agent);
    this.kills++;
    this.player._hitComboTimer = Math.max(this.player._hitComboTimer, 3.4);
    this.score += agent.score;
    this.player.special = Math.min(1, this.player.special + (agent.type.elite ? 0.25 : 0.05));
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 6);
    this.audio.play('death', { pos: enemy.position, volume: agent.type.elite ? 1 : 0.35 });
    if (agent.type.elite || hit.execute) {
      this.hitStop(0.16, 0.03);
      this.slowMo(0.5, 0.35);
    }
    this.flow?.onKill(agent);
    this.journey.onKill(agent);
    if (!this.director.aliveCount && this.player.arts) this.player.arts.flourishQueued=true;
    if (agent.type.elite && this.director.aliveCount === 0) { this.audio.setCombat(0); this.hud.notice('雨音が戻った — 刀を収め、先へ', 3); }
  }

  /** A body commits to a move: the anticipation, before the glint. */
  onEnemyWindup(agent, spec) {
    this.coach?.warn(agent,spec);
    if (spec.unblockable) {
      this.hud.warn(agent, 1.4);
      this.audio.play('danger', { pos: agent.position });
    } else if (agent.type.elite || Math.random() < 0.35) {
      this.audio.play('growl', { pos: agent.position, volume: 0.5, pitch: agent.type.elite ? 0.6 : 1 });
    }
  }

  /** The parry cue: a star on the weapon a fixed moment before contact. */
  onEnemyGlint(agent, spec) {
    if (agent.type.id === 'samurai') return; // The authored blade glimpse is this enemy's cue.
    const enemy = agent.enemy;
    const hand = enemy.bones.get(spec.projectile ? 'LeftHand' : 'RightHand');
    if (hand) hand.getWorldPosition(_v);
    else _v.copy(enemy.position).setY(enemy.position.y + agent.type.height * 0.7);
    const danger = spec.unblockable === true;
    this.fx.telegraph(_v, danger);
    this.audio.play('telegraph', { pos: enemy.position, volume: danger ? 0.5 : 0.8, pitch: agent.type.elite ? 0.7 : 1 });
  }

  onParry(hit) {
    this.player.arts?.parry(hit);
    const position = this.playerPosition;
    const dx = hit.from.x - position.x;
    const dz = hit.from.z - position.z;
    const d = Math.hypot(dx, dz) || 1;
    _v.set(position.x + (dx / d) * 0.8, position.y + 1.3, position.z + (dz / d) * 0.8);
    this.fx.parry(_v, -dx / d, -dz / d);
    // The blade snaps forward through the turn, the body with it.
    this.player.body.impulse(2.4, (Math.random() < 0.5 ? -1 : 1) * 2);
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + (this.blessings.parryMp ?? 0));
    this.audio.play('parry');
    this.hitStop(0.09, 0.02);
    this.slowMo(0.55, 0.28);
    this.rig.shake(0.22);
    this.hud.flash('rgba(255,248,230,0.45)', 0.12);
    this.hud.bigText('弾', '#fff2d0', 0.7);
  }

  onBlock(hit) {
    const position = this.playerPosition;
    const dx = hit.from.x - position.x;
    const dz = hit.from.z - position.z;
    const d = Math.hypot(dx, dz) || 1;
    _v.set(position.x + (dx / d) * 0.7, position.y + 1.25, position.z + (dz / d) * 0.7);
    this.fx.block(_v, -dx / d, -dz / d);
    // Shoved back on the heels by the weight of it.
    this.player.body.impulse(-3.2 - (hit.damage ?? 10) * 0.08, 0);
    this.audio.play('block', { pitch: 0.9 + Math.random() * 0.2 });
    this.hitStop(0.04, 0.15);
    this.rig.shake(0.06);
  }

  onGuardBreak(hit) {
    this.coach?.hurt(hit,true);
    this.player.body.impulse(-7, 4);
    this.audio.play('guardBreak');
    this.hud.bigText('崩', '#ff8a5a', 0.8);
    this.rig.shake(0.25);
  }

  onPlayerHurt(hit) {
    this.coach?.hurt(hit);
    if (this.player.arts) this.player.arts.dirt = Math.min(1,this.player.arts.dirt+.12);
    this.audio.play('hurt');
    this.hitStop(0.06, 0.1);
    this.rig.shake(hit.knockdown ? 0.3 : 0.14);
    this.hud.flash('rgba(160,10,0,0.35)', 0.22);
    _v.copy(this.playerPosition).setY(this.playerPosition.y + 1.2);
    this.app.blood.emit(_v, _v2(0, 0.5, 0), 18, 2.5);
  }

  onPerfectDodge(hit) {
    this.player.arts?.perfect(hit);
    const p = this.player;
    if (!this.form?.active) {
      p.counterWindow = Math.max(p.counterWindow, 1.4);
      p.counterTarget = hit.attacker ?? null;
      p.guardMeter = Math.min(p.maxGuard, p.guardMeter + 18);
      p.spirit.defend(false);
    }
    this.audio.play('perfect');
    this.slowMo(0.45, 0.35);
    this.hud.bigText('見切り', '#bcd8ff', 0.7);
  }

  onEnemyBroken(agent) {
    this.audio.play('guardBreak', { pos: agent.position, volume: 0.8 });
    this.hud.notice(TOUCH ? '体勢崩し — 処刑ボタン！' : '体勢崩し — 攻撃で処刑！', 1.4);
  }

  beginExecution(target) {
    this.slowMo(0.75, 0.4);
    this.audio.play('execute');
    this.hud.flash('rgba(0,0,0,0.35)', 0.4);
    target.agent && (target.agent.timer = 99);
    if (target.agent?.onExecuted) target.agent.onExecuted();
  }

  /** The special: the judgement fist through a seal, on the target. */
  castSpecial() {
    const target = this.player.lockTarget?.alive ? this.player.lockTarget : this._nearest(16);
    if (!target) return false;
    const judgement = this.app.judgement;
    if (!judgement.cast(target)) return false;
    this.audio.play('charge');
    this.audio.play('bell', { volume: 0.6 });
    this.hud.bigText('奥義 · 天罰', '#ffd890', 1.2);
    this.slowMo(0.6, 0.45);
    this.player.invulnerable = 1.2;
    return true;
  }

  /** The judgement fist landed: an area blow centred on it. */
  onJudgement(enemy, x, z) {
    const at = enemy.position.clone();
    this.audio.play('slam');
    this.audio.play('explosion', { volume: 0.7 });
    this.rig.shake(0.45);
    this.hitStop(0.18, 0.03);
    for (const other of [...this.enemies.enemies]) {
      if (!other.alive || !other.agent) continue;
      const dx = other.position.x - at.x;
      const dz = other.position.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d > 4.8) continue;
      this.damageEnemy(other, {
        damage: other === enemy ? 110 : 60,
        posture: 80,
        dirX: d > 1e-3 ? dx / d : x,
        dirZ: d > 1e-3 ? dz / d : z,
        knockback: 3,
        launch: true,
        heavy: true,
        source: 'special',
        force: { impulse: 7, lift: 9, spin: 2.6, slices: false }
      });
    }
  }

  onPlayerDeath(hit) {
    this.coach?.hurt(hit, this.player.guardMeter <= 0);
    this.audio.play('death', { volume: 1 });
    this.slowMo(1.4, 0.3);
    this.hud.bigText('討死', '#c8321e', 1.6);
    this.player.lockTarget = null;
    this.after(1.6, () => {
      if (this.state !== 'playing') return;
      this.state = 'defeat';
      this.input.unlockPointer();
      this.touch.setVisible(false);
      this.screens.defeat({
        tip: defeatAdvice(this.coach?.lastCause,this.coach?.lastEnemy),
        onRetry: () => this.retry(),
        onTitle: () => this.toTitle()
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* flow                                                                */
  /* ------------------------------------------------------------------ */

  offerBlessing(shrine) {
    if (this.state !== 'playing' || this.blessings.choices.has(shrine)) return false;
    this.state = 'blessing';
    this.app.paused = true;
    this.touch.setVisible(false);
    this.input.unlockPointer();
    this.screens.blessing({
      choices: BLESSINGS,
      onChoose: (id) => {
        if (this.state !== 'blessing' || !this.blessings.choose(shrine, id)) return;
        if (this.flow) this.flow.checkpoint.blessings = this.blessings.snapshot();
        this.journey.save();
        this.resume();
        this.player.invulnerable = Math.max(this.player.invulnerable, 1);
        this.audio.play('pickup');
        this.hud.notice(`${BLESSINGS.find(b => b.id === id).name}を授かった`, 2.5);
      }
    });
    return true;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.app.paused = true;
    this.input.unlockPointer();
    this.touch.setVisible(false);
    this.input.reset();
    this.player._guardLatched = false;
    this._showPause();
  }

  _showPause() {
    this.screens.pause({
      muted: this._muted,
      onHero: () => this.heroStudio.menu(() => this._showPause()),
      onSettings: () => this.journey.settings(() => this._showPause()),
      onPractice: () => this.journey.menu(() => this._showPause()),
      onResume: () => this.resume(),
      onRetry: () => {
        this.resume();
        this.retry();
      },
      onTitle: () => this.toTitle(),
      onVolume: () => {
        const o = this.journey.options;
        if (o.volume > 0) { this._lastVolume = o.volume; o.volume = 0; }
        else o.volume = this._lastVolume ?? .9;
        this.journey.apply();
        writeStored('preferences', o);
        this._showPause();
      }
    });
  }

  resume() {
    if (this.heroStudio?.photo) { this.heroStudio.closePhoto(); return; }
    this.player.arts?.cancel();
    this.screens.close();
    this.state = 'playing';
    this.app.paused = false;
    this.touch.setVisible(true);
    this.audio.play('select');
  }

  _resetTransientCombat() {
    this.player?.arts?.cancel();
    this.input.reset();
    this.coach?.clear();
    if (this.player) this.player._guardLatched = false;
    this._slowTimer = 0;
    this._slowScale = this.slowFactor = 1;
    this.app._hitStop = 0;
    this.app._hitStopScale = 1;
  }

  retry() {
    if (this.journey.practice) return this.journey.startPractice(this.journey.practice.id, this.journey.practice.training);
    this._resetTransientCombat();
    this.retries++;
    this._timers.length = 0;
    this.player.arts?.cancel();
    this.screens.close();
    this.state = 'playing';
    this.app.paused = false;
    this.touch.setVisible(true);
    this.magic.clear();
    this.weapons?.clear();
    this.form?.clear();
    this.fx.clear();
    if (this.flow) this.flow.restartFromCheckpoint();
    else {
      this.director.clear();
      this.player.revive();
      this._sandbox();
    }
  }

  toTitle() {
    if (this.heroStudio?.photo) this.heroStudio.closePhoto();
    if (!this.journey.practice && this.state !== 'result') this.journey.save();
    this.journey.leavePractice();
    this._resetTransientCombat();
    this._timers.length = 0;
    this.screens.close();
    this.app.paused = false;
    this.magic.clear();
    this.weapons?.clear();
    this.form?.clear();
    this.fx.clear();
    this.director.clear();
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.audio.setCombat(0);
    this.boss = null;
    this.hud.showBoss('', false);
    this.player.revive();
    this.ready();
  }

  finish() {
    if (!this.journey.practice) writeStored('run', null);
    const stats = this.player.stats;
    const seconds = Math.round(this.playTime);
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    let points = 0;
    points += Math.max(0, 900 - seconds) * 2;
    points += stats.parries * 60 + stats.perfectDodges * 40 + stats.executions * 80 + stats.maxCombo * 15;
    points += this.magic.reactionCount * 50;
    points -= stats.damageTaken * 2 + this.retries * 300;
    const rank = points > 2600 ? 'S' : points > 1700 ? 'A' : points > 900 ? 'B' : 'C';
    const title = heroTitle(stats);
    const comment = {
      S: '見事。黒雨はやんだ。',
      A: '良い太刀筋だ。弾きを極めれば、さらに高みへ。',
      B: '生き延びた。敵の光る刃を見て、弾きを狙え。',
      C: '辛勝。回避と属性反応を使いこなせ。'
    }[rank];
    this.state = 'result';
    this.input.unlockPointer();
    this.touch.setVisible(false);
    this.hud.setVisible(false);
    this.screens.result({
      stats: {
        time,
        kills: this.kills,
        maxCombo: stats.maxCombo,
        parries: stats.parries,
        perfectDodges: stats.perfectDodges,
        executions: stats.executions,
        reactions: this.magic.reactionCount,
        damageTaken: stats.damageTaken,
        retries: this.retries,
        rank,
        comment: `${title} — ${comment}`
      },
      onAgain: () => {
        this.toTitle();
        this.start();
      },
      onTitle: () => this.toTitle()
    });
  }
}

function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

const _d = new Vector3();
function _v2(x, y, z) {
  return _d.set(x, y, z).normalize();
}
