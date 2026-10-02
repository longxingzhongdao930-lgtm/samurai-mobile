import {
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector3
} from 'three';
import { LAYER } from '../../core/Layers.js';

const SAMPLES = 40;
const _base = new Vector3();
const _tip = new Vector3();
const _inv = new Matrix4();
const _box = new Box3();

/**
 * The arc a blade leaves in the air.
 *
 * A ribbon between two points on the equipped katana (a third of the way up
 * the blade, and the tip), recorded every frame while a swing is live and
 * faded by age. Frames are subdivided so a fast cut at 30 fps still draws a
 * curve rather than a fan of straight strips. One draw call, additive, no
 * textures — the gradient is all in the shader.
 */
export class SlashTrail {
  constructor() {
    this.positions = new Float32Array(SAMPLES * 2 * 3);
    this.ages = new Float32Array(SAMPLES * 2);
    this.sides = new Float32Array(SAMPLES * 2);
    for (let i = 0; i < SAMPLES; i++) {
      this.sides[i * 2] = 0;
      this.sides[i * 2 + 1] = 1;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAge', new BufferAttribute(this.ages, 1));
    geometry.setAttribute('aSide', new BufferAttribute(this.sides, 1));
    const index = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);

    this.material = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#ffb36a') },
        uCore: { value: new Color('#fff6e8') },
        uLife: { value: 0.16 },
        uStrength: { value: 1 }
      },
      vertexShader: /* glsl */ `
        attribute float aAge;
        attribute float aSide;
        varying float vAge;
        varying float vSide;
        void main() {
          vAge = aAge;
          vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uCore;
        uniform float uLife;
        uniform float uStrength;
        varying float vAge;
        varying float vSide;
        void main() {
          float t = clamp(vAge / uLife, 0.0, 1.0);
          float fade = (1.0 - t) * (1.0 - t);
          // Hot at the edge the blade is on, thinning toward the inner side.
          float edge = smoothstep(0.0, 1.0, vSide);
          float a = fade * mix(0.15, 1.0, edge) * uStrength;
          vec3 col = mix(uColor, uCore, edge * (1.0 - t));
          if (a < 0.01) discard;
          gl_FragColor = vec4(col * a * 1.6, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER.WORLD);
    this.mesh.renderOrder = 10;

    this.count = 0;
    this.active = false;
    this.strength = 1;
    this._last = null;
    this._blade = null; // { object, a: Vector3, b: Vector3 } in the model's local space
    for (let i = 0; i < this.ages.length; i++) this.ages[i] = 99;
  }

  /** Measure the blade once: its long axis, grip end to tip, in local space. */
  bind(object, handWorld) {
    object.updateWorldMatrix(true, true);
    _inv.copy(object.matrixWorld).invert();
    _box.makeEmpty();
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.computeBoundingBox();
      const b = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld).applyMatrix4(_inv);
      _box.union(b);
    });
    const size = _box.getSize(new Vector3());
    const axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : size.y > size.z ? 'y' : 'z';
    const low = _box.getCenter(new Vector3());
    const high = low.clone();
    low[axis] = _box.min[axis];
    high[axis] = _box.max[axis];
    // The grip is the end nearer the hand.
    const localHand = handWorld.clone().applyMatrix4(_inv);
    const gripIsLow = low.distanceTo(localHand) < high.distanceTo(localHand);
    const grip = gripIsLow ? low : high;
    const tip = gripIsLow ? high : low;
    this._blade = { object, a: grip.clone().lerp(tip, 0.3), b: tip };
  }

  setColor(color, core = '#fff6e8') {
    this.material.uniforms.uColor.value.set(color);
    this.material.uniforms.uCore.value.set(core);
  }

  begin(strength = 1) {
    if (strength <= 0) {
      this.end();
      return;
    }
    this.active = true;
    this.strength = strength;
    this._last = null;
  }

  end() {
    this.active = false;
  }

  update(dt) {
    const ages = this.ages;
    for (let i = 0; i < ages.length; i++) ages[i] += dt;

    if (this.active && this._blade) {
      const { object, a, b } = this._blade;
      _base.copy(a).applyMatrix4(object.matrixWorld);
      _tip.copy(b).applyMatrix4(object.matrixWorld);
      const last = this._last;
      if (last) {
        const steps = 3;
        for (let s = 1; s <= steps; s++) {
          const k = s / steps;
          this._push(
            last.bx + (_base.x - last.bx) * k, last.by + (_base.y - last.by) * k, last.bz + (_base.z - last.bz) * k,
            last.tx + (_tip.x - last.tx) * k, last.ty + (_tip.y - last.ty) * k, last.tz + (_tip.z - last.tz) * k,
            dt * (1 - k)
          );
        }
      } else {
        this._push(_base.x, _base.y, _base.z, _tip.x, _tip.y, _tip.z, 0);
      }
      this._last = { bx: _base.x, by: _base.y, bz: _base.z, tx: _tip.x, ty: _tip.y, tz: _tip.z };
    }

    this.material.uniforms.uStrength.value = this.strength;
    this.mesh.geometry.attributes.aAge.needsUpdate = true;
    this.mesh.visible = ages[0] < 0.3 || this.active;
  }

  /** Shift the strip down one sample and write the newest at the head. */
  _push(bx, by, bz, tx, ty, tz, age) {
    const p = this.positions;
    p.copyWithin(6, 0, p.length - 6);
    this.ages.copyWithin(2, 0, this.ages.length - 2);
    p[0] = bx; p[1] = by; p[2] = bz;
    p[3] = tx; p[4] = ty; p[5] = tz;
    this.ages[0] = age;
    this.ages[1] = age;
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
