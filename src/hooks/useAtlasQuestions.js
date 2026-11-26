import { filesForQuestion, guessRole } from '../atlas/analyze.js';
import { api } from '../bridge.js';
import { FEATURED } from './useLibrary.js';

// Questions about whole projects: comparing two of them side by side (Compare), and asking about one project's
// code, answered from the files that matter for the question.
export default function useAtlasQuestions({ askLesson, projects, setPair, setViewRaw }) {
  const compareAsk = async (atlasA, atlasB, q) => {
    const side = async (site) => {
      const key = [];
      for (const p of filesForQuestion(site.facts, site.narr, q).slice(0, 2)) {
        try {
          key.push({ path: p, text: (await api.readFile(site.src.root, p)).slice(0, 8000) });
        } catch {}
      }
      return {
        repo: site.name,
        repoKey: site.key,
        gist: site.narr?.gist?.one,
        key,
        files: site.facts.files
          .filter((f) => f.lang)
          .slice(0, 80)
          .map((f) => `${f.p} — ${site.narr?.roles?.[f.p] || guessRole(f)}`),
      };
    };
    const [a, b] = await Promise.all([side(atlasA), side(atlasB)]);
    const py = (site) => Object.keys(site.facts.langs)[0] === 'Python';
    askLesson(q, {
      mode: 'compare',
      lang: py(atlasA) && py(atlasB) ? 'python' : 'javascript',
      context: { a, b },
    });
  };
  const openCompare = (first) => {
    setPair((p) => {
      const apps = projects.filter((x) => x.kind !== 'site');
      const a = first || p[0] || apps[0]?.key || null;
      const b =
        p[1] && p[1] !== a
          ? p[1]
          : apps.find((x) => x.key !== a)?.key ||
            Object.keys(FEATURED).find((k) => k !== a) ||
            null;
      return [a, b];
    });
    setViewRaw('compare');
  };
  // questions about a repo become lessons built on its real files
  const askRepo = async (atlas, q, focus) => {
    const paths = focus
      ? [
          focus,
          ...filesForQuestion(atlas.facts, atlas.narr, q)
            .filter((x) => x !== focus)
            .slice(0, 2),
        ]
      : filesForQuestion(atlas.facts, atlas.narr, q);
    const key = [];
    for (const p of paths) {
      try {
        const t = await api.readFile(atlas.src.root, p);
        key.push({ path: p, text: t.slice(0, 12000) });
      } catch {}
    }
    const tree = atlas.facts.files
      .filter((f) => f.lang || f.layer !== 'support')
      .slice(0, 200)
      .map((f) => `${f.p} — ${atlas.narr?.roles?.[f.p] || guessRole(f)}`);
    const lang = /\.py$/.test(paths[0] || '') ? 'python' : 'javascript';
    askLesson(q, {
      mode: 'code',
      lang,
      context: {
        repo: atlas.name,
        repoKey: atlas.key,
        gist: atlas.narr?.gist?.one,
        files: tree,
        key,
        code: key[0]?.text || '',
        path: key[0]?.path,
      },
    });
  };
  return { askRepo, compareAsk, openCompare };
}
