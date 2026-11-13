// Bento's frame on a phone: a bar at the top (Back, or your recent things), tabs at the bottom, like any iPhone app.
// The pages inside are Bento's own; mobile.css lays them out for a small screen you hold in one hand.
import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';
import { GROUPS, groupOf, lastTab } from './Side.jsx';
import { t } from '../i18n.js';

/** true on a phone-sized screen (and in a phone held sideways) */
export function useNarrow() {
  const q = '(max-width: 700px), (max-height: 500px) and (max-width: 950px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}
// a section's own page (Learn, Explore → Code…): it shows the tabs; anything opened from one (a lesson, a project) shows Back
export const isRoot = (view) => !!groupOf(view)?.views.some(([v]) => v === view);

// seg: { value, options: [[value, label]], onChange } puts a switch in the middle instead of the title (a lesson: Lesson | Code)
export function TopBar({ view, title, onBack, onMenu, onSearch, setView, scrolled, seg }) {
  const g = groupOf(view); const root = isRoot(view);
  return (
    <header className={`pbar ${scrolled ? 'scrolled' : ''}`}>
      {root
        ? <button className="pbar-btn" onClick={onMenu} aria-label={t('Recent, model and settings')}><Icon name="sidebar" size={21} /></button>
        : <button className="pbar-back" onClick={onBack}><svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{t('Back')}</button>}
      <div className="pbar-mid">
        {seg
          ? <div className="pseg" role="tablist">{seg.options.map(([v, label]) => <button key={v} role="tab" aria-selected={seg.value === v} className={seg.value === v ? 'on' : ''} onClick={() => seg.onChange(v)}>{label}</button>)}</div>
          : root && g.views.length > 1
          ? <div className="pseg" role="tablist" aria-label={t(g.label)}>{g.views.map(([v, label]) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t(label)}</button>)}</div>
          : <b className="pbar-title">{title}</b>}
      </div>
      <button className="pbar-btn" onClick={onSearch} aria-label={t('Search everything')}><Icon name="search" size={21} /></button>
    </header>
  );
}

export function TabBar({ view, setView, onTop }) {
  const active = groupOf(view)?.id;
  return (
    <nav className="ptabs" aria-label={t('Main')}>
      {GROUPS.map((g) => (
        <button key={g.id} className={active === g.id ? 'on' : ''} aria-current={active === g.id ? 'page' : undefined}
          // tapping the tab you're on goes back to its top, as on iPhone
          onClick={() => (active === g.id && isRoot(view) ? onTop?.() : setView(active === g.id ? g.views[0][0] : lastTab(g)))}>
          <Icon name={g.icon} size={23} /><span>{t(g.label)}</span>
        </button>
      ))}
    </nav>
  );
}
