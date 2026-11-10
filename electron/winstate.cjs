// Bento opens where you left it: same size, same place, same screen (if that screen is still connected).
const fs = require('node:fs');

function load(file, displays, fallback) {
  let s = null; try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!s || ![s.x, s.y, s.width, s.height].every(Number.isFinite)) return { ...fallback };
  const width = Math.max(fallback.minWidth || 0, Math.round(s.width)), height = Math.max(fallback.minHeight || 0, Math.round(s.height));
  // at least a good corner of the title bar must be on a screen you still have, or it could open somewhere unreachable
  const visible = displays.some(({ workArea: a }) => s.x + 120 > a.x && s.x < a.x + a.width - 120 && s.y >= a.y - 10 && s.y < a.y + a.height - 60);
  return visible ? { ...fallback, x: Math.round(s.x), y: Math.round(s.y), width, height, maximized: !!s.maximized } : { ...fallback, width, height, maximized: !!s.maximized };
}

function track(win, file, writeSafe) {
  let t = null;
  const save = () => { if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return; const b = win.getNormalBounds(); writeSafe(file, JSON.stringify({ ...b, maximized: win.isMaximized() })); };
  const soon = () => { clearTimeout(t); t = setTimeout(save, 600); };
  win.on('resize', soon); win.on('move', soon); win.on('close', () => { clearTimeout(t); save(); });
}
module.exports = { load, track };
