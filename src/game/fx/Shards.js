import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, OctahedronGeometry, Quaternion, Vector3 } from 'three';
import { LAYER } from '../../core/Layers.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _dir = new Vector3();

/**
 * Ice: long glowing crystals, one instanced draw for every shard in flight
 * and every splinter of a shatter. A held shard is steered by its owner (an
 * ice bolt in `Magic`); a loose one tumbles, falls and fades on its own.
 */
export class Shards {
  constructor(capacity = 96) {
    this.capacity = capacity;
    const geometry = new OctahedronGeometry(0.5, 0);
    geometry.scale(0.32, 1.6, 0.32);
    this.material = new MeshBasicMaterial({
      color: new Color('#bff6ff'),
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false
    });
    this.mesh = new InstancedMesh(geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = 12;
    this.items = Array.from({ length: capacity }, () => ({
      live: false, held: false, pos: new Vector3(), vel: new Vector3(), spin: new Vector3(), rot: new Quaternion(), size: 1, life: 0, age: 0
    }));
    this._next = 0;
    this.mesh.count = capacity;
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }

  _slot() {
    for (let n = 0; n < this.capacity; n++) {
      const i = (this._next + n) % this.capacity;
      if (!this.items[i].live) {
        this._next = (i + 1) % this.capacity;
        return i;
      }
    }
    return -1;
  }

  /** A shard the caller moves (`move`) and lets go of (`free`). */
  hold(size = 0.5) {
    const i = this._slot();
    if (i < 0) return -1;
    const s = this.items[i];
    s.live = true;
    s.held = true;
    s.size = size;
    return i;
  }

  move(i, pos, vel) {
    if (i < 0) return;
    const s = this.items[i];
    s.pos.copy(pos);
    _dir.copy(vel).normalize();
    s.rot.setFromUnitVectors(_up, _dir);
  }

  free(i) {
    if (i >= 0) this.items[i].live = false;
  }

  /** Splinters flying out of a point. */
  burst(point, count = 10, speed = 6, size = 0.28) {
    for (let n = 0; n < count; n++) {
      const i = this._slot();
      if (i < 0) return;
      const s = this.items[i];
      s.live = true;
      s.held = false;
      s.pos.copy(point);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      s.vel.set(Math.cos(a) * v, 2 + Math.random() * speed * 0.6, Math.sin(a) * v);
      s.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      s.rot.random();
      s.size = size * (0.5 + Math.random());
      s.life = 0.6 + Math.random() * 0.5;
      s.age = 0;
    }
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      const s = this.items[i];
      if (!s.live) {
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      let scale = s.size;
      if (!s.held) {
        s.age += dt;
        if (s.age >= s.life) {
          s.live = false;
          this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
          continue;
        }
        s.vel.y -= 14 * dt;
        s.pos.addScaledVector(s.vel, dt);
        _q.setFromAxisAngle(_dir.copy(s.spin).normalize(), s.spin.length() * dt);
        s.rot.multiply(_q);
        scale *= 1 - s.age / s.life;
      }
      _s.setScalar(scale);
      _m.compose(s.pos, s.rot, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const s of this.items) s.live = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
