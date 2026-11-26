import { useRef, useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { fmtN, setDupes, detectStack, measuredHotspots, guessRole } from '../atlas/analyze.js';
import { LANGS, BY_ID, CATS } from '../atlas/catalog.js';
import { t } from '../i18n.js';
import PhoneAtlas, { PHONE_SECTIONS } from './AtlasPhone.jsx';
import { onTop } from './atlas/phone/kit.jsx';
import BigPicture, { fallbackFlow } from './BigPicture.jsx';
import Brand from './Brand.jsx';
import City from './City.jsx';
import Contribute from './Contribute.jsx';
import Grow from './Grow.jsx';
import { useNarrow } from './Phone.jsx';
import { AskedBanner, AskBar } from './atlas/AskBar.jsx';
import { AtlasLoading } from './atlas/AtlasLoading.jsx';
import { Detective } from './atlas/Detective.jsx';
import { Drawer } from './atlas/FileDrawer.jsx';
import { FileList } from './atlas/FileExplorer.jsx';
import { Donut, Language, Hotspots } from './atlas/Overview.jsx';
import { Study } from './atlas/Study.jsx';
import { Toolbelt } from './atlas/Toolbelt.jsx';
import { mergeTools, findTool } from './atlas/toolModel.js';

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
