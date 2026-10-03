import { AnimationMixer, Box3, Group, LoopOnce, Vector3 } from 'three';
import { CAMP_CHARACTERS } from '../config/creatures.js';
import { settings } from '../config/settings.js';
import { disposeObject } from '../utils/dispose.js';

/** The supplied presentation clips stay on their own rigs, near the spawn. */
export class CampCharacters {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new Group();
    this.group.name = 'Camp characters';
    this.characters = [];
  }

  async load(assets) {
    await Promise.all(CAMP_CHARACTERS.map(async (definition) => {
      const gltf = await assets.loadGLTF(definition.url);
      const root = new Group();
      root.name = definition.label;
      root.add(gltf.scene);
      const mixer = new AnimationMixer(gltf.scene);
      const clip = gltf.animations.find(a => a.name === definition.clip);
      if (!clip) throw new Error(`Missing character pose: ${definition.label}`);
      const action = mixer.clipAction(clip);
      if (clip.duration === 0) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.play();
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(gltf.scene);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const scale = definition.height / Math.max(0.001, size.y);
      gltf.scene.scale.multiplyScalar(scale);
      gltf.scene.position.add(new Vector3(-center.x, -box.min.y, -center.z).multiplyScalar(scale));
      root.position.set(definition.x, this.terrain.heightAt(definition.x, definition.z), definition.z);
      root.rotation.y = Math.PI * 0.4;
      gltf.scene.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = false;
      });
      this.group.add(root);
      this.characters.push({ ...definition, root, mixer, action, model: gltf.scene });
    }));
    await assets.settled();
  }

  update(dt) {
    for (const character of this.characters) {
      character.mixer.update(dt * settings.global.animationSpeed);
      const p = character.root.position;
      p.y = this.terrain.heightAt(p.x, p.z);
    }
  }

  dispose() {
    for (const character of this.characters) {
      character.mixer.stopAllAction();
      character.mixer.uncacheRoot(character.model);
      character.model.traverse(node => {
        if (node.isSkinnedMesh) node.skeleton.dispose();
      });
      disposeObject(character.root);
    }
    this.characters.length = 0;
    this.group.removeFromParent();
  }
}
