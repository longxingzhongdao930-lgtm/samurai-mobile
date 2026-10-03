import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three';
import { LAYER } from '../../core/Layers.js';

const _c = new Color();

/**
 * Soft additive glows: telegraph glints, spell cores, embers, flashes.
 *
 * One `Points` draw for every glow in the scene. A glow is either fire-and-
 * forget (`spawn`: it lives, grows, drifts and fades on its own) or held
 * (`hold` returns an index the owner moves each frame — how a projectile is
 * drawn). Sizes are in world metres and scale with distance like geometry.
 */
export class GlowPool {
  constructor(capacity = 512) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    /** Per slot: life, age, velocity, growth, held flag. */
    this.life = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.grow = new Float32Array(capacity);
    this.base = new Float32Array(capacity);
    this.held = new Uint8Array(capacity);
    this.gravity = new Float32Array(capacity);
    this._next = 0;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new BufferAttribute(this.color, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    geometry.setAttribute('aShape', new BufferAttribute(this.shape, 1));

    this.material = new ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uClarity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aShape;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vShape = aShape;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aAlpha > 0.001 ? aSize * uScale / max(0.1, -mv.z) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uClarity;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = length(p);
          float core = exp(-r * r * 6.0);
          float halo = exp(-r * 2.6) * 0.5;
          float g = core + halo * uClarity;
          // Shape 1: a four-point star — the glint a blade throws before it swings.
          if (vShape > 0.5) {
            float star = max(exp(-abs(p.x) * 18.0) * exp(-abs(p.y) * 2.0), exp(-abs(p.y) * 18.0) * exp(-abs(p.x) * 2.0));
            g = core * 0.8 + star * 1.4;
          }
          float a = g * vAlpha * (1.0 - smoothstep(0.85, 1.0, r));
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });

    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.layers.set(LAYER.WORLD);
    this.points.renderOrder = 12;
  }

  _slot() {
    for (let n = 0; n < this.capacity; n++) {
      const i = (this._next + n) % this.capacity;
      if (!this.held[i] && this.age[i] >= this.life[i]) {
        this._next = (i + 1) % this.capacity;
        return i;
      }
    }
    // Pool full: overwrite the next non-held slot.
    const i = this._next;
    this._next = (i + 1) % this.capacity;
    return i;
  }

  /**
   * @param {{x:number,y:number,z:number}} p
   * @param {string|number} color
   */
  spawn(p, color, size, life, { vx = 0, vy = 0, vz = 0, grow = 0, star = false, gravity = 0, intensity = 1 } = {}) {
    const i = this._slot();
    this.held[i] = 0;
    this._write(i, p.x, p.y, p.z, color, intensity);
    this.base[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.age[i] = 0;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
    this.shape[i] = star ? 1 : 0;
    this.alpha[i] = 1;
    return i;
  }

  /** A glow the caller moves itself; release with `free`. */
  hold(color, size, { star = false, intensity = 1 } = {}) {
    const i = this._slot();
    this.held[i] = 1;
    this._write(i, 0, -999, 0, color, intensity);
    this.size[i] = size;
    this.base[i] = size;
    this.alpha[i] = 1;
    this.shape[i] = star ? 1 : 0;
    this.life[i] = 1e9;
    this.age[i] = 0;
    return i;
  }

  move(i, x, y, z, size = null) {
    this.position[i * 3] = x;
    this.position[i * 3 + 1] = y;
    this.position[i * 3 + 2] = z;
    if (size !== null) this.size[i] = size;
  }

  free(i) {
    this.held[i] = 0;
    this.alpha[i] = 0;
    this.life[i] = 0;
    this.age[i] = 1;
  }

  _write(i, x, y, z, color, intensity) {
    _c.set(color).multiplyScalar(intensity);
    this.position[i * 3] = x;
    this.position[i * 3 + 1] = y;
    this.position[i * 3 + 2] = z;
    this.color[i * 3] = _c.r;
    this.color[i * 3 + 1] = _c.g;
    this.color[i * 3 + 2] = _c.b;
  }

  /** Spray `count` small glows out of a point — sparks, embers, shards. */
  burst(p, color, count, { speed = 4, size = 0.08, life = 0.5, up = 1.5, gravity = -6, spread = 1 } = {}) {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(p, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), {
        vx: Math.cos(a) * s * spread,
        vz: Math.sin(a) * s * spread,
        vy: up * (0.3 + Math.random()) + (Math.random() - 0.3) * s * 0.4,
        gravity
      });
    }
  }

  update(dt, pixelHeight) {
    this.material.uniforms.uScale.value = pixelHeight * 0.9;
    for (let i = 0; i < this.capacity; i++) {
      if (this.held[i]) continue;
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      this.vel[i * 3 + 1] += this.gravity[i] * dt;
      const drag = 1 - Math.min(1, dt * 2.2);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.position[i * 3] += this.vel[i * 3] * dt;
      this.position[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.position[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.base[i] * (1 + this.grow[i] * t);
      this.alpha[i] = (1 - t) * (1 - t * 0.3);
    }
    const attributes = this.points.geometry.attributes;
    attributes.position.needsUpdate = true;
    attributes.color.needsUpdate = true;
    attributes.aSize.needsUpdate = true;
    attributes.aAlpha.needsUpdate = true;
    attributes.aShape.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.held[i] = 0;
      this.age[i] = this.life[i] = 0;
      this.alpha[i] = 0;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
