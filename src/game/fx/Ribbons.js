import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';
import { LAYER } from '../../core/Layers.js';

const MAX_RIBBONS = 24;
const MAX_POINTS = 14;
const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const _side = new Vector3();
const _toCam = new Vector3();
const _c = new Color();

/**
 * Camera-facing strips through a list of points: lightning bolts, an archer's
 * aim line, a chain arc between two bodies. One mesh for all of them, rebuilt
 * each frame for the handful that are alive — far cheaper than a draw each.
 */
export class Ribbons {
  constructor(camera) {
    this.camera = camera;
    const verts = MAX_RIBBONS * MAX_POINTS * 2;
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 4);
    const index = [];
    for (let r = 0; r < MAX_RIBBONS; r++) {
      for (let i = 0; i < MAX_POINTS - 1; i++) {
        const a = (r * MAX_POINTS + i) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new BufferAttribute(this.colors, 4));
    geometry.setIndex(index);
    const material = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        varying vec4 vColor;
        void main() { vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() { if (vColor.a < 0.01) discard; gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = 11;
    /** @type {Array<{points: Vector3[], color: string, width: number, life: number, age: number, flicker: number}>} */
    this.items = [];
  }

  /** A jagged bolt from `from` to `to`. */
  bolt(from, to, { color = '#cfe0ff', width = 0.18, life = 0.28, segments = 10, jitter = 0.5 } = {}) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = new Vector3().lerpVectors(from, to, t);
      if (i > 0 && i < segments) {
        const j = jitter * Math.sin(t * Math.PI);
        p.x += (Math.random() - 0.5) * j * 2;
        p.y += (Math.random() - 0.5) * j;
        p.z += (Math.random() - 0.5) * j * 2;
      }
      points.push(p);
    }
    return this._add({ points, color, width, life, age: 0, flicker: 1 });
  }

  /** A straight line, alive until `life` runs out (refresh it to hold). */
  line(from, to, { color = '#ff3a1a', width = 0.04, life = 0.05 } = {}) {
    return this._add({ points: [from.clone(), to.clone()], color, width, life, age: 0, flicker: 0 });
  }

  _add(item) {
    if (this.items.length >= MAX_RIBBONS) this.items.shift();
    this.items.push(item);
    return item;
  }

  update(dt) {
    const camPos = this.camera.position;
    const positions = this.positions;
    const colors = this.colors;
    colors.fill(0);
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].age += dt;
      if (this.items[i].age >= this.items[i].life) this.items.splice(i, 1);
    }

    for (let r = 0; r < this.items.length; r++) {
      const item = this.items[r];
      const t = item.age / item.life;
      let alpha = 1 - t;
      if (item.flicker) alpha *= 0.55 + 0.45 * Math.sin(item.age * 90);
      _c.set(item.color);
      const count = Math.min(MAX_POINTS, item.points.length);
      for (let i = 0; i < MAX_POINTS; i++) {
        const k = Math.min(i, count - 1);
        _a.copy(item.points[k]);
        _b.copy(item.points[Math.min(k + 1, count - 1)]);
        if (k === count - 1) _b.copy(item.points[k]).add(_dir);
        else _dir.subVectors(_b, _a);
        _toCam.subVectors(camPos, _a);
        _side.crossVectors(_dir, _toCam).normalize().multiplyScalar(item.width * (item.flicker ? 1 - t * 0.5 : 1));
        const v = (r * MAX_POINTS + i) * 2;
        positions[v * 3] = _a.x - _side.x;
        positions[v * 3 + 1] = _a.y - _side.y;
        positions[v * 3 + 2] = _a.z - _side.z;
        positions[v * 3 + 3] = _a.x + _side.x;
        positions[v * 3 + 4] = _a.y + _side.y;
        positions[v * 3 + 5] = _a.z + _side.z;
        const a = i < count ? alpha : 0;
        for (const o of [0, 4]) {
          colors[v * 4 + o] = _c.r * 2;
          colors[v * 4 + o + 1] = _c.g * 2;
          colors[v * 4 + o + 2] = _c.b * 2;
          colors[v * 4 + o + 3] = a;
        }
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aColor.needsUpdate = true;
    this.mesh.visible = this.items.length > 0;
  }

  clear() {
    this.items.length = 0;
  }
}
