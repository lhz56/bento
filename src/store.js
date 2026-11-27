// Small persistence helpers: localStorage for speed, mirrored to a JSON file on disk by the main process.
import { mockBridge } from './mock.js';

// a stored value of the wrong shape (a damaged file) falls back to the default instead of crashing the app
export const load = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    if (parsed == null) return fallback;
    if (
      fallback != null &&
      (Array.isArray(fallback) !== Array.isArray(parsed) || typeof fallback !== typeof parsed)
    )
      return fallback;
    return parsed;
  } catch {
    return fallback;
  }
};
export const save = (key, value) => {
  const start = Date.now();
  try {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('bento.savedAt', String(start));
  } catch {}
  try {
    const b = /** @type {BentoBridge} */ (window.bento || mockBridge);
    b.storeSet?.(key, value);
    b.storeSet?.('bento.savedAt', start);
  } catch {}
};
export { cleanErr } from './bridgeError.js';
// Lessons: the newest 60 in browser storage (fast start), every lesson on disk (nothing is ever dropped).
export const saveLessons = (list) => {
  const start = Date.now();
  try {
    localStorage.setItem('bento.lessons', JSON.stringify(list.slice(0, 60)));
    localStorage.setItem('bento.savedAt', String(start));
  } catch {}
  try {
    const b = /** @type {BentoBridge} */ (window.bento || mockBridge);
    b.storeSet?.('bento.lessons', list);
    b.storeSet?.('bento.savedAt', start);
  } catch {}
};
