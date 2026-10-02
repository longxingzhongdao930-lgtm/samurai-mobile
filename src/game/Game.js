import { MathUtils, Vector3 } from 'three';
import { settings } from '../config/settings.js';
import { quality, TOUCH, DynamicBudget } from '../core/Quality.js';
import { TouchControls } from '../ui/TouchControls.js';
import { AIDirector } from './ai/AIDirector.js';
import { PlayerCombat } from './combat/PlayerCombat.js';
import { BowRig } from './combat/BowRig.js';
import { WeaponSet } from './combat/WeaponSet.js';
import { WEAPON_ORDER } from './data/weapons.js';
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
    this.quality = quality;
    this.budget = new DynamicBudget(app.renderer);
    this.input = app.input;
    this.touch = new TouchControls(this.input, { visible: TOUCH });
    this.audio = new Sound();
    this.screens = new Screens({ touch: TOUCH });
    this.hud = null;
    this.state = 'loading';
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
    // Esc releases the pointer before the page sees the key: treat that as
    // asking for the pause menu.
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
    };
    scaleUI();
    window.addEventListener('resize', scaleUI);

    const rotate = document.createElement('div');
    rotate.className = 'gs-rotate';
    rotate.innerHTML = '<div style="font-size:42px">⟲</div><div>端末を横向きにしてください</div>';
    document.body.appendChild(rotate);
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
    this.weapons.preload(WEAPON_ORDER);
    app.controller.combat = this.player;
    this.playerTarget = { position: app.character.position, alive: true };
    this.hud = new HUD(this);
    this.hud.setVisible(false);
    this.touch.setVisible(false);

    if (Stage) {
      this.stage = new Stage(this);
      await this.stage.build();
    }
    if (Flow) this.flow = new Flow(this);
    this.audio.onThunder = () => this.stage?.lightning();
  }

  /** The loop is running: show the title. */
  ready() {
    this.state = 'title';
    this.app.paused = false;
    this.flow?.preview();
    this.screens.title({
      quality: { low: '軽量', mid: '標準', high: '高' }[quality.name],
      onStart: () => this.start()
    });
  }

  start() {
    this.audio.unlock();
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
    this.player.revive();
    this.player.stats = { parries: 0, perfectDodges: 0, maxCombo: 0, damageTaken: 0, executions: 0 };
    this.magic.reactionCount = 0;
    if (this.flow) this.flow.start();
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
    this.input.tick(raw);
    this.budget.sample(raw);

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
    this.stage?.collide(position, 0.38);

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
    this.bow.update(dt, this.player.castTarget);
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
      execute: this.executionTarget() !== null,
      locked: p.lockTarget?.alive,
      guard: p.guarding,
      available: p.unlocked,
      weapon: p.weapon.name
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
    const sensitivity = TOUCH ? 0.0062 : 0.0028;
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
      rig.orbit(delta * Math.min(1, raw * 4.5) * hand, 0);
    } else if (this.input.lookIdle > 1.4 && this.app.controller.speed > 2.5 && this.player.state === 'free') {
      // Drift in behind a running body, gently, once the thumb is off the pad.
      const wanted = this.app.character.facing + Math.PI;
      const delta = MathUtils.euclideanModulo(wanted - rig.azimuth + Math.PI, Math.PI * 2) - Math.PI;
      if (Math.abs(delta) < 2.6) rig.orbit(delta * Math.min(1, raw * 0.9), 0);
    }
    this.stage?.cameraCollide(rig, raw);
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
      player.lockTarget = this._nearest(10);
    }
    if (player.lockTarget && player.lockTarget.position.distanceTo(this.playerPosition) > 26) player.lockTarget = null;
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
      if (d > 22) continue;
      const align = (dx * _v.x + dz * _v.z) / (d * Math.hypot(_v.x, _v.z) || 1);
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
    const result = agent.takeHit(hit);
    if (!result) return null;
    const height = agent.type.height;
    _v.set(enemy.position.x - hit.dirX * agent.radius * 0.6, enemy.position.y + height * 0.6, enemy.position.z - hit.dirZ * agent.radius * 0.6);

    if (result.evaded) {
      this.hud.damage(enemy.position, '見切', { height: height * 0.9, color: '#c890ff' });
      return result;
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
    this.score += agent.score;
    this.player.special = Math.min(1, this.player.special + (agent.type.elite ? 0.25 : 0.05));
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 6);
    this.audio.play('death', { pos: enemy.position, volume: agent.type.elite ? 1 : 0.35 });
    if (agent.type.elite || hit.execute) {
      this.hitStop(0.16, 0.03);
      this.slowMo(0.5, 0.35);
    }
    this.flow?.onKill(agent);
  }

  /** A body commits to a move: the anticipation, before the glint. */
  onEnemyWindup(agent, spec) {
    if (spec.unblockable) {
      this.hud.warn(agent, 1.4);
      this.audio.play('danger', { pos: agent.position });
    } else if (agent.type.elite || Math.random() < 0.35) {
      this.audio.play('growl', { pos: agent.position, volume: 0.5, pitch: agent.type.elite ? 0.6 : 1 });
    }
  }

  /** The parry cue: a star on the weapon a fixed moment before contact. */
  onEnemyGlint(agent, spec) {
    const enemy = agent.enemy;
    const hand = enemy.bones.get(spec.projectile ? 'LeftHand' : 'RightHand');
    if (hand) hand.getWorldPosition(_v);
    else _v.copy(enemy.position).setY(enemy.position.y + agent.type.height * 0.7);
    const danger = spec.unblockable === true;
    this.fx.telegraph(_v, danger);
    this.audio.play('telegraph', { pos: enemy.position, volume: danger ? 0.5 : 0.8, pitch: agent.type.elite ? 0.7 : 1 });
  }

  onParry(hit) {
    const position = this.playerPosition;
    const dx = hit.from.x - position.x;
    const dz = hit.from.z - position.z;
    const d = Math.hypot(dx, dz) || 1;
    _v.set(position.x + (dx / d) * 0.8, position.y + 1.3, position.z + (dz / d) * 0.8);
    this.fx.parry(_v, -dx / d, -dz / d);
    // The blade snaps forward through the turn, the body with it.
    this.player.body.impulse(2.4, (Math.random() < 0.5 ? -1 : 1) * 2);
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

  onGuardBreak() {
    this.player.body.impulse(-7, 4);
    this.audio.play('guardBreak');
    this.hud.bigText('崩', '#ff8a5a', 0.8);
    this.rig.shake(0.25);
  }

  onPlayerHurt(hit) {
    this.audio.play('hurt');
    this.hitStop(0.06, 0.1);
    this.rig.shake(hit.knockdown ? 0.3 : 0.14);
    this.hud.flash('rgba(160,10,0,0.35)', 0.22);
    _v.copy(this.playerPosition).setY(this.playerPosition.y + 1.2);
    this.app.blood.emit(_v, _v2(0, 0.5, 0), 18, 2.5);
  }

  onPerfectDodge() {
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

  onPlayerDeath() {
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
        tip: this.flow?.tip() ?? '敵の刃が光った瞬間にガードで弾ける。',
        onRetry: () => this.retry(),
        onTitle: () => this.toTitle()
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* flow                                                                */
  /* ------------------------------------------------------------------ */

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.app.paused = true;
    this.input.unlockPointer();
    this.touch.setVisible(false);
    this.input.reset();
    this._showPause();
  }

  _showPause() {
    this.screens.pause({
      muted: this._muted,
      onResume: () => this.resume(),
      onRetry: () => {
        this.resume();
        this.retry();
      },
      onTitle: () => this.toTitle(),
      onVolume: () => {
        this._muted = !this._muted;
        if (this.audio.master) this.audio.master.gain.value = this._muted ? 0 : this.audio.volume.master;
        this._showPause();
      }
    });
  }

  resume() {
    this.screens.close();
    this.state = 'playing';
    this.app.paused = false;
    this.touch.setVisible(true);
    this.audio.play('select');
  }

  retry() {
    this.retries++;
    this._timers.length = 0;
    this.screens.close();
    this.state = 'playing';
    this.app.paused = false;
    this.touch.setVisible(true);
    this.magic.clear();
    this.weapons?.clear();
    this.fx.clear();
    if (this.flow) this.flow.restartFromCheckpoint();
    else {
      this.director.clear();
      this.player.revive();
      this._sandbox();
    }
  }

  toTitle() {
    this._timers.length = 0;
    this.screens.close();
    this.app.paused = false;
    this.magic.clear();
    this.weapons?.clear();
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
    const stats = this.player.stats;
    const seconds = Math.round(this.playTime);
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    let points = 0;
    points += Math.max(0, 900 - seconds) * 2;
    points += stats.parries * 60 + stats.perfectDodges * 40 + stats.executions * 80 + stats.maxCombo * 15;
    points += this.magic.reactionCount * 50;
    points -= stats.damageTaken * 2 + this.retries * 300;
    const rank = points > 2600 ? 'S' : points > 1700 ? 'A' : points > 900 ? 'B' : 'C';
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
        comment
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
