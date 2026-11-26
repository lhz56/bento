import { useEffect, useRef, useState } from 'react';
import {
  provOf,
  provider,
  providerName,
  altOf,
  mainWindow,
  level,
  usedText,
  resetText,
} from '../ai.js';
import { usePlans, Ring as PlanRing } from './Plans.jsx';
import { t, tx } from '../i18n.js';
import { fmtStars, bestBuiltin, projectNames, namesALesson } from '../findProject.js';
import { parseRepo } from './Explore.jsx';
import { Art } from './Onboarding.jsx';
import { IdeaArt } from './Ideas.jsx';
import Brand from './Brand.jsx';
import Icon from './Icons.jsx';
import IdeaFlow from './IdeaFlow.jsx';
import { IDEAS as CLEVER, ideaById } from '../ideas.js';
import { langColor } from '../atlas/analyze.js';
import { mod, keys, IS_MAC, TOUCH } from '../platform.js';
import { REGIONS } from '../skills.js';

const IDEAS = {
  explain: [
    'How does a hash map work?',
    'Show me recursion with a picture',
    'What is O(log n), really?',
    'How do I make a bouncing ball?',
    'What does async/await actually do?',
    'How does a linked list work?',
    'Explain sorting like I am 10',
  ],
  feature: [
    'Add a dark mode toggle',
    'Add a like button to posts',
    'Let users search my notes',
    'Save form drafts while typing',
  ],
  code: ['Paste any code you want explained line by line…'],
  challenge: ['arrays', 'strings', 'recursion', 'objects & maps', 'off-by-one errors'],
};
const MODES = [
  ['explain', 'Explain', '✦'],
  ['feature', 'Build a feature', '⌁'],
  ['code', 'Explain my code', '❮❯'],
  ['challenge', 'Challenge me', '⚑'],
];

// The last four weeks of learning, one bar per day (darker = more lessons and new words that day).
function LearnGrid({ days }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 27);
  const cells = [];
  let total = 0;
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const n = days[d.toDateString()] || 0;
    total += n ? 1 : 0;
    cells.push([new Date(d), n]);
  }
  const lvl = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4);
  return (
    <div
      className="lgrid"
      title={`${total} learning day${total === 1 ? '' : 's'} in the last 12 weeks`}
    >
      <div className="lg-cells">
        {cells.map(([d, n], i) => (
          <i
            key={i}
            className={`l${lvl(n)} ${d.getTime() === today.getTime() ? 'today' : ''}`}
            title={`${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n ? `${n} thing${n === 1 ? '' : 's'} learned` : 'nothing yet'}`}
          />
        ))}
      </div>
      <span className="lg-cap">
        {total} day{total === 1 ? '' : 's'} in 4 weeks
      </span>
    </div>
  );
}

export default function Home({
  builtins = [],
  threads = [],
  skyDots = [],
  about,
  onDropAbout,
  finding,
  choice,
  onChoose,
  onCancelFinding,
  today = [],
  onMap,
  lit = 0,
  onAsk,
  settings,
  setSettings,
  project,
  setProject,
  onPickFolder,
  onPickRepo,
  repos,
  loadRepos,
  samples,
  onOpen,
  challenge,
  user,
  recent,
  providers,
  onOpenRepo,
  onExplore,
  onIdea,
  onWords,
  onScratch,
  onDaily,
  onSetup,
  onSuggest,
  onSim,
  words = {},
  stats,
}) {
  const [picks, setPicks] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem('bento.picks') || 'null');
      return c && c.day === new Date().toDateString() ? c.items : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (picks || !user || !repos?.length || !onSuggest) return;
    onSuggest(repos)
      .then((items) => {
        if (items?.length) {
          setPicks(items);
          localStorage.setItem(
            'bento.picks',
            JSON.stringify({ day: new Date().toDateString(), items }),
          );
        }
      })
      .catch(() => {});
  }, [user, repos?.length]);
  const wordList = Object.values(words);
  const THEME = {
    games: 'maps',
    ai: 'data',
    data: 'data',
    systems: 'scale',
    web: 'together',
    bots: 'scale',
    apps: 'safety',
    art: 'maps',
  };
  const pool = CLEVER.filter(
    (i) =>
      !(settings.interests || []).length ||
      (settings.interests || []).some((x) => THEME[x] === i.theme),
  );
  const idea = (pool.length ? pool : CLEVER)[
    Math.floor(Date.now() / 86400000) % (pool.length || CLEVER.length)
  ];
  const [mode, setMode] = useState('explain');
  const [q, setQ] = useState('');
  const [ph, setPh] = useState(0);
  const [repoMenu, setRepoMenu] = useState(false);
  const ta = useRef(null);
  useEffect(() => {
    if (user) loadRepos?.();
  }, [user]);
  useEffect(() => {
    const t = setInterval(() => setPh((p) => p + 1), 4200);
    return () => clearInterval(t);
  }, []);
  // (not on a phone or iPad: the keyboard would come up, and the page jump to the box, every time you came back here)
  useEffect(() => {
    if (!TOUCH) ta.current?.focus();
  }, [mode]);
  const ideas = IDEAS[mode];
  // while the box is empty, it types out example questions, so there's always something to try
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (mode !== 'explain' || q) return undefined;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(ideas[ph % ideas.length]);
      return undefined;
    }
    const full = ideas[ph % ideas.length];
    let i = 0;
    let tm;
    const step = () => {
      i++;
      setTyped(full.slice(0, i));
      if (i < full.length) tm = setTimeout(step, 38 + Math.random() * 40);
    };
    setTyped('');
    tm = setTimeout(step, 250);
    return () => clearTimeout(tm);
  }, [ph, mode, q]);
  const placeholder =
    mode === 'code'
      ? 'Paste code here, or pick a file under Your code…'
      : mode === 'challenge'
        ? `A topic to practice: ${ideas[ph % ideas.length]}…`
        : typed || ' ';
  const hour = new Date().getHours();
  const hello =
    hour < 5
      ? 'Up late'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening';
  const name = user?.name?.split(' ')[0] || user?.login || '';
  const repoLink = mode === 'explain' && /github\.com\//.test(q) ? parseRepo(q) : null;
  const submit = () => {
    if (repoLink) {
      onOpenRepo(repoLink);
      setQ('');
      return;
    }
    if (noModel) return; // no AI connected: the note under the box says how to connect one
    if (mode !== 'challenge' && !q.trim()) return;
    if (mode === 'feature' && (!project || project.loading)) return;
    onAsk(q.trim(), { mode, context: mode === 'code' ? { code: q } : undefined });
    setQ('');
  };
  const checking = !providers;
  const noModel = checking || !providers[provOf(settings.model)];
  // the plan you're teaching with is nearly full (or full): say so here, with when it resets and what happens next
  const { limits } = usePlans();
  const prov = provOf(settings?.model);
  const pw = mainWindow(limits[prov]);
  const plv = level(pw);
  const alt = settings.autoFallback && altOf(settings?.model, providers);

  const MODE_INFO = {
    explain: ['✦', 'Explain', 'Ask anything, get a lesson'],
    feature: ['⌁', 'Build a feature', 'In your own project'],
    code: ['❮❯', 'Explain my code', 'Paste code, read it line by line'],
    challenge: ['⚑', 'Challenge me', 'Practise a topic'],
  };
  const LANGS = [
    ['python', 'Python'],
    ['javascript', 'JavaScript'],
    ['typescript', 'TypeScript'],
    ['html', 'Web page'],
  ];
  const LEVELS = [
    ['kid', 'new to code'],
    ['student', 'learning'],
    ['engineer', 'engineer'],
  ];
  const [menu, setMenu] = useState(null); // 'mode' | 'set' | null
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => {
      if (!e.target.closest?.('.cx-menu, .cx-pick')) setMenu(null);
    };
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [menu]);
  const tries = (
    picks?.length
      ? picks.map((p) => ({ q: p.q, label: p.title, lang: p.lang }))
      : IDEAS.explain.map((x) => ({ q: x, label: x }))
  ).slice(0, 3);
  const [mi, ml, md] = MODE_INFO[mode];
  const hero = today.find((x) => x.k === 'path');
  const plan = today.filter((x) => x !== hero);
  const doneN = plan.filter((x) => x.done).length;
  const ago = (at) => {
    if (!at) return '';
    const d = (Date.now() - at) / 1000;
    if (d < 90) return t('just now');
    if (d < 3600) return `${Math.round(d / 60)}m`;
    const day = new Date(at).toDateString();
    if (day === new Date().toDateString()) return `${Math.round(d / 3600)}h`;
    if (day === new Date(Date.now() - 864e5).toDateString()) return t('yesterday');
    return new Date(at).toLocaleDateString(
      undefined,
      d < 6 * 864e5 ? { weekday: 'short' } : { month: 'short', day: 'numeric' },
    );
  };
  const metaOf = (th) =>
    th.kind === 'project'
      ? [
          t('project'),
          th.asked ? `${th.asked} ${th.asked === 1 ? t('question') : t('questions')}` : null,
        ]
      : [
          th.stop ? `${t('path')} · ${t('stop')} ${th.stop}` : null,
          th.asked ? `${th.asked} ${th.asked === 1 ? t('question') : t('questions')}` : null,
          th.right ? `${th.right} ${t('right')}` : null,
          th.live ? t('writing…') : null,
        ];
  // already covered by a lesson that ships with Bento? offer it, ready now, before spending your AI on it
  const ready =
    mode === 'explain' &&
    q.trim().length > 5 &&
    !projectNames(q).some((n) => !namesALesson(n, builtins))
      ? bestBuiltin(q, builtins)
      : null; // never for a real project ("how does T3 Code work?")
  return (
    <div className="home split">
      <div className="sp-main">
        <div className="home-glow" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="sp-inner">
          <h1 className="sp-hello">
            {t(hello)}
            {name ? `, ${name}` : ''}.
          </h1>
          <p className="sp-sub">
            {t('Ask anything. Bento answers with a lesson you can run and play with.')}
          </p>

          <div className={`composer cx mode-${mode}`}>
            <textarea
              ref={ta}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              rows={mode === 'code' ? 7 : 2}
              aria-label={t(md)}
              className={mode === 'code' ? 'mono' : ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && mode !== 'code') {
                  e.preventDefault();
                  submit();
                }
                if (e.key === 'Enter' && mod(e)) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === 'Tab' && !q && mode !== 'code') {
                  e.preventDefault();
                  setQ(ideas[ph % ideas.length]);
                }
              }}
            />
            {mode === 'feature' && (
              <div className="proj-line">
                {project ? (
                  <span className="proj">
                    <span className="proj-ic">{project.kind === 'github' ? '⌥' : '▢'}</span>in{' '}
                    <b>{project.name}</b> ·{' '}
                    {project.loading ? (
                      <span className="warm">bringing it in…</span>
                    ) : (
                      `${project.files.length} files`
                    )}
                    <button className="link" onClick={() => setProject(null)}>
                      change
                    </button>
                  </span>
                ) : (
                  <span className="muted">{t('Which project?')}</span>
                )}
                {!project && (
                  <>
                    {!window.bento?.remote && (
                      <button className="chip" onClick={onPickFolder}>
                        Open a folder…
                      </button>
                    )}
                    <span className="repo-pick">
                      <button
                        className="chip"
                        onClick={() => {
                          setRepoMenu(!repoMenu);
                          loadRepos();
                        }}
                      >
                        GitHub repo ▾
                      </button>
                      {repoMenu && (
                        <div className="menu">
                          {!repos ? (
                            <div className="muted pad">Loading…</div>
                          ) : repos.length ? (
                            repos.map((r) => (
                              <button
                                key={r.nameWithOwner}
                                onClick={() => {
                                  setRepoMenu(false);
                                  onPickRepo(r.nameWithOwner);
                                }}
                              >
                                {r.nameWithOwner}
                                <span>{r.primaryLanguage?.name || ''}</span>
                              </button>
                            ))
                          ) : (
                            <div className="muted pad">No repos found.</div>
                          )}
                        </div>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="cx-foot">
              <div className="cx-pick">
                <button
                  className="cx-btn"
                  aria-haspopup="menu"
                  aria-expanded={menu === 'mode'}
                  onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
                >
                  <span className="cx-i">{mi}</span>
                  {t(ml)}
                  <Icon name="down" size={13} className="cx-caret" />
                </button>
                {menu === 'mode' && (
                  <div className="cx-menu" role="menu">
                    {MODES.map(([k]) => {
                      const [i, l, d] = MODE_INFO[k];
                      return (
                        <button
                          key={k}
                          role="menuitemradio"
                          aria-checked={mode === k}
                          className={mode === k ? 'on' : ''}
                          onClick={() => {
                            setMode(k);
                            setMenu(null);
                          }}
                        >
                          <span className="cx-i">{i}</span>
                          <span>
                            <b>{t(l)}</b>
                            <em>{t(d)}</em>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {mode !== 'feature' && (
                <div className="cx-pick">
                  <button
                    className="cx-btn quiet"
                    aria-haspopup="dialog"
                    aria-expanded={menu === 'set'}
                    onClick={() => setMenu(menu === 'set' ? null : 'set')}
                  >
                    <span className={`lang-dot ${settings.lang}`} />
                    {LANGS.find((x) => x[0] === settings.lang)?.[1]} ·{' '}
                    {t(LEVELS.find((x) => x[0] === settings.level)?.[1] || 'learning')}
                    <Icon name="down" size={13} className="cx-caret" />
                  </button>
                  {menu === 'set' && (
                    <div
                      className="cx-menu cx-set"
                      role="dialog"
                      aria-label={t('Language and level')}
                    >
                      <span className="mini-h">{t('code in')}</span>
                      <Seg
                        value={settings.lang}
                        options={LANGS}
                        onChange={(v) => setSettings({ lang: v })}
                      />
                      <span className="mini-h">{t('explain it for')}</span>
                      <Seg
                        value={settings.level}
                        options={LEVELS}
                        onChange={(v) => setSettings({ level: v })}
                      />
                    </div>
                  )}
                </div>
              )}
              {mode === 'explain' && about && !finding && (
                <span
                  className="ctx-chip"
                  title={t(
                    'You were just reading it. “It” and “this” in your question mean this project.',
                  )}
                >
                  {about.kind === 'github' ? (
                    <img
                      src={`https://avatars.githubusercontent.com/${about.full.split('/')[0]}?size=40`}
                      alt=""
                    />
                  ) : (
                    <span className="ctx-ic" aria-hidden="true">
                      ▢
                    </span>
                  )}
                  <b>{(about.full || about.name).split('/').pop()}</b>
                  <button
                    className="ctx-x"
                    aria-label={t('Not about this project')}
                    onClick={onDropAbout}
                  >
                    ✕
                  </button>
                </span>
              )}
              <button
                className="send round"
                onClick={submit}
                aria-label={
                  repoLink ? `Take apart ${repoLink}` : mode === 'challenge' ? t('Start') : t('Ask')
                }
                disabled={
                  (noModel && !repoLink) ||
                  (mode === 'feature' && (!project || project.loading)) ||
                  (mode !== 'challenge' && !q.trim() && !repoLink)
                }
              >
                {repoLink ? (
                  <>
                    Take apart <b>{repoLink.split('/')[1]}</b>
                  </>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                )}
              </button>
            </div>
            {finding && (
              <div className="finding fade-in" role="status">
                <span className="lens-spin" aria-hidden="true" />
                {t('Looking for')} <b>{finding.name}</b> {t('on this Mac and on GitHub…')}
                <button className="link" onClick={onCancelFinding}>
                  {t('Just explain it')}
                </button>
              </div>
            )}
            {!noModel && (
              <div className="cx-account">
                {providerName(prov)}
                {providers.accounts?.[prov] ? ' · ' + providers.accounts[prov] : ''}
              </div>
            )}
            {checking && (
              <div className="cx-account" role="status">
                Checking your AI connections…
              </div>
            )}
            {!checking && noModel && (
              <div className="warn">
                {providers.scanFailed
                  ? 'Bento couldn’t check your AI connections.'
                  : Object.entries(providers).some(
                        ([k, v]) => v === true && !['gh', 'dark'].includes(k),
                      )
                    ? 'Your selected AI isn’t ready.'
                    : 'No AI connected yet.'}{' '}
                Built-in lessons still work.{' '}
                <button className="link" onClick={onSetup}>
                  Connect an AI →
                </button>
              </div>
            )}
            {!noModel && pw && (plv === 'high' || plv === 'out') && (
              <div className={`plan-warn lv-${plv}`} role="status">
                <PlanRing used={pw.unlimited ? 0 : pw.used} lv={plv} size={16} />
                <span>
                  <b>{provider(prov).short || provider(prov).name}</b> · {usedText(pw, t)}
                  {pw.resetsAt ? ` · ${resetText(pw.resetsAt, Date.now(), t)}` : ''}.{' '}
                  {plv === 'out' ? (
                    alt ? (
                      <>
                        {t('Bento asks')} <b>{providerName(provOf(alt))}</b> {t('until then.')}
                      </>
                    ) : (
                      t('The built-in lessons still work meanwhile.')
                    )
                  ) : alt ? (
                    <>
                      {t('If it runs out, Bento switches to')} <b>{providerName(provOf(alt))}</b>.
                    </>
                  ) : null}
                </span>
              </div>
            )}
          </div>
          {ready && !finding && !choice && (
            <button
              className="cx-ready fade-in"
              onClick={() => {
                setQ('');
                ready.run();
              }}
            >
              <span className="cr-ic" aria-hidden="true">
                ▶
              </span>
              <span className="cr-t">
                {t('Ready now')}: <b>{ready.label}</b>
              </span>
              <em>{t('opens instantly, no AI needed')}</em>
            </button>
          )}
          {choice && <ProjectChoice choice={choice} onChoose={onChoose} />}

          <IdeaFlow
            samples={samples}
            onOpen={onOpen}
            onSim={onSim}
            onScratch={onScratch}
            onAsk={onAsk}
          />
        </div>
      </div>

      <aside className="sp-rail" aria-label={t('Today')}>
        <div className="sp-h">
          <span>{t('today')}</span>
          <span className="sp-date">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        {hero && (
          <button className="rail-hero" onClick={hero.go}>
            {hero.step && <Ring i={hero.step.i} n={hero.step.n} />}
            <span className="rh-t">
              <em>
                {t('Stop')} {hero.step?.i} {t('of')} {hero.step?.n}
                {hero.track && <span className="rh-path"> · {hero.track}</span>}
              </em>
              <b>{hero.label}</b>
            </span>
            <span className="rh-go">
              {t('Continue')}
              <Icon name="chevron" size={14} />
            </span>
          </button>
        )}
        {plan.length > 0 && (
          <div className="plan">
            <div className="plan-h">
              <span>{t('your plan')}</span>
              <span>
                {doneN}/{plan.length}
              </span>
            </div>
            {plan.map((x) => (
              <button
                key={x.k}
                className={`plan-row t-${x.k} ${x.done ? 'done' : ''}`}
                onClick={x.go}
              >
                <span className="pr-box" aria-hidden="true">
                  {x.done ? '✓' : ''}
                </span>
                <span className="pr-t">
                  <b>{x.label}</b>
                  <em>{x.sub}</em>
                </span>
                {x.mins && !x.done && (
                  <span className="pr-min">
                    {x.mins} {t('min')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {/* your map, small: the same treemap, each skill a cell that fills in as you prove it */}
        <button className="rail-map" onClick={onMap}>
          <span className="rm-grid" aria-hidden="true">
            {[REGIONS.slice(0, 3), REGIONS.slice(3)].map((row, k) => (
              <span key={k} className="rm-row">
                {row.map((R) => {
                  const ds = skyDots.filter((d) => d.r === R.id);
                  return (
                    <span
                      key={R.id}
                      className="rm-area"
                      title={R.name}
                      style={{
                        flexGrow: Math.max(1, ds.length),
                        '--c': R.color,
                        gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(Math.sqrt(ds.length * 2.2)))}, 1fr)`,
                      }}
                    >
                      {ds.map((d) => (
                        <i key={d.id} className={`lv${d.lv}`} />
                      ))}
                    </span>
                  );
                })}
              </span>
            ))}
          </span>
          <span className="rm-t">
            <b>{lit}</b>
            <span>
              {t('of')} {skyDots.length} {t('skills growing')}
            </span>
            <em>{t('your map')} →</em>
          </span>
        </button>
        <div className="rail-stats">
          <div>
            <b>{stats?.streak || 0}</b>
            <span>{t('day streak')}</span>
          </div>
          <div>
            <b>{stats?.words || 0}</b>
            <span>{stats?.words === 1 ? t('word') : t('words')}</span>
          </div>
          <div>
            <b>{stats?.lessons || 0}</b>
            <span>{stats?.lessons === 1 ? t('lesson') : t('lessons')}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

// "Is this about a real project?" Pictures first: each repo as a card, plus "just the idea".
function ProjectChoice({ choice, onChoose }) {
  const { d, q } = choice;
  const repos = [d.pick, ...(d.options || [])].filter((g) => g?.full);
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
  }, [choice]);
  return (
    <div className="pchoice fade-in" role="group" aria-label={t('Is this about a real project?')}>
      <div className="pc-h">
        <span className="pc-q">“{q.length > 70 ? q.slice(0, 70) + '…' : q}”</span>
        <b>{t('Is this about one of these?')}</b>
      </div>
      <div className="pc-row">
        {repos.map((g, i) => {
          const [owner, name] = g.full.split('/');
          return (
            <button
              key={g.full}
              ref={i === 0 ? first : null}
              className={`pc-card ${i === 0 ? 'main' : ''}`}
              onClick={() => onChoose(g)}
            >
              <img
                className="pc-av"
                src={`https://avatars.githubusercontent.com/${owner}?size=96`}
                alt=""
              />
              <span className="pc-name">{name}</span>
              <span className="pc-meta">
                {owner} · ★ {fmtStars(g.stars)}
              </span>
              {g.description && <span className="pc-desc">{g.description}</span>}
              <span className="pc-go">{t('Open the real code')} →</span>
            </button>
          );
        })}
        <button className="pc-card idea" onClick={() => onChoose(null)}>
          <span className="pc-av pc-idea" aria-hidden="true">
            ✦
          </span>
          <span className="pc-name">{t('Just the idea')}</span>
          <span className="pc-desc">{t('A lesson with a small example of my own')}</span>
          <span className="pc-go">{t('Write a lesson')} →</span>
        </button>
      </div>
    </div>
  );
}

export function Seg({ value, options, onChange, small }) {
  return (
    <div className={`seg ${small ? 'small' : ''}`}>
      {options.map(([k, l]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// progress around the path's next stop
function Ring({ i, n }) {
  const r = 20,
    c = 2 * Math.PI * r,
    f = Math.max(0.04, (i - 1) / n);
  return (
    <span className="hc-ring" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="48" height="48">
        <circle cx="24" cy="24" r={r} className="hr-bg" />
        <circle
          cx="24"
          cy="24"
          r={r}
          className="hr-fg"
          strokeDasharray={`${c * f} ${c}`}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <b>{i}</b>
    </span>
  );
}

function Thumb({ id }) {
  if (id === 'sim-traffic')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        <ellipse
          cx="60"
          cy="35"
          rx="44"
          ry="21"
          fill="none"
          stroke="var(--line-2)"
          strokeWidth="9"
        />
        {[0, 0.5, 0.9, 1.25, 1.55, 2.6, 3.5, 4.3, 5.1, 5.7].map((a, k) => {
          const bunched = a > 0.4 && a < 1.7;
          return (
            <rect
              key={k}
              x={60 + Math.cos(a) * 44 - 3.5}
              y={35 + Math.sin(a) * 21 - 2.5}
              width="7"
              height="5"
              rx="1.6"
              fill={bunched ? '#ef476f' : '#4cc9a0'}
              transform={`rotate(${(a * 180) / Math.PI + 90} ${60 + Math.cos(a) * 44} ${35 + Math.sin(a) * 21})`}
            />
          );
        })}
      </svg>
    );
  if (id === 'sim-herd')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        {Array.from({ length: 45 }, (_, k) => {
          const x = 16 + (k % 9) * 11,
            y = 13 + Math.floor(k / 9) * 11;
          const sick = [12, 13, 21, 22, 23].includes(k);
          const safe = (k * 7) % 5 !== 0;
          return (
            <circle
              key={k}
              cx={x}
              cy={y}
              r="3.6"
              fill={sick ? '#ef476f' : safe ? '#4cc9a0' : 'var(--line-2)'}
            />
          );
        })}
      </svg>
    );
  if (id === 'sample-bst')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        <g stroke="var(--line-2)" strokeWidth="2">
          <line x1="60" y1="14" x2="34" y2="36" />
          <line x1="60" y1="14" x2="86" y2="36" />
          <line x1="34" y1="36" x2="20" y2="58" />
          <line x1="34" y1="36" x2="48" y2="58" />
          <line x1="86" y1="36" x2="100" y2="58" />
        </g>
        {[
          [60, 14, '#ff8a5b'],
          [34, 36, '#a78bfa'],
          [86, 36, '#a78bfa'],
          [20, 58, '#4cc9a0'],
          [48, 58, '#4cc9a0'],
          [100, 58, '#4cc9a0'],
        ].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r="8" fill={c} />
        ))}
      </svg>
    );
  if (id === 'sample-bigo')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        <path
          d="M10 62 Q 70 60 110 8"
          stroke="#ff8a5b"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M10 62 L110 46"
          stroke="#4cc9a0"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <text x="84" y="22" fontSize="10" fill="#ff8a5b" fontWeight="700">
          n²
        </text>
        <text x="94" y="58" fontSize="10" fill="#16a37b" fontWeight="700">
          n
        </text>
      </svg>
    );
  if (id === 'sample-spiral')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        {Array.from({ length: 70 }, (_, i) => {
          const a = i * 0.5,
            r = i * 0.42;
          return (
            <circle
              key={i}
              cx={60 + Math.cos(a) * r}
              cy={35 + Math.sin(a) * r}
              r={1.4 + i * 0.02}
              fill={['#ff8a5b', '#ff5d8f', '#a78bfa', '#5aa9ff'][i % 4]}
            />
          );
        })}
      </svg>
    );
  if (id === 'sample-closure')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        <rect
          x="14"
          y="12"
          width="52"
          height="46"
          rx="10"
          fill="none"
          stroke="#a78bfa"
          strokeDasharray="4 3"
          strokeWidth="2"
        />
        <text x="22" y="30" fontSize="9" fill="#7c5cff" fontFamily="ui-monospace">
          outer()
        </text>
        <path d="M66 36 L80 36" stroke="var(--ink-2)" strokeWidth="2" />
        <rect x="82" y="22" width="30" height="30" rx="8" fill="#ffe3d6" />
        <text x="88" y="41" fontSize="9" fill="#d9480f" fontFamily="ui-monospace">
          n=2
        </text>
      </svg>
    );
  if (id === 'scratch')
    return (
      <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x="14"
              y={16 + i * 14}
              width={[34, 52, 26][i]}
              height="5"
              rx="2.5"
              fill={['#d9480f', '#6a45f5', '#2b8a3e'][i]}
              opacity=".55"
            />
            <rect
              x="72"
              y={16 + i * 14}
              width={[30, 22, 34][i]}
              height="5"
              rx="2.5"
              fill="var(--line-2)"
            />
          </g>
        ))}
        <rect x={14 + 26 + 3} y="42" width="2" height="10" fill="var(--accent)">
          <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
        </rect>
        <line x1="64" y1="12" x2="64" y2="60" stroke="var(--line-2)" strokeDasharray="2 3" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 70" className="thumb" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx="22" cy={14 + i * 14} r="4.5" fill={i === 2 ? '#ef476f' : '#4cc9a0'} />
          <rect
            x="34"
            y={11 + i * 14}
            width={50 + (i % 2) * 20}
            height="6"
            rx="3"
            fill="var(--line-2)"
          />
        </g>
      ))}
    </svg>
  );
}
