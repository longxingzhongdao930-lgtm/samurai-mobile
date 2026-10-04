import { Box3, Quaternion, Vector3 } from 'three';
import { ik } from '../combat/WeaponMotion.js';

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const SHEATH_SECONDS = .75;

/** Original game choreography, not a retarget of the supplied MMD motion. */
export class KatanaSheath {
  constructor(presence) { this.presence = presence; this.active = false; }
  update() {
    const h = this.presence, g = h.g, p = g.player, c = p.character;
    const yaw = c.facing;
    const mouth = c.position.clone().add(new Vector3(Math.cos(yaw) * .25 + Math.sin(yaw) * .12, .95, -Math.sin(yaw) * .25 + Math.cos(yaw) * .12));
    const hips = c.getBone('Hips');
    if (hips) {
      c.root.updateMatrixWorld(true);
      const hipPosition = hips.getWorldPosition(new Vector3());
      mouth.add(hipPosition.sub(c.position.clone().add(new Vector3(0, .95, 0))));
      // Carry the mouth at the upper/front of the belt, within the left
      // wrist's reach; the crouch otherwise puts it below a fully extended arm.
      mouth.add(new Vector3(Math.sin(yaw) * .12, .12, Math.cos(yaw) * .12));
      const arm = c.getBone('LeftArm'), forearm = c.getBone('LeftForeArm'), hand = c.getBone('LeftHand');
      if (arm && forearm && hand) {
        const shoulder = arm.getWorldPosition(new Vector3());
        const elbow = forearm.getWorldPosition(new Vector3());
        const wrist = hand.getWorldPosition(new Vector3());
        const reach = shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) - .008;
        const offset = mouth.clone().sub(shoulder);
        if (reach > 0 && offset.length() > reach) mouth.copy(shoulder).add(offset.setLength(reach));
      }
    }
    const axis = new Vector3(-Math.sin(yaw), -.16, -Math.cos(yaw)).normalize();
    if (hips) {
      // Both hands must reach the final pose: the right wrist holds the hilt
      // 10 cm behind the mouth. Project the belt mount into their shared reach.
      const chains = ['Left', 'Right'].map(side => {
        const upper = c.getBone(side + 'Arm'), lower = c.getBone(side + 'ForeArm'), hand = c.getBone(side + 'Hand');
        if (!upper || !lower || !hand) return null;
        const shoulder = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3()), wrist = hand.getWorldPosition(new Vector3());
        return { center: shoulder.clone().addScaledVector(axis, side === 'Right' ? .1 : 0), reach: shoulder.distanceTo(elbow) + elbow.distanceTo(wrist) - .008 };
      });
      for (let i = 0; i < 12; i++) for (const chain of chains) {
        if (!chain || chain.reach <= 0) continue;
        const offset = mouth.clone().sub(chain.center);
        if (offset.length() > chain.reach) mouth.copy(chain.center).add(offset.setLength(chain.reach));
      }
    }
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
    // The imported scabbard is authored from its mouth along +Z. Keep one
    // transform at rest, during insertion, and during the draw: no hip jump.
    h.sheath.position.copy(mouth);
    h.sheath.quaternion.copy(rotation);
    h.sheath.scale.setScalar(1);
    const source = g.weapons.blade?.() ?? g.weapons._slot()?.model;
    const active = p.weapon.id === 'katana' && ['sheath', 'flourish', 'sheathed', 'charge'].includes(p.arts.mode) && !p.dead && !g.form.active;
    if (!source) return;
    if (!active) {
      if (this.active) this.drawFromSheath = p.move === p.heavy && p.state === 'attack';
      if (this.drawFromSheath) {
        if (p.move !== p.heavy || p.state !== 'attack' || p.move.phase >= .28) this.drawFromSheath = false;
        else this._hand('Left', mouth, 1 - smooth(p.move.phase / .28));
      }
      if (this.copy) this.copy.visible = false;
      if (p.weapon.id === 'katana') source.visible = true;
      this.active = false;
      return;
    }
    this.drawFromSheath = false;
    if (!this.copy) {
      this.copy = source.clone(true);
      this.copy.name = 'Katana sheath presentation';
      // The live weapon may contain the fire effect's bounding hull. It is
      // neither steel nor part of the sheathed copy's dimensions.
      const effects = [];
      this.copy.traverse(node => { if (node.userData.isFireVolume) effects.push(node); });
      for (const effect of effects) effect.removeFromParent();
      this.copy.position.set(0, 0, 0); this.copy.quaternion.identity(); this.copy.scale.setScalar(1);
      // Equipment's origin is the guard, with the blade along +Z. A longer
      // handle must not lengthen the insertion or leave a curved edge exposed.
      this.copy.updateMatrixWorld(true);
      const blade = new Box3(), vertex = new Vector3();
      this.copy.traverse(node => {
        const positions = node.geometry?.attributes.position;
        if (!positions) return;
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
          if (vertex.z > .02) blade.expandByPoint(vertex);
        }
      });
      this.length = blade.isEmpty() ? .82 : Math.max(.5, blade.max.z);
      this.width = blade.isEmpty() ? .06 : Math.max(.06, 2 * Math.max(Math.abs(blade.min.x), Math.abs(blade.max.x)) + .012);
      this.depth = blade.isEmpty() ? .065 : Math.max(.065, 2 * Math.max(Math.abs(blade.min.y), Math.abs(blade.max.y)) + .012);
      h.root.add(this.copy);
    }
    if (!this.active) {
      source.updateWorldMatrix(true, false);
      this.from = source.getWorldPosition(new Vector3());
      this.rotation = source.getWorldQuaternion(new Quaternion());
    }
    this.active = true; source.visible = false; this.copy.visible = true;
    const t = ['sheathed', 'charge'].includes(p.arts.mode) ? SHEATH_SECONDS : p.arts.t;
    const align = smooth(t / .22), insert = smooth((t - .22) / .43);
    const guard = mouth.clone().addScaledVector(axis, -this.length * (1 - insert));
    this.copy.position.copy(this.from).lerp(guard, align);
    this.copy.quaternion.copy(this.rotation).slerp(rotation, align);
    // During alignment the blade has not reached the scabbard's orientation.
    // Follow its current hilt rather than the final insertion axis.
    const grip = new Vector3(0, 0, -.1).applyQuaternion(this.copy.quaternion).add(this.copy.position);
    for (const [side, target] of [['Left', mouth], ['Right', grip]]) {
      this._hand(side, target, align);
    }
  }
  invalidate() { this.copy?.removeFromParent(); this.copy = null; this.active = false; this.drawFromSheath = false; }
  _hand(side, target, weight) {
    const h = this.presence, c = h.g.player.character;
    const upper = c.getBone(side + 'Arm'), lower = c.getBone(side + 'ForeArm'), hand = c.getBone(side + 'Hand');
    if (!upper || !lower || !hand) return;
    h.turn(upper); h.turn(lower);
    c.root.updateMatrixWorld(true);
    ik(upper, lower, hand, target, new Vector3(0, -1, 0), weight);
  }
}
