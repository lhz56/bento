import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grow from './Grow.jsx';
import Contribute from './Contribute.jsx';
import { CATS, BY_ID, CATALOG, LANGS } from '../atlas/catalog.js';
import {
  LAYERS,
  LAYER,
  detectStack,
  displayName,
  setDupes,
  guessRole,
  measuredHotspots,
  langColor,
  fmtN,
} from '../atlas/analyze.js';
import Brand from './Brand.jsx';
import Editor from './Editor.jsx';
import City from './City.jsx';
import BigPicture, { fallbackFlow } from './BigPicture.jsx';
import { Md } from './Story.jsx';
import { keys, mod } from '../platform.js';
import { t } from '../i18n.js';
import { save } from '../store.js';
import { useNarrow } from './Phone.jsx';
import PhoneAtlas, { PHONE_SECTIONS, onTop } from './AtlasPhone.jsx';

const SECTIONS = [
  ['overview', 'Overview'],
  ['anatomy', 'Anatomy'],
  ['grow', 'Growth'],
  ['stack', 'Toolbelt'],
  ['language', 'Language'],
  ['hot', 'Hot spots'],
  ['files', 'Files'],
  ['study', 'Study it'],
  ['help', 'Help out'],
];
const edLang = (l) =>
  l === 'Python' ? 'python' : l === 'TypeScript' ? 'typescript' : 'javascript';
const ago = (d) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d)) / 1000;
  const u = [
    [31536000, 'year'],
    [2592000, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ].find((x) => s >= x[0]);
  if (!u) return 'just now';
  const count = Math.floor(s / u[0]);
  return `${count} ${u[1]}${count > 1 ? 's' : ''} ago`;
};
const lc = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const byName = Object.fromEntries(CATALOG.map((e) => [e.name.toLowerCase(), e]));
const findTool = (name) => {
  const norm = String(name).toLowerCase().trim();
  return (
    byName[norm] ||
    BY_ID[norm] ||
    CATALOG.find((e) => e.name.toLowerCase() === norm.split(/\s*[(/]/)[0].trim())
  );
};

export function mergeTools(stack, narrStack = {}) {
  const main = stack.filter((s) => !s.workshop);
  const extra = Object.values(narrStack)
    .filter(
      (x) =>
        x.name &&
        !stack.some((s) => s.id === x.id || s.name.toLowerCase() === x.name.toLowerCase()),
    )
    .map((x) => {
      const tool = findTool(x.name);
      return {
        ...(tool || {}),
        id: x.id || x.name,
        name: x.name,
        cat: x.cat || tool?.cat || 'frame',
        slug: tool?.slug,
        what: tool?.what || x.role,
        alt: tool?.alt || [],
        used: [],
        evidence: ['spotted by reading the code'],
        added: true,
      };
    });
  return [...main, ...extra];
}

export default function Atlas({
  asked,
  onAskedDone,
  onIdeaInstead,
  onPlanIssue,
  onMakePath,
  atlas,
  onStopReading,
  onBig,
  onOthers,
  onQuick,
  initialFile,
  onInitialFileShown,
  onBuild,
  onCompare,
  onAsk,
  onExplainFile,
  onFeature,
  readFile,
  onRefresh,
  onFork,
  onOpenUrl,
  onRetry,
  modelLabel,
}) {
  const facts = atlas.facts;
  const narration = atlas.narr;
  const meta = atlas.meta || {};
  const scroller = useRef(null);
  const [drawer, setDrawer] = useState(null);
  const [tourAt, setTourAt] = useState(null);
  const [section, setSection] = useState('overview');
  const [forkState, setForkState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [acts, setActs] = useState(false); // on a phone, the project's actions open from ⋯ (where that ⋯ is, to open beside it)
  const openActs = (e) =>
    setActs((o) => (o ? false : e?.currentTarget?.getBoundingClientRect?.() || true));
  const phone = useNarrow(); // a phone (or a narrow window): the Atlas as a phone page (AtlasPhone.jsx)

  const stack = useMemo(() => {
    if (facts) setDupes(facts.files);
    return facts ? detectStack(facts) : [];
  }, [facts]);
  const tools = useMemo(() => mergeTools(stack, narration?.stack), [stack, narration?.stack]);
  const pathIdx = useMemo(() => new Map((facts?.files || []).map((f, i) => [f.p, i])), [facts]);
  const hot = useMemo(
    () =>
      facts
        ? [
            ...(narration?.hot || []),
            ...measuredHotspots(facts).filter(
              (m) => !(narration?.hot || []).some((h) => h.p && h.p === m.p),
            ),
          ]
        : [],
    [facts, narration?.hot],
  );
  const role = (p) =>
    narration?.roles?.[p] ||
    (facts && pathIdx.has(p) ? guessRole(facts.files[pathIdx.get(p)]) : '');
  // any file in the project can open, even ones the big-project sampling didn't analyse (answers can point at them)
  const openFile = (p) => {
    if (
      pathIdx.has(p) ||
      (atlas.src?.root && typeof p === 'string' && /^[\w@.\-+/ ]+$/.test(p) && !p.includes('..'))
    )
      setDrawer(p);
  };
  useEffect(() => {
    if (initialFile && facts && pathIdx.has(initialFile)) {
      setDrawer(initialFile);
      onInitialFileShown?.();
    }
  }, [initialFile, facts]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (Date.now() < goingTo.current) return;
        const v = es
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) setSection(v.target.id.replace('sec-', ''));
      },
      { root: el, rootMargin: '-80px 0px -60% 0px' },
    );
    el.querySelectorAll('.asec').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [facts, phone]);
  // (on a phone: a tool's alternatives)
  const altsOf = (s) => {
    const n =
      narration?.stack?.[s.id] ||
      Object.values(narration?.stack || {}).find(
        (x) => x.name?.toLowerCase() === s.name.toLowerCase(),
      );
    return (
      n?.alts?.length
        ? n.alts.map((a) => ({ name: a.name, when: a.when, tool: findTool(a.name) }))
        : (s.alt || [])
            .map((id) => BY_ID[id])
            .filter(Boolean)
            .map((t) => ({ name: t.name, when: t.when, tool: t }))
    ).slice(0, 4);
  };
  // a section picked from the bar: it stays the one lit while the page glides there (not each one it passes)
  const goingTo = useRef(0);
  const go = (id) => {
    const el = scroller.current?.querySelector(`#sec-${id}`);
    if (!el) return;
    goingTo.current = Date.now() + 900;
    setSection(id);
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    const h = () => setTimeout(() => go('files'), 30);
    addEventListener('atlas-layer', h);
    return () => removeEventListener('atlas-layer', h);
  }, []);

  const narrating = atlas.status === 'narrating';
  const gist = narration?.gist;
  const langs = facts
    ? Object.entries(facts.langs)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
    : [];
  const totalL = langs.reduce((s, [, n]) => s + n, 0) || 1;
  const mainLang =
    narration?.lang?.name && LANGS[narration.lang.name]
      ? narration.lang.name
      : langs.find(([l]) => !['HTML', 'CSS', 'Shell', 'SQL'].includes(l))?.[0] || langs[0]?.[0];

  // a fresh download keeps the three steps on screen long enough to read; reopening a saved project stays instant
  const shownAt = useRef(Date.now());
  const worked = useRef(false);
  if (atlas.status === 'reading' || (atlas.progress && atlas.progress.phase !== 'cached'))
    worked.current = true;
  const [hold, setHold] = useState(!facts);
  // once the project is on screen it stays there: a featured one shows at once and its code downloads afterwards,
  // and that download's progress used to bring the steps back over it for a second
  const shown = useRef(false);
  const holding = !shown.current && hold && (!facts || worked.current);
  if (facts && !holding) shown.current = true;
  useEffect(() => {
    if (!facts || !holding) return;
    const timer = setTimeout(
      () => setHold(false),
      Math.max(1100, 1800 - (Date.now() - shownAt.current)),
    );
    return () => clearTimeout(timer);
  }, [facts, holding]);

  // more sections than fit? fade the edge you can scroll towards, and keep the one you picked in view
  const navRef = useRef(null);
  const [navMore, setNavMore] = useState('');
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const upd = () => {
      const over = nav.scrollWidth - nav.clientWidth > 4;
      setNavMore(
        !over
          ? ''
          : [
              nav.scrollLeft > 4 && 'more-l',
              nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4 && 'more-r',
            ]
              .filter(Boolean)
              .join(' '),
      );
    };
    upd();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null;
    ro?.observe(nav);
    nav.addEventListener('scroll', upd, { passive: true });
    return () => {
      ro?.disconnect();
      nav.removeEventListener('scroll', upd);
    };
  }, [holding]); // the bar only exists once the project has loaded
  // keep the lit section in view in the bar, by moving the bar only (scrolling anything else would stop the page's glide)
  useEffect(() => {
    const nav = navRef.current;
    const b = nav?.querySelector('button.on');
    if (!b || nav.scrollWidth <= nav.clientWidth) return;
    const rect = b.getBoundingClientRect();
    const left =
      nav.scrollLeft +
      rect.left -
      nav.getBoundingClientRect().left -
      (nav.clientWidth - rect.width) / 2;
    nav.scrollTo({
      left: Math.max(0, Math.min(left, nav.scrollWidth - nav.clientWidth)),
      behavior: 'smooth',
    });
  }, [section, holding]);

  // a phone: while the project's own name and icon are on screen, the bar above doesn't repeat them, and the row of
  // sections stays out of the way until you've scrolled past the top (as a large title folds into an iPhone's bar)
  const [top, setTop] = useState({ named: true, tucked: true });
  useEffect(() => {
    const el = scroller.current;
    if (!phone || !el) return undefined;
    const upd = () => {
      const hero = el.querySelector('#sec-overview');
      const y = el.scrollTop;
      const named = y < 64;
      const tucked = y < (hero ? hero.offsetHeight - 90 : 400);
      setTop((t) => (t.named === named && t.tucked === tucked ? t : { named, tucked }));
    };
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    return () => el.removeEventListener('scroll', upd);
  }, [phone, holding]);
  useEffect(() => {
    if (!phone || holding) return undefined;
    document.body.classList.toggle('atlas-named', top.named);
    return () => document.body.classList.remove('atlas-named');
  }, [phone, holding, top.named]);

  // a file, opened from anywhere in the Atlas (on a phone, a sheet over the whole app)
  const fileSheet = drawer && (
    <Drawer
      phone={phone}
      onOthers={onOthers}
      tour={
        tourAt != null
          ? {
              i: tourAt,
              steps: (narration?.tour || []).filter((t) => pathIdx.has(t.p)),
              go: (i) => {
                const st = (narration?.tour || []).filter((t) => pathIdx.has(t.p));
                if (i < 0 || i >= st.length) {
                  setTourAt(null);
                  setDrawer(null);
                  return;
                }
                setTourAt(i);
                setDrawer(st[i].p);
              },
            }
          : null
      }
      p={drawer}
      facts={facts}
      pathIdx={pathIdx}
      role={role}
      stack={stack}
      onClose={() => {
        setDrawer(null);
        setTourAt(null);
      }}
      onOpen={openFile}
      readFile={readFile}
      onExplain={onExplainFile}
      onAsk={onAsk}
    />
  );

  if (holding)
    return (
      <AtlasLoading
        atlas={atlas}
        facts={facts}
        onRetry={onRetry}
        onBig={onBig}
        asked={asked}
        onIdeaInstead={onIdeaInstead}
      />
    );

  return (
    <div className="atlas" ref={scroller}>
      <div className={`atlas-bar ${phone && top.tucked ? 'tucked' : ''}`}>
        <div className="ab-id">
          {meta.avatar ? <img src={meta.avatar} alt="" /> : <span className="ab-folder">▢</span>}
          <span className="ab-name">
            <span className="muted">
              {(meta.full || atlas.name).includes('/')
                ? (meta.full || atlas.name).split('/')[0] + ' / '
                : ''}
            </span>
            {(meta.full || atlas.name).split('/').pop()}
          </span>
        </div>
        <nav className={`ab-nav ${navMore}`} ref={navRef} aria-label="Sections">
          {(phone ? PHONE_SECTIONS : SECTIONS)
            .filter(([id]) => !['grow', 'help'].includes(id) || atlas.src?.kind === 'github')
            .map(([id, l]) => (
              <button key={id} className={section === id ? 'on' : ''} onClick={() => go(id)}>
                {l}
              </button>
            ))}
        </nav>
        <button
          className="ab-more"
          aria-label={t('More actions')}
          aria-expanded={!!acts}
          onClick={(e) => openActs(e)}
        >
          ⋯
        </button>
        {(() => {
          const menu = (
            <>
              {acts && (
                <div className="ab-veil" onClick={() => setActs(false)} aria-hidden="true" />
              )}
              <div
                className={`ab-act ${acts ? 'open' : ''}`}
                style={
                  phone && acts?.bottom
                    ? {
                        '--at': `${Math.round(acts.bottom + 8)}px`,
                        '--ar': `${Math.round(innerWidth - acts.right)}px`,
                      }
                    : undefined
                }
                onClick={() => setActs(false)}
              >
                {narrating && (
                  <button
                    className="ab-live"
                    title={`${modelLabel} is reading the code. Click to stop.`}
                    onClick={onStopReading}
                  >
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    reading
                  </button>
                )}
                {atlas.status === 'narr-error' &&
                  (/^You stopped/.test(atlas.error || '') ? (
                    <button className="chip" onClick={onRetry} title={atlas.error}>
                      ❚❚ Reading paused · continue
                    </button>
                  ) : (
                    <button className="chip warnchip" onClick={onRetry} title={atlas.error}>
                      Explanations failed · retry
                    </button>
                  ))}
                {atlas.src?.kind === 'github' && (
                  <>
                    <button
                      className="chip"
                      aria-label="Fork into your GitHub"
                      title="Fork: copy this project into your own GitHub account, so you can change it without touching the original"
                      disabled={forkState === 'busy'}
                      onClick={async () => {
                        setForkState('busy');
                        try {
                          const r = await onFork();
                          setForkState(r);
                        } catch (e) {
                          setForkState({
                            err: String(e.message).replace(
                              /^Error invoking remote method '[^']+': (Error: )?/,
                              '',
                            ),
                          });
                        }
                      }}
                    >
                      <span className="ic">⑂</span>
                      <span className="lbl">
                        {forkState === 'busy' ? 'Forking…' : forkState?.url ? 'Forked ✓' : 'Fork'}
                      </span>
                    </button>
                    <button
                      className="chip"
                      title="Open on GitHub"
                      aria-label="Open on GitHub"
                      onClick={() => onOpenUrl(meta.url || `https://github.com/${atlas.src.full}`)}
                    >
                      <span className="lbl">GitHub </span>↗
                    </button>
                  </>
                )}
                <button
                  className="chip"
                  onClick={onCompare}
                  title="Compare: put it next to another app"
                  aria-label="Compare with another app"
                >
                  ⇄<span className="lbl"> Compare</span>
                </button>
                <button
                  className="chip icon"
                  title="Copy as study notes (Markdown)"
                  aria-label="Copy as study notes"
                  onClick={() => {
                    navigator.clipboard?.writeText(notesMd(atlas, tools, hot));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? '✓' : '⧉'}
                </button>
                <button
                  className="chip icon"
                  title="Read it again from scratch"
                  aria-label="Read it again from scratch"
                  onClick={onRefresh}
                >
                  ↻
                </button>
              </div>
            </>
          );
          // (a phone: a menu over the whole app, next to the ⋯ you tapped, as an iPhone's menus open)
          return phone ? onTop(menu) : menu;
        })()}
        {forkState?.url && (
          <div className="fork-note">
            Forked to{' '}
            <button className="link" onClick={() => onOpenUrl(forkState.url)}>
              {forkState.url.replace('https://github.com/', '')}
            </button>
            . It’s now in your GitHub, ready to change.
          </div>
        )}
        {forkState?.err && <div className="fork-note err">{forkState.err}</div>}
      </div>
      {asked && (
        <AskedBanner
          asked={asked}
          atlas={atlas}
          onIdeaInstead={onIdeaInstead}
          onClose={onAskedDone}
        />
      )}

      {phone ? (
        // a phone: the app for anyone first, then the technical side, then the code (AtlasPhone.jsx)
        <PhoneAtlas
          atlas={atlas}
          facts={facts}
          narration={narration}
          meta={meta}
          tools={tools}
          hot={hot}
          langs={langs}
          totalL={totalL}
          mainLang={mainLang}
          narrating={narrating}
          role={role}
          pathIdx={pathIdx}
          onOpen={openFile}
          onAsk={onAsk}
          onFeature={onFeature}
          onMakePath={onMakePath}
          onBuild={onBuild}
          ago={ago}
          altsOf={altsOf}
          onMore={openActs}
          tour={(narration?.tour || []).filter((t) => pathIdx.has(t.p))}
          onTour={(i) => {
            const st = (narration?.tour || []).filter((t) => pathIdx.has(t.p));
            setTourAt(i);
            setDrawer(st[i].p);
          }}
          slots={{
            grow: atlas.src?.kind === 'github' ? <Grow full={atlas.src.full || meta.full} /> : null,
            detective:
              !narrating && readFile ? (
                <Detective
                  facts={facts}
                  narration={narration}
                  readFile={readFile}
                  onOpen={openFile}
                />
              ) : null,
            contribute:
              atlas.src?.kind === 'github' ? (
                <Contribute
                  full={atlas.src.full || meta.full}
                  onPlan={onPlanIssue}
                  onOpen={openFile}
                  onOpenUrl={onOpenUrl}
                  pathIdx={pathIdx}
                />
              ) : null,
          }}
        />
      ) : (
        <>
          {/* ------------------------------------------------ overview: a headline, vitals, and the whole system as one picture */}
          <section className="asec a-over" id="sec-overview">
            <div className="over-top">
              <div className="over-text">
                <div className="kicker">
                  {gist?.kind || (atlas.src?.kind === 'local' ? 'your project' : 'open source')}
                </div>
                <h1 className={gist ? '' : 'pending'}>
                  {gist?.one ||
                    meta.description ||
                    facts.sig?.pkgDesc ||
                    `What is ${atlas.name.split('/').pop()}?`}
                </h1>
                {gist?.analogy ? (
                  <p className="analogy">{gist.analogy}</p>
                ) : narrating ? (
                  <div className="shimmer" style={{ width: '62%', height: 16 }} />
                ) : null}
              </div>
              <div className="vitals">
                <Donut langs={langs} total={totalL} />
                <div className="vt-rows">
                  <div>
                    <b>{facts.totals.code}</b>
                    <span>code files</span>
                  </div>
                  <div>
                    <b>{fmtN(facts.totals.lines)}</b>
                    <span>lines</span>
                  </div>
                  <div>
                    <b>{tools.length}</b>
                    <span>outside tools</span>
                  </div>
                  {meta.stars > 0 && (
                    <div>
                      <b>★ {fmtN(meta.stars)}</b>
                      <span>{meta.pushed ? `updated ${ago(meta.pushed)}` : 'stars'}</span>
                    </div>
                  )}
                </div>
                {gist?.users && (
                  <div className="vt-who">
                    <span className="k">for</span>
                    {gist.users}
                  </div>
                )}
              </div>
            </div>
            <BigPicture
              appName={(meta.full || atlas.name).split('/').pop()}
              onMakePath={onMakePath}
              build={narration?.build}
              onBuild={onBuild}
              flow={narration?.flow || fallbackFlow(facts, tools)}
              terms={narration?.terms || []}
              tools={tools}
              pathIdx={pathIdx}
              onOpen={openFile}
              onAsk={onAsk}
              narrating={narrating}
              role={role}
            />
            {tools.length > 0 && (
              <div className="stack-strip">
                <span className="mini-h">built with</span>
                <div className="ss-row">
                  {tools.slice(0, 14).map((tool) => (
                    <button
                      key={tool.id}
                      className="ss-t"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('atlas-tool', { detail: tool.id }));
                        go('stack');
                      }}
                      title={`${tool.name}: ${narration?.stack?.[tool.id]?.role || tool.what}`}
                    >
                      <Brand slug={tool.slug} name={tool.name} color={tool.color} size={34} />
                      <span>{tool.name}</span>
                      <i>{CATS[tool.cat]?.[0]}</i>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <City
            facts={facts}
            narration={narration}
            tools={tools}
            pathIdx={pathIdx}
            role={role}
            onOpen={openFile}
            narrating={narrating}
            hot={hot}
          />
          {atlas.src?.kind === 'github' && <Grow full={atlas.src.full || meta.full} />}
          <Toolbelt
            tools={tools}
            stack={stack}
            narration={narration}
            narrating={narrating}
            onShowFiles={(ids) => {
              window.dispatchEvent(new CustomEvent('atlas-focus', { detail: ids }));
              go('anatomy');
            }}
          />
          <Language
            langs={langs}
            totalL={totalL}
            main={mainLang}
            narration={narration}
            narrating={narrating}
          />
          <Hotspots
            hot={hot}
            role={role}
            onOpen={openFile}
            narrating={narrating}
            facts={facts}
            pathIdx={pathIdx}
          />
          <FileList facts={facts} role={role} onOpen={openFile} />
          <Study
            facts={facts}
            readFile={readFile}
            onOpen={openFile}
            atlas={atlas}
            narration={narration}
            onAsk={onAsk}
            onFeature={onFeature}
            narrating={narrating}
            tour={(narration?.tour || []).filter((t) => pathIdx.has(t.p))}
            role={role}
            onTour={(i) => {
              const st = (narration?.tour || []).filter((t) => pathIdx.has(t.p));
              setTourAt(i);
              setDrawer(st[i].p);
            }}
          />
          {atlas.src?.kind === 'github' && (
            <Contribute
              full={atlas.src.full || meta.full}
              onPlan={onPlanIssue}
              onOpen={openFile}
              onOpenUrl={onOpenUrl}
              pathIdx={pathIdx}
            />
          )}
        </>
      )}
      <div style={{ height: 110 }} />
      <AskBar
        name={(meta.full || atlas.name).split('/').pop()}
        threadKey={atlas.key}
        onAsk={onAsk}
        onQuick={onQuick}
        onOpen={openFile}
        pathIdx={pathIdx}
        initial={asked && atlas.src?.root ? asked : null}
        onFeature={onFeature}
      />
      {fileSheet && (phone ? onTop(fileSheet) : fileSheet)}
    </div>
  );
}

// Everything Bento learned about a repo, as Markdown notes you can paste anywhere.
function notesMd(atlas, tools, hot) {
  const narration = atlas.narr || {};
  const g = narration.gist || {};
  const lines = [
    `# ${atlas.name}`,
    '',
    g.one ? `**${g.one}**` : atlas.meta?.description || '',
    g.analogy ? `\n> ${g.analogy}` : '',
    '',
  ];
  if (narration.flow?.nodes?.length) {
    lines.push('## The big picture');
    narration.flow.nodes.forEach((n) =>
      lines.push(`- **${n.label}** (${n.term || n.kind}): ${n.does || ''}`),
    );
    lines.push('');
  }
  if (narration.terms?.length) {
    lines.push('## Words');
    narration.terms.forEach((t) => lines.push(`- **${t.term}**: ${t.plain}`));
    lines.push('');
  }
  if (tools.length) {
    lines.push('## Toolbelt');
    tools.forEach((t) => {
      const n = narration.stack?.[t.id];
      lines.push(`- **${t.name}**: ${n?.role || t.what}${n?.why ? ` _Why:_ ${n.why}` : ''}`);
    });
    lines.push('');
  }
  if (narration.tour?.length) {
    lines.push('## Read it in this order');
    narration.tour.forEach((t, i) => lines.push(`${i + 1}. \`${t.p}\`: ${t.why}`));
    lines.push('');
  }
  if (hot.length) {
    lines.push('## Hot spots');
    hot.forEach((h) => lines.push(`- **${h.title}**${h.p ? ` (\`${h.p}\`)` : ''}: ${h.md}`));
    lines.push('');
  }
  lines.push(
    `_Made with Bento${atlas.src?.kind === 'github' ? ` · https://github.com/${atlas.src.full}` : ''}_`,
  );
  return lines.join('\n');
}

function Donut({ langs, total }) {
  let a = -Math.PI / 2;
  const radius = 30,
    r = 19;
  const arcs = langs.slice(0, 6).map(([lang, n]) => {
    const da = (n / total) * Math.PI * 2;
    const a0 = a;
    a += da;
    const a1 = a - 0.02;
    const big = da > Math.PI ? 1 : 0;
    const polar = (rad, ang) =>
      `${(36 + rad * Math.cos(ang)).toFixed(2)},${(36 + rad * Math.sin(ang)).toFixed(2)}`;
    return (
      <path
        key={lang}
        d={
          da >= Math.PI * 2 - 0.03
            ? `M36,${36 - radius} A${radius},${radius} 0 1 1 35.99,${36 - radius} L35.99,${36 - r} A${r},${r} 0 1 0 36,${36 - r} Z`
            : `M${polar(radius, a0)} A${radius},${radius} 0 ${big} 1 ${polar(radius, a1)} L${polar(r, a1)} A${r},${r} 0 ${big} 0 ${polar(r, a0)} Z`
        }
        fill={langColor(lang)}
      >
        <title>
          {lang} {Math.round((n / total) * 100)}%
        </title>
      </path>
    );
  });
  return (
    <div className="donut">
      <svg viewBox="0 0 72 72" width="88" height="88">
        {arcs}
      </svg>
      <div className="donut-l">
        {langs.slice(0, 3).map(([l, n]) => (
          <span key={l}>
            <i style={{ background: langColor(l) }} />
            {l} <b>{Math.round((n / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function AtlasLoading({ atlas, facts, onRetry, onBig, asked, onIdeaInstead }) {
  const steps = [
    ['clone', 'Bringing the code onto your Mac'],
    ['read', 'Reading every file and following the imports'],
    ['narr', 'Asking your model to explain it'],
  ];
  const real = facts ? 2 : atlas.status === 'cloning' ? 0 : atlas.status === 'reading' ? 1 : 2;
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (at >= real) return;
    const t = setTimeout(() => setAt((x) => x + 1), 480);
    return () => clearTimeout(t);
  }, [at, real]);
  const counts = facts && {
    files: facts.totals.code,
    lines: facts.totals.lines,
    links: facts.files.reduce((a, f) => a + (f.imp?.length || 0), 0),
    outside: new Set(facts.files.flatMap((f) => f.ext || [])).size,
  };
  return (
    <div className="atlas-loading">
      {asked && <AskedBanner asked={asked} atlas={atlas} onIdeaInstead={onIdeaInstead} waiting />}
      <h1 className="sr-only">Reading {atlas.name}</h1>
      <div className="al-name" aria-hidden="true">
        {atlas.name}
      </div>
      {atlas.status === 'big' ? (
        <div className="big-warn">
          <b>This one is huge.</b> GitHub lists {atlas.meta?.full} at{' '}
          {(atlas.meta.size / 1024 / 1024).toFixed(1)} GB with its whole history. Bento only
          downloads the latest version, but that can still take a few minutes and real disk space.
          <div className="big-acts">
            <button className="btn" onClick={onBig}>
              Take it apart anyway
            </button>
            <span className="muted small">or try a “bite-size” project in Explore</span>
          </div>
        </div>
      ) : atlas.status === 'error' ? (
        <div className="story-err">
          <b>Couldn’t open it.</b> {atlas.error}
          <div>
            <button className="btn tiny" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="al-steps">
          {steps.map(([k, l], i) => (
            <div key={k} className={`al-step ${i < at ? 'done' : i === at ? 'now' : ''}`}>
              <span className="al-dot">{i < at ? '✓' : ''}</span>
              {l}
              {i === 0 && at === 0 && atlas.progress?.pct != null && (
                <span className="al-pct">
                  {atlas.progress.phase === 'cached' ? 'already here' : `${atlas.progress.pct}%`}
                </span>
              )}
              {i === 1 && at >= 1 && counts && (
                <span className="al-pct">
                  {counts.files.toLocaleString()} files · {counts.lines.toLocaleString()} lines ·{' '}
                  {counts.links.toLocaleString()} imports followed · {counts.outside} outside
                  packages
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="al-ghost">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="alg-band">
            <div className="shimmer" style={{ width: 90 }} />
            {Array.from({ length: 6 + i }, (_, j) => (
              <span
                key={j}
                className="alg-peb"
                style={{ animationDelay: `${(i * 6 + j) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================================================
// Toolbelt: logos first. Pick one to see what it does here, why it was chosen, and what else would work.
export function Toolbelt({ tools, stack, narration, narrating, onShowFiles }) {
  const [sel, setSel] = useState(null);
  const [alt, setAlt] = useState(null);
  useEffect(() => {
    const h = (e) => setSel(e.detail);
    addEventListener('atlas-tool', h);
    return () => removeEventListener('atlas-tool', h);
  }, []);
  const narrStack = narration?.stack || {};
  const shop = stack.filter((s) => s.workshop && !s.side);
  const side = stack.filter((s) => s.side);
  const groups = [];
  for (const s of tools) {
    const g = groups.find((x) => x.cat === s.cat);
    if (g) g.items.push(s);
    else groups.push({ cat: s.cat, items: [s] });
  }
  const tool = tools.find((t) => t.id === sel) || tools[0];
  const n =
    tool &&
    (narrStack[tool.id] ||
      Object.values(narrStack).find((x) => x.name?.toLowerCase() === tool.name.toLowerCase()));
  const alts = tool
    ? (n?.alts?.length
        ? n.alts.map((a) => ({ name: a.name, when: a.when, tool: findTool(a.name) }))
        : (tool.alt || [])
            .map((id) => BY_ID[id])
            .filter(Boolean)
            .map((t) => ({ name: t.name, when: t.when, tool: t }))
      ).slice(0, 4)
    : [];
  const shownAlt = alts.find((a) => a.name === alt) || null;
  useEffect(() => setAlt(null), [tool?.id]);
  return (
    <section className="asec" id="sec-stack">
      <div className="sec-head">
        <div>
          <div className="kicker">toolbelt</div>
          <h2>What it’s built with</h2>
        </div>
      </div>
      {tools.length === 0 && (
        <p className="muted">
          No outside tools: it’s built from scratch with the language’s own features.
        </p>
      )}
      {tools.length > 0 && (
        <div className="belt2">
          <div className="belt-tiles">
            {groups.map((group) => (
              <div key={group.cat} className="tg">
                <div className="tg-h">{CATS[group.cat]?.[0] || group.cat}</div>
                <div className="tg-row">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`tile ${tool?.id === item.id ? 'on' : ''}`}
                      onClick={() => setSel(item.id)}
                      onMouseEnter={() => setSel(item.id)}
                    >
                      <Brand slug={item.slug} name={item.name} color={item.color} size={46} />
                      <span className="tile-n">{item.name}</span>
                      {item.used?.length > 0 && (
                        <span className="tile-use" title={`used in ${item.used.length} files`}>
                          {Array.from(
                            { length: Math.min(6, Math.ceil(Math.log2(item.used.length + 1))) },
                            (_, i) => (
                              <i key={i} />
                            ),
                          )}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {tool && (
            <div className="tool-card" key={tool.id}>
              <div className="tc-top">
                <Brand slug={tool.slug} name={tool.name} color={tool.color} size={58} />
                <div>
                  <div className="tc-cat">{CATS[tool.cat]?.[0]}</div>
                  <div className="tc-name">{tool.name}</div>
                  {tool.used?.length > 0 && (
                    <button
                      className="tool-used"
                      onClick={() => onShowFiles([...tool.used, `s:${tool.id}`])}
                    >
                      show the {tool.used.length} file{tool.used.length > 1 ? 's' : ''} that use it
                      →
                    </button>
                  )}
                </div>
              </div>
              <div className="tc-what">{n?.role || tool.what}</div>
              {n?.why ? (
                <div className="tc-why">
                  <Md text={n.why} />
                </div>
              ) : narrating ? (
                <div className="shimmer" />
              ) : null}
              {alts.length > 0 && (
                <div className="tc-vs">
                  <div className="tc-vs-row">
                    <span className="vs-pick">
                      <Brand slug={tool.slug} name={tool.name} color={tool.color} size={30} />
                    </span>
                    <span className="vs">vs</span>
                    {alts.map((alt) => (
                      <button
                        key={alt.name}
                        className={`vs-alt ${shownAlt?.name === alt.name ? 'on' : ''}`}
                        onMouseEnter={() => setAlt(alt.name)}
                        onClick={() => setAlt(alt.name)}
                        title={alt.name}
                      >
                        <Brand
                          slug={alt.tool?.slug}
                          name={alt.name}
                          color={alt.tool?.color}
                          size={30}
                        />
                        <span>{alt.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="tc-when">
                    {shownAlt ? (
                      <>
                        <b>Pick {shownAlt.name}</b>{' '}
                        {/^(when|if)\b/i.test(shownAlt.when || '') ? '' : 'when '}
                        {lc((shownAlt.when || shownAlt.tool?.when || '').replace(/\.$/, ''))}.
                      </>
                    ) : (
                      <span className="muted">
                        Point at an alternative to see when you’d choose it instead.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {shop.length > 0 && (
        <div className="workshop">
          <span className="mini-h">also in the workshop</span>
          {shop.map((t) => (
            <span key={t.id} className="ws" title={`${t.name}: ${t.what}`}>
              <Brand slug={t.slug} name={t.name} color={t.color} size={20} plain />
              {t.name}
            </span>
          ))}
        </div>
      )}
      {side.length > 0 && (
        <div className="workshop">
          <span className="mini-h">only for its docs site and examples</span>
          {side.map((t) => (
            <span
              key={t.id}
              className="ws"
              title={`${t.name}: ${t.what}\nFound in ${t.evidence.join(', ')}`}
            >
              <Brand slug={t.slug} name={t.name} color={t.color} size={20} plain />
              {t.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// =====================================================================================================
function Language({ langs, totalL, main, narration, narrating }) {
  const langInfo = LANGS[main] || {};
  const why = narration?.lang?.why || langInfo.why;
  const alts = narration?.lang?.alts?.length
    ? narration.lang.alts
    : (langInfo.alt || []).map((a) => ({ name: a, when: LANGS[a]?.why }));
  return (
    <section className="asec" id="sec-language">
      <div className="sec-head">
        <div>
          <div className="kicker">language</div>
          <h2>Why it’s written in {main || 'this'}</h2>
        </div>
      </div>
      <div className="lang-wrap">
        <div className="lang-main">
          <Brand slug={langInfo.slug} name={main} color={langInfo.color} size={64} />
          <div>
            <p className="lang-why">
              {why ? (
                <Md text={why} />
              ) : narrating ? (
                <span className="shimmer" />
              ) : (
                'The authors’ choice.'
              )}
              {!narration?.lang && narrating && (
                <span className="muted small"> (a general answer for now)</span>
              )}
            </p>
            {alts.length > 0 && (
              <div className="lang-alts">
                <span className="mini-h">it could have been</span>
                {alts.slice(0, 3).map((alt) => (
                  <div key={alt.name} className="lang-alt">
                    <Brand
                      slug={LANGS[alt.name]?.slug}
                      name={alt.name}
                      color={LANGS[alt.name]?.color}
                      size={22}
                      plain
                    />
                    <b>{alt.name}</b>
                    <span>
                      <Md text={alt.when || ''} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="lang-mix">
          {langs.slice(0, 8).map(([lang, n]) => (
            <div key={lang} className="lm-row">
              <span className="lm-name">
                <span className="ldot" style={{ background: langColor(lang) }} />
                {lang}
              </span>
              <span className="lm-bar">
                <i
                  style={{
                    width: `${Math.max(1.5, (n / totalL) * 100)}%`,
                    background: langColor(lang),
                  }}
                />
              </span>
              <span className="lm-n">{fmtN(n)}</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 6 }}>
            lines of code per language
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================================================
const HOT_ICON = {
  bottleneck: ['⏱', 'Slow spot'],
  fragile: ['⚠', 'Fragile'],
  complex: ['≋', 'Hard to read'],
  security: ['⛨', 'Security'],
  scale: ['⇡', 'Scale'],
};
function Hotspots({ hot, role, onOpen, narrating, facts, pathIdx }) {
  const maxL = Math.max(100, ...facts.files.filter((f) => f.lang).map((f) => f.lines));
  const maxU = Math.max(3, ...facts.files.map((f) => f.used));
  const kinds = Object.entries(
    hot.reduce((m, h) => {
      const k = h.kind || 'fragile';
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  );
  return (
    <section className="asec" id="sec-hot">
      <div className="sec-head">
        <div>
          <div className="kicker">hot spots</div>
          <h2>Where it could hurt</h2>
          <p className="sec-sub">
            Bottlenecks, fragile spots and things that get hard as it grows. Some are measured, some
            come from reading the code.
          </p>
        </div>
      </div>
      {kinds.length > 0 && (
        <div className="hot-sum">
          {kinds.map(([kind, n]) => {
            const [ic, label] = HOT_ICON[kind] || HOT_ICON.fragile;
            return (
              <span key={kind} className={`hs k-${kind}`}>
                <i>{ic}</i>
                <b>{n}</b>
                {label.toLowerCase()}
              </span>
            );
          })}
        </div>
      )}
      <div className="hots">
        {hot.length === 0 && !narrating && (
          <p className="muted">Nothing stands out. Clean little codebase.</p>
        )}
        {hot.map((spot, i) => {
          const [ic, label] = HOT_ICON[spot.kind] || HOT_ICON.fragile;
          return (
            <div key={i} className={`hot k-${spot.kind || 'fragile'}`}>
              {spot.p && pathIdx.has(spot.p) ? (
                <MiniBuilding
                  f={facts.files[pathIdx.get(spot.p)]}
                  maxL={maxL}
                  maxU={maxU}
                  kind={spot.kind}
                />
              ) : (
                <span className="hot-ic">{ic}</span>
              )}
              <div className="hot-main">
                <div className="hot-top">
                  <b>{spot.title}</b>
                  <span className="hot-kind">{label}</span>
                  <span className="hot-src">
                    {spot.measured ? 'measured' : 'from reading the code'}
                  </span>
                </div>
                <div className="hot-md">
                  <Md text={spot.md} />
                </div>
                {spot.p && (
                  <button className="file-chip" onClick={() => onOpen(spot.p)}>
                    {spot.p}
                    <span>{role(spot.p)}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {narrating && (
          <div className="hot ghost">
            <span className="hot-ic">
              <span className="lens-spin" />
            </span>
            <div className="hot-main">
              <div className="shimmer" style={{ width: '40%' }} />
              <div className="shimmer short" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Squarified treemap: folders are blocks, files are tiles sized by lines of code, coloured by layer.
function squarify(items, x, y, w, h) {
  const out = [];
  let rest = items.filter((it) => it.v > 0).sort((a, b) => b.v - a.v);
  const total = rest.reduce((s, it) => s + it.v, 0);
  if (!total) return out;
  const scale = (w * h) / total;
  rest = rest.map((it) => ({ ...it, a: it.v * scale }));
  const worst = (row, side) => {
    const sum = row.reduce((s, r) => s + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a)),
      mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) {
      row.push(rest[i]);
      i++;
    }
    rest = rest.slice(i);
    const sum = row.reduce((s, r) => s + r.a, 0);
    if (w >= h) {
      const rw = sum / h;
      let yy = y;
      for (const r of row) {
        const rh = r.a / rw;
        out.push({ ...r, x, y: yy, w: rw, h: rh });
        yy += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = sum / w;
      let xx = x;
      for (const r of row) {
        const rw = r.a / rh;
        out.push({ ...r, x: xx, y, w: rw, h: rh });
        xx += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}
function FileMap({ files, role, onOpen }) {
  const box = useRef(null);
  const [width, setW] = useState(900);
  const [hov, setHov] = useState(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const height = Math.round(Math.min(560, Math.max(320, width * 0.48)));
  const code = files.filter((f) => f.lines > 0);
  const groups = new Map();
  for (const f of code) {
    const d = f.p.includes('/')
      ? f.p
          .split('/')
          .slice(0, f.p.split('/').length > 2 ? 2 : 1)
          .join('/')
      : '·';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(f);
  }
  const blocks = squarify(
    [...groups].map(([d, fs]) => ({ d, fs, v: fs.reduce((s, f) => s + f.lines, 0) })),
    0,
    0,
    width,
    height,
  );
  return (
    <div className="fmap" ref={box} style={{ height }}>
      {blocks.map((block) => {
        const pad = 3,
          head = block.h > 46 && block.w > 70 ? 18 : 0;
        const tiles = squarify(
          block.fs.map((f) => ({ f, v: f.lines })),
          block.x + pad,
          block.y + pad + head,
          Math.max(0, block.w - pad * 2),
          Math.max(0, block.h - pad * 2 - head),
        );
        return (
          <div
            key={block.d}
            className="fm-block"
            style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
          >
            {head > 0 && <span className="fm-dir">{block.d === '·' ? 'top level' : block.d}/</span>}
            {tiles.map((tile) => (
              <button
                key={tile.f.p}
                data-p={tile.f.p}
                className={`fm-tile ${hov === tile.f.p ? 'on' : ''}`}
                style={{
                  left: tile.x - block.x,
                  top: tile.y - block.y,
                  width: Math.max(0, tile.w - 2),
                  height: Math.max(0, tile.h - 2),
                  '--c': LAYER[tile.f.layer][3],
                }}
                onMouseEnter={() => setHov(tile.f.p)}
                onMouseLeave={() => setHov(null)}
                onClick={() => onOpen(tile.f.p)}
                title={`${tile.f.p}\n${role(tile.f.p)}\n${tile.f.lines} lines`}
              >
                {tile.w > 64 && tile.h > 22 && (
                  <span className="fm-n">{tile.f.p.split('/').pop()}</span>
                )}
                {tile.w > 110 && tile.h > 44 && <span className="fm-r">{role(tile.f.p)}</span>}
              </button>
            ))}
          </div>
        );
      })}
      <div className="fm-legend">
        {LAYERS.map(([k, n, , c]) => (
          <span key={k}>
            <i style={{ background: c }} />
            {n}
          </span>
        ))}
        <span className="muted">· bigger = more code</span>
      </div>
    </div>
  );
}

// A file as one little building: height = lines, the beacon = how many files depend on it.
function MiniBuilding({ f, maxL, maxU, kind }) {
  const h = 10 + 34 * Math.sqrt(Math.min(1, f.lines / maxL));
  const u = f.used / maxU;
  const c =
    kind === 'complex'
      ? 'var(--violet)'
      : kind === 'scale'
        ? 'var(--accent)'
        : kind === 'bottleneck'
          ? 'var(--butter)'
          : 'var(--rose)';
  return (
    <span className="mini-b" title={`${f.lines} lines · used by ${f.used} files`}>
      <svg viewBox="0 0 46 64" width="46" height="64">
        <ellipse cx="23" cy="58" rx={16 + u * 6} ry={4 + u * 2} fill={c} opacity={0.12 + u * 0.3} />
        <path
          d={`M12 ${56} L23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} L12 ${56 - h} Z`}
          fill={`color-mix(in srgb, ${c} 25%, var(--bsid))`}
        />
        <path
          d={`M23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} Z`}
          fill={`color-mix(in srgb, ${c} 40%, var(--bsid))`}
        />
        <path
          d={`M12 ${56 - h} L23 ${52 - h} L34 ${56 - h} L23 ${60 - h} Z`}
          fill={langColor(f.lang)}
        />
        {f.used > 2 && (
          <>
            <line x1="23" y1={56 - h} x2="23" y2={46 - h} stroke={c} strokeWidth="1.6" />
            <circle cx="23" cy={45 - h} r="2.8" fill={c} />
          </>
        )}
      </svg>
      <span className="mb-n">
        {f.lines}
        <i>lines</i>
      </span>
    </span>
  );
}

// =====================================================================================================
function FileList({ facts, role, onOpen }) {
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('all');
  const [open, setOpen] = useState({});
  const [mode, setMode] = useState('map');
  useEffect(() => {
    const h = (e) => {
      setLayer(e.detail);
      setMode('map');
      setQ('');
    };
    addEventListener('atlas-layer', h);
    return () => removeEventListener('atlas-layer', h);
  }, []);
  const files = facts.files.filter(
    (f) =>
      (layer === 'all' || f.layer === layer) &&
      (!q ||
        f.p.toLowerCase().includes(q.toLowerCase()) ||
        role(f.p).toLowerCase().includes(q.toLowerCase())),
  );
  const dirs = new Map();
  for (const f of files) {
    const d = f.p.includes('/') ? f.p.slice(0, f.p.lastIndexOf('/')) : '';
    if (!dirs.has(d)) dirs.set(d, []);
    dirs.get(d).push(f);
  }
  const sorted = [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const many = sorted.length > 14 && !q;
  return (
    <section className="asec" id="sec-files">
      <div className="sec-head">
        <div>
          <div className="kicker">files</div>
          <h2>Every file, in plain words</h2>
        </div>
        <div className="sec-tools">
          <div className="seg small">
            <button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')}>
              Map
            </button>
            <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
              List
            </button>
          </div>
          <input
            className="fl-q"
            placeholder="Find a file or a job…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="fl-layers">
        {[['all', 'All'], ...LAYERS.map((l) => [l[0], l[1]])].map(([k, l]) => (
          <button key={k} className={`chip ${layer === k ? 'on' : ''}`} onClick={() => setLayer(k)}>
            {k !== 'all' && <span className="ldot" style={{ background: LAYER[k][3] }} />}
            {l}
          </button>
        ))}
      </div>
      {mode === 'map' ? (
        <FileMap files={files} role={role} onOpen={onOpen} />
      ) : (
        <div className="fl">
          {sorted.map(([group, fs]) => {
            const isOpen = !many || open[group] || fs.length <= 3;
            return (
              <div key={group} className="fl-dir">
                <button
                  className="fl-dname"
                  aria-expanded={isOpen}
                  onClick={() => setOpen({ ...open, [group]: !isOpen })}
                >
                  <span className="caret2">{isOpen ? '▾' : '▸'}</span>
                  <span className="fl-dn">{group || 'top level'}/</span>
                  <span className="muted"> {fs.length}</span>
                </button>
                {isOpen &&
                  fs.map((f) => (
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
function Detective({ facts, narration, readFile, onOpen }) {
  const pool = useMemo(() => {
    const roles = narration?.roles || {};
    const idx = new Map(facts.files.map((f) => [f.p, f]));
    return Object.entries(roles)
      .filter(
        ([p, r]) =>
          r && idx.get(p)?.lines >= 12 && idx.get(p)?.lang && idx.get(p).layer !== 'support',
      )
      .map(([p, r]) => ({ p, r, layer: idx.get(p).layer }));
  }, [facts, narration]);
  const [game, setGame] = useState(null); // { rounds: [...], i, score, picked, code }
  const deal = async () => {
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    const rounds = pick.map((x) => {
      const others = pool
        .filter((y) => y.p !== x.p && y.r !== x.r)
        .sort((a, b) => (a.layer === x.layer) - (b.layer === x.layer) || Math.random() - 0.5)
        .slice(0, 2);
      return { ...x, opts: [x.r, ...others.map((o) => o.r)].sort(() => Math.random() - 0.5) };
    });
    setGame({ rounds, i: 0, score: 0, picked: null, code: null });
    load(rounds[0]);
  };
  const load = async (round) => {
    let t = '';
    try {
      t = await readFile(round.p);
    } catch {}
    const lines = t.split('\n');
    let k = 0;
    while (k < lines.length && k < 60 && LEAD.test(lines[k])) k++;
    const code = lines
      .slice(k)
      .filter((l, j, a) => !(l.trim() === '' && a[j - 1]?.trim() === ''))
      .slice(0, 18)
      .join('\n');
    setGame((g) => (g && g.rounds.includes(round) ? { ...g, code } : g));
  };
  if (pool.length < 4) return null;
  if (!game)
    return (
      <div className="detective intro">
        <div className="dt-badge">🕵</div>
        <div>
          <b>Code detective</b>
          <span>
            Read the top of a real file from this project and guess what it does. Five files, about
            two minutes.
          </span>
        </div>
        <button className="btn" onClick={deal}>
          Play
        </button>
      </div>
    );
  const round = game.rounds[game.i];
  const done = game.i >= game.rounds.length;
  if (done)
    return (
      <div className="detective intro">
        <div className="dt-badge">{game.score >= 4 ? '🏆' : game.score >= 2 ? '🔍' : '🌱'}</div>
        <div>
          <b>
            {game.score} of {game.rounds.length} files solved
          </b>
          <span>
            {game.score >= 4
              ? 'You read code like a pro.'
              : game.score >= 2
                ? 'Good eye. Names, imports and the first function give most of it away.'
                : 'Tip: look at what a file imports and the name of its first function.'}
          </span>
        </div>
        <button className="btn" onClick={deal}>
          Play again
        </button>
      </div>
    );
  const right = game.picked != null && game.picked === round.r;
  return (
    <div className="detective">
      <div className="dt-top">
        <span className="mini-h">
          code detective · {game.i + 1} of {game.rounds.length}
        </span>
        <span className="dt-score">
          {'★'.repeat(game.score)}
          <i>{'☆'.repeat(game.rounds.length - game.score)}</i>
        </span>
      </div>
      <div className="dt-body">
        <pre className="dt-code">{game.code == null ? '…' : game.code || '(empty file)'}</pre>
        <div className="dt-q">
          <b>What does this file do?</b>
          {round.opts.map((option) => (
            <button
              key={option}
              disabled={game.picked != null}
              className={`dt-opt ${game.picked != null && option === round.r ? 'ok' : ''} ${game.picked === option && option !== round.r ? 'no' : ''}`}
              onClick={() =>
                setGame({
                  ...game,
                  picked: option,
                  score: game.score + (option === round.r ? 1 : 0),
                })
              }
            >
              {option}
            </button>
          ))}
          {game.picked != null && (
            <div className="dt-reveal">
              <span>
                {right ? '✓ Right!' : '✗ Not quite.'} It’s <code>{round.p}</code>
              </span>
              <div>
                <button className="link" onClick={() => onOpen(round.p)}>
                  Open the file
                </button>
                <button
                  className="btn tiny"
                  onClick={() => {
                    const n = game.i + 1;
                    setGame({ ...game, i: n, picked: null, code: null });
                    if (n < game.rounds.length) load(game.rounds[n]);
                  }}
                >
                  {game.i + 1 < game.rounds.length ? 'Next file →' : 'See my score'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Study({
  facts,
  readFile,
  onOpen,
  atlas,
  narration,
  onAsk,
  onFeature,
  narrating,
  tour = [],
  onTour,
}) {
  const [feat, setFeat] = useState('');
  const qs = narration?.learn?.length
    ? narration.learn
    : [
        'Where does this app start?',
        'How does data flow through it?',
        'Which file should I read first?',
      ];
  return (
    <section className="asec" id="sec-study">
      <div className="sec-head">
        <div>
          <div className="kicker">study it</div>
          <h2>Go deeper</h2>
          <p className="sec-sub">
            Each question opens a lesson built on the real files, with the code on the right.
          </p>
        </div>
      </div>
      {tour.length > 0 && (
        <div className="tour">
          <div className="tour-h">
            <span className="mini-h">read it in this order</span>
            <button className="btn" onClick={() => onTour(0)}>
              Start the tour →
            </button>
          </div>
          <ol>
            {tour.map((t, i) => (
              <li key={t.p}>
                <button onClick={() => onTour(i)}>
                  <span className="tour-n">{i + 1}</span>
                  <span className="tour-p">{t.p}</span>
                  <span className="tour-w">{t.why}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!narrating && readFile && (
        <Detective facts={facts} narration={narration} readFile={readFile} onOpen={onOpen} />
      )}
      <div className="study">
        <div className="nexts">
          {qs.map((q, i) => (
            <button key={i} className="next" onClick={() => onAsk(q)}>
              {q}
              <span>→</span>
            </button>
          ))}
          {narrating && !narration?.learn?.length && (
            <div className="muted small" style={{ marginTop: 8 }}>
              Better questions arrive when the reading is done.
            </div>
          )}
        </div>
        <form
          className="cv-feature"
          onSubmit={(e) => {
            e.preventDefault();
            if (feat.trim()) {
              onFeature(feat.trim());
              setFeat('');
            }
          }}
        >
          <span className="cv-fi">⌁</span>
          <input
            value={feat}
            onChange={(e) => setFeat(e.target.value)}
            placeholder={`Build a feature in ${atlas.name.split('/').pop()}: “add a dark mode toggle”…`}
          />
          <button className="btn" disabled={!feat.trim()}>
            Show me how
          </button>
        </form>
      </div>
    </section>
  );
}

// Why you're here: you asked about a real project, and this is its real code (found on your Mac or on GitHub)
const asIcon = (asked, atlas) =>
  asked.d?.pick?.app?.icon ||
  atlas.meta?.avatar ||
  (asked.d?.pick?.full
    ? `https://avatars.githubusercontent.com/${asked.d.pick.full.split('/')[0]}?size=96`
    : null);
function AskedBanner({ asked, atlas, onIdeaInstead, onClose, waiting }) {
  const pick = asked.d?.pick || {};
  const icon = asIcon(asked, atlas);
  const home = (p) => String(p || '').replace(/^\/Users\/[^/]+/, '~');
  return (
    <div className={`asked fade-in ${waiting ? 'waiting' : ''}`} role="status">
      {icon ? (
        <img className="asked-ic" src={icon} alt="" />
      ) : (
        <span className="asked-ic ph" aria-hidden="true">
          ?
        </span>
      )}
      <div className="asked-t">
        <b>“{asked.q.length > 90 ? asked.q.slice(0, 90) + '…' : asked.q}”</b>
        <span className="asked-why">
          {pick.app && (
            <span className="aw-chip mac">
              ✓ {pick.app.app}
              {pick.app.version ? ` ${pick.app.version}` : ''} {t('is on this Mac')}
            </span>
          )}
          {pick.local && (
            <span className="aw-chip mac">
              ✓ {t('your copy')} · {home(pick.local.root)}
            </span>
          )}
          {asked.d?.why === 'recent' && (
            <span className="aw-chip mac">↩ {t('you were just reading it')}</span>
          )}
          {asked.d?.why === 'named' && (
            <span className="aw-chip mac">↩ {t('you opened it before')}</span>
          )}
          {pick.full && (
            <span className="aw-chip">
              {pick.full}
              {pick.stars ? ` · ★ ${fmtN(pick.stars)}` : ''}
            </span>
          )}
          <span className="aw-say">
            {waiting
              ? t('Answering from its real code as soon as it’s in…')
              : t('Here’s its real code. Your answer is in the box below; ask follow-ups there.')}
          </span>
        </span>
      </div>
      <button className="link" onClick={() => onIdeaInstead?.(asked.q)}>
        {t('Just the idea instead')}
      </button>
      {onClose && (
        <button className="ib" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}

// Ask about the repo and keep talking: quick answers from the real files (a few seconds), each one remembered,
// so follow-ups make sense. File names are buttons. ⌘↵ turns any question into a full lesson.
const askedOnce = new Set();
const okPath = (f) =>
  typeof f === 'string' && /^[\w@.\-+/ ]+$/.test(f) && !f.includes('..') && /\.[a-z0-9]+$/i.test(f);
const DO =
  /^(?:(?:can|could) you |please |let'?s |lets |i want to |help me )?(?:build|make|add|create|write|implement|change|modify|refactor|extend|port|clone|recreate|rebuild|fix)\b/i;
// each project's conversation is kept (last 8 questions), so it's still there when you come back
const THREADS = 'bento.atlasThreads';
const loadThread = (k) => {
  try {
    return (JSON.parse(localStorage.getItem(THREADS) || '{}')[k] || []).filter((x) => !x.loading);
  } catch {
    return [];
  }
};
const saveThread = (k, th) => {
  try {
    const all = JSON.parse(localStorage.getItem(THREADS) || '{}');
    const keep = th.filter((x) => !x.loading).slice(-8);
    if (!keep.length && !all[k]) return;
    all[k] = keep;
    const keys = Object.keys(all);
    if (keys.length > 30) delete all[keys[0]];
    save(THREADS, all);
  } catch {}
}; // also mirrored to disk
function AskBar({ name, threadKey, onAsk, onQuick, onOpen, initial, onFeature }) {
  const [v, setV] = useState('');
  const [thread, setThread] = useState(() => loadThread(threadKey)); // [{ id, q, loading, a, files }]
  useEffect(() => {
    saveThread(threadKey, thread);
  }, [thread, threadKey]);
  // browser storage can lose the last writes if the app is closed abruptly; the copy on disk fills in
  useEffect(() => {
    if (thread.length) return;
    window.bento
      ?.storeGet?.()
      .then((d) => {
        const th = (d?.[THREADS]?.[threadKey] || []).filter((x) => !x.loading);
        if (th.length) setThread((cur) => (cur.length ? cur : th));
      })
      .catch(() => {});
  }, [threadKey]);
  const [opened, setOpened] = useState(null); // an earlier answer you reopened (the latest one is always open)
  const list = useRef(null);
  const inp = useRef(null);
  const ask = async (question, full) => {
    question = String(question || '').trim();
    if (!question) return;
    if (full || !onQuick) return onAsk(question);
    const id = Date.now() + Math.random();
    const history = thread.filter((x) => !x.loading && x.a).map(({ q: hq, a }) => ({ q: hq, a }));
    setThread((th) => [...th.slice(-7), { id, q: question, loading: true }]);
    let r;
    try {
      r = await onQuick(question, history);
    } catch {
      r = {
        a: `That didn’t work. Try again, or press ${keys('⌘↵')} for a full lesson.`,
        files: [],
      };
    }
    setThread((th) => th.map((x) => (x.id === id ? { ...x, loading: false, ...r } : x)));
  };
  const submit = (full) => {
    const q = v.trim();
    if (!q) return;
    setV('');
    ask(q, full);
  };
  // the question you came with is asked for you, once, as soon as the code is here
  useEffect(() => {
    if (initial?.q && !askedOnce.has(initial.at)) {
      askedOnce.add(initial.at);
      ask(initial.q, false);
    }
  }, [initial?.at]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [thread]);
  const busy = thread.some((x) => x.loading);
  const [min, setMin] = useState(false);
  useEffect(() => {
    if (busy) setMin(false);
  }, [busy]);
  const form = (
    <form
      className="fu"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <span className="ask-ic" aria-hidden="true">
        ?
      </span>
      <svg className="ask-spark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"
          fill="currentColor"
        />
      </svg>
      <input
        id="atlas-ask"
        ref={inp}
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-busy={busy || undefined}
        placeholder={thread.length ? t('Ask a follow-up…') : `Ask anything about ${name}…`}
        aria-label={thread.length ? t('Ask a follow-up') : `Ask anything about ${name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mod(e)) {
            e.preventDefault();
            submit(true);
          }
        }}
      />
      <kbd aria-hidden="true">↵</kbd>
      <button className="ask-go" aria-label={t('Ask')} disabled={!v.trim()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 19V5M6 11l6-6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
  // a conversation sits beside the code (the page makes room), so you can read and ask at the same time
  if (thread.length && min)
    return (
      <div className="atlas-ask">
        <button
          className="aq-pill"
          onClick={() => {
            setMin(false);
            setTimeout(() => inp.current?.focus(), 50);
          }}
        >
          💬 {t('Your conversation')} · {thread.length}
        </button>
      </div>
    );
  if (!thread.length) return <div className="atlas-ask">{form}</div>;
  return (
    <div className="atlas-ask docked">
      <aside className="aq-dock" aria-label={`${t('Conversation about')} ${name}`}>
        <div className="aq-dock-h">
          <span className="mini-h">
            {t('asking about')} <b>{name}</b>
          </span>
          <button
            className="ib"
            aria-label={t('Make it small')}
            title={t('Make it small')}
            onClick={() => setMin(true)}
          >
            –
          </button>
          <button
            className="ib"
            aria-label={t('Close the conversation')}
            title={t('Clear the conversation')}
            onClick={() => setThread([])}
          >
            ✕
          </button>
        </div>
        <div className="aq-thread" ref={list} aria-live="polite">
          {thread.map((x, i) =>
            i < thread.length - 1 && opened !== x.id ? (
              <button
                key={x.id}
                className="aq-turn aq-folded"
                onClick={() => setOpened(x.id)}
                aria-expanded="false"
              >
                <span className="aq-q">{x.q}</span>
                <span aria-hidden="true">▸</span>
              </button>
            ) : (
              <div key={x.id} className="aq-turn">
                <div className="aq-q">
                  {x.q}
                  {i < thread.length - 1 && (
                    <button className="link" onClick={() => setOpened(null)}>
                      {t('fold')}
                    </button>
                  )}
                </div>
                {x.loading ? (
                  <div className="writing">
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    {t('Reading the code…')}
                  </div>
                ) : (
                  <>
                    <div className="aq-a">
                      <Md text={x.a} />
                    </div>
                    {x.files?.filter(okPath).length > 0 && (
                      <div className="aq-files">
                        {x.files.filter(okPath).map((f) => (
                          <button
                            key={f}
                            className="file-chip"
                            title={f}
                            aria-label={`Open ${f}`}
                            onClick={() => onOpen(f)}
                          >
                            {f.split('/').length > 2 ? `…/${f.split('/').slice(-2).join('/')}` : f}
                          </button>
                        ))}
                      </div>
                    )}
                    {onFeature && DO.test(x.q) ? (
                      <button className="btn tiny aq-do" onClick={() => onFeature(x.q)}>
                        ✦ {t('Build it with me, step by step')} →
                      </button>
                    ) : null}
                    <button className="qa-more" onClick={() => onAsk(x.q)}>
                      {t('Turn this into a full lesson with the code')} →
                    </button>
                  </>
                )}
              </div>
            ),
          )}
        </div>
        {form}
      </aside>
    </div>
  );
}

// Ripple: change this file, and who could feel it? Rings = how many hops away (direct users, their users, …).
const revCache = new WeakMap();
function reverseOf(facts) {
  let r = revCache.get(facts);
  if (r) return r;
  r = facts.files.map(() => []);
  facts.files.forEach((g, j) => g.imp.forEach((i) => r[i]?.push(j)));
  revCache.set(facts, r);
  return r;
}
function Ripple({ facts, idx, onOpen }) {
  const [hov, setHov] = useState(null);
  const rings = useMemo(() => {
    const rev = reverseOf(facts);
    const seen = new Set([idx]);
    const out = [];
    let front = [idx];
    for (let d = 0; d < 3 && front.length; d++) {
      const next = [];
      for (const i of front)
        for (const j of rev[i])
          if (!seen.has(j)) {
            seen.add(j);
            next.push(j);
          }
      if (next.length) out.push(next);
      front = next;
    }
    if (front.length) {
      let more = 0;
      const q = [...front];
      while (q.length) {
        const i = q.pop();
        for (const j of rev[i])
          if (!seen.has(j)) {
            seen.add(j);
            more++;
            q.push(j);
          }
      }
      if (more) out.more = more;
    }
    return out;
  }, [facts, idx]);
  const total = rings.reduce((a, r) => a + r.length, 0) + (rings.more || 0);
  if (!total) return null;
  const pct = Math.max(1, Math.round((total / facts.files.length) * 100));
  const width = 260,
    center = width / 2,
    radius = [44, 78, 112];
  return (
    <div className="ripple">
      <svg viewBox={`0 0 ${width} ${width}`} width={width} height={width} aria-hidden="true">
        {rings.map((_, d) => (
          <circle
            key={d}
            cx={center}
            cy={center}
            r={radius[d]}
            className="rp-ring"
            style={{ animationDelay: `${d * 0.25}s` }}
          />
        ))}
        {rings.map((ring, d) =>
          ring.slice(0, Math.floor(radius[d] / 1.6)).map((j, k, arr) => {
            const dr = Math.max(2.2, Math.min(5.5, ((Math.PI * radius[d]) / arr.length) * 0.55));
            const a = (k / arr.length) * Math.PI * 2 - Math.PI / 2 + d * 0.4;
            const file = facts.files[j];
            return (
              <circle
                key={j}
                cx={center + Math.cos(a) * radius[d]}
                cy={center + Math.sin(a) * radius[d]}
                r={hov === j ? dr + 2.5 : dr}
                fill={LAYER[file.layer]?.[3] || 'var(--ink-3)'}
                className="rp-dot"
                style={{ animationDelay: `${0.15 + d * 0.25 + k * 0.01}s` }}
                onMouseEnter={() => setHov(j)}
                onMouseLeave={() => setHov(null)}
                onClick={() => onOpen(file.p)}
              />
            );
          }),
        )}
        <circle cx={center} cy={center} r={13} className="rp-core" />
      </svg>
      <div className="rp-text">
        <div className="mini-h">if this file changes</div>
        <div className="rp-big">
          <b>{total}</b> file{total === 1 ? '' : 's'} could feel it
        </div>
        <div className="rp-sub">
          {hov != null ? (
            <>
              <b>{displayName(facts.files[hov].p)}</b> · {facts.files[hov].p}
            </>
          ) : (
            <>
              That’s {pct}% of the project.{' '}
              {rings.map((ring, d) => (
                <span key={d} className="rp-hop">
                  {d === 0 ? 'use it directly' : `${d + 1} steps away`}:{' '}
                  <b>
                    {ring.length}
                    {d === rings.length - 1 && rings.more ? `+${rings.more}` : ''}
                  </b>
                </span>
              ))}
            </>
          )}
        </div>
        <div className="rp-term">
          The word for this is <b>coupling</b>. The ring of files a change can reach is its{' '}
          <b>blast radius</b>.{' '}
          {total / facts.files.length > 0.25
            ? 'This one is wide, so change it carefully and test a lot.'
            : 'This one is contained, so it’s fairly safe to change.'}
        </div>
      </div>
    </div>
  );
}

// =====================================================================================================
const EXT_LANG = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  vue: 'Vue',
  svelte: 'Svelte',
  css: 'CSS',
  html: 'HTML',
  sql: 'SQL',
  sh: 'Shell',
};
function Drawer({
  onOthers,
  tour,
  p,
  facts,
  pathIdx,
  role,
  stack,
  onClose,
  onOpen,
  readFile,
  onExplain,
  onAsk,
  phone,
}) {
  const [text, setText] = useState(null);
  // a phone: what the file is about, or its code, one at a time (as a code app shows a file)
  // (a file nothing uses and that uses nothing opens on its code: there'd be nothing to say about it)
  const first = () => {
    const i = pathIdx.get(p);
    return i != null &&
      (facts.files[i].imp.length > 0 || facts.files.some((g) => g.imp.includes(i)))
      ? 'about'
      : 'code';
  };
  const [tab, setTab] = useState(first);
  useEffect(() => setTab(first()), [p]); // eslint-disable-line react-hooks/exhaustive-deps
  // a file outside the analysed sample: what we know from its name and its text
  const file = facts.files[pathIdx.get(p)] || {
    p,
    lang: EXT_LANG[(/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase()] || null,
    lines: text ? text.split('\n').length : 0,
    layer: Object.keys(LAYER).includes('logic') ? 'logic' : Object.keys(LAYER)[0],
    imp: [],
    ext: [],
    used: 0,
  };
  const [q, setQ] = useState('');
  const [others, setOthers] = useState(null);
  useEffect(() => {
    let on = true;
    setText(null);
    readFile(p)
      .then((t) => on && setText(t))
      .catch((e) => on && setText(`// ${e.message}`));
    return () => {
      on = false;
    };
  }, [p]);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  if (!file) return null;
  const idx = pathIdx.get(p);
  const usedBy = facts.files.filter((g) => g.imp.includes(idx));
  const uses = file.imp.map((j) => facts.files[j]);
  const tools = stack.filter((s) => s.used.includes(idx));
  const [, lname, , lcolor] = LAYER[file.layer];
  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className={`drawer ${phone ? `tab-${tab}` : ''}`} aria-label="File">
        <div className="dr-top">
          <span className="dr-layer" style={{ '--c': lcolor }}>
            {lname}
          </span>
          {file.entry && (
            <span className="dr-layer" style={{ '--c': 'var(--mint)' }}>
              starts here
            </span>
          )}
          <button className="ib dr-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {tour && (
          <div className="dr-tour">
            <span className="tour-n">{tour.i + 1}</span>
            <div>
              <div className="mini-h" style={{ margin: 0 }}>
                reading tour · {tour.i + 1} of {tour.steps.length}
              </div>
              <div className="dr-tour-w">{tour.steps[tour.i]?.why}</div>
            </div>
            <button className="ib" disabled={tour.i === 0} onClick={() => tour.go(tour.i - 1)}>
              ◀
            </button>
            <button className="btn tiny" onClick={() => tour.go(tour.i + 1)}>
              {tour.i + 1 < tour.steps.length ? 'Next file →' : 'Finish ✓'}
            </button>
          </div>
        )}
        <div className="dr-path">{p}</div>
        <h3 className="dr-role">{role(p)}</h3>
        <div className="dr-meta">
          {file.lang && (
            <>
              <span className="ldot" style={{ background: langColor(file.lang) }} />
              {file.lang} ·{' '}
            </>
          )}
          {file.lines.toLocaleString()} lines{file.used ? ` · ${file.used} files use it` : ''}
        </div>
        <div className="dr-actions">
          <button className="btn" disabled={!text} onClick={() => onExplain(p, text)}>
            Explain it line by line
          </button>
          {onOthers && file.lang && (
            <button
              className="btn ghost"
              disabled={!text || others === 'busy'}
              onClick={async () => {
                setOthers('busy');
                try {
                  await onOthers(p, text);
                  setOthers(null);
                } catch (e) {
                  setOthers(
                    String(e.message || e).replace(
                      /^Error invoking remote method '[^']+': (Error: )?/,
                      '',
                    ),
                  );
                }
              }}
            >
              {others === 'busy' ? 'Searching GitHub…' : 'How do others write this?'}
            </button>
          )}
        </div>
        {others && others !== 'busy' && <div className="dr-note">{others}</div>}
        {phone && (
          <div className="dr-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'about'}
              className={tab === 'about' ? 'on' : ''}
              onClick={() => setTab('about')}
            >
              About
            </button>
            <button
              role="tab"
              aria-selected={tab === 'code'}
              className={tab === 'code' ? 'on' : ''}
              onClick={() => setTab('code')}
            >
              Code{file.lines ? <span>{file.lines.toLocaleString()}</span> : null}
            </button>
          </div>
        )}
        {(!phone || tab === 'about') &&
          (uses.length > 0 || usedBy.length > 0 || tools.length > 0) && (
            <div className="dr-rel">
              {uses.length > 0 && (
                <div>
                  <div className="mini-h">it uses</div>
                  {uses.slice(0, 12).map((g) => (
                    <button key={g.p} className="rel" onClick={() => onOpen(g.p)}>
                      <span className="arrow out">→</span>
                      {displayName(g.p)}
                      <span className="muted">{role(g.p)}</span>
                    </button>
                  ))}
                </div>
              )}
              {usedBy.length > 0 && (
                <div>
                  <div className="mini-h">used by</div>
                  {usedBy.slice(0, 12).map((g) => (
                    <button key={g.p} className="rel" onClick={() => onOpen(g.p)}>
                      <span className="arrow in">←</span>
                      {displayName(g.p)}
                      <span className="muted">{role(g.p)}</span>
                    </button>
                  ))}
                  {usedBy.length > 12 && (
                    <div className="muted small">and {usedBy.length - 12} more</div>
                  )}
                </div>
              )}
              {tools.length > 0 && (
                <div>
                  <div className="mini-h">outside help</div>
                  <div className="dr-tools">
                    {tools.map((s) => (
                      <span key={s.id} className="ws">
                        <Brand slug={s.slug} name={s.name} color={s.color} size={18} plain />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        {(!phone || tab === 'about') && idx != null && (
          <Ripple facts={facts} idx={idx} onOpen={onOpen} />
        )}
        {(!phone || tab === 'code') && (
          <div className="dr-code">
            {text == null ? (
              <div className="pad">
                <div className="shimmer" />
                <div className="shimmer short" />
              </div>
            ) : (
              <Editor
                value={text.length > 60000 ? text.slice(0, 60000) + '\n// …' : text}
                lang={edLang(file.lang)}
                readOnly
                lens="code"
              />
            )}
          </div>
        )}
        <form
          className="dr-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onAsk(q.trim(), p);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about this file…"
            enterKeyHint="send"
          />
          {phone && (
            <button className="ask-go" aria-label="Ask" disabled={!q.trim()}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M12 19V5M6 11l6-6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </form>
      </aside>
    </>
  );
}
