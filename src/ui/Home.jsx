import { useEffect, useRef, useState } from 'react';
import { parseRepo } from './Explore.jsx';
import { Art } from './Onboarding.jsx';
import { IdeaArt } from './Ideas.jsx';
import Brand from './Brand.jsx';
import { IDEAS as CLEVER } from '../ideas.js';
import { langColor } from '../atlas/analyze.js';

const IDEAS = {
  explain: ['How does a hash map work?', 'Show me recursion with a picture', 'What is O(log n), really?', 'How do I make a bouncing ball?', 'What does async/await actually do?', 'How does a linked list work?', 'Explain sorting like I am 10'],
  feature: ['Add a dark mode toggle', 'Add a like button to posts', 'Let users search my notes', 'Save form drafts while typing'],
  code: ['Paste any code you want explained line by line…'],
  challenge: ['arrays', 'strings', 'recursion', 'objects & maps', 'off-by-one errors'],
};
const MODES = [['explain', 'Explain', '✦'], ['feature', 'Build a feature', '⌁'], ['code', 'Explain my code', '❮❯'], ['challenge', 'Challenge me', '⚑']];

// The last four weeks of learning, one bar per day (darker = more lessons and new words that day).
function LearnGrid({ days }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 27);
  const cells = []; let total = 0;
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) { const n = days[d.toDateString()] || 0; total += n ? 1 : 0; cells.push([new Date(d), n]); }
  const lvl = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4);
  return (
    <div className="lgrid" title={`${total} learning day${total === 1 ? '' : 's'} in the last 12 weeks`}>
      <div className="lg-cells">{cells.map(([d, n], i) => <i key={i} className={`l${lvl(n)} ${d.getTime() === today.getTime() ? 'today' : ''}`} title={`${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n ? `${n} thing${n === 1 ? '' : 's'} learned` : 'nothing yet'}`} />)}</div>
      <span className="lg-cap">{total} day{total === 1 ? '' : 's'} in 4 weeks</span>
    </div>
  );
}

export default function Home({ onAsk, settings, setSettings, project, setProject, onPickFolder, onPickRepo, repos, loadRepos, samples, onOpen, challenge, user, recent, providers, onOpenRepo, onExplore, onIdea, onWords, onScratch, onDaily, onSetup, onSuggest, onSim, words = {}, stats }) {
  const [picks, setPicks] = useState(() => { try { const c = JSON.parse(localStorage.getItem('bento.picks') || 'null'); return c && c.day === new Date().toDateString() ? c.items : null; } catch { return null; } });
  useEffect(() => { if (picks || !user || !repos?.length || !onSuggest) return; onSuggest(repos).then((items) => { if (items?.length) { setPicks(items); localStorage.setItem('bento.picks', JSON.stringify({ day: new Date().toDateString(), items })); } }).catch(() => {}); }, [user, repos?.length]);
  const wordList = Object.values(words);
  const THEME = { games: 'maps', ai: 'data', data: 'data', systems: 'scale', web: 'together', bots: 'scale', apps: 'safety', art: 'maps' };
  const pool = CLEVER.filter((i) => !(settings.interests || []).length || (settings.interests || []).some((x) => THEME[x] === i.theme));
  const idea = (pool.length ? pool : CLEVER)[Math.floor(Date.now() / 86400000) % (pool.length || CLEVER.length)];
  const [mode, setMode] = useState('explain');
  const [q, setQ] = useState('');
  const [ph, setPh] = useState(0);
  const [repoMenu, setRepoMenu] = useState(false);
  const ta = useRef(null);
  useEffect(() => { if (user) loadRepos?.(); }, [user]);
  useEffect(() => { const t = setInterval(() => setPh((p) => p + 1), 3200); return () => clearInterval(t); }, []);
  useEffect(() => { ta.current?.focus(); }, [mode]);
  const ideas = IDEAS[mode];
  const placeholder = mode === 'code' ? 'Paste code here, or pick a file under Your code…' : mode === 'challenge' ? `A topic to practice: ${ideas[ph % ideas.length]}…` : ideas[ph % ideas.length];
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = user?.name?.split(' ')[0] || user?.login || '';
  const repoLink = mode === 'explain' && /github\.com\//.test(q) ? parseRepo(q) : null;
  const submit = () => {
    if (repoLink) { onOpenRepo(repoLink); setQ(''); return; }
    if (mode !== 'challenge' && !q.trim()) return;
    if (mode === 'feature' && (!project || project.loading)) return;
    onAsk(q.trim(), { mode, context: mode === 'code' ? { code: q } : undefined });
    setQ('');
  };
  const noModel = providers && !providers.claude && !providers.codex;

  return (
    <div className="home">
      <div className="home-inner">
        <div className="hello">{hello}{name ? `, ${name}` : ''}.</div>
        <h1 className="home-h">What do you want to <em>understand</em>?</h1>
        {stats && (stats.lessons + stats.words + stats.apps) > 0 && <div className="home-stats">{stats.streak > 1 && <span className="streak">🔥 <b>{stats.streak}</b>-day streak</span>}{[[stats.lessons, 'lesson', 'lessons'], [stats.ideas, 'clever idea', 'clever ideas'], [stats.words, 'word learned', 'words learned'], [stats.apps, 'app taken apart', 'apps taken apart']].filter(([n]) => n > 0).map(([n, a1, a2]) => <span key={a2}><b>{n}</b> {n === 1 ? a1 : a2}</span>)}{stats.days && Object.keys(stats.days).length > 0 && <LearnGrid days={stats.days} />}</div>}

        <div className={`composer mode-${mode}`}>
          <div className="modes">
            {MODES.map(([k, label, ic]) => <button key={k} className={`mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}><span className="mode-i">{ic}</span>{label}</button>)}
          </div>
          <textarea ref={ta} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} rows={mode === 'code' ? 7 : 2}
            className={mode === 'code' ? 'mono' : ''}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && mode !== 'code') { e.preventDefault(); submit(); } if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); submit(); } if (e.key === 'Tab' && !q && mode !== 'code') { e.preventDefault(); setQ(ideas[ph % ideas.length]); } }} />
          {mode === 'feature' && (
            <div className="proj-line">
              {project ? <span className="proj"><span className="proj-ic">{project.kind === 'github' ? '⌥' : '▢'}</span>in <b>{project.name}</b> · {project.loading ? <span className="warm">bringing it in…</span> : `${project.files.length} files`}<button className="link" onClick={() => setProject(null)}>change</button></span> : <span className="muted">Pick the project this feature is for:</span>}
              {!project && <>
                <button className="chip" onClick={onPickFolder}>Open a folder…</button>
                <span className="repo-pick">
                  <button className="chip" onClick={() => { setRepoMenu(!repoMenu); loadRepos(); }}>GitHub repo ▾</button>
                  {repoMenu && <div className="menu">{!repos ? <div className="muted pad">Loading…</div> : repos.length ? repos.map((r) => <button key={r.nameWithOwner} onClick={() => { setRepoMenu(false); onPickRepo(r.nameWithOwner); }}>{r.nameWithOwner}<span>{r.primaryLanguage?.name || ''}</span></button>) : <div className="muted pad">No repos (is gh signed in?)</div>}</div>}
                </span>
              </>}
            </div>
          )}
          <div className="comp-foot">
            <div className="pills">
              <Seg value={settings.lang} options={[['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['html', 'Web page']]} onChange={(v) => setSettings({ lang: v })} />
              <Seg value={settings.level} options={[['kid', 'new to code'], ['student', 'learning'], ['engineer', 'engineer']]} onChange={(v) => setSettings({ level: v })} />
            </div>
            <button className="send" onClick={submit} disabled={noModel || (mode === 'feature' && (!project || project.loading))}>{repoLink ? <>Take apart <b>{repoLink.split('/')[1]}</b></> : mode === 'challenge' ? 'Start' : 'Ask'}<kbd>↵</kbd></button>
          </div>
          {noModel && <div className="warn">No AI connected yet, so questions can’t be answered. The built-in lessons and races below still work. <button className="link" onClick={onSetup}>Connect Claude or ChatGPT →</button></div>}
        </div>

        <div className="starts">
          <div className="mini-h">or play with one of these</div>
          <div className="pebbles">
            {samples.map((s) => (
              <button key={s.id} className="pebble" onClick={() => onOpen(s)}>
                <Thumb id={s.id} />
                <div className="peb-t">{s.title}</div>
                <div className="peb-k"><span className={`lang-dot ${s.lang}`} />{s.kicker}</div>
              </button>
            ))}
            <button className="pebble" onClick={onScratch}>
              <Thumb id="scratch" />
              <div className="peb-t">Blank page</div>
              <div className="peb-k"><span className={`lang-dot ${settings.lang}`} />write your own</div>
            </button>
            <button className="pebble bug" onClick={() => (onDaily ? onDaily() : onOpen(challenge))}>
              <Thumb id="bug" />
              <div className="peb-t">Today’s bug</div>
              <div className="peb-k"><span className="lang-dot javascript" />2-minute challenge</div>
            </button>
          </div>
        </div>

        <div className="sims">
          <div className="mini-h">or learn anything by simulating it</div>
          <div className="sim-row">
            {[['🚗', 'Why do traffic jams appear from nowhere?'], ['💰', 'How does compound interest snowball?'], ['🦠', 'How does herd immunity stop an outbreak?'], ['🧠', 'How does a neural network learn?'], ['🗳', 'Why can polls of 1,000 people predict millions?'], ['🌍', 'How do forest fires spread?']].map(([e, q]) => (
              <button key={q} className="sim" onClick={() => (onSim ? onSim(q) : onAsk(`${q} Teach it by simulating it with a small program and a picture.`, { mode: 'explain' }))}><span>{e}</span>{q}</button>
            ))}
          </div>
        </div>

        <div className="mini-h doors-h">go deeper</div>
        <div className="doors">
          <button className="door" onClick={onExplore}>
            <Art kind="city" />
            <div className="door-k">explore code</div>
            <b>Take apart a real app</b>
            <span>Any GitHub project, as one picture: every part, the tools it uses, and why.</span>
          </button>
          {idea && (
            <button className="door" onClick={() => onIdea(idea)}>
              <div className="door-art"><IdeaArt kind={idea.art} /></div>
              <div className="door-k"><Brand slug={idea.slug} name={idea.company} size={14} plain /> idea of the day · {idea.company}</div>
              <b>{idea.title}</b>
              <span>{idea.hook}</span>
            </button>
          )}
          <button className="door" onClick={onWords}>
            <div className="door-words">{(wordList.length ? wordList.slice(-3) : [{ term: 'API' }, { term: 'webhook' }, { term: 'hash' }]).map((w, i) => <span key={i}>{w.term}</span>)}</div>
            <div className="door-k">your words</div>
            <b>{wordList.length ? `${wordList.length} word${wordList.length > 1 ? 's' : ''} learned` : 'Collect the language of code'}</b>
            <span>{wordList.length ? 'Review them as flashcards. Every lesson adds more.' : 'Every new technical word a lesson uses gets saved here, in plain English.'}</span>
          </button>
        </div>

        {user && repos?.length > 0 && (() => {
          const langs = {}; repos.forEach((r) => { const l = r.primaryLanguage?.name; if (l) langs[l] = (langs[l] || 0) + 1; });
          const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 3);
          const recentRepos = [...repos].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
          return (
            <div className="mine">
              <div className="mine-h"><img src={user.avatar} alt="" /><div><div className="mini-h" style={{ margin: 0 }}>from your GitHub</div><span>You mostly write {top.map(([l, n], i) => <span key={l}>{i ? (i === top.length - 1 ? ' and ' : ', ') : ''}<b>{l}</b></span>)}. Want to see your own code the way a newcomer would?</span></div></div>
              {picks?.length > 0 && <div className="picks"><span className="mini-h" style={{ margin: 0 }}>picked for you</span>{picks.map((p, i) => <button key={i} className="pick" onClick={() => onAsk(p.q, { mode: 'explain', lang: p.lang })}><b>{p.title}</b><span>{p.why}</span></button>)}</div>}
              <div className="mine-row">{recentRepos.map((r) => <button key={r.nameWithOwner} onClick={() => onOpenRepo(r.nameWithOwner)}><span className="ldot" style={{ background: langColor(r.primaryLanguage?.name) }} /><b>{r.name}</b>{r.isPrivate && <i>private</i>}<em>take apart →</em></button>)}</div>
            </div>
          );
        })()}

        {recent.length > 0 && (
          <div className="recent-home">
            <div className="mini-h">pick up where you left off</div>
            {recent.slice(0, 4).map((l) => <button key={l.id} className="next" onClick={() => onOpen(l)}><span className={`lang-dot ${l.lang}`} />{l.title || l.q}<span>→</span></button>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function Seg({ value, options, onChange, small }) {
  return <div className={`seg ${small ? 'small' : ''}`}>{options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

function Thumb({ id }) {
  if (id === 'sample-bst') return (
    <svg viewBox="0 0 120 70" className="thumb"><g stroke="var(--line-2)" strokeWidth="2"><line x1="60" y1="14" x2="34" y2="36" /><line x1="60" y1="14" x2="86" y2="36" /><line x1="34" y1="36" x2="20" y2="58" /><line x1="34" y1="36" x2="48" y2="58" /><line x1="86" y1="36" x2="100" y2="58" /></g>
      {[[60, 14, '#ff8a5b'], [34, 36, '#a78bfa'], [86, 36, '#a78bfa'], [20, 58, '#4cc9a0'], [48, 58, '#4cc9a0'], [100, 58, '#4cc9a0']].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="8" fill={c} />)}</svg>
  );
  if (id === 'sample-bigo') return (
    <svg viewBox="0 0 120 70" className="thumb"><path d="M10 62 Q 70 60 110 8" stroke="#ff8a5b" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M10 62 L110 46" stroke="#4cc9a0" strokeWidth="3" fill="none" strokeLinecap="round" /><text x="84" y="22" fontSize="10" fill="#ff8a5b" fontWeight="700">n²</text><text x="94" y="58" fontSize="10" fill="#16a37b" fontWeight="700">n</text></svg>
  );
  if (id === 'sample-spiral') return (
    <svg viewBox="0 0 120 70" className="thumb">{Array.from({ length: 70 }, (_, i) => { const a = i * 0.5, r = i * 0.42; return <circle key={i} cx={60 + Math.cos(a) * r} cy={35 + Math.sin(a) * r} r={1.4 + i * 0.02} fill={['#ff8a5b', '#ff5d8f', '#a78bfa', '#5aa9ff'][i % 4]} />; })}</svg>
  );
  if (id === 'sample-closure') return (
    <svg viewBox="0 0 120 70" className="thumb"><rect x="14" y="12" width="52" height="46" rx="10" fill="none" stroke="#a78bfa" strokeDasharray="4 3" strokeWidth="2" /><text x="22" y="30" fontSize="9" fill="#7c5cff" fontFamily="ui-monospace">outer()</text><path d="M66 36 L80 36" stroke="var(--ink-2)" strokeWidth="2" /><rect x="82" y="22" width="30" height="30" rx="8" fill="#ffe3d6" /><text x="88" y="41" fontSize="9" fill="#d9480f" fontFamily="ui-monospace">n=2</text></svg>
  );
  if (id === 'scratch') return (
    <svg viewBox="0 0 120 70" className="thumb">{[0, 1, 2].map((i) => <g key={i}><rect x="14" y={16 + i * 14} width={[34, 52, 26][i]} height="5" rx="2.5" fill={['#d9480f', '#6a45f5', '#2b8a3e'][i]} opacity=".55" /><rect x="72" y={16 + i * 14} width={[30, 22, 34][i]} height="5" rx="2.5" fill="var(--line-2)" /></g>)}<rect x={14 + 26 + 3} y="42" width="2" height="10" fill="var(--accent)"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" /></rect><line x1="64" y1="12" x2="64" y2="60" stroke="var(--line-2)" strokeDasharray="2 3" /></svg>
  );
  return (
    <svg viewBox="0 0 120 70" className="thumb">{[0, 1, 2, 3].map((i) => <g key={i}><circle cx="22" cy={14 + i * 14} r="4.5" fill={i === 2 ? '#ef476f' : '#4cc9a0'} /><rect x="34" y={11 + i * 14} width={50 + (i % 2) * 20} height="6" rx="3" fill="var(--line-2)" /></g>)}</svg>
  );
}
