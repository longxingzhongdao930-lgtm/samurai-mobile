import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  Vector3
} from 'three';

import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { copyColor, makeColor } from '../utils/color.js';

const VERTEX = /* glsl */ `
  attribute float aAge;
  attribute float aSide;
  varying float vAge;
  varying float vSide;
  void main() {
    vAge = aAge;
    vSide = aSide;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uExposure;
  varying float vAge;
  varying float vSide;
  void main() {
    float life = clamp(1.0 - vAge, 0.0, 1.0);
    // Brightest along the edge of the blade and at the leading end.
    // Thin toward the hilt, a bright lip along the edge's path.
    float edge = pow(vSide, 1.6);
    float lip = smoothstep(0.82, 1.0, vSide);
    float a = pow(life, 2.2) * (0.55 * edge + 0.9 * lip) * uOpacity;
    if (a < 0.003) discard;
    vec3 c = mix(uEdge, uCore, pow(life, 3.0) * edge);
    gl_FragColor = vec4(c * uIntensity / max(uExposure, 1e-3), a);
  }
`;

const _a = new Vector3();
const _b = new Vector3();

/**
 * 残光 — the afterimage the katana leaves in the air as it cuts.
 *
 * A ribbon between the blade's two ends, sampled every frame with the time it
 * was taken (the socket-following trail the reference VFX systems build: a
 * fixed-capacity history of one moving segment). Each sample's age is its
 * *time* over `life`, not its index, so the trail is the same length at 30
 * fps as at 120. Between samples it is smoothed with a Catmull-Rom curve, so a
 * phone that only saw six frames of a swing still draws an arc rather than a
 * fan of straight blades.
 *
 * One small dynamic mesh — at most a few hundred floats a frame — and one
 * additive draw call. It only draws while a swing is live and a moment after.
 */
export class SwordTrail {
  /**
   * @param {object} [options]
   * @param {number} [options.samples] history length
   * @param {number} [options.subdivisions] curve points between two samples
   */
  constructor({ samples = 14, subdivisions = 3 } = {}) {
    this.samples = Math.max(3, samples);
    this.subdivisions = Math.max(1, subdivisions);
    this.columns = (this.samples - 1) * this.subdivisions + 1;

    this._base = Array.from({ length: this.samples }, () => new Vector3());
    this._tip = Array.from({ length: this.samples }, () => new Vector3());
    this._time = new Float32Array(this.samples).fill(-Infinity);
    this._count = 0;
    this._fade = 0;

    const geometry = new BufferGeometry();
    this.positions = new Float32Array(this.columns * 2 * 3);
    this.ages = new Float32Array(this.columns * 2).fill(1);
    const sides = new Float32Array(this.columns * 2);
    for (let i = 0; i < this.columns; i++) {
      sides[i * 2] = 0;
      sides[i * 2 + 1] = 1;
    }
    const index = [];
    for (let i = 0; i < this.columns - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    this.positionAttr = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    this.ageAttr = new BufferAttribute(this.ages, 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttr);
    geometry.setAttribute('aAge', this.ageAttr);
    geometry.setAttribute('aSide', new BufferAttribute(sides, 1));

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uCore: { value: makeColor('#f4fbff') },
        uEdge: { value: makeColor('#6fb8ff') },
        uIntensity: { value: 1.6 },
        uOpacity: { value: 0.9 },
        uExposure: frame.uExposure
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'SwordTrail';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  /**
   * @param {number} dt
   * @param {number} time the simulation clock
   * @param {boolean} active a swing is live
   * @param {Vector3|null} base one end of the blade, world
   * @param {Vector3|null} tip the other
   * @param {object} config `settings.vfx.trail`
   */
  update(dt, time, active, base, tip, config) {
    const u = this.material.uniforms;
    copyColor(u.uCore.value, config.core);
    copyColor(u.uEdge.value, config.edge);
    u.uIntensity.value = config.intensity;
    u.uOpacity.value = config.opacity;

    // Paused (or frozen in a hit-stop at zero): hold the trail as it is.
    if (dt <= 0) return;
    const want = config.enabled && active && base && tip ? 1 : 0;
    // Quick to light, a little slower to let go, so the last cut is seen out.
    const rate = want ? 30 : 7;
    this._fade += (want - this._fade) * Math.min(1, rate * dt);
    if (!base || !tip || this._fade < 0.01) {
      this.mesh.visible = false;
      this._count = 0;
      return;
    }

    // Newest at 0.
    for (let i = this.samples - 1; i > 0; i--) {
      this._base[i].copy(this._base[i - 1]);
      this._tip[i].copy(this._tip[i - 1]);
      this._time[i] = this._time[i - 1];
    }
    // Lengthen the blade a touch toward the tip so the light leads the steel.
    _a.copy(base);
    _b.copy(tip).sub(base).multiplyScalar(config.reach).add(base);
    this._base[0].copy(_a);
    this._tip[0].copy(_b);
    this._time[0] = time;
    this._count = Math.min(this.samples, this._count + 1);
    if (this._count < 2) {
      this.mesh.visible = false;
      return;
    }

    const life = Math.max(0.02, config.life);
    const n = this._count;
    const sub = this.subdivisions;
    let column = 0;
    for (let i = 0; i < n - 1 && column < this.columns; i++) {
      for (let s = 0; s < sub && column < this.columns; s++) {
        const t = s / sub;
        catmull(this._base, i, n, t, _a);
        catmull(this._tip, i, n, t, _b);
        const age = (time - (this._time[i] + (this._time[i + 1] - this._time[i]) * t)) / life;
        this._put(column++, _a, _b, age + (1 - this._fade));
      }
    }
    // The last column at the oldest sample, then collapse the unused tail onto it.
    if (column < this.columns) this._put(column++, this._base[n - 1], this._tip[n - 1], (time - this._time[n - 1]) / life + (1 - this._fade));
    const lastBase = this._base[n - 1];
    const lastTip = this._tip[n - 1];
    while (column < this.columns) this._put(column++, lastBase, lastTip, 2);

    this.positionAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.mesh.visible = true;
  }

  _put(column, a, b, age) {
    const o = column * 6;
    const p = this.positions;
    p[o] = a.x;
    p[o + 1] = a.y;
    p[o + 2] = a.z;
    p[o + 3] = b.x;
    p[o + 4] = b.y;
    p[o + 5] = b.z;
    this.ages[column * 2] = age;
    this.ages[column * 2 + 1] = age;
  }

  clear() {
    this._count = 0;
    this._fade = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

/** Catmull-Rom between points i and i+1 of `list` (clamped at the ends). */
function catmull(list, i, n, t, out) {
  const p0 = list[Math.max(0, i - 1)];
  const p1 = list[i];
  const p2 = list[Math.min(n - 1, i + 1)];
  const p3 = list[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  for (const k of ['x', 'y', 'z']) {
    out[k] =
      0.5 *
      (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}
