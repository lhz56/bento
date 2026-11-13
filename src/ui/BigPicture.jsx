import { tap } from '../platform.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BY_ID } from '../atlas/catalog.js';
import { LAYER } from '../atlas/analyze.js';
import Brand from './Brand.jsx';
import { Md } from './Story.jsx';

// The first thing you see for any repo: the whole system as one living picture.
// Left to right: who starts things → the parts of this code → where things end up.
// Every station has a plain name, what it does, and the real technical word for it. Click to go deeper.

const KIND = {
  person: ['var(--accent)', <path key="p" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6" />],
  part: ['var(--violet)', <path key="c" d="M8 7 3 12l5 5M16 7l5 5-5 5" />],
  store: ['var(--mint)', <g key="s"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></g>],
  outside: ['var(--sky)', <g key="o"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></g>],
};

// A sensible picture before the model has spoken: you → the layers this repo has → its outside tools.
export function fallbackFlow(F, tools) {
  const has = (l) => F.files.some((f) => f.layer === l && f.lang);
  const nodes = [{ id: 'you', label: 'You', kind: 'person', does: 'Use the app', term: 'user' }];
  const L = [['ui', 'What you see', 'Shows screens and buttons', 'front end'], ['server', 'The front door', 'Takes requests in', 'server'], ['logic', 'The brains', 'Does the real work', 'business logic'], ['data', 'Memory', 'Remembers things', 'data layer']];
  for (const [id, label, does, term] of L) if (has(id)) nodes.push({ id, label, kind: id === 'data' ? 'store' : 'part', does, term, layer: id });
  const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  const last = nodes[nodes.length - 1].id;
  tools.filter((t) => ['db', 'auth', 'pay', 'ai', 'mail', 'bot', 'files', 'host', 'api'].includes(t.cat)).slice(0, 3).forEach((t) => { nodes.push({ id: `t-${t.id}`, label: t.name, kind: 'outside', stack: t.id, does: t.what.split(/[.,:]/)[0].slice(0, 44), term: t.cat }); edges.push({ from: nodes.find((n) => n.id === 'server') ? 'server' : last, to: `t-${t.id}` }); });
  return { nodes, edges, fallback: true };
}

function layout(flow, width) {
  const nodes = flow.nodes.slice(0, 10); const ids = new Set(nodes.map((n) => n.id));
  const edges = (flow.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const depth = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++) for (const e of edges) if (depth[e.to] < depth[e.from] + 1 && depth[e.from] + 1 < nodes.length) depth[e.to] = depth[e.from] + 1;
  const cols = []; nodes.forEach((n) => { (cols[depth[n.id]] ||= []).push(n); });
  const C = cols.filter(Boolean); const nc = C.length;
  const pad = 8, colW = (width - pad * 2) / Math.max(1, nc), nw = Math.min(196, colW - 34);
  const tall = 136, small = 64, gap = 14;
  const heights = C.map((col) => (col.length > 3 ? small : tall));
  const totals = C.map((col, i) => col.length * heights[i] + (col.length - 1) * gap);
  const H = Math.max(...totals, tall) + 24;
  const pos = {};
  C.forEach((col, ci) => { const h = heights[ci]; let y = (H - totals[ci]) / 2; col.forEach((n) => { pos[n.id] = { x: pad + ci * colW + (colW - nw) / 2, y, w: nw, h, compact: h === small }; y += h + gap; }); });
  return { nodes: C.flat(), edges, pos, H, roomy: colW - nw > 120 };
}

function MakePathBtn({ go }) {
  const [st, setSt] = useState(null);
  return <button className="tk-path" disabled={st === 'busy'} onClick={async () => { setSt('busy'); try { await go(); setSt(null); } catch (e) { setSt(String(e.message || e)); } }}>{st === 'busy' ? 'Designing your path…' : st ? st : '⤳ Turn these into my learning path'}</button>;
}

export default function BigPicture({ appName, onMakePath, build, onBuild, flow, terms = [], tools, pathIdx, onOpen, onAsk, narrating, role }) {
  const box = useRef(null);
  const [w, setW] = useState(900);
  const [sel, setSel] = useState(null);
  const [word, setWord] = useState(null);
  // guided walk: each part in order, opened and read aloud (Mac voice), advancing when the voice finishes
  const [walk, setWalk] = useState(null);
  const plain = (t) => String(t || '').replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1').replace(/\*\*|`/g, '');
  useEffect(() => {
    if (walk == null) return;
    const nodes = L.nodes; if (walk >= nodes.length) { setWalk(null); setSel(null); return; }
    const n = nodes[walk]; setSel(n.id);
    let done = false; const next = () => { if (!done) { done = true; setWalk((w) => (w == null ? null : w + 1)); } };
    const sy = window.speechSynthesis; let timer;
    if (sy) {
      sy.cancel();
      const text = `${n.label}. ${plain(n.more || n.does)}${n.term ? `. The technical word for this is ${n.term}.` : ''}`;
      const u = new SpeechSynthesisUtterance(text);
      const lg = document.documentElement.lang || 'en'; u.lang = lg; const vs = sy.getVoices().filter((x) => x.lang.toLowerCase().startsWith(lg)); const v = vs.find((x) => /Samantha|Daniel|Ava|Serena|Premium|Enhanced/i.test(x.name)) || vs[0]; if (v) u.voice = v;
      u.rate = 1.03; u.onend = () => (timer = setTimeout(next, 500)); sy.speak(u);
      timer = setTimeout(next, Math.max(4500, text.split(/\s+/).length * 400 + 1200)); // in case the voice never reports finishing
    } else timer = setTimeout(next, 4500);
    return () => { done = true; clearTimeout(timer); };
  }, [walk]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  const stopWalk = () => { setWalk(null); window.speechSynthesis?.cancel(); };
  useLayoutEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const L = useMemo(() => layout(flow, w), [flow, w]);
  const narrow = Math.min(999, ...Object.values(L.pos).map((q) => q.w)) < 120; // cards too thin to read → go vertical
  const node = L.nodes.find((n) => n.id === sel);
  const toolFor = (n) => (n.stack && (tools.find((t) => t.id === n.stack) || BY_ID[n.stack])) || null;
  const termDef = (t) => { const k = String(t || '').toLowerCase(); if (!k) return null; return terms.find((x) => String(x.term).toLowerCase() === k) || terms.find((x) => { const y = String(x.term).toLowerCase(); return y.length > 2 && (k.includes(y) || y.includes(k)); }); };

  const path = (e) => { const a = L.pos[e.from], b = L.pos[e.to]; const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const dx = Math.max(30, (x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; };

  return (
    <section className="bigpic">
      <div className="bp-head">
        <span className="mini-h">the big picture</span>
        <span className="bp-hint">{flow.fallback && narrating ? <><span className="lens-spin" />drawing the real picture…</> : <>{tap('click any part to go deeper')}{!flow.fallback && <button className={`walk-btn ${walk != null ? 'on' : ''}`} onClick={() => (walk != null ? stopWalk() : setWalk(0))}>{walk != null ? `■ Stop (${walk + 1}/${L.nodes.length})` : '▶ Walk me through it'}</button>}</>}</span>
      </div>
      {narrow ? (
        <div className={`vflow ${flow.fallback ? 'is-fallback' : ''}`} ref={box}>
          {L.nodes.map((n, i) => {
            const t = toolFor(n); const [c, glyph] = KIND[n.kind] || KIND.part; const into = L.edges.find((e) => e.to === n.id);
            return (
              <div key={n.id}>
                {i > 0 && <div className="vf-edge"><i />{into?.label && <span>{into.label}</span>}</div>}
                <button className={`vf-node ${sel === n.id ? 'on' : ''}`} style={{ '--c': n.layer ? LAYER[n.layer][3] : c }} onClick={() => setSel(sel === n.id ? null : n.id)}>
                  {t ? <Brand slug={t.slug} name={t.name} color={t.color} size={28} /> : <span className="fn-glyph" style={{ width: 28, height: 28 }}><svg viewBox="0 0 24 24" width={16} height={16}>{glyph}</svg></span>}
                  <b>{n.label}</b>{n.term && <span className="fn-term">{n.term}</span>}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
      <div className={`flow ${flow.fallback ? 'is-fallback' : ''}`} ref={box} style={{ height: L.H }}>
        <svg className="flow-svg" width={w} height={L.H}>
          {L.edges.map((e, i) => { const d = path(e); const on = sel && (e.from === sel || e.to === sel); return (
            <g key={i} className={`fe ${on ? 'on' : ''} ${sel && !on ? 'dim' : ''}`}>
              <path d={d} className="fe-line" />
              <circle r="3.6" className="fe-pkt"><animateMotion dur={`${2.2 + (i % 3) * 0.4}s`} repeatCount="indefinite" begin={`${(i * 0.37) % 2}s`} path={d} /></circle>
            </g>); })}
        </svg>
        {L.edges.filter((e) => e.label && ((L.roomy && L.edges.length <= 9) || (sel && (e.from === sel || e.to === sel)))).map((e, i) => { const a = L.pos[e.from], b = L.pos[e.to]; return <span key={`l${i}`} className={`fe-label ${sel && e.from !== sel && e.to !== sel ? 'dim' : ''}`} style={{ left: (a.x + a.w + b.x) / 2, top: (a.y + a.h / 2 + b.y + b.h / 2) / 2 }}>{e.label}</span>; })}
        {L.nodes.map((n, i) => {
          const p = L.pos[n.id]; const t = toolFor(n); const [c, glyph] = KIND[n.kind] || KIND.part;
          return (
            <button key={n.id} className={`fnode k-${n.kind} ${p.compact ? 'compact' : ''} ${sel === n.id ? 'on' : ''} ${sel && sel !== n.id ? 'dim' : ''}`} style={{ left: p.x, top: p.y, width: p.w, height: p.h, '--c': n.layer ? LAYER[n.layer][3] : c, animationDelay: `${i * 70}ms` }} onClick={() => { stopWalk(); setSel(sel === n.id ? null : n.id); }}>
              <span className="fn-ic">{t ? <Brand slug={t.slug} name={t.name} color={t.color} size={p.compact ? 30 : 40} /> : <span className="fn-glyph" style={{ width: p.compact ? 30 : 40, height: p.compact ? 30 : 40 }}><svg viewBox="0 0 24 24" width={p.compact ? 17 : 22} height={p.compact ? 17 : 22}>{glyph}</svg></span>}</span>
              <span className="fn-body">
                <b className="fn-label">{n.label}</b>
                {!p.compact && n.does && <span className="fn-does">{n.does}</span>}
                {n.term && <span className="fn-term">{n.term}</span>}
              </span>
            </button>
          );
        })}
      </div>
      )}

      <div className={`dive ${node ? 'open' : ''}`}>
        {node && (
          <div className="dive-in" key={node.id}>
            <div className="dive-main">
              <div className="dive-k">{node.kind === 'person' ? 'who starts it' : node.kind === 'outside' ? 'outside help' : node.kind === 'store' ? 'where things are kept' : 'part of this code'}</div>
              <h3>{node.label}</h3>
              <p>{node.more ? <Md text={node.more} /> : node.does}</p>
              {(node.files || []).filter((f) => pathIdx.has(f)).length > 0 && (
                <div className="dive-files">{node.files.filter((f) => pathIdx.has(f)).map((f) => <button key={f} className="file-chip" onClick={() => onOpen(f)}>{f}<span>{role(f)}</span></button>)}</div>
              )}
            </div>
            <div className="dive-side">
              {node.term && (
                <div className="dive-term">
                  <span className="tc-k2">the real word</span>
                  <b>{node.term}</b>
                  <span>{termDef(node.term)?.plain || 'Ask below and Bento will explain it with an example.'}</span>
                  {termDef(node.term)?.like && <i>≈ {termDef(node.term).like}</i>}
                </div>
              )}
              <button className="btn" onClick={() => onAsk(`How does “${node.label}” (${node.term || node.kind}) work in this project?`, (node.files || []).find((f) => pathIdx.has(f)))}>Show me in the code →</button>
            </div>
          </div>
        )}
      </div>

      {build && (
        <div className="takes">
          <div className="tk-l">
            <span className="mini-h">what it takes to build this</span>
            <div className="tk-skills">{(build.skills || []).map((x, i) => <span key={i}><i>{i + 1}</i>{x}</span>)}</div>
            {onMakePath && build.skills?.length > 0 && <MakePathBtn go={() => onMakePath(`be able to build something like ${appName || 'this app'}. It takes: ${build.skills.join(', ')}. ${build.mini ? `A first small version: ${build.mini}` : ''}`)} />}
          </div>
          <div className="tk-time"><span className="mini-h">for a beginner</span><b>{build.time}</b></div>
          {build.mini && onBuild && <button className="tk-go" onClick={() => onBuild(build.mini)}><span className="tk-k">build a mini version with me</span><span className="tk-m">{build.mini}</span><span className="tk-arrow">→</span></button>}
        </div>
      )}
      {terms.length > 0 && (
        <div className="bp-words">
          <span className="mini-h">words you’ll meet</span>
          {terms.map((t) => <button key={t.term} className={`wchip ${word === t.term ? 'on' : ''}`} onClick={() => setWord(word === t.term ? null : t.term)}>{t.term}</button>)}
          {word && (() => { const t = termDef(word); return t && <div className="wdef" key={word}><b>{t.term}</b> {t.plain}{t.like && <i> ≈ {t.like}</i>}</div>; })()}
        </div>
      )}
    </section>
  );
}
