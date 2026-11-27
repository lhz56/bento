// A file opened from the Atlas: its code, what it does, and the ripple (what uses it, and what that touches).
import { useState, useMemo, useEffect } from 'react';
import { displayName, LAYER, langColor } from '../../atlas/analyze.js';
import Brand from '../Brand.jsx';
import Editor from '../Editor.jsx';
import Md from '../Md.jsx';

const edLang = (l) =>
  l === 'Python' ? 'python' : l === 'TypeScript' ? 'typescript' : 'javascript';

// Ripple: change this file, and who could feel it? Rings = how many hops away (direct users, their users, …).
const revCache = new WeakMap();

function reverseOf(facts) {
  let r = revCache.get(facts);
  if (r) return r;
  r = facts.files.map(() => []);
  facts.files.forEach((g, j) => g.imp.forEach((i) => r[i]?.push(j)));
  revCache.set(facts, r);
  return r;
}

function Ripple({ facts, idx, onOpen }) {
  const [hov, setHov] = useState(null);
  const rings = useMemo(() => {
    const rev = reverseOf(facts);
    const seen = new Set([idx]);
    /** @type {number[][] & { more?: number }} */
    const out = [];
    let front = [idx];
    for (let d = 0; d < 3 && front.length; d++) {
      const next = [];
      for (const i of front)
        for (const j of rev[i])
          if (!seen.has(j)) {
            seen.add(j);
            next.push(j);
          }
      if (next.length) out.push(next);
      front = next;
    }
    if (front.length) {
      let more = 0;
      const q = [...front];
      while (q.length) {
        const i = q.pop();
        for (const j of rev[i])
          if (!seen.has(j)) {
            seen.add(j);
            more++;
            q.push(j);
          }
      }
      if (more) out.more = more;
    }
    return out;
  }, [facts, idx]);
  const total = rings.reduce((a, r) => a + r.length, 0) + (rings.more || 0);
  if (!total) return null;
  const pct = Math.max(1, Math.round((total / facts.files.length) * 100));
  const width = 260,
    center = width / 2,
    radius = [44, 78, 112];
  return (
    <div className="ripple">
      <svg viewBox={`0 0 ${width} ${width}`} width={width} height={width} aria-hidden="true">
        {rings.map((_, d) => (
          <circle
            key={d}
            cx={center}
            cy={center}
            r={radius[d]}
            className="rp-ring"
            style={{ animationDelay: `${d * 0.25}s` }}
          />
        ))}
        {rings.map((ring, depth) =>
          ring.slice(0, Math.floor(radius[depth] / 1.6)).map((j, k, arr) => {
            const dr = Math.max(
              2.2,
              Math.min(5.5, ((Math.PI * radius[depth]) / arr.length) * 0.55),
            );
            const a = (k / arr.length) * Math.PI * 2 - Math.PI / 2 + depth * 0.4;
            const file = facts.files[j];
            return (
              <circle
                key={j}
                cx={center + Math.cos(a) * radius[depth]}
                cy={center + Math.sin(a) * radius[depth]}
                r={hov === j ? dr + 2.5 : dr}
                fill={LAYER[file.layer]?.[3] || 'var(--ink-3)'}
                className="rp-dot"
                style={{ animationDelay: `${0.15 + depth * 0.25 + k * 0.01}s` }}
                onMouseEnter={() => setHov(j)}
                onMouseLeave={() => setHov(null)}
                onClick={() => onOpen(file.p)}
              />
            );
          }),
        )}
        <circle cx={center} cy={center} r={13} className="rp-core" />
      </svg>
      <div className="rp-text">
        <div className="mini-h">if this file changes</div>
        <div className="rp-big">
          <b>{total}</b> file{total === 1 ? '' : 's'} could feel it
        </div>
        <div className="rp-sub">
          {hov != null ? (
            <>
              <b>{displayName(facts.files[hov].p)}</b> · {facts.files[hov].p}
            </>
          ) : (
            <>
              That’s {pct}% of the project.{' '}
              {rings.map((ring, d) => (
                <span key={d} className="rp-hop">
                  {d === 0 ? 'use it directly' : `${d + 1} steps away`}:{' '}
                  <b>
                    {ring.length}
                    {d === rings.length - 1 && rings.more ? `+${rings.more}` : ''}
                  </b>
                </span>
              ))}
            </>
          )}
        </div>
        <div className="rp-term">
          The word for this is <b>coupling</b>. The ring of files a change can reach is its{' '}
          <b>blast radius</b>.{' '}
          {total / facts.files.length > 0.25
            ? 'This one is wide, so change it carefully and test a lot.'
            : 'This one is contained, so it’s fairly safe to change.'}
        </div>
      </div>
    </div>
  );
}

// =====================================================================================================
const EXT_LANG = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  vue: 'Vue',
  svelte: 'Svelte',
  css: 'CSS',
  html: 'HTML',
  sql: 'SQL',
  sh: 'Shell',
};

export function Drawer({
  onOthers,
  tour,
  p,
  facts,
  pathIdx,
  role,
  stack,
  onClose,
  onOpen,
  readFile,
  onExplain,
  onAsk,
  phone,
}) {
  const [text, setText] = useState(null);
  // a phone: what the file is about, or its code, one at a time (as a code app shows a file)
  // (a file nothing uses and that uses nothing opens on its code: there'd be nothing to say about it)
  const first = () => {
    const i = pathIdx.get(p);
    return i != null &&
      (facts.files[i].imp.length > 0 || facts.files.some((g) => g.imp.includes(i)))
      ? 'about'
      : 'code';
  };
  const [tab, setTab] = useState(first);
  useEffect(() => setTab(first()), [p]); // eslint-disable-line react-hooks/exhaustive-deps -- a newly opened file starts on its first tab
  // a file outside the analysed sample: what we know from its name and its text
  const file = facts.files[pathIdx.get(p)] || {
    p,
    lang: EXT_LANG[(/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase()] || null,
    lines: text ? text.split('\n').length : 0,
    layer: Object.keys(LAYER).includes('logic') ? 'logic' : Object.keys(LAYER)[0],
    imp: [],
    ext: [],
    used: 0,
  };
  const [query, setQuery] = useState('');
  const [others, setOthers] = useState(null);
  useEffect(() => {
    let on = true;
    setText(null);
    readFile(p)
      .then((t) => on && setText(t))
      .catch((e) => on && setText(`// ${e.message}`));
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the file when another one is opened; readFile is new each render but reads the same project
  }, [p]);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Escape closes the drawer; onClose is new each render but always does the same
  }, []);
  if (!file) return null;
  const idx = pathIdx.get(p);
  const usedBy = facts.files.filter((g) => g.imp.includes(idx));
  const uses = file.imp.map((j) => facts.files[j]);
  const tools = stack.filter((s) => s.used.includes(idx));
  const [, lname, , lcolor] = LAYER[file.layer];
  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className={`drawer ${phone ? `tab-${tab}` : ''}`} aria-label="File">
        <div className="dr-top">
          <span className="dr-layer" style={{ '--c': lcolor }}>
            {lname}
          </span>
          {file.entry && (
            <span className="dr-layer" style={{ '--c': 'var(--mint)' }}>
              starts here
            </span>
          )}
          <button className="ib dr-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {tour && (
          <div className="dr-tour">
            <span className="tour-n">{tour.i + 1}</span>
            <div>
              <div className="mini-h" style={{ margin: 0 }}>
                reading tour · {tour.i + 1} of {tour.steps.length}
              </div>
              <div className="dr-tour-w">
                <Md text={tour.steps[tour.i]?.why} />
              </div>
            </div>
            <button className="ib" disabled={tour.i === 0} onClick={() => tour.go(tour.i - 1)}>
              ◀
            </button>
            <button className="btn tiny" onClick={() => tour.go(tour.i + 1)}>
              {tour.i + 1 < tour.steps.length ? 'Next file →' : 'Finish ✓'}
            </button>
          </div>
        )}
        <div className="dr-path">{p}</div>
        <h3 className="dr-role">{role(p)}</h3>
        <div className="dr-meta">
          {file.lang && (
            <>
              <span className="ldot" style={{ background: langColor(file.lang) }} />
              {file.lang} ·{' '}
            </>
          )}
          {file.lines.toLocaleString()} lines{file.used ? ` · ${file.used} files use it` : ''}
        </div>
        <div className="dr-actions">
          <button className="btn" disabled={!text} onClick={() => onExplain(p, text)}>
            Explain it line by line
          </button>
          {onOthers && file.lang && (
            <button
              className="btn ghost"
              disabled={!text || others === 'busy'}
              onClick={async () => {
                setOthers('busy');
                try {
                  await onOthers(p, text);
                  setOthers(null);
                } catch (e) {
                  setOthers(
                    String(e.message || e).replace(
                      /^Error invoking remote method '[^']+': (Error: )?/,
                      '',
                    ),
                  );
                }
              }}
            >
              {others === 'busy' ? 'Searching GitHub…' : 'How do others write this?'}
            </button>
          )}
        </div>
        {others && others !== 'busy' && <div className="dr-note">{others}</div>}
        {phone && (
          <div className="dr-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'about'}
              className={tab === 'about' ? 'on' : ''}
              onClick={() => setTab('about')}
            >
              About
            </button>
            <button
              role="tab"
              aria-selected={tab === 'code'}
              className={tab === 'code' ? 'on' : ''}
              onClick={() => setTab('code')}
            >
              Code{file.lines ? <span>{file.lines.toLocaleString()}</span> : null}
            </button>
          </div>
        )}
        {(!phone || tab === 'about') &&
          (uses.length > 0 || usedBy.length > 0 || tools.length > 0) && (
            <div className="dr-rel">
              {uses.length > 0 && (
                <div>
                  <div className="mini-h">it uses</div>
                  {uses.slice(0, 12).map((g) => (
                    <button key={g.p} className="rel" onClick={() => onOpen(g.p)}>
                      <span className="arrow out">→</span>
                      {displayName(g.p)}
                      <span className="muted">{role(g.p)}</span>
                    </button>
                  ))}
                </div>
              )}
              {usedBy.length > 0 && (
                <div>
                  <div className="mini-h">used by</div>
                  {usedBy.slice(0, 12).map((g) => (
                    <button key={g.p} className="rel" onClick={() => onOpen(g.p)}>
                      <span className="arrow in">←</span>
                      {displayName(g.p)}
                      <span className="muted">{role(g.p)}</span>
                    </button>
                  ))}
                  {usedBy.length > 12 && (
                    <div className="muted small">and {usedBy.length - 12} more</div>
                  )}
                </div>
              )}
              {tools.length > 0 && (
                <div>
                  <div className="mini-h">outside help</div>
                  <div className="dr-tools">
                    {tools.map((s) => (
                      <span key={s.id} className="ws">
                        <Brand slug={s.slug} name={s.name} color={s.color} size={18} plain />
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        {(!phone || tab === 'about') && idx != null && (
          <Ripple facts={facts} idx={idx} onOpen={onOpen} />
        )}
        {(!phone || tab === 'code') && (
          <div className="dr-code">
            {text == null ? (
              <div className="pad">
                <div className="shimmer" />
                <div className="shimmer short" />
              </div>
            ) : (
              <Editor
                value={text.length > 60000 ? text.slice(0, 60000) + '\n// …' : text}
                lang={edLang(file.lang)}
                readOnly
                lens="code"
              />
            )}
          </div>
        )}
        <form
          className="dr-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) onAsk(query.trim(), p);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about this file…"
            enterKeyHint="send"
          />
          {phone && (
            <button className="ask-go" aria-label="Ask" disabled={!query.trim()}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M12 19V5M6 11l6-6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </form>
      </aside>
    </>
  );
}
