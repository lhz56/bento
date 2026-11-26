import { useEffect } from 'react';
import { ideaById } from '../ideas.js';
import { ALL_STOPS } from '../paths.js';
import { PRE } from '../prebuilt.js';

// Hooks for scripts/pregen-*.mjs, which drive the real app to pre-write the lessons that ship with Bento.
export default function useScriptHooks({ askLesson, openLesson, readIdea }) {
  useEffect(() => {
    window.__openIdea = (id) => readIdea(ideaById[id]);
    window.__ask = (q, o) => askLesson(q, o || {});
    window.__openLesson = (l) => openLesson(l);
    window.__missingStops = () => ALL_STOPS.filter((x) => x.q && !PRE.path[x.id]).map((x) => x.id);
    window.__genStop = (id) => {
      const st = ALL_STOPS.find((x) => x.id === id);
      return askLesson(st.q, {
        ...(st.lang ? { lang: st.lang } : {}),
        ...(st.mode ? { mode: st.mode } : {}),
      });
    };
  });
}
