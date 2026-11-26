// A project's Atlas on a phone, laid out the way an iPhone app lays out a page. It starts like an app's page in the
// App Store (icon, name, maker, its numbers in a strip, what it is in a sentence), then shows how it works as one
// picture you can tap into, what it's made of, and the services it signs up for. A chapter break marks where the
// technical side begins: the code city, where it could break, the language, the code as a code app's file browser,
// and how to learn from it. Anything you tap opens as a sheet from the bottom; nothing is squeezed into the page.
// (On a Mac the Atlas is laid out in Atlas.jsx; the file sheet and the question box are shared.)
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Brand from './Brand.jsx';
import City from './City.jsx';
import { fallbackFlow } from './BigPicture.jsx';
import { CATS, BY_ID, LANGS } from '../atlas/catalog.js';
import { LAYERS, LAYER, fmtN, langColor } from '../atlas/analyze.js';
import { Md } from './Story.jsx';

export const PHONE_SECTIONS = [
  ['overview', 'Summary'],
  ['how', 'How it works'],
  ['parts', 'Parts'],
  ['services', 'Services'],
  ['anatomy', 'Code city'],
  ['hot', 'Hot spots'],
  ['files', 'Code'],
  ['study', 'Learn it'],
];

// ---------------------------------------------------------------- small pictures, drawn like the iPhone's own symbols
const IC = {
  person: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  blocks: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="3.5" />
    </>
  ),
  door: (
    <>
      <path d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M4 12h10M10.5 8.5 14 12l-3.5 3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.8" />
      <path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </>
  ),
  code: <path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5" />,
  cog: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  chat: (
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z" />
  ),
  spark: (
    <>
      <path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z" />
      <path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  play: <path d="M8 5.2v13.6L18.8 12z" fill="currentColor" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: (
    <>
      <path d="M10.3 4.6 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5 6v5.5c0 4.3 3 7.9 7 9.3 4-1.4 7-5 7-9.3V6z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  speed: (
    <>
      <path d="M3.8 16.5a8.2 8.2 0 1 1 16.4 0" />
      <path d="M12 16.5l4.2-5" />
    </>
  ),
  tangle: (
    <path d="M3.5 7c4.2 0 4.2 10 8.5 10s4.3-10 8.5-10M3.5 17c4.2 0 4.2-10 8.5-10s4.3 10 8.5 10" />
  ),
  up: (
    <>
      <path d="M3.5 17.5l5.5-5.5 4 3.5 7.5-8" />
      <path d="M15 7.5h5.5V13" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.2" />
      <path d="M15.2 15.2 20 20" />
    </>
  ),
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  book: (
    <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h4.5A2.5 2.5 0 0 1 12 6.5V20a2 2 0 0 0-2-2H3.5zM20.5 5.5A1.5 1.5 0 0 0 19 4h-4.5A2.5 2.5 0 0 0 12 6.5V20a2 2 0 0 1 2-2h6.5z" />
  ),
  hammer: (
    <>
      <path d="M13.5 6.5l4 4" />
      <path d="M11.5 4.5 14 2l6.5 6.5L18 11" />
      <path d="M12.6 8.4 3.8 17.2a1.8 1.8 0 0 0 2.5 2.5l8.8-8.8" />
    </>
  ),
  to: <path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5" />,
  from: <path d="M19 12H5.5M11 6.5 5.5 12l5.5 5.5" />,
  x: <path d="M7 7l10 10M17 7 7 17" />,
  folder: (
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  city: (
    <>
      <path d="M3.5 20.5h17M5.5 20.5V9.5l5-3v14M10.5 20.5V4l8 3.5v13" />
      <path d="M13.5 10.5h2M13.5 14h2M13.5 17.5h2" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  game: (
    <>
      <path d="M7 8h10a4 4 0 0 1 3.9 4.8l-.8 3.8a2.3 2.3 0 0 1-4 .9L14.5 16h-5l-1.6 1.5a2.3 2.3 0 0 1-4-.9l-.8-3.8A4 4 0 0 1 7 8z" />
      <path d="M8 11v3M6.5 12.5h3" />
    </>
  ),
};
const I = ({ n, s = 20, w = 1.9 }) => (
  <svg
    viewBox="0 0 24 24"
    width={s}
    height={s}
    fill="none"
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {IC[n] || IC.code}
  </svg>
);
// sheets and the full-screen city sit over the whole app, the top bar included (as an iPhone sheet dims everything behind it)
export const onTop = (el) => createPortal(el, document.querySelector('.app') || document.body);
const Chev = () => (
  <svg className="ph-chev" viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
    <path
      d="M1.5 1.5 6.5 7l-5 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Backstage's grey is too light for a tile with a white picture on it: the system grey instead
const tint = (k) => (k === 'support' ? '#8e8e93' : LAYER[k]?.[3] || 'var(--violet)');
const PART_IC = { ui: 'screen', server: 'door', logic: 'cog', data: 'data', support: 'sliders' };
// the kinds of tool a company runs for you (you sign up for them), as opposed to code the app is built from
const SERVICE = new Set([
  'auth',
  'pay',
  'mail',
  'db',
  'host',
  'ai',
  'files',
  'search',
  'watch',
  'bot',
]);
// where a tool sits, when no file says so
const CAT_LAYER = {
  frame: 'ui',
  ui: 'ui',
  style: 'ui',
  state: 'ui',
  viz: 'ui',
  content: 'data',
  api: 'server',
  db: 'data',
  orm: 'data',
  auth: 'logic',
  pay: 'logic',
  ai: 'logic',
  mail: 'logic',
  files: 'data',
  search: 'data',
  check: 'server',
  sci: 'logic',
  bot: 'server',
  host: 'support',
  ci: 'support',
  test: 'support',
  build: 'support',
  tidy: 'support',
  watch: 'support',
};
const layerOfTool = (t, facts) => {
  const n = {};
  (t.used || []).forEach((i) => {
    const l = facts.files[i]?.layer;
    if (l) n[l] = (n[l] || 0) + 1;
  });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || CAT_LAYER[t.cat] || 'support';
};
const sayOf = (narration, t) =>
  narration?.stack?.[t.id] ||
  Object.values(narration?.stack || {}).find((x) => x.name?.toLowerCase() === t.name.toLowerCase());
const UNIT = {
  year: 'yr',
  years: 'yrs',
  month: 'mo',
  months: 'mo',
  day: 'd',
  days: 'd',
  hour: 'h',
  hours: 'h',
  minute: 'min',
  minutes: 'min',
};
const short = (s) => {
  const m = /^(\d+) (\w+)/.exec(s || '');
  return m ? `${m[1]} ${UNIT[m[2]] || m[2]}` : s;
};
const lc = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const base = (p) => String(p).split('/').pop();

// the boxes in "how it works": who uses it, the app's own parts, where it keeps things, and the services outside it
const KIND = {
  person: ['var(--accent)', 'Who uses it'],
  part: ['var(--violet)', 'Part of the app'],
  store: ['var(--mint)', 'Keeps things'],
  outside: ['var(--sky)', 'Outside service'],
};
const kindOf = (n) => KIND[n.kind] || KIND.part;
const colorOf = (n) =>
  n.layer && n.kind !== 'person' && n.kind !== 'outside' ? tint(n.layer) : kindOf(n)[0];
// a picture for a box, from what it is and what it's called
function glyphOf(n) {
  const s = `${n.label} ${n.term || ''} ${n.does || ''}`.toLowerCase();
  if (n.kind === 'person') return 'person';
  if (n.kind === 'outside') return /chat|telegram|discord|slack|message/.test(s) ? 'chat' : 'globe';
  if (n.kind === 'store')
    return /file|doc|content|blog|markdown|mdx|article|config|setting/.test(s) ? 'doc' : 'data';
  if (/log ?in|sign|auth|session|password|account/.test(s)) return 'lock';
  if (/door|api|handler|endpoint|webhook|request|route handler|server/.test(s)) return 'door';
  if (/block|component|piece|button|widget/.test(s)) return 'blocks';
  if (/page|screen|view|front|interface|browser|display/.test(s)) return 'screen';
  if (/bot|chat|message|socket/.test(s)) return 'chat';
  if (/config|setting/.test(s)) return 'sliders';
  if (n.layer === 'logic' || /rule|logic|brain|engine|game|helper/.test(s)) return 'cog';
  return 'code';
}

// ---------------------------------------------------------------- the page
export default function PhoneAtlas(props) {
  const {
    atlas,
    facts,
    narration,
    meta,
    tools,
    hot,
    langs,
    totalL,
    mainLang,
    narrating,
    role,
    pathIdx,
    onOpen,
    onAsk,
    onFeature,
    onMakePath,
    onBuild,
    tour,
    onTour,
    onMore,
    ago,
    altsOf,
    slots = {},
  } = props;
  const [sheet, setSheet] = useState(null); // { k: 'node' | 'part' | 'tool' | 'hot' | 'story', id }
  const [city, setCity] = useState(false);
  const flow = useMemo(
    () => narration?.flow || fallbackFlow(facts, tools),
    [narration?.flow, facts, tools],
  );
  const journeys = (narration?.journeys || []).filter((j) => j.steps?.length);
  const name = (meta.full || atlas.name).split('/').pop();
  const pick = (k, id) => setSheet({ k, id });
  const close = () => setSheet(null);
  // a file opens over everything (the city included); the sheet it came from steps aside
  const openFile = (p) => {
    setSheet(null);
    onOpen(p);
  };
  const showFiles = (ids) => {
    setSheet(null);
    setCity(true);
    setTimeout(() => window.dispatchEvent(new CustomEvent('atlas-focus', { detail: ids })), 480);
  };
  const showLayer = (k) => {
    setSheet(null);
    window.dispatchEvent(new CustomEvent('atlas-layer', { detail: k }));
  };
  const toolOf = (n) =>
    (n?.stack && (tools.find((t) => t.id === n.stack) || BY_ID[n.stack])) || null;

  let shown = null;
  if (sheet?.k === 'node') {
    const n = flow.nodes.find((x) => x.id === sheet.id);
    if (n)
      shown = (
        <NodeSheet
          n={n}
          flow={flow}
          tool={toolOf(n)}
          toolOf={toolOf}
          terms={narration?.terms || []}
          pathIdx={pathIdx}
          role={role}
          onPick={(id) => pick('node', id)}
          onClose={close}
          onOpenFile={openFile}
          onAsk={onAsk}
        />
      );
  }
  if (sheet?.k === 'part')
    shown = (
      <PartSheet
        k={sheet.id}
        facts={facts}
        narration={narration}
        tools={tools}
        role={role}
        onClose={close}
        onOpenFile={openFile}
        onTool={(id) => pick('tool', id)}
        onAll={() => showLayer(sheet.id)}
      />
    );
  if (sheet?.k === 'tool') {
    const t = tools.find((x) => x.id === sheet.id);
    if (t)
      shown = (
        <ToolSheet
          t={t}
          n={sayOf(narration, t)}
          alts={altsOf(t)}
          narrating={narrating}
          onClose={close}
          onShowFiles={showFiles}
        />
      );
  }
  if (sheet?.k === 'hot' && hot[sheet.id])
    shown = (
      <HotSheet
        h={hot[sheet.id]}
        facts={facts}
        pathIdx={pathIdx}
        role={role}
        onClose={close}
        onOpenFile={openFile}
        onAsk={onAsk}
      />
    );
  if (sheet?.k === 'story' && journeys[sheet.id])
    shown = (
      <StorySheet
        j={journeys[sheet.id]}
        tools={tools}
        pathIdx={pathIdx}
        onClose={close}
        onOpenFile={openFile}
        onAsk={onAsk}
      />
    );

  return (
    <>
      <Hero
        atlas={atlas}
        facts={facts}
        narration={narration}
        meta={meta}
        tools={tools}
        langs={langs}
        totalL={totalL}
        narrating={narrating}
        ago={ago}
        onMore={onMore}
      />
      <section className="asec" id="sec-how">
        <Head
          title="How it works"
          sub="From the person using it to everything behind the screen. Tap any box to see what it does."
        />
        <FlowMap flow={flow} toolOf={toolOf} onPick={(id) => pick('node', id)} />
        {flow.fallback && narrating && (
          <p className="ph-foot">
            <span className="lens-spin" /> Drawing the real picture…
          </p>
        )}
        {journeys.length > 0 && (
          <Group title="Follow one thing through it">
            {journeys.map((j, i) => (
              <button key={i} className="ph-cell" onClick={() => pick('story', i)}>
                <span className="ph-ic round" style={{ '--c': 'var(--accent)' }}>
                  <I n="play" s={15} />
                </span>
                <span className="ph-ct">
                  <b>{j.title}</b>
                  <span>{j.steps.length} steps</span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {narration?.terms?.length > 0 && (
          <>
            <SubHead title="Words you’ll meet" />
            <div
              className="ph-pager pw-row"
              role="group"
              tabIndex={0}
              aria-label="Words you’ll meet"
            >
              {narration.terms.map((t) => (
                <div key={t.term} className="pw">
                  <b>{t.term}</b>
                  <p>{t.plain}</p>
                  {t.like && <i>{t.like}</i>}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <Parts facts={facts} tools={tools} onPick={(k) => pick('part', k)} />
      <Services tools={tools} narration={narration} onPick={(id) => pick('tool', id)} />
      <Chapter />
      <CityCard
        facts={facts}
        narration={narration}
        tools={tools}
        pathIdx={pathIdx}
        role={role}
        hot={hot}
        onExplore={() => setCity(true)}
      />
      <Risks hot={hot} narrating={narrating} onPick={(i) => pick('hot', i)} />
      <Language
        langs={langs}
        totalL={totalL}
        main={mainLang}
        narration={narration}
        narrating={narrating}
      />
      {slots.grow}
      <Code facts={facts} role={role} onOpen={onOpen} name={name} />
      <Learn
        name={name}
        narration={narration}
        tour={tour}
        onTour={onTour}
        onAsk={onAsk}
        onFeature={onFeature}
        onMakePath={onMakePath}
        onBuild={onBuild}
        narrating={narrating}
        detective={slots.detective}
      />
      {slots.contribute}
      {shown}
      {city && (
        <CityViewer onClose={() => setCity(false)}>
          <City
            facts={facts}
            narration={narration}
            tools={tools}
            pathIdx={pathIdx}
            role={role}
            onOpen={onOpen}
            narrating={narrating}
            hot={hot}
            bare
          />
        </CityViewer>
      )}
    </>
  );
}

// ---------------------------------------------------------------- pieces every section uses
function Head({ title, sub }) {
  return (
    <header className="ph-h">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </header>
  );
}
function SubHead({ title, note }) {
  return (
    <div className="ph-sh">
      <h3>{title}</h3>
      {note && <span>{note}</span>}
    </div>
  );
}
// an inset list, as in Settings: a small heading, white rows, a note under it
function Group({ title, foot, children, action }) {
  return (
    <div className="ph-group">
      {(title || action) && (
        <div className="ph-gh">
          <span>{title}</span>
          {action}
        </div>
      )}
      <div className="ph-cells">{children}</div>
      {foot && <p className="ph-foot">{foot}</p>}
    </div>
  );
}
// a sheet from the bottom: a handle to drag it away, ✕, and whatever it shows (touch.js drags it; Esc closes it)
function Sheet({ label, onClose, children, className = '' }) {
  const shut = useRef(onClose);
  shut.current = onClose;
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && shut.current();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  return onTop(
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className={`drawer psheet ${className}`} aria-label={label}>
        <button className="ib dr-x ps-x" aria-label="Close" onClick={onClose}>
          <I n="x" s={14} w={2.6} />
        </button>
        {children}
      </aside>
    </>,
  );
}
const SHORT = {
  TypeScript: 'TS',
  JavaScript: 'JS',
  Python: 'PY',
  CSS: 'CSS',
  HTML: 'HTML',
  SQL: 'SQL',
  Go: 'GO',
  Rust: 'RS',
  Ruby: 'RB',
  Java: 'JAVA',
  Kotlin: 'KT',
  Swift: 'SWIFT',
  Shell: 'SH',
  Vue: 'VUE',
  Svelte: 'SV',
  PHP: 'PHP',
  'C++': 'C++',
  C: 'C',
  'C#': 'C#',
};
function FileIcon({ f }) {
  const nm = base(f.p).toLowerCase();
  const ext = nm.includes('.') ? nm.split('.').pop() : '';
  const tag = SHORT[f.lang] || (ext && ext.length <= 4 ? ext.toUpperCase() : '');
  return (
    <span
      className="ph-file"
      style={{ '--c': f.lang ? langColor(f.lang) : '#8e8e93' }}
      aria-hidden="true"
    >
      <I n="doc" s={30} w={1.5} />
      {tag && <i>{tag}</i>}
    </span>
  );
}
function FileRow({ f, sub, onOpen, n }) {
  return (
    <button className="ph-cell" data-p={f.p} onClick={() => onOpen(f.p)}>
      {n != null ? <span className="ph-num">{n}</span> : <FileIcon f={f} />}
      <span className="ph-ct">
        <b className="ph-mono">{base(f.p)}</b>
        {sub && <span>{sub}</span>}
      </span>
      <Chev />
    </button>
  );
}

// ---------------------------------------------------------------- the top: the app's page in the App Store
function Hero({ atlas, facts, narration, meta, tools, langs, totalL, narrating, ago, onMore }) {
  const gist = narration?.gist;
  const full = meta.full || atlas.name;
  const name = full.split('/').pop();
  const owner = full.includes('/') ? full.split('/')[0] : '';
  const main = langs[0];
  const kind = gist?.kind || '';
  const kindIc = /web|site|blog|shop|store/i.test(kind)
    ? 'globe'
    : /mobile|ios|android|phone/i.test(kind)
      ? 'phone'
      : /cli|command|terminal|script/i.test(kind)
        ? 'terminal'
        : /bot|chat/i.test(kind)
          ? 'chat'
          : /game/i.test(kind)
            ? 'game'
            : 'blocks';
  const pushed = meta.pushed ? ago(meta.pushed) : '';
  const stats = [
    meta.stars > 0 && ['Stars', fmtN(meta.stars), 'on GitHub'],
    kind && ['Kind', <I key="k" n={kindIc} s={22} w={2} />, kind[0].toUpperCase() + kind.slice(1)],
    main && [
      'Language',
      main[0] === 'TypeScript'
        ? 'TS'
        : main[0] === 'JavaScript'
          ? 'JS'
          : main[0].length > 6
            ? main[0].slice(0, 5)
            : main[0],
      `${Math.round((main[1] / totalL) * 100)}% of it`,
    ],
    ['Files', fmtN(facts.totals.code), 'of code'],
    ['Lines', fmtN(facts.totals.lines), 'of code'],
    tools.length > 0 && ['Tools', String(tools.length), 'from outside'],
    pushed && ['Updated', short(pushed), /\d/.test(pushed) ? 'ago' : ''],
  ].filter(Boolean);
  const one = gist?.one || meta.description || facts.sig?.pkgDesc || `What is ${name}?`;
  return (
    <section className="asec ph-hero" id="sec-overview">
      <div className="ph-id">
        {meta.avatar ? (
          <img className="ph-av" src={meta.avatar} alt="" />
        ) : (
          <span className="ph-av ph-av-ph" aria-hidden="true">
            {name[0]?.toUpperCase()}
          </span>
        )}
        <div className="ph-idt">
          <h1 className="ph-name">{name}</h1>
          <div className="ph-by">
            {atlas.src?.kind === 'local' ? 'Your project' : owner || 'Open source'}
          </div>
          <div className="ph-acts">
            <button
              className="ph-get"
              onClick={() => document.getElementById('atlas-ask')?.focus()}
            >
              Ask
            </button>
            <button
              className="ph-round"
              aria-label="More: fork, GitHub, compare, notes"
              onClick={onMore}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <circle cx="5.5" cy="12" r="1.9" fill="currentColor" />
                <circle cx="12" cy="12" r="1.9" fill="currentColor" />
                <circle cx="18.5" cy="12" r="1.9" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="ph-stats" role="list" tabIndex={0} aria-label="Its numbers">
        {stats.map(([k, v, s]) => (
          <div key={k} className="ph-stat" role="listitem">
            <span>{k}</span>
            <b>{v}</b>
            <i>{s}</i>
          </div>
        ))}
      </div>
      <p className="ph-one">{one}</p>
      {gist?.analogy ? (
        <p className="ph-like">{gist.analogy}</p>
      ) : narrating ? (
        <div className="shimmer" style={{ width: '72%', height: 16, margin: '12px 2px 0' }} />
      ) : null}
      {gist?.does?.length > 0 && (
        <Group
          title="What you can do with it"
          foot={
            gist.users ? (
              <>
                <b>Made for</b> {lc(gist.users)}
              </>
            ) : null
          }
        >
          {gist.does.map((d) => (
            <div key={d} className="ph-cell">
              <span className="ph-ic round sm" style={{ '--c': 'var(--mint)' }}>
                <I n="check" s={14} w={2.8} />
              </span>
              <span className="ph-ct">
                <b className="reg">{d}</b>
              </span>
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- how it works: one picture of the whole thing
// Rows from the top (who starts things) down to the bottom (where things end up); a box sits under what leads to it.
// Lines show which box talks to which, a dot travelling along each in the direction it talks.
function treeLayout(flow, width) {
  const nodes = (flow?.nodes || []).slice(0, 10);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (flow?.edges || []).filter(
    (e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to,
  );
  // a line that goes back up (Stripe → the doors: "payment confirmed") is drawn beside the one going down
  const out = {};
  edges.forEach((e) => (out[e.from] ||= []).push(e));
  const into = {};
  edges.forEach((e) => {
    into[e.to] = (into[e.to] || 0) + 1;
  });
  const st = {};
  const back = new Set();
  const dfs = (id) => {
    st[id] = 1;
    for (const e of out[id] || []) {
      if (st[e.to] === 1) back.add(e);
      else if (!st[e.to]) dfs(e.to);
    }
    st[id] = 2;
  };
  nodes
    .filter((n) => !into[n.id])
    .forEach((n) => {
      if (!st[n.id]) dfs(n.id);
    });
  nodes.forEach((n) => {
    if (!st[n.id]) dfs(n.id);
  });
  const fwd = edges.filter((e) => !back.has(e));
  const depth = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++)
    for (const e of fwd) if (depth[e.to] < depth[e.from] + 1) depth[e.to] = depth[e.from] + 1;
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const deepest = Math.max(0, ...nodes.filter((n) => linked.has(n.id)).map((n) => depth[n.id]));
  nodes.forEach((n) => {
    if (!linked.has(n.id) && nodes.length > 1) depth[n.id] = deepest + 1;
  });
  const levels = [];
  nodes.forEach((n) => (levels[depth[n.id]] ||= []).push(n));

  const GAP = 8,
    VG = 34,
    pos = {};
  let y = 2;
  for (const lv of levels.filter(Boolean)) {
    // each box under the middle of what leads to it, so the lines don't cross
    const under = (n) => {
      const ps = fwd
        .filter((e) => e.to === n.id && pos[e.from])
        .map((e) => pos[e.from].x + pos[e.from].w / 2);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : width / 2;
    };
    lv.sort((a, b) => under(a) - under(b));
    const rows =
      lv.length <= 3
        ? [lv]
        : lv.length === 4
          ? [lv.slice(0, 2), lv.slice(2)]
          : Array.from({ length: Math.ceil(lv.length / 3) }, (_, i) => lv.slice(i * 3, i * 3 + 3));
    for (const row of rows) {
      const wide = row.length === 1;
      const h = wide ? 68 : 104;
      const w = wide
        ? Math.min(width, Math.max(240, width * 0.8))
        : (width - GAP * (row.length - 1)) / row.length;
      row.forEach((n, i) => {
        pos[n.id] = { x: wide ? (width - w) / 2 : i * (w + GAP), y, w, h, wide };
      });
      y += h + VG;
    }
  }
  const height = Math.max(80, y - VG + 4);
  const twin = (e) => edges.some((x) => x !== e && x.from === e.to && x.to === e.from);
  const links = edges
    .map((e) => {
      const a = pos[e.from],
        b = pos[e.to];
      const up = back.has(e);
      const off = twin(e) ? (up ? 7 : -7) : 0;
      const [s, t] = up ? [b, a] : [a, b]; // a line always runs from the box above to the box below
      const x1 = s.x + s.w / 2 + off,
        y1 = s.y + s.h,
        x2 = t.x + t.w / 2 + off,
        y2 = t.y;
      if (y2 <= y1) return null;
      const dy = Math.max(14, (y2 - y1) * 0.55);
      const d = `M${x1.toFixed(1)},${y1} C${x1.toFixed(1)},${y1 + dy} ${x2.toFixed(1)},${y2 - dy} ${x2.toFixed(1)},${y2}`;
      return { d, up, key: `${e.from}>${e.to}` };
    })
    .filter(Boolean);
  return { nodes: nodes.filter((n) => pos[n.id]), pos, links, H: height };
}

function NodeIcon({ n, tool, size = 40 }) {
  const c = colorOf(n);
  if (n.kind === 'outside' && tool)
    return (
      <span className="fx-ic brand" style={{ '--c': c, width: size, height: size }}>
        <Brand slug={tool.slug} name={tool.name} color={tool.color} size={size} />
      </span>
    );
  return (
    <span className="fx-ic" style={{ '--c': c, width: size, height: size }}>
      <span className="fx-g">
        <I n={glyphOf(n)} s={Math.round(size * 0.5)} w={2} />
      </span>
      {tool && (
        <span className="fx-badge">
          <Brand
            slug={tool.slug}
            name={tool.name}
            color={tool.color}
            size={Math.round(size * 0.5)}
          />
        </span>
      )}
    </span>
  );
}

function FlowMap({ flow, toolOf, onPick }) {
  const box = useRef(null);
  const [width, setW] = useState(340);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => treeLayout(flow, width), [flow, width]);
  const calm =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kinds = Object.keys(KIND).filter((k) => layout.nodes.some((n) => (n.kind || 'part') === k));
  return (
    <>
      <div className="fx" ref={box} style={{ height: layout.H }}>
        <svg className="fx-svg" width={width} height={layout.H} aria-hidden="true">
          {layout.links.map((k, i) => (
            <g key={k.key} className={`fx-l ${k.up ? 'up' : ''}`}>
              <path d={k.d} />
              {!calm && (
                <circle r="2.8">
                  <animateMotion
                    dur={`${2.6 + (i % 3) * 0.5}s`}
                    repeatCount="indefinite"
                    begin={`${(i * 0.55) % 2.6}s`}
                    path={k.d}
                    keyPoints={k.up ? '1;0' : '0;1'}
                    keyTimes="0;1"
                    calcMode="linear"
                  />
                </circle>
              )}
            </g>
          ))}
        </svg>
        {layout.nodes.map((n, i) => {
          const q = layout.pos[n.id];
          const t = toolOf(n);
          return (
            <button
              key={n.id}
              className={`fx-n k-${n.kind || 'part'} ${q.wide ? 'wide' : ''}`}
              style={{
                left: q.x,
                top: q.y,
                width: q.w,
                height: q.h,
                '--c': colorOf(n),
                animationDelay: `${i * 55}ms`,
              }}
              onClick={() => onPick(n.id)}
              aria-label={`${n.label}: ${n.does || kindOf(n)[1]}`}
            >
              <NodeIcon n={n} tool={t} size={q.wide ? 40 : 38} />
              <span className="fx-t">
                <b>{n.label}</b>
                {q.wide && n.does && <span>{n.does}</span>}
              </span>
              {q.wide && <Chev />}
            </button>
          );
        })}
      </div>
      <div className="fx-key" aria-hidden="true">
        {kinds.map((k) => (
          <span key={k} className={`k-${k}`}>
            <i style={{ '--c': KIND[k][0] }} />
            {KIND[k][1]}
          </span>
        ))}
      </div>
    </>
  );
}

function NodeSheet({
  n,
  flow,
  tool,
  toolOf,
  terms,
  pathIdx,
  role,
  onPick,
  onClose,
  onOpenFile,
  onAsk,
}) {
  const termOf = (t) => {
    const k = String(t || '').toLowerCase();
    if (!k) return null;
    return (
      terms.find((x) => String(x.term).toLowerCase() === k) ||
      terms.find((x) => {
        const y = String(x.term).toLowerCase();
        return y.length > 2 && (k.includes(y) || y.includes(k));
      })
    );
  };
  const term = termOf(n.term);
  const nodeOf = (id) => flow.nodes.find((x) => x.id === id);
  const talks = [
    ...flow.edges.filter((e) => e.from === n.id).map((e) => ['to', e, nodeOf(e.to)]),
    ...flow.edges.filter((e) => e.to === n.id).map((e) => ['from', e, nodeOf(e.from)]),
  ].filter((x) => x[2]);
  const files = (n.files || []).filter((f) => pathIdx.has(f));
  return (
    <Sheet label={n.label} onClose={onClose}>
      <div className="ps-in" key={n.id}>
        <div className="ps-id">
          <NodeIcon n={n} tool={tool} size={56} />
          <div>
            <div className="ps-k" style={{ '--c': colorOf(n) }}>
              {kindOf(n)[1]}
            </div>
            <h3 className="ps-title">{n.label}</h3>
            {n.does && <div className="ps-sub">{n.does}</div>}
          </div>
        </div>
        {n.more && (
          <p className="ps-p">
            <Md text={n.more} />
          </p>
        )}
        {n.term && (
          <div className="ps-term">
            <span className="ps-term-k">The real word for it</span>
            <b>{n.term}</b>
            {term?.plain && <p>{term.plain}</p>}
            {term?.like && <i>{term.like}</i>}
          </div>
        )}
        {talks.length > 0 && (
          <Group title="Talks to">
            {talks.map(([dir, e, m]) => (
              <button key={`${dir}${m.id}`} className="ph-cell" onClick={() => onPick(m.id)}>
                <NodeIcon n={m} tool={toolOf(m)} size={32} />
                <span className="ph-ct">
                  <b>{m.label}</b>
                  <span className="ps-dir">
                    <I n={dir} s={13} w={2.4} />
                    {e.label || (dir === 'to' ? 'it sends to it' : 'sends to it')}
                  </span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {files.length > 0 && (
          <Group title="Where it lives in the code">
            {files.map((p) => (
              <FileRow key={p} f={{ p, lang: null }} sub={role(p)} onOpen={onOpenFile} />
            ))}
          </Group>
        )}
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`How does “${n.label}” (${n.term || n.kind}) work in this project?`, files[0]);
            }}
          >
            <I n="spark" s={18} />
            Show me in the code
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function StorySheet({ j, tools, pathIdx, onClose, onOpenFile, onAsk }) {
  return (
    <Sheet label={j.title} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-k" style={{ '--c': 'var(--accent)' }}>
          Follow along · {j.steps.length} steps
        </div>
        <h3 className="ps-title big">{j.title}</h3>
        <ol className="stp">
          {j.steps.map((s, i) => {
            const id = String(s.p || '').startsWith('stack:') ? s.p.slice(6) : null;
            const t = id && (tools.find((x) => x.id === id) || BY_ID[id]);
            return (
              <li key={i} style={{ animationDelay: `${80 + i * 70}ms` }}>
                <span className="stp-n">{i + 1}</span>
                <div className="stp-b">
                  <p>
                    <Md text={s.md} />
                  </p>
                  {t ? (
                    <span className="stp-chip">
                      <Brand slug={t.slug} name={t.name} color={t.color} size={20} />
                      {t.name}
                    </span>
                  ) : s.p && pathIdx.has(s.p) ? (
                    <button className="stp-chip" onClick={() => onOpenFile(s.p)}>
                      <span className="ph-mono">{base(s.p)}</span>
                      <Chev />
                    </button>
                  ) : s.p ? (
                    <span className="stp-chip ph-mono">{base(s.p)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`Walk me through what happens ${lc(j.title)}, file by file.`);
            }}
          >
            <I n="book" s={18} />
            Make it a lesson
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- what it's made of: the kinds of part, like iPhone Storage
function Parts({ facts, tools, onPick }) {
  const tot = {};
  for (const f of facts.files) {
    const x = (tot[f.layer] ||= { n: 0, l: 0 });
    x.n++;
    x.l += f.lines || 0;
  }
  const all = Object.values(tot).reduce((a, x) => a + x.l, 0) || 1;
  const parts = LAYERS.filter(([k]) => tot[k]?.n);
  const pct = (k) => Math.max(1, Math.round((tot[k].l / all) * 100));
  const by = {};
  for (const t of tools) (by[layerOfTool(t, facts)] ||= []).push(t);
  return (
    <section className="asec" id="sec-parts">
      <Head
        title="What it’s made of"
        sub="Every app has the same few kinds of part. This is how much of this one each kind is."
      />
      <div className="pk-card">
        <div className="pk-top">
          <b>{fmtN(facts.totals.code)} files</b>
          <span>{fmtN(facts.totals.lines)} lines of code</span>
        </div>
        <div className="pk-bar" aria-hidden="true">
          {parts
            .filter(([k]) => tot[k].l)
            .map(([k]) => (
              <i key={k} style={{ flexGrow: tot[k].l, background: tint(k) }} />
            ))}
        </div>
        <div className="pk-key">
          {parts.map(([k, nm]) => (
            <span key={k}>
              <i style={{ background: tint(k) }} />
              {nm}
              <b>{pct(k)}%</b>
            </span>
          ))}
        </div>
      </div>
      <div className="ph-cells">
        {parts.map(([k, nm, desc]) => (
          <button key={k} className="ph-cell tall" onClick={() => onPick(k)}>
            <span className="ph-ic" style={{ '--c': tint(k) }}>
              <I n={PART_IC[k]} s={19} />
            </span>
            <span className="ph-ct">
              <b>{nm}</b>
              <span>{desc}</span>
            </span>
            {by[k]?.length > 0 && (
              <span className="pk-logos" aria-hidden="true">
                {by[k].slice(0, 3).map((t) => (
                  <Brand key={t.id} slug={t.slug} name={t.name} color={t.color} size={26} />
                ))}
              </span>
            )}
            <Chev />
          </button>
        ))}
      </div>
    </section>
  );
}

function PartSheet({ k, facts, narration, tools, role, onClose, onOpenFile, onTool, onAll }) {
  const [, nm, desc] = LAYER[k];
  const files = facts.files.filter((f) => f.layer === k);
  const lines = files.reduce((a, f) => a + (f.lines || 0), 0);
  const all = facts.files.reduce((a, f) => a + (f.lines || 0), 0) || 1;
  const big = [...files]
    .filter((f) => f.lines)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 5);
  const made = tools.filter((t) => layerOfTool(t, facts) === k);
  return (
    <Sheet label={nm} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-id">
          <span className="ph-ic xl" style={{ '--c': tint(k) }}>
            <I n={PART_IC[k]} s={28} />
          </span>
          <div>
            <div className="ps-k" style={{ '--c': tint(k) }}>
              {Math.max(1, Math.round((lines / all) * 100))}% of the code
            </div>
            <h3 className="ps-title">{nm}</h3>
            <div className="ps-sub">{desc}</div>
          </div>
        </div>
        <div className="ps-nums">
          <div>
            <b>{fmtN(files.length)}</b>
            <span>files</span>
          </div>
          <div>
            <b>{fmtN(lines)}</b>
            <span>lines</span>
          </div>
          <div>
            <b>{made.length}</b>
            <span>tools</span>
          </div>
        </div>
        {narration?.layers?.[k] && (
          <p className="ps-p">
            <Md text={narration.layers[k]} />
          </p>
        )}
        {made.length > 0 && (
          <Group title="Made with">
            {made.map((t) => (
              <button key={t.id} className="ph-cell" onClick={() => onTool(t.id)}>
                <Brand slug={t.slug} name={t.name} color={t.color} size={32} />
                <span className="ph-ct">
                  <b>{t.name}</b>
                  <span>{sayOf(narration, t)?.role || t.what}</span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {big.length > 0 && (
          <Group title="Its biggest files">
            {big.map((f) => (
              <FileRow key={f.p} f={f} sub={role(f.p)} onOpen={onOpenFile} />
            ))}
          </Group>
        )}
        <div className="ps-acts">
          <button className="ps-btn" onClick={onAll}>
            See all {files.length} file{files.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the services it signs up for, and the code it's built from
function Services({ tools, narration, onPick }) {
  const svc = tools.filter((t) => SERVICE.has(t.cat));
  const libs = tools.filter((t) => !SERVICE.has(t.cat));
  return (
    <section className="asec" id="sec-services">
      <Head
        title="Services it uses"
        sub="Companies and big pieces it plugs in, so it doesn’t have to build them itself. Tap one to see why."
      />
      {svc.length > 0 ? (
        <div className="sv-grid">
          {svc.map((t) => (
            <button key={t.id} className="sv" onClick={() => onPick(t.id)}>
              <Brand slug={t.slug} name={t.name} color={t.color} size={44} />
              <span className="sv-cat">{CATS[t.cat]?.[0] || t.cat}</span>
              <b>{t.name}</b>
              <span className="sv-what">{sayOf(narration, t)?.role || t.what}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="ph-cells">
          <div className="ph-cell">
            <span className="ph-ic round" style={{ '--c': 'var(--mint)' }}>
              <I n="check" s={15} w={2.6} />
            </span>
            <span className="ph-ct">
              <b className="reg">
                It doesn’t sign up for any outside service: everything it needs is in its own code.
              </b>
            </span>
          </div>
        </div>
      )}
      {libs.length > 0 && (
        <>
          <SubHead
            title="Built with"
            note={`${libs.length} ${libs.length === 1 ? 'library' : 'libraries'}`}
          />
          <div className="ph-pager lib-pager">
            {libs.map((t) => (
              <button key={t.id} className="lib" onClick={() => onPick(t.id)}>
                <Brand slug={t.slug} name={t.name} color={t.color} size={44} />
                <span className="ph-ct">
                  <b>{t.name}</b>
                  <span>{sayOf(narration, t)?.role || t.what}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ToolSheet({ t, n, alts, narrating, onClose, onShowFiles }) {
  return (
    <Sheet label={t.name} onClose={onClose} className="tool-sheet">
      <div className="ps-in">
        <div className="ps-id">
          <Brand slug={t.slug} name={t.name} color={t.color} size={60} />
          <div>
            <div className="ps-k" style={{ '--c': 'var(--accent)' }}>
              {CATS[t.cat]?.[0] || t.cat}
            </div>
            <h3 className="ps-title">{t.name}</h3>
            <div className="ps-sub">{CATS[t.cat]?.[1] || ''}</div>
          </div>
        </div>
        <Group title="What it does here">
          <div className="ph-cell text">
            <p>
              <Md text={n?.role || t.what} />
            </p>
          </div>
        </Group>
        {n?.why ? (
          <Group title="Why this one">
            <div className="ph-cell text">
              <p>
                <Md text={n.why} />
              </p>
            </div>
          </Group>
        ) : narrating ? (
          <div className="shimmer" style={{ margin: '18px 4px' }} />
        ) : null}
        {alts.length > 0 && (
          <Group title="It could have been">
            {alts.map((a) => (
              <div key={a.name} className="ph-cell">
                <Brand slug={a.tool?.slug} name={a.name} color={a.tool?.color} size={32} />
                <span className="ph-ct">
                  <b>{a.name}</b>
                  <span>{a.when || a.tool?.when || ''}</span>
                </span>
              </div>
            ))}
          </Group>
        )}
        {t.used?.length > 0 && (
          <div className="ps-acts">
            <button className="ps-btn" onClick={() => onShowFiles([...t.used, `s:${t.id}`])}>
              <I n="city" s={18} />
              Show the {t.used.length} file{t.used.length === 1 ? '' : 's'} that use it
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- where the plain-words part ends and the technical side begins
function Chapter() {
  return (
    <div className="ph-chapter" role="separator">
      <span className="pc-ic" aria-hidden="true">
        <I n="code" s={22} w={2.2} />
      </span>
      <h2>Under the hood</h2>
      <p>The technical side: the code itself, where it could break, and how to read it.</p>
    </div>
  );
}

// ---------------------------------------------------------------- the code city: a picture of it here, the city itself full screen
const CITY_W = 760; // the size the city is laid out at on a phone (City.jsx)
function CityCard({ facts, narration, tools, pathIdx, role, hot, onExplore }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState({ s: 0.45, h: 260 });
  useLayoutEffect(() => {
    const el = box.current,
      c = inner.current;
    if (!el || !c) return undefined;
    const up = () => {
      const s = el.clientWidth / CITY_W;
      setFit({ s, h: Math.round(Math.min(340, Math.max(180, c.offsetHeight * s))) });
    };
    const ro = new ResizeObserver(up);
    ro.observe(el);
    ro.observe(c);
    up();
    return () => ro.disconnect();
  }, []);
  return (
    <section className="asec" id="sec-anatomy">
      <Head
        title="Code city"
        sub="Every file is a building: taller means more code. Districts are the kinds of part."
      />
      <div className="cc-card" ref={box} style={{ height: fit.h }}>
        <div
          className="cc-city"
          ref={inner}
          style={{ transform: `scale(${fit.s})` }}
          aria-hidden="true"
          inert
        >
          <City
            facts={facts}
            narration={narration}
            tools={tools}
            pathIdx={pathIdx}
            role={role}
            onOpen={() => {}}
            narrating={false}
            hot={hot}
            bare
          />
        </div>
        <button className="cc-hit" onClick={onExplore} aria-label="Open the code city">
          <span className="cc-go">
            <I n="expand" s={16} w={2.2} />
            Explore the city
          </span>
        </button>
      </div>
    </section>
  );
}
function CityViewer({ onClose, children }) {
  const shut = useRef(onClose);
  shut.current = onClose;
  // (a file opened from the city closes on its own Esc: the city stays)
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.drawer')) shut.current();
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  return onTop(
    <div className="cv-full" role="dialog" aria-label="Code city">
      <div className="cv-bar">
        <b>Code city</b>
        <button className="cv-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="cv-body">{children}</div>
    </div>,
  );
}

// ---------------------------------------------------------------- where it could break
const HOT = {
  bottleneck: ['speed', 'Slow spots', 'var(--butter)'],
  fragile: ['warn', 'Fragile', 'var(--rose)'],
  complex: ['tangle', 'Hard to read', 'var(--violet)'],
  security: ['shield', 'Security', 'var(--accent)'],
  scale: ['up', 'Scale', 'var(--sky)'],
};
const hotOf = (h) => HOT[h.kind] || HOT.fragile;
function Risks({ hot, narrating, onPick }) {
  const kinds = Object.entries(
    hot.reduce((m, h) => {
      const k = HOT[h.kind] ? h.kind : 'fragile';
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  );
  return (
    <section className="asec" id="sec-hot">
      <Head
        title="Where it could break"
        sub="Fragile spots, security gaps and things that get hard as it grows. Some are measured, some come from reading the code."
      />
      {kinds.length > 0 && (
        <div className="hs-tiles" role="group" tabIndex={0} aria-label="How many of each kind">
          {kinds.map(([k, n]) => (
            <div key={k} className="hs-t" style={{ '--c': HOT[k][2] }}>
              <span className="ph-ic round sm">
                <I n={HOT[k][0]} s={14} w={2.2} />
              </span>
              <b>{n}</b>
              <span>{HOT[k][1]}</span>
            </div>
          ))}
        </div>
      )}
      {hot.length > 0 && (
        <div className="ph-cells">
          {hot.map((h, i) => (
            <button key={i} className="ph-cell tall" onClick={() => onPick(i)}>
              <span className="ph-ic" style={{ '--c': hotOf(h)[2] }}>
                <I n={hotOf(h)[0]} s={18} w={2} />
              </span>
              <span className="ph-ct">
                <b>
                  <Md text={h.title} />
                </b>
                <span className={h.p ? 'ph-mono' : ''}>{h.p || 'The whole project'}</span>
              </span>
              <Chev />
            </button>
          ))}
          {narrating && (
            <div className="ph-cell tall">
              <span className="lens-spin" />
              <span className="ph-ct">
                <b className="reg">Still looking…</b>
              </span>
            </div>
          )}
        </div>
      )}
      {hot.length === 0 &&
        (narrating ? (
          <div className="ph-cells">
            <div className="ph-cell">
              <span className="lens-spin" />
              <span className="ph-ct">
                <b className="reg">Looking for weak spots…</b>
              </span>
            </div>
          </div>
        ) : (
          <div className="ph-cells">
            <div className="ph-cell">
              <span className="ph-ic round" style={{ '--c': 'var(--mint)' }}>
                <I n="check" s={15} w={2.6} />
              </span>
              <span className="ph-ct">
                <b className="reg">Nothing stands out. A clean little codebase.</b>
              </span>
            </div>
          </div>
        ))}
    </section>
  );
}
function HotSheet({ h, facts, pathIdx, role, onClose, onOpenFile, onAsk }) {
  const [ic, label, c] = hotOf(h);
  const f = h.p && pathIdx.has(h.p) ? facts.files[pathIdx.get(h.p)] : null;
  return (
    <Sheet label={h.title} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-id">
          <span className="ph-ic xl" style={{ '--c': c }}>
            <I n={ic} s={28} w={2} />
          </span>
          <div>
            <div className="ps-k" style={{ '--c': c }}>
              {label} · {h.measured ? 'measured' : 'from reading the code'}
            </div>
            <h3 className="ps-title">
              <Md text={h.title} />
            </h3>
          </div>
        </div>
        <p className="ps-p">
          <Md text={h.md} />
        </p>
        {f && (
          <Group title="Where">
            <FileRow
              f={f}
              sub={`${role(f.p) || ''}${role(f.p) ? ' · ' : ''}${f.lines} lines${f.used ? ` · ${f.used} files use it` : ''}`}
              onOpen={onOpenFile}
            />
          </Group>
        )}
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`How would you fix this: ${h.title}?`, h.p || undefined);
            }}
          >
            <I n="spark" s={18} />
            How would I fix it?
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the language
function Language({ langs, totalL, main, narration, narrating }) {
  const langInfo = LANGS[main] || {};
  const why = narration?.lang?.why || langInfo.why;
  const alts = (
    narration?.lang?.alts?.length
      ? narration.lang.alts
      : (langInfo.alt || []).map((a) => ({ name: a, when: LANGS[a]?.why }))
  ).slice(0, 3);
  if (!main) return null;
  return (
    <section className="asec" id="sec-language">
      <Head title={`Written in ${main}`} />
      <div className="lg-card">
        <div className="lg-top">
          <Brand slug={langInfo.slug} name={main} color={langInfo.color} size={48} />
          <p>
            {why ? (
              <Md text={why} />
            ) : narrating ? (
              <span className="shimmer" />
            ) : (
              'The authors’ choice.'
            )}
          </p>
        </div>
        <div className="pk-bar" aria-hidden="true">
          {langs.slice(0, 6).map(([l, n]) => (
            <i key={l} style={{ flexGrow: n, background: langColor(l) }} />
          ))}
        </div>
        <div className="pk-key">
          {langs.slice(0, 6).map(([l, n]) => (
            <span key={l}>
              <i style={{ background: langColor(l) }} />
              {l}
              <b>{Math.max(1, Math.round((n / totalL) * 100))}%</b>
            </span>
          ))}
        </div>
      </div>
      {alts.length > 0 && (
        <Group title="It could have been">
          {alts.map((a) => (
            <div key={a.name} className="ph-cell">
              <Brand
                slug={LANGS[a.name]?.slug}
                name={a.name}
                color={LANGS[a.name]?.color}
                size={32}
              />
              <span className="ph-ct">
                <b>{a.name}</b>
                <span>
                  <Md text={a.when || ''} />
                </span>
              </span>
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the code, as a code app's file browser: folders you open, a file a sheet
function Code({ facts, role, onOpen, name }) {
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('all');
  const [dir, setDir] = useState('');
  const [way, setWay] = useState('in');
  const [more, setMore] = useState(false);
  const top = useRef(null);
  useEffect(() => {
    const h = (e) => {
      setLayer(e.detail);
      setQ('');
      setDir('');
    };
    addEventListener('atlas-layer', h);
    return () => removeEventListener('atlas-layer', h);
  }, []);
  const go = (d, w) => {
    setWay(w);
    setDir(d);
    setMore(false);
    // a long folder you were deep in: the new one starts at its top
    requestAnimationFrame(() => {
      const el = top.current;
      if (el && el.getBoundingClientRect().top < 60)
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  const flat = !!q.trim() || layer !== 'all';
  const ql = q.trim().toLowerCase();
  let rows;
  if (flat) {
    rows = facts.files
      .filter(
        (f) =>
          (layer === 'all' || f.layer === layer) &&
          (!ql || f.p.toLowerCase().includes(ql) || role(f.p).toLowerCase().includes(ql)),
      )
      .sort((a, b) => a.p.localeCompare(b.p))
      .map((f) => ({ f }));
  } else {
    const pre = dir ? `${dir}/` : '';
    const sub = new Map();
    const fs = [];
    for (const f of facts.files) {
      if (!f.p.startsWith(pre)) continue;
      const rest = f.p.slice(pre.length);
      const i = rest.indexOf('/');
      if (i < 0) fs.push(f);
      else sub.set(rest.slice(0, i), (sub.get(rest.slice(0, i)) || 0) + 1);
    }
    rows = [
      ...[...sub].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ d, n })),
      ...fs.sort((a, b) => a.p.localeCompare(b.p)).map((f) => ({ f })),
    ];
  }
  const LIMIT = 80;
  const cut = !more && rows.length > LIMIT;
  const crumbs = dir ? dir.split('/') : [];
  return (
    <section className="asec" id="sec-files" ref={top}>
      <Head
        title="The code"
        sub="Every file, with what it does in plain words. Open one to read it, or to ask about it."
      />
      <label className="ph-search">
        <I n="search" s={17} w={2.2} />
        <input
          type="search"
          placeholder={`Search ${name}’s files`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          aria-label="Search the files"
        />
        {q && (
          <button className="ph-clear" aria-label="Clear" onClick={() => setQ('')}>
            <I n="x" s={11} w={3} />
          </button>
        )}
      </label>
      <div className="ph-scope" role="tablist" aria-label="Kind of part">
        {[['all', 'All'], ...LAYERS.map((l) => [l[0], l[1]])].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={layer === k}
            className={layer === k ? 'on' : ''}
            onClick={() => setLayer(k)}
          >
            {k !== 'all' && <i style={{ background: tint(k) }} />}
            {l}
          </button>
        ))}
      </div>
      {!flat && (
        <nav className="ph-crumbs" aria-label="Folder">
          <button className={crumbs.length ? '' : 'on'} onClick={() => go('', 'out')}>
            <I n="folder" s={15} />
            {name}
          </button>
          {crumbs.map((c, i) => (
            <span key={i}>
              <Chev />
              <button
                className={i === crumbs.length - 1 ? 'on' : ''}
                onClick={() => go(crumbs.slice(0, i + 1).join('/'), 'out')}
              >
                {c}
              </button>
            </span>
          ))}
        </nav>
      )}
      <div className={`ph-cells fl2 ${way}`} key={flat ? `q:${layer}` : `d:${dir}`}>
        {(cut ? rows.slice(0, LIMIT) : rows).map((r) =>
          r.d != null ? (
            <button
              key={`d:${r.d}`}
              className="ph-cell"
              onClick={() => go(dir ? `${dir}/${r.d}` : r.d, 'in')}
            >
              <span className="ph-folder">
                <I n="folder" s={28} />
              </span>
              <span className="ph-ct">
                <b>{r.d}</b>
              </span>
              <span className="ph-val">{r.n}</span>
              <Chev />
            </button>
          ) : (
            <button
              key={r.f.p}
              className="ph-cell tall"
              data-p={r.f.p}
              onClick={() => onOpen(r.f.p)}
            >
              <FileIcon f={r.f} />
              <span className="ph-ct">
                <b className="ph-mono">{base(r.f.p)}</b>
                <span>{role(r.f.p) || (r.f.lang ? `${r.f.lang} file` : 'A file')}</span>
                {flat && r.f.p.includes('/') && (
                  <span className="ph-path">{r.f.p.slice(0, r.f.p.lastIndexOf('/'))}/</span>
                )}
              </span>
              <span className="ph-val">{r.f.lines ? fmtN(r.f.lines) : ''}</span>
            </button>
          ),
        )}
        {cut && (
          <button className="ph-cell more" onClick={() => setMore(true)}>
            Show all {rows.length} files
          </button>
        )}
        {rows.length === 0 && (
          <div className="ph-cell">
            <span className="ph-ct">
              <b className="reg">No file matches “{q}”.</b>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- learning from it
function Learn({
  name,
  narration,
  tour,
  onTour,
  onAsk,
  onFeature,
  onMakePath,
  onBuild,
  narrating,
  detective,
}) {
  const [feat, setFeat] = useState('');
  const [path, setPath] = useState(null);
  const qs = narration?.learn?.length
    ? narration.learn
    : [
        'Where does this app start?',
        'How does data flow through it?',
        'Which file should I read first?',
      ];
  const build = narration?.build;
  return (
    <section className="asec" id="sec-study">
      <Head
        title="Learn from it"
        sub="Read it in a sensible order, turn a question into a lesson, or build a small one yourself."
      />
      {build && (
        <div className="bd-card">
          <div className="bd-top">
            <span className="ph-ic xl" style={{ '--c': 'var(--accent)' }}>
              <I n="hammer" s={26} />
            </span>
            <div>
              <span>To build something like it</span>
              <b>{build.time || 'a while'}</b>
              <i>for a beginner</i>
            </div>
          </div>
          {build.skills?.length > 0 && (
            <ol className="bd-skills">
              {build.skills.map((s, i) => (
                <li key={i}>
                  <i>{i + 1}</i>
                  {s}
                </li>
              ))}
            </ol>
          )}
          {build.mini && onBuild && (
            <>
              <p className="bd-mini">{build.mini}</p>
              <button className="ps-btn" onClick={() => onBuild(build.mini)}>
                Build a mini version with me
              </button>
            </>
          )}
          {onMakePath && build.skills?.length > 0 && (
            <button
              className="ps-btn tinted"
              disabled={path === 'busy'}
              onClick={async () => {
                setPath('busy');
                try {
                  await onMakePath(
                    `be able to build something like ${name}. It takes: ${build.skills.join(', ')}. ${build.mini ? `A first small version: ${build.mini}` : ''}`,
                  );
                  setPath(null);
                } catch (e) {
                  setPath(String(e.message || e));
                }
              }}
            >
              {path === 'busy' ? 'Designing your path…' : 'Make these my learning path'}
            </button>
          )}
          {path && path !== 'busy' && <p className="bd-mini">{path}</p>}
        </div>
      )}
      {tour.length > 0 && (
        <Group
          title="Read it in this order"
          action={
            <button className="ph-gh-btn" onClick={() => onTour(0)}>
              Start
            </button>
          }
        >
          {tour.map((t, i) => (
            <FileRow key={t.p} f={{ p: t.p }} n={i + 1} sub={t.why} onOpen={() => onTour(i)} />
          ))}
        </Group>
      )}
      <Group
        title="Questions to explore"
        foot={
          narrating && !narration?.learn?.length
            ? 'Better questions arrive when the reading is done.'
            : 'Each one opens a lesson built on the real files.'
        }
      >
        {qs.map((q, i) => (
          <button key={i} className="ph-cell" onClick={() => onAsk(q)}>
            <span className="ph-ic round sm" style={{ '--c': 'var(--violet)' }}>
              <I n="spark" s={14} w={2.2} />
            </span>
            <span className="ph-ct">
              <b className="reg">{q}</b>
            </span>
            <Chev />
          </button>
        ))}
      </Group>
      {detective}
      <form
        className="ph-feature"
        onSubmit={(e) => {
          e.preventDefault();
          if (feat.trim()) {
            onFeature(feat.trim());
            setFeat('');
          }
        }}
      >
        <div className="ph-gh">
          <span>Add a feature to {name}</span>
        </div>
        <div className="ph-ff">
          <input
            value={feat}
            onChange={(e) => setFeat(e.target.value)}
            placeholder="A dark mode switch…"
            enterKeyHint="go"
            aria-label={`A feature to add to ${name}`}
          />
          <button className="ps-btn" disabled={!feat.trim()}>
            Show me how
          </button>
        </div>
      </form>
    </section>
  );
}
