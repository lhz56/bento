// Puzzles: LeetCode from the top down. The page is a metro line of patterns (easy at the top),
// each puzzle opens as a lesson with a mission card (three stars) and a "scale it up" ladder
// that races your code from 10 items to a billion.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { t, tx } from '../i18n.js';
import {
  PUZZLES as BUILTIN,
  STATIONS as BUILTIN_STATIONS,
  allPuzzles,
  allStations,
  TIERS,
  stationOf,
  puzzleById,
  codeParts,
  codeOf,
  fitScale,
  tierOf,
  humanTime,
  fmtN,
  DEFAULT_RUNGS,
} from '../puzzles.js';
import { ideaById } from '../ideas.js';
import { run as runCode } from '../runtime/runner.js';
import Md from './Md.jsx';

const starsOf = (rec) => (rec?.s || []).filter(Boolean).length;

// ─────────────────────────────────────────────── the page
export default function Puzzles({ progress = {}, onOpen, onIdeas, onIdea, races = [], onRace }) {
  const PUZZLES = allPuzzles();
  const STATIONS = allStations();
  const done = progress.puzzles || {};
  const total = PUZZLES.length * 3;
  const got = PUZZLES.reduce((s, p) => s + starsOf(done[p.id]), 0);
  const [compass, setCompass] = useState(false);
  const next = PUZZLES.find((p) => starsOf(done[p.id]) < 3) || PUZZLES[0];
  return (
    <div className="ideas puzzles">
      <div className="ideas-inner pz-inner">
        <div className="hello">{t('LeetCode, from the top down')}</div>
        <h1 className="home-h">{tx('Puzzles that *scale*.')}</h1>
        <div className="pz-hero">
          <div className="pz-hero-art">
            <PatternArt kind="shape" big />
          </div>
          <div className="pz-hero-t">
            <p className="ex-sub long">
              {PUZZLES.length} interview puzzles in the order that makes them easy. Each one starts
              with code that already works, then asks: <b>what if there were a billion?</b>
            </p>
            <p className="ex-sub short">
              {PUZZLES.length} interview puzzles. Make it work, then ask:{' '}
              <b>what if there were a billion?</b>
            </p>
            <div className="pz-3">
              <span>
                <i>✓</i>make it work
              </span>
              <span>
                <i>👾</i>survive the gremlins
              </span>
              <span>
                <i>🚀</i>make it scale
              </span>
            </div>
            <div className="pz-hero-acts">
              <button className="btn" onClick={() => onOpen(next)}>
                {got ? 'Continue' : 'Start at the top'}: {next.title} →
              </button>
              <button className="btn ghost" onClick={() => setCompass(true)}>
                🧭 Which pattern? (a game)
              </button>
              <span className="pz-total" title="stars earned">
                <b>{got}</b> / {total} ★
              </span>
            </div>
          </div>
        </div>
        {compass && <Compass onClose={() => setCompass(false)} onOpen={onOpen} />}
        <ScaleChart onOpen={onOpen} />
        {races.length > 0 && (
          <div className="races">
            <div className="races-h">
              <span className="mini-h">{t('algorithm races')}</span>
              <span className="muted small">
                {t('Same problem, different algorithms, raced live on bigger and bigger inputs.')}
              </span>
            </div>
            <div className="race-row">
              {races.map((race, i) => (
                <button key={race.id} className="race-card" onClick={() => onRace(race)}>
                  <svg viewBox="0 0 120 54" className="race-art" aria-hidden="true">
                    {(race.growth.calls || []).map((c, k) => {
                      const f = [
                        (x) => x * x * 0.9,
                        (x) => x * 1.6 + 2,
                        (x) => Math.log2(x + 1) * 6,
                      ][k % 3];
                      const pts = Array.from(
                        { length: 12 },
                        (_, j) =>
                          `${8 + j * 9.5},${50 - Math.min(44, f(j * 0.6 + (i % 2)) * (k === 0 ? 1.2 : 1))}`,
                      ).join(' ');
                      return (
                        <polyline
                          key={k}
                          points={pts}
                          fill="none"
                          stroke={['#ff8a5b', '#4cc9a0', '#a78bfa'][k]}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>
                  <b>{race.title.split(':')[0]}</b>
                  <span>{race.title.split(':')[1]?.trim()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="metro">
          {STATIONS.map((station, i) => {
            const ps = PUZZLES.filter((p) => p.st === station.id);
            const sg = ps.reduce((a, p) => a + starsOf(done[p.id]), 0);
            return (
              <div
                key={station.id}
                className={`station ${sg === ps.length * 3 ? 'full' : sg ? 'some' : ''}`}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="st-rail">
                  <span className="st-dot">{sg === ps.length * 3 ? '★' : i + 1}</span>
                </div>
                <div className="st-art">
                  <PatternArt kind={station.art} />
                </div>
                <div className="st-body">
                  <div className="st-h">
                    <b>{station.name}</b>
                    <span>{station.motto}</span>
                  </div>
                  <div className="st-like">{station.like}</div>
                  <div className="st-pz">
                    {ps.map((puzzle) => (
                      <button
                        key={puzzle.id}
                        className={`pz-chip t-${puzzle.tier}`}
                        onClick={() => onOpen(puzzle)}
                        title={puzzle.hook}
                      >
                        <span className="pz-tier">{TIERS[puzzle.tier][0]}</span>
                        <span className="pz-name">{puzzle.title}</span>
                        <span className="pz-stars">
                          {[0, 1, 2].map((k) => (
                            <i key={k} className={done[puzzle.id]?.s?.[k] ? 'on' : ''}>
                              ★
                            </i>
                          ))}
                        </span>
                        {puzzle.lc && <span className="pz-lc">#{puzzle.lc[0]}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="station beyond">
            <div className="st-rail">
              <span className="st-dot">🌍</span>
            </div>
            <div className="st-art">
              <PatternArt kind="beyond" />
            </div>
            <div className="st-body">
              <div className="st-h">
                <b>Beyond one computer</b>
                <span>When even the clever way isn’t enough</span>
              </div>
              <div className="st-like">
                At a billion users, one machine runs out of memory or time. That’s where real
                companies’ tricks begin.
              </div>
              <div className="st-pz">
                {['ring', 'bloom', 'mapreduce', 'lsm', 'lru', 'hll']
                  .map((id) => ideaById[id])
                  .filter(Boolean)
                  .map((idea) => (
                    <button key={idea.id} className="pz-chip idea" onClick={() => onIdea(idea)}>
                      <span className="pz-tier">⬡</span>
                      <span className="pz-name">{idea.title}</span>
                      <span className="pz-lc">{idea.company}</span>
                    </button>
                  ))}
                <button className="pz-chip idea more" onClick={onIdeas}>
                  <span className="pz-name">All clever ideas →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The one chart behind every puzzle: how long each kind of algorithm takes as n grows.
// Assumes Python doing about 10 million simple steps a second.
const CLASSES = [
  ['O(1)', 'look it up', () => 1, 'dupes', 'a dictionary lookup'],
  ['O(log n)', 'halve it', (n) => Math.log2(n), 'search', 'binary search'],
  ['O(n)', 'look at each once', (n) => n, 'twosum', 'Two Sum, the clever way'],
  ['O(n log n)', 'sort first', (n) => n * Math.log2(n), 'merge', 'merging intervals'],
  ['O(n²)', 'compare every pair', (n) => n * n, 'twosum', 'Two Sum, the obvious way'],
  [
    'O(2ⁿ)',
    'try every combination',
    (n) => Math.pow(2, Math.min(n, 1100)),
    'subsets',
    'every subset',
  ],
];
const NS = [10, 100, 1000, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9];
function ScaleChart({ onOpen }) {
  const [k, setK] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    if (k >= NS.length - 1) {
      setAuto(false);
      return;
    }
    const timer = setTimeout(() => setK((x) => x + 1), k === 0 ? 900 : 520);
    return () => clearTimeout(timer);
  }, [k, auto]);
  const n = NS[k];
  const secs = CLASSES.map(([, , f]) => f(n) / 1e7);
  const logScale = (s) => Math.max(0, Math.log10(s * 1e7));
  const max = Math.log10(13.8e9 * 365.25 * 86400 * 1e7);
  return (
    <div className="scalechart">
      <div className="sc-h">
        <div>
          <div className="mini-h">the one chart behind every puzzle</div>
          <b>How long would it take at</b> <span className="sc-n">n = {fmtN(n)}</span>
          <b>?</b>
        </div>
        <input
          type="range"
          min="0"
          max={NS.length - 1}
          step="1"
          value={k}
          onChange={(e) => {
            setAuto(false);
            setK(+e.target.value);
          }}
          aria-label="how many items"
        />
      </div>
      <div className="sc-rows">
        {CLASSES.map(([cls, say, , pid, ex], i) => {
          const human = humanTime(secs[i]);
          return (
            <button
              key={cls}
              className="sc-row"
              onClick={() => onOpen(puzzleById(pid))}
              title={`Example: ${ex}`}
            >
              <span className="sc-o">{cls}</span>
              <span className="sc-say">{say}</span>
              <span className="sc-bar">
                <i
                  className={`c${human.c}`}
                  style={{
                    width: `${Math.max(2, Math.min(100, (logScale(secs[i]) / max) * 100))}%`,
                  }}
                />
              </span>
              <span className={`sc-t c${human.c}`}>
                {human.e} {human.t}
              </span>
            </button>
          );
        })}
      </div>
      <div className="muted small">
        Python does roughly 10 million simple steps a second. Click a row to open a puzzle that runs
        at that speed.
      </div>
    </div>
  );
}

// "Which pattern?" — read a puzzle, guess the way of thinking. Pattern spotting is the real interview skill.
function Compass({ onClose, onOpen }) {
  const PUZZLES = BUILTIN;
  const STATIONS = BUILTIN_STATIONS;
  const deck = useMemo(
    () =>
      PUZZLES.filter((x) => x.st !== 'start')
        .sort(() => Math.random() - 0.5)
        .slice(0, 6),
    [],
  );
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [score, setScore] = useState(0);
  const p = deck[i];
  const opts = useMemo(() => {
    if (!p) return [];
    const others = STATIONS.filter((s) => s.id !== p.st && s.id !== 'start')
      .sort(() => Math.random() - 0.5)
      .slice(0, 2);
    return [stationOf(p), ...others].sort(() => Math.random() - 0.5);
  }, [p]);
  if (!p)
    return (
      <div className="compass done fade-in">
        <div className="cp-h">
          🧭 {score} of {deck.length}
        </div>
        <p>
          {score === deck.length
            ? 'A perfect read. Interviewers love people who name the pattern first.'
            : score >= deck.length / 2
              ? 'Good instincts. Pattern spotting gets faster with every puzzle you solve.'
              : 'Spotting the pattern is the hard part, and it comes with practice. Each station on the line teaches one.'}
        </p>
        <div className="cp-acts">
          <button
            className="btn ghost"
            onClick={() => {
              setI(0);
              setScore(0);
              setPick(null);
            }}
          >
            Play again
          </button>
          <button className="link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  const right = pick && pick === p.st;
  return (
    <div className="compass fade-in">
      <div className="cp-top">
        <span className="mini-h">
          which pattern? · {i + 1} of {deck.length}
        </span>
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="cp-q">“{p.hook}”</div>
      <div className="cp-opts">
        {opts.map((opt) => (
          <button
            key={opt.id}
            disabled={!!pick}
            className={`cp-opt ${pick ? (opt.id === p.st ? 'ok' : opt.id === pick ? 'no' : '') : ''}`}
            onClick={() => {
              setPick(opt.id);
              if (opt.id === p.st) setScore((x) => x + 1);
            }}
          >
            <PatternArt kind={opt.art} />
            <b>{opt.name}</b>
            <span>{opt.motto}</span>
          </button>
        ))}
      </div>
      {pick && (
        <div className={`cp-why ${right ? 'ok' : ''}`}>
          <b>{right ? 'Yes!' : `It’s ${stationOf(p).name}.`}</b> {stationOf(p).like}
          <div className="cp-acts">
            <button className="link" onClick={() => onOpen(p)}>
              Open “{p.title}”
            </button>
            <button
              className="btn"
              onClick={() => {
                setPick(null);
                setI(i + 1);
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── inside a puzzle lesson
// Measurements of the obvious and clever ways, kept for the session (they don't change)
const baseline = new Map();
async function measure(p, code) {
  const result = await runCode('python', 'scale', code, {
    setup: p.setup,
    call: p.call,
    ns: p.ns || null,
    fresh: !!p.fresh,
  });
  if (result.error && !result.scale) return { error: result.error.msg };
  return {
    pts: result.scale.pts,
    crash: result.scale.crash,
    fit: fitScale(result.scale.pts, p.target),
  };
}
async function measureBase(p, which) {
  const k = `${p.id}:${which}`;
  if (!baseline.has(k)) baseline.set(k, measure(p, codeOf(codeParts(p, which))));
  return baseline.get(k);
}

export function PuzzlePanel({ lesson, rec, getCode, setPuzzleCode, onResult, pyReady, onOpenUrl }) {
  const puzzle = puzzleById(lesson.puzzle);
  const [phase, setPhase] = useState(null); // null | { lane } | 'done'
  const [res, setRes] = useState(null);
  const [party, setParty] = useState(0);
  useEffect(() => {
    setPhase(null);
    setRes(null);
  }, [lesson.id]);
  if (!puzzle) return null;
  const s = rec?.s || [];
  const check = async () => {
    const code = getCode?.() ?? lesson.work ?? lesson.code;
    setRes(null);
    setPhase({ lane: 'tests' });
    const t = await runCode('python', 'tests', code, {
      fn: puzzle.fn,
      cases: puzzle.tests.map(([args, expect]) => ({ args, expect })),
    });
    const g = await runCode('python', 'tests', code, {
      fn: puzzle.fn,
      cases: puzzle.gremlins.map(([, args, expect]) => ({ args, expect })),
    });
    const tests =
      t.tests || puzzle.tests.map(() => ({ ok: false, got: t.error?.msg || 'didn’t run' }));
    const grem =
      g.tests || puzzle.gremlins.map(() => ({ ok: false, got: g.error?.msg || 'didn’t run' }));
    const works = tests.every((x) => x.ok);
    const lanes = {};
    if (puzzle.startWorks) {
      setPhase({ lane: 'obvious' });
      lanes.obvious = await measureBase(puzzle, 'start');
    }
    setPhase({ lane: 'yours' });
    const same = puzzle.startWorks && code.trim() === codeOf(codeParts(puzzle, 'start')).trim();
    lanes.yours = !works ? { skipped: true } : same ? lanes.obvious : await measure(puzzle, code);
    setPhase({ lane: 'clever' });
    lanes.clever = await measureBase(puzzle, 'fast');
    const scales =
      works &&
      !lanes.yours.crash &&
      !lanes.yours.error &&
      lanes.yours.fit &&
      lanes.yours.fit.tier <= tierOf(puzzle.target);
    const stars = [works, works && grem.every((x) => x.ok), !!scales];
    const r = { tests, grem, lanes, stars, same };
    setRes(r);
    setPhase('done');
    const before = starsOf(rec);
    onResult?.(puzzle.id, { s: stars, label: lanes.yours?.fit?.label });
    if (stars.every(Boolean) && before < 3) setParty((x) => x + 1);
  };
  const busy = phase && phase !== 'done';
  return (
    <div className="pz-card fade-in">
      <div className="pz-mission">
        {[
          ['✓', 'Works', `${puzzle.tests.length} tests pass`],
          ['👾', 'Gremlin-proof', `${puzzle.gremlins.length} hidden edge cases`],
          ['🚀', `Scales: ${puzzle.target}`, 'fast at a million'],
        ].map(([icon, label, sub], k) => (
          <Star
            key={k}
            on={res ? res.stars[k] : s[k]}
            icon={icon}
            label={label}
            sub={res && !res.stars[k] && s[k] ? 'earned before, not this time' : sub}
          />
        ))}
      </div>
      <div className="pz-modes">
        <button className="btn" disabled={busy || !pyReady} onClick={check}>
          {busy ? 'Checking…' : !pyReady ? 'Starting Python…' : res ? '▶ Check again' : '▶ Check'}
        </button>
        <button
          className="chip"
          onClick={() => setPuzzleCode(puzzle, 'blank')}
          title="Start from an empty function, like on LeetCode"
        >
          ⌨ Blank page
        </button>
        {puzzle.startWorks && (
          <button
            className="chip"
            onClick={() => setPuzzleCode(puzzle, 'start')}
            title="Put the obvious way back in the editor"
          >
            ↺ Obvious way
          </button>
        )}
        {puzzle.lc && (
          <button
            className="link pz-lclink"
            onClick={() => onOpenUrl?.(`https://leetcode.com/problems/${puzzle.lc[1]}/`)}
            title="The same puzzle on LeetCode"
          >
            LeetCode #{puzzle.lc[0]} ↗
          </button>
        )}
      </div>
      {busy && <Race p={puzzle} lane={phase.lane} />}
      {res && <Results p={puzzle} r={res} />}
      {party > 0 && (
        <div className="confetti" key={party}>
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Star({ on, icon, label, sub }) {
  return (
    <div className={`pz-star ${on ? 'on' : ''}`}>
      <span className="ps-i">{on ? icon : '☆'}</span>
      <div>
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

const LANES = [
  ['obvious', 'The obvious way'],
  ['yours', 'Your code'],
  ['clever', 'The clever way'],
];
function Race({ p, lane }) {
  const order = ['tests', ...(p.startWorks ? ['obvious'] : []), 'yours', 'clever'];
  const at = order.indexOf(lane);
  return (
    <div className="pz-race">
      <div className="mini-h">
        {lane === 'tests'
          ? 'running the tests and the gremlins…'
          : `racing on bigger and bigger inputs: ${fmtN((p.ns || [16])[0])} → ${fmtN((p.ns || [131072]).slice(-1)[0])}`}
      </div>
      {LANES.filter(([lane]) => order.includes(lane)).map(([k, l]) => {
        const i = order.indexOf(k);
        return (
          <div key={k} className={`pr-lane ${i < at ? 'done' : i === at ? 'now' : ''}`}>
            <span>{l}</span>
            <i>
              <b />
            </i>
            <em>{i < at ? '✓' : i === at ? 'timing…' : ''}</em>
          </div>
        );
      })}
    </div>
  );
}

function Results({ p, r }) {
  const failed = r.tests.map((t, i) => [t, i]).filter(([t]) => !t.ok);
  return (
    <div className="pz-res">
      <div className="pz-checks">
        <div className={`pz-line ${r.stars[0] ? 'ok' : 'bad'}`}>
          <span>{r.stars[0] ? '✓' : '✗'}</span>
          {r.stars[0] ? (
            `All ${p.tests.length} tests pass.`
          ) : (
            <>
              {failed.length} of {p.tests.length} tests fail. First:{' '}
              <code>
                {p.fn}({p.tests[failed[0][1]][0].map((a) => JSON.stringify(a)).join(', ')})
              </code>{' '}
              should be <code>{JSON.stringify(p.tests[failed[0][1]][1])}</code>, got{' '}
              <code>{String(failed[0][0].got).slice(0, 80)}</code>
            </>
          )}
        </div>
        <div className="pz-grem">
          {p.gremlins.map(([label, args, want], i) => {
            const g = r.grem[i];
            return (
              <div
                key={i}
                className={`gr ${g.ok ? 'ok' : 'bad'}`}
                title={
                  g.ok
                    ? 'caught'
                    : `${p.fn}(${args.map((a) => JSON.stringify(a)).join(', ')}) should be ${JSON.stringify(want)}, got ${g.got}`
                }
              >
                <span>{g.ok ? '🪤' : '👾'}</span>
                <b>{label}</b>
                {!g.ok && (
                  <em>
                    got {String(g.got).slice(0, 40)}, wanted {JSON.stringify(want).slice(0, 40)}
                  </em>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Ladder p={p} lanes={r.lanes} />
    </div>
  );
}

// The scale ladder: measured on this Mac, then extrapolated with the measured Big-O
function Ladder({ p, lanes }) {
  const rungs = useMemo(() => {
    if (p.rungs) return p.rungs;
    const rs = [...DEFAULT_RUNGS];
    if (p.big && !rs.some(([n]) => n === p.big)) rs.push([p.big, '🧩', 'LeetCode’s biggest']);
    return rs.sort((a, b) => a[0] - b[0]);
  }, [p]);
  const rows = LANES.filter(([k]) => lanes[k]).map(([k, label]) => ({ k, label, ...lanes[k] }));
  const at = (row, N) =>
    row.crash && N >= row.crash.n
      ? { t: 'crashes', e: '💥', c: 5, crash: true }
      : row.fit
        ? humanTime(row.fit.at(N))
        : null;
  const mine = lanes.yours;
  const ob = lanes.obvious;
  const cl = lanes.clever;
  const cap = 1e6 > rungs[rungs.length - 1][0] ? rungs[rungs.length - 1][0] : 1e6;
  const sentence = (() => {
    if (mine?.skipped) return 'Make the tests pass first, then Bento will race your code.';
    if (mine?.crash)
      return (
        <>
          Your code crashed at n = {fmtN(mine.crash.n)}: <code>{mine.crash.msg.slice(0, 90)}</code>.{' '}
          {/Recursion/i.test(mine.crash.msg)
            ? 'Too many nested calls: try your own queue or loop instead.'
            : ''}
        </>
      );
    if (!mine?.fit) return null;
    const y = mine.fit.at(cap);
    const vs = ob?.fit && !ob.crash ? ob.fit.at(cap) / y : null;
    if (lanes.yours === lanes.obvious)
      return (
        <>
          At {fmtN(cap)}, the obvious way would take <b>{humanTime(y).t}</b>
          {cl?.fit ? (
            <>
              ; the clever way, <b>{humanTime(cl.fit.at(cap)).t}</b>
            </>
          ) : (
            ''
          )}
          . Can you close the gap?
        </>
      );
    if (ob?.crash)
      return (
        <>
          The obvious way crashes at n = {fmtN(ob.crash.n)}. Yours handles {fmtN(cap)} in{' '}
          <b>{humanTime(y).t}</b>.
        </>
      );
    return (
      <>
        At {fmtN(cap)}, your code would take <b>{humanTime(y).t}</b>
        {vs && vs > 3 ? (
          <>
            ; the obvious way, <b>{humanTime(ob.fit.at(cap)).t}</b> (
            {Math.round(vs).toLocaleString()}× slower)
          </>
        ) : (
          ''
        )}
        .
      </>
    );
  })();
  return (
    <div className="ladder">
      <div className="ld-h">
        <span className="mini-h">🚀 scale it up</span>
        <span className="muted small">
          measured on this Mac, then stretched with each curve’s Big-O
        </span>
      </div>
      <div
        className="ld-grid"
        style={{ gridTemplateColumns: `minmax(92px, 1.1fr) repeat(${rows.length}, 1fr)` }}
      >
        <div />
        {rows.map((row) => (
          <div key={row.k} className={`ld-row ${row.k}`}>
            <b>{row.label}</b>
            <span>
              {row.skipped
                ? 'needs green tests'
                : row.error
                  ? 'didn’t run'
                  : row.crash
                    ? `💥 at ${fmtN(row.crash.n)}`
                    : row.fit
                      ? `≈ ${row.fit.label}`
                      : ''}
            </span>
          </div>
        ))}
        {rungs.map(([rung, e, l]) => (
          <Fragment key={rung}>
            <div className={`ld-col ${l.includes('LeetCode') ? 'lc' : ''}`}>
              <span className="ld-e">{e}</span>
              <div>
                <b>{fmtN(rung)}</b>
                <span>{l}</span>
              </div>
            </div>
            {rows.map((row) => {
              const h = row.skipped ? null : at(row, rung);
              const tle =
                l.includes('LeetCode') && h && !h.crash && row.fit && row.fit.at(rung) > 1;
              return (
                <div key={row.k} className={`ld-cell c${h?.c ?? 'x'}`}>
                  {h ? (
                    <>
                      <span>{h.e}</span>
                      {h.t}
                    </>
                  ) : (
                    '·'
                  )}
                  {tle && <em className="tle">Time Limit Exceeded</em>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <Curves rows={rows} />
      {sentence && <div className="ld-say">{sentence}</div>}
    </div>
  );
}

// What was actually measured: time per call vs n, log–log
function Curves({ rows }) {
  const all = rows.flatMap((r) => r.pts || []);
  if (all.length < 2) return null;
  const width = 520,
    height = 120,
    pad = { l: 44, r: 10, t: 8, b: 20 };
  const lin = rows.some(
    (r) => r.pts?.length > 2 && r.pts[1][0] - r.pts[0][0] === r.pts[2][0] - r.pts[1][0],
  );
  const xs = all.map((q) => q[0]),
    ts = all.map((q) => Math.max(q[1], 1e-7));
  const fx = (n) => (lin ? n : Math.log2(n)),
    x0 = Math.min(...xs.map(fx)),
    x1 = Math.max(...xs.map(fx));
  const y0 = Math.log10(Math.min(...ts)),
    y1 = Math.log10(Math.max(...ts));
  const xAt = (n) => pad.l + ((fx(n) - x0) / Math.max(1e-9, x1 - x0)) * (width - pad.l - pad.r);
  const yAt = (t) =>
    height -
    pad.b -
    ((Math.log10(Math.max(t, 1e-7)) - y0) / Math.max(0.5, y1 - y0)) * (height - pad.t - pad.b);
  const lab = (t) =>
    t < 1e-3
      ? `${(t * 1e6).toFixed(0)}µs`
      : t < 1
        ? `${(t * 1e3).toFixed(t < 0.01 ? 1 : 0)}ms`
        : `${t.toFixed(1)}s`;
  return (
    <svg
      className="ld-curves"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={rows
        .filter((r) => r.pts?.length)
        .map(
          (r) =>
            `${r.label || r.k}: ${r.pts.map(([n, s]) => `n=${fmtN(n)} ${lab(s)}`).join(', ')}${r.crash ? ', then crashed' : ''}`,
        )
        .join('. ')}
    >
      {[Math.min(...ts), Math.max(...ts)].map((t, i) => (
        <text key={i} x={pad.l - 6} y={yAt(t) + 4} textAnchor="end">
          {lab(t)}
        </text>
      ))}
      <text x={pad.l} y={height - 5}>
        n = {fmtN(Math.min(...xs))}
      </text>
      <text x={width - pad.r} y={height - 5} textAnchor="end">
        {fmtN(Math.max(...xs))} →
      </text>
      {rows.map(
        (r) =>
          r.pts?.length > 0 && (
            <g key={r.k} className={`lc-${r.k}`}>
              <polyline points={r.pts.map(([n, t]) => `${xAt(n)},${yAt(t)}`).join(' ')} />
              {r.pts.map(([n, t]) => (
                <circle key={n} cx={xAt(n)} cy={yAt(t)} r="2.6">
                  <title>{`n = ${fmtN(n)}: ${lab(t)} per call`}</title>
                </circle>
              ))}
              {r.crash && (
                <text
                  x={Math.min(width - 20, xAt(r.pts[r.pts.length - 1]?.[0] || xs[0]) + 8)}
                  y={yAt(r.pts[r.pts.length - 1]?.[1] || ts[0]) + 4}
                  className="boom"
                >
                  💥
                </text>
              )}
            </g>
          ),
      )}
    </svg>
  );
}

// After the story: the solution, and where this puzzle lives at real scale
export function PuzzleEnd({ lesson, rec, setPuzzleCode, onIdea, onOpenAt, onOpenUrl, onSeen }) {
  const puzzle = puzzleById(lesson.puzzle);
  const [sure, setSure] = useState(false);
  if (!puzzle) return null;
  const idea = puzzle.scale?.idea ? ideaById[puzzle.scale.idea] : null;
  const real = puzzle.scale?.real;
  return (
    <div className="pz-end fade-in">
      <div className="pz-reveal">
        {!rec?.seen ? (
          <button
            className="try"
            onClick={() => {
              if (!sure) return setSure(true);
              setPuzzleCode(puzzle, 'fast');
              onSeen?.(puzzle.id);
            }}
          >
            <span className="try-i">🔓</span>
            {sure
              ? 'Sure? The hints above might get you there. Click again to see it.'
              : 'Show me a clever solution'}
          </button>
        ) : (
          <button className="try" onClick={() => setPuzzleCode(puzzle, 'fast')}>
            <span className="try-i">🔓</span>Load the clever solution again
          </button>
        )}
      </div>
      <div className="pz-scale">
        <div className="mini-h">🌍 when n is bigger than one computer</div>
        <p>
          <Md text={puzzle.scale?.text || ''} />
        </p>
        <div className="pz-scale-acts">
          {idea && (
            <button className="idea-src strong" onClick={() => onIdea(idea)}>
              ⬡ Clever idea: <b>{idea.title}</b>
            </button>
          )}
          {real &&
            (real.repo ? (
              <button className="idea-src" onClick={() => onOpenAt(real.repo, real.file)}>
                ◈ Real code: <b>{real.label}</b>
              </button>
            ) : (
              <button className="idea-src" onClick={() => onOpenUrl(real.url)}>
                Real code: <b>{real.label}</b> ↗
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── pictures of each way of thinking
export function PatternArt({ kind, big }) {
  const accent = 'var(--accent)',
    violet = 'var(--violet)',
    mint = 'var(--mint)',
    ink = 'var(--ink-4)';
  const ref = useRef(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ref.current?.pauseAnimations?.();
  }, [kind]);
  const svg = (kids) => (
    <svg
      ref={ref}
      viewBox="0 0 120 64"
      className={`pattern-art ${big ? 'big' : ''}`}
      aria-hidden="true"
    >
      {kids}
    </svg>
  );
  const bars = (hs, x0 = 10, w = 9, gap = 3, fill = ink) =>
    hs.map((h, i) => (
      <rect key={i} x={x0 + i * (w + gap)} y={56 - h} width={w} height={h} rx="2" fill={fill} />
    ));
  switch (kind) {
    case 'shape':
      return svg(
        <>
          {bars([10, 18, 8, 14], 6, 5, 2)}
          <rect
            x="44"
            y="16"
            width="32"
            height="32"
            rx="8"
            fill="none"
            stroke={accent}
            strokeWidth="2.4"
          />
          <text
            x="60"
            y="37"
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize="14"
            fill={accent}
          >
            f
          </text>
          <path d="M33 32 H42 M78 32 H88" stroke={ink} strokeWidth="2" />
          <circle cx="100" cy="32" r="7" fill={mint} />
          <circle r="3.2" fill={violet}>
            <animateMotion dur="2.6s" repeatCount="indefinite" path="M18,32 L100,32" />
          </circle>
        </>,
      );
    case 'hash':
      return svg(
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={8 + i * 18}
              y="34"
              width="14"
              height="20"
              rx="3"
              fill="none"
              stroke={ink}
              strokeWidth="1.6"
            />
          ))}
          <rect x="62" y="34" width="14" height="20" rx="3" fill={accent} opacity=".18" />
          <circle cx="69" r="4" fill={accent}>
            <animate
              attributeName="cy"
              values="8;44;44;8"
              keyTimes="0;.35;.8;1"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
          <text x="69" y="22" textAnchor="middle" fontSize="8" fill={ink} fontFamily="var(--mono)">
            #
          </text>
        </>,
      );
    case 'pointers':
      return svg(
        <>
          {bars([14, 22, 30, 18, 26, 12, 34, 20], 10, 9, 3)}
          <path d="M0 0 L5 8 L-5 8 Z" fill={accent}>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="14 58;50 58;14 58"
              dur="3s"
              repeatCount="indefinite"
            />
          </path>
          <path d="M0 0 L5 8 L-5 8 Z" fill={violet}>
            <animateTransform
              attributeName="transform"
              type="translate"
              values="98 58;62 58;98 58"
              dur="3s"
              repeatCount="indefinite"
            />
          </path>
        </>,
      );
    case 'window':
      return svg(
        <>
          {bars([14, 22, 30, 18, 26, 12, 34, 20, 16], 6, 9, 3)}
          <rect
            y="12"
            width="34"
            height="46"
            rx="5"
            fill={accent}
            fillOpacity=".12"
            stroke={accent}
            strokeWidth="2"
          >
            <animate attributeName="x" values="4;76;4" dur="4s" repeatCount="indefinite" />
          </rect>
        </>,
      );
    case 'stack':
      return svg(
        <>
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x="36"
              y={48 - i * 9}
              width="48"
              height="7"
              rx="3.5"
              fill={i === 2 ? violet : ink}
            />
          ))}
          <rect x="36" width="48" height="7" rx="3.5" fill={accent}>
            <animate
              attributeName="y"
              values="4;21;21;4"
              keyTimes="0;.4;.75;1"
              dur="2.6s"
              repeatCount="indefinite"
            />
          </rect>
        </>,
      );
    case 'binary':
      return svg(
        <>
          {bars([6, 10, 14, 18, 22, 26, 30, 34, 38, 42], 8, 8, 3)}
          <rect
            y="8"
            height="50"
            rx="4"
            fill={accent}
            fillOpacity=".14"
            stroke={accent}
            strokeWidth="1.6"
          >
            <animate
              attributeName="x"
              values="6;61;61;83;6"
              keyTimes="0;.25;.5;.75;1"
              dur="4s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="width"
              values="110;55;55;22;110"
              keyTimes="0;.25;.5;.75;1"
              dur="4s"
              repeatCount="indefinite"
            />
          </rect>
        </>,
      );
    case 'heap':
      return svg(
        <>
          <path
            d="M60 14 L38 34 M60 14 L82 34 M38 34 L28 52 M38 34 L48 52 M82 34 L72 52 M82 34 L92 52"
            stroke={ink}
            strokeWidth="1.6"
          />
          {[
            [38, 34],
            [82, 34],
            [28, 52],
            [48, 52],
            [72, 52],
            [92, 52],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5.5" fill={ink} />
          ))}
          <circle cx="60" cy="14" r="8" fill={accent}>
            <animate attributeName="r" values="7;9;7" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </>,
      );
    case 'tree':
      return svg(
        <>
          <path
            d="M60 10 L36 30 M60 10 L84 30 M36 30 L24 50 M36 30 L48 50 M84 30 L96 50"
            stroke={ink}
            strokeWidth="1.6"
          />
          {[
            [60, 10],
            [36, 30],
            [84, 30],
            [24, 50],
            [48, 50],
            [96, 50],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5.5" fill={i ? ink : violet} />
          ))}
          <circle r="3.4" fill={accent}>
            <animateMotion
              dur="3.2s"
              repeatCount="indefinite"
              path="M60,10 L36,30 L24,50 L36,30 L48,50 L36,30 L60,10 L84,30 L96,50 L84,30 L60,10"
            />
          </circle>
        </>,
      );
    case 'graph':
      return svg(
        <>
          {Array.from({ length: 21 }, (_, i) => {
            const x = i % 7,
              y = Math.floor(i / 7),
              d = Math.abs(x - 3) + Math.abs(y - 1);
            return (
              <rect
                key={i}
                x={10 + x * 15}
                y={8 + y * 17}
                width="12"
                height="14"
                rx="3"
                fill={mint}
              >
                <animate
                  attributeName="opacity"
                  values=".12;.12;1;1;.12"
                  keyTimes={`0;${(d * 0.12).toFixed(2)};${(d * 0.12 + 0.1).toFixed(2)};.85;1`}
                  dur="3s"
                  repeatCount="indefinite"
                />
              </rect>
            );
          })}
        </>,
      );
    case 'dp':
      return svg(
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <g key={i}>
              <rect
                x={8 + i * 15.5}
                y="22"
                width="13"
                height="20"
                rx="3"
                fill="none"
                stroke={ink}
                strokeWidth="1.4"
              />
              <rect x={8 + i * 15.5} y="22" width="13" height="20" rx="3" fill={accent}>
                <animate
                  attributeName="opacity"
                  values="0;0;.85;.85;0"
                  keyTimes={`0;${(i * 0.1).toFixed(2)};${(i * 0.1 + 0.06).toFixed(2)};.9;1`}
                  dur="3.4s"
                  repeatCount="indefinite"
                />
              </rect>
            </g>
          ))}
          <path
            d="M14 50 q8 8 16 0 M30 50 q8 8 16 0"
            stroke={violet}
            strokeWidth="1.4"
            fill="none"
          />
        </>,
      );
    case 'backtrack':
      return svg(
        <>
          <path
            d="M60 8 L34 30 L22 54 M34 30 L46 54 M60 8 L86 30 L74 54 M86 30 L98 54"
            stroke={ink}
            strokeWidth="1.6"
            fill="none"
          />
          <text x="22" y="62" textAnchor="middle" fontSize="9" fill="var(--rose-ink)">
            ✕
          </text>
          <text x="46" y="62" textAnchor="middle" fontSize="9" fill="var(--rose-ink)">
            ✕
          </text>
          <text x="74" y="62" textAnchor="middle" fontSize="9" fill={mint}>
            ✓
          </text>
          <circle r="3.6" fill={accent}>
            <animateMotion
              dur="4s"
              repeatCount="indefinite"
              path="M60,8 L34,30 L22,54 L34,30 L46,54 L34,30 L60,8 L86,30 L74,54"
            />
          </circle>
        </>,
      );
    case 'intervals':
      return svg(
        <>
          <rect y="14" width="40" height="8" rx="4" fill={accent}>
            <animate
              attributeName="x"
              values="10;18;18;10"
              keyTimes="0;.4;.8;1"
              dur="3s"
              repeatCount="indefinite"
            />
          </rect>
          <rect y="28" width="44" height="8" rx="4" fill={violet}>
            <animate
              attributeName="y"
              values="28;14;14;28"
              keyTimes="0;.4;.8;1"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="x"
              values="40;48;48;40"
              keyTimes="0;.4;.8;1"
              dur="3s"
              repeatCount="indefinite"
            />
          </rect>
          <rect x="20" y="44" width="80" height="4" rx="2" fill={ink} />
          {[20, 40, 60, 80, 100].map((x) => (
            <rect key={x} x={x - 0.6} y="42" width="1.2" height="8" fill={ink} />
          ))}
        </>,
      );
    case 'design':
      return svg(
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={14 + i * 24}
              y="24"
              width="18"
              height="18"
              rx="4"
              fill={i === 3 ? accent : ink}
              opacity={i === 0 ? 0.45 : 1}
            />
          ))}
          <rect width="18" height="18" rx="4" fill={mint}>
            <animate
              attributeName="x"
              values="110;86;86;110"
              keyTimes="0;.35;.8;1"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate attributeName="y" values="4;4;4;4" dur="3s" repeatCount="indefinite" />
          </rect>
          <path d="M20 50 H100" stroke={ink} strokeWidth="1.4" strokeDasharray="3 3" />
          <text x="14" y="60" fontSize="7" fill={ink} fontFamily="var(--round)">
            oldest
          </text>
          <text x="106" y="60" fontSize="7" fill={ink} textAnchor="end" fontFamily="var(--round)">
            newest
          </text>
        </>,
      );
    case 'beyond':
      return svg(
        <>
          <circle cx="60" cy="32" r="24" fill="none" stroke={ink} strokeWidth="1.4" />
          <ellipse cx="60" cy="32" rx="10" ry="24" fill="none" stroke={ink} strokeWidth="1" />
          <path d="M36 32 H84" stroke={ink} strokeWidth="1" />
          {[
            [40, 20],
            [80, 22],
            [46, 46],
            [76, 44],
            [60, 8],
            [60, 56],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.4" fill={[accent, violet, mint][i % 3]}>
              <animate
                attributeName="opacity"
                values=".3;1;.3"
                dur="2.4s"
                begin={`${i * 0.4}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
        </>,
      );
    default:
      return svg(null);
  }
}
