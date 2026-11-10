import { Fragment, useEffect, useRef, useState } from 'react';
import { t, tx } from '../i18n.js';

const bucket = (t) => { if (!t) return 'Earlier'; const d = new Date(t), n = new Date(); const days = Math.floor((new Date(n.toDateString()) - new Date(d.toDateString())) / 864e5); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier'; };
const dayLabel = (l, prev) => { const b = bucket(l.createdAt); return !prev || bucket(prev.createdAt) !== b ? b : null; };
import { langColor } from '../atlas/analyze.js';
import Brand from './Brand.jsx';
import { ideaById } from '../ideas.js';
import { IS_MAC, keys } from '../platform.js';
import Icon from './Icons.jsx';
import { siClaude } from 'simple-icons';

// What each model is good at, in plain words, with two small meters
const MODEL_INFO = {
  'claude:sonnet': { what: 'The best all-rounder. Clear lessons and good code.', speed: 2, depth: 3, tag: 'recommended' },
  'claude:opus': { what: 'Thinks hardest. Slower, and uses more of your plan.', speed: 1, depth: 4 },
  'claude:haiku': { what: 'The fastest. Great for quick questions.', speed: 3, depth: 2 },
  'codex:default': { what: 'OpenAI’s coding model, on your ChatGPT plan.', speed: 2, depth: 3 },
};
const Meter = ({ n, max = 4, label }) => <span className="mm" aria-label={`${label}: ${n} of ${max}`}><em>{label}</em>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
const ProviderMark = ({ p }) => p === 'claude'
  ? <span className="pm claude" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15"><path d={siClaude.path} fill="currentColor" /></svg></span>
  : <span className="pm codex" aria-hidden="true">◎</span>;

function ModelPicker({ settings, setSettings, providers, onClose, onSettings, onSetup }) {
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('.mc.on, .mc:not(:disabled)')?.focus(); }, []);
  const key = (e) => {
    const items = [...box.current.querySelectorAll('.mc:not(:disabled)')]; const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };
  const fast = settings.model.startsWith('codex') ? 'Codex' : 'Claude Haiku';
  return (
    <div className="menu up mpick" role="menu" aria-label={t('Choose your AI')} ref={box} onKeyDown={key} onClick={(e) => e.stopPropagation()}>
      <div className="mp-h"><b>{t('Your AI')}</b><span>{t('Runs on your own plan. No keys.')}</span></div>
      {MODELS.map(([k, label, prov]) => {
        const ready = !providers || providers[prov]; const I = MODEL_INFO[k] || {}; const on = settings.model === k;
        return (
          <button key={k} role="menuitemradio" aria-checked={on} disabled={!ready} className={`mc ${on ? 'on' : ''}`} onClick={() => { setSettings({ model: k }); onClose(); }}>
            <ProviderMark p={prov} />
            <span className="mc-t"><b>{label}{I.tag && <em>{t(I.tag)}</em>}</b><span>{t(I.what || '')}</span>
              <span className="mc-m"><Meter n={I.speed || 2} max={3} label={t('speed')} /><Meter n={I.depth || 2} max={4} label={t('depth')} /></span></span>
            {on ? <span className="mc-tick" aria-hidden="true">✓</span> : !ready ? <span className="mc-off">{t('not set up')}</span> : null}
          </button>
        );
      })}
      {providers && (!providers.claude || !providers.codex) && <button role="menuitem" className="mp-connect" onClick={() => { onClose(); onSetup?.(); }}>+ {t('Connect')} {!providers.claude ? 'Claude' : 'Codex'} →</button>}
      <div className="mp-note">⚡ {t('Quick answers use')} <b>{fast}</b>{t(', the fastest model of the same kind.')}</div>
      <div className="menu-sep" />
      <button role="menuitem" className="mp-row" onClick={() => { onClose(); onSettings?.(); }}><Icon name="gear" size={15} />{t('Settings…')}<span>{keys('⌘,')}</span></button>
    </div>
  );
}

export const MODELS = [
  ['claude:sonnet', 'Claude Sonnet', 'claude'], ['claude:opus', 'Claude Opus', 'claude'], ['claude:haiku', 'Claude Haiku', 'claude'], ['codex:default', 'Codex', 'codex'],
];
export const modelLabel = (m) => MODELS.find((x) => x[0] === m)?.[1] || 'Claude';

// Five places, one list of what you've been doing, one footer. Pages that belong together are tabs on the page.
export const GROUPS = [
  { id: 'learn', label: 'Learn', icon: 'learn', views: [['home', 'Learn']] },
  { id: 'explore', label: 'Explore', icon: 'explore', views: [['explore', 'Code'], ['ideas', 'Clever ideas']] },
  { id: 'practice', label: 'Practice', icon: 'practice', views: [['puzzles', 'Puzzles'], ['play', 'Playgrounds']], extra: ['bug', 'Daily bug'] },
  { id: 'path', label: 'Path', icon: 'path', views: [['path', 'The path']] },
  { id: 'you', label: 'You', icon: 'you', views: [['map', 'Your map'], ['words', 'Your words']] },
];
export const groupOf = (view) => GROUPS.find((g) => g.views.some(([v]) => v === view)) || (['atlas', 'site', 'compare'].includes(view) ? GROUPS[1] : null);
const lastTab = (g) => { try { const v = JSON.parse(localStorage.getItem('bento.lastTab') || '{}')[g.id]; return g.views.some(([x]) => x === v) ? v : g.views[0][0]; } catch { return g.views[0][0]; } };
export const rememberTab = (view) => { const g = GROUPS.find((x) => x.views.some(([v]) => v === view)); if (!g || g.views.length < 2) return; try { const m = JSON.parse(localStorage.getItem('bento.lastTab') || '{}'); m[g.id] = view; localStorage.setItem('bento.lastTab', JSON.stringify(m)); } catch {} };

export function Sidebar({ progress = {}, onClose, closed, view, setView, lessons, current, onOpen, onNew, onDelete, settings, setSettings, providers, user, projects = [], atlasKey, atlases = {}, onOpenProject, onForgetProject, onSetup, onSettings, siteKey }) {
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const mine = lessons.filter((l) => !l.builtin || l.touched);
  // lessons and projects in one list, newest first
  const items = [
    ...projects.map((p) => ({ kind: 'project', key: `p:${p.key}`, at: p.at || 0, p })),
    ...mine.map((l) => ({ kind: 'lesson', key: `l:${l.id}`, at: l.createdAt || 0, l })),
  ].sort((a, b) => b.at - a.at);
  const shown = items.slice(0, more ? 60 : 9);
  const avail = MODELS.filter((m) => !providers || providers[m[2]]);
  const active = groupOf(view)?.id || null;
  const ai = GROUPS.findIndex((g) => g.id === active);
  const search = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: IS_MAC, ctrlKey: !IS_MAC }));
  useEffect(() => { if (!menu) return undefined; const close = () => setMenu(false); addEventListener('click', close); return () => removeEventListener('click', close); }, [menu]);
  return (
    <aside className="side" aria-label={t('Sidebar')} inert={closed || undefined} aria-hidden={closed || undefined}>
      <div className="side-drag" />
      <div className="brand"><Logo /> <span>bento</span>
        <button className="side-search" onClick={onClose} aria-label={`${t('Hide the sidebar')} (${keys('⌘\\')})`} title={`${t('Hide the sidebar')}  ${keys('⌘\\')}`}><Icon name="sidebar" size={16} /></button>
        <button className="side-search" onClick={search} aria-label={`${t('Search everything')} (${keys('⌘K')})`} title={`${t('Search everything')}  ${keys('⌘K')}`}><Icon name="search" size={16} /></button>
      </div>
      <button className="new" onClick={onNew}><Icon name="plus" size={16} />{t('New question')}<kbd>{keys('⌘N')}</kbd></button>
      <nav aria-label={t('Main')}>
        <span className="nav-pill" aria-hidden="true" style={{ transform: `translateY(${Math.max(0, ai) * 34}px)`, opacity: ai >= 0 ? 1 : 0 }} />
        {GROUPS.map((g) => (
          <button key={g.id} className={active === g.id ? 'on' : ''} aria-current={active === g.id ? 'page' : undefined} onClick={() => setView(active === g.id && g.views.some(([v]) => v === view) ? view : lastTab(g))}>
            <Icon name={g.icon} />{t(g.label)}
          </button>
        ))}
      </nav>
      <div className="side-h">{t('Recent')}</div>
      <div className="recent shelf-list">
        {shown.length === 0 && <div className="side-empty">{t('What you ask and open shows up here.')}</div>}
        {shown.map((it, idx) => <Fragment key={`g${it.key}`}>{(idx === 0 || bucket(it.at) !== bucket(shown[idx - 1].at)) && <div className="rl-day">{t(bucket(it.at))}</div>}{it.kind === 'project' ? (() => {
          const p = it.p; const st = atlases[p.key]?.status;
          const on = (view === 'atlas' && atlasKey === p.key) || (p.kind === 'site' && view === 'site' && siteKey === p.name);
          return (
            <div key={it.key} className={`rl ${on ? 'on' : ''}`}>
              <button className="rl-main" aria-current={on ? 'page' : undefined} onClick={() => onOpenProject(p)}>
                {p.kind === 'github' ? <img className="rl-av" src={`https://avatars.githubusercontent.com/${(p.full || p.key).split('/')[0]}?size=32`} alt="" /> : <span className="rl-ic"><Icon name={p.kind === 'site' ? 'globe' : 'folder'} size={13} /></span>}
                <span className="rl-t">{p.kind === 'github' ? (p.full || p.name).split('/').pop() : p.name}</span>
                {['cloning', 'reading', 'narrating'].includes(st) && <span className="rl-live" />}
              </button>
              <button className="rl-x" aria-label={t('Remove')} onClick={(e) => { e.stopPropagation(); onForgetProject(p.key); }}><Icon name="close" size={12} /></button>
            </div>
          );
        })() : (
          <div key={it.key} className={`rl ${current === it.l.id && view === 'lesson' ? 'on' : ''}`}>
            <button className="rl-main" aria-current={current === it.l.id && view === 'lesson' ? 'page' : undefined} onClick={() => onOpen(it.l)}>
              <LessonIcon l={it.l} path={Object.values(progress.path || {}).includes(it.l.id)} />
              <span className="rl-t">{it.l.title || it.l.q || 'Untitled'}</span>
              {it.l.status === 'streaming' && <span className="rl-live" />}
            </button>
            <button className="rl-x" aria-label={t('Remove')} onClick={(e) => { e.stopPropagation(); onDelete(it.l.id); }}><Icon name="close" size={12} /></button>
          </div>
        )}</Fragment>)}
        {items.length > 9 && <button className="side-more" onClick={() => setMore(!more)}>{more ? t('Show fewer') : `${t('Show more')} · ${items.length - 9}`}</button>}
      </div>
      <UpdatePill />
      <div className="side-foot">
        {providers && !providers.claude && !providers.codex ? (
          <button className="model-pick none" onClick={() => onSetup?.()}><span className="mdot off" /><span>{t('Connect an AI')}</span><Icon name="chevron" size={14} /></button>
        ) : (
          <div className="model-wrap">
            <button className="model-pick" aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>
              <span className={`mdot ${settings.model.split(':')[0]}`} /><span className="mp-name" title={modelLabel(settings.model)}>{modelLabel(settings.model).replace(/^Claude /, '')}</span><Icon name="up" size={14} className="caret" />
            </button>
            {menu && <ModelPicker settings={settings} setSettings={setSettings} providers={providers} onClose={() => setMenu(false)} onSettings={onSettings} onSetup={onSetup} />}
          </div>
        )}
        {window.bento?.usage && providers && (providers.claude || providers.codex) && <UsageMeter compact />}
        {user ? <img className="avatar" src={user.avatar} title={`GitHub: ${user.login}`} alt={`GitHub: ${user.login}`} /> : <span className="avatar ph" title="GitHub not connected (run gh auth login)"><Icon name="folder" size={13} /></span>}
      </div>
    </aside>
  );
}

// A new version finished downloading in the background: one quiet pill, restart when you like (or it installs on quit).
function UpdatePill() {
  const [st, setSt] = useState(null);
  const [fresh, setFresh] = useState(null); // just updated: say so once
  useEffect(() => {
    const u = window.bento?.update; if (!u) return;
    u.get().then((x) => {
      setSt(x);
      const seen = localStorage.getItem('bento.seenVersion');
      if (!seen) localStorage.setItem('bento.seenVersion', x.current); // first run: nothing to announce
      else if (x.current && seen !== x.current) setFresh(x.current);
    }).catch(() => {});
    return u.on((x) => setSt((o) => ({ ...o, ...x })));
  }, []);
  const seenIt = () => { localStorage.setItem('bento.seenVersion', fresh); setFresh(null); };
  if (fresh && st?.status !== 'ready') return (
    <div className="upd-pill fresh">
      <span className="upd-dot" aria-hidden="true" />
      <button className="upd-main" onClick={() => { window.bento.openExternal(`https://github.com/lhz56/bento/releases/tag/v${fresh}`); seenIt(); }} title={`${t('Bento updated itself to')} ${fresh}`}><b>{t('What’s new in')} {fresh}</b> ↗</button>
      <button className="upd-x" aria-label={t('Dismiss')} onClick={seenIt}><Icon name="close" size={11} /></button>
    </div>
  );
  if (st?.status !== 'ready') return null;
  return (
    <button className="upd-pill" onClick={() => window.bento.update.install()} title={`${st.version ? `Bento ${st.version}. ` : ''}${t('Bento restarts with the new version. Your lessons are saved.')}`}>
      <span className="upd-dot" aria-hidden="true" /><span>{t('Update ready')}</span><b>{t('Restart')}</b>
    </button>
  );
}

function LessonIcon({ l, path }) {
  const idea = l.mode === 'idea' && ideaById[l.context?.ideaId];
  if (idea) return <span className="rl-tile brand"><Brand slug={idea.slug} name={idea.company} size={12} plain /></span>;
  const g = path ? '⤳' : l.scratch ? '✎' : l.mode === 'challenge' ? '⚑' : l.mode === 'compare' ? '⇄' : l.mode === 'build' ? '⚒' : l.race ? '↗' : null;
  return <span className={`rl-tile ${g ? 'g' : `mono ${l.lang || ''}`}`} aria-hidden="true">{g || ((l.title || l.q || '?').replace(/^[^A-Za-z0-9]+/, '')[0] || '•').toUpperCase()}</span>;
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

// What used your AI today: a small meter above the model picker; click for the breakdown
export function UsageMeter({ compact }) {
  const [u, setU] = useState(null); const [open, setOpen] = useState(false); const [at, setAt] = useState(null);
  // the panel is placed against the window, not the sidebar (which clips it), and kept fully on screen
  const place = (btn) => { const r = btn.getBoundingClientRect(); const W = 270; setAt({ left: Math.max(8, Math.min(r.left, innerWidth - W - 8)), bottom: Math.max(8, innerHeight - r.top + 6) }); };
  useEffect(() => { if (!open) return; const k = (e) => { if (e.key === 'Escape') setOpen(false); }; const away = (e) => { if (!e.target.closest?.('.usage')) setOpen(false); }; addEventListener('keydown', k); addEventListener('pointerdown', away); const shut = () => setOpen(false); addEventListener('resize', shut); return () => { removeEventListener('keydown', k); removeEventListener('pointerdown', away); removeEventListener('resize', shut); }; }, [open]);
  useEffect(() => { const get = () => window.bento.usage().then(setU).catch(() => {}); get(); const t = setInterval(get, 15000); addEventListener('focus', get); return () => { clearInterval(t); removeEventListener('focus', get); }; }, []);
  if (!u) return null;
  const T = u.today || { lessons: 0, quick: 0, other: 0, saved: 0, tokens: 0 }; const n = T.lessons + T.quick + T.other;
  const max = Math.max(1, ...u.days.map((d) => d.lessons + d.quick + d.other));
  const fmtK = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1000 ? `${Math.round(x / 1000)}k` : String(x));
  return (
    <div className={`usage ${compact ? 'compact' : ''}`}>
      <button className="usage-btn" title={compact ? `${n} ${t('AI requests today')}${T.saved ? ` · +${T.saved} ${t('saved')}` : ''}` : undefined} onClick={(e) => { place(e.currentTarget); setOpen(!open); }} aria-expanded={open} aria-label={`${n} ${t('AI requests today')}${T.saved ? `, +${T.saved} ${t('saved')}` : ''}. ${t('Show what used your AI')}`}>
        <span className="usage-bars" aria-hidden="true">{u.days.map((d) => <i key={d.d} style={{ height: `${Math.max(8, ((d.lessons + d.quick + d.other) / max) * 100)}%` }} className={d.d === T.d ? 'today' : ''} />)}</span>
        {compact ? <span className="usage-t"><b>{n}</b></span> : <span className="usage-t"><b>{n}</b> {t('AI requests today')}</span>}
        {!compact && T.saved > 0 && <span className="usage-saved">+{T.saved} {t('saved')}</span>}
      </button>
      {open && (
        <div className="usage-pop" role="dialog" aria-label={t('What used your AI')} style={at ? { position: 'fixed', left: at.left, bottom: at.bottom, right: 'auto', maxHeight: `calc(100vh - ${at.bottom + 16}px)`, overflowY: 'auto' } : undefined}>
          <b>{t('What used your AI today')}</b>
          <div className="up-row"><span>✦ {t('lessons written')}</span><b>{T.lessons}</b></div>
          <div className="up-row"><span>↵ {t('quick answers and checks')}</span><b>{T.quick}</b></div>
          <div className="up-row"><span>◈ {t('projects and sites read')}</span><b>{T.other}</b></div>
          <div className="up-row"><span>♻ {t('answered from saved copies (free)')}</span><b>{T.saved}</b></div>
          <div className="up-row"><span>{t('about')}</span><b>{fmtK(T.tokens)} {t('tokens')}</b></div>
          <div className="mini-h" style={{ marginTop: 8 }}>{t('latest')}</div>
          {u.recent.slice(0, 8).map((e, i) => <div key={i} className="up-recent"><span>{e.saved ? '♻' : e.ok ? '✦' : '✕'} {t(e.what)}</span><em>{e.saved ? t('saved copy') : `${fmtK(e.tokens)}${e.est ? '~' : ''} · ${(e.ms / 1000).toFixed(1)}s`}</em></div>)}
          <div className="muted small" style={{ marginTop: 6 }}>{t('It all runs on your own plan. Repeated quick questions are answered from a saved copy for 14 days.')}</div>
        </div>
      )}
    </div>
  );
}
