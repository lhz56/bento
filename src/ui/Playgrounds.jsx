// Playgrounds: hands-on sandboxes for the things beginners hit first in real work — SQL, the terminal and Git —
// and, later, designing a system that survives a billion users.
import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from './Editor.jsx';
import { run as runCode } from '../runtime/runner.js';
import { TABLES, CHALLENGES, pipeline, runnerCode, sameResult } from '../sql.js';
import * as G from '../gitsim.js';
import { t, tx } from '../i18n.js';
import Sandbox from './Sandbox.jsx';
import { K, mod } from '../platform.js';

export default function Playgrounds({
  top,
  tab = 'sql',
  setTab,
  progress = {},
  onProgress,
  quick,
  model,
  pyReady,
  onAsk,
}) {
  return (
    <div className="ideas playgrounds">
      <div className="ideas-inner wide">
        {top}
        <div className="hello">{t('Playgrounds')}</div>
        <h1 className="home-h">{tx('Learn it by *doing* it.')}</h1>
        <div className="shelves">
          {[
            ['sql', '🗄', 'SQL & databases'],
            ['git', '⌥', 'Terminal & Git'],
            ['design', '🌍', 'Design for a billion'],
          ].map(([k, ic, l]) => (
            <button key={k} className={`shelf ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              <span>{ic}</span>
              {t(l)}
            </button>
          ))}
        </div>
        {tab === 'sql' && (
          <SqlPlay
            done={progress.sql || {}}
            onDone={(id) => onProgress('sql', id)}
            quick={quick}
            model={model}
            pyReady={pyReady}
          />
        )}
        {tab === 'git' && (
          <GitPlay done={progress.git || {}} onDone={(i) => onProgress('git', i)} />
        )}
        {tab === 'design' && (
          <Sandbox
            done={progress.design || {}}
            onDone={(i) => onProgress('design', i)}
            onAsk={onAsk}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────── SQL
const runSql = async (q, counts = []) => {
  const r = await runCode('python', 'run', runnerCode(q, counts));
  const line = (r.logs || []).find((l) => l.s?.startsWith('__SQL__'));
  if (!line) return { error: r.error?.msg || 'The database didn’t answer.' };
  return JSON.parse(line.s.slice(7));
};
const refCache = new Map();

function SqlPlay({ done, onDone, quick, model, pyReady }) {
  const [ci, setCi] = useState(() =>
    Math.max(
      0,
      CHALLENGES.findIndex(([id]) => !done[id]),
    ),
  );
  const [q, setQ] = useState(CHALLENGES[ci]?.[0] === 'all' ? 'SELECT * FROM customers;' : '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [plain, setPlain] = useState(null);
  const C = CHALLENGES[ci];
  const steps = useMemo(() => pipeline(q), [q]);
  const go = async (query = q) => {
    if (!query.trim()) return;
    setBusy(true);
    setPlain(null);
    const st = pipeline(query);
    const r = await runSql(
      query,
      (st || []).map((s) => s.count),
    );
    setRes({ ...r, steps: st });
    setBusy(false);
    // does it answer the challenge?
    if (C && !r.error) {
      if (!refCache.has(C[0])) refCache.set(C[0], await runSql(C[3]));
      const ok = sameResult(r, refCache.get(C[0]), /\border\s+by\b/i.test(C[3]));
      setVerdict(ok ? 'ok' : 'no');
      if (ok) onDone(C[0]);
    } else setVerdict(null);
  };
  useEffect(() => {
    if (pyReady && q) go();
  }, [pyReady]);
  const pick = (i) => {
    setCi(i);
    setVerdict(null);
    setHint(false);
    setRes(null);
    setQ('');
  };
  return (
    <div className="pg-sql">
      <div className="pg-side">
        <div className="mini-h">{t('the café database')}</div>
        {TABLES.map(([name, cols, n, what]) => (
          <button
            key={name}
            className="tbl-card"
            onClick={() => {
              const s = `SELECT * FROM ${name};`;
              setQ(s);
              go(s);
            }}
            title={t('Click to see its rows')}
          >
            <div className="tbl-h">
              <b>{name}</b>
              <span>
                {n} {t('rows')}
              </span>
            </div>
            <div className="tbl-what">{t(what)}</div>
            <div className="tbl-cols">
              {cols.map((c) => (
                <code key={c} className={c === 'id' ? 'pk' : c.endsWith('_id') ? 'fk' : ''}>
                  {c}
                </code>
              ))}
            </div>
          </button>
        ))}
        <div className="tbl-key">
          <code className="pk">id</code> {t('its own number')} ·{' '}
          <code className="fk">customer_id</code> {t('points to another table')}
        </div>
        <div className="mini-h" style={{ marginTop: 18 }}>
          {t('challenges')}
        </div>
        {CHALLENGES.map(([id, title, , , , idea], i) => (
          <button
            key={id}
            className={`ch-row ${i === ci ? 'on' : ''} ${done[id] ? 'done' : ''}`}
            onClick={() => pick(i)}
          >
            <span className="ch-n">{done[id] ? '✓' : i + 1}</span>
            <span className="ch-t">
              <b>{t(title)}</b>
              <em>{idea}</em>
            </span>
          </button>
        ))}
      </div>
      <div className="pg-main">
        {C && (
          <div className={`ch-goal ${verdict || ''}`}>
            <div>
              <span className="mini-h">
                {t('challenge')} {ci + 1}
              </span>
              <b>{t(C[2])}</b>
            </div>
            {verdict === 'ok' ? (
              <span className="ch-ok">
                ✓ {t('Correct!')}
                {ci + 1 < CHALLENGES.length && (
                  <button className="btn tiny" onClick={() => pick(ci + 1)}>
                    {t('Next')} →
                  </button>
                )}
              </span>
            ) : verdict === 'no' ? (
              <span className="ch-no">
                {t('Not quite: compare your rows with what the goal asks.')}
              </span>
            ) : (
              <button className="link" onClick={() => setHint(!hint)}>
                {hint ? t('hide hint') : t('hint')}
              </button>
            )}
            {hint && (
              <div className="ch-hint">
                {C[4]
                  .split(/(`[^`]+`)/)
                  .map((x, i) => (x.startsWith('`') ? <code key={i}>{x.slice(1, -1)}</code> : x))}
              </div>
            )}
          </div>
        )}
        <div className="sql-ed">
          <Editor value={q} lang="sql" onChange={(v) => setQ(v)} />
          <div className="sql-bar">
            <span className="muted small">
              <kbd>{K.mod}</kbd>
              <kbd>{K.enter}</kbd> {t('run')}
            </span>
            {quick && q.trim() && (
              <button
                className="link"
                onClick={async () => {
                  setPlain('…');
                  try {
                    const j = await quick(
                      model,
                      `Explain this SQL query to a beginner in at most 45 words, plainly, step by step in the order the database runs it. Query: ${q}\nReply with just the explanation.`,
                    );
                    setPlain(String(j).replace(/^"|"$/g, ''));
                  } catch {
                    setPlain(null);
                  }
                }}
              >
                ✦ {t('Explain this query')}
              </button>
            )}
            <button className="btn" disabled={busy || !pyReady} onClick={() => go()}>
              {busy ? t('Running…') : !pyReady ? t('Starting…') : '▶ ' + t('Run')}
            </button>
          </div>
        </div>
        {plain && <div className="sql-plain">{plain}</div>}
        {res?.steps && !res.error && (
          <Flow steps={res.steps} counts={res.counts} rows={res.rows?.length} />
        )}
        {res?.error && (
          <div className="err-card">
            <span className="err-msg">{res.error}</span>
          </div>
        )}
        {res && !res.error && <ResultTable res={res} />}
        <KeyRun onRun={() => go()} />
      </div>
    </div>
  );
}

function KeyRun({ onRun }) {
  useEffect(() => {
    const h = (e) => {
      if (mod(e) && e.key === 'Enter') {
        e.preventDefault();
        onRun();
      }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  });
  return null;
}

// How the database worked through it: rows in, rows kept at each step, rows out
function Flow({ steps, counts = [], rows }) {
  return (
    <div className="sql-flow">
      {steps.map((s, i) => {
        const n =
          s.k === 'SELECT' || s.k === 'ORDER BY' ? null : s.k === 'LIMIT' ? rows : counts[i];
        return (
          <div key={i} className={`sf-step k-${s.k.replace(' ', '')}`}>
            {i > 0 && <span className="sf-arrow">→</span>}
            <div className="sf-box">
              <code>{s.k}</code>
              <span>{s.say}</span>
              {n != null && (
                <b>
                  {n} {n === 1 ? t('row') : t('rows')}
                </b>
              )}
            </div>
          </div>
        );
      })}
      <div className="sf-step">
        <span className="sf-arrow">→</span>
        <div className="sf-box out">
          <code>{t('result')}</code>
          <b>
            {rows} {rows === 1 ? t('row') : t('rows')}
          </b>
        </div>
      </div>
    </div>
  );
}

function ResultTable({ res }) {
  if (!res.cols?.length)
    return (
      <div className="muted small">
        {t('Done.')}{' '}
        {res.changed != null
          ? `${res.changed} ${t('rows changed (this sandbox resets every run).')}`
          : ''}
      </div>
    );
  return (
    <div className="sql-res">
      <table>
        <thead>
          <tr>
            {res.cols.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {res.rows.slice(0, 100).map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : ''}>
                  {v === null ? (
                    <i>NULL</i>
                  ) : typeof v === 'number' && !Number.isInteger(v) ? (
                    v.toFixed(2)
                  ) : (
                    String(v)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {res.rows.length > 100 && (
        <div className="muted small">
          {t('showing 100 of')} {res.rows.length}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Terminal & Git
function GitPlay({ done, onDone }) {
  const [S, setS] = useState(() => G.fresh());
  const [line, setLine] = useState('');
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const [seen, setSeen] = useState(() => new Set(Object.keys(done).map(Number)));
  const end = useRef(null);
  const inp = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [S.out.length]);
  useEffect(() => {
    const add = G.MISSIONS.map((m, i) => (m[3](S) ? i : -1)).filter((i) => i >= 0 && !seen.has(i));
    if (add.length) {
      const n = new Set(seen);
      add.forEach((i) => {
        n.add(i);
        onDone(i);
      });
      setSeen(n);
    }
  }, [S]);
  const next = G.MISSIONS.findIndex((_, i) => !seen.has(i));
  const submit = (e) => {
    e.preventDefault();
    if (!line.trim()) return;
    setS(G.run(S, line));
    setHist([line, ...hist].slice(0, 50));
    setHi(-1);
    setLine('');
  };
  const st = G.status(S) || [];
  const E = S.last && G.EXPLAIN[S.last];
  const prompt = (cwd, branch = S.repo?.head) =>
    `you@bento ${cwd.replace('/home', '~')}${S.repo && branch && cwd.startsWith(S.repo.root) ? ` (${branch})` : ''} $`;
  return (
    <div className="pg-git">
      <div className="pg-side">
        <div className="mini-h">
          {t('missions')} · {seen.size}/{G.MISSIONS.length}
        </div>
        {G.MISSIONS.map(([title, goal, hint], i) => (
          <div key={i} className={`ms-row ${seen.has(i) ? 'done' : i === next ? 'now' : ''}`}>
            <span className="ch-n">{seen.has(i) ? '✓' : i + 1}</span>
            <div>
              <b>{t(title)}</b>
              {i === next && (
                <>
                  <p>
                    {goal
                      .split(/(`[^`]+`)/)
                      .map((x, k) =>
                        x.startsWith('`') ? <code key={k}>{x.slice(1, -1)}</code> : t(x),
                      )}
                  </p>
                  <button
                    className="link"
                    onClick={() => {
                      setLine(
                        hint
                          .split(',')[0]
                          .replace(/^then /, '')
                          .trim(),
                      );
                      inp.current?.focus();
                    }}
                  >
                    {t('show me')}: <code>{hint}</code>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {seen.size === G.MISSIONS.length && (
          <div className="ms-win">
            🎉{' '}
            {t('That’s the loop real teams use every day: change, stage, commit, branch, merge.')}
          </div>
        )}
      </div>
      <div className="pg-main git-main">
        <div className="gterm" onClick={() => inp.current?.focus()}>
          {S.out.map((o, i) =>
            o.k === 'cmd' ? (
              <div key={i} className="t-cmd">
                <span>{prompt(o.cwd, o.branch)}</span> {o.s}
              </div>
            ) : (
              <pre key={i} className={`t-${o.k}`}>
                {o.s
                  .split(/(`[^`]+`)/)
                  .map((x, k) => (x.startsWith('`') ? <b key={k}>{x.slice(1, -1)}</b> : x))}
              </pre>
            ),
          )}
          <form onSubmit={submit} className="t-line">
            <span>{prompt(S.cwd)}</span>
            <input
              ref={inp}
              autoFocus
              value={line}
              onChange={(e) => setLine(e.target.value)}
              spellCheck={false}
              aria-label="command"
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const n = Math.min(hist.length - 1, hi + 1);
                  if (n >= 0) {
                    setHi(n);
                    setLine(hist[n]);
                  }
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const n = hi - 1;
                  setHi(n);
                  setLine(n >= 0 ? hist[n] : '');
                }
              }}
            />
          </form>
          <div ref={end} />
        </div>
        {E && (
          <div className="t-explain fade-in" key={S.out.length}>
            <b>{t(E[0])}</b> {t(E[1])} <i>≈ {t(E[2])}</i>
          </div>
        )}
        <div className="git-viz">
          <Folder S={S} st={st} />
          <Stages S={S} st={st} />
          <Graph S={S} />
        </div>
      </div>
    </div>
  );
}

function Folder({ S, st }) {
  const paths = Object.keys(S.files)
    .filter((p) => p !== '/home')
    .sort();
  const mark = (p) => {
    if (!S.repo || !p.startsWith(S.repo.root + '/')) return '';
    const n = p.slice(S.repo.root.length + 1);
    const x = st.find((y) => y.name === n);
    return x ? (x.work === 'untracked' ? 'untracked' : x.work ? 'modified' : 'staged') : 'clean';
  };
  return (
    <div className="gv-box">
      <div className="mini-h">{t('your folder')}</div>
      {paths.length === 0 && (
        <div className="muted small">
          {t('empty: try')} <code>mkdir my-app</code>
        </div>
      )}
      {paths.map((p) => {
        const depth = p.split('/').length - 3;
        const dir = S.files[p] === null;
        const m = mark(p);
        return (
          <div
            key={p}
            className={`gv-file ${m} ${p === S.cwd ? 'gv-cwd' : ''}`}
            style={{ paddingLeft: depth * 14 }}
            title={dir ? '' : S.files[p]}
          >
            {dir ? '📁' : '📄'} {p.split('/').pop()}
            {m && m !== 'clean' && <em>{t(m)}</em>}
            {p === S.cwd && <span className="gv-here">{t('you are here')}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Stages({ S, st }) {
  if (!S.repo)
    return (
      <div className="gv-box">
        <div className="mini-h">{t('git')}</div>
        <div className="muted small">
          {t('Not a repository yet. Run')} <code>git init</code> {t('inside a folder.')}
        </div>
      </div>
    );
  const work = st.filter((x) => x.work),
    staged = st.filter((x) => x.staged);
  const commits = Object.keys(S.repo.commits).length;
  return (
    <div className="gv-box stages">
      <div className="mini-h">{t('where your changes are')}</div>
      <div className="stg">
        <div className="stg-col">
          <b>{t('Changed')}</b>
          {work.map((x) => (
            <span key={x.name} className={`chip-f ${x.work}`}>
              {x.name}
            </span>
          ))}
          {!work.length && <i>{t('nothing')}</i>}
        </div>
        <span className="stg-arrow">git add →</span>
        <div className="stg-col">
          <b>{t('Staged')}</b>
          {staged.map((x) => (
            <span key={x.name} className="chip-f staged">
              {x.name}
            </span>
          ))}
          {!staged.length && <i>{t('nothing')}</i>}
        </div>
        <span className="stg-arrow">git commit →</span>
        <div className="stg-col">
          <b>{t('History')}</b>
          <span className="chip-f hist">
            {commits} {commits === 1 ? t('snapshot') : t('snapshots')}
          </span>
        </div>
      </div>
    </div>
  );
}

// The commit graph: one lane per branch, newest on the right
function Graph({ S }) {
  if (!S.repo || !Object.keys(S.repo.commits).length)
    return (
      <div className="gv-box">
        <div className="mini-h">{t('history')}</div>
        <div className="muted small">{t('Your snapshots will appear here as a timeline.')}</div>
      </div>
    );
  const R = S.repo;
  const cs = Object.values(R.commits).sort((a, b) => a.at - b.at);
  const lanes = [...new Set(['main', ...cs.map((c) => c.branch), ...Object.keys(R.branches)])];
  const x = (i) => 96 + i * 70,
    y = (b) => 30 + lanes.indexOf(b) * 50;
  const idx = Object.fromEntries(cs.map((c, i) => [c.id, i]));
  const W = Math.max(300, x(cs.length) + 60),
    H = 34 + lanes.length * 50;
  return (
    <div className="gv-box graph">
      <div className="mini-h">{t('history')}</div>
      <div className="gv-scroll">
        <svg
          width={W}
          height={H}
          role="img"
          aria-label={`${cs.length} commits on ${lanes.length} branch${lanes.length > 1 ? 'es' : ''}: ${cs.map((c) => `${c.msg} (${c.branch})`).join(', ') || 'none yet'}`}
        >
          {lanes.map((b) => (
            <g key={b}>
              <line x1={70} x2={W - 10} y1={y(b)} y2={y(b)} className="gl-lane" />
              <text x={4} y={y(b) + 4} className="gl-name">
                {b}
              </text>
            </g>
          ))}
          {cs.flatMap((c) =>
            c.parents.map(
              (p) =>
                R.commits[p] && (
                  <path
                    key={c.id + p}
                    d={`M${x(idx[p])},${y(R.commits[p].branch)} C${x(idx[p]) + 30},${y(R.commits[p].branch)} ${x(idx[c.id]) - 30},${y(c.branch)} ${x(idx[c.id])},${y(c.branch)}`}
                    className="gl-edge"
                  />
                ),
            ),
          )}
          {cs.map((c) => (
            <g key={c.id} className="gl-node">
              <circle
                cx={x(idx[c.id])}
                cy={y(c.branch)}
                r={c.parents.length > 1 ? 8 : 7}
                className={c.parents.length > 1 ? 'merge' : ''}
              />
              <title>{`${c.id.slice(0, 7)} ${c.msg}`}</title>
              <text x={x(idx[c.id])} y={y(c.branch) + 20} textAnchor="middle" className="gl-msg">
                {c.msg.length > 11 ? c.msg.slice(0, 10) + '…' : c.msg}
              </text>
            </g>
          ))}
          {Object.entries(R.branches)
            .filter(([, v]) => v)
            .map(([b, v]) => (
              <g key={b}>
                <rect
                  x={x(idx[v]) + 10}
                  y={
                    y(R.commits[v].branch) -
                    24 -
                    Object.entries(R.branches)
                      .filter(([, w]) => w === v)
                      .findIndex(([n]) => n === b) *
                      15
                  }
                  width={b.length * 6.5 + 14}
                  height="14"
                  rx="7"
                  className={`gl-tag ${b === R.head ? 'head' : ''}`}
                />
                <text
                  x={x(idx[v]) + 17}
                  y={
                    y(R.commits[v].branch) -
                    14 -
                    Object.entries(R.branches)
                      .filter(([, w]) => w === v)
                      .findIndex(([n]) => n === b) *
                      15
                  }
                  className="gl-tagt"
                >
                  {b}
                  {b === R.head ? ' ◀' : ''}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
}
