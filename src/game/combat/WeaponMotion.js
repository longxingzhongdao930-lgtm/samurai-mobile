import {
  BoxGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3
} from 'three';
import { MOTIONS } from '../data/motions.js';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _r = new Quaternion();
const _w = new Quaternion();
const _m = new Matrix4();

const VEC_FIELDS = ['r', 'l', 'd'];
const NUM_FIELDS = ['tw', 'ln'];

/**
 * Arms and torso for the weapons the clips were not made for.
 *
 * After the mixer has posed the body, the current move's keys (data/motions.js)
 * are sampled at the move's phase: the torso is turned and leant, the right
 * hand is put where the key says by a two-bone IK and rolled so the weapon
 * points along the key's direction, and the left hand goes onto the shaft (or
 * where the key puts it). Between moves the weapon's stance is held, so a
 * spear is carried like a spear and fists are kept up.
 *
 * The legs, the warp, the lunge and the hit frames are still the move's own:
 * this only replaces what the arms do.
 */
export class WeaponMotion {
  constructor(game) {
    this.game = game;
    this.character = game.app.character;
    this.player = game.player;
    this.weight = 0;
    this.pose = null; // smoothed pose actually applied
    this.edge = new Vector3(0, 1, 0);
    this._lastDir = new Vector3();
    this.bones = {};
    for (const name of ['Spine', 'Spine1', 'Spine2', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) {
      this.bones[name] = this.character.getBone(name);
    }
    this.chain = new KusariChain(game);
  }

  /** The weapon model in the right hand, if one is shown. */
  _held() {
    const shown = this.game.weapons?.shown;
    if (!shown || shown.id === 'gauntlet' || shown.id === 'shuriken') return null;
    return shown.objects[0] ?? null;
  }

  /** Which keys drive the arms now, and at what phase. */
  _source() {
    const p = this.player;
    const spec = MOTIONS[p.weapon.id];
    if (!spec || this.game.form?.active || this.game.weapons?.shown?.id !== p.weapon.id) return null;
    if (p.weapon.id === 'gauntlet' && this.game.weapons.fist) return { spec, keys: null, t: 0, guard: p.guarding };
    if (p.air?.airborne) return { spec, keys: spec.moves[p.air.pose] ?? null, t: p.air.phase, id: p.air.pose };
    if (p.state === 'attack' && p.move) {
      const id = p.move.config.id;
      let keys=spec.moves[id];
      if(p.move.config.airborne){
        const source=p.weapon.id==='odachi'?'k5':p.weapon.id==='naginata'?'k3':'k1';
        const contact=source==='k5'?.42:source==='k3'?.5:.62;
        keys=spec.moves[source]?.map(key=>({...key,t:key.t<=contact?key.t*.5/contact:.5+(key.t-contact)*.5/(1-contact)}));
      }
      if (keys) return { spec, keys, t: p.move.phase, id };
    }
    if (['sheath','flourish','sheathed'].includes(p.arts?.mode)) return null;
    if (p.state === 'free') return { spec, keys: null, t: 0, guard: p.guarding };
    return null;
  }

  update(dt) {
    const src = this._source();
    const active = Boolean(src);
    this.weight += ((active ? 1 : 0) - this.weight) * Math.min(1, dt * 12);
    if (this.weight < 0.01) this.weight = 0;
    if (src) {
      const target = src.keys ? sample(src.spec, src.keys, src.t) : src.guard ? src.spec.guard : src.spec.stance;
      this.pose = blend(this.pose, target, Math.min(1, dt * 26));
      this.spec = src.spec;
    }
    if (this.weight > 0 && this.pose && this.spec) this._apply(this.pose, this.spec, this.weight);
    this.chain.update(dt, this, src);
  }

  _apply(pose, spec, w) {
    const character = this.character;
    const B = this.bones;
    if (!B.RightArm || !B.LeftArm || !B.Spine) return;
    character.root.updateMatrixWorld(true);

    // The body's frame, and the scale the keys are authored at.
    const yaw = character.facing;
    const fw = _a.set(Math.sin(yaw), 0, Math.cos(yaw));
    const right = _b.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const leftAxis = _c.copy(right).negate();
    const scale = this._scale();
    const origin = character.position.clone();
    if(this.player.move?.config.airborne){
      const shoulder=(B.RightArm.getWorldPosition(new Vector3()).y+B.LeftArm.getWorldPosition(new Vector3()).y)*.5;
      origin.y+=Math.max(0,shoulder-character.position.y-1.45*scale);
    }
    const toWorld = (v, out) =>
      out.copy(origin).addScaledVector(right, v[0] * scale).addScaledVector(_up, v[1] * scale).addScaledVector(fw, v[2] * scale);
    const dirWorld = (v, out) => out.set(0, 0, 0).addScaledVector(right, v[0]).addScaledVector(_up, v[1]).addScaledVector(fw, v[2]).normalize();

    // Torso: turned, then leant, a third on each spine joint.
    const tw = ((pose.tw ?? 0) * Math.PI) / 180;
    const ln = ((pose.ln ?? 0) * Math.PI) / 180;
    for (const name of ['Spine', 'Spine1', 'Spine2']) {
      const bone = B[name];
      if (!bone) continue;
      bone.getWorldQuaternion(_w);
      _q.setFromAxisAngle(_up, tw / 3);
      _r.setFromAxisAngle(leftAxis, ln / 3);
      _q.multiply(_r).multiply(_w);
      setWorld(bone, _q, w);
    }
    character.root.updateMatrixWorld(true);

    // Right hand.
    const fwX = fw.x, fwZ = fw.z, rX = right.x, rZ = right.z;
    const poleR = new Vector3(rX * 0.5 - fwX * 0.35, -0.7, rZ * 0.5 - fwZ * 0.35);
    const poleL = new Vector3(-rX * 0.5 - fwX * 0.35, -0.7, -rZ * 0.5 - fwZ * 0.35);
    if (pose.r) ik(B.RightArm, B.RightForeArm, B.RightHand, toWorld(pose.r, new Vector3()), poleR, w);

    // The weapon's line: the hand rolled so the tip points down `d`, the
    // flat turned so the edge leads the cut.
    const held = this._held();
    let D = null;
    if (held && pose.d) {
      D = dirWorld(pose.d, new Vector3());
      const motion = _d.copy(D).sub(this._lastDir);
      if (motion.lengthSq() > 4e-5) {
        motion.addScaledVector(D, -motion.dot(D)).normalize();
        this.edge.lerp(motion, 0.35);
      }
      this._lastDir.copy(D);
      const U = _e.copy(this.edge).addScaledVector(D, -this.edge.dot(D));
      if (U.lengthSq() < 1e-6) U.copy(_up).addScaledVector(D, -D.y);
      U.normalize();
      const X = new Vector3().crossVectors(U, D);
      _m.makeBasis(X, U, D);
      const desired = new Quaternion().setFromRotationMatrix(_m);
      held.updateWorldMatrix(true, false);
      held.getWorldQuaternion(_r);
      B.RightHand.getWorldQuaternion(_w);
      // hand' = desired · weapon⁻¹ · hand
      _q.copy(desired).multiply(_r.invert()).multiply(_w);
      setWorld(B.RightHand, _q, w);
    }

    // Left hand: on the shaft, or where the key puts it.
    let left = null;
    if (held && D && spec.gap != null) {
      held.updateWorldMatrix(true, false);
      left = held.getWorldPosition(new Vector3()).addScaledVector(D, spec.gap);
    } else if (pose.l) {
      left = toWorld(pose.l, new Vector3());
    }
    this._leftTarget = left;
    if (left) ik(B.LeftArm, B.LeftForeArm, B.LeftHand, left, poleL, w);
  }

  /** Keys are for a 1.8 m body: measured off the shoulders, once. */
  _scale() {
    if (this._k) return this._k;
    const s = this.bones.RightArm.getWorldPosition(new Vector3()).y - this.character.position.y;
    if (s > 0.5) this._k = s / 1.45;
    return this._k ?? 1;
  }
}

/* ---------------------------------------------------------------------- */
/* sampling                                                                */
/* ---------------------------------------------------------------------- */

/** The keys of a move with the stance at both ends, missing fields filled in. */
function track(spec, keys) {
  if (keys._track) return keys._track;
  const s = spec.stance;
  const fill = (key, t) => ({
    t,
    r: key.r ?? s.r,
    l: key.l ?? s.l ?? null,
    d: key.d === undefined ? s.d ?? null : key.d,
    tw: key.tw ?? 0,
    ln: key.ln ?? 0
  });
  const out = [fill(s, 0), ...keys.map((key) => fill(key, key.t))];
  if (keys[keys.length - 1].t < 1) out.push(fill(s, 1));
  Object.defineProperty(keys, '_track', { value: out });
  return out;
}

function sample(spec, keys, t) {
  const k = track(spec, keys);
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1].t) i++;
  const a = k[Math.max(0, i - 1)];
  const b = k[i];
  const c = k[i + 1];
  const d = k[Math.min(k.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - b.t) / Math.max(1e-4, c.t - b.t)));
  const out = {};
  for (const f of VEC_FIELDS) {
    if (!b[f] || !c[f]) {
      out[f] = (u < 0.5 ? b[f] : c[f]) ?? null;
      continue;
    }
    const p0 = a[f] ?? b[f];
    const p3 = d[f] ?? c[f];
    out[f] = [0, 1, 2].map((j) => catmull(p0[j], b[f][j], c[f][j], p3[j], u));
  }
  for (const f of NUM_FIELDS) out[f] = catmull(a[f], b[f], c[f], d[f], u);
  return out;
}

function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Ease the applied pose toward the target, so chained moves never pop. */
function blend(current, target, k) {
  if (!current) return { r: target.r?.slice() ?? null, l: target.l?.slice() ?? null, d: target.d?.slice() ?? null, tw: target.tw ?? 0, ln: target.ln ?? 0 };
  for (const f of VEC_FIELDS) {
    if (!target[f]) {
      current[f] = null;
      continue;
    }
    if (!current[f]) current[f] = target[f].slice();
    else for (let j = 0; j < 3; j++) current[f][j] += (target[f][j] - current[f][j]) * k;
  }
  for (const f of NUM_FIELDS) current[f] += ((target[f] ?? 0) - current[f]) * k;
  return current;
}

/* ---------------------------------------------------------------------- */
/* IK                                                                      */
/* ---------------------------------------------------------------------- */

function setWorld(bone, world, weight) {
  bone.parent.getWorldQuaternion(_r).invert();
  _r.multiply(world);
  bone.quaternion.slerp(_r, weight);
  bone.updateMatrixWorld(true);
}

function aimBone(bone, child, dir, weight) {
  const from = child.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
  const q = new Quaternion().setFromUnitVectors(from, dir);
  bone.getWorldQuaternion(_w);
  q.multiply(_w);
  setWorld(bone, q, weight);
}

/** Analytic two-bone IK: shoulder → elbow → wrist reaching `target`. */
export function ik(upper, lower, end, target, pole, weight) {
  const S = upper.getWorldPosition(new Vector3());
  const E = lower.getWorldPosition(new Vector3());
  const W = end.getWorldPosition(new Vector3());
  const a = S.distanceTo(E);
  const b = E.distanceTo(W);
  const toT = new Vector3().subVectors(target, S);
  const dist = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const dir = toT.normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = new Vector3().copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
  p.normalize();
  const elbow = new Vector3().copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
  aimBone(upper, lower, elbow.sub(S).normalize(), weight);
  const wrist = new Vector3().copy(S).addScaledVector(dir, dist);
  const E2 = lower.getWorldPosition(new Vector3());
  aimBone(lower, end, wrist.sub(E2).normalize(), weight);
}

/* ---------------------------------------------------------------------- */
/* the kusarigama's chain                                                  */
/* ---------------------------------------------------------------------- */

const LINK = 0.05;
const MAX_LINKS = 220;

/**
 * Sickle butt → left hand → weight. The weight hangs and swings from the hand
 * at rest, is whirled round overhead for the spin and flies out to the target
 * for the throw (`MOTIONS.kusarigama.chainMoves`).
 */
class KusariChain {
  constructor(game) {
    this.game = game;
    const iron = new MeshStandardMaterial({ color: '#3a3836', metalness: 0.9, roughness: 0.45 });
    this.links = new InstancedMesh(new BoxGeometry(0.014, 0.028, LINK * 1.1), iron, MAX_LINKS);
    this.links.frustumCulled = false;
    this.links.castShadow = true;
    this.links.count = 0;
    this.weight = new Mesh(new CylinderGeometry(0.03, 0.034, 0.11, 8), iron);
    this.weight.castShadow = true;
    this.links.visible = this.weight.visible = false;
    game.app.scene.add(this.links, this.weight);
    this.pos = new Vector3();
    this.prev = new Vector3();
    this.angle = 0;
    this.started = false;
  }

  update(dt, motion, src) {
    const shown = this.game.weapons?.shown;
    const held = shown?.id === 'kusarigama' ? shown.objects[0] : null;
    const visible = Boolean(held) && !this.game.form?.active && held.parent?.visible !== false && held.visible;
    this.links.visible = this.weight.visible = visible;
    if (!visible) {
      this.started = false;
      return;
    }
    const hand = motion.bones.LeftHand;
    const H = hand.getWorldPosition(new Vector3());
    held.updateWorldMatrix(true, false);
    const A = held.localToWorld(new Vector3(0, 0, -0.17));
    if (!this.started) {
      this.pos.copy(H).y -= 0.45;
      this.prev.copy(this.pos);
      this.started = true;
    }

    const p = this.game.player;
    const mode = src?.id ? MOTIONS.kusarigama.chainMoves?.[src.id] : null;
    const t = src?.t ?? 0;
    let driven = false;
    if (mode?.type === 'spin' && t >= mode.from && t <= mode.to) {
      const u = (t - mode.from) / (mode.to - mode.from);
      const ramp = Math.min(1, u / 0.15, (1 - u) / 0.15);
      const radius = 0.45 + (mode.radius - 0.45) * Math.max(0, ramp);
      this.angle = p.character.facing + Math.PI / 2 + u * mode.turns * Math.PI * 2;
      this.pos.set(H.x + Math.sin(this.angle) * radius, H.y + 0.05 - 0.25 * (1 - ramp), H.z + Math.cos(this.angle) * radius);
      driven = true;
    } else if (mode?.type === 'throw' && t >= mode.out * 0.8 && t <= mode.back) {
      const target = p.move?.target?.alive ? _a.copy(p.move.target.position).setY(p.move.target.position.y + 1.1) : null;
      const reach = p.move?.config.reach ?? 7;
      const far = target ?? _a.copy(p.character.position).add(_b.set(Math.sin(p.character.facing) * reach, 1.2, Math.cos(p.character.facing) * reach));
      let s;
      if (t < mode.out) s = 0;
      else if (t < mode.hit) s = (t - mode.out) / (mode.hit - mode.out);
      else s = 1 - (t - mode.hit) / (mode.back - mode.hit);
      s = Math.max(0, Math.min(1, s));
      this.pos.lerpVectors(H, far, s * s * (3 - 2 * s));
      driven = true;
    }
    if (driven) {
      this.prev.copy(this.pos);
    } else {
      // A pendulum on 0.45 m of chain from the hand.
      const v = _c.subVectors(this.pos, this.prev).multiplyScalar(0.96);
      this.prev.copy(this.pos);
      this.pos.add(v).addScaledVector(_up, -9.8 * dt * dt);
      const off = _d.subVectors(this.pos, H);
      const len = off.length();
      if (len > 0.45) this.pos.copy(H).addScaledVector(off, 0.45 / len);
    }

    // Lay the links: butt → hand (a little slack), hand → weight.
    let n = 0;
    n = this._lay(A, H, n, 0.06);
    n = this._lay(H, this.pos, n, 0);
    this.links.count = n;
    this.links.instanceMatrix.needsUpdate = true;
    this.weight.position.copy(this.pos);
    _d.subVectors(this.pos, H);
    if (_d.lengthSq() > 1e-6) this.weight.quaternion.setFromUnitVectors(_up, _d.normalize());
  }

  _lay(from, to, n, sag) {
    const length = from.distanceTo(to);
    const count = Math.min(MAX_LINKS - n, Math.max(1, Math.ceil(length / LINK)));
    const point = (u, out) => out.lerpVectors(from, to, u).addScaledVector(_up, -sag * 4 * u * (1 - u));
    for (let i = 0; i < count; i++) {
      point(i / count, _a);
      point((i + 1) / count, _b);
      _e.addVectors(_a, _b).multiplyScalar(0.5);
      _d.subVectors(_b, _a);
      if (_d.lengthSq() < 1e-8) _d.set(0, -1, 0);
      _q.setFromUnitVectors(_c.set(0, 0, 1), _d.normalize());
      // Alternate links turned a quarter about the chain.
      if (i % 2) _q.multiply(_r.setFromAxisAngle(_c.set(0, 0, 1), Math.PI / 2));
      _m.compose(_e, _q, _a.set(1, 1, 1));
      this.links.setMatrixAt(n++, _m);
    }
    return n;
  }
}
