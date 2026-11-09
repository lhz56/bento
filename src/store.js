// Small persistence helpers: localStorage for speed, mirrored to a JSON file on disk by the main process.
import { mockBridge } from './mock.js';

export const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
export const save = (k, v) => { const t = Date.now(); try { localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('bento.savedAt', String(t)); } catch {} try { const b = window.bento || mockBridge; b.storeSet?.(k, v); b.storeSet?.('bento.savedAt', t); } catch {} };
export const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// Lessons: the newest 60 in browser storage (fast start), every lesson on disk (nothing is ever dropped).
export const saveLessons = (list) => {
  const t = Date.now();
  try { localStorage.setItem('bento.lessons', JSON.stringify(list.slice(0, 60))); localStorage.setItem('bento.savedAt', String(t)); } catch {}
  try { const b = window.bento || mockBridge; b.storeSet?.('bento.lessons', list.slice(0, 2000)); b.storeSet?.('bento.savedAt', t); } catch {}
};

