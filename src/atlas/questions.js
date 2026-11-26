// Asking about a project you've taken apart (the Atlas): a quick question answered from the files that matter, a
// plan for fixing one of its open issues, and finding how another public project writes the same thing. Each
// function gets the bridge calls it needs as arguments, so it can be tested without the app.
import { parseJSONLoose } from '../lesson.js';
import {
  filesForQuestion,
  guessRole,
  isOverviewQuestion,
  projectParts,
  searchWords,
} from './analyze.js';

/**
 * @typedef {(model: string, prompt: string) => Promise<string>} Quick
 * @typedef {{ p: string, lang?: string, sub?: string, layer?: string }} FileFact
 * @typedef {{ files: FileFact[], readme?: string, langs: Record<string, number> }} Facts
 * @typedef {{ key: string, name: string, src: { root?: string, full?: string, kind?: string },
 *   facts: Facts, narr?: { gist?: { one?: string }, roles?: Record<string, string> } }} Atlas
 * @typedef {{ p: string, at?: number, score: number, words?: string[] }} SearchHit
 * @typedef {{ q: string, a?: string }} Turn
 */

const folderOf = (filePath) => filePath.split('/').slice(0, -1).join('/');
const gistOf = (atlas) => (atlas.narr?.gist?.one ? ` (${atlas.narr.gist.one})` : '');
/** @param {Atlas} atlas @param {FileFact} file */
const fileLine = (atlas, file) => `${file.p} — ${atlas.narr?.roles?.[file.p] || guessRole(file)}`;

/**
 * Up to `max` search hits that together cover every word of the question ("Claude or Codex" needs a file for
 * each), with at most 2 from one folder. Each pick favours hits that bring words not covered yet.
 * @param {SearchHit[]} hits
 * @returns {SearchHit[]}
 */
export function pickFiles(hits, max = 3) {
  const chosen = [];
  const covered = new Set();
  const perFolder = {};
  while (chosen.length < max) {
    let best = null;
    let bestScore = -Infinity;
    for (const hit of hits) {
      if (chosen.includes(hit) || (perFolder[folderOf(hit.p)] || 0) >= 2) continue;
      const score = hit.score * (1 + 1.5 * (hit.words || []).filter((w) => !covered.has(w)).length);
      if (score > bestScore) [best, bestScore] = [hit, score];
    }
    if (!best) break;
    chosen.push(best);
    (best.words || []).forEach((w) => covered.add(w));
    perFolder[folderOf(best.p)] = (perFolder[folderOf(best.p)] || 0) + 1;
  }
  return chosen;
}

// the part of a file where the words were found (not just its first lines), at most 5,000 characters
export function excerpt(filePath, text, hitAt = 0) {
  const from = hitAt > 3500 ? Math.max(0, text.lastIndexOf('\n', hitAt - 1500)) : 0;
  return `--- ${filePath}${from ? ` (from character ${from})` : ''} ---\n${text.slice(from, from + 5000)}`;
}

// the map of the project a tutor reads: every file with its role, or for a big project its main parts and the
// files next to the ones being read
/** @param {Atlas} atlas @param {string[]} reading */
export function projectMap(atlas, reading) {
  const files = atlas.facts.files.filter((f) => f.lang);
  if (files.length <= 150) return files.map((f) => fileLine(atlas, f)).join('\n');
  const near = new Set(reading.map(folderOf));
  return `${projectParts(atlas.facts, 14)
    .map((part) => `${part.area}/ — ${part.files} code files`)
    .join('\n')}\n…\n${files
    .filter((f) => near.has(folderOf(f.p)))
    .slice(0, 60)
    .map((f) => fileLine(atlas, f))
    .join('\n')}`;
}

/**
 * A question about the project, answered in a few sentences from its real files. An overview question ("what is
 * this?") reads the README and the top file of each main part; others read the files that match best.
 * @param {{ quick: Quick, model: string, level: string, atlas: Atlas, question: string, history?: Turn[],
 *   readFile: (root: string, path: string) => Promise<string>,
 *   search?: (root: string, words: string[], files: string[]) => Promise<SearchHit[]>, noAnswer: string }} args
 * @returns {Promise<{ a: string, files: string[] }>}
 */
export async function answerAboutProject({
  quick,
  model,
  level,
  atlas,
  question,
  history = [],
  readFile,
  search,
  noAnswer,
}) {
  const overview = !history.length && isOverviewQuestion(question);
  const mainParts = overview ? projectParts(atlas.facts, 8) : [];
  // specific questions: files whose names match, plus files whose contents mention the words (searched on this Mac)
  const asked = [question, ...history.slice(-2).map((turn) => turn.q)].join(' ');
  const byName = overview ? [] : filesForQuestion(atlas.facts, atlas.narr, asked);
  const code = atlas.facts.files
    .filter((f) => f.lang && f.sub !== 'tests' && f.sub !== 'docs')
    .map((f) => f.p);
  const hits =
    overview || !search
      ? []
      : await search(atlas.src.root, searchWords(asked), code).catch(() => []);
  const hitAt = new Map(hits.map((hit) => [hit.p, hit.at]));
  const paths = overview
    ? mainParts.slice(0, 4).map((part) => part.top.p)
    : [...new Set([...pickFiles(hits).map((hit) => hit.p), ...byName.slice(0, 2)])].slice(0, 4);
  const excerpts = [];
  for (const path of paths) {
    try {
      excerpts.push(excerpt(path, await readFile(atlas.src.root, path), hitAt.get(path) ?? 0));
    } catch {}
  }
  const overviewText = overview
    ? `\nREADME (start):\n${String(atlas.facts.readme || '').slice(0, 2500)}\n\nMAIN PARTS (folder — code files, lines, its most-used file):\n${mainParts.map((part) => `${part.area} — ${part.files} files, ${part.lines} lines, ${part.top.p}`).join('\n')}\n`
    : '';
  const earlier = history.length
    ? `\nEARLIER IN THIS CONVERSATION (answer the new question in that light):\n${history
        .slice(-3)
        .map((turn) => `Q: ${turn.q}\nA: ${String(turn.a || '').slice(0, 600)}`)
        .join('\n')}\n`
    : '';
  const reply = parseJSONLoose(
    await quick(
      model,
      `A ${level} learner is studying the repository ${atlas.name}${gistOf(atlas)} and asks: ${question}${overviewText}\n${earlier}\nFILES (path — role):\n${projectMap(atlas, paths)}\n\nMOST RELEVANT FILES:\n${excerpts.join('\n\n')}\n\nAnswer in at most ${overview ? 150 : 110} words, plainly, naming real files in backticks. Only say what the code supports.${overview ? ' This is a general question: start with one sentence on what the project is, then how its main parts fit together.' : ' Answer just this question; do not introduce the project again.'}\nReply JSON: {"answer":"...","files":["exact paths you referred to, max 4"]}`,
    ),
  );
  return { a: reply?.answer || noAnswer, files: reply?.files || paths };
}

/**
 * A first open-source contribution: what an open issue asks for, the files likely to change, and the steps.
 * @param {{ quick: Quick, model: string, level: string, atlas: Atlas,
 *   issue: { n: number, title: string, body: string } }} args
 */
export async function planIssue({ quick, model, level, atlas, issue }) {
  const files = (atlas.facts?.files || [])
    .filter((f) => f.lang)
    .slice(0, 160)
    .map((f) => fileLine(atlas, f))
    .join('\n');
  const reply = parseJSONLoose(
    await quick(
      model,
      `A ${level} learner wants to make their first open-source contribution by fixing this open issue in ${atlas.name}${gistOf(atlas)}.\nISSUE #${issue.n}: ${issue.title}\n${issue.body}\n\nFILES (path — role):\n${files}\n\nBe encouraging and concrete. Only name files that appear in the list.\nReply JSON: {"plain":"what the issue asks for, in plain words, at most 60 words","files":["2-4 exact paths from the list most likely to change"],"steps":["4-6 short, concrete steps to fix it"],"skills":["2-3 skills they will practise"]}`,
    ),
  );
  return reply?.plain
    ? reply
    : { err: 'No plan this time. Read the issue on GitHub, then ask about it in the box below.' };
}

// the most telling names a file defines (functions and classes), leaving out ones every project has
export function definedNames(filePath, text) {
  const py = /\.py$/.test(filePath);
  return [
    ...text.matchAll(
      py
        ? /^(?:async\s+)?def\s+([A-Za-z_]\w{3,})|^class\s+([A-Z]\w{2,})/gm
        : /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]{3,})/g,
    ),
  ]
    .map((m) => m[1] || m[2])
    .filter((name) => !/^(main|App|Page|Home|Layout|default|handler|GET|POST)$/.test(name));
}

/**
 * How another public project writes the same thing: search GitHub for the file's most telling name, read the
 * first match, and return a Compare lesson's question and context for the two real files.
 * @param {{ atlas: Atlas, filePath: string, text: string,
 *   searchCode: (query: string, language: string) => Promise<Array<{ repo: string, path: string }>>,
 *   readGitHubFile: (repo: string, path: string) => Promise<string> }} args
 */
export async function compareWithOthers({ atlas, filePath, text, searchCode, readGitHubFile }) {
  const py = /\.py$/.test(filePath);
  const names = definedNames(filePath, text);
  const base = filePath
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '');
  const query = names[0] ? `${py ? 'def' : 'function'} ${names[0]}` : base;
  const rows = (
    await searchCode(query, py ? 'python' : /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript')
  ).filter((row) => row.repo.toLowerCase() !== (atlas.src.full || '').toLowerCase());
  if (!rows.length) throw new Error(`No other public project found using “${names[0] || base}”.`);
  const other = rows[0];
  const otherText = await readGitHubFile(other.repo, other.path);
  return {
    question: `How do ${atlas.name.split('/').pop()} and ${other.repo.split('/').pop()} each write ${names[0] ? `\`${names[0]}\`` : `their ${base}`}?`,
    options: {
      mode: 'compare',
      lang: py ? 'python' : 'javascript',
      context: {
        a: {
          repo: atlas.name,
          repoKey: atlas.key,
          gist: atlas.narr?.gist?.one,
          key: [{ path: filePath, text: text.slice(0, 8000) }],
          files: [],
        },
        b: {
          repo: other.repo,
          key: [{ path: other.path, text: String(otherText).slice(0, 8000) }],
          files: [],
        },
      },
    },
  };
}

// the language a lesson about this project is written in: Python for a Python-only project, else JavaScript
/** @param {Facts} facts */
export const lessonLanguage = (facts) =>
  Object.keys(facts.langs).includes('Python') &&
  !Object.keys(facts.langs).some((lang) => /Script/.test(lang))
    ? 'python'
    : 'javascript';

// the language for building a mini version of it: its main language, or a web page for a mostly-UI web project
/** @param {Facts} facts */
export function buildLanguage(facts) {
  const top = Object.entries(facts.langs).sort((a, b) => b[1] - a[1])[0]?.[0];
  const ui = facts.files.filter((f) => f.layer === 'ui' && f.lang).length;
  const code = facts.files.filter((f) => f.lang && f.layer !== 'support').length || 1;
  if (top === 'Python') return 'python';
  if (/Script|HTML|CSS|Vue|Svelte|Astro/.test(top || '') && ui / code > 0.3) return 'html';
  return top === 'TypeScript' ? 'typescript' : 'javascript';
}
