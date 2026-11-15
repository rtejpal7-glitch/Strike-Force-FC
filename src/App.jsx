import { useEffect, useMemo, useRef } from 'react';
import { GameEngine } from './game/GameEngine.js';
import { GameStore, createInitialState } from './game/core/GameStore.js';
import { ROSTER } from './game/core/config.js';
import { GameContext } from './ui/useGameStore.js';
import { HUD } from './ui/HUD.jsx';
import { CelebrationScreen } from './ui/CelebrationScreen.jsx';
import { TouchControls } from './ui/TouchControls.jsx';
import { StartScreen, PauseMenu, GoalOverlay, VictoryScreen, DefeatScreen } from './ui/Menus.jsx';
import { useSyncExternalStore } from 'react';

export default function App() {
  const store = useMemo(() => new GameStore(createInitialState(ROSTER)), []);
  const engine = useRef(null);
  const mountRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const e = new GameEngine(mountRef.current, store, () => rootRef.current);
    try {
      e.init();
    } catch (err) {
      console.error(err);
      store.set({ fatal: String(err && err.message ? err.message : err) });
      return undefined;
    }
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [store]);

  const screen = useSyncExternalStore(store.subscribe, () => store.get().screen);
  const fatal = useSyncExternalStore(store.subscribe, () => store.get().fatal);
  const warning = useSyncExternalStore(store.subscribe, () => store.get().renderWarning);
  const inputMode = useSyncExternalStore(store.subscribe, () => store.get().inputMode);
  const touch = inputMode === 'touch';
  const ctx = useMemo(() => ({ store, engine }), [store]);
  const showHud = screen === 'playing' || screen === 'paused' || screen === 'goal';

  return (
    <GameContext.Provider value={ctx}>
      <div ref={rootRef} className={`app screen-${screen} ${touch ? 'touch' : 'desktop'}`}>
        <div ref={mountRef} className="viewport" />
        {touch && screen === 'playing' && <TouchControls />}
        {showHud && <HUD />}
        {touch && (
          <div className="rotate-hint">
            <div>📱↻</div>
            <b>Turn your phone sideways</b>
            <span>Strike Force FC is played in landscape.</span>
          </div>
        )}
        {screen === 'menu' && <StartScreen />}
        {screen === 'paused' && <PauseMenu />}
        {screen === 'goal' && <GoalOverlay />}
        {screen === 'celebration' && <CelebrationScreen />}
        {screen === 'victory' && <VictoryScreen />}
        {screen === 'defeat' && <DefeatScreen />}
        {warning && !fatal && (
          <div className="render-warning" onPointerDown={(e) => e.stopPropagation()}>
            <b>The 3D view isn't drawing on this device.</b>
            <span>
              Try turning on hardware acceleration (Chrome: Settings → System → “Use graphics acceleration when available”), then reload.
              Graphics card reported: <code>{warning}</code>
            </span>
            <button className="btn" onClick={() => store.set({ renderWarning: null })}>
              Dismiss
            </button>
          </div>
        )}
        {fatal && (
          <div className="overlay dim">
            <div className="panel">
              <h2>Couldn't start the game</h2>
              <p>{fatal}</p>
              <p>This game needs a browser with WebGL enabled.</p>
            </div>
          </div>
        )}
      </div>
    </GameContext.Provider>
  );
}
