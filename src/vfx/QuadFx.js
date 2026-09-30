import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  ShaderMaterial
} from 'three';

import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';

/** pos(3) axis(3) color(3) born life size kind seed aux pad — one quad, one stride. */
const STRIDE = 16;

/** What a quad is. Each is a closed form of its age, evaluated on the GPU. */
export const FX = Object.freeze({
  /** A camera-facing star: the parry's flash, a collected soul's pop. */
  FLARE: 0,
  /** A streak of light along a line: the 居合 (iai) cut. */
  SLASH: 1,
  /** A ring racing out across the ground. */
  RING: 2,
  /** A warning disc on the ground that fills, then flashes — a boss's tell. */
  OMEN: 3,
  /** A soft blob drifting along `axis`, growing and fading: 妖気 (miasma). */
  PUFF: 4,
  /** A small, sharp star that blinks once: an enemy's eye as it winds up. */
  GLINT: 5,
  /** A crescent of edge thrown across the ground from `pos` along `axis`: 飛燕. */
  CRESCENT: 6,
  /** A column of light standing up out of the ground: the execution's pillar. */
  PILLAR: 7
});

const VERTEX = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aAxis;
  attribute vec3 aColor;
  attribute float aBorn;
  attribute float aLife;
  attribute float aSize;
  attribute float aKind;
  attribute float aSeed;
  attribute float aAux;

  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vT;
  varying float vKind;
  varying float vSeed;

  void main() {
    float t = (uTime - aBorn) / aLife;
    vUv = position.xy;
    vColor = aColor;
    vT = t;
    vKind = aKind;
    vSeed = aSeed;
    // Not born yet, or spent: off the clip volume, rasterises nothing.
    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    int kind = int(aKind + 0.5);
    vec4 mv;
    if (kind == 0 || kind == 5) {
      // Billboards, built in view space, turning slowly.
      float grow = kind == 0 ? 0.35 + 0.9 * sqrt(t) : 0.5 + 0.7 * sin(3.14159 * t);
      float a = aSeed * 6.2832 + t * (kind == 5 ? 1.2 : 0.5);
      vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
      mv = viewMatrix * vec4(aPos, 1.0);
      mv.xy += p * aSize * grow;
    } else if (kind == 1) {
      // A strip along the cut, turned to face the camera about its own axis.
      vec3 axis = normalize(aAxis);
      vec3 side = normalize(cross(axis, normalize(cameraPosition - aPos)));
      float width = aAux * (1.0 - 0.75 * t);
      vec3 wp = aPos + axis * position.x * aSize * 0.5 + side * position.y * width;
      mv = viewMatrix * vec4(wp, 1.0);
    } else if (kind == 6) {
      // Flying the whole of its travel in the first 85% of its life, then
      // opening where it lands. The quad lies across the path, rolled by aAux.
      float s = clamp(t / 0.85, 0.0, 1.0);
      vec3 travel = aAxis;
      vec3 f = normalize(vec3(travel.x, 0.0, travel.z) + vec3(0.0, 0.0, 1e-4));
      vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
      vec3 u = cross(r, f);
      vec3 rr = r * cos(aAux) + u * sin(aAux);
      float open = 1.0 + 0.6 * smoothstep(0.85, 1.0, t);
      vec3 wp = aPos + travel * s + rr * position.x * aSize * open + f * position.y * aSize * 0.55;
      mv = viewMatrix * vec4(wp, 1.0);
    } else if (kind == 7) {
      // Turned to the lens about the vertical only: smoke and light have an up.
      vec3 toCam = cameraPosition - aPos;
      vec3 side = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
      float rise = smoothstep(0.0, 0.18, t);
      vec3 wp = aPos + side * position.x * aSize * (1.0 - 0.5 * t) + vec3(0.0, (position.y * 0.5 + 0.5) * aAux * rise, 0.0);
      mv = viewMatrix * vec4(wp, 1.0);
    } else if (kind == 2 || kind == 3) {
      // Flat on the ground; a ring grows, an omen holds its size.
      float r = aSize * (kind == 2 ? 0.2 + 0.8 * sqrt(t) : 1.0);
      mv = viewMatrix * vec4(aPos + vec3(position.x * r, 0.0, position.y * r), 1.0);
    } else {
      // A puff drifting along its axis with a slow sway, swelling as it goes.
      float age = t * aLife;
      vec3 sway = vec3(sin(aSeed * 40.0 + age * 2.1), 0.0, cos(aSeed * 23.0 + age * 1.7)) * 0.1 * age;
      mv = viewMatrix * vec4(aPos + aAxis * age + sway, 1.0);
      mv.xy += position.xy * aSize * (0.55 + 0.9 * t);
    }
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uExposure;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vT;
  varying float vKind;
  varying float vSeed;

  void main() {
    int kind = int(vKind + 0.5);
    vec2 p = vUv;
    float r = length(p);
    float a = 0.0;
    vec3 c = vColor;

    if (kind == 0) {
      // Flare: a white core, four long spikes and four short, and a ring.
      float ang = atan(p.y, p.x);
      float core = exp(-r * r * 60.0);
      float spikes = pow(abs(cos(ang * 2.0)), 40.0) * exp(-r * 3.2)
                   + 0.45 * pow(abs(cos(ang * 2.0 + 0.785)), 64.0) * exp(-r * 5.0);
      float ring = 0.5 * exp(-pow((r - 0.25 - 0.6 * vT) * 16.0, 2.0));
      float fade = (1.0 - vT) * (1.0 - vT);
      a = (1.4 * core + 1.2 * spikes + ring) * fade;
      c = mix(c, vec3(1.0), clamp(core * 1.4, 0.0, 1.0));
    } else if (kind == 5) {
      float ang = atan(p.y, p.x);
      float spikes = pow(abs(cos(ang * 2.0)), 70.0) * exp(-r * 2.2);
      float core = exp(-r * r * 45.0);
      a = (1.5 * spikes + 1.6 * core) * sin(3.14159 * vT);
      c = mix(c, vec3(1.0), core);
    } else if (kind == 1) {
      // Iai: the light runs down the line in the first fifth of its life,
      // stays white-hot at the core, then thins away.
      float head = -1.0 + 2.3 * smoothstep(0.0, 0.2, vT);
      float drawn = smoothstep(head + 0.02, head - 0.12, p.x);
      float across = exp(-p.y * p.y * 9.0);
      float taper = 1.0 - p.x * p.x;
      float fade = 1.0 - smoothstep(0.25, 1.0, vT);
      float core = exp(-p.y * p.y * 60.0);
      a = drawn * across * taper * fade * 1.6;
      c = mix(c, vec3(1.0), core);
    } else if (kind == 2) {
      if (r > 1.0) discard;
      a = exp(-pow((r - 0.86) * 11.0, 2.0)) * (1.0 - vT) * 1.2;
    } else if (kind == 3) {
      // Omen: a trembling rim, a fill creeping out to it, and a flash as it lands.
      if (r > 1.0) discard;
      float rim = exp(-pow((r - 0.94) * 18.0, 2.0)) * (0.65 + 0.35 * sin(uTime * 22.0));
      float fill = smoothstep(vT + 0.02, vT - 0.04, r) * 0.2;
      float marks = step(0.93, fract(atan(p.y, p.x) * 1.9099 + uTime * 0.4)) * step(0.72, r) * step(r, 0.9) * 0.4;
      float flash = smoothstep(0.86, 0.94, vT) * (1.0 - smoothstep(0.94, 1.0, vT)) * 0.9;
      a = rim + fill + marks + flash * (1.0 - r * 0.4);
      a *= smoothstep(0.0, 0.08, vT);
    } else if (kind == 6) {
      // Crescent: a band of a circle bowed forward, thinning to its tips.
      float d = abs(length(p - vec2(0.0, -1.1)) - 1.45);
      float tip = 1.0 - p.x * p.x;
      float w = 0.16 * tip + 0.01;
      float band = smoothstep(w, 0.0, d) * tip;
      float core = smoothstep(w * 0.35, 0.0, d) * tip;
      float fade = 1.0 - smoothstep(0.85, 1.0, vT);
      a = (band * 1.1 + core) * fade;
      c = mix(c, vec3(1.0), core);
    } else if (kind == 7) {
      // Pillar: bright spine, soft sides, burning away from the top down.
      float y = p.y * 0.5 + 0.5;
      float across = exp(-p.x * p.x * 7.0);
      float spine = exp(-p.x * p.x * 60.0);
      float top = 1.0 - smoothstep(0.55 - 0.45 * vT, 1.0, y);
      float streak = 0.75 + 0.25 * sin(p.y * 18.0 - uTime * 14.0 + vSeed * 10.0);
      a = (across * 0.7 + spine) * top * streak * (1.0 - vT);
      c = mix(c, vec3(1.0), spine * 0.7);
    } else {
      // Puff: soft, with a darker heart so a cloud of them reads as smoke.
      // Round and soft to the very edge, so a crowd of them never shows a quad.
      float blob = exp(-r * r * 4.0) * smoothstep(1.0, 0.55, r);
      float wisp = 0.6 + 0.4 * sin(vSeed * 30.0 + p.x * 5.0 + p.y * 3.0 + uTime * 2.0);
      a = blob * wisp * sin(3.14159 * vT) * 0.5;
    }

    if (a < 0.003) discard;
    gl_FragColor = vec4(c * uIntensity / max(uExposure, 1e-3), a);
  }
`;

/**
 * A pool of short-lived light: flashes, cuts, rings, warnings and wisps.
 *
 * The same machinery `BladeImpact` uses, and the one the reference VFX
 * systems are built on (a fixed-capacity pool, every particle a closed form
 * of its age on the GPU): the CPU only ever *births* a quad — sixteen floats
 * written once into a ring buffer — and the shader animates it from the
 * shared clock. One mesh, one draw call, nothing allocated per frame, so it
 * costs a phone the same whether it is idle or busy.
 *
 * Two pools use it: the flashes (`App.fx`) and the miasma (`App.miasma`),
 * separate only so a crowd's aura can never push a parry flash out of the
 * ring.
 */
export class QuadFx {
  /**
   * @param {object} [options]
   * @param {number} [options.capacity]
   * @param {number} [options.intensity] HDR multiplier on every colour
   * @param {string} [options.name]
   */
  constructor({ capacity = 96, intensity = 2.4, name = 'QuadFx' } = {}) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * STRIDE);
    this.buffer = new InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buffer.setUsage(DynamicDrawUsage);

    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (name, size, offset) =>
      geometry.setAttribute(name, new InterleavedBufferAttribute(this.buffer, size, offset));
    attr('aPos', 3, 0);
    attr('aAxis', 3, 3);
    attr('aColor', 3, 6);
    attr('aBorn', 1, 9);
    attr('aLife', 1, 10);
    attr('aSize', 1, 11);
    attr('aKind', 1, 12);
    attr('aSeed', 1, 13);
    attr('aAux', 1, 14);
    geometry.instanceCount = 0;

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Ground quads face down and a cut's strip turns with the view: no culling.
      side: DoubleSide,
      blending: AdditiveBlending,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uExposure: frame.uExposure
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.raycast = () => {};

    this._head = 0;
    this._written = 0;
    this._clock = 0;
  }

  /** The simulation clock, before anything is born this frame. */
  sync(time, intensity) {
    this._clock = time;
    this.material.uniforms.uTime.value = time;
    if (intensity !== undefined) this.material.uniforms.uIntensity.value = intensity;
  }

  /* ---- the kinds ---- */

  flare(x, y, z, color, size = 1, life = 0.3) {
    this._write(x, y, z, 0, 0, 0, color, life, size, FX.FLARE, 0);
  }

  glint(x, y, z, color, size = 0.35, life = 0.35) {
    this._write(x, y, z, 0, 0, 0, color, life, size, FX.GLINT, 0);
  }

  /** A cut of light `length` long through (x, y, z) along (ax, ay, az). */
  slash(x, y, z, ax, ay, az, color, length = 4, width = 0.12, life = 0.45) {
    this._write(x, y, z, ax, ay, az, color, life, length, FX.SLASH, width);
  }

  ring(x, y, z, color, radius = 1.5, life = 0.45) {
    this._write(x, y + 0.04, z, 0, 0, 0, color, life, radius, FX.RING, 0);
  }

  /** A warning `radius` wide that fills for `time` seconds and lands. */
  omen(x, y, z, color, radius = 3, time = 1.2) {
    this._write(x, y + 0.05, z, 0, 0, 0, color, time, radius, FX.OMEN, 0);
  }

  /** 飛燕: a crescent `radius` wide flying from (x, y, z) to (tx, ty, tz) in `time`. */
  crescent(x, y, z, tx, ty, tz, color, radius = 1.3, time = 0.4, roll = 0.35) {
    this._write(x, y, z, tx - x, ty - y, tz - z, color, time / 0.85, radius, FX.CRESCENT, roll);
  }

  /** A column `height` tall and `width` wide standing up out of (x, y, z). */
  pillar(x, y, z, color, width = 0.9, height = 5, life = 0.8) {
    this._write(x, y, z, 0, 0, 0, color, life, width, FX.PILLAR, height);
  }

  puff(x, y, z, vx, vy, vz, color, size = 0.4, life = 1.4) {
    this._write(x, y, z, vx, vy, vz, color, life, size, FX.PUFF, 0);
  }

  /* ------------------------------------------------------------------ */

  _write(px, py, pz, ax, ay, az, color, life, size, kind, aux) {
    const d = this.data;
    const o = this._head * STRIDE;
    d[o] = px;
    d[o + 1] = py;
    d[o + 2] = pz;
    d[o + 3] = ax;
    d[o + 4] = ay;
    d[o + 5] = az;
    d[o + 6] = color.r;
    d[o + 7] = color.g;
    d[o + 8] = color.b;
    d[o + 9] = this._clock;
    d[o + 10] = Math.max(0.02, life);
    d[o + 11] = Math.max(0.001, size);
    d[o + 12] = kind;
    d[o + 13] = Math.random();
    d[o + 14] = aux;
    this._head = (this._head + 1) % this.capacity;
    if (this._written < this.capacity) this._written++;
    this.mesh.geometry.instanceCount = this._written;
    this.buffer.needsUpdate = true;
  }

  clear() {
    this.data.fill(0);
    this._head = 0;
    this._written = 0;
    this.mesh.geometry.instanceCount = 0;
    this.buffer.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
