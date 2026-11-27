// What a run of the code did: what it printed and drew, the guess you made before running it, help when you keep
// hitting the same error, and the line where a program that called input() waits for your answer.
import { useState, useEffect } from 'react';
import { explainLocal } from '../../errors.js';
import { K } from '../../platform.js';
import { Visuals } from '../Viz.jsx';

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

export function Predict({ pred, setPred, run, onWhyDiff }) {
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
  const guessed = pred.guess.trim().split('\n').map(norm).filter(Boolean);
  const actual = out.split('\n').map(norm).filter(Boolean);
  const hits = guessed.filter((x, i) => actual[i] === x).length;
  const verdict = result.error
    ? 'crash'
    : !actual.length
      ? 'quiet'
      : hits === Math.max(guessed.length, actual.length)
        ? 'exact'
        : hits > 0 || (guessed.length && actual.some((x) => guessed.includes(x)))
          ? 'close'
          : 'miss';
  const msg = {
    exact: ['🎯', 'Spot on!', 'You read the code exactly like the computer did.'],
    close: ['👀', 'Close!', `You got ${hits} of ${actual.length} lines right.`],
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
      {actual.length > 0 && (
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
                  <span key={i} className={guessed[i] === norm(x) ? 'ln ok' : 'ln no'}>
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

export function Output({
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
          {logs.map((log, i) =>
            log.k === 'in' ? (
              <div key={i} className="log in">
                {log.p}
                <b>{log.s}</b>
              </div>
            ) : (
              <div key={i} className={`log ${log.k}`}>
                {log.s || ' '}
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
  const [answer, setAnswer] = useState('');
  return (
    <form
      className="log in asking"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer(answer);
        setAnswer('');
      }}
    >
      <span>{prompt}</span>
      <input
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        aria-label={prompt || 'your answer'}
        placeholder="type here…"
      />
    </form>
  );
}
