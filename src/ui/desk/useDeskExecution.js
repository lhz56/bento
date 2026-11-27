// Running the lesson's code, four ways: run it (with live output, and again as you type), trace it step by step,
// measure how its time grows (Big-O), and run its tests. A result that arrives after you moved to another lesson is
// dropped. A run waits for the one before it; streak and stuck notice when you keep hitting the same error.
import { useState, useRef, useEffect } from 'react';
import { run as runCode } from '../../runtime/runner.js';
import { haptic } from '../touch.js';

export default function useDeskExecution({
  codeRef,
  lang,
  lesson,
  lidRef,
  onMastery,
  projectBundle,
  props,
  pyReady,
  setTab,
}) {
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
  const answersRef = useRef([]);
  const seedRef = useRef(Math.floor(Math.random() * 1e9));
  const [liveLogs, setLiveLogs] = useState([]);
  // stuck detector: the same error on three runs you asked for, or three failed test runs in a row
  const streak = useRef({ err: null, n: 0, tests: 0 });
  const [stuck, setStuck] = useState(null);
  const inflight = useRef(false),
    queued = useRef(null); // a run asked for during another one: the latest request's options
  // ---- running
  // These are rebuilt on every render (onMastery and onResult come from the parent as new functions each time), so
  // they always see the current lesson; whether a result still belongs to it is checked against lidRef.
  const doRun = async (src = codeRef.current, opts = {}) => {
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
    const result = await runCode(
      lang,
      'run',
      bundle.main,
      {
        key: mine,
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
    setResult(result);
    props.onResult?.(mine, result, src);
    if (!opts.quiet) {
      const streakNow = streak.current;
      if (result.error) {
        streakNow.n = streakNow.err === result.error.msg ? streakNow.n + 1 : 1;
        streakNow.err = result.error.msg;
        if (streakNow.n >= 3) setStuck({ why: 'error', err: result.error });
      } else {
        streakNow.n = 0;
        streakNow.err = null;
        setStuck(null);
      }
    }
    if (!opts.quiet) {
      if (result.error)
        setTab((t) => (t === 'steps' || t === 'growth' || t === 'tests' ? t : 'output'));
    }
    if (!opts.quiet && result.error) haptic('warn'); // (a run you asked for that stopped on an error: you feel it before you read it)
    // then the one that waited, as asked: an answer typed meanwhile keeps the answers so far (it used to start over and ask again)
    if (queued.current) {
      const next = queued.current;
      queued.current = null;
      doRun(codeRef.current, { quiet: true, keepAnswers: !!next.keepAnswers });
    }
    onMastery?.('run');
  };
  const doTrace = async () => {
    setTab('steps');
    setTracing(true);
    setPlaying(false);
    const mine = lidRef.current;
    const bundle = projectBundle(codeRef.current);
    const result = await runCode(lang, 'trace', bundle.main, {
      answers: [...answersRef.current],
      seed: seedRef.current,
      files: bundle.files,
    });
    setTracing(false);
    if (lidRef.current !== mine) return; // the learner moved to another lesson meanwhile
    setTrace(result);
    setStepIdx(0);
    if (result.steps?.length) setPlaying(true);
    onMastery?.('step');
  };
  const doMeasure = async (cfg) => {
    setTab('growth');
    setMeasuring(true);
    const mine = lidRef.current;
    const calls = cfg.calls || [
      { label: (cfg.call || '').replace(/\(.*$/, '') || 'your function', call: cfg.call },
    ];
    const out = [];
    for (const call of calls) {
      const result = await runCode(lang, 'growth', codeRef.current, {
        setup: cfg.setup,
        call: call.call,
      });
      out.push({
        label: call.label,
        pts: result.growth?.pts || [],
        fit: result.growth?.fit,
        error: result.error?.msg,
      });
    }
    setMeasuring(false);
    if (lidRef.current !== mine) return;
    setGrowth(out);
  };
  // races start themselves once the runtime is ready
  useEffect(() => {
    if (lesson.race && lesson.growth && (lang !== 'python' || pyReady)) {
      const t = setTimeout(() => doMeasure(lesson.growth), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a race starts itself once per lesson, when Python is ready, not again on every edit
  }, [lesson.id, pyReady]);
  const doTests = async () => {
    if (!lesson.tests) return;
    setTab('tests');
    setTesting(true);
    const mine = lidRef.current;
    const result = await runCode(lang, 'tests', codeRef.current, {
      fn: lesson.tests.fn,
      cases: lesson.tests.cases,
    });
    setTesting(false);
    if (lidRef.current !== mine) return; // a pass must not count for the lesson you moved to
    if (result.error) {
      haptic('warn');
      setResult(result);
      setTests(lesson.tests.cases.map(() => ({ ok: false, got: result.error.msg })));
      return;
    }
    setTests(result.tests);
    haptic(result.tests?.every((x) => x.ok) ? 'success' : 'warn');
    if (result.tests?.every((x) => x.ok)) {
      onMastery?.('challenge');
      streak.current.tests = 0;
      setStuck(null);
    } else if (++streak.current.tests >= 3)
      setStuck({
        why: 'tests',
        failing: result.tests.map((x, i) => (x.ok ? null : { i, got: x.got })).filter(Boolean),
      });
  };
  // live re-run while typing (debounced)
  const liveTimer = useRef(null);
  return {
    answersRef,
    doMeasure,
    doRun,
    doTests,
    doTrace,
    growth,
    liveLogs,
    liveTimer,
    measuring,
    playing,
    result,
    running,
    setGrowth,
    setLiveLogs,
    setPlaying,
    setResult,
    setStepIdx,
    setStuck,
    setTests,
    setTrace,
    stepIdx,
    streak,
    stuck,
    testing,
    tests,
    trace,
    tracing,
  };
}
