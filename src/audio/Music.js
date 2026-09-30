/**
 * 楽 — the score, made rather than loaded, like the rest of the sound.
 *
 * Four pieces on one small instrument set, all in the in-sen scale (D E♭ G A
 * C), which is most of what makes a handful of oscillators read as Japanese:
 *
 *   title — a drone, a shakuhachi phrase now and then, a koto answering it.
 *   field — the same drone with taiko and a koto ostinato whose weight follows
 *           `intensity`: quiet on an empty road, full when bodies close in.
 *   boss  — faster and lower, heavier drums, the drone opened up; each phase
 *           (`setPhase`) adds density and brightness.
 *   clear — a gong, a rising koto run, one long flute note; then it settles
 *           into the title's calm.
 *
 * A look-ahead scheduler (every 50 ms, a quarter second ahead) places each
 * note on the audio clock, so the timing holds through a slow frame. A change
 * of piece is a crossfade: each piece has its own gain under the music bus, and
 * the old one is only torn down once it is silent. Nothing is built until the
 * audio unlocks on the first gesture.
 */

const SCALE = [146.83, 155.56, 196.0, 220.0, 261.63]; // D3 E♭3 G3 A3 C4
const note = (degree, octave = 0) => {
  const n = SCALE.length;
  const o = Math.floor(degree / n);
  return SCALE[((degree % n) + n) % n] * 2 ** (octave + o);
};

const PIECES = {
  title: { bpm: 60, drone: [note(0, -2), note(3, -2)], droneLevel: 0.12, cutoff: 500 },
  field: { bpm: 96, drone: [note(0, -2), note(3, -2)], droneLevel: 0.1, cutoff: 620 },
  boss: { bpm: 126, drone: [note(0, -3), note(1, -2)], droneLevel: 0.13, cutoff: 700 },
  clear: { bpm: 72, drone: [note(0, -2), note(2, -2)], droneLevel: 0.1, cutoff: 900 }
};

/** 16 steps a bar. 2 = don (full), 1 = don (soft), 0.5 = ka (rim). */
const DRUMS = {
  field: [2, 0, 0, 0, 0.5, 0, 1, 0, 2, 0, 0, 1, 0.5, 0, 1, 0],
  boss: [2, 0, 0, 1, 0.5, 0, 2, 0, 2, 0, 1, 0, 0.5, 1, 2, 0.5]
};
/** Koto ostinato: scale degree per 8th (null = rest), four bars rotating. */
const OSTINATO = {
  field: [
    [0, null, 2, 3, 4, null, 3, 2],
    [0, null, 2, 3, 5, 4, 3, null],
    [1, null, 3, 2, 0, null, 2, null],
    [0, 2, 3, 4, 3, 2, 1, null]
  ],
  boss: [
    [0, 1, 0, 3, 0, 1, 4, 3],
    [0, 1, 0, 3, 5, 4, 3, 1],
    [-1, 0, 1, 0, 3, 1, 0, -1],
    [0, 1, 3, 4, 5, 4, 3, 1]
  ]
};
/** Shakuhachi phrases for the title: [degree, beats] pairs. */
const PHRASES = [
  [[4, 2], [3, 1], [2, 3]],
  [[2, 1], [3, 1], [5, 3], [4, 1]],
  [[5, 2], [4, 1], [3, 1], [2, 4]],
  [[0, 2], [2, 1], [3, 3]]
];

export class Music {
  /** @param {import('./CombatAudio.js').CombatAudio} audio */
  constructor(audio) {
    this.audio = audio;
    this.context = null;
    this.piece = null;
    this.wanted = null;
    /** 0..1: how hard the field piece plays (App sets it from the fight). */
    this.intensity = 0;
    this._smooth = 0;
    this.phase = 1;
    /** The piece playing: { name, gain, drone nodes, next step time, step }. */
    this.current = null;
    this._timer = 0;
    this._duck = 1;
    this._noise = null;
    if (audio.context) this._start(audio.context);
    else audio.onUnlock = (context) => this._start(context);
  }

  /** Which piece should play. Safe before unlock: it starts on the first gesture. */
  play(name) {
    this.wanted = name;
    if (!this.context || this.current?.name === name) return;
    this._switch(name);
  }

  setPhase(phase) {
    this.phase = phase;
  }

  /** Quieter (and duller) while down or paused; 1 is full. */
  duck(level) {
    this._duck = level;
    if (this.current) this.current.gain.gain.setTargetAtTime(level, this.context.currentTime, 0.4);
  }

  _start(context) {
    this.context = context;
    const length = context.sampleRate;
    this._noise = context.createBuffer(1, length, context.sampleRate);
    const data = this._noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this._timer = setInterval(() => this._schedule(), 50);
    if (this.wanted) this._switch(this.wanted);
  }

  _switch(name) {
    const context = this.context;
    const now = context.currentTime;
    const old = this.current;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, 0.5);
      old.dying = true;
      setTimeout(() => this._teardown(old), 3500);
    }
    if (!name || !PIECES[name]) {
      this.current = null;
      return;
    }
    const cfg = PIECES[name];
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this._duck, now, 0.6);
    gain.connect(this.audio.musicBus);

    // The drone: two detuned saws per note through a slowly breathing lowpass.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.cutoff;
    filter.Q.value = 0.7;
    const droneGain = context.createGain();
    droneGain.gain.value = cfg.droneLevel;
    filter.connect(droneGain).connect(gain);
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = context.createGain();
    lfoGain.gain.value = cfg.cutoff * 0.35;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start(now);
    const oscillators = [lfo];
    for (const f of cfg.drone) {
      for (const detune of [-6, 7]) {
        const osc = context.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(now);
        oscillators.push(osc);
      }
    }

    this.current = { name, cfg, gain, filter, oscillators, next: now + 0.1, step: 0, bar: 0, phraseAt: 2 };
    if (name === 'clear') this._fanfare(now + 0.05, gain);
  }

  _teardown(piece) {
    for (const osc of piece.oscillators) {
      try {
        osc.stop();
      } catch {}
      osc.disconnect();
    }
    piece.gain.disconnect();
  }

  /** Place every note that falls within the next quarter second. */
  _schedule() {
    const piece = this.current;
    if (!piece || !this.context || this.context.state !== 'running') return;
    const context = this.context;
    this._smooth += (this.intensity - this._smooth) * 0.08;
    const bpm = piece.cfg.bpm * (piece.name === 'boss' ? 1 + (this.phase - 1) * 0.06 : 1);
    const sixteenth = 60 / bpm / 4;
    if (piece.next < context.currentTime) piece.next = context.currentTime + 0.02;
    // The boss drone opens with each phase.
    if (piece.name === 'boss') {
      piece.filter.frequency.setTargetAtTime(piece.cfg.cutoff * (1 + (this.phase - 1) * 0.6), context.currentTime, 0.5);
    }
    while (piece.next < context.currentTime + 0.25) {
      this._step(piece, piece.next, sixteenth);
      piece.next += sixteenth;
      piece.step = (piece.step + 1) % 16;
      if (piece.step === 0) piece.bar++;
    }
  }

  _step(piece, t, sixteenth) {
    const { name, step, bar, gain } = piece;
    if (name === 'field' || name === 'boss') {
      const level = name === 'boss' ? 1 : this._smooth;
      const hit = DRUMS[name][step];
      // Drums only when there is a fight (the field piece's calm is the drone).
      if (hit && level > 0.12) {
        if (hit >= 1) this._taiko(t, gain, (hit === 2 ? 0.9 : 0.5) * (0.4 + 0.6 * level), name === 'boss' ? 0.85 : 1);
        else this._ka(t, gain, 0.35 * level);
      }
      // Extra drums in the last phase and the thick of a fight.
      if ((name === 'boss' && this.phase >= 3 && step % 2 === 1) || (name === 'field' && level > 0.75 && step === 15)) {
        this._taiko(t, gain, 0.35, 1.2);
      }
      if (step % 2 === 0) {
        const line = OSTINATO[name][bar % 4];
        const degree = line[step / 2];
        const kotoLevel = name === 'boss' ? 0.16 + this.phase * 0.03 : 0.05 + 0.13 * level;
        if (degree !== null && (name === 'boss' || level > 0.05)) this._koto(t, gain, note(degree, name === 'boss' ? 0 : 1), kotoLevel);
        if (name === 'boss' && this.phase >= 2 && step % 4 === 2 && degree !== null) {
          this._koto(t + sixteenth, gain, note(degree + 2, 1), 0.08);
        }
      }
      return;
    }
    if (name === 'title' || name === 'clear') {
      // A phrase every few bars, and a koto answer after it.
      if (step === 0 && bar >= piece.phraseAt) {
        const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
        let at = t;
        const beat = sixteenth * 4;
        for (const [degree, beats] of phrase) {
          this._flute(at, gain, note(degree, 1), beats * beat);
          at += beats * beat;
        }
        this._koto(at + beat, gain, note(phrase[0][0], 0), 0.12);
        this._koto(at + beat * 1.5, gain, note(phrase[0][0] + 2, 0), 0.09);
        piece.phraseAt = bar + 3 + Math.floor(Math.random() * 2);
      }
      if (step === 8 && bar % 2 === 1) this._koto(t, gain, note(0, -1), 0.08);
    }
  }

  /** The clear: a gong, a rising koto run, one long flute note. */
  _fanfare(t, gain) {
    this._gong(t, gain);
    for (let i = 0; i < 6; i++) this._koto(t + 0.4 + i * 0.12, gain, note(i, 0), 0.18);
    this._flute(t + 1.3, gain, note(5, 1), 2.8);
    this._taiko(t, gain, 1, 0.9);
    this._taiko(t + 0.45, gain, 0.6, 1);
    this.current.phraseAt = 3;
  }

  /* ---- the instruments ---- */

  _taiko(t, out, level, pitch = 1) {
    const c = this.context;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.28);
    const g = c.createGain();
    env(g.gain, t, 0.004, 0.02, 0.5, 0.55 * level);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.55);
    const skin = this._burst(t, 0.06);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const sg = c.createGain();
    env(sg.gain, t, 0.002, 0.005, 0.07, 0.35 * level);
    skin.connect(f).connect(sg).connect(out);
  }

  _ka(t, out, level) {
    const c = this.context;
    const click = this._burst(t, 0.04);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 2;
    const g = c.createGain();
    env(g.gain, t, 0.001, 0.004, 0.04, level);
    click.connect(f).connect(g).connect(out);
  }

  _koto(t, out, freq, level) {
    const c = this.context;
    const g = c.createGain();
    env(g.gain, t, 0.003, 0.01, 1.1, level);
    g.connect(out);
    for (const [ratio, type, share] of [
      [1, 'triangle', 1],
      [2, 'sine', 0.35],
      [3.01, 'sine', 0.12]
    ]) {
      const osc = c.createOscillator();
      osc.type = type;
      // The koto's bend: plucked a hair sharp, settling onto the note.
      osc.frequency.setValueAtTime(freq * ratio * 1.012, t);
      osc.frequency.exponentialRampToValueAtTime(freq * ratio, t + 0.08);
      const pg = c.createGain();
      pg.gain.value = share;
      osc.connect(pg).connect(g);
      osc.start(t);
      osc.stop(t + 1.15);
    }
  }

  _flute(t, out, freq, length) {
    const c = this.context;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vibGain = c.createGain();
    vibGain.gain.setValueAtTime(0, t);
    vibGain.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(length, 0.8));
    vib.connect(vibGain).connect(osc.frequency);
    const g = c.createGain();
    const peak = 0.11;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.18);
    g.gain.setValueAtTime(peak, t + Math.max(0.2, length - 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(g).connect(out);
    // Breath: band-passed noise riding on the note.
    const breath = this._burst(t, Math.min(0.95, length));
    const bf = c.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = freq * 2;
    bf.Q.value = 4;
    const bg = c.createGain();
    env(bg.gain, t, 0.08, length * 0.5, length, 0.05);
    breath.connect(bf).connect(bg).connect(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + length + 0.05);
    vib.stop(t + length + 0.05);
  }

  _gong(t, out) {
    const c = this.context;
    for (const [f, level, ring] of [
      [110, 0.25, 4],
      [171, 0.14, 3.5],
      [263, 0.09, 2.8],
      [397, 0.05, 2]
    ]) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = c.createGain();
      env(g.gain, t, 0.01, 0.05, ring, level);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + ring + 0.05);
    }
  }

  _burst(t, length) {
    const source = this.context.createBufferSource();
    source.buffer = this._noise;
    source.start(t, Math.random() * Math.max(0, this._noise.duration - length), length);
    return source;
  }

  dispose() {
    clearInterval(this._timer);
    if (this.current) this._teardown(this.current);
    this.current = null;
  }
}

function env(param, t, attack, hold, end, peak) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  param.setValueAtTime(Math.max(0.0002, peak), t + Math.max(attack, hold));
  param.exponentialRampToValueAtTime(0.0001, t + end);
}
