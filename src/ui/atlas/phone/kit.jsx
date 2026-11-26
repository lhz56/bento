import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LAYER, langColor } from '../../../atlas/analyze.js';

// Building blocks the phone Atlas is made of: its icons, headings, grouped lists, bottom sheets and file rows,
// and small text helpers.

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

export const I = ({ n, s = 20, w = 1.9 }) => (
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

export const Chev = () => (
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
export const tint = (k) => (k === 'support' ? '#8e8e93' : LAYER[k]?.[3] || 'var(--violet)');

export const PART_IC = {
  ui: 'screen',
  server: 'door',
  logic: 'cog',
  data: 'data',
  support: 'sliders',
};

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

export const short = (s) => {
  const m = /^(\d+) (\w+)/.exec(s || '');
  return m ? `${m[1]} ${UNIT[m[2]] || m[2]}` : s;
};

export const lc = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export const base = (p) => String(p).split('/').pop();

// ---------------------------------------------------------------- pieces every section uses
export function Head({ title, sub }) {
  return (
    <header className="ph-h">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </header>
  );
}

export function SubHead({ title, note }) {
  return (
    <div className="ph-sh">
      <h3>{title}</h3>
      {note && <span>{note}</span>}
    </div>
  );
}

// an inset list, as in Settings: a small heading, white rows, a note under it
export function Group({ title, foot, children, action }) {
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
export function Sheet({ label, onClose, children, className = '' }) {
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

export function FileIcon({ f }) {
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

export function FileRow({ f, sub, onOpen, n }) {
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
