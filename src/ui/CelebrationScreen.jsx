import { useEffect, useRef, useState } from 'react';
import { useGame, useGameStore } from './useGameStore.js';
import { Toast } from './HUD.jsx';

const stop = (e) => e.stopPropagation();

function fmt(sec) {
  if (sec == null || sec < 0 || !isFinite(sec)) return '–:––';
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function hue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

const SOURCE_LABEL = { folder: 'Folder', local: 'Added', builtin: 'Built-in' };

function Visualizer({ active }) {
  const { engine } = useGame();
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv.getContext('2d');
    const bars = new Float32Array(32);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = (cv.width = cv.clientWidth * 2);
      const h = (cv.height = cv.clientHeight * 2);
      engine.current?.celebration?.spectrum(bars);
      g.clearRect(0, 0, w, h);
      const bw = w / bars.length;
      for (let i = 0; i < bars.length; i++) {
        const v = active ? bars[i] : 0.05 + 0.03 * Math.sin(performance.now() / 300 + i);
        const bh = Math.max(4, v * h);
        const grd = g.createLinearGradient(0, h, 0, h - bh);
        grd.addColorStop(0, '#ffd400');
        grd.addColorStop(1, `hsl(${(i / bars.length) * 300 + 20}, 95%, 60%)`);
        g.fillStyle = grd;
        g.fillRect(i * bw + 2, h - bh, bw - 4, bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, engine]);
  return <canvas ref={ref} className="cel-viz" />;
}

function NowPlaying() {
  const { engine } = useGame();
  const c = useGameStore((s) => s.celebration);
  if (!c) return null;
  const playing = !!c.playingId;
  return (
    <div className={`cel-now ${playing ? 'on' : ''}`}>
      <div className="cel-move" key={c.move}>
        <span className="cel-move-emoji">{playing ? c.emoji : '🎵'}</span>
        <span className="cel-move-name">{playing ? c.move : 'Pick a track to start dancing'}</span>
      </div>
      <Visualizer active={playing} />
      {playing && (
        <>
          <div className="cel-track">
            <b>{c.name}</b>
            <span>
              {c.bpm} BPM · {fmt(c.t)} / {fmt(c.dur)}
            </span>
          </div>
          <div className="cel-progress">
            <div style={{ width: `${c.dur ? (c.t / c.dur) * 100 : 0}%` }} />
          </div>
          <button className="btn cel-stop" onClick={() => engine.current?.celebrationStop()}>
            ■ Stop
          </button>
        </>
      )}
    </div>
  );
}

export function CelebrationScreen() {
  const { engine } = useGame();
  const clips = useGameStore((s) => s.celebrationClips);
  const folder = useGameStore((s) => s.celebrationFolder);
  const cel = useGameStore((s) => s.celebration);
  const error = useGameStore((s) => s.celebrationError);
  const loading = useGameStore((s) => s.celebrationLoading);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const dirRef = useRef(null);

  useEffect(() => {
    // allow picking a whole folder
    if (dirRef.current) {
      dirRef.current.setAttribute('webkitdirectory', '');
      dirRef.current.setAttribute('directory', '');
    }
  }, []);

  const add = (files) => files && files.length && engine.current?.celebrationAddFiles(files);
  const folderClips = clips.filter((c) => c.source === 'folder');

  return (
    <div
      className={`overlay celebration ${drag ? 'dragging' : ''}`}
      onPointerDown={stop}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
    >
      <div className="cel-banner">
        <span>⚽ GOAL!</span> CELEBRATION TIME
      </div>

      <NowPlaying />

      <aside className="cel-panel">
        <header>
          <h2>🎉 Pick your anthem</h2>
          <p>Your player dances to the beat of whatever you play.</p>
        </header>

        <div className={`cel-source ${folder === 'ok' ? 'ok' : 'off'}`}>
          {folder === 'ok' ? (
            <>
              <span className="live-dot" /> <b>celebration-audio/</b>
              <span className="cel-src-meta">
                {folderClips.length} clip{folderClips.length === 1 ? '' : 's'} · updates live
              </span>
            </>
          ) : (
            <span>
              📁 This page can't read the <b>celebration-audio</b> folder by itself (start the game with <code>npm run play</code> or{' '}
              <code>npm run dev</code>). You can still load the folder by hand:
            </span>
          )}
        </div>

        <div className="cel-actions">
          <button className="btn small" onClick={() => dirRef.current?.click()}>
            📂 Load folder
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            ＋ Add files
          </button>
          <button className="btn small" title="Refresh list" onClick={() => engine.current?.celebrationRefresh()}>
            ↻
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus" multiple hidden onChange={(e) => add(e.target.files)} />
          <input ref={dirRef} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
        </div>

        {error && (
          <div className="cel-error" role="alert">
            <b>⚠️ {error.title}</b>
            <p>{error.detail}</p>
            {error.tech && <small>Browser said: {error.tech}</small>}
            <div>
              <button className="btn small" onClick={() => engine.current?.celebrationPlay(error.clipId)}>
                Try again
              </button>
              <button className="btn small" onClick={() => engine.current?.store.set({ celebrationError: null })}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <ul className="cel-list">
          {folder === 'ok' && folderClips.length === 0 && (
            <li className="cel-empty">
              The folder is empty. Drop MP3, WAV, OGG or M4A files into <b>celebration-audio/</b> and they'll pop up here within a
              few seconds.
            </li>
          )}
          {clips.map((c) => {
            const playing = cel?.playingId === c.id;
            const failed = error?.clipId === c.id;
            const isLoading = loading === c.id;
            const h = hue(c.name);
            return (
              <li key={c.id} className={`cel-clip ${playing ? 'playing' : ''} ${failed ? 'failed' : ''} ${isLoading ? 'loading' : ''}`}>
                <button
                  className="cel-clip-btn"
                  onClick={() => (playing ? engine.current?.celebrationStop() : engine.current?.celebrationPlay(c.id))}
                >
                  <span className="cel-disc" style={{ background: `conic-gradient(from 0deg, hsl(${h},90%,55%), hsl(${(h + 80) % 360},90%,50%), hsl(${h},90%,55%))` }}>
                    {isLoading ? (
                      <span className="cel-spinner" />
                    ) : playing ? (
                      <span className="eq">
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      '▶'
                    )}
                  </span>
                  <span className="cel-clip-text">
                    <b>{c.name}</b>
                    <small>
                      <em className={`src-${c.source}`}>{SOURCE_LABEL[c.source]}</em> {c.ext} · {failed ? "can't play" : isLoading ? 'loading…' : fmt(c.duration)}
                    </small>
                  </span>
                  <span className="cel-clip-action">{playing ? '■' : '▶'}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer>
          <button className="btn primary" onClick={() => engine.current?.finishCelebration()}>
            Full-time stats →
          </button>
          <button className="btn small" onClick={() => engine.current?.start()}>
            ↻ Play again
          </button>
        </footer>
      </aside>

      <Toast />
      {drag && <div className="cel-drop">Drop audio files to add them 🎶</div>}
    </div>
  );
}
