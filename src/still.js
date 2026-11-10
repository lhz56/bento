// Decorative motion (ideas drifting on Home, glows, the "you are here" ring) is lovely while you're looking and wasted
// battery when you aren't. The page is "still" while Bento isn't the app you're using, or after 45 seconds without a
// touch of the mouse or keyboard; the first move brings everything back. Progress (dots, spinners) is never paused.
const IDLE_MS = 45_000;
const subs = new Set();
let still = false;
let lastInput = Date.now();

function set(next) {
  if (next === still) return;
  still = next;
  document.documentElement.classList.toggle('still', still);
  // SVG's own animations (packets along the big picture's arrows, the puzzle pictures, the cars on Home) don't listen to
  // CSS, so pause and resume them directly
  document.querySelectorAll('svg').forEach((svg) => { try { still ? svg.pauseAnimations() : svg.unpauseAnimations(); } catch {} });
  subs.forEach((fn) => fn(still));
}
const check = () => set(document.hidden || !document.hasFocus() || Date.now() - lastInput > IDLE_MS);
const woke = () => { lastInput = Date.now(); if (still) check(); };

export function startStill() {
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, woke, { passive: true, capture: true });
  addEventListener('focus', () => { lastInput = Date.now(); check(); });
  addEventListener('blur', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 5000);
  check();
}

// to react to the page resting or waking
export function onStill(fn) { subs.add(fn); fn(still); return () => subs.delete(fn); }
