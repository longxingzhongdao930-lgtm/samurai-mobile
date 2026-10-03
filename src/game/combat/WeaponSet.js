import { FlyingGauntlet } from './FlyingGauntlet.js';
import { Color, Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const _up = new Vector3(0, 1, 0);

/**
 * The models of the armoury, and the two weapons that do something a blade's
 * arc cannot: the thrown stars and the kusarigama's chain.
 *
 * Every model in `public/models/weapons/` is baked into the katana's own
 * frame (grip at the origin, tip toward +Z), so a weapon is shown by parenting
 * it inside the katana's mount and hiding the katana — whatever hides the
 * mount (the bow, say) hides it too. The gauntlets are the exception: a pair,
 * strapped to the forearms.
 */
export class WeaponSet {
  constructor(game) {
    this.game = game;
    this.character = game.app.character;
    this.loader = new GLTFLoader();
    this.models = new Map(); // id → Object3D (template)
    this.pending = new Map(); // id → Promise
    this.current = 'katana';
    this.shown = null; // { id, objects: [] }
    this.stars = [];
    this.group = new Group();
    this.group.name = 'Thrown';
    game.app.scene.add(this.group);
  }

  _slot() {
    return this.game.app.characterScreen?.equipment.get('sword') ?? null;
  }

  load(id) {
    if (this.models.has(id)) return Promise.resolve(this.models.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const file = id === 'gauntlet' ? 'gauntlet_pair' : id;
    const promise = this.loader
      .loadAsync(`./models/weapons/${file}.glb`)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.frustumCulled = false;
          // The steel reads as black without the environment the katana's
          // material is given; a little roughness keeps it lit by the lamps.
          if (o.material?.metalness > 0.8) o.material.roughness = Math.max(o.material.roughness, 0.32);
        });
        this.models.set(id, gltf.scene);
        return gltf.scene;
      })
      .catch((error) => {
        console.warn(`[WeaponSet] ${id} failed to load`, error);
        return null;
      });
    this.pending.set(id, promise);
    return promise;
  }

  /** Preload everything after the first frames, so a switch is instant. */
  preload(ids) {
    let delay = 0;
    for (const id of ids) {
      if (id === 'katana') continue;
      setTimeout(() => this.load(id), (delay += 400));
    }
  }

  /** Show weapon `spec`; resolves when its model is on. */
  async equip(spec) {
    this.current = spec.id;
    const slot = this._slot();
    this._clear();
    if (spec.id === 'katana' || !spec.model) {
      if (slot?.model) slot.model.visible = true;
      this._rebindTrail(slot?.model, spec);
      return;
    }
    const template = await this.load(spec.id);
    if (this.current !== spec.id) return; // switched again meanwhile
    if (!template || !slot) {
      if (slot?.model) slot.model.visible = true;
      return;
    }
    slot.model.visible = false;
    const objects = [];
    if (spec.mount === 'forearms') {
      const model = template.clone(true);
      this.fist = new FlyingGauntlet(this.game, model);
      objects.push(model);
    } else {
      const model = template.clone(true);
      model.position.copy(slot.model.position);
      model.quaternion.copy(slot.model.quaternion);
      model.scale.copy(slot.model.scale);
      slot.mount.add(model);
      objects.push(model);
    }
    this.shown = { id: spec.id, objects };
    this._rebindTrail(objects[0], spec);
  }

  /** Lay a forearm piece from elbow to wrist, in the bone's own frame. */
  _alongBone(holder, bone, hand, mirror) {
    // The hand's offset in the forearm's frame is the forearm's direction.
    const dir = _d.copy(hand.position).normalize();
    const length = hand.position.length();
    const scale = bone.getWorldScale(_a).x || 1;
    // The model is 0.4 m long from wrist-end (+Z) to elbow-end (-Z); the
    // forearm's own length in metres decides how big it is drawn.
    // Elbow to fingertips, and a size up so it sits over the arm's own armour.
    const metres = length * scale;
    const total = metres + 0.2;
    const k = total / 0.4 / scale;
    holder.scale.set(k * 1.35 * (mirror ? -1 : 1), k * 1.35, k);
    holder.quaternion.setFromUnitVectors(_b.set(0, 0, 1), dir);
    holder.position.copy(dir).multiplyScalar((total / 2 + 0.02) / scale);
  }

  _clear() {
    this.fist?.dispose(); this.fist = null;
    if (!this.shown) return;
    for (const o of this.shown.objects) o.removeFromParent();
    this.shown = null;
  }

  _rebindTrail(object, spec) {
    const fx = this.game.fx;
    if (!fx?.trail || !object) return;
    const hand = this.character.getBone('RightHand');
    hand?.getWorldPosition(_a);
    fx.trail.bind(object, _a);
    fx._bladeBound = true;
    const colour = fx.trail.material?.uniforms?.uColor?.value;
    if (!colour) return;
    this._baseTrail ??= colour.clone();
    colour.copy(spec.trailColor ? new Color(spec.trailColor) : this._baseTrail);
  }

  /* ------------------------------------------------------------------ */
  /* the chain                                                           */
  /* ------------------------------------------------------------------ */

  /** Where the weight lands (the chain itself is drawn by WeaponMotion). */
  chain(to) {
    this.game.fx.glow.spawn(to, '#e8e8e8', 0.5, 0.15, { grow: 1, intensity: 1.2 });
  }

  /* ------------------------------------------------------------------ */
  /* thrown stars                                                        */
  /* ------------------------------------------------------------------ */

  /** Throw `count` stars along the facing (at `target` if given). */
  throwStars(config, target) {
    const template = this.models.get('shuriken');
    const hand = this.character.getBone('RightHand');
    const from = new Vector3();
    if (hand) hand.getWorldPosition(from);
    else from.copy(this.character.position).setY(this.character.position.y + 1.3);
    const yaw = this.character.facing;
    const { count = 1, spread = 0 } = config.throw;
    let dir = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (target?.alive) {
      const h = target.agent?.type.height ?? 1.8;
      dir.set(target.position.x - from.x, target.position.y + h * 0.55 - from.y, target.position.z - from.z).normalize();
    }
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      const d = dir.clone().applyAxisAngle(_up, offset);
      const mesh = template ? template.clone(true) : new Group();
      mesh.scale.setScalar(1.3);
      mesh.position.copy(from);
      this.group.add(mesh);
      this.stars.push({
        mesh,
        pos: from.clone(),
        vel: d.multiplyScalar(30),
        life: 0.75,
        spin: 0,
        target: target?.alive ? target : null,
        config,
        hit: new Set()
      });
    }
    this.game.audio?.play('slash', { volume: 0.5, pitch: 1.6 });
  }

  update(dt) {
    this.fist?.update(dt);
    const enemies = this.game.enemies.enemies;
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i];
      s.life -= dt;
      // A slight home onto the body it was thrown at.
      if (s.target?.alive) {
        const h = s.target.agent?.type.height ?? 1.8;
        _d.set(s.target.position.x - s.pos.x, s.target.position.y + h * 0.55 - s.pos.y, s.target.position.z - s.pos.z).normalize().multiplyScalar(30);
        s.vel.lerp(_d, Math.min(1, dt * 4));
      }
      s.pos.addScaledVector(s.vel, dt);
      s.spin += dt * 28;
      s.mesh.position.copy(s.pos);
      s.mesh.rotation.set(Math.PI / 2, s.spin, 0);
      let done = s.life <= 0;
      for (const enemy of enemies) {
        if (done) break;
        if (!enemy.alive || !enemy.agent || s.hit.has(enemy)) continue;
        const h = enemy.agent.type.height ?? 1.8;
        const dx = enemy.position.x - s.pos.x;
        const dz = enemy.position.z - s.pos.z;
        const dy = s.pos.y - enemy.position.y;
        if (dx * dx + dz * dz > (enemy.agent.radius + 0.25) ** 2 || dy < 0 || dy > h) continue;
        s.hit.add(enemy);
        const length = Math.hypot(s.vel.x, s.vel.z) || 1;
        const result = this.game.damageEnemy(enemy, {
          damage: s.config.damage,
          posture: s.config.posture,
          knockback: s.config.knockback,
          launch: false,
          dirX: s.vel.x / length,
          dirZ: s.vel.z / length,
          force: s.config,
          slice: false,
          source: 'thrown'
        });
        if (result) this.game.player.onRangedHit?.(s.config);
        done = true;
      }
      if (done) {
        s.mesh.removeFromParent();
        this.stars.splice(i, 1);
      }
    }
  }

  clear() {
    this.fist?.clear();
    for (const s of this.stars) s.mesh.removeFromParent();
    this.stars.length = 0;
  }
}
