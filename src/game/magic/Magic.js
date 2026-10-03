import { Vector3 } from 'three';
import { ELEMENTS, REACTIONS, SPELLS, reactionKey } from '../data/elements.js';

const _p = new Vector3();
const _q = new Vector3();
const _hand = new Vector3();
const _e = new Vector3();

/**
 * Spells, statuses, element reactions — and the archers' arrows, which are
 * the same kind of thing flying the other way.
 *
 * Everything is data-driven from `data/elements.js`. A projectile is a plain
 * record drawn as a held glow (`GlowPool`) with an ember tail; a strike is a
 * delayed bolt out of the sky. Marks live on the agents, and the reaction
 * table is consulted every time an element lands on a body that already
 * carries a different one.
 */
export class Magic {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.pending = [];
    this.reactionCount = 0;
  }

  get fx() {
    return this.game.fx;
  }

  /* ------------------------------------------------------------------ */
  /* casting                                                             */
  /* ------------------------------------------------------------------ */

  /** The player's hand, a little forward — where spells leave from. */
  _origin(out) {
    const character = this.game.app.character;
    const hand = character.getBone('RightHand');
    if (hand) hand.getWorldPosition(_hand);
    else _hand.copy(character.position).setY(character.position.y + 1.3);
    const yaw = character.facing;
    out.set(_hand.x + Math.sin(yaw) * 0.4, _hand.y, _hand.z + Math.cos(yaw) * 0.4);
    return out;
  }

  /** `from`: where the spell leaves — the arrow's point, when loosed from the bow. */
  cast(elementId, target, from = null) {
    const spell = SPELLS[elementId];
    const element = ELEMENTS[elementId];
    if (!spell) return;
    const origin = from ? from.clone() : this._origin(new Vector3());
    const character = this.game.app.character;
    const yaw = character.facing;
    this.game.audio?.play(spell.sfx, { volume: 0.9 });
    this.fx.glow.spawn(origin, element.glow, 0.9, 0.2, { grow: 1, intensity: 2 });
    this.fx.flare(origin, element.color, 14, 0.2);

    if (spell.kind === 'strike') {
      const victim = target?.alive ? target : this.game.enemies.findTarget(character.position, yaw, { range: spell.range, cone: 90 });
      const at = victim ? victim.position.clone() : new Vector3(character.position.x + Math.sin(yaw) * 7, character.position.y, character.position.z + Math.cos(yaw) * 7);
      // A spark climbs from the blade first: the strike is called, not thrown.
      this.fx.ribbons.bolt(origin, _q.copy(origin).setY(origin.y + 6), { color: element.glow, width: 0.06, life: 0.2, jitter: 0.25 });
      this.pending.push({ t: spell.delay, at, victim, spell, element });
      return;
    }

    const count = spell.count ?? 1;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * (spell.spread ?? 0);
      const aim = yaw + offset;
      let dirX = Math.sin(aim);
      let dirY = 0;
      let dirZ = Math.cos(aim);
      if (target?.alive) {
        const ty = target.position.y + (target.agent?.type.height ?? 1.8) * 0.55;
        _p.set(target.position.x - origin.x, ty - origin.y, target.position.z - origin.z).normalize();
        // Rotate the aim by this shard's spread, about +Y.
        const c = Math.cos(offset);
        const sn = Math.sin(offset);
        dirX = _p.x * c + _p.z * sn;
        dirY = _p.y;
        dirZ = -_p.x * sn + _p.z * c;
      }
      this.projectiles.push({
        owner: 'player',
        spell,
        element,
        target: target?.alive ? target : null,
        pos: origin.clone().add(new Vector3(Math.cos(aim) * offset * 2, 0, -Math.sin(aim) * offset * 2)),
        vel: new Vector3(dirX, dirY, dirZ).multiplyScalar(spell.speed),
        life: spell.life,
        radius: spell.radius,
        glow: this.fx.glow.hold(element.glow, spell.radius * (element.id === 'fire' ? 4.2 : 2.6), { intensity: 2.2 }),
        shard: element.id === 'ice' ? this.fx.shards.hold(0.62) : -1,
        spin: Math.random() * 6,
        trailAcc: 0
      });
    }
  }

  /** An archer looses. */
  enemyShot(agent, spec, yaw = null) {
    const enemy = agent.enemy;
    const hand = enemy.bones.get(spec.originBone ?? 'LeftHand');
    const origin = new Vector3();
    if (hand) hand.getWorldPosition(origin);
    else origin.copy(enemy.position).setY(enemy.position.y + 1.4);
    const player = this.game.playerPosition;
    _p.set(player.x - origin.x, player.y + 1.1 - origin.y, player.z - origin.z).normalize();
    if (yaw !== null) {
      // A fan: keep the drop toward the player, turn the heading.
      const flat = Math.hypot(_p.x, _p.z);
      _p.set(Math.sin(yaw) * flat, _p.y, Math.cos(yaw) * flat);
    }
    const shot = spec.projectile;
    this.projectiles.push({
      owner: 'enemy',
      agent,
      spec,
      pos: origin,
      vel: _p.clone().multiplyScalar(shot.speed),
      life: 2.2,
      radius: shot.radius,
      color: shot.color,
      glow: this.fx.glow.hold(shot.color, Math.max(0.5, shot.radius * 2.4), { intensity: 2.4 }),
      trailAcc: 0
    });
    this.game.audio?.play('arrow', { pos: origin, volume: 0.8 });
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  update(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const strike = this.pending[i];
      strike.t -= dt;
      if (strike.victim?.alive) strike.at.copy(strike.victim.position);
      if (strike.t > 0) continue;
      this.pending.splice(i, 1);
      this._strike(strike);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.owner === 'player' && p.target?.alive && p.spell.homing) {
        const ty = p.target.position.y + (p.target.agent?.type.height ?? 1.8) * 0.55;
        _p.set(p.target.position.x - p.pos.x, ty - p.pos.y, p.target.position.z - p.pos.z).normalize().multiplyScalar(p.spell.speed);
        p.vel.lerp(_p, Math.min(1, dt * p.spell.homing));
      }
      p.pos.addScaledVector(p.vel, dt);
      this.fx.glow.move(p.glow, p.pos.x, p.pos.y, p.pos.z);
      if (p.shard >= 0) this.fx.shards.move(p.shard, p.pos, p.vel);
      p.trailAcc += dt;
      if (p.trailAcc > 0.02) {
        p.trailAcc = 0;
        const color = p.owner === 'player' ? p.element.color : p.color;
        const fire = p.owner !== 'player' || p.element.id === 'fire';
        this.fx.glow.spawn(p.pos, color, p.radius * (fire ? 2.0 : 1.2), fire ? 0.35 : 0.2, { grow: -0.5, intensity: 1.3, vy: fire ? 0.8 : 0 });
        if (fire) {
          // A spiral of embers wound around the flight line.
          p.spin += 0.9;
          _e.set(Math.cos(p.spin) * p.radius * 1.4, Math.sin(p.spin) * p.radius * 1.4, 0).add(p.pos);
          this.fx.glow.spawn(_e, '#ffd070', 0.1, 0.45, { vy: 1.2, intensity: 2, gravity: -1 });
        }
      }

      const ground = this.game.app.terrain.heightAt(p.pos.x, p.pos.z);
      const blocked = this.game.stage?.blocks(p.pos.x, p.pos.z) ?? false;
      let done = p.life <= 0 || p.pos.y < ground + 0.05 || blocked;

      if (!done && p.owner === 'player') {
        for (const enemy of this.game.enemies.enemies) {
          if (!enemy.alive || !enemy.agent) continue;
          const dx = enemy.position.x - p.pos.x;
          const dz = enemy.position.z - p.pos.z;
          const reach = p.radius + enemy.agent.radius + 0.15;
          const h = enemy.agent.type.height;
          if (dx * dx + dz * dz > reach * reach) continue;
          if (p.pos.y < enemy.position.y - 0.2 || p.pos.y > enemy.position.y + h + 0.2) continue;
          this._spellHit(enemy, p.spell, p.element, p.vel, p.pos);
          done = true;
          break;
        }
        if (done && p.spell.splash) this._splash(p);
      } else if (!done && p.owner === 'enemy') {
        const player = this.game.playerPosition;
        const dx = player.x - p.pos.x;
        const dz = player.z - p.pos.z;
        const hitR = Math.max(0.55, p.radius + 0.35);
        if (dx * dx + dz * dz < hitR * hitR && p.pos.y > player.y - 0.2 && p.pos.y < player.y + 2.2) {
          const result = this.game.player.receiveHit({
            damage: p.spec.damage,
            knockback: 0.4,
            from: p.agent.enemy.position,
            attacker: p.agent.enemy,
            kind: 'arrow'
          });
          if (result === 'evade') {
            // Passed straight through a dodging body.
          } else if (result === 'parry') {
            // Turned back on the archer.
            p.owner = 'deflected';
            p.vel.multiplyScalar(-1.2);
            p.life = 1.5;
            continue;
          } else {
            done = true;
          }
        }
      } else if (!done && p.owner === 'deflected') {
        const enemy = p.agent.enemy;
        if (enemy.alive && enemy.position.distanceTo(_q.set(p.pos.x, enemy.position.y, p.pos.z)) < 0.8) {
          this.game.damageEnemy(enemy, { damage: 40, posture: 30, dirX: p.vel.x / 20, dirZ: p.vel.z / 20, knockback: 1, source: 'deflect', force: null });
          done = true;
        }
      }

      if (done) {
        if (p.owner === 'player' && p.element.id === 'fire') {
          this.fx.explosion(p.pos, p.spell.splash ?? 1.6, p.element.color);
        } else if (p.owner === 'player' && p.element.id === 'ice') {
          this.fx.shatter(p.pos, 0.9, 8);
        } else if (p.owner === 'enemy' && p.color === '#ff7a2a') {
          this.fx.explosion(p.pos, 1.2, p.color);
        } else {
          const color = p.owner === 'player' ? p.element.glow : p.color;
          this.fx.glow.spawn(p.pos, color, p.radius * 4, 0.2, { grow: 1.5, intensity: 1.8 });
        }
        this.fx.glow.free(p.glow);
        this.fx.shards.free(p.shard ?? -1);
        this.projectiles.splice(i, 1);
      }
    }

    this._tickStatusVisuals(dt);
  }

  _strike({ at, victim, spell, element }) {
    const top = _p.set(at.x + (Math.random() - 0.5) * 2, at.y + 14, at.z + (Math.random() - 0.5) * 2);
    const ground = _q.set(at.x, at.y + 0.1, at.z);
    this.fx.ribbons.bolt(top.clone(), ground.clone(), { color: element.glow, width: 0.22, life: 0.32, segments: 13, jitter: 1.4 });
    this.fx.ribbons.bolt(top.clone(), ground.clone(), { color: element.color, width: 0.5, life: 0.18, segments: 9, jitter: 1.0 });
    // Branches forking off the main channel, and a second strike a beat apart.
    for (let i = 0; i < 3; i++) {
      const k = 0.25 + Math.random() * 0.5;
      const from = top.clone().lerp(ground, k);
      const to = from.clone().add(new Vector3((Math.random() - 0.5) * 4, -2 - Math.random() * 2, (Math.random() - 0.5) * 4));
      this.fx.ribbons.bolt(from, to, { color: element.glow, width: 0.08, life: 0.22, segments: 6, jitter: 0.6 });
    }
    this.fx.ribbons.bolt(top.clone().add(new Vector3(1.5, 0, -1)), ground.clone().add(new Vector3(0.6, 0, 0.4)), { color: element.glow, width: 0.14, life: 0.4, segments: 11, jitter: 1.2 });
    this.fx.coldBurst(at, spell.radius * 1.3);
    this.fx.glow.burst(ground, '#ffffff', 8, { speed: 3, size: 0.05, life: 0.3, up: 4, gravity: -10 });
    this.fx.glow.spawn(ground, element.glow, 2.2, 0.25, { grow: 0.6, intensity: 1.4 });
    this.fx.glow.burst(ground, element.glow, 18, { speed: 7, size: 0.07, life: 0.4, up: 2 });
    this.fx.flare(ground, element.glow, 32, 0.3);
    this.game.hud?.flash('rgba(200,220,255,0.22)', 0.14);
    this.game.audio?.play('thunder', { pos: at });
    this.game.rig.shake(0.12);

    const hit = new Set();
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      if (enemy.position.distanceTo(at) > spell.radius + enemy.agent.radius) continue;
      hit.add(enemy);
      this._spellHit(enemy, spell, element, null, enemy.position);
      enemy.agent.applyStatus('stun', 0, spell.stun);
    }
    // Then it jumps to whoever is nearest, and on.
    let from = victim?.alive || hit.size ? [...hit][0] : null;
    for (let n = 0; n < (spell.chain ?? 0) && from; n++) {
      let best = null;
      let bestD = spell.chainRange;
      for (const enemy of this.game.enemies.enemies) {
        if (!enemy.alive || !enemy.agent || hit.has(enemy)) continue;
        const d = enemy.position.distanceTo(from.position);
        if (d < bestD) {
          bestD = d;
          best = enemy;
        }
      }
      if (!best) break;
      hit.add(best);
      const a = from.position.clone().setY(from.position.y + 1.2);
      const b = best.position.clone().setY(best.position.y + 1.2);
      this.fx.ribbons.bolt(a, b, { color: element.glow, width: 0.12, life: 0.3, segments: 8, jitter: 0.6 });
      this._spellHit(best, { ...spell, damage: spell.damage * 0.6 }, element, null, best.position);
      from = best;
    }
  }

  _splash(p) {
    const spell = p.spell;
    // The blast itself is drawn where the bolt ends (see `update`).
    for (const enemy of this.game.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      if (enemy.position.distanceTo(_q.set(p.pos.x, enemy.position.y, p.pos.z)) > spell.splash) continue;
      this.game.damageEnemy(enemy, { damage: spell.splashDamage, posture: 2, dirX: 0, dirZ: 0, knockback: 0.3, source: 'spell', quiet: true, force: null });
    }
  }

  /**
   * One element lands on one body: damage, status, and the reaction check.
   */
  _spellHit(enemy, spell, element, vel, point) {
    const agent = enemy.agent;
    const len = vel ? Math.hypot(vel.x, vel.z) || 1 : 1;
    const result = this.game.damageEnemy(enemy, {
      damage: spell.damage,
      posture: spell.posture,
      dirX: vel ? vel.x / len : 0,
      dirZ: vel ? vel.z / len : 0,
      knockback: 0.4,
      source: 'spell',
      element: element.id,
      force: null
    });
    if (!result || !enemy.alive) return;

    const sfx = element.id === 'fire' ? 'fireHit' : element.id === 'ice' ? 'iceHit' : null;
    if (sfx) this.game.audio?.play(sfx, { pos: enemy.position, volume: 0.8 });
    if (spell.burn) agent.applyStatus('burn', spell.burn.dps, spell.burn.time);
    if (spell.slow) agent.applyStatus('slow', spell.slow.factor, spell.slow.time);

    // Reaction: any other element still marked on this body.
    for (const other of Object.keys(agent.marks)) {
      if (other === element.id) continue;
      const reaction = REACTIONS[reactionKey(other, element.id)];
      if (!reaction) continue;
      delete agent.marks[other];
      this._react(reaction, enemy);
      return;
    }
    agent.marks[element.id] = spell.mark;
  }

  _react(reaction, origin) {
    this.reactionCount++;
    const at = origin.position.clone();
    _p.set(at.x, at.y + 1, at.z);
    if (reaction.id === 'blast') {
      this.fx.explosion(_p, reaction.radius, '#ff8a2a');
      this.fx.ribbons.bolt(_p.clone().setY(_p.y + 6), _p.clone(), { color: '#ffe0a0', width: 0.3, life: 0.25, segments: 8, jitter: 1 });
    } else if (reaction.id === 'frozenShock') {
      this.fx.shatter(_p, reaction.radius, 24);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.fx.ribbons.bolt(_p.clone(), _p.clone().add(new Vector3(Math.cos(a) * reaction.radius, -0.6, Math.sin(a) * reaction.radius)), { color: '#cfefff', width: 0.08, life: 0.35, segments: 6, jitter: 0.5 });
      }
    } else {
      // Steam: a white bank boiling up and out.
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * reaction.radius;
        _e.set(at.x + Math.cos(a) * r, at.y + 0.4 + Math.random(), at.z + Math.sin(a) * r);
        this.fx.glow.spawn(_e, '#cfd8e0', 1.2 + Math.random(), 1.2, { vy: 1.5, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, grow: 1.5, intensity: 0.6 });
      }
      this.fx.glow.spawn(_p, '#ffffff', reaction.radius * 1.4, 0.3, { grow: 1, intensity: 1.6 });
      this.fx.slam(at, reaction.radius, '#ffb070');
    }
    this.fx.flare(_p, reaction.color, 45, 0.45);
    this.game.audio?.play(reaction.sfx, { pos: at });
    this.game.rig.shake(reaction.shake ?? 0.2);
    this.game.hitStop(0.08, 0.1);
    this.game.hud?.reaction(reaction.name, reaction.color);

    for (const enemy of [...this.game.enemies.enemies]) {
      if (!enemy.alive || !enemy.agent) continue;
      const dx = enemy.position.x - at.x;
      const dz = enemy.position.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d > reaction.radius + enemy.agent.radius) continue;
      const result = this.game.damageEnemy(enemy, {
        damage: reaction.damage,
        posture: reaction.posture,
        dirX: d > 1e-3 ? dx / d : 0,
        dirZ: d > 1e-3 ? dz / d : 0,
        knockback: reaction.knockback ?? 0.6,
        launch: reaction.launch,
        source: 'reaction',
        force: { impulse: 6, lift: 6, spin: 2.2, slices: false }
      });
      if (!result || !enemy.alive) continue;
      if (reaction.freeze) enemy.agent.applyStatus('freeze', 0, reaction.freeze);
      if (reaction.stagger) enemy.agent.applyStatus('stun', 0, reaction.stagger);
    }
  }

  _tickStatusVisuals(dt) {
    this._statusAcc = (this._statusAcc ?? 0) + dt;
    if (this._statusAcc < 0.08) return;
    this._statusAcc = 0;
    for (const agent of this.game.director.agents) {
      if (!agent.alive) continue;
      const p = agent.position;
      const h = agent.type.height;
      if (agent.status.burn > 0) {
        _p.set(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * h, p.z + (Math.random() - 0.5) * 0.6);
        this.fx.glow.spawn(_p, '#ff6a1f', 0.22, 0.6, { vy: 1.2, grow: -0.4, intensity: 1.6 });
      }
      if (agent.status.freeze > 0 || agent.status.slow > 0) {
        _p.set(p.x + (Math.random() - 0.5) * 0.7, p.y + Math.random() * h, p.z + (Math.random() - 0.5) * 0.7);
        this.fx.glow.spawn(_p, '#9fefff', agent.status.freeze > 0 ? 0.3 : 0.14, 0.5, { vy: -0.2, intensity: 1.4, star: agent.status.freeze > 0 });
      }
      for (const id of Object.keys(agent.marks)) {
        _p.set(p.x, p.y + h + 0.25, p.z);
        this.fx.glow.spawn(_p, ELEMENTS[id].color, 0.22, 0.12, { intensity: 1.6 });
        break;
      }
    }
  }

  clear() {
    for (const p of this.projectiles) this.fx.glow.free(p.glow);
    this.projectiles.length = 0;
    this.pending.length = 0;
  }
}
