import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  SAMPLES,
  CHALLENGE,
  emptyLesson,
  applyBlock,
  ndjsonParser,
  buildPrompt,
  parseJSONLoose,
} from './lesson.js';
import { lessonFromAgent, describeRun, describeView, agentName } from './agent.js';
import { tidyLesson } from './verify.js'; // when a lesson finishes: slipped plain English is written again, slipped line links moved back
import { projectNames, decide, mentionedProject, pointsBack, namesALesson } from './findProject.js';
import { explainToken } from './explain.js';
import { pyState, warmPython } from './runtime/runner.js';
import Home from './ui/Home.jsx';
import Explore, { parseBlob, parseRepo, parseSite } from './ui/Explore.jsx';
import Ideas from './ui/Ideas.jsx';
import Onboarding from './ui/Onboarding.jsx';
import Words from './ui/Words.jsx';
import Palette from './ui/Palette.jsx';
import Compare from './ui/Compare.jsx';
import Path from './ui/Path.jsx';
import Settings from './ui/Settings.jsx';
import Site from './ui/Site.jsx';
import Coach from './ui/Coach.jsx';
import Puzzles from './ui/Puzzles.jsx';
import { puzzleLesson, codeParts, codeOf, englishMap } from './puzzles.js';
import { setUILanguage, useT, t } from './i18n.js';
import SkillMap from './ui/SkillMap.jsx';
import Playgrounds from './ui/Playgrounds.jsx';
import PathBar from './ui/PathBar.jsx';
import { masteryOf, SKILLS, REGIONS, isFading, skillsFor } from './skills.js';
import { loadPacks, savePacks, validatePack, applyPacks } from './packs.js';
import { PUZZLES } from './puzzles.js';
import { RACES } from './races.js';
import { ideaById, IDEAS } from './ideas.js';
import { PRE, loadPrebuilt } from './prebuilt.js'; // lessons that ship already written, loaded just after the first screen
import FindBar from './ui/FindBar.jsx';
import KeySheet from './ui/KeySheet.jsx';
import LessonScreen from './screens/LessonScreen.jsx';
import AtlasScreen from './screens/AtlasScreen.jsx';
import { ALL_STOPS, tracksWith, stopSkills } from './paths.js';
import { noAI, altOf } from './ai.js';
import { Sidebar, modelLabel, groupOf, rememberTab, lastTab, GROUPS } from './ui/Side.jsx';
import Icon from './ui/Icons.jsx';
import { filesForQuestion, guessRole } from './atlas/analyze.js';
import { mockBridge } from './mock.js';
import { WEB, needsMac, countOnce } from './web.js';
import useLibrary, { FEATURED } from './hooks/useLibrary.js';
import { load, save, saveLessons, cleanErr } from './store.js';
import { mergeLessons } from './sync.js';
import {
  useNarrow,
  TopBar,
  TabBar,
  isRoot,
  enter,
  noteScroll,
  restoreScroll,
  forgetScroll,
} from './ui/Phone.jsx';
import { useTouch, STANDALONE } from './ui/touch.js';
import { mod, keys, TOUCH } from './platform.js';

/** the main process (electron/preload.cjs), the Mac on a phone, or the stand-in for the browser version */
const api = /** @type {BentoBridge} */ (window.bento || mockBridge);

// lessons that were mid-stream when the app closed can't resume: keep what arrived, or mark them interrupted
// days in a row (ending today or yesterday) with at least one finished lesson
// how much you learned each day (lessons + new words), for the activity grid on Home
const activityByDay = (ls, words = {}) => {
  const m = {};
  const add = (t) => {
    if (!t) return;
    const k = new Date(t).toDateString();
    m[k] = (m[k] || 0) + 1;
  };
  ls.forEach((l) => !l.builtin && l.status === 'done' && add(l.createdAt));
  Object.values(words).forEach((w) => add(w.at));
  return m;
};
const streakOf = (ls) => {
  const days = new Set(
    ls
      .filter((l) => !l.builtin && l.status === 'done' && l.createdAt)
      .map((l) => new Date(l.createdAt).toDateString()),
  );
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
};
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
const settle = (ls) =>
  ls.map((l) =>
    l.status === 'streaming'
      ? {
          ...l,
          status: l.code || l.steps?.length ? 'done' : 'error',
          error:
            l.code || l.steps?.length ? null : 'This lesson was interrupted when Bento closed.',
          thinking: null,
        }
      : l,
  );

const RACE_LESSONS = RACES.map((r) => ({
  ...emptyLesson(r.q, r),
  ...r,
  status: 'done',
  builtin: true,
  race: true,
}));

export default function App() {
  const [lessons, setLessons] = useState(() => settle(load('bento.lessons', [])));
  const [currentId, setCurrentId] = useState(null);
  const [view, setViewRaw] = useState('home');
  const [settings, setSettingsRaw] = useState(() => ({
    model: 'claude:sonnet',
    level: 'student',
    lang: 'python',
    ...load('bento.settings', {}),
  }));
  const [progress, setProgress] = useState(() =>
    load('bento.progress', { concepts: {}, coins: 5 }),
  );
  const [providers, setProviders] = useState(null);
  const providersRef = useRef(null);
  providersRef.current = providers;
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState(null);
  const [project, setProjectRaw] = useState(null);
  useT(); // re-render when the interface's own words arrive in your language
  const [pyReady, setPyReady] = useState(pyState.ready);
  const [playTab, setPlayTab] = useState('sql');
  const [reopened, setReopened] = useState(null); // { id, q, o }: an earlier lesson reopened instead of asking again
  // a question about a real project goes to that project's code: looking for it, which one, and the question carried over
  const [finding, setFinding] = useState(null); // { q, name, id }
  const [choice, setChoice] = useState(null); // { q, o, d }
  const [atlasQ, setAtlasQ] = useState(null); // { key, q, d }
  const findingRef = useRef(null);
  // the project you were just reading: "it" and "this" in your next question mean this project (shown as a chip you can remove)
  const [recent, setRecent] = useState(null); // { key, at }
  // content packs other people wrote: their puzzles, ideas and paths join the built-in ones
  const [packs, setPacksRaw] = useState(loadPacks);
  const setPacks = (fn) =>
    setPacksRaw((p) => {
      const n = typeof fn === 'function' ? fn(p) : fn;
      savePacks(n);
      return n;
    });
  const packStuff = useMemo(() => applyPacks(packs), [packs]);
  const [linkRange, setLinkRange] = useState(null);
  const [stepSel, setStepSel] = useState(null);
  const [pop, setPop] = useState(null);
  const [storyW, setStoryW] = useState(() => {
    const w = load('bento.storyW', 0.47);
    return w === 0.4 ? 0.47 : w;
  });
  // the sidebar can close (⌘\ or its button) to give the page the whole window
  const [sideOpen, setSideOpen] = useState(() => load('bento.side', true));
  useEffect(() => save('bento.side', sideOpen), [sideOpen]);
  const desk = useRef(null);
  const cancels = useRef(new Map());

  const setSettings = (p) =>
    setSettingsRaw((s) => {
      const n = { ...s, ...p };
      save('bento.settings', n);
      return n;
    });
  useEffect(() => {
    api.setPrefs?.({ voice: settings.voice || 'English', fallback: !!settings.autoFallback });
    const CODES = {
      English: 'en',
      Español: 'es',
      Português: 'pt',
      Français: 'fr',
      Deutsch: 'de',
      Italiano: 'it',
      Nederlands: 'nl',
      Polski: 'pl',
      Türkçe: 'tr',
      Русский: 'ru',
      Українська: 'uk',
      العربية: 'ar',
      हिन्दी: 'hi',
      বাংলা: 'bn',
      'Bahasa Indonesia': 'id',
      'Tiếng Việt': 'vi',
      ไทย: 'th',
      Filipino: 'fil',
      中文: 'zh',
      日本語: 'ja',
      한국어: 'ko',
      Kiswahili: 'sw',
    };
    document.documentElement.lang = CODES[settings.voice] || 'en'; // read-aloud picks a matching voice
    // menus and buttons in the same language: translated once by your own AI, then kept on this Mac
    setUILanguage(settings.voice || 'English', async (strings, language) =>
      parseJSONLoose(
        await api.quick(
          settings.model,
          `Translate these short labels from a friendly app that teaches coding into ${language}. They are buttons, menu items and headings, so keep each one about as short as the English. Keep words wrapped in *stars* wrapped in stars (they are emphasised). Keep product and technical names as they are: Bento, Python, JavaScript, TypeScript, LeetCode, GitHub, Big-O, O(n), ⌘ and other symbols.\nReply with only a JSON object mapping each English string exactly to its translation.\n${JSON.stringify(strings)}`,
        ),
      ),
    );
  }, [settings.voice, settings.autoFallback]);
  const lib = useLibrary({
    api,
    settings,
    setProgress,
    setProjectRaw,
    setViewRaw,
    getProviders: () => providersRef.current,
  });
  const {
    atlases,
    setAtlases,
    atlasKey,
    setAtlasKey,
    atlasRef,
    projects,
    setProjects,
    sites,
    setSites,
    siteKey,
    setSiteKey,
    stopReading,
    asProject,
    narrate,
    openAtlas,
    openRepo,
    openRepoAt,
    openSite,
    openFolderAtlas,
    openProject,
    showAtlas,
    setProject,
    ensureProject,
    pendingFile,
    setPendingFile,
    findWild,
  } = lib;
  const [preReady, setPreReady] = useState(PRE.ready);
  useEffect(() => {
    loadPrebuilt().then(
      () => setPreReady(true),
      () => {},
    );
  }, []);
  // Startup timing: the first screen is drawn and what was saved on disk has been read, so it's ready for input.
  // scripts/measure-startup.mjs reads "bento:interactive" (on the frame after both).
  useEffect(() => {
    performance.mark('bento:rendered');
    const disk = api.storeGet ? api.storeGet().catch(() => null) : Promise.resolve(null);
    disk.then(() =>
      requestAnimationFrame(() => setTimeout(() => performance.mark('bento:interactive'), 0)),
    );
  }, []);
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
  }, []);
  // bento:// links from the "Open in Bento" bookmark: a GitHub repo or file, any website, or a question
  useEffect(() => {
    const go = (url) => {
      let linkUrl;
      try {
        linkUrl = new URL(url);
      } catch {
        return;
      }
      const what = linkUrl.searchParams.get('u') || linkUrl.searchParams.get('url') || '';
      const q = linkUrl.searchParams.get('q');
      if (linkUrl.hostname === 'ask' && q) return askLesson(q.slice(0, 500), {});
      const blob = parseBlob(what);
      if (blob) return openRepoAt(blob.full, blob.path);
      const repo = parseRepo(what);
      if (repo) return openRepo(repo);
      const site = parseSite(what);
      if (site) return openSite(site);
    };
    api.pendingLink?.().then((u) => u && go(u));
    return api.onDeepLink?.(go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      setProgress((p) => {
        const next = { ...p };
        next.words = { ...(savedProgress.words || {}), ...(p.words || {}) };
        next.path = { ...(savedProgress.path || {}), ...(p.path || {}) };
        next.puzzles = { ...(savedProgress.puzzles || {}) };
        for (const [k, r] of Object.entries(p.puzzles || {})) {
          const o = next.puzzles[k] || {};
          next.puzzles[k] = { ...o, ...r, s: [0, 1, 2].map((i) => !!(o.s?.[i] || r.s?.[i])) };
        }
        next.concepts = { ...(savedProgress.concepts || {}) };
        for (const [k, v] of Object.entries(p.concepts || {}))
          next.concepts[k] = Math.max(v, next.concepts[k] || 0);
        for (const k of ['sql', 'git', 'design', 'reviewed', 'daily'])
          next[k] = { ...(savedProgress[k] || {}), ...(p[k] || {}) };
        next.tracks = [
          ...(p.tracks || []),
          ...(savedProgress.tracks || []).filter(
            (t) => !(p.tracks || []).some((x) => x.id === t.id),
          ),
        ];
        next.coins = Math.max(p.coins ?? 5, savedProgress.coins ?? 5);
        return next;
      });
    return added;
  };
  const knownWordSet = useMemo(() => new Set(Object.keys(progress.words || {})), [progress.words]);
  // design a custom learning path for any goal (used by The path and by an Atlas's "what it takes" card)
  const makePath = async (goal) => {
    if (noAI(providers))
      throw new Error('Connect an AI first (bottom-left), then Bento can design a path for you.');
    const j = parseJSONLoose(
      await api.quick(
        settings.model,
        `Design a learning path for a ${settings.level} learner whose goal is: "${goal}".\nThe whole path builds ONE small project, chosen to fit the goal. 6–9 short stops: the first starts from nothing, each later stop extends the program from the stop before (same names, same data), and the last stop puts it all together into a working result the learner can show someone. Each stop is ONE lesson taught with a small runnable program (Python or JavaScript; use "html" for web pages; for SQL use Python's sqlite3 in memory). No network, files or installs. Introduce at most 3 new ideas per stop, in an order where nothing is used before it's taught.\nReply JSON: {"title":"≤ 4 words","d":"one sentence, ≤ 14 words","project":"the project's name and one line about it, ≤ 12 words","end":"what the learner will have at the end, concrete, ≤ 14 words","stops":[{"t":"stop title ≤ 6 words","d":"≤ 14 words, plain","make":"what this stop's program adds to the project, ≤ 10 words","mins":5-15,"q":"the exact question to ask for this lesson, ≤ 25 words","lang":"python|javascript|html","words":["2-3 technical words this stop introduces"]}]}`,
      ),
    );
    if (!j?.stops?.length)
      throw new Error('Couldn’t design that path. Try wording the goal differently.');
    const id = `c${Date.now().toString(36)}`;
    const track = {
      id,
      goal,
      title: j.title || goal.slice(0, 24),
      d: j.d || goal,
      project: j.project || '',
      end: j.end || '',
      stops: j.stops.slice(0, 10).map((x, i) => ({
        id: `${id}-${i}`,
        t: x.t,
        d: x.d,
        make: x.make || '',
        mins: Math.max(3, Math.min(20, +x.mins || 8)),
        q: x.q,
        lang: ['python', 'javascript', 'html', 'typescript'].includes(x.lang) ? x.lang : undefined,
        words: (x.words || []).slice(0, 3),
      })),
    };
    setProgress((p) => ({ ...p, tracks: [...(p.tracks || []), track] }));
    return id;
  };
  // a stop in a custom path knows the whole path, and continues from the code of the stop before it
  const pathContext = (st) => {
    const track = (progress.tracks || []).find((t) => t.stops.some((s) => s.id === st.id));
    if (!track) return {};
    const i = track.stops.findIndex((s) => s.id === st.id),
      last = i === track.stops.length - 1;
    const before = track.stops[i - 1];
    const prevL =
      before && lessons.find((l) => l.id === progress.path?.[before.id] && l.status === 'done');
    const path =
      `stop ${i + 1} of ${track.stops.length} in "${track.title}" (the learner's goal: "${track.goal || track.d}")${track.project ? `. The whole path builds one project: ${track.project}` : ''}.\nStops: ${track.stops.map((s, k) => `${k + 1}. ${s.t}${k === i ? ' ← THIS ONE' : ''}`).join('; ')}.\n` +
      (i === 0
        ? 'Start the project from nothing.'
        : prevL
          ? 'Continue the program from the previous stop (below): keep its names and data, and add only this stop’s piece.'
          : `Assume the learner built stops 1–${i} already; begin with a short version of that program, then add this stop’s piece.`) +
      (st.make ? ` This stop adds: ${st.make}.` : '') +
      (last && track.end ? ` This is the final stop: finish with ${track.end}` : '') +
      ' Don’t re-teach ideas from earlier stops; name them briefly and move on.';
    return { path, ...(prevL ? { prev: prevL } : {}) };
  };
  const startStop = (st) => {
    if (!PRE.ready) return void loadPrebuilt().then(() => startStop(st));
    const id = progress.path?.[st.id];
    const l = id && lessons.find((x) => x.id === id);
    if (l) return openLesson(l);
    const pre = PRE.path[st.id];
    if (pre && (!settings.voice || settings.voice === 'English') && settings.level !== 'engineer') {
      openLesson({ ...pre, createdAt: Date.now() });
      setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: pre.id } }));
      return;
    }
    const nid = askLesson(st.q, {
      ...(st.lang ? { lang: st.lang } : {}),
      ...(st.mode ? { mode: st.mode } : {}),
      ...pathContext(st),
    });
    setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: nid } }));
  };
  // a stop that opens another part of Bento counts as done once it's opened
  const markStop = (st) =>
    setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: 'x' } }));
  // (a playground or Explore shows where you are on the path, so you can go on to the next stop)
  const [trail, setTrail] = useState(null);
  useEffect(() => {
    if (trail && view !== trail.view) setTrail(null);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // a stop on a path that teaches this map skill and opens instantly (the next one you haven't done, or the first)
  const readyFor = (sid) => {
    const all = tracksWith().flatMap((track) =>
      track.stops
        .filter(
          (x) => (PRE.path[x.id] || x.idea || x.play) && stopSkills(x, skillsFor).includes(sid),
        )
        .map((st) => ({ T: track, st })),
    );
    const c = all.find((x) => !progress.path?.[x.st.id]) || all[0];
    return c ? { icon: c.T.icon, label: c.st.t, path: c.T.title, go: () => goStop(c.st) } : null;
  };
  const trailBar = () =>
    trail && view === trail.view ? (
      <PathBar
        info={pathFind((x) => x.id === trail.id)}
        onPage={() => setViewRaw('path')}
        onStop={goStop}
      />
    ) : null;
  const goStop = (st) => {
    setTrail(
      st.explore ? { id: st.id, view: 'explore' } : st.play ? { id: st.id, view: 'play' } : null,
    );
    if (st.explore) {
      markStop(st);
      return setViewRaw('explore');
    }
    if (st.site) {
      markStop(st);
      return openSite('https://wikipedia.org');
    }
    if (st.play) {
      markStop(st);
      setPlayTab(st.play);
      return setViewRaw('play');
    }
    if (st.idea && ideaById[st.idea]) {
      const id = readIdea(ideaById[st.idea]);
      return setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: id || 'x' } }));
    }
    return startStop(st);
  };
  // which path (and which stop) the open lesson belongs to, so it never feels like it came from nowhere
  const pathFind = (match) => {
    for (const { title: name, stops } of tracksWith([
      ...(progress.tracks || []),
      ...packStuff.paths,
    ])) {
      const i = stops.findIndex(match);
      if (i >= 0)
        return { name, i, stops, done: stops.filter((x) => progress.path?.[x.id]).length };
    }
    return null;
  };
  const pathOf = (lesson) => (lesson ? pathFind((x) => progress.path?.[x.id] === lesson.id) : null);
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
      api.onStoreChanged?.((k, v) => {
        if (k === 'bento.lessons' && Array.isArray(v))
          setLessons((mine) => mergeLessons(mine, v, cancels.current));
        else if (k === 'bento.progress' && v && typeof v === 'object' && !Array.isArray(v))
          setProgress(v);
        else if (k === 'bento.settings' && v && typeof v === 'object' && !Array.isArray(v))
          setSettingsRaw((s0) => {
            const n = { ...s0, ...v };
            save('bento.settings', n);
            return n;
          });
        else if (k === 'bento.projects' && Array.isArray(v)) setProjects(v.filter((x) => x?.key));
      }),
    [],
  );
  useEffect(() => save('bento.storyW', storyW), [storyW]);

  useEffect(() => {
    api
      .providers()
      .then((p) => {
        setProviders(p);
        if (p.gh)
          api
            .ghMe()
            .then(setUser)
            .catch(() => {});
      })
      .catch(() => setProviders({ scanFailed: true }));
    const f = (r) => setPyReady(r);
    pyState.listeners.add(f);
    warmPython();
    return () => pyState.listeners.delete(f);
  }, []);

  const current = useMemo(
    () =>
      lessons.find((l) => l.id === currentId) ||
      [
        ...SAMPLES,
        CHALLENGE,
        ...RACE_LESSONS,
        ...Object.values(PRE.ideas),
        ...Object.values(PRE.path),
        ...Object.values(PRE.sims),
      ].find((l) => l.id === currentId) ||
      null,
    [lessons, currentId, preReady],
  );
  const patch = useCallback(
    (id, p) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))),
    [],
  );

  useEffect(() => {
    rememberTab(view);
  }, [view]);
  const setView = (v) => {
    if (v === 'bug') {
      openDaily();
      return;
    }
    setViewRaw(v);
  };
  const openLesson = (l) => {
    if (WEB) countOnce('lesson', l.id);
    setLessons((ls) => (ls.some((x) => x.id === l.id) ? ls : [{ ...l, touched: true }, ...ls]));
    setCurrentId(l.id);
    setViewRaw('lesson');
    setLinkRange(null);
    setPop(null);
    setStepSel(l.steps?.length ? l.steps.length - 1 : null);
    award(l, 'open');
  };

  const openSim = (q) => {
    if (!PRE.ready) return void loadPrebuilt().then(() => openSim(q));
    const pre = PRE.sims[q];
    const have = lessons.find((l) => l.id === pre?.id);
    if (have) return openLesson(have);
    if (pre && (!settings.voice || settings.voice === 'English'))
      return openLesson({ ...pre, createdAt: Date.now() });
    askLesson(`${q} Teach it by simulating it with a small program and a picture.`, {
      mode: 'explain',
    });
  };
  const openPuzzle = (pz) => {
    const have = lessons.find((l) => l.id === `pz-${pz.id}`);
    openLesson(have || puzzleLesson(pz));
  };
  const setPuzzleCode = (pz, which) => {
    const parts = codeParts(pz, which);
    const id = currentId;
    desk.current?.setCode(codeOf(parts));
    setLessons((ls) =>
      ls.map((l) =>
        l.id === id ? { ...l, pmap: { ...(l.pmap || {}), ...englishMap(parts) } } : l,
      ),
    );
  };
  const onPuzzleResult = (pid, r) => {
    setProgress((p) => {
      const old = p.puzzles?.[pid] || {};
      const s = [0, 1, 2].map((k) => !!(old.s?.[k] || r.s[k]));
      return {
        ...p,
        puzzles: {
          ...(p.puzzles || {}),
          [pid]: { ...old, s, label: r.label || old.label, at: Date.now() },
        },
      };
    });
    if (r.s.every(Boolean)) award(current, 'challenge');
  };

  // ---------------------------------------------------------------- asking
  const askLesson = useCallback(
    (q, o = {}) => {
      if (WEB) {
        needsMac('lesson');
        return null;
      } // the web version has no AI: new lessons are the Mac app's
      const model = o.model || settings.model;
      const lang = o.lang || settings.lang;
      const level = o.level || settings.level;
      // asked this exact question before (same kind, language and level)? open that lesson instead of spending your plan again
      const norm = (x) =>
        String(x || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();
      if (
        !o.fresh &&
        !o.context &&
        !o.prev &&
        !o.routed &&
        (o.mode || 'explain') !== 'challenge' &&
        norm(q).length > 3
      ) {
        const dup = lessonsRef.current.find(
          (l) =>
            l.status === 'done' &&
            !l.builtin &&
            norm(l.q) === norm(q) &&
            l.mode === (o.mode || 'explain') &&
            l.lang === lang &&
            (l.level || 'student') === level,
        );
        if (dup) {
          openLesson(dup);
          setReopened({ id: dup.id, q, o });
          return dup.id;
        }
      }
      const L0 = emptyLesson(q, {
        mode: o.mode || 'explain',
        lang,
        level,
        model,
        context: ['code', 'idea', 'compare', 'build'].includes(o.mode)
          ? o.context
          : o.mode === 'feature' && o.context
            ? {
                name: o.context.name,
                repo: o.context.repo,
                repoKey: o.context.repoKey,
                key: (o.context.key || []).map((k) => ({
                  path: k.path,
                  text: k.text.slice(0, 20000),
                })),
              }
            : null,
      });
      if (o.prev) L0.prevTitle = o.prev.title;
      if (o.routed) L0.routed = o.routed;
      setLessons((ls) => [L0, ...ls]);
      setCurrentId(L0.id);
      setViewRaw('lesson');
      setLinkRange(null);
      setStepSel(null);
      setPop(null);
      const parser = ndjsonParser((b) => {
        setLessons((ls) => ls.map((l) => (l.id === L0.id ? applyBlock(l, b) : l)));
        if (b.t === 'term' && b.term)
          setProgress((p) => {
            const k = String(b.term).toLowerCase();
            if (p.words?.[k]) return p;
            return {
              ...p,
              words: {
                ...(p.words || {}),
                [k]: {
                  term: b.term,
                  plain: b.plain,
                  like: b.like,
                  from: L0.id,
                  title: q,
                  at: Date.now(),
                },
              },
            };
          });
        if (b.t === 'step') setStepSel((s) => (s == null ? 0 : s + 1));
      });
      const prompt = buildPrompt({
        q,
        mode: L0.mode,
        lang,
        level,
        context: o.context,
        path: o.path,
        prev: o.prev ? { title: o.prev.title, code: o.prev.work ?? o.prev.code } : null,
      });
      const cancel = api.ask(model, prompt, {
        chunk: (t) => parser.push(t),
        think: (t) =>
          setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, thinking: t } : l))),
        done: () => {
          if (!document.hasFocus() && window.Notification?.permission !== 'denied') {
            try {
              new Notification('Your lesson is ready', {
                body: q ? String(q).slice(0, 90) : 'Bento finished writing.',
                silent: true,
              }).onclick = () => {
                window.focus();
                setCurrentId(L0.id);
                setViewRaw('lesson');
              };
            } catch {}
          }
          parser.end();
          setLessons((ls) =>
            ls.map((item) =>
              item.id === L0.id
                ? {
                    ...item,
                    ...tidyLesson(item),
                    status: item.code || item.story.length ? 'done' : 'error',
                    error:
                      item.code || item.story.length
                        ? null
                        : 'The model replied, but not in the lesson format. Try again or switch model.',
                  }
                : item,
            ),
          );
          cancels.current.delete(L0.id);
        },
        error: (m) => {
          parser.end();
          cancels.current.delete(L0.id);
          // Auto-route: if this AI can't answer right now (usage limit, signed out, missing), quietly ask your other one.
          const alt = altOf(model, providersRef.current);
          const account =
            /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/.test(
              m,
            );
          const cur = lessonsRef.current.find((l) => l.id === L0.id);
          if (
            settings.autoFallback &&
            alt &&
            account &&
            !o.routed &&
            !cur?.code &&
            !cur?.story?.length
          ) {
            setLessons((ls) => ls.filter((l) => l.id !== L0.id));
            askLesson(q, {
              ...o,
              model: alt,
              routed: {
                from: modelLabel(model),
                to: modelLabel(alt),
                why: /usage limit/.test(m)
                  ? 'hit its usage limit'
                  : /signed in/.test(m)
                    ? 'isn’t signed in'
                    : 'isn’t installed',
              },
            });
            return;
          }
          setLessons((ls) =>
            ls.map((l) =>
              l.id === L0.id ? { ...l, status: l.code ? 'done' : 'error', error: m } : l,
            ),
          );
        },
      });
      cancels.current.set(L0.id, cancel);
      L0._ask = { q, o };
      return L0.id;
    },
    [settings],
  );

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

  // ---------------------------------------------------------------- mastery
  const award = (l, kind) => {
    if (!l?.concepts?.length) return;
    const pts = { open: 0.5, run: 1, step: 1.5, quiz: 2, challenge: 3 }[kind] || 0;
    const key = `${l.id}:${kind}`;
    setProgress((p) => {
      if ((p.awarded || []).includes(key)) return p;
      const c = { ...p.concepts };
      l.concepts.forEach((id) => {
        c[id] = (c[id] || 0) + pts;
      });
      return {
        ...p,
        concepts: c,
        coins: (p.coins ?? 5) + (kind === 'challenge' ? 3 : 0),
        awarded: [...(p.awarded || []).slice(-400), key],
      };
    });
  };

  // ---------------------------------------------------------------- try chips: make every suggestion actually do something
  const onTry = async (t) => {
    const lesson = current;
    if (!lesson) return;
    const deskEl = desk.current;
    // on a phone the code is on the other page: go there, so you see what the try does
    if (phone) setPane('code');
    if (/step/i.test(t)) return deskEl?.step();
    if (/run the tests|tests/i.test(t) && lesson.tests) return deskEl?.tests();
    if (/measure|growth/i.test(t)) return document.querySelector('.stab:nth-child(3)')?.click();
    const code = deskEl?.getCode() ?? lesson.code;
    const m = /^change\s+(.+?)\s+to\s+(.+?)\.?$/i.exec(t);
    if (m) {
      const from = m[1].replace(/^["'`]|["'`]$/g, '');
      let to = m[2].replace(/^["'`]|["'`]$/g, '');
      // "Change size=4 to 2" means change the value, keep the name
      const kv = /^([\w.]+)\s*(=|:)\s*(.+)$/.exec(from);
      if (kv && !/[=:]/.test(to)) to = from.slice(0, from.length - kv[3].length) + to;
      const rx = new RegExp(`(^|[^\\w.])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`);
      if (rx.test(code)) {
        deskEl?.setCode(code.replace(rx, (all, pre) => pre + to));
        setTimeout(() => deskEl?.run(), 30);
        return;
      }
    }
    setPop({
      x: innerWidth * 0.3,
      y: innerHeight * 0.5,
      word: t,
      info: null,
      loading: true,
      kind: 'try',
    });
    try {
      const s = await api.quick(
        settings.model,
        `Apply this small experiment to the student's ${lesson.lang} code: "${t}". Change as little as possible.\nReply JSON: {"code":"the full updated code","note":"what changed, max 15 words"}\n\nCODE:\n${code}`,
      );
      const j = parseJSONLoose(s);
      if (j?.code) {
        deskEl?.setCode(j.code);
        setTimeout(() => deskEl?.run(), 30);
        setPop(null);
      } else setPop(null);
    } catch {
      setPop(null);
    }
  };

  // ---------------------------------------------------------------- story term popover
  // drag a folder or a code file onto the window
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

  // select any text (story, code, atlas) → a small "Explain" bubble
  const [sel, setSel] = useState(null);
  useEffect(() => {
    const up = (e) => {
      if (e.target.closest?.('.sel-pill, .pop, input, textarea')) return;
      setTimeout(() => {
        const s0 = window.getSelection();
        const t = s0?.toString().trim();
        if (!t || t.length < 2 || t.length > 400 || !s0.rangeCount) return setSel(null);
        const n = s0.anchorNode?.parentElement;
        if (!n?.closest('.story, .cm-content, .atlas, .ideas, .words')) return setSel(null);
        const r = s0.getRangeAt(0).getBoundingClientRect();
        setSel({ text: t, x: r.left + r.width / 2, y: r.top, inCode: !!n.closest('.cm-content') });
      }, 10);
    };
    addEventListener('mouseup', up);
    return () => removeEventListener('mouseup', up);
  }, []);
  const explainSelection = async () => {
    const selection = sel;
    setSel(null);
    window.getSelection()?.removeAllRanges();
    const lesson = view === 'lesson' ? current : null;
    const atlas = view === 'atlas' ? atlases[atlasKey] : null;
    const ctx = lesson
      ? `It appears in a lesson titled "${lesson.title}"${selection.inCode ? ` in this ${lesson.lang} code:\n${(lesson.work ?? lesson.code ?? '').slice(0, 2500)}` : '.'}`
      : atlas
        ? `It appears while studying the repository ${atlas.name} (${atlas.narr?.gist?.one || ''}).`
        : '';
    const base = {
      x: Math.max(16, selection.x - 160),
      y: selection.y + 28,
      word: selection.text.length > 40 ? selection.text.slice(0, 38) + '…' : selection.text,
    };
    setPop({ ...base, loading: true });
    try {
      const j = parseJSONLoose(
        await api.quick(
          settings.model,
          `A learner (${settings.level}) selected this and wants it explained:\n"${selection.text}"\n${ctx}\nExplain what it means in plain words, then name the technical idea if there is one. If the selection is a fragment, quietly explain the idea it belongs to; never comment on the selection itself.\nReply JSON: {"title":"short label, max 5 words","what":"plain explanation, max 45 words","plain":"the key idea in max 10 words","example":"tiny example if useful, max 2 lines, else empty"}`,
        ),
      );
      setPop((p) =>
        p?.word === base.word
          ? {
              ...base,
              info: j
                ? {
                    title: j.title || base.word,
                    w: j.what,
                    p: j.plain,
                    ex: j.example,
                    t: 'explained',
                  }
                : {
                    title: base.word,
                    w: 'Couldn’t explain that one. Try selecting a little more.',
                  },
            }
          : p,
      );
    } catch {
      setPop(null);
    }
  };

  const onTerm = (word, elx) => {
    const lesson = current;
    const r = elx.getBoundingClientRect();
    const doc = lesson.work ?? lesson.code ?? '';
    const info = explainToken({
      word: word.replace(/\(.*$/, '').replace(/^.*\./, ''),
      lineText: word,
      lang: lesson.lang,
      doc,
      english: lesson.pseudo,
      model: settings.model,
      quick: api.quick,
      isMember: /\./.test(word),
    });
    const base = { x: r.left, y: r.bottom + 8, word };
    if (info && typeof info.then === 'function') {
      setPop({ ...base, loading: true });
      info
        .then((i) => setPop((p) => (p?.word === word ? { ...base, info: i } : p)))
        .catch(() => setPop(null));
    } else setPop({ ...base, info: info || { title: word, w: 'A term from this lesson.' } });
  };
  useEffect(() => {
    const h = (e) => {
      if (!e.target.closest?.('.pop, .term, .sel-pill')) setPop(null);
    };
    addEventListener('mousedown', h);
    return () => removeEventListener('mousedown', h);
  }, []);

  // ---------------------------------------------------------------- shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (mod(e) && e.key === 'n') {
        e.preventDefault();
        setViewRaw('home');
      }
      if (mod(e) && e.key === 'f' && !TOUCH && !document.activeElement?.closest?.('.cm-editor')) {
        e.preventDefault();
        setFindOpen(true);
      }
      if (
        mod(e) &&
        (e.key === '[' || e.key === ']') &&
        !document.activeElement?.closest?.('.cm-editor')
      ) {
        e.preventDefault();
        e.key === '[' ? history.back() : history.forward();
      }
      if (mod(e) && e.key === '\\') {
        e.preventDefault();
        setSideOpen((x) => !x);
      }
      if (mod(e) && e.key === 'k') {
        e.preventDefault();
        setPal((x) => !x);
      }
      if (mod(e) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if (e.key === '/' && mod(e)) {
        e.preventDefault();
        setShowKeys((x) => !x);
      }
      const emptyAsk =
        document.activeElement?.matches?.('.composer textarea') && !document.activeElement.value;
      if (
        e.key === '?' &&
        !mod(e) &&
        (emptyAsk ||
          (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName) &&
            !document.activeElement?.closest?.('.cm-editor')))
      ) {
        e.preventDefault();
        setShowKeys((x) => !x);
      }
      if (e.key === 'Escape') setShowKeys(false);
      if (mod(e) && e.key === 'l') {
        e.preventDefault();
        if (view === 'lesson') document.getElementById('followup')?.focus();
        else if (view === 'atlas') document.getElementById('atlas-ask')?.focus();
        else document.querySelector('.composer textarea, .ex-search input')?.focus();
      }
      if (e.key === 'Escape') {
        setPop(null);
        setLinkRange(null);
      }
      if (
        mod(e) &&
        e.key === 'Enter' &&
        view === 'lesson' &&
        !document.activeElement?.closest?.('.cm-editor')
      ) {
        e.preventDefault();
        e.shiftKey ? desk.current?.step() : desk.current?.run();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [view]);
  // The menu bar sends the same commands. If you just pressed that shortcut, the page has already done it.
  const menuActs = useRef({});
  menuActs.current = { openFolderAtlas };
  useEffect(() => {
    let lastMod = 0;
    const k = (e) => {
      if (mod(e)) lastMod = Date.now();
    };
    addEventListener('keydown', k, true);
    const off = api.onMenu?.((a) => {
      const keyed = Date.now() - lastMod < 500;
      if (a === 'openFolder') return menuActs.current.openFolderAtlas?.();
      if (a === 'setup') return setOnb(1);
      if (keyed) return;
      if (a === 'settings') setShowSettings(true);
      if (a === 'new') setViewRaw('home');
      if (a === 'search') setPal((x) => !x);
      if (a === 'sidebar') setSideOpen((x) => !x);
      if (a === 'keys') setShowKeys(true);
      if (a === 'find') setFindOpen(true);
      if (a === 'back') history.back();
      if (a === 'forward') history.forward();
    });
    // a mouse's side buttons
    const side = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        history.back();
      } else if (e.button === 4) {
        e.preventDefault();
        history.forward();
      }
    };
    addEventListener('mouseup', side);
    return () => {
      removeEventListener('keydown', k, true);
      removeEventListener('mouseup', side);
      off?.();
    };
  }, []);

  const loadRepos = () => {
    if (repos === null && providers?.gh)
      api
        .ghRepos()
        .then(setRepos)
        .catch(() => setRepos([]));
    else if (!providers?.gh) setRepos([]);
  };

  const [pal, setPal] = useState(false);
  // a phone: tabs at the bottom, Back at the top, and the sidebar slides over from the left (Phone.jsx)
  const phone = useNarrow();
  const [drawer, setDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pane, setPane] = useState('story'); // a lesson on a phone: its story, or its code and what it does
  useEffect(() => {
    setPane('story');
  }, [currentId]);
  useEffect(() => {
    setDrawer(false);
    setScrolled(false);
  }, [view, currentId, atlasKey, siteKey]);
  // each screen is a step in the page's history: Back returns to the last one (Safari's swipe back on a phone or iPad;
  // ⌘[ and ⌘], the mouse's side buttons and the menu on the Mac)
  useEffect(() => {
    const st = { bento: 1, view, currentId, atlasKey, siteKey };
    const cur = history.state;
    if (
      cur?.bento &&
      cur.view === view &&
      cur.currentId === currentId &&
      cur.atlasKey === atlasKey &&
      cur.siteKey === siteKey
    )
      return;
    if (!cur?.bento) history.replaceState({ ...st, depth: 0 }, '');
    else history.pushState({ ...st, depth: (cur.depth || 0) + 1 }, '');
  }, [view, currentId, atlasKey, siteKey]);
  // which way the next page arrives (Phone.jsx: enter): set by Back; Safari's own swipe back has animated already
  const navDir = useRef(null);
  useEffect(() => {
    const back = (e) => {
      const s = e.state;
      if (!s?.bento) return;
      if (navDir.current !== 'pop') navDir.current = STANDALONE ? 'pop' : 'none';
      setCurrentId(s.currentId ?? null);
      setAtlasKey(s.atlasKey ?? null);
      setSiteKey(s.siteKey ?? null);
      setViewRaw(s.view || 'home');
    };
    addEventListener('popstate', back);
    return () => removeEventListener('popstate', back);
  }, []);
  const goBack = () => {
    navDir.current = 'pop';
    if (api.remote && history.state?.depth > 0) history.back();
    else setView(lastTab(groupOf(view) || GROUPS[0]));
  };
  // each page on a phone: it slides in, and Back or a tab returns you to the spot you left it at
  const page = `${view}:${view === 'lesson' ? currentId : view === 'atlas' ? atlasKey : view === 'site' ? siteKey : ''}`;
  const shownPage = useRef({ page, root: isRoot(view) });
  useLayoutEffect(() => {
    const was = shownPage.current;
    if (was.page === page) return;
    const root = isRoot(view);
    shownPage.current = { page, root };
    const dir = navDir.current || (was.root && root ? 'tab' : root ? 'pop' : 'push');
    navDir.current = null;
    if (!phone) return;
    const main = document.getElementById('content');
    if (dir === 'push') forgetScroll(page);
    else restoreScroll(page, main);
    enter(main, dir);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useTouch(TOUCH, {
    phone,
    back: goBack,
    canBack: () => !isRoot(view),
    atRoot: () => isRoot(view),
    drawerOpen: () => drawer,
    openDrawer: () => setDrawer(true),
    closeDrawer: () => setDrawer(false),
    swipe: STANDALONE || sessionStorage.getItem('bento.swipe') === '1',
  });
  const phoneTitle =
    view === 'lesson'
      ? current?.title || current?.q || ''
      : view === 'atlas'
        ? (atlases[atlasKey]?.name || '').split('/').pop()
        : view === 'site'
          ? siteKey
          : view === 'compare'
            ? t('Compare')
            : t(groupOf(view)?.label || '');
  const [article, setArticle] = useState(() => !!localStorage.getItem('bento.article'));
  const [runs, setRuns] = useState({});
  // ---------------------------------------------------------------- your own AI agent uses Bento (electron/agent.cjs)
  // Its tool calls arrive here: show its lesson, say what's on screen, point at lines, run code. Answers are words for it.
  const [noteFlash, setNoteFlash] = useState(null); // { from, at }: a note your agent just pinned, shown open
  const runWaits = useRef([]); // tool calls waiting for a lesson's code to finish running
  const agentNow = useRef({});
  agentNow.current = { view, current, runs, openLesson, patch, atlasKey };
  useEffect(
    () =>
      api.agent?.on(async (tool, a, client) => {
        const now = agentNow.current;
        const ran = (id, ms) =>
          new Promise((res) => {
            const w = { id, res };
            runWaits.current.push(w);
            setTimeout(() => {
              runWaits.current = runWaits.current.filter((x) => x !== w);
              res(null);
            }, ms);
          });
        const later =
          'It is still running (Python takes a few seconds the first time). Call get_learner_view in a moment to see what it did.';
        if (tool === 'show_lesson') {
          const lesson = lessonFromAgent(a, client);
          const done = ran(lesson.id, 30000);
          now.openLesson(lesson);
          setShowSettings(false);
          setPal(false);
          const r = await done;
          return `Bento is showing "${lesson.title}" to the learner.\n\nWhen its code ran:\n${r ? describeRun(r.r) : later}`;
        }
        if (tool === 'get_learner_view')
          return describeView({
            view: now.view,
            lesson: now.current,
            code: now.view === 'lesson' ? desk.current?.getCode?.() : null,
            run: now.current ? now.runs[now.current.id] : null,
            project: now.view === 'atlas' ? now.atlasKey : null,
          });
        const lesson = now.view === 'lesson' ? now.current : null;
        if (!lesson || !desk.current)
          throw new Error('No lesson is open in Bento. Use show_lesson to open one.');
        if (tool === 'highlight_code') {
          const n = (desk.current.getCode() ?? lesson.code).split('\n').length;
          if (a.from > n)
            throw new Error(`The code has ${n} lines; line ${a.from} isn’t one of them.`);
          const to = Math.min(a.to, n);
          setLinkRange([a.from, to]);
          if (a.note)
            now.patch(lesson.id, {
              notes: [
                ...(lesson.notes || []).filter((x) => x.from !== a.from),
                { from: a.from, to, label: a.label || agentName(client), text: a.note },
              ].slice(-8),
            });
          if (a.note) setNoteFlash({ from: a.from, at: Date.now() });
          return `Lines ${a.from}${to > a.from ? `–${to}` : ''} are lit up in Bento${a.note ? ', with your note beside them' : ''}.`;
        }
        if (tool === 'run_code') {
          if (a.code != null) desk.current.setCode(a.code);
          const done = ran(lesson.id, 30000);
          setTimeout(() => desk.current?.run(), 40);
          const r = await done;
          return r
            ? `${a.code != null ? 'Put your code in the editor and ran it.' : 'Ran the learner’s code.'}\n\n${describeRun(r.r)}`
            : later;
        }
        throw new Error(`Bento has no tool called ${tool}.`);
      }),
    [],
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [fellBack, setFellBack] = useState(null); // { from, to }: another AI answered (Retry with another AI)
  useEffect(() => {
    let t;
    const off = api.onFallback?.((x) => {
      setFellBack(x);
      clearTimeout(t);
      t = setTimeout(() => setFellBack(null), 7000);
    });
    return () => {
      off?.();
      clearTimeout(t);
    };
  }, []);
  const [pair, setPair] = useState([null, null]);
  // a phone or iPad uses the Mac's AIs, which the Mac already set up: no welcome there
  // and on the web there's no AI to set up: straight in
  const [onb, setOnb] = useState(() =>
    WEB || api.remote || load('bento.settings', {}).onboarded ? null : 0,
  );
  const readIdea = (idea) => {
    if (!PRE.ready) {
      loadPrebuilt().then(() => readIdea(idea));
      return null;
    }
    const pre = PRE.ideas[idea.id];
    const english = !settings.voice || settings.voice === 'English';
    if (pre && english && !lessons.some((l) => l.context?.ideaId === idea.id)) {
      openLesson({ ...pre, createdAt: Date.now() });
      return pre.id;
    } // shipped with the app: opens instantly
    const have = lessons.find(
      (l) =>
        l.context?.ideaId === idea.id &&
        (l.status === 'done' || (l.status === 'streaming' && cancels.current.has(l.id))),
    );
    if (have) {
      openLesson(have);
      return have.id;
    }
    return askLesson(idea.title, {
      mode: 'idea',
      lang: idea.lang,
      context: {
        ideaId: idea.id,
        title: idea.title,
        company: idea.company,
        brief: idea.brief,
        code: idea.code,
        vs: idea.vs,
        repo: idea.repo,
        file: idea.file,
        link: idea.link,
      },
    });
  };
  // a blank scratchpad, or a remix of the same lesson, that you never touched (no edits, no questions) is replaced by
  // the new one instead of piling up in Recent
  const untouchedTwin = (x, lesson) =>
    x.scratch && !x.work && !(x.chat || []).length && x.title === lesson.title;
  const newScratch = (lang = settings.lang, remix = null) => {
    const py = lang === 'python';
    if (lang === 'html' || lang === 'typescript') {
      const web = lang === 'html';
      const starter = web
        ? '<!doctype html>\n<html>\n<head>\n<style>\n  body { font-family: sans-serif; padding: 24px; }\n  button { font-size: 18px; padding: 8px 16px; }\n</style>\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button id="btn">Click me</button>\n  <p id="out"></p>\n  <script>\n    document.getElementById("btn").addEventListener("click", () => {\n      document.getElementById("out").textContent = "You clicked at " + new Date().toLocaleTimeString();\n    });\n  </script>\n</body>\n</html>'
        : `// Write anything here. Press ${keys('⌘↵')} to run it.\ninterface Pet { name: string; age: number }\nconst pets: Pet[] = [{ name: "Biscuit", age: 3 }, { name: "Mochi", age: 5 }];\nfor (const p of pets) {\n  console.log(\`\${p.name} is \${p.age}\`);\n}\nshow(pets.map((p) => p.age));`;
      const L2 = {
        ...emptyLesson('', { lang, model: settings.model }),
        title: remix ? `Remix of ${remix.title}` : 'Scratchpad',
        kicker: 'your own code',
        scratch: true,
        status: 'done',
        code: remix ? remix.code : starter,
        file: web ? 'index.html' : 'scratch.ts',
        pseudo: remix ? remix.pseudo : [],
        story: [
          {
            t: 'p',
            md: web
              ? 'A blank web page that explains itself. Change the code on the right and the page updates. **Save my page** keeps it as a real file.'
              : 'A blank page for TypeScript. Type errors appear on the right line as you type; **Run** shows the result.',
          },
          {
            t: 'try',
            items: web
              ? ['Change the button colour', 'Add a second button', 'Show a list of items']
              : ['Give a pet a wrong type', 'Add a new field', 'Step through the loop'],
          },
        ],
      };
      setLessons((ls) => [L2, ...ls.filter((x) => !untouchedTwin(x, L2))]);
      setCurrentId(L2.id);
      setViewRaw('lesson');
      setStepSel(null);
      return;
    }
    const code = py
      ? `# Write anything here. Press ${keys('⌘↵')} to run it.\nname = "world"\nfor i in range(3):\n    print("hello", name, i)\n\nshow([3, 1, 4, 1, 5, 9, 2, 6])`
      : `// Write anything here. Press ${keys('⌘↵')} to run it.\nconst name = "world";\nfor (let i = 0; i < 3; i++) {\n  console.log("hello", name, i);\n}\n\nshow([3, 1, 4, 1, 5, 9, 2, 6]);`;
    const pseudo = py
      ? [
          'A note to yourself (Python skips it)',
          'Make a box called name holding "world"',
          'Repeat the next line 3 times, counting with i',
          'Print a greeting with the count',
          '',
          'Draw these numbers as bars',
        ]
      : [
          'A note to yourself (JavaScript skips it)',
          'Make a box called name holding "world"',
          'Repeat 3 times, counting with i',
          'Print a greeting with the count',
          '',
          '',
          'Draw these numbers as bars',
        ];
    const lesson = {
      ...emptyLesson('', { lang, model: settings.model }),
      title: remix ? `Remix of ${remix.title}` : 'Scratchpad',
      kicker: 'your own code',
      scratch: true,
      status: 'done',
      code: remix ? remix.code : code,
      file: py ? 'scratch.py' : 'scratch.js',
      pseudo: remix ? remix.pseudo : pseudo,
      story: [
        {
          t: 'p',
          md: 'A blank page that explains itself. Type any code on the right: Bento turns each line into plain English as you go, **Run** shows the result, and **Step** walks through it line by line.',
        },
        {
          t: 'p',
          md: 'Hover any word for a quick explanation. Stuck? Ask below, like “why does range start at 0?”.',
        },
        {
          t: 'try',
          items: [
            'Change 3 to 10',
            'Step through the loop',
            py ? 'Print your own name' : 'Log your own name',
          ],
        },
      ],
    };
    setLessons((ls) => [lesson, ...ls.filter((x) => !untouchedTwin(x, lesson))]);
    setCurrentId(lesson.id);
    setViewRaw('lesson');
    setStepSel(null);
  };
  const altFor = (m) => altOf(m, providers);
  const altModel = altFor(settings.model);
  // a new bug every day (generated once, then kept), the built-in one when no AI is connected
  const openDaily = () => {
    if (!PRE.ready) return void loadPrebuilt().then(() => openDaily());
    const day = new Date().toISOString().slice(0, 10);
    const id = progress.daily?.[day];
    const have = id && lessons.find((l) => l.id === id && l.status !== 'error');
    if (have) return openLesson(have);
    const topics = [
      'arrays',
      'strings',
      'loops',
      'recursion',
      'dictionaries',
      'off-by-one errors',
      'sorting',
      'string formatting',
      'conditionals',
      'functions and return values',
      'nested lists',
      'counting things',
    ];
    const topic = topics[Math.floor(Date.now() / 86400000) % topics.length];
    const pre = PRE.bugs[topic];
    const english = !settings.voice || settings.voice === 'English';
    if (pre && settings.lang === 'python' && english && settings.level !== 'engineer') {
      const lesson = {
        ...pre,
        id: `bug-${day}`,
        status: 'done',
        thinking: null,
        chat: [],
        work: null,
        createdAt: Date.now(),
      };
      setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: lesson.id } }));
      return openLesson(lesson);
    }
    if (!providers || noAI(providers)) return openLesson(CHALLENGE);
    const nid = askLesson(topic, { mode: 'challenge', lang: settings.lang });
    setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: nid } }));
  };
  // hooks for scripts/pregen-*.mjs, which drive the real app to pre-write shipped lessons
  useEffect(() => {
    window.__openIdea = (id) => readIdea(ideaById[id]);
    window.__ask = (q, o) => askLesson(q, o || {});
    window.__openLesson = (l) => openLesson(l);
    window.__missingStops = () => ALL_STOPS.filter((x) => x.q && !PRE.path[x.id]).map((x) => x.id);
    window.__genStop = (id) => {
      const st = ALL_STOPS.find((x) => x.id === id);
      return askLesson(st.q, {
        ...(st.lang ? { lang: st.lang } : {}),
        ...(st.mode ? { mode: st.mode } : {}),
      });
    };
  });
  const readIdsAll = () =>
    Object.fromEntries(
      lessons
        .filter((l) => l.context?.ideaId && l.status === 'done' && (!l.builtin || l.touched))
        .map((l) => [l.context.ideaId, true]),
    );
  const mastery = useMemo(
    () =>
      masteryOf({
        progress,
        lessons,
        puzzles: PUZZLES,
        stops: ALL_STOPS,
        ideas: IDEAS,
        readIds: readIdsAll(),
      }),
    [progress, lessons],
  );
  // Home's "Today": one next step from each part of Bento
  const today = useMemo(() => {
    const out = [];
    // the next stop on the path you picked (or the first one you haven't finished)
    const paths = tracksWith([...(progress.tracks || []), ...packStuff.paths]);
    const picked = paths.find((x) => x.k === localStorage.getItem('bento.track'));
    const track = [picked, ...paths].find((x) => x && x.stops.some((s) => !progress.path?.[s.id]));
    const si = track ? track.stops.findIndex((s) => !progress.path?.[s.id]) : -1;
    const stop = track?.stops[si];
    if (stop)
      out.push({
        k: 'path',
        icon: '⤳',
        label: stop.t,
        sub: t('next on the path'),
        track: track.own ? track.title : t(track.title),
        step: { i: si + 1, n: track.stops.length },
        go: () => goStop(stop),
      });
    const pz = PUZZLES.find((p) => (progress.puzzles?.[p.id]?.s || []).filter(Boolean).length < 3);
    if (pz)
      out.push({
        k: 'puzzle',
        icon: '◇',
        label: pz.title,
        sub: t('next puzzle'),
        go: () => openPuzzle(pz),
      });
    const fading = SKILLS.filter(([id]) => isFading(mastery[id] || {})).length;
    const due = Object.values(progress.words || {}).filter(
      (w) => w.next && w.next <= Date.now(),
    ).length;
    if (fading || due)
      out.push({
        k: 'review',
        icon: '✺',
        label: fading ? `${fading} ${t('topics fading')}` : `${due} ${t('words to review')}`,
        sub: t('a two-minute review'),
        go: () => setViewRaw(fading ? 'map' : 'words'),
      });
    const unread = IDEAS.filter((i) => !readIdsAll()[i.id]);
    const idea = unread[Math.floor(Date.now() / 864e5) % Math.max(1, unread.length)];
    if (idea)
      out.push({
        k: 'idea',
        icon: '⬡',
        label: idea.title,
        sub: `${t('clever idea')} · ${idea.company}`,
        go: () => readIdea(idea),
      });
    out.push({
      k: 'bug',
      icon: '⚑',
      label: t('Daily bug'),
      sub: t('a two-minute challenge'),
      go: openDaily,
    });
    // a plan for today: how long each takes, and whether it's already done today
    const isToday = (at) => !!at && new Date(at).toDateString() === new Date().toDateString();
    const awarded = new Set(progress.awarded || []);
    const day = new Date().toISOString().slice(0, 10);
    const bugId = progress.daily?.[day];
    const doneToday = {
      puzzle: Object.values(progress.puzzles || {}).some(
        (r) => isToday(r.at) && (r.s || []).some(Boolean),
      ),
      bug: !!bugId && awarded.has(`${bugId}:challenge`),
      idea: lessons.some((l) => l.context?.ideaId && l.status === 'done' && isToday(l.createdAt)),
      review: Object.values(progress.reviewed || {}).some(isToday),
    };
    const mins = { path: 12, puzzle: 8, idea: 6, bug: 2, review: 2 };
    return out.slice(0, 5).map((x) => ({ ...x, mins: mins[x.k], done: !!doneToday[x.k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, mastery, lessons, packStuff]);
  // your threads: lessons and project conversations, newest first, with what's in each
  const threads = useMemo(() => {
    let convo = {};
    try {
      convo = JSON.parse(localStorage.getItem('bento.atlasThreads') || '{}');
    } catch {}
    // which stop on its path a lesson is (any path, built-in or your own)
    const stopNo = Object.fromEntries(
      tracksWith(progress.tracks || [])
        .flatMap((track) => track.stops.map((x, i) => [progress.path?.[x.id], i + 1]))
        .filter(([id]) => id && id !== 'x'),
    );
    const ls = lessons
      .filter((l) => (!l.builtin || l.touched) && l.status !== 'error')
      .map((l) => ({
        k: `l:${l.id}`,
        kind: 'lesson',
        at: Math.max(l.createdAt || 0, ...(l.chat || []).map((c) => c.at || 0)),
        title: l.title || l.q || 'Untitled',
        lang: l.lang,
        glyph: l.scratch
          ? '✎'
          : l.mode === 'challenge'
            ? '⚑'
            : l.mode === 'compare'
              ? '⇄'
              : l.mode === 'build'
                ? '⚒'
                : Object.values(progress.path || {}).includes(l.id)
                  ? '⤳'
                  : null,
        stop: stopNo[l.id] || null,
        idea: l.mode === 'idea' ? l.context?.ideaId : null,
        asked: (l.chat || []).filter((c) => c.q).length,
        right: (l.checks || []).filter((c) => c.ok).length,
        live: l.status === 'streaming',
        open: () => openLesson(l),
      }));
    const ps = projects
      .filter((p) => p.kind === 'github' || p.kind === 'local')
      .map((p) => ({
        k: `p:${p.key}`,
        kind: 'project',
        at: p.at || 0,
        title: (p.full || p.name || '').split('/').pop(),
        owner: p.kind === 'github' ? (p.full || p.key).split('/')[0] : null,
        asked: (convo[p.key] || []).length,
        open: () => openProject(p),
      }));
    return [...ls, ...ps].sort((a, b) => b.at - a.at).slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, projects, progress.path]);
  // lessons that ship with Bento, findable from ⌘K and the Home ask box (they open instantly, without your AI)
  const builtins = [
    ...SAMPLES.map((l) => ({
      label: l.title,
      alt: l.q,
      find: `${l.title} ${l.q} ${(l.concepts || []).join(' ')}`,
      hint: l.kicker,
      run: () => openLesson(lessons.find((x) => x.id === l.id) || l),
    })),
    ...Object.entries(PRE.sims).map(([k, l]) => ({
      label: l.title,
      alt: k,
      find: `${l.title} ${k}`,
      hint: 'simulation',
      run: () => openSim(k),
    })),
    ...RACE_LESSONS.map((l) => ({
      label: l.title,
      find: `${l.title} ${l.q} race`,
      hint: 'algorithm race',
      run: () => openLesson(l),
    })),
    ...tracksWith().flatMap((track) =>
      track.stops
        .filter((st) => PRE.path[st.id])
        .map((st) => ({
          label: st.t,
          alt: PRE.path[st.id].title,
          find: `${st.t} ${PRE.path[st.id].title} ${st.q} ${st.d}`,
          hint: track.title,
          run: () => startStop(st),
        })),
    ),
  ];
  const skyDots = useMemo(
    () =>
      SKILLS.map(([id, region, name]) => ({
        id,
        r: region,
        name,
        lv: mastery[id]?.level || 0,
        c: (REGIONS.find((r) => r.id === region) || {}).color,
      })),
    [mastery],
  );
  const readIds = Object.fromEntries(
    lessons
      .filter((l) => l.context?.ideaId && l.status === 'done' && (!l.builtin || l.touched))
      .map((l) => [l.context.ideaId, true]),
  );

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

  const dragStory = (e) => {
    e.preventDefault();
    const main = e.currentTarget.parentElement.getBoundingClientRect();
    const mv = (ev) =>
      setStoryW(Math.min(0.6, Math.max(0.26, (ev.clientX - main.left) / main.width)));
    const up = () => {
      removeEventListener('mousemove', mv);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', mv);
    addEventListener('mouseup', up);
  };

  const streaming = current?.status === 'streaming';
  return (
    <div
      className={`app ${phone ? `phone ${drawer ? 'drawer-open' : ''} ${isRoot(view) ? 'at-root' : 'at-detail'}` : sideOpen ? '' : 'side-closed'}`}
    >
      {phone && (
        <TopBar
          view={view}
          title={phoneTitle}
          onBack={goBack}
          onMenu={() => setDrawer(true)}
          onSearch={() => setPal(true)}
          setView={setView}
          scrolled={scrolled}
          seg={
            view === 'lesson' &&
            current &&
            !(article && current.code && current.lang !== 'html' && !current.steps?.length)
              ? {
                  value: pane,
                  options: [
                    ['story', t('Lesson')],
                    ['code', current.lang === 'html' ? t('Page') : t('Code')],
                  ],
                  onChange: setPane,
                }
              : null
          }
        />
      )}
      {phone && (
        <div
          className={`pveil ${drawer ? 'on' : ''}`}
          onClick={() => setDrawer(false)}
          aria-hidden="true"
        />
      )}
      {saveTrouble && (
        <div className="save-trouble" role="alert">
          <b>
            {saveTrouble === 'ENOSPC'
              ? 'Your disk is full, so Bento can’t save.'
              : 'Bento can’t save your work right now.'}
          </b>
          <span>
            {saveTrouble === 'ENOSPC'
              ? 'Free up some space. Nothing is lost while Bento stays open, and it saves again by itself.'
              : 'Nothing is lost while Bento stays open. It keeps trying, and Settings → Back up… saves a copy anywhere you like.'}
          </span>
          <button className="ib" aria-label="Dismiss" onClick={() => setSaveTrouble(null)}>
            ✕
          </button>
        </div>
      )}
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('content')?.focus();
        }}
      >
        Skip to the main area
      </a>
      <Sidebar
        onClose={() => (phone ? setDrawer(false) : setSideOpen(false))}
        closed={phone ? !drawer : !sideOpen}
        view={view}
        setView={setView}
        lessons={lessons}
        current={currentId}
        onOpen={openLesson}
        onNew={() => setViewRaw('home')}
        projects={projects}
        atlasKey={view === 'atlas' ? atlasKey : null}
        atlases={atlases}
        onOpenProject={(p) => showAtlas(p.key)}
        onForgetProject={(k) => setProjects((ps) => ps.filter((p) => p.key !== k))}
        onDelete={(id) => {
          cancels.current.get(id)?.();
          setLessons((ls) => ls.filter((l) => l.id !== id));
          if (id === currentId) setViewRaw('home');
        }}
        settings={settings}
        setSettings={setSettings}
        providers={providers}
        user={user}
        progress={progress}
        onSetup={() => setOnb(1)}
        onSettings={() => {
          setShowSettings(true);
          setDrawer(false);
        }}
        siteKey={siteKey}
      />
      {/* (the tips point at a Mac's controls, often on the other side of a phone's Lesson | Code switch) */}
      {onb == null && !phone && view === 'lesson' && current && (
        <Coach
          key="lesson"
          screen="lesson"
          ready={!streaming && !!current.code && current.lang !== 'html'}
        />
      )}
      {onb == null && !phone && view === 'atlas' && (
        <Coach key="atlas" screen="atlas" ready={!!atlases[atlasKey]?.facts} />
      )}
      {dropping && (
        <div className="drop-veil">
          <div className="drop-card">
            <span>⤓</span>
            <b>Drop to take it apart</b>
            <i>
              A folder becomes a picture of the project. A code file gets explained line by line.
            </i>
          </div>
        </div>
      )}
      {showKeys && <KeySheet onClose={() => setShowKeys(false)} />}
      {fellBack && (
        <div className="fellback" role="status">
          {fellBack.from} couldn’t answer, so {fellBack.to} did (its plan pays).{' '}
          <button className="link small" onClick={() => setFellBack(null)}>
            OK
          </button>
        </div>
      )}
      {findOpen && <FindBar onClose={() => setFindOpen(false)} />}
      {showSettings && (
        <Settings
          settings={settings}
          setSettings={setSettings}
          providers={providers}
          onClose={() => setShowSettings(false)}
          onSetup={() => {
            setShowSettings(false);
            setOnb(1);
          }}
          onOpenData={() => api.openData?.()}
          packs={packs}
          onRemovePack={(id) => setPacks((ps) => ps.filter((p) => p.id !== id))}
          onAddPack={(json) => {
            const { errors, pack } = validatePack(json);
            if (errors.length) return { errors };
            setPacks((ps) => [...ps.filter((p) => p.id !== pack.id), pack]);
            return { pack };
          }}
          onBackup={() => api.backupSave?.()}
          onRestore={async () => {
            const d = await api.backupLoad?.();
            return d ? restoreBackup(d) : null;
          }}
          onReplayOnboarding={() => {
            setShowSettings(false);
            setOnb(0);
          }}
          wordsCount={Object.keys(progress.words || {}).length}
          lessonsCount={lessons.filter((l) => !l.builtin).length}
        />
      )}
      {pal && (
        <Palette
          onOpenAt={openRepoAt}
          onOpenSite={openSite}
          onClose={() => setPal(false)}
          lessons={lessons}
          projects={projects}
          words={progress.words || {}}
          actions={[
            ['home', 'Learn: ask anything', <Icon key="home" name="learn" size={15} />],
            ['path', 'Paths: learn it in order', <Icon key="path" name="path" size={15} />],
            ['explore', 'Explore code', <Icon key="explore" name="explore" size={15} />],
            ['ideas', 'Clever ideas', '⬡'],
            [
              'puzzles',
              'Puzzles: LeetCode, from the top down',
              <Icon key="puzzles" name="practice" size={15} />,
            ],
            ['play', 'Playgrounds: SQL, Git and the terminal, designing for a billion', '▦'],
            ['map', 'Your map: everything you know', '✺'],
            ['words', 'Your words', 'Aa'],
            ['bug', 'Daily bug', '⚑'],
          ]
            .map(([v, label, icon]) => ({ label, icon, run: () => setView(v) }))
            .concat([
              {
                label: 'Settings',
                icon: <Icon name="gear" size={15} />,
                run: () => setShowSettings(true),
              },
              { label: 'Keyboard shortcuts', icon: '?', run: () => setShowKeys(true) },
              {
                label: 'Connections & setup',
                icon: <Icon name="plus" size={15} />,
                run: () => setOnb(1),
              },
              {
                label: 'Open a folder on this Mac',
                icon: <Icon name="folder" size={15} />,
                run: openFolderAtlas,
              },
              { label: 'Compare two apps', icon: '⇄', run: () => openCompare() },
              { label: 'Scratchpad: write your own code', icon: '✎', run: () => newScratch() },
            ])
            .filter(
              (a) =>
                !(TOUCH && a.label === 'Keyboard shortcuts') &&
                !(api.remote && /^(Connections|Open a folder)/.test(a.label)),
            )}
          onAsk={(q) => onAsk(q, {})}
          onOpenRepo={openRepo}
          onLesson={openLesson}
          onProject={(p) => showAtlas(p.key)}
          onIdea={readIdea}
          onWord={() => setViewRaw('words')}
          builtins={builtins}
        />
      )}
      {onb != null && (
        <Onboarding
          api={api}
          settings={settings}
          setSettings={setSettings}
          startAt={onb}
          onDone={(go) => {
            setOnb(null);
            if (go === 'sample')
              openLesson(SAMPLES.find((lesson) => lesson.id === 'sample-spiral'));
            else if (['explore', 'ideas', 'path', 'puzzles'].includes(go)) setViewRaw(go);
            else setViewRaw('home');
            api
              .providers()
              .then(setProviders)
              .catch(() => setProviders({ scanFailed: true }));
          }}
        />
      )}
      <main
        className={`sheet ${groupOf(view)?.views.length > 1 && groupOf(view).views.some(([v]) => v === view) ? 'has-tabs' : ''}`}
        id="content"
        tabIndex={-1}
        onScrollCapture={
          phone
            ? (e) => {
                const y = e.target?.scrollTop || 0;
                if (y > 8 !== scrolled) setScrolled(y > 8);
                noteScroll(page, e.currentTarget, e.target);
              }
            : undefined
        }
      >
        <div className="titlebar-drag" />
        {!sideOpen && (
          <button
            className="side-open"
            onClick={() => setSideOpen(true)}
            aria-label={`${t('Show the sidebar')} (${keys('⌘\\')})`}
            title={`${t('Show the sidebar')}  ${keys('⌘\\')}`}
          >
            <Icon name="sidebar" size={17} />
          </button>
        )}
        {(() => {
          const group = groupOf(view);
          if (!group || group.views.length < 2 || !group.views.some(([v]) => v === view))
            return null;
          return (
            <div className="gtabs">
              <div className="gt-list" role="tablist" aria-label={t(group.label)}>
                {group.views.map(([v, label]) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={view === v}
                    className={view === v ? 'on' : ''}
                    onClick={() => setView(v)}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              {group.extra && (
                <>
                  <span className="gt-sep" aria-hidden="true" />
                  <button className="gt-extra" onClick={() => setView(group.extra[0])}>
                    ⚑ {t(group.extra[1])}
                    <span className="coins">
                      <i className="coin" />
                      {progress.coins ?? 5}
                    </span>
                  </button>
                </>
              )}
            </div>
          );
        })()}
        {view === 'home' && (
          <Home
            builtins={builtins}
            threads={threads}
            skyDots={skyDots}
            about={recentProject}
            onDropAbout={() => setRecent(null)}
            finding={finding}
            choice={choice}
            onChoose={(g) => {
              const c = choice;
              setChoice(null);
              if (!c) return;
              if (g) goToProject(c.q, { ...c.d, kind: 'go', why: 'chosen', pick: g });
              else askLesson(c.q, { ...c.o, noRoute: true });
            }}
            onCancelFinding={() => {
              const f = finding;
              cancelFinding();
              if (f) askLesson(f.q, {});
            }}
            today={today}
            onMap={() => setViewRaw('map')}
            lit={SKILLS.filter(([id]) => (mastery[id]?.level || 0) >= 2).length}
            onAsk={onAsk}
            settings={settings}
            setSettings={setSettings}
            project={project}
            setProject={setProject}
            onPickFolder={() => setProject('folder')}
            onPickRepo={(r) => setProject({ repo: r })}
            repos={repos}
            loadRepos={loadRepos}
            samples={SAMPLES}
            challenge={CHALLENGE}
            onOpen={openLesson}
            user={user}
            recent={lessons.filter((l) => !l.builtin)}
            providers={providers}
            onOpenRepo={openRepo}
            onExplore={() => setViewRaw('explore')}
            onIdea={readIdea}
            onScratch={() => newScratch()}
            onDaily={openDaily}
            onSim={openSim}
            onSetup={() => setOnb(1)}
            onSuggest={async (rs) => {
              const list = rs
                .slice(0, 25)
                .map(
                  (r) =>
                    `${r.name} (${r.primaryLanguage?.name || '?'})${r.description ? `: ${r.description.slice(0, 80)}` : ''}`,
                )
                .join('\n');
              const j = parseJSONLoose(
                await api.quick(
                  settings.model,
                  `A learner (${settings.level}) has these GitHub repos:\n${list}\n\nSuggest 3 short lessons that would most help THEM next, based on what they actually build (a gap, a next step, or a deeper look at a tool they use). Each lesson must be teachable with a small runnable example.\nReply JSON: {"items":[{"title":"≤ 6 words","why":"≤ 12 words, mention their project or tool","q":"the question to ask, ≤ 18 words","lang":"python|javascript|typescript"}]}`,
                ),
              );
              return (j?.items || []).slice(0, 3);
            }}
            onWords={() => setViewRaw('words')}
            words={progress.words || {}}
            stats={{
              days: activityByDay(lessons, progress.words),
              streak: streakOf(lessons),
              lessons: lessons.filter((l) => !l.builtin && l.status === 'done').length,
              ideas: Object.keys(readIds).length,
              words: Object.keys(progress.words || {}).length,
              apps: projects.length,
            }}
          />
        )}
        {view === 'compare' && (
          <Compare
            projects={projects.filter((x) => x.kind !== 'site')}
            atlases={atlases}
            ensure={ensureProject}
            pair={pair}
            setPair={setPair}
            onCompareAsk={compareAsk}
            onOpenProject={showAtlas}
          />
        )}
        {view === 'path' && (
          <Path
            custom={[...(progress.tracks || []), ...packStuff.paths]}
            onDropPath={(id) =>
              setProgress((p) => ({ ...p, tracks: (p.tracks || []).filter((t) => t.id !== id) }))
            }
            onMakePath={makePath}
            done={Object.fromEntries(
              Object.entries(progress.path || {})
                .filter(
                  ([, id]) => id === 'x' || lessons.some((l) => l.id === id && l.status === 'done'),
                )
                .map(([k]) => [k, true]),
            )}
            onGo={goStop}
            onIdeas={() => setViewRaw('ideas')}
          />
        )}
        {view === 'site' && sites[siteKey] && (
          <Site
            key={siteKey}
            site={sites[siteKey]}
            onOpenRepo={openRepo}
            modelLabel={modelLabel(settings.model)}
            onOpenUrl={(u) => api.openExternal(u)}
            onRetry={() => {
              const x = sites[siteKey];
              setSites((m) => {
                const n = { ...m };
                delete n[siteKey];
                return n;
              });
              setTimeout(() => openSite(x.url), 0);
            }}
            onAsk={(q) =>
              askLesson(
                `${q} (I'm studying the website ${siteKey}${sites[siteKey]?.narr?.gist?.one ? `: ${sites[siteKey].narr.gist.one}` : ''})`,
                {},
              )
            }
          />
        )}
        {view === 'ideas' && (
          <Ideas
            instant={!settings.voice || settings.voice === 'English' ? PRE.ideas : {}}
            races={[]}
            onRace={openLesson}
            onPuzzles={() => setViewRaw('puzzles')}
            extra={packStuff.ideas}
            onRead={readIdea}
            readIds={readIds}
            interests={settings.interests}
          />
        )}
        {view === 'play' && (
          <Playgrounds
            top={trailBar()}
            tab={playTab}
            setTab={setPlayTab}
            progress={progress}
            onProgress={(kind, id) =>
              setProgress((p) =>
                p[kind]?.[id] ? p : { ...p, [kind]: { ...(p[kind] || {}), [id]: Date.now() } },
              )
            }
            quick={noAI(providers) ? null : (m, q) => api.quick(m, q)}
            model={settings.model}
            pyReady={pyReady}
            onAsk={(q) => askLesson(q, {})}
          />
        )}
        {view === 'map' && (
          <SkillMap
            readyFor={readyFor}
            mastery={mastery}
            lessons={lessons}
            onAsk={(q) => askLesson(q, {})}
            onPuzzle={openPuzzle}
            onOpenLesson={(id) => {
              const l = lessons.find((x) => x.id === id);
              if (l) openLesson(l);
            }}
            quick={noAI(providers) ? null : (m, q) => api.quick(m, q)}
            model={settings.model}
            onReviewed={(ids, score = 0, total = 0) =>
              setProgress((p) => ({
                ...p,
                reviewed: {
                  ...(p.reviewed || {}),
                  ...Object.fromEntries(ids.map((id) => [id, Date.now()])),
                },
                reviewScores: {
                  ...(p.reviewScores || {}),
                  ...Object.fromEntries(
                    ids.map((id) => {
                      const old = p.reviewScores?.[id] || { right: 0, total: 0 };
                      return [
                        id,
                        {
                          right: old.right + (ids.length === 1 ? score : Math.min(score, 1)),
                          total: old.total + total,
                          at: Date.now(),
                        },
                      ];
                    }),
                  ),
                },
              }))
            }
          />
        )}
        {view === 'puzzles' && (
          <Puzzles
            races={RACE_LESSONS}
            onRace={openLesson}
            progress={progress}
            onOpen={openPuzzle}
            onIdeas={() => setViewRaw('ideas')}
            onIdea={readIdea}
          />
        )}
        {view === 'words' && (
          <Words
            onAdd={(w) =>
              setProgress((p) => {
                const k = w.term.toLowerCase();
                if (p.words?.[k]) return p;
                return { ...p, words: { ...(p.words || {}), [k]: { ...w, at: Date.now() } } };
              })
            }
            onGrade={(term, g) =>
              setProgress((p) => {
                const k = String(term).toLowerCase();
                return { ...p, words: { ...p.words, [k]: { ...p.words[k], ...g } } };
              })
            }
            words={progress.words || {}}
            onOpen={(id) => {
              const l = lessons.find((x) => x.id === id);
              if (l) openLesson(l);
            }}
            onAsk={(t) => askLesson(`Explain "${t}" with a tiny example`, {})}
          />
        )}
        {view === 'explore' && (
          <Explore
            top={trailBar()}
            api={api}
            onOpenAt={openRepoAt}
            onOpenSite={openSite}
            onCompare={() => openCompare()}
            onOpenRepo={openRepo}
            onOpenFolder={openFolderAtlas}
            projects={projects}
            onOpenProject={openProject}
            repos={repos}
            loadRepos={loadRepos}
            user={user}
            onConnectGitHub={api.remote ? null : () => setOnb(1)}
          />
        )}
        {view === 'atlas' && atlases[atlasKey] && (
          <AtlasScreen
            {...{
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
            }}
          />
        )}
        {view === 'lesson' && current && (
          <LessonScreen
            {...{
              altFor,
              altModel,
              api,
              article,
              askLesson,
              award,
              cancels,
              current,
              desk,
              dragStory,
              findWild,
              goStop,
              knownWordSet,
              linkRange,
              newScratch,
              noteFlash,
              onPuzzleResult,
              onTerm,
              onTry,
              openRepo,
              openRepoAt,
              pane,
              patch,
              pathOf,
              phone,
              progress,
              providers,
              pyReady,
              readIdea,
              reopened,
              runWaits,
              runs,
              setArticle,
              setLessons,
              setLinkRange,
              setPane,
              setProgress,
              setPuzzleCode,
              setReopened,
              setRuns,
              setSettings,
              setStepSel,
              setViewRaw,
              settings,
              showAtlas,
              stepSel,
              storyW,
              streaming,
            }}
          />
        )}
        {sel && !pop && (
          <button
            className="sel-pill"
            style={{ left: sel.x, top: Math.max(8, sel.y - 40) }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={explainSelection}
          >
            <span>✦</span>Explain
          </button>
        )}
        {pop && (
          <div
            className="pop tok-card big"
            style={{
              left: Math.min(pop.x, innerWidth - 340),
              top: Math.min(pop.y, innerHeight - 220),
            }}
          >
            {pop.loading ? (
              <>
                <div className="tok-head">
                  <span className="tok-word">{pop.kind === 'try' ? 'Trying it…' : pop.word}</span>
                  <span className="tok-kind">{pop.kind === 'try' ? pop.word : 'asking…'}</span>
                </div>
                <div className="shimmer" />
                <div className="shimmer short" />
              </>
            ) : (
              pop.info && (
                <>
                  <div className="tok-head">
                    <span className={`tok-word ${pop.info.t === 'explained' ? 'phrase' : ''}`}>
                      {pop.info.title}
                    </span>
                    <span className="tok-kind">{pop.info.t}</span>
                  </div>
                  {pop.info.w && <div className="tok-what">{pop.info.w}</div>}
                  {pop.info.p && (
                    <div className="tok-plain">
                      <span className="tok-plain-k">here</span>
                      <span>{pop.info.p}</span>
                    </div>
                  )}
                  {pop.info.ex && <pre className="tok-ex">{pop.info.ex}</pre>}
                </>
              )
            )}
          </div>
        )}
      </main>
      {phone && (
        <TabBar
          away={!isRoot(view)}
          view={view}
          setView={setView}
          onTop={() =>
            document.querySelectorAll('#content *').forEach((el) => {
              if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' });
            })
          }
        />
      )}
    </div>
  );
}
