// Your map: everything there is to learn, as one treemap. Each area is a block sized by how much is in it; each skill
// is a tile that fills only with evidence (questions you asked, checks you got right, puzzles you solved).
import { useEffect, useRef, useState } from 'react';
import { REGIONS, SKILLS, isFading, skillsFor } from '../skills.js';
import { PUZZLES } from '../puzzles.js';
import { t, tx } from '../i18n.js';

const LEVEL = ['not yet', 'seen', 'getting it', 'know it'];

const KIND = {
  seen: ['📖', 'read'],
  asked: ['💬', 'asked'],
  practised: ['▶', 'tried'],
  proven: ['✓', 'proved'],
};

export default function SkillMap({
  readyFor,
  mastery,
  lessons,
  onAsk,
  onPuzzle,
  onOpenLesson,
  onReviewed,
  quick,
  model,
}) {
  const [sel, setSel] = useState(null);
  // tiles about 100px wide, whatever the window: columns follow each area's real width, not just how many skills it has
  // day one, nothing learned yet: point at where to begin instead of 43 grey tiles
  const fresh = SKILLS.every(([id]) => !mastery[id]?.level);
  const tmRef = useRef(null);
  const [tmW, setTmW] = useState(1100);
  useEffect(() => {
    const el = tmRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setTmW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [quiz, setQuiz] = useState(null); // { items, i, pick, score, skills, loading }
  const count = (lv) => SKILLS.filter(([id]) => (mastery[id]?.level || 0) === lv).length;
  const fading = SKILLS.filter(([id]) => isFading(mastery[id] || {})).map(([id]) => id);
  // questions from the quick checks in your own lessons first; your AI writes fresh ones when there aren't enough
  const fromLessons = (ids) => {
    const want = new Set(ids);
    const items = [];
    for (const lesson of lessons) {
      if (
        lesson.status !== 'done' ||
        !(lesson.concepts || []).some((c) => skillsFor(c).some((s) => want.has(s)))
      )
        continue;
      for (const b of lesson.story || [])
        if (b.t === 'quiz' && Array.isArray(b.choices) && b.choices.length > 1)
          items.push({ ...b, from: lesson.title, lid: lesson.id });
    }
    return items.sort(() => Math.random() - 0.5).slice(0, 4);
  };
  const startQuiz = async (ids) => {
    let items = fromLessons(ids);
    if (items.length < 3 && quick) {
      setQuiz({ items: [], skills: ids, loading: true });
      const names = ids
        .map((id) => SKILLS.find((s) => s[0] === id))
        .filter(Boolean)
        .map((s) => `${s[2]} (${s[4]})`)
        .join('; ');
      try {
        const raw = await quick(
          model,
          `Write ${3 - items.length + 1} short multiple-choice questions that check whether a learner really understands: ${names}. Make them about what code does or why, not definitions. 3 choices each, one right.\nReply JSON: {"questions":[{"q":"...","choices":["...","...","..."],"answer":0,"why":"one sentence"}]}`,
        );
        const j = JSON.parse(
          String(raw).slice(String(raw).indexOf('{'), String(raw).lastIndexOf('}') + 1),
        );
        const made = (j.questions || [])
          .filter(
            (x) =>
              Array.isArray(x.choices) &&
              x.choices.length >= 2 &&
              Number.isInteger(x.answer) &&
              x.answer < x.choices.length,
          )
          .map((x) => ({ ...x, from: t('a fresh question') }));
        items = [...items, ...made].slice(0, 4);
      } catch {}
    }
    setQuiz({ items, i: 0, pick: null, score: 0, skills: ids });
  };
  const skill = sel && SKILLS.find((s) => s[0] === sel);
  const mastered = sel && mastery[sel];
  const ready = sel ? readyFor?.(sel) : null; // a path lesson on this skill that opens instantly
  // in a narrow window the card sits below the map: bring it into view when a skill is picked
  const cardRef = useRef(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!sel || !el) return;
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight - 80 || r.bottom < 0)
      el.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
  }, [sel]);
  // a chosen star brings its constellation close, so it stays big next to the card
  const puzzleFor =
    sel &&
    PUZZLES.find((p) =>
      (
        ({
          hash: ['hashmap', 'dict'],
          pointers: ['pointers'],
          window: ['pointers'],
          stack: ['stack'],
          binary: ['search'],
          heap: ['heap'],
          tree: ['tree', 'recursion'],
          graph: ['graph'],
          dp: ['dp'],
          backtrack: ['backtrack'],
          intervals: ['sorting'],
          design: ['cache'],
        })[p.st] || []
      ).includes(sel),
    );
  const next =
    mastered &&
    (mastered.level === 0
      ? t('Open a lesson about it to begin.')
      : mastered.level === 1
        ? t('Ask a few questions about it, or take a quick quiz, to make it glow.')
        : mastered.level === 2
          ? t('Get two checks right, or solve a puzzle, to make it shine.')
          : isFading(mastered)
            ? t('It’s fading: a quick quiz brings it back.')
            : t('Shining. Come back in a week for a quick quiz.'));
  return (
    <div className="ideas skillmap">
      <div className="ideas-inner">
        <div className="hello">{t('Your map')}</div>
        <h1 className="home-h">{tx('Everything there is, and *what’s yours*.')}</h1>
        <div className="sm-stats">
          <span className="sm-pill">
            <i className="tl lv3" />
            {count(3)} {t('know it')}
          </span>
          <span className="sm-pill">
            <i className="tl lv2" />
            {count(2)} {t('getting it')}
          </span>
          <span className="sm-pill">
            <i className="tl lv1" />
            {count(1)} {t('seen')}
          </span>
          <span className="sm-pill">
            <i className="tl lv0" />
            {count(0)} {t('not yet')}
          </span>
          {fading.length > 0 && (
            <button className="btn" onClick={() => startQuiz(fading)}>
              ✦ {t('Quiz me on what’s fading')} ({fading.length})
            </button>
          )}
        </div>
        {quiz && (
          <Review
            quiz={quiz}
            setQuiz={setQuiz}
            onDone={(score, total) => onReviewed(quiz.skills, score, total)}
            onOpenLesson={onOpenLesson}
            onAsk={onAsk}
          />
        )}
        <div className={`tm-wrap ${skill ? 'open' : ''}`}>
          <div
            className="tm"
            ref={tmRef}
            role="group"
            aria-label={t('Your map: every skill as a tile, filled by how well you know it.')}
          >
            {[REGIONS.slice(0, 3), REGIONS.slice(3)].map((row, ri) => (
              <div
                key={ri}
                className="tm-row"
                style={{
                  flexGrow: row.reduce(
                    (n, region) => n + SKILLS.filter((x) => x[1] === region.id).length,
                    0,
                  ),
                }}
              >
                {row.map((region) => {
                  const mine = SKILLS.filter((x) => x[1] === region.id);
                  const lit = mine.filter(([id]) => (mastery[id]?.level || 0) >= 2).length;
                  const rowTotal = row.reduce(
                    (n, region) => n + SKILLS.filter((x) => x[1] === region.id).length,
                    0,
                  );
                  const areaW = ((tmW - 12 * (row.length - 1)) * mine.length) / rowTotal - 20;
                  let cols = Math.max(1, Math.min(4, Math.floor(areaW / 100)));
                  if (cols > 2 && mine.length % cols && mine.length % (cols - 1) === 0) cols--; // even rows look calmer
                  const tileW = areaW / cols - 24; // room for the name inside a tile
                  return (
                    <section
                      key={region.id}
                      className={`tm-area a-${region.id}`}
                      style={{ flexGrow: mine.length, '--c': region.color }}
                      aria-label={t(region.name)}
                    >
                      <div className="tm-h">
                        <b>{t(region.name)}</b>
                        <span>
                          {lit}/{mine.length}
                        </span>
                      </div>
                      <div
                        className="tm-grid"
                        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
                      >
                        {mine.map(([id, , name]) => {
                          const x = mastery[id] || { level: 0 };
                          const lv = x.level || 0;
                          const fad = isFading(x);
                          return (
                            <button
                              key={id}
                              className={`tm-cell lv${lv} ${sel === id ? 'sel' : ''} ${fad ? 'fading' : ''} ${fresh && id === 'program' && !skill ? 'start' : ''}`}
                              aria-pressed={sel === id}
                              onClick={() => setSel(sel === id ? null : id)}
                              title={`${t(name)}: ${t(LEVEL[lv])}${fad ? ` · ${t('fading')}` : ''}`}
                            >
                              {fresh && id === 'program' && !skill && (
                                <span className="tm-start">{t('start here')}</span>
                              )}
                              <span
                                className={`tm-n ${
                                  Math.max(
                                    ...t(name)
                                      .split(/\s+/)
                                      .map((w) => w.length),
                                  ) *
                                    7.2 >
                                  tileW
                                    ? 'tight'
                                    : ''
                                }`}
                              >
                                {t(name)}
                              </span>
                              <span className="tm-l">
                                {lv === 3 ? '✓' : lv === 2 ? '◐' : lv === 1 ? '○' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
          {skill && (
            <aside
              ref={cardRef}
              className="tm-card fade-in"
              aria-label={t(skill[2])}
              style={{ '--c': REGIONS.find((r) => r.id === skill[1]).color }}
            >
              <button className="ib tm-x" aria-label={t('Close')} onClick={() => setSel(null)}>
                ✕
              </button>
              <div className="tc-region">{t(REGIONS.find((r) => r.id === skill[1]).name)}</div>
              <b className="tc-name">{t(skill[2])}</b>
              <p>{t(skill[4])}</p>
              <div className="tc-steps">
                {[1, 2, 3].map((k) => (
                  <span key={k} className={(mastered.level || 0) >= k ? 'on' : ''}>
                    <i />
                    {t(LEVEL[k])}
                  </span>
                ))}
              </div>
              <div className="tc-next">{next}</div>
              {mastered.from.length > 0 && (
                <div className="tc-ev">
                  {mastered.from
                    .slice()
                    .sort(
                      (a, b) =>
                        ['proven', 'asked', 'practised', 'seen'].indexOf(a.kind) -
                        ['proven', 'asked', 'practised', 'seen'].indexOf(b.kind),
                    )
                    .slice(0, 6)
                    .map((f) => (
                      <span key={f.kind + f.label} className={`ev ev-${f.kind}`}>
                        <i>{KIND[f.kind][0]}</i>
                        {f.label}
                      </span>
                    ))}
                </div>
              )}
              <div className="tc-acts">
                <button className="btn" onClick={() => startQuiz([sel])}>
                  ✦ {t('Quiz me')}
                </button>
                {ready && (
                  <button
                    className="btn ghost"
                    onClick={ready.go}
                    title={`${t('Ready now, on the path')} “${t(ready.path)}”`}
                  >
                    {ready.icon} {t(ready.label)}
                  </button>
                )}
                <button
                  className="btn ghost"
                  onClick={() => onAsk(`Teach me ${skill[2].toLowerCase()} with a small example`)}
                >
                  {t('Teach me')}
                </button>
                {puzzleFor && (
                  <button className="btn ghost" onClick={() => onPuzzle(puzzleFor)}>
                    🧩 {puzzleFor.title}
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function Review({ quiz, setQuiz, onDone, onOpenLesson, onAsk }) {
  if (quiz.loading)
    return (
      <div className="sm-review fade-in">
        <div className="writing">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          {t('Writing a few questions for you…')}
        </div>
      </div>
    );
  if (!quiz.items.length)
    return (
      <div className="sm-review fade-in">
        <b>{t('No questions this time.')}</b>
        <p>{t('Ask for a fresh lesson instead:')}</p>
        <div className="sm-acts">
          {quiz.skills.slice(0, 3).map((id) => {
            const s = SKILLS.find((x) => x[0] === id);
            return (
              <button
                key={id}
                className="btn ghost"
                onClick={() => onAsk(`Teach me ${s[2].toLowerCase()} again, with a new example`)}
              >
                {s[2]}
              </button>
            );
          })}
          <button className="link" onClick={() => setQuiz(null)}>
            {t('Close')}
          </button>
        </div>
      </div>
    );
  const q = quiz.items[quiz.i];
  if (!q)
    return (
      <div className="sm-review fade-in done">
        <b>
          {quiz.score} / {quiz.items.length}
        </b>
        <p>
          {quiz.score === quiz.items.length
            ? t('All right. Those stars just got brighter.')
            : quiz.score
              ? t('Nice. The ones you missed are worth another look.')
              : t('Not yet. A lesson will help, then try again.')}
        </p>
        <button
          className="btn"
          onClick={() => {
            onDone(quiz.score, quiz.items.length);
            setQuiz(null);
          }}
        >
          {t('Done')}
        </button>
      </div>
    );
  const ok = quiz.pick === q.answer;
  return (
    <div className="sm-review fade-in">
      <div className="sm-qbar">
        {quiz.items.map((_, k) => (
          <i key={k} className={k < quiz.i ? 'done' : k === quiz.i ? 'now' : ''} />
        ))}
        <span>
          {quiz.i + 1} / {quiz.items.length} · {q.from}
        </span>
      </div>
      <div className="sm-q">{q.q}</div>
      <div className="sm-choices">
        {q.choices.map((c, k) => (
          <button
            key={k}
            disabled={quiz.pick != null}
            className={
              quiz.pick != null ? (k === q.answer ? 'ok' : k === quiz.pick ? 'no' : '') : ''
            }
            onClick={() =>
              setQuiz({ ...quiz, pick: k, score: quiz.score + (k === q.answer ? 1 : 0) })
            }
          >
            {c}
          </button>
        ))}
      </div>
      {quiz.pick != null && (
        <div className={`sm-why ${ok ? 'ok' : ''}`}>
          <b>{ok ? t('Yes!') : t('Not quite.')}</b> {q.why}{' '}
          {q.lid && (
            <button className="link" onClick={() => onOpenLesson(q.lid)}>
              {t('open the lesson')}
            </button>
          )}
          <button
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => setQuiz({ ...quiz, i: quiz.i + 1, pick: null })}
          >
            {t('Next')} →
          </button>
        </div>
      )}
    </div>
  );
}
