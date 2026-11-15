import { useGame, useGameStore } from './useGameStore.js';
import { WeaponIcon } from './WeaponIcons.jsx';
import { ROSTER } from '../game/core/config.js';
import { WEAPONS, WEAPON_ORDER } from '../game/weapons/weaponDefs.js';

const stop = (e) => e.stopPropagation();

export function GraphicsPicker() {
  const { engine } = useGame();
  const g = useGameStore((s) => s.graphics);
  const fps = useGameStore((s) => s.fps);
  return (
    <div className="gfx-picker">
      <span className="gfx-label">Graphics</span>
      {['auto', 'high', 'medium', 'low'].map((m) => (
        <button key={m} className={g.mode === m ? 'on' : ''} onClick={() => engine.current?.setGraphicsMode(m)}>
          {m}
        </button>
      ))}
      <span className="gfx-now">
        {g.mode === 'auto' ? `using ${g.level}` : ''} {fps ? `· ${fps} fps` : ''}
      </span>
    </div>
  );
}

export function VoiceSettings() {
  const { engine } = useGame();
  const list = useGameStore((s) => s.voiceList);
  const pick = useGameStore((s) => s.voicePick);
  const quality = useGameStore((s) => s.voiceQuality);
  return (
    <details className="voice-settings" onPointerDown={stop}>
      <summary>🎙 Commentator voices</summary>
      {!list.length ? (
        <p className="voice-tip">Your browser didn't offer any English voices. The commentary will still show as text.</p>
      ) : (
        <>
          {['dev', 'zoe'].map((who) => (
            <label key={who}>
              <span>{who === 'dev' ? 'Dev (hype)' : 'Zoe (analyst)'}</span>
              <select value={pick[who]} onChange={(e) => engine.current?.setCommentatorVoice(who, e.target.value)}>
                {list.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="btn small" onClick={() => engine.current?.testCommentary()}>
            ▶ Test voices
          </button>
          {quality !== 'natural' && (
            <p className="voice-tip">
              Tip: for much more human, emotional voices, open the game in <b>Microsoft Edge</b>. It has free "Natural"
              voices, which are picked automatically.
            </p>
          )}
        </>
      )}
    </details>
  );
}

export function AimSensitivity() {
  const { engine } = useGame();
  const v = useGameStore((s) => s.aimSensitivity);
  return (
    <label className="aim-sens">
      <span>Aim sensitivity</span>
      <input type="range" min="0.3" max="2.5" step="0.1" value={v} onChange={(e) => engine.current?.setAimSensitivity(Number(e.target.value))} />
      <b>{v.toFixed(1)}×</b>
    </label>
  );
}

export function StartScreen() {
  const { engine } = useGame();
  const loading = useGameStore((s) => s.loading);
  const touch = useGameStore((s) => s.inputMode) === 'touch';
  return (
    <div className="overlay start" onPointerDown={stop}>
      <div className="start-card">
        <div className="eyebrow">First-person football combat</div>
        <h1 className="title">
          STRIKE<span>FORCE</span>FC
        </h1>
        <p className="tagline">Dribble the length of the pitch. Five defenders stand in your way. Take them down — then beat the keeper.</p>
        <button className="btn primary big" disabled={loading} onClick={() => engine.current?.start()}>
          {loading ? 'Building stadium…' : '▶  KICK OFF'}
        </button>

        <GraphicsPicker />
        <VoiceSettings />
        <div className="how">
          <div className="how-col">
            <h3>How to play</h3>
            <ol>
              <li>You run and dribble automatically. {touch ? 'The joystick' : 'WASD'} steers your lane and lets you step around in fights.</li>
              <li>When a defender closes in, you stop and the fight begins.</li>
              <li>{touch ? 'Drag the right side of the screen to aim, then hold FIRE.' : 'Aim with the mouse and fire.'} Headshots deal extra damage.</li>
              <li>
                A red <b>!</b> means a slide tackle is coming — deal enough damage to interrupt it, or lose ball control.
              </li>
              <li>The goalkeeper throws balls at you: shoot them out of the air.</li>
              <li>Lose all ball control and the move is over.</li>
            </ol>
          </div>
          <div className="how-col">
            <h3>Controls</h3>
            {touch ? (
              <ul className="keys">
                <li>🕹️ <b>Left thumb</b>: joystick to steer and step around</li>
                <li>👆 <b>Right side</b>: drag to aim (crosshair in the centre)</li>
                <li>🔴 <b>FIRE</b>: hold to shoot, and drag it to aim while firing</li>
                <li>⟳ reload · ◎ sniper scope · ⇄ or tap a weapon to switch</li>
              </ul>
            ) : (
            <ul className="keys">
              <li><kbd>Left click</kbd> / <kbd>Space</kbd> fire (hold for rifle)</li>
              <li><kbd>1</kbd>–<kbd>4</kbd>, <kbd>Wheel</kbd>, <kbd>Q</kbd> switch weapon</li>
              <li><kbd>R</kbd> reload · <kbd>Right click</kbd> zoom</li>
              <li><kbd>WASD</kbd>/<kbd>Arrows</kbd> steer and step around</li>
              <li><kbd>Esc</kbd>/<kbd>P</kbd> pause · <kbd>M</kbd> mute · <kbd>C</kbd> voice commentary · <kbd>F</kbd> FPS</li>
            </ul>
            )}
            <div className="arsenal">
              {WEAPON_ORDER.map((id) => (
                <div key={id} className="arsenal-item">
                  <WeaponIcon id={id} size={52} />
                  <div>
                    <b>
                      {WEAPONS[id].key}. {WEAPONS[id].name}
                    </b>
                    <small>{WEAPONS[id].description}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lineup">
          {ROSTER.map((r) => (
            <div key={r.id} className={`lineup-card ${r.isKeeper ? 'keeper' : ''}`}>
              <span className="num">{r.number}</span>
              <span className="nm">{r.name}</span>
              <span className="hp">{r.hp} HP</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PauseMenu() {
  const { engine } = useGame();
  const touch = useGameStore((s) => s.inputMode) === 'touch';
  const muted = useGameStore((s) => s.muted);
  const voice = useGameStore((s) => s.commentaryVoice);
  return (
    <div className="overlay dim" onPointerDown={stop}>
      <div className="panel">
        <h2>Paused</h2>
        <button className="btn primary" onClick={() => engine.current?.togglePause()}>
          Resume
        </button>
        <button className="btn" onClick={() => engine.current?.start()}>
          Restart match
        </button>
        <button className="btn" onClick={() => engine.current?.toggleMute()}>
          {muted ? 'Unmute sound' : 'Mute sound'}
        </button>
        <GraphicsPicker />
        {touch && <AimSensitivity />}
        <VoiceSettings />
        <button className="btn" onClick={() => engine.current?.toggleCommentary()}>
          {voice ? 'Voice commentary: ON' : 'Voice commentary: OFF'}
        </button>
      </div>
    </div>
  );
}

export function GoalOverlay() {
  return (
    <div className="overlay goal-overlay">
      <div className="goal-text">
        {'GOAL!'.split('').map((c, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.07}s` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="goal-sub">STRIKERS 1 – 0 REDS</div>
    </div>
  );
}

function rating(stats) {
  const acc = stats.shots ? stats.hits / stats.shots : 0;
  let stars = 1;
  if (acc > 0.45) stars++;
  if (stats.time < 150 && stats.tacklesTaken <= 3) stars++;
  return stars;
}

function StatGrid({ stats, possession }) {
  const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
  const m = Math.floor(stats.time / 60);
  const s = Math.floor(stats.time % 60);
  return (
    <div className="stat-grid">
      <div><b>{`${m}:${String(s).padStart(2, '0')}`}</b><span>Time</span></div>
      <div><b>{acc}%</b><span>Accuracy</span></div>
      <div><b>{stats.headshots}</b><span>Headshots</span></div>
      <div><b>{Math.round(stats.damage)}</b><span>Damage</span></div>
      <div><b>{stats.tacklesTaken}</b><span>Tackles taken</span></div>
      <div><b>{possession ?? '—'}</b><span>Ball control left</span></div>
    </div>
  );
}

export function VictoryScreen() {
  const { engine } = useGame();
  const stats = useGameStore((s) => s.stats);
  const possession = useGameStore((s) => s.possession);
  const stars = rating(stats);
  return (
    <div className="overlay dim victory" onPointerDown={stop}>
      <div className="panel wide">
        <div className="eyebrow">Full time</div>
        <h2 className="win-title">VICTORY!</h2>
        <div className="stars">
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= stars ? 'on' : ''} style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
              ★
            </span>
          ))}
        </div>
        <p>You beat all five defenders and scored. The crowd goes wild.</p>
        <StatGrid stats={stats} possession={possession} />
        <button className="btn primary big" onClick={() => engine.current?.start()}>
          ↻ Play again
        </button>
        <button className="btn" onClick={() => engine.current?.backToCelebration()}>
          🎉 Back to the celebration
        </button>
      </div>
    </div>
  );
}

export function DefeatScreen() {
  const { engine } = useGame();
  const stats = useGameStore((s) => s.stats);
  const defeated = useGameStore((s) => s.defeated);
  return (
    <div className="overlay dim defeat" onPointerDown={stop}>
      <div className="panel wide">
        <div className="eyebrow">Turnover</div>
        <h2 className="lose-title">POSSESSION LOST</h2>
        <p>
          You were dispossessed after beating {defeated} of {ROSTER.length} opponents. Tip: hit them hard during the wind-up (red <b>!</b>) to
          stagger them, and save the shotgun for close range.
        </p>
        <StatGrid stats={stats} possession={0} />
        <button className="btn primary big" onClick={() => engine.current?.start()}>
          ↻ Try again
        </button>
      </div>
    </div>
  );
}
