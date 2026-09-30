import { AnimationMixer, Group, LoopOnce, LoopRepeat, Vector3 } from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';

import { settings } from '../config/settings.js';
import { damp } from '../utils/math.js';

const _axis = new Vector3();

/**
 * The opponent, drawn from what the network says it is doing.
 *
 * A clone of the player's own rig — body, armour and katana, the way
 * `vfx/ShadowCharacter.js` clones it — on its own mixer with the player's own
 * clips, so both fighters look and move alike. It is driven entirely by
 * states: where it stands, which way it faces, how fast it moves, which move
 * it is in and how far through, whether its guard is up, whether it is down.
 *
 * States are buffered and drawn `interpDelay` behind the server clock,
 * interpolated between the two either side (position, facing) — the standard
 * entity interpolation that hides a 15 Hz feed and network jitter. The server
 * rewinds hits to exactly that render time (`renderTime`, see `PvpMode`), so
 * what the attacker saw is what is judged.
 *
 * Its `position` and `alive` make it lockable and targetable exactly like an
 * enemy (`isOpponent` tells the hit code to send a claim instead).
 */
export class RemoteAvatar {
  /**
   * @param {import('../animation/CharacterController.js').CharacterController} character the local body to clone
   */
  constructor(character) {
    this.character = character;
    this.isOpponent = true;
    this.alive = true;
    this.position = new Vector3();
    this.facing = 0;
    this.pivot = new Group();
    this.pivot.name = 'Opponent';
    this.tilt = new Group();
    this.pivot.add(this.tilt);
    this.states = [];
    this.guarding = false;
    this.down = false;
    this._downT = 0;
    this._built = false;
    this._actions = new Map();
    this._move = null;
  }

  /** Clone the body now (the character must have loaded). */
  build() {
    if (this._built || !this.character.model) return;
    const model = cloneRigged(this.character.model);
    const cut = [];
    model.traverse((node) => {
      if (node.name === 'FireEmitterBox' || node.userData.isFireVolume) {
        cut.push(node);
        return;
      }
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.frustumCulled = false;
      node.castShadow = true;
      node.raycast = () => {};
      // A shade darker and redder than the player, so the two are never mistaken.
      const tint = (m) => {
        const c = m.clone();
        c.color?.multiplyScalar(0.8);
        c.emissive?.setRGB(0.12, 0.02, 0.01);
        return c;
      };
      node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material);
    });
    for (const node of cut) node.parent?.remove(node);
    // The clone copies the model's own placement under the character's tilt.
    this.tilt.add(model);
    this.model = model;

    this.mixer = new AnimationMixer(model);
    const clips = this.character.clips;
    for (const name of ['idle', 'walk', 'run', 'crouch', 'kick', 'slashHit', 'crouchSlash']) {
      const clip = clips.get(name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      const oneShot = ['kick', 'slashHit', 'crouchSlash'].includes(name);
      action.setLoop(oneShot ? LoopOnce : LoopRepeat, oneShot ? 1 : Infinity);
      action.clampWhenFinished = oneShot;
      action.setEffectiveWeight(0);
      action.play();
      if (oneShot) action.paused = true;
      this._actions.set(name, action);
    }
    this._weights = { idle: 1, walk: 0, run: 0, crouch: 0, move: 0 };
    this._built = true;
  }

  /** A state from the network, stamped with the server time it arrived. */
  push(state) {
    this.states.push(state);
    if (this.states.length > 40) this.states.shift();
  }

  /** Jump straight to a state — a new round, a snapshot. */
  place(x, z, facing) {
    this.states.length = 0;
    this.position.set(x, 0, z);
    this.facing = facing;
    this.down = false;
    this._downT = 0;
    this.alive = true;
    this.tilt.quaternion.identity();
  }

  /**
   * @param {number} dt
   * @param {number} renderTime server-clock ms to draw at
   * @param {(x: number, z: number) => number} groundAt
   */
  update(dt, renderTime, groundAt) {
    if (!this._built) return;
    const s = this._sample(renderTime);
    if (s) {
      this.position.x = s.x;
      this.position.z = s.z;
      this.facing = s.facing;
      this.guarding = !!s.guarding;
      if (s.down && !this.down) this._downT = 0;
      this.down = !!s.down;
    }
    this.position.y = groundAt(this.position.x, this.position.z);
    this.pivot.position.copy(this.position);
    this.pivot.rotation.y = this.facing - (this.character._forwardYaw ?? 0);
    this.alive = !this.down;

    // Clip weights: the move if there is one, otherwise the gait by speed,
    // with the guard's crouch laid over it.
    const latest = this.states[this.states.length - 1];
    const speed = s?.speed ?? 0;
    const moveKey = latest?.move ?? null;
    // A move names its clip, or is the clip (kick, slashHit, crouchSlash); a
    // string step without one is the slash, as `CharacterController` builds it.
    const clipName = moveKey ? settings[moveKey]?.clip ?? (this._actions.has(moveKey) ? moveKey : 'slashHit') : null;
    const moveAction = clipName ? this._actions.get(clipName) : null;
    if (moveAction !== this._move) {
      if (this._move) this._move.setEffectiveWeight(0);
      this._move = moveAction;
    }
    if (moveAction) {
      moveAction.time = Math.max(0, Math.min(1, latest.phase ?? 0)) * moveAction.getClip().duration;
    }

    const w = this._weights;
    const run = settings.locomotion.runSpeed;
    const walk = settings.locomotion.walkSpeed;
    const target = {
      move: moveAction ? 1 : 0,
      run: !moveAction && speed > (walk + run) / 2 ? 1 : 0,
      walk: !moveAction && speed > 0.2 && speed <= (walk + run) / 2 ? 1 : 0,
      crouch: this.guarding && !moveAction ? 1.1 : 0
    };
    target.idle = Math.max(0, 1 - target.move - target.run - target.walk);
    for (const key of Object.keys(target)) w[key] = damp(w[key], target[key], 1e-5, dt);
    this._actions.get('idle')?.setEffectiveWeight(w.idle);
    this._actions.get('walk')?.setEffectiveWeight(w.walk);
    this._actions.get('run')?.setEffectiveWeight(w.run);
    this._actions.get('crouch')?.setEffectiveWeight(w.crouch);
    moveAction?.setEffectiveWeight(w.move);
    this.mixer.update(dt);

    // Down: over backward about the feet, as the player falls.
    if (this.down) {
      this._downT += dt;
      const angle = 1.5 * Math.min(1, (this._downT / 0.55) ** 2);
      const f = this.character._forwardYaw ?? 0;
      _axis.set(-Math.cos(f), 0, Math.sin(f));
      this.tilt.quaternion.setFromAxisAngle(_axis, angle);
    } else {
      this.tilt.quaternion.identity();
    }
  }

  /** Interpolated state at server time `t`. */
  _sample(t) {
    const list = this.states;
    if (!list.length) return null;
    if (t <= list[0].s) return list[0];
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1];
      const b = list[i];
      if (t >= a.s) {
        if (t >= b.s) return b;
        const u = (t - a.s) / Math.max(1, b.s - a.s);
        const df = Math.atan2(Math.sin(b.facing - a.facing), Math.cos(b.facing - a.facing));
        return {
          ...b,
          x: a.x + (b.x - a.x) * u,
          z: a.z + (b.z - a.z) * u,
          facing: a.facing + df * u,
          speed: a.speed + (b.speed - a.speed) * u
        };
      }
    }
    return list[list.length - 1];
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.pivot.removeFromParent();
    this.model?.traverse((node) => {
      if (!node.material) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose();
    });
  }
}
