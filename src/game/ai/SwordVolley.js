import { Quaternion, Vector3 } from 'three';
import { segmentDistanceSq } from '../combat/FlightPath.js';

/** A single authored sword leaves the formation, then returns before the next. */
export class SwordVolley {
  constructor(enemy, bones) { this.enemy = enemy; this.bones = bones; this.queue = []; this.index = 0; this.flight = null; }
  enqueue(spec) { if (this.queue.length < 3) this.queue.push(spec); }
  beforeAnimate() {
    if (!this.restore) return;
    this.restore.bone.position.copy(this.restore.position); this.restore.bone.quaternion.copy(this.restore.rotation);
    this.restore = null;
  }
  update(dt) {
    const e = this.enemy, a = e.agent;
    if (!e.alive) { this.clear(); return; }
    const interrupted = ['hurt', 'down', 'broken', 'recoil', 'frozen'].includes(a?.state) || a?.airControlled;
    if (interrupted) { this.queue.length = 0; if (this.flight && this.flight.state !== 'return') this._return(); }
    if (!this.flight && this.queue.length && a) {
      const bone = this.bones[this.index++ % this.bones.length];
      const from = bone.getWorldPosition(new Vector3()), aim = a.game.playerPosition.clone(); aim.y += 1.1;
      this.flight = { bone, spec: this.queue.shift(), from, pos: from.clone(), direction: aim.sub(from).normalize(), state: 'cue', time: 0, hit: false };
    }
    const f = this.flight; if (!f) return;
    const home = f.bone.getWorldPosition(new Vector3());
    this.restore = { bone: f.bone, position: f.bone.position.clone(), rotation: f.bone.quaternion.clone() };
    f.time += dt;
    if (f.state === 'cue') {
      a.game.fx?.glow?.spawn(f.pos, '#bcddff', 0.14, 0.12, { intensity: 1.5 });
      if (f.time >= 0.24) { f.state = 'out'; f.time = 0; a.game.audio?.play('whoosh', { pos: f.pos }); }
    } else if (f.state === 'out') {
      const old = f.pos.clone(); f.pos.addScaledVector(f.direction, dt * 13);
      a.game.fx?.glow?.spawn(f.pos, '#badaff', 0.08, 0.18, { intensity: 1.2 });
      const player = a.game.playerPosition.clone(); player.y += 1.1;
      if (!f.hit && segmentDistanceSq(player, old, f.pos) < 0.6 ** 2) {
        f.hit = true;
        a.game.player.receiveHit({ damage: f.spec.damage, posture: f.spec.posture, knockback: 0.6, from: f.from, attacker: e, kind: 'flyingSword' });
        this._return();
      } else if (f.time > 1.35 || a.game.stage?.blocks(f.pos.x, f.pos.z)) this._return();
    } else {
      const u = Math.min(1, f.time / 0.42);
      f.pos.lerpVectors(f.returnFrom, home, u);
      if (u === 1) { this.flight = null; this.beforeAnimate(); return; }
    }
    f.bone.position.copy(f.bone.parent.worldToLocal(f.pos.clone()));
    const worldQ = f.bone.getWorldQuaternion(new Quaternion());
    const turn = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), f.direction);
    worldQ.premultiply(turn);
    f.bone.quaternion.copy(f.bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(worldQ));
  }
  _return() { const f = this.flight; if (!f) return; f.state = 'return'; f.time = 0; f.returnFrom = f.pos.clone(); }
  clear() { this.beforeAnimate(); this.flight = null; this.queue.length = 0; }
}
