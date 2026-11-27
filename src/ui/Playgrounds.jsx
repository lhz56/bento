// Playgrounds: hands-on sandboxes for the things beginners hit first in real work — SQL, the terminal and Git —
// and, later, designing a system that survives a billion users.
import { useEffect, useRef, useState } from 'react';
import Editor from './Editor.jsx';
import { run as runCode } from '../runtime/runner.js';
import { TABLES, CHALLENGES, pipeline, runnerCode, sameResult } from '../sql.js';
import * as G from '../gitsim.js';
import { t, tx } from '../i18n.js';
import Sandbox from './Sandbox.jsx';
import { K, mod } from '../platform.js';

/** @param {{ progress?: Record<string, Record<string, any>>, [prop: string]: any }} props */
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
  const [sql, setSql] = useState(CHALLENGES[ci]?.[0] === 'all' ? 'SELECT * FROM customers;' : '');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [plain, setPlain] = useState(null);
  const challenge = CHALLENGES[ci];
  const go = async (query = sql) => {
    if (!query.trim()) return;
    setBusy(true);
    setPlain(null);
    const st = pipeline(query);
    const result = await runSql(
      query,
      (st || []).map((s) => s.count),
    );
    setRes({ ...result, steps: st });
    setBusy(false);
    // does it answer the challenge?
    if (challenge && !result.error) {
      if (!refCache.has(challenge[0])) refCache.set(challenge[0], await runSql(challenge[3]));
      const ok = sameResult(
        result,
        refCache.get(challenge[0]),
        /\border\s+by\b/i.test(challenge[3]),
      );
      setVerdict(ok ? 'ok' : 'no');
      if (ok) onDone(challenge[0]);
    } else setVerdict(null);
  };
  useEffect(() => {
    if (pyReady && sql) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs the waiting playground once Python is ready
  }, [pyReady]);
  const pick = (i) => {
    setCi(i);
    setVerdict(null);
    setHint(false);
    setRes(null);
    setSql('');
  };
  return (
    <div className="pg-sql">
      <div className="pg-side">
        <div className="mini-h">{t('the café database')}</div>
        {TABLES.map(([name, cols, rows, what]) => (
          <button
            key={name}
            className="tbl-card"
            onClick={() => {
              const s = `SELECT * FROM ${name};`;
              setSql(s);
              go(s);
            }}
            title={t('Click to see its rows')}
          >
            <div className="tbl-h">
              <b>{name}</b>
              <span>
                {rows} {t('rows')}
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
        {challenge && (
          <div className={`ch-goal ${verdict || ''}`}>
            <div>
              <span className="mini-h">
                {t('challenge')} {ci + 1}
              </span>
              <b>{t(challenge[2])}</b>
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
                {challenge[4]
                  .split(/(`[^`]+`)/)
                  .map((x, i) => (x.startsWith('`') ? <code key={i}>{x.slice(1, -1)}</code> : x))}
              </div>
            )}
          </div>
        )}
        <div className="sql-ed">
          <Editor value={sql} lang="sql" onChange={(v) => setSql(v)} />
          <div className="sql-bar">
            <span className="muted small">
              <kbd>{K.mod}</kbd>
              <kbd>{K.enter}</kbd> {t('run')}
            </span>
            {quick && sql.trim() && (
              <button
                className="link"
                onClick={async () => {
                  setPlain('…');
                  try {
                    const j = await quick(
                      model,
                      `Explain this SQL query to a beginner in at most 45 words, plainly, step by step in the order the database runs it. Query: ${sql}\nReply with just the explanation.`,
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
      {steps.map((step, i) => {
        const count =
          step.k === 'SELECT' || step.k === 'ORDER BY'
            ? null
            : step.k === 'LIMIT'
              ? rows
              : counts[i];
        return (
          <div key={i} className={`sf-step k-${step.k.replace(' ', '')}`}>
            {i > 0 && <span className="sf-arrow">→</span>}
            <div className="sf-box">
              <code>{step.k}</code>
              <span>{step.say}</span>
              {count != null && (
                <b>
                  {count} {count === 1 ? t('row') : t('rows')}
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
          {res.rows.slice(0, 100).map((row, i) => (
            <tr key={i}>
              {row.map((value, j) => (
                <td key={j} className={typeof value === 'number' ? 'num' : ''}>
                  {value === null ? (
                    <i>NULL</i>
                  ) : typeof value === 'number' && !Number.isInteger(value) ? (
                    value.toFixed(2)
                  ) : (
                    String(value)
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
  const [sim, setS] = useState(() => G.fresh());
  const [line, setLine] = useState('');
  const [hist, setHist] = useState([]);
  const [hi, setHi] = useState(-1);
  const [seen, setSeen] = useState(() => new Set(Object.keys(done).map(Number)));
  const end = useRef(null);
  const inp = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [sim.out.length]);
  useEffect(() => {
    const add = G.MISSIONS.map((m, i) => (m[3](sim) ? i : -1)).filter(
      (i) => i >= 0 && !seen.has(i),
    );
    if (add.length) {
      const next = new Set(seen);
      add.forEach((i) => {
        next.add(i);
        onDone(i);
      });
      setSeen(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missions are checked each time the simulation moves
  }, [sim]);
  const next = G.MISSIONS.findIndex((_, i) => !seen.has(i));
  const submit = (e) => {
    e.preventDefault();
    if (!line.trim()) return;
    setS(G.run(sim, line));
    setHist([line, ...hist].slice(0, 50));
    setHi(-1);
    setLine('');
  };
  const st = G.status(sim) || [];
  const explain = sim.last && G.EXPLAIN[sim.last];
  const prompt = (cwd, branch = sim.repo?.head) =>
    `you@bento ${cwd.replace('/home', '~')}${sim.repo && branch && cwd.startsWith(sim.repo.root) ? ` (${branch})` : ''} $`;
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
          {sim.out.map((out, i) =>
            out.k === 'cmd' ? (
              <div key={i} className="t-cmd">
                <span>{prompt(out.cwd, out.branch)}</span> {out.s}
              </div>
            ) : (
              <pre key={i} className={`t-${out.k}`}>
                {out.s
                  .split(/(`[^`]+`)/)
                  .map((x, k) => (x.startsWith('`') ? <b key={k}>{x.slice(1, -1)}</b> : x))}
              </pre>
            ),
          )}
          <form onSubmit={submit} className="t-line">
            <span>{prompt(sim.cwd)}</span>
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
                  const next = Math.min(hist.length - 1, hi + 1);
                  if (next >= 0) {
                    setHi(next);
                    setLine(hist[next]);
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
        {explain && (
          <div className="t-explain fade-in" key={sim.out.length}>
            <b>{t(explain[0])}</b> {t(explain[1])} <i>≈ {t(explain[2])}</i>
          </div>
        )}
        <div className="git-viz">
          <Folder sim={sim} st={st} />
          <Stages sim={sim} st={st} />
          <Graph sim={sim} />
        </div>
      </div>
    </div>
  );
}

function Folder({ sim, st }) {
  const paths = Object.keys(sim.files)
    .filter((p) => p !== '/home')
    .sort();
  const mark = (p) => {
    if (!sim.repo || !p.startsWith(sim.repo.root + '/')) return '';
    const n = p.slice(sim.repo.root.length + 1);
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
      {paths.map((path) => {
        const depth = path.split('/').length - 3;
        const dir = sim.files[path] === null;
        const marked = mark(path);
        return (
          <div
            key={path}
            className={`gv-file ${marked} ${path === sim.cwd ? 'gv-cwd' : ''}`}
            style={{ paddingLeft: depth * 14 }}
            title={dir ? '' : sim.files[path]}
          >
            {dir ? '📁' : '📄'} {path.split('/').pop()}
            {marked && marked !== 'clean' && <em>{t(marked)}</em>}
            {path === sim.cwd && <span className="gv-here">{t('you are here')}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Stages({ sim, st }) {
  if (!sim.repo)
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
  const commits = Object.keys(sim.repo.commits).length;
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
function Graph({ sim }) {
  if (!sim.repo || !Object.keys(sim.repo.commits).length)
    return (
      <div className="gv-box">
        <div className="mini-h">{t('history')}</div>
        <div className="muted small">{t('Your snapshots will appear here as a timeline.')}</div>
      </div>
    );
  const repo = sim.repo;
  const cs = Object.values(repo.commits).sort((a, b) => a.at - b.at);
  const lanes = [...new Set(['main', ...cs.map((c) => c.branch), ...Object.keys(repo.branches)])];
  const x = (i) => 96 + i * 70,
    y = (b) => 30 + lanes.indexOf(b) * 50;
  const idx = Object.fromEntries(cs.map((c, i) => [c.id, i]));
  const width = Math.max(300, x(cs.length) + 60),
    height = 34 + lanes.length * 50;
  return (
    <div className="gv-box graph">
      <div className="mini-h">{t('history')}</div>
      <div className="gv-scroll">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${cs.length} commits on ${lanes.length} branch${lanes.length > 1 ? 'es' : ''}: ${cs.map((c) => `${c.msg} (${c.branch})`).join(', ') || 'none yet'}`}
        >
          {lanes.map((lane) => (
            <g key={lane}>
              <line x1={70} x2={width - 10} y1={y(lane)} y2={y(lane)} className="gl-lane" />
              <text x={4} y={y(lane) + 4} className="gl-name">
                {lane}
              </text>
            </g>
          ))}
          {cs.flatMap((commit) =>
            commit.parents.map(
              (parent) =>
                repo.commits[parent] && (
                  <path
                    key={commit.id + parent}
                    d={`M${x(idx[parent])},${y(repo.commits[parent].branch)} C${x(idx[parent]) + 30},${y(repo.commits[parent].branch)} ${x(idx[commit.id]) - 30},${y(commit.branch)} ${x(idx[commit.id])},${y(commit.branch)}`}
                    className="gl-edge"
                  />
                ),
            ),
          )}
          {cs.map((commit) => (
            <g key={commit.id} className="gl-node">
              <circle
                cx={x(idx[commit.id])}
                cy={y(commit.branch)}
                r={commit.parents.length > 1 ? 8 : 7}
                className={commit.parents.length > 1 ? 'merge' : ''}
              />
              <title>{`${commit.id.slice(0, 7)} ${commit.msg}`}</title>
              <text
                x={x(idx[commit.id])}
                y={y(commit.branch) + 20}
                textAnchor="middle"
                className="gl-msg"
              >
                {commit.msg.length > 11 ? commit.msg.slice(0, 10) + '…' : commit.msg}
              </text>
            </g>
          ))}
          {Object.entries(repo.branches)
            .filter(([, v]) => v)
            .map(([branch, commit]) => (
              <g key={branch}>
                <rect
                  x={x(idx[commit]) + 10}
                  y={
                    y(repo.commits[commit].branch) -
                    24 -
                    Object.entries(repo.branches)
                      .filter(([, w]) => w === commit)
                      .findIndex(([n]) => n === branch) *
                      15
                  }
                  width={branch.length * 6.5 + 14}
                  height="14"
                  rx="7"
                  className={`gl-tag ${branch === repo.head ? 'head' : ''}`}
                />
                <text
                  x={x(idx[commit]) + 17}
                  y={
                    y(repo.commits[commit].branch) -
                    14 -
                    Object.entries(repo.branches)
                      .filter(([, w]) => w === commit)
                      .findIndex(([n]) => n === branch) *
                      15
                  }
                  className="gl-tagt"
                >
                  {branch}
                  {branch === repo.head ? ' ◀' : ''}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
}
