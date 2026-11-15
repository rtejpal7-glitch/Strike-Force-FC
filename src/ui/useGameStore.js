import { createContext, useContext, useSyncExternalStore } from 'react';

export const GameContext = createContext(null);

export function useGame() {
  return useContext(GameContext);
}

// Subscribe to a slice of the engine store. Selectors must return values that
// are stable between updates (primitives or objects stored on the state).
export function useGameStore(selector) {
  const { store } = useGame();
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
