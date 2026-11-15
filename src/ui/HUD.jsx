import { useEffect, useRef, useState } from 'react';
import { useGame, useGameStore } from './useGameStore.js';
import { WeaponIcon } from './WeaponIcons.jsx';
import { ROSTER, PLAYER, PITCH } from '../game/core/config.js';

const stop = (e) => e.stopPropagation();

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function TopBar() {
  const progress = useGameStore((s) => s.progress);
  const defeated = useGameStore((s) => s.defeated);
  const total = useGameStore((s) => s.total);
  const opponents = useGameStore((s) => s.opponents);
  const time = useGameStore((s) => s.statsTime || 0);
  const span = PITCH.halfLength - PLAYER.startZ;
  return (
    <div className="topbar">
      <div className="stat-block">
        <span className="label">Defeated</span>
        <span className="value">{defeated}</span>
      </div>
      <div className="progress-wrap">
        <div className="progress-head">
          <span>Own goal</span>
          <span className="clock">⏱ {fmtTime(time)}</span>
          <span>Opponent goal ⚽</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          {ROSTER.map((r, i) => {
            const pos = Math.min(0.97, (r.z - PLAYER.startZ - (r.isKeeper ? 8 : 6)) / span);
            const o = opponents[i];
            return (
              <div
                key={r.id}
                className={`opp-marker ${o?.defeated ? 'down' : ''} ${r.isKeeper ? 'keeper' : ''}`}
                style={{ left: `${pos * 100}%` }}
                title={r.name}
              >
                {o?.defeated ? '✕' : r.isKeeper ? 'GK' : r.number}
              </div>
            );
          })}
          <div className="player-marker" style={{ left: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="stat-block right">
        <span className="label">Remaining</span>
        <span className="value">{total - defeated}</span>
      </div>
    </div>
  );
}

function CombatPanel() {
  const combat = useGameStore((s) => s.combat);
  if (!combat) return null;
  const frac = combat.hp / combat.maxHp;
  return (
    <div className={`combat-panel ${combat.isKeeper ? 'boss' : ''}`}>
      <div className="combat-id">
        <span className="shirt-num">{combat.number}</span>
        <div>
          <div className="opp-name">{combat.name}</div>
          <div className="opp-role">{combat.role}</div>
        </div>
      </div>
      <div className="hp-bar">
        <div className="hp-ghost" style={{ width: `${frac * 100}%` }} />
        <div className={`hp-fill ${frac < 0.25 ? 'low' : frac < 0.5 ? 'mid' : ''}`} style={{ width: `${frac * 100}%` }} />
        <span className="hp-text">
          {combat.hp} / {combat.maxHp}
        </span>
      </div>
      <div className={`combat-status ${combat.danger ? 'danger' : ''} ${combat.enraged ? 'enraged' : ''}`}>{combat.status}</div>
      {combat.danger && <div className="danger-tip">Shoot to interrupt the tackle!</div>}
    </div>
  );
}

function Crosshair() {
  const weapon = useGameStore((s) => s.weapon);
  const phase = useGameStore((s) => s.phase);
  const hitMarker = useGameStore((s) => s.hitMarker);
  const zoom = useGameStore((s) => s.zoom);
  const [hm, setHm] = useState(null);
  useEffect(() => {
    if (!hitMarker.id) return;
    setHm(hitMarker);
    const t = setTimeout(() => setHm(null), 160);
    return () => clearTimeout(t);
  }, [hitMarker]);
  const active = phase === 'combat';
  const r = weapon.reloadProgress;
  return (
    <div className={`crosshair cw-${weapon.current} ${active ? 'active' : 'idle'} ${zoom ? 'zoomed' : ''}`}>
      <div className="ch-lines">
        <i className="t" />
        <i className="b" />
        <i className="l" />
        <i className="r" />
        <b className="dot" />
      </div>
      {weapon.reloading && (
        <svg className="reload-ring" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" className="bg" />
          <circle cx="20" cy="20" r="16" className="fg" strokeDasharray={`${r * 100.5} 100.5`} />
        </svg>
      )}
      {hm && <div key={hm.id} className={`hitmarker ${hm.head ? 'head' : ''} ${hm.kill ? 'kill' : ''}`} />}
    </div>
  );
}

function WeaponPanel() {
  const { engine } = useGame();
  const weapon = useGameStore((s) => s.weapon);
  const phase = useGameStore((s) => s.phase);
  const cur = weapon.slots.find((s) => s.id === weapon.current);
  return (
    <div className="bottom-row">
      <Possession />
      <div className="weapon-panel" onPointerDown={stop} onWheel={stop}>
        {weapon.slots.map((s) => (
          <button
            key={s.id}
            className={`weapon-slot ${s.id === weapon.current ? 'selected' : ''} ${s.mag === 0 && s.reserve === 0 ? 'empty' : ''}`}
            onClick={() => engine.current?.selectWeaponById(s.id)}
            title={`${s.name} [${s.key}]`}
          >
            <span className="slot-key">{s.key}</span>
            <WeaponIcon id={s.id} size={58} />
            <span className="slot-name">{s.name}</span>
            <span className="slot-ammo">
              {s.mag}/{s.reserve}
            </span>
          </button>
        ))}
      </div>
      <div className="ammo-panel">
        {cur && (
          <>
            <div className="ammo-name">{cur.name}</div>
            <div className={`ammo-count ${cur.mag === 0 ? 'out' : cur.mag <= cur.magSize * 0.25 ? 'low' : ''}`}>
              {cur.mag}
              <span className="ammo-reserve"> / {cur.reserve}</span>
            </div>
            {weapon.reloading ? (
              <div className="reload-bar">
                <div style={{ width: `${weapon.reloadProgress * 100}%` }} />
                <span>RELOADING</span>
              </div>
            ) : cur.mag === 0 ? (
              <div className="ammo-warn">Press R to reload</div>
            ) : null}
          </>
        )}
        <div className="controls-hint">
          {phase === 'combat' ? (
            <>
              <kbd>Click</kbd> fire · <kbd>R</kbd> reload · <kbd>1-4</kbd>/<kbd>Wheel</kbd> switch · <kbd>RMB</kbd> zoom
            </>
          ) : (
            <>Auto-dribbling… pick a weapon with <kbd>1-4</kbd></>
          )}
        </div>
      </div>
    </div>
  );
}

function Possession() {
  const p = useGameStore((s) => s.possession);
  return (
    <div className="possession">
      <div className="pos-label">
        <span className="ball-ico">⚽</span> Ball control <b>{p}</b>
      </div>
      <div className="pos-bar">
        <div className={p < 30 ? 'low' : p < 60 ? 'mid' : ''} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  const [show, setShow] = useState(null);
  useEffect(() => {
    if (!toast.id) return;
    setShow(toast);
    const t = setTimeout(() => setShow(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!show) return null;
  return (
    <div className="toast" key={show.id}>
      {show.text}
    </div>
  );
}

function DamageVignette() {
  const flash = useGameStore((s) => s.damageFlash);
  const ref = useRef(null);
  useEffect(() => {
    if (!flash || !ref.current) return;
    const el = ref.current;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }, [flash]);
  return <div ref={ref} className="damage-vignette" />;
}

function CommentaryFeed() {
  const feed = useGameStore((s) => s.commentary);
  if (!feed || !feed.length) return null;
  return (
    <div className="commentary">
      <div className="comm-head">
        <span className="live-dot" /> LIVE COMMENTARY
      </div>
      {feed.map((c, i) => (
        <div key={c.id} className={`comm-line who-${c.who} mood-${c.mood || 'chill'} ${i === feed.length - 1 ? 'latest' : 'old'} ${c.hype ? 'hype' : ''}`}>
          <span className="comm-speaker">{c.speaker}</span>
          {c.emoji && <span className="comm-emoji">{c.emoji}</span>}
          <span className="comm-text">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

function ReplayFrame() {
  const replay = useGameStore((s) => s.replay);
  if (!replay) return null;
  const crowd = replay.shot === 'crowd';
  return (
    <div className={`replay-frame ${crowd ? 'crowd' : ''}`} key={replay.id + replay.shot}>
      <div className="replay-scan" />
      <div className="replay-badge">
        <span className="rec" /> {crowd ? 'CROWD CAM' : 'REPLAY'}
      </div>
      {!crowd && <div className="replay-slowmo">SLOW-MO</div>}
      <div className="replay-lower">
        {crowd ? (
          <>
            <b>THE STADIUM IS GOING WILD</b>
            <span>Absolute scenes 🔥</span>
          </>
        ) : (
          <>
            <b>
              #{replay.number} {replay.name}
            </b>
            <span>{replay.keeper ? 'FINAL BOSS — DEFEATED' : 'ELIMINATED · −1000 AURA'}</span>
          </>
        )}
      </div>
    </div>
  );
}

function FpsMeter() {
  const show = useGameStore((s) => s.showFps);
  const fps = useGameStore((s) => s.fps);
  const g = useGameStore((s) => s.graphics);
  if (!show) return null;
  return (
    <div className="fps-meter">
      {fps} FPS · {g.level.toUpperCase()}
    </div>
  );
}

function TopRight() {
  const { engine } = useGame();
  const muted = useGameStore((s) => s.muted);
  const voice = useGameStore((s) => s.commentaryVoice);
  return (
    <div className="top-right" onPointerDown={stop}>
      <button onClick={() => engine.current?.toggleCommentary()} title="Voice commentary (C)" className={voice ? '' : 'off'}>
        🎙
      </button>
      <button onClick={() => engine.current?.toggleMute()} title="Mute (M)">
        {muted ? '🔇' : '🔊'}
      </button>
      <button onClick={() => engine.current?.togglePause()} title="Pause (Esc / P)">
        ❚❚
      </button>
    </div>
  );
}

export function HUD() {
  const zoom = useGameStore((s) => s.zoom);
  const phase = useGameStore((s) => s.phase);
  return (
    <div className={`hud phase-${phase}`}>
      {zoom && <div className="scope-overlay" />}
      <DamageVignette />
      <TopBar />
      <TopRight />
      <FpsMeter />
      <ReplayFrame />
      <CombatPanel />
      <CommentaryFeed />
      <Toast />
      <Crosshair />
      <WeaponPanel />
    </div>
  );
}
