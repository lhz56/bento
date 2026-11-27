// The top of a project on a phone: what it is in one line, and the numbers that describe it.
import { fmtN } from '../../../atlas/analyze.js';
import { short, lc, I, Group } from './kit.jsx';

// ---------------------------------------------------------------- the top: the app's page in the App Store
export function Hero({
  atlas,
  facts,
  narration,
  meta,
  tools,
  langs,
  totalL,
  narrating,
  ago,
  onMore,
}) {
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
          {gist.does.map((point) => (
            <div key={point} className="ph-cell">
              <span className="ph-ic round sm" style={{ '--c': 'var(--mint)' }}>
                <I n="check" s={14} w={2.8} />
              </span>
              <span className="ph-ct">
                <b className="reg">{point}</b>
              </span>
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}
