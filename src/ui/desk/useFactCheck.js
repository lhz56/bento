// After a new lesson's code runs cleanly, the lesson is checked against what the code really did: free checks
// first, then one small call to the fast model for the quizzes and claims. It fixes only what it can prove, and says so.
import { useRef, useEffect } from 'react';
import { parseJSONLoose } from '../../lesson.js';
import { localChecks, checkPrompt, applyCheck } from '../../verify.js';

export default function useFactCheck({
  edited,
  lang,
  lesson,
  lidRef,
  model,
  onPatch,
  quick,
  result,
  streaming,
}) {
  // After a new lesson's code runs cleanly: check the lesson against what the code really did (free checks first,
  // then one small call to the fast model for the quizzes and claims). Fixes only what it can prove, and says so.
  const checkTried = useRef(new Set());
  useEffect(() => {
    if (
      streaming ||
      lesson.status !== 'done' ||
      !result ||
      result.error ||
      result.need ||
      lesson.builtin ||
      lesson.check ||
      lesson.scratch ||
      lesson.agent ||
      edited.current
    )
      return;
    if (
      !['explain', 'idea', 'build', 'feature'].includes(lesson.mode) ||
      lang === 'html' ||
      checkTried.current.has(lesson.id) ||
      !lesson.code
    )
      return;
    if (localStorage.getItem('bento.check') === 'off') return;
    checkTried.current.add(lesson.id);
    const run = result;
    (async () => {
      const loc = localChecks(lesson);
      let cur = { ...lesson, ...loc.patch };
      let corrections = [];
      let by = null;
      if (quick) {
        try {
          const j = parseJSONLoose(await quick(model, checkPrompt(cur, run)));
          if (j && (j.quizzes || j.fixes)) {
            const a = applyCheck(cur, j);
            cur = { ...cur, ...a.patch };
            corrections = a.corrections;
            by = model;
          }
        } catch {
          /* the free checks still count */
        }
      }
      if (lidRef.current !== lesson.id && !lesson.id) return;
      onPatch({
        ...loc.patch,
        ...(corrections.length ? { story: cur.story } : {}),
        check: { at: Date.now(), local: loc.notes, corrections, by },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a finished lesson is checked once, after its first run
  }, [streaming, lesson.status, result, lesson.id]);
  return {};
}
