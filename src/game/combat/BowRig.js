import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL = './models/weapons/bow.glb';
const BOW_LENGTH = 1.6;
const ARROW_LENGTH = 0.86;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _aim = new Vector3();
const _side = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _r = new Quaternion();
const _w = new Quaternion();
const _m = new Matrix4();

/**
 * The bow the spells are loosed from.
 *
 * The katana is the only weapon the body is animated for, so the archery is
 * built over whatever the clips are doing: the torso turns side-on, the left
 * arm is laid straight along the line of the shot and the right one draws the
 * string back to the cheek, both with a two-bone IK solved after the mixer.
 * The bow and the arrow are not parented to the hand — they are placed in
 * the world from the solved arms each frame, so their orientation never
 * depends on how the hand bone happens to be rolled.
 *
 * Timeline, driven by `PlayerCombat` through `begin()` and `release()`:
 *   raise (bow up, arms come in) → draw (string to the cheek) → release
 *   (arrow gone, string snaps) → follow-through → lower.
 *
 * Model: "Bow and Arrow" by Amatsukast, CC BY-NC-SA 4.0 — see CREDITS.md.
 */
export class BowRig {
  constructor(game) {
    this.game = game;
    this.character = game.app.character;
    this.root = new Group();
    this.root.name = 'BowRig';
    this.root.visible = false;
    this.bow = new Group();
    this.arrow = new Group();
    this.root.add(this.bow, this.arrow);
    game.app.scene.add(this.root);

    this.weight = 0; // how much of the archery pose is applied
    this.draw = 0; // 0 string at rest … 1 at the cheek
    this.active = false;
    this.t = 0;
    this.nocked = false;
    this.color = new Color('#ffffff');
    this.tips = [new Vector3(), new Vector3()]; // bow-local string ends
    this.ready = false;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    this.string = new Line(geometry, new LineBasicMaterial({ color: '#d8d0c0', transparent: true, opacity: 0.8 }));
    this.string.frustumCulled = false;
    this.root.add(this.string);

    this.bones = {};
    for (const name of ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) {
      this.bones[name] = this.character.getBone(name);
    }
    this._load();
  }

  async _load() {
    try {
      const gltf = await new GLTFLoader().loadAsync(URL);
      gltf.scene.updateMatrixWorld(true);
      const bowMeshes = [];
      const arrowMeshes = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        let n = o;
        while (n && !/^(bow|arrow)/.test(n.name)) n = n.parent;
        if (!n) return;
        (n.name.startsWith('bow') ? bowMeshes : arrowMeshes).push(o);
      });
      this._fit(bowMeshes, this.bow, 'bow');
      this._fit(arrowMeshes, this.arrow, 'arrow');
      this.ready = bowMeshes.length > 0;
    } catch (error) {
      console.warn('[BowRig] bow model unavailable', error);
    }
  }

  /**
   * Bake a part into a frame of its own. The bow: long axis +Y, grip at the
   * origin, its back (away from the string) +Z. The arrow: nock at the origin,
   * point along +Z.
   */
  _fit(meshes, target, kind) {
    if (!meshes.length) return;
    const geometries = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
    const points = [];
    for (const g of geometries) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i += 3) points.push(new Vector3().fromBufferAttribute(p, i));
    }
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of points) {
      min.min(p);
      max.max(p);
    }
    const size = max.clone().sub(min);
    const axes = [0, 1, 2].sort((i, j) => size.getComponent(j) - size.getComponent(i));
    const L = axes[0];
    const C = axes[1];
    const unit = (i, s = 1) => new Vector3().setComponent(i, s);
    const length = size.getComponent(L);
    const mid = (min.getComponent(L) + max.getComponent(L)) / 2;

    const basis = new Matrix4();
    let origin;
    let scale;
    if (kind === 'bow') {
      // The grip bows out furthest from the string: that side is the back.
      const centre = new Vector3();
      let n = 0;
      let tipC = 0;
      let tn = 0;
      for (const p of points) {
        const u = Math.abs(p.getComponent(L) - mid) / length;
        if (u < 0.06) {
          centre.add(p);
          n++;
        } else if (u > 0.44) {
          tipC += p.getComponent(C);
          tn++;
        }
      }
      centre.divideScalar(Math.max(1, n));
      const back = Math.sign(centre.getComponent(C) - tipC / Math.max(1, tn)) || 1;
      const y = unit(L);
      const z = unit(C, back);
      const x = new Vector3().crossVectors(y, z);
      basis.makeBasis(x, y, z).invert();
      origin = centre;
      scale = BOW_LENGTH / length;
      // The string runs between the extreme tips, on the string side.
      const stringC = tipC / Math.max(1, tn);
      for (const [i, end] of [[0, min.getComponent(L)], [1, max.getComponent(L)]]) {
        const tip = new Vector3().copy(centre).setComponent(L, end - Math.sign(end - mid) * length * 0.02).setComponent(C, stringC);
        this.tips[i].copy(tip).sub(origin).applyMatrix4(basis).multiplyScalar(scale);
      }
    } else {
      // Fletching marks the nock end.
      const fletch = meshes.findIndex((m) => /wing/.test(m.name) || /wing/.test(m.material?.name ?? ''));
      let nockEnd = max.getComponent(L);
      if (fletch >= 0) {
        geometries[fletch].computeBoundingBox();
        const b = geometries[fletch].boundingBox;
        const f = (b.min.getComponent(L) + b.max.getComponent(L)) / 2;
        nockEnd = f > mid ? max.getComponent(L) : min.getComponent(L);
      }
      const dir = nockEnd > mid ? -1 : 1;
      const z = unit(L, dir);
      const y = unit(C);
      const x = new Vector3().crossVectors(y, z);
      basis.makeBasis(x, y, z).invert();
      origin = new Vector3().addVectors(min, max).multiplyScalar(0.5).setComponent(L, nockEnd);
      scale = ARROW_LENGTH / length;
    }

    const bake = new Matrix4().makeScale(scale, scale, scale).multiply(basis).multiply(new Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));
    meshes.forEach((mesh, i) => {
      const geometry = geometries[i].applyMatrix4(bake);
      geometry.computeBoundingSphere();
      const material = mesh.material.clone();
      if (kind === 'arrow') {
        material.emissive = new Color('#000000');
        this.arrowMaterials = [...(this.arrowMaterials ?? []), material];
      }
      const part = new Mesh(geometry, material);
      part.castShadow = true;
      part.frustumCulled = false;
      target.add(part);
    });
  }

  /** Raise the bow for a shot. */
  begin(color) {
    if (!this.ready) return false;
    this.active = true;
    this.t = 0;
    this.nocked = true;
    this.arrow.visible = true;
    this.color.set(color);
    for (const m of this.arrowMaterials ?? []) {
      m.emissive.copy(this.color);
      m.emissiveIntensity = 0.9;
    }
    return true;
  }

  /** The arrow leaves: returns where its point was, for the spell to start at. */
  release(out) {
    this.nocked = false;
    this.arrow.visible = false;
    this.draw = 0;
    this._snap = 1;
    if (!this._tip) return null;
    out.copy(this._tip);
    return out;
  }

  end() {
    this.active = false;
  }

  /** Called after the mixer has posed the body (`Game.lateUpdate`). */
  update(dt, target) {
    if (!this.ready) return;
    const rate = this.active ? 9 : 6;
    this.weight += ((this.active ? 1 : 0) - this.weight) * Math.min(1, dt * rate);
    if (!this.active && this.weight < 0.02) this.weight = 0;
    this.t += dt;
    if (this.nocked) this.draw = Math.min(1, Math.max(0, (this.t - 0.06) / 0.2));
    this._snap = Math.max(0, (this._snap ?? 0) - dt * 6);
    this._sword(this.weight < 0.5);
    this.root.visible = this.weight > 0;
    if (this.weight <= 0) return;

    const character = this.character;
    character.root.updateMatrixWorld(true);
    const B = this.bones;
    if (!B.LeftArm || !B.RightArm) return;

    // The line of the shot: at the target's chest, else straight ahead.
    const head = B.Head.getWorldPosition(_a);
    if (target?.alive) {
      const h = target.agent?.type.height ?? 1.8;
      _aim.set(target.position.x - head.x, target.position.y + h * 0.6 - head.y, target.position.z - head.z);
    } else {
      _aim.set(Math.sin(character.facing), 0, Math.cos(character.facing));
    }
    const flat = Math.hypot(_aim.x, _aim.z) || 1;
    _aim.set(_aim.x / flat, Math.max(-0.5, Math.min(0.5, _aim.y / flat)), _aim.z / flat).normalize();

    const w = this.weight;
    // Side-on: the left shoulder toward the target, the head kept on it.
    const turn = -1.05 * w;
    for (const name of ['Spine', 'Spine1', 'Spine2']) this._turn(B[name], _up, turn / 3);
    this._turn(B.Neck, _up, -turn * 0.5);
    this._turn(B.Head, _up, -turn * 0.5);
    character.root.updateMatrixWorld(true);

    _side.crossVectors(_aim, _up).normalize(); // the archer's right
    const shoulderL = B.LeftArm.getWorldPosition(_b);
    const reach = this._length(B.LeftArm, B.LeftForeArm, B.LeftHand);
    // Bow arm: straight down the line, elbow turned out and down.
    _c.copy(shoulderL).addScaledVector(_aim, reach * 0.97);
    _d.copy(_up).multiplyScalar(-0.4).addScaledVector(_side, -1);
    this._ik(B.LeftArm, B.LeftForeArm, B.LeftHand, _c, _d, w);
    const grip = B.LeftHand.getWorldPosition(new Vector3()).addScaledVector(_aim, 0.04);

    // Draw arm: from the nock at the bow to the cheek, the elbow high and back.
    const cheek = B.Head.getWorldPosition(_e).addScaledVector(_up, -0.06).addScaledVector(_side, 0.07).addScaledVector(_aim, 0.03);
    const nock = _c.copy(grip).addScaledVector(_aim, -0.1).lerp(cheek, this.nocked ? this.draw : 0.35);
    _d.copy(_aim).multiplyScalar(-1).addScaledVector(_up, 0.6).addScaledVector(_side, 0.6);
    this._ik(B.RightArm, B.RightForeArm, B.RightHand, nock, _d, w);
    const hand = B.RightHand.getWorldPosition(new Vector3());

    // The bow, upright in the left fist with a little cant, back to the target.
    const cantUp = _b.copy(_up).addScaledVector(_side, -0.18).normalize();
    const zAxis = _aim;
    const xAxis = new Vector3().crossVectors(cantUp, zAxis).normalize();
    const yAxis = new Vector3().crossVectors(zAxis, xAxis);
    _m.makeBasis(xAxis, yAxis, zAxis);
    this.bow.quaternion.setFromRotationMatrix(_m);
    // Raised out of nothing rather than popping: scaled in over the blend.
    this.bow.scale.setScalar(Math.min(1, w * 1.4));
    this.bow.position.copy(grip);

    // The string: tip, nock (the drawing hand while drawn), tip.
    this.bow.updateMatrixWorld();
    const top = _a.copy(this.tips[1]).applyMatrix4(this.bow.matrixWorld);
    const bottom = _b.copy(this.tips[0]).applyMatrix4(this.bow.matrixWorld);
    const rest = _e.addVectors(top, bottom).multiplyScalar(0.5);
    const pull = this.nocked ? this.draw : 0;
    const wobble = this._snap * Math.sin(this.t * 60) * 0.03;
    const nockAt = _d.copy(rest).lerp(hand, pull).addScaledVector(_aim, wobble);
    const pos = this.string.geometry.attributes.position;
    pos.setXYZ(0, top.x, top.y, top.z);
    pos.setXYZ(1, nockAt.x, nockAt.y, nockAt.z);
    pos.setXYZ(2, bottom.x, bottom.y, bottom.z);
    pos.needsUpdate = true;

    // The arrow: nock on the string, laid across the grip.
    if (this.nocked) {
      this.arrow.position.copy(nockAt);
      _c.copy(grip).sub(nockAt);
      if (_c.lengthSq() < 1e-4) _c.copy(_aim);
      _r.setFromUnitVectors(_e.set(0, 0, 1), _c.normalize());
      this.arrow.quaternion.copy(_r);
      this.arrow.scale.setScalar(Math.min(1, w * 1.4));
      this._tip = (this._tip ?? new Vector3()).copy(nockAt).addScaledVector(_c, ARROW_LENGTH);
    }
  }

  _sword(visible) {
    const slot = this.game.app.characterScreen?.equipment.get('sword');
    if (slot?.mount && slot.mount.visible !== visible) slot.mount.visible = visible;
  }

  _length(a, b, c) {
    return a.getWorldPosition(_d).distanceTo(b.getWorldPosition(_e)) + b.getWorldPosition(_d).distanceTo(c.getWorldPosition(_e));
  }

  /** Turn a bone about a world axis, by an angle in radians. */
  _turn(bone, axis, angle) {
    if (!bone) return;
    bone.getWorldQuaternion(_w);
    _q.setFromAxisAngle(axis, angle).multiply(_w);
    this._setWorld(bone, _q, 1);
  }

  /** Give a bone a world orientation, blended by `weight` in its parent's frame. */
  _setWorld(bone, world, weight) {
    bone.parent.getWorldQuaternion(_r).invert();
    _r.multiply(world);
    bone.quaternion.slerp(_r, weight);
    bone.updateMatrixWorld(true);
  }

  /** Point a bone so that its child lies along `dir` (world). */
  _aimBone(bone, child, dir, weight) {
    const from = child.getWorldPosition(_d).sub(bone.getWorldPosition(_e)).normalize();
    _q.setFromUnitVectors(from, dir);
    bone.getWorldQuaternion(_w);
    _q.multiply(_w);
    this._setWorld(bone, _q, weight);
  }

  /** Analytic two-bone IK: shoulder → elbow → wrist reaching `target`. */
  _ik(upper, lower, end, target, pole, weight) {
    const S = upper.getWorldPosition(new Vector3());
    const E = lower.getWorldPosition(new Vector3());
    const W = end.getWorldPosition(new Vector3());
    const a = S.distanceTo(E);
    const b = E.distanceTo(W);
    const toT = new Vector3().subVectors(target, S);
    const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
    const dir = toT.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p = new Vector3().copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
    p.normalize();
    const elbow = new Vector3().copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
    this._aimBone(upper, lower, elbow.sub(S).normalize(), weight);
    const wrist = new Vector3().copy(S).addScaledVector(dir, d);
    const E2 = lower.getWorldPosition(new Vector3());
    this._aimBone(lower, end, wrist.sub(E2).normalize(), weight);
  }

  dispose() {
    this._sword(true);
    this.root.removeFromParent();
  }
}
