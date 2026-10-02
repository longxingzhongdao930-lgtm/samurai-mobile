/**
 * Every sound in the game, synthesised at run time with WebAudio.
 *
 * No samples are shipped: rain, steel, flesh, thunder, the oni's growl and the
 * taiko under the fights are all built from noise, oscillators and filters, so
 * there is nothing to download and nothing to license. The context starts on
 * the first touch or key (browsers require a gesture), and everything before
 * that is silently dropped.
 *
 * Positional sounds are panned and attenuated by hand against the camera
 * (`setListener`) — a StereoPanner and a gain are far cheaper on a phone than
 * an HRTF PannerNode per voice. A voice cap keeps a thirty-body brawl from
 * stacking a hundred hits into one frame.
 */

const MAX_VOICES = 28;
const PENTATONIC = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33, 622.25, 783.99];

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.voices = 0;
    this._listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this._combat = 0;
    this._combatTarget = 0;
    this._beat = 0;
    this._step = 0;
    this._nextThunder = 14;
    this.volume = { master: 0.9, sfx: 1, music: 0.55, ambience: 0.8 };

    this._unlock = () => this.unlock();
    window.addEventListener('pointerdown', this._unlock, { passive: true });
    window.addEventListener('keydown', this._unlock);
    this._onVisibility = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const ctx = new Context({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);

    this.master = gain(ctx, this.volume.master, compressor);
    this.sfx = gain(ctx, this.volume.sfx, this.master);
    this.music = gain(ctx, this.volume.music, this.master);
    this.ambience = gain(ctx, this.volume.ambience, this.master);

    // One shared room: a generated impulse, sent to from the heavy sounds.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.2, 2.6);
    this.reverbSend = gain(ctx, 0.32, this.reverb);
    this.reverb.connect(this.master);

    this._noise = noiseBuffer(ctx, 2);
    this._buildRain();
    this._buildDrone();
    this._clock = ctx.currentTime;
  }

  /* ------------------------------------------------------------------ */
  /* listener + per frame                                                */
  /* ------------------------------------------------------------------ */

  setListener(camera) {
    const l = this._listener;
    l.x = camera.position.x;
    l.y = camera.position.y;
    l.z = camera.position.z;
    // Camera right on the ground plane.
    const e = camera.matrixWorld.elements;
    const len = Math.hypot(e[0], e[2]) || 1;
    l.rx = e[0] / len;
    l.rz = e[2] / len;
  }

  /** 0 = exploring, 1 = a fight, 2 = the boss. Drives the drums. */
  setCombat(level) {
    this._combatTarget = level;
  }

  update(dt, { rain = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    this._combat += (this._combatTarget - this._combat) * Math.min(1, dt * 0.8);
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(0.16 * rain, ctx.currentTime, 0.5);
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.03 + 0.05 * Math.min(1, this._combat), ctx.currentTime, 1.2);

    this._nextThunder -= dt;
    if (this._nextThunder <= 0) {
      this._nextThunder = 18 + Math.random() * 22;
      this.onThunder?.();
      this.play('thunderRoll', { volume: 0.8 });
    }
    this._scheduleMusic();
  }

  /* ------------------------------------------------------------------ */
  /* the voices                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * @param {string} name
   * @param {{pos?: {x: number, z: number}, volume?: number, pitch?: number}} [options]
   */
  play(name, { pos = null, volume = 1, pitch = 1 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const recipe = RECIPES[name];
    if (!recipe) return;
    if (this.voices >= MAX_VOICES && !recipe.priority) return;

    let pan = 0;
    let level = volume;
    if (pos) {
      const l = this._listener;
      const dx = pos.x - l.x;
      const dz = pos.z - l.z;
      const distance = Math.hypot(dx, dz);
      level *= 1 / (1 + Math.max(0, distance - 4) * 0.09);
      if (level < 0.03) return;
      pan = distance > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * l.rx + dz * l.rz) / distance)) : 0;
    }

    const out = gain(ctx, level, this.sfx);
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      out.disconnect();
      out.connect(panner);
      panner.connect(this.sfx);
    }
    const t = ctx.currentTime + 0.002;
    const length = recipe.play(this, out, t, pitch) ?? 0.6;
    this.voices++;
    setTimeout(() => {
      this.voices--;
      out.disconnect();
    }, (length + 0.2) * 1000);
  }

  /* building blocks the recipes use */

  noise(out, t, { duration = 0.2, type = 'bandpass', freq = 1200, freqEnd = null, q = 1, level = 1, attack = 0.004 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
    return env;
  }

  tone(out, t, { freq = 440, freqEnd = null, duration = 0.3, type = 'sine', level = 0.5, attack = 0.003, detune = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + duration);
    osc.detune.value = detune;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return env;
  }

  /** An inharmonic struck-metal partial set — the sound of steel on steel. */
  metal(out, t, { base = 1400, duration = 0.5, level = 0.25, partials = [1, 1.47, 2.09, 2.76, 3.41] } = {}) {
    for (let i = 0; i < partials.length; i++) {
      this.tone(out, t, {
        freq: base * partials[i] * (1 + (Math.random() - 0.5) * 0.01),
        duration: duration * (1 - i * 0.12),
        type: i === 0 ? 'triangle' : 'sine',
        level: level / (1 + i * 0.6),
        attack: 0.001
      });
    }
  }

  send(out) {
    out.connect(this.reverbSend);
  }

  /* ------------------------------------------------------------------ */
  /* beds                                                                */
  /* ------------------------------------------------------------------ */

  _buildRain() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const hi = ctx.createBiquadFilter();
    hi.type = 'highpass';
    hi.frequency.value = 900;
    const lo = ctx.createBiquadFilter();
    lo.type = 'lowpass';
    lo.frequency.value = 7000;
    this.rainGain = gain(ctx, 0.0001, this.ambience);
    src.connect(hi);
    hi.connect(lo);
    lo.connect(this.rainGain);
    src.start();

    // The heavier patter underneath: a lower band, slowly breathing.
    const src2 = ctx.createBufferSource();
    src2.buffer = this._noise;
    src2.loop = true;
    src2.playbackRate.value = 0.5;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;
    const g = gain(ctx, 0.5, this.rainGain);
    src2.connect(band);
    band.connect(g);
    src2.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = gain(ctx, 0.25, g.gain);
    lfo.connect(depth);
    lfo.start();
  }

  _buildDrone() {
    const ctx = this.ctx;
    this.droneGain = gain(ctx, 0.0001, this.music);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.connect(this.droneGain);
    for (const [f, d] of [[73.42, -6], [73.42, 7], [110, 0]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = d;
      const g = gain(ctx, 0.3, filter);
      osc.connect(g);
      osc.start();
    }
  }

  /** Taiko and a breathy flute, scheduled a little ahead of the clock. */
  _scheduleMusic() {
    const ctx = this.ctx;
    const level = this._combat;
    const bpm = level > 1.5 ? 132 : 104;
    const step = 60 / bpm / 2;
    if (this._clock < ctx.currentTime) this._clock = ctx.currentTime + 0.05;
    while (this._clock < ctx.currentTime + 0.25) {
      const t = this._clock;
      const beat = this._beat % 16;
      if (level > 0.15) {
        const pattern = level > 1.5 ? BOSS_PATTERN : FIGHT_PATTERN;
        const hit = pattern[beat];
        if (hit) this._taiko(t, hit * Math.min(1, level), hit > 0.8);
        if (level > 1.5 && beat % 4 === 2) this._kakegoe(t);
      }
      if (beat === 0 && Math.random() < (level > 0.15 ? 0.35 : 0.18)) this._flute(t);
      this._beat++;
      this._clock += step;
    }
  }

  _taiko(t, strength, big) {
    const out = gain(this.ctx, 0.55 * strength, this.music);
    this.tone(out, t, { freq: big ? 92 : 128, freqEnd: big ? 48 : 70, duration: big ? 0.7 : 0.35, level: 0.9 });
    this.noise(out, t, { duration: 0.06, type: 'lowpass', freq: 1800, level: 0.35 });
    if (big) this.send(out);
    setTimeout(() => out.disconnect(), 1200);
  }

  _kakegoe(t) {
    const out = gain(this.ctx, 0.12, this.music);
    this.noise(out, t, { duration: 0.05, type: 'highpass', freq: 4200, level: 0.4 });
    setTimeout(() => out.disconnect(), 400);
  }

  _flute(t) {
    const ctx = this.ctx;
    const out = gain(ctx, 0.07, this.music);
    const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note * 0.97, t);
    osc.frequency.linearRampToValueAtTime(note, t + 0.25);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibDepth = gain(ctx, 6, osc.frequency);
    vib.connect(vibDepth);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    osc.connect(env);
    env.connect(out);
    this.noise(out, t, { duration: 2.4, type: 'bandpass', freq: note * 2, q: 6, level: 0.2, attack: 0.3 });
    this.send(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 2.7);
    vib.stop(t + 2.7);
    setTimeout(() => out.disconnect(), 3200);
  }

  dispose() {
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.ctx?.close();
  }
}

const FIGHT_PATTERN = [1, 0, 0, 0.4, 0, 0, 0.6, 0, 0.9, 0, 0, 0.4, 0, 0.4, 0.6, 0];
const BOSS_PATTERN = [1, 0, 0.5, 0.5, 0.9, 0, 0.5, 0, 1, 0, 0.5, 0.5, 0.9, 0.5, 0.7, 0.5];

/* -------------------------------------------------------------------- */

/** name → how to make it. Each returns its length in seconds. */
const RECIPES = {
  swing: {
    play(s, out, t, pitch) {
      s.noise(out, t, { duration: 0.2, type: 'bandpass', freq: 2600 * pitch, freqEnd: 700, q: 1.4, level: 0.5, attack: 0.03 });
      return 0.25;
    }
  },
  whoosh: {
    play(s, out, t, pitch) {
      s.noise(out, t, { duration: 0.28, type: 'bandpass', freq: 1400 * pitch, freqEnd: 400, q: 1.2, level: 0.45, attack: 0.05 });
      return 0.3;
    }
  },
  slash: {
    play(s, out, t, pitch) {
      s.noise(out, t, { duration: 0.16, type: 'lowpass', freq: 2200, freqEnd: 300, level: 0.8 });
      s.tone(out, t, { freq: 160 * pitch, freqEnd: 55, duration: 0.16, level: 0.7 });
      s.noise(out, t, { duration: 0.08, type: 'highpass', freq: 5200, level: 0.25 });
      return 0.25;
    }
  },
  heavyHit: {
    priority: true,
    play(s, out, t, pitch) {
      s.tone(out, t, { freq: 110 * pitch, freqEnd: 38, duration: 0.42, level: 0.9 });
      s.noise(out, t, { duration: 0.3, type: 'lowpass', freq: 1600, freqEnd: 200, level: 0.9 });
      s.noise(out, t, { duration: 0.1, type: 'highpass', freq: 4000, level: 0.3 });
      s.send(out);
      return 0.5;
    }
  },
  kick: {
    play(s, out, t) {
      s.tone(out, t, { freq: 120, freqEnd: 45, duration: 0.2, level: 0.9 });
      s.noise(out, t, { duration: 0.09, type: 'lowpass', freq: 900, level: 0.6 });
      return 0.25;
    }
  },
  block: {
    play(s, out, t, pitch) {
      s.metal(out, t, { base: 1100 * pitch, duration: 0.45, level: 0.32 });
      s.noise(out, t, { duration: 0.05, type: 'highpass', freq: 3000, level: 0.5 });
      return 0.5;
    }
  },
  parry: {
    priority: true,
    play(s, out, t) {
      s.metal(out, t, { base: 1650, duration: 1.3, level: 0.42, partials: [1, 1.51, 2.27, 2.94, 3.7, 4.6] });
      s.metal(out, t, { base: 830, duration: 0.6, level: 0.2 });
      s.noise(out, t, { duration: 0.07, type: 'highpass', freq: 2500, level: 0.9 });
      s.tone(out, t, { freq: 90, freqEnd: 40, duration: 0.35, level: 0.6 });
      s.send(out);
      return 1.4;
    }
  },
  guardUp: {
    play(s, out, t) {
      s.metal(out, t, { base: 2600, duration: 0.12, level: 0.1 });
      return 0.15;
    }
  },
  guardBreak: {
    priority: true,
    play(s, out, t) {
      s.metal(out, t, { base: 700, duration: 0.7, level: 0.35, partials: [1, 1.23, 1.81, 2.5] });
      s.tone(out, t, { freq: 70, freqEnd: 30, duration: 0.5, level: 0.8 });
      s.noise(out, t, { duration: 0.4, type: 'lowpass', freq: 1200, freqEnd: 150, level: 0.7 });
      return 0.8;
    }
  },
  hurt: {
    play(s, out, t) {
      s.tone(out, t, { freq: 140, freqEnd: 60, duration: 0.22, level: 0.8 });
      s.noise(out, t, { duration: 0.18, type: 'lowpass', freq: 1400, freqEnd: 250, level: 0.7 });
      return 0.3;
    }
  },
  dodge: {
    play(s, out, t, pitch) {
      s.noise(out, t, { duration: 0.22, type: 'bandpass', freq: 900 * pitch, freqEnd: 2600 * pitch, q: 0.9, level: 0.35, attack: 0.04 });
      return 0.25;
    }
  },
  perfect: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 1760, freqEnd: 880, duration: 0.6, level: 0.18, type: 'triangle' });
      s.noise(out, t, { duration: 0.5, type: 'bandpass', freq: 600, freqEnd: 3000, q: 2, level: 0.3, attack: 0.2 });
      s.send(out);
      return 0.7;
    }
  },
  counter: {
    play(s, out, t) {
      s.noise(out, t, { duration: 0.18, type: 'bandpass', freq: 4000, freqEnd: 1200, q: 2, level: 0.5 });
      return 0.2;
    }
  },
  charge: {
    play(s, out, t) {
      s.tone(out, t, { freq: 220, freqEnd: 880, duration: 0.3, type: 'sawtooth', level: 0.08 });
      s.noise(out, t, { duration: 0.3, type: 'bandpass', freq: 800, freqEnd: 4000, q: 3, level: 0.25, attack: 0.2 });
      return 0.35;
    }
  },
  execute: {
    priority: true,
    play(s, out, t) {
      s.noise(out, t, { duration: 0.25, type: 'bandpass', freq: 5000, freqEnd: 900, q: 1.5, level: 0.8 });
      s.tone(out, t + 0.02, { freq: 70, freqEnd: 28, duration: 1.0, level: 1 });
      s.noise(out, t + 0.02, { duration: 0.8, type: 'lowpass', freq: 900, freqEnd: 80, level: 0.8 });
      s.metal(out, t, { base: 2200, duration: 0.9, level: 0.12 });
      s.send(out);
      return 1.2;
    }
  },
  slam: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 80, freqEnd: 26, duration: 0.7, level: 1 });
      s.noise(out, t, { duration: 0.6, type: 'lowpass', freq: 1400, freqEnd: 90, level: 0.9 });
      s.send(out);
      return 0.8;
    }
  },
  growl: {
    play(s, out, t, pitch) {
      const ctx = s.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95 * pitch, t);
      osc.frequency.linearRampToValueAtTime(70 * pitch, t + 0.7);
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 520 * pitch;
      formant.Q.value = 3;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.12);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(formant);
      formant.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + 0.85);
      s.noise(out, t, { duration: 0.7, type: 'bandpass', freq: 400 * pitch, q: 2, level: 0.2, attack: 0.1 });
      return 0.9;
    }
  },
  roar: {
    priority: true,
    play(s, out, t) {
      const ctx = s.ctx;
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortion(30);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.6, t + 0.2);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      shaper.connect(env);
      env.connect(out);
      for (const f of [55, 82, 111]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.linearRampToValueAtTime(f * 0.75, t + 1.9);
        osc.connect(shaper);
        osc.start(t);
        osc.stop(t + 2.0);
      }
      s.noise(out, t, { duration: 1.8, type: 'bandpass', freq: 600, freqEnd: 250, q: 1.5, level: 0.5, attack: 0.15 });
      s.send(out);
      return 2.1;
    }
  },
  fire: {
    play(s, out, t) {
      s.noise(out, t, { duration: 0.5, type: 'lowpass', freq: 400, freqEnd: 2400, level: 0.6, attack: 0.08 });
      s.tone(out, t, { freq: 90, freqEnd: 160, duration: 0.4, level: 0.3 });
      return 0.55;
    }
  },
  fireHit: {
    play(s, out, t) {
      s.noise(out, t, { duration: 0.5, type: 'lowpass', freq: 2400, freqEnd: 200, level: 0.8 });
      s.tone(out, t, { freq: 100, freqEnd: 40, duration: 0.3, level: 0.6 });
      return 0.55;
    }
  },
  thunder: {
    priority: true,
    play(s, out, t) {
      s.noise(out, t, { duration: 0.12, type: 'highpass', freq: 3000, level: 1 });
      s.tone(out, t, { freq: 2200, freqEnd: 300, duration: 0.15, type: 'sawtooth', level: 0.12 });
      s.noise(out, t + 0.04, { duration: 1.1, type: 'lowpass', freq: 600, freqEnd: 60, level: 0.9, attack: 0.02 });
      s.send(out);
      return 1.2;
    }
  },
  thunderRoll: {
    play(s, out, t) {
      s.noise(out, t, { duration: 3.4, type: 'lowpass', freq: 320, freqEnd: 50, level: 0.7, attack: 0.25 });
      s.noise(out, t, { duration: 0.4, type: 'bandpass', freq: 900, freqEnd: 200, level: 0.25, attack: 0.02 });
      return 3.5;
    }
  },
  ice: {
    play(s, out, t) {
      for (let i = 0; i < 3; i++) s.tone(out, t + i * 0.03, { freq: 2400 + i * 700, duration: 0.25, level: 0.12 });
      s.noise(out, t, { duration: 0.25, type: 'highpass', freq: 3500, level: 0.35 });
      return 0.35;
    }
  },
  iceHit: {
    play(s, out, t) {
      s.noise(out, t, { duration: 0.18, type: 'highpass', freq: 2800, level: 0.6 });
      s.tone(out, t, { freq: 3100, duration: 0.2, level: 0.1 });
      return 0.25;
    }
  },
  explosion: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 70, freqEnd: 22, duration: 1.2, level: 1 });
      s.noise(out, t, { duration: 1.3, type: 'lowpass', freq: 2400, freqEnd: 70, level: 1 });
      s.noise(out, t, { duration: 0.15, type: 'highpass', freq: 2000, level: 0.7 });
      s.send(out);
      return 1.4;
    }
  },
  shatter: {
    priority: true,
    play(s, out, t) {
      for (let i = 0; i < 9; i++) s.tone(out, t + Math.random() * 0.12, { freq: 2000 + Math.random() * 3500, duration: 0.25 + Math.random() * 0.3, level: 0.08 });
      s.noise(out, t, { duration: 0.35, type: 'highpass', freq: 2500, level: 0.6 });
      s.tone(out, t, { freq: 180, freqEnd: 60, duration: 0.3, level: 0.5 });
      s.send(out);
      return 0.7;
    }
  },
  steam: {
    priority: true,
    play(s, out, t) {
      s.noise(out, t, { duration: 1.2, type: 'highpass', freq: 1800, level: 0.6, attack: 0.03 });
      s.tone(out, t, { freq: 90, freqEnd: 40, duration: 0.3, level: 0.6 });
      return 1.3;
    }
  },
  arrow: {
    play(s, out, t) {
      s.noise(out, t, { duration: 0.18, type: 'bandpass', freq: 3200, freqEnd: 1800, q: 4, level: 0.4 });
      s.tone(out, t, { freq: 180, duration: 0.08, type: 'triangle', level: 0.2 });
      return 0.2;
    }
  },
  telegraph: {
    play(s, out, t, pitch) {
      s.metal(out, t, { base: 2400 * pitch, duration: 0.3, level: 0.12, partials: [1, 2.01, 3.02] });
      return 0.35;
    }
  },
  danger: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 180, freqEnd: 120, duration: 0.5, type: 'sawtooth', level: 0.12 });
      s.metal(out, t, { base: 900, duration: 0.6, level: 0.18, partials: [1, 1.19, 1.7] });
      s.send(out);
      return 0.65;
    }
  },
  step: {
    play(s, out, t, pitch) {
      s.noise(out, t, { duration: 0.08, type: 'bandpass', freq: 700 * pitch, q: 1.2, level: 0.22 });
      s.noise(out, t, { duration: 0.05, type: 'highpass', freq: 3000, level: 0.08 });
      return 0.1;
    }
  },
  pickup: {
    priority: true,
    play(s, out, t) {
      [587.33, 783.99, 1174.66].forEach((f, i) => s.tone(out, t + i * 0.08, { freq: f, duration: 0.6, level: 0.15, type: 'triangle' }));
      s.send(out);
      return 0.9;
    }
  },
  bell: {
    priority: true,
    play(s, out, t) {
      s.metal(out, t, { base: 220, duration: 3.5, level: 0.3, partials: [1, 2.0, 2.76, 5.4, 8.9] });
      s.send(out);
      return 3.6;
    }
  },
  select: {
    play(s, out, t) {
      s.tone(out, t, { freq: 880, duration: 0.08, type: 'triangle', level: 0.12 });
      return 0.1;
    }
  },
  confirm: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 660, duration: 0.12, type: 'triangle', level: 0.14 });
      s.tone(out, t + 0.08, { freq: 990, duration: 0.25, type: 'triangle', level: 0.14 });
      return 0.35;
    }
  },
  deny: {
    play(s, out, t) {
      s.tone(out, t, { freq: 180, duration: 0.14, type: 'square', level: 0.06 });
      return 0.16;
    }
  },
  death: {
    priority: true,
    play(s, out, t) {
      s.tone(out, t, { freq: 220, freqEnd: 55, duration: 1.8, type: 'triangle', level: 0.3 });
      s.metal(out, t, { base: 330, duration: 2.6, level: 0.2 });
      s.send(out);
      return 2.7;
    }
  }
};

/* -------------------------------------------------------------------- */

function gain(ctx, value, destination) {
  const node = ctx.createGain();
  node.gain.value = value;
  if (destination) node.connect(destination);
  return node;
}

function noiseBuffer(ctx, seconds) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function impulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

function distortion(amount) {
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 128) - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
