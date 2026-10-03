import { Vector3 } from 'three';

/** Discrete shukuchi steps; every destination is bounded by stage collision. */
export class RoninStep {
  constructor(enemy) {
    this.enemy = enemy; this.wait = 0.6; this.windup = 0; this.shifted = false;
  }

  step(goal, maxDistance = 4.5) {
    const e = this.enemy, a = e.agent, start = e.position.clone();
    const delta = goal.clone().sub(start).setY(0), d = delta.length();
    if (d < 0.15) return;
    delta.multiplyScalar(Math.min(d, maxDistance) / d);
    // Sweep the route through collision rather than teleport through walls.
    const destination = start.clone();
    for (let i = 0; i < 24; i++) {
      const next = destination.clone().addScaledVector(delta, 1 / 24);
      a.game.stage?.collide(next, a.radius);
      if (next.distanceTo(destination) > delta.length() / 24 + 0.1) break;
      destination.copy(next);
    }
    a.game.fx?.afterimageAt?.(e);
    a.game.fx?.dust?.(start, 0.6);
    e.position.copy(destination); a.velocity.x = a.velocity.z = 0;
    a.game.fx?.dust?.(destination, 0.6);
  }
  engage(dt, ctx, distance, slow) {
    const a = this.enemy.agent;
    a._setSpeed(0);
    a._turnToward(Math.atan2(ctx.player.x - this.enemy.position.x, ctx.player.z - this.enemy.position.z), dt, 5);
    if (a.cooldown <= 0 && !ctx.playerDown && ctx.director.requestToken(a, false)) {
      const spec = a._chooseAttack(distance);
      if (spec && ctx.director.canStartAttack(a, spec)) { this.windup = 0; a._startAttack(spec); return; }
      ctx.director.releaseToken(a);
    }
    this.wait -= dt * slow;
    if (this.wait > 0 || distance < 2.5) return;
    this.windup += dt * slow;
    if (this.windup < 0.3) return;
    const goal = ctx.player.clone();
    const away = this.enemy.position.clone().sub(ctx.player).setY(0).normalize();
    goal.addScaledVector(away, 2);
    this.step(goal); this.wait = 1.1; this.windup = 0;
  }
  attack(move) {
    if (this.shifted || move.phase < 0.32) return;
    this.shifted = true;
    const a = this.enemy.agent, p = a.game.playerPosition;
    const facing = a.game.app?.character.facing ?? 0;
    const goal = new Vector3(p.x - Math.sin(facing) * 1.5, p.y, p.z - Math.cos(facing) * 1.5);
    this.step(goal, 5);
    a._setFacing(Math.atan2(p.x - this.enemy.position.x, p.z - this.enemy.position.z));
  }
}
