import { IDEAS } from '../ideas.js';
import { haptic } from './touch.js';
import PathBar from './PathBar.jsx';
import { t } from '../i18n.js';
import { lessonHtml } from '../exportHtml.js';
import { Fragment, useEffect, useRef, useState } from 'react';
import BigPicture from './BigPicture.jsx';
import { Visuals } from './Viz.jsx';
import Editor from './Editor.jsx';
import { modelLabel } from './Side.jsx';
import { slowLabel } from '../ai.js';
import { announce } from './a11y.js';
import { K, keys, mod } from '../platform.js';
const EMPTY = new Map();

const RX = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[\d+(?:-\d+)?\|[^\]]+\]\])/g;
export function Md({ text, onLink, onLinkClick, onTerm }) {
  const parts = String(text || '').split(RX);
  return parts.map((s, i) => {
    if (!s) return null;
    if (s.startsWith('**')) return <b key={i}>{s.slice(2, -2)}</b>;
    if (s.startsWith('[[')) {
      const m = /^\[\[(\d+)(?:-(\d+))?\|([^\]]+)\]\]$/.exec(s);
      const r = [+m[1], +(m[2] || m[1])];
      const label = m[3].replace(/`/g, '');
      const named = (label.match(/\d+/g) || []).map(Number);
      const says = named.includes(r[0]) && named.includes(r[1]);
      return (
        <span
          key={i}
          className="lnk"
          onMouseEnter={() => onLink?.(r)}
          onMouseLeave={() => onLink?.(null)}
          onClick={() => onLinkClick?.(r)}
        >
          {label}
          {!says && <sup>{r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`}</sup>}
        </span>
      );
    }
    if (s.startsWith('`')) {
      const w = s.slice(1, -1);
      return (
        <code key={i} className="term" onClick={(e) => onTerm?.(w, e.currentTarget)}>
          {w}
        </code>
      );
    }
    if (s.startsWith('*') && s.endsWith('*') && s.length > 2)
      return <i key={i}>{s.slice(1, -1)}</i>;
    return <span key={i}>{s}</span>;
  });
}

function Quiz({ b, onAnswer }) {
  const [pick, setPick] = useState(null);
  const ok = pick === b.answer;
  return (
    <div className="quiz">
      <div className="quiz-q">
        <span className="quiz-k">quick check</span>
        {b.q}
      </div>
      <div className="quiz-choices">
        {(b.choices || []).map((c, i) => (
          <button
            key={i}
            disabled={pick != null}
            className={`choice ${pick != null && i === b.answer ? 'right' : ''} ${pick === i && !ok ? 'wrong' : ''}`}
            onClick={() => {
              setPick(i);
              haptic(i === b.answer ? 'success' : 'warn');
              onAnswer?.(i === b.answer);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {pick != null && (
        <div className={`quiz-why ${ok ? 'ok' : ''}`}>
          <b>{ok ? 'Yes!' : 'Not quite.'}</b> {b.why}
          {!ok && (
            <button className="link" onClick={() => setPick(null)}>
              try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// "Check yourself": one optional question after an answer. Getting it right lights your map; it's never required.
function QuickCheck({ c, onDone }) {
  const [pick, setPick] = useState(null);
  const ok = pick === c.answer;
  return (
    <div className={`qcheck ${pick == null ? '' : ok ? 'ok' : 'no'}`}>
      <div className="qc-h">
        <span>{t('Check yourself')}</span>
        {pick == null && <i>{t('optional')}</i>}
      </div>
      <div className="qc-q">{c.q}</div>
      <div className="qc-row">
        {c.choices.map((x, k) => (
          <button
            key={k}
            disabled={pick != null}
            className={pick == null ? '' : k === c.answer ? 'right' : k === pick ? 'wrong' : ''}
            onClick={() => {
              setPick(k);
              haptic(k === c.answer ? 'success' : 'warn');
              onDone?.(k === c.answer);
            }}
          >
            {x}
          </button>
        ))}
      </div>
      {pick != null && (
        <div className="qc-why">
          {ok ? '✓ ' : ''}
          {c.why}
        </div>
      )}
    </div>
  );
}
export default function Story(p) {
  const { lesson: L, streaming } = p;
  const scroller = useRef(null);
  const [hints, setHints] = useState(0);
  useEffect(() => {
    setHints(0);
    scroller.current?.scrollTo({ top: 0 });
  }, [L.id]);
  // you asked something: bring the new question (and the answer arriving under it) into view
  // (once when you ask, and again when the answer lands and the page has grown to fit it)
  const chatN = (L.chat || []).length;
  const answered = chatN > 0 && !L.chat[chatN - 1]?.loading;
  const seenChat = useRef({ id: L.id, n: chatN, answered });
  useEffect(() => {
    const was = seenChat.current;
    seenChat.current = { id: L.id, n: chatN, answered };
    if (was.id !== L.id) return; // a different lesson
    const asked = chatN > was.n,
      landed = chatN === was.n && answered && !was.answered;
    if (!asked && !landed) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      const turns = scroller.current?.querySelectorAll('.qa');
      turns?.[turns.length - 1]?.scrollIntoView({
        behavior: calm ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, [chatN, answered, L.id]);
  // a lesson being written is announced once when it starts and once when it's ready, not word by word
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (streaming && !wasStreaming.current) announce(t('Writing your lesson…'));
    if (!streaming && wasStreaming.current && L.status === 'done')
      announce(`${t('Lesson ready')}: ${L.title || ''}`);
    wasStreaming.current = streaming;
  }, [streaming, L.status]);
  const md = (t) => <Md text={t} onLink={p.onLink} onLinkClick={p.onLinkClick} onTerm={p.onTerm} />;
  // where the code sits in article mode: under a heading about the code, else after the second paragraph
  const hIdx = L.story.findIndex(
    (b) => b.t === 'h' && /code|how it works|build/i.test(b.text || ''),
  );
  const codeAt =
    hIdx >= 0
      ? hIdx
      : (L.story.map((b, i) => (b.t === 'p' ? i : -1)).filter((i) => i >= 0)[1] ?? 0);
  const kind =
    L.mode === 'build'
      ? `build it${L.context?.inspired ? ` · inspired by ${L.context.inspired.split('/').pop()}` : ''}`
      : L.mode === 'compare'
        ? `compare · ${L.context?.a?.repo?.split('/').pop()} vs ${L.context?.b?.repo?.split('/').pop()}`
        : L.mode === 'idea'
          ? `clever idea · ${L.context?.company || ''}`
          : L.mode === 'feature'
            ? 'feature'
            : L.mode === 'challenge'
              ? L.puzzle
                ? L.kicker
                : 'challenge'
              : L.context?.repo
                ? `inside ${L.context.repo.split('/').pop()}`
                : L.mode === 'code'
                  ? 'your code'
                  : L.kicker;

  return (
    <article
      className="story"
      ref={scroller}
      aria-label={t('Lesson')}
      aria-busy={streaming || undefined}
    >
      <div className="story-inner">
        {L.context?.repoKey && p.onBackToRepo && (
          <button className="back-repo" onClick={() => p.onBackToRepo(L.context.repoKey)}>
            ← {L.context.repo}
          </button>
        )}
        <div className="ask-echo">
          {L.q && L.mode !== 'challenge' ? (
            <>
              <span className="ask-q">“{L.q.length > 140 ? L.q.slice(0, 140) + '…' : L.q}”</span>
            </>
          ) : null}
        </div>
        <PathBar info={p.pathInfo} onPage={p.onPathPage} onStop={p.onPathStop} />
        {p.reopened && (
          <div className="reopened fade-in" role="status">
            ♻ {t('You asked this before, so here’s your earlier lesson (no AI used).')}
            <button className="link" onClick={p.reopened}>
              {t('Write a fresh one')} →
            </button>
          </div>
        )}
        {L.title ? (
          <header className="story-head">
            {kind && <div className="kicker">{kind}</div>}
            <h1>{L.title}</h1>
            {!streaming && L.story.length > 0 && (
              <div className="lesson-acts">
                <Listen L={L} />
                <CopyNotes L={L} />
                {p.onArticle && L.code && L.lang !== 'html' && !L.steps?.length && (
                  <button
                    className={`listen ${p.article ? 'on' : ''}`}
                    onClick={p.onArticle}
                    title="Read it as one column, with the code and its pictures inline"
                  >
                    {p.article ? '◧ ' + t('Side by side') : '▤ ' + t('Read as article')}
                  </button>
                )}
                {window.bento?.exportLesson && <ShareBtn L={L} />}
                {window.bento?.saveWeb && <WebPageBtn L={L} />}
              </div>
            )}
            {L.mode === 'idea' && L.context?.link && (
              <div className="idea-srcs">
                <button className="idea-src" onClick={() => p.onOpenUrl?.(L.context.link)}>
                  {L.context.repo ? (
                    <>
                      Real code: <b>{L.context.repo}</b> ↗
                    </>
                  ) : (
                    <>Read the original ↗</>
                  )}
                </button>
                {L.context.repo &&
                  p.onOpenRepo &&
                  (() => {
                    const file =
                      L.context.file || IDEAS.find((x) => x.id === L.context.ideaId)?.file;
                    return (
                      <button
                        className="idea-src strong"
                        title={file ? `Opens ${file} inside ${L.context.repo}` : undefined}
                        onClick={() =>
                          file && p.onOpenAt
                            ? p.onOpenAt(L.context.repo, file)
                            : p.onOpenRepo(L.context.repo)
                        }
                      >
                        ◈{' '}
                        {file ? (
                          <>
                            See the real code: <b>{file.split('/').pop()}</b>
                          </>
                        ) : (
                          'Take it apart in Bento'
                        )}
                      </button>
                    );
                  })()}
              </div>
            )}
            <div className="meta">
              <span className={`lang-dot ${L.lang}`} />
              {L.lang === 'python'
                ? 'Python'
                : L.lang === 'typescript'
                  ? 'TypeScript'
                  : L.lang === 'html'
                    ? 'Web page'
                    : 'JavaScript'}
              {L.concepts?.length > 0 && <span className="sep">·</span>}
              {L.concepts?.map((c) => (
                <span key={c} className="concept" onClick={() => p.onConcept?.(c)}>
                  {c.replace(/-/g, ' ')}
                </span>
              ))}
              {L.check && <Checked c={L.check} />}
            </div>
          </header>
        ) : streaming ? (
          <header className="story-head">
            <h1 className="sr-only">{L.q || t('A new lesson')}</h1>
            <div className="shimmer h1" aria-hidden="true" />
          </header>
        ) : null}

        {!p.article && !L.puzzle && <HeroPicture L={L} run={p.run} />}
        {L.story.filter((b) => b.t === 'h').length >= 3 && (
          <nav className="toc" aria-label={t('In this lesson')}>
            {L.story
              .filter((b) => b.t === 'h')
              .map((b, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const headings = scroller.current?.querySelectorAll('.story-h');
                    headings?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <i>{i + 1}</i>
                  {b.text}
                </button>
              ))}
          </nav>
        )}
        {L.story.map((b, i) => {
          if (b.t === 'p')
            return (
              <Fragment key={i}>
                <p className="para fade-in">{md(b.md)}</p>
                {p.article && i === codeAt && <ArticleCode L={L} run={p.run} />}
                {i === 0 && p.puzzleTop}
              </Fragment>
            );
          if (b.t === 'h')
            return (
              <Fragment key={i}>
                <h2 className="story-h fade-in">{b.text}</h2>
                {p.article && i === codeAt && <ArticleCode L={L} run={p.run} />}
              </Fragment>
            );
          if (b.t === 'diagram')
            return (
              <div key={i} className="story-diagram fade-in">
                <BigPicture
                  flow={b}
                  terms={L.terms || []}
                  tools={[]}
                  pathIdx={EMPTY}
                  onOpen={() => {}}
                  onAsk={(q) => p.onFollowUp?.(q)}
                  narrating={false}
                  role={() => ''}
                />
              </div>
            );
          if (b.t === 'term')
            return (
              <Term
                key={i}
                b={b}
                known={p.knownWords?.[String(b.term).toLowerCase()]}
                lessonId={L.id}
              />
            );
          if (b.t === 'step') {
            const s = L.steps[b.i];
            const on = p.stepSel === b.i;
            return (
              <div
                key={i}
                className={`recipe-step fade-in ${on ? 'on' : ''}`}
                onClick={() => p.onStepSelect(b.i)}
              >
                <div className="rs-num">{b.i + 1}</div>
                <div className="rs-body">
                  <div className="rs-title">
                    {s.title}
                    {s.file && <span className="rs-file">{s.file}</span>}
                  </div>
                  <div className="rs-md">{md(s.md)}</div>
                </div>
              </div>
            );
          }
          if (b.t === 'quiz') return <Quiz key={i} b={b} onAnswer={p.onQuiz} />;
          if (b.t === 'try' || b.t === 'next') return null; // gathered into the “what next” card below
          return null;
        })}

        {!streaming && L.status === 'done' && <NextCard L={L} p={p} />}
        {!streaming && L.status === 'done' && L.puzzle && p.onTeachBack && (
          <TeachBack L={L} onTeachBack={p.onTeachBack} />
        )}
        {L.hints?.length > 0 && (
          <div className="hints fade-in">
            <div className="mini-h">{t('stuck?')}</div>
            {L.hints.slice(0, hints).map((h, i) => (
              <div key={i} className="hint">
                <span>{i + 1}</span>
                <div>{md(h)}</div>
              </div>
            ))}
            {hints < L.hints.length && (
              <button className="try" onClick={() => setHints(hints + 1)}>
                <span className="try-i">?</span>
                {hints ? 'Another hint' : 'Show a hint'} <em>{L.hints.length - hints} left</em>
              </button>
            )}
          </div>
        )}

        {p.puzzleEnd}
        {(L.chat || []).length > 0 && (
          <div className="chat">
            {L.chat.map((c, i) => (
              <div key={i} className="qa fade-in">
                <div className="qa-q">{c.q}</div>
                <div className="qa-a">
                  {c.loading ? (
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <>
                      {c.second && c.by && <span className="qa-who">{modelLabel(c.by)}</span>}
                      <Md
                        text={c.a}
                        onLink={p.onLink}
                        onLinkClick={p.onLinkClick}
                        onTerm={p.onTerm}
                      />
                      {c.term && c.plain && (
                        <span className="qa-term">
                          <b>{c.term}</b> {c.plain}
                        </span>
                      )}
                      {c.check && <QuickCheck c={c.check} onDone={p.onCheck} />}
                      <div className="qa-acts">
                        <button
                          className="qa-chip"
                          onClick={() => p.onQuickAsk?.(`Explain that more simply: ${c.q}`)}
                        >
                          {t('Simpler')}
                        </button>
                        <button
                          className="qa-chip"
                          onClick={() =>
                            p.onQuickAsk?.(
                              `Show me a tiny example of that, using this lesson's code: ${c.q}`,
                            )
                          }
                        >
                          {t('Show an example')}
                        </button>
                        <button className="qa-chip" onClick={() => p.onFollowUp(c.q)}>
                          ✦ {t('Make it a lesson')}
                        </button>
                        {p.altFor?.(c) && !c.second && (
                          <button className="qa-chip alt" onClick={() => p.onSecondOpinion?.(i)}>
                            {t('Ask')} {p.altFor(c)}
                          </button>
                        )}
                      </div>
                      {c.next?.length > 0 && i === L.chat.length - 1 && (
                        <div className="qa-next" aria-label={t('Ask next')}>
                          {c.next.map((x) => (
                            <button key={x} onClick={() => p.onQuickAsk?.(x)}>
                              {x}
                              <span aria-hidden="true">↵</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {c.second && (
                        <div className={`qa-second ${c.second.loading ? 'loading' : ''}`}>
                          <span className="qa-who">{c.second.who}</span>
                          {c.second.loading ? (
                            <span className="dots">
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : (
                            <Md
                              text={c.second.a}
                              onLink={p.onLink}
                              onLinkClick={p.onLinkClick}
                              onTerm={p.onTerm}
                            />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {streaming && (
          <div className="writing">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            {L.story.length || L.code
              ? `${p.modelLabel} is writing`
              : `${p.modelLabel} is planning how to explain it`}
            {slowLabel(p.modelLabel) ? ' (Codex sends the whole lesson at once)' : ''}
            {p.onStop && (
              <button className="stop-btn" onClick={p.onStop}>
                Stop
              </button>
            )}
          </div>
        )}
        {streaming && !L.story.length && !L.code && (
          <Thought
            text={L.thinking || ''}
            mode={L.mode}
            since={L.createdAt}
            slow={slowLabel(p.modelLabel)}
          />
        )}
        {streaming && !L.story.length && (
          <div className="skel">
            {[92, 100, 74, 0, 96, 88, 60].map((w, i) =>
              w ? (
                <div
                  key={i}
                  className="shimmer"
                  style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
                />
              ) : (
                <div key={i} style={{ height: 14 }} />
              ),
            )}
          </div>
        )}
        {L.routed && (
          <div className="routed">
            ↪ {L.routed.from} {L.routed.why}, so <b>{L.routed.to}</b> wrote this lesson instead.
          </div>
        )}
        {L.status === 'error' && (
          <div className="story-err">
            <b>That didn't work.</b> {L.error}
            <div>
              <button className="btn tiny" onClick={p.onRetry}>
                Try again
              </button>
              {p.altModel && (
                <button
                  className="btn tiny ghost"
                  style={{ marginLeft: 6 }}
                  onClick={p.onRetryWith}
                >
                  Try with {p.altModel}
                </button>
              )}
            </div>
          </div>
        )}
        <div style={{ height: 120 }} />
      </div>
      <div className="followup">
        <FollowUp
          onAsk={p.onQuickAsk || p.onFollowUp}
          onLesson={p.onFollowUp}
          placeholder={
            L.mode === 'challenge'
              ? 'Ask for a hint in your own words…'
              : 'Ask anything about this…'
          }
        />
      </div>
    </article>
  );
}

// A faint ticker of the tutor's planning, so a quiet wait still feels alive.
const STAGES = {
  idea: [
    'Reading the facts it must stick to',
    'Picturing the real problem',
    'Finding an everyday analogy',
    'Designing code that shows the obvious way and the clever way',
    'Checking the code would really run',
    'Deciding what you should notice',
  ],
  default: [
    'Reading your question',
    'Picking the right example',
    'Finding an everyday analogy',
    'Writing code you can run',
    'Deciding what to point at in the code',
    'Thinking of a good quick check',
  ],
};
const stageIcon = (x) =>
  /question|facts/i.test(x)
    ? '👀'
    : /example|picturing|problem/i.test(x)
      ? '🎯'
      : /analogy/i.test(x)
        ? '☕️'
        : /point|notice|decid/i.test(x)
          ? '👉'
          : /check/i.test(x)
            ? '🧩'
            : /code|design/i.test(x)
              ? '⌨️'
              : '•';
const EXPECT = { idea: 55, compare: 30, build: 30, code: 12, feature: 30, challenge: 15 }; // typical seconds of planning
export function Thought({ text, mode, since, slow }) {
  const th = typeof text === 'string' ? { text, n: 0 } : text || {}; // not `t`: that's the translator
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, []);
  const secs = (Date.now() - (since || Date.now())) / 1000;
  const exp = (EXPECT[mode] || 14) * (slow ? 2.2 : 1);
  const words = String(th.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length > 30) {
    const last = words
      .split(/(?<=[.!?])\s/)
      .filter((x) => x.length > 12)
      .slice(-2)
      .join(' ')
      .slice(-170);
    return (
      <div className="thought" key={last.slice(0, 20)}>
        “{last}”
      </div>
    );
  }
  const st = STAGES[mode] || STAGES.default;
  const frac = 1 - Math.exp(-secs / exp); // eases toward the end, never claims to be done
  const i = Math.min(st.length - 1, Math.floor(frac * st.length));
  // a picture of the plan: one small mark per stage, ticked as it passes, and only the current stage in words
  return (
    <div className="wr" role="status" aria-label={`${t(st[i])}…`}>
      <div className="wr-track" aria-hidden="true">
        <i
          className="wr-fill"
          style={{
            width: `calc(${(i / (st.length - 1)) * 100}% - ${(i / (st.length - 1)) * 30}px)`,
          }}
        />
        {st.map((x, k) => (
          <span key={k} className={`wr-node ${k < i ? 'done' : k === i ? 'now' : ''}`} title={t(x)}>
            {k < i ? '✓' : stageIcon(x)}
          </span>
        ))}
      </div>
      <div className="wr-now" key={i}>
        {t(st[i])}…
      </div>
    </div>
  );
}

// "Find this in real code": the same idea, in projects people actually use
// Teach it back: the learner explains the idea in their own words; the tutor says what landed and what's missing.
function TeachBack({ L, onTeachBack }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const R = L.teach;
  const go = async () => {
    if (text.trim().length < 12 || busy) return;
    setBusy(true);
    try {
      await onTeachBack(L, text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="teach fade-in">
      {L.puzzle ? (
        <div className="teach-h">
          <span className="teach-i">🎤</span>
          <div>
            <b>{t('Talk me through it')}</b>
            <span>
              Like in a real interview: explain your approach and how fast it is. Your AI plays the
              interviewer.
            </span>
          </div>
        </div>
      ) : (
        <div className="teach-h">
          <span className="teach-i">🗣</span>
          <div>
            <b>{t('Explain it back')}</b>
            <span>
              The fastest way to know you understand: say it in your own words, like you’re telling
              a friend.
            </span>
          </div>
        </div>
      )}
      {R && !busy && (
        <div className="teach-r">
          <div className="teach-meter">
            {[0, 1, 2].map((k) => (
              <i key={k} className={k < R.score ? 'on' : ''} />
            ))}
            <em>{['Not yet', 'Getting there', 'Nearly there', 'You’ve got it'][R.score] || ''}</em>
          </div>
          <blockquote>“{R.said}”</blockquote>
          {R.got?.length > 0 && (
            <div className="teach-row ok">
              <b>✓ You got</b>
              {R.got.map((x, i) => (
                <span key={i}>
                  <Md text={x} />
                </span>
              ))}
            </div>
          )}
          {R.missing?.length > 0 && (
            <div className="teach-row miss">
              <b>+ Add</b>
              {R.missing.map((x, i) => (
                <span key={i}>
                  <Md text={x} />
                </span>
              ))}
            </div>
          )}
          {R.next && (
            <div className="teach-row tnext">
              <b>→ Try this</b>
              <span>
                <Md text={R.next} />
              </span>
            </div>
          )}
        </div>
      )}
      <div className="teach-box">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={
            R
              ? 'Try again with what you just learned…'
              : L.puzzle
                ? 'My idea is… It works because… It takes O(…) time because…'
                : `In my own words, ${(L.title || 'this')
                    .replace(/[.?!]$/, '')
                    .toLowerCase()
                    .slice(0, 60)} is…`
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go();
          }}
        />
        <button className="btn" disabled={busy || text.trim().length < 12} onClick={go}>
          {busy ? t('Reading…') : t('Check me')}
        </button>
      </div>
    </div>
  );
}

// The lesson's picture first: the first thing its code draws, above the words
function HeroPicture({ L, run }) {
  if (L.lang === 'html' || !run?.r?.visuals?.length) return null;
  const v = run.r.visuals.find((x) => x.type !== 'text' && x.type !== 'web');
  if (!v) return null;
  return (
    <div className="hero-pic fade-in">
      <Visuals list={[v]} />
    </div>
  );
}

// Everything that comes after a lesson, in one place: play with it, go further, prove it
function NextCard({ L, p }) {
  const tries = L.story.filter((b) => b.t === 'try').flatMap((b) => b.items || []);
  const nexts = L.story.filter((b) => b.t === 'next').flatMap((b) => b.items || []);
  const [open, setOpen] = useState(L.teach ? 'teach' : null);
  useEffect(() => setOpen(L.teach ? 'teach' : null), [L.id]);
  const depth = !L.scratch && L.mode !== 'challenge' && p.onDepth;
  const practice =
    p.onPractice &&
    !L.scratch &&
    L.mode !== 'challenge' &&
    L.mode !== 'compare' &&
    L.lang !== 'html';
  const teach = p.onTeachBack && !L.scratch && L.mode !== 'challenge';
  const wild = p.onWild && (L.mode === 'explain' || L.race || L.mode === 'idea');
  const prove = practice || teach || wild;
  if (!tries.length && !nexts.length && !depth && !prove) return null;
  return (
    <>
      <section className="whatnext fade-in" aria-label={t('What next?')}>
        <header className="wn-top">
          <b>{t('What next?')}</b>
          {depth && (
            <span className="wn-depth" role="group" aria-label={t('Explain it again')}>
              <button
                onClick={() => p.onDepth('simpler')}
                title={t('The same idea, simpler, with an everyday example')}
              >
                ↓ {t('Simpler')}
              </button>
              <button
                onClick={() => p.onDepth('deeper')}
                title={t('What’s really happening underneath, and the trade-offs')}
              >
                ↑ {t('Deeper')}
              </button>
            </span>
          )}
        </header>
        {tries.length > 0 && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic play" aria-hidden="true">
                🧪
              </i>
              <span>
                <b>{t('Play with it')}</b>
                <em>{t('Bento changes the code and runs it')}</em>
              </span>
            </div>
            <div className="wn-list">
              {tries.map((x, j) => (
                <button key={j} className="wn-card" onClick={() => p.onTry(x)}>
                  <span className="wn-t">{x}</span>
                  <span className="wn-go play">▶ {t('try')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {nexts.length > 0 && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic next" aria-hidden="true">
                🔭
              </i>
              <span>
                <b>{t('Go further')}</b>
                <em>{t('Each one opens a new lesson')}</em>
              </span>
            </div>
            <div className="wn-list">
              {nexts.map((x, j) => (
                <button key={j} className="wn-card" onClick={() => p.onNext(x)}>
                  <span className="wn-t">{x}</span>
                  <span className="wn-go">+ {t('lesson')} →</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {prove && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic prove" aria-hidden="true">
                🎯
              </i>
              <span>
                <b>{t('Prove it')}</b>
                <em>{t('Lights up your map')}</em>
              </span>
            </div>
            <div className="wn-prove">
              {practice && (
                <button className="wn-big" onClick={() => p.onPractice(L)}>
                  <span className="wn-bi" aria-hidden="true">
                    🎯
                  </span>
                  <b>{t('Practice')}</b>
                  <em>{t('a short challenge on this')}</em>
                </button>
              )}
              {teach && (
                <button
                  className={`wn-big ${open === 'teach' ? 'on' : ''}`}
                  aria-expanded={open === 'teach'}
                  onClick={() => setOpen(open === 'teach' ? null : 'teach')}
                >
                  <span className="wn-bi" aria-hidden="true">
                    🗣
                  </span>
                  <b>{t('Explain it back')}</b>
                  <em>{t('in your own words')}</em>
                </button>
              )}
              {wild && (
                <button
                  className={`wn-big ${open === 'wild' ? 'on' : ''}`}
                  aria-expanded={open === 'wild'}
                  onClick={() => setOpen(open === 'wild' ? null : 'wild')}
                >
                  <span className="wn-bi" aria-hidden="true">
                    ◈
                  </span>
                  <b>{t('Real code')}</b>
                  <em>{t('find it in open source')}</em>
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      {open === 'teach' && teach && <TeachBack L={L} onTeachBack={p.onTeachBack} />}
      {open === 'wild' && wild && <Wild L={L} onWild={p.onWild} onOpenAt={p.onOpenAt} auto />}
    </>
  );
}

// "✓ Checked": the lesson was compared with what its code really did; corrections are listed, never hidden
function Checked({ c }) {
  const [open, setOpen] = useState(false);
  const n = (c.corrections || []).length + (c.local || []).length;
  return (
    <span className={`checked ${n ? 'fixed' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        title={
          c.by
            ? 'Bento ran the code and checked the quiz answers and claims against what it really printed'
            : 'Bento ran the code and checked the lesson’s links and quizzes'
        }
      >
        ✓ {t('Checked')}
        {n ? ` · ${n} ${n === 1 ? t('fix') : t('fixes')}` : ''}
      </button>
      {open && (
        <span className="checked-pop" role="dialog" aria-label={t('What Bento checked')}>
          <b>{t('What Bento checked')}</b>
          <span>✓ {t('The code runs without errors.')}</span>
          {c.by ? (
            <span>✓ {t('Quiz answers and claims compared with the real output.')}</span>
          ) : (
            <span className="muted">
              {t('Connect an AI to also check quiz answers against the output.')}
            </span>
          )}
          {(c.corrections || []).map((x, i) => (
            <span key={i} className="cp-fix">
              {x.kind === 'quiz' ? (
                <>
                  {t('Quiz answer corrected')}: <s>{x.was}</s> → <b>{x.now}</b>
                </>
              ) : (
                <>
                  {t('Corrected')}: <s>{x.was}</s> → {x.now}
                </>
              )}
            </span>
          ))}
          {(c.local || []).map((x, i) => (
            <span key={`l${i}`} className="cp-fix">
              {t('Tidied')}: {t(x)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

function Wild({ L, onWild, onOpenAt, auto }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    setSt(null);
    if (auto) go();
  }, [L.id]);
  const go = async () => {
    setSt({ loading: true });
    try {
      setSt({ rows: await onWild(L) });
    } catch (e) {
      setSt({
        err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      });
    }
  };
  return (
    <div className="wild fade-in">
      {!st && (
        <button className="wild-go" onClick={go}>
          <span className="wild-ic">◈</span>
          <span>
            <b>Find this in real code</b>
            <i>Search GitHub for projects that use it, then open one to see where it lives.</i>
          </span>
          <span className="wild-arrow">→</span>
        </button>
      )}
      {st?.loading && (
        <div className="writing">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          Searching GitHub…
        </div>
      )}
      {st?.err && <div className="story-err">{st.err}</div>}
      {st?.rows && (
        <>
          <div className="mini-h">in the wild</div>
          {st.rows.length === 0 && (
            <div className="muted small">Nothing found. Try a follow-up question instead.</div>
          )}
          {st.rows.map((r) => (
            <button
              key={r.repo + r.path}
              className="wild-row"
              onClick={() => onOpenAt(r.repo, r.path)}
            >
              <div className="wr-top">
                <b>{r.repo}</b>
                <span>{r.path}</span>
                <em>open in Atlas →</em>
              </div>
              <pre>{r.fragment}</pre>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Read the lesson aloud with the Mac's own voice (Web Speech, fully local).
const plainText = (md) =>
  String(md || '')
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\*\*|\*|`/g, '');
function Listen({ L }) {
  const [on, setOn] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), [L.id]);
  if (!window.speechSynthesis) return null;
  const go = () => {
    const sy = window.speechSynthesis;
    if (on) {
      sy.cancel();
      setOn(false);
      return;
    }
    const parts = [
      L.title,
      ...L.story
        .map((b) =>
          b.t === 'p'
            ? plainText(b.md)
            : b.t === 'h'
              ? b.text
              : b.t === 'term'
                ? `New word: ${b.term}. ${b.plain}`
                : b.t === 'step'
                  ? `${L.steps[b.i]?.title}. ${plainText(L.steps[b.i]?.md)}`
                  : '',
        )
        .filter(Boolean),
    ];
    const lg = document.documentElement.lang || 'en';
    const vs = sy.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lg));
    const voice =
      vs.find((v) => /Samantha|Daniel|Karen|Ava|Serena|Premium|Enhanced/i.test(v.name)) || vs[0];
    parts.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = lg;
      if (voice) u.voice = voice;
      u.rate = 1.02;
      if (i === parts.length - 1) u.onend = () => setOn(false);
      sy.speak(u);
    });
    setOn(true);
  };
  return (
    <button className={`listen ${on ? 'on' : ''}`} onClick={go}>
      {on ? '■ ' + t('Stop') : '▶ ' + t('Listen')}
    </button>
  );
}

// The whole lesson as Markdown notes (story, code, words), for Notion, Obsidian or a README.
const strip = (md) => String(md || '').replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1');
export function lessonMd(L) {
  const out = [`# ${L.title}`, ''];
  if (L.q) out.push(`> ${L.q}`, '');
  const code = L.work ?? L.code;
  let codeDone = false;
  for (const b of L.story) {
    if (b.t === 'p') out.push(strip(b.md), '');
    else if (b.t === 'h') out.push(`## ${b.text}`, '');
    else if (b.t === 'term')
      out.push(`**${b.term}**: ${b.plain}${b.like ? ` _(${b.like})_` : ''}`, '');
    else if (b.t === 'step') {
      const st = L.steps[b.i];
      out.push(
        `### ${b.i + 1}. ${st.title}${st.file ? ` (\`${st.file}\`)` : ''}`,
        strip(st.md),
        '',
      );
    } else if (b.t === 'quiz')
      out.push(
        `**Check:** ${b.q}`,
        ...b.choices.map((c, i) => `- ${i === b.answer ? '✅' : '▫️'} ${c}`),
        `_${b.why}_`,
        '',
      );
    if (!codeDone && code && b.t === 'p' && out.length > 6) {
      out.push('```' + (L.lang || ''), code, '```', '');
      codeDone = true;
    }
  }
  if (!codeDone && code) out.push('```' + (L.lang || ''), code, '```', '');
  if ((L.chat || []).length) {
    out.push('## Questions I asked');
    L.chat.forEach((c) => out.push(`**Q:** ${c.q}`, `${strip(c.a)}`, ''));
  }
  out.push('_Made with Bento_');
  return out.join('\n');
}
function WebPageBtn({ L }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="listen"
      title="Save as a web page anyone can open in a browser, with code they can run"
      onClick={async () => {
        const f = await window.bento.saveWeb(lessonHtml(L), L.title);
        if (f) {
          setOk(true);
          setTimeout(() => setOk(false), 2500);
        }
      }}
    >
      {ok ? '✓ Saved to Desktop' : '◫ Web page'}
    </button>
  );
}
function ShareBtn({ L }) {
  const [ok, setOk] = useState(null);
  const go = async () => {
    const { thinking, _ask, ...rest } = L; // keep everything that makes the lesson work, nothing that doesn't
    const r = await window.bento.exportLesson({
      ...rest,
      chat: rest.chat?.filter((c) => !c.loading),
    });
    if (r) {
      setOk(r.split('/').pop());
      setTimeout(() => setOk(null), 2500);
    }
  };
  return (
    <button
      className="listen"
      onClick={go}
      title="Save as a .bento file anyone can drop onto Bento"
    >
      {ok ? `✓ Saved ${ok}` : '⇪ Share'}
    </button>
  );
}

function CopyNotes({ L }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="listen"
      onClick={() => {
        navigator.clipboard?.writeText(lessonMd(L));
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
    >
      {ok ? '✓ ' + t('Copied') : '⧉ ' + t('Copy as notes')}
    </button>
  );
}

function ArticleCode({ L, run }) {
  const code = run?.src ?? L.work ?? L.code;
  const n = code.split('\n').length;
  const r = run?.r;
  return (
    <figure className="art-fig">
      <div className="art-code" style={{ height: Math.min(560, n * 23.5 + 24) }}>
        <Editor
          value={code}
          lang={L.lang === 'typescript' ? 'typescript' : L.lang}
          readOnly
          lens="code"
        />
      </div>
      {r?.visuals?.length > 0 && (
        <div className="art-viz">
          <Visuals list={r.visuals} />
        </div>
      )}
      {r?.logs?.length > 0 && (
        <pre className="console small art-out">
          {r.logs
            .slice(0, 30)
            .map((l) => l.s)
            .join('\n')}
        </pre>
      )}
      {!r && <figcaption className="muted small">Running the code…</figcaption>}
    </figure>
  );
}

function Term({ b, known, lessonId }) {
  const [open, setOpen] = useState(false);
  const seenElsewhere = known && known.from !== lessonId;
  return (
    <div className={`term-card fade-in ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
      <span className="tc-k">{seenElsewhere ? 'word you know' : 'new word'}</span>
      <span className="tc-term">{b.term}</span>
      <span className="tc-plain">{b.plain}</span>
      {b.like && <span className="tc-like">≈ {b.like}</span>}
    </div>
  );
}

function FollowUp({ onAsk, onLesson, placeholder }) {
  const [v, setV] = useState('');
  return (
    <form
      className="fu"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) {
          onAsk(v.trim());
          setV('');
        }
      }}
    >
      <input
        id="followup"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mod(e) && v.trim()) {
            e.preventDefault();
            onLesson(v.trim());
            setV('');
          }
        }}
      />
      <span className="fu-hint">
        <kbd>{K.enter}</kbd> answer · <kbd>{keys('⌘↵')}</kbd> lesson
      </span>
    </form>
  );
}
