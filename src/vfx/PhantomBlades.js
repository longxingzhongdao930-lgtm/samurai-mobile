import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3
} from 'three';

import { frame } from '../core/FrameUniforms.js';
import { LAYER } from '../core/Layers.js';
import { copyColor, makeColor } from '../utils/color.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();
const _dir = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * A katana of light, as a crossed pair of tapered planes (visible from any
 * side, twelve triangles), running +Y from the hilt at 0 to the point at 1.
 * `aEdge` is 0 on the spine and 1 on the edge and point, for the shader.
 */
function bladeGeometry() {
  const L = 1.05; // blade
  const W = 0.07;
  const H = 0.22; // hilt below 0
  const pos = [];
  const edge = [];
  const quad = (a, b, c, d, ea, eb, ec, ed) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    edge.push(ea, eb, ec, ea, ec, ed);
  };
  for (const flip of [0, 1]) {
    const at = (w, y) => (flip ? [0, y, w] : [w, y, 0]);
    // Blade, tapering to the point.
    quad(at(-W * 0.5, 0), at(W * 0.5, 0), at(W * 0.15, L * 0.88), at(-W * 0.5, L * 0.88), 0.2, 1, 1, 0.2);
    pos.push(...at(-W * 0.5, L * 0.88), ...at(W * 0.15, L * 0.88), ...at(-W * 0.2, L));
    edge.push(0.4, 1, 1);
    // Hilt.
    quad(at(-0.028, -H), at(0.028, -H), at(0.028, 0), at(-0.028, 0), 0, 0, 0, 0);
    // Guard.
    quad(at(-0.07, -0.02), at(0.07, -0.02), at(0.07, 0.015), at(-0.07, 0.015), 0.1, 0.1, 0.1, 0.1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1));
  return g;
}

const VERTEX = /* glsl */ `
  attribute float aEdge;
  varying float vEdge;
  varying float vY;
  void main() {
    vEdge = aEdge;
    vY = position.y;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uExposure;
  varying float vEdge;
  varying float vY;
  void main() {
    float a = uOpacity * (0.45 + 0.55 * vEdge);
    if (a < 0.003) discard;
    vec3 c = mix(uColor, uCore, vEdge * vEdge);
    gl_FragColor = vec4(c * uIntensity / max(uExposure, 1e-3), a);
  }
`;

/**
 * 幻影刀 — the katanas of light an execution calls up round its mark.
 *
 * The reference builds its phantom blades from full meshes with dissolves,
 * trails and their own light; this keeps the one thing that reads at phone
 * size — the silhouette of a katana glowing — as a crossed-plane blade drawn
 * five times by one instanced mesh. The execution (`combat/Execution.js`)
 * owns the choreography and hands each blade its point and its aim.
 */
export class PhantomBlades {
  constructor(count = 5) {
    this.count = count;
    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uColor: { value: makeColor('#b06bff') },
        uCore: { value: makeColor('#fff4ff') },
        uOpacity: { value: 0 },
        uIntensity: { value: 2.2 },
        uExposure: frame.uExposure
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT
    });
    this.mesh = new InstancedMesh(bladeGeometry(), this.material, count);
    this.mesh.name = 'PhantomBlades';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.layers.set(LAYER.VFX);
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  setLook(color, core, intensity) {
    const u = this.material.uniforms;
    copyColor(u.uColor.value, color);
    copyColor(u.uCore.value, core);
    u.uIntensity.value = intensity;
  }

  /**
   * Point blade `i` from (x, y, z) at (tx, ty, tz): the hilt at the first
   * point, the blade running toward the second.
   */
  aim(i, x, y, z, tx, ty, tz, scale = 1) {
    _p.set(x, y, z);
    _dir.set(tx - x, ty - y, tz - z).normalize();
    _q.setFromUnitVectors(_up, _dir);
    _s.setScalar(scale);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  set opacity(v) {
    this.material.uniforms.uOpacity.value = v;
    this.mesh.visible = v > 0.002;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
