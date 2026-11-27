// First run: say what Bento is, find the AI subscriptions already on this Mac, learn a little about the person.
// Nothing gets installed or signed in for them; we only look, and show the exact command when something is missing.
import { useEffect, useState } from 'react';
import Brand from './Brand.jsx';
import { PROVIDERS, GITHUB } from '../ai.js';

const WIN =
  typeof navigator !== 'undefined' && /Win/.test(navigator.platform || navigator.userAgent || '');
const SHELL = WIN ? 'PowerShell' : 'Terminal';

// Every AI Bento can teach with (electron/ai-catalog.json), then GitHub. Install commands that work on this Mac:
// Homebrew or npm when you have them (scan.tools says which); Claude Code's own installer needs nothing else.
// (on Windows, the catalog's "win" commands: PowerShell, winget and npm)
const CONNS = [...PROVIDERS.map((p) => ({ ...p, ai: true })), { ...GITHUB, ai: false }].map((c) =>
  WIN && c.win ? { ...c, ...c.win } : c,
);
const howTo = (c, state, scan) => {
  const tl = scan?.tools || {};
  const r = scan?.[c.id] || {};
  if (state === 'missing') {
    const i = c.install.find((x) => !x.needs || tl[x.needs]);
    return i
      ? { action: 'install', cmd: i.cmd }
      : {
          link: c.download || 'https://nodejs.org/en/download',
          need: c.download ? null : 'Needs Node.js first',
        };
  }
  if (state === 'old') return { action: 'update', cmd: (r.brew && c.updateBrew) || c.update };
  if (state === 'login') return { action: 'signIn', cmd: c.signIn };
  return null;
};
const VERB = { install: 'Install', update: 'Update', signIn: 'Sign in' };
const HINT_MAC = {
  claude:
    'Opens Claude Code in Terminal. Type /login if it asks, then sign in with your Claude account.',
  codex: 'Signs in with your ChatGPT account in the browser.',
  antigravity:
    'Opens Antigravity in Terminal: sign in with the Google account that has your AI Pro plan, then close Terminal.',
  gemini:
    'Opens Gemini in Terminal. Use a Gemini API key (free from Google AI Studio) or a Google Cloud project: Google no longer lets personal accounts sign in here.',
  copilot:
    'Signs in with your GitHub account in the browser. Copilot Free is included with GitHub.',
  gh: 'Lets Bento read your repos, and gives Copilot a sign-in.',
};
const HINT = Object.fromEntries(
  Object.entries(HINT_MAC).map(([k, v]) => [k, WIN ? v.replace(/Terminal/g, 'PowerShell') : v]),
);
const LEVELS = [
  [
    'kid',
    'Totally new',
    'I’ve never written code. Explain everything with everyday examples.',
    '🌱',
  ],
  ['student', 'I know a little', 'I’ve seen some code. Teach me the real words as we go.', '🌿'],
  ['engineer', 'I write code', 'Skip the basics, show me trade-offs and how pros do it.', '🌳'],
];
const INTERESTS = [
  ['games', 'Games', '🎮'],
  ['web', 'Websites', '🌐'],
  ['ai', 'AI', '✳'],
  ['data', 'Data', '📊'],
  ['bots', 'Bots', '🤖'],
  ['apps', 'Phone apps', '📱'],
  ['art', 'Art & visuals', '🎨'],
  ['systems', 'How big apps scale', '🏙'],
];

export default function Onboarding({ api, settings, setSettings, onDone, startAt = 0 }) {
  const [step, setStep] = useState(startAt);
  const [scan, setScan] = useState(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [level, setLevel] = useState(settings.level || 'student');
  const [lang, setLang] = useState(settings.lang || 'python');
  const [interests, setInterests] = useState(settings.interests || []);
  const [voice, setVoice] = useState(
    settings.voice ||
      (/^es/.test(navigator.language)
        ? 'Español'
        : /^pt/.test(navigator.language)
          ? 'Português'
          : /^fr/.test(navigator.language)
            ? 'Français'
            : /^de/.test(navigator.language)
              ? 'Deutsch'
              : /^zh/.test(navigator.language)
                ? '中文'
                : /^ja/.test(navigator.language)
                  ? '日本語'
                  : /^ko/.test(navigator.language)
                    ? '한국어'
                    : /^hi/.test(navigator.language)
                      ? 'हिन्दी'
                      : 'English'),
  );
  const [copied, setCopied] = useState(null);
  const doScan = async () => {
    setScanning(true);
    setScanFailed(false);
    setScan(null);
    const t0 = Date.now();
    try {
      const r = await api.scan();
      await new Promise((ok) => setTimeout(ok, Math.max(0, 1300 - (Date.now() - t0))));
      setScan(r);
    } catch {
      setScanFailed(true);
    }
    setScanning(false);
  };
  useEffect(() => {
    if (step === 1 && !scan && !scanning) doScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- looks for AIs when you reach that step
  }, [step]);
  // back from Terminal after installing something: look again by itself
  useEffect(() => {
    if (step !== 1) return;
    const back = () => {
      setRunning(null);
      if (!scanning) doScan();
    };
    addEventListener('focus', back);
    return () => removeEventListener('focus', back);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- looks again when you come back from installing something, while on that step
  }, [step, scan, scanning]);
  const ready = (c) => scan?.[c]?.installed && scan?.[c]?.loggedIn && !scan?.[c]?.outdated;
  const readyAIs = PROVIDERS.filter((p) => ready(p.id));
  const anyModel = readyAIs.length > 0;
  // keep the model you chose if its AI is ready; otherwise the first one that is
  const model = readyAIs.some((p) => p.id === settings.model.split(':')[0])
    ? settings.model
    : readyAIs[0]?.default || settings.model;
  const [running, setRunning] = useState(null); // an install or sign-in started in Terminal
  const act = async (c, how) => {
    if (
      await api.aiTerminal?.(c.id, how.action, {
        ...scan?.tools,
        brewInstalled: !!scan?.[c.id]?.brew,
      })
    )
      setRunning(c.id);
    else copy(how.cmd);
  };
  const copy = (t) => {
    navigator.clipboard?.writeText(t);
    setCopied(t);
    setTimeout(() => setCopied(null), 1400);
  };
  const finish = (go) => {
    setSettings({ onboarded: true, level, lang, interests, model, voice });
    onDone(go);
  };
  const [more, setMore] = useState(false); // step 1: the other AIs, folded away once one is ready
  // step 3: the door that suits this person best, marked "for you" and the one Enter opens
  const pick =
    level === 'kid'
      ? 'path'
      : interests.includes('systems') || level === 'engineer'
        ? 'explore'
        : interests.some((x) => ['ai', 'data'].includes(x))
          ? 'ideas'
          : level === 'student'
            ? 'explore'
            : 'path';
  useEffect(() => {
    const key = (e) => {
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')
      )
        return;
      if (e.key === 'Enter' && !/^(BUTTON|A)$/.test(e.target?.tagName || '')) {
        e.preventDefault();
        if (step === 0) setStep(1);
        else if (step === 1 || step === 2) setStep(step + 1);
        else finish(pick);
      }
      if (e.key === 'Escape' && step > 0) {
        e.preventDefault();
        setStep(step - 1);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- these are everything finish() reads
  }, [step, pick, level, lang, interests, model, voice]);
  const teacher =
    PROVIDERS.find((p) => p.id === model.split(':')[0])?.models.find((m) => m.id === model)
      ?.label || readyAIs[0]?.name;
  const lvlName = LEVELS.find(([k]) => k === level)?.[1];

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Welcome to Bento">
      <div className="onb-drag" />
      <nav className="onb-dots" aria-label="Setup steps">
        {['Welcome', 'Your AI', 'About you', 'Start'].map((n, i) => (
          <button
            key={i}
            className={i === step ? 'on' : i < step ? 'past' : ''}
            onClick={() => i < step && setStep(i)}
            disabled={i >= step}
            aria-current={i === step ? 'step' : undefined}
            aria-label={n}
            title={i < step ? `Back to ${n.toLowerCase()}` : n}
          />
        ))}
      </nav>

      {step === 0 && (
        <div className="onb-pane welcome" key="w">
          <div className="onb-logo">
            <span className="b1" />
            <span className="b2" />
            <span className="b3" />
          </div>
          <h1>
            Learn how software is <em>really</em> built.
          </h1>
          <p className="onb-sub">
            The AI you already pay for, turned into a patient tutor.
            <br />
            Real code, run in front of you, in plain words.
          </p>
          <div className="onb-promises">
            <div>
              <SeeIt />
              <b>See it</b>
              <span>Any app, as one picture.</span>
            </div>
            <div>
              <RunIt />
              <b>Run it</b>
              <span>Code runs, line by line.</span>
            </div>
            <div>
              <OwnIt />
              <b>Own it</b>
              <span>Your AI plan. No account.</span>
            </div>
          </div>
          <button className="onb-go" onClick={() => setStep(1)} autoFocus>
            Get started <span>→</span>
          </button>
          <div className="onb-peek">
            <button
              className="link"
              onClick={() => {
                setSettings({ onboarded: true });
                onDone('sample');
              }}
            >
              or peek at a lesson first
            </button>
            <span className="onb-kbd">
              <kbd>↵</kbd> to start
            </span>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="onb-pane" key="c">
          <div className="onb-k">step 1 · your AI</div>
          {!scan && !scanFailed && (
            <>
              <h2>Looking for your AI…</h2>
              <p className="onb-sub small">
                Checking this {WIN ? 'PC' : 'Mac'} for Claude, ChatGPT, Gemini and Copilot.
              </p>
            </>
          )}
          {scanFailed && <h2>Couldn’t look for your AI.</h2>}
          {scan && anyModel && (
            <>
              <h2>
                {readyAIs.length === 1 ? (
                  <>
                    Found <em>{readyAIs[0].short || readyAIs[0].name}</em>. You’re ready.
                  </>
                ) : (
                  <>Found {readyAIs.length} AIs. You’re ready.</>
                )}
              </h2>
              <p className="onb-sub small">
                Bento teaches with the plan you already pay for. Nothing to set up.
              </p>
            </>
          )}
          {scan && !anyModel && (
            <>
              <h2>Pick an AI to teach with.</h2>
              <p className="onb-sub small">
                Any one is enough. Bento uses the plan you already pay for: no API key, no new
                account.
              </p>
            </>
          )}
          <div className={`conns ai4 ${scan && anyModel ? 'found' : ''}`}>
            {scanFailed && (
              <p role="alert">
                Bento couldn’t check your connections. Try Scan again, or continue with built-in
                lessons.
              </p>
            )}
            {!scanFailed &&
              [...CONNS]
                .sort((a, b) => (scan && b.ai && ready(b.id)) - (scan && a.ai && ready(a.id)))
                .filter((c) => !(scan && anyModel) || (c.ai && ready(c.id)) || more)
                .map((c, i) => {
                  const r = scan?.[c.id];
                  const state = !scan
                    ? 'wait'
                    : !r?.installed
                      ? 'missing'
                      : r.outdated
                        ? 'old'
                        : !r.loggedIn
                          ? 'login'
                          : 'ok';
                  const how = howTo(c, state, scan);
                  const busy = running === c.id;
                  return (
                    <div
                      key={c.id}
                      className={`conn s-${state} ${c.ai ? 'ai' : 'gh'} ${anyModel && state !== 'ok' ? 'quiet' : ''}`}
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <Brand slug={c.slug} name={c.name} color={c.color} size={38} />
                      <div className="conn-main">
                        <div className="conn-top">
                          <b>{c.name}</b>
                          {!c.ai && <span className="opt">optional</span>}
                        </div>
                        <div className="conn-what">
                          {state === 'wait' && <span className="scan-line">checking…</span>}
                          {state === 'ok' && (
                            <>
                              {c.id === 'gh' ? (
                                <>
                                  Signed in as <b>{r.user}</b>
                                </>
                              ) : (
                                <>
                                  Ready
                                  {r.plan ? (
                                    <>
                                      {' '}
                                      · <b>{r.plan}</b>
                                    </>
                                  ) : r.method && r.method !== c.name && r.method !== 'test' ? (
                                    <> · {r.method}</>
                                  ) : null}
                                </>
                              )}
                              {r.version ? <span className="ver">v{r.version}</span> : null}
                            </>
                          )}
                          {state === 'login' &&
                            (busy
                              ? `Finish signing in in ${SHELL}, then come back here.`
                              : HINT[c.id])}
                          {state === 'old' &&
                            (busy ? (
                              `Updating in ${SHELL}… come back when it’s done.`
                            ) : (
                              <>Version {r.version || '?'} can’t do everything Bento needs yet.</>
                            ))}
                          {state === 'missing' &&
                            (busy
                              ? `Installing in ${SHELL}… come back when it’s done.`
                              : c.ai
                                ? c.plan
                                : c.what)}
                        </div>
                        {how && (
                          <div className="cmd-row">
                            {how.cmd && api.aiTerminal && /Mac|Win/.test(navigator.platform) && (
                              <button
                                className={`btn small ${c.ai ? '' : 'ghost'}`}
                                onClick={() => act(c, how)}
                                disabled={busy}
                              >
                                {busy ? `In ${SHELL}…` : VERB[how.action]}
                              </button>
                            )}
                            {how.cmd && (
                              <button
                                className="cmd-copy"
                                onClick={() => copy(how.cmd)}
                                title={how.cmd}
                                aria-label={`Copy the command: ${how.cmd}`}
                              >
                                {copied === how.cmd ? 'Copied ✓' : 'or copy the command'}
                              </button>
                            )}
                            {how.link && (
                              <button
                                className="link small"
                                onClick={() => api.openExternal?.(how.link)}
                              >
                                {how.need || 'Download'} ↗
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {state !== 'missing' && (
                        <span className={`conn-state ${state}`} aria-hidden="true">
                          {state === 'wait' ? (
                            <span className="lens-spin" />
                          ) : state === 'ok' ? (
                            '✓'
                          ) : (
                            '!'
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
          </div>
          {scan && anyModel && (
            <button className="onb-more" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {more ? (
                'Hide the others'
              ) : (
                <>
                  Add another AI <span className="muted">(optional, for when one runs out)</span>
                </>
              )}
              <span className="onb-more-marks" aria-hidden="true">
                {!more &&
                  CONNS.filter((c) => !(c.ai && ready(c.id))).map((c) => (
                    <Brand key={c.id} slug={c.slug} name={c.name} color={c.color} size={20} plain />
                  ))}
              </span>
            </button>
          )}
          {scan && (
            <div className={`route ${anyModel ? 'ok' : 'no'}`} role="status">
              {anyModel ? (
                <>
                  <span className="route-dot" />
                  Bento will teach with{' '}
                  <b>
                    {PROVIDERS.find((p) => p.id === model.split(':')[0])?.models.find(
                      (m) => m.id === model,
                    )?.label || readyAIs[0].name}
                  </b>
                  {settings.autoFallback && readyAIs.length > 1 ? (
                    <>
                      . If it runs out, it asks{' '}
                      <b>
                        {readyAIs
                          .filter((p) => p.id !== model.split(':')[0])
                          .map((p) => p.short || p.name)
                          .join(', then ')}
                      </b>
                      .
                    </>
                  ) : (
                    '.'
                  )}{' '}
                  Quick answers use a faster model from the same AI.
                </>
              ) : (
                <>
                  Press <b>Install</b> on any one. Bento opens {SHELL} so you can watch, and looks
                  again when you come back. The built-in lessons work meanwhile.
                </>
              )}
            </div>
          )}
          {scan && (
            <p className="onb-fine">
              Signing in with a subscription uses that plan. An API key is billed by its provider.
            </p>
          )}
          <div className="onb-nav">
            <span className="onb-tools">
              <button className="btn ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button className="btn ghost" onClick={doScan} disabled={scanning}>
                {scanning ? 'Looking…' : 'Look again'}
              </button>
            </span>
            <button className="onb-go small" onClick={() => setStep(2)}>
              {anyModel ? 'Continue' : 'Continue without AI'} <span>→</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onb-pane" key="y">
          <div className="onb-k">step 2 · about you</div>
          <h2>How much code have you seen?</h2>
          <div className="levels">
            {LEVELS.map(([levelId, t, d, e]) => (
              <button
                key={levelId}
                className={`lvl ${level === levelId ? 'on' : ''}`}
                onClick={() => setLevel(levelId)}
              >
                <span className="lvl-e">{e}</span>
                <b>{t}</b>
                <span>{d}</span>
              </button>
            ))}
          </div>
          <div className="onb-voice">
            <span className="mini-h" style={{ margin: 0 }}>
              explain things in
            </span>
            <select className="set-sel" value={voice} onChange={(e) => setVoice(e.target.value)}>
              {[
                'English',
                'Español',
                'Português',
                'Français',
                'Deutsch',
                'Italiano',
                'Nederlands',
                'Polski',
                'Türkçe',
                'Русский',
                'Українська',
                'العربية',
                'हिन्दी',
                'বাংলা',
                'Bahasa Indonesia',
                'Tiếng Việt',
                'ไทย',
                'Filipino',
                '中文',
                '日本語',
                '한국어',
                'Kiswahili',
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <span className="muted small">Code stays in English.</span>
          </div>
          <div className="onb-row">
            <div>
              <div className="mini-h">first programming language</div>
              <div className="langpick">
                {[
                  ['python', 'Python', 'python', 'Reads almost like English. Great first pick.'],
                  [
                    'javascript',
                    'JavaScript',
                    'javascript',
                    'Runs every website. Great if you love the web.',
                  ],
                ].map(([k, n, slug, d]) => (
                  <button
                    key={k}
                    className={`lp ${lang === k ? 'on' : ''}`}
                    onClick={() => setLang(k)}
                  >
                    <Brand slug={slug} name={n} size={30} plain />
                    <span>
                      <b>{n}</b>
                      <i>{d}</i>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mini-h">what are you curious about?</div>
              <div className="interests">
                {INTERESTS.map(([interest, l, e]) => (
                  <button
                    key={interest}
                    className={`int ${interests.includes(interest) ? 'on' : ''}`}
                    onClick={() =>
                      setInterests((xs) =>
                        xs.includes(interest)
                          ? xs.filter((x) => x !== interest)
                          : [...xs, interest],
                      )
                    }
                  >
                    <span>{e}</span>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="onb-nav">
            <button className="btn ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="onb-go small" onClick={() => setStep(3)}>
              Continue <span>→</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onb-pane" key="r">
          <div className="onb-k">all set</div>
          <h2>Where do you want to start?</h2>
          <p className="onb-recap">
            {anyModel ? (
              <>
                Teaching with <b>{teacher}</b>
              </>
            ) : (
              <>Built-in lessons for now</>
            )}
            <i /> {lvlName}
            <i /> {lang === 'python' ? 'Python' : 'JavaScript'}
            {voice !== 'English' ? (
              <>
                <i /> {voice}
              </>
            ) : null}
            <button className="link" onClick={() => setStep(2)}>
              change
            </button>
          </p>
          <div className="starts3">
            {[
              [
                'explore',
                'city',
                'Take apart a real app',
                'Pick any open-source project and see how it’s built, as a picture.',
              ],
              [
                'ideas',
                'hex',
                'Read a clever idea',
                'How Uber, Google and Discord solved hard problems, with code you can run.',
              ],
              level === 'engineer'
                ? [
                    'home',
                    'code',
                    'Ask anything',
                    '“How does consistent hashing work?” Get a lesson with live code.',
                  ]
                : [
                    'path',
                    'code',
                    'Start from zero',
                    'Eleven short stops from “what is a program?” to your first app.',
                  ],
              [
                'puzzles',
                'puzzle',
                'Solve a puzzle',
                'Interview puzzles from the top down, raced from 10 items to a billion.',
              ],
            ].map(([go, art, t, d]) => (
              <button
                key={go}
                className={`s3 ${go === pick ? 'fy' : ''}`}
                onClick={() => finish(go)}
              >
                {go === pick && (
                  <span className="s3-pick">
                    For you · <kbd>↵</kbd>
                  </span>
                )}
                <Art kind={art} />
                <b>{t}</b>
                <span>{d}</span>
              </button>
            ))}
          </div>
          {level !== 'engineer' && (
            <button className="onb-ask" onClick={() => finish('home')}>
              or just ask anything <span>→</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Three tiny living scenes for the welcome screen: a city that builds itself, code that runs, your AI plugging in.
function SeeIt() {
  const blocks = [
    [18, 30, '#ff8a5b'],
    [40, 52, '#5aa9ff'],
    [62, 22, '#a78bfa'],
    [84, 44, '#4cc9a0'],
    [106, 16, '#ffc94d'],
    [128, 36, '#5aa9ff'],
    [150, 26, '#ff8a5b'],
  ];
  return (
    <svg viewBox="0 0 180 84" className="pr-art see" aria-hidden="true">
      <path d="M6 76 H174" stroke="var(--line-2)" strokeDasharray="2 4" />
      {blocks.map(([x, h, c], i) => (
        <g key={i} className="pr-b" style={{ '--d': `${i * 0.18}s` }}>
          <rect x={x} y={76 - h} width="16" height={h} rx="3" fill={c} />
          <rect x={x} y={76 - h} width="16" height="5" rx="2" fill="#fff" opacity=".35" />
        </g>
      ))}
    </svg>
  );
}
function RunIt() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => (x + 1) % 8), 700);
    return () => clearInterval(id);
  }, []);
  const line = [0, 1, 2, 1, 2, 1, 2, 3][t];
  const n = [0, 0, 1, 1, 2, 2, 3, 3][t];
  const codeLines = [
    ['total', ' = 0'],
    ['for', ' i in 1..3'],
    ['  total', ' += i'],
    ['print', '(total)'],
  ];
  return (
    <div className="pr-art run" aria-hidden="true">
      <div className="pr-code">
        {codeLines.map(([a, b], i) => (
          <div key={i} className={i === line ? 'on' : ''}>
            <em>{a}</em>
            {b}
          </div>
        ))}
        <span className="pr-hl" style={{ transform: `translateY(${line * 17}px)` }} />
      </div>
      <div className="pr-var">
        <span>total</span>
        <b key={n}>{[0, 1, 3, 6][n]}</b>
      </div>
    </div>
  );
}
function OwnIt() {
  return (
    <div className="pr-art own" aria-hidden="true">
      <div className="pr-ais four">
        {PROVIDERS.filter((p) => p.id !== 'gemini')
          .slice(0, 4)
          .map((p) => (
            <span key={p.id}>
              <Brand slug={p.slug} name={p.name} size={14} plain />
            </span>
          ))}
      </div>
      <svg viewBox="0 0 60 60" className="pr-wires" aria-hidden="true">
        <path d="M2 8 C 30 8, 30 30, 58 30" />
        <path d="M2 23 C 30 23, 30 30, 58 30" />
        <path d="M2 38 C 30 38, 30 30, 58 30" />
        <path d="M2 53 C 30 53, 30 30, 58 30" />
      </svg>
      <div className="onb-logo mini">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>
    </div>
  );
}

export function Art({ kind }) {
  if (kind === 'city')
    return (
      <svg viewBox="0 0 120 70" className="s3-art" aria-hidden="true">
        {[
          [20, 40, 18, '#ff8a5b'],
          [34, 34, 28, '#5aa9ff'],
          [48, 42, 14, '#a78bfa'],
          [62, 36, 24, '#4cc9a0'],
          [76, 44, 10, '#ff8a5b'],
          [90, 38, 20, '#5aa9ff'],
        ].map(([x, y, h, c], i) => (
          <g key={i}>
            <path d={`M${x} ${y} l7 -4 l7 4 v${-h + 10} l-7 -4 l-7 4 Z`} fill={c} opacity=".25" />
            <path d={`M${x} ${y - h + 10} l7 -4 l7 4 l-7 4 Z`} fill={c} />
            <path d={`M${x} ${y - h + 10} l7 4 v${h - 6} l-7 -4 Z`} fill={c} opacity=".55" />
            <path d={`M${x + 7} ${y - h + 14} l7 -4 v${h - 6} l-7 4 Z`} fill={c} opacity=".8" />
          </g>
        ))}
      </svg>
    );
  if (kind === 'puzzle')
    return (
      <svg viewBox="0 0 120 70" className="s3-art" aria-hidden="true">
        <path d="M14 60 H108 M14 60 V10" stroke="var(--line-2)" strokeWidth="1.5" />
        <path
          d="M16 58 C 60 56, 80 40, 104 10"
          fill="none"
          stroke="#ff8a5b"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M16 58 L104 44"
          fill="none"
          stroke="#4cc9a0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="96" y="22" fontSize="9" fill="#ff8a5b" fontFamily="ui-monospace">
          n²
        </text>
        <text x="98" y="56" fontSize="9" fill="#2b8a3e" fontFamily="ui-monospace">
          n
        </text>
      </svg>
    );
  if (kind === 'hex')
    return (
      <svg viewBox="0 0 120 70" className="s3-art" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => {
          const c = i % 6,
            r = Math.floor(i / 6);
          const x = 22 + c * 15 + (r % 2) * 7.5,
            y = 18 + r * 13;
          return (
            <path
              key={i}
              d={hexPath(x, y, 8)}
              fill={
                [3, 8, 9, 14].includes(i) ? '#ff8a5b' : [2, 10, 15].includes(i) ? '#ffd2bf' : 'none'
              }
              stroke="var(--line-2)"
            />
          );
        })}
      </svg>
    );
  return (
    <svg viewBox="0 0 120 70" className="s3-art" aria-hidden="true">
      <rect
        x="14"
        y="12"
        width="56"
        height="46"
        rx="6"
        fill="var(--panel)"
        stroke="var(--line-2)"
      />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={20 + (i % 2) * 6}
          y={20 + i * 9}
          width={20 + ((i * 13) % 22)}
          height="4"
          rx="2"
          fill={['#d9480f', '#6a45f5', '#2b8a3e', '#1c74d6'][i]}
          opacity=".7"
        />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={78 + i * 7}
          y={52 - [12, 20, 30, 24, 36][i]}
          width="5"
          height={[12, 20, 30, 24, 36][i]}
          rx="2"
          fill="#4cc9a0"
        />
      ))}
    </svg>
  );
}
export const hexPath = (x, y, r) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    return `${k ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ') + 'Z';
