// A project taken apart (the Atlas), with everything it can do from there: ask, open files, make a path, go back.
import { noAI } from '../ai.js';
import {
  answerAboutProject,
  buildLanguage,
  compareWithOthers,
  lessonLanguage,
  planIssue,
} from '../atlas/questions.js';
import { TOUCH, keys } from '../platform.js';
import Atlas from '../ui/Atlas.jsx';
import { modelLabel } from '../ui/Side.jsx';

export default function AtlasScreen({
  api,
  asProject,
  askLesson,
  askRepo,
  atlasKey,
  atlasQ,
  atlases,
  buildContext,
  makePath,
  narrate,
  reopenAtlas,
  openCompare,
  pendingFile,
  phone,
  providers,
  setAtlasQ,
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
      onBig={() => reopenAtlas(atlas.key, atlas.src, { big: true })}
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
          : (issue) =>
              planIssue({
                quick: api.quick,
                model: settings.model,
                level: settings.level,
                atlas,
                issue,
              })
      }
      onOthers={
        providers?.gh
          ? async (filePath, text) => {
              const { question, options } = await compareWithOthers({
                atlas,
                filePath,
                text,
                searchCode: api.ghCode,
                readGitHubFile: api.ghFile,
              });
              askLesson(question, options);
            }
          : null
      }
      onQuick={(question, history = []) =>
        answerAboutProject({
          quick: api.quick,
          model: settings.model,
          level: settings.level,
          atlas,
          question,
          history,
          readFile: api.readFile,
          search: api.atlasSearch,
          noAnswer:
            phone || TOUCH
              ? 'No answer this time. Turn it into a full lesson below.'
              : `No answer this time. Try a full lesson (${keys('⌘↵')}).`,
        })
      }
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
          lang: lessonLanguage(atlas.facts),
        })
      }
      onRefresh={async () => {
        if (atlas.src.kind === 'github') await api.atlasRefresh(atlas.src.full);
        else await api.cachePut(atlas.key, null);
        reopenAtlas(
          atlas.key,
          atlas.src.kind === 'github' ? { kind: 'github', full: atlas.src.full } : atlas.src,
        );
      }}
      onBuild={(mini) =>
        askLesson(mini, {
          mode: 'build',
          lang: buildLanguage(atlas.facts),
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
      onRetry={() => (atlas.facts ? narrate(atlas.key) : reopenAtlas(atlas.key, atlas.src))}
    />
  );
}
