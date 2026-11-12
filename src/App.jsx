import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLES, CHALLENGE, emptyLesson, applyBlock, ndjsonParser, buildPrompt, parseJSONLoose } from './lesson.js';
import { tidyLesson } from './verify.js'; // when a lesson finishes: slipped plain English is written again, slipped line links moved back
import { projectNames, decide, mentionedProject, pointsBack, namesALesson } from './findProject.js';
import { explainToken } from './explain.js';
import { pyState, warmPython } from './runtime/runner.js';
import Story from './ui/Story.jsx';
import Desk from './ui/Desk.jsx';
import Home from './ui/Home.jsx';
import Explore, { parseBlob, parseRepo, parseSite } from './ui/Explore.jsx';
import Atlas from './ui/Atlas.jsx';
import Ideas from './ui/Ideas.jsx';
import Onboarding from './ui/Onboarding.jsx';
import Words from './ui/Words.jsx';
import Palette from './ui/Palette.jsx';
import Compare from './ui/Compare.jsx';
import Path from './ui/Path.jsx';
import Settings from './ui/Settings.jsx';
import Site from './ui/Site.jsx';
import Coach from './ui/Coach.jsx';
import Puzzles, { PuzzlePanel, PuzzleEnd } from './ui/Puzzles.jsx';
import { puzzleLesson, puzzleById, codeParts, codeOf, englishMap } from './puzzles.js';
import { setUILanguage, useT, t } from './i18n.js';
import SkillMap from './ui/SkillMap.jsx';
import Playgrounds from './ui/Playgrounds.jsx';
import PathBar from './ui/PathBar.jsx';
import { masteryOf, SKILLS, REGIONS, isFading, skillsFor } from './skills.js';
import { loadPacks, savePacks, validatePack, applyPacks } from './packs.js';
import { PUZZLES } from './puzzles.js';
import { RACES } from './races.js';
import { ideaById, IDEAS } from './ideas.js';
import PREBUILT_RAW from './ideas-prebuilt.json';
import PATH_RAW from './path-prebuilt.json';
import SIM_RAW from './sims-prebuilt.json';
import BUGS_RAW from './bugs-prebuilt.json'; // one pre-written Python daily bug per topic, so the daily bug opens instantly
import { useDialog } from './ui/a11y.js';
const SIM_PRE = Object.fromEntries(Object.entries(SIM_RAW).map(([k, l], i) => [k, { ...l, id: `sim-${i}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
import { ALL_STOPS, tracksWith, stopSkills } from './paths.js';
import { noAI, altOf, usableModel } from './ai.js';
const PATH_PRE = Object.fromEntries(Object.entries(PATH_RAW).map(([k, l]) => [k, { ...l, id: `path-${k}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
const PREBUILT = Object.fromEntries(Object.entries(PREBUILT_RAW).map(([k, l]) => [k, { ...l, id: `idea-${k}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
import { Sidebar, modelLabel, groupOf, rememberTab } from './ui/Side.jsx';
import Icon from './ui/Icons.jsx';
import { filesForQuestion, guessRole, projectParts, isOverviewQuestion, searchWords } from './atlas/analyze.js';
import { mockBridge } from './mock.js';
import useLibrary, { FEATURED } from './hooks/useLibrary.js';
import { load, save, saveLessons, cleanErr } from './store.js';
import { mod, keys } from './platform.js';

const api = window.bento || mockBridge;

// lessons that were mid-stream when the app closed can't resume: keep what arrived, or mark them interrupted
// days in a row (ending today or yesterday) with at least one finished lesson
// how much you learned each day (lessons + new words), for the activity grid on Home
const activityByDay = (ls, words = {}) => { const m = {}; const add = (t) => { if (!t) return; const k = new Date(t).toDateString(); m[k] = (m[k] || 0) + 1; }; ls.forEach((l) => !l.builtin && l.status === 'done' && add(l.createdAt)); Object.values(words).forEach((w) => add(w.at)); return m; };
const streakOf = (ls) => { const days = new Set(ls.filter((l) => !l.builtin && l.status === 'done' && l.createdAt).map((l) => new Date(l.createdAt).toDateString())); let n = 0; const d = new Date(); if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); } return n; };
// What browser storage held at startup, before the app writes its defaults: the disk mirror is compared against this.
const BOOT = (() => { try { return { savedAt: +localStorage.getItem('bento.savedAt') || 0, has: new Set(['bento.lessons', 'bento.progress', 'bento.settings', 'bento.projects'].filter((k) => { const v = localStorage.getItem(k); return v && v !== '[]' && v !== '{}'; })) }; } catch { return { savedAt: 0, has: new Set() }; } })();
const settle = (ls) => ls.map((l) => (l.status === 'streaming' ? { ...l, status: l.code || l.steps?.length ? 'done' : 'error', error: l.code || l.steps?.length ? null : 'This lesson was interrupted when Bento closed.', thinking: null } : l));

const RACE_LESSONS = RACES.map((r) => ({ ...emptyLesson(r.q, r), ...r, status: 'done', builtin: true, race: true }));

export default function App() {
  const [lessons, setLessons] = useState(() => settle(load('bento.lessons', [])));
  const [currentId, setCurrentId] = useState(null);
  const [view, setViewRaw] = useState('home');
  const [settings, setSettingsRaw] = useState(() => ({ model: 'claude:sonnet', level: 'student', lang: 'python', ...load('bento.settings', {}) }));
  const [progress, setProgress] = useState(() => load('bento.progress', { concepts: {}, coins: 5 }));
  const [providers, setProviders] = useState(null);
  const providersRef = useRef(null); providersRef.current = providers;
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
  const setPacks = (fn) => setPacksRaw((p) => { const n = typeof fn === 'function' ? fn(p) : fn; savePacks(n); return n; });
  const packStuff = useMemo(() => applyPacks(packs), [packs]);
  const [linkRange, setLinkRange] = useState(null);
  const [stepSel, setStepSel] = useState(null);
  const [pop, setPop] = useState(null);
  const [storyW, setStoryW] = useState(() => { const w = load('bento.storyW', 0.47); return w === 0.4 ? 0.47 : w; });
  // the sidebar can close (⌘\ or its button) to give the page the whole window
  const [sideOpen, setSideOpen] = useState(() => load('bento.side', true));
  useEffect(() => save('bento.side', sideOpen), [sideOpen]);
  const desk = useRef(null);
  const cancels = useRef(new Map());

  const setSettings = (p) => setSettingsRaw((s) => { const n = { ...s, ...p }; save('bento.settings', n); return n; });
  useEffect(() => {
    api.setPrefs?.({ voice: settings.voice || 'English' });
    const CODES = { English: 'en', Español: 'es', Português: 'pt', Français: 'fr', Deutsch: 'de', Italiano: 'it', Nederlands: 'nl', Polski: 'pl', Türkçe: 'tr', Русский: 'ru', Українська: 'uk', العربية: 'ar', हिन्दी: 'hi', বাংলা: 'bn', 'Bahasa Indonesia': 'id', 'Tiếng Việt': 'vi', ไทย: 'th', Filipino: 'fil', 中文: 'zh', 日本語: 'ja', 한국어: 'ko', Kiswahili: 'sw' };
    document.documentElement.lang = CODES[settings.voice] || 'en'; // read-aloud picks a matching voice
    // menus and buttons in the same language: translated once by your own AI, then kept on this Mac
    setUILanguage(settings.voice || 'English', async (strings, language) => parseJSONLoose(await api.quick(settings.model, `Translate these short labels from a friendly app that teaches coding into ${language}. They are buttons, menu items and headings, so keep each one about as short as the English. Keep words wrapped in *stars* wrapped in stars (they are emphasised). Keep product and technical names as they are: Bento, Python, JavaScript, TypeScript, LeetCode, GitHub, Big-O, O(n), ⌘ and other symbols.\nReply with only a JSON object mapping each English string exactly to its translation.\n${JSON.stringify(strings)}`)));
  }, [settings.voice]);
  const lib = useLibrary({ api, settings, setProgress, setProjectRaw, setViewRaw, getProviders: () => providersRef.current });
  const { atlases, setAtlases, atlasKey, setAtlasKey, atlasRef, projects, setProjects, sites, setSites, siteKey, setSiteKey,
    stopReading, patchAtlas, asProject, narrate, openAtlas, openRepo, openRepoAt, openSite, openFolderAtlas, openProject, showAtlas, setProject, ensureProject,
    pendingFile, setPendingFile, findWild } = lib;
  // restore from the disk mirror when browser storage was lost (crash, forced quit)
  useEffect(() => { api.storeGet?.().then((d) => {
    if (!d || typeof d !== 'object') return;
    // a damaged save file must never blank the app: keep only values of the right shape
    if (!Array.isArray(d['bento.lessons'])) delete d['bento.lessons']; else d['bento.lessons'] = d['bento.lessons'].filter((l) => l && typeof l === 'object' && l.id);
    if (!Array.isArray(d['bento.projects'])) delete d['bento.projects'];
    for (const k of ['bento.progress', 'bento.settings']) if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) delete d[k];
    // whichever copy was written last wins (browser storage can lag behind after a crash)
    const diskNewer = (d['bento.savedAt'] || 0) > BOOT.savedAt;
    if ((diskNewer || !BOOT.has.has('bento.lessons')) && d['bento.lessons']?.length) setLessons(settle(d['bento.lessons']));
    else if (d['bento.lessons']?.length) setLessons((ls) => { const have = new Set(ls.map((l) => l.id)); const older = d['bento.lessons'].filter((l) => !have.has(l.id)); return older.length ? [...ls, ...settle(older)] : ls; }); // lessons older than the newest 60 live only on disk
    if ((diskNewer || !BOOT.has.has('bento.progress')) && d['bento.progress']) setProgress(d['bento.progress']);
    if ((diskNewer || !BOOT.has.has('bento.settings')) && d['bento.settings']) { setSettingsRaw((s0) => { const n = { ...s0, ...d['bento.settings'] }; save('bento.settings', n); return n; }); if (d['bento.settings'].onboarded) setOnb(null); } // restored settings are kept, and a finished welcome stays finished
    if ((diskNewer || !BOOT.has.has('bento.projects')) && d['bento.projects']?.length) setProjects((ps) => { const seen = new Set(ps.map((x) => x.key)); return [...ps, ...d['bento.projects'].filter((x) => !seen.has(x.key))]; });
  }).catch(() => {}); }, []);
  // bento:// links from the "Open in Bento" bookmark: a GitHub repo or file, any website, or a question
  useEffect(() => {
    const go = (url) => {
      let U; try { U = new URL(url); } catch { return; }
      const what = U.searchParams.get('u') || U.searchParams.get('url') || ''; const q = U.searchParams.get('q');
      if (U.hostname === 'ask' && q) return askLesson(q.slice(0, 500), {});
      const blob = parseBlob(what); if (blob) return openRepoAt(blob.full, blob.path);
      const repo = parseRepo(what); if (repo) return openRepo(repo);
      const site = parseSite(what); if (site) return openSite(site);
    };
    api.pendingLink?.().then((u) => u && go(u));
    return api.onDeepLink?.(go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a backup file brings everything back, merged with what's already here (nothing is lost on either side)
  const restoreBackup = (d) => {
    let added = 0;
    if (Array.isArray(d['bento.lessons'])) setLessons((ls) => { const have = new Set(ls.map((l) => l.id)); const more = settle(d['bento.lessons'].filter((l) => l?.id && !have.has(l.id))); added = more.length; return [...ls, ...more]; });
    if (Array.isArray(d['bento.projects'])) setProjects((ps) => { const seen = new Set(ps.map((x) => x.key)); return [...ps, ...d['bento.projects'].filter((x) => x?.key && !seen.has(x.key))]; });
    const P = d['bento.progress'];
    if (P && typeof P === 'object') setProgress((p) => {
      const n = { ...p };
      n.words = { ...(P.words || {}), ...(p.words || {}) };
      n.path = { ...(P.path || {}), ...(p.path || {}) };
      n.puzzles = { ...(P.puzzles || {}) }; for (const [k, r] of Object.entries(p.puzzles || {})) { const o = n.puzzles[k] || {}; n.puzzles[k] = { ...o, ...r, s: [0, 1, 2].map((i) => !!(o.s?.[i] || r.s?.[i])) }; }
      n.concepts = { ...(P.concepts || {}) }; for (const [k, v] of Object.entries(p.concepts || {})) n.concepts[k] = Math.max(v, n.concepts[k] || 0);
      for (const k of ['sql', 'git', 'design', 'reviewed', 'daily']) n[k] = { ...(P[k] || {}), ...(p[k] || {}) };
      n.tracks = [...(p.tracks || []), ...(P.tracks || []).filter((t) => !(p.tracks || []).some((x) => x.id === t.id))];
      n.coins = Math.max(p.coins ?? 5, P.coins ?? 5);
      return n;
    });
    return added;
  };
  const knownWordSet = useMemo(() => new Set(Object.keys(progress.words || {})), [progress.words]);
  // design a custom learning path for any goal (used by The path and by an Atlas's "what it takes" card)
  const makePath = async (goal) => {
            if (noAI(providers)) throw new Error('Connect an AI first (bottom-left), then Bento can design a path for you.');
            const j = parseJSONLoose(await api.quick(settings.model, `Design a learning path for a ${settings.level} learner whose goal is: "${goal}".\nThe whole path builds ONE small project, chosen to fit the goal. 6–9 short stops: the first starts from nothing, each later stop extends the program from the stop before (same names, same data), and the last stop puts it all together into a working result the learner can show someone. Each stop is ONE lesson taught with a small runnable program (Python or JavaScript; use "html" for web pages; for SQL use Python's sqlite3 in memory). No network, files or installs. Introduce at most 3 new ideas per stop, in an order where nothing is used before it's taught.\nReply JSON: {"title":"≤ 4 words","d":"one sentence, ≤ 14 words","project":"the project's name and one line about it, ≤ 12 words","end":"what the learner will have at the end, concrete, ≤ 14 words","stops":[{"t":"stop title ≤ 6 words","d":"≤ 14 words, plain","make":"what this stop's program adds to the project, ≤ 10 words","mins":5-15,"q":"the exact question to ask for this lesson, ≤ 25 words","lang":"python|javascript|html","words":["2-3 technical words this stop introduces"]}]}`));
            if (!j?.stops?.length) throw new Error('Couldn’t design that path. Try wording the goal differently.');
            const id = `c${Date.now().toString(36)}`;
            const track = { id, goal, title: j.title || goal.slice(0, 24), d: j.d || goal, project: j.project || '', end: j.end || '', stops: j.stops.slice(0, 10).map((x, i) => ({ id: `${id}-${i}`, t: x.t, d: x.d, make: x.make || '', mins: Math.max(3, Math.min(20, +x.mins || 8)), q: x.q, lang: ['python', 'javascript', 'html', 'typescript'].includes(x.lang) ? x.lang : undefined, words: (x.words || []).slice(0, 3) })) };
            setProgress((p) => ({ ...p, tracks: [...(p.tracks || []), track] }));
            return id;
          };
  // a stop in a custom path knows the whole path, and continues from the code of the stop before it
  const pathContext = (st) => {
    const T = (progress.tracks || []).find((t) => t.stops.some((s) => s.id === st.id)); if (!T) return {};
    const i = T.stops.findIndex((s) => s.id === st.id), last = i === T.stops.length - 1;
    const before = T.stops[i - 1]; const prevL = before && lessons.find((l) => l.id === progress.path?.[before.id] && l.status === 'done');
    const path = `stop ${i + 1} of ${T.stops.length} in "${T.title}" (the learner's goal: "${T.goal || T.d}")${T.project ? `. The whole path builds one project: ${T.project}` : ''}.\nStops: ${T.stops.map((s, k) => `${k + 1}. ${s.t}${k === i ? ' ← THIS ONE' : ''}`).join('; ')}.\n`
      + (i === 0 ? 'Start the project from nothing.' : prevL ? 'Continue the program from the previous stop (below): keep its names and data, and add only this stop’s piece.' : `Assume the learner built stops 1–${i} already; begin with a short version of that program, then add this stop’s piece.`)
      + (st.make ? ` This stop adds: ${st.make}.` : '') + (last && T.end ? ` This is the final stop: finish with ${T.end}` : '') + ' Don’t re-teach ideas from earlier stops; name them briefly and move on.';
    return { path, ...(prevL ? { prev: prevL } : {}) };
  };
  const startStop = (st) => { const id = progress.path?.[st.id]; const l = id && lessons.find((x) => x.id === id); if (l) return openLesson(l); const pre = PATH_PRE[st.id]; if (pre && (!settings.voice || settings.voice === 'English') && settings.level !== 'engineer') { openLesson({ ...pre, createdAt: Date.now() }); setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: pre.id } })); return; } const nid = askLesson(st.q, { ...(st.lang ? { lang: st.lang } : {}), ...(st.mode ? { mode: st.mode } : {}), ...pathContext(st) }); setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: nid } })); };
  // a stop that opens another part of Bento counts as done once it's opened
  const markStop = (st) => setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: 'x' } }));
  // (a playground or Explore shows where you are on the path, so you can go on to the next stop)
  const [trail, setTrail] = useState(null);
  useEffect(() => { if (trail && view !== trail.view) setTrail(null); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // a stop on a path that teaches this map skill and opens instantly (the next one you haven't done, or the first)
  const readyFor = (sid) => {
    const all = tracksWith().flatMap((T) => T.stops.filter((x) => (PATH_PRE[x.id] || x.idea || x.play) && stopSkills(x, skillsFor).includes(sid)).map((st) => ({ T, st })));
    const c = all.find((x) => !progress.path?.[x.st.id]) || all[0];
    return c ? { icon: c.T.icon, label: c.st.t, path: c.T.title, go: () => goStop(c.st) } : null;
  };
  const trailBar = () => (trail && view === trail.view ? <PathBar info={pathFind((x) => x.id === trail.id)} onPage={() => setViewRaw('path')} onStop={goStop} /> : null);
  const goStop = (st) => {
    setTrail(st.explore ? { id: st.id, view: 'explore' } : st.play ? { id: st.id, view: 'play' } : null);
    if (st.explore) { markStop(st); return setViewRaw('explore'); }
    if (st.site) { markStop(st); return openSite('https://wikipedia.org'); }
    if (st.play) { markStop(st); setPlayTab(st.play); return setViewRaw('play'); }
    if (st.idea && ideaById[st.idea]) { const id = readIdea(ideaById[st.idea]); return setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: id || 'x' } })); }
    return startStop(st);
  };
  // which path (and which stop) the open lesson belongs to, so it never feels like it came from nowhere
  const pathFind = (match) => {
    for (const { title: name, stops } of tracksWith([...(progress.tracks || []), ...packStuff.paths])) { const i = stops.findIndex(match); if (i >= 0) return { name, i, stops, done: stops.filter((x) => progress.path?.[x.id]).length }; }
    return null;
  };
  const pathOf = (L) => (L ? pathFind((x) => progress.path?.[x.id] === L.id) : null);
  const lessonsRef = useRef(lessons); lessonsRef.current = lessons;
  useEffect(() => { const t = setTimeout(() => saveLessons(lessons), 400); return () => clearTimeout(t); }, [lessons]);
  useEffect(() => { const flush = () => saveLessons(lessonsRef.current); addEventListener('beforeunload', flush); return () => removeEventListener('beforeunload', flush); }, []); // never lose the last edit on quit
  useEffect(() => save('bento.progress', progress), [progress]);
  useEffect(() => save('bento.storyW', storyW), [storyW]);

  useEffect(() => {
    api.providers().then((p) => {
      setProviders(p);
      const usable = usableModel(settings.model, p); if (usable !== settings.model) setSettings({ model: usable }); // the chosen AI isn't on this Mac: use one that is
      if (p.gh) api.ghMe().then(setUser).catch(() => {});
    });
    const f = (r) => setPyReady(r); pyState.listeners.add(f); warmPython();
    return () => pyState.listeners.delete(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => lessons.find((l) => l.id === currentId) || [...SAMPLES, CHALLENGE, ...RACE_LESSONS, ...Object.values(PREBUILT), ...Object.values(PATH_PRE), ...Object.values(SIM_PRE)].find((l) => l.id === currentId) || null, [lessons, currentId]);
  const patch = useCallback((id, p) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))), []);

  useEffect(() => { rememberTab(view); }, [view]);
  const setView = (v) => {
    if (v === 'bug') { openDaily(); return; }
    setViewRaw(v);
  };
  const openLesson = (l) => {
    setLessons((ls) => (ls.some((x) => x.id === l.id) ? ls : [{ ...l, touched: true }, ...ls]));
    setCurrentId(l.id); setViewRaw('lesson'); setLinkRange(null); setPop(null);
    setStepSel(l.steps?.length ? l.steps.length - 1 : null);
    award(l, 'open');
  };

  const openSim = (q) => { const pre = SIM_PRE[q]; const have = lessons.find((l) => l.id === pre?.id); if (have) return openLesson(have); if (pre && (!settings.voice || settings.voice === 'English')) return openLesson({ ...pre, createdAt: Date.now() }); askLesson(`${q} Teach it by simulating it with a small program and a picture.`, { mode: 'explain' }); };
  const openPuzzle = (pz) => { const have = lessons.find((l) => l.id === `pz-${pz.id}`); openLesson(have || puzzleLesson(pz)); };
  const setPuzzleCode = (pz, which) => { const parts = codeParts(pz, which); const id = currentId; desk.current?.setCode(codeOf(parts)); setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, pmap: { ...(l.pmap || {}), ...englishMap(parts) } } : l))); };
  const onPuzzleResult = (pid, r) => {
    setProgress((p) => { const old = p.puzzles?.[pid] || {}; const s = [0, 1, 2].map((k) => !!(old.s?.[k] || r.s[k])); return { ...p, puzzles: { ...(p.puzzles || {}), [pid]: { ...old, s, label: r.label || old.label, at: Date.now() } } }; });
    if (r.s.every(Boolean)) award(current, 'challenge');
  };

  // ---------------------------------------------------------------- asking
  const askLesson = useCallback((q, o = {}) => {
    const model = o.model || settings.model;
    const lang = o.lang || settings.lang;
    const level = o.level || settings.level;
    // asked this exact question before (same kind, language and level)? open that lesson instead of spending your plan again
    const norm = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!o.fresh && !o.context && !o.prev && !o.routed && (o.mode || 'explain') !== 'challenge' && norm(q).length > 3) {
      const dup = lessonsRef.current.find((l) => l.status === 'done' && !l.builtin && norm(l.q) === norm(q) && l.mode === (o.mode || 'explain') && l.lang === lang && (l.level || 'student') === level);
      if (dup) { openLesson(dup); setReopened({ id: dup.id, q, o }); return dup.id; }
    }
    const L0 = emptyLesson(q, { mode: o.mode || 'explain', lang, level, model, context: ['code', 'idea', 'compare', 'build'].includes(o.mode) ? o.context : o.mode === 'feature' && o.context ? { name: o.context.name, repo: o.context.repo, repoKey: o.context.repoKey, key: (o.context.key || []).map((k) => ({ path: k.path, text: k.text.slice(0, 20000) })) } : null });
    if (o.prev) L0.prevTitle = o.prev.title;
    if (o.routed) L0.routed = o.routed;
    setLessons((ls) => [L0, ...ls]);
    setCurrentId(L0.id); setViewRaw('lesson'); setLinkRange(null); setStepSel(null); setPop(null);
    const parser = ndjsonParser((b) => {
      setLessons((ls) => ls.map((l) => (l.id === L0.id ? applyBlock(l, b) : l)));
      if (b.t === 'term' && b.term) setProgress((p) => { const k = String(b.term).toLowerCase(); if (p.words?.[k]) return p; return { ...p, words: { ...(p.words || {}), [k]: { term: b.term, plain: b.plain, like: b.like, from: L0.id, title: q, at: Date.now() } } }; });
      if (b.t === 'step') setStepSel((s) => (s == null ? 0 : s + 1));
    });
    const prompt = buildPrompt({ q, mode: L0.mode, lang, level, context: o.context, path: o.path, prev: o.prev ? { title: o.prev.title, code: o.prev.work ?? o.prev.code } : null });
    const cancel = api.ask(model, prompt, {
      chunk: (t) => parser.push(t),
      think: (t) => setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, thinking: t } : l))),
      done: () => { if (!document.hasFocus() && window.Notification?.permission !== 'denied') { try { new Notification('Your lesson is ready', { body: q ? String(q).slice(0, 90) : 'Bento finished writing.', silent: true }).onclick = () => { window.focus(); setCurrentId(L0.id); setViewRaw('lesson'); }; } catch {} } parser.end(); setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, ...tidyLesson(l), status: l.code || l.story.length ? 'done' : 'error', error: l.code || l.story.length ? null : 'The model replied, but not in the lesson format. Try again or switch model.' } : l))); cancels.current.delete(L0.id); },
      error: (m) => {
        parser.end(); cancels.current.delete(L0.id);
        // Auto-route: if this AI can't answer right now (usage limit, signed out, missing), quietly ask your other one.
        const alt = altOf(model, providersRef.current);
        const account = /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/.test(m);
        const cur = lessonsRef.current.find((l) => l.id === L0.id);
        if (alt && account && !o.routed && !cur?.code && !cur?.story?.length) {
          setLessons((ls) => ls.filter((l) => l.id !== L0.id));
          askLesson(q, { ...o, model: alt, routed: { from: modelLabel(model), to: modelLabel(alt), why: /usage limit/.test(m) ? 'hit its usage limit' : /signed in/.test(m) ? 'isn’t signed in' : 'isn’t installed' } });
          return;
        }
        setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, status: l.code ? 'done' : 'error', error: m } : l)));
      },
    });
    cancels.current.set(L0.id, cancel);
    L0._ask = { q, o };
    return L0.id;
  }, [settings]);

  const readFile = (proj, f) => api.readFile(proj.root, f);
  const buildContext = async (proj, q, focus) => {
    const files = proj.files || [];
    const manifests = files.filter((f) => /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|README\.md|readme\.md|go\.mod|Cargo\.toml)$/.test(f) && f.split('/').length <= 2).slice(0, 3);
    const words = (q.toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !['with', 'that', 'this', 'from', 'when', 'into', 'have', 'make', 'want', 'button', 'should'].includes(w));
    const scored = files.filter((f) => /\.(jsx?|tsx?|py|vue|svelte)$/.test(f)).map((f) => [f, words.filter((w) => f.toLowerCase().includes(w)).length]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
    const pick = [...new Set([...manifests, ...(focus ? [focus] : []), ...scored])].slice(0, 6);
    const key = [];
    for (const p of pick) { try { key.push({ path: p, text: await readFile(proj, p) }); } catch {} }
    return { name: proj.name, files, key, repo: proj.atlasKey ? proj.name : undefined, repoKey: proj.atlasKey };
  };
  useEffect(() => { if (view === 'atlas' && atlasKey) setRecent({ key: atlasKey, at: Date.now() }); }, [view, atlasKey]);
  const recentProject = recent && Date.now() - recent.at < 45 * 60e3 ? projects.find((p) => p.key === recent.key && (p.kind === 'github' || p.kind === 'local')) : null;
  // a project you already opened: straight back to it, with the question asked in its conversation
  const goToKnown = (q, p, why) => {
    setChoice(null);
    setAtlasQ({ key: p.key, q, d: { kind: 'go', why, pick: { full: p.kind === 'github' ? p.full : null, name: p.name, known: true } }, at: Date.now() });
    setRecent({ key: p.key, at: Date.now() });
    openProject(p);
  };
  const onAsk = async (q, o = {}) => {
    if (o.mode === 'feature' && project) { askLesson(q, { mode: 'feature', context: await buildContext(project, q) }); return; }
    if (o.mode === 'code') { const code = o.context?.code || q; askLesson('', { mode: 'code', context: { code }, lang: /^\s*(def |import |from |class \w+:|print\()/m.test(code) ? 'python' : 'javascript' }); return; }
    // "how does T3 Code work?": if it's a real project (on this Mac or on GitHub), open its real code and ask there
    if ((o.mode || 'explain') === 'explain' && !o.noRoute) {
      const named = mentionedProject(q, projects);
      if (named) return goToKnown(q, named, 'named');
      if (recentProject && pointsBack(q)) return goToKnown(q, recentProject, 'recent');
    }
    // "how does a binary search tree work?" names a topic Bento has a lesson for, not a project to search GitHub for
    const names = (o.mode || 'explain') === 'explain' && !o.noRoute && api.findProject ? projectNames(q).filter((n) => !namesALesson(n, builtins)) : [];
    if (names.length) {
      const id = Date.now(); findingRef.current = id; setChoice(null);
      setFinding({ q, name: names[0], id });
      const found = await Promise.race([api.findProject([...names]).catch(() => null), new Promise((r) => setTimeout(() => r(null), 7000))]);
      if (findingRef.current !== id) return; // you moved on while it was looking
      findingRef.current = null; setFinding(null);
      const d = decide(q, names, found, projects);
      if (d.kind === 'go') return goToProject(q, d);
      if (d.kind === 'ask') { setChoice({ q, o, d }); return; }
    }
    askLesson(q, o);
  };
  const goToProject = async (q, d) => {
    setChoice(null);
    const pick = d.pick || {};
    // already on this Mac: read your copy, nothing to download
    if (pick.local) {
      const r = await api.openLocalProject?.(pick.local.root);
      if (r) { setAtlasQ({ key: `local:${r.root}`, q, d, at: Date.now() }); openAtlas({ kind: 'local', root: r.root, name: pick.full || r.name }); return; }
    }
    // GitHub's size counts the whole history; Bento only fetches the latest code, so don't stop to warn here
    if (pick.full) { setAtlasQ({ key: pick.full, q, d, at: Date.now() }); openAtlas({ kind: 'github', full: pick.full }, { big: true }); return; }
    askLesson(q, {});
  };
  const cancelFinding = () => { findingRef.current = null; setFinding(null); };

  // ---------------------------------------------------------------- mastery
  const award = (l, kind) => {
    if (!l?.concepts?.length) return;
    const pts = { open: 0.5, run: 1, step: 1.5, quiz: 2, challenge: 3 }[kind] || 0;
    const key = `${l.id}:${kind}`;
    setProgress((p) => {
      if ((p.awarded || []).includes(key)) return p;
      const c = { ...p.concepts }; l.concepts.forEach((id) => { c[id] = (c[id] || 0) + pts; });
      return { ...p, concepts: c, coins: (p.coins ?? 5) + (kind === 'challenge' ? 3 : 0), awarded: [...(p.awarded || []).slice(-400), key] };
    });
  };

  // ---------------------------------------------------------------- try chips: make every suggestion actually do something
  const onTry = async (t) => {
    const L = current; if (!L) return;
    const d = desk.current;
    if (/step/i.test(t)) return d?.step();
    if (/run the tests|tests/i.test(t) && L.tests) return d?.tests();
    if (/measure|growth/i.test(t)) return document.querySelector('.stab:nth-child(3)')?.click();
    const code = d?.getCode() ?? L.code;
    const m = /^change\s+(.+?)\s+to\s+(.+?)\.?$/i.exec(t);
    if (m) {
      const from = m[1].replace(/^["'`]|["'`]$/g, ''); let to = m[2].replace(/^["'`]|["'`]$/g, '');
      // "Change size=4 to 2" means change the value, keep the name
      const kv = /^([\w.]+)\s*(=|:)\s*(.+)$/.exec(from);
      if (kv && !/[=:]/.test(to)) to = from.slice(0, from.length - kv[3].length) + to;
      const rx = new RegExp(`(^|[^\\w.])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`);
      if (rx.test(code)) { d?.setCode(code.replace(rx, (all, pre) => pre + to)); setTimeout(() => d?.run(), 30); return; }
    }
    setPop({ x: innerWidth * 0.3, y: innerHeight * 0.5, word: t, info: null, loading: true, kind: 'try' });
    try {
      const s = await api.quick(settings.model, `Apply this small experiment to the student's ${L.lang} code: "${t}". Change as little as possible.\nReply JSON: {"code":"the full updated code","note":"what changed, max 15 words"}\n\nCODE:\n${code}`);
      const j = parseJSONLoose(s);
      if (j?.code) { d?.setCode(j.code); setTimeout(() => d?.run(), 30); setPop(null); }
      else setPop(null);
    } catch { setPop(null); }
  };

  // ---------------------------------------------------------------- story term popover
  // drag a folder or a code file onto the window
  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    let n = 0;
    const enter = (e) => { if (e.dataTransfer?.types?.includes('Files')) { n++; setDropping(true); e.preventDefault(); } };
    const over = (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); };
    const leave = () => { n = Math.max(0, n - 1); if (!n) setDropping(false); };
    const drop = async (e) => {
      e.preventDefault(); n = 0; setDropping(false);
      const f = e.dataTransfer?.files?.[0]; const pth = f && api.pathForFile?.(f); if (!pth) return;
      try {
        const r = await api.dropOpen(pth);
        if (r.kind === 'local') openAtlas({ kind: 'local', root: r.root, name: r.name });
        else if (r.kind === 'lesson') { const L = { ...emptyLesson(r.lesson.q || '', r.lesson), ...r.lesson, id: Math.random().toString(36).slice(2, 10), status: 'done', builtin: false, shared: true, createdAt: Date.now() }; setLessons((ls) => [L, ...ls]); setCurrentId(L.id); setViewRaw('lesson'); setStepSel(L.steps?.length ? L.steps.length - 1 : null); }
        else askLesson(`Explain ${r.name}`, { mode: 'code', context: { code: r.text, path: r.name }, lang: /\.py$/.test(r.name) ? 'python' : 'javascript' });
      } catch (err) { alert(cleanErr(err)); }
    };
    addEventListener('dragenter', enter); addEventListener('dragover', over); addEventListener('dragleave', leave); addEventListener('drop', drop);
    return () => { removeEventListener('dragenter', enter); removeEventListener('dragover', over); removeEventListener('dragleave', leave); removeEventListener('drop', drop); };
  }, [settings]);

  // select any text (story, code, atlas) → a small "Explain" bubble
  const [sel, setSel] = useState(null);
  useEffect(() => {
    const up = (e) => {
      if (e.target.closest?.('.sel-pill, .pop, input, textarea')) return;
      setTimeout(() => {
        const s0 = window.getSelection(); const t = s0?.toString().trim();
        if (!t || t.length < 2 || t.length > 400 || !s0.rangeCount) return setSel(null);
        const n = s0.anchorNode?.parentElement; if (!n?.closest('.story, .cm-content, .atlas, .ideas, .words')) return setSel(null);
        const r = s0.getRangeAt(0).getBoundingClientRect();
        setSel({ text: t, x: r.left + r.width / 2, y: r.top, inCode: !!n.closest('.cm-content') });
      }, 10);
    };
    addEventListener('mouseup', up); return () => removeEventListener('mouseup', up);
  }, []);
  const explainSelection = async () => {
    const S = sel; setSel(null); window.getSelection()?.removeAllRanges();
    const L = view === 'lesson' ? current : null; const A = view === 'atlas' ? atlases[atlasKey] : null;
    const ctx = L ? `It appears in a lesson titled "${L.title}"${S.inCode ? ` in this ${L.lang} code:\n${(L.work ?? L.code ?? '').slice(0, 2500)}` : '.'}` : A ? `It appears while studying the repository ${A.name} (${A.narr?.gist?.one || ''}).` : '';
    const base = { x: Math.max(16, S.x - 160), y: S.y + 28, word: S.text.length > 40 ? S.text.slice(0, 38) + '…' : S.text };
    setPop({ ...base, loading: true });
    try {
      const j = parseJSONLoose(await api.quick(settings.model, `A learner (${settings.level}) selected this and wants it explained:\n"${S.text}"\n${ctx}\nExplain what it means in plain words, then name the technical idea if there is one. If the selection is a fragment, quietly explain the idea it belongs to; never comment on the selection itself.\nReply JSON: {"title":"short label, max 5 words","what":"plain explanation, max 45 words","plain":"the key idea in max 10 words","example":"tiny example if useful, max 2 lines, else empty"}`));
      setPop((p) => (p?.word === base.word ? { ...base, info: j ? { title: j.title || base.word, w: j.what, p: j.plain, ex: j.example, t: 'explained' } : { title: base.word, w: 'Couldn’t explain that one. Try selecting a little more.' } } : p));
    } catch { setPop(null); }
  };

  const onTerm = (word, elx) => {
    const L = current; const r = elx.getBoundingClientRect();
    const doc = L.work ?? L.code ?? '';
    const info = explainToken({ word: word.replace(/\(.*$/, '').replace(/^.*\./, ''), lineText: word, lang: L.lang, doc, english: L.pseudo, model: settings.model, quick: api.quick, isMember: /\./.test(word) });
    const base = { x: r.left, y: r.bottom + 8, word };
    if (info && typeof info.then === 'function') { setPop({ ...base, loading: true }); info.then((i) => setPop((p) => (p?.word === word ? { ...base, info: i } : p))).catch(() => setPop(null)); }
    else setPop({ ...base, info: info || { title: word, w: 'A term from this lesson.' } });
  };
  useEffect(() => { const h = (e) => { if (!e.target.closest?.('.pop, .term, .sel-pill')) setPop(null); }; addEventListener('mousedown', h); return () => removeEventListener('mousedown', h); }, []);

  // ---------------------------------------------------------------- shortcuts
  useEffect(() => {
    const h = (e) => {
      if (mod(e) && e.key === 'n') { e.preventDefault(); setViewRaw('home'); }
      if (mod(e) && e.key === '\\') { e.preventDefault(); setSideOpen((x) => !x); }
      if (mod(e) && e.key === 'k') { e.preventDefault(); setPal((x) => !x); }
      if (mod(e) && e.key === ',') { e.preventDefault(); setShowSettings(true); }
      if (e.key === '/' && mod(e)) { e.preventDefault(); setShowKeys((x) => !x); }
      const emptyAsk = document.activeElement?.matches?.('.composer textarea') && !document.activeElement.value;
      if (e.key === '?' && !mod(e) && (emptyAsk || (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName) && !document.activeElement?.closest?.('.cm-editor')))) { e.preventDefault(); setShowKeys((x) => !x); }
      if (e.key === 'Escape') setShowKeys(false);
      if (mod(e) && e.key === 'l') { e.preventDefault(); if (view === 'lesson') document.getElementById('followup')?.focus(); else if (view === 'atlas') document.getElementById('atlas-ask')?.focus(); else document.querySelector('.composer textarea, .ex-search input')?.focus(); }
      if (e.key === 'Escape') { setPop(null); setLinkRange(null); }
      if (mod(e) && e.key === 'Enter' && view === 'lesson' && !document.activeElement?.closest?.('.cm-editor')) { e.preventDefault(); e.shiftKey ? desk.current?.step() : desk.current?.run(); }
    };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, [view]);
  // The menu bar sends the same commands. If you just pressed that shortcut, the page has already done it.
  const menuActs = useRef({}); menuActs.current = { openFolderAtlas };
  useEffect(() => {
    let lastMod = 0; const k = (e) => { if (mod(e)) lastMod = Date.now(); };
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
    });
    return () => { removeEventListener('keydown', k, true); off?.(); };
  }, []);

  const loadRepos = () => { if (repos === null && providers?.gh) api.ghRepos().then(setRepos).catch(() => setRepos([])); else if (!providers?.gh) setRepos([]); };

  const [pal, setPal] = useState(false);
  const [article, setArticle] = useState(() => !!localStorage.getItem('bento.article'));
  const [runs, setRuns] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [pair, setPair] = useState([null, null]);
  const [onb, setOnb] = useState(() => (load('bento.settings', {}).onboarded ? null : 0));
  const readIdea = (I) => {
    const pre = PREBUILT[I.id];
    const english = !settings.voice || settings.voice === 'English';
    if (pre && english && !lessons.some((l) => l.context?.ideaId === I.id)) { openLesson({ ...pre, createdAt: Date.now() }); return pre.id; } // shipped with the app: opens instantly
    const have = lessons.find((l) => l.context?.ideaId === I.id && (l.status === 'done' || (l.status === 'streaming' && cancels.current.has(l.id))));
    if (have) { openLesson(have); return have.id; }
    return askLesson(I.title, { mode: 'idea', lang: I.lang, context: { ideaId: I.id, title: I.title, company: I.company, brief: I.brief, code: I.code, vs: I.vs, repo: I.repo, file: I.file, link: I.link } });
  };
  // a blank scratchpad, or a remix of the same lesson, that you never touched (no edits, no questions) is replaced by
  // the new one instead of piling up in Recent
  const untouchedTwin = (x, L) => x.scratch && !x.work && !(x.chat || []).length && x.title === L.title;
  const newScratch = (lang = settings.lang, remix = null) => {
    const py = lang === 'python';
    if (lang === 'html' || lang === 'typescript') {
      const web = lang === 'html';
      const starter = web
        ? '<!doctype html>\n<html>\n<head>\n<style>\n  body { font-family: sans-serif; padding: 24px; }\n  button { font-size: 18px; padding: 8px 16px; }\n</style>\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button id="btn">Click me</button>\n  <p id="out"></p>\n  <script>\n    document.getElementById("btn").addEventListener("click", () => {\n      document.getElementById("out").textContent = "You clicked at " + new Date().toLocaleTimeString();\n    });\n  </script>\n</body>\n</html>'
        : `// Write anything here. Press ${keys('⌘↵')} to run it.\ninterface Pet { name: string; age: number }\nconst pets: Pet[] = [{ name: "Biscuit", age: 3 }, { name: "Mochi", age: 5 }];\nfor (const p of pets) {\n  console.log(\`\${p.name} is \${p.age}\`);\n}\nshow(pets.map((p) => p.age));`;
      const L2 = { ...emptyLesson('', { lang, model: settings.model }), title: remix ? `Remix of ${remix.title}` : 'Scratchpad', kicker: 'your own code', scratch: true, status: 'done', code: remix ? remix.code : starter, file: web ? 'index.html' : 'scratch.ts', pseudo: remix ? remix.pseudo : [],
        story: [{ t: 'p', md: web ? 'A blank web page that explains itself. Change the code on the right and the page updates. **Save my page** keeps it as a real file.' : 'A blank page for TypeScript. Type errors appear on the right line as you type; **Run** shows the result.' }, { t: 'try', items: web ? ['Change the button colour', 'Add a second button', 'Show a list of items'] : ['Give a pet a wrong type', 'Add a new field', 'Step through the loop'] }] };
      setLessons((ls) => [L2, ...ls.filter((x) => !untouchedTwin(x, L2))]); setCurrentId(L2.id); setViewRaw('lesson'); setStepSel(null);
      return;
    }
    const code = py ? `# Write anything here. Press ${keys('⌘↵')} to run it.\nname = "world"\nfor i in range(3):\n    print("hello", name, i)\n\nshow([3, 1, 4, 1, 5, 9, 2, 6])` : `// Write anything here. Press ${keys('⌘↵')} to run it.\nconst name = "world";\nfor (let i = 0; i < 3; i++) {\n  console.log("hello", name, i);\n}\n\nshow([3, 1, 4, 1, 5, 9, 2, 6]);`;
    const pseudo = py ? ['A note to yourself (Python skips it)', 'Make a box called name holding "world"', 'Repeat the next line 3 times, counting with i', 'Print a greeting with the count', '', 'Draw these numbers as bars'] : ['A note to yourself (JavaScript skips it)', 'Make a box called name holding "world"', 'Repeat 3 times, counting with i', 'Print a greeting with the count', '', '', 'Draw these numbers as bars'];
    const L = { ...emptyLesson('', { lang, model: settings.model }), title: remix ? `Remix of ${remix.title}` : 'Scratchpad', kicker: 'your own code', scratch: true, status: 'done', code: remix ? remix.code : code, file: py ? 'scratch.py' : 'scratch.js', pseudo: remix ? remix.pseudo : pseudo,
      story: [{ t: 'p', md: 'A blank page that explains itself. Type any code on the right: Bento turns each line into plain English as you go, **Run** shows the result, and **Step** walks through it line by line.' }, { t: 'p', md: 'Hover any word for a quick explanation. Stuck? Ask below, like “why does range start at 0?”.' }, { t: 'try', items: ['Change 3 to 10', 'Step through the loop', py ? 'Print your own name' : 'Log your own name'] }] };
    setLessons((ls) => [L, ...ls.filter((x) => !untouchedTwin(x, L))]); setCurrentId(L.id); setViewRaw('lesson'); setStepSel(null);
  };
  const altFor = (m) => altOf(m, providers);
  const altModel = altFor(settings.model);
  // a new bug every day (generated once, then kept), the built-in one when no AI is connected
  const openDaily = () => {
    const day = new Date().toISOString().slice(0, 10);
    const id = progress.daily?.[day]; const have = id && lessons.find((l) => l.id === id && l.status !== 'error');
    if (have) return openLesson(have);
    const topics = ['arrays', 'strings', 'loops', 'recursion', 'dictionaries', 'off-by-one errors', 'sorting', 'string formatting', 'conditionals', 'functions and return values', 'nested lists', 'counting things'];
    const topic = topics[Math.floor(Date.now() / 86400000) % topics.length];
    const pre = BUGS_RAW[topic]; const english = !settings.voice || settings.voice === 'English';
    if (pre && settings.lang === 'python' && english && settings.level !== 'engineer') {
      const L = { ...pre, id: `bug-${day}`, status: 'done', thinking: null, chat: [], work: null, createdAt: Date.now() };
      setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: L.id } }));
      return openLesson(L);
    }
    if (!providers || noAI(providers)) return openLesson(CHALLENGE);
    const nid = askLesson(topic, { mode: 'challenge', lang: settings.lang });
    setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: nid } }));
  };
  // hooks for scripts/pregen-*.mjs, which drive the real app to pre-write shipped lessons
  useEffect(() => { window.__openIdea = (id) => readIdea(ideaById[id]); window.__ask = (q, o) => askLesson(q, o || {}); window.__openLesson = (l) => openLesson(l); window.__missingStops = () => ALL_STOPS.filter((x) => x.q && !PATH_PRE[x.id]).map((x) => x.id); window.__genStop = (id) => { const st = ALL_STOPS.find((x) => x.id === id); return askLesson(st.q, { ...(st.lang ? { lang: st.lang } : {}), ...(st.mode ? { mode: st.mode } : {}) }); }; });
  const readIdsAll = () => Object.fromEntries(lessons.filter((l) => l.context?.ideaId && l.status === 'done' && (!l.builtin || l.touched)).map((l) => [l.context.ideaId, true]));
  const mastery = useMemo(() => masteryOf({ progress, lessons, puzzles: PUZZLES, stops: ALL_STOPS, ideas: IDEAS, readIds: readIdsAll() }), [progress, lessons]);
  // Home's "Today": one next step from each part of Bento
  const today = useMemo(() => {
    const out = [];
    // the next stop on the path you picked (or the first one you haven't finished)
    const paths = tracksWith([...(progress.tracks || []), ...packStuff.paths]); const picked = paths.find((x) => x.k === localStorage.getItem('bento.track'));
    const T = [picked, ...paths].find((x) => x && x.stops.some((s) => !progress.path?.[s.id]));
    const si = T ? T.stops.findIndex((s) => !progress.path?.[s.id]) : -1; const stop = T?.stops[si];
    if (stop) out.push({ k: 'path', icon: '⤳', label: stop.t, sub: t('next on the path'), track: T.own ? T.title : t(T.title), step: { i: si + 1, n: T.stops.length }, go: () => goStop(stop) });
    const pz = PUZZLES.find((p) => (progress.puzzles?.[p.id]?.s || []).filter(Boolean).length < 3); if (pz) out.push({ k: 'puzzle', icon: '◇', label: pz.title, sub: t('next puzzle'), go: () => openPuzzle(pz) });
    const fading = SKILLS.filter(([id]) => isFading(mastery[id] || {})).length; const due = Object.values(progress.words || {}).filter((w) => w.next && w.next <= Date.now()).length;
    if (fading || due) out.push({ k: 'review', icon: '✺', label: fading ? `${fading} ${t('topics fading')}` : `${due} ${t('words to review')}`, sub: t('a two-minute review'), go: () => setViewRaw(fading ? 'map' : 'words') });
    const unread = IDEAS.filter((i) => !readIdsAll()[i.id]); const idea = unread[Math.floor(Date.now() / 864e5) % Math.max(1, unread.length)]; if (idea) out.push({ k: 'idea', icon: '⬡', label: idea.title, sub: `${t('clever idea')} · ${idea.company}`, go: () => readIdea(idea) });
    out.push({ k: 'bug', icon: '⚑', label: t('Daily bug'), sub: t('a two-minute challenge'), go: openDaily });
    // a plan for today: how long each takes, and whether it's already done today
    const isToday = (at) => !!at && new Date(at).toDateString() === new Date().toDateString();
    const awarded = new Set(progress.awarded || []);
    const day = new Date().toISOString().slice(0, 10); const bugId = progress.daily?.[day];
    const doneToday = {
      puzzle: Object.values(progress.puzzles || {}).some((r) => isToday(r.at) && (r.s || []).some(Boolean)),
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
    let convo = {}; try { convo = JSON.parse(localStorage.getItem('bento.atlasThreads') || '{}'); } catch {}
    // which stop on its path a lesson is (any path, built-in or your own)
    const stopNo = Object.fromEntries(tracksWith(progress.tracks || []).flatMap((T) => T.stops.map((x, i) => [progress.path?.[x.id], i + 1])).filter(([id]) => id && id !== 'x'));
    const ls = lessons.filter((l) => (!l.builtin || l.touched) && l.status !== 'error').map((l) => ({ k: `l:${l.id}`, kind: 'lesson', at: Math.max(l.createdAt || 0, ...(l.chat || []).map((c) => c.at || 0)), title: l.title || l.q || 'Untitled', lang: l.lang, glyph: l.scratch ? '✎' : l.mode === 'challenge' ? '⚑' : l.mode === 'compare' ? '⇄' : l.mode === 'build' ? '⚒' : Object.values(progress.path || {}).includes(l.id) ? '⤳' : null, stop: stopNo[l.id] || null, idea: l.mode === 'idea' ? l.context?.ideaId : null, asked: (l.chat || []).filter((c) => c.q).length, right: (l.checks || []).filter((c) => c.ok).length, live: l.status === 'streaming', open: () => openLesson(l) }));
    const ps = projects.filter((p) => p.kind === 'github' || p.kind === 'local').map((p) => ({ k: `p:${p.key}`, kind: 'project', at: p.at || 0, title: (p.full || p.name || '').split('/').pop(), owner: p.kind === 'github' ? (p.full || p.key).split('/')[0] : null, asked: (convo[p.key] || []).length, open: () => openProject(p) }));
    return [...ls, ...ps].sort((a, b) => b.at - a.at).slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, projects, progress.path]);
  // lessons that ship with Bento, findable from ⌘K and the Home ask box (they open instantly, without your AI)
  const builtins = [...SAMPLES.map((l) => ({ label: l.title, alt: l.q, find: `${l.title} ${l.q} ${(l.concepts || []).join(' ')}`, hint: l.kicker, run: () => openLesson(lessons.find((x) => x.id === l.id) || l) })), ...Object.entries(SIM_PRE).map(([k, l]) => ({ label: l.title, alt: k, find: `${l.title} ${k}`, hint: 'simulation', run: () => openSim(k) })), ...RACE_LESSONS.map((l) => ({ label: l.title, find: `${l.title} ${l.q} race`, hint: 'algorithm race', run: () => openLesson(l) })), ...tracksWith().flatMap((T) => T.stops.filter((st) => PATH_PRE[st.id]).map((st) => ({ label: st.t, alt: PATH_PRE[st.id].title, find: `${st.t} ${PATH_PRE[st.id].title} ${st.q} ${st.d}`, hint: T.title, run: () => startStop(st) })))];
  const skyDots = useMemo(() => SKILLS.map(([id, region, name]) => ({ id, r: region, name, lv: mastery[id]?.level || 0, c: (REGIONS.find((r) => r.id === region) || {}).color })), [mastery]);
  const readIds = Object.fromEntries(lessons.filter((l) => l.context?.ideaId && l.status === 'done' && (!l.builtin || l.touched)).map((l) => [l.context.ideaId, true]));

  const compareAsk = async (A, B, q) => {
    const side = async (X) => {
      const key = [];
      for (const p of filesForQuestion(X.facts, X.narr, q).slice(0, 2)) { try { key.push({ path: p, text: (await api.readFile(X.src.root, p)).slice(0, 8000) }); } catch {} }
      return { repo: X.name, repoKey: X.key, gist: X.narr?.gist?.one, key, files: X.facts.files.filter((f) => f.lang).slice(0, 80).map((f) => `${f.p} — ${X.narr?.roles?.[f.p] || guessRole(f)}`) };
    };
    const [a, b] = await Promise.all([side(A), side(B)]);
    const py = (X) => Object.keys(X.facts.langs)[0] === 'Python';
    askLesson(q, { mode: 'compare', lang: py(A) && py(B) ? 'python' : 'javascript', context: { a, b } });
  };
  const openCompare = (first) => { setPair((p) => { const apps = projects.filter((x) => x.kind !== 'site'); const a = first || p[0] || apps[0]?.key || null; const b = p[1] && p[1] !== a ? p[1] : apps.find((x) => x.key !== a)?.key || Object.keys(FEATURED).find((k) => k !== a) || null; return [a, b]; }); setViewRaw('compare'); };

  // questions about a repo become lessons built on its real files
  const askRepo = async (A, q, focus) => {
    const paths = focus ? [focus, ...filesForQuestion(A.facts, A.narr, q).filter((x) => x !== focus).slice(0, 2)] : filesForQuestion(A.facts, A.narr, q);
    const key = [];
    for (const p of paths) { try { const t = await api.readFile(A.src.root, p); key.push({ path: p, text: t.slice(0, 12000) }); } catch {} }
    const tree = A.facts.files.filter((f) => f.lang || f.layer !== 'support').slice(0, 200).map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`);
    const lang = /\.py$/.test(paths[0] || '') ? 'python' : 'javascript';
    askLesson(q, { mode: 'code', lang, context: { repo: A.name, repoKey: A.key, gist: A.narr?.gist?.one, files: tree, key, code: key[0]?.text || '', path: key[0]?.path } });
  };

  const dragStory = (e) => {
    e.preventDefault();
    const main = e.currentTarget.parentElement.getBoundingClientRect();
    const mv = (ev) => setStoryW(Math.min(0.6, Math.max(0.26, (ev.clientX - main.left) / main.width)));
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  };

  const streaming = current?.status === 'streaming';
  return (
    <div className={`app ${sideOpen ? '' : 'side-closed'}`}>
      <a className="skip" href="#content" onClick={(e) => { e.preventDefault(); document.getElementById('content')?.focus(); }}>Skip to the main area</a>
      <Sidebar onClose={() => setSideOpen(false)} closed={!sideOpen} view={view} setView={setView} lessons={lessons} current={currentId} onOpen={openLesson} onNew={() => setViewRaw('home')}
        projects={projects} atlasKey={view === 'atlas' ? atlasKey : null} atlases={atlases} onOpenProject={(p) => showAtlas(p.key)} onForgetProject={(k) => setProjects((ps) => ps.filter((p) => p.key !== k))}
        onDelete={(id) => { cancels.current.get(id)?.(); setLessons((ls) => ls.filter((l) => l.id !== id)); if (id === currentId) setViewRaw('home'); }}
        settings={settings} setSettings={setSettings} providers={providers} user={user} progress={progress} onSetup={() => setOnb(1)} onSettings={() => setShowSettings(true)} siteKey={siteKey} />
      {onb == null && view === 'lesson' && current && <Coach key="lesson" screen="lesson" ready={!streaming && !!current.code && current.lang !== 'html'} />}
      {onb == null && view === 'atlas' && <Coach key="atlas" screen="atlas" ready={!!atlases[atlasKey]?.facts} />}
      {dropping && <div className="drop-veil"><div className="drop-card"><span>⤓</span><b>Drop to take it apart</b><i>A folder becomes a picture of the project. A code file gets explained line by line.</i></div></div>}
      {showKeys && <KeySheet onClose={() => setShowKeys(false)} />}
      {showSettings && <Settings settings={settings} setSettings={setSettings} providers={providers} onClose={() => setShowSettings(false)} onSetup={() => { setShowSettings(false); setOnb(1); }} onOpenData={() => api.openData?.()} packs={packs} onRemovePack={(id) => setPacks((ps) => ps.filter((p) => p.id !== id))} onAddPack={(json) => { const { errors, pack } = validatePack(json); if (errors.length) return { errors }; setPacks((ps) => [...ps.filter((p) => p.id !== pack.id), pack]); return { pack }; }} onBackup={() => api.backupSave?.()} onRestore={async () => { const d = await api.backupLoad?.(); return d ? restoreBackup(d) : null; }} onReplayOnboarding={() => { setShowSettings(false); setOnb(0); }} wordsCount={Object.keys(progress.words || {}).length} lessonsCount={lessons.filter((l) => !l.builtin).length} />}
      {pal && <Palette onOpenAt={openRepoAt} onOpenSite={openSite} onClose={() => setPal(false)} lessons={lessons} projects={projects} words={progress.words || {}}
        actions={[['home', 'Learn: ask anything', '✦'], ['path', 'Paths: learn it in order', '⤳'], ['explore', 'Explore code', '◈'], ['ideas', 'Clever ideas', '⬡'], ['puzzles', 'Puzzles: LeetCode, from the top down', '◇'], ['play', 'Playgrounds: SQL, Git and the terminal, designing for a billion', '▦'], ['map', 'Your map: everything you know', '✺'], ['words', 'Your words', 'Aa'], ['bug', 'Daily bug', '⚑']].map(([v, label, icon]) => ({ label, icon, run: () => setView(v) })).concat([{ label: 'Settings', icon: '⚙', run: () => setShowSettings(true) }, { label: 'Keyboard shortcuts', icon: '?', run: () => setShowKeys(true) }, { label: 'Connections & setup', icon: '⚙', run: () => setOnb(1) }, { label: 'Open a folder on this Mac', icon: '▢', run: openFolderAtlas }, { label: 'Compare two apps', icon: '⇄', run: () => openCompare() }, { label: 'Scratchpad: write your own code', icon: '✎', run: () => newScratch() }])}
        onAsk={(q) => onAsk(q, {})} onOpenRepo={openRepo} onLesson={openLesson} onProject={(p) => showAtlas(p.key)} onIdea={readIdea} onWord={() => setViewRaw('words')}
        builtins={builtins} />}
      {onb != null && <Onboarding api={api} settings={settings} setSettings={setSettings} startAt={onb} onDone={(go) => { setOnb(null); if (['explore', 'ideas', 'path', 'puzzles'].includes(go)) setViewRaw(go); else setViewRaw('home'); api.providers().then(setProviders); }} />}
      <main className={`sheet ${groupOf(view)?.views.length > 1 && groupOf(view).views.some(([v]) => v === view) ? 'has-tabs' : ''}`} id="content" tabIndex={-1}>
        <div className="titlebar-drag" />
        {!sideOpen && <button className="side-open" onClick={() => setSideOpen(true)} aria-label={`${t('Show the sidebar')} (${keys('⌘\\')})`} title={`${t('Show the sidebar')}  ${keys('⌘\\')}`}><Icon name="sidebar" size={17} /></button>}
        {(() => { const g = groupOf(view); if (!g || g.views.length < 2 || !g.views.some(([v]) => v === view)) return null; return (
          <div className="gtabs">
            <div className="gt-list" role="tablist" aria-label={t(g.label)}>{g.views.map(([v, label]) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{t(label)}</button>)}</div>
            {g.extra && <><span className="gt-sep" aria-hidden="true" /><button className="gt-extra" onClick={() => setView(g.extra[0])}>⚑ {t(g.extra[1])}<span className="coins"><i className="coin" />{progress.coins ?? 5}</span></button></>}
          </div>
        ); })()}
        {view === 'home' && <Home builtins={builtins} threads={threads} skyDots={skyDots} about={recentProject} onDropAbout={() => setRecent(null)} finding={finding} choice={choice} onChoose={(g) => { const c = choice; setChoice(null); if (!c) return; if (g) goToProject(c.q, { ...c.d, kind: 'go', why: 'chosen', pick: g }); else askLesson(c.q, { ...c.o, noRoute: true }); }} onCancelFinding={() => { const f = finding; cancelFinding(); if (f) askLesson(f.q, {}); }} today={today} onMap={() => setViewRaw('map')} lit={SKILLS.filter(([id]) => (mastery[id]?.level || 0) >= 2).length} onAsk={onAsk} settings={settings} setSettings={setSettings} project={project} setProject={setProject} onPickFolder={() => setProject('folder')} onPickRepo={(r) => setProject({ repo: r })}
          repos={repos} loadRepos={loadRepos} samples={SAMPLES} challenge={CHALLENGE} onOpen={openLesson} user={user} recent={lessons.filter((l) => !l.builtin)} providers={providers}
          onOpenRepo={openRepo} onExplore={() => setViewRaw('explore')} onIdea={readIdea} onScratch={() => newScratch()} onDaily={openDaily} onSim={openSim} onSetup={() => setOnb(1)} onSuggest={async (rs) => {
            const list = rs.slice(0, 25).map((r) => `${r.name} (${r.primaryLanguage?.name || '?'})${r.description ? `: ${r.description.slice(0, 80)}` : ''}`).join('\n');
            const j = parseJSONLoose(await api.quick(settings.model, `A learner (${settings.level}) has these GitHub repos:\n${list}\n\nSuggest 3 short lessons that would most help THEM next, based on what they actually build (a gap, a next step, or a deeper look at a tool they use). Each lesson must be teachable with a small runnable example.\nReply JSON: {"items":[{"title":"≤ 6 words","why":"≤ 12 words, mention their project or tool","q":"the question to ask, ≤ 18 words","lang":"python|javascript|typescript"}]}`));
            return (j?.items || []).slice(0, 3);
          }} onWords={() => setViewRaw('words')} words={progress.words || {}} stats={{ days: activityByDay(lessons, progress.words), streak: streakOf(lessons), lessons: lessons.filter((l) => !l.builtin && l.status === 'done').length, ideas: Object.keys(readIds).length, words: Object.keys(progress.words || {}).length, apps: projects.length }} />}
        {view === 'compare' && <Compare projects={projects.filter((x) => x.kind !== 'site')} atlases={atlases} ensure={ensureProject} pair={pair} setPair={setPair} onCompareAsk={compareAsk} onOpenProject={showAtlas} />}
        {view === 'path' && <Path custom={[...(progress.tracks || []), ...packStuff.paths]}
          onDropPath={(id) => setProgress((p) => ({ ...p, tracks: (p.tracks || []).filter((t) => t.id !== id) }))}
          onMakePath={makePath} done={Object.fromEntries(Object.entries(progress.path || {}).filter(([, id]) => id === 'x' || lessons.some((l) => l.id === id && l.status === 'done')).map(([k]) => [k, true]))}
          onGo={goStop} onIdeas={() => setViewRaw('ideas')} />}
        {view === 'site' && sites[siteKey] && <Site key={siteKey} site={sites[siteKey]} onOpenRepo={openRepo} modelLabel={modelLabel(settings.model)} onOpenUrl={(u) => api.openExternal(u)}
          onRetry={() => { const x = sites[siteKey]; setSites((m) => { const n = { ...m }; delete n[siteKey]; return n; }); setTimeout(() => openSite(x.url), 0); }}
          onAsk={(q) => askLesson(`${q} (I'm studying the website ${siteKey}${sites[siteKey]?.narr?.gist?.one ? `: ${sites[siteKey].narr.gist.one}` : ''})`, {})} />}
        {view === 'ideas' && <Ideas instant={!settings.voice || settings.voice === 'English' ? PREBUILT : {}} races={[]} onRace={openLesson} onPuzzles={() => setViewRaw('puzzles')} extra={packStuff.ideas} onRead={readIdea} readIds={readIds} interests={settings.interests} />}
        {view === 'play' && <Playgrounds top={trailBar()} tab={playTab} setTab={setPlayTab} progress={progress} onProgress={(kind, id) => setProgress((p) => (p[kind]?.[id] ? p : { ...p, [kind]: { ...(p[kind] || {}), [id]: Date.now() } }))} quick={noAI(providers) ? null : (m, q) => api.quick(m, q)} model={settings.model} pyReady={pyReady} onAsk={(q) => askLesson(q, {})} />}
        {view === 'map' && <SkillMap readyFor={readyFor} mastery={mastery} lessons={lessons} onAsk={(q) => askLesson(q, {})} onPuzzle={openPuzzle} onOpenLesson={(id) => { const l = lessons.find((x) => x.id === id); if (l) openLesson(l); }} quick={noAI(providers) ? null : (m, q) => api.quick(m, q)} model={settings.model} onReviewed={(ids, score = 0, total = 0) => setProgress((p) => ({ ...p, reviewed: { ...(p.reviewed || {}), ...Object.fromEntries(ids.map((id) => [id, Date.now()])) }, reviewScores: { ...(p.reviewScores || {}), ...Object.fromEntries(ids.map((id) => { const old = p.reviewScores?.[id] || { right: 0, total: 0 }; return [id, { right: old.right + (ids.length === 1 ? score : Math.min(score, 1)), total: old.total + total, at: Date.now() }]; })) } }))} />}
        {view === 'puzzles' && <Puzzles races={RACE_LESSONS} onRace={openLesson} progress={progress} onOpen={openPuzzle} onIdeas={() => setViewRaw('ideas')} onIdea={readIdea} />}
        {view === 'words' && <Words onAdd={(w) => setProgress((p) => { const k = w.term.toLowerCase(); if (p.words?.[k]) return p; return { ...p, words: { ...(p.words || {}), [k]: { ...w, at: Date.now() } } }; })} onGrade={(term, g) => setProgress((p) => { const k = String(term).toLowerCase(); return { ...p, words: { ...p.words, [k]: { ...p.words[k], ...g } } }; })} words={progress.words || {}} onOpen={(id) => { const l = lessons.find((x) => x.id === id); if (l) openLesson(l); }} onAsk={(t) => askLesson(`Explain "${t}" with a tiny example`, {})} />}
        {view === 'explore' && <Explore top={trailBar()} api={api} onOpenAt={openRepoAt} onOpenSite={openSite} onCompare={() => openCompare()} onOpenRepo={openRepo} onOpenFolder={openFolderAtlas} projects={projects} onOpenProject={openProject} repos={repos} loadRepos={loadRepos} user={user} />}
        {view === 'atlas' && atlases[atlasKey] && (() => { const A = atlases[atlasKey]; return (
          <Atlas key={atlasKey} atlas={A} asked={atlasQ?.key === A.key ? atlasQ : null} onAskedDone={() => setAtlasQ(null)} onIdeaInstead={(q) => { setAtlasQ(null); askLesson(q, { noRoute: true }); }} onMakePath={async (goal) => { const id = await makePath(goal); if (id) { localStorage.setItem('bento.track', id); setViewRaw('path'); } }} onStopReading={() => stopReading(A.key)} onBig={() => { setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }); setTimeout(() => openAtlas(A.src, { big: true }), 0); }} initialFile={pendingFile?.key === A.key ? pendingFile.path : null} onInitialFileShown={() => setPendingFile(null)} modelLabel={modelLabel(settings.model)}
            readFile={(p) => (A.src.root ? api.readFile(A.src.root, p) : Promise.reject(new Error(A.fetchError ? `Couldn’t download the code: ${A.fetchError}` : 'Downloading the code… try again in a few seconds.')))}
            onAsk={(q, focus) => askRepo(A, q, focus)}
            onPlanIssue={noAI(providers) ? null : async (iss) => {
              const tree = (A.facts?.files || []).filter((f) => f.lang).slice(0, 160).map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`).join('\n');
              const j = parseJSONLoose(await api.quick(settings.model, `A ${settings.level} learner wants to make their first open-source contribution by fixing this open issue in ${A.name}${A.narr?.gist?.one ? ` (${A.narr.gist.one})` : ''}.\nISSUE #${iss.n}: ${iss.title}\n${iss.body}\n\nFILES (path — role):\n${tree}\n\nBe encouraging and concrete. Only name files that appear in the list.\nReply JSON: {"plain":"what the issue asks for, in plain words, at most 60 words","files":["2-4 exact paths from the list most likely to change"],"steps":["4-6 short, concrete steps to fix it"],"skills":["2-3 skills they will practise"]}`));
              return j?.plain ? j : { err: 'No plan this time. Read the issue on GitHub, then ask about it in the box below.' };
            }}
            onOthers={providers?.gh ? async (p, text) => {
              // find the most telling name in this file, look for it in other public projects, compare the two real files
              const py = /\.py$/.test(p);
              const names = [...text.matchAll(py ? /^(?:async\s+)?def\s+([A-Za-z_]\w{3,})|^class\s+([A-Z]\w{2,})/gm : /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const)\s+([A-Za-z_$][\w$]{3,})/g)].map((m) => m[1] || m[2]).filter((n) => !/^(main|App|Page|Home|Layout|default|handler|GET|POST)$/.test(n));
              const base = p.split('/').pop().replace(/\.[^.]+$/, '');
              const query = names[0] ? `${py ? 'def' : 'function'} ${names[0]}` : base;
              const rows = (await api.ghCode(query, py ? 'python' : /\.tsx?$/.test(p) ? 'typescript' : 'javascript')).filter((r) => r.repo.toLowerCase() !== (A.src.full || '').toLowerCase());
              if (!rows.length) throw new Error(`No other public project found using “${names[0] || base}”.`);
              const other = rows[0];
              const otherText = await api.ghFile(other.repo, other.path);
              askLesson(`How do ${A.name.split('/').pop()} and ${other.repo.split('/').pop()} each write ${names[0] ? `\`${names[0]}\`` : `their ${base}`}?`, { mode: 'compare', lang: py ? 'python' : 'javascript', context: {
                a: { repo: A.name, repoKey: A.key, gist: A.narr?.gist?.one, key: [{ path: p, text: text.slice(0, 8000) }], files: [] },
                b: { repo: other.repo, key: [{ path: other.path, text: String(otherText).slice(0, 8000) }], files: [] } } });
            } : null}
            onQuick={async (q, history = []) => {
              // an overview question reads the README and the top file of each main part; others read the best-matching files
              const overview = !history.length && isOverviewQuestion(q);
              const mainParts = overview ? projectParts(A.facts, 8) : [];
              // specific questions: files whose names match, plus files whose contents mention the words (searched on this Mac)
              const asked = [q, ...history.slice(-2).map((h) => h.q)].join(' ');
              const byName = overview ? [] : filesForQuestion(A.facts, A.narr, asked);
              const code = A.facts.files.filter((f) => f.lang && f.sub !== 'tests' && f.sub !== 'docs').map((f) => f.p);
              const hits = overview || !api.atlasSearch ? [] : await api.atlasSearch(A.src.root, searchWords(asked), code).catch(() => []);
              const at = new Map(hits.map((h) => [h.p, h.at]));
              // cover every part of the question ("Claude or Codex" needs both), at most 2 files from one folder
              const chosen = []; const seen = new Set(); const perDir = {};
              while (chosen.length < 3) {
                const dirOf = (h) => h.p.split('/').slice(0, -1).join('/');
                const best = hits.filter((h) => !chosen.includes(h) && (perDir[dirOf(h)] || 0) < 2).map((h) => [h, h.score * (1 + 1.5 * (h.words || []).filter((w) => !seen.has(w)).length)]).sort((a, b) => b[1] - a[1])[0]?.[0];
                if (!best) break;
                chosen.push(best); (best.words || []).forEach((w) => seen.add(w)); perDir[dirOf(best)] = (perDir[dirOf(best)] || 0) + 1;
              }
              const paths = overview ? mainParts.slice(0, 4).map((x) => x.top.p) : [...new Set([...chosen.map((h) => h.p), ...byName.slice(0, 2)])].slice(0, 4);
              const parts = [];
              for (const p of paths) {
                try {
                  const text = await api.readFile(A.src.root, p); const k = at.get(p) ?? 0;
                  // show the part of the file where the words are, not just its first lines
                  const from = k > 3500 ? Math.max(0, text.lastIndexOf('\n', k - 1500)) : 0;
                  parts.push(`--- ${p}${from ? ` (from character ${from})` : ''} ---\n${text.slice(from, from + 5000)}`);
                } catch {}
              }
              // the map of the project: every main part, then the files next to the ones being read
              const near = new Set(paths.map((p) => p.split('/').slice(0, -1).join('/')));
              const files = A.facts.files.filter((f) => f.lang);
              const tree = files.length <= 150 ? files.map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`).join('\n')
                : `${projectParts(A.facts, 14).map((x) => `${x.area}/ — ${x.files} code files`).join('\n')}\n…\n${files.filter((f) => near.has(f.p.split('/').slice(0, -1).join('/'))).slice(0, 60).map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`).join('\n')}`;
              const big = overview ? `\nREADME (start):\n${String(A.facts.readme || '').slice(0, 2500)}\n\nMAIN PARTS (folder — code files, lines, its most-used file):\n${mainParts.map((x) => `${x.area} — ${x.files} files, ${x.lines} lines, ${x.top.p}`).join('\n')}\n` : '';
              const j = parseJSONLoose(await api.quick(settings.model, `A ${settings.level} learner is studying the repository ${A.name}${A.narr?.gist?.one ? ` (${A.narr.gist.one})` : ''} and asks: ${q}${big}\n${history.length ? `\nEARLIER IN THIS CONVERSATION (answer the new question in that light):\n${history.slice(-3).map((h) => `Q: ${h.q}\nA: ${String(h.a || '').slice(0, 600)}`).join('\n')}\n` : ''}\nFILES (path — role):\n${tree}\n\nMOST RELEVANT FILES:\n${parts.join('\n\n')}\n\nAnswer in at most ${overview ? 150 : 110} words, plainly, naming real files in backticks. Only say what the code supports.${overview ? ' This is a general question: start with one sentence on what the project is, then how its main parts fit together.' : ' Answer just this question; do not introduce the project again.'}\nReply JSON: {"answer":"...","files":["exact paths you referred to, max 4"]}`));
              return { a: j?.answer || `No answer this time. Try a full lesson (${keys('⌘↵')}).`, files: j?.files || paths };
            }}
            onExplainFile={(p, text) => askLesson(`Explain ${p}`, { mode: 'code', context: { code: text, path: p, repo: A.name, repoKey: A.key }, lang: /\.py$/.test(p) ? 'python' : 'javascript' })}
            onFeature={async (q) => askLesson(q, { mode: 'feature', context: await buildContext(asProject(A), q), lang: Object.keys(A.facts.langs).includes('Python') && !Object.keys(A.facts.langs).some((l) => /Script/.test(l)) ? 'python' : 'javascript' })}
            onRefresh={async () => { if (A.src.kind === 'github') await api.atlasRefresh(A.src.full); else await api.cachePut(A.key, null); setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }); setTimeout(() => openAtlas(A.src.kind === 'github' ? { kind: 'github', full: A.src.full } : A.src), 0); }}
            onBuild={(mini) => askLesson(mini, { mode: 'build', lang: (() => { const ls = Object.entries(A.facts.langs).sort((a, b) => b[1] - a[1]); const top = ls[0]?.[0]; const ui = A.facts.files.filter((f) => f.layer === 'ui' && f.lang).length; const code = A.facts.files.filter((f) => f.lang && f.layer !== 'support').length || 1; return top === 'Python' ? 'python' : /Script|HTML|CSS|Vue|Svelte|Astro/.test(top || '') && ui / code > 0.3 ? 'html' : top === 'TypeScript' ? 'typescript' : 'javascript'; })(), context: { inspired: A.name, gist: A.narr?.gist?.one, repoKey: A.key, repo: A.name } })} onCompare={() => openCompare(A.key)} onFork={() => api.ghFork(A.src.full)} onOpenUrl={(u) => api.openExternal(u)}
            onRetry={() => (A.facts ? narrate(A.key) : (setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }), setTimeout(() => openAtlas(A.src), 0)))} />
        ); })()}
        {view === 'lesson' && current && (
          <div className={`lesson ${article && current.code && current.lang !== 'html' && !current.steps?.length ? 'article' : ''}`} style={{ '--story-w': `${storyW * 100}%` }}>
            <Story pathInfo={pathOf(current)} onPathStop={goStop} onPathPage={() => setViewRaw('path')} lesson={current} streaming={streaming} modelLabel={modelLabel(current.model || settings.model)}
              onLink={setLinkRange} onLinkClick={(r) => setLinkRange(r)} onTerm={onTerm} onTry={onTry}
              onNext={(q) => current.mode === 'challenge' ? askLesson(/another/i.test(q) ? (current.concepts?.[0] || 'arrays') : q, { mode: /another/i.test(q) ? 'challenge' : 'explain', lang: current.lang }) : askLesson(q, { prev: current, lang: current.lang })}
              onFollowUp={(q) => askLesson(q, { prev: current, lang: current.lang })}
              onSecondOpinion={async (i) => {
                const L = current; const id = L.id; const c = L.chat[i]; const altModel = altFor(c.by || settings.model); if (!altModel) return;
                const set = (second) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, chat: l.chat.map((x, k) => (k === i ? { ...x, second } : x)) } : l)));
                set({ who: modelLabel(altModel), loading: true });
                const code = (L.work ?? L.code ?? '').split('\n').map((x, k) => `${k + 1}| ${x}`).join('\n').slice(0, 5000);
                try {
                  const j = parseJSONLoose(await api.quick(altModel, `You are tutoring a ${settings.level} learner inside a lesson titled "${L.title}".\nThe lesson's ${L.lang} code (with line numbers):\n${code}\n\nThe learner asks: ${c.q}\nAnother tutor already answered: "${c.a}"\nGive YOUR answer in at most 90 words: agree, add what they missed, or politely correct them. You may use **bold**, \`code\` and [[line|links]].\nReply JSON: {"answer":"..."}`));
                  set({ who: modelLabel(altModel), a: j?.answer || 'No answer this time.' });
                } catch { set({ who: modelLabel(altModel), a: 'That model didn’t answer. Is it signed in?' }); }
              }}
              onTeachBack={noAI(providers) ? null : async (L, said) => {
                const id = L.id; const story = (L.story || []).map((b) => b.md || b.text || '').filter(Boolean).join('\n').slice(0, 3500);
                let j = null;
                const pz = L.puzzle ? puzzleById(L.puzzle) : null;
                if (pz) { try { j = parseJSONLoose(await api.quick(settings.model, `You are a warm, fair coding interviewer. The candidate (a ${settings.level}) is solving the puzzle "${pz.title}":\n${pz.md}\nThe best known approach runs in ${pz.target}.\nTheir current Python code:\n${(desk.current?.getCode?.() ?? L.work ?? L.code).slice(0, 4000)}\n\nThey talk you through their solution:\n"${said}"\n\nJudge the explanation the way a good interviewer would: is the idea right, do they know why it works, and do they state its time complexity correctly (for THEIR code)? Judge understanding, not grammar. Score 0–3 (3 = you'd hire on this answer).\nReply JSON: {"score":0-3,"got":["what they explained well, ≤ 14 words each, max 2"],"missing":["the most important gap, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"the follow-up question an interviewer would ask next, ≤ 18 words"}`)); } catch (e) { j = { score: 0, got: [], missing: [cleanErr(e)], next: '' }; } }
                else try { j = parseJSONLoose(await api.quick(settings.model, `A ${settings.level} learner just finished a lesson titled "${L.title}" (concepts: ${(L.concepts || []).join(', ')}).\nLESSON TEXT:\n${story}\n\nThey explained it back in their own words:\n"${said}"\n\nBe a warm, honest tutor. Judge understanding, not grammar or spelling. Score 0–3 (0 = wrong idea, 1 = partly, 2 = right but missing one key piece, 3 = solid).\nReply JSON: {"score":0-3,"got":["what they got right, ≤ 14 words each, max 2"],"missing":["the most important missing or wrong piece, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"one short question that would push them further, ≤ 18 words"}`)); } catch (e) { j = { score: 0, got: [], missing: [cleanErr(e)], next: '' }; }
                if (!j) j = { score: 0, got: [], missing: ['Couldn’t read the answer this time. Try again.'], next: '' };
                const teach = { said, score: Math.max(0, Math.min(3, +j.score || 0)), got: j.got || [], missing: j.missing || [], next: j.next || '' };
                setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, teach } : l)));
              }}
              onPractice={(L) => askLesson(`${L.title}: ${(L.concepts || []).join(', ') || L.kicker || ''}`.slice(0, 120), { mode: 'challenge', lang: L.lang === 'typescript' ? 'typescript' : L.lang })}
              onQuickAsk={async (q) => {
                const L = current; const id = L.id; const n = (L.chat || []).length;
                const put = (c) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, chat: [...(l.chat || []).slice(0, n), c] } : l)));
                if (noAI(providers)) { put({ q, a: 'Bento needs an AI to answer questions. Connect one (bottom-left → **Connect an AI**): Claude, ChatGPT, Gemini or Copilot, on the plan you already have.' }); return; }
                put({ q, loading: true });
                const code = (L.work ?? L.code ?? '').split('\n').map((x, i) => `${i + 1}| ${x}`).join('\n').slice(0, 5000);
                const hist = (L.chat || []).slice(-3).map((c) => `Q: ${c.q}\nA: ${c.a}`).join('\n');
                try {
                  const j = parseJSONLoose(await api.quick(settings.model, `You are tutoring a ${settings.level} learner inside a lesson titled "${L.title}".\nThe lesson's ${L.lang} code (with line numbers):\n${code}\n${hist ? `\nEarlier in this chat:\n${hist}\n` : ''}\nThe learner asks: ${q}\nAnswer warmly and precisely in at most 110 words. You may use **bold**, \`code\` and line links like [[3-5|the loop]] that point at lines of the code above.\nAlso suggest 2 short questions they might ask next (at most 8 words each). If, and only if, the answer teaches something checkable, add one quick multiple-choice check about it (3 choices, one right); otherwise check is null.\nReply JSON: {"answer":"...","term":"a technical term you used that they may not know, or null","plain":"one-line definition of it, or null","next":["...","..."],"check":{"q":"...","choices":["...","...","..."],"answer":0,"why":"one sentence"}}`));
                  const ck = j?.check && Array.isArray(j.check.choices) && j.check.choices.length >= 2 && Number.isInteger(j.check.answer) && j.check.answer >= 0 && j.check.answer < j.check.choices.length ? j.check : null;
                  put(j?.answer ? { q, a: j.answer, term: j.term, plain: j.plain, by: settings.model, next: (Array.isArray(j.next) ? j.next : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 2), check: ck } : { q, a: 'I couldn’t answer that one. Try making it a full lesson.' });
                  if (j?.term && j?.plain) setProgress((p) => { const k = String(j.term).toLowerCase(); if (p.words?.[k]) return p; return { ...p, words: { ...(p.words || {}), [k]: { term: j.term, plain: j.plain, from: id, title: L.title, at: Date.now() } } }; });
                } catch { put({ q, a: 'The model didn’t answer. Check your connection and try again.' }); }
              }}
              onDepth={(dir) => { const lv = ['kid', 'student', 'engineer']; const base = current.level || settings.level; const level = lv[Math.max(0, Math.min(2, lv.indexOf(base) + (dir === 'deeper' ? 1 : -1)))]; askLesson(dir === 'deeper' ? `Go deeper on "${current.title}": what's really happening under the hood, and the trade-offs a pro would think about` : `Explain "${current.title}" again, much simpler, with an everyday analogy and a smaller example`, { prev: current, lang: current.lang, level }); }}
              onQuiz={(ok) => ok && award(current, 'quiz')} onCheck={(ok) => { if (ok) award(current, 'quiz'); setLessons((ls) => ls.map((l) => (l.id === current.id ? { ...l, checks: [...(l.checks || []), { ok, at: Date.now() }].slice(-20) } : l))); }} onConcept={(c) => askLesson(`Teach me ${c.replace(/-/g, ' ')}`, { lang: current.lang })}
              stepSel={stepSel} onStepSelect={setStepSel}
              onWild={providers?.gh ? findWild : null} onOpenAt={openRepoAt} onOpenRepo={openRepo} altModel={altModel ? modelLabel(altModel) : null} altFor={(c) => { const m = altFor(c.by || settings.model); return m ? modelLabel(m) : null; }} onRetryWith={() => { const a = current; setSettings({ model: altModel }); setLessons((ls) => ls.filter((l) => l.id !== a.id)); setTimeout(() => askLesson(a.q, { mode: a.mode, lang: a.lang, context: a.context }), 0); }}
              article={article} onArticle={() => setArticle((a) => { localStorage.setItem('bento.article', a ? '' : '1'); return !a; })} run={runs[current.id]}
              onStop={() => { const id = current.id; cancels.current.get(id)?.(); cancels.current.delete(id); setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, status: l.code || l.story.length ? 'done' : 'error', error: l.code || l.story.length ? null : 'Stopped before anything arrived.', thinking: null } : l))); }}
              onBackToRepo={showAtlas} onOpenUrl={(u) => api.openExternal(u)} knownWords={progress.words}
              reopened={reopened?.id === current.id ? () => { const r = reopened; setReopened(null); askLesson(r.q, { ...r.o, fresh: true }); } : null}
              puzzleTop={current.puzzle ? <PuzzlePanel L={current} rec={progress.puzzles?.[current.puzzle]} getCode={() => desk.current?.getCode()} setPuzzleCode={setPuzzleCode} onResult={onPuzzleResult} pyReady={pyReady} onOpenUrl={(u) => api.openExternal(u)} /> : null}
              puzzleEnd={current.puzzle ? <PuzzleEnd L={current} rec={progress.puzzles?.[current.puzzle]} setPuzzleCode={setPuzzleCode} onIdea={readIdea} onOpenAt={openRepoAt} onOpenUrl={(u) => api.openExternal(u)} onSeen={(pid) => setProgress((p) => ({ ...p, puzzles: { ...(p.puzzles || {}), [pid]: { ...(p.puzzles?.[pid] || {}), seen: true } } }))} /> : null}
              onRetry={() => { const a = current; setLessons((ls) => ls.filter((l) => l.id !== a.id)); askLesson(a.q, { mode: a.mode, lang: a.lang, context: a.context }); }} />
            <div className="vdivider" onMouseDown={dragStory} />
            <Desk ref={desk} lesson={current} onPatch={(p) => patch(current.id, p)} quick={api.quick} model={settings.model}
              knownWords={knownWordSet} onWord={(w) => setProgress((p) => { const k = w.term.toLowerCase(); if (p.words?.[k]) return p; return { ...p, words: { ...(p.words || {}), [k]: { ...w, from: current.id, title: current.title, at: Date.now() } } }; })}
              linkRange={linkRange} stepSel={current.steps?.length ? stepSel : null} pyReady={pyReady} streaming={streaming}
              onResult={(id, r, src) => setRuns((m) => ({ ...m, [id]: { r, src } }))}
              onMastery={(k) => award(current, k)} onRemix={(code, lang) => newScratch(lang, { title: current.title, code, pseudo: code === current.code ? current.pseudo : [] })} />
          </div>
        )}
        {sel && !pop && <button className="sel-pill" style={{ left: sel.x, top: Math.max(8, sel.y - 40) }} onMouseDown={(e) => e.preventDefault()} onClick={explainSelection}><span>✦</span>Explain</button>}
        {pop && (
          <div className="pop tok-card big" style={{ left: Math.min(pop.x, innerWidth - 340), top: Math.min(pop.y, innerHeight - 220) }}>
            {pop.loading ? <><div className="tok-head"><span className="tok-word">{pop.kind === 'try' ? 'Trying it…' : pop.word}</span><span className="tok-kind">{pop.kind === 'try' ? pop.word : 'asking…'}</span></div><div className="shimmer" /><div className="shimmer short" /></> : pop.info && (
              <>
                <div className="tok-head"><span className={`tok-word ${pop.info.t === 'explained' ? 'phrase' : ''}`}>{pop.info.title}</span><span className="tok-kind">{pop.info.t}</span></div>
                {pop.info.w && <div className="tok-what">{pop.info.w}</div>}
                {pop.info.p && <div className="tok-plain"><span className="tok-plain-k">here</span><span>{pop.info.p}</span></div>}
                {pop.info.ex && <pre className="tok-ex">{pop.info.ex}</pre>}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ⌘/ : every shortcut on one card
const KEYS = [['⌘K', 'Search everything, ask, or paste a repo'], ['⌘N', 'New question'], ['⌘\\', 'Show or hide the sidebar'], ['⌘,', 'Settings'], ['⌘/', 'This list'], ['⌘L', 'Jump to the ask box'], ['⌘↵', 'Run the code'], ['⌘⇧↵', 'Step through it'], ['↵ / ⌘↵', 'In a lesson: quick answer / full lesson'], ['⌥ drag', 'Scrub any number in the code'], ['select text', 'Explain anything you highlight'], ['Esc', 'Close panels'], ['?', 'This sheet']];
function KeySheet({ onClose }) {
  const box = useDialog(onClose);
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div className="keys" ref={box} role="dialog" aria-modal="true" aria-labelledby="keys-title" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="keys-title">Keyboard</h2>
        <dl>{KEYS.map(([k, d]) => <div key={k} className="key-row"><dt><kbd>{keys(k)}</kbd></dt><dd>{d}</dd></div>)}</dl>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
