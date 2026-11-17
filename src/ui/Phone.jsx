// Bento's frame on a phone: a bar at the top (Back, or your recent things), tabs at the bottom, like any iPhone app.
// The pages inside are Bento's own; mobile.css lays them out for a small screen you hold in one hand.
import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';
import { GROUPS, groupOf, lastTab } from './Side.jsx';
import { t } from '../i18n.js';
import { spring } from './touch.js';

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

// away: a page opened from a tab (a lesson, a project) has the whole screen; the tabs slide down out of its way
export function TabBar({ view, setView, onTop, away }) {
  const active = groupOf(view)?.id;
  return (
    <nav className={`ptabs ${away ? 'away' : ''}`} aria-label={t('Main')} inert={away || undefined} aria-hidden={away || undefined}>
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

// ---------------------------------------------------------------- moving between pages, the way an iPhone does
// A page you open slides in from the right, Back brings the last one in from the left, a tab just fades across.
// (Safari's own swipe back has already animated by the time we hear of it: dir 'none'.)
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
export function enter(main, dir) {
  if (!main) return;
  // a swipe back may have left the old page off to the side
  ['transform', 'transition', 'boxShadow', 'visibility', 'animation'].forEach((p) => { main.style[p] = ''; });
  const bar = document.querySelector('.pbar-mid'); if (bar) { bar.style.opacity = ''; bar.style.transition = ''; }
  if (dir === 'none' || !main.animate) return;
  // (only a fade for a tab: a moving page holds anything fixed inside it, like the Atlas's ask bar, while it moves)
  const fade = dir === 'tab' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // (a tab starts part-way in, so there's never a blank moment between two tabs)
  const frames = (d) => (fade ? [{ opacity: dir === 'tab' ? 0.35 : 0 }, { opacity: 1 }] : [{ transform: `translateX(${dir === 'push' ? d : -d}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }]);
  // (a page you open or go back to settles like an iPhone's: a spring with no bounce)
  const sp = spring(0.46, 1);
  const o = dir === 'tab' || fade ? { duration: 160, easing: EASE } : { duration: sp.ms, easing: sp.easing };
  [...main.children].filter((c) => !c.matches('.titlebar-drag, .gtabs, .side-open')).forEach((c) => c.animate(frames(36), o));
  if (bar) bar.animate(frames(24), { ...o, duration: 240 });
}

// where you were on each page: Back and the tabs bring you to the same spot, a page opened afresh starts at its top
const spots = new Map(); // page → Map(path to the scrolling element → scrollTop)
const pathOf = (el, root) => { const p = []; for (let n = el; n !== root; n = n.parentElement) { if (!n?.parentElement) return null; p.push([...n.parentElement.children].indexOf(n)); } return p.reverse().join('.'); };
const atPath = (root, p) => (p === '' ? root : p.split('.').reduce((n, i) => n?.children[+i], root));
export function noteScroll(page, root, el) {
  if (!(el instanceof Element) || !root.contains(el)) return;
  const p = pathOf(el, root); if (p == null) return;
  if (!spots.has(page)) spots.set(page, new Map());
  spots.get(page).set(p, el.scrollTop);
}
export function restoreScroll(page, root) {
  const m = spots.get(page); if (!m || !root) return;
  let tries = 0;
  // a page can still be filling in: keep trying for half a second, until the spot exists
  const go = () => {
    let left = 0;
    m.forEach((top, p) => {
      const el = atPath(root, p); if (!el) { left++; return; }
      if (Math.abs(el.scrollTop - top) < 2) return;
      const b = el.style.scrollBehavior; el.style.scrollBehavior = 'auto'; el.scrollTop = top; el.style.scrollBehavior = b;
      if (Math.abs(el.scrollTop - top) >= 2) left++;
    });
    if (left && ++tries < 30) requestAnimationFrame(go);
  };
  go();
}
export const forgetScroll = (page) => spots.delete(page);
