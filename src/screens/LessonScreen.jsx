import { addWord } from '../progress.js';

import { useTutor } from '../hooks/index.js';
import Desk from '../ui/Desk.jsx';
import { PuzzleEnd, PuzzlePanel } from '../ui/Puzzles.jsx';
import { modelLabel } from '../ui/Side.jsx';
import Story from '../ui/Story.jsx';

// An open lesson: the story on the left (or its own page on a phone), the code and what it does on the right.
export default function LessonScreen({
  altFor,
  altModel,
  api,
  article,
  askLesson,
  award,
  cancels,
  current,
  desk,
  dragStory,
  findWild,
  goStop,
  knownWordSet,
  linkRange,
  newScratch,
  noteFlash,
  onPuzzleResult,
  onTerm,
  onTry,
  openRepo,
  openRepoAt,
  pane,
  patch,
  pathOf,
  phone,
  progress,
  providers,
  pyReady,
  readIdea,
  reopened,
  runWaits,
  runs,
  setArticle,
  setLessons,
  setLinkRange,
  setPane,
  setProgress,
  setPuzzleCode,
  setReopened,
  setRuns,
  setSettings,
  setStepSel,
  setViewRaw,
  settings,
  showAtlas,
  stepSel,
  storyW,
  streaming,
}) {
  const { quickAsk, secondOpinion, teachBack } = useTutor({
    api,
    lesson: current,
    settings,
    providers,
    altFor,
    desk,
    setLessons,
    setProgress,
  });
  return (
    <div
      className={`lesson ${article && current.code && current.lang !== 'html' && !current.steps?.length ? 'article' : ''} ${phone ? `pane-${pane}` : ''}`}
      style={{ '--story-w': `${storyW * 100}%` }}
    >
      <Story
        pathInfo={pathOf(current)}
        onPathStop={goStop}
        onPathPage={() => setViewRaw('path')}
        lesson={current}
        streaming={streaming}
        modelLabel={modelLabel(current.model || settings.model)}
        onLink={setLinkRange}
        onLinkClick={(r) => {
          setLinkRange(r);
          if (phone) setPane('code');
        }}
        onTerm={onTerm}
        onTry={onTry}
        onNext={(q) =>
          current.mode === 'challenge'
            ? askLesson(/another/i.test(q) ? current.concepts?.[0] || 'arrays' : q, {
                mode: /another/i.test(q) ? 'challenge' : 'explain',
                lang: current.lang,
              })
            : askLesson(q, { prev: current, lang: current.lang })
        }
        onFollowUp={(q) => askLesson(q, { prev: current, lang: current.lang })}
        onSecondOpinion={secondOpinion}
        onTeachBack={teachBack}
        onPractice={(lesson) =>
          askLesson(
            `${lesson.title}: ${(lesson.concepts || []).join(', ') || lesson.kicker || ''}`.slice(
              0,
              120,
            ),
            { mode: 'challenge', lang: lesson.lang === 'typescript' ? 'typescript' : lesson.lang },
          )
        }
        onQuickAsk={quickAsk}
        onDepth={(dir) => {
          const lv = ['kid', 'student', 'engineer'];
          const base = current.level || settings.level;
          const level =
            lv[Math.max(0, Math.min(2, lv.indexOf(base) + (dir === 'deeper' ? 1 : -1)))];
          askLesson(
            dir === 'deeper'
              ? `Go deeper on "${current.title}": what's really happening under the hood, and the trade-offs a pro would think about`
              : `Explain "${current.title}" again, much simpler, with an everyday analogy and a smaller example`,
            { prev: current, lang: current.lang, level },
          );
        }}
        onQuiz={(ok) => ok && award(current, 'quiz')}
        onCheck={(ok) => {
          if (ok) award(current, 'quiz');
          setLessons((ls) =>
            ls.map((l) =>
              l.id === current.id
                ? { ...l, checks: [...(l.checks || []), { ok, at: Date.now() }].slice(-20) }
                : l,
            ),
          );
        }}
        onConcept={(c) => askLesson(`Teach me ${c.replace(/-/g, ' ')}`, { lang: current.lang })}
        stepSel={stepSel}
        onStepSelect={setStepSel}
        onWild={providers?.gh ? findWild : null}
        onOpenAt={openRepoAt}
        onOpenRepo={openRepo}
        altModel={altModel ? modelLabel(altModel) : null}
        altFor={(c) => {
          const m = altFor(c.by || settings.model);
          return m ? modelLabel(m) : null;
        }}
        onRetryWith={() => {
          const failed = current;
          setSettings({ model: altModel });
          setLessons((ls) => ls.filter((l) => l.id !== failed.id));
          setTimeout(
            () =>
              askLesson(failed.q, {
                model: altModel,
                mode: failed.mode,
                lang: failed.lang,
                context: failed.context,
              }),
            0,
          );
        }}
        article={article}
        onArticle={() =>
          setArticle((a) => {
            localStorage.setItem('bento.article', a ? '' : '1');
            return !a;
          })
        }
        run={runs[current.id]}
        onStop={() => {
          const id = current.id;
          cancels.current.get(id)?.();
          cancels.current.delete(id);
          setLessons((ls) =>
            ls.map((lesson) =>
              lesson.id === id
                ? {
                    ...lesson,
                    status: lesson.code || lesson.story.length ? 'done' : 'error',
                    error:
                      lesson.code || lesson.story.length
                        ? null
                        : 'Stopped before anything arrived.',
                    thinking: null,
                  }
                : lesson,
            ),
          );
        }}
        onBackToRepo={showAtlas}
        onOpenUrl={(u) => api.openExternal(u)}
        knownWords={progress.words}
        reopened={
          reopened?.id === current.id
            ? () => {
                const r = reopened;
                setReopened(null);
                askLesson(r.q, { ...r.o, fresh: true });
              }
            : null
        }
        puzzleTop={
          current.puzzle ? (
            <PuzzlePanel
              lesson={current}
              rec={progress.puzzles?.[current.puzzle]}
              getCode={() => desk.current?.getCode()}
              setPuzzleCode={setPuzzleCode}
              onResult={onPuzzleResult}
              pyReady={pyReady}
              onOpenUrl={(u) => api.openExternal(u)}
            />
          ) : null
        }
        puzzleEnd={
          current.puzzle ? (
            <PuzzleEnd
              lesson={current}
              rec={progress.puzzles?.[current.puzzle]}
              setPuzzleCode={setPuzzleCode}
              onIdea={readIdea}
              onOpenAt={openRepoAt}
              onOpenUrl={(u) => api.openExternal(u)}
              onSeen={(pid) =>
                setProgress((p) => ({
                  ...p,
                  puzzles: {
                    ...(p.puzzles || {}),
                    [pid]: { ...(p.puzzles?.[pid] || {}), seen: true },
                  },
                }))
              }
            />
          ) : null
        }
        onRetry={() => {
          const a = current;
          setLessons((ls) => ls.filter((l) => l.id !== a.id));
          askLesson(a.q, { model: altModel, mode: a.mode, lang: a.lang, context: a.context });
        }}
      />
      <div className="vdivider" onMouseDown={dragStory} />
      <Desk
        ref={desk}
        phone={phone}
        lesson={current}
        onPatch={(p) => patch(current.id, p)}
        quick={api.quick}
        model={settings.model}
        knownWords={knownWordSet}
        onWord={(w) =>
          setProgress((prev) => addWord(prev, { ...w, from: current.id, title: current.title }))
        }
        linkRange={linkRange}
        noteFlash={noteFlash}
        stepSel={current.steps?.length ? stepSel : null}
        pyReady={pyReady}
        streaming={streaming}
        onResult={(id, r, src) => {
          setRuns((m) => ({ ...m, [id]: { r, src } }));
          runWaits.current = runWaits.current.filter((w) =>
            w.id === id ? (w.res({ r, src }), false) : true,
          );
        }}
        onMastery={(k) => award(current, k)}
        onRemix={(code, lang) =>
          newScratch(lang, {
            title: current.title,
            code,
            pseudo: code === current.code ? current.pseudo : [],
          })
        }
      />
    </div>
  );
}
