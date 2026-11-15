// All audio is synthesised with the Web Audio API, so there are no asset files.
// Crowd ambience is a looping filtered-noise bed whose level follows gameplay.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.crowdTarget = 0.35;
    this.ducked = false;
    this.boost = 0; // temporary crowd surge (seconds remaining)
  }

  duck(on) {
    this.ducked = on;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.noiseBuffer = this._makeNoise(2.5, 'white');
    this.brownBuffer = this._makeNoise(4, 'brown');
    this._startCrowd();
  }

  _makeNoise(seconds, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _startCrowd() {
    const ctx = this.ctx;
    // Low murmur bed
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuffer;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(lp).connect(this.crowdGain).connect(this.master);
    src.start();

    // Brighter "voices" layer
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuffer;
    src2.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    this.crowdVoices = ctx.createGain();
    this.crowdVoices.gain.value = 0;
    src2.connect(bp).connect(this.crowdVoices).connect(this.master);
    src2.start();

    // Slow swell LFO for a living crowd
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.crowdVoices.gain);
    lfo.start();

    this._chantTimer = 4;
  }

  setCrowdIntensity(v) {
    this.crowdTarget = v;
  }

  update(dt) {
    if (!this.ctx || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.boost = Math.max(0, this.boost - dt);
    const v = Math.min(1.3, this.crowdTarget + (this.boost > 0 ? 0.5 : 0));
    const d = this.ducked ? 0.45 : 1;
    this.crowdGain.gain.setTargetAtTime((0.35 + v * 0.5) * d, t, 0.4);
    this.crowdVoices.gain.setTargetAtTime((0.03 + v * 0.12) * d, t, 0.4);
    this._chantTimer -= dt;
    if (this._chantTimer <= 0) {
      this._chantTimer = 6 + Math.random() * 8;
      this.chant();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  // ---------- primitives ----------
  _noise({ dur = 0.2, type = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, decay, freqEnd, out, delay = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    src.connect(f).connect(g).connect(out || this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + (decay || dur) + 0.05);
  }

  _tone({ freq = 440, freqEnd, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, delay = 0, out }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- game sounds ----------
  shot(weaponId) {
    switch (weaponId) {
      case 'pistol':
        this._noise({ dur: 0.18, freq: 2600, freqEnd: 400, gain: 0.7 });
        this._tone({ freq: 160, freqEnd: 50, dur: 0.12, gain: 0.5 });
        break;
      case 'shotgun':
        this._noise({ dur: 0.45, freq: 1800, freqEnd: 120, gain: 0.95, q: 0.5 });
        this._tone({ freq: 110, freqEnd: 35, dur: 0.3, gain: 0.8 });
        this._noise({ dur: 0.9, freq: 500, freqEnd: 100, gain: 0.25, delay: 0.05, decay: 0.9 });
        break;
      case 'rifle':
        this._noise({ dur: 0.11, freq: 3200, freqEnd: 600, gain: 0.55 });
        this._tone({ freq: 140, freqEnd: 60, dur: 0.08, gain: 0.35 });
        break;
      case 'sniper':
        this._noise({ dur: 0.3, freq: 4000, freqEnd: 300, gain: 1.0 });
        this._tone({ freq: 90, freqEnd: 30, dur: 0.35, gain: 0.9 });
        this._noise({ dur: 1.4, freq: 700, freqEnd: 120, gain: 0.3, delay: 0.08, decay: 1.4 });
        break;
      default:
    }
  }

  dryFire() {
    this._tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.12 });
  }

  reload(weaponId, duration) {
    // A sequence of mechanical clicks spread across the reload time.
    const clicks = weaponId === 'shotgun' ? 5 : 3;
    for (let i = 0; i < clicks; i++) {
      const d = (duration * (i + 0.6)) / (clicks + 0.4);
      this._tone({ freq: 900 + Math.random() * 400, dur: 0.04, type: 'square', gain: 0.12, delay: d });
      this._noise({ dur: 0.06, type: 'highpass', freq: 2500, gain: 0.25, delay: d });
    }
  }

  weaponSwitch() {
    this._noise({ dur: 0.12, type: 'bandpass', freq: 1800, q: 2, gain: 0.25 });
    this._tone({ freq: 600, dur: 0.05, type: 'triangle', gain: 0.1, delay: 0.08 });
  }

  impact(head) {
    this._noise({ dur: 0.08, type: 'bandpass', freq: head ? 3000 : 1400, q: 1.5, gain: 0.5 });
    this._tone({ freq: head ? 1200 : 220, freqEnd: head ? 700 : 120, dur: 0.07, gain: 0.25 });
  }

  miss() {
    this._noise({ dur: 0.1, type: 'bandpass', freq: 700, q: 1, gain: 0.15 });
  }

  grunt(pitch = 1) {
    // Rough vocal "oof" — sawtooth through two formant filters.
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 650;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1100;
    f2.Q.value = 6;
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.32);
  }

  fall() {
    this._tone({ freq: 90, freqEnd: 40, dur: 0.35, gain: 0.8 });
    this._noise({ dur: 0.4, freq: 400, freqEnd: 80, gain: 0.6 });
    this.crowdReact(0.6);
  }

  step() {
    this._noise({ dur: 0.07, freq: 300, freqEnd: 120, gain: 0.18 });
  }

  dribble() {
    this._tone({ freq: 140, freqEnd: 90, dur: 0.09, gain: 0.25 });
    this._noise({ dur: 0.05, type: 'bandpass', freq: 900, gain: 0.1 });
  }

  kick() {
    this._tone({ freq: 120, freqEnd: 50, dur: 0.2, gain: 0.9 });
    this._noise({ dur: 0.12, type: 'bandpass', freq: 1200, gain: 0.4 });
  }

  tackleWarn() {
    this._tone({ freq: 880, dur: 0.12, type: 'square', gain: 0.12 });
    this._tone({ freq: 660, dur: 0.12, type: 'square', gain: 0.12, delay: 0.13 });
  }

  tackleHit() {
    this._tone({ freq: 70, freqEnd: 30, dur: 0.4, gain: 1.0 });
    this._noise({ dur: 0.3, freq: 1500, freqEnd: 100, gain: 0.7 });
    this.crowdReact(0.4);
  }

  throwWhoosh() {
    this._noise({ dur: 0.5, type: 'bandpass', freq: 400, freqEnd: 1600, q: 2, gain: 0.3 });
  }

  whistle(long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = long ? 1.1 : 0.45;
    const o = ctx.createOscillator();
    o.frequency.value = 2900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  crowdReact(strength = 0.5) {
    this._noise({ dur: 1.6, type: 'bandpass', freq: 800, q: 0.5, gain: 0.25 * strength, attack: 0.15, decay: 1.6, out: this.master });
  }

  chant() {
    // Rhythmic crowd clap-chant: three swells.
    for (let i = 0; i < 3; i++) {
      this._noise({ dur: 0.35, type: 'bandpass', freq: 700, q: 1, gain: 0.08 + this.crowdTarget * 0.1, attack: 0.05, delay: i * 0.45, out: this.master });
    }
  }

  // The crowd going wild after a knockdown: roar, rhythmic claps and an air horn.
  bigCheer(intensity = 1) {
    this.boost = 4.5;
    this._noise({ dur: 4, type: 'bandpass', freq: 1100, q: 0.45, gain: 0.7 * intensity, attack: 0.25, decay: 4, out: this.master });
    this._noise({ dur: 3.2, type: 'lowpass', freq: 650, gain: 0.55 * intensity, attack: 0.2, decay: 3.2, out: this.master });
    // whistles from the stands
    for (let i = 0; i < 4; i++) {
      const f = 2200 + Math.random() * 1200;
      this._tone({ freq: f, freqEnd: f * (1.1 + Math.random() * 0.3), dur: 0.35, gain: 0.04, delay: 0.3 + Math.random() * 1.8, out: this.master });
    }
    // clap-clap ... clap-clap-clap
    const claps = [0.9, 1.15, 1.6, 1.85, 2.1, 2.7, 2.95, 3.4, 3.65, 3.9];
    claps.forEach((d) => this._noise({ dur: 0.12, type: 'bandpass', freq: 1500, q: 0.8, gain: 0.22 * intensity, delay: d, out: this.master }));
    // stadium air horn
    [233, 294].forEach((f) => this._tone({ freq: f, dur: 0.9, type: 'sawtooth', gain: 0.07 * intensity, attack: 0.03, delay: 0.15, out: this.master }));
  }

  // Crowd "ooooh" — a vowel-like swell that slides down.
  crowdOoh() {
    if (!this.ctx) return;
    this._noise({ dur: 1.3, type: 'bandpass', freq: 520, freqEnd: 330, q: 3, gain: 0.35, attack: 0.18, decay: 1.3, out: this.master });
    this._noise({ dur: 1.2, type: 'bandpass', freq: 900, freqEnd: 600, q: 4, gain: 0.15, attack: 0.2, decay: 1.2, out: this.master });
  }

  // Disappointed groan from the stands.
  crowdGroan() {
    if (!this.ctx) return;
    this._noise({ dur: 2, type: 'bandpass', freq: 420, freqEnd: 180, q: 2.5, gain: 0.4, attack: 0.25, decay: 2, out: this.master });
  }

  pyro() {
    this._noise({ dur: 1.2, type: 'lowpass', freq: 900, freqEnd: 200, gain: 0.35, attack: 0.02, decay: 1.2 });
  }

  firework(delay = 0) {
    this._noise({ dur: 0.6, type: 'bandpass', freq: 600, freqEnd: 2400, q: 1.5, gain: 0.08, delay });
    this._tone({ freq: 70, freqEnd: 30, dur: 0.5, gain: 0.5, delay: delay + 0.6, out: this.master });
    this._noise({ dur: 1.2, type: 'highpass', freq: 3000, gain: 0.15, delay: delay + 0.62, decay: 1.2 });
  }

  goal() {
    // Stadium horn chord + huge crowd roar.
    [220, 277, 330].forEach((f) => this._tone({ freq: f, dur: 2.2, type: 'sawtooth', gain: 0.12, attack: 0.05 }));
    this._noise({ dur: 5, type: 'bandpass', freq: 1000, q: 0.4, gain: 0.9, attack: 0.3, decay: 5, out: this.master });
    this._noise({ dur: 4, type: 'lowpass', freq: 600, gain: 0.8, attack: 0.2, decay: 4, out: this.master });
    this.whistle(true);
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.18, delay: i * 0.14 }));
  }

  defeat() {
    [392, 330, 262].forEach((f, i) => this._tone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.18, delay: i * 0.2 }));
    this._noise({ dur: 2.5, type: 'lowpass', freq: 400, gain: 0.3, attack: 0.2, decay: 2.5, out: this.master });
  }
}
