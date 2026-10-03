import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const EDO_MODELS = ['es_shop01', 'es_shop02', 'es_hinomi', 'pp_sobaya_yatai', 'pp2_kakechaya', 's_jizo', 't_yukimi', 't_joyato', 'pp_hei_center'];

/** Authored scenery occupies existing frontage and bounded edge pockets. */
export class EdoScenery {
  constructor(stage) { this.stage = stage; this.models = new Map(); this.instances = []; this.houseIndex = 0; }
  async load() {
    const loader = new GLTFLoader();
    await Promise.allSettled(EDO_MODELS.map(async id => {
      try {
        const { scene } = await loader.loadAsync(`/models/edo/${id}.glb`);
        scene.traverse(node => {
          if (!node.isMesh) return;
          node.castShadow = true; node.receiveShadow = true;
          for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
            m.roughness = Math.max(m.roughness ?? 0.8, 0.65);
            this.stage.game.app.environment.excludeFromKeyLights?.(m);
          }
        });
        this.models.set(id, scene);
      } catch (error) { console.warn(`Edo scenery unavailable: ${id}`, error); }
    }));
  }
  place(id, x, z, width, height, depth, yaw = 0, solid = true) {
    const source = this.models.get(id); if (!source) return null;
    const model = source.clone(true);
    const box = new Box3().setFromObject(model), size = box.getSize(new Vector3());
    model.scale.set(width / size.x, height / size.y, depth / size.z);
    model.position.set(-(box.min.x + box.max.x) * .5 * model.scale.x, -box.min.y * model.scale.y, -(box.min.z + box.max.z) * .5 * model.scale.z);
    const group = new Group(); group.name = `Edo:${id}`; group.add(model); group.position.set(x, 0, z); group.rotation.y = yaw;
    this.stage.group.add(group); group.updateMatrixWorld(true);
    const worldBox = new Box3().setFromObject(group);
    if (solid) this.stage.boxes.push([worldBox.min.x, worldBox.max.x, worldBox.min.z, worldBox.max.z]);
    this.instances.push(group);
    return group;
  }
  house(x, z, width, depth, yaw) {
    if (Math.abs(Math.abs(x) - 8.3) > .1 || z < 0 || z > 83) return false;
    const index = this.houseIndex++;
    if (index % 2) return false;
    const id = index % 4 === 0 ? 'es_shop01' : 'es_shop02';
    // Bounding box fits the old building slot, including its roof overhang.
    const group = this.place(id, x, z, width - .25, 5.8, depth, yaw, false);
    if (!group) return false;
    const front = new Vector3(0, 2.1, depth / 2 + .12).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    this.stage.lanterns.push(front.add(new Vector3(x, 0, z)));
    return true;
  }
  decorate() {
    // Small working pockets, never in alley mouths or the central combat lane.
    this.place('pp_sobaya_yatai', -10.5, 95, 2.4, 2.3, 1.5, Math.PI / 2);
    this.place('pp2_kakechaya', -13, 133, 4, 3.1, 3, Math.PI / 2);
    this.place('s_jizo', 11.2, 172.8, .65, 1.25, .65);
    this.place('t_yukimi', -20, 45, .9, 1.1, .9);
    this.place('t_yukimi', 22, 78, .9, 1.1, .9);
    // The walls are outside the castle approach's walkable 7.2m strip.
    for (const x of [-4.3, 4.3]) for (let z = 220; z <= 236; z += 4) {
      this.place('pp_hei_center', x, z, 4, 2.2, .4, Math.PI / 2, false);
    }
  }
  update(position) {
    for (const group of this.instances) group.visible = Math.abs(group.position.z - position.z) < 92;
  }
}
