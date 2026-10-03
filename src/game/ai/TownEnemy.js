import { AnimationMixer, Box3, Group, LoopOnce, Vector3 } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { townMotions, rigForward } from '../../animation/TownMotions.js';

/** EnemyAgent's combat body, using the supplied rig without humanoid ragdoll assumptions. */
export class TownEnemy {
  constructor(gltf, definition, type, terrain) {
    this.kind = definition.id;
    this.customAppearance = true;
    this.height = type.height;
    this.bodyRadius = type.radius;
    this.terrain = terrain;
    this.root = new Group();
    this.root.name = type.name;
    this.model = clone(gltf.scene);
    this.root.add(this.model);
    this.clips = townMotions(this.model, gltf.animations, definition);
    this.mixer = new AnimationMixer(this.model);
    this.action = this.mixer.clipAction(this.clips.get('idle')).play();
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
    const direction = rigForward(this.model, definition);
    this.forwardYaw = Math.atan2(direction.x, direction.z);
    const box = new Box3().setFromObject(this.model);
    const scale = type.height / Math.max(0.001, box.max.y - box.min.y);
    const center = box.getCenter(new Vector3());
    this.model.scale.multiplyScalar(scale);
    this.model.position.add(new Vector3(-center.x, -box.min.y, -center.z).multiplyScalar(scale));
    this.materials = [];
    this.bones = new Map();
    this.model.traverse(node => {
      if (node.isBone) this.bones.set(node.name, node);
      if (!node.isMesh) return;
      node.frustumCulled = false;
      node.castShadow = true;
      const original = Array.isArray(node.material) ? node.material : [node.material];
      const materials = original.map(m => { const copy = m.clone(); this.materials.push(copy); return copy; });
      node.material = Array.isArray(node.material) ? materials : materials[0];
    });
    for (const [alias, name] of Object.entries(definition.boneAliases ?? {})) {
      const bone = this.bones.get(name);
      if (bone) this.bones.set(alias, bone);
    }
    this._colors = this.materials.map(m => ({ emissive: m.emissive?.clone(), intensity: m.emissiveIntensity ?? 0, opacity: m.opacity }));
    this.parts = []; // no Mixamo slicing/ragdoll on these rigs
    this.state = 'alive';
    this.facing = 0;
    this.timeScale = 1;
    this.flash = 0;
    this.lean = 0;
    this.timer = 0;
  }
  get alive() { return this.state === 'alive'; }
  get finished() { return this.state === 'gone'; }
  get position() { return this.root.position; }
  place(x, z, yaw) {
    this.position.set(x, this.terrain?.heightAt(x, z) ?? 0, z);
    this.facing = yaw;
    this.root.rotation.y = yaw - this.forwardYaw;
  }
  update(dt) {
    if (this.alive) {
      this.onAnimate?.(dt);
      this.mixer.update(dt * this.timeScale);
      this.root.rotation.x = this.lean;
      this.position.y = this.terrain?.heightAt(this.position.x, this.position.z) ?? 0;
    } else {
      this.timer += dt;
      this.mixer.update(dt);
      const fade = Math.max(0, (this.timer - this._deathDuration) / 0.8);
      for (let i = 0; i < this.materials.length; i++) {
        this.materials[i].transparent = true;
        this.materials[i].opacity = this._colors[i].opacity * Math.max(0, 1 - fade);
      }
      if (fade >= 1) this.state = 'gone';
    }
    for (let i = 0; i < this.materials.length; i++) {
      const m = this.materials[i], base = this._colors[i];
      if (base.emissive) {
        m.emissive.copy(base.emissive);
        if (this.flash > 0) m.emissive.setRGB(1, 0.25, 0.1);
        m.emissiveIntensity = base.intensity + this.flash * 0.8;
      }
    }
  }
  die() {
    if (!this.alive) return false;
    if (this.agent?.entrance) { this.model.position.y = this.agent.entrance.baseY; this.agent.entrance = null; }
    this.state = 'dead'; this.timer = 0; this.flash = 0;
    this.mixer.stopAllAction();
    const clip = this.clips.get('death');
    const action = this.mixer.clipAction(clip).reset().setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    this._deathDuration = Math.max(1.4, clip.duration);
    return true;
  }
  _castShadows(on) { this.model.traverse(node => { if (node.isMesh) node.castShadow = on; }); }
  retire() { this.die(); }
  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model);
    this.model.traverse(node => { if (node.isSkinnedMesh) node.skeleton.dispose(); });
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent(); this.state = 'gone';
  }
}
