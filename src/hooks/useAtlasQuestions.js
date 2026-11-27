// Questions about whole projects: comparing two of them side by side (Compare), and asking about one project's
// code, answered from the files that matter for the question.
import { filesForQuestion, guessRole } from '../atlas/analyze.js';
import { api } from '../bridge.js';
import { FEATURED } from './useLibrary.js';

export default function useAtlasQuestions({ askLesson, projects, setPair, setViewRaw }) {
  const compareAsk = async (atlasA, atlasB, question) => {
    const side = async (site) => {
      const key = [];
      for (const p of filesForQuestion(site.facts, site.narr, question).slice(0, 2)) {
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
    const [sideA, sideB] = await Promise.all([side(atlasA), side(atlasB)]);
    const py = (site) => Object.keys(site.facts.langs)[0] === 'Python';
    askLesson(question, {
      mode: 'compare',
      lang: py(atlasA) && py(atlasB) ? 'python' : 'javascript',
      context: { a: sideA, b: sideB },
    });
  };
  const openCompare = (first) => {
    setPair((prev) => {
      const apps = projects.filter((x) => x.kind !== 'site');
      const left = first || prev[0] || apps[0]?.key || null;
      const right =
        prev[1] && prev[1] !== left
          ? prev[1]
          : apps.find((x) => x.key !== left)?.key ||
            Object.keys(FEATURED).find((k) => k !== left) ||
            null;
      return [left, right];
    });
    setViewRaw('compare');
  };
  // questions about a repo become lessons built on its real files
  const askRepo = async (atlas, question, focus) => {
    const paths = focus
      ? [
          focus,
          ...filesForQuestion(atlas.facts, atlas.narr, question)
            .filter((x) => x !== focus)
            .slice(0, 2),
        ]
      : filesForQuestion(atlas.facts, atlas.narr, question);
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
    askLesson(question, {
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
