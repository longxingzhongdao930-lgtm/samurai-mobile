import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';

import { DRAGON_CLIPS } from '../config/creatures.js';
export { DRAGON_CLIPS } from '../config/creatures.js';

/** A separate mixer for this rig; no Mixamo retargeting or human ragdoll. */
export class CreatureMotion {
  constructor(model, clips, { blend = 0.2, mapping = DRAGON_CLIPS, rootTracks = [{ name: 'Root.position', axes: [0, 2] }] } = {}) {
    this.mixer = new AnimationMixer(model);
    this.blend = blend;
    this.mapping = mapping;
    this._queue = [];
    this.actions = new Map();
    this.state = null;
    this.action = null;
    this.locked = false;
    this.dead = false;
    this.completed = false;
    this._finished = false;
    const idle = clips.find(clip => clip.name === mapping.idle);
    for (const source of clips) {
      const clip = source.clone();
      const start = Math.min(...clip.tracks.filter(t => t.times.length).map(t => t.times[0]));
      if (Number.isFinite(start) && start !== 0) {
        for (const track of clip.tracks) track.shift(-start);
        clip.resetDuration();
      }
      // The controller owns horizontal movement. Keep authored vertical motion
      // and all limb animation, but remove root travel to avoid double movement
      // and a jump back to the origin at every loop boundary.
      for (const track of clip.tracks) {
        const root = rootTracks.find(r => r.name === track.name);
        if (!root) continue;
        const reference = idle?.tracks.find(candidate => candidate.name === track.name)?.values ?? track.values;
        for (let i = 0; i < track.values.length; i += 3) {
          for (const axis of root.axes) track.values[i + axis] = reference[axis];
        }
      }
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    for (const name of Object.values(mapping).flat(Infinity)) {
      if (!this.actions.has(name)) throw new Error(`Creature animation missing: ${name}`);
    }
    this._onFinished = ({ action }) => {
      if (action === this.action) this._finished = true;
    };
    this.mixer.addEventListener('finished', this._onFinished);
    this.play(this.mapping.idle);
  }

  play(name, { once = false, force = false, death = false } = {}) {
    if (this.dead || (this.locked && !force)) return false;
    const sequence = Array.isArray(name) ? name : [name];
    if (!sequence.length) return false;
    name = sequence[0];
    const next = this.actions.get(name);
    if (!next) throw new Error(`Unknown creature animation: ${name}`);
    if (this.action === next && !once) return false;
    this._queue = once ? sequence.slice(1) : [];
    const previous = this.action;
    this.state = name;
    this.action = next;
    this.locked = once;
    this.dead = death;
    this.completed = false;
    this._finished = false;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (previous && previous !== next) {
      // Bound the fade by the shortest action (Hit01 is only one third second).
      const fade = Math.min(this.blend, next.getClip().duration / 3);
      previous.fadeOut(fade);
      next.fadeIn(fade);
    }
    return true;
  }

  update(dt, speed = 1) {
    this.mixer.timeScale = speed;
    this.mixer.update(dt);
    if (!this._finished) return;
    this._finished = false;
    if (this.dead) {
      this.completed = true; // keep the final death pose until corpse removal
      return;
    }
    this.locked = false;
    if (this._queue.length) {
      this.play(this._queue, { once: true });
    } else {
      this.play(this.mapping.idle);
    }
  }

  dispose() {
    this.mixer.removeEventListener('finished', this._onFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
