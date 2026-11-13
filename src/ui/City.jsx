import { TOUCH, tap } from '../platform.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BY_ID } from '../atlas/catalog.js';
import { ICONS } from '../atlas/icons.js';
import { LAYERS, LAYER, displayName, heat, langColor } from '../atlas/analyze.js';
import { Md } from './Story.jsx';
import { pressable } from './a11y.js';

// The repo as a little isometric city.
// District = layer, building = file (height = how much code), roof = language,
// floating medallions above = outside services. Words only appear when you point at something.

const GLYPH = { ui: '◐', server: '⇄', logic: '✺', data: '◫', support: '⚙' };
const C30 = 0.866, S30 = 0.5;
const iso = (x, y, z = 0) => [(x - y) * C30, (x + y) * S30 - z];

function plan(bands) {
  // each district is a small grid of lots; files of one folder sit next to each other
  const ds = bands.map((b) => {
    const n = b.files.length; const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.5))); const rows = Math.max(1, Math.ceil(n / cols));
    return { ...b, cols, rows, W: cols + 0.7, D: rows + 0.7 };
  });
  const place = (row) => {
    let prev = null;
    for (const d of row) {
      if (!prev) { d.x = 0; d.y = 0; } else {
        const c1 = prev.x + prev.W / 2 + prev.y + prev.D / 2;
        d.x = prev.x + prev.W + 1.3; d.y = c1 - (d.x + d.W / 2) - d.D / 2;
      }
      prev = d;
    }
  };
  const total = ds.reduce((s, d) => s + d.W + d.D, 0);
  const rows = total > 30 && ds.length > 3 ? [ds.slice(0, 3), ds.slice(3)] : [ds];
  rows.forEach(place);
  if (rows[1]) {
    // centre the front row, then push it forward until nothing overlaps
    const span = (r) => { const xs = r.flatMap((d) => [iso(d.x, d.y + d.D)[0], iso(d.x + d.W, d.y)[0]]); return [Math.min(...xs), Math.max(...xs)]; };
    const [a0, a1] = span(rows[0]), [b0, b1] = span(rows[1]);
    const shift = ((a0 + a1) / 2 - (b0 + b1) / 2) / (2 * C30);
    rows[1].forEach((d) => { d.x += shift; d.y -= shift; });
    const hit = () => rows[1].some((b) => rows[0].some((a) => b.x < a.x + a.W + 1 && b.x + b.W + 1 > a.x && b.y < a.y + a.D + 1 && b.y + b.D + 1 > a.y));
    let t = 0; while (hit() && t < 60) { rows[1].forEach((d) => { d.x += 0.5; d.y += 0.5; }); t++; }
    rows[1].forEach((d) => { d.x += 2.2; d.y += 2.2; });
  }
  // lots
  for (const d of ds) d.lots = d.files.map((f, k) => ({ ...f, lx: d.x + 0.35 + (k % d.cols) + 0.19, ly: d.y + 0.35 + Math.floor(k / d.cols) + 0.19 }));
  return ds;
}

export default function City({ F, N, tools, pathIdx, role, onOpen, narrating, hot }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState(null); // 'f:i' | 's:id' | 'd:layer'
  const [heatOn, setHeatOn] = useState(false);
  const [focus, setFocus] = useState(null);
  const [jr, setJr] = useState(null);

  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    // on a phone the city keeps the size of a small window and you drag sideways to look around (squeezed into 390
    // points, its names would sit on top of each other); it opens centred
    const fit = () => (matchMedia('(max-width: 700px)').matches ? Math.max(el.clientWidth, 760) : el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(fit())); ro.observe(el); setWidth(fit());
    requestAnimationFrame(() => { if (el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const h = (e) => { setFocus(new Set(e.detail.map((i) => (typeof i === 'number' ? `f:${i}` : i)))); setTimeout(() => setFocus(null), 4200); };
    addEventListener('atlas-focus', h); return () => removeEventListener('atlas-focus', h);
  }, []);

  const svcs = useMemo(() => tools.filter((s) => !s.hideAsUi).slice(0, 12), [tools]);
  const journeys = N?.journeys || [];
  const maxUsed = useMemo(() => Math.max(1, ...F.files.map((f) => f.used)), [F]);
  const maxLines = useMemo(() => Math.max(60, ...F.files.filter((f) => f.lang).map((f) => f.lines)), [F]);
  const forced = useMemo(() => { const s = new Set(); journeys.forEach((j) => j.steps.forEach((st) => { const i = pathIdx.get(st.p); if (i != null) s.add(i); })); hot.forEach((h) => { const i = pathIdx.get(h.p); if (i != null) s.add(i); }); return s; }, [journeys, hot, pathIdx]);

  // pick buildings per district
  const bands = useMemo(() => LAYERS.map(([id]) => {
    const all = F.files.map((f, i) => ({ f, i })).filter(({ f, i }) => f.layer === id && (forced.has(i) || (!/\.(json|ya?ml|toml|lock|txt|md|mdx)$/.test(f.p) && (id !== 'support' || f.lang))));
    const score = ({ f, i }) => (forced.has(i) ? 1000 : 0) + (f.entry ? 60 : 0) + f.used * 6 + Math.sqrt(f.lines);
    const cap = id === 'support' ? 12 : 30;
    const shown = [...all].sort((a, b) => score(b) - score(a)).slice(0, cap);
    const folder = (x) => x.f.p.split('/').slice(0, -1).slice(0, 2).join('/');
    shown.sort((a, b) => folder(a).localeCompare(folder(b)) || score(b) - score(a));
    const top = new Set([...shown].sort((a, b) => score(b) - score(a)).slice(0, id === 'support' ? 1 : 3).map((x) => x.i));
    return { id, files: shown.map((x) => ({ ...x, top: top.has(x.i), folder: folder(x) })), total: F.files.filter((f) => f.layer === id).length };
  }).filter((b) => b.files.length > 0), [F, forced]);

  const city = useMemo(() => plan(bands), [bands]);

  // fit to width
  const geo = useMemo(() => {
    const pts = [];
    for (const d of city) { pts.push(iso(d.x, d.y), iso(d.x + d.W, d.y), iso(d.x + d.W, d.y + d.D), iso(d.x, d.y + d.D)); for (const l of d.lots) pts.push(iso(l.lx, l.ly, 4)); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sky = svcs.length ? 78 : 18, padX = 30, bottom = 46;
    const k = Math.min((width - padX * 2) / (maxX - minX), 520 / (maxY - minY + 1), 46);
    const P = (x, y, z = 0) => { const [a, b] = iso(x, y, z); return [(a - minX) * k + padX + ((width - padX * 2) - (maxX - minX) * k) / 2, (b - minY) * k + sky]; };
    return { k, P, h: (maxY - minY) * k + sky + bottom, sky };
  }, [city, width, svcs.length]);
  const { k, P } = geo;

  const bh = (f) => 0.35 + 3.6 * Math.sqrt(Math.min(1, f.lines / maxLines)); // building height in cells
  const roof = {}; // key → [x,y] roof centre in px
  for (const d of city) for (const l of d.lots) roof[`f:${l.i}`] = P(l.lx + 0.31, l.ly + 0.31, bh(l.f));
  const svcPos = {};
  svcs.forEach((s, i) => { const n = svcs.length; const x = width / 2 + (i - (n - 1) / 2) * Math.min(86, (width - 120) / Math.max(1, n)); svcPos[`s:${s.id}`] = [x, 38 + Math.abs(i - (n - 1) / 2) * 3]; });

  // what's lit
  const resolve = (p) => { if (!p) return null; if (String(p).startsWith('stack:')) { const id = p.slice(6); return svcs.some((s) => s.id === id) ? `s:${id}` : null; } const i = pathIdx.get(p); return i != null && roof[`f:${i}`] ? `f:${i}` : null; };
  const jKeys = jr ? (journeys[jr.j]?.steps || []).map((s) => resolve(s.p)) : [];
  useEffect(() => {
    if (!jr?.playing) return;
    const n = journeys[jr.j]?.steps.length || 0;
    const t = setTimeout(() => setJr((x) => (x && x.s < n - 1 ? { ...x, s: x.s + 1 } : x && { ...x, playing: false })), jr.s === 0 ? 2200 : 2900);
    return () => clearTimeout(t);
  }, [jr]);

  let lit = null; const links = [];
  const fileSvcs = (i) => svcs.filter((s) => s.used?.includes(i)).map((s) => `s:${s.id}`);
  if (jr) lit = new Set(jKeys.filter(Boolean));
  else if (hover?.startsWith('f:')) {
    const i = +hover.slice(2); lit = new Set([hover]);
    F.files[i].imp.forEach((j) => { const kk = `f:${j}`; if (roof[kk]) { lit.add(kk); links.push([hover, kk, 'out']); } });
    F.files.forEach((g, j) => { const kk = `f:${j}`; if (g.imp.includes(i) && roof[kk]) { lit.add(kk); links.push([kk, hover, 'in']); } });
    fileSvcs(i).forEach((s) => { lit.add(s); links.push([hover, s, 'svc']); });
  } else if (hover?.startsWith('s:')) {
    const s = svcs.find((x) => `s:${x.id}` === hover); lit = new Set([hover]);
    (s?.used || []).forEach((i) => { const kk = `f:${i}`; if (roof[kk]) { lit.add(kk); links.push([kk, hover, 'svc']); } });
  } else if (hover?.startsWith('d:')) {
    lit = new Set(city.find((d) => d.id === hover.slice(2))?.lots.map((l) => `f:${l.i}`) || []);
  } else if (focus) lit = focus;

  const pos = (key) => roof[key] || svcPos[key];
  const arc = (a, b) => {
    if (!a || !b) return null;
    const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - 26 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22;
    return `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  };
  const jPath = [];
  if (jr) for (let s = 1; s <= jr.s; s++) { const d = arc(pos(jKeys[s - 1]), pos(jKeys[s])); if (d) jPath.push({ d, cur: s === jr.s }); }
  const curStep = jr ? journeys[jr.j]?.steps[jr.s] : null;

  // painter's order: back to front
  const lots = city.flatMap((d) => d.lots.map((l) => ({ ...l, d }))).sort((a, b) => (a.lx + a.ly) - (b.lx + b.ly));
  const tags = new Set(lots.filter((l) => l.top).map((l) => `f:${l.i}`));
  if (lit && lit.size <= 14) lit.forEach((x) => x.startsWith('f:') && tags.add(x));
  if (jr && jKeys[jr.s]) tags.add(jKeys[jr.s]);

  const hovered = hover?.startsWith('f:') ? F.files[+hover.slice(2)] : null;
  const hoveredD = hover?.startsWith('d:') ? hover.slice(2) : null;
  const hoveredS = hover?.startsWith('s:') ? svcs.find((s) => `s:${s.id}` === hover) : null;
  const langsShown = [...new Set(lots.map((l) => l.f.lang).filter(Boolean))].slice(0, 6);

  return (
    <section className="asec" id="sec-anatomy">
      <div className="sec-head">
        <div>
          <div className="kicker">anatomy</div>
          <h2>How it’s put together</h2>
        </div>
        <div className="sec-tools"><button className={`chip ${heatOn ? 'on' : ''}`} onClick={() => setHeatOn(!heatOn)}><span className="heat-sw" />Heat</button></div>
      </div>
      {(journeys.length > 0 || narrating) && (
        <div className="journeys">
          {journeys.map((j, ji) => (
            <button key={ji} className={`jchip ${jr?.j === ji ? 'on' : ''}`} onClick={() => setJr(jr?.j === ji ? null : { j: ji, s: 0, playing: true })}>
              <span className="jplay">{jr?.j === ji ? '■' : '▶'}</span>{j.title}
            </button>
          ))}
          {narrating && journeys.length < 2 && <span className="jchip ghost"><span className="lens-spin" />tracing a journey…</span>}
        </div>
      )}

      {/* one caption, always in the same place */}
        <div className="city-cap">
          {jr && curStep ? (
            <div className="cap-j">
              <span className="jcap-n">{jr.s + 1}</span>
              <div className="cap-main">
                <div className="cap-where">{String(curStep.p).startsWith('stack:') ? (BY_ID[curStep.p.slice(6)]?.name || curStep.p.slice(6)) : curStep.p}</div>
                <div className="cap-md"><Md text={curStep.md} /></div>
              </div>
              <div className="cap-ctl">
                <span className="jcap-dots">{journeys[jr.j].steps.map((_, i) => <button key={i} className={i === jr.s ? 'on' : i < jr.s ? 'past' : ''} onClick={() => setJr({ ...jr, s: i, playing: false })} />)}</span>
                <button className="ib" onClick={() => setJr({ ...jr, s: Math.max(0, jr.s - 1), playing: false })}>◀</button>
                <button className="ib" onClick={() => setJr({ ...jr, playing: !jr.playing, s: !jr.playing && jr.s >= journeys[jr.j].steps.length - 1 ? 0 : jr.s })}>{jr.playing ? '❚❚' : '▶'}</button>
                <button className="ib" onClick={() => setJr({ ...jr, s: Math.min(journeys[jr.j].steps.length - 1, jr.s + 1), playing: false })}>▶▶</button>
                <button className="ib" aria-label="Stop the journey" onClick={() => setJr(null)}>✕</button>
              </div>
            </div>
          ) : hovered ? (
            <div className="cap-f">
              <span className="cap-swatch" style={{ background: hovered.lang ? langColor(hovered.lang) : 'var(--ink-4)' }} />
              <div className="cap-main"><div className="cap-where">{hovered.p}</div><div className="cap-md">{role(hovered.p)}</div></div>
              <div className="cap-stats"><b>{hovered.lines.toLocaleString()}</b> lines{hovered.used ? <> · used by <b>{hovered.used}</b></> : null}{hovered.imp.length ? <> · uses <b>{hovered.imp.length}</b></> : null}</div>
            </div>
          ) : hoveredS ? (
            <div className="cap-f"><div className="cap-main"><div className="cap-where">{hoveredS.name}</div><div className="cap-md">{N?.stack?.[hoveredS.id]?.role || hoveredS.what}</div></div>{hoveredS.used?.length ? <div className="cap-stats">used in <b>{hoveredS.used.length}</b> files</div> : null}</div>
          ) : hoveredD ? (
            <div className="cap-f"><span className="cap-glyph" style={{ color: LAYER[hoveredD][3] }}>{GLYPH[hoveredD]}</span><div className="cap-main"><div className="cap-where">{LAYER[hoveredD][1]} · {LAYER[hoveredD][2].toLowerCase()}</div><div className="cap-md">{N?.layers?.[hoveredD] ? <Md text={N.layers[hoveredD]} /> : LAYER[hoveredD][2]}</div></div></div>
          ) : (
            <div className="legend">
              <span className="lg"><svg width="22" height="22" viewBox="0 0 22 22"><path d="M5 18 V9 L11 6 L17 9 V18 L11 21 Z" fill="var(--bsid)" /><path d="M5 9 L11 6 L17 9 L11 12 Z" fill="var(--violet)" opacity=".7" /><path d="M5 5 V9 M17 1 V9" stroke="var(--ink-4)" strokeDasharray="1.5 2" /></svg>taller = more code</span>
              <span className="lg">{langsShown.map((l) => <i key={l} className="lg-roof" style={{ background: langColor(l) }} title={l} />)}roof = language</span>
              <span className="lg"><svg width="12" height="16"><line x1="2" y1="16" x2="2" y2="2" stroke="var(--mint)" strokeWidth="1.6" /><path d="M2 2 L11 5 L2 8 Z" fill="var(--mint)" /></svg>starts here</span>
              <span className="lg"><svg width="10" height="16"><line x1="5" y1="16" x2="5" y2="5" stroke="var(--accent)" strokeWidth="1.6" /><circle cx="5" cy="4" r="3" fill="var(--accent)" /></svg>lots depend on it</span>
              <span className="lg muted">{TOUCH ? 'tap a building to see it, tap again to open it' : 'hover anything · click a building to open it'}</span>
            </div>
          )}
        </div>
      <div className={`city ${lit ? 'has-lit' : ''}`} ref={wrap}>
        <svg width={width} height={geo.h} className="city-svg" tabIndex={0} role="group" aria-roledescription="city" aria-label={`A city of this project's ${lots.length} files in ${city.length} districts. Use the arrow keys to walk between buildings, Enter to open one.`}
          onKeyDown={(e) => {
            const order = city.flatMap((d) => d.lots.map((l) => `f:${l.i}`)); if (!order.length) return;
            const at = order.indexOf(hover); const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (step) { e.preventDefault(); setHover(order[at < 0 ? 0 : (at + step + order.length) % order.length]); }
            else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setHover(order[e.key === 'Home' ? 0 : order.length - 1]); }
            else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) { e.preventDefault(); const l = lots.find((x) => `f:${x.i}` === hover); if (l) onOpen(l.f.p); }
          }} onBlur={() => setHover(null)}>
          <defs>
            <radialGradient id="glow"><stop offset="0" stopColor="var(--violet)" stopOpacity=".5" /><stop offset="1" stopColor="var(--violet)" stopOpacity="0" /></radialGradient>
          </defs>
          {/* ground */}
          {city.map((d) => {
            const c = LAYER[d.id][3];
            const pts = [P(d.x, d.y), P(d.x + d.W, d.y), P(d.x + d.W, d.y + d.D), P(d.x, d.y + d.D)];
            const lip = [P(d.x, d.y + d.D), P(d.x + d.W, d.y + d.D), P(d.x + d.W, d.y + d.D, -0.28), P(d.x, d.y + d.D, -0.28)];
            const lip2 = [P(d.x + d.W, d.y), P(d.x + d.W, d.y + d.D), P(d.x + d.W, d.y + d.D, -0.28), P(d.x + d.W, d.y, -0.28)];
            const on = hoveredD === d.id || (lit && d.lots.some((l) => lit.has(`f:${l.i}`)));
            return (
              <g key={d.id} className={`plot ${on ? 'on' : ''}`} style={{ '--c': c }} onMouseEnter={() => setHover(`d:${d.id}`)} onMouseLeave={() => setHover(null)}>
                <polygon className="plot-lip" points={lip.map((p) => p.join(',')).join(' ')} />
                <polygon className="plot-lip r" points={lip2.map((p) => p.join(',')).join(' ')} />
                <polygon className="plot-top" points={pts.map((p) => p.join(',')).join(' ')} />
              </g>
            );
          })}
          {/* buildings */}
          {lots.map((l) => {
            const key = `f:${l.i}`; const f = l.f; const h = bh(f); const w = 0.62;
            const A = P(l.lx, l.ly, h), B = P(l.lx + w, l.ly, h), C = P(l.lx + w, l.ly + w, h), D = P(l.lx, l.ly + w, h);
            const B0 = P(l.lx + w, l.ly), C0 = P(l.lx + w, l.ly + w), D0 = P(l.lx, l.ly + w);
            const c = LAYER[l.d.id][3]; const hv = heatOn ? heat(f, maxUsed) : 0;
            const side = hv > 0.3 ? `color-mix(in srgb, var(--rose) ${Math.round(hv * 80)}%, var(--bsid))` : 'var(--bsid)';
            const cls = ['bld', lit ? (lit.has(key) ? 'lit' : 'dim') : '', jr && jKeys[jr.s] === key ? 'now' : '', hover === key ? 'hov' : ''].join(' ');
            return (
              <g key={key} className={cls} style={{ '--c': c, '--roof': f.lang ? langColor(f.lang) : 'var(--ink-4)', '--side': side }}
                onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)} onClick={() => { if (TOUCH && hover !== key) { setHover(key); return; } onOpen(f.p); }}>
                <polygon className="f-l" points={[D0, C0, C, D].map((p) => p.join(',')).join(' ')} />
                <polygon className="f-r" points={[C0, B0, B, C].map((p) => p.join(',')).join(' ')} />
                <polygon className="f-t" points={[A, B, C, D].map((p) => p.join(',')).join(' ')} />
                {heatOn && hv > 0.55 && <ellipse cx={(A[0] + C[0]) / 2} cy={(A[1] + C[1]) / 2} rx={k * 0.5} ry={k * 0.25} className="heat-glow" />}
                {f.entry && <g transform={`translate(${(A[0] + C[0]) / 2},${(A[1] + C[1]) / 2})`} className="flag"><line x1="0" y1="0" x2="0" y2="-14" /><path d="M0,-14 L9,-11 L0,-8 Z" /></g>}
                {f.used >= Math.max(5, maxUsed * 0.5) && <g transform={`translate(${(A[0] + C[0]) / 2},${(A[1] + C[1]) / 2})`} className="beacon"><line x1="0" y1="0" x2="0" y2="-11" /><circle cy="-12" r="2.6" /></g>}
              </g>
            );
          })}
          {/* sky: outside services */}
          {svcs.length > 0 && <text x={22} y={18} className="sky-h">outside help</text>}
          {svcs.map((s) => {
            const key = `s:${s.id}`; const [x, y] = svcPos[key]; const ic = ICONS[s.slug];
            const cls = ['svc-n', lit ? (lit.has(key) ? 'lit' : 'dim') : '', jr && jKeys[jr.s] === key ? 'now' : ''].join(' ');
            return (
              <g key={key} className={cls} transform={`translate(${x},${y})`} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
                <line className="tether" x1="0" y1="18" x2="0" y2="30" />
                <circle r="17" className="svc-disc" />
                {ic ? <path d={ic[1]} transform="translate(-9.5,-9.5) scale(.79)" style={{ fill: lumDark(ic[0]) ? 'var(--svc-ink)' : `#${ic[0]}` }} />
                  : <text className="svc-mono" dy="4.5" style={{ fill: s.color || 'var(--ink-2)' }}>{s.name.slice(0, 2)}</text>}
                <text className="svc-name" y="32">{s.name}</text>
              </g>
            );
          })}
          {/* links + journey */}
          {links.map(([a, b, kind], i) => { const d = arc(pos(a), pos(b)); return d && <path key={i} d={d} className={`beam ${kind}`} />; })}
          {jPath.map((p, i) => <path key={`j${i}`} d={p.d} className={`beam jr ${p.cur ? 'cur' : ''}`} />)}
          {/* name tags */}
          {placeTags([...tags].filter((key) => roof[key]).map((key) => { const t = displayName(F.files[+key.slice(2)].p); return { key, t, w: t.length * 6.4 + 14, x: roof[key][0], y: roof[key][1] - 10, ry: roof[key][1] }; })).map(({ key, t, w, x, y, ry }) => (
            <g key={`t${key}`} className={`tag ${lit && !lit.has(key) ? 'dim' : ''}`} pointerEvents="none">
              {ry - y > 14 && <line x1={x} y1={ry - 4} x2={x} y2={y} className="tag-lead" />}
              <g transform={`translate(${x},${y})`}><rect x={-w / 2} y="-17" width={w} height="17" rx="8.5" /><text y="-5">{t}</text></g>
            </g>
          ))}
          {/* district signs */}
          {city.map((d) => {
            const [x, y] = P(d.x + d.W, d.y + d.D); const [, name] = LAYER[d.id]; const label = `${GLYPH[d.id]}  ${name}`; const w = label.length * 7 + 40;
            return (
              <g key={`s${d.id}`} className={`sign ${hoveredD === d.id ? 'on' : ''}`} style={{ '--c': LAYER[d.id][3] }} transform={`translate(${x - w / 2},${y + 14})`} onMouseEnter={() => setHover(`d:${d.id}`)} onMouseLeave={() => setHover(null)} {...pressable(() => window.dispatchEvent(new CustomEvent('atlas-layer', { detail: d.id })))}>
                <title>Show every file in {LAYER[d.id][1]}</title>
                <rect width={w} height="22" rx="11" /><text x="11" y="15">{label}</text><text className="sign-n" x={w - 11} y="15" textAnchor="end">{d.total}</text>
              </g>
            );
          })}
        </svg>
        <span className="sr-only" aria-live="polite">{(() => { const l = hover?.startsWith('f:') && lots.find((x) => `f:${x.i}` === hover); return l ? `${l.f.p}, in ${LAYER[l.d.id][1]}` : ''; })()}</span>
        {jPath.length > 0 && jPath[jPath.length - 1].cur && <span key={`dot${jr.j}-${jr.s}`} className="jdot" style={{ offsetPath: `path('${jPath[jPath.length - 1].d}')` }} />}

      </div>
    </section>
  );
}

// nudge name tags upward until none overlap
function placeTags(ts) {
  const out = [];
  for (const t of ts.sort((a, b) => b.y - a.y)) {
    let y = t.y; let guard = 0;
    while (out.some((o) => Math.abs(o.x - t.x) < (o.w + t.w) / 2 + 3 && Math.abs(o.y - y) < 19) && guard++ < 12) y -= 19;
    out.push({ ...t, y });
  }
  return out;
}

function lumDark(hex) { const n = parseInt(hex, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255; return L < 0.16 || L > 0.9; }
