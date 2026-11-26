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
  const atlas = atlases[atlasKey];
  return (
    <Atlas
      key={atlasKey}
      atlas={atlas}
      asked={atlasQ?.key === atlas.key ? atlasQ : null}
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
      onStopReading={() => stopReading(atlas.key)}
      onBig={() => {
        setAtlases((m) => {
          const n = { ...m };
          delete n[atlas.key];
          atlasRef.current = n;
          return n;
        });
        setTimeout(() => openAtlas(atlas.src, { big: true }), 0);
      }}
      initialFile={pendingFile?.key === atlas.key ? pendingFile.path : null}
      onInitialFileShown={() => setPendingFile(null)}
      modelLabel={modelLabel(settings.model)}
      readFile={(filePath) =>
        atlas.src.root
          ? api.readFile(atlas.src.root, filePath)
          : Promise.reject(
              new Error(
                atlas.fetchError
                  ? `Couldn’t download the code: ${atlas.fetchError}`
                  : 'Downloading the code… try again in a few seconds.',
              ),
            )
      }
      onAsk={(q, focus) => askRepo(atlas, q, focus)}
      onPlanIssue={
        noAI(providers)
          ? null
          : async (iss) => {
              const tree = (atlas.facts?.files || [])
                .filter((f) => f.lang)
                .slice(0, 160)
                .map((f) => `${f.p} — ${atlas.narr?.roles?.[f.p] || guessRole(f)}`)
                .join('\n');
              const j = parseJSONLoose(
                await api.quick(
                  settings.model,
                  `A ${settings.level} learner wants to make their first open-source contribution by fixing this open issue in ${atlas.name}${atlas.narr?.gist?.one ? ` (${atlas.narr.gist.one})` : ''}.\nISSUE #${iss.n}: ${iss.title}\n${iss.body}\n\nFILES (path — role):\n${tree}\n\nBe encouraging and concrete. Only name files that appear in the list.\nReply JSON: {"plain":"what the issue asks for, in plain words, at most 60 words","files":["2-4 exact paths from the list most likely to change"],"steps":["4-6 short, concrete steps to fix it"],"skills":["2-3 skills they will practise"]}`,
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
          ? async (filePath, text) => {
              // find the most telling name in this file, look for it in other public projects, compare the two real files
              const py = /\.py$/.test(filePath);
              const names = [
                ...text.matchAll(
                  py
                    ? /^(?:async\s+)?def\s+([A-Za-z_]\w{3,})|^class\s+([A-Z]\w{2,})/gm
                    : /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]{3,})/g,
                ),
              ]
                .map((m) => m[1] || m[2])
                .filter((n) => !/^(main|App|Page|Home|Layout|default|handler|GET|POST)$/.test(n));
              const base = filePath
                .split('/')
                .pop()
                .replace(/\.[^.]+$/, '');
              const query = names[0] ? `${py ? 'def' : 'function'} ${names[0]}` : base;
              const rows = (
                await api.ghCode(
                  query,
                  py ? 'python' : /\.tsx?$/.test(filePath) ? 'typescript' : 'javascript',
                )
              ).filter((r) => r.repo.toLowerCase() !== (atlas.src.full || '').toLowerCase());
              if (!rows.length)
                throw new Error(`No other public project found using “${names[0] || base}”.`);
              const other = rows[0];
              const otherText = await api.ghFile(other.repo, other.path);
              askLesson(
                `How do ${atlas.name.split('/').pop()} and ${other.repo.split('/').pop()} each write ${names[0] ? `\`${names[0]}\`` : `their ${base}`}?`,
                {
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
              );
            }
          : null
      }
      onQuick={async (question, history = []) => {
        // an overview question reads the README and the top file of each main part; others read the best-matching files
        const overview = !history.length && isOverviewQuestion(question);
        const mainParts = overview ? projectParts(atlas.facts, 8) : [];
        // specific questions: files whose names match, plus files whose contents mention the words (searched on this Mac)
        const asked = [question, ...history.slice(-2).map((h) => h.q)].join(' ');
        const byName = overview ? [] : filesForQuestion(atlas.facts, atlas.narr, asked);
        const code = atlas.facts.files
          .filter((f) => f.lang && f.sub !== 'tests' && f.sub !== 'docs')
          .map((f) => f.p);
        const hits =
          overview || !api.atlasSearch
            ? []
            : await api.atlasSearch(atlas.src.root, searchWords(asked), code).catch(() => []);
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
        for (const path of paths) {
          try {
            const text = await api.readFile(atlas.src.root, path);
            const hit = at.get(path) ?? 0;
            // show the part of the file where the words are, not just its first lines
            const from = hit > 3500 ? Math.max(0, text.lastIndexOf('\n', hit - 1500)) : 0;
            parts.push(
              `--- ${path}${from ? ` (from character ${from})` : ''} ---\n${text.slice(from, from + 5000)}`,
            );
          } catch {}
        }
        // the map of the project: every main part, then the files next to the ones being read
        const near = new Set(paths.map((p) => p.split('/').slice(0, -1).join('/')));
        const files = atlas.facts.files.filter((f) => f.lang);
        const tree =
          files.length <= 150
            ? files.map((f) => `${f.p} — ${atlas.narr?.roles?.[f.p] || guessRole(f)}`).join('\n')
            : `${projectParts(atlas.facts, 14)
                .map((x) => `${x.area}/ — ${x.files} code files`)
                .join('\n')}\n…\n${files
                .filter((f) => near.has(f.p.split('/').slice(0, -1).join('/')))
                .slice(0, 60)
                .map((f) => `${f.p} — ${atlas.narr?.roles?.[f.p] || guessRole(f)}`)
                .join('\n')}`;
        const big = overview
          ? `\nREADME (start):\n${String(atlas.facts.readme || '').slice(0, 2500)}\n\nMAIN PARTS (folder — code files, lines, its most-used file):\n${mainParts.map((x) => `${x.area} — ${x.files} files, ${x.lines} lines, ${x.top.p}`).join('\n')}\n`
          : '';
        const j = parseJSONLoose(
          await api.quick(
            settings.model,
            `A ${settings.level} learner is studying the repository ${atlas.name}${atlas.narr?.gist?.one ? ` (${atlas.narr.gist.one})` : ''} and asks: ${question}${big}\n${
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
          context: { code: text, path: p, repo: atlas.name, repoKey: atlas.key },
          lang: /\.py$/.test(p) ? 'python' : 'javascript',
        })
      }
      onFeature={async (question) =>
        askLesson(question, {
          mode: 'feature',
          context: await buildContext(asProject(atlas), question),
          lang:
            Object.keys(atlas.facts.langs).includes('Python') &&
            !Object.keys(atlas.facts.langs).some((l) => /Script/.test(l))
              ? 'python'
              : 'javascript',
        })
      }
      onRefresh={async () => {
        if (atlas.src.kind === 'github') await api.atlasRefresh(atlas.src.full);
        else await api.cachePut(atlas.key, null);
        setAtlases((m) => {
          const n = { ...m };
          delete n[atlas.key];
          atlasRef.current = n;
          return n;
        });
        setTimeout(
          () =>
            openAtlas(
              atlas.src.kind === 'github' ? { kind: 'github', full: atlas.src.full } : atlas.src,
            ),
          0,
        );
      }}
      onBuild={(mini) =>
        askLesson(mini, {
          mode: 'build',
          lang: (() => {
            const ls = Object.entries(atlas.facts.langs).sort((a, b) => b[1] - a[1]);
            const top = ls[0]?.[0];
            const ui = atlas.facts.files.filter((f) => f.layer === 'ui' && f.lang).length;
            const code =
              atlas.facts.files.filter((f) => f.lang && f.layer !== 'support').length || 1;
            return top === 'Python'
              ? 'python'
              : /Script|HTML|CSS|Vue|Svelte|Astro/.test(top || '') && ui / code > 0.3
                ? 'html'
                : top === 'TypeScript'
                  ? 'typescript'
                  : 'javascript';
          })(),
          context: {
            inspired: atlas.name,
            gist: atlas.narr?.gist?.one,
            repoKey: atlas.key,
            repo: atlas.name,
          },
        })
      }
      onCompare={() => openCompare(atlas.key)}
      onFork={() => api.ghFork(atlas.src.full)}
      onOpenUrl={(u) => api.openExternal(u)}
      onRetry={() =>
        atlas.facts
          ? narrate(atlas.key)
          : (setAtlases((m) => {
              const n = { ...m };
              delete n[atlas.key];
              atlasRef.current = n;
              return n;
            }),
            setTimeout(() => openAtlas(atlas.src), 0))
      }
    />
  );
}
