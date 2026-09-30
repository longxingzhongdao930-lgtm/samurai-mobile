import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3
} from 'three';

import { LAYER } from '../core/Layers.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _dir = new Vector3();
const _z = new Vector3(0, 0, 1);
const _hide = new Matrix4().makeScale(0, 0, 0);
const ARROW = new Color('#e9d2a6');
const BULLET = new Color('#fff1c0');

/**
 * 矢 and 弾 — what the 弓 and 鉄砲 loose (`settings.enemyKinds.archer`).
 *
 * The reference shooters are a cooldown gated on distance and a projectile
 * carried forward each frame until it hits or expires; this is that, pooled:
 * one instanced mesh for every shaft and ball in the air, one draw call, the
 * flight integrated on the CPU (a dozen at most). A shot is tested against the
 * player's chest along the whole segment it covered this frame, so a fast
 * ball can never step over the body between two frames.
 */
export class Projectiles {
  constructor(capacity = 16) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({
      live: false,
      owner: null,
      gun: false,
      pos: new Vector3(),
      vel: new Vector3(),
      age: 0
    }));
    this.mesh = new InstancedMesh(new BoxGeometry(0.035, 0.035, 1), new MeshBasicMaterial({ color: 0xffffff }), capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.name = 'Projectiles';
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, _hide);
      this.mesh.setColorAt(i, ARROW);
    }
  }

  /** Loose one from `from` at `to`, at `speed` m/s. */
  fire(owner, from, to, speed, gun) {
    const slot = this.items.find((item) => !item.live);
    if (!slot) return null;
    slot.live = true;
    slot.owner = owner;
    slot.gun = gun;
    slot.age = 0;
    slot.pos.copy(from);
    slot.vel.subVectors(to, from).normalize().multiplyScalar(speed);
    this.mesh.setColorAt(this.items.indexOf(slot), gun ? BULLET : ARROW);
    this.mesh.instanceColor.needsUpdate = true;
    return slot;
  }

  /**
   * @param {number} dt
   * @param {Vector3} chest the player's chest
   * @param {(owner: object, dirX: number, dirZ: number, gun: boolean, at: Vector3) => void} onHit
   * @param {(x: number, z: number) => number} groundAt
   */
  update(dt, chest, onHit, groundAt) {
    let any = false;
    this.items.forEach((item, i) => {
      if (!item.live) {
        this.mesh.setMatrixAt(i, _hide);
        return;
      }
      any = true;
      item.age += dt;
      _p.copy(item.pos);
      item.pos.addScaledVector(item.vel, dt);
      // Closest approach of this frame's segment to the chest.
      _dir.subVectors(item.pos, _p);
      const len2 = _dir.lengthSq();
      let t = len2 > 0 ? _s.subVectors(chest, _p).dot(_dir) / len2 : 0;
      t = Math.min(1, Math.max(0, t));
      const cx = _p.x + _dir.x * t - chest.x;
      const cy = _p.y + _dir.y * t - chest.y;
      const cz = _p.z + _dir.z * t - chest.z;
      if (cx * cx + cy * cy + cz * cz < 0.5 * 0.5) {
        item.live = false;
        const h = Math.hypot(item.vel.x, item.vel.z) || 1;
        onHit(item.owner, item.vel.x / h, item.vel.z / h, item.gun, item.pos);
        this.mesh.setMatrixAt(i, _hide);
        return;
      }
      if (item.age > 2 || item.pos.y < groundAt(item.pos.x, item.pos.z)) {
        item.live = false;
        this.mesh.setMatrixAt(i, _hide);
        return;
      }
      _q.setFromUnitVectors(_z, _dir.copy(item.vel).normalize());
      _s.set(item.gun ? 1.8 : 1, item.gun ? 1.8 : 1, item.gun ? 0.35 : 0.85);
      _m.compose(item.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = any;
  }

  clear() {
    for (const item of this.items) item.live = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
