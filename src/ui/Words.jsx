// Every technical word a lesson introduced, collected in one place. Review them like flashcards.
// Spaced repetition, the simple way: "got it" doubles the gap before a word comes back, "again" resets it.
import { tap } from '../platform.js';
import { useMemo, useState } from 'react';
import { t, tx } from '../i18n.js';

const DAY = 864e5;
const due = (w) => !w.next || w.next <= Date.now();

// A first handful of words everyone meets, so the page isn't empty on day one
const STARTER = [
  [
    'variable',
    'a named box that holds a value your program can change',
    'a labelled jar on a shelf',
  ],
  [
    'function',
    'a named set of steps you can run again and again, with different inputs',
    'a recipe card',
  ],
  [
    'loop',
    'code that repeats steps, once for each item or until something is true',
    'stirring until the sauce thickens',
  ],
  ['list', 'an ordered row of values you can reach by position', 'a numbered shopping list'],
  ['bug', 'a mistake in code that makes it do something you didn’t mean', 'a typo in a recipe'],
  ['algorithm', 'a precise, step-by-step way to solve a problem', 'directions to a friend’s house'],
  ['API', 'a menu of things one program lets other programs ask it to do', 'a restaurant menu'],
  [
    'Big-O',
    'how much more work code does as its input grows',
    'how much longer a queue takes as it gets longer',
  ],
];

export default function Words({ words, onOpen, onAsk, onGrade, onAdd }) {
  const [openW, setOpenW] = useState(null); // definitions open on hover or click: the picture (analogy) comes first
  const [q, setQ] = useState('');
  const [review, setReview] = useState(null); // { order, i, flipped }
  const list = useMemo(
    () => Object.values(words).sort((a, b) => a.term.localeCompare(b.term)),
    [words],
  );
  const shown = list.filter(
    (w) => !q || `${w.term} ${w.plain}`.toLowerCase().includes(q.toLowerCase()),
  );
  const dueList = list.filter(due);
  const start = () =>
    setReview({
      order: [...(dueList.length ? dueList : list)].sort(() => Math.random() - 0.5),
      i: 0,
      flipped: false,
    });
  const grade = (ok) => {
    const w = review.order[review.i];
    const gap = ok ? Math.max(1, (w.gap || 0.5) * 2) : 0;
    onGrade?.(w.term, {
      gap,
      next: Date.now() + gap * DAY,
      seen: (w.seen || 0) + 1,
      ok: (w.ok || 0) + (ok ? 1 : 0),
    });
    setReview(
      review.i < review.order.length - 1 ? { ...review, i: review.i + 1, flipped: false } : null,
    );
  };
  const cur = review?.order[review.i];
  return (
    <div className="explore">
      <div className="ex-inner">
        <div className="hello">{t('Your words')}</div>
        <h1 className="home-h">{tx('The language of code, *yours* now.')}</h1>
        <p className="ex-sub long">
          {tap(
            t(
              'Every new word from your lessons, with an everyday comparison. Point at a word for its real definition.',
            ),
          )}
        </p>
        <p className="ex-sub short">
          {t('Every new word from your lessons. Tap one for what it really means.')}
        </p>
        {list.length === 0 ? (
          <div className="words-empty">
            <p>Words from your lessons collect here. Start with eight everyone meets:</p>
            <div className="words starter">
              {STARTER.map(([term, plain, like]) => (
                <div key={term} className="word has-like" title={plain}>
                  <div className="w-term">{term}</div>
                  <div className="w-like">≈ {like}</div>
                  <div className="w-foot">
                    <button
                      className="link"
                      style={{ marginLeft: 0 }}
                      onClick={() => onAdd?.({ term, plain, like, title: 'Starter words' })}
                    >
                      + keep it
                    </button>
                    <button className="link" onClick={() => onAsk(term)}>
                      show me →
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {onAdd && (
              <button
                className="btn"
                onClick={() =>
                  STARTER.forEach(([term, plain, like]) =>
                    onAdd({ term, plain, like, title: 'Starter words' }),
                  )
                }
              >
                Keep all eight
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="words-bar">
              <input
                className="fl-q"
                placeholder={`Search ${list.length} words…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="btn" onClick={start}>
                {dueList.length ? `Review ${dueList.length} due` : 'Review all as flashcards'}
              </button>
              {list.length > dueList.length && (
                <span className="muted small">
                  {list.length - dueList.length} resting until later
                </span>
              )}
              <button
                className="btn ghost"
                style={{ marginLeft: 'auto' }}
                title="A tab-separated file that Anki, Quizlet and most flashcard apps can import"
                onClick={() => {
                  const tsv = list
                    .map((w) =>
                      [w.term, `${w.plain}${w.like ? ` (${w.like})` : ''}`]
                        .map((x) => String(x).replace(/[\t\n]+/g, ' '))
                        .join('\t'),
                    )
                    .join('\n');
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(
                    new Blob([tsv], { type: 'text/tab-separated-values' }),
                  );
                  link.download = 'bento-words.txt';
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
                }}
              >
                Export for Anki
              </button>
            </div>
            {review && cur && (
              <div
                className="flash-wrap"
                onClick={() => setReview({ ...review, flipped: !review.flipped })}
              >
                <div className={`flash ${review.flipped ? 'flipped' : ''}`}>
                  <div className="flash-f">
                    <span className="mini-h">
                      {review.i + 1} of {review.order.length} · what does it mean?
                    </span>
                    <b>{cur.term}</b>
                    <span className="muted small">click to flip</span>
                  </div>
                  <div className="flash-b">
                    <b>{cur.term}</b>
                    <p>{cur.plain}</p>
                    {cur.like && <i>≈ {cur.like}</i>}
                  </div>
                </div>
                <div className="flash-ctl" onClick={(e) => e.stopPropagation()}>
                  {review.flipped ? (
                    <>
                      <button className="chip again" onClick={() => grade(false)}>
                        ↺ Again soon
                      </button>
                      <button className="chip gotit" onClick={() => grade(true)}>
                        ✓ Got it
                      </button>
                    </>
                  ) : (
                    <button
                      className="chip"
                      onClick={() => setReview({ ...review, flipped: true })}
                    >
                      Show the answer
                    </button>
                  )}
                  <button className="chip" onClick={() => setReview(null)}>
                    close
                  </button>
                </div>
              </div>
            )}
            <div className="words">
              {shown.map((w) => (
                <div
                  key={w.term}
                  className={`word ${w.like ? 'has-like' : ''} ${openW === w.term ? 'open' : ''}`}
                  onClick={(e) => {
                    if (!e.target.closest('button')) setOpenW(openW === w.term ? null : w.term);
                  }}
                >
                  <div className="w-term">
                    {w.term}
                    {w.seen ? (
                      <span
                        className={`w-str s${Math.min(3, w.ok || 0)}`}
                        title={`reviewed ${w.seen}×`}
                      >
                        {'●'.repeat(Math.min(3, w.ok || 0))}
                        {'○'.repeat(3 - Math.min(3, w.ok || 0))}
                      </span>
                    ) : null}
                  </div>
                  {w.like && <div className="w-like">≈ {w.like}</div>}
                  <div className="w-plain">{w.plain}</div>
                  <div className="w-foot">
                    <button
                      className="link"
                      style={{ marginLeft: 0 }}
                      onClick={() => onOpen(w.from)}
                    >
                      from “{String(w.title || 'a lesson').slice(0, 40)}”
                    </button>
                    <button className="link" onClick={() => onAsk(w.term)}>
                      show me →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
