import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grow from './Grow.jsx';
import Contribute from './Contribute.jsx';
import { CATS, BY_ID, CATALOG, LANGS } from '../atlas/catalog.js';
import { LAYERS, LAYER, detectStack, displayName, setDupes, guessRole, measuredHotspots, heat, langColor, fmtN } from '../atlas/analyze.js';
import Brand from './Brand.jsx';
import Editor from './Editor.jsx';
import City from './City.jsx';
import BigPicture, { fallbackFlow } from './BigPicture.jsx';
import { Md } from './Story.jsx';
import { keys, mod } from '../platform.js';
import { t } from '../i18n.js';
import { save } from '../store.js';

const SECTIONS = [['overview', 'Overview'], ['anatomy', 'Anatomy'], ['grow', 'Growth'], ['stack', 'Toolbelt'], ['language', 'Language'], ['hot', 'Hot spots'], ['files', 'Files'], ['study', 'Study it'], ['help', 'Help out']];
const edLang = (l) => (l === 'Python' ? 'python' : l === 'TypeScript' ? 'typescript' : 'javascript');
const ago = (d) => { if (!d) return ''; const s = (Date.now() - new Date(d)) / 1000; const u = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']].find((x) => s >= x[0]); if (!u) return 'just now'; const n = Math.floor(s / u[0]); return `${n} ${u[1]}${n > 1 ? 's' : ''} ago`; };
const lc = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const byName = Object.fromEntries(CATALOG.map((e) => [e.name.toLowerCase(), e]));
const findTool = (name) => { const n = String(name).toLowerCase().trim(); return byName[n] || BY_ID[n] || CATALOG.find((e) => e.name.toLowerCase() === n.split(/\s*[(/]/)[0].trim()); };

export function mergeTools(stack, narrStack = {}) {
  const main = stack.filter((s) => !s.workshop);
  const extra = Object.values(narrStack).filter((x) => x.name && !stack.some((s) => s.id === x.id || s.name.toLowerCase() === x.name.toLowerCase())).map((x) => { const c = findTool(x.name); return { ...(c || {}), id: x.id || x.name, name: x.name, cat: x.cat || c?.cat || 'frame', slug: c?.slug, what: c?.what || x.role, alt: c?.alt || [], used: [], evidence: ['spotted by reading the code'], added: true }; });
  return [...main, ...extra];
}

export default function Atlas({ asked, onAskedDone, onIdeaInstead, onPlanIssue,  onMakePath, atlas: A, onStopReading, onBig, onOthers, onQuick, initialFile, onInitialFileShown, onBuild, onCompare, onAsk, onExplainFile, onFeature, readFile, onRefresh, onFork, onOpenUrl, onRetry, modelLabel }) {
  const F = A.facts; const N = A.narr; const meta = A.meta || {};
  const scroller = useRef(null);
  const [drawer, setDrawer] = useState(null);
  const [tourAt, setTourAt] = useState(null);
  const [section, setSection] = useState('overview');
  const [forkState, setForkState] = useState(null);
  const [copied, setCopied] = useState(false);

  const stack = useMemo(() => { if (F) setDupes(F.files); return F ? detectStack(F) : []; }, [F]);
  const tools = useMemo(() => mergeTools(stack, N?.stack), [stack, N?.stack]);
  const pathIdx = useMemo(() => new Map((F?.files || []).map((f, i) => [f.p, i])), [F]);
  const hot = useMemo(() => (F ? [...(N?.hot || []), ...measuredHotspots(F).filter((m) => !(N?.hot || []).some((h) => h.p && h.p === m.p))] : []), [F, N?.hot]);
  const role = (p) => N?.roles?.[p] || (F && pathIdx.has(p) ? guessRole(F.files[pathIdx.get(p)]) : '');
  // any file in the project can open, even ones the big-project sampling didn't analyse (answers can point at them)
  const openFile = (p) => { if (pathIdx.has(p) || (A.src?.root && typeof p === 'string' && /^[\w@.\-+/ ]+$/.test(p) && !p.includes('..'))) setDrawer(p); };
  useEffect(() => { if (initialFile && F && pathIdx.has(initialFile)) { setDrawer(initialFile); onInitialFileShown?.(); } }, [initialFile, F]);

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setSection(v.target.id.replace('sec-', '')); }, { root: el, rootMargin: '-80px 0px -60% 0px' });
    el.querySelectorAll('.asec').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [F]);
  const go = (id) => scroller.current?.querySelector(`#sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => { document.querySelector('.ab-nav button.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, [section]);
  useEffect(() => { const h = () => setTimeout(() => go('files'), 30); addEventListener('atlas-layer', h); return () => removeEventListener('atlas-layer', h); }, []);

  const narrating = A.status === 'narrating';
  const gist = N?.gist;
  const langs = F ? Object.entries(F.langs).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const totalL = langs.reduce((s, [, n]) => s + n, 0) || 1;
  const mainLang = N?.lang?.name && LANGS[N.lang.name] ? N.lang.name : langs.find(([l]) => !['HTML', 'CSS', 'Shell', 'SQL'].includes(l))?.[0] || langs[0]?.[0];

  // a fresh download keeps the three steps on screen long enough to read; reopening a saved project stays instant
  const shownAt = useRef(Date.now()); const worked = useRef(false);
  if (A.status === 'reading' || (A.progress && A.progress.phase !== 'cached')) worked.current = true;
  const [hold, setHold] = useState(!F);
  const holding = hold && (!F || worked.current);
  useEffect(() => { if (!F || !holding) return; const t = setTimeout(() => setHold(false), Math.max(1100, 1800 - (Date.now() - shownAt.current))); return () => clearTimeout(t); }, [F, holding]);

  // more sections than fit? fade the edge you can scroll towards, and keep the one you picked in view
  const navRef = useRef(null); const [navMore, setNavMore] = useState('');
  useLayoutEffect(() => {
    const n = navRef.current; if (!n) return undefined;
    const upd = () => { const over = n.scrollWidth - n.clientWidth > 4; setNavMore(!over ? '' : [n.scrollLeft > 4 && 'more-l', n.scrollLeft + n.clientWidth < n.scrollWidth - 4 && 'more-r'].filter(Boolean).join(' ')); };
    upd(); const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null; ro?.observe(n); n.addEventListener('scroll', upd, { passive: true });
    return () => { ro?.disconnect(); n.removeEventListener('scroll', upd); };
  }, [holding]); // the bar only exists once the project has loaded
  useEffect(() => { navRef.current?.querySelector('button.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }); }, [section, holding]);

  if (holding) return <AtlasLoading A={A} F={F} onRetry={onRetry} onBig={onBig} asked={asked} onIdeaInstead={onIdeaInstead} />;

  return (
    <div className="atlas" ref={scroller}>
      <div className="atlas-bar">
        <div className="ab-id">
          {meta.avatar ? <img src={meta.avatar} alt="" /> : <span className="ab-folder">▢</span>}
          <span className="ab-name"><span className="muted">{(meta.full || A.name).includes('/') ? (meta.full || A.name).split('/')[0] + ' / ' : ''}</span>{(meta.full || A.name).split('/').pop()}</span>
        </div>
        <nav className={`ab-nav ${navMore}`} ref={navRef} aria-label="Sections">{SECTIONS.filter(([id]) => !['grow', 'help'].includes(id) || A.src?.kind === 'github').map(([id, l]) => <button key={id} className={section === id ? 'on' : ''} onClick={() => go(id)}>{l}</button>)}</nav>
        <div className="ab-act">
          {narrating && <button className="ab-live" title={`${modelLabel} is reading the code. Click to stop.`} onClick={onStopReading}><span className="dots"><i /><i /><i /></span>reading</button>}
          {A.status === 'narr-error' && (/^You stopped/.test(A.error || '') ? <button className="chip" onClick={onRetry} title={A.error}>❚❚ Reading paused · continue</button> : <button className="chip warnchip" onClick={onRetry} title={A.error}>Explanations failed · retry</button>)}
          {A.src?.kind === 'github' && <>
            <button className="chip" aria-label="Fork into your GitHub" title="Fork: copy this project into your own GitHub account, so you can change it without touching the original" disabled={forkState === 'busy'} onClick={async () => { setForkState('busy'); try { const r = await onFork(); setForkState(r); } catch (e) { setForkState({ err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); } }}><span className="ic">⑂</span><span className="lbl">{forkState === 'busy' ? 'Forking…' : forkState?.url ? 'Forked ✓' : 'Fork'}</span></button>
            <button className="chip" title="Open on GitHub" aria-label="Open on GitHub" onClick={() => onOpenUrl(meta.url || `https://github.com/${A.src.full}`)}><span className="lbl">GitHub </span>↗</button>
          </>}
          <button className="chip" onClick={onCompare} title="Compare: put it next to another app" aria-label="Compare with another app">⇄<span className="lbl"> Compare</span></button>
          <button className="chip icon" title="Copy as study notes (Markdown)" onClick={() => { navigator.clipboard?.writeText(notesMd(A, tools, hot)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? '✓' : '⧉'}</button>
          <button className="chip icon" title="Read it again from scratch" aria-label="Read it again from scratch" onClick={onRefresh}>↻</button>
        </div>
        {forkState?.url && <div className="fork-note">Forked to <button className="link" onClick={() => onOpenUrl(forkState.url)}>{forkState.url.replace('https://github.com/', '')}</button>. It’s now in your GitHub, ready to change.</div>}
        {forkState?.err && <div className="fork-note err">{forkState.err}</div>}
      </div>
      {asked && <AskedBanner asked={asked} A={A} onIdeaInstead={onIdeaInstead} onClose={onAskedDone} />}

      {/* ------------------------------------------------ overview: a headline, vitals, and the whole system as one picture */}
      <section className="asec a-over" id="sec-overview">
        <div className="over-top">
          <div className="over-text">
            <div className="kicker">{gist?.kind || (A.src?.kind === 'local' ? 'your project' : 'open source')}</div>
            <h1 className={gist ? '' : 'pending'}>{gist?.one || meta.description || F.sig?.pkgDesc || `What is ${A.name.split('/').pop()}?`}</h1>
            {gist?.analogy ? <p className="analogy">{gist.analogy}</p> : narrating ? <div className="shimmer" style={{ width: '62%', height: 16 }} /> : null}
          </div>
          <div className="vitals">
            <Donut langs={langs} total={totalL} />
            <div className="vt-rows">
              <div><b>{F.totals.code}</b><span>code files</span></div>
              <div><b>{fmtN(F.totals.lines)}</b><span>lines</span></div>
              <div><b>{tools.length}</b><span>outside tools</span></div>
              {meta.stars > 0 && <div><b>★ {fmtN(meta.stars)}</b><span>{meta.pushed ? `updated ${ago(meta.pushed)}` : 'stars'}</span></div>}
            </div>
            {gist?.users && <div className="vt-who"><span className="k">for</span>{gist.users}</div>}
          </div>
        </div>
        <BigPicture appName={(meta.full || A.name).split('/').pop()} onMakePath={onMakePath} build={N?.build} onBuild={onBuild} flow={N?.flow || fallbackFlow(F, tools)} terms={N?.terms || []} tools={tools} pathIdx={pathIdx} onOpen={openFile} onAsk={onAsk} narrating={narrating} role={role} />
        {tools.length > 0 && (
          <div className="stack-strip">
            <span className="mini-h">built with</span>
            <div className="ss-row">
              {tools.slice(0, 14).map((t) => (
                <button key={t.id} className="ss-t" onClick={() => { window.dispatchEvent(new CustomEvent('atlas-tool', { detail: t.id })); go('stack'); }} title={`${t.name}: ${N?.stack?.[t.id]?.role || t.what}`}>
                  <Brand slug={t.slug} name={t.name} color={t.color} size={34} />
                  <span>{t.name}</span>
                  <i>{CATS[t.cat]?.[0]}</i>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <City F={F} N={N} tools={tools} pathIdx={pathIdx} role={role} onOpen={openFile} narrating={narrating} hot={hot} />
      {A.src?.kind === 'github' && <Grow full={A.src.full || meta.full} />}
      <Toolbelt tools={tools} stack={stack} N={N} narrating={narrating} onShowFiles={(ids) => { window.dispatchEvent(new CustomEvent('atlas-focus', { detail: ids })); go('anatomy'); }} />
      <Language langs={langs} totalL={totalL} main={mainLang} N={N} narrating={narrating} />
      <Hotspots hot={hot} role={role} onOpen={openFile} narrating={narrating} F={F} pathIdx={pathIdx} />
      <FileList F={F} role={role} onOpen={openFile} />
      <Study F={F} readFile={readFile} onOpen={openFile} A={A} N={N} onAsk={onAsk} onFeature={onFeature} narrating={narrating} tour={(N?.tour || []).filter((t) => pathIdx.has(t.p))} role={role} onTour={(i) => { const st = (N?.tour || []).filter((t) => pathIdx.has(t.p)); setTourAt(i); setDrawer(st[i].p); }} />
      {A.src?.kind === 'github' && <Contribute full={A.src.full || meta.full} onPlan={onPlanIssue} onOpen={openFile} onOpenUrl={onOpenUrl} pathIdx={pathIdx} />}
      <div style={{ height: 110 }} />
      <AskBar name={(meta.full || A.name).split('/').pop()} threadKey={A.key} onAsk={onAsk} onQuick={onQuick} onOpen={openFile} pathIdx={pathIdx} initial={asked && A.src?.root ? asked : null} onFeature={onFeature} />
      {drawer && <Drawer onOthers={onOthers} tour={tourAt != null ? { i: tourAt, steps: (N?.tour || []).filter((t) => pathIdx.has(t.p)), go: (i) => { const st = (N?.tour || []).filter((t) => pathIdx.has(t.p)); if (i < 0 || i >= st.length) { setTourAt(null); setDrawer(null); return; } setTourAt(i); setDrawer(st[i].p); } } : null} p={drawer} F={F} pathIdx={pathIdx} role={role} stack={stack} onClose={() => { setDrawer(null); setTourAt(null); }} onOpen={openFile} readFile={readFile} onExplain={onExplainFile} onAsk={onAsk} />}
    </div>
  );
}

// Everything Bento learned about a repo, as Markdown notes you can paste anywhere.
function notesMd(A, tools, hot) {
  const N = A.narr || {}; const g = N.gist || {};
  const L = [`# ${A.name}`, '', g.one ? `**${g.one}**` : A.meta?.description || '', g.analogy ? `\n> ${g.analogy}` : '', ''];
  if (N.flow?.nodes?.length) { L.push('## The big picture'); N.flow.nodes.forEach((n) => L.push(`- **${n.label}** (${n.term || n.kind}): ${n.does || ''}`)); L.push(''); }
  if (N.terms?.length) { L.push('## Words'); N.terms.forEach((t) => L.push(`- **${t.term}**: ${t.plain}`)); L.push(''); }
  if (tools.length) { L.push('## Toolbelt'); tools.forEach((t) => { const n = N.stack?.[t.id]; L.push(`- **${t.name}**: ${n?.role || t.what}${n?.why ? ` _Why:_ ${n.why}` : ''}`); }); L.push(''); }
  if (N.tour?.length) { L.push('## Read it in this order'); N.tour.forEach((t, i) => L.push(`${i + 1}. \`${t.p}\`: ${t.why}`)); L.push(''); }
  if (hot.length) { L.push('## Hot spots'); hot.forEach((h) => L.push(`- **${h.title}**${h.p ? ` (\`${h.p}\`)` : ''}: ${h.md}`)); L.push(''); }
  L.push(`_Made with Bento${A.src?.kind === 'github' ? ` · https://github.com/${A.src.full}` : ''}_`);
  return L.join('\n');
}

function Donut({ langs, total }) {
  let a = -Math.PI / 2; const R = 30, r = 19;
  const arcs = langs.slice(0, 6).map(([l, n]) => { const da = (n / total) * Math.PI * 2; const a0 = a; a += da; const a1 = a - 0.02;
    const big = da > Math.PI ? 1 : 0; const P = (rad, ang) => `${(36 + rad * Math.cos(ang)).toFixed(2)},${(36 + rad * Math.sin(ang)).toFixed(2)}`;
    return <path key={l} d={da >= Math.PI * 2 - 0.03 ? `M36,${36 - R} A${R},${R} 0 1 1 35.99,${36 - R} L35.99,${36 - r} A${r},${r} 0 1 0 36,${36 - r} Z` : `M${P(R, a0)} A${R},${R} 0 ${big} 1 ${P(R, a1)} L${P(r, a1)} A${r},${r} 0 ${big} 0 ${P(r, a0)} Z`} fill={langColor(l)}><title>{l} {Math.round((n / total) * 100)}%</title></path>; });
  const top = langs[0];
  return (
    <div className="donut">
      <svg viewBox="0 0 72 72" width="88" height="88">{arcs}</svg>
      <div className="donut-l">{langs.slice(0, 3).map(([l, n]) => <span key={l}><i style={{ background: langColor(l) }} />{l} <b>{Math.round((n / total) * 100)}%</b></span>)}</div>
    </div>
  );
}

function AtlasLoading({ A, F, onRetry, onBig, asked, onIdeaInstead }) {
  const steps = [['clone', 'Bringing the code onto your Mac'], ['read', 'Reading every file and following the imports'], ['narr', 'Asking your model to explain it']];
  const real = F ? 2 : A.status === 'cloning' ? 0 : A.status === 'reading' ? 1 : 2;
  const [at, setAt] = useState(0);
  useEffect(() => { if (at >= real) return; const t = setTimeout(() => setAt((x) => x + 1), 480); return () => clearTimeout(t); }, [at, real]);
  const counts = F && {
    files: F.totals.code, lines: F.totals.lines,
    links: F.files.reduce((a, f) => a + (f.imp?.length || 0), 0),
    outside: new Set(F.files.flatMap((f) => f.ext || [])).size,
  };
  return (
    <div className="atlas-loading">
      {asked && <AskedBanner asked={asked} A={A} onIdeaInstead={onIdeaInstead} waiting />}
      <h1 className="sr-only">Reading {A.name}</h1>
      <div className="al-name" aria-hidden="true">{A.name}</div>
      {A.status === 'big' ? (
        <div className="big-warn"><b>This one is huge.</b> GitHub lists {A.meta?.full} at {(A.meta.size / 1024 / 1024).toFixed(1)} GB with its whole history. Bento only downloads the latest version, but that can still take a few minutes and real disk space.<div className="big-acts"><button className="btn" onClick={onBig}>Take it apart anyway</button><span className="muted small">or try a “bite-size” project in Explore</span></div></div>
      ) : A.status === 'error' ? (
        <div className="story-err"><b>Couldn’t open it.</b> {A.error}<div><button className="btn tiny" onClick={onRetry}>Try again</button></div></div>
      ) : (
        <div className="al-steps">
          {steps.map(([k, l], i) => (
            <div key={k} className={`al-step ${i < at ? 'done' : i === at ? 'now' : ''}`}>
              <span className="al-dot">{i < at ? '✓' : ''}</span>{l}
              {i === 0 && at === 0 && A.progress?.pct != null && <span className="al-pct">{A.progress.phase === 'cached' ? 'already here' : `${A.progress.pct}%`}</span>}
              {i === 1 && at >= 1 && counts && <span className="al-pct">{counts.files.toLocaleString()} files · {counts.lines.toLocaleString()} lines · {counts.links.toLocaleString()} imports followed · {counts.outside} outside packages</span>}
            </div>
          ))}
        </div>
      )}
      <div className="al-ghost">{Array.from({ length: 4 }, (_, i) => <div key={i} className="alg-band"><div className="shimmer" style={{ width: 90 }} />{Array.from({ length: 6 + i }, (_, j) => <span key={j} className="alg-peb" style={{ animationDelay: `${(i * 6 + j) * 40}ms` }} />)}</div>)}</div>
    </div>
  );
}

// =====================================================================================================
// Toolbelt: logos first. Pick one to see what it does here, why it was chosen, and what else would work.
export function Toolbelt({ tools, stack, N, narrating, onShowFiles }) {
  const [sel, setSel] = useState(null);
  const [alt, setAlt] = useState(null);
  useEffect(() => { const h = (e) => setSel(e.detail); addEventListener('atlas-tool', h); return () => removeEventListener('atlas-tool', h); }, []);
  const narrStack = N?.stack || {};
  const shop = stack.filter((s) => s.workshop && !s.side);
  const side = stack.filter((s) => s.side);
  const groups = [];
  for (const s of tools) { const g = groups.find((x) => x.cat === s.cat); if (g) g.items.push(s); else groups.push({ cat: s.cat, items: [s] }); }
  const s = tools.find((t) => t.id === sel) || tools[0];
  const n = s && (narrStack[s.id] || Object.values(narrStack).find((x) => x.name?.toLowerCase() === s.name.toLowerCase()));
  const alts = s ? (n?.alts?.length ? n.alts.map((a) => ({ name: a.name, when: a.when, tool: findTool(a.name) })) : (s.alt || []).map((id) => BY_ID[id]).filter(Boolean).map((t) => ({ name: t.name, when: t.when, tool: t }))).slice(0, 4) : [];
  const shownAlt = alts.find((a) => a.name === alt) || null;
  useEffect(() => setAlt(null), [s?.id]);
  return (
    <section className="asec" id="sec-stack">
      <div className="sec-head"><div>
        <div className="kicker">toolbelt</div>
        <h2>What it’s built with</h2>
      </div></div>
      {tools.length === 0 && <p className="muted">No outside tools: it’s built from scratch with the language’s own features.</p>}
      {tools.length > 0 && (
        <div className="belt2">
          <div className="belt-tiles">
            {groups.map((g) => (
              <div key={g.cat} className="tg">
                <div className="tg-h">{CATS[g.cat]?.[0] || g.cat}</div>
                <div className="tg-row">
                  {g.items.map((t) => (
                    <button key={t.id} className={`tile ${s?.id === t.id ? 'on' : ''}`} onClick={() => setSel(t.id)} onMouseEnter={() => setSel(t.id)}>
                      <Brand slug={t.slug} name={t.name} color={t.color} size={46} />
                      <span className="tile-n">{t.name}</span>
                      {t.used?.length > 0 && <span className="tile-use" title={`used in ${t.used.length} files`}>{Array.from({ length: Math.min(6, Math.ceil(Math.log2(t.used.length + 1))) }, (_, i) => <i key={i} />)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {s && (
            <div className="tool-card" key={s.id}>
              <div className="tc-top">
                <Brand slug={s.slug} name={s.name} color={s.color} size={58} />
                <div>
                  <div className="tc-cat">{CATS[s.cat]?.[0]}</div>
                  <div className="tc-name">{s.name}</div>
                  {s.used?.length > 0 && <button className="tool-used" onClick={() => onShowFiles([...s.used, `s:${s.id}`])}>show the {s.used.length} file{s.used.length > 1 ? 's' : ''} that use it →</button>}
                </div>
              </div>
              <div className="tc-what">{n?.role || s.what}</div>
              {n?.why ? <div className="tc-why"><Md text={n.why} /></div> : narrating ? <div className="shimmer" /> : null}
              {alts.length > 0 && (
                <div className="tc-vs">
                  <div className="tc-vs-row">
                    <span className="vs-pick"><Brand slug={s.slug} name={s.name} color={s.color} size={30} /></span>
                    <span className="vs">vs</span>
                    {alts.map((a) => (
                      <button key={a.name} className={`vs-alt ${shownAlt?.name === a.name ? 'on' : ''}`} onMouseEnter={() => setAlt(a.name)} onClick={() => setAlt(a.name)} title={a.name}>
                        <Brand slug={a.tool?.slug} name={a.name} color={a.tool?.color} size={30} />
                        <span>{a.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="tc-when">{shownAlt ? <><b>Pick {shownAlt.name}</b> {/^(when|if)\b/i.test(shownAlt.when || '') ? '' : 'when '}{lc((shownAlt.when || shownAlt.tool?.when || '').replace(/\.$/, ''))}.</> : <span className="muted">Point at an alternative to see when you’d choose it instead.</span>}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {shop.length > 0 && (
        <div className="workshop">
          <span className="mini-h">also in the workshop</span>
          {shop.map((t) => <span key={t.id} className="ws" title={`${t.name}: ${t.what}`}><Brand slug={t.slug} name={t.name} color={t.color} size={20} plain />{t.name}</span>)}
        </div>
      )}
      {side.length > 0 && (
        <div className="workshop">
          <span className="mini-h">only for its docs site and examples</span>
          {side.map((t) => <span key={t.id} className="ws" title={`${t.name}: ${t.what}\nFound in ${t.evidence.join(', ')}`}><Brand slug={t.slug} name={t.name} color={t.color} size={20} plain />{t.name}</span>)}
        </div>
      )}
    </section>
  );
}

// =====================================================================================================
function Language({ langs, totalL, main, N, narrating }) {
  const L = LANGS[main] || {};
  const why = N?.lang?.why || L.why;
  const alts = N?.lang?.alts?.length ? N.lang.alts : (L.alt || []).map((a) => ({ name: a, when: LANGS[a]?.why }));
  return (
    <section className="asec" id="sec-language">
      <div className="sec-head"><div>
        <div className="kicker">language</div>
        <h2>Why it’s written in {main || 'this'}</h2>
      </div></div>
      <div className="lang-wrap">
        <div className="lang-main">
          <Brand slug={L.slug} name={main} color={L.color} size={64} />
          <div>
            <p className="lang-why">{why ? <Md text={why} /> : narrating ? <span className="shimmer" /> : 'The authors’ choice.'}{!N?.lang && narrating && <span className="muted small"> (a general answer for now)</span>}</p>
            {alts.length > 0 && <div className="lang-alts">
              <span className="mini-h">it could have been</span>
              {alts.slice(0, 3).map((a) => (
                <div key={a.name} className="lang-alt"><Brand slug={LANGS[a.name]?.slug} name={a.name} color={LANGS[a.name]?.color} size={22} plain /><b>{a.name}</b><span><Md text={a.when || ''} /></span></div>
              ))}
            </div>}
          </div>
        </div>
        <div className="lang-mix">
          {langs.slice(0, 8).map(([l, n]) => (
            <div key={l} className="lm-row">
              <span className="lm-name"><span className="ldot" style={{ background: langColor(l) }} />{l}</span>
              <span className="lm-bar"><i style={{ width: `${Math.max(1.5, (n / totalL) * 100)}%`, background: langColor(l) }} /></span>
              <span className="lm-n">{fmtN(n)}</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 6 }}>lines of code per language</div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================================================
const HOT_ICON = { bottleneck: ['⏱', 'Slow spot'], fragile: ['⚠', 'Fragile'], complex: ['≋', 'Hard to read'], security: ['⛨', 'Security'], scale: ['⇡', 'Scale'] };
function Hotspots({ hot, role, onOpen, narrating, F, pathIdx }) {
  const maxL = Math.max(100, ...F.files.filter((f) => f.lang).map((f) => f.lines)); const maxU = Math.max(3, ...F.files.map((f) => f.used));
  const kinds = Object.entries(hot.reduce((m, h) => { const k = h.kind || 'fragile'; m[k] = (m[k] || 0) + 1; return m; }, {}));
  return (
    <section className="asec" id="sec-hot">
      <div className="sec-head"><div>
        <div className="kicker">hot spots</div>
        <h2>Where it could hurt</h2>
        <p className="sec-sub">Bottlenecks, fragile spots and things that get hard as it grows. Some are measured, some come from reading the code.</p>
      </div></div>
      {kinds.length > 0 && <div className="hot-sum">{kinds.map(([k, n]) => { const [ic, label] = HOT_ICON[k] || HOT_ICON.fragile; return <span key={k} className={`hs k-${k}`}><i>{ic}</i><b>{n}</b>{label.toLowerCase()}</span>; })}</div>}
      <div className="hots">
        {hot.length === 0 && !narrating && <p className="muted">Nothing stands out. Clean little codebase.</p>}
        {hot.map((h, i) => {
          const [ic, label] = HOT_ICON[h.kind] || HOT_ICON.fragile;
          return (
            <div key={i} className={`hot k-${h.kind || 'fragile'}`}>
              {h.p && pathIdx.has(h.p) ? <MiniBuilding f={F.files[pathIdx.get(h.p)]} maxL={maxL} maxU={maxU} kind={h.kind} /> : <span className="hot-ic">{ic}</span>}
              <div className="hot-main">
                <div className="hot-top"><b>{h.title}</b><span className="hot-kind">{label}</span><span className="hot-src">{h.measured ? 'measured' : 'from reading the code'}</span></div>
                <div className="hot-md"><Md text={h.md} /></div>
                {h.p && <button className="file-chip" onClick={() => onOpen(h.p)}>{h.p}<span>{role(h.p)}</span></button>}
              </div>
            </div>
          );
        })}
        {narrating && <div className="hot ghost"><span className="hot-ic"><span className="lens-spin" /></span><div className="hot-main"><div className="shimmer" style={{ width: '40%' }} /><div className="shimmer short" /></div></div>}
      </div>
    </section>
  );
}

// Squarified treemap: folders are blocks, files are tiles sized by lines of code, coloured by layer.
function squarify(items, x, y, w, h) {
  const out = []; let rest = items.filter((it) => it.v > 0).sort((a, b) => b.v - a.v);
  const total = rest.reduce((s, it) => s + it.v, 0); if (!total) return out;
  const scale = (w * h) / total; rest = rest.map((it) => ({ ...it, a: it.v * scale }));
  const worst = (row, side) => { const sum = row.reduce((s, r) => s + r.a, 0); const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(w, h); let row = [rest[0]]; let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    rest = rest.slice(i);
    const sum = row.reduce((s, r) => s + r.a, 0);
    if (w >= h) { const rw = sum / h; let yy = y; for (const r of row) { const rh = r.a / rw; out.push({ ...r, x, y: yy, w: rw, h: rh }); yy += rh; } x += rw; w -= rw; }
    else { const rh = sum / w; let xx = x; for (const r of row) { const rw = r.a / rh; out.push({ ...r, x: xx, y, w: rw, h: rh }); xx += rw; } y += rh; h -= rh; }
  }
  return out;
}
function FileMap({ files, role, onOpen }) {
  const box = useRef(null); const [W, setW] = useState(900); const [hov, setHov] = useState(null);
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const H = Math.round(Math.min(560, Math.max(320, W * 0.48)));
  const code = files.filter((f) => f.lines > 0);
  const groups = new Map();
  for (const f of code) { const d = f.p.includes('/') ? f.p.split('/').slice(0, f.p.split('/').length > 2 ? 2 : 1).join('/') : '·'; if (!groups.has(d)) groups.set(d, []); groups.get(d).push(f); }
  const blocks = squarify([...groups].map(([d, fs]) => ({ d, fs, v: fs.reduce((s, f) => s + f.lines, 0) })), 0, 0, W, H);
  return (
    <div className="fmap" ref={box} style={{ height: H }}>
      {blocks.map((b) => {
        const pad = 3, head = b.h > 46 && b.w > 70 ? 18 : 0;
        const tiles = squarify(b.fs.map((f) => ({ f, v: f.lines })), b.x + pad, b.y + pad + head, Math.max(0, b.w - pad * 2), Math.max(0, b.h - pad * 2 - head));
        return (
          <div key={b.d} className="fm-block" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
            {head > 0 && <span className="fm-dir">{b.d === '·' ? 'top level' : b.d}/</span>}
            {tiles.map((t) => (
              <button key={t.f.p} className={`fm-tile ${hov === t.f.p ? 'on' : ''}`} style={{ left: t.x - b.x, top: t.y - b.y, width: Math.max(0, t.w - 2), height: Math.max(0, t.h - 2), '--c': LAYER[t.f.layer][3] }}
                onMouseEnter={() => setHov(t.f.p)} onMouseLeave={() => setHov(null)} onClick={() => onOpen(t.f.p)} title={`${t.f.p}\n${role(t.f.p)}\n${t.f.lines} lines`}>
                {t.w > 64 && t.h > 22 && <span className="fm-n">{t.f.p.split('/').pop()}</span>}
                {t.w > 110 && t.h > 44 && <span className="fm-r">{role(t.f.p)}</span>}
              </button>
            ))}
          </div>
        );
      })}
      <div className="fm-legend">{LAYERS.map(([k, n, , c]) => <span key={k}><i style={{ background: c }} />{n}</span>)}<span className="muted">· bigger = more code</span></div>
    </div>
  );
}

// A file as one little building: height = lines, the beacon = how many files depend on it.
function MiniBuilding({ f, maxL, maxU, kind }) {
  const h = 10 + 34 * Math.sqrt(Math.min(1, f.lines / maxL)); const u = f.used / maxU;
  const c = kind === 'complex' ? 'var(--violet)' : kind === 'scale' ? 'var(--accent)' : kind === 'bottleneck' ? 'var(--butter)' : 'var(--rose)';
  return (
    <span className="mini-b" title={`${f.lines} lines · used by ${f.used} files`}>
      <svg viewBox="0 0 46 64" width="46" height="64">
        <ellipse cx="23" cy="58" rx={16 + u * 6} ry={4 + u * 2} fill={c} opacity={0.12 + u * 0.3} />
        <path d={`M12 ${56} L23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} L12 ${56 - h} Z`} fill={`color-mix(in srgb, ${c} 25%, var(--bsid))`} />
        <path d={`M23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} Z`} fill={`color-mix(in srgb, ${c} 40%, var(--bsid))`} />
        <path d={`M12 ${56 - h} L23 ${52 - h} L34 ${56 - h} L23 ${60 - h} Z`} fill={langColor(f.lang)} />
        {f.used > 2 && <><line x1="23" y1={56 - h} x2="23" y2={46 - h} stroke={c} strokeWidth="1.6" /><circle cx="23" cy={45 - h} r="2.8" fill={c} /></>}
      </svg>
      <span className="mb-n">{f.lines}<i>lines</i></span>
    </span>
  );
}

// =====================================================================================================
function FileList({ F, role, onOpen }) {
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('all');
  const [open, setOpen] = useState({});
  const [mode, setMode] = useState('map');
  useEffect(() => { const h = (e) => { setLayer(e.detail); setMode('map'); setQ(''); }; addEventListener('atlas-layer', h); return () => removeEventListener('atlas-layer', h); }, []);
  const files = F.files.filter((f) => (layer === 'all' || f.layer === layer) && (!q || f.p.toLowerCase().includes(q.toLowerCase()) || role(f.p).toLowerCase().includes(q.toLowerCase())));
  const dirs = new Map();
  for (const f of files) { const d = f.p.includes('/') ? f.p.slice(0, f.p.lastIndexOf('/')) : ''; if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); }
  const sorted = [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const many = sorted.length > 14 && !q;
  return (
    <section className="asec" id="sec-files">
      <div className="sec-head"><div>
        <div className="kicker">files</div>
        <h2>Every file, in plain words</h2>
      </div>
      <div className="sec-tools">
        <div className="seg small"><button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')}>Map</button><button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>List</button></div>
        <input className="fl-q" placeholder="Find a file or a job…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div></div>
      <div className="fl-layers">
        {[['all', 'All'], ...LAYERS.map((l) => [l[0], l[1]])].map(([k, l]) => <button key={k} className={`chip ${layer === k ? 'on' : ''}`} onClick={() => setLayer(k)}>{k !== 'all' && <span className="ldot" style={{ background: LAYER[k][3] }} />}{l}</button>)}
      </div>
      {mode === 'map' ? <FileMap files={files} role={role} onOpen={onOpen} /> : (
      <div className="fl">
        {sorted.map(([d, fs]) => {
          const isOpen = !many || open[d] || fs.length <= 3;
          return (
            <div key={d} className="fl-dir">
              <button className="fl-dname" onClick={() => setOpen({ ...open, [d]: !isOpen })}><span className="caret2">{isOpen ? '▾' : '▸'}</span>{d || 'top level'}/<span className="muted"> {fs.length}</span></button>
              {isOpen && fs.map((f) => (
                <button key={f.p} className="fl-f" onClick={() => onOpen(f.p)}>
                  <span className="ldot" style={{ background: LAYER[f.layer][3] }} />
                  <span className="fl-n">{f.p.split('/').pop()}</span>
                  <span className="fl-r">{role(f.p)}</span>
                  <span className="fl-l">{f.lines ? f.lines.toLocaleString() : ''}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

// =====================================================================================================
// Code detective: read the top of a real file and guess its job. Reading code is a skill; this makes it a game.
const LEAD = /^\s*(\/\*|\*|\/\/|#(?!include|!|\[)|"""|'''|<!--|-->|$)/;
function Detective({ F, N, readFile, onOpen }) {
  const pool = useMemo(() => {
    const roles = N?.roles || {}; const idx = new Map(F.files.map((f, i) => [f.p, f]));
    return Object.entries(roles).filter(([p, r]) => r && idx.get(p)?.lines >= 12 && idx.get(p)?.lang && idx.get(p).layer !== 'support').map(([p, r]) => ({ p, r, layer: idx.get(p).layer }));
  }, [F, N]);
  const [game, setGame] = useState(null); // { rounds: [...], i, score, picked, code }
  const deal = async () => {
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    const rounds = pick.map((x) => { const others = pool.filter((y) => y.p !== x.p && y.r !== x.r).sort((a, b) => (a.layer === x.layer) - (b.layer === x.layer) || Math.random() - 0.5).slice(0, 2); return { ...x, opts: [x.r, ...others.map((o) => o.r)].sort(() => Math.random() - 0.5) }; });
    setGame({ rounds, i: 0, score: 0, picked: null, code: null }); load(rounds[0]);
  };
  const load = async (R) => {
    let t = ''; try { t = await readFile(R.p); } catch {}
    const lines = t.split('\n'); let k = 0; while (k < lines.length && k < 60 && LEAD.test(lines[k])) k++;
    const code = lines.slice(k).filter((l, j, a) => !(l.trim() === '' && a[j - 1]?.trim() === '')).slice(0, 18).join('\n');
    setGame((g) => (g && g.rounds.includes(R) ? { ...g, code } : g));
  };
  if (pool.length < 4) return null;
  if (!game) return (
    <div className="detective intro">
      <div className="dt-badge">🕵</div>
      <div><b>Code detective</b><span>Read the top of a real file from this project and guess what it does. Five files, about two minutes.</span></div>
      <button className="btn" onClick={deal}>Play</button>
    </div>
  );
  const R = game.rounds[game.i]; const done = game.i >= game.rounds.length;
  if (done) return (
    <div className="detective intro">
      <div className="dt-badge">{game.score >= 4 ? '🏆' : game.score >= 2 ? '🔍' : '🌱'}</div>
      <div><b>{game.score} of {game.rounds.length} files solved</b><span>{game.score >= 4 ? 'You read code like a pro.' : game.score >= 2 ? 'Good eye. Names, imports and the first function give most of it away.' : 'Tip: look at what a file imports and the name of its first function.'}</span></div>
      <button className="btn" onClick={deal}>Play again</button>
    </div>
  );
  const right = game.picked != null && game.picked === R.r;
  return (
    <div className="detective">
      <div className="dt-top"><span className="mini-h">code detective · {game.i + 1} of {game.rounds.length}</span><span className="dt-score">{'★'.repeat(game.score)}<i>{'☆'.repeat(game.rounds.length - game.score)}</i></span></div>
      <div className="dt-body">
        <pre className="dt-code">{game.code == null ? '…' : game.code || '(empty file)'}</pre>
        <div className="dt-q">
          <b>What does this file do?</b>
          {R.opts.map((o) => <button key={o} disabled={game.picked != null} className={`dt-opt ${game.picked != null && o === R.r ? 'ok' : ''} ${game.picked === o && o !== R.r ? 'no' : ''}`} onClick={() => setGame({ ...game, picked: o, score: game.score + (o === R.r ? 1 : 0) })}>{o}</button>)}
          {game.picked != null && (
            <div className="dt-reveal">
              <span>{right ? '✓ Right!' : '✗ Not quite.'} It’s <code>{R.p}</code></span>
              <div><button className="link" onClick={() => onOpen(R.p)}>Open the file</button><button className="btn tiny" onClick={() => { const n = game.i + 1; setGame({ ...game, i: n, picked: null, code: null }); if (n < game.rounds.length) load(game.rounds[n]); }}>{game.i + 1 < game.rounds.length ? 'Next file →' : 'See my score'}</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Study({ F, readFile, onOpen, A, N, onAsk, onFeature, narrating, tour = [], role, onTour }) {
  const [feat, setFeat] = useState('');
  const qs = N?.learn?.length ? N.learn : ['Where does this app start?', 'How does data flow through it?', 'Which file should I read first?'];
  return (
    <section className="asec" id="sec-study">
      <div className="sec-head"><div>
        <div className="kicker">study it</div>
        <h2>Go deeper</h2>
        <p className="sec-sub">Each question opens a lesson built on the real files, with the code on the right.</p>
      </div></div>
      {tour.length > 0 && (
        <div className="tour">
          <div className="tour-h"><span className="mini-h">read it in this order</span><button className="btn" onClick={() => onTour(0)}>Start the tour →</button></div>
          <ol>{tour.map((t, i) => <li key={t.p}><button onClick={() => onTour(i)}><span className="tour-n">{i + 1}</span><span className="tour-p">{t.p}</span><span className="tour-w">{t.why}</span></button></li>)}</ol>
        </div>
      )}
      {!narrating && readFile && <Detective F={F} N={N} readFile={readFile} onOpen={onOpen} />}
      <div className="study">
        <div className="nexts">{qs.map((q, i) => <button key={i} className="next" onClick={() => onAsk(q)}>{q}<span>→</span></button>)}{narrating && !N?.learn?.length && <div className="muted small" style={{ marginTop: 8 }}>Better questions arrive when the reading is done.</div>}</div>
        <form className="cv-feature" onSubmit={(e) => { e.preventDefault(); if (feat.trim()) { onFeature(feat.trim()); setFeat(''); } }}>
          <span className="cv-fi">⌁</span>
          <input value={feat} onChange={(e) => setFeat(e.target.value)} placeholder={`Build a feature in ${A.name.split('/').pop()}: “add a dark mode toggle”…`} />
          <button className="btn" disabled={!feat.trim()}>Show me how</button>
        </form>
      </div>
    </section>
  );
}

// Why you're here: you asked about a real project, and this is its real code (found on your Mac or on GitHub)
const asIcon = (asked, A) => asked.d?.pick?.app?.icon || A.meta?.avatar || (asked.d?.pick?.full ? `https://avatars.githubusercontent.com/${asked.d.pick.full.split('/')[0]}?size=96` : null);
function AskedBanner({ asked, A, onIdeaInstead, onClose, waiting }) {
  const pick = asked.d?.pick || {}; const icon = asIcon(asked, A);
  const home = (p) => String(p || '').replace(/^\/Users\/[^/]+/, '~');
  return (
    <div className={`asked fade-in ${waiting ? 'waiting' : ''}`} role="status">
      {icon ? <img className="asked-ic" src={icon} alt="" /> : <span className="asked-ic ph" aria-hidden="true">?</span>}
      <div className="asked-t">
        <b>“{asked.q.length > 90 ? asked.q.slice(0, 90) + '…' : asked.q}”</b>
        <span className="asked-why">
          {pick.app && <span className="aw-chip mac">✓ {pick.app.app}{pick.app.version ? ` ${pick.app.version}` : ''} {t('is on this Mac')}</span>}
          {pick.local && <span className="aw-chip mac">✓ {t('your copy')} · {home(pick.local.root)}</span>}
          {asked.d?.why === 'recent' && <span className="aw-chip mac">↩ {t('you were just reading it')}</span>}
          {asked.d?.why === 'named' && <span className="aw-chip mac">↩ {t('you opened it before')}</span>}
          {pick.full && <span className="aw-chip">{pick.full}{pick.stars ? ` · ★ ${fmtN(pick.stars)}` : ''}</span>}
          <span className="aw-say">{waiting ? t('Answering from its real code as soon as it’s in…') : t('Here’s its real code. Your answer is in the box below; ask follow-ups there.')}</span>
        </span>
      </div>
      <button className="link" onClick={() => onIdeaInstead?.(asked.q)}>{t('Just the idea instead')}</button>
      {onClose && <button className="ib" aria-label={t('Close')} onClick={onClose}>✕</button>}
    </div>
  );
}

// Ask about the repo and keep talking: quick answers from the real files (a few seconds), each one remembered,
// so follow-ups make sense. File names are buttons. ⌘↵ turns any question into a full lesson.
const askedOnce = new Set();
const okPath = (f) => typeof f === 'string' && /^[\w@.\-+/ ]+$/.test(f) && !f.includes('..') && /\.[a-z0-9]+$/i.test(f);
const DO = /^(?:(?:can|could) you |please |let'?s |lets |i want to |help me )?(?:build|make|add|create|write|implement|change|modify|refactor|extend|port|clone|recreate|rebuild|fix)\b/i;
// each project's conversation is kept (last 8 questions), so it's still there when you come back
const THREADS = 'bento.atlasThreads';
const loadThread = (k) => { try { return (JSON.parse(localStorage.getItem(THREADS) || '{}')[k] || []).filter((x) => !x.loading); } catch { return []; } };
const saveThread = (k, th) => { try { const all = JSON.parse(localStorage.getItem(THREADS) || '{}'); const keep = th.filter((x) => !x.loading).slice(-8); if (!keep.length && !all[k]) return; all[k] = keep; const keys = Object.keys(all); if (keys.length > 30) delete all[keys[0]]; save(THREADS, all); } catch {} }; // also mirrored to disk
function AskBar({ name, threadKey, onAsk, onQuick, onOpen, pathIdx, initial, onFeature }) {
  const [v, setV] = useState('');
  const [thread, setThread] = useState(() => loadThread(threadKey)); // [{ id, q, loading, a, files }]
  useEffect(() => { saveThread(threadKey, thread); }, [thread, threadKey]);
  // browser storage can lose the last writes if the app is closed abruptly; the copy on disk fills in
  useEffect(() => { if (thread.length) return; window.bento?.storeGet?.().then((d) => { const th = (d?.[THREADS]?.[threadKey] || []).filter((x) => !x.loading); if (th.length) setThread((cur) => (cur.length ? cur : th)); }).catch(() => {}); }, [threadKey]);
  const [opened, setOpened] = useState(null); // an earlier answer you reopened (the latest one is always open)
  const list = useRef(null); const inp = useRef(null);
  const ask = async (q, full) => {
    q = String(q || '').trim(); if (!q) return;
    if (full || !onQuick) return onAsk(q);
    const id = Date.now() + Math.random();
    const history = thread.filter((x) => !x.loading && x.a).map(({ q: hq, a }) => ({ q: hq, a }));
    setThread((th) => [...th.slice(-7), { id, q, loading: true }]);
    let r; try { r = await onQuick(q, history); } catch { r = { a: `That didn’t work. Try again, or press ${keys('⌘↵')} for a full lesson.`, files: [] }; }
    setThread((th) => th.map((x) => (x.id === id ? { ...x, loading: false, ...r } : x)));
  };
  const submit = (full) => { const q = v.trim(); if (!q) return; setV(''); ask(q, full); };
  // the question you came with is asked for you, once, as soon as the code is here
  useEffect(() => { if (initial?.q && !askedOnce.has(initial.at)) { askedOnce.add(initial.at); ask(initial.q, false); } }, [initial?.at]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [thread]);
  const busy = thread.some((x) => x.loading);
  const [min, setMin] = useState(false);
  useEffect(() => { if (busy) setMin(false); }, [busy]);
  const form = (
    <form className="fu" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <span className="ask-ic" aria-hidden="true">?</span>
      <input id="atlas-ask" ref={inp} value={v} onChange={(e) => setV(e.target.value)} aria-busy={busy || undefined}
        placeholder={thread.length ? t('Ask a follow-up…') : `Ask anything about ${name}…`} aria-label={thread.length ? t('Ask a follow-up') : `Ask anything about ${name}`}
        onKeyDown={(e) => { if (e.key === 'Enter' && mod(e)) { e.preventDefault(); submit(true); } }} />
      <kbd aria-hidden="true">↵</kbd>
    </form>
  );
  // a conversation sits beside the code (the page makes room), so you can read and ask at the same time
  if (thread.length && min) return <div className="atlas-ask"><button className="aq-pill" onClick={() => { setMin(false); setTimeout(() => inp.current?.focus(), 50); }}>💬 {t('Your conversation')} · {thread.length}</button></div>;
  if (!thread.length) return <div className="atlas-ask">{form}</div>;
  return (
    <div className="atlas-ask docked">
      <aside className="aq-dock" aria-label={`${t('Conversation about')} ${name}`}>
        <div className="aq-dock-h"><span className="mini-h">{t('asking about')} <b>{name}</b></span>
          <button className="ib" aria-label={t('Make it small')} title={t('Make it small')} onClick={() => setMin(true)}>–</button>
          <button className="ib" aria-label={t('Close the conversation')} title={t('Clear the conversation')} onClick={() => setThread([])}>✕</button></div>
        <div className="aq-thread" ref={list} aria-live="polite">
          {thread.map((x, i) => i < thread.length - 1 && opened !== x.id ? (
            <button key={x.id} className="aq-turn aq-folded" onClick={() => setOpened(x.id)} aria-expanded="false"><span className="aq-q">{x.q}</span><span aria-hidden="true">▸</span></button>
          ) : (
            <div key={x.id} className="aq-turn">
              <div className="aq-q">{x.q}{i < thread.length - 1 && <button className="link" onClick={() => setOpened(null)}>{t('fold')}</button>}</div>
              {x.loading ? <div className="writing"><span className="dots"><i /><i /><i /></span>{t('Reading the code…')}</div> : (
                <>
                  <div className="aq-a"><Md text={x.a} /></div>
                  {x.files?.filter(okPath).length > 0 && <div className="aq-files">{x.files.filter(okPath).map((f) => <button key={f} className="file-chip" title={f} aria-label={`Open ${f}`} onClick={() => onOpen(f)}>{f.split('/').length > 2 ? `…/${f.split('/').slice(-2).join('/')}` : f}</button>)}</div>}
                  {onFeature && DO.test(x.q) ? <button className="btn tiny aq-do" onClick={() => onFeature(x.q)}>✦ {t('Build it with me, step by step')} →</button> : null}
                  <button className="qa-more" onClick={() => onAsk(x.q)}>{t('Turn this into a full lesson with the code')} →</button>
                </>
              )}
            </div>
          ))}
        </div>
        {form}
      </aside>
    </div>
  );
}

// Ripple: change this file, and who could feel it? Rings = how many hops away (direct users, their users, …).
const revCache = new WeakMap();
function reverseOf(F) {
  let r = revCache.get(F); if (r) return r;
  r = F.files.map(() => []); F.files.forEach((g, j) => g.imp.forEach((i) => r[i]?.push(j)));
  revCache.set(F, r); return r;
}
function Ripple({ F, idx, onOpen }) {
  const [hov, setHov] = useState(null);
  const rings = useMemo(() => {
    const rev = reverseOf(F); const seen = new Set([idx]); const out = []; let front = [idx];
    for (let d = 0; d < 3 && front.length; d++) {
      const next = []; for (const i of front) for (const j of rev[i]) if (!seen.has(j)) { seen.add(j); next.push(j); }
      if (next.length) out.push(next); front = next;
    }
    if (front.length) { let more = 0; const q = [...front]; while (q.length) { const i = q.pop(); for (const j of rev[i]) if (!seen.has(j)) { seen.add(j); more++; q.push(j); } } if (more) out.more = more; }
    return out;
  }, [F, idx]);
  const total = rings.reduce((a, r) => a + r.length, 0) + (rings.more || 0);
  if (!total) return null;
  const pct = Math.max(1, Math.round((total / F.files.length) * 100));
  const W = 260, C = W / 2, R = [44, 78, 112];
  return (
    <div className="ripple">
      <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} aria-hidden="true">
        {rings.map((_, d) => <circle key={d} cx={C} cy={C} r={R[d]} className="rp-ring" style={{ animationDelay: `${d * 0.25}s` }} />)}
        {rings.map((ring, d) => ring.slice(0, Math.floor(R[d] / 1.6)).map((j, k, arr) => { const dr = Math.max(2.2, Math.min(5.5, ((Math.PI * R[d]) / arr.length) * 0.55));
          const a = (k / arr.length) * Math.PI * 2 - Math.PI / 2 + d * 0.4; const g = F.files[j];
          return <circle key={j} cx={C + Math.cos(a) * R[d]} cy={C + Math.sin(a) * R[d]} r={hov === j ? dr + 2.5 : dr} fill={LAYER[g.layer]?.[3] || 'var(--ink-3)'} className="rp-dot" style={{ animationDelay: `${0.15 + d * 0.25 + k * 0.01}s` }}
            onMouseEnter={() => setHov(j)} onMouseLeave={() => setHov(null)} onClick={() => onOpen(g.p)} />;
        }))}
        <circle cx={C} cy={C} r={13} className="rp-core" />
      </svg>
      <div className="rp-text">
        <div className="mini-h">if this file changes</div>
        <div className="rp-big"><b>{total}</b> file{total === 1 ? '' : 's'} could feel it</div>
        <div className="rp-sub">{hov != null ? <><b>{displayName(F.files[hov].p)}</b> · {F.files[hov].p}</> : <>That’s {pct}% of the project. {rings.map((r, d) => <span key={d} className="rp-hop">{d === 0 ? 'use it directly' : `${d + 1} steps away`}: <b>{r.length}{d === rings.length - 1 && rings.more ? `+${rings.more}` : ''}</b></span>)}</>}</div>
        <div className="rp-term">The word for this is <b>coupling</b>. The ring of files a change can reach is its <b>blast radius</b>. {total / F.files.length > 0.25 ? 'This one is wide, so change it carefully and test a lot.' : 'This one is contained, so it’s fairly safe to change.'}</div>
      </div>
    </div>
  );
}

// =====================================================================================================
const EXT_LANG = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', rb: 'Ruby', java: 'Java', kt: 'Kotlin', swift: 'Swift', c: 'C', cpp: 'C++', cs: 'C#', php: 'PHP', vue: 'Vue', svelte: 'Svelte', css: 'CSS', html: 'HTML', sql: 'SQL', sh: 'Shell' };
function Drawer({ onOthers, tour, p, F, pathIdx, role, stack, onClose, onOpen, readFile, onExplain, onAsk }) {
  const [text, setText] = useState(null);
  // a file outside the analysed sample: what we know from its name and its text
  const f = F.files[pathIdx.get(p)] || { p, lang: EXT_LANG[(/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase()] || null, lines: text ? text.split('\n').length : 0, layer: Object.keys(LAYER).includes('logic') ? 'logic' : Object.keys(LAYER)[0], imp: [], ext: [], used: 0 };
  const [q, setQ] = useState('');
  const [others, setOthers] = useState(null);
  useEffect(() => { let on = true; setText(null); readFile(p).then((t) => on && setText(t)).catch((e) => on && setText(`// ${e.message}`)); return () => { on = false; }; }, [p]);
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  if (!f) return null;
  const idx = pathIdx.get(p);
  const usedBy = F.files.filter((g) => g.imp.includes(idx));
  const uses = f.imp.map((j) => F.files[j]);
  const tools = stack.filter((s) => s.used.includes(idx));
  const [, lname, , lcolor] = LAYER[f.layer];
  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer" aria-label="File">
        <div className="dr-top">
          <span className="dr-layer" style={{ '--c': lcolor }}>{lname}</span>
          {f.entry && <span className="dr-layer" style={{ '--c': 'var(--mint)' }}>starts here</span>}
          <button className="ib dr-x" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {tour && (
          <div className="dr-tour">
            <span className="tour-n">{tour.i + 1}</span>
            <div><div className="mini-h" style={{ margin: 0 }}>reading tour · {tour.i + 1} of {tour.steps.length}</div><div className="dr-tour-w">{tour.steps[tour.i]?.why}</div></div>
            <button className="ib" disabled={tour.i === 0} onClick={() => tour.go(tour.i - 1)}>◀</button>
            <button className="btn tiny" onClick={() => tour.go(tour.i + 1)}>{tour.i + 1 < tour.steps.length ? 'Next file →' : 'Finish ✓'}</button>
          </div>
        )}
        <div className="dr-path">{p}</div>
        <h3 className="dr-role">{role(p)}</h3>
        <div className="dr-meta">{f.lang && <><span className="ldot" style={{ background: langColor(f.lang) }} />{f.lang} · </>}{f.lines.toLocaleString()} lines{f.used ? ` · ${f.used} files use it` : ''}</div>
        <div className="dr-actions">
          <button className="btn" disabled={!text} onClick={() => onExplain(p, text)}>Explain it line by line</button>
          {onOthers && f.lang && <button className="btn ghost" disabled={!text || others === 'busy'} onClick={async () => { setOthers('busy'); try { await onOthers(p, text); setOthers(null); } catch (e) { setOthers(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } }}>{others === 'busy' ? 'Searching GitHub…' : 'How do others write this?'}</button>}
        </div>
        {others && others !== 'busy' && <div className="dr-note">{others}</div>}
        {(uses.length > 0 || usedBy.length > 0 || tools.length > 0) && (
          <div className="dr-rel">
            {uses.length > 0 && <div><div className="mini-h">it uses</div>{uses.slice(0, 12).map((g) => <button key={g.p} className="rel" onClick={() => onOpen(g.p)}><span className="arrow out">→</span>{displayName(g.p)}<span className="muted">{role(g.p)}</span></button>)}</div>}
            {usedBy.length > 0 && <div><div className="mini-h">used by</div>{usedBy.slice(0, 12).map((g) => <button key={g.p} className="rel" onClick={() => onOpen(g.p)}><span className="arrow in">←</span>{displayName(g.p)}<span className="muted">{role(g.p)}</span></button>)}{usedBy.length > 12 && <div className="muted small">and {usedBy.length - 12} more</div>}</div>}
            {tools.length > 0 && <div><div className="mini-h">outside help</div><div className="dr-tools">{tools.map((s) => <span key={s.id} className="ws"><Brand slug={s.slug} name={s.name} color={s.color} size={18} plain />{s.name}</span>)}</div></div>}
          </div>
        )}
        {idx != null && <Ripple F={F} idx={idx} onOpen={onOpen} />}
        <div className="dr-code">
          {text == null ? <div className="pad"><div className="shimmer" /><div className="shimmer short" /></div> : <Editor value={text.length > 60000 ? text.slice(0, 60000) + '\n// …' : text} lang={edLang(f.lang)} readOnly lens="code" />}
        </div>
        <form className="dr-ask" onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim(), p); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this file…" />
        </form>
      </aside>
    </>
  );
}
