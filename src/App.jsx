import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLES, CHALLENGE, emptyLesson, applyBlock, ndjsonParser, buildPrompt, parseJSONLoose } from './lesson.js';
import { explainToken } from './explain.js';
import { pyState, warmPython } from './runtime/runner.js';
import Story from './ui/Story.jsx';
import Desk from './ui/Desk.jsx';
import Home from './ui/Home.jsx';
import Explore from './ui/Explore.jsx';
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
import { RACES } from './races.js';
import { ideaById } from './ideas.js';
import PREBUILT_RAW from './ideas-prebuilt.json';
import PATH_RAW from './path-prebuilt.json';
import SIM_RAW from './sims-prebuilt.json';
import BUGS_RAW from './bugs-prebuilt.json'; // one pre-written Python daily bug per topic, so the daily bug opens instantly
const SIM_PRE = Object.fromEntries(Object.entries(SIM_RAW).map(([k, l], i) => [k, { ...l, id: `sim-${i}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
import { STOPS, WEB, AI } from './ui/Path.jsx';
const PATH_PRE = Object.fromEntries(Object.entries(PATH_RAW).map(([k, l]) => [k, { ...l, id: `path-${k}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
const PREBUILT = Object.fromEntries(Object.entries(PREBUILT_RAW).map(([k, l]) => [k, { ...l, id: `idea-${k}`, builtin: true, status: 'done', thinking: null, chat: [], work: null, createdAt: 0 }]));
import { Sidebar, modelLabel } from './ui/Side.jsx';
import { filesForQuestion, guessRole } from './atlas/analyze.js';
import { mockBridge } from './mock.js';
import useLibrary from './hooks/useLibrary.js';
import { load, save, saveLessons, cleanErr } from './store.js';

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
  const [pyReady, setPyReady] = useState(pyState.ready);
  const [linkRange, setLinkRange] = useState(null);
  const [stepSel, setStepSel] = useState(null);
  const [pop, setPop] = useState(null);
  const [storyW, setStoryW] = useState(() => load('bento.storyW', 0.4));
  const desk = useRef(null);
  const cancels = useRef(new Map());

  const setSettings = (p) => setSettingsRaw((s) => { const n = { ...s, ...p }; save('bento.settings', n); return n; });
  useEffect(() => {
    api.setPrefs?.({ voice: settings.voice || 'English' });
    const CODES = { English: 'en', Español: 'es', Português: 'pt', Français: 'fr', Deutsch: 'de', Italiano: 'it', Nederlands: 'nl', Polski: 'pl', Türkçe: 'tr', Русский: 'ru', Українська: 'uk', العربية: 'ar', हिन्दी: 'hi', বাংলা: 'bn', 'Bahasa Indonesia': 'id', 'Tiếng Việt': 'vi', ไทย: 'th', Filipino: 'fil', 中文: 'zh', 日本語: 'ja', 한국어: 'ko', Kiswahili: 'sw' };
    document.documentElement.lang = CODES[settings.voice] || 'en'; // read-aloud picks a matching voice
  }, [settings.voice]);
  const lib = useLibrary({ api, settings, setProgress, setProjectRaw, setViewRaw });
  const { atlases, setAtlases, atlasKey, setAtlasKey, atlasRef, projects, setProjects, sites, setSites, siteKey, setSiteKey,
    stopReading, patchAtlas, asProject, narrate, openAtlas, openRepo, openRepoAt, openSite, openFolderAtlas, openProject, showAtlas, setProject, ensureProject,
    pendingFile, setPendingFile, findWild } = lib;
  // restore from the disk mirror when browser storage was lost (crash, forced quit)
  useEffect(() => { api.storeGet?.().then((d) => {
    if (!d) return;
    // whichever copy was written last wins (browser storage can lag behind after a crash)
    const diskNewer = (d['bento.savedAt'] || 0) > BOOT.savedAt;
    if ((diskNewer || !BOOT.has.has('bento.lessons')) && d['bento.lessons']?.length) setLessons(settle(d['bento.lessons']));
    else if (d['bento.lessons']?.length) setLessons((ls) => { const have = new Set(ls.map((l) => l.id)); const older = d['bento.lessons'].filter((l) => !have.has(l.id)); return older.length ? [...ls, ...settle(older)] : ls; }); // lessons older than the newest 60 live only on disk
    if ((diskNewer || !BOOT.has.has('bento.progress')) && d['bento.progress']) setProgress(d['bento.progress']);
    if ((diskNewer || !BOOT.has.has('bento.settings')) && d['bento.settings']) { setSettingsRaw((s0) => { const n = { ...s0, ...d['bento.settings'] }; save('bento.settings', n); return n; }); if (d['bento.settings'].onboarded) setOnb(null); } // restored settings are kept, and a finished welcome stays finished
    if ((diskNewer || !BOOT.has.has('bento.projects')) && d['bento.projects']?.length) setProjects((ps) => { const seen = new Set(ps.map((x) => x.key)); return [...ps, ...d['bento.projects'].filter((x) => !seen.has(x.key))]; });
  }).catch(() => {}); }, []);
  const knownWordSet = useMemo(() => new Set(Object.keys(progress.words || {})), [progress.words]);
  // design a custom learning path for any goal (used by The path and by an Atlas's "what it takes" card)
  const makePath = async (goal) => {
            if (providers && !providers.claude && !providers.codex) throw new Error('Connect Claude or Codex first (bottom-left), then Bento can design a path for you.');
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
  const lessonsRef = useRef(lessons); lessonsRef.current = lessons;
  useEffect(() => { const t = setTimeout(() => saveLessons(lessons), 400); return () => clearTimeout(t); }, [lessons]);
  useEffect(() => { const flush = () => saveLessons(lessonsRef.current); addEventListener('beforeunload', flush); return () => removeEventListener('beforeunload', flush); }, []); // never lose the last edit on quit
  useEffect(() => save('bento.progress', progress), [progress]);
  useEffect(() => save('bento.storyW', storyW), [storyW]);

  useEffect(() => {
    api.providers().then((p) => {
      setProviders(p);
      if (!p.claude && p.codex && settings.model.startsWith('claude')) setSettings({ model: 'codex:default' });
      if (p.gh) api.ghMe().then(setUser).catch(() => {});
    });
    const f = (r) => setPyReady(r); pyState.listeners.add(f); warmPython();
    return () => pyState.listeners.delete(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => lessons.find((l) => l.id === currentId) || [...SAMPLES, CHALLENGE, ...RACE_LESSONS, ...Object.values(PREBUILT), ...Object.values(PATH_PRE), ...Object.values(SIM_PRE)].find((l) => l.id === currentId) || null, [lessons, currentId]);
  const patch = useCallback((id, p) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))), []);

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

  // ---------------------------------------------------------------- asking
  const askLesson = useCallback((q, o = {}) => {
    const model = o.model || settings.model;
    const lang = o.lang || settings.lang;
    const level = o.level || settings.level;
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
      done: () => { if (!document.hasFocus()) { try { new Notification('Your lesson is ready', { body: q ? String(q).slice(0, 90) : 'Bento finished writing.', silent: true }).onclick = () => { window.focus(); setCurrentId(L0.id); setViewRaw('lesson'); }; } catch {} } parser.end(); setLessons((ls) => ls.map((l) => (l.id === L0.id ? { ...l, status: l.code || l.story.length ? 'done' : 'error', error: l.code || l.story.length ? null : 'The model replied, but not in the lesson format. Try again or switch model.' } : l))); cancels.current.delete(L0.id); },
      error: (m) => {
        parser.end(); cancels.current.delete(L0.id);
        // Auto-route: if this AI can't answer right now (usage limit, signed out, missing), quietly ask your other one.
        const alt = model.startsWith('claude') ? (providersRef.current?.codex ? 'codex:default' : null) : (providersRef.current?.claude ? 'claude:sonnet' : null);
        const account = /usage limit|isn’t signed in|isn’t installed/.test(m);
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
  const onAsk = async (q, o = {}) => {
    if (o.mode === 'feature' && project) { askLesson(q, { mode: 'feature', context: await buildContext(project, q) }); return; }
    if (o.mode === 'code') { const code = o.context?.code || q; askLesson('', { mode: 'code', context: { code }, lang: /^\s*(def |import |from |class \w+:|print\()/m.test(code) ? 'python' : 'javascript' }); return; }
    askLesson(q, o);
  };

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
      if (e.metaKey && e.key === 'n') { e.preventDefault(); setViewRaw('home'); }
      if (e.metaKey && e.key === 'k') { e.preventDefault(); setPal((x) => !x); }
      if (e.metaKey && e.key === ',') { e.preventDefault(); setShowSettings(true); }
      if (e.key === '?' && !e.metaKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName) && !document.activeElement?.closest?.('.cm-editor')) { e.preventDefault(); setShowKeys((x) => !x); }
      if (e.key === 'Escape') setShowKeys(false);
      if (e.metaKey && e.key === 'l') { e.preventDefault(); if (view === 'lesson') document.getElementById('followup')?.focus(); else if (view === 'atlas') document.getElementById('atlas-ask')?.focus(); else document.querySelector('.composer textarea, .ex-search input')?.focus(); }
      if (e.key === 'Escape') { setPop(null); setLinkRange(null); }
      if (e.metaKey && e.key === 'Enter' && view === 'lesson' && !document.activeElement?.closest?.('.cm-editor')) { e.preventDefault(); e.shiftKey ? desk.current?.step() : desk.current?.run(); }
    };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, [view]);

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
    if (pre && english && !lessons.some((l) => l.context?.ideaId === I.id)) return openLesson({ ...pre, createdAt: Date.now() }); // shipped with the app: opens instantly
    const have = lessons.find((l) => l.context?.ideaId === I.id && (l.status === 'done' || (l.status === 'streaming' && cancels.current.has(l.id))));
    if (have) return openLesson(have);
    askLesson(I.title, { mode: 'idea', lang: I.lang, context: { ideaId: I.id, title: I.title, company: I.company, brief: I.brief, code: I.code, vs: I.vs, repo: I.repo, file: I.file, link: I.link } });
  };
  const newScratch = (lang = settings.lang, remix = null) => {
    const py = lang === 'python';
    if (lang === 'html' || lang === 'typescript') {
      const web = lang === 'html';
      const starter = web
        ? '<!doctype html>\n<html>\n<head>\n<style>\n  body { font-family: sans-serif; padding: 24px; }\n  button { font-size: 18px; padding: 8px 16px; }\n</style>\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button id="btn">Click me</button>\n  <p id="out"></p>\n  <script>\n    document.getElementById("btn").addEventListener("click", () => {\n      document.getElementById("out").textContent = "You clicked at " + new Date().toLocaleTimeString();\n    });\n  </script>\n</body>\n</html>'
        : '// Write anything here. Press ⌘↵ to run it.\ninterface Pet { name: string; age: number }\nconst pets: Pet[] = [{ name: "Biscuit", age: 3 }, { name: "Mochi", age: 5 }];\nfor (const p of pets) {\n  console.log(`${p.name} is ${p.age}`);\n}\nshow(pets.map((p) => p.age));';
      const L2 = { ...emptyLesson('', { lang, model: settings.model }), title: remix ? `Remix of ${remix.title}` : 'Scratchpad', kicker: 'your own code', scratch: true, status: 'done', code: remix ? remix.code : starter, file: web ? 'index.html' : 'scratch.ts', pseudo: remix ? remix.pseudo : [],
        story: [{ t: 'p', md: web ? 'A blank web page that explains itself. Change the code on the right and the page updates. **Save my page** keeps it as a real file.' : 'A blank page for TypeScript. Type errors appear on the right line as you type; **Run** shows the result.' }, { t: 'try', items: web ? ['Change the button colour', 'Add a second button', 'Show a list of items'] : ['Give a pet a wrong type', 'Add a new field', 'Step through the loop'] }] };
      setLessons((ls) => [L2, ...ls.filter((x) => !(x.scratch && !x.work && x.title === 'Scratchpad'))]); setCurrentId(L2.id); setViewRaw('lesson'); setStepSel(null);
      return;
    }
    const code = py ? '# Write anything here. Press ⌘↵ to run it.\nname = "world"\nfor i in range(3):\n    print("hello", name, i)\n\nshow([3, 1, 4, 1, 5, 9, 2, 6])' : '// Write anything here. Press ⌘↵ to run it.\nconst name = "world";\nfor (let i = 0; i < 3; i++) {\n  console.log("hello", name, i);\n}\n\nshow([3, 1, 4, 1, 5, 9, 2, 6]);';
    const pseudo = py ? ['A note to yourself (Python skips it)', 'Make a box called name holding "world"', 'Repeat the next line 3 times, counting with i', 'Print a greeting with the count', '', 'Draw these numbers as bars'] : ['A note to yourself (JavaScript skips it)', 'Make a box called name holding "world"', 'Repeat 3 times, counting with i', 'Print a greeting with the count', '', '', 'Draw these numbers as bars'];
    const L = { ...emptyLesson('', { lang, model: settings.model }), title: remix ? `Remix of ${remix.title}` : 'Scratchpad', kicker: 'your own code', scratch: true, status: 'done', code: remix ? remix.code : code, file: py ? 'scratch.py' : 'scratch.js', pseudo: remix ? remix.pseudo : pseudo,
      story: [{ t: 'p', md: 'A blank page that explains itself. Type any code on the right: Bento turns each line into plain English as you go, **Run** shows the result, and **Step** walks through it line by line.' }, { t: 'p', md: 'Hover any word for a quick explanation. Stuck? Ask below, like “why does range start at 0?”.' }, { t: 'try', items: ['Change 3 to 10', 'Step through the loop', py ? 'Print your own name' : 'Log your own name'] }] };
    setLessons((ls) => [L, ...ls.filter((x) => !(x.scratch && !x.work && x.title === 'Scratchpad'))]); setCurrentId(L.id); setViewRaw('lesson'); setStepSel(null);
  };
  const altModel = settings.model.startsWith('claude') ? (providers?.codex ? 'codex:default' : null) : (providers?.claude ? 'claude:sonnet' : null);
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
    if (!providers || (!providers.claude && !providers.codex)) return openLesson(CHALLENGE);
    const nid = askLesson(topic, { mode: 'challenge', lang: settings.lang });
    setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: nid } }));
  };
  // hooks for scripts/pregen-*.mjs, which drive the real app to pre-write shipped lessons
  useEffect(() => { window.__openIdea = (id) => readIdea(ideaById[id]); window.__ask = (q, o) => askLesson(q, o || {}); window.__genStop = (id) => { const st = [...STOPS, ...WEB, ...AI].find((x) => x.id === id); return askLesson(st.q, { ...(st.lang ? { lang: st.lang } : {}), ...(st.mode ? { mode: st.mode } : {}) }); }; });
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
  const openCompare = (first) => { setPair((p) => { const apps = projects.filter((x) => x.kind !== 'site'); const a = first || p[0] || apps[0]?.key || null; const b = p[1] && p[1] !== a ? p[1] : apps.find((x) => x.key !== a)?.key || null; return [a, b]; }); setViewRaw('compare'); };

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
    <div className="app">
      <Sidebar view={view} setView={setView} lessons={lessons} current={currentId} onOpen={openLesson} onNew={() => setViewRaw('home')}
        projects={projects} atlasKey={view === 'atlas' ? atlasKey : null} atlases={atlases} onOpenProject={(p) => showAtlas(p.key)} onForgetProject={(k) => setProjects((ps) => ps.filter((p) => p.key !== k))}
        onDelete={(id) => { cancels.current.get(id)?.(); setLessons((ls) => ls.filter((l) => l.id !== id)); if (id === currentId) setViewRaw('home'); }}
        settings={settings} setSettings={setSettings} providers={providers} user={user} progress={progress} onSetup={() => setOnb(1)} onSettings={() => setShowSettings(true)} siteKey={siteKey} />
      {onb == null && view === 'lesson' && current && <Coach key="lesson" screen="lesson" ready={!streaming && !!current.code && current.lang !== 'html'} />}
      {onb == null && view === 'atlas' && <Coach key="atlas" screen="atlas" ready={!!atlases[atlasKey]?.facts} />}
      {dropping && <div className="drop-veil"><div className="drop-card"><span>⤓</span><b>Drop to take it apart</b><i>A folder becomes a picture of the project. A code file gets explained line by line.</i></div></div>}
      {showKeys && (
        <div className="pal-veil" onMouseDown={() => setShowKeys(false)}>
          <div className="keys" onMouseDown={(e) => e.stopPropagation()}>
            <b>Keyboard</b>
            {[['⌘K', 'Search everything, ask, or paste a repo'], ['⌘N', 'New question'], ['⌘,', 'Settings'], ['⌘L', 'Jump to the ask box'], ['⌘↵', 'Run the code'], ['⌘⇧↵', 'Step through it'], ['↵ / ⌘↵', 'In a lesson: quick answer / full lesson'], ['⌥ drag', 'Scrub any number in the code'], ['select text', 'Explain anything you highlight'], ['Esc', 'Close panels'], ['?', 'This sheet']].map(([k, d]) => <div key={k} className="key-row"><kbd>{k}</kbd><span>{d}</span></div>)}
          </div>
        </div>
      )}
      {showSettings && <Settings settings={settings} setSettings={setSettings} providers={providers} onClose={() => setShowSettings(false)} onSetup={() => { setShowSettings(false); setOnb(1); }} onOpenData={() => api.openData?.()} onReplayOnboarding={() => { setShowSettings(false); setOnb(0); }} wordsCount={Object.keys(progress.words || {}).length} lessonsCount={lessons.filter((l) => !l.builtin).length} />}
      {pal && <Palette onOpenAt={openRepoAt} onOpenSite={openSite} onClose={() => setPal(false)} lessons={lessons} projects={projects} words={progress.words || {}}
        actions={[['home', 'Learn: ask anything', '✦'], ['path', 'The path: zero to a real app', '⤳'], ['explore', 'Explore code', '◈'], ['ideas', 'Clever ideas', '⬡'], ['words', 'Your words', 'Aa'], ['bug', 'Daily bug', '⚑']].map(([v, label, icon]) => ({ label, icon, run: () => setView(v) })).concat([{ label: 'Settings', icon: '⚙', run: () => setShowSettings(true) }, { label: 'Keyboard shortcuts', icon: '?', run: () => setShowKeys(true) }, { label: 'Connections & setup', icon: '⚙', run: () => setOnb(1) }, { label: 'Open a folder on this Mac', icon: '▢', run: openFolderAtlas }, { label: 'Compare two apps', icon: '⇄', run: () => openCompare() }, { label: 'Scratchpad: write your own code', icon: '✎', run: () => newScratch() }])}
        onAsk={(q) => askLesson(q, {})} onOpenRepo={openRepo} onLesson={openLesson} onProject={(p) => showAtlas(p.key)} onIdea={readIdea} onWord={() => setViewRaw('words')} />}
      {onb != null && <Onboarding api={api} settings={settings} setSettings={setSettings} startAt={onb} onDone={(go) => { setOnb(null); if (['explore', 'ideas', 'path'].includes(go)) setViewRaw(go); else setViewRaw('home'); api.providers().then(setProviders); }} />}
      <main className="sheet">
        <div className="titlebar-drag" />
        {view === 'home' && <Home onAsk={onAsk} settings={settings} setSettings={setSettings} project={project} setProject={setProject} onPickFolder={() => setProject('folder')} onPickRepo={(r) => setProject({ repo: r })}
          repos={repos} loadRepos={loadRepos} samples={SAMPLES} challenge={CHALLENGE} onOpen={openLesson} user={user} recent={lessons.filter((l) => !l.builtin)} providers={providers}
          onOpenRepo={openRepo} onExplore={() => setViewRaw('explore')} onIdea={readIdea} onScratch={() => newScratch()} onDaily={openDaily} onSim={(q) => { const pre = SIM_PRE[q]; const have = lessons.find((l) => l.id === pre?.id); if (have) return openLesson(have); if (pre && (!settings.voice || settings.voice === 'English')) return openLesson({ ...pre, createdAt: Date.now() }); askLesson(`${q} Teach it by simulating it with a small program and a picture.`, { mode: 'explain' }); }} onSetup={() => setOnb(1)} onSuggest={async (rs) => {
            const list = rs.slice(0, 25).map((r) => `${r.name} (${r.primaryLanguage?.name || '?'})${r.description ? `: ${r.description.slice(0, 80)}` : ''}`).join('\n');
            const j = parseJSONLoose(await api.quick(settings.model, `A learner (${settings.level}) has these GitHub repos:\n${list}\n\nSuggest 3 short lessons that would most help THEM next, based on what they actually build (a gap, a next step, or a deeper look at a tool they use). Each lesson must be teachable with a small runnable example.\nReply JSON: {"items":[{"title":"≤ 6 words","why":"≤ 12 words, mention their project or tool","q":"the question to ask, ≤ 18 words","lang":"python|javascript|typescript"}]}`));
            return (j?.items || []).slice(0, 3);
          }} onWords={() => setViewRaw('words')} words={progress.words || {}} stats={{ days: activityByDay(lessons, progress.words), streak: streakOf(lessons), lessons: lessons.filter((l) => !l.builtin && l.status === 'done').length, ideas: Object.keys(readIds).length, words: Object.keys(progress.words || {}).length, apps: projects.length }} />}
        {view === 'compare' && <Compare projects={projects.filter((x) => x.kind !== 'site')} atlases={atlases} ensure={ensureProject} pair={pair} setPair={setPair} onCompareAsk={compareAsk} onOpenProject={showAtlas} />}
        {view === 'path' && <Path level={settings.level} custom={progress.tracks || []}
          onDropPath={(id) => setProgress((p) => ({ ...p, tracks: (p.tracks || []).filter((t) => t.id !== id) }))}
          onMakePath={makePath} done={Object.fromEntries(Object.entries(progress.path || {}).filter(([, id]) => id === 'x' || lessons.some((l) => l.id === id && l.status === 'done')).map(([k]) => [k, true]))}
          onStart={(st) => { const id = progress.path?.[st.id]; const l = id && lessons.find((x) => x.id === id); if (l) return openLesson(l); const pre = PATH_PRE[st.id]; if (pre && (!settings.voice || settings.voice === 'English') && settings.level !== 'engineer') { openLesson({ ...pre, createdAt: Date.now() }); setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: pre.id } })); return; } const nid = askLesson(st.q, { ...(st.lang ? { lang: st.lang } : {}), ...(st.mode ? { mode: st.mode } : {}), ...pathContext(st) }); setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: nid } })); }}
          onExplore={(st) => { setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: 'x' } })); setViewRaw('explore'); }} onSite={(st) => { setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: 'x' } })); openSite('https://wikipedia.org'); }} onIdeas={() => setViewRaw('ideas')} />}
        {view === 'site' && sites[siteKey] && <Site key={siteKey} site={sites[siteKey]} onOpenRepo={openRepo} modelLabel={modelLabel(settings.model)} onOpenUrl={(u) => api.openExternal(u)}
          onRetry={() => { const x = sites[siteKey]; setSites((m) => { const n = { ...m }; delete n[siteKey]; return n; }); setTimeout(() => openSite(x.url), 0); }}
          onAsk={(q) => askLesson(`${q} (I'm studying the website ${siteKey}${sites[siteKey]?.narr?.gist?.one ? `: ${sites[siteKey].narr.gist.one}` : ''})`, {})} />}
        {view === 'ideas' && <Ideas instant={!settings.voice || settings.voice === 'English' ? PREBUILT : {}} races={RACE_LESSONS} onRace={openLesson} onRead={readIdea} readIds={readIds} interests={settings.interests} />}
        {view === 'words' && <Words onGrade={(term, g) => setProgress((p) => { const k = String(term).toLowerCase(); return { ...p, words: { ...p.words, [k]: { ...p.words[k], ...g } } }; })} words={progress.words || {}} onOpen={(id) => { const l = lessons.find((x) => x.id === id); if (l) openLesson(l); }} onAsk={(t) => askLesson(`Explain "${t}" with a tiny example`, {})} />}
        {view === 'explore' && <Explore api={api} onOpenAt={openRepoAt} onOpenSite={openSite} onCompare={() => openCompare()} onOpenRepo={openRepo} onOpenFolder={openFolderAtlas} projects={projects} onOpenProject={openProject} repos={repos} loadRepos={loadRepos} user={user} />}
        {view === 'atlas' && atlases[atlasKey] && (() => { const A = atlases[atlasKey]; return (
          <Atlas key={atlasKey} atlas={A} onMakePath={async (goal) => { const id = await makePath(goal); if (id) { localStorage.setItem('bento.track', id); setViewRaw('path'); } }} onStopReading={() => stopReading(A.key)} onBig={() => { setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }); setTimeout(() => openAtlas(A.src, { big: true }), 0); }} initialFile={pendingFile?.key === A.key ? pendingFile.path : null} onInitialFileShown={() => setPendingFile(null)} modelLabel={modelLabel(settings.model)}
            readFile={(p) => (A.src.root ? api.readFile(A.src.root, p) : Promise.reject(new Error(A.fetchError ? `Couldn’t download the code: ${A.fetchError}` : 'Downloading the code… try again in a few seconds.')))}
            onAsk={(q, focus) => askRepo(A, q, focus)}
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
            onQuick={async (q) => {
              const paths = filesForQuestion(A.facts, A.narr, q).slice(0, 3);
              const parts = [];
              for (const p of paths) { try { parts.push(`--- ${p} ---\n${(await api.readFile(A.src.root, p)).slice(0, 5000)}`); } catch {} }
              const tree = A.facts.files.filter((f) => f.lang).slice(0, 120).map((f) => `${f.p} — ${A.narr?.roles?.[f.p] || guessRole(f)}`).join('\n');
              const j = parseJSONLoose(await api.quick(settings.model, `A ${settings.level} learner is studying the repository ${A.name}${A.narr?.gist?.one ? ` (${A.narr.gist.one})` : ''} and asks: ${q}\n\nFILES (path — role):\n${tree}\n\nMOST RELEVANT FILES:\n${parts.join('\n\n')}\n\nAnswer in at most 110 words, plainly, naming real files in backticks. Only say what the code supports.\nReply JSON: {"answer":"...","files":["exact paths you referred to, max 4"]}`));
              return { a: j?.answer || 'No answer this time. Try a full lesson (⌘↵).', files: j?.files || paths };
            }}
            onExplainFile={(p, text) => askLesson(`Explain ${p}`, { mode: 'code', context: { code: text, path: p, repo: A.name, repoKey: A.key }, lang: /\.py$/.test(p) ? 'python' : 'javascript' })}
            onFeature={async (q) => askLesson(q, { mode: 'feature', context: await buildContext(asProject(A), q), lang: Object.keys(A.facts.langs).includes('Python') && !Object.keys(A.facts.langs).some((l) => /Script/.test(l)) ? 'python' : 'javascript' })}
            onRefresh={async () => { if (A.src.kind === 'github') await api.atlasRefresh(A.src.full); else await api.cachePut(A.key, null); setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }); setTimeout(() => openAtlas(A.src.kind === 'github' ? { kind: 'github', full: A.src.full } : A.src), 0); }}
            onBuild={(mini) => askLesson(mini, { mode: 'build', lang: (() => { const ls = Object.entries(A.facts.langs).sort((a, b) => b[1] - a[1]); const top = ls[0]?.[0]; const ui = A.facts.files.filter((f) => f.layer === 'ui' && f.lang).length; const code = A.facts.files.filter((f) => f.lang && f.layer !== 'support').length || 1; return top === 'Python' ? 'python' : /Script|HTML|CSS|Vue|Svelte|Astro/.test(top || '') && ui / code > 0.3 ? 'html' : top === 'TypeScript' ? 'typescript' : 'javascript'; })(), context: { inspired: A.name, gist: A.narr?.gist?.one, repoKey: A.key, repo: A.name } })} onCompare={() => openCompare(A.key)} onFork={() => api.ghFork(A.src.full)} onOpenUrl={(u) => api.openExternal(u)}
            onRetry={() => (A.facts ? narrate(A.key) : (setAtlases((m) => { const n = { ...m }; delete n[A.key]; atlasRef.current = n; return n; }), setTimeout(() => openAtlas(A.src), 0)))} />
        ); })()}
        {view === 'lesson' && current && (
          <div className={`lesson ${article && current.code && current.lang !== 'html' && !current.steps?.length ? 'article' : ''}`} style={{ '--story-w': `${storyW * 100}%` }}>
            <Story lesson={current} streaming={streaming} modelLabel={modelLabel(current.model || settings.model)}
              onLink={setLinkRange} onLinkClick={(r) => setLinkRange(r)} onTerm={onTerm} onTry={onTry}
              onNext={(q) => current.mode === 'challenge' ? askLesson(/another/i.test(q) ? (current.concepts?.[0] || 'arrays') : q, { mode: /another/i.test(q) ? 'challenge' : 'explain', lang: current.lang }) : askLesson(q, { prev: current, lang: current.lang })}
              onFollowUp={(q) => askLesson(q, { prev: current, lang: current.lang })}
              onSecondOpinion={async (i) => {
                const L = current; const id = L.id; const c = L.chat[i]; if (!altModel) return;
                const set = (second) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, chat: l.chat.map((x, k) => (k === i ? { ...x, second } : x)) } : l)));
                set({ who: modelLabel(altModel), loading: true });
                const code = (L.work ?? L.code ?? '').split('\n').map((x, k) => `${k + 1}| ${x}`).join('\n').slice(0, 5000);
                try {
                  const j = parseJSONLoose(await api.quick(altModel, `You are tutoring a ${settings.level} learner inside a lesson titled "${L.title}".\nThe lesson's ${L.lang} code (with line numbers):\n${code}\n\nThe learner asks: ${c.q}\nAnother tutor already answered: "${c.a}"\nGive YOUR answer in at most 90 words: agree, add what they missed, or politely correct them. You may use **bold**, \`code\` and [[line|links]].\nReply JSON: {"answer":"..."}`));
                  set({ who: modelLabel(altModel), a: j?.answer || 'No answer this time.' });
                } catch { set({ who: modelLabel(altModel), a: 'That model didn’t answer. Is it signed in?' }); }
              }}
              onTeachBack={providers && !providers.claude && !providers.codex ? null : async (L, said) => {
                const id = L.id; const story = (L.story || []).map((b) => b.md || b.text || '').filter(Boolean).join('\n').slice(0, 3500);
                let j = null;
                try { j = parseJSONLoose(await api.quick(settings.model, `A ${settings.level} learner just finished a lesson titled "${L.title}" (concepts: ${(L.concepts || []).join(', ')}).\nLESSON TEXT:\n${story}\n\nThey explained it back in their own words:\n"${said}"\n\nBe a warm, honest tutor. Judge understanding, not grammar or spelling. Score 0–3 (0 = wrong idea, 1 = partly, 2 = right but missing one key piece, 3 = solid).\nReply JSON: {"score":0-3,"got":["what they got right, ≤ 14 words each, max 2"],"missing":["the most important missing or wrong piece, said plainly, ≤ 22 words, max 2; empty if score is 3"],"next":"one short question that would push them further, ≤ 18 words"}`)); } catch (e) { j = { score: 0, got: [], missing: [cleanErr(e)], next: '' }; }
                if (!j) j = { score: 0, got: [], missing: ['Couldn’t read the answer this time. Try again.'], next: '' };
                const teach = { said, score: Math.max(0, Math.min(3, +j.score || 0)), got: j.got || [], missing: j.missing || [], next: j.next || '' };
                setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, teach } : l)));
              }}
              onPractice={(L) => askLesson(`${L.title}: ${(L.concepts || []).join(', ') || L.kicker || ''}`.slice(0, 120), { mode: 'challenge', lang: L.lang === 'typescript' ? 'typescript' : L.lang })}
              onQuickAsk={async (q) => {
                const L = current; const id = L.id; const n = (L.chat || []).length;
                const put = (c) => setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, chat: [...(l.chat || []).slice(0, n), c] } : l)));
                if (providers && !providers.claude && !providers.codex) { put({ q, a: 'Bento needs an AI to answer questions. Connect Claude Code or Codex (bottom-left → **Connect an AI**); it uses the subscription you already have.' }); return; }
                put({ q, loading: true });
                const code = (L.work ?? L.code ?? '').split('\n').map((x, i) => `${i + 1}| ${x}`).join('\n').slice(0, 5000);
                const hist = (L.chat || []).slice(-3).map((c) => `Q: ${c.q}\nA: ${c.a}`).join('\n');
                try {
                  const j = parseJSONLoose(await api.quick(settings.model, `You are tutoring a ${settings.level} learner inside a lesson titled "${L.title}".\nThe lesson's ${L.lang} code (with line numbers):\n${code}\n${hist ? `\nEarlier in this chat:\n${hist}\n` : ''}\nThe learner asks: ${q}\nAnswer warmly and precisely in at most 110 words. You may use **bold**, \`code\` and line links like [[3-5|the loop]] that point at lines of the code above.\nReply JSON: {"answer":"...","term":"a technical term you used that they may not know, or null","plain":"one-line definition of it, or null"}`));
                  put(j?.answer ? { q, a: j.answer, term: j.term, plain: j.plain } : { q, a: 'I couldn’t answer that one. Try making it a full lesson.' });
                  if (j?.term && j?.plain) setProgress((p) => { const k = String(j.term).toLowerCase(); if (p.words?.[k]) return p; return { ...p, words: { ...(p.words || {}), [k]: { term: j.term, plain: j.plain, from: id, title: L.title, at: Date.now() } } }; });
                } catch { put({ q, a: 'The model didn’t answer. Check your connection and try again.' }); }
              }}
              onDepth={(dir) => { const lv = ['kid', 'student', 'engineer']; const base = current.level || settings.level; const level = lv[Math.max(0, Math.min(2, lv.indexOf(base) + (dir === 'deeper' ? 1 : -1)))]; askLesson(dir === 'deeper' ? `Go deeper on "${current.title}": what's really happening under the hood, and the trade-offs a pro would think about` : `Explain "${current.title}" again, much simpler, with an everyday analogy and a smaller example`, { prev: current, lang: current.lang, level }); }}
              onQuiz={(ok) => ok && award(current, 'quiz')} onConcept={(c) => askLesson(`Teach me ${c.replace(/-/g, ' ')}`, { lang: current.lang })}
              stepSel={stepSel} onStepSelect={setStepSel}
              onWild={providers?.gh ? findWild : null} onOpenAt={openRepoAt} onOpenRepo={openRepo} altModel={altModel ? modelLabel(altModel) : null} onRetryWith={() => { const a = current; setSettings({ model: altModel }); setLessons((ls) => ls.filter((l) => l.id !== a.id)); setTimeout(() => askLesson(a.q, { mode: a.mode, lang: a.lang, context: a.context }), 0); }}
              article={article} onArticle={() => setArticle((a) => { localStorage.setItem('bento.article', a ? '' : '1'); return !a; })} run={runs[current.id]}
              onStop={() => { const id = current.id; cancels.current.get(id)?.(); cancels.current.delete(id); setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, status: l.code || l.story.length ? 'done' : 'error', error: l.code || l.story.length ? null : 'Stopped before anything arrived.', thinking: null } : l))); }}
              onBackToRepo={showAtlas} onOpenUrl={(u) => api.openExternal(u)} knownWords={progress.words}
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
