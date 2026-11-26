import { useState } from 'react';
import { quickPrompts, parseJSONLoose } from '../../lesson.js';

export const LNAME = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
};

export const other = (l) => (l === 'python' ? 'javascript' : 'python');

// The lesson's program in the other language (Python ⇄ JavaScript), written once by your AI and kept, with each
// line mapped to its twin so hovering one shows the other.
export default function useTwin({
  code,
  edited,
  lang,
  lesson,
  model,
  onPatch,
  quick,
  setCode,
  setLens,
  setResult,
  setTrace,
}) {
  const [twinBusy, setTwinBusy] = useState(false);
  const [twinHover, setTwinHover] = useState(null);
  // ---- twin language
  const twin = lesson.twin && lesson.twin.src === code ? lesson.twin : lesson.twin;
  const makeTwin = async () => {
    setLens('twin');
    if (lesson.twin && lesson.twin.src === code) return;
    setTwinBusy(true);
    try {
      const reply = await quick(
        model,
        quickPrompts.twin({ code, from: LNAME[lang], to: LNAME[other(lang)] }),
      );
      const j = parseJSONLoose(reply);
      if (j?.code)
        onPatch({ twin: { lang: other(lang), code: j.code, map: j.map || [], src: code } });
    } finally {
      setTwinBusy(false);
    }
  };
  const mapTo = (line, dir) => {
    const m = (twin?.map || [])
      .filter((p) => (dir ? p[0] : p[1]) === line)
      .map((p) => (dir ? p[1] : p[0]));
    return m.length ? [Math.min(...m), Math.max(...m)] : null;
  };
  const switchToTwin = () => {
    if (!twin) return;
    const next = twin.code;
    onPatch({
      lang: twin.lang,
      code: next,
      work: null,
      pseudo: [],
      pmap: {},
      file: (lesson.file || 'main').replace(/\.\w+$/, twin.lang === 'python' ? '.py' : '.js'),
      twin: { lang, code, map: (twin.map || []).map(([a, b]) => [b, a]), src: next },
    });
    edited.current = false;
    setCode(next);
    setLens('code');
    setResult(null);
    setTrace(null);
  };
  return { makeTwin, mapTo, setTwinHover, switchToTwin, twin, twinBusy, twinHover };
}
