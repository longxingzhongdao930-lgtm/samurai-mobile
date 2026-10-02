import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  NormalBlending,
  Points,
  ShaderMaterial
} from 'three';
import { LAYER } from '../../core/Layers.js';

/**
 * Rain and its splashes, with no per-frame CPU work beyond two uniforms.
 *
 * Each streak is a line whose fall is closed-form in the vertex shader: a
 * phase, a speed and a wrap inside a box that travels with the camera, so a
 * drop is never "spawned" — the box just slides over a field that is already
 * falling everywhere. Splashes are points on the ground on the same principle,
 * each blooming and fading once per cycle at a hashed spot.
 */
export class Rain {
  constructor(count = 2000) {
    const box = 26;
    this.box = box;

    const positions = new Float32Array(count * 2 * 3);
    const seeds = new Float32Array(count * 2 * 4);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * box;
      const z = (Math.random() - 0.5) * box;
      const phase = Math.random();
      const speed = 0.85 + Math.random() * 0.3;
      for (let e = 0; e < 2; e++) {
        const v = i * 2 + e;
        positions[v * 3] = x;
        positions[v * 3 + 1] = e; // 0 = head, 1 = tail
        positions[v * 3 + 2] = z;
        seeds[v * 4] = phase;
        seeds[v * 4 + 1] = speed;
        seeds[v * 4 + 2] = Math.random();
        seeds[v * 4 + 3] = e;
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));

    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new Color() }, // xyz of the box centre
      uBox: { value: box },
      uHeight: { value: 14 },
      uSpeed: { value: 15 },
      uWind: { value: 1.2 },
      uColor: { value: new Color('#9fb4cc') },
      uOpacity: { value: 0.32 },
      uFlash: { value: 0 }
    };

    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform float uBox;
        uniform float uHeight;
        uniform float uSpeed;
        uniform float uWind;
        varying float vFade;
        varying float vTail;
        void main() {
          // Wrap this streak's column into the box around the camera.
          vec2 col = position.xz;
          vec2 rel = mod(col - uCenter.xz + uBox * 0.5, uBox) - uBox * 0.5;
          float fall = fract(aSeed.x - uTime * uSpeed * aSeed.y / uHeight);
          float y = uCenter.y - 3.0 + fall * uHeight;
          float len = 0.55 + aSeed.z * 0.4;
          vec3 p = vec3(uCenter.x + rel.x, y, uCenter.z + rel.y);
          // The tail trails up and back along the wind.
          p += aSeed.w * vec3(uWind * 0.04, len, uWind * 0.02);
          vTail = aSeed.w;
          vFade = smoothstep(uBox * 0.5, uBox * 0.3, length(rel));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uFlash;
        varying float vFade;
        varying float vTail;
        void main() {
          float a = uOpacity * vFade * mix(1.0, 0.15, vTail) * (1.0 + uFlash * 2.0);
          gl_FragColor = vec4(uColor * (1.0 + uFlash * 3.0), a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending
    });

    this.lines = new LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.layers.set(LAYER.WORLD);
    this.lines.renderOrder = 9;

    // Splashes.
    const splashCount = Math.floor(count * 0.35);
    const sp = new Float32Array(splashCount * 3);
    const ss = new Float32Array(splashCount);
    for (let i = 0; i < splashCount; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 18;
      sp[i * 3 + 1] = 0;
      sp[i * 3 + 2] = (Math.random() - 0.5) * 18;
      ss[i] = Math.random();
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new BufferAttribute(ss, 1));
    this.splashMaterial = new ShaderMaterial({
      uniforms: { ...this.uniforms, uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform float uScale;
        varying float vLife;
        void main() {
          float t = fract(uTime * (1.6 + aSeed) + aSeed * 13.0);
          vLife = t;
          vec2 rel = mod(position.xz - uCenter.xz + 9.0, 18.0) - 9.0;
          // A new spot every cycle, so the pattern never visibly repeats.
          float cycle = floor(uTime * (1.6 + aSeed) + aSeed * 13.0);
          rel += vec2(fract(sin(cycle * 12.9898 + aSeed * 78.2) * 437.5), fract(sin(cycle * 39.3 + aSeed * 11.1) * 851.7)) * 2.0 - 1.0;
          vec4 mv = modelViewMatrix * vec4(uCenter.x + rel.x, uCenter.y - 3.0 + 0.03, uCenter.z + rel.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.12 + t * 0.22) * uScale / max(0.5, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vLife;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          p.y *= 2.6;
          float r = length(p);
          float ring = smoothstep(0.75, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
          float a = ring * (1.0 - vLife) * 0.55;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    this.splashes = new Points(sg, this.splashMaterial);
    this.splashes.frustumCulled = false;
    this.splashes.layers.set(LAYER.WORLD);
  }

  update(time, camera, groundY, flash, pixelHeight) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCenter.value.setRGB(camera.position.x, groundY + 3, camera.position.z);
    this.uniforms.uFlash.value = flash;
    this.splashMaterial.uniforms.uScale.value = pixelHeight * 0.9;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
    this.splashes.geometry.dispose();
    this.splashMaterial.dispose();
  }
}
