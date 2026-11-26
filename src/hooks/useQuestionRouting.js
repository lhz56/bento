import { useState, useRef, useEffect } from 'react';
import { api } from '../bridge.js';
import {
  projectNames,
  mentionedProject,
  pointsBack,
  namesALesson,
  decide,
} from '../findProject.js';

// Where a question goes. "How does T3 Code work?" names a real project, so it opens that project's code (yours on
// this Mac, one you opened before, or found on GitHub) and asks there; "it" and "this" mean the project you were
// just reading; a topic Bento has a lesson for, or anything else, becomes a new lesson. finding is the search in
// progress, choice the question shown when it's not clear which project you meant.
export default function useQuestionRouting({
  askLesson,
  atlasKey,
  builtins,
  openAtlas,
  openProject,
  project,
  projects,
  view,
}) {
  const [finding, setFinding] = useState(null); // { q, name, id }
  const [choice, setChoice] = useState(null); // { q, o, d }
  const [atlasQ, setAtlasQ] = useState(null); // { key, q, d }
  const findingRef = useRef(null);
  // the project you were just reading: "it" and "this" in your next question mean this project (shown as a chip you can remove)
  const [recent, setRecent] = useState(null); // { key, at }
  const readFile = (proj, f) => api.readFile(proj.root, f);
  const buildContext = async (proj, q, focus) => {
    const files = proj.files || [];
    const manifests = files
      .filter(
        (f) =>
          /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|README\.md|readme\.md|go\.mod|Cargo\.toml)$/.test(
            f,
          ) && f.split('/').length <= 2,
      )
      .slice(0, 3);
    const words = (q.toLowerCase().match(/[a-z]{4,}/g) || []).filter(
      (w) =>
        ![
          'with',
          'that',
          'this',
          'from',
          'when',
          'into',
          'have',
          'make',
          'want',
          'button',
          'should',
        ].includes(w),
    );
    const scored = files
      .filter((f) => /\.(jsx?|tsx?|py|vue|svelte)$/.test(f))
      .map((f) => [f, words.filter((w) => f.toLowerCase().includes(w)).length])
      .filter((x) => x[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map((x) => x[0]);
    const pick = [...new Set([...manifests, ...(focus ? [focus] : []), ...scored])].slice(0, 6);
    const key = [];
    for (const p of pick) {
      try {
        key.push({ path: p, text: await readFile(proj, p) });
      } catch {}
    }
    return {
      name: proj.name,
      files,
      key,
      repo: proj.atlasKey ? proj.name : undefined,
      repoKey: proj.atlasKey,
    };
  };
  useEffect(() => {
    if (view === 'atlas' && atlasKey) setRecent({ key: atlasKey, at: Date.now() });
  }, [view, atlasKey]);
  const recentProject =
    recent && Date.now() - recent.at < 45 * 60e3
      ? projects.find((p) => p.key === recent.key && (p.kind === 'github' || p.kind === 'local'))
      : null;
  // a project you already opened: straight back to it, with the question asked in its conversation
  const goToKnown = (q, p, why) => {
    setChoice(null);
    setAtlasQ({
      key: p.key,
      q,
      d: {
        kind: 'go',
        why,
        pick: { full: p.kind === 'github' ? p.full : null, name: p.name, known: true },
      },
      at: Date.now(),
    });
    setRecent({ key: p.key, at: Date.now() });
    openProject(p);
  };
  const onAsk = async (q, o = {}) => {
    if (o.mode === 'feature' && project) {
      askLesson(q, { mode: 'feature', context: await buildContext(project, q) });
      return;
    }
    if (o.mode === 'code') {
      const code = o.context?.code || q;
      askLesson('', {
        mode: 'code',
        context: { code },
        lang: /^\s*(def |import |from |class \w+:|print\()/m.test(code) ? 'python' : 'javascript',
      });
      return;
    }
    // "how does T3 Code work?": if it's a real project (on this Mac or on GitHub), open its real code and ask there
    if ((o.mode || 'explain') === 'explain' && !o.noRoute) {
      const named = mentionedProject(q, projects);
      if (named) return goToKnown(q, named, 'named');
      if (recentProject && pointsBack(q)) return goToKnown(q, recentProject, 'recent');
    }
    // "how does a binary search tree work?" names a topic Bento has a lesson for, not a project to search GitHub for
    const names =
      (o.mode || 'explain') === 'explain' && !o.noRoute && api.findProject
        ? projectNames(q).filter((n) => !namesALesson(n, builtins))
        : [];
    if (names.length) {
      const id = Date.now();
      findingRef.current = id;
      setChoice(null);
      setFinding({ q, name: names[0], id });
      const found = await Promise.race([
        api.findProject([...names]).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 7000)),
      ]);
      if (findingRef.current !== id) return; // you moved on while it was looking
      findingRef.current = null;
      setFinding(null);
      const d = decide(q, names, found, projects);
      if (d.kind === 'go') return goToProject(q, d);
      if (d.kind === 'ask') {
        setChoice({ q, o, d });
        return;
      }
    }
    askLesson(q, o);
  };
  const goToProject = async (decision, d) => {
    setChoice(null);
    const pick = d.pick || {};
    // already on this Mac: read your copy, nothing to download
    if (pick.local) {
      const r = await api.openLocalProject?.(pick.local.root);
      if (r) {
        setAtlasQ({ key: `local:${r.root}`, q: decision, d, at: Date.now() });
        openAtlas({ kind: 'local', root: r.root, name: pick.full || r.name });
        return;
      }
    }
    // GitHub's size counts the whole history; Bento only fetches the latest code, so don't stop to warn here
    if (pick.full) {
      setAtlasQ({ key: pick.full, q: decision, d, at: Date.now() });
      openAtlas({ kind: 'github', full: pick.full }, { big: true });
      return;
    }
    askLesson(decision, {});
  };
  const cancelFinding = () => {
    findingRef.current = null;
    setFinding(null);
  };
  return {
    atlasQ,
    buildContext,
    cancelFinding,
    choice,
    finding,
    goToProject,
    onAsk,
    recentProject,
    setAtlasQ,
    setChoice,
    setRecent,
  };
}
