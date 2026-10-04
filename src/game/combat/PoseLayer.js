import { LoopOnce, LoopRepeat } from 'three';

/**
 * A held pose on the character's mixer — the guard, the dodge, the stagger.
 *
 * Shaped like the other overrides `Locomotion` reads (`weight`, `takeover`),
 * so pushing one onto `locomotion.overrides` masks the gait exactly as an
 * attack does. It either holds one frame of a clip (`at`) or plays a slice of
 * it (`from`→`to`), and it fades in and out linearly so the fade finishes.
 */
export class PoseLayer {
  /**
   * @param {import('three').AnimationMixer} mixer
   * @param {import('three').AnimationClip|null} clip (cloned, so its action is its own)
   */
  constructor(mixer, clip, { blendIn = 0.08, blendOut = 0.16, loop = false } = {}) {
    this.action = clip ? mixer.clipAction(clip.clone()) : null;
    if (this.action) {
      this.action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      this.action.clampWhenFinished = true;
      this.action.enabled = false;
      this.action.setEffectiveWeight(0);
    }
    this.blendIn = blendIn;
    this.blendOut = blendOut;
    this.weight = 0;
    this.active = false;
    this._duration = clip?.duration ?? 1;
  }

  get takeover() {
    return this.weight;
  }

  /** Hold a single frame, `at` a fraction of the clip. */
  hold(at) {
    if (!this.action) return;
    this._begin();
    this.action.time = at * this._duration;
    this.action.paused = true;
  }

  /** Play a slice of the clip over `seconds` (or at `timeScale`). */
  play(from = 0, to = 1, { seconds = 0, timeScale = 1 } = {}) {
    if (!this.action) return;
    this._begin();
    this.action.paused = false;
    this.action.time = from * this._duration;
    this._to = to * this._duration;
    const span = Math.max(1e-3, (to - from) * this._duration);
    this.action.setEffectiveTimeScale(seconds > 0 ? span / seconds : timeScale);
  }

  _begin() {
    if (!this.active || !this.action.enabled) {
      this.action.reset();
      this.action.enabled = true;
      this.action.play();
      this.action.setEffectiveWeight(this.weight);
    }
    this.active = true;
    this._to = Infinity;
  }

  stop() {
    this.active = false;
  }

  cancel() {
    this.active = false;
    this.weight = 0;
    if (this.action) {
      this.action.stop();
      this.action.enabled = false;
      this.action.setEffectiveWeight(0);
    }
  }

  update(dt) {
    const action = this.action;
    if (!action || (!this.active && this.weight <= 0)) return;
    if (this.active && action.time >= this._to) {
      action.time = this._to;
      action.paused = true;
    }
    const target = this.active ? 1 : 0;
    const rate = dt / Math.max(1e-3, target > this.weight ? this.blendIn : this.blendOut);
    // At full weight, clamp to the target instead of dipping back toward idle.
    this.weight = target > this.weight ? Math.min(target, this.weight + rate) : Math.max(target, this.weight - rate);
    action.setEffectiveWeight(this.weight);
    if (!this.active && this.weight <= 0) {
      action.stop();
      action.enabled = false;
    }
  }
}
