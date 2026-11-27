// How the code's time grows as its input gets bigger: the measured points, the Big-O they fit, and races between
// two ways of doing the same job.
import { useMemo, useState, useEffect } from 'react';

export function Growth({ lesson, growth, onMeasure, measuring, code, lang }) {
  // the function to measure: one at the top level (not a class's own method, not a _helper), one that takes a single
  // input if there is one (it gets make_input(n)), else the first
  const guess = useMemo(() => {
    const rx =
      lang === 'python'
        ? /^def\s+(\w+)\s*\(([^)]*)\)/gm
        : /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|(\w+))\s*=>/gm;
    const fns = [...(code || '').matchAll(rx)]
      .map((m) => ({
        name: m[1] || m[3],
        need: (m[2] ?? m[4] ?? m[5] ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x && !/[=*]/.test(x) && x !== 'self').length,
      }))
      .filter((f) => f.name && !f.name.startsWith('_'));
    const fn = (fns.find((f) => f.need === 1) || fns[0])?.name || 'f';
    return lang === 'python' ? `${fn}(make_input(n))` : `${fn}(makeInput(n))`;
  }, [code, lang]);
  const given = lesson?.growth;
  const [call, setCall] = useState(given?.call || guess);
  const [setup] = useState(
    given?.setup ||
      (lang === 'python'
        ? 'def make_input(n):\n    return list(range(n))'
        : 'function makeInput(n) { return Array.from({ length: n }, (_, i) => i); }'),
  );
  useEffect(() => {
    setCall(given?.call || guess);
  }, [given, guess]);
  const series = growth || [];
  return (
    <div className="growth">
      <div className="growth-head">
        <div>
          <div className="col-h">How the work grows</div>
          <div className="muted small">
            {given?.label ||
              'Bento runs your function on bigger and bigger inputs and counts every line it executes.'}
          </div>
        </div>
        <button
          className="btn"
          onClick={() => onMeasure(given?.calls ? given : { setup, call })}
          disabled={measuring}
        >
          {measuring ? 'Measuring…' : series.length ? 'Measure again' : 'Measure'}
        </button>
      </div>
      {!given?.calls && !given?.call && (
        <div className="growth-cfg">
          <label>
            call <input className="mono" value={call} onChange={(e) => setCall(e.target.value)} />
          </label>
        </div>
      )}
      {series.length > 0 && <GrowthChart series={series} />}
      {series.length > 0 && (
        <div className="growth-verdicts">
          {series.map(
            (series, i) =>
              series.fit && (
                <div key={i} className="verdict">
                  <span className={`swatch s${i}`} />
                  <b className="mono">{series.label}</b>
                  <span className="bigo">≈ {series.fit.label}</span>
                  <span className="muted">
                    {series.pts.length > 1
                      ? `n ×${series.fit.nRatio.toFixed(0)} → steps ×${series.fit.ratio.toFixed(1)}`
                      : ''}
                  </span>
                </div>
              ),
          )}
          {series.some((s) => s.error) && (
            <div className="err-msg">{series.find((s) => s.error).error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function GrowthChart({ series }) {
  const vals = series.flatMap((s) => s.pts.map((p) => p[1])).filter((v) => v > 0);
  const [logY, setLogY] = useState(null);
  const useLog = logY ?? (vals.length && Math.max(...vals) / Math.max(1, Math.min(...vals)) > 200);
  return (
    <div className="gwrap">
      <button
        className={`chip gscale ${useLog ? 'on' : ''}`}
        onClick={() => setLogY(!useLog)}
        title="A log scale shows each curve's shape (its Big-O) even when one is huge"
      >
        {useLog ? 'log scale' : 'normal scale'}
      </button>
      <GrowthSvg series={series} log={useLog} />
      <RaceBars series={series} />
    </div>
  );
}

// The race result at the biggest size everyone finished: "same job, 60× more work".
function RaceBars({ series }) {
  if (series.length < 2) return null;
  const common = Math.max(
    ...series[0].pts
      .map((p) => p[0])
      .filter((n) => series.every((s) => s.pts.some((q) => q[0] === n))),
    0,
  );
  if (!common) return null;
  const at = series
    .map((s, i) => ({ i, label: s.label, c: s.pts.find((q) => q[0] === common)[1] }))
    .sort((a, b) => a.c - b.c);
  const max = Math.max(...at.map((a) => a.c), 1);
  const best = at[0].c || 1;
  return (
    <div className="race-bars">
      <div className="col-h">the race at n = {common.toLocaleString()}</div>
      {at.map((mark, k) => (
        <div key={mark.i} className="rb">
          <span className="rb-l mono">
            {k === 0 ? '🏁 ' : ''}
            {mark.label}
          </span>
          <span className="rb-track">
            <i
              className={`s${mark.i}`}
              style={{ width: `${Math.max(1.5, (mark.c / max) * 100)}%` }}
            />
          </span>
          <span className="rb-n">
            {mark.c.toLocaleString()} steps
            {k > 0 && mark.c / best >= 1.5 ? (
              <b> · {Math.round(mark.c / best).toLocaleString()}× more</b>
            ) : (
              ''
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function GrowthSvg({ series, log }) {
  const width = 560,
    height = 190,
    pad = { l: 52, r: 16, t: 12, b: 28 };
  const allN = series.flatMap((s) => s.pts.map((p) => p[0]));
  const maxN = Math.max(...allN, 8),
    minN = Math.min(...allN, 4);
  const maxC = Math.max(...series.flatMap((s) => s.pts.map((p) => p[1])), 1);
  const x = (n) =>
    pad.l +
    ((Math.log2(n) - Math.log2(minN)) / Math.max(1, Math.log2(maxN) - Math.log2(minN))) *
      (width - pad.l - pad.r);
  const minC = Math.max(
    1,
    Math.min(...series.flatMap((s) => s.pts.map((p) => p[1])).filter((v) => v > 0)),
  );
  const y = log
    ? (c) =>
        height -
        pad.b -
        ((Math.log10(Math.max(c, minC)) - Math.log10(minC)) /
          Math.max(0.5, Math.log10(maxC) - Math.log10(minC))) *
          (height - pad.t - pad.b)
    : (c) => height - pad.b - (c / maxC) * (height - pad.t - pad.b);
  const fmt = (v) =>
    v >= 1e6
      ? (v / 1e6).toFixed(1) + 'M'
      : v >= 1e3
        ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k'
        : String(v);
  return (
    <svg
      className="gchart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={series
        .map(
          (s) =>
            `${s.name || s.label || 'run'}: ${s.pts.map(([n, c]) => `n=${n} took ${fmt(Math.round(c))}`).join(', ')}`,
        )
        .join('. ')}
    >
      {(log ? [minC, Math.sqrt(minC * maxC), maxC] : [0, maxC / 2, maxC]).map((value, k) => (
        <g key={k}>
          <line x1={pad.l} x2={width - pad.r} y1={y(value)} y2={y(value)} className="grid-l" />
          <text x={pad.l - 8} y={y(value) + 4} textAnchor="end">
            {fmt(Math.round(value))}
          </text>
        </g>
      ))}
      {series[0]?.pts.map(([n]) => (
        <text key={n} x={x(n)} y={height - 8} textAnchor="middle">
          {n}
        </text>
      ))}
      <text x={width - pad.r} y={height - 8} textAnchor="end" className="axis-l">
        n →
      </text>
      {series.map((line, i) => (
        <g key={i} className={`ser s${i}`}>
          <polyline points={line.pts.map(([n, c]) => `${x(n)},${y(c)}`).join(' ')} />
          {line.pts.map(([n, c]) => (
            <circle key={n} cx={x(n)} cy={y(c)} r="3.5">
              <title>{`n=${n}: ${c.toLocaleString()} steps`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}
