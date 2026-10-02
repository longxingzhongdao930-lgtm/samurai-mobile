import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * What each enemy type holds, built from primitives and shared across every
 * body of that type (one geometry, one material per kind — a crowd of thirty
 * costs the same handful of programs as one).
 *
 * Gear hangs off a *mount* whose scale cancels the bone's world scale, the way
 * `EquipmentManager` hangs the katana, so everything here is authored in
 * metres along +Y (the grip at the origin, the business end up the axis).
 */

const _scale = new Vector3();
let _cache = null;

function build() {
  const steel = new MeshStandardMaterial({ color: '#8a8f98', roughness: 0.32, metalness: 0.9 });
  const darkWood = new MeshStandardMaterial({ color: '#2a1810', roughness: 0.8, metalness: 0.0 });
  const iron = new MeshStandardMaterial({ color: '#2b2522', roughness: 0.55, metalness: 0.75, emissive: '#3a0800', emissiveIntensity: 0.4 });
  const bone = new MeshStandardMaterial({ color: '#d9cdb4', roughness: 0.55, metalness: 0.0, emissive: '#2a0400', emissiveIntensity: 0.2 });
  const spirit = new MeshStandardMaterial({ color: '#203a24', roughness: 0.5, metalness: 0.1, emissive: '#5cff7a', emissiveIntensity: 1.6 });

  const blade = () => {
    const grip = new CylinderGeometry(0.018, 0.018, 0.24, 6).translate(0, 0.0, 0);
    const guard = new CylinderGeometry(0.045, 0.045, 0.012, 10).translate(0, 0.125, 0);
    const edge = new BoxGeometry(0.03, 0.78, 0.008).translate(0, 0.52, 0);
    return { steel: mergeGeometries([edge.toNonIndexed(), guard.toNonIndexed()]), wood: grip };
  };

  const tanto = () => {
    const grip = new CylinderGeometry(0.016, 0.016, 0.16, 6);
    const edge = new BoxGeometry(0.026, 0.42, 0.007).translate(0, 0.3, 0);
    return { steel: edge, wood: grip };
  };

  const kanabo = (length, thick) => {
    const shaft = new CylinderGeometry(thick, thick * 0.45, length, 8).translate(0, length * 0.42, 0);
    const studs = [];
    for (let i = 0; i < 18; i++) {
      const y = length * (0.35 + 0.55 * ((i * 7) % 18) / 18);
      const a = i * 2.4;
      const r = thick * (0.55 + 0.45 * ((y - length * 0.08) / length));
      studs.push(new ConeGeometry(thick * 0.18, thick * 0.4, 5).rotateZ(-Math.PI / 2).translate(r, 0, 0).rotateY(a).translate(0, y, 0).toNonIndexed());
    }
    return { iron: mergeGeometries([shaft.toNonIndexed(), ...studs]) };
  };

  const bow = () => {
    const arc = new TorusGeometry(0.62, 0.016, 5, 18, Math.PI * 0.9).rotateZ(Math.PI * 0.55).translate(-0.5, 0, 0);
    return { spirit: arc };
  };

  const horns = (size) => {
    const left = new ConeGeometry(size * 0.16, size, 7).rotateZ(0.5).translate(-size * 0.22, size * 0.42, 0);
    const right = new ConeGeometry(size * 0.16, size, 7).rotateZ(-0.5).translate(size * 0.22, size * 0.42, 0);
    return { bone: mergeGeometries([left.toNonIndexed(), right.toNonIndexed()]) };
  };

  return {
    materials: { steel, wood: darkWood, iron, bone, spirit },
    kinds: {
      blade: blade(),
      tanto: tanto(),
      kanabo: kanabo(1.25, 0.075),
      bigKanabo: kanabo(2.1, 0.12),
      bow: bow(),
      horns: horns(0.18),
      bigHorns: horns(0.34)
    }
  };
}

function meshesFor(kind) {
  _cache ??= build();
  const group = new Group();
  const parts = _cache.kinds[kind];
  for (const [material, geometry] of Object.entries(parts)) {
    const mesh = new Mesh(geometry, _cache.materials[material]);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

/** A mount on `bone` that cancels its world scale, so children are in metres. */
function mountOn(enemy, boneName) {
  const bone = enemy.bones.get(boneName);
  if (!bone) return null;
  enemy.root.updateWorldMatrix(true, true);
  bone.getWorldScale(_scale);
  const mount = new Group();
  mount.scale.set(1 / _scale.x, 1 / _scale.y, 1 / _scale.z);
  bone.add(mount);
  return mount;
}

/**
 * Dress one body. Returns the meshes added, so the caller can hide them.
 *
 * The hand mount's rotation points +Y out of the fist along the grip, which is
 * the bone's −X on Mixamo's right hand (and +X on the left).
 */
export function equipEnemy(enemy, gear, { horns = null } = {}) {
  const added = [];
  const hand = (boneName, kind, rot, offset) => {
    const mount = mountOn(enemy, boneName);
    if (!mount) return;
    const item = meshesFor(kind);
    item.rotation.set(rot[0], rot[1], rot[2]);
    item.position.set(offset[0], offset[1], offset[2]);
    mount.add(item);
    added.push(item);
  };

  switch (gear) {
    case 'blade':
      hand('RightHand', 'blade', [0, 0, Math.PI / 2], [-0.02, 0.08, 0.02]);
      break;
    case 'tanto':
      hand('RightHand', 'tanto', [0, 0, Math.PI / 2], [-0.02, 0.08, 0.02]);
      break;
    case 'bow':
      hand('LeftHand', 'bow', [Math.PI / 2, 0, 0], [0.0, 0.08, 0.0]);
      break;
    case 'kanabo':
      hand('RightHand', 'kanabo', [0, 0, Math.PI / 2], [-0.02, 0.08, 0.02]);
      break;
    case 'bigKanabo':
      hand('RightHand', 'bigKanabo', [0, 0, Math.PI / 2], [-0.02, 0.08, 0.02]);
      break;
    default:
      break;
  }

  if (horns) {
    const mount = mountOn(enemy, 'Head');
    if (mount) {
      const item = meshesFor(horns);
      item.position.set(0, 0.12, 0.02);
      mount.add(item);
      added.push(item);
    }
  }
  return added;
}
