import { Vector3, Quaternion } from 'three';

import { settings } from '../config/settings.js';

const _delta = new Vector3();
const _right = new Vector3();
const _q = new Quaternion();

/** Voices allowed at once. A combo inside a crowd must not pile up into mud. */
const MAX_VOICES = 16;

/**
 * The fight's sounds, made rather than loaded.
 *
 * There is no sound file anywhere in the project, and this adds none: every
 * sound is a few Web Audio nodes over one buffer of white noise, shaped by a
 * filter and an envelope. A sword through air is band-passed noise swept up
 * and back down; a body taking a boot is a sine dropping in pitch under a
 * short thump of low noise; a cut is a hiss off the top of the band and a
 * brief ring of two detuned partials, which is what steel sounds like to
 * anyone who has not stood next to it.
 *
 * Three things about *how* they play are what make them read as the blow
 * rather than as a sound effect:
 *
 *  - **Timing.** The swing is fired by the move itself a beat before contact
 *    (`swingAt`), so the whoosh leads the blade the way it does in life, and the
 *    impact lands on the exact frame the hit-stop does.
 *  - **Variation.** Pitch and filter move a little every time, and the three
 *    swing shapes never repeat back to back — the same sample twice in a combo
 *    is the fastest way to hear the machinery.
 *  - **Place.** Panned by where the hit is relative to the camera and quieter
 *    with distance, so a shadow's cut thirty metres off sounds thirty metres
 *    off.
 *
 * Browsers will not make a sound before the page has been touched, so nothing
 * is built until the first key or pointer press (`unlock`). Until then every
 * call is a silent no-op, which is also exactly what happens with sound off.
 */
export class CombatAudio {
  /** @param {import('three').Camera} camera the listener, for panning */
  constructor(camera) {
    this.camera = camera;
    /** @type {AudioContext|null} */
    this.context = null;
    this.master = null;
    this.noise = null;
    this.voices = 0;
    this._lastSwing = -1;

    this._unlock = () => this.unlock();
    window.addEventListener('pointerdown', this._unlock, true);
    window.addEventListener('keydown', this._unlock, true);

    this._onVisibility = () => {
      if (!this.context) return;
      if (document.hidden) this.context.suspend().catch(() => {});
      else this.context.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  /** Build the graph on the first gesture. Safe to call any number of times. */
  unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;

    if (!this.context) {
      try {
        this.context = new Context();
      } catch {
        return;
      }
      const context = this.context;

      // A gentle compressor on the bus: a finisher and a cleave landing on the
      // same frame should get louder, not clip.
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.connect(context.destination);

      this.master = context.createGain();
      this.master.gain.value = 0;
      this.master.connect(compressor);

      // One second of white noise, shared by every voice.
      const length = context.sampleRate;
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    window.removeEventListener('pointerdown', this._unlock, true);
    window.removeEventListener('keydown', this._unlock, true);
  }

  /** Whether a call can make a sound right now. */
  get _ready() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.master) return false;
    const config = settings.audio;
    this.master.gain.value = config.enabled ? Math.max(0, config.volume) : 0;
    return config.enabled && config.volume > 0 && this.voices < MAX_VOICES;
  }

  /* ------------------------------------------------------------------ */
  /* the sounds                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * The blade (or the boot) going through the air.
   *
   * @param {{x: number, y: number, z: number}} point where the swing is
   * @param {number} weight 0 for a kick, 1 for a two-handed sweep: heavier is lower and longer
   */
  swing(point, weight = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;

    // Three shapes, never the same one twice running.
    const shape = (this._lastSwing + 1 + Math.floor(Math.random() * 2)) % 3;
    this._lastSwing = shape;
    const pitch = (1.12 - weight * 0.3) * (0.93 + Math.random() * 0.14) * [0.9, 1, 1.12][shape];
    const length = 0.2 + weight * 0.1;

    const out = this._voice(point, 0.36 + weight * 0.12, now + length + 0.1);
    const source = this._noise(now, length + 0.05);

    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4 + shape * 0.5;
    // The sweep is the whole sound: up as the blade accelerates, down as it
    // leaves the ear.
    band.frequency.setValueAtTime(420 * pitch, now);
    band.frequency.exponentialRampToValueAtTime(2600 * pitch, now + length * 0.42);
    band.frequency.exponentialRampToValueAtTime(700 * pitch, now + length);

    const gain = context.createGain();
    envelope(gain.gain, now, 0.035, length * 0.4, length);

    source.connect(band).connect(gain).connect(out);
  }

  /**
   * Contact.
   *
   * @param {{x: number, y: number, z: number}} point where the blow landed
   * @param {object} options
   * @param {boolean} options.cut an edge rather than a boot
   * @param {number} options.strength 0..1-ish; 1 is a kill, less a stagger
   */
  impact(point, { cut = false, strength = 1 } = {}) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const s = Math.max(0.2, Math.min(1.4, strength));
    const out = this._voice(point, 0.55 + 0.35 * s, now + 0.7);

    /* ---- the body: a pitch drop under a thump ---- */
    const body = context.createOscillator();
    body.type = 'sine';
    const low = (cut ? 95 : 120) * (0.94 + Math.random() * 0.12);
    body.frequency.setValueAtTime(low * 1.8, now);
    body.frequency.exponentialRampToValueAtTime(low * 0.42, now + 0.16 + 0.06 * s);
    const bodyGain = context.createGain();
    envelope(bodyGain.gain, now, 0.004, 0.02, 0.2 + 0.1 * s, (cut ? 0.55 : 0.9) * s);
    body.connect(bodyGain).connect(out);
    body.start(now);
    body.stop(now + 0.4);

    const thump = this._noise(now, 0.1);
    const thumpFilter = context.createBiquadFilter();
    thumpFilter.type = 'lowpass';
    thumpFilter.frequency.value = cut ? 900 : 520;
    const thumpGain = context.createGain();
    envelope(thumpGain.gain, now, 0.002, 0.01, 0.08, 0.8 * s);
    thump.connect(thumpFilter).connect(thumpGain).connect(out);

    if (!cut) return;

    /* ---- the edge: a hiss off the top, and the steel ringing ---- */
    const hiss = this._noise(now, 0.16);
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.setValueAtTime(5200, now);
    high.frequency.exponentialRampToValueAtTime(2400, now + 0.14);
    const hissGain = context.createGain();
    envelope(hissGain.gain, now, 0.002, 0.012, 0.14, 0.5 * s);
    hiss.connect(high).connect(hissGain).connect(out);

    const ring = 1650 * (0.96 + Math.random() * 0.08);
    for (const [ratio, level] of [
      [1, 0.09],
      [1.51, 0.06],
      [2.73, 0.035]
    ]) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.value = ring * ratio;
      const partialGain = context.createGain();
      envelope(partialGain.gain, now, 0.002, 0.01, 0.45 + 0.1 * s, level * s);
      partial.connect(partialGain).connect(out);
      partial.start(now);
      partial.stop(now + 0.65);
    }
  }

  /* ------------------------------------------------------------------ */
  /* plumbing                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * A voice's output: gain for distance, a panner for side, counted so the
   * cap holds.
   */
  _voice(point, volume, end) {
    const context = this.context;
    const gain = context.createGain();
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;

    let level = volume;
    if (point && this.camera) {
      _delta.set(point.x, point.y, point.z).sub(this.camera.position);
      const distance = _delta.length();
      level = volume / (1 + Math.max(0, distance - 4) * 0.12);
      if (pan && distance > 1e-3) {
        _right.set(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(_q));
        pan.pan.value = Math.max(-0.8, Math.min(0.8, _delta.normalize().dot(_right)));
      }
    }
    gain.gain.value = level;

    if (pan) gain.connect(pan).connect(this.master);
    else gain.connect(this.master);

    this.voices++;
    const release = Math.max(0, (end - context.currentTime) * 1000);
    setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
      gain.disconnect();
      pan?.disconnect();
    }, release + 50);

    return gain;
  }

  /** A one-shot of the shared noise, from a random place in it. */
  _noise(start, length) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const offset = Math.random() * Math.max(0, this.noise.duration - length);
    source.start(start, offset, length);
    return source;
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock, true);
    window.removeEventListener('keydown', this._unlock, true);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.context?.close().catch(() => {});
    this.context = null;
  }
}

/** Attack → peak → hold → release to silence, on an AudioParam. */
function envelope(param, now, attack, hold, end, peak = 1) {
  param.setValueAtTime(0.0001, now);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  param.setValueAtTime(Math.max(0.0002, peak), now + Math.max(attack, hold));
  param.exponentialRampToValueAtTime(0.0001, now + end);
}
