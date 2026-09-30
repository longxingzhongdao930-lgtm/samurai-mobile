import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RingGeometry
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { settings } from '../config/settings.js';

/**
 * The 1v1 ground: a shrine courtyard in a bamboo grove.
 *
 * Small on purpose — `settings.arena.radius` metres of stone inside a low
 * wooden fence, with a torii gate at one end, four stone lanterns, a shrine
 * building behind the gate and a ring of bamboo outside the fence. It borrows
 * its structure from a bounded-arena layout (a floor, a boundary, a few
 * props that frame rather than block) and nothing else.
 *
 * Cheap on purpose too, because a phone draws it: every prop that shares a
 * material is merged into one mesh, and the bamboo is one instanced mesh — six
 * draw calls for the whole set. The materials are patched into the world's
 * light and haze exactly like the floor is, so the courtyard sits in the same
 * night as everything else.
 *
 * Nothing here moves anything. The boundary is enforced by `clamp`, which the
 * app calls on every body each frame; the terrain is flattened while the arena
 * is up by `enter` and put back by `leave`.
 */
export class Arena {
  /**
   * @param {object} options
   * @param {import('./Atmosphere.js').Atmosphere} [options.atmosphere]
   * @param {import('./Environment.js').Environment} [options.environment]
   */
  constructor({ atmosphere = null, environment = null } = {}) {
    this.group = new Group();
    this.group.name = 'Arena';
    this.group.visible = false;
    this.active = false;
    this._saved = null;

    const r = settings.arena.radius;
    const mat = (color, roughness = 0.85, metalness = 0) => {
      const m = new MeshStandardMaterial({ color: new Color(color), roughness, metalness });
      atmosphere?.patch(m);
      environment?.excludeFromKeyLights?.(m);
      return m;
    };
    const materials = {
      stone: mat('#6d6a64', 0.95),
      wood: mat('#4a3322', 0.9),
      vermilion: mat('#9e2a1b', 0.7),
      roof: mat('#2b2b30', 0.8),
      lantern: mat('#8a877f', 0.95),
      bamboo: mat('#5e7a3a', 0.7)
    };

    const put = (geometry, x, y, z, ry = 0) => {
      const o = new Object3D();
      o.position.set(x, y, z);
      o.rotation.y = ry;
      o.updateMatrix();
      return geometry.applyMatrix4(o.matrix);
    };

    /* ---- the floor: a stone disc and a darker ring of edging ---- */
    const floor = [
      put(new CircleGeometry(r + 0.4, 48).rotateX(-Math.PI / 2), 0, 0.015, 0),
      put(new RingGeometry(r + 0.4, r + 0.9, 48).rotateX(-Math.PI / 2), 0, 0.02, 0)
    ];

    /* ---- the fence: posts and two rails, all round ---- */
    const wood = [];
    const posts = 36;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      wood.push(put(new BoxGeometry(0.14, 0.9, 0.14), Math.sin(a) * (r + 0.6), 0.45, Math.cos(a) * (r + 0.6), a));
      const b = ((i + 0.5) / posts) * Math.PI * 2;
      const span = 2 * (r + 0.6) * Math.sin(Math.PI / posts);
      for (const h of [0.35, 0.75]) {
        wood.push(put(new BoxGeometry(span, 0.06, 0.05), Math.sin(b) * (r + 0.6), h, Math.cos(b) * (r + 0.6), b));
      }
    }

    /* ---- the torii, at the +Z end, and the shrine behind it ---- */
    const vermilion = [];
    const gateZ = r + 2.2;
    for (const x of [-1.7, 1.7]) vermilion.push(put(new CylinderGeometry(0.16, 0.19, 3.6, 10), x, 1.8, gateZ));
    vermilion.push(put(new BoxGeometry(4.6, 0.2, 0.3), 0, 3.2, gateZ));
    vermilion.push(put(new BoxGeometry(3.8, 0.14, 0.22), 0, 2.7, gateZ));
    const roof = [put(new BoxGeometry(5.2, 0.14, 0.5), 0, 3.4, gateZ)];

    const shrineZ = r + 6.5;
    wood.push(put(new BoxGeometry(4.2, 2.2, 3.2), 0, 1.3, shrineZ));
    wood.push(put(new BoxGeometry(4.8, 0.3, 3.8), 0, 0.15, shrineZ));
    roof.push(put(new ConeGeometry(3.9, 1.6, 4, 1).rotateY(Math.PI / 4), 0, 3.2, shrineZ));

    /* ---- four stone lanterns on the diagonals, inside the fence ---- */
    const lantern = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.sin(a) * (r - 0.9);
      const z = Math.cos(a) * (r - 0.9);
      lantern.push(put(new BoxGeometry(0.5, 0.15, 0.5), x, 0.08, z));
      lantern.push(put(new CylinderGeometry(0.1, 0.12, 0.8, 8), x, 0.55, z));
      lantern.push(put(new BoxGeometry(0.42, 0.34, 0.42), x, 1.12, z));
      lantern.push(put(new ConeGeometry(0.4, 0.3, 4).rotateY(Math.PI / 4), x, 1.45, z));
    }

    const merged = (list, material) => {
      const mesh = new Mesh(mergeGeometries(list), material);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    merged(floor, materials.stone);
    merged(wood, materials.wood);
    merged(vermilion, materials.vermilion);
    merged(roof, materials.roof);
    merged(lantern, materials.lantern);

    /* ---- the bamboo: one instanced mesh, a ring outside the fence ---- */
    const count = settings.arena.bamboo;
    const bamboo = new InstancedMesh(new CylinderGeometry(0.06, 0.08, 1, 6), materials.bamboo, count);
    bamboo.instanceMatrix.setUsage(DynamicDrawUsage);
    const m = new Matrix4();
    const o = new Object3D();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      // Leave the torii's approach open.
      const nearGate = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32;
      const d = r + (nearGate ? 9 : 2.5) + Math.random() * 6;
      const h = 5 + Math.random() * 5;
      o.position.set(Math.sin(a) * d, h / 2, Math.cos(a) * d);
      o.rotation.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
      o.scale.set(1, h, 1);
      o.updateMatrix();
      m.copy(o.matrix);
      bamboo.setMatrixAt(i, m);
    }
    bamboo.instanceMatrix.needsUpdate = true;
    bamboo.frustumCulled = false;
    this.group.add(bamboo);

    this.materials = materials;
  }

  /** The two marks the fighters start on, and the way each one faces. */
  get spawns() {
    const d = settings.arena.spawnDistance;
    return [
      { x: 0, z: -d, facing: 0 },
      { x: 0, z: d, facing: Math.PI }
    ];
  }

  /**
   * Put the arena up: flatten the ground (the stone is laid on y = 0), pull
   * the camera in a little so it stays inside the grove, and show the set.
   */
  enter() {
    if (this.active) return;
    this.active = true;
    this._saved = {
      amplitude: settings.terrain.amplitude,
      maxDistance: settings.camera.maxDistance,
      distance: settings.camera.distance
    };
    settings.terrain.amplitude = 0;
    settings.camera.maxDistance = Math.min(settings.camera.maxDistance, settings.arena.cameraMax);
    settings.camera.distance = Math.min(settings.camera.distance, settings.arena.cameraMax);
    this.group.visible = true;
  }

  /** Take it down and put the world back as it was. */
  leave() {
    if (!this.active) return;
    this.active = false;
    if (this._saved) {
      settings.terrain.amplitude = this._saved.amplitude;
      settings.camera.maxDistance = this._saved.maxDistance;
      settings.camera.distance = this._saved.distance;
    }
    this._saved = null;
    this.group.visible = false;
  }

  /**
   * Hold a position inside the fence — the boundary. Written in place.
   * @param {{x: number, z: number}} position
   * @param {number} [margin] metres of body to keep off the fence
   * @returns {boolean} whether it had to be moved
   */
  clamp(position, margin = 0.5) {
    if (!this.active) return false;
    const limit = settings.arena.radius - margin;
    const d = Math.hypot(position.x, position.z);
    if (d <= limit) return false;
    const k = limit / d;
    position.x *= k;
    position.z *= k;
    return true;
  }

  dispose() {
    this.group.traverse((node) => {
      node.geometry?.dispose?.();
    });
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
