// On Windows, Bento's own screens say "PC" where the Mac app says "Mac" ("Open a folder on this PC"). Only Bento's own
// words change: lessons, code, projects and anything you or your AI wrote are left exactly as they are.
const KEEP = '.story, .stage, .cm-editor, .lesson, pre, code, textarea, input, [contenteditable], .atlas-doc, .msg, .answer, [data-keep-words]';
const swap = (s) => s.replace(/\b(this|your|the|a|on|to) Mac\b/g, '$1 PC').replace(/\bMac’s\b/g, 'PC’s').replace(/\bMac's\b/g, "PC's").replace(/\bon Mac\b/g, 'on PC');
export function winWords(root = document.body) {
  const fix = (n) => { const p = n.parentElement; if (!p || p.closest(KEEP)) return; const v = n.nodeValue; if (!v || !v.includes('Mac')) return; const w = swap(v); if (w !== v) n.nodeValue = w; };
  const walk = (el) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) fix(n); };
  const attrs = (el) => { for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute?.(a); if (v && v.includes('Mac') && !el.closest(KEEP)) { const w = swap(v); if (w !== v) el.setAttribute(a, w); } } };
  walk(root); root.querySelectorAll('[title], [aria-label], [placeholder]').forEach(attrs);
  new MutationObserver((ms) => { for (const m of ms) {
    if (m.type === 'characterData') fix(m.target);
    else if (m.type === 'attributes') attrs(m.target);
    else m.addedNodes.forEach((n) => { if (n.nodeType === 3) fix(n); else if (n.nodeType === 1) { walk(n); attrs(n); n.querySelectorAll?.('[title], [aria-label], [placeholder]').forEach(attrs); } });
  } }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
}
export const swapMacWords = swap;
