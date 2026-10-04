import { recoverLoad } from '../../loaders/RecoverLoad.js';
import { AnimationMixer, Box3, Group, LoopOnce, LoopRepeat, MathUtils, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { settings } from '../../config/settings.js';

const URL = './models/dragonkin.glb';
const HEIGHT = 2.7;
const DURATION = 16;
const _v = new Vector3();

// This FBX rig is Z-up locally. Pelvis X/Y contain travel; Z is height.
export function prepareDragonClips(animations) {
  const idle = animations.find((clip) => clip.name.endsWith('Btl_Std01'));
  const reference = idle?.tracks.find((track) => track.name === 'Pelvis_02.position')?.values;
  return animations.map((source) => {
    const clip = source.clone();
    clip.tracks = clip.tracks.filter((track) => !/^(_rootJoint|Root_01)\.position$/.test(track.name));
    for (const track of clip.tracks) {
      if (reference && track.name === 'Pelvis_02.position') {
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = reference[0];
          track.values[i + 1] = reference[1];
        }
      }
    }
    const start = Math.min(...clip.tracks.filter((track) => track.times.length > 1).map((track) => track.times[0]));
    if (Number.isFinite(start) && start > 0) for (const track of clip.tracks) track.shift(-start);
    clip.resetDuration();
    return clip;
  });
}

/**
 * 奥義 · 竜化 — the special turns the player into the silver dragonkin.
 *
 * The body underneath keeps running the game: position, facing, the dodge,
 * the hits taken. Only its model is hidden, and the dragon is stood where it
 * is, playing its own clips: the stance, walk and run picked from the body's
 * speed; four claw attacks on the attack button; three skills on the special.
 * Blows taken are cut to two fifths and never stagger. The form lasts sixteen
 * seconds, drained on the special gauge, and ends in a burst of smoke.
 *
 * Model: "Silver Dragonkin (Mir4)" by Doctor A. on Sketchfab, published as
 * CC BY 4.0 — a creature from the game MIR4; see the README credits.
 */
const ATTACKS = [
  { clip: 'Btl_Atk01', speed: 1.35, hitAt: 0.42, end: 0.82, reach: 3.4, arc: 150, damage: 26, posture: 22, knockback: 2.2 },
  { clip: 'Btl_Atk02', speed: 1.35, hitAt: 0.42, end: 0.82, reach: 3.4, arc: 150, damage: 26, posture: 22, knockback: 2.2 },
  { clip: 'Btl_Atk03', speed: 1.35, hitAt: 0.45, end: 0.85, reach: 3.6, arc: 180, damage: 30, posture: 26, knockback: 2.6 },
  { clip: 'Btl_Atk04', speed: 1.5, hitAt: 0.55, end: 0.8, reach: 4.2, arc: 360, damage: 40, posture: 40, knockback: 3.5, launch: true, ring: true }
];
const SKILLS = [
  { clip: 'Btl_Skl01', speed: 1.3, hitAt: 0.5, end: 0.85, reach: 5.2, arc: 360, damage: 55, posture: 60, knockback: 4, launch: true, ring: true, burst: '#9fd8ff' },
  { clip: 'Btl_Skl02', speed: 1.6, hitAt: 0.55, end: 0.8, reach: 6.0, arc: 120, damage: 60, posture: 60, knockback: 4.5, launch: true, ring: false, burst: '#c8ecff' },
  { clip: 'Btl_Skl03', speed: 1.6, hitAt: 0.55, end: 0.8, reach: 5.5, arc: 360, damage: 65, posture: 70, knockback: 5, launch: true, ring: true, burst: '#ffffff' }
];

export class DragonForm {
  constructor(game) {
    this.game = game;
    this.character = game.app.character;
    this.active = false;
    this.ready = false;
    this.time = 0;
    this.attack = null;
    this.combo = 0;
    this.skill = 0;
    this._comboIdle = 0;
    this._skillCd = 0;
    this.group = new Group();
    this.group.name = 'DragonForm';
    this.group.visible = false;
  }

  /** Fetched once the run has begun, so the title screen never waits on it. */
  load() {
    if (this._loading) return this._loading;
    this._loading = recoverLoad(URL, () => new GLTFLoader().loadAsync(URL))
      .then((gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.frustumCulled = false;
          }
        });
        model.updateMatrixWorld(true);
        const box = new Box3().setFromObject(model);
        const height = box.max.y - box.min.y || 1;
        model.scale.setScalar(HEIGHT / height);
        model.position.y = -box.min.y * (HEIGHT / height);
        this.group.add(model);
        this.wings=['Wing_L01_028','Wing_R01_030'].map(n=>model.getObjectByName(n)).filter(Boolean);
        this.mixer = new AnimationMixer(model);
        this.actions = {};
        for (const clip of prepareDragonClips(gltf.animations)) {
          const name = clip.name.replace(/^Mon_BlackDragon31_/, '');
          this.actions[name] = this.mixer.clipAction(clip);
        }
        this.game.app.scene.add(this.group);
        this.ready = true;
      })
      .catch((error) => { this._loading = null; console.warn('[DragonForm] model unavailable', error); });
    return this._loading;
  }

  /** Transform; false if the model is not in yet. */
  begin() {
    if (!this.ready || this.active) return false;
    const game = this.game;
    const p = game.player;
    this.active = true;this.reveal=.24;this.guarding=false;this.guardReserve=100;this.guardExhausted=false;
    this.originWeapon=p.weapon.id;if(p.arts)p.arts.transform=.3;
    this.duration = DURATION + (game.blessings?.dragonBonus ?? 0);
    this.time = this.duration;
    this.attack = null;
    this.combo = 0;
    this.skill = 0;
    this._skillCd = 0;
    this._comboIdle = 0;
    this.mixer.stopAllAction();
    this._current = null;
    this.character.tilt.visible = true;
    this.group.visible = false;
    this._place();
    this._loop('Btl_Std01', 0);
    this._oneShot({ clip: this.originWeapon==='gauntlet'?'Btl_Atk02':this.originWeapon==='odachi'?'Btl_Atk04':'Btl_Atk01', speed: 1.4, hitAt: 0.5, end: 0.8, reach: 4.5, arc: 360, damage: 30, posture: 50, knockback: 4, launch: true, ring: true, burst: '#bfe6ff' });
    this._camera = settings.camera.distance;
    settings.camera.distance = this._camera * 1.3;
    const at = this.character.position;
    game.fx.firePillar?.(at, 6);
    game.fx.explosion?.(_v.copy(at).setY(at.y + 1.2), 3.2, '#9fd8ff');
    game.fx.glow.burst(_v, '#e8f6ff', 40, { speed: 10, size: 0.08, life: 0.8, up: 4, gravity: -6 });
    game.audio.play('charge');
    game.audio.play('explosion', { volume: 0.8 });
    game.audio.play('bell', { volume: 0.6 });
    game.rig.shake(0.5);
    game.slowMo?.(0.5, 0.4);
    game.hud.bigText('奥義 · 竜化', '#bfe6ff', 1.4);
    p.invulnerable = 1.4;
    return true;
  }

  end(manual=false) {
    if (!this.active) return;
    const game = this.game;
    this.active = false;
    this.mixer.stopAllAction();
    this._current = null;
    this.attack = null;
    this.group.visible = false;
    this.character.tilt.visible = true;
    if (this._camera) settings.camera.distance = this._camera;
    const at = this.character.position;
    game.fx.dust(at, 2);
    game.fx.glow.burst(_v.copy(at).setY(at.y + 1), '#cfe8ff', 30, { speed: 6, size: 0.07, life: 0.7, up: 2, gravity: -4 });
    game.audio.play('shatter', { volume: 0.6 });
    game.player.special = manual ? Math.min(.65,Math.max(0,this.time/this.duration)*.65) : 0;
    this.guarding=false;
    if(manual)game.hud.notice('竜化解除 — 力の一部を温存',1.5);
    game.player.invulnerable = Math.max(game.player.invulnerable, 0.6);
    if(game.state==='playing'&&!game.player.dead)game.player.arts?.startSheath();
  }

  /**
   * The player's input while transformed. Returns the held state while a
   * clip owns the body, null to let it walk; `undefined` lets a dodge through.
   */
  control(dt, input) {
    const p = this.game.player;
    this.time -= dt;
    p.special = Math.max(0, this.time / (this.duration ?? DURATION));
    this._skillCd -= dt;
    if(!input.held?.guard&&this.guardReserve>=25)this.guardExhausted=false;
    this.guarding=!!input.held?.guard&&!this.attack&&this.guardReserve>0&&!this.guardExhausted;
    this.guardReserve=Math.max(0,Math.min(100,this.guardReserve+dt*(this.guarding?-16:9)));
    if(this.guardReserve===0&&!this.guardExhausted){this.guardExhausted=true;this.game.hud?.notice('翼が疲弊 — 守を解いて回復',2);}
    this._comboIdle += dt;
    if (this._comboIdle > 1.1) this.combo = 0;
    if (this.time <= 0 && (!this.attack || this.attack.struck || this.time <= -1)) {
      this.end();
      return null;
    }

    if (this.attack) {
      const a = this.attack;
      a.t += dt * a.spec.speed;
      const u = a.t / a.duration;
      if (!a.struck && u >= a.spec.hitAt) {
        a.struck = true;
        this._strike(a.spec);
      }
      // Chains: the next press takes over once the blow is out.
      const chain = this.time > 0 && a.struck && u > a.spec.hitAt + 0.08;
      if (chain && input.pending('special') && this._skillCd <= 0) return this._press(input);
      if (chain && input.pending('attack') && !a.spec.burst) return this._press(input);
      if (u >= a.spec.end) {
        this.attack = null;
        this._comboIdle = 0;
        return null;
      }
      input.consume('guard');
      return p._hold();
    }

    if (input.pending('dodge')) return undefined; // the body's own dodge
    input.consume('guard');
    input.consume('magic');
    if (input.pending('special') || input.pending('attack')) return this._press(input);
    return null;
  }

  _press(input) {
    const p = this.game.player;
    if (input.pending('special')) {
      input.consume('special');
      if (this._skillCd <= 0) {
        this._skillCd = 2.2;
        this._oneShot(SKILLS[this.skill++ % SKILLS.length]);
        return p._hold();
      }
      return null;
    }
    input.consume('attack');
    this._comboIdle = 0;
    this._oneShot(ATTACKS[this.combo % ATTACKS.length]);
    this.combo++;
    return p._hold();
  }

  _oneShot(spec) {
    const action = this.actions[spec.clip];
    if (!action) return;
    this._faceTarget(spec.reach + 2);
    this._fadePrevious(action, 0.12);
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = spec.speed;
    action.setEffectiveWeight(1);
    action.fadeIn(0.1).play();
    this._current = spec.clip;
    this.attack = { spec, t: 0, duration: action.getClip().duration, struck: false };
  }

  _loop(name, fade = 0.2) {
    if (this._current === name) return;
    const action = this.actions[name];
    if (!action) return;
    this._fadePrevious(action, fade);
    action.reset();
    action.setLoop(LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = 1;
    action.setEffectiveWeight(1);
    action.fadeIn(fade).play();
    this._current = name;
  }

  _fadePrevious(next, duration) {
    for (const [name, action] of Object.entries(this.actions)) {
      if (action === next) continue;
      // Never restart an older fade: that gives an old attack weight again.
      if (name === this._current) action.fadeOut(duration);
      else action.stop();
    }
  }

  _faceTarget(range) {
    const p = this.game.player;
    const pos = this.character.position;
    const target = p.lockTarget?.alive ? p.lockTarget : this.game.enemies.findTarget(pos, this.character.facing, { range, cone: 240 });
    if (target) this.character.setFacing(Math.atan2(target.position.x - pos.x, target.position.z - pos.z));
  }

  _strike(spec) {
    const game = this.game;
    const origin = this.character.position;
    const facing = this.character.facing;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const half = Math.cos(MathUtils.degToRad(Math.min(360, spec.arc)) * 0.5);
    let landed = 0;
    for (const enemy of [...game.enemies.enemies]) {
      if (!enemy.alive || !enemy.agent) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > spec.reach + (enemy.agent.radius ?? 0.4)) continue;
      if (d > 0.3 && spec.arc < 360 && (dx * fx + dz * fz) / d < half) continue;
      const result = game.damageEnemy(enemy, {
        damage: spec.damage,
        posture: spec.posture,
        knockback: spec.knockback,
        launch: spec.launch ?? false,
        dirX: d > 1e-3 ? dx / d : fx,
        dirZ: d > 1e-3 ? dz / d : fz,
        force: { impulse: 7, lift: 5, spin: 2 },
        slice: false,
        source: 'melee',
        heavy: true
      });
      if (result) landed++;
    }
    const at = _v.set(origin.x + fx * 1.4, origin.y, origin.z + fz * 1.4);
    if (spec.ring) game.fx.slam(at, spec.reach, spec.burst ?? '#bfe6ff');
    if (spec.burst) {
      game.fx.explosion?.(_v.setY(origin.y + 1), spec.reach * 0.5, spec.burst);
      game.audio.play('explosion', { volume: 0.7 });
    } else {
      game.audio.play('heavyHit', { pitch: 0.8 });
    }
    game.rig.shake(spec.burst ? 0.4 : 0.18);
    if (landed) game.hitStop(spec.burst ? 0.12 : 0.07, 0.05);
  }

  /** Blows taken while transformed: cut down, and never a stagger. */
  absorb(hit) {
    const p = this.game.player;
    const defending=this.guarding&&!hit.unblockable&&this.guardReserve>0&&!this.guardExhausted;
    const damage = (hit.damage ?? 10) * (defending?.16:.4);
    if(defending){this.guardReserve=Math.max(0,this.guardReserve-(hit.damage??10)*1.5);if(this.guardReserve===0){this.guardExhausted=true;this.game.hud?.notice('翼が疲弊 — 守を解いて回復',2);}}
    p.hp = Math.max(0, p.hp - damage);
    p.stats.damageTaken += damage;
    this.game.fx.block?.(_v.copy(this.character.position).setY(this.character.position.y + 1.5), 0, 0);
    this.game.audio.play('block', { pitch: 0.7 });
    if (p.hp <= 0) {
      this.end();
      return false;
    }
    return true;
  }

  _place() {
    this.group.position.copy(this.character.position);
    // The animated rig faces +Z, matching the controller and hit cone.
    this.group.rotation.y = this.character.facing;
  }

  update(dt) {
    if (!this.active || !this.mixer) return;
    this._place();
    if (!this.attack) {
      const speed = this.game.app.controller.speed ?? 0;
      this._loop(speed > 3.5 ? 'Btl_Run01' : speed > 0.4 ? 'Btl_Walk01' : 'Btl_Std01');
    }
    for(const [wing,q] of this._wingRest??[])wing.quaternion.copy(q);
    this.mixer.update(dt);
    this._wingRest=(this.wings??[]).map(w=>[w,w.quaternion.clone()]);
    this.reveal=Math.max(0,(this.reveal??0)-dt);this.group.visible=this.reveal===0;if(this.character.tilt)this.character.tilt.visible=this.reveal>0;
    const at=this.character.position,side=new Vector3(Math.cos(this.character.facing)*2,1.5,-Math.sin(this.character.facing)*2);
    const from=at.clone().add(new Vector3(0,1.5,0));
    const narrow=(this.game.stage?.projectileFraction(from,at.clone().add(side))??1)<1||(this.game.stage?.projectileFraction(from,at.clone().add(side.clone().multiplyScalar(-1).setY(1.5)))??1)<1;
    for(let i=0;i<(this.wings?.length??0);i++)this.wings[i].rotateY((i?1:-1)*(narrow?.35:this.guarding?.2:0));

  }

  clear() {
    this.end();
  }
}
