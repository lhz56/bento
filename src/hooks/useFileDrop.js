// Drag a folder, a code file or a shared lesson onto the window: a folder opens as a project, a lesson file opens
// as that lesson, and a code file becomes a lesson that explains it. dropping is true while something is held over.
import { useState, useEffect } from 'react';
import { api } from '../bridge.js';
import { emptyLesson } from '../lesson.js';
import { cleanErr } from '../store.js';

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
    let depth = 0;
    const enter = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        depth++;
        setDropping(true);
        e.preventDefault();
      }
    };
    const over = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const drop = async (e) => {
      e.preventDefault();
      depth = 0;
      setDropping(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const dropped = await api.dropOpen(file);
        if (dropped.kind === 'local')
          openAtlas({ kind: 'local', root: dropped.root, name: dropped.name });
        else if (dropped.kind === 'lesson') {
          const lesson = {
            ...emptyLesson(dropped.lesson.q || '', dropped.lesson),
            ...dropped.lesson,
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
          askLesson(`Explain ${dropped.name}`, {
            mode: 'code',
            context: { code: dropped.text, path: dropped.name },
            lang: /\.py$/.test(dropped.name) ? 'python' : 'javascript',
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
