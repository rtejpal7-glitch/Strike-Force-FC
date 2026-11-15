import * as THREE from 'three';
import { PITCH, PLAYER, COMBAT, ROSTER } from './core/config.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { Stadium } from './environment/Stadium.js';
import { PlayerController } from './player/PlayerController.js';
import { Football } from './football/Football.js';
import { Opponent } from './opponents/Opponent.js';
import { WeaponSystem } from './weapons/WeaponSystem.js';
import { Effects } from './combat/Effects.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { PostFX } from './rendering/PostFX.js';
import { Commentary } from './commentary/Commentary.js';
import { ReplaySystem } from './replay/ReplaySystem.js';
import { CelebrationSystem } from './celebration/CelebrationSystem.js';

// Orchestrates the whole game: rendering, the phase state machine
// (running → combat → resuming → … → final run → kick → goal), and syncing
// a compact snapshot of the game into the React HUD store.

const CENTER_NDC = { x: 0, y: 0 };

export class GameEngine {
  constructor(container, store, hudRoot) {
    this.container = container;
    this.store = store;
    this.hudRoot = hudRoot;
    this.mode = 'menu';
    this.phase = 'idle';
    this.clock = new THREE.Clock();
    this.hudTimer = 0;
    this.lastHud = '';
    this.time = 0;
    this.gfxMode = 'auto'; // auto | high | medium | low
    this.gfxLevel = 'high';
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.slowWindows = 0;
    this.blackChecks = 0;
    this.blackStrikes = 0;
    // Touch devices start in touch mode; the mode follows whatever you actually use.
    this.touchMode = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    this.aimSensitivity = 1;
    try {
      this.aimSensitivity = Number(localStorage.getItem('sffc-aim-sens')) || 1;
    } catch {
      /* ignore */
    }
  }

  init() {
    const { container } = this;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'game-canvas';
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(PLAYER.baseFov, 1, 0.03, 900);
    this.scene.add(this.camera);

    this.audio = new AudioManager();
    this.stadium = new Stadium(this.scene, renderer);
    this.player = new PlayerController(this.scene, this.camera, this.audio);
    this.football = new Football(this.scene, this.audio);
    this.opponents = ROSTER.map((def) => new Opponent(def, this.scene, this.audio));
    this.weapons = new WeaponSystem(this.camera, this.scene, this.audio);
    this.effects = new Effects(this.scene);
    this.combat = new CombatSystem({ scene: this.scene, camera: this.camera, effects: this.effects, audio: this.audio, weapons: this.weapons });
    this.commentary = new Commentary(this.store, this.audio);
    this.replay = new ReplaySystem(this.scene, this.store);
    this.replay.onCrowdShot = () => this.audio.crowdReact(1);
    this.celebration = new CelebrationSystem({
      scene: this.scene,
      camera: this.camera,
      audio: this.audio,
      store: this.store,
      effects: this.effects,
      stadium: this.stadium,
      commentary: this.commentary,
    });

    this.input = new InputManager(renderer.domElement, {
      onSelectWeapon: (i) => this.selectWeapon(i),
      onCycleWeapon: (d) => this.mode === 'play' && this.weapons.cycle(d) && this._weaponComment(),
      onLastWeapon: () => this.mode === 'play' && this.weapons.selectLast() && this._weaponComment(),
      onReload: () => this.mode === 'play' && this.weapons.reload() && this.commentary.say('reload', {}, { chance: 0.35, cooldown: 10 }),
      onCommentary: () => this.toggleCommentary(),
      onFps: () => this.toggleFps(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onZoom: (z) => this.setZoom(z),
      onAimMove: (x, y) => this._setAimCss(x, y),
    });

    this._onResize = () => this.resize();
    this.resizeObserver = new ResizeObserver(this._onResize);
    this.resizeObserver.observe(container);
    this.resize();
    this.postfx = null;
    this.gpu = this._gpuName();
    const software = /swiftshader|llvmpipe|software|basic render/i.test(this.gpu);
    let saved = null;
    try {
      saved = localStorage.getItem('sffc-gfx');
    } catch {
      /* storage unavailable */
    }
    if (saved && ['auto', 'high', 'medium', 'low'].includes(saved)) this.gfxMode = saved;
    // Phones start on Medium (no post-processing) to keep a smooth frame rate.
    const start = this.gfxMode === 'auto' ? (software ? 'low' : this.touchMode ? 'medium' : 'high') : this.gfxMode;
    this.applyQuality(start);
    if (software) this.softwareGpu = true;
    this._onVis = () => document.hidden && this.mode === 'play' && this.togglePause(true);
    document.addEventListener('visibilitychange', this._onVis);

    this.resetWorld();
    this._onAnyPointer = (e) => {
      if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode(true);
      else if (e.pointerType === 'mouse' && this.touchMode && e.type === 'pointermove' && (e.movementX || e.movementY)) this.setTouchMode(false);
    };
    window.addEventListener('pointerdown', this._onAnyPointer, true);
    window.addEventListener('pointermove', this._onAnyPointer, true);
    this.setTouchMode(this.touchMode, true);
    this.store.set({ loading: false, aimSensitivity: this.aimSensitivity });
    if (this.softwareGpu) this.store.toast('Hardware acceleration looks OFF — graphics set to LOW');
    renderer.setAnimationLoop(() => this.frame());
    if (typeof window !== 'undefined') window.__game = this; // handy for debugging
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx?.setSize(w, h);
    this.viewSize = { w, h };
    if (this.input && !this.input.aimPx.x) this._setAimCss(w / 2, h * 0.47);
  }

  _setAimCss(x, y, raw = false) {
    if (this.touchMode && !raw) return; // crosshair stays centred on touch
    if (!raw) {
      x = `${x}px`;
      y = `${y}px`;
    }
    const el = this.hudRoot?.();
    if (el) {
      el.style.setProperty('--aim-x', x);
      el.style.setProperty('--aim-y', y);
    }
  }

  // The replay is drawn exactly inside the .replay-frame box from the HUD, so it
  // follows the desktop and phone layouts (and iPhone safe areas) automatically.
  _replayRect() {
    const el = document.querySelector('.replay-frame');
    const cv = this.renderer.domElement.getBoundingClientRect();
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 20)
        return {
          x: Math.round(r.left - cv.left + el.clientLeft),
          y: Math.round(r.top - cv.top + el.clientTop),
          w: Math.round(el.clientWidth),
          h: Math.round(el.clientHeight),
        };
    }
    const { w } = this.viewSize;
    const pw = Math.min(360, w * 0.28);
    return { x: Math.round(w - pw - 11), y: 87, w: Math.round(pw - 6), h: Math.round((pw * 9) / 16 - 6) };
  }

  // ------------------------------------------------------------------
  // Graphics quality
  // ------------------------------------------------------------------
  _gpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    } catch {
      return 'unknown';
    }
  }

  setGraphicsMode(mode) {
    this.gfxMode = mode;
    try {
      localStorage.setItem('sffc-gfx', mode);
    } catch {
      /* ignore */
    }
    this.slowWindows = 0;
    this.applyQuality(mode === 'auto' ? 'high' : mode);
  }

  // high: bloom + colour grade + shadows; medium: no post-processing;
  // low: no shadows, lower resolution, thinner crowd.
  applyQuality(level) {
    this.gfxLevel = level;
    const dpr = window.devicePixelRatio || 1;
    const pr = level === 'high' ? Math.min(dpr, 1.5) : level === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 1) * 0.8;
    this.renderer.setPixelRatio(pr);

    const wantFx = level === 'high';
    if (wantFx && !this.postfx) {
      try {
        this.postfx = new PostFX(this.renderer, this.scene, this.camera);
        this.blackChecks = 3; // verify the post-processed image isn't black
        this.blackStrikes = 0;
        this.blackCheckFrame = 0;
      } catch (err) {
        console.warn('Post-processing unavailable', err);
        this.postfx = null;
      }
    } else if (!wantFx && this.postfx) {
      this.postfx.dispose();
      this.postfx = null;
    }
    if (!this.postfx) {
      this.blackChecks = 3;
      this.blackStrikes = 0;
      this.blackCheckFrame = 0;
    }

    const sun = this.stadium.sun;
    const shadows = level !== 'low';
    if (sun.castShadow !== shadows) sun.castShadow = shadows;
    const size = level === 'high' ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    this.stadium.crowd.setDensity(level === 'low' ? 0.45 : 1);
    this.stadium.setBeams?.(level !== 'low');
    this.resize();
    this.store.set({ graphics: { mode: this.gfxMode, level } });
  }

  _monitorPerformance(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 2) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.store.set({ fps: Math.round(fps) });
    if (this.gfxMode !== 'auto' || this.mode === 'paused' || document.hidden) return;
    if (fps < 34) this.slowWindows++;
    else this.slowWindows = 0;
    if (this.slowWindows >= 2 && this.gfxLevel !== 'low') {
      const next = this.gfxLevel === 'high' ? 'medium' : 'low';
      this.slowWindows = 0;
      this.applyQuality(next);
      this.store.toast(`Graphics lowered to ${next.toUpperCase()} for smoother play`);
    }
  }

  // Reads a few pixels straight after rendering. If the image is completely
  // black, post-processing is switched off; if it is still black, we show help.
  _checkBlackFrame() {
    if (this.blackChecks <= 0) return;
    this.blackCheckFrame++;
    if (this.blackCheckFrame % 20 !== 0) return;
    this.blackChecks--;
    let sum = 0;
    try {
      const gl = this.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (!(typeof w === 'number' && w > 0)) {
        this.blackChecks = 0;
        return;
      }
      const px = new Uint8Array(4);
      const pts = [[0.5, 0.5], [0.5, 0.85], [0.25, 0.3], [0.75, 0.3], [0.5, 0.15], [0.15, 0.7], [0.85, 0.7]];
      for (const [x, y] of pts) {
        gl.readPixels(Math.floor(w * x), Math.floor(h * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sum += px[0] + px[1] + px[2];
      }
    } catch {
      this.blackChecks = 0;
      return;
    }
    if (sum < 12) this.blackStrikes++;
    if (this.blackStrikes >= 2) {
      this.blackChecks = 0;
      if (this.postfx) {
        console.warn('Black frame detected with post-processing — falling back to standard rendering');
        this.gfxMode = this.gfxMode === 'high' ? 'medium' : this.gfxMode;
        this.applyQuality('medium');
        this.store.toast('Switched to standard rendering for compatibility');
      } else {
        this.store.set({ renderWarning: this.gpu });
      }
    }
  }

  // ---------------- Input mode (desktop mouse vs touch) ----------------
  setTouchMode(on, force = false) {
    if (this.touchMode === on && !force) return;
    this.touchMode = on;
    this.input.reset();
    this.input.setTouchMove(0, 0);
    this.player.resetLook();
    this.football.restAhead = on ? 2.15 : 1.75; // keeps the ball in view with a centred crosshair
    if (on) this._setAimCss('50%', '50%', true);
    else this._setAimCss(this.input.aimPx.x || this.viewSize.w / 2, this.input.aimPx.y || this.viewSize.h * 0.47);
    this.store.set({ inputMode: on ? 'touch' : 'desktop' });
  }

  setAimSensitivity(v) {
    this.aimSensitivity = v;
    try {
      localStorage.setItem('sffc-aim-sens', String(v));
    } catch {
      /* ignore */
    }
    this.store.set({ aimSensitivity: v });
  }

  // Where shots go: the mouse cursor on desktop, the screen centre on touch.
  _aimNdc() {
    return this.touchMode ? CENTER_NDC : this.input.aim;
  }

  // Turn finger drags into camera look (PUBG-style); scaled by zoom so aiming stays precise.
  _applyTouchLook(dt) {
    const d = this.input.consumeAimDelta();
    const P = this.player;
    const canLook = this.phase === 'combat' || this.phase === 'running' || this.phase === 'final' || this.phase === 'resuming';
    if (!canLook) {
      P.resetLook();
      return;
    }
    if (d.x || d.y) {
      const k = 0.0042 * this.aimSensitivity * (this.camera.fov / 72);
      P.addLook(d.x * k, -d.y * k);
      this.lastLookAt = this.time;
    } else if (this.phase !== 'combat' && this.time - (this.lastLookAt || 0) > 0.6) {
      P.relaxLook(dt);
    }
  }

  // Joystick / WASD: steer your lane while running, step around during fights.
  _applyMovement(dt) {
    const m = this.input.move;
    const P = this.player;
    if (this.phase === 'running' || this.phase === 'final') {
      if (m.x) P.lane = THREE.MathUtils.clamp(P.lane - m.x * 4.5 * dt, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
      return;
    }
    if (this.phase !== 'combat' || (!m.x && !m.y)) return;
    // Move relative to where you're looking: towards the opponent, plus any drag-look turn.
    const spot = this.fightSpot;
    const opp = this.active;
    const yaw = (opp ? Math.atan2(opp.x - P.x, opp.z - P.z) : 0) + P.lookYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = (-fz * m.x + fx * m.y) * 3.2; // right = (-fz, fx)
    const dz = (fx * m.x + fz * m.y) * 3.2;
    P.step(dx, dz, dt, {
      minX: spot.x - 3.5,
      maxX: spot.x + 3.5,
      minZ: spot.z - 2,
      maxZ: Math.min(spot.z + 1.5, (opp?.anchor.z ?? spot.z + 8) - 5),
    });
  }

  toggleFps() {
    this.store.set({ showFps: !this.store.get().showFps });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  resetWorld() {
    this.player.reset();
    this.football.reset(this.player.x, this.player.z);
    this.opponents.forEach((o) => o.reset());
    this.weapons.reset();
    this.effects.clear();
    this.combat.reset();
    this.input?.reset();
    this.commentary?.reset();
    this.replay?.reset();
    this.celebration?.close();
    this.player.body.root.visible = true;
    this.missStreak = 0;
    this.hpCalled = {};
    this.lastOppState = '';
    this.killedOpp = null;
    this.replayAt = null;
    this.wildUntil = 0;
    this.saidFinal = false;
    this.activeIndex = 0;
    this.possession = PLAYER.maxPossession;
    this.stats = { shots: 0, hits: 0, headshots: 0, damage: 0, time: 0, tacklesTaken: 0, ballsBlocked: 0 };
    this.phaseT = 0;
    this.kickDone = false;
    this.kickZ = undefined;
    this.stadium.setScore(0, 0, '89:12');
    this.stadium.crowd.setExcitement(0.2);
    this.player.targetFov = PLAYER.baseFov;
    this.weapons.zoomed = false;
  }

  start() {
    this.audio.init();
    this.audio.setMuted(this.store.get().muted);
    this.resetWorld();
    this.mode = 'play';
    this.setPhase('running');
    this.audio.whistle(true);
    this.store.set({
      screen: 'playing',
      defeated: 0,
      possession: this.possession,
      combat: null,
      zoom: false,
      opponents: this.opponents.map((o) => ({ id: o.def.id, name: o.def.name, number: o.def.number, isKeeper: o.isKeeper, defeated: false })),
    });
    this.store.toast('Kick-off! Dribble towards the goal');
    this.commentary.say('kickoff', {}, { force: true });
    this.clock.getDelta();
  }

  togglePause(force) {
    if (this.mode === 'play' || force === true) {
      if (this.mode !== 'play') return;
      this.mode = 'paused';
      this.input.reset();
      this.store.set({ screen: 'paused' });
    } else if (this.mode === 'paused') {
      this.mode = 'play';
      this.clock.getDelta();
      this.store.set({ screen: 'playing' });
    }
  }

  toggleMute() {
    const muted = !this.store.get().muted;
    this.audio.setMuted(muted);
    this.commentary.setVoice(!muted && this.store.get().commentaryVoice !== false);
    this.store.set({ muted });
  }

  toggleCommentary() {
    const on = this.store.get().commentaryVoice === false;
    this.commentary.setVoice(on && !this.store.get().muted);
    this.store.set({ commentaryVoice: on });
  }

  setCommentatorVoice(who, name) {
    this.commentary.setVoiceFor(who, name);
  }

  testCommentary() {
    this.audio.init();
    this.commentary.setVoice(true);
    this.commentary.testVoices();
  }

  _weaponComment() {
    const id = this.weapons.pendingSwitch || this.weapons.current;
    this.commentary.say(`weapon_${id}`, {}, { chance: 0.55, cooldown: 5 });
    return true;
  }

  selectWeapon(i) {
    if (this.mode !== 'play') return;
    if (this.weapons.selectIndex(i)) {
      this.setZoom(false);
      this._weaponComment();
    }
  }

  selectWeaponById(id) {
    if (this.mode !== 'play') return;
    if (this.weapons.select(id)) {
      this.setZoom(false);
      this._weaponComment();
    }
  }

  setZoom(z) {
    const can = this.mode === 'play' && this.phase === 'combat';
    const on = z && can;
    const sniper = (this.weapons.pendingSwitch || this.weapons.current) === 'sniper';
    this.weapons.zoomed = on && sniper;
    this.player.targetFov = on ? (sniper ? PLAYER.zoomFov : 58) : PLAYER.baseFov;
    this.store.set({ zoom: on && sniper });
  }

  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
    this.store.set({ phase: p });
  }

  get active() {
    return this.opponents[this.activeIndex];
  }

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === 'menu') this._attract(dt);
    else if (this.mode === 'play' || this.mode === 'over') this.update(dt);
    this.stadium.update(this.mode === 'paused' ? 0 : dt);
    this.audio.update(dt);
    if (this.postfx) {
      const sprint = this.mode === 'play' ? this.player.speed01 : 0;
      this.postfx.render(this.mode === 'paused' ? 0 : dt, sprint);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this._checkBlackFrame();
    this._monitorPerformance(dt);
    if (this.replay.active && this.mode !== 'menu') {
      this.replay.render(this.renderer, this._replayRect(), [this.weapons.holder, this.player.body.root]);
    }
  }

  _attract(dt) {
    this.attractT = (this.attractT || 0) + dt;
    const a = this.attractT * 0.05 - 0.6;
    this.camera.position.set(Math.sin(a) * 48, 18 + Math.sin(this.attractT * 0.2) * 3, Math.cos(a) * 48 - 10);
    this.camera.lookAt(0, 0, 8);
    const ctx = this._oppCtx(false);
    this.opponents.forEach((o) => o.update(dt, ctx));
    this.football.updateDribble(dt, this.player.x, this.player.z, 0);
    this.weapons.holder.visible = false;
  }

  _oppCtx(activeAllowed) {
    return {
      playerX: this.player.x,
      playerZ: this.player.z,
      active: false,
      onTackle: (dmg) => this._onTackle(dmg),
      onThrow: (from) => this._onThrow(from),
      activeAllowed,
    };
  }

  update(dt) {
    const s = this.stats;
    this.time += dt;
    if (this.mode === 'play') s.time += dt;
    this.phaseT += dt;
    const P = this.player;
    const opp = this.active;

    switch (this.phase) {
      case 'running': {
        P.targetSpeed = PLAYER.runSpeed;
        P.lookAhead();
        P.targetX = this._steer();
        this.weapons.ready = false;
        if (this.phaseT > 1.2) this.commentary.say('running', {}, { chance: dt * 0.35, cooldown: 9 });
        if (opp && opp.alive) {
          const dist = Math.hypot(opp.x - P.x, opp.z - P.z);
          const trigger = opp.isKeeper ? 13.5 : COMBAT.triggerRange;
          if (dist < trigger) this._startEncounter(opp);
        }
        break;
      }
      case 'combat': {
        P.targetSpeed = 0;
        this.weapons.ready = true;
        const dist = Math.max(4, Math.hypot(opp.x - P.x, opp.z - P.z));
        const lx = THREE.MathUtils.lerp(opp.anchor.x, opp.x, 0.55);
        // Touch aims through the screen centre, so look a little higher at the opponent.
        const ly = PLAYER.eyeHeight - Math.tan(THREE.MathUtils.degToRad(this.touchMode ? 6 : 10)) * dist;
        P.lookAt(new THREE.Vector3(lx, ly, opp.z));
        this._handleFiring(opp);
        if (opp.enragedNow) {
          opp.enragedNow = false;
          this.store.toast('The Wall is ENRAGED — faster throws & dives!');
          this.audio.crowdReact(0.8);
          this.commentary.say('enraged', {}, { force: true });
        }
        if (opp.staggeredNow) {
          opp.staggeredNow = false;
          this.store.toast('STAGGERED! Tackle interrupted');
          this.commentary.say('stagger', this._names(opp), { chance: 0.85 });
        }
        if (opp.dodgedNow) {
          opp.dodgedNow = false;
          this.commentary.say('dodge', this._names(opp), { chance: 0.5, cooldown: 6 });
        }
        if (opp.state !== this.lastOppState) {
          if (opp.state === 'windup') this.commentary.say('windup', this._names(opp), { chance: 0.6, cooldown: 5 });
          this.lastOppState = opp.state;
        }
        if (opp.alive) this.replay.record(opp, this.time);
        this.commentary.setIntensity(
          (opp.isKeeper ? 0.5 : this.activeIndex * 0.1) + (this.possession < 35 ? 0.3 : 0) + (opp.hp / opp.maxHp < 0.3 ? 0.2 : 0)
        );
        this.stadium.crowd.setExcitement(opp.state === 'windup' || opp.state === 'charge' ? 0.75 : 0.45);
        this.audio.setCrowdIntensity(opp.state === 'windup' ? 0.8 : 0.55);
        break;
      }
      case 'resuming': {
        P.targetSpeed = 0;
        this.weapons.ready = this.phaseT < 0.6;
        if (this.phaseT > COMBAT.resumeDelay) {
          this.player.lane = this.player.x;
          if (this.activeIndex < this.opponents.length - 1) {
            this.activeIndex++;
            this.setPhase('running');
            this.store.toast('Back on the ball!');
          } else {
            this.setPhase('final');
            this.store.toast('Open goal… finish it!');
            this.audio.setCrowdIntensity(0.9);
            this.stadium.crowd.setExcitement(0.7);
          }
        }
        break;
      }
      case 'final': {
        P.targetSpeed = PLAYER.runSpeed * 0.8;
        P.targetX = this._steer();
        this.weapons.ready = false;
        if (!this.saidFinal) {
          this.saidFinal = true;
          this.commentary.say('finalRun', {}, { force: true });
        }
        const g = this.stadium.targetGoal.group.position;
        P.lookAt(new THREE.Vector3(0, PLAYER.eyeHeight - Math.tan(THREE.MathUtils.degToRad(12)) * Math.max(6, g.z - P.z), g.z));
        if (this.kickZ === undefined) {
          // Take the shot before the fallen keeper, or run past him if he went down close to us.
          const gkZ = this.opponents[this.opponents.length - 1].z;
          this.kickZ = gkZ - P.z < 6 ? Math.min(PLAYER.kickZ + 3, gkZ + 3.5) : Math.min(PLAYER.kickZ, gkZ - 2.2);
        }
        if (P.z >= this.kickZ) {
          this.setPhase('kicking');
          P.body.kick = 0.001;
        }
        break;
      }
      case 'kicking': {
        P.targetSpeed = 0;
        this.weapons.ready = false;
        this.weapons.hidden = true;
        P.body.kick = Math.min(1, this.phaseT / 0.75);
        if (!this.kickDone && this.phaseT >= 0.5) {
          this.kickDone = true;
          this.audio.kick();
          const gk = this.opponents[this.opponents.length - 1];
          const tx = gk.x > 0 ? -2.7 : 2.7;
          const target = new THREE.Vector3(tx, 0.9, PITCH.halfLength + 1.75);
          this.goalX = tx;
          P.addShake(0.15);
          this.football.shoot(target, 0.85, () => this._goal());
        }
        if (this.kickDone) {
          P.lookAt(this.football.mesh.position.clone().setY(Math.max(0.9, this.football.mesh.position.y)));
        }
        break;
      }
      case 'goal': {
        P.targetSpeed = 0;
        P.body.kick = 0;
        P.lookAt(new THREE.Vector3(this.goalX * 0.5, 2.5, PITCH.halfLength + 4));
        if (this.phaseT > 4.2) this._enterCelebration();
        break;
      }
      case 'celebration': {
        this.celebration.update(dt);
        break;
      }
      case 'lost': {
        P.targetSpeed = 0;
        this.weapons.ready = false;
        if (opp) P.lookAt(new THREE.Vector3(opp.x, 0.8, opp.z));
        break;
      }
      default:
    }

    this._applyMovement(dt);
    this._applyTouchLook(dt);
    if (this.phase !== 'celebration') P.update(dt);
    this.stadium.followShadow(P.x, P.z);

    // Keep recording the knocked-down opponent through his fall, then roll the replay.
    if (this.killedOpp && this.replay.recFor === this.killedOpp) this.replay.record(this.killedOpp, this.time);
    if (this.replayAt !== null && this.time >= this.replayAt) {
      this.replayAt = null;
      if (this.phase !== 'combat' && this.phase !== 'lost') {
        this.replay.start(this.killedOpp, { x: P.x, z: P.z });
        this.commentary.say('replay', {}, { chance: 0.9 });
      }
    }
    this.replay.update(dt);

    // Opponents
    const ctx = this._oppCtx(true);
    this.opponents.forEach((o, i) => {
      ctx.active = i === this.activeIndex && this.phase !== 'lost';
      o.update(dt, ctx);
    });

    // Ball
    if (this.phase === 'kicking' && this.kickDone) this.football.updateFlight(dt);
    else if (this.phase === 'goal' || this.phase === 'lost') this.football.updateFlight(dt);
    else this.football.updateDribble(dt, P.x, P.z, P.speed, (side) => P.body.startTouch(side));

    // Weapons & projectiles
    this.weapons.update(dt, { speed01: P.speed01, aimNdc: this._aimNdc() });
    this.combat.updateProjectiles(dt, () => this._onProjectileArrive());
    this.effects.update(dt);

    // Progress-driven audio
    if (this.phase === 'running' || this.phase === 'final') {
      const prog = this._progress();
      this.audio.setCrowdIntensity(0.25 + prog * 0.4);
      this.stadium.crowd.setExcitement(0.2 + prog * 0.3);
    }
    // The crowd stays wild for a few seconds after every knockdown.
    if (this.time < this.wildUntil && this.phase !== 'celebration') {
      this.stadium.crowd.setExcitement(1);
      this.audio.setCrowdIntensity(1);
    }

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 30;
      this._syncHud();
    }
  }

  _progress() {
    return THREE.MathUtils.clamp((this.player.z - PLAYER.startZ) / (PITCH.halfLength - PLAYER.startZ), 0, 1);
  }

  // Run around any defeated opponents lying in our path.
  _steer() {
    const P = this.player;
    let target = P.lane;
    for (const o of this.opponents) {
      if (o.alive) continue;
      const ahead = o.z - P.z;
      if (ahead > -1.5 && ahead < 10 && Math.abs(o.x - target) < 2.4) {
        target = o.x + (P.x >= o.x ? 2.6 : -2.6);
      }
    }
    return THREE.MathUtils.clamp(target, -PITCH.halfWidth + 3, PITCH.halfWidth - 3);
  }

  _names(opp) {
    const parts = opp.def.name.replace(/"[^"]*"\s*/g, '').split(' ');
    return { name: parts[parts.length - 1], full: opp.def.name };
  }

  _startEncounter(opp) {
    this.missStreak = 0;
    this.lastOppState = '';
    this.commentary.say(opp.isKeeper ? 'encounterKeeper' : 'encounter', this._names(opp), { force: true });
    this.setPhase('combat');
    opp.engage(this.player.x, this.player.z);
    this.player.targetSpeed = 0;
    this.fightSpot = { x: this.player.x, z: this.player.z };
    this.audio.whistle(false);
    this.audio.crowdReact(0.5);
    this.store.toast(opp.isKeeper ? `FINAL BOSS: ${opp.def.name}!` : `${opp.def.name} closes in — choose your weapon!`);
  }

  _handleFiring(opp) {
    const pressed = this.input.consumeFirePressed();
    const held = this.input.firing;
    this.weapons.tryFire(held, pressed, (def, spread) => {
      this.stats.shots++;
      const r = this.combat.fire(def, spread, this._aimNdc(), opp);
      this.player.addRecoil(def.recoil * 0.12);
      this.player.addShake(def.shake);
      this._commentShot(opp, r);
      if (r.hit) {
        this.stats.hits++;
        if (r.head) this.stats.headshots++;
        if (r.projectileHit) this.stats.ballsBlocked++;
        this.stats.damage += r.damage;
        const hm = this.store.get().hitMarker;
        this.store.set({ hitMarker: { id: hm.id + 1, head: r.head, kill: r.kill } });
      }
      if (r.kill) this._onKill(opp);
    });
    // Sniper zoom ends if we switch away
    if (this.weapons.zoomed && this.weapons.current !== 'sniper') this.setZoom(false);
  }

  _commentShot(opp, r) {
    const n = this._names(opp);
    if (r.kill) return;
    if (!r.hit) {
      this.missStreak++;
      if (this.missStreak >= 5) {
        if (this.commentary.say('missStreak', n, { cooldown: 8 })) this.missStreak = 0;
      }
      return;
    }
    this.missStreak = 0;
    if (r.projectileHit) {
      this.commentary.say('ballBlocked', n, { chance: 0.8, cooldown: 4 });
      return;
    }
    const frac = opp.hp / opp.maxHp;
    if (frac < 0.25 && !this.hpCalled[opp.def.id + 'low']) {
      this.hpCalled[opp.def.id + 'low'] = true;
      if (this.commentary.say('hpLow', n)) return;
    }
    if (frac < 0.5 && !this.hpCalled[opp.def.id + 'half']) {
      this.hpCalled[opp.def.id + 'half'] = true;
      if (this.commentary.say('hpHalf', n)) return;
    }
    if (r.head) this.commentary.say('headshot', n, { chance: 0.6, cooldown: 3 });
    else if (r.damage >= 55) this.commentary.say('hitBig', { ...n, dmg: Math.round(r.damage) }, { chance: 0.75, cooldown: 3 });
  }

  // The crowd goes wild: roar, Mexican wave, flame jets and (for the keeper) fireworks.
  _crowdGoesWild(big) {
    this.wildUntil = this.time + (big ? 6 : 4.5);
    this.audio.bigCheer(big ? 1.2 : 1);
    this.stadium.crowd.startWave();
    const hx = PITCH.halfWidth + 2;
    const hz = PITCH.halfLength + 2;
    this.effects.pyro([
      new THREE.Vector3(-hx, 0.3, -hz),
      new THREE.Vector3(hx, 0.3, -hz),
      new THREE.Vector3(-hx, 0.3, hz),
      new THREE.Vector3(hx, 0.3, hz),
    ]);
    this.audio.pyro();
    if (big) this.effects.fireworks(8, this.audio);
  }

  _onKill(opp) {
    this.replay.markDeath(opp, this.time);
    this.killedOpp = opp;
    this.replayAt = this.time + 1.45;
    this._crowdGoesWild(opp.isKeeper);
    this.commentary.say(opp.isKeeper ? 'killKeeper' : 'kill', this._names(opp), { force: true });
    this.setPhase('resuming');
    this.setZoom(false);
    this.input.reset();
    this.combat.reset();
    this.possession = Math.min(PLAYER.maxPossession, this.possession + PLAYER.possessionRegainOnKill);
    this.weapons.refill(1);
    this.stadium.crowd.setExcitement(0.9);
    this.audio.setCrowdIntensity(0.9);
    const st = this.store.get();
    const opps = st.opponents.map((o) => (o.id === opp.def.id ? { ...o, defeated: true } : o));
    this.store.set({ opponents: opps, defeated: st.defeated + 1, possession: this.possession });
    this.store.toast(opp.isKeeper ? 'THE WALL HAS FALLEN!' : `${opp.def.name} is DOWN! Ammo restocked`);
  }

  _onTackle(dmg) {
    if (this.phase !== 'combat') return;
    this._damagePlayer(dmg, 'Tackled!');
    this.stats.tacklesTaken++;
    if (this.possession > 0) {
      if (this.possession < 30) this.commentary.say('lowPossession', {}, { cooldown: 12 });
      else this.commentary.say('tackleTaken', this._names(this.active), { chance: 0.75, cooldown: 4 });
    }
    this.football.lateralVel += (Math.random() < 0.5 ? -1 : 1) * 2.5;
  }

  _onThrow(from) {
    if (this.phase !== 'combat') return;
    const P = this.player;
    const opp = this.active;
    const target = new THREE.Vector3(P.x, 1.25, P.z + 0.3);
    this.combat.spawnThrow(from, target, opp.phase2 ? 1.05 : 1.35);
  }

  _onProjectileArrive() {
    if (this.phase !== 'combat') return;
    this._damagePlayer(this.active.def.throwDamage || 10, 'Hit by the ball!');
    if (this.possession > 0) this.commentary.say('throwHit', {}, { chance: 0.6, cooldown: 6 });
  }

  _damagePlayer(dmg, msg) {
    this.possession = Math.max(0, this.possession - dmg);
    this.player.addShake(0.35);
    this.postfx?.flashHit(1);
    this.audio.tackleHit();
    this.store.set({ damageFlash: this.store.get().damageFlash + 1, possession: this.possession });
    if (this.possession <= 0) this._lose();
    else if (msg) this.store.toast(`${msg} −${Math.round(dmg)} ball control`);
  }

  _lose() {
    this.setPhase('lost');
    this.mode = 'over';
    this.setZoom(false);
    this.input.reset();
    this.combat.reset();
    const opp = this.active;
    this.football.shoot(new THREE.Vector3(opp.x + 1.5, 0.11, opp.z + 4), 0.9, null);
    this.audio.defeat();
    this.replay.stop();
    this.commentary.say('defeat', {}, { force: true });
    this.store.set({ screen: 'defeat', combat: null, stats: { ...this.stats } });
    this.mode = 'over';
  }

  // ---------------- Celebration ----------------
  _enterCelebration() {
    this.setPhase('celebration');
    this.mode = 'over';
    this.weapons.hidden = true;
    this.player.body.root.visible = false;
    this.store.set({ screen: 'celebration', stats: { ...this.stats } });
    this.celebration.open({ x: this.player.x, z: this.player.z });
  }

  celebrationPlay(id) {
    this.celebration.play(id);
  }

  celebrationStop() {
    this.celebration.stop(false);
  }

  celebrationAddFiles(files) {
    const n = this.celebration.addFiles(files);
    this.store.toast(n ? `Added ${n} clip${n > 1 ? 's' : ''}` : 'No new audio files found');
  }

  celebrationRefresh() {
    this.celebration.refresh();
  }

  finishCelebration() {
    this.celebration.stop(false);
    this.store.set({ screen: 'victory', stats: { ...this.stats } });
    this.audio.victory();
  }

  backToCelebration() {
    if (this.phase === 'celebration') this.store.set({ screen: 'celebration' });
  }

  _goal() {
    this.setPhase('goal');
    this.stadium.targetGoal.ripple(this.goalX, 0.9, 1.2);
    this.audio.goal();
    this.audio.setCrowdIntensity(1);
    this.stadium.crowd.setExcitement(1);
    this.stadium.setScore(1, 0, '90:00', true);
    this.effects.confetti(new THREE.Vector3(0, 0, PITCH.halfLength - 6));
    this.replay.stop();
    this._crowdGoesWild(true);
    this.wildUntil = this.time + 30;
    this.commentary.setIntensity(1);
    this.commentary.say('goal', {}, { force: true });
    this.player.addShake(0.25);
    this.store.set({ screen: 'goal' });
  }

  // ------------------------------------------------------------------
  // HUD sync (30 Hz, only when something changed)
  // ------------------------------------------------------------------
  _syncHud() {
    const opp = this.active;
    const inCombat = this.phase === 'combat' && opp;
    const combat = inCombat
      ? {
          name: opp.def.name,
          number: opp.def.number,
          role: opp.def.role,
          hp: Math.ceil(opp.hp),
          maxHp: opp.maxHp,
          status: opp.statusText,
          isKeeper: opp.isKeeper,
          danger: opp.state === 'windup' || opp.state === 'charge',
          enraged: opp.phase2,
        }
      : null;
    const weapon = this.weapons.snapshot();
    weapon.reloadProgress = Math.round(weapon.reloadProgress * 50) / 50;
    const next = {
      progress: Math.round(this._progress() * 200) / 200,
      combat,
      weapon,
      possession: Math.round(this.possession),
      statsTime: Math.floor(this.stats.time),
    };
    const key = JSON.stringify(next);
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.store.set(next);
  }

  // Debug helper: instantly defeat the current opponent.
  debugKillActive() {
    const o = this.active;
    if (o && o.alive && this.phase === 'combat') {
      o.takeDamage(99999, 'body', 0);
      this._onKill(o);
    }
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('pointerdown', this._onAnyPointer, true);
    window.removeEventListener('pointermove', this._onAnyPointer, true);
    this.celebration?.close();
    this.postfx?.dispose();
    this.commentary?.stop();
    this.input.dispose();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
