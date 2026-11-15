import { LINES, COMMENTATORS } from './lines.js';
import { MOODS, EVENT_MOOD, INTERJECTIONS, BANTER } from './moods.js';

// Live commentary with emotional delivery.
// Every line is said in a mood (hype, shock, scream, sarcastic, sad…). The line
// is split into phrases and each phrase gets its own pitch / speed / volume, so
// the voice climbs, punches CAPITALISED words and lifts on questions instead of
// reading in one flat tone. Big moments also get a reaction from the co-commentator
// and a matching crowd reaction underneath.

const PRIORITY = {
  kickoff: 3, encounter: 3, encounterKeeper: 4, kill: 4, killKeeper: 5, goal: 5, defeat: 5, enraged: 4,
  replay: 2, stagger: 3, windup: 2, tackleTaken: 2, ballBlocked: 3, headshot: 2, hitBig: 1, hpHalf: 2,
  hpLow: 2, dodge: 1, missStreak: 1, throwHit: 2, lowPossession: 3, reload: 0, running: 0, finalRun: 4,
  weapon_pistol: 0, weapon_shotgun: 0, weapon_rifle: 0, weapon_sniper: 0, dance: 4, danceEnd: 4,
};

const BANTER_EVENTS = { kill: 0.65, killKeeper: 1, goal: 1, headshot: 0.35, ballBlocked: 0.5, hitBig: 0.25, defeat: 0.8, stagger: 0.3 };

// Higher score = more natural-sounding voice.
function voiceScore(v) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural/.test(n)) s += 100; // Edge "Online (Natural)" voices
  if (/online/.test(n)) s += 30;
  if (/premium|enhanced|siri/.test(n)) s += 60; // macOS / iOS high-quality voices
  if (/google/.test(n)) s += 40; // Chrome's network voices
  if (!v.localService) s += 10;
  if (/en-(us|gb|in|au)/i.test(v.lang)) s += 5;
  if (/espeak|compact/.test(n)) s -= 50;
  return s;
}

const FEMALE = /female|zira|samantha|susan|karen|aria|jenny|sonia|libby|natasha|neerja|clara|emma|ava|michelle|ana|moira|tessa|fiona|victoria|allison|serena/i;
const MALE = /\bmale\b|david|daniel|guy|alex|fred|rishi|mark|ryan|thomas|christopher|eric|roger|steffan|william|prabhat|brian|andrew|tom|oliver|arthur|aaron|gordon/i;

export class Commentary {
  constructor(store, audio) {
    this.store = store;
    this.audio = audio;
    this.voiceOn = true;
    this.lastSaid = new Map();
    this.lastEventAt = new Map();
    this.busyUntil = 0;
    this.currentPriority = -1;
    this.voices = {};
    this.allVoices = [];
    this.live = []; // keep utterances referenced (Chrome drops events otherwise)
    this.banterTimer = null;
    this.intensity = 0.3; // 0..1 how big the moment is (set by the engine)
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (this.synth) {
      const load = () => this._loadVoices();
      load();
      try {
        this.synth.addEventListener?.('voiceschanged', load);
      } catch {
        /* ignore */
      }
    }
  }

  _loadVoices() {
    try {
      const all = this.synth.getVoices().filter((v) => /^en/i.test(v.lang));
      if (!all.length) return;
      all.sort((a, b) => voiceScore(b) - voiceScore(a));
      this.allVoices = all;
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem('sffc-voices') || '{}');
      } catch {
        /* ignore */
      }
      const byName = (n) => all.find((v) => v.name === n);
      const male = all.find((v) => MALE.test(v.name) && !FEMALE.test(v.name));
      const female = all.find((v) => FEMALE.test(v.name));
      this.voices.dev = byName(saved.dev) || male || all[0];
      this.voices.zoe = byName(saved.zoe) || female || all.find((v) => v !== this.voices.dev) || all[0];
      this._publishVoices();
    } catch {
      /* ignore */
    }
  }

  _publishVoices() {
    const q = this.allVoices.length ? voiceScore(this.allVoices[0]) : 0;
    this.store.set({
      voiceList: this.allVoices.map((v) => v.name),
      voicePick: { dev: this.voices.dev?.name || '', zoe: this.voices.zoe?.name || '' },
      voiceQuality: q >= 100 ? 'natural' : q >= 40 ? 'good' : 'basic',
    });
  }

  setVoiceFor(who, name) {
    const v = this.allVoices.find((x) => x.name === name);
    if (!v) return;
    this.voices[who] = v;
    try {
      localStorage.setItem('sffc-voices', JSON.stringify({ dev: this.voices.dev?.name, zoe: this.voices.zoe?.name }));
    } catch {
      /* ignore */
    }
    this._publishVoices();
  }

  testVoices() {
    this.stop();
    this._deliver('dev', "OH MY DAYS! He's done it AGAIN! Absolute CINEMA!", 'scream', 5);
    this._queueBanter('zoe', 'I literally jumped out of my seat!', 'scream', 1200);
  }

  setVoice(on) {
    this.voiceOn = on;
    if (!on) this.stop();
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  stop() {
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
    clearTimeout(this.banterTimer);
    this.live = [];
    this.busyUntil = 0;
    this.currentPriority = -1;
    this.audio?.duck(false);
  }

  reset() {
    this.stop();
    this.store.set({ commentary: [] });
  }

  // say('kill', { name: 'Brandt' }, { chance, cooldown, force })
  say(event, vars = {}, { chance = 1, cooldown = 0, force = false } = {}) {
    const pool = LINES[event];
    if (!pool || Math.random() > chance) return false;
    const now = performance.now();
    if (cooldown && now - (this.lastEventAt.get(event) || -1e9) < cooldown * 1000) return false;
    const pr = PRIORITY[event] ?? 1;
    if (now < this.busyUntil && !force && pr <= this.currentPriority) return false;

    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === this.lastSaid.get(event)) idx = (idx + 1) % pool.length;
    this.lastSaid.set(event, idx);
    this.lastEventAt.set(event, now);
    const [who, template, moodOverride] = pool[idx];
    let text = template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
    const mood = moodOverride || EVENT_MOOD[event] || 'chill';

    // Sometimes open with an exclamation, unless the line already starts with one.
    const ints = INTERJECTIONS[mood];
    if (ints && Math.random() < 0.35 + this.intensity * 0.3 && !/^(OH|OOH|OOF|NO|GO+AL|AND|UH|THE WALL|HEADSHOT|SHOTGUN|HE )/i.test(text)) {
      text = `${ints[(Math.random() * ints.length) | 0]} ${text}`;
    }

    clearTimeout(this.banterTimer);
    const dur = this._deliver(who, text, mood, pr, true);

    // Co-commentator reaction to big moments
    const bChance = BANTER_EVENTS[event];
    if (bChance && Math.random() < bChance) {
      const other = who === 'dev' ? 'zoe' : 'dev';
      const bMood = mood === 'sad' ? 'sad' : mood === 'shock' ? 'shock' : mood === 'scream' ? 'scream' : 'hype';
      const pool2 = BANTER[bMood];
      this._queueBanter(other, pool2[(Math.random() * pool2.length) | 0], bMood, dur * 1000 + 150);
    }
    return true;
  }

  _queueBanter(who, text, mood, delayMs) {
    clearTimeout(this.banterTimer);
    if (this.voiceOn && this.synth) {
      // Speech queues after the current line; the feed entry appears when it starts
      // (or after a timeout, in case this browser never actually speaks).
      let shown = false;
      this._deliver(who, text, mood, 2, false, () => (shown = true));
      this.banterTimer = setTimeout(() => !shown && this._feed(who, text, mood, false), delayMs + 2500);
    } else {
      this.banterTimer = setTimeout(() => this._deliver(who, text, mood, 2), delayMs);
    }
  }

  _feed(who, text, mood, hype) {
    const feed = this.store.get().commentary || [];
    const entry = {
      id: (feed.length ? feed[feed.length - 1].id : 0) + 1,
      who,
      speaker: COMMENTATORS[who].short,
      text,
      mood,
      emoji: MOODS[mood]?.emoji || '',
      hype,
    };
    this.store.set({ commentary: [...feed, entry].slice(-3) });
  }

  // Shows the line and (optionally) speaks it with emotion. Returns est. duration (s).
  _deliver(who, text, mood, pr, interrupt = false, feedOnStart = false) {
    const m = MOODS[mood] || MOODS.chill;
    const loud = mood === 'scream' || mood === 'hype';
    const words = text.split(/\s+/).length;
    const dur = Math.max(1.4, (words * 0.33) / (m.rate * (1 + this.intensity * 0.1)));
    const now = performance.now();
    this.busyUntil = (interrupt ? now : Math.max(this.busyUntil, now)) + dur * 1000;
    this.currentPriority = pr;

    // Crowd reacts under the big lines
    if (mood === 'scream') this.audio?.crowdReact(0.9);
    else if (mood === 'shock') this.audio?.crowdOoh?.();
    else if (mood === 'sad') this.audio?.crowdGroan?.();

    if (!feedOnStart || !this.voiceOn || !this.synth) this._feed(who, text, mood, pr >= 4 || mood === 'scream');
    if (this.voiceOn)
      this._speak(who, text, mood, interrupt, feedOnStart ? () => {
        this._feed(who, text, mood, loud);
        if (typeof feedOnStart === 'function') feedOnStart();
      } : null);
    return dur;
  }

  // Split a line into phrases at punctuation, keeping the punctuation.
  _phrases(text) {
    const parts = text.match(/[^.!?,—–:;]+[.!?,—–:;]*/g) || [text];
    return parts.map((p) => p.trim()).filter((p) => p.replace(/[^a-z0-9]/gi, '').length > 0);
  }

  // Make text friendlier for speech engines: ALL-CAPS words would otherwise be
  // spelled out letter by letter by some voices.
  _speechText(phrase) {
    return phrase
      .replace(/[“”"]/g, '')
      .replace(/−/g, 'minus ')
      .replace(/\b([A-Z][A-Z']+)\b/g, (w) => (/^(GK|TV|OK|AI|TED)$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
      .replace(/\bGOO+A+L\b/gi, 'Gooooaaal')
      .replace(/\bLET'S GOO+\b/gi, "Let's gooo")
      .replace(/\bHAHA+\b/gi, 'ha ha ha')
      .replace(/\bW\b/g, 'dub')
      .replace(/\.\.\./g, ',');
  }

  _speak(who, text, mood, interrupt, onStartFirst) {
    const s = this.synth;
    if (!s || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      if (interrupt) {
        s.cancel();
        this.live = [];
      }
      const c = COMMENTATORS[who];
      const m = MOODS[mood] || MOODS.chill;
      const boost = this.intensity * 0.12;
      const phrases = this._phrases(text);
      phrases.forEach((ph, i) => {
        const letters = ph.replace(/[^a-z]/gi, '');
        const capsRatio = letters.length ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
        const exclaim = /!/.test(ph);
        const question = /\?/.test(ph);
        const trailing = /\.\.\.|,$/.test(ph);
        let pitch = c.pitch * m.pitch + m.climb * i + boost;
        let rate = c.rate * m.rate + (mood === 'scream' ? i * 0.03 : 0) + boost * 0.6;
        if (exclaim) {
          pitch += 0.1;
          rate += 0.05;
        }
        if (capsRatio > 0.6 && letters.length > 2) {
          pitch += 0.18; // shouted words
          rate += 0.04;
        }
        if (question) pitch += 0.12;
        if (trailing && mood !== 'scream') rate -= 0.06;
        // a little human wobble so repeated lines never sound identical
        pitch += (Math.random() - 0.5) * 0.06;
        rate += (Math.random() - 0.5) * 0.04;

        const u = new SpeechSynthesisUtterance(this._speechText(ph));
        if (this.voices[who]) u.voice = this.voices[who];
        u.lang = this.voices[who]?.lang || 'en-GB';
        u.pitch = Math.max(0.4, Math.min(2, pitch));
        u.rate = Math.max(0.6, Math.min(1.7, rate));
        u.volume = Math.min(1, m.volume + (exclaim ? 0.1 : 0));
        if (i === 0) {
          u.onstart = () => {
            this.audio?.duck(true);
            onStartFirst?.();
          };
        }
        if (i === phrases.length - 1) {
          u.onend = () => {
            this.audio?.duck(false);
            this.currentPriority = -1;
            this.live = this.live.filter((x) => x !== u);
          };
        }
        u.onerror = () => this.audio?.duck(false);
        this.live.push(u);
        s.speak(u);
      });
    } catch {
      /* speech not available — the text feed still works */
    }
  }
}
