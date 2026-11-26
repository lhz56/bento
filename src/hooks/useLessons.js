import { useState, useMemo, useCallback } from 'react';
import { altOf } from '../ai.js';
import { api } from '../bridge.js';
import {
  SAMPLES,
  CHALLENGE,
  emptyLesson,
  ndjsonParser,
  buildPrompt,
  applyBlock,
} from '../lesson.js';
import { PRE, loadPrebuilt } from '../prebuilt.js';
import { addWord } from '../progress.js';
import { RACES } from '../races.js';
import { puzzleLesson, codeParts, codeOf, englishMap } from '../puzzles.js';
import { modelLabel } from '../ui/Side.jsx';
import { tidyLesson } from '../verify.js';
import { WEB, countOnce, needsMac } from '../web.js';

export const RACE_LESSONS = RACES.map((r) => ({
  ...emptyLesson(r.q, r),
  ...r,
  status: 'done',
  builtin: true,
  race: true,
}));

// The lesson you're reading and how lessons come to be: opening one (a saved lesson, a simulation, a puzzle),
// asking your AI for a new one and streaming it in block by block, and the points you earn as you learn.
// If your AI can't answer (a usage limit, signed out), askLesson quietly asks your other one when that's on.
export default function useLessons({
  cancels,
  desk,
  lessons,
  lessonsRef,
  preReady,
  providersRef,
  setLessons,
  setPop,
  setProgress,
  setViewRaw,
  settings,
}) {
  const [currentId, setCurrentId] = useState(null);
  const [reopened, setReopened] = useState(null); // { id, q, o }: an earlier lesson reopened instead of asking again
  const [linkRange, setLinkRange] = useState(null);
  const [stepSel, setStepSel] = useState(null);
  const current = useMemo(
    () =>
      lessons.find((l) => l.id === currentId) ||
      [
        ...SAMPLES,
        CHALLENGE,
        ...RACE_LESSONS,
        ...Object.values(PRE.ideas),
        ...Object.values(PRE.path),
        ...Object.values(PRE.sims),
      ].find((l) => l.id === currentId) ||
      null,
    [lessons, currentId, preReady],
  );
  const patch = useCallback(
    (id, p) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))),
    [],
  );
  const openLesson = (lesson) => {
    if (WEB) countOnce('lesson', lesson.id);
    setLessons((ls) =>
      ls.some((x) => x.id === lesson.id) ? ls : [{ ...lesson, touched: true }, ...ls],
    );
    setCurrentId(lesson.id);
    setViewRaw('lesson');
    setLinkRange(null);
    setPop(null);
    setStepSel(lesson.steps?.length ? lesson.steps.length - 1 : null);
    award(lesson, 'open');
  };
  const openSim = (question) => {
    if (!PRE.ready) return void loadPrebuilt().then(() => openSim(question));
    const pre = PRE.sims[question];
    const have = lessons.find((l) => l.id === pre?.id);
    if (have) return openLesson(have);
    if (pre && (!settings.voice || settings.voice === 'English'))
      return openLesson({ ...pre, createdAt: Date.now() });
    askLesson(`${question} Teach it by simulating it with a small program and a picture.`, {
      mode: 'explain',
    });
  };
  const openPuzzle = (pz) => {
    const have = lessons.find((l) => l.id === `pz-${pz.id}`);
    openLesson(have || puzzleLesson(pz));
  };
  const setPuzzleCode = (pz, which) => {
    const parts = codeParts(pz, which);
    const id = currentId;
    desk.current?.setCode(codeOf(parts));
    setLessons((ls) =>
      ls.map((l) =>
        l.id === id ? { ...l, pmap: { ...(l.pmap || {}), ...englishMap(parts) } } : l,
      ),
    );
  };
  const onPuzzleResult = (pid, result) => {
    setProgress((prev) => {
      const old = prev.puzzles?.[pid] || {};
      const stars = [0, 1, 2].map((k) => !!(old.s?.[k] || result.s[k]));
      return {
        ...prev,
        puzzles: {
          ...(prev.puzzles || {}),
          [pid]: { ...old, s: stars, label: result.label || old.label, at: Date.now() },
        },
      };
    });
    if (result.s.every(Boolean)) award(current, 'challenge');
  };
  // asking for a new lesson
  const askLesson = useCallback(
    (question, options = {}) => {
      if (WEB) {
        needsMac('lesson');
        return null;
      } // the web version has no AI: new lessons are the Mac app's
      const model = options.model || settings.model;
      const lang = options.lang || settings.lang;
      const level = options.level || settings.level;
      // asked this exact question before (same kind, language and level)? open that lesson instead of spending your plan again
      const norm = (x) =>
        String(x || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();
      if (
        !options.fresh &&
        !options.context &&
        !options.prev &&
        !options.routed &&
        (options.mode || 'explain') !== 'challenge' &&
        norm(question).length > 3
      ) {
        const dup = lessonsRef.current.find(
          (l) =>
            l.status === 'done' &&
            !l.builtin &&
            norm(l.q) === norm(question) &&
            l.mode === (options.mode || 'explain') &&
            l.lang === lang &&
            (l.level || 'student') === level,
        );
        if (dup) {
          openLesson(dup);
          setReopened({ id: dup.id, q: question, o: options });
          return dup.id;
        }
      }
      const L0 = emptyLesson(question, {
        mode: options.mode || 'explain',
        lang,
        level,
        model,
        context: ['code', 'idea', 'compare', 'build'].includes(options.mode)
          ? options.context
          : options.mode === 'feature' && options.context
            ? {
                name: options.context.name,
                repo: options.context.repo,
                repoKey: options.context.repoKey,
                key: (options.context.key || []).map((k) => ({
                  path: k.path,
                  text: k.text.slice(0, 20000),
                })),
              }
            : null,
      });
      if (options.prev) L0.prevTitle = options.prev.title;
      if (options.routed) L0.routed = options.routed;
      setLessons((ls) => [L0, ...ls]);
      setCurrentId(L0.id);
      setViewRaw('lesson');
      setLinkRange(null);
      setStepSel(null);
      setPop(null);
      const parser = ndjsonParser((block) => {
        setLessons((ls) => ls.map((l) => (l.id === L0.id ? applyBlock(l, block) : l)));
        if (block.t === 'term' && block.term)
          setProgress((prev) =>
            addWord(prev, {
              term: block.term,
              plain: block.plain,
              like: block.like,
              from: L0.id,
              title: question,
            }),
          );
        if (block.t === 'step') setStepSel((s) => (s == null ? 0 : s + 1));
      });
      const prompt = buildPrompt({
        q: question,
        mode: L0.mode,
        lang,
        level,
        context: options.context,
        path: options.path,
        prev: options.prev
          ? { title: options.prev.title, code: options.prev.work ?? options.prev.code }
          : null,
      });
      const cancel = api.ask(model, prompt, {
        chunk: (t) => parser.push(t),
        think: (t) =>
          setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, thinking: t } : l))),
        done: () => {
          if (!document.hasFocus() && window.Notification?.permission !== 'denied') {
            try {
              new Notification('Your lesson is ready', {
                body: question ? String(question).slice(0, 90) : 'Bento finished writing.',
                silent: true,
              }).onclick = () => {
                window.focus();
                setCurrentId(L0.id);
                setViewRaw('lesson');
              };
            } catch {}
          }
          parser.end();
          setLessons((ls) =>
            ls.map((item) =>
              item.id === L0.id
                ? {
                    ...item,
                    ...tidyLesson(item),
                    status: item.code || item.story.length ? 'done' : 'error',
                    error:
                      item.code || item.story.length
                        ? null
                        : 'The model replied, but not in the lesson format. Try again or switch model.',
                  }
                : item,
            ),
          );
          cancels.current.delete(L0.id);
        },
        error: (message) => {
          parser.end();
          cancels.current.delete(L0.id);
          // Auto-route: if this AI can't answer right now (usage limit, signed out, missing), quietly ask your other one.
          const alt = altOf(model, providersRef.current);
          const account =
            /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/.test(
              message,
            );
          const cur = lessonsRef.current.find((l) => l.id === L0.id);
          if (
            settings.autoFallback &&
            alt &&
            account &&
            !options.routed &&
            !cur?.code &&
            !cur?.story?.length
          ) {
            setLessons((ls) => ls.filter((l) => l.id !== L0.id));
            askLesson(question, {
              ...options,
              model: alt,
              routed: {
                from: modelLabel(model),
                to: modelLabel(alt),
                why: /usage limit/.test(message)
                  ? 'hit its usage limit'
                  : /signed in/.test(message)
                    ? 'isn’t signed in'
                    : 'isn’t installed',
              },
            });
            return;
          }
          setLessons((ls) =>
            ls.map((l) =>
              l.id === L0.id ? { ...l, status: l.code ? 'done' : 'error', error: message } : l,
            ),
          );
        },
      });
      cancels.current.set(L0.id, cancel);
      L0._ask = { q: question, o: options };
      return L0.id;
    },
    [settings],
  );
  // points toward each concept you learn, once per lesson and kind of activity
  const award = (lesson, kind) => {
    if (!lesson?.concepts?.length) return;
    const pts = { open: 0.5, run: 1, step: 1.5, quiz: 2, challenge: 3 }[kind] || 0;
    const key = `${lesson.id}:${kind}`;
    setProgress((prev) => {
      if ((prev.awarded || []).includes(key)) return prev;
      const concepts = { ...prev.concepts };
      lesson.concepts.forEach((id) => {
        concepts[id] = (concepts[id] || 0) + pts;
      });
      return {
        ...prev,
        concepts: concepts,
        coins: (prev.coins ?? 5) + (kind === 'challenge' ? 3 : 0),
        awarded: [...(prev.awarded || []).slice(-400), key],
      };
    });
  };
  return {
    askLesson,
    award,
    current,
    currentId,
    linkRange,
    onPuzzleResult,
    openLesson,
    openPuzzle,
    openSim,
    patch,
    reopened,
    setCurrentId,
    setLinkRange,
    setPuzzleCode,
    setReopened,
    setStepSel,
    stepSel,
  };
}
