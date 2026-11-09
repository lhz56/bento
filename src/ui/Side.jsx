import { Fragment, useState } from 'react';

const bucket = (t) => { if (!t) return 'Earlier'; const d = new Date(t), n = new Date(); const days = Math.floor((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier'; };
const dayLabel = (l, prev) => { const b = bucket(l.createdAt); return !prev || bucket(prev.createdAt) !== b ? b : null; };
import { langColor } from '../atlas/analyze.js';
import Brand from './Brand.jsx';
import { ideaById } from '../ideas.js';

export const MODELS = [
  ['claude:sonnet', 'Claude Sonnet', 'claude'], ['claude:opus', 'Claude Opus', 'claude'], ['claude:haiku', 'Claude Haiku', 'claude'], ['codex:default', 'Codex', 'codex'],
];
export const modelLabel = (m) => MODELS.find((x) => x[0] === m)?.[1] || 'Claude';

export function Sidebar({ view, setView, lessons, current, onOpen, onNew, onDelete, settings, setSettings, providers, user, progress, projects = [], atlasKey, atlases = {}, onOpenProject, onForgetProject, onSetup, onSettings, siteKey }) {
  const [menu, setMenu] = useState(false);
  const [allL, setAllL] = useState(false); const [allP, setAllP] = useState(false);
  const mine = lessons.filter((l) => !l.builtin || l.touched).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const recent = allL ? mine : mine.slice(0, 30);
  const avail = MODELS.filter((m) => !providers || providers[m[2]]);
  return (
    <aside className="side">
      <div className="side-drag" />
      <div className="brand"><Logo /> bento</div>
      <button className="new" onClick={onNew}><span>＋</span>New question<kbd>⌘N</kbd></button>
      <button className="search-k" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}><span>⌕</span>Search everything<kbd>⌘K</kbd></button>
      <nav>
        <button className={view === 'home' ? 'on' : ''} onClick={() => setView('home')}><i className="ni">✦</i>Learn</button>
        <button className={view === 'path' ? 'on' : ''} onClick={() => setView('path')}><i className="ni">⤳</i>The path<span className="count">{Object.keys(progress.path || {}).length || ''}</span></button>
        <button className={view === 'explore' ? 'on' : ''} onClick={() => setView('explore')}><i className="ni">◈</i>Explore code</button>
        <button className={view === 'ideas' ? 'on' : ''} onClick={() => setView('ideas')}><i className="ni">⬡</i>Clever ideas</button>
        <button className={view === 'words' ? 'on' : ''} onClick={() => setView('words')}><i className="ni">Aa</i>Your words{Object.keys(progress.words || {}).length > 0 && <span className="count">{Object.keys(progress.words).length}</span>}</button>
        <button className={view === 'bug' ? 'on' : ''} onClick={() => setView('bug')}><i className="ni">⚑</i>Daily bug<span className="coins"><i className="coin" />{progress.coins ?? 5}</span></button>
      </nav>
      {projects.length > 0 && <>
        <div className="side-h">Projects</div>
        <div className="side-projects">
          {(allP ? projects : projects.slice(0, 5)).map((p) => {
            const st = atlases[p.key]?.status;
            return (
              <div key={p.key} className={`rl ${atlasKey === p.key || (p.kind === 'site' && view === 'site' && siteKey === p.name) ? 'on' : ''}`} onClick={() => onOpenProject(p)}>
                {p.kind === 'site' ? <span className="rl-ic">◎</span> : <span className="lang-dot" style={{ background: langColor(p.lang) }} />}
                <span className="rl-t">{p.kind === 'github' ? p.name.split('/')[1] : p.name}</span>
                {['cloning', 'reading', 'narrating'].includes(st) && <span className="rl-live" />}
                <button className="rl-x" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onForgetProject(p.key); }}>×</button>
              </div>
            );
          })}
          {projects.length > 5 && <button className="side-more" onClick={() => setAllP(!allP)}>{allP ? 'Show fewer' : `Show ${projects.length - 5} more`}</button>}
        </div>
      </>}
      <div className="side-h">Lessons</div>
      <div className="recent">
        {recent.length === 0 && <div className="side-empty">Your lessons will collect here.</div>}
        {recent.map((l, i) => (
          <Fragment key={l.id}>{dayLabel(l, recent[i - 1]) && <div className="rl-day">{dayLabel(l, recent[i - 1])}</div>}
          <div className={`rl ${current === l.id && view === 'lesson' ? 'on' : ''}`} onClick={() => onOpen(l)}>
            <LessonIcon l={l} />
            <span className="rl-t">{l.title || l.q || 'Untitled'}</span>
            {l.status === 'streaming' && <span className="rl-live" />}
            <button className="rl-x" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}>×</button>
          </div></Fragment>
        ))}
        {mine.length > 30 && <button className="side-more" onClick={() => setAllL(!allL)}>{allL ? 'Show fewer' : `Show ${mine.length - 30} older lessons`}</button>}
      </div>
      <div className="side-foot">
        {providers && !providers.claude && !providers.codex ? (
        <div className="model-pick none" onClick={() => onSetup?.()}><span className="mdot off" /><span>Connect an AI</span><span className="caret">→</span></div>
        ) : (
        <div className="model-pick" onClick={() => setMenu(!menu)}>
          <span className={`mdot ${settings.model.split(':')[0]}`} />
          <span>{modelLabel(settings.model)}</span><span className="caret">⌃</span>
          {menu && (
            <div className="menu up">
              <div className="menu-h">Runs on your own subscription</div>
              {avail.map(([k, l, p]) => <button key={k} className={settings.model === k ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setSettings({ model: k }); setMenu(false); }}><span className={`mdot ${p}`} />{l}</button>)}
              {avail.length === 0 && <div className="muted pad">Install the Claude Code or Codex CLI.</div>}
              <div className="menu-sep" />
              <button onClick={(e) => { e.stopPropagation(); setMenu(false); onSettings?.(); }}><span className="ni">⚙</span>Settings…<span>⌘,</span></button>
              <button onClick={(e) => { e.stopPropagation(); setMenu(false); onSetup?.(); }}><span className="ni">⇄</span>Connections & setup…</button>
            </div>
          )}
        </div>
        )}
        {user ? <img className="avatar" src={user.avatar} title={`GitHub: ${user.login}`} alt="" /> : <span className="avatar ph" title="GitHub not connected (run gh auth login)">⌥</span>}
      </div>
    </aside>
  );
}

function LessonIcon({ l }) {
  const g = l.race ? '↗' : l.mode === 'compare' ? '⇄' : l.mode === 'build' ? '⚒' : l.scratch ? '✎' : l.mode === 'challenge' ? '⚑' : l.mode === 'feature' ? '⌁' : l.context?.repo ? '◈' : null;
  const idea = l.mode === 'idea' && ideaById[l.context?.ideaId];
  if (idea) return <span className="rl-ic"><Brand slug={idea.slug} name={idea.company} size={13} plain /></span>;
  if (g) return <span className={`rl-ic g ${l.lang}`}>{g}</span>;
  return <span className={`lang-dot ${l.lang}`} />;
}

export function Logo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="logo">
      <rect x="1" y="1" width="18" height="18" rx="5.5" fill="var(--ink)" />
      <rect x="3.6" y="3.6" width="6.2" height="12.8" rx="2" fill="#ff8a5b" />
      <rect x="11.2" y="3.6" width="5.2" height="5.6" rx="1.8" fill="#4cc9a0" />
      <rect x="11.2" y="10.8" width="5.2" height="5.6" rx="1.8" fill="#a78bfa" />
    </svg>
  );
}
