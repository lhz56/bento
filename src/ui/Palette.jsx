import { useEffect, useMemo, useRef, useState } from 'react';
import { IDEAS } from '../ideas.js';
import { parseRepo, parseSite, parseBlob } from './Explore.jsx';
import Brand from './Brand.jsx';
import { useDialog } from './a11y.js';
import { IS_MAC, TOUCH } from '../platform.js';
import Icon from './Icons.jsx';
import { coverScore, projectNames, namesALesson } from '../findProject.js';

// A lesson's own words, plain and lowercased once (searching them on every keystroke stays fast)
const textCache = new WeakMap();
const plainText = (l) => {
  let x = textCache.get(l);
  if (x == null) {
    x = (l.story || []).map((b) => [b.md, b.text, b.term, b.plain, b.q, b.why].filter(Boolean).join(' ')).join(' ')
      .replace(/\[\[[^|\]]*\|([^\]]+)\]\]/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[`*_#>]/g, '').replace(/\s+/g, ' ');
    textCache.set(l, x);
  }
  return x;
};
// the words around a match, for the hint: "…the cache keeps the last 100 results…"
const around = (text, at, n) => `${at > 16 ? '…' : ''}${text.slice(Math.max(0, at - 16), at + n + 40).trim()}…`;

// ⌘K: one box to reach anything. Type a question to ask it, paste a repo to take it apart.
export default function Palette({ onOpenAt, onOpenSite, onClose, lessons, projects, words, actions, onAsk, onOpenRepo, onLesson, onProject, onIdea, onWord, builtins = [] }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inp = useRef(null);
  const box = useDialog(onClose);
  const list = useRef(null);
  useEffect(() => { inp.current?.focus({ preventScroll: true }); }, []);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const m = (s) => !t || String(s).toLowerCase().includes(t);
    const out = [];
    const repo = parseRepo(q);
    const blob = parseBlob(q); if (blob && onOpenAt) out.push({ g: 'Take apart', icon: '⌥', label: `${blob.full} · ${blob.path.split('/').pop()}`, hint: 'open this file', run: () => onOpenAt(blob.full, blob.path) });
    if (repo) out.push({ g: 'Take apart', icon: '⌥', label: repo, hint: 'open in Atlas', run: () => onOpenRepo(repo) });
    const site = !repo && parseSite(q); if (site && onOpenSite) out.push({ g: 'Take apart', icon: '◎', label: new URL(site).hostname, hint: 'how this website is built', run: () => onOpenSite(site) });
    actions.filter((a) => m(a.label)).forEach((a) => out.push({ g: 'Go to', ...a }));
    projects.filter((p) => m(p.name)).slice(0, 5).forEach((p) => out.push({ g: 'Projects', icon: '◈', label: p.name, hint: p.kind === 'github' ? 'GitHub' : 'folder', run: () => onProject(p) }));
    // lessons that come with Bento open instantly, without asking your AI to write them again
    if (t.length > 2) { const mine = new Set(lessons.filter((l) => !l.builtin).map((l) => String(l.title || '').toLowerCase())); builtins.map((b) => ({ b, sc: m(b.find) ? 9 : projectNames(q).some((n) => !namesALesson(n, builtins)) ? 0 : coverScore(t, b.find, `${b.label} ${b.alt || ''}`) })).filter((x) => x.sc > 0 && !mine.has(x.b.label.toLowerCase())).sort((x, y) => y.sc - x.sc).map((x) => x.b).slice(0, 4).forEach((b) => out.push({ g: 'Ready now', icon: '▶', label: b.label, hint: b.hint ? `${b.hint} · instant` : 'instant', run: b.run })); }
    IDEAS.filter((x) => m(`${x.title} ${x.company} ${x.concepts.join(' ')}`)).slice(0, t ? 5 : 3).forEach((x) => out.push({ g: 'Clever ideas', brand: x.slug, label: x.title, hint: x.company, run: () => onIdea(x) }));
    // the lesson called exactly what you typed comes first, then ones that start with it
    const closeness = (l) => { const x = String(l.title || l.q || '').toLowerCase(); return x === t ? 2 : x.startsWith(t) ? 1 : 0; };
    lessons.filter((l) => !l.builtin && m(`${l.title} ${l.q}`)).sort((a, b) => closeness(b) - closeness(a)).slice(0, t ? 6 : 4).forEach((l) => out.push({ g: 'Lessons', icon: '·', label: l.title || l.q, hint: l.lang, run: () => onLesson(l) }));
    // "where did I read about memoization?": inside your lessons, not just their titles
    if (t.length >= 4) {
      const shown = new Set(out.map((o) => o.label));
      lessons.filter((l) => (!l.builtin || l.touched) && l.status === 'done' && !shown.has(l.title || l.q) && !m(`${l.title} ${l.q}`)).map((l) => { const x = plainText(l); const at = x.toLowerCase().indexOf(t); return at < 0 ? null : { l, hint: around(x, at, t.length) }; })
        .filter(Boolean).slice(0, 4).forEach(({ l, hint }) => out.push({ g: 'Inside your lessons', icon: '¶', label: l.title || l.q, hint, find: t, run: () => onLesson(l) }));
    }
    if (t) Object.values(words).filter((w) => m(w.term)).slice(0, 4).forEach((w) => out.push({ g: 'Your words', icon: 'Aa', label: w.term, hint: w.plain.slice(0, 50), run: () => onWord(w) }));
    if (t && !repo && !(parseSite(q))) { const ask = { g: 'Ask', icon: '✦', label: q.trim(), hint: 'new lesson', run: () => onAsk(q.trim()) }; if (out.length) out.push(ask); else out.unshift(ask); }
    return out;
  }, [q, lessons, projects, words]);
  useEffect(() => setI(0), [q]);
  useEffect(() => { list.current?.querySelector('.pl-i.on')?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); const it = items[i]; if (it) { onClose(); it.run(); } }
    if (e.key === 'Escape') onClose();
  };
  let last = null;
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div className="pal" ref={box} role="dialog" aria-modal="true" aria-label="Search everything" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-in"><span className="pal-ic" aria-hidden="true">{TOUCH ? <Icon name="search" size={18} /> : IS_MAC ? '⌘' : '⌕'}</span><input ref={inp} data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder={TOUCH ? 'Ask, search, or paste a link' : 'Ask, search, or paste a GitHub link…'}
          role="combobox" aria-label="Ask, search, or paste a GitHub link" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" aria-activedescendant={items[i] ? `pal-o-${i}` : undefined} /><kbd aria-hidden="true">esc</kbd>
          <button type="button" className="pal-cancel" onClick={onClose}>Cancel</button></div>
        <div className="pal-list" ref={list} id="pal-list" role="listbox" aria-label="Results">
          {items.length === 0 && <div className="muted pad" role="status">Nothing matches.</div>}
          {items.map((it, n) => {
            const head = it.g !== last ? <div key={`h${n}`} className="pal-g" role="presentation">{it.g}</div> : null; last = it.g;
            return [head, (
              <button key={n} id={`pal-o-${n}`} role="option" aria-selected={n === i} tabIndex={-1} className={`pl-i ${n === i ? 'on' : ''}`} onMouseEnter={() => setI(n)} onClick={() => { onClose(); it.run(); }}>
                <span className="pl-ic" aria-hidden="true">{it.brand ? <Brand slug={it.brand} name={it.hint} size={16} plain /> : it.icon}</span>
                <span className="pl-l">{it.label}</span>
                {it.hint && <span className={`pl-h ${it.find ? 'snip' : ''}`}>{it.find ? (() => { const i = it.hint.toLowerCase().indexOf(it.find); return i < 0 ? it.hint : <>{it.hint.slice(0, i)}<b>{it.hint.slice(i, i + it.find.length)}</b>{it.hint.slice(i + it.find.length)}</>; })() : it.hint}</span>}
                {n === i && <kbd aria-hidden="true">↵</kbd>}
              </button>
            )];
          })}
        </div>
      </div>
    </div>
  );
}
