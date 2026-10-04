import { recoverLoad } from '../../loaders/RecoverLoad.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SWORD_VARIANTS = {
  mythical: { name: '単刀1 · 神話の刀', blade: null, scabbard: 'mythical-scabbard' },
  oni: { name: '単刀2 · 鬼殺し', blade: 'katana-oni', scabbard: 'katana-oni-scabbard' },
  classic: { name: '単刀3 · 黒柄の刀', blade: 'katana-classic', scabbard: 'katana-classic-scabbard' }
};

/** Swap the single-sword appearance atomically; combat/save weapon remains katana. */
export class SwordVariants {
  constructor(game, weapons) { this.g = game; this.weapons = weapons; this.id = 'mythical'; this.templates = new Map(); this.pending = new Map(); this.request = 0; }
  load(name) {
    if (this.templates.has(name)) return Promise.resolve(this.templates.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const task = recoverLoad(name, () => new GLTFLoader().loadAsync(`./models/weapons/${name}.glb`)).then(gltf => {
      gltf.scene.traverse(node => { if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; } });
      this.templates.set(name, gltf.scene); return gltf.scene;
    }).finally(() => this.pending.delete(name));
    this.pending.set(name, task); return task;
  }
  async select(id, {canApply=()=>true}={}) {
    if (!Object.hasOwn(SWORD_VARIANTS,id)) return false; const spec = SWORD_VARIANTS[id];
    const request = ++this.request;
    await Promise.all([this.load(spec.scabbard), spec.blade ? this.load(spec.blade) : Promise.resolve()]);
    if (request !== this.request || !canApply()) return false;
    const changed = this.id !== id;
    this.id = id;
    if(this.g.heroStudio)this.g.heroStudio.singleSword=id;
    this.clearBlade(); this.applyScabbard();
    if (changed) this.g.player?.refreshSwordMoves?.();
    if (this.weapons.current === 'katana') this.equipBlade();
    this.g.heroPresence?.katanaSheath.invalidate();
    return true;
  }
  applyScabbard() {
    const holder = this.g.heroPresence?.sheath, template = this.templates.get(SWORD_VARIANTS[this.id].scabbard);
    if (holder && template) { holder.clear(); holder.add(template.clone(true)); }
  }
  clearBlade() { this.blade?.removeFromParent(); this.blade = null; }
  equipBlade() {
    const slot = this.weapons._slot(); if (!slot) return;
    this.clearBlade();
    const template = this.templates.get(SWORD_VARIANTS[this.id].blade);
    slot.model.visible = !template;
    if (template) {
      this.blade = template.clone(true);
      this.blade.position.copy(slot.model.position); this.blade.quaternion.copy(slot.model.quaternion); this.blade.scale.copy(slot.model.scale);
      slot.mount.add(this.blade);
    }
    this.weapons._rebindTrail(this.blade ?? slot.model, this.g.player.weapon);
  }
}
