// The plain English beside each line of code: what the lesson shipped with, written again for lines it missed,
// and kept in step with your edits.
import { useState, useMemo, useRef } from 'react';

export default function usePlainEnglish({ code, lesson }) {
  const [pmapV, setPmapV] = useState(0);
  // ---- plain-English map: line text → English, survives edits that keep a line intact
  const pmap = useMemo(() => {
    const m = new Map();
    const src = (lesson.code || '').split('\n');
    src.forEach((l, i) => {
      if (lesson.pseudo[i] != null) m.set(l.trim(), lesson.pseudo[i]);
    });
    Object.entries(lesson.pmap || {}).forEach(([k, v]) => m.set(k, v));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pmapV forces a rebuild after new plain English is saved
  }, [lesson.code, lesson.pseudo, lesson.pmap, pmapV]);
  // a line still where the lesson wrote it keeps the lesson's own English for that spot (the same line can appear twice
  // with different jobs: `show(steps)` mid-search and at the end); edited or moved lines are matched by their text
  const english = useMemo(() => {
    const src = (lesson.code || '').split('\n');
    return code.split('\n').map((l, i) => {
      const k = l.trim();
      if (!k || /^[}\])]+[;,)]*$/.test(k)) return '';
      if (src[i] === l && lesson.pseudo[i] != null && String(lesson.pseudo[i]).trim())
        return lesson.pseudo[i];
      // a lesson from your own agent never has Bento ask your AI for the missing lines: they stay blank
      return pmap.has(k) ? pmap.get(k) : lesson.agent ? '' : null;
    });
  }, [code, pmap, lesson.code, lesson.pseudo, lesson.agent]);
  const pendingEnglish = english.some((x) => x === null);
  // lines without plain English get it from the fast model, by line number (so a skipped or merged line can't move the
  // rest onto the wrong code); lines it missed are asked for once more, then left blank rather than keep spending
  const englishAsked = useRef({ code: null, n: 0 });
  const [englishAgain, setEnglishAgain] = useState(0);
  return { english, englishAgain, englishAsked, pendingEnglish, setEnglishAgain, setPmapV };
}
