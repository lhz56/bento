// A lesson's story: its text, pictures and quizzes as they stream in, the chat under it (quick questions, a second
// opinion, explaining it back), what to learn next, and the lesson's own buttons (simpler, deeper, practise, export).
// The pieces it's made of live in src/ui/story/.
import { useRef, useState, useEffect, Fragment } from 'react';
import { slowLabel } from '../ai.js';
import { t } from '../i18n.js';
import { IDEAS } from '../ideas.js';
import BigPicture from './BigPicture.jsx';
import Md from './Md.jsx';
import PathBar from './PathBar.jsx';
import { modelLabel } from './Side.jsx';
import { announce } from './a11y.js';
import { Listen, CopyNotes, ShareBtn, WebPageBtn } from './story/Actions.jsx';
import { Checked, Quiz, TeachBack, QuickCheck } from './story/Checks.jsx';
import { NextCard } from './story/NextCard.jsx';
import { HeroPicture, ArticleCode, Term, FollowUp } from './story/Pieces.jsx';
import { Thought } from './story/Thinking.jsx';
const EMPTY = new Map();

/** @param {{ lesson: import('../types/lesson').Lesson, streaming?: boolean, [prop: string]: any }} props */
export default function Story(props) {
  const { lesson, streaming } = props;
  const scroller = useRef(null);
  const [hints, setHints] = useState(0);
  useEffect(() => {
    setHints(0);
    scroller.current?.scrollTo({ top: 0 });
  }, [lesson.id]);
  // you asked something: bring the new question (and the answer arriving under it) into view
  // (once when you ask, and again when the answer lands and the page has grown to fit it)
  const chatN = (lesson.chat || []).length;
  const answered = chatN > 0 && !lesson.chat[chatN - 1]?.loading;
  const seenChat = useRef({ id: lesson.id, n: chatN, answered });
  useEffect(() => {
    const was = seenChat.current;
    seenChat.current = { id: lesson.id, n: chatN, answered };
    if (was.id !== lesson.id) return; // a different lesson
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
  }, [chatN, answered, lesson.id]);
  // a lesson being written is announced once when it starts and once when it's ready, not word by word
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (streaming && !wasStreaming.current) announce(t('Writing your lesson…'));
    if (!streaming && wasStreaming.current && lesson.status === 'done')
      announce(`${t('Lesson ready')}: ${lesson.title || ''}`);
    wasStreaming.current = streaming;
  }, [streaming, lesson.status, lesson.title]);
  const md = (t) => (
    <Md text={t} onLink={props.onLink} onLinkClick={props.onLinkClick} onTerm={props.onTerm} />
  );
  // where the code sits in article mode: under a heading about the code, else after the second paragraph
  const hIdx = lesson.story.findIndex(
    (b) => b.t === 'h' && /code|how it works|build/i.test(b.text || ''),
  );
  const codeAt =
    hIdx >= 0
      ? hIdx
      : (lesson.story.map((b, i) => (b.t === 'p' ? i : -1)).filter((i) => i >= 0)[1] ?? 0);
  const kind =
    lesson.mode === 'build'
      ? `build it${lesson.context?.inspired ? ` · inspired by ${lesson.context.inspired.split('/').pop()}` : ''}`
      : lesson.mode === 'compare'
        ? `compare · ${lesson.context?.a?.repo?.split('/').pop()} vs ${lesson.context?.b?.repo?.split('/').pop()}`
        : lesson.mode === 'idea'
          ? `clever idea · ${lesson.context?.company || ''}`
          : lesson.mode === 'feature'
            ? 'feature'
            : lesson.mode === 'challenge'
              ? lesson.puzzle
                ? lesson.kicker
                : 'challenge'
              : lesson.context?.repo
                ? `inside ${lesson.context.repo.split('/').pop()}`
                : lesson.mode === 'code'
                  ? 'your code'
                  : lesson.kicker;

  return (
    <article
      className="story"
      ref={scroller}
      aria-label={t('Lesson')}
      aria-busy={streaming || undefined}
    >
      <div className="story-inner">
        {lesson.context?.repoKey && props.onBackToRepo && (
          <button className="back-repo" onClick={() => props.onBackToRepo(lesson.context.repoKey)}>
            ← {lesson.context.repo}
          </button>
        )}
        <div className="ask-echo">
          {lesson.q && lesson.mode !== 'challenge' ? (
            <>
              <span className="ask-q">
                “{lesson.q.length > 140 ? lesson.q.slice(0, 140) + '…' : lesson.q}”
              </span>
            </>
          ) : null}
        </div>
        <PathBar info={props.pathInfo} onPage={props.onPathPage} onStop={props.onPathStop} />
        {props.reopened && (
          <div className="reopened fade-in" role="status">
            ♻ {t('You asked this before, so here’s your earlier lesson (no AI used).')}
            <button className="link" onClick={props.reopened}>
              {t('Write a fresh one')} →
            </button>
          </div>
        )}
        {lesson.title ? (
          <header className="story-head">
            {kind && <div className="kicker">{kind}</div>}
            <h1>{lesson.title}</h1>
            {!streaming && lesson.story.length > 0 && (
              <div className="lesson-acts">
                <Listen lesson={lesson} />
                <CopyNotes lesson={lesson} />
                {props.onArticle &&
                  lesson.code &&
                  lesson.lang !== 'html' &&
                  !lesson.steps?.length && (
                    <button
                      className={`listen ${props.article ? 'on' : ''}`}
                      onClick={props.onArticle}
                      title="Read it as one column, with the code and its pictures inline"
                    >
                      {props.article ? '◧ ' + t('Side by side') : '▤ ' + t('Read as article')}
                    </button>
                  )}
                {window.bento?.exportLesson && <ShareBtn lesson={lesson} />}
                {window.bento?.saveWeb && <WebPageBtn lesson={lesson} />}
              </div>
            )}
            {lesson.mode === 'idea' && lesson.context?.link && (
              <div className="idea-srcs">
                <button className="idea-src" onClick={() => props.onOpenUrl?.(lesson.context.link)}>
                  {lesson.context.repo ? (
                    <>
                      Real code: <b>{lesson.context.repo}</b> ↗
                    </>
                  ) : (
                    <>Read the original ↗</>
                  )}
                </button>
                {lesson.context.repo &&
                  props.onOpenRepo &&
                  (() => {
                    const file =
                      lesson.context.file ||
                      IDEAS.find((x) => x.id === lesson.context.ideaId)?.file;
                    return (
                      <button
                        className="idea-src strong"
                        title={file ? `Opens ${file} inside ${lesson.context.repo}` : undefined}
                        onClick={() =>
                          file && props.onOpenAt
                            ? props.onOpenAt(lesson.context.repo, file)
                            : props.onOpenRepo(lesson.context.repo)
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
              <span className={`lang-dot ${lesson.lang}`} />
              {lesson.lang === 'python'
                ? 'Python'
                : lesson.lang === 'typescript'
                  ? 'TypeScript'
                  : lesson.lang === 'html'
                    ? 'Web page'
                    : 'JavaScript'}
              {lesson.concepts?.length > 0 && <span className="sep">·</span>}
              {lesson.concepts?.map((c) => (
                <span key={c} className="concept" onClick={() => props.onConcept?.(c)}>
                  {c.replace(/-/g, ' ')}
                </span>
              ))}
              {lesson.check && <Checked check={lesson.check} />}
            </div>
          </header>
        ) : streaming ? (
          <header className="story-head">
            <h1 className="sr-only">{lesson.q || t('A new lesson')}</h1>
            <div className="shimmer h1" aria-hidden="true" />
          </header>
        ) : null}

        {!props.article && !lesson.puzzle && <HeroPicture lesson={lesson} run={props.run} />}
        {lesson.story.filter((b) => b.t === 'h').length >= 3 && (
          <nav className="toc" aria-label={t('In this lesson')}>
            {lesson.story
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
        {lesson.story.map((block, i) => {
          if (block.t === 'p')
            return (
              <Fragment key={i}>
                <p className="para fade-in">{md(block.md)}</p>
                {props.article && i === codeAt && <ArticleCode lesson={lesson} run={props.run} />}
                {i === 0 && props.puzzleTop}
              </Fragment>
            );
          if (block.t === 'h')
            return (
              <Fragment key={i}>
                <h2 className="story-h fade-in">{block.text}</h2>
                {props.article && i === codeAt && <ArticleCode lesson={lesson} run={props.run} />}
              </Fragment>
            );
          if (block.t === 'diagram')
            return (
              <div key={i} className="story-diagram fade-in">
                <BigPicture
                  flow={block}
                  terms={lesson.terms || []}
                  tools={[]}
                  pathIdx={EMPTY}
                  onOpen={() => {}}
                  onAsk={(q) => props.onFollowUp?.(q)}
                  narrating={false}
                  role={() => ''}
                />
              </div>
            );
          if (block.t === 'term')
            return (
              <Term
                key={i}
                b={block}
                known={props.knownWords?.[String(block.term).toLowerCase()]}
                lessonId={lesson.id}
              />
            );
          if (block.t === 'step') {
            const step = lesson.steps[block.i];
            const on = props.stepSel === block.i;
            return (
              <div
                key={i}
                className={`recipe-step fade-in ${on ? 'on' : ''}`}
                onClick={() => props.onStepSelect(block.i)}
              >
                <div className="rs-num">{block.i + 1}</div>
                <div className="rs-body">
                  <div className="rs-title">
                    {step.title}
                    {step.file && <span className="rs-file">{step.file}</span>}
                  </div>
                  <div className="rs-md">{md(step.md)}</div>
                </div>
              </div>
            );
          }
          if (block.t === 'quiz') return <Quiz key={i} block={block} onAnswer={props.onQuiz} />;
          if (block.t === 'try' || block.t === 'next') return null; // gathered into the “what next” card below
          return null;
        })}

        {!streaming && lesson.status === 'done' && <NextCard lesson={lesson} storyProps={props} />}
        {!streaming && lesson.status === 'done' && lesson.puzzle && props.onTeachBack && (
          <TeachBack lesson={lesson} onTeachBack={props.onTeachBack} />
        )}
        {lesson.hints?.length > 0 && (
          <div className="hints fade-in">
            <div className="mini-h">{t('stuck?')}</div>
            {lesson.hints.slice(0, hints).map((h, i) => (
              <div key={i} className="hint">
                <span>{i + 1}</span>
                <div>{md(h)}</div>
              </div>
            ))}
            {hints < lesson.hints.length && (
              <button className="try" onClick={() => setHints(hints + 1)}>
                <span className="try-i">?</span>
                {hints ? 'Another hint' : 'Show a hint'} <em>{lesson.hints.length - hints} left</em>
              </button>
            )}
          </div>
        )}

        {props.puzzleEnd}
        {(lesson.chat || []).length > 0 && (
          <div className="chat">
            {lesson.chat.map((message, i) => (
              <div key={i} className="qa fade-in">
                <div className="qa-q">{message.q}</div>
                <div className="qa-a">
                  {message.loading ? (
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <>
                      {message.second && message.by && (
                        <span className="qa-who">{modelLabel(message.by)}</span>
                      )}
                      <Md
                        text={message.a}
                        onLink={props.onLink}
                        onLinkClick={props.onLinkClick}
                        onTerm={props.onTerm}
                      />
                      {message.term && message.plain && (
                        <span className="qa-term">
                          <b>{message.term}</b> {message.plain}
                        </span>
                      )}
                      {message.check && <QuickCheck check={message.check} onDone={props.onCheck} />}
                      <div className="qa-acts">
                        <button
                          className="qa-chip"
                          onClick={() =>
                            props.onQuickAsk?.(`Explain that more simply: ${message.q}`)
                          }
                        >
                          {t('Simpler')}
                        </button>
                        <button
                          className="qa-chip"
                          onClick={() =>
                            props.onQuickAsk?.(
                              `Show me a tiny example of that, using this lesson's code: ${message.q}`,
                            )
                          }
                        >
                          {t('Show an example')}
                        </button>
                        <button className="qa-chip" onClick={() => props.onFollowUp(message.q)}>
                          ✦ {t('Make it a lesson')}
                        </button>
                        {props.altFor?.(message) && !message.second && (
                          <button
                            className="qa-chip alt"
                            onClick={() => props.onSecondOpinion?.(i)}
                          >
                            {t('Ask')} {props.altFor(message)}
                          </button>
                        )}
                      </div>
                      {message.next?.length > 0 && i === lesson.chat.length - 1 && (
                        <div className="qa-next" aria-label={t('Ask next')}>
                          {message.next.map((x) => (
                            <button key={x} onClick={() => props.onQuickAsk?.(x)}>
                              {x}
                              <span aria-hidden="true">↵</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {message.second && (
                        <div className={`qa-second ${message.second.loading ? 'loading' : ''}`}>
                          <span className="qa-who">{message.second.who}</span>
                          {message.second.loading ? (
                            <span className="dots">
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : (
                            <Md
                              text={message.second.a}
                              onLink={props.onLink}
                              onLinkClick={props.onLinkClick}
                              onTerm={props.onTerm}
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
            {lesson.story.length || lesson.code
              ? `${props.modelLabel} is writing`
              : `${props.modelLabel} is planning how to explain it`}
            {slowLabel(props.modelLabel) ? ' (Codex sends the whole lesson at once)' : ''}
            {props.onStop && (
              <button className="stop-btn" onClick={props.onStop}>
                Stop
              </button>
            )}
          </div>
        )}
        {streaming && !lesson.story.length && !lesson.code && (
          <Thought
            text={lesson.thinking || ''}
            mode={lesson.mode}
            since={lesson.createdAt}
            slow={slowLabel(props.modelLabel)}
          />
        )}
        {streaming && !lesson.story.length && (
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
        {lesson.routed && (
          <div className="routed">
            ↪ {lesson.routed.from} {lesson.routed.why}, so <b>{lesson.routed.to}</b> wrote this
            lesson instead.
          </div>
        )}
        {lesson.status === 'error' && (
          <div className="story-err">
            <b>That didn't work.</b> {lesson.error}
            <div>
              <button className="btn tiny" onClick={props.onRetry}>
                Try again
              </button>
              {props.altModel && (
                <button
                  className="btn tiny ghost"
                  style={{ marginLeft: 6 }}
                  onClick={props.onRetryWith}
                >
                  Try with {props.altModel}
                </button>
              )}
            </div>
          </div>
        )}
        <div style={{ height: 120 }} />
      </div>
      <div className="followup">
        <FollowUp
          onAsk={props.onQuickAsk || props.onFollowUp}
          onLesson={props.onFollowUp}
          placeholder={
            lesson.mode === 'challenge'
              ? 'Ask for a hint in your own words…'
              : 'Ask anything about this…'
          }
        />
      </div>
    </article>
  );
}
