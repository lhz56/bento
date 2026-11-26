import { useEffect, useRef, useState } from 'react';

// ⌘F: find words on the page. Every match is marked (the CSS highlight API: no change to the page itself), the current
// one in orange and scrolled into view; Enter for the next, ⇧Enter for the one before, Esc to close.
function findRanges(q) {
  const out = [];
  const needle = q.toLowerCase();
  const root = document.querySelector('.app') || document.body;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('.findbar, script, style, [aria-hidden="true"]') ||
      !n.parentElement?.getClientRects().length
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = w.nextNode(); n && out.length < 2000; n = w.nextNode()) {
    const t = n.nodeValue.toLowerCase();
    let i = t.indexOf(needle);
    while (i >= 0 && out.length < 2000) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + needle.length);
      out.push(r);
      i = t.indexOf(needle, i + needle.length);
    }
  }
  return out;
}
export default function FindBar({ onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [hits, setHits] = useState([]);
  const box = useRef(null);
  const HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  useEffect(() => {
    box.current?.focus();
    return () => {
      if (HL) {
        CSS.highlights.delete('bento-find');
        CSS.highlights.delete('bento-find-now');
      }
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const r = q.trim().length >= 2 || (q.trim() && /\S/.test(q)) ? findRanges(q.trim()) : [];
      setHits(r);
      setAt(0);
    }, 120);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!HL) return;
    CSS.highlights.set('bento-find', new Highlight(...hits));
    const cur = hits[at];
    if (cur) {
      CSS.highlights.set('bento-find-now', new Highlight(cur));
      cur.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else CSS.highlights.delete('bento-find-now');
  }, [hits, at]);
  const step = (d) => {
    if (hits.length) setAt((x) => (x + d + hits.length) % hits.length);
  };
  return (
    <div className="findbar" role="search">
      <input
        ref={box}
        value={q}
        placeholder="Find on this page"
        aria-label="Find on this page"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span className="findbar-n" aria-live="polite">
        {q.trim() ? (hits.length ? `${at + 1} of ${hits.length}` : 'No matches') : ''}
      </span>
      <button className="btn tiny ghost" aria-label="Previous match" onClick={() => step(-1)}>
        ↑
      </button>
      <button className="btn tiny ghost" aria-label="Next match" onClick={() => step(1)}>
        ↓
      </button>
      <button className="btn tiny ghost" aria-label="Close find" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
