// The code detective: a small mystery about the project, solved by reading its real files.
import { useMemo, useState } from 'react';

// =====================================================================================================
// Code detective: read the top of a real file and guess its job. Reading code is a skill; this makes it a game.
const LEAD = /^\s*(\/\*|\*|\/\/|#(?!include|!|\[)|"""|'''|<!--|-->|$)/;

export function Detective({ facts, narration, readFile, onOpen }) {
  const pool = useMemo(() => {
    const roles = narration?.roles || {};
    const idx = new Map(facts.files.map((f) => [f.p, f]));
    return Object.entries(roles)
      .filter(
        ([p, r]) =>
          r && idx.get(p)?.lines >= 12 && idx.get(p)?.lang && idx.get(p).layer !== 'support',
      )
      .map(([p, r]) => ({ p, r, layer: idx.get(p).layer }));
  }, [facts, narration]);
  const [game, setGame] = useState(null); // { rounds: [...], i, score, picked, code }
  const deal = async () => {
    const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    const rounds = pick.map((x) => {
      const others = pool
        .filter((y) => y.p !== x.p && y.r !== x.r)
        .sort(
          (a, b) =>
            Number(a.layer === x.layer) - Number(b.layer === x.layer) || Math.random() - 0.5,
        )
        .slice(0, 2);
      return { ...x, opts: [x.r, ...others.map((o) => o.r)].sort(() => Math.random() - 0.5) };
    });
    setGame({ rounds, i: 0, score: 0, picked: null, code: null });
    load(rounds[0]);
  };
  const load = async (round) => {
    let t = '';
    try {
      t = await readFile(round.p);
    } catch {}
    const lines = t.split('\n');
    let k = 0;
    while (k < lines.length && k < 60 && LEAD.test(lines[k])) k++;
    const code = lines
      .slice(k)
      .filter((l, j, a) => !(l.trim() === '' && a[j - 1]?.trim() === ''))
      .slice(0, 18)
      .join('\n');
    setGame((g) => (g && g.rounds.includes(round) ? { ...g, code } : g));
  };
  if (pool.length < 4) return null;
  if (!game)
    return (
      <div className="detective intro">
        <div className="dt-badge">🕵</div>
        <div>
          <b>Code detective</b>
          <span>
            Read the top of a real file from this project and guess what it does. Five files, about
            two minutes.
          </span>
        </div>
        <button className="btn" onClick={deal}>
          Play
        </button>
      </div>
    );
  const round = game.rounds[game.i];
  const done = game.i >= game.rounds.length;
  if (done)
    return (
      <div className="detective intro">
        <div className="dt-badge">{game.score >= 4 ? '🏆' : game.score >= 2 ? '🔍' : '🌱'}</div>
        <div>
          <b>
            {game.score} of {game.rounds.length} files solved
          </b>
          <span>
            {game.score >= 4
              ? 'You read code like a pro.'
              : game.score >= 2
                ? 'Good eye. Names, imports and the first function give most of it away.'
                : 'Tip: look at what a file imports and the name of its first function.'}
          </span>
        </div>
        <button className="btn" onClick={deal}>
          Play again
        </button>
      </div>
    );
  const right = game.picked != null && game.picked === round.r;
  return (
    <div className="detective">
      <div className="dt-top">
        <span className="mini-h">
          code detective · {game.i + 1} of {game.rounds.length}
        </span>
        <span className="dt-score">
          {'★'.repeat(game.score)}
          <i>{'☆'.repeat(game.rounds.length - game.score)}</i>
        </span>
      </div>
      <div className="dt-body">
        <pre className="dt-code">{game.code == null ? '…' : game.code || '(empty file)'}</pre>
        <div className="dt-q">
          <b>What does this file do?</b>
          {round.opts.map((option) => (
            <button
              key={option}
              disabled={game.picked != null}
              className={`dt-opt ${game.picked != null && option === round.r ? 'ok' : ''} ${game.picked === option && option !== round.r ? 'no' : ''}`}
              onClick={() =>
                setGame({
                  ...game,
                  picked: option,
                  score: game.score + (option === round.r ? 1 : 0),
                })
              }
            >
              {option}
            </button>
          ))}
          {game.picked != null && (
            <div className="dt-reveal">
              <span>
                {right ? '✓ Right!' : '✗ Not quite.'} It’s <code>{round.p}</code>
              </span>
              <div>
                <button className="link" onClick={() => onOpen(round.p)}>
                  Open the file
                </button>
                <button
                  className="btn tiny"
                  onClick={() => {
                    const n = game.i + 1;
                    setGame({ ...game, i: n, picked: null, code: null });
                    if (n < game.rounds.length) load(game.rounds[n]);
                  }}
                >
                  {game.i + 1 < game.rounds.length ? 'Next file →' : 'See my score'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
