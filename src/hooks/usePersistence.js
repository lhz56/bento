// Keeping your lessons, progress, settings and projects safe. They live in browser storage with a copy on disk
// (electron/store.cjs): this restores from the disk copy when browser storage was lost, saves as things change,
// follows changes made on your other devices, and merges a backup file back in.
import { useEffect, useRef, useState } from 'react';
import { api } from '../bridge.js';
import { save, saveLessons } from '../store.js';
import { mergeLessons } from '../sync.js';

// lessons that were mid-stream when the app closed can't resume: keep what arrived, or mark them interrupted
export const settle = (ls) =>
  ls.map((lesson) =>
    lesson.status === 'streaming'
      ? {
          ...lesson,
          status: lesson.code || lesson.steps?.length ? 'done' : 'error',
          error:
            lesson.code || lesson.steps?.length
              ? null
              : 'This lesson was interrupted when Bento closed.',
          thinking: null,
        }
      : lesson,
  );

// What browser storage held at startup, before the app writes its defaults: the disk mirror is compared against this.
const BOOT = (() => {
  try {
    return {
      savedAt: +localStorage.getItem('bento.savedAt') || 0,
      has: new Set(
        ['bento.lessons', 'bento.progress', 'bento.settings', 'bento.projects'].filter((k) => {
          const v = localStorage.getItem(k);
          return v && v !== '[]' && v !== '{}';
        }),
      ),
    };
  } catch {
    return { savedAt: 0, has: new Set() };
  }
})();

export default function usePersistence({
  cancels,
  lessons,
  progress,
  setLessons,
  setOnb,
  setProgress,
  setProjects,
  setSettingsRaw,
}) {
  // restore from the disk mirror when browser storage was lost (crash, forced quit)
  useEffect(() => {
    api
      .storeGet?.()
      .then((saved) => {
        if (!saved || typeof saved !== 'object') return;
        // a damaged save file must never blank the app: keep only values of the right shape
        if (!Array.isArray(saved['bento.lessons'])) delete saved['bento.lessons'];
        else
          saved['bento.lessons'] = saved['bento.lessons'].filter(
            (l) => l && typeof l === 'object' && l.id,
          );
        if (!Array.isArray(saved['bento.projects'])) delete saved['bento.projects'];
        for (const k of ['bento.progress', 'bento.settings'])
          if (!saved[k] || typeof saved[k] !== 'object' || Array.isArray(saved[k])) delete saved[k];
        // whichever copy was written last wins (browser storage can lag behind after a crash)
        const diskNewer = (saved['bento.savedAt'] || 0) > BOOT.savedAt;
        if ((diskNewer || !BOOT.has.has('bento.lessons')) && saved['bento.lessons']?.length)
          setLessons(settle(saved['bento.lessons']));
        else if (saved['bento.lessons']?.length)
          setLessons((ls) => {
            const have = new Set(ls.map((l) => l.id));
            const older = saved['bento.lessons'].filter((l) => !have.has(l.id));
            return older.length ? [...ls, ...settle(older)] : ls;
          }); // lessons older than the newest 60 live only on disk
        if ((diskNewer || !BOOT.has.has('bento.progress')) && saved['bento.progress'])
          setProgress(saved['bento.progress']);
        if ((diskNewer || !BOOT.has.has('bento.settings')) && saved['bento.settings']) {
          setSettingsRaw((s0) => {
            const n = { ...s0, ...saved['bento.settings'] };
            save('bento.settings', n);
            return n;
          });
          if (saved['bento.settings'].onboarded) setOnb(null);
        } // restored settings are kept, and a finished welcome stays finished
        if ((diskNewer || !BOOT.has.has('bento.projects')) && saved['bento.projects']?.length)
          setProjects((ps) => {
            const seen = new Set(ps.map((x) => x.key));
            return [...ps, ...saved['bento.projects'].filter((x) => !seen.has(x.key))];
          });
      })
      .catch(() => {});
  }, [setLessons, setOnb, setProgress, setProjects, setSettingsRaw]);
  // a backup file brings everything back, merged with what's already here (nothing is lost on either side)
  const restoreBackup = (saved) => {
    let added = 0;
    if (Array.isArray(saved['bento.lessons']))
      setLessons((ls) => {
        const have = new Set(ls.map((l) => l.id));
        const more = settle(saved['bento.lessons'].filter((l) => l?.id && !have.has(l.id)));
        added = more.length;
        return [...ls, ...more];
      });
    if (Array.isArray(saved['bento.projects']))
      setProjects((ps) => {
        const seen = new Set(ps.map((x) => x.key));
        return [...ps, ...saved['bento.projects'].filter((x) => x?.key && !seen.has(x.key))];
      });
    const savedProgress = saved['bento.progress'];
    if (savedProgress && typeof savedProgress === 'object')
      setProgress((prev) => {
        const next = { ...prev };
        next.words = { ...(savedProgress.words || {}), ...(prev.words || {}) };
        next.path = { ...(savedProgress.path || {}), ...(prev.path || {}) };
        next.puzzles = { ...(savedProgress.puzzles || {}) };
        for (const [k, r] of Object.entries(prev.puzzles || {})) {
          const o = next.puzzles[k] || {};
          next.puzzles[k] = { ...o, ...r, s: [0, 1, 2].map((i) => !!(o.s?.[i] || r.s?.[i])) };
        }
        next.concepts = { ...(savedProgress.concepts || {}) };
        for (const [k, v] of Object.entries(prev.concepts || {}))
          next.concepts[k] = Math.max(v, next.concepts[k] || 0);
        for (const k of ['sql', 'git', 'design', 'reviewed', 'daily'])
          next[k] = { ...(savedProgress[k] || {}), ...(prev[k] || {}) };
        next.tracks = [
          ...(prev.tracks || []),
          ...(savedProgress.tracks || []).filter(
            (t) => !(prev.tracks || []).some((x) => x.id === t.id),
          ),
        ];
        next.coins = Math.max(prev.coins ?? 5, savedProgress.coins ?? 5);
        return next;
      });
    return added;
  };
  const lessonsRef = useRef(lessons);
  lessonsRef.current = lessons;
  useEffect(() => {
    const t = setTimeout(() => saveLessons(lessons), 400);
    return () => clearTimeout(t);
  }, [lessons]);
  // saving to disk starts or stops failing (a full disk, say): tell the person, once, in plain words
  const [saveTrouble, setSaveTrouble] = useState(null);
  useEffect(() => api.onStoreHealth?.((h) => setSaveTrouble(h?.error || null)), []);
  useEffect(() => {
    const flush = () => saveLessons(lessonsRef.current);
    addEventListener('beforeunload', flush);
    return () => removeEventListener('beforeunload', flush);
  }, []); // never lose the last edit on quit
  useEffect(() => save('bento.progress', progress), [progress]);
  // a change made on another of your devices (your phone, iPad, or the Mac): show the same here
  useEffect(
    () =>
      api.onStoreChanged?.((key, value) => {
        if (key === 'bento.lessons' && Array.isArray(value))
          setLessons((mine) => mergeLessons(mine, value, cancels.current));
        else if (
          key === 'bento.progress' &&
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          setProgress(value);
        else if (
          key === 'bento.settings' &&
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        )
          setSettingsRaw((s0) => {
            const n = { ...s0, ...value };
            save('bento.settings', n);
            return n;
          });
        else if (key === 'bento.projects' && Array.isArray(value))
          setProjects(value.filter((x) => x?.key));
      }),
    [cancels, setLessons, setProgress, setProjects, setSettingsRaw],
  );
  return { lessonsRef, restoreBackup, saveTrouble, setSaveTrouble };
}
