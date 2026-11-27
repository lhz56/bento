// The sidebar: New question, the five places (Learn, Explore, Practice, Path, You), what you've been doing, and the
// footer with the AI you're using (its model picker and plan meter). On a phone or iPad, also the Mac it's using.
import { Fragment, useEffect, useRef, useState } from 'react';
import { t } from '../i18n.js';

const bucket = (t) => {
  if (!t) return 'Earlier';
  const d = new Date(t),
    n = new Date();
  const days = Math.floor((+new Date(n.toDateString()) - +new Date(d.toDateString())) / 864e5);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier';
};
import Brand from './Brand.jsx';
import { ideaById } from '../ideas.js';
import { IS_MAC, keys } from '../platform.js';
import Icon from './Icons.jsx';
import WhatsNew from './WhatsNew.jsx';
import {
  MODELS as ALL_MODELS,
  PROVIDERS,
  provOf,
  modelInfo,
  modelLabel as aiModelLabel,
  noAI,
  fastModel,
  mainWindow,
  level,
  usedText,
} from '../ai.js';
import { PlanMeter, AIMark, Ring, usePlans } from './Plans.jsx';
import { IN_APP, native } from './touch.js';

// What each model is good at, in plain words, with two small meters. Grouped by AI; the ones this Mac doesn't have
// yet say so, with a way to connect them.
const Meter = ({ level, max = 4, label }) => (
  <span className="mm" aria-label={`${label}: ${level} of ${max}`}>
    <em>{label}</em>
    {Array.from({ length: max }, (_, i) => (
      <i key={i} className={i < level ? 'on' : ''} />
    ))}
  </span>
);

function ModelPicker({ settings, setSettings, providers, onClose, onSettings, onSetup }) {
  const box = useRef(null);
  const { limits } = usePlans();
  useEffect(() => {
    box.current?.querySelector('.mc.on, .mc:not(:disabled)')?.focus();
  }, []);
  const key = (e) => {
    const items = [...box.current.querySelectorAll('.mc:not(:disabled), .mp-connect, .mp-row')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };
  const fast = modelInfo(fastModel(settings.model))?.label;
  const have = PROVIDERS.filter((p) => !providers || providers[p.id]);
  const missing = PROVIDERS.filter((p) => providers && !providers[p.id]);
  return (
    <div
      className="menu up mpick"
      role="menu"
      aria-label={t('Choose your AI')}
      ref={box}
      onKeyDown={key}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mp-h">
        <b>{t('Your AI')}</b>
        <span>{t('Runs on your own plan. No keys.')}</span>
      </div>
      <div className="mp-list">
        {have.map((prov) => {
          const w = mainWindow(limits[prov.id]);
          const lv = level(w);
          return (
            <div key={prov.id} className="mp-group" role="group" aria-label={prov.name}>
              {/* each AI: its mark, its name, and how full its plan is */}
              <div className="mp-ai" aria-hidden="true">
                <AIMark id={prov.id} size={16} />
                <b>{prov.short || prov.name}</b>
                {w && (
                  <span className={`mp-used lv-${lv}`} title={usedText(w)}>
                    <Ring used={w.unlimited ? 0 : w.used} lv={lv} size={13} />
                    {w.unlimited ? '∞' : `${w.used}%`}
                  </span>
                )}
              </div>
              {prov.models.map((model) => {
                const on = settings.model === model.id;
                return (
                  <button
                    key={model.id}
                    data-model={model.id}
                    role="menuitemradio"
                    aria-checked={on}
                    className={`mc ${on ? 'on' : ''}`}
                    title={t(model.what || '')}
                    onClick={() => {
                      setSettings({ model: model.id });
                      onClose();
                    }}
                  >
                    <span className="mc-t">
                      <b>
                        {model.short || model.label}
                        {model.tag === 'recommended' ? (
                          <span
                            className="mc-star"
                            title={t('Recommended')}
                            aria-label={t('recommended')}
                          >
                            ★
                          </span>
                        ) : (
                          model.tag && <em>{t(model.tag)}</em>
                        )}
                      </b>
                    </span>
                    <span className="mc-m">
                      <Meter level={model.speed || 2} max={3} label={t('speed')} />
                      <Meter level={model.depth || 2} max={4} label={t('depth')} />
                    </span>
                    <span className="mc-tick" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    {on && <span className="mc-d">{t(model.what || '')}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {missing.length > 0 && (
        <button
          role="menuitem"
          className="mp-connect"
          onClick={() => {
            onClose();
            onSetup?.();
          }}
        >
          <span className="mp-marks" aria-hidden="true">
            {missing.map((p) => (
              <AIMark key={p.id} id={p.id} size={15} />
            ))}
          </span>
          {t('Connect')} {missing.map((p) => p.short || p.name).join(', ')} →
        </button>
      )}
      {fast && (
        <div className="mp-note">
          ⚡ {t('Quick answers use')} <b>{fast}</b>
          {t(', the fastest model of the same kind.')}
        </div>
      )}
      <div className="menu-sep" />
      <button
        role="menuitem"
        className="mp-row"
        onClick={() => {
          onClose();
          onSettings?.();
        }}
      >
        <Icon name="gear" size={15} />
        {t('Settings…')}
        <span>{keys('⌘,')}</span>
      </button>
    </div>
  );
}

// [id, label, ai] for every model Bento knows, and a model's name
export const MODELS = ALL_MODELS.map((m) => [m.id, m.label, m.prov]);
export const modelLabel = aiModelLabel;

// Five places, one list of what you've been doing, one footer. Pages that belong together are tabs on the page.
export const GROUPS = [
  { id: 'learn', label: 'Learn', icon: 'learn', views: [['home', 'Learn']] },
  {
    id: 'explore',
    label: 'Explore',
    icon: 'explore',
    views: [
      ['explore', 'Code'],
      ['ideas', 'Clever ideas'],
    ],
  },
  {
    id: 'practice',
    label: 'Practice',
    icon: 'practice',
    views: [
      ['puzzles', 'Puzzles'],
      ['play', 'Playgrounds'],
    ],
    extra: ['bug', 'Daily bug'],
  },
  { id: 'path', label: 'Path', icon: 'path', views: [['path', 'The path']] },
  {
    id: 'you',
    label: 'You',
    icon: 'you',
    views: [
      ['map', 'Your map'],
      ['words', 'Your words'],
    ],
  },
];
export const groupOf = (view) =>
  GROUPS.find((g) => g.views.some(([v]) => v === view)) ||
  (['atlas', 'site', 'compare'].includes(view) ? GROUPS[1] : null);
export const lastTab = (group) => {
  try {
    const v = JSON.parse(localStorage.getItem('bento.lastTab') || '{}')[group.id];
    return group.views.some(([x]) => x === v) ? v : group.views[0][0];
  } catch {
    return group.views[0][0];
  }
};
export const rememberTab = (view) => {
  const group = GROUPS.find((x) => x.views.some(([v]) => v === view));
  if (!group || group.views.length < 2) return;
  try {
    const m = JSON.parse(localStorage.getItem('bento.lastTab') || '{}');
    m[group.id] = view;
    localStorage.setItem('bento.lastTab', JSON.stringify(m));
  } catch {}
};

// On a phone or iPad: the Mac this device is using, and whether it can reach it. In Bento Code, a tap opens the app's
// own list of your Macs (switch, add another, forget one); in Safari, Settings, where This iPhone uses Bento on… lives.
function MacCard({ model, onSettings }) {
  const remote = window.bentoRemote;
  const [st, setSt] = useState(() => ({ state: remote.state, host: remote.host }));
  // (read it again once listening: Bento can come online between the first render and this effect)
  useEffect(() => {
    const off = remote.on((state, host) => setSt({ state, host }));
    setSt({ state: remote.state, host: remote.host });
    return off;
  }, [remote]);
  const on = st.state === 'online';
  const ai = modelInfo(model)?.short || aiModelLabel(model);
  return (
    <button
      className={`mac-card ${on ? 'on' : 'off'}`}
      onClick={() => (IN_APP ? native('macs') : onSettings?.())}
      aria-label={`${st.host?.name || t('Your Mac')}: ${on ? t('connected') : t('can’t reach it right now')}. ${IN_APP ? t('Your Macs') : t('Settings')}`}
    >
      <span className="mc-ic" aria-hidden="true">
        <svg width="26" height="22" viewBox="0 0 26 22">
          <rect
            x="1.2"
            y="1.2"
            width="23.6"
            height="15"
            rx="2.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M9 21h8M13 16.5V21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="mc-t">
        <b>{st.host?.name || t('Your Mac')}</b>
        <span>
          <i className="mc-dot" />
          {on ? `${t('Connected')}${ai ? ` · ${ai}` : ''}` : t('Can’t reach it right now')}
        </span>
      </span>
      <Icon name="chevron" size={15} className="mc-chev" />
    </button>
  );
}

export function Sidebar({
  progress = /** @type {{ path?: Record<string, string> }} */ ({}),
  onClose,
  closed,
  view,
  setView,
  lessons,
  current,
  onOpen,
  onNew,
  onDelete,
  settings,
  setSettings,
  providers,
  user,
  projects = [],
  atlasKey,
  atlases = {},
  onOpenProject,
  onForgetProject,
  onSetup,
  onSettings,
  siteKey,
}) {
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const mine = lessons.filter((l) => !l.builtin || l.touched);
  // lessons and projects in one list, newest first
  const items = [
    ...projects.map((p) => ({ kind: 'project', key: `p:${p.key}`, at: p.at || 0, p })),
    ...mine.map((l) => ({ kind: 'lesson', key: `l:${l.id}`, at: l.createdAt || 0, l })),
  ].sort((a, b) => b.at - a.at);
  const shown = items.slice(0, more ? 60 : 9);
  const active = groupOf(view)?.id || null;
  const ai = GROUPS.findIndex((g) => g.id === active);
  const search = () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: IS_MAC, ctrlKey: !IS_MAC }),
    );
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [menu]);
  return (
    <aside
      className="side"
      aria-label={t('Sidebar')}
      inert={closed || undefined}
      aria-hidden={closed || undefined}
    >
      <div className="side-drag" />
      <div className="brand">
        <Logo /> <span>bento</span>
        <button
          className="side-search"
          onClick={onClose}
          aria-label={`${t('Hide the sidebar')} (${keys('⌘\\')})`}
          title={`${t('Hide the sidebar')}  ${keys('⌘\\')}`}
        >
          <Icon name="sidebar" size={16} />
        </button>
        <button
          className="side-search"
          onClick={search}
          aria-label={`${t('Search everything')} (${keys('⌘K')})`}
          title={`${t('Search everything')}  ${keys('⌘K')}`}
        >
          <Icon name="search" size={16} />
        </button>
      </div>
      {window.bentoRemote && <MacCard model={settings.model} onSettings={onSettings} />}
      <button className="new" onClick={onNew}>
        <Icon name="plus" size={16} />
        {t('New question')}
        <kbd>{keys('⌘N')}</kbd>
      </button>
      <nav aria-label={t('Main')}>
        <span
          className="nav-pill"
          aria-hidden="true"
          style={{ transform: `translateY(${Math.max(0, ai) * 34}px)`, opacity: ai >= 0 ? 1 : 0 }}
        />
        {GROUPS.map((group) => (
          <button
            key={group.id}
            className={active === group.id ? 'on' : ''}
            aria-current={active === group.id ? 'page' : undefined}
            onClick={() =>
              setView(
                active === group.id && group.views.some(([v]) => v === view)
                  ? view
                  : lastTab(group),
              )
            }
          >
            <Icon name={group.icon} />
            {t(group.label)}
          </button>
        ))}
      </nav>
      <div className="side-h">{t('Recent')}</div>
      <div className="recent shelf-list">
        {shown.length === 0 && (
          <div className="side-empty">{t('What you ask and open shows up here.')}</div>
        )}
        {shown.map((it, idx) => (
          <Fragment key={`g${it.key}`}>
            {(idx === 0 || bucket(it.at) !== bucket(shown[idx - 1].at)) && (
              <div className="rl-day">{t(bucket(it.at))}</div>
            )}
            {it.kind === 'project' ? (
              (() => {
                const project = it.p;
                const st = atlases[project.key]?.status;
                const on =
                  (view === 'atlas' && atlasKey === project.key) ||
                  (project.kind === 'site' && view === 'site' && siteKey === project.name);
                return (
                  <div key={it.key} className={`rl ${on ? 'on' : ''}`}>
                    <button
                      className="rl-main"
                      aria-current={on ? 'page' : undefined}
                      onClick={() => onOpenProject(project)}
                    >
                      {project.kind === 'github' ? (
                        <img
                          className="rl-av"
                          src={`https://avatars.githubusercontent.com/${(project.full || project.key).split('/')[0]}?size=32`}
                          alt=""
                        />
                      ) : (
                        <span className="rl-ic">
                          <Icon name={project.kind === 'site' ? 'globe' : 'folder'} size={13} />
                        </span>
                      )}
                      <span className="rl-t">
                        {project.kind === 'github'
                          ? (project.full || project.name).split('/').pop()
                          : project.name}
                      </span>
                      {['cloning', 'reading', 'narrating'].includes(st) && (
                        <span className="rl-live" />
                      )}
                    </button>
                    <button
                      className="rl-x"
                      aria-label={t('Remove')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onForgetProject(project.key);
                      }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                );
              })()
            ) : (
              <div
                key={it.key}
                className={`rl ${current === it.l.id && view === 'lesson' ? 'on' : ''}`}
              >
                <button
                  className="rl-main"
                  aria-current={current === it.l.id && view === 'lesson' ? 'page' : undefined}
                  onClick={() => onOpen(it.l)}
                >
                  <LessonIcon
                    lesson={it.l}
                    path={Object.values(progress.path || {}).includes(it.l.id)}
                  />
                  <span className="rl-t">{it.l.title || it.l.q || 'Untitled'}</span>
                  {it.l.status === 'streaming' && <span className="rl-live" />}
                </button>
                <button
                  className="rl-x"
                  aria-label={t('Remove')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(it.l.id);
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
          </Fragment>
        ))}
        {items.length > 9 && (
          <button className="side-more" onClick={() => setMore(!more)}>
            {more ? t('Show fewer') : `${t('Show more')} · ${items.length - 9}`}
          </button>
        )}
      </div>
      <UpdatePill />
      <div className="side-foot">
        {noAI(providers) ? (
          <button className="model-pick none" onClick={() => onSetup?.()}>
            <span className="mdot off" />
            <span>{t('Connect an AI')}</span>
            <Icon name="chevron" size={14} />
          </button>
        ) : (
          <div className="model-wrap">
            <button
              className="model-pick"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={(e) => {
                e.stopPropagation();
                setMenu(!menu);
              }}
            >
              <span className="mp-mark" aria-hidden="true">
                <AIMark id={provOf(settings.model)} size={15} />
              </span>
              <span className="mp-name" title={modelLabel(settings.model)}>
                {modelInfo(settings.model)?.short || modelLabel(settings.model)}
              </span>
              <Icon name="up" size={14} className="caret" />
            </button>
            {menu && (
              <ModelPicker
                settings={settings}
                setSettings={setSettings}
                providers={providers}
                onClose={() => setMenu(false)}
                onSettings={onSettings}
                onSetup={onSetup}
              />
            )}
          </div>
        )}
        {window.bento?.limits && !noAI(providers) && (
          <PlanMeter model={settings.model} providers={providers} />
        )}
        <button className="side-gear" onClick={onSettings} aria-label={t('Settings')}>
          <Icon name="gear" size={20} />
        </button>
        {user ? (
          <img
            className="avatar"
            src={user.avatar}
            title={`GitHub: ${user.login}`}
            alt={`GitHub: ${user.login}`}
          />
        ) : (
          <span className="avatar ph" title="GitHub not connected (Connections & setup in ⌘K)">
            <Icon name="folder" size={13} />
          </span>
        )}
      </div>
    </aside>
  );
}

// A new version finished downloading in the background: one quiet pill, restart when you like (or it installs on quit).
function UpdatePill() {
  const [st, setSt] = useState(null);
  const [fresh, setFresh] = useState(null); // just updated: say so once
  useEffect(() => {
    const update = window.bento?.update;
    if (!update) return;
    update
      .get()
      .then((x) => {
        setSt(x);
        const seen = localStorage.getItem('bento.seenVersion');
        if (!seen)
          localStorage.setItem('bento.seenVersion', x.current); // first run: nothing to announce
        else if (x.current && seen !== x.current) setFresh(x.current);
      })
      .catch(() => {});
    return update.on((x) => setSt((o) => ({ ...o, ...x })));
  }, []);
  const [notes, setNotes] = useState(null); // the version whose notes are open
  const seenIt = () => {
    localStorage.setItem('bento.seenVersion', fresh);
    setFresh(null);
  };
  if (notes) return <WhatsNew version={notes} onClose={() => setNotes(null)} />;
  if (fresh && st?.status !== 'ready')
    return (
      <div className="upd-pill fresh">
        <span className="upd-dot" aria-hidden="true" />
        <button
          className="upd-main"
          onClick={() => {
            setNotes(fresh);
            seenIt();
          }}
          title={`${t('Bento updated itself to')} ${fresh}`}
        >
          <b>
            {t('What’s new in')} {fresh}
          </b>
        </button>
        <button className="upd-x" aria-label={t('Dismiss')} onClick={seenIt}>
          <Icon name="close" size={11} />
        </button>
      </div>
    );
  if (st?.status !== 'ready') return null;
  return (
    <button
      className="upd-pill"
      onClick={() => window.bento.update.install()}
      title={`${st.version ? `Bento ${st.version}. ` : ''}${t('Bento restarts with the new version. Your lessons are saved.')}`}
    >
      <span className="upd-dot" aria-hidden="true" />
      <span>{t('Update ready')}</span>
      <b>{t('Restart')}</b>
    </button>
  );
}

/** @param {{ lesson: import('../types/lesson').Lesson, path?: boolean }} props */
function LessonIcon({ lesson, path }) {
  const idea = lesson.mode === 'idea' && ideaById[lesson.context?.ideaId];
  if (idea)
    return (
      <span className="rl-tile brand">
        <Brand slug={idea.slug} name={idea.company} size={12} plain />
      </span>
    );
  const pathGroup = path
    ? '⤳'
    : lesson.scratch
      ? '✎'
      : lesson.mode === 'challenge'
        ? '⚑'
        : lesson.mode === 'compare'
          ? '⇄'
          : lesson.mode === 'build'
            ? '⚒'
            : lesson.race
              ? '↗'
              : null;
  return (
    <span className={`rl-tile ${pathGroup ? 'g' : `mono ${lesson.lang || ''}`}`} aria-hidden="true">
      {pathGroup ||
        ((lesson.title || lesson.q || '?').replace(/^[^A-Za-z0-9]+/, '')[0] || '•').toUpperCase()}
    </span>
  );
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
