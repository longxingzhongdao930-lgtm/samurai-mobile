import { Box3, Quaternion, Vector3 } from 'three';
import { ik } from '../combat/WeaponMotion.js';

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const SHEATH_SECONDS = .75;

/** Original game choreography, not a retarget of the supplied MMD motion. */
export class KatanaSheath {
  constructor(presence) { this.presence = presence; this.active = false; }
  update() {
    const h = this.presence, g = h.g, p = g.player, c = p.character;
    const source = g.weapons._slot()?.model;
    const active = p.weapon.id === 'katana' && ['sheath', 'flourish', 'sheathed', 'charge'].includes(p.arts.mode) && !p.dead && !g.form.active;
    if (!source) return;
    if (!active) {
      if (this.copy) this.copy.visible = false;
      if (p.weapon.id === 'katana') source.visible = true;
      this.active = false;
      return;
    }
    if (!this.copy) {
      this.copy = source.clone(true);
      this.copy.name = 'Katana sheath presentation';
      this.copy.position.set(0, 0, 0); this.copy.quaternion.identity(); this.copy.scale.setScalar(1);
      const size = new Box3().setFromObject(this.copy).getSize(new Vector3());
      this.length = Math.max(.5, size.z);
      h.root.add(this.copy);
    }
    if (!this.active) {
      source.updateWorldMatrix(true, false);
      this.from = source.getWorldPosition(new Vector3());
      this.rotation = source.getWorldQuaternion(new Quaternion());
    }
    this.active = true; source.visible = false; this.copy.visible = true;
    const yaw = c.facing;
    const mouth = c.position.clone().add(new Vector3(Math.cos(yaw) * .25 + Math.sin(yaw) * .12, .95, -Math.sin(yaw) * .25 + Math.cos(yaw) * .12));
    const axis = new Vector3(-Math.sin(yaw), -.16, -Math.cos(yaw)).normalize();
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), axis);
    const t = ['sheathed', 'charge'].includes(p.arts.mode) ? SHEATH_SECONDS : p.arts.t;
    const align = smooth(t / .22), insert = smooth((t - .22) / .43);
    const guard = mouth.clone().addScaledVector(axis, -this.length * (1 - insert));
    this.copy.position.copy(this.from).lerp(guard, align);
    this.copy.quaternion.copy(this.rotation).slerp(rotation, align);
    // Enclose the blade while keeping the hilt visible; never scale/collapse vertices.
    h.sheath.position.copy(mouth).addScaledVector(axis, this.length * .5);
    h.sheath.quaternion.copy(rotation);
    h.sheath.scale.z = (this.length + .04) / .82;
    for (const [side, target] of [['Left', mouth], ['Right', this.copy.position.clone().addScaledVector(axis, -.1)]]) {
      const upper = c.getBone(side + 'Arm'), lower = c.getBone(side + 'ForeArm'), hand = c.getBone(side + 'Hand');
      if (!upper || !lower || !hand) continue;
      h.turn(upper); h.turn(lower);
      c.root.updateMatrixWorld(true);
      ik(upper, lower, hand, target, new Vector3(0, -1, 0), align);
    }
  }
}
