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
    this._stepSide = 0;
    /** The effects bus and the music bus, under the master. */
    this.sfxBus = null;
    this.musicBus = null;
    /** Called once the graph exists — the music and the ambience start there. */
    this._readyHandlers = [];

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
      this.sfxBus = context.createGain();
      this.sfxBus.connect(this.master);
      // The music skips the compressor: it is mixed quiet, and a finisher
      // squashing the drums under it would pump.
      this.musicBus = context.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(context.destination);

      // One second of white noise, shared by every voice.
      const length = context.sampleRate;
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    window.removeEventListener('pointerdown', this._unlock, true);
    window.removeEventListener('keydown', this._unlock, true);
    this.syncLevels();
    for (const ready of this._readyHandlers.splice(0)) ready(this.context);
  }

  /** Run `fn(context)` once the audio exists (now, if it already does). */
  whenReady(fn) {
    if (this.context && this.master) fn(this.context);
    else this._readyHandlers.push(fn);
  }

  /** Push `settings.audio` into the buses (the settings screen calls this). */
  syncLevels() {
    if (!this.master) return;
    const config = settings.audio;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(config.enabled ? Math.max(0, config.volume) : 0, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(Math.max(0, config.sfx), t, 0.03);
    // The music bus has no compressor behind it, so the master is applied here too.
    this.musicBus.gain.setTargetAtTime(config.enabled ? Math.max(0, config.volume * config.music) : 0, t, 0.05);
  }

  /** Whether a call can make a sound right now. */
  get _ready() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.master) return false;
    const config = settings.audio;
    return config.enabled && config.volume > 0 && config.sfx > 0 && this.voices < MAX_VOICES;
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

  /**
   * Steel meeting steel — a blow caught on the guard, or (`bright`) turned
   * aside by a parry: a hard tick of noise and a ring of inharmonic partials,
   * higher and longer for the parry.
   */
  clang(point, { bright = false, strength = 1 } = {}) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const s = Math.max(0.3, Math.min(1.5, strength));
    const out = this._voice(point, 0.5 + 0.3 * s, now + 1.2);

    const tick = this._noise(now, 0.05);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = bright ? 4200 : 2600;
    band.Q.value = 1.2;
    const tickGain = context.createGain();
    envelope(tickGain.gain, now, 0.001, 0.005, 0.05, 0.9 * s);
    tick.connect(band).connect(tickGain).connect(out);

    const base = (bright ? 1180 : 820) * (0.97 + Math.random() * 0.06);
    const ring = bright ? 0.9 : 0.45;
    for (const [ratio, level] of [
      [1, 0.16],
      [2.76, 0.09],
      [5.4, 0.05]
    ]) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.value = base * ratio;
      const gain = context.createGain();
      envelope(gain.gain, now, 0.001, 0.008, ring, level * s);
      partial.connect(gain).connect(out);
      partial.start(now);
      partial.stop(now + ring + 0.05);
    }
  }

  /**
   * A soul taken in: a short glassy chime that rises a little. `pitch` sets
   * the colour of it (red, yellow and blue ring at different notes).
   */
  chime(point, { pitch = 1, strength = 1 } = {}) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const s = Math.max(0.2, Math.min(1.2, strength));
    const out = this._voice(point, 0.35 * s, now + 0.6);
    const base = 880 * pitch;
    for (const [ratio, level, ring] of [
      [1, 0.14, 0.35],
      [2.01, 0.07, 0.22],
      [3.02, 0.03, 0.14]
    ]) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(base * ratio, now);
      partial.frequency.exponentialRampToValueAtTime(base * ratio * 1.12, now + 0.12);
      const gain = context.createGain();
      envelope(gain.gain, now, 0.002, 0.01, ring, level * s);
      partial.connect(gain).connect(out);
      partial.start(now);
      partial.stop(now + ring + 0.05);
    }
  }

  /**
   * A parry: the clang, bright, with a rising "kiin" over it — the steel
   * singing off the turned blade — and a low push under it that says the
   * other body was thrown back.
   */
  parry(point, strength = 1) {
    this.clang(point, { bright: true, strength: 1.2 * strength });
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const out = this._voice(point, 0.45 * strength, now + 0.9);
    const sing = context.createOscillator();
    sing.type = 'triangle';
    sing.frequency.setValueAtTime(2300, now);
    sing.frequency.exponentialRampToValueAtTime(3400, now + 0.35);
    const singGain = context.createGain();
    envelope(singGain.gain, now, 0.004, 0.05, 0.8, 0.12);
    sing.connect(singGain).connect(out);
    sing.start(now);
    sing.stop(now + 0.85);
    const push = context.createOscillator();
    push.type = 'sine';
    push.frequency.setValueAtTime(140, now);
    push.frequency.exponentialRampToValueAtTime(60, now + 0.25);
    const pushGain = context.createGain();
    envelope(pushGain.gain, now, 0.004, 0.02, 0.3, 0.5);
    push.connect(pushGain).connect(out);
    push.start(now);
    push.stop(now + 0.35);
  }

  /**
   * An execution landing: the cut, a taiko-deep boom under it and a long
   * tail of ringing steel. The one blow in the game that should sound final.
   */
  execution(point) {
    this.impact(point, { cut: true, strength: 1.4 });
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const out = this._voice(point, 0.9, now + 1.6);
    const boom = context.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(90, now);
    boom.frequency.exponentialRampToValueAtTime(36, now + 0.6);
    const boomGain = context.createGain();
    envelope(boomGain.gain, now, 0.003, 0.05, 0.9, 0.9);
    boom.connect(boomGain).connect(out);
    boom.start(now);
    boom.stop(now + 1);
    for (const [f, level] of [
      [1320, 0.07],
      [1987, 0.05],
      [3560, 0.025]
    ]) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = context.createGain();
      envelope(g.gain, now + 0.02, 0.003, 0.02, 1.4, level);
      partial.connect(g).connect(out);
      partial.start(now);
      partial.stop(now + 1.5);
    }
  }

  /**
   * A blow stopped by a shield: wood first (a dull, damped knock), then the
   * iron rim — lower and shorter than a sword's guard, so a shield sounds
   * like a door and not like a blade.
   */
  shield(point, strength = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const s = Math.max(0.3, Math.min(1.5, strength));
    const out = this._voice(point, 0.6 * s, now + 0.5);
    const knock = this._noise(now, 0.12);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 380 * (0.9 + Math.random() * 0.2);
    band.Q.value = 3;
    const knockGain = context.createGain();
    envelope(knockGain.gain, now, 0.002, 0.01, 0.12, 1.4 * s);
    knock.connect(band).connect(knockGain).connect(out);
    const body = context.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, now);
    body.frequency.exponentialRampToValueAtTime(150, now + 0.1);
    const bodyGain = context.createGain();
    envelope(bodyGain.gain, now, 0.002, 0.01, 0.16, 0.5 * s);
    body.connect(bodyGain).connect(out);
    body.start(now);
    body.stop(now + 0.2);
    const rim = context.createOscillator();
    rim.type = 'sine';
    rim.frequency.value = 640 * (0.96 + Math.random() * 0.08);
    const rimGain = context.createGain();
    envelope(rimGain.gain, now, 0.001, 0.005, 0.28, 0.08 * s);
    rim.connect(rimGain).connect(out);
    rim.start(now);
    rim.stop(now + 0.32);
  }

  /**
   * The boss's roar: three detuned saws through a moving vowel filter over a
   * rumble of low noise — a throat, not a synth. `strength` stretches it.
   */
  roar(point, strength = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const length = 1.1 + 0.5 * strength;
    const out = this._voice(point, 0.8 * strength, now + length + 0.2);
    const vowel = context.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.Q.value = 2.2;
    vowel.frequency.setValueAtTime(380, now);
    vowel.frequency.linearRampToValueAtTime(820, now + length * 0.35);
    vowel.frequency.linearRampToValueAtTime(300, now + length);
    const vowelGain = context.createGain();
    envelope(vowelGain.gain, now, 0.12, length * 0.55, length, 0.9);
    vowel.connect(vowelGain).connect(out);
    for (const detune of [-14, 0, 11]) {
      const saw = context.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(92, now);
      saw.frequency.linearRampToValueAtTime(118, now + length * 0.3);
      saw.frequency.linearRampToValueAtTime(70, now + length);
      saw.detune.value = detune;
      saw.connect(vowel);
      saw.start(now);
      saw.stop(now + length + 0.05);
    }
    const rumble = this._noise(now, Math.min(0.95, length));
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    const rumbleGain = context.createGain();
    envelope(rumbleGain.gain, now, 0.08, length * 0.5, length, 1.1);
    rumble.connect(low).connect(rumbleGain).connect(out);
  }

  /**
   * A footfall. `weight` 0 is a light step, 1 a run, 2+ something huge (the
   * brute, the boss): heavier is lower, longer and louder. Left and right
   * alternate a little in pitch so a walk is not a metronome.
   */
  footstep(point, weight = 0.5) {
    if (!this._ready || this.voices > MAX_VOICES - 4) return;
    const context = this.context;
    const now = context.currentTime;
    this._stepSide ^= 1;
    const heavy = Math.min(3, Math.max(0, weight));
    const length = 0.07 + heavy * 0.05;
    const out = this._voice(point, settings.audio.stepLevel * (0.35 + heavy * 0.25), now + length + 0.1);
    const scuff = this._noise(now, length);
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = (heavy > 1.5 ? 260 : 900 - heavy * 200) * (this._stepSide ? 1.08 : 0.94);
    const g = context.createGain();
    envelope(g.gain, now, 0.004, 0.01, length, 0.9);
    scuff.connect(low).connect(g).connect(out);
    if (heavy > 1.2) {
      const thud = context.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(80, now);
      thud.frequency.exponentialRampToValueAtTime(38, now + 0.2);
      const tg = context.createGain();
      envelope(tg.gain, now, 0.003, 0.02, 0.25, 0.8);
      thud.connect(tg).connect(out);
      thud.start(now);
      thud.stop(now + 0.3);
    }
  }

  /**
   * A big body gathering itself for a blow: a low breath swelling up through a
   * closing filter, with steel scraping over it. Heard before it is seen.
   */
  windup(point, heavy = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const length = 0.45 + 0.25 * heavy;
    const out = this._voice(point, 0.55 * heavy, now + length + 0.15);
    const breath = this._noise(now, length);
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(180, now);
    low.frequency.exponentialRampToValueAtTime(700, now + length * 0.8);
    const g = context.createGain();
    envelope(g.gain, now, length * 0.7, length * 0.75, length, 0.9);
    breath.connect(low).connect(g).connect(out);
    const scrape = this._noise(now + length * 0.3, length * 0.6);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 6;
    band.frequency.setValueAtTime(2400, now + length * 0.3);
    band.frequency.exponentialRampToValueAtTime(3600, now + length);
    const sg = context.createGain();
    envelope(sg.gain, now + length * 0.3, length * 0.3, length * 0.4, length * 0.7, 0.18);
    scrape.connect(band).connect(sg).connect(out);
  }

  /** The heart, when the body is nearly done: lub-dub, low and close. */
  heartbeat(strength = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const out = this._voice(null, 0.5 * strength, now + 0.6);
    for (const [at, level] of [
      [0, 1],
      [0.16, 0.7]
    ]) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(62, now + at);
      osc.frequency.exponentialRampToValueAtTime(38, now + at + 0.14);
      const g = context.createGain();
      envelope(g.gain, now + at, 0.006, 0.02, 0.16, level);
      osc.connect(g).connect(out);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    }
  }

  /**
   * 鞘走り — the blade leaving the scabbard: a bright metallic scrape rising
   * to a ring. For 居合 and the execution's draw.
   */
  draw(point, strength = 1) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const out = this._voice(point, 0.45 * strength, now + 0.9);
    const scrape = this._noise(now, 0.28);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 9;
    band.frequency.setValueAtTime(1800, now);
    band.frequency.exponentialRampToValueAtTime(5200, now + 0.25);
    const g = context.createGain();
    envelope(g.gain, now, 0.03, 0.18, 0.28, 0.9);
    scrape.connect(band).connect(g).connect(out);
    const ring = context.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 2650 * (0.98 + Math.random() * 0.04);
    const rg = context.createGain();
    envelope(rg.gain, now + 0.22, 0.004, 0.02, 0.6, 0.12);
    ring.connect(rg).connect(out);
    ring.start(now + 0.2);
    ring.stop(now + 0.9);
  }

  /** A menu press: a short wooden tick. Not placed in the world. */
  ui(accept = true) {
    if (!this._ready) return;
    const context = this.context;
    const now = context.currentTime;
    const out = this._voice(null, 0.25, now + 0.15);
    const tick = context.createOscillator();
    tick.type = 'triangle';
    tick.frequency.setValueAtTime(accept ? 1050 : 700, now);
    tick.frequency.exponentialRampToValueAtTime(accept ? 1400 : 520, now + 0.06);
    const g = context.createGain();
    envelope(g.gain, now, 0.002, 0.005, 0.1, 0.35);
    tick.connect(g).connect(out);
    tick.start(now);
    tick.stop(now + 0.12);
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

    if (pan) gain.connect(pan).connect(this.sfxBus);
    else gain.connect(this.sfxBus);

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
