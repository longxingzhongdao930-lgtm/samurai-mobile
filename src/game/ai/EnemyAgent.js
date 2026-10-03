import { updateEntrance } from './EnemyEntrance.js';
import { MathUtils } from 'three';
import { Attack } from '../../animation/Attack.js';
import { Locomotion } from '../../animation/Locomotion.js';
import { PoseLayer } from '../combat/PoseLayer.js';
import { equipEnemy } from './EnemyGear.js';
import { dressArmor, ARMOR_STYLES } from './EnemyArmor.js';

/**
 * The mind (and the hit points) of one body.
 *
 * States:
 *   idle      — standing, not yet aware of the player
 *   engage    — moving: closing to a slot on the ring around the player,
 *               circling it, or backing off (archers)
 *   attack    — committed to a move: wind-up (the telegraph), contact, recovery
 *   hurt      — flinching from a blow
 *   recoil    — thrown back by a parry: open to punishment
 *   down      — knocked off its feet, getting back up
 *   broken    — posture gone: kneeling, waiting to be executed
 *   frozen    — iced solid by a reaction
 *
 * The group decides who may swing (`AIDirector` hands out attack tokens), so
 * a crowd circles and takes turns instead of piling in — which is what makes
 * fifteen of them readable and fair.
 */
export class EnemyAgent {
  /**
   * @param {object} game
   * @param {import('../../combat/Enemy.js').Enemy} enemy
   * @param {object} type an entry of `data/enemies.js`
   * @param {Map<string, import('three').AnimationClip>} clips retargeted onto the enemy rig
   */
  constructor(game, enemy, type, clips) {
    this.game = game;
    this.enemy = enemy;
    this.type = type;
    this.radius = type.radius;
    enemy.radius = type.radius;
    enemy.agent = this;
    enemy.look = type.look;

    this.maxHp = type.hp;
    this.hp = type.hp;
    this.maxPosture = type.posture;
    this.posture = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.timer = 0;
    this.cooldown = 0.6 + Math.random() * 1.2;
    this.alert = false;
    this.token = false;
    this.move = null;
    this.moveSpec = null;
    /** The angle around the player this body prefers to hold, radians. */
    this.slotAngle = Math.random() * Math.PI * 2;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.velocity = { x: 0, z: 0 };
    this.speedNow = 0;
    /** Element marks: element id → seconds left. */
    this.marks = {};
    this.status = { burn: 0, burnDps: 0, slow: 0, slowFactor: 1, freeze: 0, stun: 0 };
    this._knock = { x: 0, z: 0 };
    this.hitFlash = 0;
    this._lean = 0;
    this._leanVel = 0;
    this.lastHitBy = null;
    this.aiSkip = 0;
    /** Score handed to the result when it dies. */
    this.score = type.score ?? 100;

    const mixer = enemy.mixer;
    this.locomotion = new Locomotion(mixer, {
      idle: enemy.action?.getClip() ?? clips.get('idle'),
      walk: clips.get('walk'),
      run: clips.get('run')
    });
    // The enemy's own idle action was started by `Enemy`; Locomotion now owns
    // its weight.
    const onStrike = (move, index) => this._onStrike(move, index);
    this.moves = type.attacks.map((spec) => {
      const move = new Attack(mixer, clips.get(`${type.id}:${spec.id}`) ?? clips.get(spec.clip), enemy, { config: spec, onStrike });
      move.spec = spec;
      return move;
    });
    this.kneel = new PoseLayer(mixer, clips.get('crouch'), { blendIn: 0.18, blendOut: 0.3 });
    this.fall = new PoseLayer(mixer, clips.get('land'), { blendIn: 0.06, blendOut: 0.3 });
    this.poses = [this.kneel, this.fall];
    this.locomotion.overrides.push(...this.moves, ...this.poses);

    enemy.onAnimate = (dt) => this._animate(dt);
    // Armour first, while the skeleton is still in its bind pose — every piece
    // is measured off it (see `EnemyArmor.js`).
    if (enemy.customAppearance) return;
    this.armor = dressArmor(enemy, ARMOR_STYLES[type.id] ?? null);
    this.gear = equipEnemy(enemy, type.gear, { horns: type.horns ?? (type.id === 'oni' ? 'horns' : null), hat: type.hat ?? null });
  }

  get alive() {
    return this.enemy.alive;
  }

  get position() {
    return this.enemy.position;
  }

  /** Whether a press of attack now would execute this body. */
  get executable() {
    return this.state === 'broken' && this.alive;
  }

  get attacking() {
    return this.state === 'attack';
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    const enemy = this.enemy;
    if (!enemy.alive) return;
    this.airRecovery = Math.max(0, (this.airRecovery ?? 0) - dt);
    if (this.airControlled) { this._setSpeed(0); return; }
    if (updateEntrance(this, dt)) { this._setSpeed(0); return; }
    this.stateTime += dt;
    this.cooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    enemy.flash = Math.max(this.hitFlash, this.status.freeze > 0 ? 0.55 : 0);
    this._tickStatus(dt);
    for (const id of Object.keys(this.marks)) {
      this.marks[id] -= dt;
      if (this.marks[id] <= 0) delete this.marks[id];
    }

    const slow = this.status.slow > 0 ? this.status.slowFactor : 1;
    const frozen = this.status.freeze > 0;
    const pace = frozen ? 0 : slow;
    for (const move of this.moves) move.update(dt * pace);
    for (const pose of this.poses) pose.update(dt);
    // The clip clock itself: a slowed body animates slowly, a frozen one not at all.
    enemy.timeScale = pace;

    if (frozen) {
      this._setSpeed(0);
      return;
    }

    // A shove from a blow, applied as a decaying slide.
    if (this._knock.x || this._knock.z) {
      const k = Math.min(1, dt * 8);
      enemy.position.x += this._knock.x * k;
      enemy.position.z += this._knock.z * k;
      this._knock.x *= 1 - k;
      this._knock.z *= 1 - k;
      if (Math.abs(this._knock.x) + Math.abs(this._knock.z) < 1e-3) this._knock.x = this._knock.z = 0;
    }

    const player = ctx.player;
    const dx = player.x - enemy.position.x;
    const dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    this.distance = distance;

    switch (this.state) {
      case 'idle':
        this._setSpeed(0);
        if (this.alert || distance < this.type.sight) this._engage();
        break;
      case 'engage':
        this._engageUpdate(dt, ctx, dx, dz, distance, slow);
        break;
      case 'attack':
        this._attackUpdate(dt, dx, dz);
        break;
      case 'hurt':
      case 'recoil':
        this._setSpeed(0);
        if (this.stateTime >= this.timer) this._toEngage();
        break;
      case 'down':
        this._setSpeed(0);
        if (this.stateTime >= this.timer) {
          this.fall.stop();
          this._toEngage();
        }
        break;
      case 'broken':
        this._setSpeed(0);
        if (this.stateTime >= this.timer) {
          this.kneel.stop();
          this.posture = this.maxPosture * 0.4;
          this._toEngage();
        }
        break;
      default:
        break;
    }

    // Posture recovers while the body is not being pressed.
    if (this.state !== 'broken' && this.timeSinceHit() > 1.6) {
      this.posture = Math.max(0, this.posture - dt * this.maxPosture * 0.12);
    }
    this._sinceHit = (this._sinceHit ?? 99) + dt;
  }

  timeSinceHit() {
    return this._sinceHit ?? 99;
  }

  _engage() {
    this.alert = true;
    this._toEngage();
    this.game.audio?.play('growl', { pos: this.enemy.position, volume: 0.45, pitch: this.type.elite ? 0.6 : 0.9 + Math.random() * 0.25 });
  }

  _toEngage() {
    this.state = 'engage';
    this.stateTime = 0;
  }

  _engageUpdate(dt, ctx, dx, dz, distance, slow) {
    if (this.enemy.ronin) return this.enemy.ronin.engage(dt, ctx, distance, slow);
    const type = this.type;
    const enemy = this.enemy;
    const director = ctx.director;

    // Ready to swing: take a token first (the crowd's permission), then close
    // to range with it and commit. Without one, keep the ring.
    if (this.cooldown <= 0 && !ctx.playerDown) {
      if (this.token || director.requestToken(this, type.ranged === true)) {
        const spec = this._chooseAttack(distance);
        if (spec) {
          this._approach = 0;
          this._startAttack(spec);
          return;
        }
        // Could not reach in time: hand the turn to someone else.
        this._approach = (this._approach ?? 0) + dt;
        if (this._approach > 3.5) {
          this._approach = 0;
          director.releaseToken(this);
          this.cooldown = 0.8;
        }
      }
    }

    // Where to stand: on a ring around the player, at this body's own angle.
    // Holders of a token close to striking range; everyone else keeps the ring
    // and drifts around it, so the group frames the player instead of stacking.
    let ring = type.ring;
    if (this.token) ring = Math.max(1.2, this._closeRange() * 0.75);
    const angle = this.slotAngle;
    let goalX = ctx.player.x + Math.sin(angle) * ring;
    let goalZ = ctx.player.z + Math.cos(angle) * ring;
    this.slotAngle += this.strafeDir * dt * (type.ranged ? 0.08 : 0.22);
    if (Math.random() < dt * 0.15) this.strafeDir *= -1;

    // Keep the slot on our side of the player — a body should not run *through*
    // the player to reach the far side of the ring.
    const toUs = Math.atan2(-dx, -dz);
    const diff = MathUtils.euclideanModulo(this.slotAngle - toUs + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(diff) > 1.1) this.slotAngle = toUs + Math.sign(diff) * 1.1;

    let gx = goalX - enemy.position.x;
    let gz = goalZ - enemy.position.z;
    const goalDistance = Math.hypot(gx, gz);

    let speed = 0;
    if (goalDistance > 0.35) {
      speed = goalDistance > 4 ? type.run : MathUtils.lerp(type.walk * 0.6, type.walk, Math.min(1, goalDistance / 2));
      gx /= goalDistance;
      gz /= goalDistance;
    } else {
      gx = gz = 0;
    }

    // Separation from the rest of the crowd.
    const sep = ctx.director.separation(this, enemy.position.x, enemy.position.z);
    let vx = gx * speed + sep.x * 2.2;
    let vz = gz * speed + sep.z * 2.2;
    const v = Math.hypot(vx, vz);
    const max = type.run;
    if (v > max) {
      vx *= max / v;
      vz *= max / v;
    }
    vx *= slow;
    vz *= slow;

    // Smooth the velocity so bodies do not jitter on the ring.
    const k = Math.min(1, dt * 6);
    this.velocity.x += (vx - this.velocity.x) * k;
    this.velocity.z += (vz - this.velocity.z) * k;
    enemy.position.x += this.velocity.x * dt;
    enemy.position.z += this.velocity.z * dt;

    // Always face the player while engaged — that is the tell that it is
    // dealing with you, and it keeps the wind-up readable from any angle.
    this._turnToward(Math.atan2(dx, dz), dt, 7);
    this._setSpeed(Math.hypot(this.velocity.x, this.velocity.z));
  }

  /** The shortest range any of this body's moves can start from. */
  _closeRange() {
    let best = Infinity;
    for (const spec of this.type.attacks) {
      if (spec.phases && !spec.phases.includes(this.phase)) continue;
      best = Math.min(best, spec.range);
    }
    return Number.isFinite(best) ? best : 2;
  }

  _chooseAttack(distance) {
    const options = [];
    for (const spec of this.type.attacks) {
      if (distance > spec.range) continue;
      if (spec.minRange && distance < spec.minRange) continue;
      options.push(spec);
    }
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  _startAttack(spec) {
    const move = this.moves.find((m) => m.spec === spec);
    if (!move) return;
    this.state = 'attack';
    this.stateTime = 0;
    this.move = move;
    this.moveSpec = spec;
    this.velocity.x = this.velocity.z = 0;
    this._setSpeed(0);
    move.start(this.game.playerTarget);
    if (this.enemy.ronin) { this.enemy.ronin.shifted = false; move.warp.active = false; }
    this._glinted = false;
    this.game.onEnemyWindup(this, spec);
  }

  _attackUpdate(dt, dx, dz) {
    const move = this.move;
    const enemy = this.enemy;
    if (!move) return this._endAttack();
    this.enemy.ronin?.attack(move);
    // The glint: a fixed lead before the blow lands, whatever the move's
    // length — so the flash itself is the parry cue, and learning one enemy's
    // rhythm teaches every enemy's.
    if (!this._glinted && this.timeToHit(move) <= (this.type.elite ? 0.5 : 0.42)) {
      this._glinted = true;
      this.game.onEnemyGlint(this, move.spec);
    }
    // Track the player through the wind-up, commit once it is over: the swing
    // can be read and stepped out of, which is the whole bargain.
    if (move.phase < (move.spec.windupTo ?? 0.3) * 0.85) {
      this._turnToward(Math.atan2(dx, dz), dt, 5);
      if (move.warp.active) {
        // Re-aim the approach at where the player is now.
        move._to.yaw = Math.atan2(dx, dz);
      }
    }
    if (move.warp.active) {
      enemy.position.x = move.warp.x;
      enemy.position.z = move.warp.z;
      this._setFacing(move.warp.yaw);
    }
    if (!move.locked) this._endAttack();
  }

  /** Seconds until this move's next contact frame, honouring the slowed wind-up. */
  timeToHit(move) {
    const spec = move.spec;
    const hits = spec.hits ?? [spec.hitAt ?? 0.5];
    const phase = move.phase;
    const next = hits.find((h) => h >= phase - 1e-4);
    if (next === undefined) return Infinity;
    const clip = move.action?.getClip().duration ?? 1;
    const span = ((spec.clipTo ?? 1) - (spec.clipFrom ?? 0)) * clip;
    const pace = spec.timeScale ?? 1;
    const normal = span / pace;
    const slow = span / (pace * (spec.windupScale ?? 0.4));
    const windupTo = spec.windupTo ?? 0;
    if (phase < windupTo) return (Math.min(next, windupTo) - phase) * slow + Math.max(0, next - windupTo) * normal;
    return (next - phase) * normal;
  }

  _endAttack() {
    this.state = 'engage';
    this.stateTime = 0;
    this.move = null;
    this.cooldown = (this.moveSpec?.cooldown ?? 1.6) * (0.75 + Math.random() * 0.6) / Math.max(0.3, this.type.aggression + 0.4);
    this.game.director.releaseToken(this);
  }

  /** The contact frame of this body's move: resolve it against the player. */
  _onStrike(move, index) {
    const spec = move.spec;
    if (this.enemy.ronin) this.game.fx?.slam?.(this.enemy.position, 1.5, '#dce8ff');
    if (spec.laser) { this.enemy.caster.fire(spec); return; }
    if (spec.projectile) {
      this.game.magic.enemyShot(this, spec);
      return;
    }
    if (spec.ring) this.game.fx?.slam(this.enemy.position, spec.ring, spec.unblockable ? '#ff3a1a' : '#ffb070');
    const player = this.game.playerPosition;
    const enemy = this.enemy;
    const dx = player.x - enemy.position.x;
    const dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    if (Math.abs(player.y - enemy.position.y) > (this.type.elite ? 2.6 : 1.5) || distance > spec.reach + 0.35) {
      this.game.audio?.play('whoosh', { pos: enemy.position, volume: 0.6 });
      return;
    }
    if (spec.arc < 360 && distance > 0.4) {
      const fx = Math.sin(this.enemy.facing);
      const fz = Math.cos(this.enemy.facing);
      if ((dx * fx + dz * fz) / distance < Math.cos(MathUtils.degToRad(spec.arc) * 0.5)) {
        this.game.audio?.play('whoosh', { pos: enemy.position, volume: 0.6 });
        return;
      }
    }
    const result = this.game.player.receiveHit({
      damage: spec.damage * (this.damageScale ?? 1),
      posture: spec.posture,
      knockback: spec.knockback,
      knockdown: spec.knockdown,
      unblockable: spec.unblockable,
      unparryable: spec.unparryable,
      guardBreak: spec.guardBreak,
      from: enemy.position,
      attacker: enemy,
      kind: spec.id
    });
    if (result === 'parry') this.onParried();
    else if (result === 'block') this._recoil(0.25);
  }

  /** The player turned this body's blow: it reels, open to the riposte. */
  onParried() {
    for (const move of this.moves) if (move.locked) move.release();
    this.game.director.releaseToken(this);
    this.posture += this.maxPosture * (this.type.elite ? 0.22 : 0.45);
    if (this.posture >= this.maxPosture) {
      this._break();
      return;
    }
    this._recoil(this.type.elite ? 0.7 : 1.0);
  }

  _recoil(seconds) {
    if (!this.alive || this.state === 'broken') return;
    for (const move of this.moves) if (move.locked) move.release();
    if (this.state === 'attack') this.game.director.releaseToken(this);
    this.state = 'recoil';
    this.stateTime = 0;
    this.timer = seconds;
    this.move = null;
    this.cooldown = Math.max(this.cooldown, seconds + 0.4);
    this.fall.play(0.36, 0.48, { seconds });
    const player = this.game.playerPosition;
    const dx = this.enemy.position.x - player.x;
    const dz = this.enemy.position.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    this._knock.x += (dx / d) * 0.9;
    this._knock.z += (dz / d) * 0.9;
    this._leanVel -= 4;
  }

  /* ------------------------------------------------------------------ */
  /* being hit                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * @returns {{damage: number, killed: boolean, broke: boolean}|null}
   */
  takeHit(hit) {
    if (!this.alive) return null;
    this.alert = true;
    this._sinceHit = 0;
    const type = this.type;

    // A light-footed type sometimes slips a blow it saw coming.
    if (type.evasion && hit.source === 'melee' && this.state === 'engage' && !hit.execute && Math.random() < type.evasion * 0.5) {
      this._sidestep(hit);
      return { evaded: true, damage: 0, killed: false, broke: false };
    }

    let damage = hit.damage;
    if (hit.execute) damage = Math.max(damage, this.hp);
    if (this.state === 'broken' || this.state === 'recoil') damage *= 1.35;
    if (this.status.freeze > 0) damage *= 1.5;
    damage = Math.round(damage * (this.damageTaken ?? 1));
    this.hp -= damage;
    this.hitFlash = 1;
    this.lastHitBy = hit.source;

    if (this.hp <= 0) {
      this.hp = 0;
      if (this.onLethal?.(hit)) return { damage, killed: false, broke: false };
      return { damage, killed: true, broke: false };
    }

    let broke = false;
    if (this.state !== 'broken') {
      this.posture += hit.posture * (this.state === 'recoil' ? 1.5 : 1);
      if (this.posture >= this.maxPosture) {
        this._break();
        broke = true;
      }
    }

    if (!broke && this.state !== 'broken') this._react(hit);
    return { damage, killed: false, broke };
  }

  _react(hit) {
    const type = this.type;
    const heavy = hit.launch || hit.heavy;
    // The lean is applied however armoured the body is — even a body that
    // shrugs the blow off has to *show* it took one, or hits read as misses.
    this._leanVel -= heavy ? 7 : 4.5;
    const knock = (hit.knockback ?? 0.5) * (type.superArmor ? 0.25 : 1);
    this._knock.x += hit.dirX * knock;
    this._knock.z += hit.dirZ * knock;

    if (type.superArmor && !(hit.launch && this.posture > this.maxPosture * 0.6)) return;
    if (this.state === 'attack' && this.move && this.move.phase > (this.move.spec.windupTo ?? 0.3) && !heavy && type.elite) {
      return; // committed elites trade
    }

    for (const move of this.moves) if (move.locked) move.release();
    if (this.state === 'attack') this.game.director.releaseToken(this);
    this.move = null;
    if (hit.launch && !type.elite) {
      this.state = 'down';
      this.timer = 1.25;
      this.fall.play(0.25, 0.92, { seconds: 1.25 });
    } else {
      this.state = 'hurt';
      this.timer = heavy ? 0.6 : 0.34;
      this.fall.play(0.37, 0.47, { seconds: this.timer });
    }
    this.stateTime = 0;
    this.cooldown = Math.max(this.cooldown, this.timer + 0.25);
  }

  _break() {
    for (const move of this.moves) if (move.locked) move.release();
    this.game.director.releaseToken(this);
    this.state = 'broken';
    this.stateTime = 0;
    this.timer = this.type.elite ? 4.5 : 3.6;
    this.move = null;
    this.posture = this.maxPosture;
    this.fall.stop();
    this.kneel.hold(0.4);
    this.game.onEnemyBroken(this);
  }

  _sidestep(hit) {
    const side = Math.random() < 0.5 ? -1 : 1;
    this._knock.x += -hit.dirZ * side * 2.4 + hit.dirX * 0.8;
    this._knock.z += hit.dirX * side * 2.4 + hit.dirZ * 0.8;
    this.game.fx?.afterimageAt(this.enemy);
    this.game.audio?.play('dodge', { pos: this.enemy.position, volume: 0.5, pitch: 1.2 });
  }

  /** Statuses from spells and reactions. */
  applyStatus(kind, value, seconds) {
    const status = this.status;
    if (kind === 'burn') {
      status.burn = Math.max(status.burn, seconds);
      status.burnDps = value;
    } else if (kind === 'slow') {
      status.slow = Math.max(status.slow, seconds);
      status.slowFactor = value;
    } else if (kind === 'freeze') {
      status.freeze = Math.max(status.freeze, seconds * (this.type.elite ? 0.5 : 1));
      for (const move of this.moves) if (move.locked) move.release();
      if (this.state === 'attack') {
        this.game.director.releaseToken(this);
        this._toEngage();
      }
    } else if (kind === 'stun') {
      if (this.type.superArmor) return;
      for (const move of this.moves) if (move.locked) move.release();
      if (this.state === 'attack') this.game.director.releaseToken(this);
      this.state = 'hurt';
      this.stateTime = 0;
      this.timer = seconds;
      this.move = null;
    }
  }

  _tickStatus(dt) {
    const status = this.status;
    if (status.burn > 0) {
      status.burn -= dt;
      this._burnAcc = (this._burnAcc ?? 0) + status.burnDps * dt;
      if (this._burnAcc >= 3) {
        const amount = Math.floor(this._burnAcc);
        this._burnAcc -= amount;
        this.game.damageEnemy(this.enemy, { damage: amount, posture: 0, dirX: 0, dirZ: 0, knockback: 0, source: 'burn', quiet: true, force: null });
      }
    }
    if (status.slow > 0) status.slow -= dt;
    if (status.freeze > 0) status.freeze -= dt;
  }

  /* ------------------------------------------------------------------ */
  /* the body                                                            */
  /* ------------------------------------------------------------------ */

  _setSpeed(speed) {
    this.speedNow = speed;
    this.locomotion.setSpeed(speed < 0.1 ? 0 : speed);
  }

  _turnToward(yaw, dt, rate) {
    const facing = this.enemy.facing;
    const delta = MathUtils.euclideanModulo(yaw - facing + Math.PI, Math.PI * 2) - Math.PI;
    this._setFacing(facing + delta * Math.min(1, dt * rate));
  }

  _setFacing(yaw) {
    const enemy = this.enemy;
    enemy.facing = yaw;
    enemy.root.rotation.y = yaw - enemy.forwardYaw;
  }

  /** After the mixer: the gait weights and the flinch spring. */
  _animate(dt) {
    // Runs inside Enemy#_live, after the mixer — so the locomotion weights set
    // here take effect next frame, which is invisible at these rates.
    this.locomotion.update(dt);
    // A damped spring on the lean: a hit kicks its velocity, it overshoots a
    // little and settles — the body rocks with the blow.
    this._leanVel += (-this._lean * 140 - this._leanVel * 14) * dt;
    this._lean += this._leanVel * dt;
    this.enemy.lean = MathUtils.clamp(this._lean, -0.45, 0.3);
  }

  dispose() {
    this.game.director?.releaseToken(this);
    this.enemy.agent = null;
    this.enemy.onAnimate = null;
  }
}
