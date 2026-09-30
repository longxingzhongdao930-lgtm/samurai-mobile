import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial
} from 'three';

import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';

/** The three souls, as in the games that named them. */
export const SOUL = Object.freeze({ RED: 0, YELLOW: 1, BLUE: 2 });

export const SOUL_COLORS = [new Color('#ff3a24'), new Color('#ffcf3a'), new Color('#39a6ff')];

const FREE = 0;
const DRIFT = 1;
const HOMING = 2;

const VERTEX = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aColor; // rgb, size
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStretch;
  void main() {
    vUv = position.xy;
    vColor = aColor.rgb;
    vec4 mv = viewMatrix * vec4(aPos, 1.0);
    // Stretched along its own motion on screen, so a soul in flight is a streak.
    vec3 v = (viewMatrix * vec4(aVel, 0.0)).xyz;
    float speed = length(v.xy);
    vec2 dir = speed > 1e-3 ? v.xy / speed : vec2(0.0, 1.0);
    // Right-handed with the motion, so the quad keeps its winding.
    vec2 side = vec2(dir.y, -dir.x);
    float stretch = 1.0 + min(speed * 0.09, 2.5);
    vStretch = stretch;
    vec2 p = position.x * side + position.y * dir * stretch;
    mv.xy += p * aColor.a;
    gl_Position = aColor.a > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uExposure;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStretch;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * r * 4.0) * (0.75 + 0.25 * sin(uTime * 9.0 + vUv.y * 4.0));
    float a = core * 1.6 + halo * 0.7;
    vec3 c = mix(vColor, vec3(1.0), core);
    gl_FragColor = vec4(c * uIntensity / max(uExposure, 1e-3), a);
  }
`;

/**
 * 魂 — the souls a felled body gives up, and the pull that takes them in.
 *
 * Red souls are the currency of the upgrades (`ui/UpgradeMenu.js`), yellow ones
 * heal, blue ones fill the Musou gauge. They burst out of the body, hang in
 * the air bobbing for `linger` seconds, and are taken in when the player is
 * close (`autoRadius`) or holds the absorb key (`pullRadius`): they turn,
 * accelerate and stream into the chest, each one a glowing streak.
 *
 * Their flight is CPU-side (a few dozen at most, each a handful of flops) and
 * written into one instanced mesh per frame: one draw call, nothing allocated.
 */
export class Souls {
  constructor({ capacity = 96 } = {}) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.z = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.baseY = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.seed = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.state = new Uint8Array(capacity);

    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.aVel = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.aColor = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute('aPos', this.aPos);
    geometry.setAttribute('aVel', this.aVel);
    geometry.setAttribute('aColor', this.aColor);
    geometry.instanceCount = capacity;

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uTime: frame.uTime,
        uIntensity: { value: 1.8 },
        uExposure: frame.uExposure
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'Souls';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.raycast = () => {};
  }

  /** How many are out there right now. */
  get count() {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.state[i] !== FREE) n++;
    return n;
  }

  /**
   * Souls out of a body at (x, y, z).
   * @param {number[]} kinds one `SOUL` per soul
   */
  drop(x, y, z, kinds) {
    for (const kind of kinds) {
      const i = this._free();
      if (i < 0) return;
      const a = Math.random() * Math.PI * 2;
      const out = 1.2 + Math.random() * 1.8;
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.vx[i] = Math.sin(a) * out;
      this.vy[i] = 2.5 + Math.random() * 2;
      this.vz[i] = Math.cos(a) * out;
      this.baseY[i] = y;
      this.age[i] = 0;
      this.seed[i] = Math.random() * 10;
      this.kind[i] = kind;
      this.state[i] = DRIFT;
    }
  }

  /**
   * @param {number} dt
   * @param {{x: number, y: number, z: number}} target where they are taken in (the chest)
   * @param {boolean} pulling the absorb key is held
   * @param {object} config `settings.souls`
   * @param {(kind: number) => void} onCollect
   */
  update(dt, target, pulling, config, onCollect, collecting = true) {
    const reach = !collecting ? 0 : pulling ? config.pullRadius : config.autoRadius;
    const pos = this.aPos.array;
    const vel = this.aVel.array;
    const col = this.aColor.array;
    for (let i = 0; i < this.capacity; i++) {
      const st = this.state[i];
      if (st === FREE) {
        col[i * 4 + 3] = 0;
        continue;
      }
      this.age[i] += dt;
      const dx = target.x - this.x[i];
      const dy = target.y - this.y[i];
      const dz = target.z - this.z[i];
      const d = Math.hypot(dx, dy, dz);

      if (st === DRIFT) {
        // Out of the body on a burst, then braking to a hover and bobbing there.
        const drag = Math.exp(-3.2 * dt);
        this.vx[i] *= drag;
        this.vz[i] *= drag;
        this.vy[i] = this.vy[i] * drag - 1.5 * dt;
        const hover = this.baseY[i] + 0.9 + 0.15 * Math.sin(this.age[i] * 3 + this.seed[i]);
        if (this.age[i] > 0.5) this.vy[i] += (hover - this.y[i]) * 4 * dt;
        if (this.age[i] > config.linger) {
          this.state[i] = FREE;
          col[i * 4 + 3] = 0;
          continue;
        }
        // Reach is measured across the ground: a soul hangs above the chest.
        if (this.age[i] > 0.35 && Math.hypot(dx, dz) < reach) this.state[i] = HOMING;
      } else {
        // Homing: steer hard at the chest, faster the longer it has been pulled.
        const k = 1 / Math.max(d, 1e-3);
        const speed = Math.min(22, 6 + d * 3 + this.age[i] * 4);
        const steer = Math.min(1, 12 * dt);
        this.vx[i] += (dx * k * speed - this.vx[i]) * steer;
        this.vy[i] += (dy * k * speed - this.vy[i]) * steer;
        this.vz[i] += (dz * k * speed - this.vz[i]) * steer;
        if (d < 0.4) {
          this.state[i] = FREE;
          col[i * 4 + 3] = 0;
          onCollect(this.kind[i]);
          continue;
        }
      }
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;

      pos[i * 3] = this.x[i];
      pos[i * 3 + 1] = this.y[i];
      pos[i * 3 + 2] = this.z[i];
      vel[i * 3] = this.vx[i];
      vel[i * 3 + 1] = this.vy[i];
      vel[i * 3 + 2] = this.vz[i];
      const c = SOUL_COLORS[this.kind[i]];
      // The last second of a lingering soul gutters out.
      const fade = st === DRIFT ? Math.min(1, (config.linger - this.age[i]) / 1) : 1;
      col[i * 4] = c.r;
      col[i * 4 + 1] = c.g;
      col[i * 4 + 2] = c.b;
      col[i * 4 + 3] = config.size * Math.max(0.2, fade) * (this.kind[i] === SOUL.RED ? 1 : 1.25);
    }
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }

  clear() {
    this.state.fill(FREE);
    this.aColor.array.fill(0);
    this.aColor.needsUpdate = true;
  }

  _free() {
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === FREE) return i;
    return -1;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
