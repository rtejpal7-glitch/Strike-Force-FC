import { useEffect, useRef } from 'react';
import { useGame, useGameStore } from './useGameStore.js';

// On-screen controls for phones (shown only in touch mode during play).
//  • Left side: floating virtual joystick (move / steer)
//  • Right side: drag anywhere to aim (PUBG-style camera look)
//  • FIRE button: hold to shoot; you can also drag your thumb on it to aim
//  • Reload, scope and weapon-cycle buttons
// Every finger is tracked by its pointerId, so both thumbs work at the same time.
// HUD buttons sit above this layer, so tapping them never moves or aims.

const JOY_RADIUS = 52;
const DEADZONE = 0.12;

export function TouchControls() {
  const { engine } = useGame();
  const phase = useGameStore((s) => s.phase);
  const zoom = useGameStore((s) => s.zoom);
  const weapon = useGameStore((s) => s.weapon);
  const layerRef = useRef(null);
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const fireRef = useRef(null);
  const st = useRef({ joy: null, aim: null, fire: null });

  const input = () => engine.current?.input;

  // ---- joystick + aim pad (one layer, split by screen half)
  useEffect(() => {
    const layer = layerRef.current;
    const s = st.current;
    const setKnob = (dx, dy) => {
      if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const placeBase = (x, y) => {
      const b = baseRef.current;
      if (!b) return;
      if (x == null) {
        b.style.left = '';
        b.style.top = '';
        b.classList.remove('active');
      } else {
        b.style.left = `${x}px`;
        b.style.top = `${y}px`;
        b.classList.add('active');
      }
    };
    const down = (e) => {
      e.preventDefault();
      const r = layer.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < r.width * 0.42 && !s.joy) {
        // joystick appears under the thumb (kept away from the screen edges)
        const cx = Math.max(JOY_RADIUS + 16, Math.min(x, r.width * 0.42 - JOY_RADIUS));
        const cy = Math.max(JOY_RADIUS + 16, Math.min(y, r.height - JOY_RADIUS - 10));
        s.joy = { id: e.pointerId, cx, cy, ox: r.left, oy: r.top };
        placeBase(cx, cy);
        move(e);
      } else if (!s.aim) {
        s.aim = { id: e.pointerId, x: e.clientX, y: e.clientY };
      } else return;
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const move = (e) => {
      if (s.joy && e.pointerId === s.joy.id) {
        e.preventDefault();
        let dx = e.clientX - s.joy.ox - s.joy.cx;
        let dy = e.clientY - s.joy.oy - s.joy.cy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) {
          dx = (dx / len) * JOY_RADIUS;
          dy = (dy / len) * JOY_RADIUS;
        }
        setKnob(dx, dy);
        let nx = dx / JOY_RADIUS;
        let ny = -dy / JOY_RADIUS;
        const m = Math.hypot(nx, ny);
        if (m < DEADZONE) nx = ny = 0;
        else {
          const k = (m - DEADZONE) / (1 - DEADZONE) / m;
          nx *= k;
          ny *= k;
        }
        input()?.setTouchMove(nx, ny);
      } else if (s.aim && e.pointerId === s.aim.id) {
        e.preventDefault();
        // use coalesced events for smoother high-rate touch input where available
        const evs = e.getCoalescedEvents?.() || [];
        let lx = s.aim.x;
        let ly = s.aim.y;
        let tx = 0;
        let ty = 0;
        for (const ce of evs.length ? evs : [e]) {
          tx += ce.clientX - lx;
          ty += ce.clientY - ly;
          lx = ce.clientX;
          ly = ce.clientY;
        }
        s.aim.x = lx;
        s.aim.y = ly;
        input()?.addAimDelta(tx, ty);
      }
    };
    const up = (e) => {
      if (s.joy && e.pointerId === s.joy.id) {
        s.joy = null;
        setKnob(0, 0);
        placeBase(null);
        input()?.setTouchMove(0, 0);
      } else if (s.aim && e.pointerId === s.aim.id) {
        s.aim = null;
      }
    };
    layer.addEventListener('pointerdown', down);
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
    layer.addEventListener('lostpointercapture', up);
    return () => {
      layer.removeEventListener('pointerdown', down);
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', up);
      layer.removeEventListener('pointercancel', up);
      layer.removeEventListener('lostpointercapture', up);
      input()?.setTouchMove(0, 0);
      input()?.setTouchFiring(false);
    };
  }, [engine]);

  // ---- fire button (hold to shoot, drag to aim at the same time)
  useEffect(() => {
    const btn = fireRef.current;
    const s = st.current;
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (s.fire) return;
      s.fire = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      btn.classList.add('pressed');
      input()?.setTouchFiring(true);
    };
    const move = (e) => {
      if (!s.fire || e.pointerId !== s.fire.id) return;
      e.preventDefault();
      input()?.addAimDelta(e.clientX - s.fire.x, e.clientY - s.fire.y);
      s.fire.x = e.clientX;
      s.fire.y = e.clientY;
    };
    const up = (e) => {
      if (!s.fire || e.pointerId !== s.fire.id) return;
      s.fire = null;
      btn.classList.remove('pressed');
      input()?.setTouchFiring(false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    return () => {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      btn.removeEventListener('lostpointercapture', up);
    };
  }, [engine]);

  const tapBtn = (fn) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
  });

  const combat = phase === 'combat';
  const isSniper = weapon.current === 'sniper';
  return (
    <div className={`touch-controls ${combat ? 'combat' : ''}`}>
      <div ref={layerRef} className="touch-layer" />
      <div ref={baseRef} className="joy-base">
        <div ref={knobRef} className="joy-knob" />
      </div>
      <div className="touch-buttons">
        <button ref={fireRef} className="t-btn t-fire" aria-label="Fire">
          <span>FIRE</span>
        </button>
        <button className="t-btn t-reload" aria-label="Reload" {...tapBtn(() => engine.current?.weapons.reload())}>
          ⟳
        </button>
        <button className={`t-btn t-scope ${zoom ? 'on' : ''} ${isSniper ? '' : 'dim'}`} aria-label="Scope" {...tapBtn(() => engine.current?.setZoom(!zoom))}>
          ◎
        </button>
        <button className="t-btn t-swap" aria-label="Next weapon" {...tapBtn(() => engine.current?.weapons.cycle(1) && engine.current?._weaponComment())}>
          ⇄
        </button>
      </div>
    </div>
  );
}
