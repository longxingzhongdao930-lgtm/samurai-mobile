import { MathUtils, Vector3 } from 'three';
import { settings } from '../../config/settings.js';
import { EnemyAgent } from '../ai/EnemyAgent.js';

const _v = new Vector3();

const ATTACK = {
  enabled: true, clipFrom: 0, clipTo: 1, timeScale: 1, windupTo: 0.35, windupScale: 0.32,
  standoff: 2.2, maxWarp: 3, warpAt: 0.45, turnAt: 0.3, lunge: 0.6, passThrough: 0,
  recoverAt: 0.95, cancelAt: 1, blendIn: 0.14, blendOut: 0.25, reach: 4.2, arc: 140,
  damage: 18, posture: 10, knockback: 1.8, knockdown: false, unblockable: false, range: 4.6,
  cooldown: 1.2, phases: [1, 2, 3], weight: 1
};
const attack = (spec) => ({ ...ATTACK, ...spec });

/**
 * 黒角鬼・羅刹 — the type. The moves are cut from the same clips as everyone
 * else's; what makes them his is the scale (3.6 m), the reach, the wind-ups
 * and the phase they unlock in.
 */
export const RASETSU = {
  id: 'rasetsu',
  name: '黒角鬼・羅刹',
  height: 3.7,
  radius: 1.15,
  hp: 1500,
  posture: 240,
  walk: 1.6,
  run: 4.2,
  sight: 40,
  ring: 3.6,
  aggression: 1,
  superArmor: true,
  elite: true,
  boss: true,
  gear: 'bigKanabo',
  horns: 'bigHorns',
  score: 3000,
  look: {
    color: '#140d0d', roughness: 0.5, metalness: 0.25, rimColor: '#ff2a12', rimPower: 2.6,
    rimEmissive: 1.8, edgeColor: '#ff6a2c', edgeEmissive: 7.0, edgeWidth: 0.12,
    dissolveDetail: 5.0, dissolveRise: 0.45
  },
  attacks: [
    // 横薙ぎ — the wide horizontal sweep.
    attack({ id: 'sweep', clip: 'slashHit', clipFrom: 0.05, clipTo: 0.42, timeScale: 0.85, windupTo: 0.4, hits: [0.62], damage: 18, reach: 4.6, arc: 170, range: 4.4 }),
    // 振り下ろし — the overhead smash, a ring of shock where it lands.
    attack({ id: 'smash', clip: 'slashHit', clipFrom: 0.3, clipTo: 0.72, timeScale: 0.8, windupTo: 0.42, windupScale: 0.28, hits: [0.5], damage: 26, reach: 4.0, arc: 70, range: 4.2, knockdown: true, ring: 3.4 }),
    // 突進 — the charge: a gap closer that goes through.
    attack({ id: 'charge', clip: 'crouchSlash', clipFrom: 0.15, clipTo: 0.92, timeScale: 0.9, windupTo: 0.3, windupScale: 0.3, hits: [0.66], standoff: 1.4, maxWarp: 13, passThrough: 3, passAt: 0.9, warpAt: 0.62, damage: 22, reach: 3.2, arc: 120, range: 14, minRange: 6, knockdown: true, cooldown: 2 }),
    // ガード崩し — a kick that smashes a held guard. Parry it.
    attack({ id: 'breaker', clip: 'kick', clipFrom: 0.1, clipTo: 0.72, timeScale: 0.85, windupTo: 0.35, hits: [0.52], damage: 14, guardBreak: true, reach: 3.8, arc: 160, range: 3.8, knockback: 2.6 }),
    // ---- phase 2: 妖気解放 ----
    // 炎撃 — the leap and slam that sets the ground burning.
    attack({ id: 'flameSlam', clip: 'land', clipFrom: 0, clipTo: 0.62, timeScale: 0.8, windupTo: 0.3, windupScale: 0.3, hits: [0.45], damage: 24, reach: 5.2, arc: 360, range: 6, lunge: 3, maxWarp: 6, standoff: 1.2, knockdown: true, unblockable: true, ring: 5.2, fire: true, phases: [2, 3], cooldown: 1.8 }),
    // 鬼火 — a fan of fireballs.
    attack({ id: 'fireFan', clip: 'slashHit', clipFrom: 0.02, clipTo: 0.32, timeScale: 0.9, windupTo: 0.6, windupScale: 0.25, hits: [0.75], lunge: 0, maxWarp: 0, standoff: 99, range: 18, minRange: 5, damage: 12, projectile: { speed: 13, radius: 0.45, color: '#ff7a2a', count: 5, spread: 0.32 }, phases: [2, 3] }),
    // ---- phase 3: 暴走 ----
    // 乱撃 — the frenzy: four blows back to back.
    attack({ id: 'frenzy', clip: 'slashHit', clipFrom: 0.05, clipTo: 0.72, timeScale: 1.25, windupTo: 0.18, windupScale: 0.35, hits: [0.3, 0.45, 0.62, 0.78], damage: 12, reach: 4.4, arc: 150, range: 4.4, lunge: 1.4, phases: [3] }),
    // 羅刹天 — the ultimate: a long charge, then the whole court burns.
    attack({ id: 'cataclysm', clip: 'land', clipFrom: 0, clipTo: 0.62, timeScale: 0.42, windupTo: 0.38, windupScale: 0.14, hits: [0.45], damage: 42, reach: 9.5, arc: 360, range: 30, lunge: 0, maxWarp: 0, standoff: 99, unblockable: true, knockdown: true, ring: 9.5, fire: true, phases: [3], cooldown: 3, ultimate: true })
  ]
};

/**
 * The boss's mind: an `EnemyAgent` with phases, a stage entrance, burning
 * ground, a guard he can only lose by being parried, and a death that only an
 * execution can give him.
 */
export class Rasetsu extends EnemyAgent {
  constructor(game, enemy, type, clips) {
    super(game, enemy, type, clips);
    this.phase = 1;
    this.zones = [];
    this.finalDown = false;
    this.damageScale = 1;
    this._aura = 0;
    this._ultimateTimer = 14;
    this.onDefeated = null;
    // Damage taken is scaled down a little while he is fresh: the fight should
    // run two to three minutes for a first-timer.
    this.damageTaken = 1;
  }

  /* ------------------------------------------------------------------ */
  /* the entrance                                                        */
  /* ------------------------------------------------------------------ */

  intro() {
    const game = this.game;
    game.cinematic = true;
    this.state = 'intro';
    this.stateTime = 0;
    this.kneel.hold(0.4);
    game.audio.setCombat(0);
    game.hud.setObjective('');
    game.player.lockTarget = null;
    settings.camera.distance = 6.4;
  }

  _introUpdate(dt) {
    const game = this.game;
    const t = this.stateTime;
    const p = game.playerPosition;
    // Turn the camera to look past the player at him.
    const want = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    const rig = game.rig;
    const delta = MathUtils.euclideanModulo(want - rig.azimuth + Math.PI, Math.PI * 2) - Math.PI;
    rig.orbit(delta * Math.min(1, dt * 3), 0);
    if (t > 0.8 && !this._rose) {
      this._rose = true;
      this.kneel.stop();
      game.audio.play('roar', { volume: 1 });
      game.rig.shake(0.5);
      game.hud.flash('rgba(120,10,0,0.35)', 0.5);
      game.fx.slam(this.position, 6, '#ff3a1a');
    }
    if (t > 1.4 && !this._named) {
      this._named = true;
      game.hud.areaCard('黒角鬼・羅刹', '城門の主');
    }
    if (t > 3.4) {
      game.cinematic = false;
      game.hud.showBoss('黒角鬼・羅刹', true);
      game.hud.setObjective('黒角鬼・羅刹を討て');
      game.audio.setCombat(2);
      game.player.lockTarget = this.enemy;
      this.alert = true;
      this.cooldown = 0.8;
      this._toEngage();
    }
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    if (!this.alive) return;
    this._updateZones(dt);
    this._auraFx(dt);
    if (this.state === 'intro') {
      this.stateTime += dt;
      this._setSpeed(0);
      this._introUpdate(dt);
      return;
    }
    if (this.state === 'transition') {
      this.stateTime += dt;
      this._setSpeed(0);
      this._transitionUpdate(dt);
      return;
    }
    if (this.finalDown) {
      this.stateTime += dt;
      this.enemy.flash = 0.25 + 0.2 * Math.sin(this.stateTime * 6);
      this._setSpeed(0);
      return;
    }
    super.update(dt, ctx);
    this._ultimateTimer -= dt;
  }

  _chooseAttack(distance) {
    const options = [];
    let total = 0;
    for (const spec of this.type.attacks) {
      if (!spec.phases.includes(this.phase)) continue;
      if (distance > spec.range) continue;
      if (spec.minRange && distance < spec.minRange) continue;
      if (spec.ultimate && this._ultimateTimer > 0) continue;
      let weight = spec.weight;
      if (spec.ultimate) weight = 6; // when it is ready, it comes
      if (spec.id === this._lastAttack) weight *= 0.3; // rarely the same twice
      options.push([spec, weight]);
      total += weight;
    }
    if (!options.length) return null;
    let roll = Math.random() * total;
    for (const [spec, weight] of options) {
      roll -= weight;
      if (roll <= 0) return spec;
    }
    return options[0][0];
  }

  _startAttack(spec) {
    this._lastAttack = spec.id;
    if (spec.ultimate) {
      this._ultimateTimer = 22;
      this.game.hud.bigText('羅刹天', '#ff3a1a', 1.6);
      this.game.audio.play('roar');
      // He leaps back to the middle of the court first.
      this.enemy.position.lerp(_v.set(0, 0, 262), 0.85);
    }
    super._startAttack(spec);
    this.move.paceScale = 1;
  }

  _attackUpdate(dt, dx, dz) {
    super._attackUpdate(dt, dx, dz);
    const move = this.move;
    if (move?.spec.ultimate && move.phase < move.spec.windupTo) {
      // The court lights up red where it is about to burn.
      this._ultTell = (this._ultTell ?? 0) + dt;
      if (this._ultTell > 0.35) {
        this._ultTell = 0;
        this.game.fx.dangerRing.burst(this.position.x, this.position.z, this.game.fx.dangerConfig, move.spec.reach / this.game.fx.dangerConfig.radius);
      }
    }
  }

  _onStrike(move, index) {
    const spec = move.spec;
    if (spec.projectile) {
      const shot = spec.projectile;
      const p = this.game.playerPosition;
      const base = Math.atan2(p.x - this.position.x, p.z - this.position.z);
      for (let i = 0; i < shot.count; i++) {
        const yaw = base + (i - (shot.count - 1) / 2) * shot.spread;
        this.game.magic.enemyShot(this, spec, yaw);
      }
      this.game.audio.play('fire', { pos: this.position });
      return;
    }
    super._onStrike(move, index);
    if (spec.ring) {
      this.game.rig.shake(spec.ultimate ? 0.6 : 0.35);
      this.game.audio.play('slam', { pos: this.position });
    }
    if (spec.fire) this._ignite(spec);
  }

  /** The ground where the blow landed keeps burning for a while. */
  _ignite(spec) {
    const count = spec.ultimate ? 10 : 5;
    const radius = spec.ultimate ? 7 : 3.6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.zones.push({ x: this.position.x + Math.sin(a) * radius, z: this.position.z + Math.cos(a) * radius, r: 1.5, t: spec.ultimate ? 6 : 4.5, tick: 0 });
    }
    this.game.audio.play('fireHit', { pos: this.position });
  }

  _updateZones(dt) {
    const game = this.game;
    const p = game.playerPosition;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      zone.t -= dt;
      if (zone.t <= 0) {
        this.zones.splice(i, 1);
        continue;
      }
      if (Math.random() < dt * 14) {
        _v.set(zone.x + (Math.random() - 0.5) * zone.r * 1.6, 0.1, zone.z + (Math.random() - 0.5) * zone.r * 1.6);
        game.fx.glow.spawn(_v, Math.random() < 0.5 ? '#ff5a1a' : '#ffb040', 0.5 + Math.random() * 0.5, 0.7, { vy: 1.8, grow: -0.3, intensity: 1.8 });
      }
      zone.tick -= dt;
      const dx = p.x - zone.x;
      const dz = p.z - zone.z;
      if (zone.tick <= 0 && dx * dx + dz * dz < zone.r * zone.r) {
        zone.tick = 0.6;
        const result = game.player.receiveHit({ damage: 6, from: { x: zone.x, z: zone.z }, unblockable: true, unparryable: true, knockback: 0.2, kind: 'burn' });
        if (result === 'hit') game.audio.play('fireHit', { volume: 0.5 });
      }
    }
  }

  _auraFx(dt) {
    if (this.phase < 2 || !this.alive) return;
    this._aura += dt * (this.phase === 3 ? 30 : 14);
    while (this._aura > 1) {
      this._aura -= 1;
      const h = this.type.height;
      _v.set(this.position.x + (Math.random() - 0.5) * 1.6, this.position.y + Math.random() * h, this.position.z + (Math.random() - 0.5) * 1.6);
      this.game.fx.glow.spawn(_v, this.phase === 3 ? '#ff2a10' : '#ff7a2a', 0.35 + Math.random() * 0.3, 0.8, { vy: 2.2, grow: -0.4, intensity: 1.6 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* phases                                                              */
  /* ------------------------------------------------------------------ */

  takeHit(hit) {
    if (this.state === 'intro' || this.state === 'transition') {
      this.hitFlash = 0.5;
      return { damage: 0, killed: false, broke: false };
    }
    if (this.finalDown) {
      if (!hit.execute) return { damage: 0, killed: false, broke: false };
      this._finish(hit);
      return { damage: 9999, killed: false, broke: false };
    }
    if (hit.execute) {
      // A posture break is a big opening, not the end.
      hit = { ...hit, execute: false, damage: this.maxHp * 0.16, posture: 0 };
      this.kneel.stop();
      this._toEngage();
      this.cooldown = 1.2;
      this.posture = 0;
      this.game.hud.bigText('痛撃', '#ffd890', 1);
    }
    const result = super.takeHit(hit);
    if (!result) return result;
    const fraction = this.hp / this.maxHp;
    if (this.phase === 1 && fraction < 0.66) this._enterPhase(2);
    else if (this.phase === 2 && fraction < 0.33) this._enterPhase(3);
    return result;
  }

  /** At zero he does not fall: he kneels, and waits for the blade. */
  onLethal() {
    this.hp = 1;
    this.finalDown = true;
    this.state = 'broken';
    this.stateTime = 0;
    for (const move of this.moves) if (move.locked) move.release();
    this.game.director.releaseToken(this);
    this.kneel.hold(0.4);
    this.zones.length = 0;
    this.game.hud.bigText('今だ — 処刑せよ', '#ffd890', 2.2);
    this.game.audio.play('roar', { volume: 0.6 });
    this.game.slowMo(1.0, 0.4);
    return true;
  }

  get executable() {
    return (this.state === 'broken' || this.finalDown) && this.alive;
  }

  _enterPhase(phase) {
    this.phase = phase;
    for (const move of this.moves) if (move.locked) move.release();
    this.game.director.releaseToken(this);
    this.state = 'transition';
    this.stateTime = 0;
    this.move = null;
    this.posture = 0;
    this.kneel.hold(0.4);
    const game = this.game;
    game.slowMo(0.8, 0.35);
    game.hud.bigText(phase === 2 ? '妖気解放' : '暴走', phase === 2 ? '#ff8a3a' : '#ff2a10', 1.8);
    game.audio.play('roar', { volume: 1 });
  }

  _transitionUpdate() {
    const game = this.game;
    if (this.stateTime > 1.0 && !this._burst) {
      this._burst = true;
      this.kneel.stop();
      game.rig.shake(0.55);
      game.fx.slam(this.position, 7, '#ff3a1a');
      game.hud.flash('rgba(255,80,20,0.3)', 0.4);
      // A shove: the release blows the player back.
      const p = game.playerPosition;
      const dx = p.x - this.position.x;
      const dz = p.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 7) game.player.receiveHit({ damage: 4, from: this.position, unblockable: true, unparryable: true, knockback: 3, kind: 'burst' });
      // Faster, harder, hotter.
      const look = { ...this.type.look };
      if (this.phase === 2) {
        look.rimColor = '#ff7a1a';
        look.rimEmissive = 3.2;
        this.damageScale = 1.15;
        for (const move of this.moves) move.paceScale = 1;
        this.speedScale = 1.2;
        this._ultimateTimer = 999;
        // He calls the dead back up to fight beside him.
        const flow = game.flow;
        flow?._fight([['ashigaru', -8, 262], ['ashigaru', 8, 262], ['archer', 0, 280]], { cap: 4, combat: 2 });
      } else {
        look.rimColor = '#ff1a08';
        look.rimEmissive = 4.2;
        look.rimPower = 1.3;
        this.damageScale = 1.3;
        this.speedScale = 1.4;
        this._ultimateTimer = 3;
      }
      this.enemy.look = look;
    }
    if (this.stateTime > 2.0) {
      this._burst = false;
      this._toEngage();
      this.cooldown = 0.6;
    }
  }

  _engageUpdate(dt, ctx, dx, dz, distance, slow) {
    super._engageUpdate(dt, ctx, dx, dz, distance, slow * (this.speedScale ?? 1));
  }

  /** The execution landed: the finisher. */
  _finish(hit) {
    const game = this.game;
    this.finalDown = false;
    this.hp = 0;
    this.kneel.stop();
    game.hitStop(0.35, 0.02);
    game.slowMo(2.2, 0.25);
    game.rig.shake(0.7);
    game.hud.flash('rgba(255,240,220,0.75)', 0.6);
    game.audio.play('execute');
    game.audio.play('explosion', { volume: 0.8 });
    game.audio.setCombat(0);
    _v.copy(this.position).setY(this.position.y + 2);
    game.fx.parry(_v, hit.dirX, hit.dirZ);
    game.fx.slam(this.position, 8, '#ffb070');
    game.enemies.kill(this.enemy, hit.dirX || 0, hit.dirZ || 1, { impulse: 5, lift: 6, spin: 1.4, slices: true });
    game.director.releaseToken(this);
    game.kills++;
    game.score += this.score;
    game.hud.showBoss('', false);
    game.after(0.9, () => game.hud.areaCard('討伐', '黒角鬼・羅刹'));
    for (const agent of game.director.agents) {
      if (agent !== this && agent.alive) game.damageEnemy(agent.enemy, { damage: 9999, posture: 0, dirX: 0, dirZ: 1, source: 'special', force: { impulse: 4, lift: 5, spin: 1, slices: false } });
    }
    game.stage?.clearBarriers();
    settings.camera.distance = 5.2;
    this.onDefeated?.();
  }

  dispose() {
    this.zones.length = 0;
    super.dispose();
  }
}
