import { useEffect, useMemo, useRef, useState } from 'react';
import { Visual, Visuals } from './Viz.jsx';
import { explainLocal } from '../errors.js';

const TAB_TIPS = { output: 'What the code printed and drew', steps: 'Replay the program one line at a time, with every value', growth: 'How much more work the code does as its input grows (Big-O)', tests: 'Checks that say whether the code does what it should' };

export default function Stage(p) {
  const { tab, setTab, lesson } = p;
  // Predict, then run: guess the output first, then see how close you were.
  const [pred, setPred] = useState(null); // { phase: 'ask' | 'wait' | 'done', guess, result }
  useEffect(() => setPred(null), [lesson?.id]);
  useEffect(() => { if (pred?.phase === 'wait' && p.result && p.result !== pred.before) setPred((x) => ({ ...x, phase: 'done', result: p.result })); }, [p.result]);
  const tabs = [['output', 'Output'], ['steps', 'Steps'], ['growth', 'Growth'], ...(lesson?.tests ? [['tests', 'Tests']] : [])];
  return (
    <div className="stage">
      <div className="stage-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`stab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} title={TAB_TIPS[k]}>
            {label}
            {k === 'tests' && p.tests && <span className={`stab-dot ${p.tests.every((r) => r.ok) ? 'ok' : 'bad'}`} />}
            {k === 'output' && p.result?.error && <span className="stab-dot bad" />}
          </button>
        ))}
        {p.onWhyDiff && <button className={`stab predict ${pred ? 'on' : ''}`} title="Guess what the code will print before you run it" onClick={() => { setTab('output'); setPred(pred ? null : { phase: 'ask', guess: '' }); }}>🔮 Predict</button>}
        <div className="stage-meta">{p.running ? <span className="runpulse">running</span> : p.result?.ms != null && tab === 'output' ? `${p.result.ms < 1 ? '<1' : Math.round(p.result.ms)} ms` : ''}</div>
      </div>
      <div className="stage-body">
        {tab === 'output' && pred && <Predict pred={pred} setPred={setPred} run={() => { setPred((x) => ({ ...x, phase: 'wait', before: p.result })); p.onRun(); }} onWhyDiff={p.onWhyDiff} />}
        {tab === 'output' && (!pred || pred.phase === 'done') && <Output {...p} />}
        {tab === 'steps' && <Steps {...p} />}
        {tab === 'growth' && <Growth {...p} />}
        {tab === 'tests' && <Tests {...p} />}
      </div>
    </div>
  );
}

const Tick = ({ s }) => String(s || '').split(/(`[^`]+`)/).map((x, i) => (x.startsWith('`') && x.endsWith('`') && x.length > 2 ? <code key={i}>{x.slice(1, -1)}</code> : x));

const norm = (x) => String(x).toLowerCase().replace(/[\s'"`]+/g, ' ').replace(/[\[\](){},:]/g, (c) => ` ${c} `).replace(/\s+/g, ' ').trim();
function Predict({ pred, setPred, run, onWhyDiff }) {
  const [why, setWhy] = useState(null);
  if (pred.phase === 'ask' || pred.phase === 'wait') return (
    <div className="predict-card">
      <div className="pc-h">🔮 <b>Before you run it, what will it print?</b></div>
      <p>Read the code and write your guess, one line per printed line. Guessing first is one of the best ways to learn.</p>
      <textarea autoFocus rows={3} value={pred.guess} placeholder="My guess…" onChange={(e) => setPred({ ...pred, guess: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pred.guess.trim()) run(); }} />
      <div className="pc-act"><button className="link" onClick={() => setPred(null)}>Skip</button><button className="btn" disabled={!pred.guess.trim() || pred.phase === 'wait'} onClick={run}>{pred.phase === 'wait' ? 'Running…' : 'Run and check ⌘↵'}</button></div>
    </div>
  );
  const R = pred.result || {}; const out = (R.logs || []).map((l) => l.s).join('\n');
  const g = pred.guess.trim().split('\n').map(norm).filter(Boolean); const o = out.split('\n').map(norm).filter(Boolean);
  const hits = g.filter((x, i) => o[i] === x).length;
  const verdict = R.error ? 'crash' : !o.length ? 'quiet' : hits === Math.max(g.length, o.length) ? 'exact' : hits > 0 || (g.length && o.some((x) => g.includes(x))) ? 'close' : 'miss';
  const msg = { exact: ['🎯', 'Spot on!', 'You read the code exactly like the computer did.'], close: ['👀', 'Close!', `You got ${hits} of ${o.length} lines right.`], miss: ['🤔', 'Surprise!', 'The code did something different. That gap is exactly where the learning is.'], crash: ['💥', 'It crashed', 'Did you see that coming? The error is below.'], quiet: ['🖼', 'It drew instead of printing', 'Compare the picture below with what you imagined.'] }[verdict];
  return (
    <div className={`predict-res ${verdict}`}>
      <div className="pr-top"><span className="pr-emo">{msg[0]}</span><div><b>{msg[1]}</b><span>{msg[2]}</span></div><button className="link" onClick={() => setPred({ phase: 'ask', guess: '' })}>Predict again</button></div>
      {o.length > 0 && (
        <div className="pr-cols"><div><div className="mini-h">you guessed</div><pre>{pred.guess.trim()}</pre></div><div><div className="mini-h">it printed</div><pre>{out.split('\n').filter((x) => x.trim()).slice(0, 12).map((x, i) => <span key={i} className={g[i] === norm(x) ? 'ln ok' : 'ln no'}>{x}{'\n'}</span>)}</pre></div></div>
      )}
      {verdict !== 'exact' && verdict !== 'quiet' && onWhyDiff && (why ? <div className="err-ex"><Tick s={why} /></div> : <button className="btn tiny" onClick={async () => { setWhy('…'); setWhy(await onWhyDiff(pred.guess, R.error ? `ERROR: ${R.error.msg}` : out)); }}>Why is it different?</button>)}
    </div>
  );
}

function Output({ result, onExplainError, onHoverLine, pyReady, lang, onRun }) {
  const [ex, setEx] = useState(null);
  useEffect(() => setEx(null), [result]);
  if (!result) {
    return (
      <div className="stage-empty">
        <div className="kbd-hint"><kbd>⌘</kbd><kbd>↵</kbd> run · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>↵</kbd> step through · hold <kbd>⌥</kbd> and drag a number</div>
        {lang === 'python' && !pyReady && <div className="warm">Python is warming up…</div>}
        <button className="btn ghost" onClick={onRun}>Run it</button>
      </div>
    );
  }
  const { logs = [], visuals = [], error } = result;
  return (
    <div className="output">
      {error && (
        <div className="err-card">
          <div className="err-top">
            <span className="err-msg">{error.msg}</span>
            {error.line && <button className="err-line" onMouseEnter={() => onHoverLine([error.line, error.line])} onMouseLeave={() => onHoverLine(null)}>line {error.line}</button>}
          </div>
          {(() => { const E = ex || (document.documentElement.lang.startsWith('en') ? explainLocal(error.msg) : null); return E ? (
            <div className="err-ex"><b>What happened:</b> <Tick s={E.plain} />{E.fix && <><br /><b>Try:</b> <Tick s={E.fix} /></>}
              {E.local && onExplainError && <div><button className="link" onClick={async () => { setEx({ plain: '…' }); setEx(await onExplainError(error)); }}>Explain it for my code →</button></div>}</div>
          ) : (
            <button className="btn tiny" onClick={async () => { setEx({ plain: '…' }); setEx(await onExplainError(error)); }}>Explain this error</button>
          ); })()}
        </div>
      )}
      {visuals.length > 0 && <div className="visuals"><Visuals list={visuals} /></div>}
      {logs.length > 0 && (
        <div className="console">
          {logs.map((l, i) => <div key={i} className={`log ${l.k}`}>{l.s || ' '}</div>)}
        </div>
      )}
      {!error && !logs.length && !visuals.length && <div className="stage-empty small">Ran fine, but nothing was printed. Add <code>print()</code> or <code>show()</code>.</div>}
    </div>
  );
}

function Steps({ trace, stepIdx, setStepIdx, playing, setPlaying, english, onStep, code, tracing }) {
  const steps = trace?.steps || [];
  const s = steps[stepIdx];
  const prev = steps[stepIdx - 1];
  useEffect(() => {
    if (!playing) return;
    if (stepIdx >= steps.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStepIdx(stepIdx + 1), s?.ret ? 520 : 380);
    return () => clearTimeout(t);
  }, [playing, stepIdx, steps.length]);
  if (!trace) return <div className="stage-empty"><p>Watch your code run one line at a time: the variables, the call stack, and what each line means.</p><button className="btn" onClick={onStep}>{tracing ? 'Tracing…' : 'Step through'}</button></div>;
  if (!steps.length) return <div className="stage-empty">{trace.error ? <span className="err-msg">{trace.error.msg}</span> : 'Nothing to step through.'}</div>;
  const lines = (code || '').split('\n');
  const say = s.end ? 'Done. The program finished.' : s.ret ? `${s.stack[s.stack.length - 1]?.name || 'function'} returns ${s.stack[s.stack.length - 1]?.ret ?? ''}` : (english?.[s.line - 1] || lines[s.line - 1]?.trim() || '');
  const logs = trace.logs?.slice(0, s.logs) || [];
  const viz = trace.visuals?.slice(0, s.viz) || [];
  return (
    <div className="steps">
      <div className="step-bar">
        <button className="ib" onClick={() => setStepIdx(0)} title="First">⏮</button>
        <button className="ib" onClick={() => setStepIdx(Math.max(0, stepIdx - 1))} title="Back (←)">◀</button>
        <button className="ib play" onClick={() => { if (stepIdx >= steps.length - 1) setStepIdx(0); setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
        <button className="ib" onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))} title="Next (→)">▶︎</button>
        <input type="range" min="0" max={steps.length - 1} value={stepIdx} onChange={(e) => { setPlaying(false); setStepIdx(+e.target.value); }} />
        <span className="step-count">{stepIdx + 1}<span>/{steps.length}</span></span>
      </div>
      <div className={`narration ${s.ret ? 'ret' : ''} ${s.end ? 'end' : ''}`} key={stepIdx}>
        {!s.end && <span className="nar-line">line {s.line}</span>}
        <span className="nar-text">{say}</span>
      </div>
      <div className="step-cols">
        <div className="vars">
          <div className="col-h">Variables</div>
          {Object.keys(s.vars || {}).length === 0 && <div className="muted">none yet</div>}
          {Object.entries(s.vars || {}).map(([k, v]) => {
            const changed = prev && prev.vars?.[k] !== v; const born = prev && !(k in (prev.vars || {}));
            const box = asBoxes(v);
            if (box) {
              const pb = prev ? asBoxes(prev.vars?.[k]) : null;
              return (
                <div key={k} className={`var var-box ${born ? 'born' : ''}`}>
                  <span className="vk">{k}</span>
                  {box.kind === 'list'
                    ? <div className="cells">{box.items.map((x, i) => <span key={i} className={`cell ${pb?.kind === 'list' && pb.items[i] !== x ? 'chg' : ''}`}><i>{i}</i>{x}</span>)}{box.more && <span className="cell more">…</span>}{box.items.length === 0 && <span className="cell empty">empty</span>}</div>
                    : <div className="kvs">{box.items.map(([kk, x]) => <span key={kk} className={`kv ${pb?.kind === 'map' && pb.items.find((q) => q[0] === kk)?.[1] !== x ? 'chg' : ''}`}><b>{kk}</b>{x}</span>)}{box.more && <span className="kv">…</span>}</div>}
                </div>
              );
            }
            return <div key={k} className={`var ${born ? 'born' : changed ? 'changed' : ''}`}><span className="vk">{k}</span><span className="vv">{v}</span></div>;
          })}
        </div>
        <div className="stack">
          <div className="col-h">Call stack</div>
          <div className="frames">
            {[...(s.stack || [])].reverse().map((f, i) => (
              <div key={(s.stack.length - i) + f.name} className={`frame ${i === 0 ? 'top' : ''}`}>
                <span className="fn">{f.name}<span className="fa">({f.args})</span></span>
                {f.ret != null ? <span className="fret">→ {f.ret}</span> : i === 0 ? <span className="fnow">running</span> : <span className="fwait">waiting</span>}
              </div>
            ))}
            {!s.stack?.length && <div className="muted">empty</div>}
          </div>
        </div>
        <div className="sofar">
          <div className="col-h">Output so far</div>
          {viz.length > 0 && <div className="mini-viz"><Visual v={viz[viz.length - 1]} /></div>}
          <div className="console small">{logs.slice(-8).map((l, i) => <div key={i} className={`log ${l.k}`}>{l.s}</div>)}{!logs.length && !viz.length && <div className="muted">nothing yet</div>}</div>
        </div>
      </div>
    </div>
  );
}

function Growth({ lesson, growth, onMeasure, measuring, code, lang }) {
  const guess = useMemo(() => {
    const m = lang === 'python' ? /def\s+(\w+)\s*\(/.exec(code || '') : /function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/.exec(code || '');
    const fn = m ? (m[1] || m[2]) : 'f';
    return lang === 'python' ? `${fn}(make_input(n))` : `${fn}(makeInput(n))`;
  }, [code, lang]);
  const g = lesson?.growth;
  const [call, setCall] = useState(g?.call || guess);
  const [setup, setSetup] = useState(g?.setup || (lang === 'python' ? 'def make_input(n):\n    return list(range(n))' : 'function makeInput(n) { return Array.from({ length: n }, (_, i) => i); }'));
  useEffect(() => { setCall(g?.call || guess); }, [g, guess]);
  const series = growth || [];
  return (
    <div className="growth">
      <div className="growth-head">
        <div>
          <div className="col-h">How the work grows</div>
          <div className="muted small">{g?.label || 'Bento runs your function on bigger and bigger inputs and counts every line it executes.'}</div>
        </div>
        <button className="btn" onClick={() => onMeasure(g?.calls ? g : { setup, call })} disabled={measuring}>{measuring ? 'Measuring…' : series.length ? 'Measure again' : 'Measure'}</button>
      </div>
      {!g?.calls && !g?.call && (
        <div className="growth-cfg">
          <label>call <input className="mono" value={call} onChange={(e) => setCall(e.target.value)} /></label>
        </div>
      )}
      {series.length > 0 && <GrowthChart series={series} />}
      {series.length > 0 && (
        <div className="growth-verdicts">
          {series.map((s, i) => s.fit && (
            <div key={i} className="verdict">
              <span className={`swatch s${i}`} /><b className="mono">{s.label}</b>
              <span className="bigo">≈ {s.fit.label}</span>
              <span className="muted">{s.pts.length > 1 ? `n ×${s.fit.nRatio.toFixed(0)} → steps ×${s.fit.ratio.toFixed(1)}` : ''}</span>
            </div>
          ))}
          {series.some((s) => s.error) && <div className="err-msg">{series.find((s) => s.error).error}</div>}
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
      <button className={`chip gscale ${useLog ? 'on' : ''}`} onClick={() => setLogY(!useLog)} title="A log scale shows each curve's shape (its Big-O) even when one is huge">{useLog ? 'log scale' : 'normal scale'}</button>
      <GrowthSvg series={series} log={useLog} />
      <RaceBars series={series} />
    </div>
  );
}

// The race result at the biggest size everyone finished: "same job, 60× more work".
function RaceBars({ series }) {
  if (series.length < 2) return null;
  const common = Math.max(...series[0].pts.map((p) => p[0]).filter((n) => series.every((s) => s.pts.some((q) => q[0] === n))), 0);
  if (!common) return null;
  const at = series.map((s, i) => ({ i, label: s.label, c: s.pts.find((q) => q[0] === common)[1] })).sort((a, b) => a.c - b.c);
  const max = Math.max(...at.map((a) => a.c), 1); const best = at[0].c || 1;
  return (
    <div className="race-bars">
      <div className="col-h">the race at n = {common.toLocaleString()}</div>
      {at.map((a, k) => (
        <div key={a.i} className="rb">
          <span className="rb-l mono">{k === 0 ? '🏁 ' : ''}{a.label}</span>
          <span className="rb-track"><i className={`s${a.i}`} style={{ width: `${Math.max(1.5, (a.c / max) * 100)}%` }} /></span>
          <span className="rb-n">{a.c.toLocaleString()} steps{k > 0 && a.c / best >= 1.5 ? <b> · {Math.round(a.c / best).toLocaleString()}× more</b> : ''}</span>
        </div>
      ))}
    </div>
  );
}

function GrowthSvg({ series, log }) {
  const W = 560, H = 190, P = { l: 52, r: 16, t: 12, b: 28 };
  const allN = series.flatMap((s) => s.pts.map((p) => p[0]));
  const maxN = Math.max(...allN, 8), minN = Math.min(...allN, 4);
  const maxC = Math.max(...series.flatMap((s) => s.pts.map((p) => p[1])), 1);
  const x = (n) => P.l + (Math.log2(n) - Math.log2(minN)) / Math.max(1, Math.log2(maxN) - Math.log2(minN)) * (W - P.l - P.r);
  const minC = Math.max(1, Math.min(...series.flatMap((s) => s.pts.map((p) => p[1])).filter((v) => v > 0)));
  const y = log ? (c) => H - P.b - ((Math.log10(Math.max(c, minC)) - Math.log10(minC)) / Math.max(0.5, Math.log10(maxC) - Math.log10(minC))) * (H - P.t - P.b) : (c) => H - P.b - (c / maxC) * (H - P.t - P.b);
  const fmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(v);
  return (
    <svg className="gchart" viewBox={`0 0 ${W} ${H}`}>
      {(log ? [minC, Math.sqrt(minC * maxC), maxC] : [0, maxC / 2, maxC]).map((v, k) => <g key={k}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="grid-l" /><text x={P.l - 8} y={y(v) + 4} textAnchor="end">{fmt(Math.round(v))}</text></g>)}
      {series[0]?.pts.map(([n]) => <text key={n} x={x(n)} y={H - 8} textAnchor="middle">{n}</text>)}
      <text x={W - P.r} y={H - 8} textAnchor="end" className="axis-l">n →</text>
      {series.map((s, i) => (
        <g key={i} className={`ser s${i}`}>
          <polyline points={s.pts.map(([n, c]) => `${x(n)},${y(c)}`).join(' ')} />
          {s.pts.map(([n, c]) => <circle key={n} cx={x(n)} cy={y(c)} r="3.5"><title>{`n=${n}: ${c.toLocaleString()} steps`}</title></circle>)}
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
        <div className="col-h">{allOk ? 'All green 🎉' : tests ? `${tests.filter((r) => r.ok).length} of ${cases.length} passing` : `${cases.length} tests`}</div>
        <button className="btn" onClick={onRunTests} disabled={testing}>{testing ? 'Running…' : 'Run tests'}</button>
      </div>
      {cases.map((c, i) => {
        const r = tests?.[i];
        return (
          <div key={i} className={`test ${r ? (r.ok ? 'ok' : 'bad') : ''}`}>
            <span className="lamp" />
            <span className="mono">{lesson.tests.fn}({fmtArgs(c.args)})</span>
            <span className="muted">→ {JSON.stringify(c.expect)}</span>
            {r && !r.ok && <span className="got">got {r.got}</span>}
          </div>
        );
      })}
      {allOk && <div className="confetti">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
    </div>
  );
}

// "[3, 1, 4]" → cells, "{'a': 1}" → key/value chips. Only flat, small values; everything else stays text.
function splitTop(t) {
  const out = []; let depth = 0, q = null, cur = '';
  for (const ch of t) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if ('[{('.includes(ch)) depth++; if (']})'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
export function asBoxes(v) {
  if (typeof v !== 'string' || v.length > 400) return null;
  const t = v.trim();
  const list = (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('(') && t.endsWith(')') && t.includes(','));
  if (list) {
    const items = splitTop(t.slice(1, -1)); const more = items[items.length - 1] === '…' || items[items.length - 1] === '...';
    const xs = more ? items.slice(0, -1) : items;
    if (xs.length > 16 || xs.some((x) => /[[{(]/.test(x) || x.length > 14)) return null;
    return { kind: 'list', items: xs, more };
  }
  if (t.startsWith('{') && t.endsWith('}') && !t.startsWith('{…')) {
    const items = splitTop(t.slice(1, -1)); const more = items[items.length - 1] === '…';
    const xs = (more ? items.slice(0, -1) : items).map((x) => { const i = x.indexOf(':'); return i > 0 ? [x.slice(0, i).trim().replace(/^['"]|['"]$/g, ''), x.slice(i + 1).trim()] : null; });
    if (!xs.length || xs.length > 8 || xs.some((x) => !x || /[[{]/.test(x[1]) || x[1].length > 18)) return null;
    return { kind: 'map', items: xs, more };
  }
  return null;
}
