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

createRoot(document.getElementById('root')).render(<App />);

// Offline support when the game is hosted (production build over HTTPS only).
if (import.meta.env?.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
