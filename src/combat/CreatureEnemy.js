import { Box3, Group, MathUtils, Vector3 } from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { CreatureMotion } from '../animation/CreatureMotion.js';
import { CREATURES } from '../config/creatures.js';
import { settings } from '../config/settings.js';
import { damp } from '../utils/math.js';

/** One creature occupies one population slot and uses the usual targeting API. */
export class CreatureEnemy {
  constructor({ source, clips, terrain, definition = CREATURES[0] }) {
    this.kind = definition.id;
    this.isDragon = this.kind === 'dragon';
    this.definition = definition;
    this.terrain = terrain;
    this.state = 'alive';
    this.root = new Group();
    this.root.name = definition.label;
    this.model = cloneRigged(source);
    this.root.add(this.model);
    this.model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // The animation's wings extend beyond the bind-pose bounding sphere.
      node.frustumCulled = false;
    });
    this.motion = new CreatureMotion(this.model, clips, { mapping: definition.clips, rootTracks: definition.rootTracks });
    this.motion.update(0);
    this.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(this.model);
    this._height = Math.max(0.001, bounds.max.y - bounds.min.y);
    this._baseY = bounds.min.y;
    // Humanoids average both feet; Achates uses pelvis→head for its quadruped forward axis.
    const direction = new Vector3();
    for (const [heelName, toeName] of definition.facingBones) {
      const heel = this.model.getObjectByName(heelName);
      const toe = this.model.getObjectByName(toeName);
      if (heel && toe) {
        direction.add(toe.getWorldPosition(new Vector3())
          .sub(heel.getWorldPosition(new Vector3())).setY(0).normalize());
      }
    }
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    this.forwardYaw = Math.atan2(direction.x, direction.z);
    this.facing = 0;
    this.health = this.config.hitsToDefeat;
    this.cooldown = this.config.attackCooldown;
    this.timer = 0;
    this._attack = 0;
    this._hit = 0;
    this.update(0, null);
  }

  get config() { return settings.creatures[this.kind]; }
  get alive() { return this.state === 'alive'; }
  get finished() { return this.state === 'gone'; }
  get position() { return this.root.position; }
  get height() { return this.config.height; }
  get bodyRadius() { return this.config.bodyRadius; }

  place(x, z, yaw) {
    this.position.set(x, this.terrain?.heightAt(x, z) ?? 0, z);
    this.facing = yaw;
    this.root.rotation.y = yaw - this.forwardYaw;
  }

  update(dt, player) {
    const config = this.config;
    const scale = config.height / this._height;
    this.model.scale.setScalar(scale);
    this.model.position.y = -this._baseY * scale;
    this.motion.blend = config.blend;
    this.motion.update(dt, settings.global.animationSpeed);
    this.position.y = this.terrain?.heightAt(this.position.x, this.position.z) ?? 0;
    if (!this.alive) {
      // Never remove a long death clip before its final frame.
      if (this.motion.completed) {
        this.timer += dt;
        if (this.timer >= settings.enemies.corpseTime) this.state = 'gone';
      }
      return;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.motion.locked) return;
    const dx = (player?.x ?? this.position.x) - this.position.x;
    const dz = (player?.z ?? this.position.z) - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (!config.enabled || !player || distance > config.noticeRadius) {
      this.motion.play(this.definition.clips.idle);
      return;
    }
    const wanted = Math.atan2(dx, dz);
    const delta = MathUtils.euclideanModulo(wanted - this.facing + Math.PI, Math.PI * 2) - Math.PI;
    this.facing = damp(this.facing, this.facing + delta, settings.enemies.turnRate, dt);
    this.root.rotation.y = this.facing - this.forwardYaw;
    if (distance > config.attackRange) {
      const running = distance > config.runDistance;
      const speed = running ? config.runSpeed : config.walkSpeed;
      const step = Math.min(distance - config.attackRange, speed * dt * settings.global.animationSpeed);
      this.position.x += dx / distance * step;
      this.position.z += dz / distance * step;
      this.position.y = this.terrain?.heightAt(this.position.x, this.position.z) ?? 0;
      this.motion.play(running ? this.definition.clips.run : this.definition.clips.walk);
    } else if (this.cooldown === 0) {
      const turn = this._attack++;
      const clips = this.definition.clips;
      const useSkill = config.useSkills && clips.skills.length && turn % 3 === 2;
      const move = useSkill
        ? clips.skills[Math.floor(turn / 3) % Math.min(2, clips.skills.length)]
        : clips.attacks[turn % clips.attacks.length];
      this.motion.play(move, { once: true });
      this.cooldown = config.attackCooldown;
    } else {
      this.motion.play(this.definition.clips.idle);
    }
  }

  receiveHit() {
    if (!this.alive) return false;
    this.health -= 1;
    if (this.health <= 0) return this.die();
    const hits = this.definition.clips.hits;
    // Infinian has no authored hit reaction; interrupt into its real idle
    // instead of inventing a hit clip or borrowing another creature's rig.
    this.motion.play(hits.length ? hits[this._hit++ % hits.length] : this.definition.clips.idle,
      { once: hits.length > 0, force: true });
    this.cooldown = this.config.attackCooldown;
    return true;
  }

  // Available for explicit skill triggers; cinematic/unknown clips aren't
  // randomly mixed into combat. Skills return to idle just like attacks.
  playSkill(index = 0) {
    const name = this.definition.clips.skills[index];
    return this.alive && !!name && this.motion.play(name, { once: true });
  }

  die() {
    if (!this.alive) return false;
    this.state = 'dead';
    this.timer = 0;
    this.motion.play(this.definition.clips.deaths[0], { once: true, force: true, death: true });
    return true;
  }

  retire() { this.die(); }

  dispose() {
    this.state = 'gone';
    this.motion.dispose();
    this.model.traverse((node) => {
      if (node.isSkinnedMesh) node.skeleton.dispose();
    });
    // Geometry, materials and textures belong to the manager's shared source.
    this.root.removeFromParent();
  }
}
