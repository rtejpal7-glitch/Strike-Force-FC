// Real-time beat tracking from an AnalyserNode.
// Onsets are spikes in low-frequency energy above an adaptive threshold; the
// tempo is the median gap between recent onsets; a phase-locked counter keeps
// the dance on the beat between detections (and keeps going in quiet parts).

export class BeatTracker {
  constructor(analyser) {
    this.analyser = analyser;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    this.time = new Uint8Array(analyser.fftSize);
    this.reset();
  }

  reset() {
    this.prevLow = 0;
    this.flux = [];
    this.lastOnset = -10;
    this.onsets = [];
    this.bpm = 120;
    this.phase = 0; // in beats
    this.energy = 0; // 0..1 overall loudness (smoothed)
    this.bass = 0; // 0..1 low-end level
    this.beatPulse = 0; // 1 on a beat, decays
    this.clock = 0;
    this.beats = 0;
  }

  // dt seconds; returns true on a detected beat this frame
  update(dt) {
    this.clock += dt;
    const a = this.analyser;
    a.getByteFrequencyData(this.freq);
    a.getByteTimeDomainData(this.time);
    const binHz = a.context.sampleRate / a.fftSize;
    const lowEnd = Math.max(2, Math.round(160 / binHz));
    let low = 0;
    for (let i = 1; i <= lowEnd; i++) low += this.freq[i];
    low /= lowEnd * 255;
    let rms = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = (this.time[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / this.time.length);
    this.energy += (Math.min(1, rms * 3) - this.energy) * Math.min(1, dt * 8);
    this.bass += (low - this.bass) * Math.min(1, dt * 12);

    // Onset detection on bass flux
    const f = Math.max(0, low - this.prevLow);
    this.prevLow = low;
    this.flux.push(f);
    if (this.flux.length > 60) this.flux.shift();
    const mean = this.flux.reduce((s, x) => s + x, 0) / this.flux.length;
    const sd = Math.sqrt(this.flux.reduce((s, x) => s + (x - mean) ** 2, 0) / this.flux.length);
    let beat = false;
    const minGap = 60 / 200;
    if (f > mean + sd * 1.4 && f > 0.015 && low > 0.12 && this.clock - this.lastOnset > minGap) {
      beat = true;
      const gap = this.clock - this.lastOnset;
      this.lastOnset = this.clock;
      if (gap < 2) this.onsets.push(gap);
      if (this.onsets.length > 10) this.onsets.shift();
      this._estimateTempo();
      // Phase-lock: pull the beat counter towards the nearest whole beat
      const nearest = Math.round(this.phase);
      this.phase += (nearest - this.phase) * 0.6;
      this.beatPulse = 1;
      this.beats++;
    }
    this.phase += dt * (this.bpm / 60);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    return beat;
  }

  _estimateTempo() {
    if (this.onsets.length < 3) return;
    const s = [...this.onsets].sort((x, y) => x - y);
    let ibi = s[Math.floor(s.length / 2)];
    // fold into a danceable range (80–160 BPM)
    let bpm = 60 / ibi;
    while (bpm < 80) bpm *= 2;
    while (bpm > 160) bpm /= 2;
    this.bpm += (bpm - this.bpm) * 0.35;
  }

  spectrum(out) {
    // Down-sample the spectrum into `out.length` bars (0..1)
    const n = out.length;
    const usable = Math.floor(this.freq.length * 0.7);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 1.6) * usable);
      const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.6) * usable));
      let m = 0;
      for (let j = a; j < b; j++) m = Math.max(m, this.freq[j]);
      out[i] = m / 255;
    }
    return out;
  }
}
