// A lesson's code panel: the editor, the plain English beside each line, and what the code does (Stage.jsx) below
// it: its output and pictures, stepping through it line by line, how its time grows, and its tests. The work lives
// in hooks in src/ui/desk/; this file lays the panel out. LessonScreen and the agent reach it through its ref.
import {
  forwardRef,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from 'react';
import { spotConstructs } from '../constructs.js';
import { explainToken } from '../explain.js';
import { t } from '../i18n.js';
import { parseJSONLoose, quickPrompts } from '../lesson.js';
import { keys } from '../platform.js';
import { typeCheck } from '../runtime/runner.js';
import Editor from './Editor.jsx';
import Stage from './Stage.jsx';
import { Interlinear } from './desk/Interlinear.jsx';
import CoachCard from './desk/CoachCard.jsx';
import FileTabs from './desk/FileTabs.jsx';
import PublishPanel from './desk/PublishPanel.jsx';
import SpottedIdeas from './desk/SpottedIdeas.jsx';
import TypeErrors from './desk/TypeErrors.jsx';
import { haptic } from './touch.js';
import useDividers from './desk/useDividers.js';
import usePlainEnglish from './desk/usePlainEnglish.js';
import useDeskFiles from './desk/useDeskFiles.js';
import useDeskExecution from './desk/useDeskExecution.js';
import useTwin, { LNAME, other } from './desk/useTwin.js';
import useFactCheck from './desk/useFactCheck.js';
import useAutoRepair from './desk/useAutoRepair.js';

/** @type {Array<['code' | 'both' | 'english' | 'twin', string, string]>} */
const LENSES = [
  ['code', 'Code', 'Code'],
  ['both', 'Side by side', 'Both'],
  ['english', 'Plain words', 'Plain'],
]; // full and narrow labels

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

/**
 * @typedef {{
 *   lesson: import('../types/lesson').Lesson, onPatch: (change: Partial<import('../types/lesson').Lesson>) => void, quick: (model: string, prompt: string) => Promise<string>,
 *   model: string, linkRange?: [number, number] | null, stepSel?: number | null, onMastery?: (kind: string) => void,
 *   pyReady?: boolean, streaming?: boolean, onRemix?: (code: string, lang: string) => void,
 *   knownWords?: Set<string>, onWord?: (word: { term: string, plain: string, like?: string }) => void,
 *   phone?: boolean,
 *   noteFlash?: { from: number, at: number } | null,
 *   onResult?: (lessonId: string, result: any, src: string) => void,
 * }} DeskProps
 * @typedef {{ run: () => void, step: () => void, tests: () => void, setCode: (code: string) => void,
 *   getCode: () => string }} DeskHandle
 */
/** @type {import('react').ForwardRefExoticComponent<DeskProps & import('react').RefAttributes<DeskHandle>>} */
const Desk = forwardRef(function Desk(/** @type {DeskProps} */ props, ref) {
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
  const [lens, setLens] = useState(/** @type {'code' | 'english' | 'both' | 'twin'} */ ('code'));
  useEffect(() => {
    if (phone && lens === 'both') setLens('english');
  }, [phone, lens]);
  const [tab, setTab] = useState(lesson.tests ? 'tests' : 'output');
  const [hoverLine, setHoverLine] = useState(null);
  const [noteRange, setNoteRange] = useState(null);
  const [errShown, setErrShown] = useState(false);
  const [live, setLive] = useState(true);
  const { deskRef, dragDiv, split, touchDiv } = useDividers();
  const { english, englishAgain, englishAsked, pendingEnglish, setEnglishAgain, setPmapV } =
    usePlainEnglish({ code, lesson });
  const edited = useRef(false);
  const codeRef = useRef(code);
  codeRef.current = code;
  const { addFile, fi, filesRef, multi, openFile, projectBundle, removeFile, setFi } = useDeskFiles(
    { codeRef, edited, lang, lesson, onPatch, setCode },
  );
  const lidRef = useRef(lesson.id);
  // a lesson about a file from a real project (or two compared) shows its code but doesn't run it
  const fromRepo =
    (lesson.mode === 'code' && !!(lesson.context?.repo || lesson.context?.path)) ||
    lesson.mode === 'compare';
  const runnable = lesson.mode !== 'feature' && !fromRepo;
  const {
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
  } = useDeskExecution({
    codeRef,
    lang,
    lesson,
    lidRef,
    onMastery,
    projectBundle,
    props,
    pyReady,
    setTab,
  });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- everything resets when another lesson opens, not as this one changes
  }, [lesson.id]);
  // streaming: follow the model's code until the student edits
  useEffect(() => {
    if (!edited.current && lesson.code && lesson.code !== codeRef.current && stepSel == null)
      setCode(lesson.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the lesson's code as it streams in, unless you're viewing a step
  }, [lesson.code]);
  // recipe steps
  useEffect(() => {
    if (stepSel != null && lesson.steps[stepSel]) {
      setCode(lesson.steps[stepSel].code);
      edited.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads a step's code when you pick one, or when more steps stream in; not over your edits
  }, [stepSel, lesson.steps.length]);
  useEffect(() => {
    if (lesson.mode === 'build' && stepSel != null && lesson.steps[stepSel] && !streaming) {
      const c = lesson.steps[stepSel].code;
      const t = setTimeout(() => doRun(c, { quiet: true }), 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a build lesson's step runs once when you pick it (or when it finishes streaming), not again as you edit
  }, [stepSel, streaming, lesson.steps.length]);

  useEffect(() => {
    if (!pendingEnglish || streaming || !quick) return;
    const asked = englishAsked.current;
    if (asked.code !== code) {
      asked.code = code;
      asked.n = 0;
    }
    if (asked.n >= 2) return;
    const timer = setTimeout(async () => {
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
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asks for plain English after typing pauses; the lesson's other fields are read as they are then
  }, [pendingEnglish, code, streaming, englishAgain]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a lesson runs itself once when it opens, finishes streaming, or Python becomes ready
  }, [lesson.id, streaming, pyReady]);

  const saveTimer = useRef(null);
  const onChange = (value, scrub) => {
    edited.current = true;
    setCode(value);
    setErrShown(false);
    if (trace) {
      setTrace(null);
      setPlaying(false);
    }
    clearTimeout(liveTimer.current);
    if (scrub) {
      doRun(value, { quiet: true });
    } else if (
      live &&
      lesson.mode !== 'feature' &&
      lesson.mode !== 'code' &&
      lesson.mode !== 'compare'
    )
      liveTimer.current = setTimeout(
        () => doRun(value, { quiet: true, fromTyping: true }),
        lang === 'python' ? 520 : 380,
      );
    // your edit is saved once typing pauses (the timer lives in a ref: this function is new on every render)
    clearTimeout(saveTimer.current);
    if (filesRef.current) {
      filesRef.current = filesRef.current.map((f, i) => (i === fi ? { ...f, code: value } : f));
      saveTimer.current = setTimeout(() => onPatch({ files: filesRef.current }), 600);
    } else saveTimer.current = setTimeout(() => onPatch({ work: value }), 600);
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
  }, [step, tab]);
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
  }, [tab, trace, setPlaying, setStepIdx]);

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
    const timer = setTimeout(() => typeCheck(code).then((d) => live && setTypeErrs(d)), 550);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code, lang, runnable]);
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
  const { makeTwin, mapTo, setTwinHover, switchToTwin, twin, twinBusy, twinHover } = useTwin({
    code,
    edited,
    lang,
    lesson,
    model,
    onPatch,
    quick,
    setCode,
    setLens,
    setResult,
    setTrace,
  });
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

  // a crashing example gets one quiet repair; a clean first run gets the lesson checked against what the code did
  useAutoRepair({ doRun, edited, lang, lesson, model, onPatch, quick, result, setCode, streaming });
  useFactCheck({ edited, lang, lesson, lidRef, model, onPatch, quick, result, streaming });

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
      const out =
        /** @type {HTMLElement | null} */ (document.querySelector('.console'))?.innerText || '';
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
          {LENSES.filter(([lens]) => !(phone && lens === 'both')).map(([k, label, short]) => (
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
        <FileTabs
          addFile={addFile}
          fi={fi}
          filesRef={filesRef}
          lang={lang}
          lesson={lesson}
          openFile={openFile}
          removeFile={removeFile}
        />
      )}
      {publish && (
        <PublishPanel
          codeRef={codeRef}
          lesson={lesson}
          projectBundle={projectBundle}
          publish={publish}
          setPublish={setPublish}
        />
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
        <TypeErrors
          code={code}
          ed={ed}
          model={model}
          quick={quick}
          setTypeEx={setTypeEx}
          typeErrs={typeErrs}
          typeEx={typeEx}
        />
      )}
      {spotted.length > 0 && !streaming && (
        <SpottedIdeas
          onWord={onWord}
          setHoverLine={setHoverLine}
          setSpotOpen={setSpotOpen}
          setSpotSeen={setSpotSeen}
          spotOpen={spotOpen}
          spotted={spotted}
        />
      )}
      {coach && <CoachCard coach={coach} setCoach={setCoach} />}
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
