// Minimal observable store shared by the Three.js engine and the React HUD.
// The engine writes with set(); React reads with useGameStore(selector).

export function createInitialState(roster) {
  return {
    screen: 'menu', // menu | playing | paused | goal | victory | defeat
    phase: 'idle', // idle | running | combat | resuming | final | kicking | goal
    progress: 0,
    defeated: 0,
    total: roster.length,
    opponents: roster.map((r) => ({
      id: r.id,
      name: r.name,
      number: r.number,
      isKeeper: !!r.isKeeper,
      defeated: false,
    })),
    combat: null,
    weapon: { current: 'pistol', slots: [], reloadProgress: 0, reloading: false },
    possession: 100,
    zoom: false,
    stats: { shots: 0, hits: 0, headshots: 0, damage: 0, time: 0, tacklesTaken: 0 },
    hitMarker: { id: 0, head: false, kill: false },
    damageFlash: 0,
    toast: { id: 0, text: '' },
    muted: false,
    commentary: [],
    commentaryVoice: true,
    replay: null,
    graphics: { mode: 'auto', level: 'high' },
    fps: 0,
    showFps: false,
    renderWarning: null,
    voiceList: [],
    voicePick: { dev: '', zoe: '' },
    voiceQuality: 'basic',
    celebration: null,
    celebrationClips: [],
    celebrationFolder: 'unknown',
    celebrationError: null,
    celebrationLoading: null,
    loading: true,
  };
}

export class GameStore {
  constructor(initial) {
    this.state = initial;
    this.listeners = new Set();
  }

  get = () => this.state;

  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(partial) {
    let changed = false;
    for (const k in partial) {
      if (this.state[k] !== partial[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn(this.state));
  }

  toast(text) {
    this.set({ toast: { id: this.state.toast.id + 1, text } });
  }
}
