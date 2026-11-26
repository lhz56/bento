import { noAI } from '../ai.js';
import {
  filesForQuestion,
  guessRole,
  isOverviewQuestion,
  projectParts,
  searchWords,
} from '../atlas/analyze.js';
import { parseJSONLoose } from '../lesson.js';
import { TOUCH, keys } from '../platform.js';
import Atlas from '../ui/Atlas.jsx';
import { modelLabel } from '../ui/Side.jsx';

// A project taken apart (the Atlas), with everything it can do from there: ask, open files, make a path, go back.
export default function AtlasScreen({
  api,
  asProject,
  askLesson,
  askRepo,
  atlasKey,
  atlasQ,
  atlasRef,
  atlases,
  buildContext,
  makePath,
  narrate,
  openAtlas,
  openCompare,
  pendingFile,
  phone,
  providers,
  setAtlasQ,
  setAtlases,
  setPendingFile,
  setViewRaw,
  settings,
  stopReading,
}) {
  const A = atlases[atlasKey];
  return (
    <Atlas
      key={atlasKey}
      atlas={A}
      asked={atlasQ?.key === A.key ? atlasQ : null}
      onAskedDone={() => setAtlasQ(null)}
      onIdeaInstead={(q) => {
        setAtlasQ(null);
        askLesson(q, { noRoute: true });
      }}
      onMakePath={async (goal) => {
        const id = await makePath(goal);
        if (id) {
          localStorage.setItem('bento.track', id);
          setViewRaw('path');
        }
      }}
      onStopReading={() => stopReading(A.key)}
      onBig={() => {
        setAtlases((m) => {
          const n = { ...m };
          delete n[A.key];
          atlasRef.current = n;
          return n;
        });
        setTimeout(() => openAtlas(A.src, { big: true }), 0);
      }}
      initialFile={pendingFile?.key === A.key ? pendingFile.path : null}
      onInitialFileShown={() => setPendingFile(null)}
      modelLabel={modelLabel(settings.model)}
      readFile={(p) =>
        A.src.root
          ? api.readFile(A.src.root, p)
          : Promise.reject(
              new Error(
                A.fetchError
                  ? `Couldn’t download the code: ${A.fetchError}`
                  : 'Downloading the code… try again in a few seconds.',
              ),
            )
      }
      onAsk={(q, focus) => askRepo(A, q, focus)}
      onPlanIssue={
        noAI(providers)
          ? null
          : async (iss) => {
              const tree = (A.facts?.files || [])
                .filter((f) => f.lang)
                .slice(0, 160)
                .map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`)
                .join('\n');
              const j = parseJSONLoose(
                await api.quick(
                  settings.model,
                  `A ${settings.level} learner wants to make their first open-source contribution by fixing this open issue in ${A.name}${A.narr?.gist?.one ? ` (${A.narr.gist.one})` : ''}.\nISSUE #${iss.n}: ${iss.title}\n${iss.body}\n\nFILES (path — role):\n${tree}\n\nBe encouraging and concrete. Only name files that appear in the list.\nReply JSON: {"plain":"what the issue asks for, in plain words, at most 60 words","files":["2-4 exact paths from the list most likely to change"],"steps":["4-6 short, concrete steps to fix it"],"skills":["2-3 skills they will practise"]}`,
                ),
              );
              return j?.plain
                ? j
                : {
                    err: 'No plan this time. Read the issue on GitHub, then ask about it in the box below.',
                  };
            }
      }
      onOthers={
        providers?.gh
          ? async (p, text) => {
              // find the most telling name in this file, look for it in other public projects, compare the two real files
              const py = /\.py$/.test(p);
              const names = [
                ...text.matchAll(
                  py
                    ? /^(?:async\s+)?def\s+([A-Za-z_]\w{3,})|^class\s+([A-Z]\w{2,})/gm
                    : /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]{3,})/g,
                ),
              ]
                .map((m) => m[1] || m[2])
                .filter((n) => !/^(main|App|Page|Home|Layout|default|handler|GET|POST)$/.test(n));
              const base = p
                .split('/')
                .pop()
                .replace(/\.[^.]+$/, '');
              const query = names[0] ? `${py ? 'def' : 'function'} ${names[0]}` : base;
              const rows = (
                await api.ghCode(
                  query,
                  py ? 'python' : /\.tsx?$/.test(p) ? 'typescript' : 'javascript',
                )
              ).filter((r) => r.repo.toLowerCase() !== (A.src.full || '').toLowerCase());
              if (!rows.length)
                throw new Error(`No other public project found using “${names[0] || base}”.`);
              const other = rows[0];
              const otherText = await api.ghFile(other.repo, other.path);
              askLesson(
                `How do ${A.name.split('/').pop()} and ${other.repo.split('/').pop()} each write ${names[0] ? `\`${names[0]}\`` : `their ${base}`}?`,
                {
                  mode: 'compare',
                  lang: py ? 'python' : 'javascript',
                  context: {
                    a: {
                      repo: A.name,
                      repoKey: A.key,
                      gist: A.narr?.gist?.one,
                      key: [{ path: p, text: text.slice(0, 8000) }],
                      files: [],
                    },
                    b: {
                      repo: other.repo,
                      key: [{ path: other.path, text: String(otherText).slice(0, 8000) }],
                      files: [],
                    },
                  },
                },
              );
            }
          : null
      }
      onQuick={async (q, history = []) => {
        // an overview question reads the README and the top file of each main part; others read the best-matching files
        const overview = !history.length && isOverviewQuestion(q);
        const mainParts = overview ? projectParts(A.facts, 8) : [];
        // specific questions: files whose names match, plus files whose contents mention the words (searched on this Mac)
        const asked = [q, ...history.slice(-2).map((h) => h.q)].join(' ');
        const byName = overview ? [] : filesForQuestion(A.facts, A.narr, asked);
        const code = A.facts.files
          .filter((f) => f.lang && f.sub !== 'tests' && f.sub !== 'docs')
          .map((f) => f.p);
        const hits =
          overview || !api.atlasSearch
            ? []
            : await api.atlasSearch(A.src.root, searchWords(asked), code).catch(() => []);
        const at = new Map(hits.map((h) => [h.p, h.at]));
        // cover every part of the question ("Claude or Codex" needs both), at most 2 files from one folder
        const chosen = [];
        const seen = new Set();
        const perDir = {};
        while (chosen.length < 3) {
          const dirOf = (h) => h.p.split('/').slice(0, -1).join('/');
          const best = hits
            .filter((h) => !chosen.includes(h) && (perDir[dirOf(h)] || 0) < 2)
            .map((h) => [
              h,
              h.score * (1 + 1.5 * (h.words || []).filter((w) => !seen.has(w)).length),
            ])
            .sort((a, b) => b[1] - a[1])[0]?.[0];
          if (!best) break;
          chosen.push(best);
          (best.words || []).forEach((w) => seen.add(w));
          perDir[dirOf(best)] = (perDir[dirOf(best)] || 0) + 1;
        }
        const paths = overview
          ? mainParts.slice(0, 4).map((x) => x.top.p)
          : [...new Set([...chosen.map((h) => h.p), ...byName.slice(0, 2)])].slice(0, 4);
        const parts = [];
        for (const p of paths) {
          try {
            const text = await api.readFile(A.src.root, p);
            const k = at.get(p) ?? 0;
            // show the part of the file where the words are, not just its first lines
            const from = k > 3500 ? Math.max(0, text.lastIndexOf('\n', k - 1500)) : 0;
            parts.push(
              `--- ${p}${from ? ` (from character ${from})` : ''} ---\n${text.slice(from, from + 5000)}`,
            );
          } catch {}
        }
        // the map of the project: every main part, then the files next to the ones being read
        const near = new Set(paths.map((p) => p.split('/').slice(0, -1).join('/')));
        const files = A.facts.files.filter((f) => f.lang);
        const tree =
          files.length <= 150
            ? files.map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`).join('\n')
            : `${projectParts(A.facts, 14)
                .map((x) => `${x.area}/ — ${x.files} code files`)
                .join('\n')}\n…\n${files
                .filter((f) => near.has(f.p.split('/').slice(0, -1).join('/')))
                .slice(0, 60)
                .map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`)
                .join('\n')}`;
        const big = overview
          ? `\nREADME (start):\n${String(A.facts.readme || '').slice(0, 2500)}\n\nMAIN PARTS (folder — code files, lines, its most-used file):\n${mainParts.map((x) => `${x.area} — ${x.files} files, ${x.lines} lines, ${x.top.p}`).join('\n')}\n`
          : '';
        const j = parseJSONLoose(
          await api.quick(
            settings.model,
            `A ${settings.level} learner is studying the repository ${A.name}${A.narr?.gist?.one ? ` (${A.narr.gist.one})` : ''} and asks: ${q}${big}\n${
              history.length
                ? `\nEARLIER IN THIS CONVERSATION (answer the new question in that light):\n${history
                    .slice(-3)
                    .map((h) => `Q: ${h.q}\nA: ${String(h.a || '').slice(0, 600)}`)
                    .join('\n')}\n`
                : ''
            }\nFILES (path — role):\n${tree}\n\nMOST RELEVANT FILES:\n${parts.join('\n\n')}\n\nAnswer in at most ${overview ? 150 : 110} words, plainly, naming real files in backticks. Only say what the code supports.${overview ? ' This is a general question: start with one sentence on what the project is, then how its main parts fit together.' : ' Answer just this question; do not introduce the project again.'}\nReply JSON: {"answer":"...","files":["exact paths you referred to, max 4"]}`,
          ),
        );
        return {
          a:
            j?.answer ||
            (phone || TOUCH
              ? 'No answer this time. Turn it into a full lesson below.'
              : `No answer this time. Try a full lesson (${keys('⌘↵')}).`),
          files: j?.files || paths,
        };
      }}
      onExplainFile={(p, text) =>
        askLesson(`Explain ${p}`, {
          mode: 'code',
          context: { code: text, path: p, repo: A.name, repoKey: A.key },
          lang: /\.py$/.test(p) ? 'python' : 'javascript',
        })
      }
      onFeature={async (q) =>
        askLesson(q, {
          mode: 'feature',
          context: await buildContext(asProject(A), q),
          lang:
            Object.keys(A.facts.langs).includes('Python') &&
            !Object.keys(A.facts.langs).some((l) => /Script/.test(l))
              ? 'python'
              : 'javascript',
        })
      }
      onRefresh={async () => {
        if (A.src.kind === 'github') await api.atlasRefresh(A.src.full);
        else await api.cachePut(A.key, null);
        setAtlases((m) => {
          const n = { ...m };
          delete n[A.key];
          atlasRef.current = n;
          return n;
        });
        setTimeout(
          () => openAtlas(A.src.kind === 'github' ? { kind: 'github', full: A.src.full } : A.src),
          0,
        );
      }}
      onBuild={(mini) =>
        askLesson(mini, {
          mode: 'build',
          lang: (() => {
            const ls = Object.entries(A.facts.langs).sort((a, b) => b[1] - a[1]);
            const top = ls[0]?.[0];
            const ui = A.facts.files.filter((f) => f.layer === 'ui' && f.lang).length;
            const code = A.facts.files.filter((f) => f.lang && f.layer !== 'support').length || 1;
            return top === 'Python'
              ? 'python'
              : /Script|HTML|CSS|Vue|Svelte|Astro/.test(top || '') && ui / code > 0.3
                ? 'html'
                : top === 'TypeScript'
                  ? 'typescript'
                  : 'javascript';
          })(),
          context: {
            inspired: A.name,
            gist: A.narr?.gist?.one,
            repoKey: A.key,
            repo: A.name,
          },
        })
      }
      onCompare={() => openCompare(A.key)}
      onFork={() => api.ghFork(A.src.full)}
      onOpenUrl={(u) => api.openExternal(u)}
      onRetry={() =>
        A.facts
          ? narrate(A.key)
          : (setAtlases((m) => {
              const n = { ...m };
              delete n[A.key];
              atlasRef.current = n;
              return n;
            }),
            setTimeout(() => openAtlas(A.src), 0))
      }
    />
  );
}
