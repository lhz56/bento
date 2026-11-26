import { noAI } from '../ai.js';
import { parseJSONLoose } from '../lesson.js';
import { puzzleById } from '../puzzles.js';
import { cleanErr } from '../store.js';
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
        onSecondOpinion={async (i) => {
          const lesson = current;
          const id = lesson.id;
          const message = lesson.chat[i];
          const altModel = altFor(message.by || settings.model);
          if (!altModel) return;
          const set = (second) =>
            setLessons((ls) =>
              ls.map((l) =>
                l.id === id
                  ? { ...l, chat: l.chat.map((x, k) => (k === i ? { ...x, second } : x)) }
                  : l,
              ),
            );
          set({ who: modelLabel(altModel), loading: true });
          const code = (lesson.work ?? lesson.code ?? '')
            .split('\n')
            .map((x, k) => `${k + 1}| ${x}`)
            .join('\n')
            .slice(0, 5000);
          try {
            const j = parseJSONLoose(
              await api.quick(
                altModel,
                `You are tutoring a ${settings.level} learner inside a lesson titled "${lesson.title}".\nThe lesson's ${lesson.lang} code (with line numbers):\n${code}\n\nThe learner asks: ${message.q}\nAnother tutor already answered: "${message.a}"\nGive YOUR answer in at most 90 words: agree, add what they missed, or politely correct them. You may use **bold**, \`code\` and [[line|links]].\nReply JSON: {"answer":"..."}`,
              ),
            );
            set({ who: modelLabel(altModel), a: j?.answer || 'No answer this time.' });
          } catch {
            set({
              who: modelLabel(altModel),
              a: 'That model didn’t answer. Is it signed in?',
            });
          }
        }}
        onTeachBack={
          noAI(providers)
            ? null
            : async (lesson, said) => {
                const id = lesson.id;
                const story = (lesson.story || [])
                  .map((b) => b.md || b.text || '')
                  .filter(Boolean)
                  .join('\n')
                  .slice(0, 3500);
                let j = null;
                const pz = lesson.puzzle ? puzzleById(lesson.puzzle) : null;
                if (pz) {
                  try {
                    j = parseJSONLoose(
                      await api.quick(
                        settings.model,
                        `You are a warm, fair coding interviewer. The candidate (a ${settings.level}) is solving the puzzle "${pz.title}":\n${pz.md}\nThe best known approach runs in ${pz.target}.\nTheir current Python code:\n${(desk.current?.getCode?.() ?? lesson.work ?? lesson.code).slice(0, 4000)}\n\nThey talk you through their solution:\n"${said}"\n\nJudge the explanation the way a good interviewer would: is the idea right, do they know why it works, and do they state its time complexity correctly (for THEIR code)? Judge understanding, not grammar. Score 0–3 (3 = you'd hire on this answer).\nReply JSON: {"score":0-3,"got":["what they explained well, ≤ 14 words each, max 2"],"missing":["the most important gap, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"the follow-up question an interviewer would ask next, ≤ 18 words"}`,
                      ),
                    );
                  } catch (e) {
                    j = { score: 0, got: [], missing: [cleanErr(e)], next: '' };
                  }
                } else
                  try {
                    j = parseJSONLoose(
                      await api.quick(
                        settings.model,
                        `A ${settings.level} learner just finished a lesson titled "${lesson.title}" (concepts: ${(lesson.concepts || []).join(', ')}).\nLESSON TEXT:\n${story}\n\nThey explained it back in their own words:\n"${said}"\n\nBe a warm, honest tutor. Judge understanding, not grammar or spelling. Score 0–3 (0 = wrong idea, 1 = partly, 2 = right but missing one key piece, 3 = solid).\nReply JSON: {"score":0-3,"got":["what they got right, ≤ 14 words each, max 2"],"missing":["the most important missing or wrong piece, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"one short question that would push them further, ≤ 18 words"}`,
                      ),
                    );
                  } catch (e) {
                    j = { score: 0, got: [], missing: [cleanErr(e)], next: '' };
                  }
                if (!j)
                  j = {
                    score: 0,
                    got: [],
                    missing: ['Couldn’t read the answer this time. Try again.'],
                    next: '',
                  };
                const teach = {
                  said,
                  score: Math.max(0, Math.min(3, +j.score || 0)),
                  got: j.got || [],
                  missing: j.missing || [],
                  next: j.next || '',
                };
                setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, teach } : l)));
              }
        }
        onPractice={(lesson) =>
          askLesson(
            `${lesson.title}: ${(lesson.concepts || []).join(', ') || lesson.kicker || ''}`.slice(
              0,
              120,
            ),
            { mode: 'challenge', lang: lesson.lang === 'typescript' ? 'typescript' : lesson.lang },
          )
        }
        onQuickAsk={async (question) => {
          const lesson = current;
          const id = lesson.id;
          const before = (lesson.chat || []).length;
          const put = (c) =>
            setLessons((ls) =>
              ls.map((l) =>
                l.id === id ? { ...l, chat: [...(l.chat || []).slice(0, before), c] } : l,
              ),
            );
          if (noAI(providers)) {
            put({
              q: question,
              a: 'Bento needs an AI to answer questions. Connect one (bottom-left → **Connect an AI**): Claude, ChatGPT, Gemini or Copilot, on the plan you already have.',
            });
            return;
          }
          put({ q: question, loading: true });
          const code = (lesson.work ?? lesson.code ?? '')
            .split('\n')
            .map((x, i) => `${i + 1}| ${x}`)
            .join('\n')
            .slice(0, 5000);
          const hist = (lesson.chat || [])
            .slice(-3)
            .map((c) => `Q: ${c.q}\nA: ${c.a}`)
            .join('\n');
          try {
            const j = parseJSONLoose(
              await api.quick(
                settings.model,
                `You are tutoring a ${settings.level} learner inside a lesson titled "${lesson.title}".\nThe lesson's ${lesson.lang} code (with line numbers):\n${code}\n${hist ? `\nEarlier in this chat:\n${hist}\n` : ''}\nThe learner asks: ${question}\nAnswer warmly and precisely in at most 110 words. You may use **bold**, \`code\` and line links like [[3-5|the loop]] that point at lines of the code above.\nAlso suggest 2 short questions they might ask next (at most 8 words each). If, and only if, the answer teaches something checkable, add one quick multiple-choice check about it (3 choices, one right); otherwise check is null.\nReply JSON: {"answer":"...","term":"a technical term you used that they may not know, or null","plain":"one-line definition of it, or null","next":["...","..."],"check":{"q":"...","choices":["...","...","..."],"answer":0,"why":"one sentence"}}`,
              ),
            );
            const ck =
              j?.check &&
              Array.isArray(j.check.choices) &&
              j.check.choices.length >= 2 &&
              Number.isInteger(j.check.answer) &&
              j.check.answer >= 0 &&
              j.check.answer < j.check.choices.length
                ? j.check
                : null;
            put(
              j?.answer
                ? {
                    q: question,
                    a: j.answer,
                    term: j.term,
                    plain: j.plain,
                    by: settings.model,
                    next: (Array.isArray(j.next) ? j.next : [])
                      .filter((x) => typeof x === 'string' && x.trim())
                      .slice(0, 2),
                    check: ck,
                  }
                : { q: question, a: 'I couldn’t answer that one. Try making it a full lesson.' },
            );
            if (j?.term && j?.plain)
              setProgress((prev) => {
                const key = String(j.term).toLowerCase();
                if (prev.words?.[key]) return prev;
                return {
                  ...prev,
                  words: {
                    ...(prev.words || {}),
                    [key]: {
                      term: j.term,
                      plain: j.plain,
                      from: id,
                      title: lesson.title,
                      at: Date.now(),
                    },
                  },
                };
              });
          } catch {
            put({
              q: question,
              a: 'The model didn’t answer. Check your connection and try again.',
            });
          }
        }}
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
          setProgress((prev) => {
            const key = w.term.toLowerCase();
            if (prev.words?.[key]) return prev;
            return {
              ...prev,
              words: {
                ...(prev.words || {}),
                [key]: { ...w, from: current.id, title: current.title, at: Date.now() },
              },
            };
          })
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
