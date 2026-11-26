import { useState, useEffect } from 'react';
import { api } from '../bridge.js';
import { emptyLesson } from '../lesson.js';
import { cleanErr } from '../store.js';

// Drag a folder, a code file or a shared lesson onto the window: a folder opens as a project, a lesson file opens
// as that lesson, and a code file becomes a lesson that explains it. dropping is true while something is held over.
export default function useFileDrop({
  askLesson,
  openAtlas,
  setCurrentId,
  setLessons,
  setStepSel,
  setViewRaw,
  settings,
}) {
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    let n = 0;
    const enter = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        n++;
        setDropping(true);
        e.preventDefault();
      }
    };
    const over = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    const leave = () => {
      n = Math.max(0, n - 1);
      if (!n) setDropping(false);
    };
    const drop = async (e) => {
      e.preventDefault();
      n = 0;
      setDropping(false);
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      try {
        const r = await api.dropOpen(f);
        if (r.kind === 'local') openAtlas({ kind: 'local', root: r.root, name: r.name });
        else if (r.kind === 'lesson') {
          const lesson = {
            ...emptyLesson(r.lesson.q || '', r.lesson),
            ...r.lesson,
            id: Math.random().toString(36).slice(2, 10),
            status: 'done',
            builtin: false,
            shared: true,
            createdAt: Date.now(),
          };
          setLessons((ls) => [lesson, ...ls]);
          setCurrentId(lesson.id);
          setViewRaw('lesson');
          setStepSel(lesson.steps?.length ? lesson.steps.length - 1 : null);
        } else
          askLesson(`Explain ${r.name}`, {
            mode: 'code',
            context: { code: r.text, path: r.name },
            lang: /\.py$/.test(r.name) ? 'python' : 'javascript',
          });
      } catch (err) {
        alert(cleanErr(err));
      }
    };
    addEventListener('dragenter', enter);
    addEventListener('dragover', over);
    addEventListener('dragleave', leave);
    addEventListener('drop', drop);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragover', over);
      removeEventListener('dragleave', leave);
      removeEventListener('drop', drop);
    };
  }, [settings]);
  return { dropping };
}
