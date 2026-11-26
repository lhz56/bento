import { useEffect, useState } from 'react';
import { t } from '../i18n.js';
import Brand from './Brand.jsx';
import {
  PROVIDERS,
  provider,
  provOf,
  mainWindow,
  level,
  resetText,
  usedText,
  ageText,
} from '../ai.js';

// How much of each AI plan is used, the way the plan itself counts it: a ring in the sidebar for the AI you're using,
// and one row per AI (a bar, the plan's name, when it resets, and Bento's share of today). Numbers come from the AI
// tools themselves (Claude with each answer; ChatGPT and Copilot when asked, for free). Gemini doesn't share its
// numbers, so its row says so and shows what Bento used instead. Reading these never uses any of a plan.

// an AI's mark: its own logo where one exists, otherwise a letter in its colour
export const AIMark = ({ id, size = 16 }) => {
  const p = provider(id);
  return p ? <Brand slug={p.slug} name={p.name} color={p.color} size={size} plain /> : null;
};

// the latest readings, kept fresh: from the app at start, whenever an AI reports, and on request
export function usePlans() {
  const [limits, setLimits] = useState({});
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    const b = window.bento;
    if (!b?.limits) return undefined;
    b.limits
      .get()
      .then((x) => x && setLimits(x))
      .catch(() => {});
    const off = b.limits.on((x) => x && setLimits(x));
    const get = () =>
      b
        .usage?.()
        .then(setUsage)
        .catch(() => {});
    get();
    const tm = setInterval(get, 15000);
    addEventListener('focus', get);
    return () => {
      off?.();
      clearInterval(tm);
      removeEventListener('focus', get);
    };
  }, []);
  // fresh numbers when you look: the plans (free: no model is asked) and what Bento used
  const refresh = () => {
    window.bento?.limits
      ?.get({ refresh: true })
      .then((x) => x && setLimits(x))
      .catch(() => {});
    window.bento
      ?.usage?.()
      .then(setUsage)
      .catch(() => {});
  };
  return { limits, usage, refresh };
}

// a thin bar, coloured by how full it is
const Bar = ({ used, lv }) => (
  <span className={`plan-bar lv-${lv}`} aria-hidden="true">
    <i style={{ width: `${Math.max(2, Math.min(100, used ?? 0))}%` }} />
  </span>
);

// a small ring for the sidebar
export const Ring = ({ used, lv, size = 18 }) => {
  const r = size / 2 - 2.2,
    c = 2 * Math.PI * r;
  return (
    <svg
      className={`plan-ring lv-${lv}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle cx={size / 2} cy={size / 2} r={r} className="pr-bg" strokeWidth="2.6" />
      {used != null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="pr-fg"
          strokeWidth="2.6"
          strokeDasharray={`${(c * Math.min(100, Math.max(used, 3))) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
};

// when there's no reading yet, why, and when there will be one
const NO_READING = {
  claude: 'Shows how full your plan is after Claude’s next answer.',
  codex: 'ChatGPT didn’t say how full your plan is just now. Bento asks again next time you look.',
  antigravity: 'Antigravity doesn’t share how much is left, so Bento counts its own use.',
  gemini: 'Google doesn’t share how much is left, so Bento counts its own use.',
  copilot: 'Connect GitHub (⌘K → Connections & setup) to see your monthly allowance here.',
};
// one AI: its plan, how full, when it resets, and what Bento used of it today
export function PlanRow({ id, L, today, now = Date.now() }) {
  const p = provider(id);
  const w = mainWindow(L);
  const lv = level(w);
  const L1 = today?.lessons || 0,
    Q1 = (today?.n || 0) - L1;
  const bento = today?.n
    ? `${t('Bento today')}: ${[L1 && `${L1} ${L1 === 1 ? t('lesson') : t('lessons')}`, Q1 && `${Q1} ${Q1 === 1 ? t('quick answer') : t('quick answers')}`].filter(Boolean).join(', ')}`
    : null;
  const old = L?.at && now - L.at > 3 * 3600e3 ? ` · ${t('as of')} ${ageText(L.at, now, t)}` : '';
  return (
    <div className={`plan-ai lv-${lv}`}>
      <AIMark id={id} size={22} />
      <div className="pa-main">
        <div className="pa-top">
          <b>{p.short || p.name}</b>
          {L?.plan && <span className="pa-plan">{L.plan}</span>}
          {w && <span className="pa-pct">{w.unlimited ? '∞' : `${w.used}%`}</span>}
        </div>
        {w ? (
          <>
            <Bar used={w.unlimited ? 0 : w.used} lv={lv} />
            <span className="pa-sub">
              {w.of && !w.unlimited ? usedText(w, t) : t(w.label)}
              {w.resetsAt ? ` · ${resetText(w.resetsAt, now, t)}` : ''}
              {old}
            </span>
          </>
        ) : (
          <span className="pa-sub">{t(NO_READING[id] || NO_READING.claude)}</span>
        )}
        {bento && <span className="pa-bento">{bento}</span>}
        {lv === 'out' && <span className="pa-out">{t('This plan has reached its limit.')}</span>}
      </div>
    </div>
  );
}

// every AI this Mac has, in Bento's order
export function PlanList({ providers, limits, usage }) {
  const ids = PROVIDERS.map((p) => p.id).filter((id) => !providers || providers[id]);
  if (!ids.length) return <div className="muted small">{t('No AI connected yet.')}</div>;
  const now = Date.now();
  return (
    <div className="plan-list">
      {ids.map((id) => (
        <PlanRow key={id} id={id} L={limits?.[id]} today={usage?.by?.[id]} now={now} />
      ))}
    </div>
  );
}

// the sidebar's ring for the AI you're using; click for every plan and what used them today
export function PlanMeter({ model, providers }) {
  const { limits, usage, refresh } = usePlans();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(null);
  const id = provOf(model);
  const L = limits[id];
  const w = mainWindow(L);
  const lv = level(w);
  const p = provider(id);
  const place = (btn) => {
    const r = btn.getBoundingClientRect();
    const W = 300;
    setAt({
      left: Math.max(8, Math.min(r.left, innerWidth - W - 8)),
      bottom: Math.max(8, innerHeight - r.top + 6),
    });
  };
  useEffect(() => {
    if (!open) return undefined;
    refresh(); // fresh numbers when you look (free: no model is asked)
    const k = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const away = (e) => {
      if (!e.target.closest?.('.usage')) setOpen(false);
    };
    const shut = () => setOpen(false);
    addEventListener('keydown', k);
    addEventListener('pointerdown', away);
    addEventListener('resize', shut);
    return () => {
      removeEventListener('keydown', k);
      removeEventListener('pointerdown', away);
      removeEventListener('resize', shut);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!usage && !L) return null;
  const T = usage?.today || { lessons: 0, quick: 0, other: 0, saved: 0 };
  const n = T.lessons + T.quick + T.other;
  const mine = usage?.by?.[id]?.n || 0;
  const said = w
    ? `${p.short || p.name}: ${usedText(w, t)}${w.resetsAt ? `, ${resetText(w.resetsAt, Date.now(), t)}` : ''}`
    : `${p.short || p.name}: ${mine} ${t(mine === 1 ? 'request from Bento today' : 'requests from Bento today')}`;
  return (
    <div className="usage compact">
      <button
        className={`usage-btn plan-btn lv-${lv}`}
        title={said}
        aria-label={`${said}. ${t('Show your plans')}`}
        aria-expanded={open}
        onClick={(e) => {
          place(e.currentTarget);
          setOpen(!open);
        }}
      >
        <Ring used={w ? (w.unlimited ? 0 : w.used) : null} lv={lv} />
        <span className="usage-t">
          <b>{w ? (w.unlimited ? '∞' : `${w.used}%`) : mine}</b>
        </span>
      </button>
      {open && (
        <div
          className="usage-pop plans-pop"
          role="dialog"
          aria-label={t('Your plans')}
          style={
            at
              ? {
                  position: 'fixed',
                  left: at.left,
                  bottom: at.bottom,
                  right: 'auto',
                  maxHeight: `calc(100vh - ${at.bottom + 16}px)`,
                  overflowY: 'auto',
                }
              : undefined
          }
        >
          <b>{t('Your plans')}</b>
          <PlanList providers={providers} limits={limits} usage={usage} />
          <div className="plans-today">
            <span>
              ✦ {T.lessons} {T.lessons === 1 ? t('lesson') : t('lessons')}
            </span>
            <span>
              ↵ {T.quick} {t('quick')}
            </span>
            {T.other > 0 && (
              <span>
                ◈ {T.other} {t('read')}
              </span>
            )}
            {T.saved > 0 && (
              <span className="free">
                ♻ {T.saved} {t('free')}
              </span>
            )}
            <em>
              {t('Bento today')} · {n} {n === 1 ? t('request') : t('requests')}
            </em>
          </div>
          <div className="muted small">
            {t(
              'The numbers come from each AI. Looking at them never uses your plan, and repeated quick questions are answered from a saved copy for 14 days.',
            )}
          </div>
        </div>
      )}
    </div>
  );
}
