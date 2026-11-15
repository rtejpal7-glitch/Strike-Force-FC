import * as THREE from 'three';
import { OpponentModel } from '../opponents/OpponentModel.js';
import { KITS } from '../core/config.js';
import { ClipLibrary } from './ClipLibrary.js';
import { BeatTracker } from './BeatTracker.js';
import { MOVES, BEATS_PER_MOVE } from './DanceMoves.js';

// Post-goal celebration: lists clips from /celebration-audio (live), plays the
// one you pick through Web Audio, tracks its beat, and makes the player avatar
// dance in sync while a third-person camera orbits and the crowd goes wild.

const POLL_MS = 3000;

export class CelebrationSystem {
  constructor({ scene, camera, audio, store, effects, stadium, commentary }) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.store = store;
    this.effects = effects;
    this.stadium = stadium;
    this.commentary = commentary;
    this.library = new ClipLibrary();
    this.avatar = new OpponentModel({
      name: 'You',
      number: 10,
      kit: { ...KITS.player, trim: 0xffffff },
      look: { skin: KITS.player.skin, hair: 0x2b1b10, hairStyle: 'fade', height: 1.02, build: 1.05, eyes: 0x4a2e16, face: { jaw: 1.05, beard: 'stubble' } },
      sponsor: 'STRIKE FC',
    });
    this.avatar.root.visible = false;
    this.avatar.bar.visible = false;
    scene.add(this.avatar.root);
    this.active = false;
    this.playing = null;
    this.camAngle = Math.PI;
    this.time = 0;
    this.spec = new Float32Array(32);
  }

  // ---------------- lifecycle ----------------
  async open(pos) {
    this.active = true;
    this.pos = { x: pos.x, z: pos.z };
    this.avatar.root.visible = true;
    this.avatar.root.position.set(pos.x, 0, pos.z);
    this.camAngle = Math.PI * 1.05;
    this.time = 0;
    this.idlePhase = 0;
    this._publish();
    await Promise.all([this.library.ensureBuiltin(), this.library.refreshFolder()]);
    this._publishList();
    clearInterval(this.poll);
    this.poll = setInterval(async () => {
      if (await this.library.refreshFolder()) this._publishList();
    }, POLL_MS);
  }

  close() {
    this.stop(false);
    clearInterval(this.poll);
    this.active = false;
    this.avatar.root.visible = false;
    this.store.set({ celebration: null });
  }

  async refresh() {
    this.library.durations.clear();
    this.store.set({ celebrationError: null });
    await this.library.refreshFolder();
    this._publishList();
  }

  addFiles(files) {
    const n = this.library.addFiles(files);
    this._publishList();
    return n;
  }

  // ---------------- playback ----------------
  // Plays a clip. First tries a streaming <audio> element; if the browser
  // refuses it (server quirks, odd file headers, partially copied files), it
  // falls back to downloading and decoding the whole file with Web Audio.
  // Only if both fail do we show an error, with the actual reason.
  async play(id) {
    const clip = this.library.find(id);
    if (!clip) return;
    this.stop(false);
    this.audio.init();
    const ctx = this.audio.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const token = (this.playToken = (this.playToken || 0) + 1);
    this.failed = null;
    this.store.set({ celebrationError: null, celebrationLoading: clip.id });

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    const gain = ctx.createGain();
    analyser.connect(gain).connect(this.audio.master);
    const graph = { analyser, gain };

    let player;
    let firstErr;
    try {
      player = await this._playElement(clip, graph);
    } catch (err) {
      firstErr = err;
      console.warn(`[celebration] <audio> playback failed for "${clip.file}", trying Web Audio decode`, err);
      if (token !== this.playToken) return;
      try {
        player = await this._playDecoded(clip, graph, ctx);
      } catch (err2) {
        console.error(`[celebration] decode fallback failed for "${clip.file}"`, err2);
        if (token !== this.playToken) return;
        try {
          analyser.disconnect();
          gain.disconnect();
        } catch {
          /* ignore */
        }
        this._fail(clip, firstErr, err2);
        return;
      }
    }
    if (token !== this.playToken) {
      player.stop();
      return;
    }
    this.playing = { clip, player, analyser, gain, beat: new BeatTracker(analyser), moveIdx: -1, startedAt: this.time, lastFx: 0 };
    player.onEnded = () => this.playing?.player === player && this.stop(true);
    this.store.set({ celebrationLoading: null });
    this.audio.setCrowdIntensity(0.25);
    this.effects.fireworks(5, this.audio);
    this.commentary?.say('dance', {}, { force: true });
    this._publish();
  }

  _playElement(clip, { analyser }) {
    return new Promise((resolve, reject) => {
      const el = new Audio();
      el.preload = 'auto';
      let started = false;
      let src = null;
      const timer = setTimeout(() => !started && fail(new Error('timed out loading the file')), 12000);
      const fail = (err) => {
        clearTimeout(timer);
        el.onerror = el.onplaying = null;
        el.pause();
        el.removeAttribute('src');
        el.load();
        try {
          src?.disconnect();
        } catch {
          /* ignore */
        }
        reject(err);
      };
      const player = {
        kind: 'stream',
        get currentTime() {
          return el.currentTime;
        },
        get duration() {
          return isFinite(el.duration) ? el.duration : 0;
        },
        stop() {
          el.onended = el.onerror = null;
          el.pause();
          try {
            src.disconnect();
          } catch {
            /* ignore */
          }
        },
        onEnded: null,
      };
      el.onerror = () => {
        const e = el.error;
        const err = new Error(e ? `media error ${e.code}${e.message ? `: ${e.message}` : ''}` : 'media error');
        err.mediaCode = e?.code;
        if (!started) fail(err);
        else player.onEnded?.(); // broke mid-song: just end the dance
      };
      el.onplaying = () => {
        if (started) return;
        started = true;
        clearTimeout(timer);
        resolve(player);
      };
      el.onended = () => player.onEnded?.();
      el.src = clip.url;
      try {
        src = this.audio.ctx.createMediaElementSource(el);
        src.connect(analyser);
      } catch (err) {
        fail(err);
        return;
      }
      el.play().catch((err) => !started && fail(err));
    });
  }

  async _playDecoded(clip, { analyser }, ctx) {
    let res;
    try {
      res = await fetch(clip.url, { cache: 'no-store' });
    } catch (err) {
      const e = new Error('could not read the file');
      e.kind = 'read';
      e.cause = err;
      throw e;
    }
    if (!res.ok) {
      const e = new Error(`server answered ${res.status}`);
      e.kind = res.status === 404 ? 'missing' : 'read';
      throw e;
    }
    const data = await res.arrayBuffer();
    if (data.byteLength < 1024) {
      const e = new Error('file is empty');
      e.kind = 'empty';
      throw e;
    }
    const head = new Uint8Array(data.slice(0, 16)); // decodeAudioData detaches `data`
    let buffer;
    try {
      buffer = await new Promise((ok, bad) => {
        const pr = ctx.decodeAudioData(data, ok, bad);
        if (pr && pr.then) pr.then(ok, bad);
      });
    } catch (err) {
      const e = new Error('the audio could not be decoded');
      e.kind = 'decode';
      e.cause = err;
      e.bytes = head;
      throw e;
    }
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(analyser);
    const t0 = ctx.currentTime;
    const player = {
      kind: 'decoded',
      get currentTime() {
        return Math.min(buffer.duration, ctx.currentTime - t0);
      },
      duration: buffer.duration,
      stop() {
        node.onended = null;
        try {
          node.stop();
          node.disconnect();
        } catch {
          /* ignore */
        }
      },
      onEnded: null,
    };
    node.onended = () => player.onEnded?.();
    node.start();
    return player;
  }

  // Work out a human explanation for why a clip can't play.
  _fail(clip, streamErr, decodeErr) {
    const ext = (clip.ext || '').toLowerCase();
    const sniff = decodeErr?.bytes ? sniffFormat(decodeErr.bytes) : null;
    let title = `Can't play "${clip.name}"`;
    let detail;
    if (decodeErr?.kind === 'missing') detail = 'The file is no longer in the celebration-audio folder. Was it renamed or moved? Press ↻ to refresh the list.';
    else if (decodeErr?.kind === 'empty') detail = 'The file is empty. If you just copied it in, wait a few seconds for the copy to finish, then try again.';
    else if (decodeErr?.kind === 'read') detail = `The game couldn't read the file (${decodeErr.message}). Try ↻ refresh, or add it with "Add files".`;
    else if (sniff === 'drm') detail = "This looks like a copy-protected (DRM) music file, for example from Apple Music or iTunes. Browsers aren't allowed to play those. Use an unprotected MP3 instead.";
    else if (sniff && sniff !== ext && !(sniff === 'm4a' && ['m4a', 'aac', 'mp4'].includes(ext))) {
      detail = `The file is named .${ext} but it is really a ${sniff.toUpperCase()} file, and your browser can't decode it. Convert it to MP3 (any free online converter or Audacity will do it).`;
    } else if (['wma', 'alac', 'aiff', 'aif', 'amr'].includes(ext) || sniff === 'wma') {
      detail = `${ext.toUpperCase()} files aren't supported by web browsers. Convert it to MP3 (any free online converter or Audacity will do it).`;
    } else {
      detail = `Your browser couldn't decode this ${ext.toUpperCase()} file. It may be damaged, copy-protected, or use an unusual encoding. Converting it to a standard MP3 almost always fixes this.`;
    }
    this.failed = clip.id;
    this.store.set({
      celebrationLoading: null,
      celebrationError: { clipId: clip.id, title, detail, tech: [streamErr?.message, decodeErr?.message].filter(Boolean).join(' / ') },
    });
    this._publish();
  }

  stop(finished = false) {
    const p = this.playing;
    if (!p) return;
    this.playing = null;
    try {
      p.player.onEnded = null;
      p.player.stop();
      p.analyser.disconnect();
      p.gain.disconnect();
    } catch {
      /* ignore */
    }
    if (finished) {
      this.audio.bigCheer(1);
      this.commentary?.say('danceEnd', {}, { force: true });
    }
    this._publish();
  }

  spectrum(out) {
    if (!this.playing) return out.fill(0);
    return this.playing.beat.spectrum(out);
  }

  // ---------------- per-frame ----------------
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const m = this.avatar;
    const p = this.playing;
    let beatPhase;
    let energy = 0.8;
    let pulse = 0;
    let move;
    if (p) {
      const onBeat = p.beat.update(dt);
      beatPhase = p.beat.phase;
      energy = 0.6 + Math.min(0.7, p.beat.energy * 1.4);
      pulse = p.beat.beatPulse;
      const idx = Math.floor(beatPhase / BEATS_PER_MOVE) % MOVES.length;
      if (idx !== p.moveIdx) {
        p.moveIdx = idx;
        if (beatPhase > 1) {
          this.effects.pyro(this._cornerPoints());
          this.audio.pyro();
        }
      }
      move = MOVES[idx];
      // Crowd follows the music
      this.stadium.crowd.setExcitement(0.45 + p.beat.energy * 1.2);
      if (onBeat && p.beat.bass > 0.55 && this.time - p.lastFx > 2.5) {
        p.lastFx = this.time;
        this.effects.confetti(new THREE.Vector3(this.pos.x, 0, this.pos.z + 4), 220);
      }
    } else {
      // Idle: easy bounce and waving at the crowd while you pick a track
      this.idlePhase += dt * (100 / 60);
      beatPhase = this.idlePhase;
      move = MOVES[MOVES.length - 1];
      energy = 0.6;
      this.stadium.crowd.setExcitement(0.6);
    }

    m.resetJoints();
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    const local = p ? beatPhase % BEATS_PER_MOVE : beatPhase;
    const out = move.fn(m, local, energy, pulse) || {};
    if (pulse > 0) m.hips.position.y -= pulse * 0.03;

    // Camera orbit (slower when idle), pulsing in on the beat
    this.camAngle += dt * (p ? 0.28 : 0.15);
    const r = 5.3 - pulse * 0.3;
    const cam = this.camera;
    const ax = this.pos.x;
    const az = this.pos.z;
    cam.position.set(ax + Math.sin(this.camAngle) * r, 1.45 + Math.sin(this.time * 0.35) * 0.35, az + Math.cos(this.camAngle) * r);
    const baseYaw = Math.atan2(cam.position.x - ax, cam.position.z - az);
    const slide = out.slide || 0;
    m.root.position.set(ax + Math.sin(baseYaw) * slide, 0, az + Math.cos(baseYaw) * slide);
    m.root.rotation.y = baseYaw + (out.spin || 0);
    m.body.position.y = out.lift || 0;
    cam.lookAt(m.root.position.x, 1.0 + (out.lift || 0) * 0.5, m.root.position.z);
    if (cam.fov !== 50) {
      cam.fov = 50;
      cam.updateProjectionMatrix();
    }

    this._tick = (this._tick || 0) + dt;
    if (this._tick > 0.1) {
      this._tick = 0;
      this._publish(move);
    }
  }

  _cornerPoints() {
    const x = this.pos.x;
    const z = this.pos.z;
    return [new THREE.Vector3(x - 6, 0.2, z + 5), new THREE.Vector3(x + 6, 0.2, z + 5), new THREE.Vector3(x - 6, 0.2, z - 5), new THREE.Vector3(x + 6, 0.2, z - 5)];
  }

  // ---------------- store ----------------
  _publishList() {
    const L = this.library;
    const list = L.clips.map((c) => ({
      id: c.id,
      name: c.name,
      ext: c.ext,
      source: c.source,
      duration: Number.isFinite(L.durations.get(c.id)) ? L.durations.get(c.id) : null,
    }));
    this.store.set({ celebrationClips: list, celebrationFolder: L.folderStatus });
    L.probeDurations(() => this._publishList());
  }

  _publish(move) {
    const p = this.playing;
    if (p && p.player.duration > 0 && !(this.library.durations.get(p.clip.id) > 0)) {
      this.library.durations.set(p.clip.id, p.player.duration);
      this._publishList();
    }
    this.store.set({
      celebration: {
        playingId: p ? p.clip.id : null,
        name: p ? p.clip.name : null,
        t: p ? Math.round(p.player.currentTime * 10) / 10 : 0,
        dur: p ? p.player.duration : 0,
        move: move ? move.name : null,
        emoji: move ? move.emoji : '',
        bpm: p ? Math.round(p.beat.bpm) : 0,
        beat: p ? p.beat.beats : 0,
        failed: this.failed || null,
      },
    });
  }
}

// Identify the real container format from the first bytes of a file.
function sniffFormat(b) {
  const s = String.fromCharCode(...b);
  if (s.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WAVE') return 'wav';
  if (s.startsWith('OggS')) return 'ogg';
  if (s.startsWith('fLaC')) return 'flac';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (s.slice(4, 8) === 'ftyp') return /M4P|m4p/.test(s.slice(8, 12)) ? 'drm' : 'm4a';
  if (b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xb2 && b[3] === 0x75) return 'wma';
  if (s.startsWith('FORM')) return 'aiff';
  if (s.startsWith('#!AMR')) return 'amr';
  return null;
}
