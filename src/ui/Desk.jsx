import { spotConstructs } from '../constructs.js';
import { t } from '../i18n.js';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { haptic } from './touch.js';
import { Md } from './Story.jsx';
import Editor from './Editor.jsx';
import Stage from './Stage.jsx';
import { run as runCode, typeCheck } from '../runtime/runner.js';
import { explainToken } from '../explain.js';
import { quickPrompts, parseJSONLoose } from '../lesson.js';
import { localChecks, checkPrompt, applyCheck } from '../verify.js';
import { keys } from '../platform.js';

const LENSES = [
  ['code', 'Code', 'Code'],
  ['both', 'Side by side', 'Both'],
  ['english', 'Plain words', 'Plain'],
]; // full and narrow labels
const other = (l) => (l === 'python' ? 'javascript' : 'python');
const LNAME = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
};

function addedLines(prev, cur) {
  if (prev == null) return null;
  const bag = new Map();
  prev.split('\n').forEach((l) => bag.set(l.trim(), (bag.get(l.trim()) || 0) + 1));
  const out = new Set();
  cur.split('\n').forEach((l, i) => {
    const k = l.trim();
    if (bag.get(k)) bag.set(k, bag.get(k) - 1);
    else if (k) out.add(i + 1);
  });
  return out;
}

const Desk = forwardRef(function Desk(props, ref) {
  const {
    lesson,
    onPatch,
    quick,
    model,
    linkRange,
    stepSel,
    onMastery,
    pyReady,
    streaming,
    onRemix,
    knownWords,
    onWord,
    phone,
  } = props;
  const lang = lesson.lang;
  // a phone shows code to read (a tap explains a word, a drag changes a number); Edit brings up the keyboard
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setEditing(false);
  }, [lesson.id]);
  const ed = useRef(null);
  const [code, setCode] = useState(lesson.work ?? lesson.code);
  const [lens, setLens] = useState('code');
  useEffect(() => {
    if (phone && lens === 'both') setLens('english');
  }, [phone, lens]);
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
  const [tab, setTab] = useState(lesson.tests ? 'tests' : 'output');
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
  const multi = Array.isArray(lesson.files) && lesson.files.length > 0;
  const filesRef = useRef(lesson.files || null);
  const [fi, setFi] = useState(0);
  const [, bumpFiles] = useState(0);
  const fiRef = useRef(0);
  fiRef.current = fi; // memoised callbacks read the open file through this
  const answersRef = useRef([]);
  const seedRef = useRef(Math.floor(Math.random() * 1e9));
  const [liveLogs, setLiveLogs] = useState([]);
  // stuck detector: the same error on three runs you asked for, or three failed test runs in a row
  const streak = useRef({ err: null, n: 0, tests: 0 });
  const [stuck, setStuck] = useState(null);
  const inflight = useRef(false),
    queued = useRef(null); // a run asked for during another one: the latest request's options
  const codeRef = useRef(code);
  codeRef.current = code;
  const lidRef = useRef(lesson.id);
  lidRef.current = lesson.id;

  // ---- reset when the lesson changes
  useEffect(() => {
    edited.current = lesson.work != null && lesson.work !== lesson.code;
    streak.current = { err: null, n: 0, tests: 0 };
    setStuck(null);
    answersRef.current = [];
    setLiveLogs([]);
    filesRef.current = lesson.files || null;
    setFi(0);
    setCode(lesson.files?.length ? lesson.files[0].code : (lesson.work ?? lesson.code));
    setResult(null);
    setTrace(null);
    setGrowth(null);
    setTests(null);
    setStepIdx(0);
    setPlaying(false);
    setTab(lesson.tests ? 'tests' : 'output');
    setLens(lesson.mode === 'code' || lesson.mode === 'compare' ? 'both' : 'code');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);
  // streaming: follow the model's code until the student edits
  useEffect(() => {
    if (!edited.current && lesson.code && lesson.code !== codeRef.current && stepSel == null)
      setCode(lesson.code);
  }, [lesson.code]);
  // recipe steps
  useEffect(() => {
    if (stepSel != null && lesson.steps[stepSel]) {
      setCode(lesson.steps[stepSel].code);
      edited.current = false;
    }
  }, [stepSel, lesson.steps.length]);
  useEffect(() => {
    if (lesson.mode === 'build' && stepSel != null && lesson.steps[stepSel] && !streaming) {
      const c = lesson.steps[stepSel].code;
      const t = setTimeout(() => doRun(c, { quiet: true }), 60);
      return () => clearTimeout(t);
    }
  }, [stepSel, streaming, lesson.steps.length]);

  // ---- plain-English map: line text → English, survives edits that keep a line intact
  const pmap = useMemo(() => {
    const m = new Map();
    const src = (lesson.code || '').split('\n');
    src.forEach((l, i) => {
      if (lesson.pseudo[i] != null) m.set(l.trim(), lesson.pseudo[i]);
    });
    Object.entries(lesson.pmap || {}).forEach(([k, v]) => m.set(k, v));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.code, lesson.pseudo, lesson.pmap, pmapV]);
  // a line still where the lesson wrote it keeps the lesson's own English for that spot (the same line can appear twice
  // with different jobs: `show(steps)` mid-search and at the end); edited or moved lines are matched by their text
  const english = useMemo(() => {
    const src = (lesson.code || '').split('\n');
    return code.split('\n').map((l, i) => {
      const k = l.trim();
      if (!k || /^[}\])]+[;,)]*$/.test(k)) return '';
      if (src[i] === l && lesson.pseudo[i] != null && String(lesson.pseudo[i]).trim())
        return lesson.pseudo[i];
      // a lesson from your own agent never has Bento ask your AI for the missing lines: they stay blank
      return pmap.has(k) ? pmap.get(k) : lesson.agent ? '' : null;
    });
  }, [code, pmap, lesson.code, lesson.pseudo, lesson.agent]);
  const pendingEnglish = english.some((x) => x === null);

  // lines without plain English get it from the fast model, by line number (so a skipped or merged line can't move the
  // rest onto the wrong code); lines it missed are asked for once more, then left blank rather than keep spending
  const englishAsked = useRef({ code: null, n: 0 });
  const [englishAgain, setEnglishAgain] = useState(0);
  useEffect(() => {
    if (!pendingEnglish || streaming || !quick) return;
    const asked = englishAsked.current;
    if (asked.code !== code) {
      asked.code = code;
      asked.n = 0;
    }
    if (asked.n >= 2) return;
    const t = setTimeout(async () => {
      const snapshot = code;
      const lines = snapshot.split('\n');
      const only = english.map((e, i) => (e === null ? i + 1 : 0)).filter(Boolean);
      const again = asked.n > 0;
      asked.n++;
      try {
        const got = parseJSONLoose(
          await quick(
            model,
            quickPrompts.pseudo({ code: snapshot, lang: LNAME[lang], only, again }),
          ),
        )?.lines;
        // keyed by line number; a plain list only counts if it has exactly one entry per line
        const at = (n) =>
          Array.isArray(got)
            ? got.length === lines.length
              ? got[n - 1]
              : undefined
            : got && typeof got === 'object'
              ? got[n]
              : undefined;
        const add = {};
        for (const n of only) {
          const v = at(n);
          if (v != null && typeof v !== 'object') add[lines[n - 1].trim()] = String(v);
        }
        if (Object.keys(add).length) {
          onPatch({ pmap: { ...(lesson.pmap || {}), ...add } });
          setPmapV((v) => v + 1);
        }
        if (only.some((n) => !(lines[n - 1].trim() in add))) setEnglishAgain((v) => v + 1);
      } catch {
        setEnglishAgain((v) => v + 1);
      }
    }, 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEnglish, code, streaming, englishAgain]);

  // a project runs as one thing: a web page gets its CSS and JS files stitched in; Python gets the other files next to it
  const projectBundle = (src) => {
    const fs = filesRef.current;
    if (!fs?.length) return { main: src, files: null };
    const all = fs.map((f, i) => (i === fiRef.current ? { ...f, code: src } : f));
    if (lang === 'html') {
      let main = all[0].code;
      const extra = [];
      for (const f of all.slice(1)) {
        const n = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (
          /\.css$/.test(f.name) &&
          new RegExp(`<link[^>]+href=["']\\.?/?${n}["'][^>]*>`, 'i').test(main)
        ) {
          main = main.replace(new RegExp(`<link[^>]+href=["']\\.?/?${n}["'][^>]*>`, 'i'), '');
          extra.push(`<style>\n${f.code}\n</style>`);
        }
        if (
          /\.js$/.test(f.name) &&
          new RegExp(`<script[^>]+src=["']\\.?/?${n}["'][^>]*>\\s*</script>`, 'i').test(main)
        ) {
          main = main.replace(
            new RegExp(`<script[^>]+src=["']\\.?/?${n}["'][^>]*>\\s*</script>`, 'i'),
            '',
          );
          extra.push(`<script>\n${f.code}\n</script>`);
        }
      }
      return { main: `${main}\n${extra.join('\n')}`, files: null }; // added at the end, so index.html keeps its line numbers
    }
    return { main: all[0].code, files: all.slice(1).map((f) => ({ name: f.name, code: f.code })) };
  };
  const openFile = (i) => {
    if (!filesRef.current) return;
    filesRef.current = filesRef.current.map((f, k) =>
      k === fi ? { ...f, code: codeRef.current } : f,
    );
    setFi(i);
    setCode(filesRef.current[i].code);
    edited.current = true;
  };
  const addFile = () => {
    const web = lang === 'html';
    const have = filesRef.current || [
      {
        name: lesson.file || (lang === 'python' ? 'main.py' : 'index.html'),
        code: codeRef.current,
      },
    ];
    const names = web
      ? ['style.css', 'script.js', 'page2.html', 'more.css']
      : ['helpers.py', 'data.py', 'utils.py', 'module4.py'];
    const name =
      names.find((n) => !have.some((f) => f.name === n)) ||
      `file${have.length + 1}${web ? '.js' : '.py'}`;
    const starter = name.endsWith('.css')
      ? '/* styles for your page */\nh1 { color: tomato; }\n'
      : name.endsWith('.js')
        ? '// code for your page\ndocument.querySelector("h1").addEventListener("click", () => alert("hi!"));\n'
        : name.endsWith('.py')
          ? `# ${name}: import it from ${have[0].name} with: from ${name.slice(0, -3)} import greet\ndef greet(who):\n    return f"Hello, {who}!"\n`
          : '<!doctype html>\n<h1>Another page</h1>\n';
    let files = [
      ...have.map((f, i) => (i === fi ? { ...f, code: codeRef.current } : f)),
      { name, code: starter },
    ];
    // link new CSS/JS files into the page so they work straight away
    if (web && /\.(css|js)$/.test(name)) {
      const tag = name.endsWith('.css')
        ? `<link rel="stylesheet" href="${name}">`
        : `<script src="${name}"></script>`;
      const m = files[0].code;
      files[0] = {
        ...files[0],
        code: /<\/body>/i.test(m) ? m.replace(/<\/body>/i, `  ${tag}\n</body>`) : `${m}\n${tag}`,
      };
    }
    filesRef.current = files;
    onPatch({ files });
    setFi(files.length - 1);
    setCode(starter);
    bumpFiles((x) => x + 1);
  };
  const removeFile = (i) => {
    if (!filesRef.current || i === 0) return;
    const files = filesRef.current.filter((_, k) => k !== i);
    filesRef.current = files;
    onPatch({ files });
    setFi(0);
    setCode(files[0].code);
  };

  // ---- running
  const doRun = useCallback(
    async (src = codeRef.current, opts = {}) => {
      if (!src.trim()) return;
      if (inflight.current) {
        queued.current = opts;
        return;
      }
      if (!opts.fromTyping) clearTimeout(liveTimer.current); // a run you asked for (or an answer) replaces the pending re-run
      if (!opts.keepAnswers) {
        answersRef.current = [];
        seedRef.current = Math.floor(Math.random() * 1e9);
      }
      inflight.current = true;
      setRunning(true);
      setLiveLogs([]);
      const mine = lidRef.current;
      const bundle = projectBundle(src);
      const r = await runCode(
        lang,
        'run',
        bundle.main,
        {
          key: lesson.id,
          answers: [...answersRef.current],
          seed: seedRef.current,
          files: bundle.files,
        },
        {
          onLive: (batch) => {
            if (lidRef.current === mine) setLiveLogs((l) => [...l, ...batch].slice(-400));
          },
        },
      );
      inflight.current = false;
      setRunning(false);
      if (lidRef.current !== mine) {
        queued.current = null;
        return;
      } // the learner moved to another lesson meanwhile
      setResult(r);
      props.onResult?.(mine, r, src);
      if (!opts.quiet) {
        const streakNow = streak.current;
        if (r.error) {
          streakNow.n = streakNow.err === r.error.msg ? streakNow.n + 1 : 1;
          streakNow.err = r.error.msg;
          if (streakNow.n >= 3) setStuck({ why: 'error', err: r.error });
        } else {
          streakNow.n = 0;
          streakNow.err = null;
          setStuck(null);
        }
      }
      if (!opts.quiet) {
        if (r.error)
          setTab((t) => (t === 'steps' || t === 'growth' || t === 'tests' ? t : 'output'));
      }
      if (!opts.quiet && r.error) haptic('warn'); // (a run you asked for that stopped on an error: you feel it before you read it)
      // then the one that waited, as asked: an answer typed meanwhile keeps the answers so far (it used to start over and ask again)
      if (queued.current) {
        const next = queued.current;
        queued.current = null;
        doRun(codeRef.current, { quiet: true, keepAnswers: !!next.keepAnswers });
      }
      onMastery?.('run');
    },
    [lang, onMastery],
  );

  const doTrace = useCallback(async () => {
    setTab('steps');
    setTracing(true);
    setPlaying(false);
    const bundle = projectBundle(codeRef.current);
    const r = await runCode(lang, 'trace', bundle.main, {
      answers: [...answersRef.current],
      seed: seedRef.current,
      files: bundle.files,
    });
    setTracing(false);
    setTrace(r);
    setStepIdx(0);
    if (r.steps?.length) setPlaying(true);
    onMastery?.('step');
  }, [lang, onMastery]);

  const doMeasure = useCallback(
    async (cfg) => {
      setTab('growth');
      setMeasuring(true);
      const calls = cfg.calls || [
        { label: (cfg.call || '').replace(/\(.*$/, '') || 'your function', call: cfg.call },
      ];
      const out = [];
      for (const c of calls) {
        const r = await runCode(lang, 'growth', codeRef.current, {
          setup: cfg.setup,
          call: c.call,
        });
        out.push({
          label: c.label,
          pts: r.growth?.pts || [],
          fit: r.growth?.fit,
          error: r.error?.msg,
        });
      }
      setGrowth(out);
      setMeasuring(false);
    },
    [lang],
  );

  // races start themselves once the runtime is ready
  useEffect(() => {
    if (lesson.race && lesson.growth && (lang !== 'python' || pyReady)) {
      const t = setTimeout(() => doMeasure(lesson.growth), 400);
      return () => clearTimeout(t);
    }
  }, [lesson.id, pyReady]);

  const doTests = useCallback(async () => {
    if (!lesson.tests) return;
    setTab('tests');
    setTesting(true);
    const r = await runCode(lang, 'tests', codeRef.current, {
      fn: lesson.tests.fn,
      cases: lesson.tests.cases,
    });
    setTesting(false);
    if (r.error) {
      haptic('warn');
      setResult(r);
      setTests(lesson.tests.cases.map(() => ({ ok: false, got: r.error.msg })));
      return;
    }
    setTests(r.tests);
    haptic(r.tests?.every((x) => x.ok) ? 'success' : 'warn');
    if (r.tests?.every((x) => x.ok)) {
      onMastery?.('challenge');
      streak.current.tests = 0;
      setStuck(null);
    } else if (++streak.current.tests >= 3)
      setStuck({
        why: 'tests',
        failing: r.tests.map((x, i) => (x.ok ? null : { i, got: x.got })).filter(Boolean),
      });
  }, [lesson.tests, lang, onMastery]);

  useImperativeHandle(ref, () => ({
    run: () => doRun(),
    step: doTrace,
    tests: doTests,
    setCode: (c) => {
      edited.current = true;
      setCode(c);
      onPatch({ work: c });
    },
    getCode: () => codeRef.current,
  }));

  // run once when a lesson is ready
  useEffect(() => {
    if (streaming || !lesson.code) return;
    if (lang === 'python' && !pyReady) return;
    if (lesson.mode === 'feature' || lesson.mode === 'code' || lesson.mode === 'compare') return;
    doRun(
      lesson.work ??
        (stepSel != null && lesson.steps[stepSel] ? lesson.steps[stepSel].code : lesson.code),
      {
        quiet: true,
      },
    ); // the lesson's own code: the editor may still hold the previous lesson's
    if (lesson.tests && (lesson.builtin !== true || lesson.puzzle)) doTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, streaming, pyReady]);

  // live re-run while typing (debounced)
  const liveTimer = useRef(null);
  const onChange = (v, scrub) => {
    edited.current = true;
    setCode(v);
    setErrShown(false);
    if (trace) {
      setTrace(null);
      setPlaying(false);
    }
    clearTimeout(liveTimer.current);
    if (scrub) {
      doRun(v, { quiet: true });
    } else if (
      live &&
      lesson.mode !== 'feature' &&
      lesson.mode !== 'code' &&
      lesson.mode !== 'compare'
    )
      liveTimer.current = setTimeout(
        () => doRun(v, { quiet: true, fromTyping: true }),
        lang === 'python' ? 520 : 380,
      );
    if (filesRef.current) {
      filesRef.current = filesRef.current.map((f, i) => (i === fi ? { ...f, code: v } : f));
      clearTimeout(onChange.save);
      onChange.save = setTimeout(() => onPatch({ files: filesRef.current }), 600);
    } else {
      clearTimeout(onChange.save);
      onChange.save = setTimeout(() => onPatch({ work: v }), 600);
    }
  };
  useEffect(() => {
    if (result?.error?.line) {
      const t = setTimeout(() => setErrShown(true), 900);
      return () => clearTimeout(t);
    }
    setErrShown(false);
  }, [result]);

  // step → editor
  const step = trace?.steps?.[stepIdx];
  useEffect(() => {
    if (step && tab === 'steps') ed.current?.scrollToLine(step.line);
  }, [stepIdx, trace, tab]);
  useEffect(() => {
    if (linkRange) ed.current?.scrollToLine(linkRange[0]);
  }, [linkRange]);

  // keyboard: arrows to step
  useEffect(() => {
    const onKey = (e) => {
      if (tab !== 'steps' || !trace?.steps?.length) return;
      if (document.activeElement?.closest?.('.cm-editor, input, textarea')) return;
      if (e.key === 'ArrowRight') {
        setPlaying(false);
        setStepIdx((i) => Math.min(trace.steps.length - 1, i + 1));
      }
      if (e.key === 'ArrowLeft') {
        setPlaying(false);
        setStepIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setPlaying(false);
        setStepIdx(e.key === 'Home' ? 0 : trace.steps.length - 1);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [tab, trace]);

  // diff against the previous version of the SAME file: an earlier step, else the real file from the project
  const stepFile = stepSel != null ? lesson.steps[stepSel]?.file : null;
  const prevStepCode = useMemo(() => {
    if (stepSel == null) return null;
    for (let i = stepSel - 1; i >= 0; i--)
      if ((lesson.steps[i].file || '') === (stepFile || '')) return lesson.steps[i].code;
    const orig = (lesson.context?.key || []).find(
      (k) =>
        stepFile &&
        (k.path === stepFile || k.path.endsWith('/' + stepFile) || stepFile.endsWith(k.path)),
    );
    return orig ? orig.text : '';
  }, [stepSel, stepFile, lesson.steps, lesson.context]);
  const diff = useMemo(
    () => (stepSel != null ? addedLines(prevStepCode ?? '', code) : null),
    [stepSel, prevStepCode, code],
  );
  // TypeScript: real type errors, checked as you type (the whole point of TypeScript)
  const [typeErrs, setTypeErrs] = useState([]);
  const [typeEx, setTypeEx] = useState({});
  useEffect(() => {
    if (lang !== 'typescript' || !runnable) {
      setTypeErrs([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => typeCheck(code).then((d) => live && setTypeErrs(d)), 550);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, lang]);
  // pointing at something in a web page lights up the line that made it
  const [pageLine, setPageLine] = useState(null);
  useEffect(() => {
    if (lang !== 'html') return;
    const h = (e) => {
      if (e.data?.bentoPlay && e.data.k === 'hover') {
        setPageLine(e.data.line || null);
        if (e.data.line) ed.current?.scrollToLine(e.data.line);
      }
    };
    addEventListener('message', h);
    return () => removeEventListener('message', h);
  }, [lang]);
  const marks = useMemo(
    () => ({
      link:
        linkRange ||
        noteRange ||
        (twinHover ? twinHover.main : null) ||
        (pageLine ? [pageLine, pageLine] : null),
      step: tab === 'steps' && step && !step.end ? step.line : null,
      err:
        errShown && result?.error?.line
          ? result.error
          : typeErrs[0]
            ? { line: typeErrs[0].line, msg: `Type error: ${typeErrs[0].msg}` }
            : null,
      diff,
    }),
    [linkRange, noteRange, twinHover, tab, step, errShown, result, diff, typeErrs, pageLine],
  );

  const explain = useCallback(
    (word, lineText, o) =>
      explainToken({
        word,
        lineText,
        lineNo: o.lineNo,
        lang,
        doc: o.doc,
        english,
        model,
        quick,
        isMember: o.isMember,
      }),
    [lang, english, model, quick],
  );

  // ---- twin language
  const twin = lesson.twin && lesson.twin.src === code ? lesson.twin : lesson.twin;
  const makeTwin = async () => {
    setLens('twin');
    if (lesson.twin && lesson.twin.src === code) return;
    setTwinBusy(true);
    try {
      const s = await quick(
        model,
        quickPrompts.twin({ code, from: LNAME[lang], to: LNAME[other(lang)] }),
      );
      const j = parseJSONLoose(s);
      if (j?.code)
        onPatch({ twin: { lang: other(lang), code: j.code, map: j.map || [], src: code } });
    } finally {
      setTwinBusy(false);
    }
  };
  const mapTo = (line, dir) => {
    const m = (twin?.map || [])
      .filter((p) => (dir ? p[0] : p[1]) === line)
      .map((p) => (dir ? p[1] : p[0]));
    return m.length ? [Math.min(...m), Math.max(...m)] : null;
  };
  const switchToTwin = () => {
    if (!twin) return;
    const next = twin.code;
    onPatch({
      lang: twin.lang,
      code: next,
      work: null,
      pseudo: [],
      pmap: {},
      file: (lesson.file || 'main').replace(/\.\w+$/, twin.lang === 'python' ? '.py' : '.js'),
      twin: { lang, code, map: (twin.map || []).map(([a, b]) => [b, a]), src: next },
    });
    edited.current = false;
    setCode(next);
    setLens('code');
    setResult(null);
    setTrace(null);
  };

  // ---- drag the stage divider
  const deskRef = useRef(null);
  const dragDiv = (e) => {
    e.preventDefault();
    const r = deskRef.current.getBoundingClientRect();
    const mv = (ev) => setSplit(Math.min(0.82, Math.max(0.22, (ev.clientY - r.top) / r.height)));
    const up = () => {
      removeEventListener('mousemove', mv);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', mv);
    addEventListener('mouseup', up);
  };
  // (with a finger: the bar follows it, and settles with a tick at the three sizes a phone wants: more code, even, more output)
  const touchDiv = (e) => {
    if (e.touches.length !== 1) return;
    const el = e.currentTarget;
    const r = deskRef.current.getBoundingClientRect();
    let y = e.touches[0].clientY;
    el.classList.add('held');
    haptic('light');
    const mv = (ev) => {
      ev.preventDefault();
      y = ev.touches[0].clientY;
      setSplit(Math.min(0.82, Math.max(0.22, (y - r.top) / r.height)));
    };
    const up = () => {
      el.classList.remove('held');
      el.removeEventListener('touchmove', mv);
      el.removeEventListener('touchend', up);
      el.removeEventListener('touchcancel', up);
      const f = (y - r.top) / r.height;
      const snap = [0.3, 0.56, 0.78].reduce((a, c) => (Math.abs(c - f) < Math.abs(a - f) ? c : a));
      deskRef.current.classList.add('settling');
      setSplit(snap);
      haptic('select');
      setTimeout(() => deskRef.current?.classList.remove('settling'), 420);
    };
    el.addEventListener('touchmove', mv, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
  };

  // A freshly written example that crashes gets one quiet repair (never for challenges, where the bug is the point).
  const repairTried = useRef(new Set());
  useEffect(() => {
    if (
      streaming ||
      lesson.status !== 'done' ||
      !result?.error ||
      edited.current ||
      lesson.builtin ||
      lesson.repaired ||
      lesson.agent
    )
      return; // (your agent is told the error and fixes its own)
    if (
      !['explain', 'idea'].includes(lesson.mode) ||
      repairTried.current.has(lesson.id) ||
      !lesson.code
    )
      return;
    if (/^Stopped/.test(result.error.msg || '')) return;
    repairTried.current.add(lesson.id);
    (async () => {
      try {
        const j = parseJSONLoose(
          await quick(
            model,
            quickPrompts.repair({
              code: lesson.code,
              err: result.error.msg + (result.error.line ? ` (line ${result.error.line})` : ''),
              lang: LNAME[lang],
            }),
          ),
        );
        if (!j?.code || j.code === lesson.code || edited.current) return;
        const same = j.code.split('\n').length === lesson.code.split('\n').length;
        onPatch({
          code: j.code,
          pseudo: same ? lesson.pseudo : [],
          repaired: j.note || 'Fixed a small mistake in the example.',
        });
        setCode(j.code);
        setTimeout(() => doRun(j.code, { quiet: true }), 30);
      } catch {}
    })();
  }, [streaming, lesson.status, result, lesson.id]);

  // After a new lesson's code runs cleanly: check the lesson against what the code really did (free checks first,
  // then one small call to the fast model for the quizzes and claims). Fixes only what it can prove, and says so.
  const checkTried = useRef(new Set());
  useEffect(() => {
    if (
      streaming ||
      lesson.status !== 'done' ||
      !result ||
      result.error ||
      result.need ||
      lesson.builtin ||
      lesson.check ||
      lesson.scratch ||
      lesson.agent ||
      edited.current
    )
      return;
    if (
      !['explain', 'idea', 'build', 'feature'].includes(lesson.mode) ||
      lang === 'html' ||
      checkTried.current.has(lesson.id) ||
      !lesson.code
    )
      return;
    if (localStorage.getItem('bento.check') === 'off') return;
    checkTried.current.add(lesson.id);
    const run = result;
    (async () => {
      const loc = localChecks(lesson);
      let cur = { ...lesson, ...loc.patch };
      let corrections = [];
      let by = null;
      if (quick) {
        try {
          const j = parseJSONLoose(await quick(model, checkPrompt(cur, run)));
          if (j && (j.quizzes || j.fixes)) {
            const a = applyCheck(cur, j);
            cur = { ...cur, ...a.patch };
            corrections = a.corrections;
            by = model;
          }
        } catch {
          /* the free checks still count */
        }
      }
      if (lidRef.current !== lesson.id && !lesson.id) return;
      onPatch({
        ...loc.patch,
        ...(corrections.length ? { story: cur.story } : {}),
        check: { at: Date.now(), local: loc.notes, corrections, by },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, lesson.status, result, lesson.id]);

  const modified =
    lesson.code && code !== (stepSel != null ? lesson.steps[stepSel]?.code : lesson.code);
  // "You just used X": constructs in YOUR code (not in the lesson's original) that you haven't met yet, explained instantly
  const [spotOpen, setSpotOpen] = useState(null);
  const [spotSeen, setSpotSeen] = useState(() => new Set());
  const spotted = useMemo(() => {
    if (!(modified || lesson.scratch) || !['python', 'javascript', 'typescript'].includes(lang))
      return [];
    const before = new Set(
      lesson.scratch ? [] : spotConstructs(lesson.code || '', lang).map((x) => x.id),
    );
    return spotConstructs(code, lang)
      .filter(
        (x) => !before.has(x.id) && !spotSeen.has(x.id) && !knownWords?.has(x.name.toLowerCase()),
      )
      .slice(0, 3);
  }, [code, lang, modified, lesson.scratch, lesson.code, spotSeen, knownWords]);
  const [coach, setCoach] = useState(null);
  const [savedTo, setSavedTo] = useState(null);
  const [publish, setPublish] = useState(null); // { ask } | { busy } | { url } | { err }
  useEffect(() => setCoach(null), [lesson.id]);
  const explainChange = async () => {
    const before = stepSel != null ? lesson.steps[stepSel]?.code : lesson.code;
    setCoach({ loading: true });
    try {
      const out = document.querySelector('.console')?.innerText || '';
      const j = parseJSONLoose(
        await quick(
          model,
          quickPrompts.change({ before, after: codeRef.current, lang: LNAME[lang], output: out }),
        ),
      );
      setCoach(j?.said ? j : { said: 'Couldn’t read that change. Try again in a moment.' });
    } catch {
      setCoach({ said: 'The model didn’t answer. Try again in a moment.' });
    }
  };
  const fromRepo =
    (lesson.mode === 'code' && !!(lesson.context?.repo || lesson.context?.path)) ||
    lesson.mode === 'compare';
  const runnable = lesson.mode !== 'feature' && !fromRepo;
  const fileLang = (n) =>
    /\.css$/.test(n)
      ? 'css'
      : /\.m?js$/.test(n)
        ? 'javascript'
        : /\.html?$/.test(n)
          ? 'html'
          : /\.py$/.test(n)
            ? 'python'
            : null;
  const edLang =
    multi && filesRef.current?.[fi]
      ? fileLang(filesRef.current[fi].name) || lang
      : lang === 'typescript' || /\.tsx?$/.test(lesson.file || lesson.context?.path || '')
        ? 'typescript'
        : lang;

  return (
    <div className="desk" ref={deskRef}>
      <div className="desk-head">
        <div className="file">
          <span className={`lang-dot ${lang}`} />
          <span className="fname">
            {stepFile || lesson.file || (lang === 'python' ? 'main.py' : 'main.js')}
          </span>
          {stepSel != null && (
            <span className="newfile">
              {prevStepCode ? `+${diff?.size || 0} lines` : 'new file'}
            </span>
          )}
          {onRemix && !lesson.scratch && runnable && !streaming && (
            <button
              className="reset remix"
              title="Remix: copy this code into your own scratchpad"
              aria-label="Remix"
              onClick={() => onRemix(codeRef.current, lang)}
            >
              ⎘
            </button>
          )}
          {modified && (
            <button
              className="reset"
              title="Back to the original"
              onClick={() => {
                const orig = stepSel != null ? lesson.steps[stepSel].code : lesson.code;
                edited.current = false;
                setCode(orig);
                onPatch({ work: null });
                doRun(orig, { quiet: true });
              }}
            >
              ↺
            </button>
          )}
        </div>
        <div className="lenses">
          {/* (a phone has no room for code and words side by side: Plain already puts each line's words over its code) */}
          {LENSES.filter(([k]) => !(phone && k === 'both')).map(([k, label, short]) => (
            <button
              key={k}
              className={`lens ${lens === k ? 'on' : ''}`}
              title={t(label)}
              onClick={() => setLens(k)}
            >
              <span className="ll">{t(label)}</span>
              <span className="ls">{t(short)}</span>
              {k !== 'code' && pendingEnglish && !streaming && lens === k ? (
                <span className="lens-spin" />
              ) : null}
            </button>
          ))}
          {runnable && lesson.mode !== 'code' && lang !== 'html' && (
            <button
              className={`lens twin ${lens === 'twin' ? 'on' : ''}`}
              onClick={lens === 'twin' ? () => setLens('code') : makeTwin}
              title={`See this in ${LNAME[other(lang)]}`}
            >
              ⇄ {other(lang) === 'python' ? 'Py' : 'JS'}
            </button>
          )}
        </div>
        <div className="actions">
          {(modified || lesson.scratch) && !fromRepo && (
            <button
              className="act coach-act"
              title="Explain what I changed (plain English)"
              aria-label={t(lesson.scratch ? 'Explain' : 'Explain change')}
              onClick={explainChange}
            >
              ✦ <span className="lbl">{t(lesson.scratch ? 'Explain' : 'Explain change')}</span>
            </button>
          )}
          {runnable && (
            <button
              className={`live ${live ? 'on' : ''}`}
              onClick={() => setLive(!live)}
              title="Re-run as you type"
            >
              live
            </button>
          )}
          {runnable && lang !== 'html' && (
            <button
              className="act step"
              onClick={doTrace}
              title={`Step through: run one line at a time and watch every value change (${keys('⌘⇧↵')})`}
            >
              <span className="act-i">⏵⏵</span>
              <span className="lbl">{t('Step')}</span>
            </button>
          )}
          {lang === 'html' && window.bento?.saveWeb && (
            <button
              className="act"
              title="Save as a real .html file on your Desktop"
              onClick={async () => {
                const f = await window.bento.saveWeb(
                  projectBundle(codeRef.current).main,
                  lesson.title,
                );
                setSavedTo(f?.split('/').pop());
                setTimeout(() => setSavedTo(null), 3000);
              }}
            >
              {savedTo ? `✓ ${savedTo}` : '⤓ ' + t('Save my page')}
            </button>
          )}
          {lang === 'html' && window.bento?.publishWeb && (
            <button
              className="act"
              title="Put this page on the web with your own GitHub account"
              onClick={() => setPublish({ ask: true })}
            >
              🌐 <span className="lbl">{t('Publish')}</span>
            </button>
          )}
          {phone && !streaming && (
            <button
              className={`act edit ${editing ? 'on' : ''}`}
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? t('Done') : t('Edit')}
            </button>
          )}
          {runnable && (
            <button
              className="act run"
              onClick={() => {
                haptic('light');
                setTab((t) => (t === 'steps' ? 'output' : t));
                doRun();
              }}
              title={`Run (${keys('⌘↵')})`}
            >
              <span className="act-i">▶</span>
              {t('Run')}
            </button>
          )}
        </div>
      </div>

      {(multi || (lesson.scratch && (lang === 'python' || lang === 'html'))) && (
        <div className="desk-files">
          {(
            filesRef.current || [
              { name: lesson.file || (lang === 'python' ? 'main.py' : 'index.html') },
            ]
          ).map((f, i) => (
            <button
              key={f.name + i}
              className={`df-tab ${i === fi ? 'on' : ''}`}
              onClick={() => openFile(i)}
              title={i === 0 ? 'This file runs; the others are used by it' : f.name}
            >
              {i === 0 && <span className="df-main">▶</span>}
              {f.name}
              {i > 0 && (
                <span
                  className="df-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  aria-label="Remove file"
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button className="df-add" onClick={addFile} title="Add a file to this project">
            + file
          </button>
        </div>
      )}
      {publish && (
        <div className="publish fade-in">
          {publish.ask && (
            <>
              <span>
                🌐{' '}
                {t(
                  'This puts your page on the public web, in a repository called bento-pages on your GitHub account. Anyone with the link can see it.',
                )}
              </span>
              <button
                className="btn tiny"
                onClick={async () => {
                  setPublish({ busy: true });
                  try {
                    setPublish(
                      await window.bento.publishWeb(
                        projectBundle(codeRef.current).main,
                        lesson.title || 'my page',
                      ),
                    );
                  } catch (e) {
                    setPublish({
                      err: String(e.message).replace(
                        /^Error invoking remote method '[^']+': (Error: )?/,
                        '',
                      ),
                    });
                  }
                }}
              >
                {t('Publish it')}
              </button>
              <button className="link" onClick={() => setPublish(null)}>
                {t('Cancel')}
              </button>
            </>
          )}
          {publish.busy && (
            <span>
              <span className="lens-spin" /> {t('Publishing with your GitHub account…')}
            </span>
          )}
          {publish.url && (
            <>
              <span>
                ✓ {t('Published! It can take a minute to appear at')}{' '}
                <button className="link" onClick={() => window.bento?.openExternal?.(publish.url)}>
                  {publish.url}
                </button>
              </span>
              <button className="link" onClick={() => setPublish(null)}>
                ✕
              </button>
            </>
          )}
          {publish.err && (
            <>
              <span className="err-msg">{publish.err}</span>
              <button className="link" onClick={() => setPublish(null)}>
                ✕
              </button>
            </>
          )}
        </div>
      )}
      {lesson.repaired && !result?.error && (
        <div className="repaired">
          <span>✓</span>Bento caught and fixed a mistake in this example: {lesson.repaired}
          <button className="ib" aria-label="Dismiss" onClick={() => onPatch({ repaired: null })}>
            ✕
          </button>
        </div>
      )}
      {typeErrs.length > 0 && !(errShown && result?.error) && (
        <div className="typebar">
          <span className="tb-k">
            TypeScript found {typeErrs.length === 1 ? 'a problem' : `${typeErrs.length} problems`}
          </span>
          {typeErrs.map((typeError, i) => (
            <div key={i} className="tb-row">
              <button onClick={() => ed.current?.setCursorLine(typeError.line)}>
                <b>line {typeError.line}</b> {typeError.msg}
              </button>
              <button
                className="tb-ex"
                onClick={async () => {
                  setTypeEx((m) => ({ ...m, [typeError.msg]: '…' }));
                  try {
                    const j = parseJSONLoose(
                      await quick(
                        model,
                        quickPrompts.error({
                          code,
                          err: `TypeScript type error: ${typeError.msg} (line ${typeError.line})`,
                          lang: 'TypeScript',
                        }),
                      ),
                    );
                    setTypeEx((m) => ({
                      ...m,
                      [typeError.msg]: j
                        ? `${j.plain}${j.fix ? ` Fix: ${j.fix}` : ''}`
                        : 'Couldn’t explain this one.',
                    }));
                  } catch {
                    setTypeEx((m) => ({ ...m, [typeError.msg]: 'The model didn’t answer.' }));
                  }
                }}
              >
                explain
              </button>
              {typeEx[typeError.msg] && <div className="tb-plain">{typeEx[typeError.msg]}</div>}
            </div>
          ))}
          <span className="tb-note">
            The code still runs (types vanish when it runs), but TypeScript is warning you before it
            breaks.
          </span>
        </div>
      )}
      {spotted.length > 0 && !streaming && (
        <div className="spot">
          <span className="spot-h">✨ new in your code</span>
          {spotted.map((x) => (
            <button
              key={x.id}
              className={`spot-chip ${spotOpen === x.id ? 'on' : ''}`}
              onClick={() => setSpotOpen(spotOpen === x.id ? null : x.id)}
            >
              {x.name}
            </button>
          ))}
          {spotted
            .filter((x) => x.id === spotOpen)
            .map((x) => (
              <div key={x.id} className="spot-card">
                <b>{x.name}</b>{' '}
                <span
                  className="spot-line"
                  onMouseEnter={() => setHoverLine?.(x.line)}
                  onMouseLeave={() => setHoverLine?.(null)}
                >
                  line {x.line}
                </span>
                <p>{x.plain}</p>
                <p className="spot-like">≈ {x.like}</p>
                <div className="spot-act">
                  {onWord && (
                    <button
                      className="btn tiny"
                      onClick={() => {
                        onWord({ term: x.name, plain: x.plain, like: x.like });
                        setSpotSeen((s0) => new Set([...s0, x.id]));
                        setSpotOpen(null);
                      }}
                    >
                      + Add to my words
                    </button>
                  )}
                  <button
                    className="link"
                    onClick={() => {
                      setSpotSeen((s0) => new Set([...s0, x.id]));
                      setSpotOpen(null);
                    }}
                  >
                    Got it
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {coach && (
        <div className="coach">
          {coach.loading ? (
            <>
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              reading your change…
            </>
          ) : (
            <>
              <span className="coach-ic">✦</span>
              <span className="coach-t">
                <Md text={coach.said} />
                {coach.term && coach.plain && (
                  <span className="coach-term">
                    <b>{coach.term}</b>: {coach.plain}
                  </span>
                )}
              </span>
              <button className="ib" aria-label="Dismiss" onClick={() => setCoach(null)}>
                ✕
              </button>
            </>
          )}
        </div>
      )}
      {streaming && !code && !lesson.steps.length && (
        <div className="desk-wait">
          <div className="dw-lines">
            {[70, 46, 58, 0, 82, 40, 64].map((w, i) =>
              w ? (
                <i
                  key={i}
                  style={{
                    width: `${w}%`,
                    marginLeft: i % 3 === 2 ? 24 : 0,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              ) : (
                <b key={i} />
              ),
            )}
          </div>
          <span>
            The code appears here as soon as it’s written. Then you can run it, change it, and step
            through it.
          </span>
        </div>
      )}
      <div className="desk-main" style={{ height: runnable ? `${split * 100}%` : '100%' }}>
        {lens === 'english' ? (
          <Interlinear
            code={code}
            english={english}
            hoverLine={hoverLine}
            setHoverLine={setHoverLine}
            step={marks.step}
            onPick={(n) => {
              setLens('code');
              setTimeout(() => ed.current?.setCursorLine(n), 30);
            }}
            notes={lesson.notes}
          />
        ) : null}
        <div className="ed-row" style={{ display: lens === 'english' ? 'none' : 'flex' }}>
          <div className="ed-main">
            <Editor
              ref={ed}
              value={code}
              lang={edLang}
              onChange={onChange}
              marks={marks}
              lens={lens === 'twin' ? 'code' : lens}
              english={english}
              notes={lens === 'twin' ? [] : lesson.notes}
              onNoteHover={setNoteRange}
              openNoteAt={props.noteFlash}
              hoverLine={hoverLine}
              onLineHover={(n) => {
                setHoverLine(n);
                if (lens === 'twin')
                  setTwinHover(n ? { main: [n, n], twin: mapTo(n, true) } : null);
              }}
              onEnglishHover={(n) => setNoteRange(n ? [n, n] : null)}
              onEnglishClick={(n) => ed.current?.setCursorLine(n)}
              onRun={() => doRun()}
              onStep={doTrace}
              onScrub={() => {}}
              explain={explain}
              touch={!!phone}
              reading={!!phone && !editing}
            />
          </div>
          {lens === 'twin' && (
            <div className="ed-twin">
              <div className="twin-head">
                <span className={`lang-dot ${other(lang)}`} />
                {LNAME[other(lang)]}
                {twin && (
                  <button className="btn tiny" onClick={switchToTwin}>
                    Make this the main code
                  </button>
                )}
              </div>
              {twinBusy || !twin ? (
                <div className="twin-loading">
                  <div className="shimmer" />
                  <div className="shimmer short" />
                  <div className="shimmer" />
                  <span>Translating…</span>
                </div>
              ) : (
                <Editor
                  value={twin.code}
                  lang={twin.lang}
                  readOnly
                  marks={{ link: twinHover?.twin || null }}
                  lens="code"
                  onLineHover={(n) =>
                    setTwinHover(n ? { twin: [n, n], main: mapTo(n, false) } : null)
                  }
                  explain={(word, lineText, o) =>
                    explainToken({
                      word,
                      lineText,
                      lineNo: o.lineNo,
                      lang: twin.lang,
                      doc: o.doc,
                      model,
                      quick,
                      isMember: o.isMember,
                    })
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
      {runnable && (
        <div className="divider" onMouseDown={dragDiv} onTouchStart={touchDiv}>
          <span />
        </div>
      )}
      {runnable && (
        <div className="desk-stage" style={{ height: `${(1 - split) * 100}%` }}>
          <Stage
            tab={tab}
            setTab={setTab}
            lesson={lesson}
            lang={lang}
            code={code}
            english={english}
            result={result}
            running={running}
            onRun={() => doRun()}
            pyReady={pyReady}
            live={liveLogs}
            stuck={stuck}
            onUnstick={() => {
              streak.current = { err: null, n: 0, tests: 0 };
              setStuck(null);
            }}
            onStepThrough={() => doTrace()}
            onStuckHint={
              quick
                ? async () => {
                    const j = parseJSONLoose(
                      await quick(
                        model,
                        `A beginner is stuck on this ${LNAME[lang]} code${lesson.title ? ` (lesson: "${lesson.title}")` : ''}.\nCODE (with line numbers):\n${codeRef.current
                          .split('\n')
                          .map((x, i) => `${i + 1}| ${x}`)
                          .join('\n')
                          .slice(
                            0,
                            4000,
                          )}\n\n${stuck?.why === 'error' ? `It keeps failing with: ${stuck.err.msg}${stuck.err.line ? ` (line ${stuck.err.line})` : ''}` : `These tests keep failing: ${JSON.stringify((stuck?.failing || []).slice(0, 3).map((f) => ({ args: lesson.tests?.cases?.[f.i]?.args, want: lesson.tests?.cases?.[f.i]?.expect, got: f.got })))}`}\n\nGive ONE small hint that gets them unstuck WITHOUT writing the fix for them. Start with an everyday picture or analogy, then point at the exact line to look at. At most 55 words. Talk to them as "you".\nReply JSON: {"hint":"..."}`,
                      ),
                    );
                    return j?.hint || 'Try stepping through it and watching the values change.';
                  }
                : null
            }
            onAnswer={(v) => {
              answersRef.current = [...answersRef.current, v];
              doRun(codeRef.current, { keepAnswers: true, quiet: true });
            }}
            onHoverLine={setNoteRange}
            onWhyDiff={
              lesson.mode === 'challenge' || lang === 'html'
                ? null
                : async (guess, actual) => {
                    try {
                      const j = parseJSONLoose(
                        await quick(
                          model,
                          `A learner read this ${LNAME[lang]} code and predicted its output before running it.\nCODE:\n${code.slice(0, 4000)}\n\nTHEIR GUESS:\n${guess}\n\nACTUAL OUTPUT:\n${actual.slice(0, 1500)}\n\nTalking to them as "you", in at most 60 words, kindly explain the exact line or idea that makes the real output differ from the guess. Use \`code\` for code. Reply JSON: {"why":"..."}`,
                        ),
                      );
                      return j?.why || 'Couldn’t explain this one.';
                    } catch (e) {
                      return e.message;
                    }
                  }
            }
            onExplainError={async (err) => {
              try {
                const j = parseJSONLoose(
                  await quick(
                    model,
                    quickPrompts.error({
                      code,
                      err: err.msg + (err.line ? ` (line ${err.line})` : ''),
                      lang: LNAME[lang],
                    }),
                  ),
                );
                return j || { plain: 'Could not explain this one.' };
              } catch (e) {
                return { plain: e.message };
              }
            }}
            trace={trace}
            tracing={tracing}
            stepIdx={stepIdx}
            setStepIdx={setStepIdx}
            playing={playing}
            setPlaying={setPlaying}
            onStep={doTrace}
            growth={growth}
            measuring={measuring}
            onMeasure={doMeasure}
            tests={tests}
            testing={testing}
            onRunTests={doTests}
          />
        </div>
      )}
      {fromRepo && (
        <div className="recipe-foot repo-foot">
          {lesson.mode === 'compare' ? (
            <>
              Real code from <b>{lesson.context?.a?.repo}</b> and <b>{lesson.context?.b?.repo}</b>.
            </>
          ) : (
            <>
              Real code from <b>{lesson.file || lesson.context?.path}</b>
              {lesson.context?.repo ? <> in {lesson.context.repo}</> : null}.
            </>
          )}{' '}
          Hover any word for a quick explanation; switch to Plain words to read it like a story.
        </div>
      )}
      {(!runnable || lesson.mode === 'build') && lesson.steps.length > 0 && (
        <div className="recipe-foot">
          Step {(stepSel ?? lesson.steps.length - 1) + 1} of {lesson.steps.length} · new lines are
          highlighted in green
        </div>
      )}
    </div>
  );
});
export default Desk;

function Interlinear({ code, english, hoverLine, setHoverLine, onPick, step, notes }) {
  const lines = code.split('\n');
  const noteAt = new Map((notes || []).map((n) => [n.from, n]));
  return (
    <div className="interlinear">
      {lines.map((line, i) => {
        const e = english[i];
        const blank = !line.trim();
        if (blank) return <div key={i} className="il-gap" />;
        const indent = line.match(/^\s*/)[0].length;
        const note = noteAt.get(i + 1);
        return (
          <div
            key={i}
            className={`il ${hoverLine === i + 1 ? 'hot' : ''} ${step === i + 1 ? 'step' : ''}`}
            onMouseEnter={() => setHoverLine(i + 1)}
            onMouseLeave={() => setHoverLine(null)}
            onClick={() => onPick(i + 1)}
          >
            <span className="il-n">{i + 1}</span>
            <div className="il-body" style={{ paddingLeft: Math.min(indent, 16) * 7 }}>
              <div className={`il-en ${e === null ? 'pending' : ''}`}>
                {e === null ? (
                  <span className="en-shimmer" />
                ) : (
                  e || <span className="il-dim">—</span>
                )}
              </div>
              <code className="il-code">{line.trim()}</code>
              {note && (
                <div className="il-note">
                  <b>{note.label}</b> {note.text}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
