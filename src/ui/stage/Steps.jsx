// Stepping through the code line by line: each step's variables and call stack, and a movie of lists with arrows
// for the index variables that point into them.
import { useMemo, useState, useEffect } from 'react';
import { t } from '../../i18n.js';
import { Visual } from '../Viz.jsx';

// Movie mode: lists as rows of cells, index variables as arrows under the cell they point at,
// slices as a highlighted window. Built from the code itself: nums[i], h[j], s[start:start + k]…
const num = (v) => (/^-?\d+$/.test(String(v ?? '')) ? +v : null);

function evalIdx(expr, vars) {
  const parts =
    String(expr)
      .replace(/\s+/g, '')
      .match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  for (const p of parts) {
    const sign = p[0] === '-' ? -1 : 1;
    const t = p.replace(/^[+-]/, '');
    const v = /^\d+$/.test(t) ? +t : num(vars[t]);
    if (v == null) return null;
    total += sign * v;
  }
  return total;
}

function moviePlan(code) {
  const pointers = {},
    windows = {};
  for (const m of String(code || '').matchAll(
    /\b([A-Za-z_]\w*)\[\s*([A-Za-z_]\w*(?:\s*[+-]\s*\w+)?)\s*\]/g,
  ))
    (pointers[m[1]] ||= new Set()).add(m[2].replace(/\s+/g, ' '));
  for (const m of String(code || '').matchAll(
    /\b([A-Za-z_]\w*)\[\s*([\w\s+-]*?)\s*:\s*([\w\s+-]*?)\s*\]/g,
  ))
    (windows[m[1]] ||= []).push([m[2] || '0', m[3]]);
  return { pointers, windows, any: Object.keys(pointers).length + Object.keys(windows).length > 0 };
}

function Movie({ step, prev, plan }) {
  const vars = step.vars || {};
  const lists = Object.entries(vars)
    .map(([k, v]) => /** @type {[string, any]} */ ([k, asBoxes(v)]))
    .filter(([, b]) => b?.kind === 'list');
  const scalars = Object.entries(vars).filter(([, v]) => !asBoxes(v) && String(v).length <= 24);
  if (!lists.length) return null;
  return (
    <div className="movie">
      {lists.map(([name, box]) => {
        const pb = prev ? asBoxes(prev.vars?.[name]) : null;
        const arrows = [...(plan.pointers[name] || [])]
          .map((e) => [e, evalIdx(e, vars)])
          .filter(([, v]) => v != null);
        const win = (plan.windows[name] || [])
          .map(([a, b]) => [evalIdx(a, vars), b ? evalIdx(b, vars) : box.items.length])
          .find(([a, b]) => a != null && b != null);
        return (
          <div key={name} className="mv-list">
            <span className="mv-name">{name}</span>
            <div className="mv-row" style={{ '--n': box.items.length }}>
              {box.items.map((x, i) => (
                <span
                  key={i}
                  className={`mv-cell ${pb?.kind === 'list' && pb.items[i] !== x ? 'chg' : ''} ${win && i >= win[0] && i < win[1] ? 'in-win' : ''}`}
                >
                  <i>{i}</i>
                  {x}
                </span>
              ))}
              {arrows.map(([e, value], k) => {
                const at = Math.max(-0.6, Math.min(box.items.length - 0.4, value));
                const off = value < 0 || value >= box.items.length;
                return (
                  <span
                    key={e}
                    className={`mv-arrow a${k % 4} ${off ? 'off' : ''}`}
                    style={{ left: `calc(${at} * var(--cw) + var(--cw) / 2)` }}
                  >
                    ▲<b>{e}</b>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      {scalars.length > 0 && (
        <div className="mv-scalars">
          {scalars.map(([k, v]) => (
            <span key={k} className={`mv-sc ${prev && prev.vars?.[k] !== v ? 'chg' : ''}`}>
              <b>{k}</b>
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Steps({
  trace,
  stepIdx,
  setStepIdx,
  playing,
  setPlaying,
  english,
  onStep,
  code,
  tracing,
}) {
  const plan = useMemo(() => moviePlan(code), [code]);
  const [movie, setMovie] = useState(() => localStorage.getItem('bento.movie') !== 'off');
  const steps = trace?.steps || [];
  const step = steps[stepIdx];
  const prev = steps[stepIdx - 1];
  // playback you can follow: a speed you pick, and a longer look wherever something happens
  const [speed, setSpeed] = useState(() => localStorage.getItem('bento.stepSpeed') || 'normal');
  const BASE = { slow: 1700, normal: 950, fast: 380 }[speed] || 950;
  const changesAt = (k) => {
    const now = steps[k],
      before = steps[k - 1];
    if (!now || !before) return [];
    return Object.keys(now.vars || {})
      .filter((v) => before.vars?.[v] !== now.vars[v])
      .map((v) => [v, before.vars?.[v], now.vars[v]]);
  };
  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const nxt = steps[stepIdx + 1] || {};
    const cur = steps[stepIdx] || {};
    const printed = (nxt.logs || 0) > (cur.logs || 0) || (nxt.viz || 0) > (cur.viz || 0);
    const dwell =
      BASE *
      (1 + (step?.ret ? 0.5 : 0) + (changesAt(stepIdx).length ? 0.35 : 0) + (printed ? 0.4 : 0));
    const tm = setTimeout(() => setStepIdx(stepIdx + 1), dwell);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays the next step after a pause; the step's details are read from the render that set it
  }, [playing, stepIdx, steps.length, BASE]);
  // the keyboard (← → step, space plays, Home/End jump) is handled by the desk, for the whole window
  if (!trace)
    return (
      <div className="stage-empty">
        <p>
          Watch your code run one line at a time: the variables, the call stack, and what each line
          means.
        </p>
        <button className="btn" onClick={onStep}>
          {tracing ? 'Tracing…' : 'Step through'}
        </button>
      </div>
    );
  if (!steps.length)
    return (
      <div className="stage-empty">
        {trace.error ? (
          <span className="err-msg">{trace.error.msg}</span>
        ) : (
          'Nothing to step through.'
        )}
      </div>
    );
  const lines = (code || '').split('\n');
  const say = step.end
    ? 'Done. The program finished.'
    : step.ret
      ? `${step.stack[step.stack.length - 1]?.name || 'function'} returns ${step.stack[step.stack.length - 1]?.ret ?? ''}`
      : english?.[step.line - 1] || lines[step.line - 1]?.trim() || '';
  const logs = trace.logs?.slice(0, step.logs) || [];
  const viz = trace.visuals?.slice(0, step.viz) || [];
  return (
    <div
      className="steps"
      tabIndex={0}
      aria-label={t('Step through the code. Left and right arrows step, space plays.')}
    >
      <div className="step-bar">
        <button className="ib" onClick={() => setStepIdx(0)} title="First">
          ⏮
        </button>
        <button
          className="ib"
          onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
          title="Back (←)"
        >
          ◀
        </button>
        <button
          className="ib play"
          onClick={() => {
            if (stepIdx >= steps.length - 1) setStepIdx(0);
            setPlaying(!playing);
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          className="ib"
          onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))}
          title="Next (→)"
        >
          ▶︎
        </button>
        <span className="step-track">
          <input
            type="range"
            min="0"
            max={steps.length - 1}
            value={stepIdx}
            aria-label={t('Step')}
            onChange={(e) => {
              setPlaying(false);
              setStepIdx(+e.target.value);
            }}
          />
          <span className="st-marks" aria-hidden="true">
            {steps.map((x, k) =>
              k > 0 &&
              ((x.logs || 0) > (steps[k - 1].logs || 0) ||
                (x.viz || 0) > (steps[k - 1].viz || 0)) ? (
                <i
                  key={k}
                  style={{ left: `${(k / Math.max(1, steps.length - 1)) * 100}%` }}
                  title={t('prints something')}
                />
              ) : null,
            )}
          </span>
        </span>
        <span className="step-count">
          {stepIdx + 1}
          <span>/{steps.length}</span>
        </span>
        <span className="step-speed" role="radiogroup" aria-label={t('Speed')}>
          {[
            ['slow', '🐢'],
            ['normal', '1×'],
            ['fast', '⚡'],
          ].map(([k, label]) => (
            <button
              key={k}
              role="radio"
              aria-checked={speed === k}
              className={speed === k ? 'on' : ''}
              title={t(k)}
              onClick={() => {
                setSpeed(k);
                localStorage.setItem('bento.stepSpeed', k);
              }}
            >
              {label}
            </button>
          ))}
        </span>
        {plan.any && (
          <button
            className={`ib movie-t ${movie ? 'on' : ''}`}
            title="Movie: draw lists, with arrows for the variables that point into them"
            onClick={() => {
              localStorage.setItem('bento.movie', movie ? 'off' : 'on');
              setMovie(!movie);
            }}
          >
            🎬
          </button>
        )}
      </div>
      <div className={`narration ${step.ret ? 'ret' : ''} ${step.end ? 'end' : ''}`} key={stepIdx}>
        {!step.end && <span className="nar-line">line {step.line}</span>}
        <span className="nar-text">{say}</span>
        {changesAt(stepIdx).length > 0 && (
          <span className="nar-chg">
            {changesAt(stepIdx)
              .slice(0, 3)
              .map(([k, from, to]) => (
                <span key={k}>
                  <b>{k}</b>
                  {from === undefined ? (
                    ' = '
                  ) : (
                    <>
                      {' '}
                      <s>{String(from).slice(0, 14)}</s> →{' '}
                    </>
                  )}
                  <em>{String(to).slice(0, 18)}</em>
                </span>
              ))}
          </span>
        )}
      </div>
      {movie && plan.any && <Movie step={step} prev={prev} plan={plan} key="movie" />}
      <div className="step-cols">
        <div className="vars">
          <div className="col-h">Variables</div>
          {Object.keys(step.vars || {}).length === 0 && <div className="muted">none yet</div>}
          {Object.entries(step.vars || {}).map(([k, value]) => {
            const changed = prev && prev.vars?.[k] !== value;
            const born = prev && !(k in (prev.vars || {}));
            const box = asBoxes(value);
            if (box) {
              const pb = prev ? asBoxes(prev.vars?.[k]) : null;
              return (
                <div key={k} className={`var var-box ${born ? 'born' : ''}`}>
                  <span className="vk">{k}</span>
                  {box.kind === 'list' ? (
                    <div className="cells">
                      {box.items.map((x, i) => (
                        <span
                          key={i}
                          className={`cell ${pb?.kind === 'list' && pb.items[i] !== x ? 'chg' : ''}`}
                        >
                          <i>{i}</i>
                          {x}
                        </span>
                      ))}
                      {box.more && <span className="cell more">…</span>}
                      {box.items.length === 0 && <span className="cell empty">empty</span>}
                    </div>
                  ) : (
                    <div className="kvs">
                      {
                        /** @type {Array<[string, string]>} */ (box.items).map(([kk, x]) => (
                          <span
                            key={kk}
                            className={`kv ${pb?.kind === 'map' && pb.items.find((q) => q[0] === kk)?.[1] !== x ? 'chg' : ''}`}
                          >
                            <b>{kk}</b>
                            {x}
                          </span>
                        ))
                      }
                      {box.more && <span className="kv">…</span>}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={k} className={`var ${born ? 'born' : changed ? 'changed' : ''}`}>
                <span className="vk">{k}</span>
                <span className="vv">{value}</span>
              </div>
            );
          })}
        </div>
        <div className="stack">
          <div className="col-h">Call stack</div>
          <div className="frames">
            {[...(step.stack || [])].reverse().map((frame, i) => (
              <div
                key={step.stack.length - i + frame.name}
                className={`frame ${i === 0 ? 'top' : ''}`}
              >
                <span className="fn">
                  {frame.name}
                  <span className="fa">({frame.args})</span>
                </span>
                {frame.ret != null ? (
                  <span className="fret">→ {frame.ret}</span>
                ) : i === 0 ? (
                  <span className="fnow">running</span>
                ) : (
                  <span className="fwait">waiting</span>
                )}
              </div>
            ))}
            {!step.stack?.length && <div className="muted">empty</div>}
          </div>
        </div>
        <div className="sofar">
          <div className="col-h">{t('Output so far')}</div>
          {viz.length > 0 && (
            <div className="mini-viz">
              <Visual visual={viz[viz.length - 1]} />
            </div>
          )}
          <div className="console small">
            {logs.slice(-8).map((l, i) => (
              <div key={i} className={`log ${l.k}`}>
                {l.k === 'in' ? (l.p || '') + l.s : l.s}
              </div>
            ))}
            {!logs.length && !viz.length && <div className="muted">nothing yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// "[3, 1, 4]" → cells, "{'a': 1}" → key/value chips. Only flat, small values; everything else stays text.
function splitTop(text) {
  const out = [];
  let depth = 0,
    quote = null,
    cur = '';
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if ('[{('.includes(ch)) depth++;
    if (']})'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function asBoxes(value) {
  if (typeof value !== 'string' || value.length > 400) return null;
  const text = value.trim();
  const list =
    (text.startsWith('[') && text.endsWith(']')) ||
    (text.startsWith('(') && text.endsWith(')') && text.includes(','));
  if (list) {
    const items = splitTop(text.slice(1, -1));
    const more = items[items.length - 1] === '…' || items[items.length - 1] === '...';
    const xs = more ? items.slice(0, -1) : items;
    if (xs.length > 16 || xs.some((x) => /[[{(]/.test(x) || x.length > 14)) return null;
    return { kind: 'list', items: xs, more };
  }
  if (text.startsWith('{') && text.endsWith('}') && !text.startsWith('{…')) {
    const items = splitTop(text.slice(1, -1));
    const more = items[items.length - 1] === '…';
    const xs = (more ? items.slice(0, -1) : items).map((x) => {
      const i = x.indexOf(':');
      return i > 0
        ? [
            x
              .slice(0, i)
              .trim()
              .replace(/^['"]|['"]$/g, ''),
            x.slice(i + 1).trim(),
          ]
        : null;
    });
    if (!xs.length || xs.length > 8 || xs.some((x) => !x || /[[{]/.test(x[1]) || x[1].length > 18))
      return null;
    return { kind: 'map', items: xs, more };
  }
  return null;
}
