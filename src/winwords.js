// On Windows, Bento's own screens say "PC" where the Mac app says "Mac" ("Open a folder on this PC"). Only Bento's own
// words change: lessons, code, projects and anything you or your AI wrote are left exactly as they are.
const KEEP =
  '.story, .stage, .cm-editor, .lesson, pre, code, textarea, input, [contenteditable], .atlas-doc, .msg, .answer, [data-keep-words]';
const swap = (s) =>
  s
    .replace(/\b(this|your|the|a|on|to) Mac\b/g, '$1 PC')
    .replace(/\bMac’s\b/g, 'PC’s')
    .replace(/\bMac's\b/g, "PC's")
    .replace(/\bon Mac\b/g, 'on PC');
export function winWords(root = document.body) {
  const fix = (count) => {
    const parent = count.parentElement;
    if (!parent || parent.closest(KEEP)) return;
    const text = count.nodeValue;
    if (!text || !text.includes('Mac')) return;
    const w = swap(text);
    if (w !== text) count.nodeValue = w;
  };
  const walk = (el) => {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) fix(n);
  };
  const attrs = (el) => {
    for (const a of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute?.(a);
      if (v && v.includes('Mac') && !el.closest(KEEP)) {
        const w = swap(v);
        if (w !== v) el.setAttribute(a, w);
      }
    }
  };
  walk(root);
  root.querySelectorAll('[title], [aria-label], [placeholder]').forEach(attrs);
  new MutationObserver((ms) => {
    for (const match of ms) {
      if (match.type === 'characterData') fix(match.target);
      else if (match.type === 'attributes') attrs(match.target);
      else
        match.addedNodes.forEach((node) => {
          if (node.nodeType === 3) fix(node);
          else if (node.nodeType === 1) {
            walk(node);
            attrs(node);
            /** @type {Element} */ (node)
              .querySelectorAll?.('[title], [aria-label], [placeholder]')
              .forEach(attrs);
          }
        });
    }
  }).observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder'],
  });
}
export const swapMacWords = swap;
