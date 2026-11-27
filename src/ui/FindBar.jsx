// ⌘F: find words on the page. Every match is marked (the CSS highlight API: no change to the page itself), the current
// one in orange and scrolled into view; Enter for the next, ⇧Enter for the one before, Esc to close.
import { useEffect, useRef, useState } from 'react';

function findRanges(query) {
  const out = [];
  const needle = query.toLowerCase();
  const root = document.querySelector('.app') || document.body;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('.findbar, script, style, [aria-hidden="true"]') ||
      !n.parentElement?.getClientRects().length
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = w.nextNode(); node && out.length < 2000; node = w.nextNode()) {
    const text = node.nodeValue.toLowerCase();
    let i = text.indexOf(needle);
    while (i >= 0 && out.length < 2000) {
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + needle.length);
      out.push(r);
      i = text.indexOf(needle, i + needle.length);
    }
  }
  return out;
}
// the CSS highlight API (marks matches without changing the page); older browsers just scroll to them
const HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

export default function FindBar({ onClose }) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [hits, setHits] = useState([]);
  const box = useRef(null);
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
    const timer = setTimeout(() => {
      const range =
        query.trim().length >= 2 || (query.trim() && /\S/.test(query))
          ? findRanges(query.trim())
          : [];
      setHits(range);
      setAt(0);
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);
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
        value={query}
        placeholder="Find on this page"
        aria-label="Find on this page"
        onChange={(e) => setQuery(e.target.value)}
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
        {query.trim() ? (hits.length ? `${at + 1} of ${hits.length}` : 'No matches') : ''}
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
