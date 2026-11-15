// Where celebration clips come from:
//  1. "folder": the live manifest served for /celebration-audio (npm run dev / npm run play)
//  2. "local":  files or a folder you pick by hand (works anywhere, incl. play.html from disk)
//  3. "builtin": a beat synthesised in the browser, so there is always something to dance to

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i;

export function prettyName(file) {
  return file
    .replace(AUDIO_EXT, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export class ClipLibrary {
  constructor() {
    this.folderClips = [];
    this.localClips = [];
    this.builtin = null;
    this.folderStatus = 'unknown'; // unknown | ok | unavailable
    this.durations = new Map();
  }

  get clips() {
    return [...this.folderClips, ...this.localClips, ...(this.builtin ? [this.builtin] : [])];
  }

  find(id) {
    return this.clips.find((c) => c.id === id);
  }

  // Re-reads the folder listing. Returns true if the list changed.
  async refreshFolder() {
    try {
      const res = await fetch('celebration-audio/manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('bad manifest');
      const next = list.map((c) => ({
        id: `folder:${c.file}:${c.size}:${Math.round(c.modified || 0)}`,
        name: c.name || prettyName(c.file),
        file: c.file,
        ext: (c.file.split('.').pop() || '').toUpperCase(),
        url: c.url,
        source: 'folder',
      }));
      const changed = next.map((c) => c.id).join('|') !== this.folderClips.map((c) => c.id).join('|');
      this.folderClips = next;
      this.folderStatus = 'ok';
      return changed;
    } catch {
      const changed = this.folderStatus !== 'unavailable';
      this.folderStatus = 'unavailable';
      return changed;
    }
  }

  addFiles(fileList) {
    let added = 0;
    for (const f of Array.from(fileList || [])) {
      if (!AUDIO_EXT.test(f.name) && !(f.type || '').startsWith('audio/')) continue;
      const id = `local:${f.name}:${f.size}`;
      if (this.localClips.some((c) => c.id === id) || this.folderClips.some((c) => c.file === f.name)) continue;
      this.localClips.push({
        id,
        name: prettyName(f.name),
        file: f.name,
        ext: (f.name.split('.').pop() || '').toUpperCase(),
        url: URL.createObjectURL(f),
        source: 'local',
      });
      added++;
    }
    return added;
  }

  async ensureBuiltin() {
    if (this.builtin) return;
    try {
      const blob = await synthAnthem();
      this.builtin = {
        id: 'builtin:anthem',
        name: 'Strike Force Anthem',
        file: 'built-in',
        ext: 'BUILT-IN',
        url: URL.createObjectURL(blob),
        source: 'builtin',
      };
    } catch {
      /* OfflineAudioContext unavailable — fine */
    }
  }

  // Load metadata to learn each clip's duration (shown in the list).
  probeDurations(onUpdate) {
    for (const c of this.clips) {
      if (this.durations.has(c.id)) continue;
      this.durations.set(c.id, null);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => {
        this.durations.set(c.id, a.duration);
        onUpdate?.();
      };
      // A failed probe isn't proof the clip is unplayable (it may still be copying,
      // or need the decode fallback), so just leave the duration unknown.
      a.onerror = () => this.durations.set(c.id, NaN);
      a.src = c.url;
    }
  }
}

// --- built-in 124 BPM anthem, rendered offline and encoded as WAV ----------
async function synthAnthem() {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const sr = 22050;
  const bpm = 124;
  const beat = 60 / bpm;
  const bars = 12;
  const dur = bars * 4 * beat + 1;
  const ctx = new OAC(1, Math.ceil(sr * dur), sr);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const kick = (t) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.32);
  };
  const noiseHit = (t, freq, d, gain, type = 'highpass') => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + d + 0.02);
  };
  const tone = (t, freq, d, gain, type = 'sawtooth') => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + d + 0.02);
  };
  const midi = (m) => 440 * 2 ** ((m - 69) / 12);
  const prog = [57, 53, 48, 55]; // Am F C G
  for (let b = 0; b < bars; b++) {
    const root = prog[b % 4];
    for (let q = 0; q < 4; q++) {
      const t = (b * 4 + q) * beat;
      kick(t);
      if (q % 2 === 1) noiseHit(t, 1500, 0.18, 0.5, 'bandpass');
      noiseHit(t + beat / 2, 7000, 0.05, 0.25);
      tone(t + beat / 2, midi(root - 24), beat * 0.45, 0.25, 'square');
      if (b >= 4) [0, 3, 7].forEach((iv) => tone(t, midi(root + iv + (iv === 3 && root !== 57 ? 1 : 0)), beat * 0.35, 0.05));
    }
    if (b >= 8) {
      // "ole ole" style lead
      const mel = [76, 76, 74, 72, 74, 76, 79, 76];
      mel.forEach((m, i) => tone(b * 4 * beat + i * beat * 0.5, midi(m), beat * 0.45, 0.07, 'triangle'));
    }
  }
  const buf = await ctx.startRendering();
  return encodeWav(buf);
}

function encodeWav(buf) {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + data.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, data.length * 2, true);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const k = peak > 0 ? 0.95 / peak : 1;
  for (let i = 0; i < data.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * k)) * 32767, true);
  return new Blob([out], { type: 'audio/wav' });
}
