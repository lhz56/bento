import { useEffect, useMemo, useRef, useState } from 'react';
import { IDEAS } from '../ideas.js';
import { parseRepo, parseSite, parseBlob } from './Explore.jsx';
import Brand from './Brand.jsx';

// ⌘K: one box to reach anything. Type a question to ask it, paste a repo to take it apart.
export default function Palette({ onOpenAt, onOpenSite, onClose, lessons, projects, words, actions, onAsk, onOpenRepo, onLesson, onProject, onIdea, onWord }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inp = useRef(null);
  const list = useRef(null);
  useEffect(() => { inp.current?.focus(); }, []);
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
    IDEAS.filter((x) => m(`${x.title} ${x.company} ${x.concepts.join(' ')}`)).slice(0, t ? 5 : 3).forEach((x) => out.push({ g: 'Clever ideas', brand: x.slug, label: x.title, hint: x.company, run: () => onIdea(x) }));
    lessons.filter((l) => !l.builtin && m(`${l.title} ${l.q}`)).slice(0, t ? 6 : 4).forEach((l) => out.push({ g: 'Lessons', icon: '·', label: l.title || l.q, hint: l.lang, run: () => onLesson(l) }));
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
      <div className="pal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-in"><span className="pal-ic">⌘</span><input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Ask, search, or paste a GitHub link…" /><kbd>esc</kbd></div>
        <div className="pal-list" ref={list}>
          {items.length === 0 && <div className="muted pad">Nothing matches.</div>}
          {items.map((it, n) => {
            const head = it.g !== last ? <div key={`h${n}`} className="pal-g">{it.g}</div> : null; last = it.g;
            return [head, (
              <button key={n} className={`pl-i ${n === i ? 'on' : ''}`} onMouseEnter={() => setI(n)} onClick={() => { onClose(); it.run(); }}>
                <span className="pl-ic">{it.brand ? <Brand slug={it.brand} name={it.hint} size={16} plain /> : it.icon}</span>
                <span className="pl-l">{it.label}</span>
                {it.hint && <span className="pl-h">{it.hint}</span>}
                {n === i && <kbd>↵</kbd>}
              </button>
            )];
          })}
        </div>
      </div>
    </div>
  );
}
