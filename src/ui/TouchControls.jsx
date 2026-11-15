import { useEffect, useRef } from 'react';
import { useGame, useGameStore } from './useGameStore.js';

// On-screen controls for phones (shown only in touch mode during play).
//  • Left thumb: FIRE (hold to shoot) plus reload, scope and weapon-swap buttons
//  • Right thumb: drag anywhere outside the buttons to aim (PUBG-style camera look)
// Every finger is tracked by its pointerId, so aiming and firing work at the same time.
// Buttons sit above the aim layer, so tapping them never moves the aim.

export function TouchControls() {
  const { engine } = useGame();
  const phase = useGameStore((s) => s.phase);
  const zoom = useGameStore((s) => s.zoom);
  const weapon = useGameStore((s) => s.weapon);
  const layerRef = useRef(null);
  const fireRef = useRef(null);
  const st = useRef({ aim: null, fire: null });

  const input = () => engine.current?.input;

  // ---- aim pad: drag anywhere outside the buttons
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
      if (s.aim) return;
      s.aim = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        layer.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const move = (e) => {
      if (!s.aim || e.pointerId !== s.aim.id) return;
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
    };
    const up = (e) => {
      if (s.aim && e.pointerId === s.aim.id) s.aim = null;
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
      input()?.setTouchFiring(false);
    };
  }, [engine]);

  // ---- fire button (hold to shoot)
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
      if (s.fire && e.pointerId === s.fire.id) e.preventDefault();
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
      <div className="aim-hint">Drag here to aim</div>
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
