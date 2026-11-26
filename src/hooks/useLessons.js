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
  const openLesson = (l) => {
    if (WEB) countOnce('lesson', l.id);
    setLessons((ls) => (ls.some((x) => x.id === l.id) ? ls : [{ ...l, touched: true }, ...ls]));
    setCurrentId(l.id);
    setViewRaw('lesson');
    setLinkRange(null);
    setPop(null);
    setStepSel(l.steps?.length ? l.steps.length - 1 : null);
    award(l, 'open');
  };
  const openSim = (q) => {
    if (!PRE.ready) return void loadPrebuilt().then(() => openSim(q));
    const pre = PRE.sims[q];
    const have = lessons.find((l) => l.id === pre?.id);
    if (have) return openLesson(have);
    if (pre && (!settings.voice || settings.voice === 'English'))
      return openLesson({ ...pre, createdAt: Date.now() });
    askLesson(`${q} Teach it by simulating it with a small program and a picture.`, {
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
  const onPuzzleResult = (pid, r) => {
    setProgress((p) => {
      const old = p.puzzles?.[pid] || {};
      const s = [0, 1, 2].map((k) => !!(old.s?.[k] || r.s[k]));
      return {
        ...p,
        puzzles: {
          ...(p.puzzles || {}),
          [pid]: { ...old, s, label: r.label || old.label, at: Date.now() },
        },
      };
    });
    if (r.s.every(Boolean)) award(current, 'challenge');
  };
  // asking for a new lesson
  const askLesson = useCallback(
    (q, o = {}) => {
      if (WEB) {
        needsMac('lesson');
        return null;
      } // the web version has no AI: new lessons are the Mac app's
      const model = o.model || settings.model;
      const lang = o.lang || settings.lang;
      const level = o.level || settings.level;
      // asked this exact question before (same kind, language and level)? open that lesson instead of spending your plan again
      const norm = (x) =>
        String(x || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();
      if (
        !o.fresh &&
        !o.context &&
        !o.prev &&
        !o.routed &&
        (o.mode || 'explain') !== 'challenge' &&
        norm(q).length > 3
      ) {
        const dup = lessonsRef.current.find(
          (l) =>
            l.status === 'done' &&
            !l.builtin &&
            norm(l.q) === norm(q) &&
            l.mode === (o.mode || 'explain') &&
            l.lang === lang &&
            (l.level || 'student') === level,
        );
        if (dup) {
          openLesson(dup);
          setReopened({ id: dup.id, q, o });
          return dup.id;
        }
      }
      const L0 = emptyLesson(q, {
        mode: o.mode || 'explain',
        lang,
        level,
        model,
        context: ['code', 'idea', 'compare', 'build'].includes(o.mode)
          ? o.context
          : o.mode === 'feature' && o.context
            ? {
                name: o.context.name,
                repo: o.context.repo,
                repoKey: o.context.repoKey,
                key: (o.context.key || []).map((k) => ({
                  path: k.path,
                  text: k.text.slice(0, 20000),
                })),
              }
            : null,
      });
      if (o.prev) L0.prevTitle = o.prev.title;
      if (o.routed) L0.routed = o.routed;
      setLessons((ls) => [L0, ...ls]);
      setCurrentId(L0.id);
      setViewRaw('lesson');
      setLinkRange(null);
      setStepSel(null);
      setPop(null);
      const parser = ndjsonParser((b) => {
        setLessons((ls) => ls.map((l) => (l.id === L0.id ? applyBlock(l, b) : l)));
        if (b.t === 'term' && b.term)
          setProgress((p) => {
            const k = String(b.term).toLowerCase();
            if (p.words?.[k]) return p;
            return {
              ...p,
              words: {
                ...(p.words || {}),
                [k]: {
                  term: b.term,
                  plain: b.plain,
                  like: b.like,
                  from: L0.id,
                  title: q,
                  at: Date.now(),
                },
              },
            };
          });
        if (b.t === 'step') setStepSel((s) => (s == null ? 0 : s + 1));
      });
      const prompt = buildPrompt({
        q,
        mode: L0.mode,
        lang,
        level,
        context: o.context,
        path: o.path,
        prev: o.prev ? { title: o.prev.title, code: o.prev.work ?? o.prev.code } : null,
      });
      const cancel = api.ask(model, prompt, {
        chunk: (t) => parser.push(t),
        think: (t) =>
          setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, thinking: t } : l))),
        done: () => {
          if (!document.hasFocus() && window.Notification?.permission !== 'denied') {
            try {
              new Notification('Your lesson is ready', {
                body: q ? String(q).slice(0, 90) : 'Bento finished writing.',
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
        error: (m) => {
          parser.end();
          cancels.current.delete(L0.id);
          // Auto-route: if this AI can't answer right now (usage limit, signed out, missing), quietly ask your other one.
          const alt = altOf(model, providersRef.current);
          const account =
            /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/.test(
              m,
            );
          const cur = lessonsRef.current.find((l) => l.id === L0.id);
          if (
            settings.autoFallback &&
            alt &&
            account &&
            !o.routed &&
            !cur?.code &&
            !cur?.story?.length
          ) {
            setLessons((ls) => ls.filter((l) => l.id !== L0.id));
            askLesson(q, {
              ...o,
              model: alt,
              routed: {
                from: modelLabel(model),
                to: modelLabel(alt),
                why: /usage limit/.test(m)
                  ? 'hit its usage limit'
                  : /signed in/.test(m)
                    ? 'isn’t signed in'
                    : 'isn’t installed',
              },
            });
            return;
          }
          setLessons((ls) =>
            ls.map((l) =>
              l.id === L0.id ? { ...l, status: l.code ? 'done' : 'error', error: m } : l,
            ),
          );
        },
      });
      cancels.current.set(L0.id, cancel);
      L0._ask = { q, o };
      return L0.id;
    },
    [settings],
  );
  // points toward each concept you learn, once per lesson and kind of activity
  const award = (l, kind) => {
    if (!l?.concepts?.length) return;
    const pts = { open: 0.5, run: 1, step: 1.5, quiz: 2, challenge: 3 }[kind] || 0;
    const key = `${l.id}:${kind}`;
    setProgress((p) => {
      if ((p.awarded || []).includes(key)) return p;
      const c = { ...p.concepts };
      l.concepts.forEach((id) => {
        c[id] = (c[id] || 0) + pts;
      });
      return {
        ...p,
        concepts: c,
        coins: (p.coins ?? 5) + (kind === 'challenge' ? 3 : 0),
        awarded: [...(p.awarded || []).slice(-400), key],
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
