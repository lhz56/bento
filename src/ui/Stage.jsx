import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { Visual, Visuals } from './Viz.jsx';
import { explainLocal } from '../errors.js';
import { announce } from './a11y.js';
import { K } from '../platform.js';

const TAB_TIPS = {
  output: 'What the code printed and drew',
  steps: 'Replay the program one line at a time, with every value',
  growth: 'How much more work the code does as its input grows (Big-O)',
  tests: 'Checks that say whether the code does what it should',
};

export default function Stage(p) {
  const { tab, setTab, lesson } = p;
  // Predict, then run: guess the output first, then see how close you were.
  const [pred, setPred] = useState(null); // { phase: 'ask' | 'wait' | 'done', guess, result }
  useEffect(() => setPred(null), [lesson?.id]);
  useEffect(() => {
    if (pred?.phase === 'wait' && p.result && p.result !== pred.before)
      setPred((x) => ({ ...x, phase: 'done', result: p.result }));
  }, [p.result]);
  // screen readers hear how each run ended, without losing their place in the code
  useEffect(() => {
    const r = p.result;
    if (!r || p.running) return;
    if (r.error)
      announce(
        `${t('Your code stopped')}${r.error.line ? ` ${t('on line')} ${r.error.line}` : ''}: ${r.error.msg}`,
      );
    else if (!r.need) {
      const n = (r.logs || []).filter((l) => l.k !== 'in').length;
      const v = (r.visuals || []).length;
      announce(
        `${t('Ran')}. ${n} ${n === 1 ? t('line printed') : t('lines printed')}${v ? `, ${v} ${v === 1 ? t('picture') : t('pictures')}` : ''}.`,
      );
    }
  }, [p.result, p.running]);
  const tabs = [
    ['output', 'Output'],
    ['steps', 'Steps'],
    ['growth', 'Growth'],
    ...(lesson?.tests ? [['tests', 'Tests']] : []),
  ];
  return (
    <div className="stage">
      <div className="stage-tabs">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            className={`stab ${tab === k ? 'on' : ''}`}
            onClick={() => setTab(k)}
            title={t(TAB_TIPS[k])}
          >
            {t(label)}
            {k === 'tests' && p.tests && (
              <span className={`stab-dot ${p.tests.every((r) => r.ok) ? 'ok' : 'bad'}`} />
            )}
            {k === 'output' && p.result?.error && <span className="stab-dot bad" />}
          </button>
        ))}
        {p.onWhyDiff && (
          <button
            className={`stab predict ${pred ? 'on' : ''}`}
            title="Guess what the code will print before you run it"
            onClick={() => {
              setTab('output');
              setPred(pred ? null : { phase: 'ask', guess: '' });
            }}
          >
            {t('🔮 Predict')}
          </button>
        )}
        <div className="stage-meta">
          {p.running ? (
            <span className="runpulse">running</span>
          ) : p.result?.ms != null && tab === 'output' ? (
            `${p.result.ms < 1 ? '<1' : Math.round(p.result.ms)} ms`
          ) : (
            ''
          )}
        </div>
      </div>
      <div className="stage-body" tabIndex={0} role="region" aria-label={t('What your code did')}>
        {tab === 'output' && pred && (
          <Predict
            pred={pred}
            setPred={setPred}
            run={() => {
              setPred((x) => ({ ...x, phase: 'wait', before: p.result }));
              p.onRun();
            }}
            onWhyDiff={p.onWhyDiff}
          />
        )}
        {tab === 'output' && (!pred || pred.phase === 'done') && <Output {...p} />}
        {tab === 'steps' && <Steps {...p} />}
        {tab === 'growth' && <Growth {...p} />}
        {tab === 'tests' && <Tests {...p} />}
      </div>
    </div>
  );
}

const Tick = ({ s }) =>
  String(s || '')
    .split(/(`[^`]+`)/)
    .map((x, i) =>
      x.startsWith('`') && x.endsWith('`') && x.length > 2 ? (
        <code key={i}>{x.slice(1, -1)}</code>
      ) : (
        x
      ),
    );

const norm = (x) =>
  String(x)
    .toLowerCase()
    .replace(/[\s'"`]+/g, ' ')
    .replace(/[[\](){},:]/g, (c) => ` ${c} `)
    .replace(/\s+/g, ' ')
    .trim();
function Predict({ pred, setPred, run, onWhyDiff }) {
  const [why, setWhy] = useState(null);
  if (pred.phase === 'ask' || pred.phase === 'wait')
    return (
      <div className="predict-card">
        <div className="pc-h">
          🔮 <b>Before you run it, what will it print?</b>
        </div>
        <p>
          Read the code and write your guess, one line per printed line. Guessing first is one of
          the best ways to learn.
        </p>
        <textarea
          autoFocus
          rows={3}
          value={pred.guess}
          placeholder="My guess…"
          onChange={(e) => setPred({ ...pred, guess: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pred.guess.trim()) run();
          }}
        />
        <div className="pc-act">
          <button className="link" onClick={() => setPred(null)}>
            Skip
          </button>
          <button
            className="btn"
            disabled={!pred.guess.trim() || pred.phase === 'wait'}
            onClick={run}
          >
            {pred.phase === 'wait' ? 'Running…' : 'Run and check ⌘↵'}
          </button>
        </div>
      </div>
    );
  const result = pred.result || {};
  const out = (result.logs || []).map((l) => l.s).join('\n');
  const g = pred.guess.trim().split('\n').map(norm).filter(Boolean);
  const o = out.split('\n').map(norm).filter(Boolean);
  const hits = g.filter((x, i) => o[i] === x).length;
  const verdict = result.error
    ? 'crash'
    : !o.length
      ? 'quiet'
      : hits === Math.max(g.length, o.length)
        ? 'exact'
        : hits > 0 || (g.length && o.some((x) => g.includes(x)))
          ? 'close'
          : 'miss';
  const msg = {
    exact: ['🎯', 'Spot on!', 'You read the code exactly like the computer did.'],
    close: ['👀', 'Close!', `You got ${hits} of ${o.length} lines right.`],
    miss: [
      '🤔',
      'Surprise!',
      'The code did something different. That gap is exactly where the learning is.',
    ],
    crash: ['💥', 'It crashed', 'Did you see that coming? The error is below.'],
    quiet: [
      '🖼',
      'It drew instead of printing',
      'Compare the picture below with what you imagined.',
    ],
  }[verdict];
  return (
    <div className={`predict-res ${verdict}`}>
      <div className="pr-top">
        <span className="pr-emo">{msg[0]}</span>
        <div>
          <b>{msg[1]}</b>
          <span>{msg[2]}</span>
        </div>
        <button className="link" onClick={() => setPred({ phase: 'ask', guess: '' })}>
          Predict again
        </button>
      </div>
      {o.length > 0 && (
        <div className="pr-cols">
          <div>
            <div className="mini-h">you guessed</div>
            <pre>{pred.guess.trim()}</pre>
          </div>
          <div>
            <div className="mini-h">it printed</div>
            <pre>
              {out
                .split('\n')
                .filter((x) => x.trim())
                .slice(0, 12)
                .map((x, i) => (
                  <span key={i} className={g[i] === norm(x) ? 'ln ok' : 'ln no'}>
                    {x}
                    {'\n'}
                  </span>
                ))}
            </pre>
          </div>
        </div>
      )}
      {verdict !== 'exact' &&
        verdict !== 'quiet' &&
        onWhyDiff &&
        (why ? (
          <div className="err-ex">
            <Tick s={why} />
          </div>
        ) : (
          <button
            className="btn tiny"
            onClick={async () => {
              setWhy('…');
              setWhy(
                await onWhyDiff(pred.guess, result.error ? `ERROR: ${result.error.msg}` : out),
              );
            }}
          >
            Why is it different?
          </button>
        ))}
    </div>
  );
}

function Output({
  result,
  onExplainError,
  onHoverLine,
  pyReady,
  lang,
  onRun,
  running,
  live = [],
  onAnswer,
  stuck,
  onUnstick,
  onStepThrough,
  onStuckHint,
}) {
  const [ex, setEx] = useState(null);
  useEffect(() => setEx(null), [result]);
  // a slow program: show what it has printed so far
  if (running && live.length)
    return (
      <div className="output">
        <div className="console live">
          {live.map((l, i) => (
            <div key={i} className={`log ${l.k}`}>
              {l.s || ' '}
            </div>
          ))}
          <div className="log live-dot">▍</div>
        </div>
      </div>
    );
  if (!result) {
    return (
      <div className="stage-empty">
        <div className="kbd-hint">
          <kbd>{K.mod}</kbd>
          <kbd>{K.enter}</kbd> run · <kbd>{K.mod}</kbd>
          <kbd>{K.shift}</kbd>
          <kbd>{K.enter}</kbd> step through · hold <kbd>{K.alt}</kbd> and drag a number
        </div>
        {lang === 'python' && !pyReady && <div className="warm">Python is warming up…</div>}
        <button className="btn ghost" onClick={onRun}>
          Run it
        </button>
      </div>
    );
  }
  const { logs = [], visuals = [], error } = result;
  return (
    <div className="output">
      {stuck && (
        <Stuck
          stuck={stuck}
          onUnstick={onUnstick}
          onStepThrough={onStepThrough}
          onStuckHint={onStuckHint}
        />
      )}
      {error && (
        <div className="err-card" role="alert">
          <div className="err-top">
            <span className="err-msg">{error.msg}</span>
            {error.line && (
              <button
                className="err-line"
                onMouseEnter={() => onHoverLine([error.line, error.line])}
                onMouseLeave={() => onHoverLine(null)}
              >
                line {error.line}
              </button>
            )}
          </div>
          {(() => {
            const explained =
              ex ||
              (document.documentElement.lang.startsWith('en') ? explainLocal(error.msg) : null);
            return explained ? (
              <div className="err-ex">
                <b>What happened:</b> <Tick s={explained.plain} />
                {explained.fix && (
                  <>
                    <br />
                    <b>Try:</b> <Tick s={explained.fix} />
                  </>
                )}
                {explained.local && onExplainError && (
                  <div>
                    <button
                      className="link"
                      onClick={async () => {
                        setEx({ plain: '…' });
                        setEx(await onExplainError(error));
                      }}
                    >
                      Explain it for my code →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="btn tiny"
                onClick={async () => {
                  setEx({ plain: '…' });
                  setEx(await onExplainError(error));
                }}
              >
                Explain this error
              </button>
            );
          })()}
        </div>
      )}
      {visuals.length > 0 && (
        <div className="visuals">
          <Visuals list={visuals} />
        </div>
      )}
      {(logs.length > 0 || result.need) && (
        <div className="console">
          {logs.map((l, i) =>
            l.k === 'in' ? (
              <div key={i} className="log in">
                {l.p}
                <b>{l.s}</b>
              </div>
            ) : (
              <div key={i} className={`log ${l.k}`}>
                {l.s || ' '}
              </div>
            ),
          )}
          {result.need && onAnswer && (
            <AnswerLine prompt={result.need.prompt} onAnswer={onAnswer} />
          )}
        </div>
      )}
      {result.need && (
        <div className="ask-note">
          ⌨ The program is asking you something. Type an answer and press <kbd>↵</kbd>.
        </div>
      )}
      {!error && !result.need && !logs.length && !visuals.length && (
        <div className="stage-empty small">
          Ran fine, but nothing was printed. Add <code>print()</code> or <code>show()</code>.
        </div>
      )}
    </div>
  );
}

// Same wall three times: offer a different way in, without giving the answer away
function Stuck({ stuck, onUnstick, onStepThrough, onStuckHint }) {
  const [hint, setHint] = useState(null);
  return (
    <div className="stuck fade-in">
      <div className="stuck-top">
        🧭{' '}
        <b>
          {stuck.why === 'error'
            ? 'Same error three times. Want another way in?'
            : 'Those tests are being stubborn. Want another way in?'}
        </b>
        <button className="link" onClick={onUnstick}>
          ✕
        </button>
      </div>
      <div className="stuck-acts">
        <button className="btn tiny" onClick={onStepThrough}>
          ⏵⏵ Step through and watch the values
        </button>
        {onStuckHint && (
          <button
            className="btn tiny ghost"
            disabled={hint === '…'}
            onClick={async () => {
              setHint('…');
              try {
                setHint(await onStuckHint());
              } catch {
                setHint('Your AI didn’t answer. Try stepping through instead.');
              }
            }}
          >
            ✦ A picture-first hint
          </button>
        )}
      </div>
      {hint && (
        <div className="stuck-hint">
          {hint === '…' ? 'Thinking of a nudge…' : <Tick s={hint} />}
        </div>
      )}
    </div>
  );
}

// The program called input(): answer right where it asked
function AnswerLine({ prompt, onAnswer }) {
  const [v, setV] = useState('');
  return (
    <form
      className="log in asking"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer(v);
        setV('');
      }}
    >
      <span>{prompt}</span>
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label={prompt || 'your answer'}
        placeholder="type here…"
      />
    </form>
  );
}

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
function Movie({ s, prev, plan }) {
  const vars = s.vars || {};
  const lists = Object.entries(vars)
    .map(([k, v]) => [k, asBoxes(v)])
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
              {arrows.map(([e, v], k) => {
                const at = Math.max(-0.6, Math.min(box.items.length - 0.4, v));
                const off = v < 0 || v >= box.items.length;
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

function Steps({
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
  const s = steps[stepIdx];
  const prev = steps[stepIdx - 1];
  // playback you can follow: a speed you pick, and a longer look wherever something happens
  const [speed, setSpeed] = useState(() => localStorage.getItem('bento.stepSpeed') || 'normal');
  const BASE = { slow: 1700, normal: 950, fast: 380 }[speed] || 950;
  const changesAt = (k) => {
    const a = steps[k],
      b = steps[k - 1];
    if (!a || !b) return [];
    return Object.keys(a.vars || {})
      .filter((v) => b.vars?.[v] !== a.vars[v])
      .map((v) => [v, b.vars?.[v], a.vars[v]]);
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
      (1 + (s?.ret ? 0.5 : 0) + (changesAt(stepIdx).length ? 0.35 : 0) + (printed ? 0.4 : 0));
    const tm = setTimeout(() => setStepIdx(stepIdx + 1), dwell);
    return () => clearTimeout(tm);
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
  const say = s.end
    ? 'Done. The program finished.'
    : s.ret
      ? `${s.stack[s.stack.length - 1]?.name || 'function'} returns ${s.stack[s.stack.length - 1]?.ret ?? ''}`
      : english?.[s.line - 1] || lines[s.line - 1]?.trim() || '';
  const logs = trace.logs?.slice(0, s.logs) || [];
  const viz = trace.visuals?.slice(0, s.viz) || [];
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
          ].map(([k, l]) => (
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
              {l}
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
      <div className={`narration ${s.ret ? 'ret' : ''} ${s.end ? 'end' : ''}`} key={stepIdx}>
        {!s.end && <span className="nar-line">line {s.line}</span>}
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
      {movie && plan.any && <Movie s={s} prev={prev} plan={plan} key="movie" />}
      <div className="step-cols">
        <div className="vars">
          <div className="col-h">Variables</div>
          {Object.keys(s.vars || {}).length === 0 && <div className="muted">none yet</div>}
          {Object.entries(s.vars || {}).map(([k, v]) => {
            const changed = prev && prev.vars?.[k] !== v;
            const born = prev && !(k in (prev.vars || {}));
            const box = asBoxes(v);
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
                      {box.items.map(([kk, x]) => (
                        <span
                          key={kk}
                          className={`kv ${pb?.kind === 'map' && pb.items.find((q) => q[0] === kk)?.[1] !== x ? 'chg' : ''}`}
                        >
                          <b>{kk}</b>
                          {x}
                        </span>
                      ))}
                      {box.more && <span className="kv">…</span>}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={k} className={`var ${born ? 'born' : changed ? 'changed' : ''}`}>
                <span className="vk">{k}</span>
                <span className="vv">{v}</span>
              </div>
            );
          })}
        </div>
        <div className="stack">
          <div className="col-h">Call stack</div>
          <div className="frames">
            {[...(s.stack || [])].reverse().map((f, i) => (
              <div key={s.stack.length - i + f.name} className={`frame ${i === 0 ? 'top' : ''}`}>
                <span className="fn">
                  {f.name}
                  <span className="fa">({f.args})</span>
                </span>
                {f.ret != null ? (
                  <span className="fret">→ {f.ret}</span>
                ) : i === 0 ? (
                  <span className="fnow">running</span>
                ) : (
                  <span className="fwait">waiting</span>
                )}
              </div>
            ))}
            {!s.stack?.length && <div className="muted">empty</div>}
          </div>
        </div>
        <div className="sofar">
          <div className="col-h">{t('Output so far')}</div>
          {viz.length > 0 && (
            <div className="mini-viz">
              <Visual v={viz[viz.length - 1]} />
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

function Growth({ lesson, growth, onMeasure, measuring, code, lang }) {
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
  const g = lesson?.growth;
  const [call, setCall] = useState(g?.call || guess);
  const [setup] = useState(
    g?.setup ||
      (lang === 'python'
        ? 'def make_input(n):\n    return list(range(n))'
        : 'function makeInput(n) { return Array.from({ length: n }, (_, i) => i); }'),
  );
  useEffect(() => {
    setCall(g?.call || guess);
  }, [g, guess]);
  const series = growth || [];
  return (
    <div className="growth">
      <div className="growth-head">
        <div>
          <div className="col-h">How the work grows</div>
          <div className="muted small">
            {g?.label ||
              'Bento runs your function on bigger and bigger inputs and counts every line it executes.'}
          </div>
        </div>
        <button
          className="btn"
          onClick={() => onMeasure(g?.calls ? g : { setup, call })}
          disabled={measuring}
        >
          {measuring ? 'Measuring…' : series.length ? 'Measure again' : 'Measure'}
        </button>
      </div>
      {!g?.calls && !g?.call && (
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
            (s, i) =>
              s.fit && (
                <div key={i} className="verdict">
                  <span className={`swatch s${i}`} />
                  <b className="mono">{s.label}</b>
                  <span className="bigo">≈ {s.fit.label}</span>
                  <span className="muted">
                    {s.pts.length > 1
                      ? `n ×${s.fit.nRatio.toFixed(0)} → steps ×${s.fit.ratio.toFixed(1)}`
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
      {(log ? [minC, Math.sqrt(minC * maxC), maxC] : [0, maxC / 2, maxC]).map((v, k) => (
        <g key={k}>
          <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="grid-l" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end">
            {fmt(Math.round(v))}
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
      {series.map((s, i) => (
        <g key={i} className={`ser s${i}`}>
          <polyline points={s.pts.map(([n, c]) => `${x(n)},${y(c)}`).join(' ')} />
          {s.pts.map(([n, c]) => (
            <circle key={n} cx={x(n)} cy={y(c)} r="3.5">
              <title>{`n=${n}: ${c.toLocaleString()} steps`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

function Tests({ lesson, tests, onRunTests, testing }) {
  const cases = lesson.tests.cases || [];
  const allOk = tests && tests.length && tests.every((r) => r.ok);
  const fmtArgs = (a) => a.map((x) => JSON.stringify(x)).join(', ');
  return (
    <div className={`tests ${allOk ? 'win' : ''}`}>
      <div className="tests-head">
        <div className="col-h" role="status">
          {allOk
            ? 'All green 🎉'
            : tests
              ? `${tests.filter((r) => r.ok).length} of ${cases.length} passing`
              : `${cases.length} tests`}
        </div>
        <button className="btn" onClick={onRunTests} disabled={testing}>
          {testing ? t('Running…') : t('Run tests')}
        </button>
      </div>
      {cases.map((c, i) => {
        const r = tests?.[i];
        return (
          <div key={i} className={`test ${r ? (r.ok ? 'ok' : 'bad') : ''}`}>
            <span className="lamp" aria-hidden="true" />
            <span className="mono">
              {lesson.tests.fn}({fmtArgs(c.args)})
            </span>
            <span className="muted">→ {JSON.stringify(c.expect)}</span>
            {r && !r.ok && <span className="got">got {r.got}</span>}
          </div>
        );
      })}
      {allOk && (
        <div className="confetti">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </div>
      )}
    </div>
  );
}

// "[3, 1, 4]" → cells, "{'a': 1}" → key/value chips. Only flat, small values; everything else stays text.
function splitTop(t) {
  const out = [];
  let depth = 0,
    q = null,
    cur = '';
  for (const ch of t) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
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
export function asBoxes(v) {
  if (typeof v !== 'string' || v.length > 400) return null;
  const t = v.trim();
  const list =
    (t.startsWith('[') && t.endsWith(']')) ||
    (t.startsWith('(') && t.endsWith(')') && t.includes(','));
  if (list) {
    const items = splitTop(t.slice(1, -1));
    const more = items[items.length - 1] === '…' || items[items.length - 1] === '...';
    const xs = more ? items.slice(0, -1) : items;
    if (xs.length > 16 || xs.some((x) => /[[{(]/.test(x) || x.length > 14)) return null;
    return { kind: 'list', items: xs, more };
  }
  if (t.startsWith('{') && t.endsWith('}') && !t.startsWith('{…')) {
    const items = splitTop(t.slice(1, -1));
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
