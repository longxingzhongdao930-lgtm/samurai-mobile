import { MathUtils, Vector3 } from 'three';
import { Attack } from '../../animation/Attack.js';
import { settings } from '../../config/settings.js';
import { PoseLayer } from './PoseLayer.js';
import { WEAPONS } from '../data/weapons.js';
import { SPELLS, SPELL_ORDER } from '../data/elements.js';

const _v = new Vector3();

/**
 * Everything the player's body can do in a fight, as one state machine.
 *
 * Movement stays with `ThirdPersonController`; this class is consulted first
 * each frame (`control`) and either lets the stick through — possibly slowed,
 * as under a guard — or takes the body for a move and hands back where it has
 * to be (the same `warp` shape the attacks already resolve). The moves are
 * `Attack` instances built from `data/weapons.js`, so the warp, the blend and
 * the contact timing are the template's own; what is added here is the order
 * they may follow each other in, the defence, and the resources.
 *
 * States: free · attack · dodge · hurt · down · cast · dead.
 */
export class PlayerCombat {
  /**
   * @param {object} game the `Game` — for the bodies, the effects and the sound
   */
  constructor(game) {
    this.game = game;
    this.character = game.app.character;
    this.input = game.input;
    this.weapon = WEAPONS.katana;

    /* ---- resources ---- */
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.maxMp = 100;
    this.mp = this.maxMp;
    /** 0..1 — the special is ready at 1. */
    this.special = 0;
    /** Guard stamina: blocking spends it; empty is a guard break. */
    this.maxGuard = 100;
    this.guardMeter = this.maxGuard;
    this.potions = 1;

    /* ---- state ---- */
    this.state = 'free';
    this.stateTime = 0;
    this.comboIndex = -1;
    /** The move holding the body, if any. */
    this.move = null;
    /** Seconds since the guard was raised (for the parry window). */
    this.guardTime = 99;
    this.guarding = false;
    /** Seconds left in which an attack press becomes the riposte. */
    this.counterWindow = 0;
    this.counterTarget = null;
    this.invulnerable = 0;
    this.lockTarget = null;
    this.elementIndex = 0;
    /** Which of the three elements have been learned. */
    this.unlocked = [true, false, false];
    /** True while the attack button is being held through a move (charge). */
    this._charging = false;
    this._chargeTime = 0;
    this._dodge = { active: false, t: 0, fromX: 0, fromZ: 0, dx: 0, dz: 0, yaw: 0, perfect: false };
    this._knock = { x: 0, z: 0 };
    this._comboGrace = 0;
    this.headingOverride = null;
    this._held = { warp: { active: false, x: 0, z: 0, yaw: 0 } };
    /** Statistics for the result screen. */
    this.stats = { parries: 0, perfectDodges: 0, maxCombo: 0, damageTaken: 0, executions: 0 };
    this.hitCombo = 0;
    this._hitComboTimer = 0;

    this._build();
  }

  /* ------------------------------------------------------------------ */
  /* construction                                                        */
  /* ------------------------------------------------------------------ */

  _build() {
    const character = this.character;
    const mixer = character.mixer;
    const clip = (name) => character.clips.get(name)?.clone() ?? null;
    const onStrike = (move, index) => this._onStrike(move, index);
    const make = (config) => new Attack(mixer, clip(config.clip), character, { config, onStrike });

    this.combo = this.weapon.combo.map(make);
    this.heavy = make(this.weapon.heavy);
    this.counter = make(this.weapon.counter);
    this.execute = make(this.weapon.execute);
    // The cast: the slash's wind-up, the hand forward on the release.
    this.cast = make({
      ...this.weapon.combo[0],
      id: 'cast', clipFrom: 0.04, clipTo: 0.3, timeScale: 1.6, hits: [0.72], lunge: 0,
      cancelAt: 0.85, recoverAt: 0.9, trail: false, standoff: 99, maxWarp: 0, sfx: null
    });
    this.moves = [...this.combo, this.heavy, this.counter, this.execute, this.cast];

    this.guardPose = new PoseLayer(mixer, character.clips.get('crouch'), { blendIn: 0.07, blendOut: 0.14 });
    this.dodgePose = new PoseLayer(mixer, character.clips.get('crouchSlash'), { blendIn: 0.04, blendOut: 0.18 });
    this.hurtPose = new PoseLayer(mixer, character.clips.get('land'), { blendIn: 0.05, blendOut: 0.25 });
    this.poses = [this.guardPose, this.dodgePose, this.hurtPose];

    // Every one of them masks the gait, the same way the template's own moves do.
    character.locomotion.overrides.push(...this.moves, ...this.poses);
  }

  get dead() {
    return this.state === 'dead';
  }

  get busy() {
    return this.state !== 'free';
  }

  get element() {
    return SPELL_ORDER[this.elementIndex];
  }

  get spell() {
    return SPELLS[this.element];
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Called by the controller before it moves the body.
   *
   * @returns {{warp: {active: boolean, x: number, z: number, yaw: number}}|null}
   *   the body's transform when a move has it, or null to let the stick move it
   */
  control(dt) {
    const input = this.input;
    this.stateTime += dt;
    this.guardTime += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.counterWindow = Math.max(0, this.counterWindow - dt);
    this._hitComboTimer -= dt;
    if (this._comboGrace > 0 && (this._comboGrace -= dt) <= 0 && this.state === 'free') this.comboIndex = -1;
    if (this._hitComboTimer <= 0) this.hitCombo = 0;
    this._regen(dt);

    for (const move of this.moves) move.update(dt);
    for (const pose of this.poses) pose.update(dt);

    this._readElementChips();

    if (this.state === 'dead') return this._hold();
    if (this.game.cinematic) return this._hold();

    // Knockback from a blow taken, applied as a decaying slide.
    if (this._knock.x || this._knock.z) {
      const position = this.character.position;
      const k = Math.min(1, dt * 9);
      position.x += this._knock.x * k;
      position.z += this._knock.z * k;
      this._knock.x *= 1 - k;
      this._knock.z *= 1 - k;
      if (Math.abs(this._knock.x) + Math.abs(this._knock.z) < 1e-3) this._knock.x = this._knock.z = 0;
    }

    switch (this.state) {
      case 'hurt':
        if (this.stateTime >= this._hurtTime) this._toFree();
        return this._hold();
      case 'down':
        if (this.stateTime >= this._hurtTime) this._toFree();
        return this._hold();
      case 'dodge':
        return this._updateDodge(dt);
      default:
        break;
    }

    // Defence first: a dodge cancels anything past its first frames, and the
    // guard can be raised out of a recovery.
    if (input.pending('dodge') && this._canCancel()) {
      input.consume('dodge');
      return this._startDodge();
    }

    if (input.pending('special') && this._canCancel(0.5)) {
      input.consume('special');
      if (this.special >= 1 && this.game.castSpecial()) {
        this.special = 0;
        this._startMove(this.combo[1], this.lockTarget ?? this._autoTarget(this.combo[1].config));
        this.state = 'cast';
        return this._held;
      }
      this.game.hud?.notice(this.special >= 1 ? '対象がいない' : '奥義ゲージが足りない');
    }

    if (input.pending('magic') && this._canCancel(0.55)) {
      input.consume('magic');
      if (this.mp >= this.spell.cost) {
        this.mp -= this.spell.cost;
        this._startMove(this.cast, this.lockTarget ?? this._autoTarget({ range: 18, arc: 70 }));
        this.state = 'cast';
        return this._held;
      }
      this.game.hud?.notice('霊力が足りない');
      this.game.audio?.play('deny');
    }

    // A fresh guard press cuts a swing short once its blow has gone out, so a
    // glint seen mid-combo can still be parried.
    if (this.state === 'attack' && input.held.guard && input.holdTime.guard < 0.1 && this._canCancel(0.4)) {
      for (const move of this.moves) if (move.locked) move.release();
      this._toFree();
    }

    // Every fresh press re-opens the parry window, even over a guard that is
    // already up — tapping guard in rhythm with the blows is the technique.
    const guardPressed = input.consume('guard');
    if (guardPressed) this.guardTime = 0;

    if (this.state === 'free' && input.held.guard) {
      if (!this.guarding) {
        this.guarding = true;
        this.guardTime = 0;
        this.game.audio?.play('guardUp', { volume: 0.5 });
      }
      this.guardPose.hold(0.35);
    } else if (this.guarding && (!input.held.guard || this.state !== 'free')) {
      this.guarding = false;
      this.guardPose.stop();
    }

    // Attack: an execution if a broken body is in front of us, the riposte
    // inside a parry's window, the next link of the combo otherwise.
    if (input.pending('attack')) {
      const target = this.game.executionTarget();
      if (target && this._canCancel(0.5)) {
        input.consume('attack');
        this._startExecution(target);
        return this._held;
      }
      if (this.counterWindow > 0 && this._canCancel(0)) {
        input.consume('attack');
        const victim = this.counterTarget?.alive ? this.counterTarget : this._autoTarget(this.counter.config);
        this.counterWindow = 0;
        this._startMove(this.counter, victim);
        this.game.audio?.play('counter');
        return this._held;
      }
      if (this._canChain()) {
        input.consume('attack');
        this._nextCombo();
        return this._held;
      }
    }

    // Holding attack through a combo link charges the dash cut.
    if (this.state === 'attack' && input.held.attack && this.move && this.move !== this.heavy) {
      this._chargeTime += dt;
      if (this._chargeTime > 0.34 && this.move.phase >= Math.min(0.55, this.move.config.cancelAt)) {
        this._chargeTime = 0;
        this._startMove(this.heavy, this.lockTarget ?? this._autoTarget(this.heavy.config, 9));
        this.game.audio?.play('charge');
        return this._held;
      }
    } else if (!input.held.attack) {
      this._chargeTime = 0;
    }

    if (this.state === 'attack' || this.state === 'cast') {
      const move = this.move;
      if (!move || !move.locked) {
        this._toFree();
        return null;
      }
      this._held.warp = move.warp;
      return this._held;
    }

    return null;
  }

  /** How fast the stick may move the body right now (the guard walks). */
  get moveScale() {
    return this.guarding ? this.weapon.guard.moveScale : 1;
  }

  _regen(dt) {
    this.mp = Math.min(this.maxMp, this.mp + dt * 4.5);
    if (!this.guarding) this.guardMeter = Math.min(this.maxGuard, this.guardMeter + dt * 22);
  }

  _readElementChips() {
    for (let i = 0; i < 3; i++) {
      if (!this.input.consume(`el${i}`)) continue;
      if (!this.unlocked[i]) {
        this.game.hud?.notice('まだ使えない術');
        continue;
      }
      if (this.elementIndex !== i) {
        this.elementIndex = i;
        this.game.audio?.play('select');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* attacks                                                             */
  /* ------------------------------------------------------------------ */

  _canCancel(minPhase = 0.35) {
    if (this.state === 'free') return true;
    if (this.state === 'attack' || this.state === 'cast') {
      return !this.move || !this.move.locked || this.move.phase >= Math.min(minPhase, this.move.config.cancelAt);
    }
    return false;
  }

  _canChain() {
    if (this.state === 'free') return true;
    if (this.state !== 'attack' || !this.move) return false;
    if (this.move === this.heavy || this.move === this.execute) return !this.move.locked;
    return this.move.phase >= this.move.config.cancelAt || !this.move.locked;
  }

  _nextCombo() {
    // A press shortly after a link finished still continues the string: the
    // grace is what lets a deliberate rhythm reach the fifth cut.
    const continuing =
      (this.state === 'attack' && this.move && this.combo.includes(this.move)) ||
      (this.state === 'free' && this._comboGrace > 0 && this.comboIndex >= 0);
    this.comboIndex = continuing ? (this.comboIndex + 1) % this.combo.length : 0;
    const move = this.combo[this.comboIndex];
    this._startMove(move, this.lockTarget ?? this._autoTarget(move.config));
  }

  _startMove(move, target) {
    for (const other of this.moves) if (other !== move && other.locked) other.release();
    this._cancelPoses();
    this.guarding = false;

    // Face the stick before a swing at nothing, so a whiff goes where the
    // thumb is pointing rather than where the last one went.
    if (!target) {
      const heading = this.game.stickHeading();
      if (heading !== null) {
        settings.character.facing = heading;
        this.character.setFacing(heading);
      }
    }

    // A big body is stood further off: the warp's standoff grows with the
    // target's width, so the blade meets the hide instead of the hips.
    move.baseConfig ??= move._config;
    const radius = target?.agent?.radius ?? 0;
    move._config = radius > 0.6 ? { ...move.baseConfig, standoff: move.baseConfig.standoff + (radius - 0.45), reach: move.baseConfig.reach + (radius - 0.45) } : move.baseConfig;
    move.start(target?.alive ? target : null);
    this.move = move;
    this.state = move === this.cast ? 'cast' : 'attack';
    this.stateTime = 0;
    this._held.warp = move.warp;
    if (move.config.sfx && move !== this.cast) {
      this.game.audio?.play('swing', { volume: move === this.heavy ? 1 : 0.75, pitch: move.config.timeScale > 1.8 ? 1.15 : 1 });
    }
    this.game.fx?.trail.begin(move.config.trail ? (move === this.heavy ? 1.5 : 1) : 0);
  }

  _startExecution(target) {
    this.stats.executions++;
    this.game.beginExecution(target);
    this._startMove(this.execute, target);
    this.invulnerable = 1.6;
  }

  /** Whoever a swing should be aimed at, when nothing is locked. */
  _autoTarget(config, range = 0) {
    const position = this.character.position;
    const heading = this.game.stickHeading() ?? this.character.facing;
    return this.game.enemies.findTarget(position, heading, {
      range: range || Math.max(4.2, (config.reach ?? 2.6) + (config.maxWarp ?? 2) * 0.8),
      cone: Math.max(100, config.arc ?? 120)
    });
  }

  /** A contact frame of a move: sweep everything in its arc. */
  _onStrike(move, index) {
    const config = move.config;
    if (move === this.cast) {
      this.game.magic.cast(this.element, move.target ?? this.lockTarget);
      return;
    }
    if (this.state === 'cast' && move === this.combo[1]) return; // the special's pose only

    const origin = this.character.position;
    const facing = this.character.facing;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const halfArc = Math.cos(MathUtils.degToRad(Math.min(360, config.arc)) * 0.5);
    let landed = 0;

    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      const dx = enemy.position.x - origin.x;
      const dz = enemy.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      const reach = config.reach + (enemy.agent.radius ?? 0.4) * 0.6;
      if (distance > reach) continue;
      if (distance > 0.3 && config.arc < 360 && (dx * fx + dz * fz) / distance < halfArc) continue;

      const executing = move === this.execute;
      const result = this.game.damageEnemy(enemy, {
        damage: config.damage,
        posture: config.posture,
        knockback: config.knockback,
        launch: config.launch,
        dirX: distance > 1e-3 ? dx / distance : fx,
        dirZ: distance > 1e-3 ? dz / distance : fz,
        force: config,
        slice: config.slices,
        execute: executing,
        source: 'melee',
        heavy: move === this.heavy || move === this.combo[4]
      });
      if (result) landed++;
    }

    if (config.ring) this.game.fx?.slam(origin, config.reach);

    if (landed > 0) {
      this.hitCombo += landed;
      this._hitComboTimer = 2.4;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.hitCombo);
      this.special = Math.min(1, this.special + 0.025 * landed);
      this.mp = Math.min(this.maxMp, this.mp + 1.6 * landed);
      this.game.hitStop(config.hitStop, config.hitStopScale);
      this.game.rig.shake(config.shake);
    } else if (index === 0 && config.sfx === 'slash') {
      // Nothing there: the blade still says it went through the air.
    }
  }

  /* ------------------------------------------------------------------ */
  /* dodge                                                               */
  /* ------------------------------------------------------------------ */

  _startDodge() {
    const spec = this.weapon.dodge;
    for (const move of this.moves) if (move.locked) move.release();
    this._cancelPoses();
    this.guarding = false;
    this.game.fx?.trail.end();

    const heading = this.game.stickHeading();
    const position = this.character.position;
    const dodge = this._dodge;
    dodge.active = true;
    dodge.t = 0;
    dodge.fromX = position.x;
    dodge.fromZ = position.z;
    dodge.perfect = false;
    let yaw;
    let back = false;
    if (heading !== null) {
      yaw = heading;
    } else {
      // No stick: a backstep, still facing whoever we were fighting.
      yaw = this.character.facing + Math.PI;
      back = true;
    }
    dodge.dx = Math.sin(yaw) * spec.distance * (back ? 0.75 : 1);
    dodge.dz = Math.cos(yaw) * spec.distance * (back ? 0.75 : 1);
    dodge.yaw = back ? this.character.facing : yaw;
    this.state = 'dodge';
    this.stateTime = 0;
    this.invulnerable = spec.iframes;
    this.dodgePose.play(0.08, 0.3, { seconds: spec.time });
    this.game.audio?.play('dodge');
    this.game.fx?.dust(position, 0.8);
    return this._updateDodge(0);
  }

  _updateDodge(dt) {
    const spec = this.weapon.dodge;
    const dodge = this._dodge;
    dodge.t += dt;
    const u = MathUtils.clamp(dodge.t / spec.time, 0, 1);
    // Fast off the mark and easing into the stop: the read is "burst".
    const ease = 1 - Math.pow(1 - u, 3);
    const warp = this._held.warp;
    warp.active = true;
    warp.x = dodge.fromX + dodge.dx * ease;
    warp.z = dodge.fromZ + dodge.dz * ease;
    warp.yaw = dodge.yaw;
    this.game.fx?.afterimage(this.character, dt);

    if (u >= 1) {
      this.dodgePose.stop();
      if (dodge.t >= spec.time + spec.recovery || this.input.pending('attack') || this.input.pending('dodge')) {
        dodge.active = false;
        this._toFree();
        // Dodge → attack is a common cancel: let the press be read this frame.
        return null;
      }
    }
    return this._held;
  }

  /* ------------------------------------------------------------------ */
  /* being hit                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * An enemy's blow arrives. Decides parry / block / dodge / hit and applies it.
   *
   * @param {{damage: number, from: {x: number, z: number}, unblockable?: boolean,
   *   guardBreak?: boolean, knockdown?: boolean, posture?: number, attacker?: object,
   *   kind?: string}} hit
   * @returns {'parry'|'block'|'evade'|'hit'|'break'|'ignored'}
   */
  receiveHit(hit) {
    if (this.state === 'dead' || this.game.cinematic) return 'ignored';
    const position = this.character.position;

    if (this.invulnerable > 0) {
      if (this.state === 'dodge' && !this._dodge.perfect) {
        this._dodge.perfect = true;
        this.stats.perfectDodges++;
        this.special = Math.min(1, this.special + 0.08);
        this.game.onPerfectDodge(hit);
      }
      return 'evade';
    }

    const dx = hit.from.x - position.x;
    const dz = hit.from.z - position.z;
    const distance = Math.hypot(dx, dz) || 1;
    const facing = this.character.facing;
    // The guard covers everything but the back: on a phone the body is not
    // always squared up, and a parry that failed for a few degrees of facing
    // would read as the input being dropped.
    const front = (dx * Math.sin(facing) + dz * Math.cos(facing)) / distance > -0.45;

    // Parry: the guard went up just before the blow. Works on everything but
    // a grab-like unblockable, and it is the only answer to a guard break.
    if (this.guarding && front && this.guardTime <= this.weapon.guard.parryWindow && !hit.unparryable) {
      this.stats.parries++;
      this.special = Math.min(1, this.special + 0.14);
      this.counterWindow = 1.1;
      this.counterTarget = hit.attacker ?? null;
      this.guardMeter = Math.min(this.maxGuard, this.guardMeter + 25);
      this._faceToward(hit.from.x, hit.from.z);
      this.game.onParry(hit);
      return 'parry';
    }

    if (this.guarding && front && !hit.unblockable) {
      const spec = this.weapon.guard;
      this.guardMeter -= (hit.guardDamage ?? hit.damage) * spec.breakScale * (hit.guardBreak ? 3 : 1);
      if (this.guardMeter <= 0) {
        this.guardMeter = 0;
        this.guarding = false;
        this.guardPose.stop();
        this._takeDamage(hit.damage * 0.5, hit);
        this._stagger(0.95, dx, dz, 1.1, false);
        this.game.onGuardBreak(hit);
        return 'break';
      }
      this._takeDamage(hit.damage * spec.chip, hit, true);
      this._knock.x -= (dx / distance) * 0.35;
      this._knock.z -= (dz / distance) * 0.35;
      this.game.onBlock(hit);
      return 'block';
    }

    this._takeDamage(hit.damage, hit);
    if (this.state === 'dead') return 'hit';
    const knockdown = hit.knockdown === true;
    this._stagger(knockdown ? 1.25 : 0.38, dx, dz, hit.knockback ?? (knockdown ? 2.4 : 0.7), knockdown);
    this.game.onPlayerHurt(hit);
    return 'hit';
  }

  _takeDamage(amount, hit, chip = false) {
    const damage = Math.max(0, Math.round(amount));
    if (damage <= 0) return;
    this.hp = Math.max(0, this.hp - damage);
    this.stats.damageTaken += damage;
    if (!chip) this.special = Math.min(1, this.special + 0.04);
    if (this.hp <= 0) this._die(hit);
  }

  _stagger(seconds, dx, dz, knock, knockdown) {
    for (const move of this.moves) if (move.locked) move.release();
    this._cancelPoses();
    this.guarding = false;
    this.game.fx?.trail.end();
    const distance = Math.hypot(dx, dz) || 1;
    this._knock.x = (-dx / distance) * knock;
    this._knock.z = (-dz / distance) * knock;
    this.state = knockdown ? 'down' : 'hurt';
    this.stateTime = 0;
    this._hurtTime = seconds;
    this.invulnerable = knockdown ? seconds + 0.25 : 0.18;
    if (knockdown) this.hurtPose.play(0.28, 0.85, { seconds });
    else this.hurtPose.play(0.36, 0.5, { seconds: seconds * 0.9 });
    this._faceToward(this.character.position.x + dx, this.character.position.z + dz);
  }

  _die(hit) {
    this.state = 'dead';
    this.stateTime = 0;
    for (const move of this.moves) if (move.locked) move.release();
    this._cancelPoses();
    this.hurtPose.play(0.3, 0.55, { seconds: 0.8 });
    this.game.onPlayerDeath(hit);
  }

  _faceToward(x, z) {
    const position = this.character.position;
    const yaw = Math.atan2(x - position.x, z - position.z);
    settings.character.facing = yaw;
    this.character.setFacing(yaw);
  }

  _cancelPoses() {
    this.guardPose.stop();
    this.dodgePose.stop();
    this.hurtPose.stop();
  }

  _hold() {
    const warp = this._held.warp;
    warp.active = false;
    return this._held;
  }

  _toFree() {
    const fromCombo = this.state === 'attack' && this.move && this.combo.includes(this.move);
    this.state = 'free';
    this.stateTime = 0;
    this.move = null;
    if (fromCombo) this._comboGrace = 0.45;
    else this.comboIndex = -1;
    this.hurtPose.stop();
    this.game.fx?.trail.end();
  }

  /** Back to full, standing — a retry from a checkpoint. */
  revive(hp = this.maxHp) {
    for (const move of this.moves) move.cancel();
    for (const pose of this.poses) pose.cancel();
    this.hp = hp;
    this.mp = this.maxMp;
    this.guardMeter = this.maxGuard;
    this.state = 'free';
    this.stateTime = 0;
    this.move = null;
    this.invulnerable = 1.5;
    this._knock.x = this._knock.z = 0;
    this.lockTarget = null;
    this.guarding = false;
    this.counterWindow = 0;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Where the blade's edge is this frame — for trails and sparks. */
  bladePoint(out = _v) {
    return out;
  }
}
