import { spotConstructs } from '../constructs.js';
import { t, tx } from '../i18n.js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Md } from './Story.jsx';
import Editor from './Editor.jsx';
import Stage from './Stage.jsx';
import { run as runCode, pyState, typeCheck } from '../runtime/runner.js';
import { explainToken } from '../explain.js';
import { quickPrompts, parseJSONLoose } from '../lesson.js';
import { localChecks, checkPrompt, applyCheck } from '../verify.js';
import { keys } from '../platform.js';

const LENSES = [['code', 'Code', 'Code'], ['both', 'Side by side', 'Both'], ['english', 'Plain words', 'Plain']]; // full and narrow labels
const other = (l) => (l === 'python' ? 'javascript' : 'python');
const LNAME = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML' };

function addedLines(prev, cur) {
  if (prev == null) return null;
  const bag = new Map(); prev.split('\n').forEach((l) => bag.set(l.trim(), (bag.get(l.trim()) || 0) + 1));
  const out = new Set();
  cur.split('\n').forEach((l, i) => { const k = l.trim(); if (bag.get(k)) bag.set(k, bag.get(k) - 1); else if (k) out.add(i + 1); });
  return out;
}

const Desk = forwardRef(function Desk(props, ref) {
  const { lesson: L, onPatch, quick, model, linkRange, stepSel, onMastery, pyReady, streaming, onRemix, knownWords, onWord } = props;
  const lang = L.lang;
  const ed = useRef(null);
  const [code, setCode] = useState(L.work ?? L.code);
  const [lens, setLens] = useState('code');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState(null);
  const [tracing, setTracing] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [growth, setGrowth] = useState(null);
  const [measuring, setMeasuring] = useState(false);
  const [tests, setTests] = useState(null);
  const [testing, setTesting] = useState(false);
  const [tab, setTab] = useState(L.tests ? 'tests' : 'output');
  const [hoverLine, setHoverLine] = useState(null);
  const [noteRange, setNoteRange] = useState(null);
  const [errShown, setErrShown] = useState(false);
  const [live, setLive] = useState(true);
  const [split, setSplit] = useState(0.56);
  const [twinBusy, setTwinBusy] = useState(false);
  const [twinHover, setTwinHover] = useState(null);
  const [pmapV, setPmapV] = useState(0);
  const edited = useRef(false);
  // input(): the learner's answers so far, and a random seed kept while answering so a re-run replays the same game
  // projects: several files, one open at a time (files[0] is the one that runs)
  const multi = Array.isArray(L.files) && L.files.length > 0;
  const filesRef = useRef(L.files || null); const [fi, setFi] = useState(0); const [, bumpFiles] = useState(0);
  const fiRef = useRef(0); fiRef.current = fi; // memoised callbacks read the open file through this
  const answersRef = useRef([]); const seedRef = useRef(Math.floor(Math.random() * 1e9));
  const [liveLogs, setLiveLogs] = useState([]);
  // stuck detector: the same error on three runs you asked for, or three failed test runs in a row
  const streak = useRef({ err: null, n: 0, tests: 0 }); const [stuck, setStuck] = useState(null);
  const inflight = useRef(false), dirty = useRef(false);
  const codeRef = useRef(code); codeRef.current = code;
  const lidRef = useRef(L.id); lidRef.current = L.id;

  // ---- reset when the lesson changes
  useEffect(() => {
    edited.current = L.work != null && L.work !== L.code;
    streak.current = { err: null, n: 0, tests: 0 }; setStuck(null);
    answersRef.current = []; setLiveLogs([]); filesRef.current = L.files || null; setFi(0);
    setCode(L.files?.length ? L.files[0].code : (L.work ?? L.code)); setResult(null); setTrace(null); setGrowth(null); setTests(null); setStepIdx(0); setPlaying(false);
    setTab(L.tests ? 'tests' : 'output'); setLens(L.mode === 'code' || L.mode === 'compare' ? 'both' : 'code');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.id]);
  // streaming: follow the model's code until the student edits
  useEffect(() => { if (!edited.current && L.code && L.code !== codeRef.current && stepSel == null) setCode(L.code); }, [L.code]);
  // recipe steps
  useEffect(() => { if (stepSel != null && L.steps[stepSel]) { setCode(L.steps[stepSel].code); edited.current = false; } }, [stepSel, L.steps.length]);
  useEffect(() => { if (L.mode === 'build' && stepSel != null && L.steps[stepSel] && !streaming) { const c = L.steps[stepSel].code; const t = setTimeout(() => doRun(c, { quiet: true }), 60); return () => clearTimeout(t); } }, [stepSel, streaming, L.steps.length]);

  // ---- plain-English map: line text → English, survives edits that keep a line intact
  const pmap = useMemo(() => {
    const m = new Map();
    const src = (L.code || '').split('\n');
    src.forEach((l, i) => { if (L.pseudo[i] != null) m.set(l.trim(), L.pseudo[i]); });
    Object.entries(L.pmap || {}).forEach(([k, v]) => m.set(k, v));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.code, L.pseudo, L.pmap, pmapV]);
  const english = useMemo(() => code.split('\n').map((l) => {
    const k = l.trim();
    if (!k || /^[}\])]+[;,)]*$/.test(k)) return '';
    return pmap.has(k) ? pmap.get(k) : null;
  }), [code, pmap]);
  const pendingEnglish = english.some((x) => x === null);

  useEffect(() => {
    if (!pendingEnglish || streaming || !quick) return;
    const t = setTimeout(async () => {
      const snapshot = codeRef.current;
      try {
        const s = await quick(model, quickPrompts.pseudo({ code: snapshot, lang: LNAME[lang] }));
        const j = parseJSONLoose(s);
        if (!j?.lines) return;
        const add = {};
        snapshot.split('\n').forEach((l, i) => { if (l.trim() && j.lines[i] != null) add[l.trim()] = String(j.lines[i]); });
        onPatch({ pmap: { ...(L.pmap || {}), ...add } }); setPmapV((v) => v + 1);
      } catch { /* stay pending */ }
    }, 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEnglish, code, streaming]);

  // a project runs as one thing: a web page gets its CSS and JS files stitched in; Python gets the other files next to it
  const projectBundle = (src) => {
    const fs = filesRef.current; if (!fs?.length) return { main: src, files: null };
    const all = fs.map((f, i) => (i === fiRef.current ? { ...f, code: src } : f));
    if (lang === 'html') {
      let main = all[0].code; const extra = [];
      for (const f of all.slice(1)) {
        const n = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (/\.css$/.test(f.name) && new RegExp(`<link[^>]+href=["']\\.?/?${n}["'][^>]*>`, 'i').test(main)) { main = main.replace(new RegExp(`<link[^>]+href=["']\\.?/?${n}["'][^>]*>`, 'i'), ''); extra.push(`<style>\n${f.code}\n</style>`); }
        if (/\.js$/.test(f.name) && new RegExp(`<script[^>]+src=["']\\.?/?${n}["'][^>]*>\\s*</script>`, 'i').test(main)) { main = main.replace(new RegExp(`<script[^>]+src=["']\\.?/?${n}["'][^>]*>\\s*</script>`, 'i'), ''); extra.push(`<script>\n${f.code}\n</script>`); }
      }
      return { main: `${main}\n${extra.join('\n')}`, files: null }; // added at the end, so index.html keeps its line numbers
    }
    return { main: all[0].code, files: all.slice(1).map((f) => ({ name: f.name, code: f.code })) };
  };
  const openFile = (i) => { if (!filesRef.current) return; filesRef.current = filesRef.current.map((f, k) => (k === fi ? { ...f, code: codeRef.current } : f)); setFi(i); setCode(filesRef.current[i].code); edited.current = true; };
  const addFile = () => {
    const web = lang === 'html'; const have = filesRef.current || [{ name: L.file || (lang === 'python' ? 'main.py' : 'index.html'), code: codeRef.current }];
    const names = web ? ['style.css', 'script.js', 'page2.html', 'more.css'] : ['helpers.py', 'data.py', 'utils.py', 'module4.py'];
    const name = names.find((n) => !have.some((f) => f.name === n)) || `file${have.length + 1}${web ? '.js' : '.py'}`;
    const starter = name.endsWith('.css') ? '/* styles for your page */\nh1 { color: tomato; }\n' : name.endsWith('.js') ? '// code for your page\ndocument.querySelector("h1").addEventListener("click", () => alert("hi!"));\n' : name.endsWith('.py') ? `# ${name}: import it from ${have[0].name} with: from ${name.slice(0, -3)} import greet\ndef greet(who):\n    return f"Hello, {who}!"\n` : '<!doctype html>\n<h1>Another page</h1>\n';
    let files = [...have.map((f, i) => (i === fi ? { ...f, code: codeRef.current } : f)), { name, code: starter }];
    // link new CSS/JS files into the page so they work straight away
    if (web && /\.(css|js)$/.test(name)) { const tag = name.endsWith('.css') ? `<link rel="stylesheet" href="${name}">` : `<script src="${name}"></script>`; const m = files[0].code; files[0] = { ...files[0], code: /<\/body>/i.test(m) ? m.replace(/<\/body>/i, `  ${tag}\n</body>`) : `${m}\n${tag}` }; }
    filesRef.current = files; onPatch({ files }); setFi(files.length - 1); setCode(starter); bumpFiles((x) => x + 1);
  };
  const removeFile = (i) => { if (!filesRef.current || i === 0) return; const files = filesRef.current.filter((_, k) => k !== i); filesRef.current = files; onPatch({ files }); setFi(0); setCode(files[0].code); };

  // ---- running
  const doRun = useCallback(async (src = codeRef.current, opts = {}) => {
    if (!src.trim()) return;
    if (inflight.current) { dirty.current = true; return; }
    if (!opts.fromTyping) clearTimeout(liveTimer.current); // a run you asked for (or an answer) replaces the pending re-run
    if (!opts.keepAnswers) { answersRef.current = []; seedRef.current = Math.floor(Math.random() * 1e9); }
    inflight.current = true; setRunning(true); setLiveLogs([]);
    const mine = lidRef.current;
    const bundle = projectBundle(src);
    const r = await runCode(lang, 'run', bundle.main, { key: L.id, answers: [...answersRef.current], seed: seedRef.current, files: bundle.files }, { onLive: (batch) => { if (lidRef.current === mine) setLiveLogs((l) => [...l, ...batch].slice(-400)); } });
    inflight.current = false; setRunning(false);
    if (lidRef.current !== mine) { dirty.current = false; return; } // the learner moved to another lesson meanwhile
    setResult(r); props.onResult?.(mine, r, src);
    if (!opts.quiet) { const S = streak.current; if (r.error) { S.n = S.err === r.error.msg ? S.n + 1 : 1; S.err = r.error.msg; if (S.n >= 3) setStuck({ why: 'error', err: r.error }); } else { S.n = 0; S.err = null; setStuck(null); } }
    if (!opts.quiet) { if (r.error) setTab((t) => (t === 'steps' || t === 'growth' || t === 'tests' ? t : 'output')); }
    if (dirty.current) { dirty.current = false; doRun(codeRef.current, { quiet: true }); }
    onMastery?.('run');
  }, [lang, onMastery]);

  const doTrace = useCallback(async () => {
    setTab('steps'); setTracing(true); setPlaying(false);
    const bundle = projectBundle(codeRef.current);
    const r = await runCode(lang, 'trace', bundle.main, { answers: [...answersRef.current], seed: seedRef.current, files: bundle.files });
    setTracing(false); setTrace(r); setStepIdx(0);
    if (r.steps?.length) setPlaying(true);
    onMastery?.('step');
  }, [lang, onMastery]);

  const doMeasure = useCallback(async (cfg) => {
    setTab('growth'); setMeasuring(true);
    const calls = cfg.calls || [{ label: (cfg.call || '').replace(/\(.*$/, '') || 'your function', call: cfg.call }];
    const out = [];
    for (const c of calls) {
      const r = await runCode(lang, 'growth', codeRef.current, { setup: cfg.setup, call: c.call });
      out.push({ label: c.label, pts: r.growth?.pts || [], fit: r.growth?.fit, error: r.error?.msg });
    }
    setGrowth(out); setMeasuring(false);
  }, [lang]);

  // races start themselves once the runtime is ready
  useEffect(() => { if (L.race && L.growth && (lang !== 'python' || pyReady)) { const t = setTimeout(() => doMeasure(L.growth), 400); return () => clearTimeout(t); } }, [L.id, pyReady]);

  const doTests = useCallback(async () => {
    if (!L.tests) return;
    setTab('tests'); setTesting(true);
    const r = await runCode(lang, 'tests', codeRef.current, { fn: L.tests.fn, cases: L.tests.cases });
    setTesting(false);
    if (r.error) { setResult(r); setTests(L.tests.cases.map(() => ({ ok: false, got: r.error.msg }))); return; }
    setTests(r.tests);
    if (r.tests?.every((x) => x.ok)) { onMastery?.('challenge'); streak.current.tests = 0; setStuck(null); }
    else if (++streak.current.tests >= 3) setStuck({ why: 'tests', failing: r.tests.map((x, i) => (x.ok ? null : { i, got: x.got })).filter(Boolean) });
  }, [L.tests, lang, onMastery]);

  useImperativeHandle(ref, () => ({ run: () => doRun(), step: doTrace, tests: doTests, setCode: (c) => { edited.current = true; setCode(c); onPatch({ work: c }); }, getCode: () => codeRef.current }));

  // run once when a lesson is ready
  useEffect(() => {
    if (streaming || !L.code) return;
    if (lang === 'python' && !pyReady) return;
    if (L.mode === 'feature' || L.mode === 'code' || L.mode === 'compare') return;
    doRun(L.work ?? (stepSel != null && L.steps[stepSel] ? L.steps[stepSel].code : L.code), { quiet: true }); // the lesson's own code: the editor may still hold the previous lesson's
    if (L.tests && (L.builtin !== true || L.puzzle)) doTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.id, streaming, pyReady]);

  // live re-run while typing (debounced)
  const liveTimer = useRef(null);
  const onChange = (v, scrub) => {
    edited.current = true; setCode(v); setErrShown(false);
    if (trace) { setTrace(null); setPlaying(false); }
    clearTimeout(liveTimer.current);
    if (scrub) { doRun(v, { quiet: true }); }
    else if (live && L.mode !== 'feature' && L.mode !== 'code' && L.mode !== 'compare') liveTimer.current = setTimeout(() => doRun(v, { quiet: true, fromTyping: true }), lang === 'python' ? 520 : 380);
    if (filesRef.current) { filesRef.current = filesRef.current.map((f, i) => (i === fi ? { ...f, code: v } : f)); clearTimeout(onChange.save); onChange.save = setTimeout(() => onPatch({ files: filesRef.current }), 600); }
    else { clearTimeout(onChange.save); onChange.save = setTimeout(() => onPatch({ work: v }), 600); }
  };
  useEffect(() => { if (result?.error?.line) { const t = setTimeout(() => setErrShown(true), 900); return () => clearTimeout(t); } setErrShown(false); }, [result]);

  // step → editor
  const step = trace?.steps?.[stepIdx];
  useEffect(() => { if (step && tab === 'steps') ed.current?.scrollToLine(step.line); }, [stepIdx, trace, tab]);
  useEffect(() => { if (linkRange) ed.current?.scrollToLine(linkRange[0]); }, [linkRange]);

  // keyboard: arrows to step
  useEffect(() => {
    const h = (e) => {
      if (tab !== 'steps' || !trace?.steps?.length) return;
      if (document.activeElement?.closest?.('.cm-editor, input, textarea')) return;
      if (e.key === 'ArrowRight') { setPlaying(false); setStepIdx((i) => Math.min(trace.steps.length - 1, i + 1)); }
      if (e.key === 'ArrowLeft') { setPlaying(false); setStepIdx((i) => Math.max(0, i - 1)); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); setPlaying(false); setStepIdx(e.key === 'Home' ? 0 : trace.steps.length - 1); }
    };
    addEventListener('keydown', h); return () => removeEventListener('keydown', h);
  }, [tab, trace]);

  // diff against the previous version of the SAME file: an earlier step, else the real file from the project
  const stepFile = stepSel != null ? L.steps[stepSel]?.file : null;
  const prevStepCode = useMemo(() => {
    if (stepSel == null) return null;
    for (let i = stepSel - 1; i >= 0; i--) if ((L.steps[i].file || '') === (stepFile || '')) return L.steps[i].code;
    const orig = (L.context?.key || []).find((k) => stepFile && (k.path === stepFile || k.path.endsWith('/' + stepFile) || stepFile.endsWith(k.path)));
    return orig ? orig.text : '';
  }, [stepSel, stepFile, L.steps, L.context]);
  const diff = useMemo(() => (stepSel != null ? addedLines(prevStepCode ?? '', code) : null), [stepSel, prevStepCode, code]);
  // TypeScript: real type errors, checked as you type (the whole point of TypeScript)
  const [typeErrs, setTypeErrs] = useState([]);
  const [typeEx, setTypeEx] = useState({});
  useEffect(() => {
    if (lang !== 'typescript' || !runnable) { setTypeErrs([]); return; }
    let live = true; const t = setTimeout(() => typeCheck(code).then((d) => live && setTypeErrs(d)), 550);
    return () => { live = false; clearTimeout(t); };
  }, [code, lang]);
  // pointing at something in a web page lights up the line that made it
  const [pageLine, setPageLine] = useState(null);
  useEffect(() => {
    if (lang !== 'html') return;
    const h = (e) => { if (e.data?.bentoPlay && e.data.k === 'hover') { setPageLine(e.data.line || null); if (e.data.line) ed.current?.scrollToLine(e.data.line); } };
    addEventListener('message', h); return () => removeEventListener('message', h);
  }, [lang]);
  const marks = useMemo(() => ({
    link: linkRange || noteRange || (twinHover ? twinHover.main : null) || (pageLine ? [pageLine, pageLine] : null),
    step: tab === 'steps' && step && !step.end ? step.line : null,
    err: errShown && result?.error?.line ? result.error : typeErrs[0] ? { line: typeErrs[0].line, msg: `Type error: ${typeErrs[0].msg}` } : null,
    diff,
  }), [linkRange, noteRange, twinHover, tab, step, errShown, result, diff, typeErrs, pageLine]);

  const explain = useCallback((word, lineText, o) => explainToken({ word, lineText, lineNo: o.lineNo, lang, doc: o.doc, english, model, quick, isMember: o.isMember }), [lang, english, model, quick]);

  // ---- twin language
  const twin = L.twin && L.twin.src === code ? L.twin : L.twin;
  const makeTwin = async () => {
    setLens('twin');
    if (L.twin && L.twin.src === code) return;
    setTwinBusy(true);
    try {
      const s = await quick(model, quickPrompts.twin({ code, from: LNAME[lang], to: LNAME[other(lang)] }));
      const j = parseJSONLoose(s);
      if (j?.code) onPatch({ twin: { lang: other(lang), code: j.code, map: j.map || [], src: code } });
    } finally { setTwinBusy(false); }
  };
  const mapTo = (line, dir) => {
    const m = (twin?.map || []).filter((p) => (dir ? p[0] : p[1]) === line).map((p) => (dir ? p[1] : p[0]));
    return m.length ? [Math.min(...m), Math.max(...m)] : null;
  };
  const switchToTwin = () => {
    if (!twin) return;
    const next = twin.code;
    onPatch({ lang: twin.lang, code: next, work: null, pseudo: [], pmap: {}, file: (L.file || 'main').replace(/\.\w+$/, twin.lang === 'python' ? '.py' : '.js'), twin: { lang, code, map: (twin.map || []).map(([a, b]) => [b, a]), src: next } });
    edited.current = false; setCode(next); setLens('code'); setResult(null); setTrace(null);
  };

  // ---- drag the stage divider
  const deskRef = useRef(null);
  const dragDiv = (e) => {
    e.preventDefault();
    const r = deskRef.current.getBoundingClientRect();
    const mv = (ev) => setSplit(Math.min(0.82, Math.max(0.22, (ev.clientY - r.top) / r.height)));
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  };

  // A freshly written example that crashes gets one quiet repair (never for challenges, where the bug is the point).
  const repairTried = useRef(new Set());
  useEffect(() => {
    if (streaming || L.status !== 'done' || !result?.error || edited.current || L.builtin || L.repaired) return;
    if (!['explain', 'idea'].includes(L.mode) || repairTried.current.has(L.id) || !L.code) return;
    if (/^Stopped/.test(result.error.msg || '')) return;
    repairTried.current.add(L.id);
    (async () => {
      try {
        const j = parseJSONLoose(await quick(model, quickPrompts.repair({ code: L.code, err: result.error.msg + (result.error.line ? ` (line ${result.error.line})` : ''), lang: LNAME[lang] })));
        if (!j?.code || j.code === L.code || edited.current) return;
        const same = j.code.split('\n').length === L.code.split('\n').length;
        onPatch({ code: j.code, pseudo: same ? L.pseudo : [], repaired: j.note || 'Fixed a small mistake in the example.' });
        setCode(j.code); setTimeout(() => doRun(j.code, { quiet: true }), 30);
      } catch {}
    })();
  }, [streaming, L.status, result, L.id]);

  // After a new lesson's code runs cleanly: check the lesson against what the code really did (free checks first,
  // then one small call to the fast model for the quizzes and claims). Fixes only what it can prove, and says so.
  const checkTried = useRef(new Set());
  useEffect(() => {
    if (streaming || L.status !== 'done' || !result || result.error || result.need || L.builtin || L.check || L.scratch || edited.current) return;
    if (!['explain', 'idea', 'build', 'feature'].includes(L.mode) || lang === 'html' || checkTried.current.has(L.id) || !L.code) return;
    if (localStorage.getItem('bento.check') === 'off') return;
    checkTried.current.add(L.id);
    const run = result;
    (async () => {
      const loc = localChecks(L); let cur = { ...L, ...loc.patch }; let corrections = []; let by = null;
      if (quick) { try { const j = parseJSONLoose(await quick(model, checkPrompt(cur, run))); if (j && (j.quizzes || j.fixes)) { const a = applyCheck(cur, j); cur = { ...cur, ...a.patch }; corrections = a.corrections; by = model; } } catch { /* the free checks still count */ } }
      if (lidRef.current !== L.id && !L.id) return;
      onPatch({ ...loc.patch, ...(corrections.length ? { story: cur.story } : {}), check: { at: Date.now(), local: loc.notes, corrections, by } });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, L.status, result, L.id]);

  const modified = L.code && code !== (stepSel != null ? L.steps[stepSel]?.code : L.code);
  // "You just used X": constructs in YOUR code (not in the lesson's original) that you haven't met yet, explained instantly
  const [spotOpen, setSpotOpen] = useState(null); const [spotSeen, setSpotSeen] = useState(() => new Set());
  const spotted = useMemo(() => {
    if (!(modified || L.scratch) || !['python', 'javascript', 'typescript'].includes(lang)) return [];
    const before = new Set(L.scratch ? [] : spotConstructs(L.code || '', lang).map((x) => x.id));
    return spotConstructs(code, lang).filter((x) => !before.has(x.id) && !spotSeen.has(x.id) && !knownWords?.has(x.name.toLowerCase())).slice(0, 3);
  }, [code, lang, modified, L.scratch, L.code, spotSeen, knownWords]);
  const [coach, setCoach] = useState(null);
  const [savedTo, setSavedTo] = useState(null);
  const [publish, setPublish] = useState(null); // { ask } | { busy } | { url } | { err }
  useEffect(() => setCoach(null), [L.id]);
  const explainChange = async () => {
    const before = stepSel != null ? L.steps[stepSel]?.code : L.code;
    setCoach({ loading: true });
    try {
      const out = document.querySelector('.console')?.innerText || '';
      const j = parseJSONLoose(await quick(model, quickPrompts.change({ before, after: codeRef.current, lang: LNAME[lang], output: out })));
      setCoach(j?.said ? j : { said: 'Couldn’t read that change. Try again in a moment.' });
    } catch { setCoach({ said: 'The model didn’t answer. Try again in a moment.' }); }
  };
  const fromRepo = (L.mode === 'code' && !!(L.context?.repo || L.context?.path)) || L.mode === 'compare';
  const runnable = L.mode !== 'feature' && !fromRepo;
  const fileLang = (n) => (/\.css$/.test(n) ? 'css' : /\.m?js$/.test(n) ? 'javascript' : /\.html?$/.test(n) ? 'html' : /\.py$/.test(n) ? 'python' : null);
  const edLang = multi && filesRef.current?.[fi] ? fileLang(filesRef.current[fi].name) || lang : lang === 'typescript' || /\.tsx?$/.test(L.file || L.context?.path || '') ? 'typescript' : lang;

  return (
    <div className="desk" ref={deskRef}>
      <div className="desk-head">
        <div className="file">
          <span className={`lang-dot ${lang}`} />
          <span className="fname">{stepFile || L.file || (lang === 'python' ? 'main.py' : 'main.js')}</span>{stepSel != null && <span className="newfile">{prevStepCode ? `+${diff?.size || 0} lines` : 'new file'}</span>}
          {onRemix && !L.scratch && runnable && !streaming && <button className="reset remix" title="Remix: copy this code into your own scratchpad" aria-label="Remix" onClick={() => onRemix(codeRef.current, lang)}>⎘</button>}
          {modified && <button className="reset" title="Back to the original" onClick={() => { const orig = stepSel != null ? L.steps[stepSel].code : L.code; edited.current = false; setCode(orig); onPatch({ work: null }); doRun(orig, { quiet: true }); }}>↺</button>}
        </div>
        <div className="lenses">
          {LENSES.map(([k, label, short]) => <button key={k} className={`lens ${lens === k ? 'on' : ''}`} title={t(label)} onClick={() => setLens(k)}><span className="ll">{t(label)}</span><span className="ls">{t(short)}</span>{k !== 'code' && pendingEnglish && !streaming && lens === k ? <span className="lens-spin" /> : null}</button>)}
          {runnable && L.mode !== 'code' && lang !== 'html' && <button className={`lens twin ${lens === 'twin' ? 'on' : ''}`} onClick={lens === 'twin' ? () => setLens('code') : makeTwin} title={`See this in ${LNAME[other(lang)]}`}>⇄ {other(lang) === 'python' ? 'Py' : 'JS'}</button>}
        </div>
        <div className="actions">
          {(modified || L.scratch) && !fromRepo && <button className="act coach-act" title="Explain what I changed (plain English)" onClick={explainChange}>✦ <span className="lbl">{t(L.scratch ? 'Explain' : 'Explain change')}</span></button>}
          {runnable && <button className={`live ${live ? 'on' : ''}`} onClick={() => setLive(!live)} title="Re-run as you type">live</button>}
          {runnable && lang !== 'html' && <button className="act" onClick={doTrace} title={`Step through: run one line at a time and watch every value change (${keys('⌘⇧↵')})`}><span className="act-i">⏵⏵</span><span className="lbl">{t('Step')}</span></button>}
          {lang === 'html' && window.bento?.saveWeb && <button className="act" title="Save as a real .html file on your Desktop" onClick={async () => { const f = await window.bento.saveWeb(projectBundle(codeRef.current).main, L.title); setSavedTo(f?.split('/').pop()); setTimeout(() => setSavedTo(null), 3000); }}>{savedTo ? `✓ ${savedTo}` : '⤓ ' + t('Save my page')}</button>}
          {lang === 'html' && window.bento?.publishWeb && <button className="act" title="Put this page on the web with your own GitHub account" onClick={() => setPublish({ ask: true })}>🌐 <span className="lbl">{t('Publish')}</span></button>}
          {runnable && <button className="act run" onClick={() => { setTab((t) => (t === 'steps' ? 'output' : t)); doRun(); }} title={`Run (${keys('⌘↵')})`}><span className="act-i">▶</span>{t('Run')}</button>}
        </div>
      </div>

      {(multi || (L.scratch && (lang === 'python' || lang === 'html'))) && (
        <div className="desk-files">
          {(filesRef.current || [{ name: L.file || (lang === 'python' ? 'main.py' : 'index.html') }]).map((f, i) => (
            <button key={f.name + i} className={`df-tab ${i === fi ? 'on' : ''}`} onClick={() => openFile(i)} title={i === 0 ? 'This file runs; the others are used by it' : f.name}>
              {i === 0 && <span className="df-main">▶</span>}{f.name}{i > 0 && <span className="df-x" onClick={(e) => { e.stopPropagation(); removeFile(i); }} aria-label="Remove file">×</span>}
            </button>
          ))}
          <button className="df-add" onClick={addFile} title="Add a file to this project">+ file</button>
        </div>
      )}
      {publish && (
        <div className="publish fade-in">
          {publish.ask && <><span>🌐 {t('This puts your page on the public web, in a repository called bento-pages on your GitHub account. Anyone with the link can see it.')}</span><button className="btn tiny" onClick={async () => { setPublish({ busy: true }); try { setPublish(await window.bento.publishWeb(projectBundle(codeRef.current).main, L.title || 'my page')); } catch (e) { setPublish({ err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); } }}>{t('Publish it')}</button><button className="link" onClick={() => setPublish(null)}>{t('Cancel')}</button></>}
          {publish.busy && <span><span className="lens-spin" /> {t('Publishing with your GitHub account…')}</span>}
          {publish.url && <><span>✓ {t('Published! It can take a minute to appear at')} <button className="link" onClick={() => window.bento?.openExternal?.(publish.url)}>{publish.url}</button></span><button className="link" onClick={() => setPublish(null)}>✕</button></>}
          {publish.err && <><span className="err-msg">{publish.err}</span><button className="link" onClick={() => setPublish(null)}>✕</button></>}
        </div>
      )}
      {L.repaired && !result?.error && <div className="repaired"><span>✓</span>Bento caught and fixed a mistake in this example: {L.repaired}<button className="ib" aria-label="Dismiss" onClick={() => onPatch({ repaired: null })}>✕</button></div>}
      {typeErrs.length > 0 && !(errShown && result?.error) && (
        <div className="typebar">
          <span className="tb-k">TypeScript found {typeErrs.length === 1 ? 'a problem' : `${typeErrs.length} problems`}</span>
          {typeErrs.map((d, i) => (
            <div key={i} className="tb-row">
              <button onClick={() => ed.current?.setCursorLine(d.line)}><b>line {d.line}</b> {d.msg}</button>
              <button className="tb-ex" onClick={async () => { setTypeEx((m) => ({ ...m, [d.msg]: '…' })); try { const j = parseJSONLoose(await quick(model, quickPrompts.error({ code, err: `TypeScript type error: ${d.msg} (line ${d.line})`, lang: 'TypeScript' }))); setTypeEx((m) => ({ ...m, [d.msg]: j ? `${j.plain}${j.fix ? ` Fix: ${j.fix}` : ''}` : 'Couldn’t explain this one.' })); } catch { setTypeEx((m) => ({ ...m, [d.msg]: 'The model didn’t answer.' })); } }}>explain</button>
              {typeEx[d.msg] && <div className="tb-plain">{typeEx[d.msg]}</div>}
            </div>
          ))}
          <span className="tb-note">The code still runs (types vanish when it runs), but TypeScript is warning you before it breaks.</span>
        </div>
      )}
      {spotted.length > 0 && !streaming && (
        <div className="spot">
          <span className="spot-h">✨ new in your code</span>
          {spotted.map((x) => <button key={x.id} className={`spot-chip ${spotOpen === x.id ? 'on' : ''}`} onClick={() => setSpotOpen(spotOpen === x.id ? null : x.id)}>{x.name}</button>)}
          {spotted.filter((x) => x.id === spotOpen).map((x) => (
            <div key={x.id} className="spot-card">
              <b>{x.name}</b> <span className="spot-line" onMouseEnter={() => setHoverLine?.(x.line)} onMouseLeave={() => setHoverLine?.(null)}>line {x.line}</span>
              <p>{x.plain}</p><p className="spot-like">≈ {x.like}</p>
              <div className="spot-act">{onWord && <button className="btn tiny" onClick={() => { onWord({ term: x.name, plain: x.plain, like: x.like }); setSpotSeen((s0) => new Set([...s0, x.id])); setSpotOpen(null); }}>+ Add to my words</button>}<button className="link" onClick={() => { setSpotSeen((s0) => new Set([...s0, x.id])); setSpotOpen(null); }}>Got it</button></div>
            </div>
          ))}
        </div>
      )}
      {coach && <div className="coach">{coach.loading ? <><span className="dots"><i /><i /><i /></span>reading your change…</> : <><span className="coach-ic">✦</span><span className="coach-t"><Md text={coach.said} />{coach.term && coach.plain && <span className="coach-term"><b>{coach.term}</b>: {coach.plain}</span>}</span><button className="ib" aria-label="Dismiss" onClick={() => setCoach(null)}>✕</button></>}</div>}
      {streaming && !code && !L.steps.length && (
        <div className="desk-wait"><div className="dw-lines">{[70, 46, 58, 0, 82, 40, 64].map((w, i) => (w ? <i key={i} style={{ width: `${w}%`, marginLeft: i % 3 === 2 ? 24 : 0, animationDelay: `${i * 90}ms` }} /> : <b key={i} />))}</div><span>The code appears here as soon as it’s written. Then you can run it, change it, and step through it.</span></div>
      )}
      <div className="desk-main" style={{ height: runnable ? `${split * 100}%` : '100%' }}>
        {lens === 'english' ? (
          <Interlinear code={code} english={english} hoverLine={hoverLine} setHoverLine={setHoverLine} step={marks.step}
            onPick={(n) => { setLens('code'); setTimeout(() => ed.current?.setCursorLine(n), 30); }} notes={L.notes} />
        ) : null}
        <div className="ed-row" style={{ display: lens === 'english' ? 'none' : 'flex' }}>
          <div className="ed-main">
            <Editor ref={ed} value={code} lang={edLang} onChange={onChange} marks={marks} lens={lens === 'twin' ? 'code' : lens} english={english}
              notes={lens === 'twin' ? [] : L.notes} onNoteHover={setNoteRange}
              hoverLine={hoverLine} onLineHover={(n) => { setHoverLine(n); if (lens === 'twin') setTwinHover(n ? { main: [n, n], twin: mapTo(n, true) } : null); }}
              onEnglishHover={(n) => setNoteRange(n ? [n, n] : null)} onEnglishClick={(n) => ed.current?.setCursorLine(n)}
              onRun={() => doRun()} onStep={doTrace} onScrub={() => {}} explain={explain} />
          </div>
          {lens === 'twin' && (
            <div className="ed-twin">
              <div className="twin-head"><span className={`lang-dot ${other(lang)}`} />{LNAME[other(lang)]}{twin && <button className="btn tiny" onClick={switchToTwin}>Make this the main code</button>}</div>
              {twinBusy || !twin ? <div className="twin-loading"><div className="shimmer" /><div className="shimmer short" /><div className="shimmer" /><span>Translating…</span></div> : (
                <Editor value={twin.code} lang={twin.lang} readOnly marks={{ link: twinHover?.twin || null }} lens="code"
                  onLineHover={(n) => setTwinHover(n ? { twin: [n, n], main: mapTo(n, false) } : null)}
                  explain={(word, lineText, o) => explainToken({ word, lineText, lineNo: o.lineNo, lang: twin.lang, doc: o.doc, model, quick, isMember: o.isMember })} />
              )}
            </div>
          )}
        </div>
      </div>
      {runnable && <div className="divider" onMouseDown={dragDiv}><span /></div>}
      {runnable && (
        <div className="desk-stage" style={{ height: `${(1 - split) * 100}%` }}>
          <Stage tab={tab} setTab={setTab} lesson={L} lang={lang} code={code} english={english}
            result={result} running={running} onRun={() => doRun()} pyReady={pyReady} live={liveLogs}
            stuck={stuck} onUnstick={() => { streak.current = { err: null, n: 0, tests: 0 }; setStuck(null); }} onStepThrough={() => doTrace()}
            onStuckHint={quick ? async () => { const j = parseJSONLoose(await quick(model, `A beginner is stuck on this ${LNAME[lang]} code${L.title ? ` (lesson: "${L.title}")` : ''}.\nCODE (with line numbers):\n${codeRef.current.split('\n').map((x, i) => `${i + 1}| ${x}`).join('\n').slice(0, 4000)}\n\n${stuck?.why === 'error' ? `It keeps failing with: ${stuck.err.msg}${stuck.err.line ? ` (line ${stuck.err.line})` : ''}` : `These tests keep failing: ${JSON.stringify((stuck?.failing || []).slice(0, 3).map((f) => ({ args: L.tests?.cases?.[f.i]?.args, want: L.tests?.cases?.[f.i]?.expect, got: f.got })))}`}\n\nGive ONE small hint that gets them unstuck WITHOUT writing the fix for them. Start with an everyday picture or analogy, then point at the exact line to look at. At most 55 words. Talk to them as "you".\nReply JSON: {"hint":"..."}`)); return j?.hint || 'Try stepping through it and watching the values change.'; } : null}
            onAnswer={(v) => { answersRef.current = [...answersRef.current, v]; doRun(codeRef.current, { keepAnswers: true, quiet: true }); }}
            onHoverLine={setNoteRange}
            onWhyDiff={L.mode === 'challenge' || lang === 'html' ? null : async (guess, actual) => {
              try { const j = parseJSONLoose(await quick(model, `A learner read this ${LNAME[lang]} code and predicted its output before running it.\nCODE:\n${code.slice(0, 4000)}\n\nTHEIR GUESS:\n${guess}\n\nACTUAL OUTPUT:\n${actual.slice(0, 1500)}\n\nTalking to them as "you", in at most 60 words, kindly explain the exact line or idea that makes the real output differ from the guess. Use \`code\` for code. Reply JSON: {"why":"..."}`)); return j?.why || 'Couldn’t explain this one.'; }
              catch (e) { return e.message; }
            }}
            onExplainError={async (err) => {
              try { const j = parseJSONLoose(await quick(model, quickPrompts.error({ code, err: err.msg + (err.line ? ` (line ${err.line})` : ''), lang: LNAME[lang] }))); return j || { plain: 'Could not explain this one.' }; }
              catch (e) { return { plain: e.message }; }
            }}
            trace={trace} tracing={tracing} stepIdx={stepIdx} setStepIdx={setStepIdx} playing={playing} setPlaying={setPlaying} onStep={doTrace}
            growth={growth} measuring={measuring} onMeasure={doMeasure}
            tests={tests} testing={testing} onRunTests={doTests} />
        </div>
      )}
      {fromRepo && <div className="recipe-foot repo-foot">{L.mode === 'compare' ? <>Real code from <b>{L.context?.a?.repo}</b> and <b>{L.context?.b?.repo}</b>.</> : <>Real code from <b>{L.file || L.context?.path}</b>{L.context?.repo ? <> in {L.context.repo}</> : null}.</>} Hover any word for a quick explanation; switch to Plain words to read it like a story.</div>}
      {(!runnable || L.mode === 'build') && L.steps.length > 0 && <div className="recipe-foot">Step {(stepSel ?? L.steps.length - 1) + 1} of {L.steps.length} · new lines are highlighted in green</div>}
    </div>
  );
});
export default Desk;

function Interlinear({ code, english, hoverLine, setHoverLine, onPick, step, notes }) {
  const lines = code.split('\n');
  const noteAt = new Map((notes || []).map((n) => [n.from, n]));
  return (
    <div className="interlinear">
      {lines.map((l, i) => {
        const e = english[i];
        const blank = !l.trim();
        if (blank) return <div key={i} className="il-gap" />;
        const indent = (l.match(/^\s*/)[0].length);
        const note = noteAt.get(i + 1);
        return (
          <div key={i} className={`il ${hoverLine === i + 1 ? 'hot' : ''} ${step === i + 1 ? 'step' : ''}`} onMouseEnter={() => setHoverLine(i + 1)} onMouseLeave={() => setHoverLine(null)} onClick={() => onPick(i + 1)}>
            <span className="il-n">{i + 1}</span>
            <div className="il-body" style={{ paddingLeft: Math.min(indent, 16) * 7 }}>
              <div className={`il-en ${e === null ? 'pending' : ''}`}>{e === null ? <span className="en-shimmer" /> : e || <span className="il-dim">—</span>}</div>
              <code className="il-code">{l.trim()}</code>
              {note && <div className="il-note"><b>{note.label}</b> {note.text}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
