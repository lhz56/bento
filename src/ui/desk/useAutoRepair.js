// A freshly written example that crashes gets one quiet repair from your AI (never for challenges, where the bug is
// the point, and never once you've edited it); the fixed code then runs again by itself.
import { useRef, useEffect } from 'react';
import { parseJSONLoose, quickPrompts } from '../../lesson.js';
import { LNAME } from './useTwin.js';

export default function useAutoRepair({
  doRun,
  edited,
  lang,
  lesson,
  model,
  onPatch,
  quick,
  result,
  setCode,
  streaming,
}) {
  // A freshly written example that crashes gets one quiet repair (never for challenges, where the bug is the point).
  const repairTried = useRef(new Set());
  useEffect(() => {
    if (
      streaming ||
      lesson.status !== 'done' ||
      !result?.error ||
      edited.current ||
      lesson.builtin ||
      lesson.repaired ||
      lesson.agent
    )
      return; // (your agent is told the error and fixes its own)
    if (
      !['explain', 'idea'].includes(lesson.mode) ||
      repairTried.current.has(lesson.id) ||
      !lesson.code
    )
      return;
    if (/^Stopped/.test(result.error.msg || '')) return;
    repairTried.current.add(lesson.id);
    (async () => {
      try {
        const j = parseJSONLoose(
          await quick(
            model,
            quickPrompts.repair({
              code: lesson.code,
              err: result.error.msg + (result.error.line ? ` (line ${result.error.line})` : ''),
              lang: LNAME[lang],
            }),
          ),
        );
        if (!j?.code || j.code === lesson.code || edited.current) return;
        const same = j.code.split('\n').length === lesson.code.split('\n').length;
        onPatch({
          code: j.code,
          pseudo: same ? lesson.pseudo : [],
          repaired: j.note || 'Fixed a small mistake in the example.',
        });
        setCode(j.code);
        setTimeout(() => doRun(j.code, { quiet: true }), 30);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- repairs a broken example once, when a lesson finishes and its first run fails; not on every edit
  }, [streaming, lesson.status, result, lesson.id]);
  return {};
}
