// The path screen: pick a path (each one a small card with a dot per stop), see where it ends, follow its stops.
import { useEffect, useState } from 'react';
import { t, tx } from '../i18n.js';
import { tracksWith } from '../paths.js';
const KIND = {
  play: ['🧪', 'playground'],
  idea: ['⬡', 'clever idea'],
  explore: ['◈', 'a real app'],
  site: ['◈', 'a real website'],
};
const kindOf = (s) => KIND[['play', 'idea', 'explore', 'site'].find((k) => s[k])];

export default function Path({ done, onGo, onIdeas, custom = [], onMakePath, onDropPath }) {
  const [track, setTrack] = useState(() => localStorage.getItem('bento.track') || 'app');
  useEffect(() => localStorage.setItem('bento.track', track), [track]);
  const ALL = tracksWith(custom);
  const shownTrack = ALL.find((x) => x.k === track) || ALL[0];
  const mine = !!shownTrack.own;
  const LIST = shownTrack.stops;
  const [goal, setGoal] = useState('');
  const [making, setMaking] = useState(null);
  const doneCount = LIST.filter((s) => done[s.id]).length;
  const [party, setParty] = useState(false);
  useEffect(() => {
    const k = `bento.pathSeen.${track}`;
    const seen = +localStorage.getItem(k) || 0;
    if (doneCount > seen) {
      setParty(true);
      setTimeout(() => setParty(false), 2200);
    }
    localStorage.setItem(k, String(doneCount));
  }, [doneCount, track]);
  const next = LIST.find((s) => !done[s.id]);
  const mins = LIST.reduce((a, s) => a + (+s.mins || 8), 0);
  const go = (s) => onGo(s);
  const nextI = next ? LIST.indexOf(next) : -1;
  // a finished path offers the next built-in one you haven't finished
  const at = ALL.indexOf(shownTrack);
  const after = [...ALL.slice(at + 1), ...ALL.slice(0, at)].find(
    (x) => !x.own && x.stops.some((s) => !done[s.id]),
  );
  return (
    <div className="explore">
      <div className="ex-inner path-inner">
        <div className="hello">{t('The path')}</div>
        <h1 className="home-h">{tx('Learn it *in order*.')}</h1>
        <div className="pcards" role="group" aria-label="Paths">
          {ALL.map((x) => {
            const d2 = x.stops.filter((s) => done[s.id]).length;
            return (
              <button
                key={x.k}
                className={`pcard ${track === x.k ? 'on' : ''} ${x.own ? 'own' : ''} ${d2 === x.stops.length ? 'all' : ''}`}
                aria-pressed={track === x.k}
                onClick={() => setTrack(x.k)}
              >
                <span className="pcard-i" aria-hidden="true">
                  {x.icon}
                </span>
                <span className="pcard-t">{x.title}</span>
                <span className="pcard-dots" aria-hidden="true">
                  {x.stops.map((s) => (
                    <i key={s.id} className={done[s.id] ? 'on' : ''} />
                  ))}
                </span>
                <span className="sr-only">
                  , {d2} of {x.stops.length} visited
                </span>
                {x.own && !x.pack && (
                  <em
                    className="track-x"
                    title="Remove this path"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDropPath(x.k);
                      setTrack('app');
                    }}
                  >
                    ×
                  </em>
                )}
              </button>
            );
          })}
        </div>
        <form
          className={`make-path ${making === 'busy' ? 'busy' : ''}`}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!goal.trim() || !onMakePath) return;
            setMaking('busy');
            try {
              const id = await onMakePath(goal.trim());
              setGoal('');
              setMaking(null);
              if (id) setTrack(id);
            } catch (err) {
              setMaking(String(err.message || err));
            }
          }}
        >
          <span>✦</span>
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Make your own path: “learn Rust”, “how React works”, “build a Discord bot”…"
            disabled={making === 'busy'}
          />
          <button className="btn" disabled={!goal.trim() || making === 'busy'}>
            {making === 'busy' ? 'Designing your path…' : 'Make it'}
          </button>
        </form>
        {making && making !== 'busy' && (
          <div className="story-err" style={{ marginBottom: 14 }}>
            {making}
          </div>
        )}
        {party && (
          <div className="path-party">
            {Array.from({ length: 22 }, (_, i) => (
              <i key={i} style={{ '--i': i }} />
            ))}
            <span>
              Stop complete! {doneCount} of {LIST.length}
            </span>
          </div>
        )}

        <div className="phero" key={track}>
          <div className="phero-main">
            <div className="phero-k">
              {mine ? 'your path' : 'path'} · {LIST.length} stops · about {Math.round(mins / 5) * 5}{' '}
              min
            </div>
            <h2>{shownTrack.title}</h2>
            <p>{shownTrack.d}</p>
            {shownTrack.end && (
              <div className="phero-end">
                <span>🏁</span>
                <div>
                  <i>Where it ends</i>
                  {shownTrack.end}
                </div>
              </div>
            )}
          </div>
          <div className="phero-side">
            <div className="phero-prog">
              <Ring f={doneCount / LIST.length} size={64} />
              <div>
                <b>{doneCount}</b>
                <span>of {LIST.length} visited</span>
              </div>
            </div>
            {next ? (
              <button className="btn" onClick={() => go(next)}>
                {doneCount ? 'Continue' : 'Start'}: stop {nextI + 1} <span>→</span>
              </button>
            ) : (
              <span className="phero-done">You’ve visited every stop.</span>
            )}
            {!next && after && (
              <button
                className="btn ghost next-path"
                onClick={() => setTrack(after.k)}
                aria-label={`Next path: ${after.title}`}
              >
                <span aria-hidden="true">{after.icon}</span>
                {after.title}
                <span aria-hidden="true">→</span>
              </button>
            )}
            {next && <span className="phero-next">{next.t}</span>}
          </div>
        </div>

        <div className="trail">
          <svg
            className="trail-road"
            viewBox="0 0 100 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M50 0 C 64 50, 64 50, 50 100 S 36 150, 50 200 S 64 250, 50 300 S 36 350, 50 400 S 64 450, 50 500 S 36 550, 50 600 S 64 650, 50 700 S 36 750, 50 800 S 64 850, 50 900 S 36 950, 50 1000" />
          </svg>
          {LIST.map((stop, i) => {
            const isDone = !!done[stop.id];
            const isNext = next?.id === stop.id;
            const kind = kindOf(stop);
            return (
              <div
                key={stop.id}
                className={`stop ${i % 2 ? 'r' : 'l'} ${isDone ? 'done' : ''} ${isNext ? 'is-next' : ''}`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="stop-n">{isDone ? '✓' : i + 1}</span>
                <div className="stop-card">
                  {isNext && <span className="here">you are here</span>}
                  {kind && (
                    <span className="stop-kind">
                      <span aria-hidden="true">{kind[0]}</span>
                      {kind[1]}
                    </span>
                  )}
                  <b>{stop.t}</b>
                  <span>{stop.d}</span>
                  {stop.make && (
                    <span className="stop-make">
                      <i>you’ll make</i>
                      {stop.make}
                    </span>
                  )}
                  <div className="stop-words">
                    {(stop.words || []).map((w) => (
                      <i key={w}>{w}</i>
                    ))}
                  </div>
                  <div className="stop-foot">
                    <button className={isNext ? 'btn' : 'btn ghost'} onClick={() => go(stop)}>
                      {isDone
                        ? 'Open again'
                        : stop.explore
                          ? 'Take apart a real app'
                          : stop.site
                            ? 'Take apart a website'
                            : stop.play
                              ? 'Open the playground'
                              : stop.idea
                                ? 'Read it'
                                : 'Start'}
                    </button>
                    <span className="stop-min">{+stop.mins || 8} min</span>
                  </div>
                </div>
              </div>
            );
          })}
          {shownTrack.end && (
            <div className={`stop-flag ${next ? '' : 'done'}`}>
              <span>🏁</span>
              <b>{shownTrack.end}</b>
            </div>
          )}
          <div className="stop-end">
            <b>Then keep going</b>
            <span>Read how Uber, Google and Stripe solved hard problems.</span>
            <button className="btn" onClick={onIdeas}>
              Clever ideas →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ring({ f: fraction = 0, size = 18 }) {
  const radius = size / 2 - (size > 30 ? 5 : 2.5),
    circumference = 2 * Math.PI * radius;
  return (
    <svg
      className="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="ring-bg"
        strokeWidth={size > 30 ? 6 : 3}
      />
      {fraction > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="ring-fg"
          strokeWidth={size > 30 ? 6 : 3}
          strokeDasharray={`${circumference * Math.min(1, fraction)} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}
