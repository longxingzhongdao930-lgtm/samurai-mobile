import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry
} from 'three';

/**
 * What each kind carries, so it can be told apart at a glance: the 盾's
 * shield, the 弓's bow, the 鉄砲's barrel, the 大型's 金棒, the boss's club and
 * horns. Simple shapes in the body's own frame (+Z forward, feet at 0),
 * geometry and materials shared by every body that carries one — a few extra
 * draw calls, nothing allocated per spawn but the meshes themselves.
 *
 * They ride the body's root, not a hand bone: at phone size the read is
 * "this one has a shield", which the silhouette gives on its own.
 */
let shared = null;

function make() {
  const mat = (color, emissive = '#000000', metalness = 0.2) =>
    new MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.6, roughness: 0.7, metalness });
  return {
    lacquer: mat('#4a1810', '#2a0804'),
    steel: mat('#7a7e86', '#0c0e12', 0.7),
    wood: mat('#5a3a20', '#140a04'),
    iron: mat('#2a2a2e', '#300808', 0.6),
    horn: mat('#d8cbb0', '#3a1a0a'),
    shield: new BoxGeometry(0.64, 0.95, 0.07),
    boss: new BoxGeometry(0.66, 0.08, 0.09),
    bow: new TorusGeometry(0.62, 0.018, 4, 20, Math.PI),
    string: new CylinderGeometry(0.004, 0.004, 1.24, 3),
    barrel: new BoxGeometry(0.05, 0.06, 1.15),
    club: new CylinderGeometry(0.07, 0.13, 1.6, 7),
    hornGeo: new ConeGeometry(0.05, 0.22, 6)
  };
}

export function makeEnemyProp(kind, gun = false) {
  shared ??= make();
  const s = shared;
  const g = new Group();
  const add = (geo, material, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.raycast = () => {};
    g.add(m);
    return m;
  };
  switch (kind) {
    case 'shield':
      add(s.shield, s.lacquer, 0.08, 1.05, 0.42);
      add(s.boss, s.steel, 0.08, 1.05, 0.46);
      break;
    case 'archer':
      if (gun) add(s.barrel, s.iron, 0.24, 1.25, 0.38, 0.12);
      else {
        add(s.bow, s.wood, -0.32, 1.1, 0.28, 0, Math.PI / 2, Math.PI / 2);
        add(s.string, s.horn, -0.32, 1.1, 0.28);
      }
      break;
    case 'brute':
      add(s.club, s.iron, 0.55, 1.0, 0.25, 0.5, 0, -0.35);
      break;
    case 'boss':
      add(s.club, s.iron, 0.62, 1.05, 0.3, 0.55, 0, -0.4).scale.set(1.3, 1.2, 1.3);
      add(s.hornGeo, s.horn, 0.09, 1.78, 0.02, 0, 0, -0.35);
      add(s.hornGeo, s.horn, -0.09, 1.78, 0.02, 0, 0, 0.35);
      break;
    default:
      return null;
  }
  return g;
}
