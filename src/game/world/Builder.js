import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Accumulates the stage as primitives per material and merges each list into
 * one mesh at the end — the whole town is a dozen draw calls.
 *
 * Every primitive gets world-scale UVs (`tile` metres per texture repeat), so
 * one board texture reads the same on a shed and on a castle gate.
 */
export class Builder {
  constructor() {
    /** material key → geometries */
    this.parts = new Map();
  }

  _add(key, geometry) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geometry.index ? geometry.toNonIndexed() : geometry);
  }

  /**
   * A box, centred at (x, y, z) — y is the *bottom* — rotated `ry` about Y.
   */
  box(key, x, y, z, w, h, d, { ry = 0, tile = 2, rx = 0, rz = 0 } = {}) {
    const g = new BoxGeometry(w, h, d);
    worldUV(g, w, h, d, tile);
    g.translate(0, h / 2, 0);
    if (rx || rz) g.applyMatrix4(_m.makeRotationFromEuler({ x: rx, y: 0, z: rz, order: 'XYZ', isEuler: true }));
    g.rotateY(ry);
    g.translate(x, y, z);
    this._add(key, g);
    return g;
  }

  /** A cylinder standing on (x, y, z). */
  cylinder(key, x, y, z, rTop, rBottom, h, { segments = 8, tile = 1, ry = 0 } = {}) {
    const g = new CylinderGeometry(rTop, rBottom, h, segments, 1, false);
    const uv = g.attributes.uv;
    const circumference = Math.PI * 2 * Math.max(rTop, rBottom);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circumference) / tile, (uv.getY(i) * h) / tile);
    g.translate(0, h / 2, 0);
    g.rotateY(ry);
    g.translate(x, y, z);
    this._add(key, g);
    return g;
  }

  /**
   * A gabled roof: two sloped slabs meeting at a ridge along the local X axis.
   * `w` along the ridge, `d` across it, `rise` from eave to ridge.
   */
  gable(key, x, y, z, w, d, rise, { ry = 0, thickness = 0.18, tile = 1.5 } = {}) {
    const half = d / 2;
    const slope = Math.hypot(half, rise);
    const angle = Math.atan2(rise, half);
    for (const side of [-1, 1]) {
      const g = new BoxGeometry(w, thickness, slope);
      worldUV(g, w, thickness, slope, tile);
      g.rotateX(-side * angle);
      g.translate(0, rise / 2, (-side * half) / 2);
      g.rotateY(ry);
      g.translate(x, y, z);
      this._add(key, g);
    }
    // Ridge cap.
    const ridge = new BoxGeometry(w + 0.1, 0.22, 0.3);
    worldUV(ridge, w, 0.22, 0.3, tile);
    ridge.translate(0, rise + 0.05, 0);
    ridge.rotateY(ry);
    ridge.translate(x, y, z);
    this._add(key, ridge);
  }

  /** A raw geometry, already placed. */
  geometry(key, g) {
    this._add(key, g);
  }

  /** Merge everything into one mesh per material. */
  build(materials, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [key, list] of this.parts) {
      const material = materials[key];
      if (!material || !list.length) continue;
      const geometry = mergeGeometries(list, false);
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = `Stage:${key}`;
      mesh.castShadow = castShadow && material.userData.castShadow !== false;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return meshes;
  }
}

/** Rescale a BoxGeometry's per-face 0..1 UVs to metres / `tile`. */
function worldUV(g, w, h, d, tile) {
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const dims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h]
  ];
  for (let face = 0; face < 6; face++) {
    const [a, b] = dims[face];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * a) / tile, (uv.getY(i) * b) / tile);
    }
  }
}

export { BufferGeometry, Float32BufferAttribute, _q, _s, _p, _up };
