import { langColor, fmtN } from '../../atlas/analyze.js';
import { LANGS } from '../../atlas/catalog.js';
import Brand from '../Brand.jsx';
import Md from '../Md.jsx';

// Overview cards: the languages a project is written in, and its hot spots (where it could hurt).

export function Donut({ langs, total }) {
  let a = -Math.PI / 2;
  const radius = 30,
    r = 19;
  const arcs = langs.slice(0, 6).map(([lang, n]) => {
    const da = (n / total) * Math.PI * 2;
    const a0 = a;
    a += da;
    const a1 = a - 0.02;
    const big = da > Math.PI ? 1 : 0;
    const polar = (rad, ang) =>
      `${(36 + rad * Math.cos(ang)).toFixed(2)},${(36 + rad * Math.sin(ang)).toFixed(2)}`;
    return (
      <path
        key={lang}
        d={
          da >= Math.PI * 2 - 0.03
            ? `M36,${36 - radius} A${radius},${radius} 0 1 1 35.99,${36 - radius} L35.99,${36 - r} A${r},${r} 0 1 0 36,${36 - r} Z`
            : `M${polar(radius, a0)} A${radius},${radius} 0 ${big} 1 ${polar(radius, a1)} L${polar(r, a1)} A${r},${r} 0 ${big} 0 ${polar(r, a0)} Z`
        }
        fill={langColor(lang)}
      >
        <title>
          {lang} {Math.round((n / total) * 100)}%
        </title>
      </path>
    );
  });
  return (
    <div className="donut">
      <svg viewBox="0 0 72 72" width="88" height="88">
        {arcs}
      </svg>
      <div className="donut-l">
        {langs.slice(0, 3).map(([l, n]) => (
          <span key={l}>
            <i style={{ background: langColor(l) }} />
            {l} <b>{Math.round((n / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// =====================================================================================================
export function Language({ langs, totalL, main, narration, narrating }) {
  const langInfo = LANGS[main] || {};
  const why = narration?.lang?.why || langInfo.why;
  const alts = narration?.lang?.alts?.length
    ? narration.lang.alts
    : (langInfo.alt || []).map((a) => ({ name: a, when: LANGS[a]?.why }));
  return (
    <section className="asec" id="sec-language">
      <div className="sec-head">
        <div>
          <div className="kicker">language</div>
          <h2>Why it’s written in {main || 'this'}</h2>
        </div>
      </div>
      <div className="lang-wrap">
        <div className="lang-main">
          <Brand slug={langInfo.slug} name={main} color={langInfo.color} size={64} />
          <div>
            <p className="lang-why">
              {why ? (
                <Md text={why} />
              ) : narrating ? (
                <span className="shimmer" />
              ) : (
                'The authors’ choice.'
              )}
              {!narration?.lang && narrating && (
                <span className="muted small"> (a general answer for now)</span>
              )}
            </p>
            {alts.length > 0 && (
              <div className="lang-alts">
                <span className="mini-h">it could have been</span>
                {alts.slice(0, 3).map((alt) => (
                  <div key={alt.name} className="lang-alt">
                    <Brand
                      slug={LANGS[alt.name]?.slug}
                      name={alt.name}
                      color={LANGS[alt.name]?.color}
                      size={22}
                      plain
                    />
                    <b>{alt.name}</b>
                    <span>
                      <Md text={alt.when || ''} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="lang-mix">
          {langs.slice(0, 8).map(([lang, n]) => (
            <div key={lang} className="lm-row">
              <span className="lm-name">
                <span className="ldot" style={{ background: langColor(lang) }} />
                {lang}
              </span>
              <span className="lm-bar">
                <i
                  style={{
                    width: `${Math.max(1.5, (n / totalL) * 100)}%`,
                    background: langColor(lang),
                  }}
                />
              </span>
              <span className="lm-n">{fmtN(n)}</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 6 }}>
            lines of code per language
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================================================
const HOT_ICON = {
  bottleneck: ['⏱', 'Slow spot'],
  fragile: ['⚠', 'Fragile'],
  complex: ['≋', 'Hard to read'],
  security: ['⛨', 'Security'],
  scale: ['⇡', 'Scale'],
};

export function Hotspots({ hot, role, onOpen, narrating, facts, pathIdx }) {
  const maxL = Math.max(100, ...facts.files.filter((f) => f.lang).map((f) => f.lines));
  const maxU = Math.max(3, ...facts.files.map((f) => f.used));
  const kinds = Object.entries(
    hot.reduce((m, h) => {
      const k = h.kind || 'fragile';
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  );
  return (
    <section className="asec" id="sec-hot">
      <div className="sec-head">
        <div>
          <div className="kicker">hot spots</div>
          <h2>Where it could hurt</h2>
          <p className="sec-sub">
            Bottlenecks, fragile spots and things that get hard as it grows. Some are measured, some
            come from reading the code.
          </p>
        </div>
      </div>
      {kinds.length > 0 && (
        <div className="hot-sum">
          {kinds.map(([kind, n]) => {
            const [ic, label] = HOT_ICON[kind] || HOT_ICON.fragile;
            return (
              <span key={kind} className={`hs k-${kind}`}>
                <i>{ic}</i>
                <b>{n}</b>
                {label.toLowerCase()}
              </span>
            );
          })}
        </div>
      )}
      <div className="hots">
        {hot.length === 0 && !narrating && (
          <p className="muted">Nothing stands out. Clean little codebase.</p>
        )}
        {hot.map((spot, i) => {
          const [ic, label] = HOT_ICON[spot.kind] || HOT_ICON.fragile;
          return (
            <div key={i} className={`hot k-${spot.kind || 'fragile'}`}>
              {spot.p && pathIdx.has(spot.p) ? (
                <MiniBuilding
                  f={facts.files[pathIdx.get(spot.p)]}
                  maxL={maxL}
                  maxU={maxU}
                  kind={spot.kind}
                />
              ) : (
                <span className="hot-ic">{ic}</span>
              )}
              <div className="hot-main">
                <div className="hot-top">
                  <b>{spot.title}</b>
                  <span className="hot-kind">{label}</span>
                  <span className="hot-src">
                    {spot.measured ? 'measured' : 'from reading the code'}
                  </span>
                </div>
                <div className="hot-md">
                  <Md text={spot.md} />
                </div>
                {spot.p && (
                  <button className="file-chip" onClick={() => onOpen(spot.p)}>
                    {spot.p}
                    <span>{role(spot.p)}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {narrating && (
          <div className="hot ghost">
            <span className="hot-ic">
              <span className="lens-spin" />
            </span>
            <div className="hot-main">
              <div className="shimmer" style={{ width: '40%' }} />
              <div className="shimmer short" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// A file as one little building: height = lines, the beacon = how many files depend on it.
function MiniBuilding({ f, maxL, maxU, kind }) {
  const h = 10 + 34 * Math.sqrt(Math.min(1, f.lines / maxL));
  const u = f.used / maxU;
  const c =
    kind === 'complex'
      ? 'var(--violet)'
      : kind === 'scale'
        ? 'var(--accent)'
        : kind === 'bottleneck'
          ? 'var(--butter)'
          : 'var(--rose)';
  return (
    <span className="mini-b" title={`${f.lines} lines · used by ${f.used} files`}>
      <svg viewBox="0 0 46 64" width="46" height="64">
        <ellipse cx="23" cy="58" rx={16 + u * 6} ry={4 + u * 2} fill={c} opacity={0.12 + u * 0.3} />
        <path
          d={`M12 ${56} L23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} L12 ${56 - h} Z`}
          fill={`color-mix(in srgb, ${c} 25%, var(--bsid))`}
        />
        <path
          d={`M23 ${60} L34 ${56} L34 ${56 - h} L23 ${60 - h} Z`}
          fill={`color-mix(in srgb, ${c} 40%, var(--bsid))`}
        />
        <path
          d={`M12 ${56 - h} L23 ${52 - h} L34 ${56 - h} L23 ${60 - h} Z`}
          fill={langColor(f.lang)}
        />
        {f.used > 2 && (
          <>
            <line x1="23" y1={56 - h} x2="23" y2={46 - h} stroke={c} strokeWidth="1.6" />
            <circle cx="23" cy={45 - h} r="2.8" fill={c} />
          </>
        )}
      </svg>
      <span className="mb-n">
        {f.lines}
        <i>lines</i>
      </span>
    </span>
  );
}
