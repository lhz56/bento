// Watch it grow: replay a project's history. Software isn't written in one go; it's grown, commit by commit.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n.js';

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
const COLORS = [
  '#ff8a5b',
  '#7c5cff',
  '#12a37a',
  '#2f80ed',
  '#e5484d',
  '#d4a017',
  '#0c7c73',
  '#a855f7',
  '#f97316',
  '#64748b',
];

export default function Grow({ full }) {
  const [st, setSt] = useState(null); // null | { loading, p } | { err } | history
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const load = async () => {
    setSt({ loading: true, p: null });
    const off = window.bento?.onAtlasProgress?.((who, p) => {
      if (who === `history:${full}`) setSt((s) => (s?.loading ? { loading: true, p } : s));
    });
    try {
      const h = await window.bento.atlasHistory(full);
      setSt(h);
      setI(0);
      setPlaying(true);
    } catch (e) {
      setSt({
        err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      });
    } finally {
      off?.();
    }
  };
  const frames = st?.frames || [];
  useEffect(() => {
    clearTimeout(timer.current);
    if (!playing || !frames.length) return;
    if (i >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setI(i + 1), Math.max(60, 11000 / frames.length));
    return () => clearTimeout(timer.current);
  }, [playing, i, frames.length]);
  const dirs = useMemo(() => {
    const last = frames[frames.length - 1]?.dirs || {};
    return Object.entries(last)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);
  }, [frames]);
  if (!window.bento?.atlasHistory || !full) return null;
  const frame = frames[i];
  const max = Math.max(1, ...frames.map((f) => f.total));
  const dmax = Math.max(1, ...dirs.map((d) => frames[frames.length - 1]?.dirs[d] || 0));
  const width = 860,
    height = 150,
    pad = 10;
  const xAt = (k) => pad + (k / Math.max(1, frames.length - 1)) * (width - 2 * pad),
    yAt = (v) => height - 22 - (v / max) * (height - 40);
  const momentAt = (m) =>
    frames.reduce(
      (best, f, k) => (Math.abs(f.n - m.n) < Math.abs(frames[best].n - m.n) ? k : best),
      0,
    );
  return (
    <section className="asec" id="sec-grow">
      <div className="sec-head">
        <div>
          <div className="kicker">{t('watch it grow')}</div>
          <h2>{t('It wasn’t written. It grew.')}</h2>
          <p className="sec-sub">
            {t(
              'Replay the project’s history: every saved change (commit), from the first file to today.',
            )}
          </p>
        </div>
      </div>
      {!st && (
        <button className="btn" onClick={load}>
          ▶ {t('Watch it grow')}
        </button>
      )}
      {st?.loading && (
        <div className="grow-load">
          <span className="lens-spin" />{' '}
          {st.p?.phase === 'reading'
            ? `${t('Reading')} ${st.p.commits?.toLocaleString()} ${t('commits')}…`
            : `${t('Downloading the history')} ${st.p?.pct != null ? `${st.p.pct}%` : ''}…`}{' '}
          <span className="muted small">
            {t('(just the list of changes, not the files: quick)')}
          </span>
        </div>
      )}
      {st?.err && (
        <div className="err-card">
          <span className="err-msg">{st.err}</span>
        </div>
      )}
      {frame && (
        <div className="grow">
          <div className="grow-top">
            <div className="gt-date">{fmtDate(frame.at)}</div>
            <div className="gt-stats">
              <span>
                <b>{frame.total.toLocaleString()}</b> {t('files')}
              </span>
              <span>
                <b>{frame.n.toLocaleString()}</b> {t('commits')}
              </span>
              <span>
                <b>{frame.people}</b> {frame.people === 1 ? t('person') : t('people')}
              </span>
            </div>
            <button
              className="btn"
              onClick={() => {
                if (i >= frames.length - 1) setI(0);
                setPlaying(!playing);
              }}
            >
              {playing ? '❚❚' : '▶'}{' '}
              {playing ? t('Pause') : i >= frames.length - 1 ? t('Replay') : t('Play')}
            </button>
          </div>
          <div className="gt-msg">
            “{frame.msg}” <span>· {frame.author}</span>
          </div>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="grow-chart"
            tabIndex={0}
            role="slider"
            aria-label={t('Project history')}
            aria-valuemin={0}
            aria-valuemax={frames.length - 1}
            aria-valuenow={i}
            aria-valuetext={`${fmtDate(frame.at)}: ${frame.total} ${t('files')}, ${frame.n} ${t('commits')}. ${frame.msg}`}
            onKeyDown={(e) => {
              const d = {
                ArrowRight: 1,
                ArrowUp: 1,
                ArrowLeft: -1,
                ArrowDown: -1,
                PageUp: 10,
                PageDown: -10,
              }[e.key];
              if (d) {
                e.preventDefault();
                setPlaying(false);
                setI(Math.max(0, Math.min(frames.length - 1, i + d)));
              } else if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                setPlaying(false);
                setI(e.key === 'Home' ? 0 : frames.length - 1);
              }
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const k = Math.round(
                ((((e.clientX - rect.left) / rect.width) * width - pad) / (width - 2 * pad)) *
                  (frames.length - 1),
              );
              if (!playing && k >= 0 && k < frames.length) setI(k);
            }}
          >
            <path
              d={`M${xAt(0)},${yAt(0)} ${frames.map((f, k) => `L${xAt(k)},${yAt(f.total)}`).join(' ')} L${xAt(frames.length - 1)},${yAt(0)} Z`}
              className="gc-area"
            />
            <path
              d={frames
                .slice(0, i + 1)
                .map((f, k) => `${k ? 'L' : 'M'}${xAt(k)},${yAt(f.total)}`)
                .join(' ')}
              className="gc-line"
            />
            {[...new Set(frames.map((f) => new Date(f.at).getFullYear()))].map((y) => {
              const index = frames.findIndex((f) => new Date(f.at).getFullYear() === y);
              return (
                <text key={y} x={xAt(index)} y={height - 6} className="gc-year">
                  {y}
                </text>
              );
            })}
            {st.moments.map((moment, j) => {
              const index = momentAt(moment);
              return (
                <g
                  key={j}
                  aria-hidden="true"
                  className={`gc-moment ${index <= i ? 'on' : ''}`}
                  onClick={() => {
                    setPlaying(false);
                    setI(index);
                  }}
                >
                  <circle cx={xAt(index)} cy={yAt(frames[index].total)} r="5" />
                  <title>{`${fmtDate(moment.at)}: ${moment.msg} (+${moment.add} −${moment.del} files)`}</title>
                </g>
              );
            })}
            <line x1={xAt(i)} x2={xAt(i)} y1={8} y2={height - 22} className="gc-now" />
          </svg>
          <div className="grow-moments">
            {st.moments.map((moment, j) => {
              const index = momentAt(moment);
              return (
                <button
                  key={j}
                  className={`gm ${index <= i ? 'on' : ''}`}
                  onClick={() => {
                    setPlaying(false);
                    setI(index);
                  }}
                >
                  <b>{fmtDate(moment.at)}</b>
                  <span>{moment.first ? `🌱 ${t('The very first commit')}` : moment.msg}</span>
                  <em>
                    {moment.add ? `+${moment.add}` : ''}
                    {moment.del ? ` −${moment.del}` : ''} {t('files')}
                  </em>
                </button>
              );
            })}
          </div>
          <div className="grow-dirs">
            {dirs.map((dir, k) => {
              const n = frame.dirs[dir] || 0;
              return (
                <div key={dir} className={`gd ${n ? '' : 'none'}`}>
                  <span className="gd-name">{dir}</span>
                  <span className="gd-bar">
                    <i
                      style={{
                        width: `${(n / dmax) * 100}%`,
                        background: COLORS[k % COLORS.length],
                      }}
                    />
                  </span>
                  <span className="gd-n">{n || ''}</span>
                </div>
              );
            })}
          </div>
          <input
            type="range"
            min="0"
            max={frames.length - 1}
            value={i}
            onChange={(e) => {
              setPlaying(false);
              setI(+e.target.value);
            }}
            className="grow-scrub"
            aria-label="when"
          />
        </div>
      )}
    </section>
  );
}
