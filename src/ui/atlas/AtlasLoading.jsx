// What shows while a project is being brought in and taken apart.
import { useState, useEffect } from 'react';
import { AskedBanner } from './AskBar.jsx';

export function AtlasLoading({ atlas, facts, onRetry, onBig, asked, onIdeaInstead }) {
  const steps = [
    ['clone', 'Bringing the code onto your Mac'],
    ['read', 'Reading every file and following the imports'],
    ['narr', 'Asking your model to explain it'],
  ];
  const real = facts ? 2 : atlas.status === 'cloning' ? 0 : atlas.status === 'reading' ? 1 : 2;
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (at >= real) return;
    const t = setTimeout(() => setAt((x) => x + 1), 480);
    return () => clearTimeout(t);
  }, [at, real]);
  const counts = facts && {
    files: facts.totals.code,
    lines: facts.totals.lines,
    links: facts.files.reduce((a, f) => a + (f.imp?.length || 0), 0),
    outside: new Set(facts.files.flatMap((f) => f.ext || [])).size,
  };
  return (
    <div className="atlas-loading">
      {asked && <AskedBanner asked={asked} atlas={atlas} onIdeaInstead={onIdeaInstead} waiting />}
      <h1 className="sr-only">Reading {atlas.name}</h1>
      <div className="al-name" aria-hidden="true">
        {atlas.name}
      </div>
      {atlas.status === 'big' ? (
        <div className="big-warn">
          <b>This one is huge.</b> GitHub lists {atlas.meta?.full} at{' '}
          {(atlas.meta.size / 1024 / 1024).toFixed(1)} GB with its whole history. Bento only
          downloads the latest version, but that can still take a few minutes and real disk space.
          <div className="big-acts">
            <button className="btn" onClick={onBig}>
              Take it apart anyway
            </button>
            <span className="muted small">or try a “bite-size” project in Explore</span>
          </div>
        </div>
      ) : atlas.status === 'error' ? (
        <div className="story-err">
          <b>Couldn’t open it.</b> {atlas.error}
          <div>
            <button className="btn tiny" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="al-steps">
          {steps.map(([k, label], i) => (
            <div key={k} className={`al-step ${i < at ? 'done' : i === at ? 'now' : ''}`}>
              <span className="al-dot">{i < at ? '✓' : ''}</span>
              {label}
              {i === 0 && at === 0 && atlas.progress?.pct != null && (
                <span className="al-pct">
                  {atlas.progress.phase === 'cached' ? 'already here' : `${atlas.progress.pct}%`}
                </span>
              )}
              {i === 1 && at >= 1 && counts && (
                <span className="al-pct">
                  {counts.files.toLocaleString()} files · {counts.lines.toLocaleString()} lines ·{' '}
                  {counts.links.toLocaleString()} imports followed · {counts.outside} outside
                  packages
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="al-ghost">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="alg-band">
            <div className="shimmer" style={{ width: 90 }} />
            {Array.from({ length: 6 + i }, (_, j) => (
              <span
                key={j}
                className="alg-peb"
                style={{ animationDelay: `${(i * 6 + j) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
