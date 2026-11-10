// Design for a billion: a small, honest model of a web app under load. Add parts, push traffic, watch what breaks.
// Capacities are round numbers on purpose; the shape of the problem is the lesson, not the exact figures.
import { useMemo, useState } from 'react';
import { ideaById } from '../ideas.js';
import { t, tx } from '../i18n.js';
import { pressable } from './a11y.js';

const PARTS = {
  cdn: { name: 'CDN', like: 'copies of your pictures in shops near every customer', cost: 40, idea: null, what: 'Serves images, scripts and pages from computers close to each user, so half the requests never reach you.' },
  lb: { name: 'Load balancer', like: 'a host seating guests across many tables', cost: 25, idea: 'ring', what: 'Spreads requests across your servers. Without one, extra servers sit idle.' },
  app: { name: 'App servers', like: 'cooks in the kitchen', cost: 60, idea: null, what: 'Run your code. Each one handles about 1,000 requests a second.' },
  cache: { name: 'Cache', like: 'the snacks on the counter instead of the storeroom', cost: 90, idea: 'lru', what: 'Remembers popular answers in memory, so 9 in 10 reads skip the database.' },
  db: { name: 'Database', like: 'the one big filing cabinet', cost: 220, idea: 'lsm', what: 'Stores everything. About 10,000 requests a second before it struggles.' },
  replicas: { name: 'Read copies', like: 'photocopies of the filing cabinet', cost: 160, idea: 'raft', what: 'Copies of the database that answer reads. Each takes a share of the reading.' },
  queue: { name: 'Write queue', like: 'an in-tray: drop it off, it gets filed soon', cost: 50, idea: 'kafka', what: 'Takes writes instantly and feeds them to the database at a pace it can handle.' },
};

export const LEVELS = [
  { title: 'Your app goes viral', story: 'A video mentions your app. 5,000 people a second arrive. One server can’t keep up.', rps: 5000, goal: { errors: 1, ms: 300 }, budget: 700, teach: 'More servers, and a load balancer to share the work.' },
  { title: 'The database is drowning', story: '30,000 a second now. Every page asks the database the same few questions.', rps: 30000, goal: { errors: 1, ms: 250 }, budget: 3000, teach: 'A cache answers the popular questions from memory.' },
  { title: 'Everyone is reading', story: '60,000 a second, nine in ten just looking. Even with a cache, the database is busy.', rps: 60000, goal: { errors: 1, ms: 250 }, budget: 6000, teach: 'Read copies of the database share the reading.' },
  { title: 'Black Friday', story: '120,000 a second, and lots of them are buying (writing).', rps: 120000, goal: { errors: 1, ms: 300 }, budget: 11000, teach: 'A queue soaks up the burst of writes.' },
  { title: 'A billion users', story: 'Worldwide: a million requests a second. Pictures, pages, scripts, everything.', rps: 1000000, goal: { errors: 1, ms: 300 }, budget: 60000, teach: 'A CDN serves the heavy, unchanging files from near each user.' },
];

// The model: utilisation → waiting time (it climbs steeply near 100%) → errors past 100%
function simulate(c, rps) {
  const parts = {}; let ms = 0; let fail = 0;
  const statik = c.cdn ? 0.5 : 0; const edge = rps * statik; const dyn = rps - edge;
  const load = (cap, l, base) => { const u = l / Math.max(cap, 1); const over = u > 1 ? 1 - 1 / u : 0; const wait = base / Math.max(0.04, 1 - Math.min(u, 0.96)); return { u, over, wait }; };
  if (c.cdn) { parts.cdn = load(5e6, edge, 15); }
  const servers = c.lb ? c.app : 1; // without a load balancer, only one server gets traffic
  if (c.lb) parts.lb = load(150000 * Math.max(1, Math.ceil(dyn / 150000)), dyn, 1);
  parts.app = load(1000 * servers, dyn, 20); fail = Math.max(fail, parts.app.over);
  const served = dyn * (1 - parts.app.over);
  const writes = served * 0.1, reads = served * 0.9;
  const dbReads = reads * (c.cache ? 0.1 : 1);
  const cacheNodes = Math.max(1, Math.ceil(reads / 150000)); // the cache grows in 150k-a-second pieces
  if (c.cache) parts.cache = load(150000 * cacheNodes, reads, 1);
  const readCap = 10000 * (1 + c.replicas);
  if (c.replicas) parts.replicas = load(10000 * c.replicas, dbReads * (c.replicas / (1 + c.replicas)), 8);
  const dbRead = dbReads * (c.replicas ? 1 / (1 + c.replicas) : 1);
  let dbWrite = writes;
  if (c.queue) { parts.queue = load(200000, writes, 2); dbWrite = Math.min(writes, Math.max(0, 9000 - dbRead)); }
  parts.db = load(10000, dbRead + dbWrite, 10);
  const dbFail = parts.db.over * (c.queue ? (dbRead / Math.max(1, dbRead + dbWrite)) : 1);
  fail = 1 - (1 - fail) * (1 - dbFail * (1 - statik));
  // time for a typical request: static ones at the edge, dynamic ones through the stack
  const dynMs = (parts.lb?.wait || 0) + parts.app.wait + (c.cache ? parts.cache.wait + 0.1 * (parts.db.wait + (parts.replicas?.wait || 0)) : parts.db.wait + (parts.replicas?.wait || 0) * 0.5) + (c.queue ? 0 : 0);
  ms = (statik ? statik * parts.cdn.wait : 0) + (1 - statik) * (dynMs + 40); // 40 ms: the trip across the internet
  if (!c.cdn) ms += rps > 200000 ? 120 : 0; // far-away users wait for every file
  const cost = (c.cdn ? PARTS.cdn.cost + rps * 0.004 : 0) + (c.lb ? PARTS.lb.cost : 0) + PARTS.app.cost * c.app + (c.cache ? PARTS.cache.cost * cacheNodes : 0) + PARTS.db.cost + PARTS.replicas.cost * c.replicas + (c.queue ? PARTS.queue.cost : 0);
  return { parts, errors: Math.min(100, fail * 100), ms: Math.min(9999, ms), cost: Math.round(cost), readCap };
}

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
const heat = (u) => (u == null ? 'off' : u < 0.6 ? 'h-cool' : u < 0.9 ? 'h-warm' : u < 1 ? 'h-hot' : 'h-fire');

export default function Sandbox({ done = {}, onDone, onAsk }) {
  const first = Math.max(0, LEVELS.findIndex((_, i) => !done[i]));
  const [lv, setLv] = useState(first);
  const [c, setC] = useState({ cdn: false, lb: false, app: 1, cache: false, replicas: 0, queue: false });
  const [rps, setRps] = useState(LEVELS[first].rps);
  const [info, setInfo] = useState(null);
  const L = LEVELS[lv];
  const sim = useMemo(() => simulate(c, rps), [c, rps]);
  const pass = rps >= L.rps && sim.errors < L.goal.errors && sim.ms < L.goal.ms && sim.cost <= L.budget;
  if (pass && !done[lv]) setTimeout(() => onDone(lv), 0);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const node = (k, x, y, label, extra) => { const p = sim.parts[k]; const on = k === 'app' || k === 'db' || (k === 'replicas' ? c.replicas > 0 : c[k]); return (
    <g className={`sb-node ${on ? heat(p?.u) : 'off'} ${info === k ? 'sel' : ''}`} {...pressable(() => setInfo(k))} aria-expanded={info === k} transform={`translate(${x},${y})`}>
      <title>{`${t(label)}${extra || ''}: ${on ? (p ? (p.u >= 1 ? t('overloaded') : `${Math.round(p.u * 100)}% ${t('busy')}`) : t('idle')) : t('not added')}`}</title>
      <rect x="-62" y="-30" width="124" height="60" rx="14" />
      <text y="-6" textAnchor="middle" className="sb-n">{t(label)}{extra}</text>
      <text y="13" textAnchor="middle" className="sb-u">{on ? (p ? (p.u >= 1 ? `🔥 ${t('overloaded')}` : `${Math.round(p.u * 100)}% ${t('busy')}`) : t('idle')) : t('not added')}</text>
    </g>
  ); };
  const flow = (d, amount, k) => <path d={d} className={`sb-flow ${amount > 0 ? '' : 'none'}`} style={{ '--dur': `${Math.max(0.35, 2.2 - Math.log10(amount + 1) * 0.35)}s` }} key={k} />;
  return (
    <div className="sandbox">
      <div className="sb-levels">{LEVELS.map((l, i) => <button key={i} className={`sb-lv ${i === lv ? 'on' : ''} ${done[i] ? 'done' : ''}`} onClick={() => { setLv(i); setRps(l.rps); }}>{done[i] ? '✓' : i + 1}<span>{t(l.title)}</span></button>)}</div>
      <div className="sb-mission"><b>{t(L.title)}</b><span>{t(L.story)}</span><em>{t('Goal')}: {fmt(L.rps)} {t('requests a second')}, {t('under')} {L.goal.errors}% {t('errors')}, {t('under')} {L.goal.ms} ms, {t('under')} ${L.budget.toLocaleString()}/{t('month')}.</em></div>
      <div className="sb-grid">
        <svg viewBox="0 0 900 360" className="sb-svg" role="group" aria-label={t('Your system. Pick a part to learn what it does.')}>
          {flow('M90,180 C150,180 150,180 200,180', rps, 'u')}
          {c.cdn && flow('M90,170 C120,90 160,70 200,70', rps * 0.5, 'c')}
          {flow('M262,180 L330,180', rps * (c.cdn ? 0.5 : 1), 'l')}
          {flow('M454,180 L650,180', rps, 'a')}
          {c.cache && flow('M582,150 C600,100 620,80 650,80', rps, 'k')}
          {c.replicas > 0 && flow('M582,210 C600,270 620,290 650,290', rps, 'r')}
          {c.queue && flow('M520,210 C520,300 560,320 600,320', rps * 0.1, 'q')}
          <g className="sb-users" transform="translate(50,180)" role="img" aria-label={`${fmt(rps)} ${t('requests a second')}`}><circle r="34" /><text y="-4" textAnchor="middle">👥</text><text y="16" textAnchor="middle" className="sb-u">{fmt(rps)}/s</text></g>
          {c.cdn && node('cdn', 262, 70, 'CDN')}
          {node('lb', 262, 180, 'Load balancer')}
          {node('app', 392, 180, 'App servers', ` ×${c.app}`)}
          {node('cache', 712, 80, 'Cache')}
          {node('db', 712, 180, 'Database')}
          {node('replicas', 712, 290, 'Read copies', c.replicas ? ` ×${c.replicas}` : '')}
          {c.queue && node('queue', 600, 320, 'Write queue')}
          {!c.cdn && <g className="sb-node off" transform="translate(262,70)" {...pressable(() => setInfo('cdn'))}><title>{`CDN: ${t('not added')}`}</title><rect x="-62" y="-30" width="124" height="60" rx="14" /><text y="-6" textAnchor="middle" className="sb-n">CDN</text><text y="13" textAnchor="middle" className="sb-u">{t('not added')}</text></g>}
          {!c.queue && <g className="sb-node off" transform="translate(520,310)" {...pressable(() => setInfo('queue'))}><title>{`${t('Write queue')}: ${t('not added')}`}</title><rect x="-62" y="-30" width="124" height="60" rx="14" /><text y="-6" textAnchor="middle" className="sb-n">{t('Write queue')}</text><text y="13" textAnchor="middle" className="sb-u">{t('not added')}</text></g>}
        </svg>
        <div className="sb-panel">
          <div className="sb-traffic"><span className="mini-h">{t('traffic')}</span><b>{fmt(rps)} {t('requests a second')}</b>
            <input type="range" min="2" max="6.3" step="0.01" value={Math.log10(rps)} onChange={(e) => setRps(Math.round(Math.pow(10, +e.target.value)))} aria-label="traffic" /></div>
          <div className="sb-meters">
            <div className={sim.errors < L.goal.errors ? 'ok' : 'bad'}><span>{t('errors')}</span><b>{sim.errors < 0.1 ? '0' : sim.errors.toFixed(sim.errors < 10 ? 1 : 0)}%</b></div>
            <div className={sim.ms < L.goal.ms ? 'ok' : 'bad'}><span>{t('wait')}</span><b>{sim.ms >= 9999 ? '∞' : Math.round(sim.ms)} ms</b></div>
            <div className={sim.cost <= L.budget ? 'ok' : 'bad'}><span>{t('cost')}</span><b>${sim.cost.toLocaleString()}</b></div>
          </div>
          {pass && <div className="sb-pass" role="status">✓ {t('It holds!')} {t(L.teach)}{lv + 1 < LEVELS.length && <button className="btn tiny" onClick={() => { setLv(lv + 1); setRps(LEVELS[lv + 1].rps); }}>{t('Next level')} →</button>}</div>}
          <div className="sb-tools">
            <label><input type="checkbox" checked={c.lb} onChange={(e) => set('lb', e.target.checked)} /> {t('Load balancer')}</label>
            <label className="step">{t('App servers')} <button onClick={() => set('app', Math.max(1, c.app - (c.app > 100 ? 100 : c.app > 10 ? 10 : 1)))}>−</button><b>{c.app}</b><button onClick={() => set('app', Math.min(2000, c.app + (c.app >= 100 ? 100 : c.app >= 10 ? 10 : 1)))}>+</button></label>
            <label><input type="checkbox" checked={c.cache} onChange={(e) => set('cache', e.target.checked)} /> {t('Cache')}</label>
            <label className="step">{t('Read copies')} <button onClick={() => set('replicas', Math.max(0, c.replicas - 1))}>−</button><b>{c.replicas}</b><button onClick={() => set('replicas', Math.min(30, c.replicas + 1))}>+</button></label>
            <label><input type="checkbox" checked={c.queue} onChange={(e) => set('queue', e.target.checked)} /> {t('Write queue')}</label>
            <label><input type="checkbox" checked={c.cdn} onChange={(e) => set('cdn', e.target.checked)} /> CDN</label>
          </div>
          {info && <PartInfo k={info} onAsk={onAsk} onClose={() => setInfo(null)} />}
        </div>
      </div>
    </div>
  );
}

function PartInfo({ k, onAsk, onClose }) {
  const P = PARTS[k]; const I = P.idea && ideaById[P.idea];
  return (
    <div className="sb-info fade-in">
      <div className="sb-info-h"><b>{t(P.name)}</b><button className="link" aria-label={t('Close')} onClick={onClose}>✕</button></div>
      <p>{t(P.what)}</p><i>≈ {t(P.like)}</i>
      <div className="sb-info-acts">{I && <span className="muted small">{t('In real life')}: {I.title}</span>}<button className="link" onClick={() => onAsk(`How does a ${P.name.toLowerCase()} work in a real web app? Show me a tiny simulation.`)}>{t('Teach me')} →</button></div>
    </div>
  );
}
