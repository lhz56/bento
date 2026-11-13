// Bento opens where you left it: same size, same place, same screen (if that screen is still connected).
const fs = require('node:fs');

// where the window goes, from what was saved last time (already read: the disk isn't touched here)
function place(s, displays, fallback) {
  if (!s || ![s.x, s.y, s.width, s.height].every(Number.isFinite)) return { ...fallback };
  const width = Math.max(fallback.minWidth || 0, Math.round(s.width)), height = Math.max(fallback.minHeight || 0, Math.round(s.height));
  // at least a good corner of the title bar must be on a screen you still have, or it could open somewhere unreachable
  const visible = displays.some(({ workArea: a }) => s.x + 120 > a.x && s.x < a.x + a.width - 120 && s.y >= a.y - 10 && s.y < a.y + a.height - 60);
  return visible ? { ...fallback, x: Math.round(s.x), y: Math.round(s.y), width, height, maximized: !!s.maximized } : { ...fallback, width, height, maximized: !!s.maximized };
}
function load(file, displays, fallback) {
  let s = null; try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return place(s, displays, fallback);
}

// saved in the background while you move or resize it; the last save, as the window closes, is written straight away
function track(win, file, writeSoon, writeNow = writeSoon) {
  let t = null;
  const bounds = () => { if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return null; return JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }); };
  const soon = () => { clearTimeout(t); t = setTimeout(() => { const b = bounds(); if (b) writeSoon(file, b); }, 600); };
  win.on('resize', soon); win.on('move', soon); win.on('close', () => { clearTimeout(t); const b = bounds(); if (b) writeNow(file, b); });
}
module.exports = { place, load, track };
