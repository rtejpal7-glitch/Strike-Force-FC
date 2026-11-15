import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Stop the browser from zooming or scrolling the page while playing on a phone
// (iOS Safari ignores user-scalable=no, so pinch and double-tap are blocked here).
const block = (e) => e.preventDefault();
document.addEventListener('gesturestart', block, { passive: false });
document.addEventListener('gesturechange', block, { passive: false });
document.addEventListener('dblclick', block, { passive: false });
document.addEventListener(
  'touchmove',
  (e) => {
    // allow scrolling only inside scrollable menus/lists
    if (e.touches.length > 1 || !e.target.closest?.('.scrollable, .overlay:not(.goal-overlay), .cel-list, select')) e.preventDefault();
  },
  { passive: false }
);
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 320 && !e.target.closest?.('button, input, select, summary, a')) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

// Fill the whole screen. iOS home-screen ("standalone") apps can report a viewport that is too
// short in landscape (or stale after rotating), so there we use the physical screen size.
function fitToScreen() {
  let w = window.innerWidth;
  let h = window.innerHeight;
  const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (standalone && window.screen?.width) {
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    const landscape = window.matchMedia?.('(orientation: landscape)').matches ?? w > h;
    w = Math.max(w, landscape ? long : short);
    h = Math.max(h, landscape ? short : long);
  }
  const root = document.documentElement.style;
  root.setProperty('--app-w', `${w}px`);
  root.setProperty('--app-h', `${h}px`);
}
fitToScreen();
const refit = () => {
  fitToScreen();
  // iOS settles the new size a moment after rotating
  setTimeout(fitToScreen, 250);
  setTimeout(fitToScreen, 700);
};
window.addEventListener('resize', refit);
window.addEventListener('orientationchange', refit);
window.addEventListener('pageshow', refit);
window.visualViewport?.addEventListener('resize', refit);

createRoot(document.getElementById('root')).render(<App />);

// Offline support when the game is hosted (production build over HTTPS only).
if (import.meta.env?.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
