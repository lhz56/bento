import { useEffect, useState } from 'react';
import Brand from './Brand.jsx';

// First run: say what Bento is, find the AI subscriptions already on this Mac, learn a little about the person.
// Nothing gets installed or signed in for them; we only look, and show the exact command when something is missing.

const CONNS = [
  { id: 'claude', name: 'Claude Code', slug: 'claude', what: 'Your Claude subscription (Pro or Max)', install: 'npm install -g @anthropic-ai/claude-code', login: 'claude', loginHint: 'Run it once in Terminal and sign in with your Claude account.' },
  { id: 'codex', name: 'Codex', slug: '', color: '#111', what: 'Your ChatGPT subscription (Plus or Pro)', install: 'npm install -g @openai/codex', login: 'codex login', loginHint: 'Signs in with your ChatGPT account in the browser.' },
  { id: 'gh', name: 'GitHub', slug: 'github', what: 'Optional: your repos, private ones too', install: 'brew install gh', login: 'gh auth login', loginHint: 'Lets Bento read your repos and fork projects you like.' },
];
const LEVELS = [['kid', 'Totally new', 'I’ve never written code. Explain everything with everyday examples.', '🌱'], ['student', 'I know a little', 'I’ve seen some code. Teach me the real words as we go.', '🌿'], ['engineer', 'I write code', 'Skip the basics, show me trade-offs and how pros do it.', '🌳']];
const INTERESTS = [['games', 'Games', '🎮'], ['web', 'Websites', '🌐'], ['ai', 'AI', '✳'], ['data', 'Data', '📊'], ['bots', 'Bots', '🤖'], ['apps', 'Phone apps', '📱'], ['art', 'Art & visuals', '🎨'], ['systems', 'How big apps scale', '🏙']];

export default function Onboarding({ api, settings, setSettings, onDone, startAt = 0 }) {
  const [step, setStep] = useState(startAt);
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [level, setLevel] = useState(settings.level || 'student');
  const [lang, setLang] = useState(settings.lang || 'python');
  const [interests, setInterests] = useState(settings.interests || []);
  const [voice, setVoice] = useState(settings.voice || (/^es/.test(navigator.language) ? 'Español' : /^pt/.test(navigator.language) ? 'Português' : /^fr/.test(navigator.language) ? 'Français' : /^de/.test(navigator.language) ? 'Deutsch' : /^zh/.test(navigator.language) ? '中文' : /^ja/.test(navigator.language) ? '日本語' : /^ko/.test(navigator.language) ? '한국어' : /^hi/.test(navigator.language) ? 'हिन्दी' : 'English'));
  const [copied, setCopied] = useState(null);
  const doScan = async () => { setScanning(true); setScan(null); const t0 = Date.now(); try { const r = await api.scan(); await new Promise((ok) => setTimeout(ok, Math.max(0, 1300 - (Date.now() - t0)))); setScan(r); } catch { setScan({}); } setScanning(false); };
  useEffect(() => { if (step === 1 && !scan && !scanning) doScan(); }, [step]);
  const ready = (c) => scan?.[c]?.installed && scan?.[c]?.loggedIn;
  const anyModel = ready('claude') || ready('codex');
  const model = ready('claude') ? 'claude:sonnet' : ready('codex') ? 'codex:default' : settings.model;
  const copy = (t) => { navigator.clipboard?.writeText(t); setCopied(t); setTimeout(() => setCopied(null), 1400); };
  const finish = (go) => { setSettings({ onboarded: true, level, lang, interests, model, voice }); onDone(go); };

  return (
    <div className="onb">
      <div className="onb-drag" />
      <div className="onb-dots">{[0, 1, 2, 3].map((i) => <i key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}</div>

      {step === 0 && (
        <div className="onb-pane welcome" key="w">
          <div className="onb-logo"><span className="b1" /><span className="b2" /><span className="b3" /></div>
          <h1>Learn how software is <em>really</em> built.</h1>
          <p className="onb-sub">The AI you already pay for, turned into a patient tutor. Real code, run in front of you, explained in plain words.</p>
          <div className="onb-promises">
            <div><SeeIt /><b>See it</b><span>Any app, pulled apart into a picture.</span></div>
            <div><RunIt /><b>Run it</b><span>Watch code run, one line at a time.</span></div>
            <div><OwnIt /><b>Own it</b><span>Your own AI plan. Nothing hosted.</span></div>
          </div>
          <button className="onb-go" onClick={() => setStep(1)}>Let’s set you up <span>→</span></button>
        </div>
      )}

      {step === 1 && (
        <div className="onb-pane" key="c">
          <div className="onb-k">step 1 · your AI</div>
          <h2>Looking for what’s already on this Mac…</h2>
          <p className="onb-sub small">Bento borrows the brains of the AI tools you’re signed into. Your subscription, your machine.</p>
          <div className="conns">
            {CONNS.map((c, i) => {
              const r = scan?.[c.id];
              const state = !scan ? 'wait' : !r?.installed ? 'missing' : !r.loggedIn ? 'login' : 'ok';
              return (
                <div key={c.id} className={`conn s-${state}`} style={{ animationDelay: `${i * 90}ms` }}>
                  <Brand slug={c.slug} name={c.name} color={c.color} size={42} />
                  <div className="conn-main">
                    <div className="conn-top"><b>{c.name}</b>{c.id === 'gh' && <span className="opt">optional</span>}</div>
                    <div className="conn-what">
                      {state === 'wait' && <span className="scan-line">checking…</span>}
                      {state === 'ok' && <>{c.id === 'gh' ? <>Signed in as <b>{r.user}</b></> : <>Signed in{r.plan ? <> · <b>{r.plan[0].toUpperCase() + r.plan.slice(1)}</b> plan</> : r.method ? <> with {r.method}</> : null}</>}{r.version ? <span className="ver">v{r.version}</span> : null}</>}
                      {state === 'login' && <>Installed, but not signed in. {c.loginHint}</>}
                      {state === 'missing' && <>{c.what}. Not installed yet.</>}
                    </div>
                    {(state === 'login' || state === 'missing') && (
                      <button className="cmd" onClick={() => copy(state === 'missing' ? c.install : c.login)}>
                        <span className="cmd-p">$</span>{state === 'missing' ? c.install : c.login}<span className="cmd-c">{copied === (state === 'missing' ? c.install : c.login) ? 'copied ✓' : 'copy'}</span>
                      </button>
                    )}
                  </div>
                  <span className={`conn-state ${state}`}>{state === 'wait' ? <span className="lens-spin" /> : state === 'ok' ? '✓' : state === 'login' ? '!' : '+'}</span>
                </div>
              );
            })}
          </div>
          {scan && (
            <div className={`route ${anyModel ? 'ok' : 'no'}`}>
              {anyModel ? <><span className="route-dot" />Bento will teach with <b>{ready('claude') ? 'Claude Sonnet' : 'Codex'}</b>{ready('claude') && ready('codex') ? ' (switch to Codex any time, bottom-left)' : ''}. Quick answers use a faster model from the same plan.</>
                : <>No AI found yet. Copy a command above into Terminal, then press <b>Scan again</b>. The built-in lessons work meanwhile.</>}
            </div>
          )}
          <div className="onb-nav">
            <button className="btn ghost" onClick={doScan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan again'}</button>
            <button className="onb-go small" onClick={() => setStep(2)}>{anyModel ? 'Continue' : 'Skip for now'} <span>→</span></button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onb-pane" key="y">
          <div className="onb-k">step 2 · about you</div>
          <h2>How much code have you seen?</h2>
          <div className="levels">
            {LEVELS.map(([k, t, d, e]) => <button key={k} className={`lvl ${level === k ? 'on' : ''}`} onClick={() => setLevel(k)}><span className="lvl-e">{e}</span><b>{t}</b><span>{d}</span></button>)}
          </div>
          <div className="onb-voice"><span className="mini-h" style={{ margin: 0 }}>explain things in</span><select className="set-sel" value={voice} onChange={(e) => setVoice(e.target.value)}>{['English', 'Español', 'Português', 'Français', 'Deutsch', 'Italiano', 'Nederlands', 'Polski', 'Türkçe', 'Русский', 'Українська', 'العربية', 'हिन्दी', 'বাংলা', 'Bahasa Indonesia', 'Tiếng Việt', 'ไทย', 'Filipino', '中文', '日本語', '한국어', 'Kiswahili'].map((v) => <option key={v}>{v}</option>)}</select><span className="muted small">Code stays in English.</span></div>
          <div className="onb-row">
            <div>
              <div className="mini-h">first programming language</div>
              <div className="langpick">
                {[['python', 'Python', 'python', 'Reads almost like English. Great first pick.'], ['javascript', 'JavaScript', 'javascript', 'Runs every website. Great if you love the web.']].map(([k, n, slug, d]) => (
                  <button key={k} className={`lp ${lang === k ? 'on' : ''}`} onClick={() => setLang(k)}><Brand slug={slug} name={n} size={30} plain /><span><b>{n}</b><i>{d}</i></span></button>
                ))}
              </div>
            </div>
            <div>
              <div className="mini-h">what are you curious about?</div>
              <div className="interests">
                {INTERESTS.map(([k, l, e]) => <button key={k} className={`int ${interests.includes(k) ? 'on' : ''}`} onClick={() => setInterests((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]))}><span>{e}</span>{l}</button>)}
              </div>
            </div>
          </div>
          <div className="onb-nav">
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="onb-go small" onClick={() => setStep(3)}>Continue <span>→</span></button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onb-pane" key="r">
          <div className="onb-k">all set</div>
          <h2>Where do you want to start?</h2>
          <div className="starts3">
            <button className="s3" onClick={() => finish('explore')}><Art kind="city" /><b>Take apart a real app</b><span>Pick any open-source project and see how it’s built, as a picture.</span></button>
            <button className="s3" onClick={() => finish('ideas')}><Art kind="hex" /><b>Read a clever idea</b><span>How Uber, Google and Discord solved hard problems, with code you can run.</span></button>
            {level === 'engineer'
              ? <button className="s3" onClick={() => finish('home')}><Art kind="code" /><b>Ask anything</b><span>“How does consistent hashing work?” Get a lesson with live code.</span></button>
              : <button className="s3" onClick={() => finish('path')}><Art kind="code" /><b>Start from zero</b><span>Eleven short stops from “what is a program?” to your first app.</span></button>}
          </div>
        </div>
      )}
    </div>
  );
}

// Three tiny living scenes for the welcome screen: a city that builds itself, code that runs, your AI plugging in.
function SeeIt() {
  const B = [[18, 30, '#ff8a5b'], [40, 52, '#5aa9ff'], [62, 22, '#a78bfa'], [84, 44, '#4cc9a0'], [106, 16, '#ffc94d'], [128, 36, '#5aa9ff'], [150, 26, '#ff8a5b']];
  return (
    <svg viewBox="0 0 180 84" className="pr-art see" aria-hidden="true">
      <path d="M6 76 H174" stroke="var(--line-2)" strokeDasharray="2 4" />
      {B.map(([x, h, c], i) => <g key={i} className="pr-b" style={{ '--d': `${i * 0.18}s` }}><rect x={x} y={76 - h} width="16" height={h} rx="3" fill={c} /><rect x={x} y={76 - h} width="16" height="5" rx="2" fill="#fff" opacity=".35" /></g>)}
    </svg>
  );
}
function RunIt() {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT((x) => (x + 1) % 8), 700); return () => clearInterval(id); }, []);
  const line = [0, 1, 2, 1, 2, 1, 2, 3][t]; const n = [0, 0, 1, 1, 2, 2, 3, 3][t];
  const L = [['total', ' = 0'], ['for', ' i in 1..3'], ['  total', ' += i'], ['print', '(total)']];
  return (
    <div className="pr-art run" aria-hidden="true">
      <div className="pr-code">{L.map(([a, b], i) => <div key={i} className={i === line ? 'on' : ''}><em>{a}</em>{b}</div>)}<span className="pr-hl" style={{ transform: `translateY(${line * 17}px)` }} /></div>
      <div className="pr-var"><span>total</span><b key={n}>{[0, 1, 3, 6][n]}</b></div>
    </div>
  );
}
function OwnIt() {
  return (
    <div className="pr-art own" aria-hidden="true">
      <div className="pr-ais"><span><Brand slug="claude" name="Claude" size={18} plain /></span><span><Brand slug="" name="Codex" color="#111" size={18} plain /></span></div>
      <svg viewBox="0 0 60 60" className="pr-wires"><path d="M2 16 C 30 16, 30 30, 58 30" /><path d="M2 44 C 30 44, 30 30, 58 30" /></svg>
      <div className="onb-logo mini"><span className="b1" /><span className="b2" /><span className="b3" /></div>
    </div>
  );
}

export function Art({ kind }) {
  if (kind === 'city') return (
    <svg viewBox="0 0 120 70" className="s3-art">{[[20, 40, 18, '#ff8a5b'], [34, 34, 28, '#5aa9ff'], [48, 42, 14, '#a78bfa'], [62, 36, 24, '#4cc9a0'], [76, 44, 10, '#ff8a5b'], [90, 38, 20, '#5aa9ff']].map(([x, y, h, c], i) => <g key={i}><path d={`M${x} ${y} l7 -4 l7 4 v${-h + 10} l-7 -4 l-7 4 Z`} fill={c} opacity=".25" /><path d={`M${x} ${y - h + 10} l7 -4 l7 4 l-7 4 Z`} fill={c} /><path d={`M${x} ${y - h + 10} l7 4 v${h - 6} l-7 -4 Z`} fill={c} opacity=".55" /><path d={`M${x + 7} ${y - h + 14} l7 -4 v${h - 6} l-7 4 Z`} fill={c} opacity=".8" /></g>)}</svg>
  );
  if (kind === 'hex') return (
    <svg viewBox="0 0 120 70" className="s3-art">{Array.from({ length: 18 }, (_, i) => { const c = i % 6, r = Math.floor(i / 6); const x = 22 + c * 15 + (r % 2) * 7.5, y = 18 + r * 13; return <path key={i} d={hexPath(x, y, 8)} fill={[3, 8, 9, 14].includes(i) ? '#ff8a5b' : [2, 10, 15].includes(i) ? '#ffd2bf' : 'none'} stroke="var(--line-2)" />; })}</svg>
  );
  return (
    <svg viewBox="0 0 120 70" className="s3-art"><rect x="14" y="12" width="56" height="46" rx="6" fill="var(--panel)" stroke="var(--line-2)" />{[0, 1, 2, 3].map((i) => <rect key={i} x={20 + (i % 2) * 6} y={20 + i * 9} width={20 + ((i * 13) % 22)} height="4" rx="2" fill={['#d9480f', '#6a45f5', '#2b8a3e', '#1c74d6'][i]} opacity=".7" />)}{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={78 + i * 7} y={52 - [12, 20, 30, 24, 36][i]} width="5" height={[12, 20, 30, 24, 36][i]} rx="2" fill="#4cc9a0" />)}</svg>
  );
}
export const hexPath = (x, y, r) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return `${k ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`; }).join(' ') + 'Z';
