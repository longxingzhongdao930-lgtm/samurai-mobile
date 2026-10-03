import { canLaunch } from './GauntletAir.js';
import { Quaternion, Vector3 } from 'three';
import { segmentDistanceSq } from './FlightPath.js';

/** The existing Daedric gauntlet, unmodified, flying independently of the wrist. */
export class FlyingGauntlet {
  constructor(game, model) {
    this.game = game; this.model = model; this.queue = []; this.flight = null;
    this.hand = game.app.character.getBone('RightHand');
    this.handScale = this.hand?.scale.clone();
    this.forearm = game.app.character.getBone('RightForeArm');
    this.forearmScale = this.forearm?.scale.clone();
    this.model.scale.setScalar(1.35);
    this.model.name = 'Flying Daedric Gauntlet';
    game.app.scene.add(model);
    this.down = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, -1, 0));
  }
  home() {
    const c = this.game.app.character, yaw = c.facing;
    return c.position.clone().add(new Vector3(-Math.cos(yaw) * 0.48 + Math.sin(yaw) * 0.12, 0.9, Math.sin(yaw) * 0.48 + Math.cos(yaw) * 0.12));
  }
  launch(config, target) {
    if (this.queue.length < 2) this.queue.push({ config, target: target?.alive ? target : null });
  }
  restoreHand() {
    if (this.handScale) this.hand.scale.copy(this.handScale);
    if (this.forearmScale) this.forearm.scale.copy(this.forearmScale);
  }
  update(dt) {
    const g = this.game, p = g.player;
    if (p.dead || g.form.active || p.weapon.id !== 'gauntlet') { this.clear(); return; }
    if (['hurt', 'down'].includes(p.state)) { this.queue.length = 0; if (this.flight) { this._releaseGrab(false); this.flight.returning = true; } }
    if (!this.flight && this.queue.length) {
      const { config, target } = this.queue.shift(), from = this.home();
      const aim = target ? target.position.clone().add(new Vector3(0, Math.min(2.6, (target.agent?.type.height ?? 1.8) * 0.55), 0))
        : from.clone().add(new Vector3(Math.sin(g.app.character.facing) * 12, 0.3, Math.cos(g.app.character.facing) * 12));
      this.flight = { config, target, pos: from, direction: aim.sub(from).normalize(), distance: 0, time: 0, returning: false };
      g.audio?.play('whoosh');
    }
    const f = this.flight; if (!f) return;
    f.time += dt;
    if (f.grabbed) { this._pull(dt); return; }
    if (f.returning) {
      const home = this.home(), delta = home.clone().sub(f.pos), d = delta.length();
      if (d < dt * 24 || f.time > 1.6) { this.flight = null; return; }
      f.pos.addScaledVector(delta, dt * 24 / d); return;
    }
    const old = f.pos.clone(); f.pos.addScaledVector(f.direction, dt * 22); f.distance += dt * 22;
    if (g.stage?.blocks(f.pos.x, f.pos.z) || f.distance > 12) { f.returning = true; return; }
    for (const enemy of g.enemies.enemies) {
      if (!enemy.alive || !enemy.agent) continue;
      const center = enemy.position.clone(); center.y += Math.min(2.6, (enemy.agent.type.height ?? 1.8) * 0.55);
      if (segmentDistanceSq(center, old, f.pos) > ((enemy.agent.radius ?? 0.4) + 0.25) ** 2) continue;
      const opening = ['broken', 'recoil'].includes(enemy.agent.state);
      const result = g.damageEnemy(enemy, { damage: f.config.damage, posture: f.config.posture + (f.config.gripPull && (enemy.agent.type.elite || enemy.agent.type.boss) ? 20 : 0), knockback: f.config.knockback ?? 0,
        dirX: f.direction.x, dirZ: f.direction.z, source: 'thrown', force: null, slice: false, launch: false });
      if (result?.damage > 0) {
        p.onRangedHit(f.config);
        if (f.config.gripPull && !result.killed && !p.air.active && canLaunch(enemy.agent, opening || result.broke)) {
          this._grab(enemy, opening || result.broke);
        } else if (f.config.airLauncher && !result.killed && enemy.position.distanceTo(g.playerPosition) < 3.8) p.air.launch(enemy, opening || result.broke);
      }
      f.returning = true; break;
    }
    g.fx?.glow?.spawn(f.pos, '#d59363', 0.1, 0.12, { intensity: 0.8 });
  }
  _grab(enemy, opening) {
    const a = enemy.agent, f = this.flight;
    f.grabbed = enemy; f.pullTime = 0; f.opening = opening;
    a.grabbed = true;
    for (const move of a.moves) move.cancel();
    a.move = null; a.velocity.x = a.velocity.z = 0; a._knock.x = a._knock.z = 0;
    a.kneel.stop(); a.fall.stop();
    this.game.director.releaseToken(a);
    this.queue.length = 0;
    this.game.hud?.notice('捕らえた — 引き寄せ', 0.8);
  }
  _pull(dt) {
    const f = this.flight, e = f.grabbed, g = this.game;
    if (!e?.alive) { this._releaseGrab(false); return; }
    f.pullTime += dt;
    const delta = g.playerPosition.clone().sub(e.position); delta.y = 0;
    const distance = delta.length(), step = Math.min(Math.max(0, distance - 1.8), dt * 12);
    if (distance > 0.001) {
      const before = e.position.clone();
      // Sweep small steps through scenery so a pull never crosses a wall.
      const count = Math.max(1, Math.ceil(step / 0.12));
      for (let i = 0; i < count; i++) {
        const next = e.position.clone().addScaledVector(delta, step / count / distance);
        g.stage?.collide(next, e.agent.radius);
        if (g.stage?.blocks(next.x, next.z)) break;
        e.position.copy(next);
      }
      if (step > 0.01 && e.position.distanceTo(before) < 0.001) { this._releaseGrab(false); return; }
    }
    e.position.y = g.app.terrain?.heightAt(e.position.x, e.position.z) ?? e.position.y;
    f.pos.copy(e.position); f.pos.y += (e.agent.type.height ?? 1.8) * 0.55;
    const close = Math.hypot(e.position.x - g.playerPosition.x, e.position.z - g.playerPosition.z) <= 2;
    if (close || f.pullTime >= 1) this._releaseGrab(close);
  }
  _releaseGrab(launch) {
    const f = this.flight, e = f?.grabbed;
    if (!e) return;
    f.grabbed = null; f.returning = true;
    if (e.agent) e.agent.grabbed = false;
    if (launch && e.alive) this.game.player.air.launch(e, f.opening);
    else if (e.alive) e.agent?._recoil?.(0.3);
  }
  lateUpdate() {
    const g = this.game, visible = g.player.weapon.id === 'gauntlet' && !g.player.dead && !g.form.active && g.weapons.current === 'gauntlet';
    this.restoreHand(); this.model.visible = visible;
    if (!visible) return;
    // The glove includes wrist vertices weighted to the forearm; hide that
    // lower-arm segment too, while leaving the left hand intact.
    this.hand?.scale.setScalar(0.001);
    this.forearm?.scale.setScalar(0.001);
    this.model.position.copy(this.flight?.pos ?? this.home());
    if (this.flight && !this.flight.returning) this.model.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), this.flight.direction);
    else this.model.quaternion.copy(this.down);
  }
  clear() { this._releaseGrab(false); this.flight = null; this.queue.length = 0; this.restoreHand(); }
  dispose() { this.clear(); this.model.removeFromParent(); }
}
