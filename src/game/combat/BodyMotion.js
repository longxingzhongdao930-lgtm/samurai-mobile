import { Matrix4, Quaternion, Vector3 } from 'three';

const _m = new Matrix4();
const _t = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Whole-body motion layered over the clips: the roll of a dodge, the lurch of
 * a blow taken, the fall of a knockdown, the shove of a blocked hit.
 *
 * Written onto the character's `tilt` node (the one between the root, which
 * owns position and heading, and the skinned model), so it moves everything
 * — body, armour, sword — without touching a bone. Each motion turns about a
 * pivot that makes it physical: a roll about the hips, a stagger and a fall
 * about the feet.
 *
 *   roll   — full turns about the body's right axis, pivot at the hips
 *   pitch  — a damped spring, + leans forward; pivot at the feet
 *   fall   — a driven angle for knockdowns, − falls backward; pivot at the feet
 *   twist  — a damped spring about the vertical
 *   drop   — metres the whole body sinks (a crouch into a dodge)
 */
export class BodyMotion {
  constructor(character) {
    this.character = character;
    this.roll = 0;
    this.pitch = 0;
    this._pitchVel = 0;
    this.fall = 0;
    this.twist = 0;
    this._twistVel = 0;
    this.drop = 0;
  }

  /** Kick the springs: a blow, a block, a parry. */
  impulse(pitch = 0, twist = 0) {
    this._pitchVel += pitch;
    this._twistVel += twist;
  }

  update(dt) {
    // Springs: stiff, well damped — a rock and a settle, never a wobble.
    this._pitchVel += (-this.pitch * 160 - this._pitchVel * 16) * dt;
    this.pitch += this._pitchVel * dt;
    this._twistVel += (-this.twist * 120 - this._twistVel * 14) * dt;
    this.twist += this._twistVel * dt;
    this.pitch = Math.max(-0.8, Math.min(0.6, this.pitch));
    this.twist = Math.max(-0.6, Math.min(0.6, this.twist));
    this.apply();
  }

  apply() {
    const character = this.character;
    const tilt = character.tilt;
    const right = character._rightAxis;
    if (!tilt || !right) return;
    const height = character.height ?? 1.8;

    // Start from rest.
    _m.identity();
    // Roll about the hips.
    if (this.roll) {
      const pivotY = height * 0.5;
      _t.makeTranslation(0, -pivotY, 0);
      _m.premultiply(_t);
      _q.setFromAxisAngle(right, this.roll);
      _t.makeRotationFromQuaternion(_q);
      _m.premultiply(_t);
      _t.makeTranslation(0, pivotY, 0);
      _m.premultiply(_t);
    }
    // Lean and fall about the feet.
    const lean = this.pitch + this.fall;
    if (lean) {
      _q.setFromAxisAngle(right, lean);
      _t.makeRotationFromQuaternion(_q);
      _m.premultiply(_t);
    }
    if (this.twist) {
      _q.setFromAxisAngle(_up, this.twist);
      _t.makeRotationFromQuaternion(_q);
      _m.premultiply(_t);
    }
    if (this.drop) {
      _t.makeTranslation(0, -this.drop, 0);
      _m.premultiply(_t);
    }
    _m.decompose(_p, _q, _s);
    tilt.position.copy(_p);
    tilt.quaternion.copy(_q);
  }

  reset() {
    this.roll = this.pitch = this.fall = this.twist = this.drop = 0;
    this._pitchVel = this._twistVel = 0;
    this.apply();
  }
}
