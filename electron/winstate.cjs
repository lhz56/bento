// Bento opens where you left it: same size, same place, same screen (if that screen is still connected).
const fs = require('node:fs');

// where the window goes, from what was saved last time (already read: the disk isn't touched here)
function place(saved, displays, fallback) {
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite))
    return { ...fallback };
  const width = Math.max(fallback.minWidth || 0, Math.round(saved.width)),
    height = Math.max(fallback.minHeight || 0, Math.round(saved.height));
  // at least a good corner of the title bar must be on a screen you still have, or it could open somewhere unreachable
  const visible = displays.some(
    ({ workArea: a }) =>
      saved.x + 120 > a.x &&
      saved.x < a.x + a.width - 120 &&
      saved.y >= a.y - 10 &&
      saved.y < a.y + a.height - 60,
  );
  return visible
    ? {
        ...fallback,
        x: Math.round(saved.x),
        y: Math.round(saved.y),
        width,
        height,
        maximized: !!saved.maximized,
      }
    : { ...fallback, width, height, maximized: !!saved.maximized };
}
function load(file, displays, fallback) {
  let s = null;
  try {
    s = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return place(s, displays, fallback);
}

// saved in the background while you move or resize it; the last save, as the window closes, is written straight away
function track(win, file, writeSoon, writeNow = writeSoon) {
  let timer = null;
  const bounds = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return null;
    return JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() });
  };
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b = bounds();
      if (b) writeSoon(file, b);
    }, 600);
  };
  win.on('resize', soon);
  win.on('move', soon);
  win.on('close', () => {
    clearTimeout(timer);
    const b = bounds();
    if (b) writeNow(file, b);
  });
}
module.exports = { place, load, track };
