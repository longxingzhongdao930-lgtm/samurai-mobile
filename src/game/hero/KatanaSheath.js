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
    const axis = new Vector3(-Math.sin(yaw), -.16, -Math.cos(yaw)).normalize();
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
    // The imported scabbard is authored from its mouth along +Z. Keep one
    // transform at rest, during insertion, and during the draw: no hip jump.
    h.sheath.position.copy(mouth);
    h.sheath.quaternion.copy(rotation);
    h.sheath.scale.setScalar(1);
    const source = g.weapons._slot()?.model;
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
    for (const [side, target] of [['Left', mouth], ['Right', this.copy.position.clone().addScaledVector(axis, -.1)]]) {
      this._hand(side, target, align);
    }
  }
  _hand(side, target, weight) {
    const h = this.presence, c = h.g.player.character;
    const upper = c.getBone(side + 'Arm'), lower = c.getBone(side + 'ForeArm'), hand = c.getBone(side + 'Hand');
    if (!upper || !lower || !hand) return;
    h.turn(upper); h.turn(lower);
    c.root.updateMatrixWorld(true);
    ik(upper, lower, hand, target, new Vector3(0, -1, 0), weight);
  }
}
