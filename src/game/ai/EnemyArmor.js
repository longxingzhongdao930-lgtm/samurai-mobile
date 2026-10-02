import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Lacquered armour for the crowd: 胴 (cuirass), 袖 (shoulder plates), 草摺
 * (tassets), 面 (mask), a sash — so a body reads as an armoured 妖 rather
 * than a mannequin.
 *
 * Every piece is laid out in the body's own frame, measured off its bones in
 * the bind pose (shoulder width, torso length, where the head is), and then
 * handed to the bone that should carry it with `attach`, which keeps its
 * world placement. So the armour fits any proportions the type is scaled to,
 * and no bone's local axes ever need to be known.
 */

const _inv = new Matrix4();
const _m = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _e = new Euler(0, 0, 0, 'YXZ');
const _c = new Color();
const _one = new Vector3(1, 1, 1);

/** Bones above the waist: their armour goes with the top half of a cut body. */
const UPPER = new Set(['Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftShoulder', 'RightShoulder']);

/**
 * Two shared materials for every armoured body: lacquer and lacing as vertex
 * colours on one, the eyes and molten seams (colours over 1, so they bloom)
 * on the other.
 */
let _shared = null;
function shared() {
  _shared ??= {
    solid: new MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.38 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: true })
  };
  return _shared;
}

/** Per-type look. Colours are lacquer, trim (lacing/edges) and the mask. */
export const ARMOR_STYLES = {
  ashigaru: { lacquer: '#2b1c16', trim: '#8a2414', mask: 'menpo', maskColor: '#5a1610', cuirass: true, sode: true, tassets: true },
  archer: { lacquer: '#1c2419', trim: '#6a6a2a', mask: 'menpo', maskColor: '#3a3a1c', cuirass: true, sode: false, tassets: true },
  shinobi: { lacquer: '#16111f', trim: '#4c2a70', mask: 'hood', maskColor: '#120e18', cuirass: false, sode: false, tassets: false },
  oni: { lacquer: '#4a120c', trim: '#a8822e', mask: 'oni', maskColor: '#6a140c', cuirass: true, sode: true, tassets: true, spikes: true },
  rasetsu: { lacquer: '#120d0d', trim: '#b08a34', mask: 'oni', maskColor: '#1a0c0a', cuirass: true, sode: true, tassets: true, spikes: true, glow: '#ff3a10' }
};

/** A paint: a colour, and whether it glows (and how hot). */
function material(key, color, { emissive = null, emissiveIntensity = 1 } = {}) {
  return emissive ? { color: emissive, glow: emissiveIntensity } : { color, glow: 0 };
}

/**
 * @param {import('../../combat/Enemy.js').Enemy} enemy freshly spawned, still in its bind pose
 * @param {object} style an `ARMOR_STYLES` entry
 * @returns {Mesh[]} the pieces, so they can be hidden or counted
 */
export function dressArmor(enemy, style) {
  if (!style) return [];
  const root = enemy.root;
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();

  const at = (name, out) => {
    const bone = enemy.bones.get(name);
    if (!bone) return null;
    return bone.getWorldPosition(out).applyMatrix4(_inv);
  };
  const hips = at('Hips', new Vector3());
  const spine = at('Spine1', new Vector3()) ?? hips;
  const chest = at('Spine2', new Vector3()) ?? spine;
  const neck = at('Neck', new Vector3());
  const head = at('Head', new Vector3());
  const lArm = at('LeftArm', new Vector3());
  const rArm = at('RightArm', new Vector3());
  const lLeg = at('LeftUpLeg', new Vector3());
  const rLeg = at('RightUpLeg', new Vector3());
  if (!hips || !neck || !head || !lArm || !rArm) return [];

  // The body's own frame, in root space.
  const yaw = enemy.forwardYaw;
  const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const side = new Vector3().subVectors(lArm, rArm).setY(0);
  const shoulders = side.length();
  side.normalize();
  const torso = neck.y - hips.y;
  const pieces = [];

  const lacquer = material('lacquer', style.lacquer);
  const trim = material('trim', style.trim, { metalness: 0.6, roughness: 0.35 });
  const maskMat = material('mask', style.maskColor, { metalness: 0.5, roughness: 0.3 });
  const glow = style.glow ? material('glow', '#200000', { emissive: style.glow, emissiveIntensity: 2.2 }) : null;
  const fang = material('fang', '#e8dcc0', { metalness: 0, roughness: 0.6 });

  /**
   * Place a geometry authored around the origin at `pos` (root space), facing
   * the body's forward, painted `paint`, and riding `boneName`.
   */
  const put = (geometry, paint, pos, boneName, { yawOffset = 0, tilt = 0 } = {}) => {
    _e.set(tilt, yaw + yawOffset, 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(pos, _q, _one);
    const g = (geometry.index ? geometry.toNonIndexed() : geometry).applyMatrix4(_m);
    const piece = { geometry: g, paint, bone: boneName };
    pieces.push(piece);
    return piece;
  };

  /* ---- 胴: a lacquered barrel around the chest, laced in bands ---- */
  if (style.cuirass) {
    const radius = shoulders * 0.6;
    const height = (chest.y - hips.y) * 1.15 + torso * 0.14;
    const body = new CylinderGeometry(radius * 1.02, radius * 0.9, height, 14, 1, true);
    body.scale(1, 1, 0.72);
    const centre = _a.copy(hips).lerp(chest, 0.62);
    put(body, lacquer, centre, 'Spine1');
    const bands = [];
    for (let i = 0; i < 4; i++) {
      const y = -height / 2 + (height * (i + 0.6)) / 4.4;
      const r = radius * (0.9 + 0.12 * ((i + 0.6) / 4.4));
      bands.push(new TorusGeometry(r, radius * 0.035, 4, 18).rotateX(Math.PI / 2).scale(1, 1, 0.72).translate(0, y, 0));
    }
    put(mergeGeometries(bands), trim, centre, 'Spine1');
    // Sash at the waist.
    const sash = new TorusGeometry(radius * 0.92, radius * 0.08, 5, 18).rotateX(Math.PI / 2).scale(1, 1, 0.8);
    put(sash, trim, _b.copy(hips).setY(hips.y + torso * 0.04), 'Hips');
  } else {
    const radius = shoulders * 0.52;
    const sash = new TorusGeometry(radius, radius * 0.1, 5, 16).rotateX(Math.PI / 2).scale(1, 1, 0.8);
    put(sash, trim, _b.copy(hips).setY(hips.y + torso * 0.05), 'Hips');
  }

  /* ---- 袖: plates on top of the upper arms (the arms are out in the bind pose) ---- */
  if (style.sode) {
    for (const [arm, name, sign] of [[lArm, 'LeftArm', 1], [rArm, 'RightArm', -1]]) {
      const plate = new BoxGeometry(shoulders * 0.62, shoulders * 0.06, shoulders * 0.58);
      // Lying along the arm, a little out from the joint and above it.
      const pos = _a.copy(arm).addScaledVector(side, sign * shoulders * 0.3);
      pos.y += shoulders * 0.2;
      put(plate, lacquer, pos, name);
      const lace = new BoxGeometry(shoulders * 0.64, shoulders * 0.035, shoulders * 0.07).translate(0, shoulders * 0.04, 0);
      put(lace, trim, pos, name);
      if (style.spikes) {
        const spike = new ConeGeometry(shoulders * 0.09, shoulders * 0.4, 6).translate(0, shoulders * 0.22, 0);
        put(spike, trim, _b.copy(pos).setY(pos.y + shoulders * 0.02), name);
      }
    }
  }

  /* ---- 草摺: tassets around the hips; the side ones swing with the thighs ---- */
  if (style.tassets) {
    const radius = shoulders * 0.58;
    const height = torso * 0.5;
    const plate = () => new BoxGeometry(shoulders * 0.55, height, shoulders * 0.05).translate(0, -height / 2, 0);
    const top = hips.y + torso * 0.02;
    // Front and back on the hips.
    put(plate(), lacquer, _a.copy(hips).setY(top).addScaledVector(fwd, radius * 0.95), 'Hips', { tilt: -0.12 });
    put(plate(), lacquer, _a.copy(hips).setY(top).addScaledVector(fwd, -radius * 0.95), 'Hips', { tilt: 0.12 });
    // Sides on the thighs.
    if (lLeg && rLeg) {
      for (const [leg, name, sign] of [[lLeg, 'LeftUpLeg', 1], [rLeg, 'RightUpLeg', -1]]) {
        const pos = _a.copy(leg).setY(top).addScaledVector(side, sign * radius * 0.55);
        put(plate(), lacquer, pos, name, { yawOffset: (sign * Math.PI) / 2 });
      }
    }
  }

  /* ---- 面: the face ---- */
  const headTop = _b.copy(head);
  const headSize = Math.max(0.16, (head.y - neck.y) * 2.1);
  const face = _a.copy(head).addScaledVector(fwd, headSize * 0.72);
  face.y += headSize * 0.25;
  if (style.mask === 'menpo') {
    // A lower-face guard with a grim mouth.
    const guard = new SphereGeometry(headSize * 0.78, 10, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4).scale(1, 0.9, 0.95);
    put(guard, maskMat, _b.copy(head).setY(head.y + headSize * 0.25), 'Head');
  } else if (style.mask === 'hood') {
    const hood = new SphereGeometry(headSize * 0.88, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.72).scale(1, 1.08, 1.05);
    put(hood, maskMat, _b.copy(head).setY(head.y + headSize * 0.42), 'Head');
  } else if (style.mask === 'oni') {
    // 鬼面: a heavy brow, a snarl and two tusks.
    const brow = new BoxGeometry(headSize * 0.95, headSize * 0.18, headSize * 0.3).rotateX(-0.3);
    put(brow, maskMat, _b.copy(face).setY(face.y + headSize * 0.22), 'Head');
    const jaw = new SphereGeometry(headSize * 0.75, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4).scale(1.1, 0.8, 0.9);
    put(jaw, maskMat, _b.copy(head).setY(head.y + headSize * 0.2).addScaledVector(fwd, headSize * 0.15), 'Head');
    const tusks = mergeGeometries([
      new ConeGeometry(headSize * 0.06, headSize * 0.28, 5).translate(-headSize * 0.22, headSize * 0.1, 0).toNonIndexed(),
      new ConeGeometry(headSize * 0.06, headSize * 0.28, 5).translate(headSize * 0.22, headSize * 0.1, 0).toNonIndexed()
    ]);
    put(tusks, fang, _b.copy(face).setY(face.y - headSize * 0.32), 'Head');
  }
  void headTop;

  /* ---- eyes: two embers that read at twenty metres in the rain ---- */
  const eyeMat = material('eye', '#000000', { emissive: style.glow ?? '#ffcf70', emissiveIntensity: 7 });
  const eyes = mergeGeometries([
    new SphereGeometry(headSize * 0.06, 6, 4).scale(1.7, 0.7, 1).translate(-headSize * 0.16, 0, 0).toNonIndexed(),
    new SphereGeometry(headSize * 0.06, 6, 4).scale(1.7, 0.7, 1).translate(headSize * 0.16, 0, 0).toNonIndexed()
  ]);
  put(eyes, eyeMat, _b.copy(face).setY(face.y + headSize * 0.08), 'Head');

  /* ---- the boss: a molten seam down the cuirass ---- */
  if (glow && style.cuirass) {
    const seam = new BoxGeometry(shoulders * 0.08, (chest.y - hips.y) * 0.9, shoulders * 0.02);
    const pos = _a.copy(hips).lerp(chest, 0.6).addScaledVector(fwd, shoulders * 0.44);
    put(seam, glow, pos, 'Spine1');
  }

  return bake(enemy, root, pieces);
}

/**
 * Merge every piece into skinned meshes on the body's own skeleton, each
 * vertex bound rigidly to its piece's bone: one draw for the lacquer and one
 * for the glow per half of the body, however many plates there are.
 */
function bake(enemy, root, pieces) {
  let body = null;
  enemy.model.traverse((node) => {
    if (!body && node.isSkinnedMesh) body = node;
  });
  if (!body) return [];
  root.updateWorldMatrix(true, true);
  // root space → the body mesh's own (bind) space
  const toBody = new Matrix4().copy(body.matrixWorld).invert().multiply(root.matrixWorld);
  const bones = body.skeleton.bones;

  const groups = new Map();
  for (const piece of pieces) {
    const bone = enemy.bones.get(piece.bone);
    const index = bone ? bones.indexOf(bone) : -1;
    if (index < 0) continue;
    const g = piece.geometry.applyMatrix4(toBody);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    _c.set(piece.paint.color);
    const k = piece.paint.glow > 0 ? piece.paint.glow : 1;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _c.r * k;
      colors[i * 3 + 1] = _c.g * k;
      colors[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = index;
      skinWeight[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
    if (g.attributes.uv) g.deleteAttribute('uv');
    const half = UPPER.has(piece.bone) ? 'upper' : 'lower';
    const key = `${half}:${piece.paint.glow > 0 ? 'glow' : 'solid'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }

  const materials = shared();
  const meshes = [];
  for (const [key, list] of groups) {
    const [half, kind] = key.split(':');
    const geometry = mergeGeometries(list, false);
    const mesh = new SkinnedMesh(geometry, materials[kind]);
    mesh.name = `Armor:${key}`;
    mesh.userData.ownMaterial = true;
    mesh.userData.half = half;
    mesh.castShadow = kind === 'solid';
    mesh.frustumCulled = false;
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    mesh.scale.copy(body.scale);
    body.parent.add(mesh);
    mesh.bindMode = body.bindMode;
    mesh.bind(body.skeleton, body.bindMatrix);
    meshes.push(mesh);
  }
  return meshes;
}
