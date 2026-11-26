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
import { t } from '../i18n.js';
import { fmtStars, bestBuiltin, projectNames, namesALesson } from '../findProject.js';
import { parseRepo } from './Explore.jsx';
import Icon from './Icons.jsx';
import IdeaFlow from './IdeaFlow.jsx';
import { mod, TOUCH } from '../platform.js';
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

export default function Home({
  builtins = [],
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
  user,
  providers,
  onOpenRepo,
  onScratch,
  onSetup,
  onSuggest,
  onSim,
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
  const [mi, ml, md] = MODE_INFO[mode];
  const hero = today.find((x) => x.k === 'path');
  const plan = today.filter((x) => x !== hero);
  const doneN = plan.filter((x) => x.done).length;
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
                            repos.map((repo) => (
                              <button
                                key={repo.nameWithOwner}
                                onClick={() => {
                                  setRepoMenu(false);
                                  onPickRepo(repo.nameWithOwner);
                                }}
                              >
                                {repo.nameWithOwner}
                                <span>{repo.primaryLanguage?.name || ''}</span>
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
                    {MODES.map(([modeId]) => {
                      const [i, l, d] = MODE_INFO[modeId];
                      return (
                        <button
                          key={modeId}
                          role="menuitemradio"
                          aria-checked={mode === modeId}
                          className={mode === modeId ? 'on' : ''}
                          onClick={() => {
                            setMode(modeId);
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
                {row.map((region) => {
                  const ds = skyDots.filter((d) => d.r === region.id);
                  return (
                    <span
                      key={region.id}
                      className="rm-area"
                      title={region.name}
                      style={{
                        flexGrow: Math.max(1, ds.length),
                        '--c': region.color,
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
        {repos.map((repo, i) => {
          const [owner, name] = repo.full.split('/');
          return (
            <button
              key={repo.full}
              ref={i === 0 ? first : null}
              className={`pc-card ${i === 0 ? 'main' : ''}`}
              onClick={() => onChoose(repo)}
            >
              <img
                className="pc-av"
                src={`https://avatars.githubusercontent.com/${owner}?size=96`}
                alt=""
              />
              <span className="pc-name">{name}</span>
              <span className="pc-meta">
                {owner} · ★ {fmtStars(repo.stars)}
              </span>
              {repo.description && <span className="pc-desc">{repo.description}</span>}
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
    circumference = 2 * Math.PI * r,
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
          strokeDasharray={`${circumference * f} ${circumference}`}
          transform="rotate(-90 24 24)"
        />
      </svg>
      <b>{i}</b>
    </span>
  );
}
