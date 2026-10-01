/**
 * 環境音 — the night under the music: wind that rises and falls, crickets in
 * the grass, and now and then a temple bell far off. Made like everything
 * else (`audio/CombatAudio.js`): one buffer of noise and a few oscillators,
 * on the effects bus, so the 効果音 slider carries it.
 *
 * `intensity` thins it out in a fight (the crickets go quiet when blades are
 * out) and `boss` darkens it (no bell, a low wind).
 */
export class Ambience {
  /** @param {import('./CombatAudio.js').CombatAudio} audio */
  constructor(audio) {
    this.audio = audio;
    this.context = null;
    this.calm = 1;
    this.boss = false;
    this._timer = 0;
    this._nextChirp = 0;
    this._nextBell = 0;
    audio.whenReady((context) => this._start(context));
  }

  _start(context) {
    this.context = context;
    const out = context.createGain();
    out.gain.value = 0.55;
    out.connect(this.audio.sfxBus);
    this.out = out;

    // Wind: looped noise through a slowly wandering band-pass.
    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      // Brown-ish: softer than white, closer to air.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const wind = context.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;
    const windGain = context.createGain();
    windGain.gain.value = 0.25;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain).connect(windGain.gain);
    const sweep = context.createOscillator();
    sweep.frequency.value = 0.05;
    const sweepGain = context.createGain();
    sweepGain.gain.value = 220;
    sweep.connect(sweepGain).connect(band.frequency);
    wind.connect(band).connect(windGain).connect(out);
    wind.start();
    lfo.start();
    sweep.start();
    this.wind = { band, windGain };
    this._nodes = [wind, lfo, sweep];

    this._timer = setInterval(() => this._tick(), 200);
  }

  _tick() {
    const c = this.context;
    if (!c || c.state !== 'running' || !this.audio._ready) return;
    const now = c.currentTime;
    this.wind.band.frequency.setTargetAtTime(this.boss ? 260 : 420, now, 1.5);
    if (now >= this._nextChirp) {
      this._nextChirp = now + 0.6 + Math.random() * 2.2;
      if (!this.boss && this.calm > 0.3) this._chirp(now, this.calm);
    }
    if (now >= this._nextBell) {
      if (this._nextBell > 0 && !this.boss && this.calm > 0.5) this._bell(now);
      this._nextBell = now + 28 + Math.random() * 20;
    }
  }

  /** A cricket: a few fast ticks of a high tone, panned somewhere in the grass. */
  _chirp(t, level) {
    const c = this.context;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const g = c.createGain();
    g.gain.value = 0.035 * level;
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan).connect(this.out);
    } else g.connect(this.out);
    const f = 4200 + Math.random() * 900;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.055;
      const osc = c.createOscillator();
      osc.frequency.value = f;
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(1, at + 0.006);
      e.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      osc.connect(e).connect(g);
      osc.start(at);
      osc.stop(at + 0.05);
    }
    setTimeout(() => {
      g.disconnect();
      pan?.disconnect();
    }, 800);
  }

  /** A temple bell, far off: a struck partial series with a long tail. */
  _bell(t) {
    const c = this.context;
    const g = c.createGain();
    g.gain.value = 0.09;
    const low = c.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1400;
    g.connect(low).connect(this.out);
    for (const [f, level, ring] of [
      [98, 1, 6],
      [196.5, 0.5, 4.5],
      [262, 0.35, 3.5],
      [393, 0.18, 2.5]
    ]) {
      const osc = c.createOscillator();
      osc.frequency.value = f;
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(level, t + 0.02);
      e.gain.exponentialRampToValueAtTime(0.0001, t + ring);
      osc.connect(e).connect(g);
      osc.start(t);
      osc.stop(t + ring + 0.05);
    }
    setTimeout(() => {
      g.disconnect();
      low.disconnect();
    }, 7000);
  }

  dispose() {
    clearInterval(this._timer);
    for (const n of this._nodes ?? []) {
      try {
        n.stop();
      } catch {}
    }
    this.out?.disconnect();
  }
}
