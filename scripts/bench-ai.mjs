// How well each AI model does Bento's real jobs, and how good its lessons are, measured in the real app (hidden, a
// throwaway profile each time). This uses your real AI plans: it's for deciding which models Bento offers and
// recommends, and for catching a model (or a change to Bento) that makes lessons worse. Not for CI.
//
//   npx vite build && node scripts/bench-ai.mjs                        every model whose AI is signed in, then graded
//   node scripts/bench-ai.mjs --models antigravity:flash,claude:haiku  only these
//   node scripts/bench-ai.mjs --no-judge                               skip the grading (structure only)
//   node scripts/bench-ai.mjs --judge docs/benchmarks/ai-<day>.json    grade a saved run again (no new lessons)
//   node scripts/bench-ai.mjs --rescore docs/benchmarks/ai-<day>.json  recompute structure scores (no requests)
//   node scripts/bench-ai.mjs --compare docs/benchmarks/baseline.json  after the run: fail if any model got worse
//   node scripts/bench-ai.mjs --save-baseline                          keep this run as the baseline to compare with
//   node scripts/bench-ai.mjs --pretend                                a free dry run with pretend AIs (checks this script)
//
// For each model, in its own app with every other AI hidden (so Bento can't quietly hand a failure to another one):
//   lessons  six questions: a concept with a picture, an algorithm, a web page, a complete beginner, an engineer, and
//            JavaScript. Structure (out of 100): written in full, its code runs or the page is complete, few
//            corrections from Bento's own check, plain-English lines that match the code, a quiz, new words, margin
//            notes, enough explanation. Plus measured habits: paragraph length, links into the code, pictures drawn,
//            code size.
//   grade    two graders from different companies (Claude Sonnet and Gemini Flash by default; --judges to change)
//            read each lesson blind, with what its code really printed, and score it 1–5 on: correct, clear for the
//            level, visual, code, teaching, overall. Quality is the average, out of 100.
//   answer   a question asked inside a lesson (the AI's fast model): a short answer, two follow-ups, a check.
//   path     "Make your own path" (the fast model too): six to nine stops, each one a lesson.
// Results go to docs/benchmarks/ai-<day>.json and .md; the lessons themselves to lessons-<day>.json (for grading again).
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pseudoFits } from '../src/verify.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CAT = require('../electron/ai-catalog.json');
const P = require('../electron/providers.cjs');
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const flag = (k) => process.argv.includes(k);
const packaged = flag('--packaged');
const pretend = flag('--pretend'); // pretend AIs: costs nothing, checks the benchmark itself
const FAKE = path.join(root, 'test/fixtures/fake-ai.mjs');
function packagedApp() {
  const rel = process.env.BENTO_RELEASE_DIR || path.join(root, 'release');
  const d = (fs.existsSync(rel) ? fs.readdirSync(rel) : []).find(
    (x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app')),
  );
  return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento');
}
const exe = packaged ? packagedApp() : require('electron');
const AI_IDS = CAT.providers.map((p) => p.id);
const STARTED = new Date().toISOString(); // a run is filed under the day it started, even if it ends after midnight
const DOCS = path.join(root, 'docs', 'benchmarks');

const LESSONS = [
  {
    id: 'picture',
    q: 'What is recursion? Show it with a picture.',
    lang: 'python',
    level: 'student',
  },
  {
    id: 'algorithm',
    q: 'How does binary search find a number so fast?',
    lang: 'python',
    level: 'student',
  },
  {
    id: 'webpage',
    q: 'Make a tiny web page with a button that counts clicks.',
    lang: 'html',
    level: 'student',
  },
  {
    id: 'beginner',
    q: 'What is a variable? I have never written code before.',
    lang: 'python',
    level: 'kid',
  },
  {
    id: 'engineer',
    q: 'How does consistent hashing spread keys across servers, and what moves when a server is added?',
    lang: 'python',
    level: 'engineer',
  },
  {
    id: 'javascript',
    q: 'How do promises and async/await work in JavaScript?',
    lang: 'javascript',
    level: 'student',
  },
];
const LEVEL_NAME = {
  kid: 'complete beginner (has never coded)',
  student: 'student (knows a little)',
  engineer: 'working engineer',
};
const QUESTION = 'Why is that faster than checking every item one by one?';
const GOAL = 'learn SQL for a small online shop';
const JUDGES = (arg('--judges') || 'claude:sonnet,antigravity:flash').split(',');
const PER_JUDGE = +(arg('--per-judge') || 2); // grades at once, per grader
const OUT = arg('--out') ? path.resolve(arg('--out')) : null; // where the report goes (default docs/benchmarks)

// ---------------------------------------------------------------- one app, one AI
async function launch(prov, model) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-bench-'));
  fs.writeFileSync(
    path.join(profile, 'bento-store.json'),
    JSON.stringify({
      'bento.settings': {
        onboarded: true,
        model,
        lang: 'python',
        level: 'student',
        voice: 'English',
      },
    }),
  );
  // every other AI hidden, so nothing falls back to it; GitHub stays visible for Copilot (it lends Copilot its sign-in)
  const hide = prov
    ? [...AI_IDS.filter((x) => x !== prov), ...(prov === 'copilot' ? [] : ['gh'])].join(',')
    : ''; // no AI given: nothing hidden (to see which are here)
  const env = {
    ...process.env,
    BENTO_HIDDEN: '1',
    BENTO_USERDATA: profile,
    BENTO_PRETEND_MISSING: hide,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BENTO_DEV;
  delete env.BENTO_FAKE_AI;
  delete env.BENTO_NO_GH;
  if (pretend)
    Object.assign(env, {
      BENTO_FAKE_AI: FAKE,
      BENTO_FAKE_AS: AI_IDS.join(','),
      BENTO_NO_GH: '1',
      FAKE_AI_THINK_MS: '300',
      FAKE_AI_STEP_MS: '15',
    });
  const app = await electron.launch({
    executablePath: exe,
    args: packaged ? [] : [root],
    env,
    timeout: 90000,
  });
  const p = await app.firstWindow();
  await p.waitForSelector('.side', { timeout: 60000 });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  );
  await p.evaluate(() => {
    for (const k of ['lesson', 'home', 'path', 'atlas', 'desk'])
      localStorage.setItem(`bento.coach.${k}`, '1');
  });
  return {
    app,
    p,
    close: async () => {
      await app.close();
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}
const lessonOf = (p, lid) =>
  p.evaluate(
    (lid) =>
      JSON.parse(localStorage.getItem('bento.lessons') || '[]').find((l) => l.id === lid) || null,
    lid,
  );
// the plain English the learner sees beside each code line, the way the Desk builds it (null: none yet)
const englishOf = (L) => {
  const m = new Map();
  const src = (L.code || '').split('\n');
  src.forEach((l, i) => {
    if (L.pseudo?.[i] != null) m.set(l.trim(), L.pseudo[i]);
  });
  for (const [k, v] of Object.entries(L.pmap || {})) m.set(k, v);
  return src.map((l, i) => {
    const k = l.trim();
    return !k || /^[}\])]+[;,)]*$/.test(k)
      ? ''
      : L.pseudo?.[i] != null && String(L.pseudo[i]).trim()
        ? L.pseudo[i]
        : m.has(k)
          ? m.get(k)
          : null;
  });
};
const words = (s) =>
  String(s || '')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .split(/\s+/)
    .filter(Boolean).length;

// ---------------------------------------------------------------- a lesson, scored
async function lesson(p, model, L) {
  const t0 = Date.now();
  const lid = await p.evaluate(
    ([q, o]) => window.__ask(q, o),
    [L.q, { model, lang: L.lang, level: L.level }],
  );
  let first = null,
    cur = null;
  while (Date.now() - t0 < 480000) {
    // writing: up to 8 minutes
    cur = await lessonOf(p, lid);
    if (!first && cur && ((cur.story || []).length || cur.title)) first = Date.now() - t0;
    if (cur && cur.status !== 'streaming') break;
    await p.waitForTimeout(400);
  }
  const written = Date.now() - t0;
  // then its code runs by itself, and Bento's own check compares the lesson with what really happened
  // (a web page isn't run or checked by Bento: it shows in a preview, so a complete page is what counts)
  let ran =
    L.lang === 'html' && cur?.status === 'done'
      ? pageComplete(cur.code)
        ? 'page'
        : 'broken page'
      : null;
  const t1 = Date.now();
  while (!ran && cur?.status === 'done' && Date.now() - t1 < 120000) {
    cur = await lessonOf(p, lid);
    const err = await p.locator('.err-card').count();
    if (cur?.check || err) {
      ran = err ? 'error' : 'ok';
      break;
    }
    await p.waitForTimeout(1000);
  }
  // plain English beside each line: the model's, or (where it's missing or was cleared) Bento fills it in with the fast
  // model a moment later. Judge what the learner ends up with.
  const codeLines = (cur?.code || '').split('\n').length;
  for (let i = 0; i < 25 && cur?.code && englishOf(cur).includes(null); i++) {
    await p.waitForTimeout(1000);
    cur = await lessonOf(p, lid);
  }
  const english = cur?.code ? englishOf(cur) : [];
  const errText =
    ran === 'error'
      ? (
          await p
            .locator('.err-card')
            .first()
            .innerText()
            .catch(() => '')
        )
          .replace(/\s+/g, ' ')
          .slice(0, 160)
      : null;
  const output = L.lang === 'html' ? null : await outputOf(p);
  const S = cur?.story || [];
  const kinds = S.map((b) => b.t);
  const ps = S.filter((b) => b.t === 'p');
  const local = cur?.check?.local || [];
  const fixes = cur?.check?.corrections || [];
  const pseudoFixed = local.some((x) => /pseudo|plain/i.test(JSON.stringify(x)));
  const r = {
    task: `lesson:${L.id}`,
    ok: cur?.status === 'done' && !!cur?.title && !!(cur?.code || cur?.steps?.length),
    error: cur?.error || null,
    firstMs: first,
    writtenMs: written,
    checkedMs: ran ? Date.now() - t0 : null,
    title: cur?.title || null,
    blocks: S.length,
    paragraphs: ps.length,
    quiz: kinds.includes('quiz'),
    terms: kinds.filter((k) => k === 'term').length,
    notes: (cur?.notes || []).length,
    codeLines,
    pseudoLines: (cur?.pseudo || []).length,
    pseudoFixed,
    ran,
    runError: errText,
    corrections: fixes.length,
    quizWrong: fixes.some((x) => x.kind === 'quiz'),
    localFixes: local.length,
    html: L.lang === 'html' ? pageComplete(cur?.code) : null,
    // habits Bento's instructions ask for, measured
    longParas: ps.filter((b) => words(b.md) > 70).length,
    links: ps.reduce((n, b) => n + ((b.md || '').match(/\[\[\d+(?:-\d+)?\|/g) || []).length, 0),
    shows: L.lang === 'html' ? null : ((cur?.code || '').match(/\bshow\s*\(/g) || []).length,
    diagram: kinds.includes('diagram'),
    codeSizeOk:
      L.lang === 'html' ? codeLines >= 15 && codeLines <= 70 : codeLines >= 6 && codeLines <= 32,
    pseudoFinal: english.length > 0 && !english.includes(null),
    pseudoOwn: pseudoFits(cur?.code, cur?.pseudo),
    tries: (S.find((b) => b.t === 'try')?.items || []).length,
    nexts: (S.find((b) => b.t === 'next')?.items || []).length,
  };
  r.score = scoreOf(r);
  // what a grader reads: the lesson as the learner sees it, and what the code really printed
  const content =
    cur?.status === 'done'
      ? {
          q: L.q,
          level: L.level,
          lang: L.lang,
          title: cur.title,
          kicker: cur.kicker || '',
          text: S.map((b) =>
            b.t === 'p'
              ? b.md
              : b.t === 'h'
                ? `## ${b.text}`
                : b.t === 'term'
                  ? `[new word] ${b.term}: ${b.plain}${b.like ? ` (like ${b.like})` : ''}`
                  : b.t === 'quiz'
                    ? `[quiz] ${b.q} | choices: ${(b.choices || []).map((c, i) => `${i}) ${c}`).join(' ')} | answer: ${b.answer} | why: ${b.why || ''}`
                    : b.t === 'try'
                      ? `[try] ${(b.items || []).join(' / ')}`
                      : b.t === 'next'
                        ? `[next questions] ${(b.items || []).join(' / ')}`
                        : b.t === 'diagram'
                          ? `[diagram] ${(b.nodes || []).map((n) => n.label).join(' → ')}`
                          : '',
          )
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 7000),
          code: (cur.code || '').slice(0, 5000),
          output,
          pseudo: english
            .map((e, i) => `${i + 1}| ${e ?? '(none)'}`)
            .join('\n')
            .slice(0, 2500),
          notes: (cur.notes || [])
            .map((n) => `${n.from}-${n.to}: ${n.label}: ${n.text}`)
            .join('\n')
            .slice(0, 1200),
        }
      : null;
  return { r, lid, content };
}
// a whole web page: a doctype, and nothing cut off (every <script> and <style> closed; </html> if it opened <html>).
// <html>, <head> and <body> are optional in HTML, and a page without them works the same.
const pageComplete = (code) => {
  const c = String(code || '');
  const n = (re) => (c.match(re) || []).length;
  return (
    /<!doctype html/i.test(c) &&
    n(/<script\b/gi) === n(/<\/script>/gi) &&
    n(/<style\b/gi) === n(/<\/style>/gi) &&
    (!/<html\b/i.test(c) || /<\/html>/i.test(c))
  );
};
// what the learner sees in the output panel, in words a grader can read: the printed lines, then each picture (a tree or
// chart by its own text summary; a canvas drawing by its size, colours and how much of it is drawn on), and any error
const outputOf = (p) =>
  p.evaluate(() => {
    const body = document.querySelector('.stage-body');
    if (!body) return '(no output panel)';
    const printed = [...body.querySelectorAll('.console:not(.live) .log:not(.live-dot)')]
      .map((l) => l.innerText)
      .join('\n')
      .trim();
    const pics = [...body.querySelectorAll('figure.viz')].map((f) => {
      const type = ([...f.classList].find((c) => c.startsWith('viz-')) || 'viz-picture').slice(4);
      const cap = f.querySelector('figcaption')?.innerText || '';
      if (type === 'canvas') {
        const c = f.querySelector('canvas');
        let info = 'unreadable';
        try {
          const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          const bg = `${x[0]},${x[1]},${x[2]}`;
          const cols = new Set();
          let ink = 0,
            n = 0;
          for (let i = 0; i < x.length; i += 16) {
            n++;
            cols.add(`${x[i] >> 4},${x[i + 1] >> 4},${x[i + 2] >> 4}`);
            if (`${x[i]},${x[i + 1]},${x[i + 2]}` !== bg) ink++;
          }
          info = ink
            ? `${cols.size} colours, about ${Math.max(1, Math.round((ink / n) * 100))}% of it drawn on`
            : 'blank';
        } catch {}
        return `a drawing on the canvas (${info})${cap ? `, labelled “${cap}”` : ''}`;
      }
      const aria = f.querySelector('[role=img][aria-label]')?.getAttribute('aria-label');
      return `${type}${cap ? ` “${cap}”` : ''}: ${(aria || f.innerText).replace(/\s+/g, ' ').trim().slice(0, 300)}`;
    });
    const err = body.querySelector('.err-card .err-msg')?.innerText;
    return [
      `PRINTED:\n${printed || '(nothing)'}`,
      `PICTURES (from show() and the canvas):\n${pics.length ? pics.map((x) => `- ${x}`).join('\n') : '(none)'}`,
      err ? `ERROR: ${err}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 2000);
  });
// out of 100: written (30), runs or is a complete page (25), few corrections from Bento's check (15), the lesson's parts (30)
function scoreOf(r) {
  const runs = r.ran === 'ok' || r.ran === 'page';
  return !r.ok
    ? 0
    : 30 +
        (runs ? 25 : r.ran == null ? 10 : 0) +
        (r.ran === 'page'
          ? 15
          : r.ran === 'ok'
            ? r.corrections === 0
              ? 15
              : r.corrections === 1
                ? 10
                : 0
            : 0) +
        ((r.pseudoFinal ?? r.pseudoLines === r.codeLines)
          ? r.pseudoFixed || r.pseudoOwn === false
            ? 5
            : 10
          : 0) +
        (r.quiz ? 5 : 0) +
        (r.terms ? 5 : 0) +
        (r.notes ? 5 : 0) +
        (r.paragraphs >= 2 ? 5 : 0);
}

// ---------------------------------------------------------------- a question inside the lesson
async function answer(p, lid) {
  const t0 = Date.now();
  const before = (await lessonOf(p, lid))?.chat?.length || 0;
  await p.click('#followup');
  await p.keyboard.type(QUESTION);
  await p.keyboard.press('Enter');
  let c = null;
  while (Date.now() - t0 < 180000) {
    const L = await lessonOf(p, lid);
    c = (L?.chat || [])[before];
    if (c && c.a && !c.loading) break;
    await p.waitForTimeout(500);
  }
  const r = {
    task: 'answer',
    ok: !!c?.a && !/couldn’t|could not|didn’t answer/i.test(c.a),
    ms: Date.now() - t0,
    words: (c?.a || '').split(/\s+/).length,
    next: (c?.next || []).length,
    check: !!c?.check,
    by: c?.by || null,
  };
  r.score = !r.ok
    ? 0
    : 50 +
      (r.next >= 2 ? 20 : r.next ? 10 : 0) +
      (r.check ? 15 : 0) +
      (r.ms < 15000 ? 15 : r.ms < 30000 ? 8 : 0);
  return r;
}

// ---------------------------------------------------------------- "Make your own path"
async function pathDesign(p) {
  const t0 = Date.now();
  await p.click('.side nav button:has-text("Path")');
  await p.fill('.make-path input', GOAL);
  await p.click('.make-path .btn');
  let T = null,
    err = null;
  while (Date.now() - t0 < 180000) {
    ({ T, err } = await p.evaluate(() => ({
      T: (JSON.parse(localStorage.getItem('bento.progress') || '{}').tracks || [])[0] || null,
      err: document.querySelector('.make-path ~ .story-err')?.innerText || null,
    })));
    if (T || err) break;
    await p.waitForTimeout(500);
  }
  const stops = T?.stops || [];
  const r = {
    task: 'path',
    ok: stops.length >= 6 && stops.length <= 10,
    ms: Date.now() - t0,
    stops: stops.length,
    allLessons: stops.length > 0 && stops.every((s) => s.t && s.q),
    title: T?.title || null,
    ending: !!T?.end,
    error: err,
  };
  r.score =
    (r.ok ? 50 : stops.length ? 20 : 0) +
    (r.allLessons ? 30 : 0) +
    (r.title && r.ending ? 20 : r.title ? 10 : 0);
  return r;
}

// ---------------------------------------------------------------- grading, by two AIs from different companies
// Runs a grader through Bento's own adapter for it (so it's text-only like every Bento request), outside the app.
const runQuiet = (cmd, args, timeout = 25000) =>
  new Promise((res) => {
    const [c, a] = pretend ? [process.execPath, [FAKE, '--as', cmd, ...args]] : [cmd, args];
    execFile(c, a, { timeout, maxBuffer: 4 << 20 }, (e, out, err) =>
      res({ ok: !e, out: String(out || ''), err: String(err || '') }),
    );
  });
async function runAI(model, system, prompt, timeout = 420000) {
  const { prov, name } = P.parseModel(model);
  const A = P.ADAPTERS[prov];
  const bin = P.BY[prov].bin;
  await A.prepare?.({
    run: (args, t) => runQuiet(bin, args, t),
    env: process.env,
    ghToken: async () => null,
    ghApi: async () => null,
    spawnJson: async () => null,
  });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-grade-'));
  const sysFile = path.join(work, 'instructions.md');
  fs.writeFileSync(sysFile, system);
  const b = A.build({
    name,
    system,
    prompt,
    sysFile,
    files: P.setupFiles(path.join(work, 'ai')),
    token: null,
  });
  if (b.noModel) throw new Error(`${model} isn’t offered on this account`);
  const env = { ...process.env, ...b.env };
  for (const [k, v] of Object.entries(b.env || {})) if (v === undefined) delete env[k];
  const [cmd, args] = pretend ? [process.execPath, [FAKE, '--as', bin, ...b.args]] : [bin, b.args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: work,
      env,
      stdio: [b.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (b.stdin != null) {
      child.stdin.on('error', () => {});
      child.stdin.end(b.stdin);
    }
    let buf = '',
      full = '',
      err = '',
      aborted = null;
    const seen = new Set();
    const sink = {
      text: (t) => {
        full += t;
      },
      think() {},
      tokens() {},
      limits() {},
      requests() {},
      error: (m) => {
        err = m;
      },
      full: () => full,
      seen: (id, c) => {
        if (c) return seen.has(id);
        seen.add(id);
        return false;
      },
      abort: (m) => {
        aborted = m;
        child.kill();
      },
    };
    const timer = setTimeout(() => {
      aborted = 'timed out';
      child.kill();
    }, timeout);
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          A.parse(JSON.parse(l), sink);
        } catch {}
      }
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('close', () => {
      clearTimeout(timer);
      fs.rmSync(work, { recursive: true, force: true });
      if (aborted) reject(new Error(aborted));
      else if (full) resolve(full);
      else reject(new Error(err.trim().split('\n').slice(-2).join(' ') || 'no answer'));
    });
  });
}
const JUDGE_SYSTEM =
  "You grade short programming lessons that an AI tutor wrote for a learning app. In the app, the lesson's paragraphs sit beside its code; the code runs, and whatever it passes to show() is drawn as a picture (a chart, a tree, a table). Grade strictly and specifically, the way an experienced teacher would. You don't know which AI wrote the lesson. Reply with JSON only.";
const judgePrompt = (
  c,
) => `The learner is a ${LEVEL_NAME[c.level] || c.level}. Language: ${c.lang}. They asked: "${c.q}"

LESSON TITLE: ${c.title}${c.kicker ? ` (${c.kicker})` : ''}

LESSON TEXT, IN ORDER ([[n|text]] links point at code line n):
${c.text}

CODE:
${c.code
  .split('\n')
  .map((l, i) => `${i + 1}| ${l}`)
  .join('\n')}
${c.lang === 'html' ? '\n(This is a web page: it is shown live in a preview, not printed.)' : `\nWHAT THE LEARNER SAW WHEN THE CODE RAN:\n${c.output || '(nothing)'}`}

PLAIN ENGLISH SHOWN BESIDE EACH CODE LINE (by line number):
${c.pseudo || '(none)'}

MARGIN NOTES:
${c.notes || '(none)'}

Score each from 1 (poor) to 5 (excellent):
- correct: everything said, shown and quizzed is true, and agrees with what the code really printed
- clear: easy to follow for this learner; short paragraphs; builds the idea step by step
- visual: shows the idea (a picture, a chart, concrete values) instead of only telling it
- code: small, idiomatic, runs, and demonstrates exactly what the text explains
- teaching: an everyday picture first, then the real terms, explained; the quiz checks real understanding
- overall: would you put this in front of a real learner as it is?
Reply JSON: {"correct":n,"clear":n,"visual":n,"code":n,"teaching":n,"overall":n,"issues":["up to 3 short, specific problems"]}`;
const CRIT = ['correct', 'clear', 'visual', 'code', 'teaching', 'overall'];
const parseGrade = (t) => {
  const m = String(t).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!CRIT.every((k) => Number.isFinite(+j[k]))) return null;
    const g = Object.fromEntries(CRIT.map((k) => [k, Math.max(1, Math.min(5, +j[k]))]));
    g.issues = (Array.isArray(j.issues) ? j.issues : []).map(String).slice(0, 3);
    return g;
  } catch {
    return null;
  }
};
// every lesson, by every grader, a few at a time
async function judgeAll(lessons) {
  const jobs = [];
  for (const L of lessons) for (const judge of JUDGES) jobs.push({ L, judge });
  const per = Object.fromEntries(JUDGES.map((j) => [j, 0]));
  let done = 0;
  const work = async () => {
    for (;;) {
      const i = jobs.findIndex((x) => !x.taken && per[x.judge] < PER_JUDGE);
      if (i < 0) {
        if (jobs.some((x) => !x.taken)) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        return;
      }
      const job = jobs[i];
      job.taken = true;
      per[job.judge]++;
      let g = null,
        err = null;
      for (let attempt = 0; attempt < 2 && !g; attempt++) {
        try {
          g = parseGrade(await runAI(job.judge, JUDGE_SYSTEM, judgePrompt(job.L.content)));
          if (!g) err = 'the grade wasn’t valid JSON';
        } catch (e) {
          err = e.message.slice(0, 160);
        }
      }
      per[job.judge]--;
      (job.L.grades ||= {})[job.judge] = g || { error: err };
      done++;
      console.log(
        `  graded ${String(done).padStart(3)}/${jobs.length}  ${job.L.model.padEnd(24)} ${job.L.id.padEnd(11)} by ${job.judge.padEnd(18)} ${g ? `${Math.round(avg(CRIT.map((k) => g[k])) * 20)}/100${g.issues[0] ? ` · ${g.issues[0].slice(0, 90)}` : ''}` : `✗ ${err}`}`,
      );
    }
  };
  await Promise.all(Array.from({ length: JUDGES.length * PER_JUDGE }, work));
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// a lesson's quality: the graders' average (0–100); a model's: the average over its lessons
const qualityOf = (grades) => {
  const gs = Object.values(grades || {}).filter((g) => g && !g.error);
  return gs.length ? Math.round(avg(gs.map((g) => avg(CRIT.map((k) => g[k])))) * 20) : null;
};
function applyGrades(report, lessons) {
  for (const x of report.results) {
    const mine = lessons.filter((L) => L.model === x.model);
    for (const t of x.tasks) {
      const L = mine.find((m) => `lesson:${m.id}` === t.task);
      if (L?.grades) {
        t.grades = L.grades;
        t.quality = qualityOf(L.grades);
      }
    }
    const ls = x.tasks.filter((t) => t.task.startsWith('lesson'));
    const qs = ls.map((t) => (t.ok ? t.quality : 0)).filter((q) => q != null);
    x.quality = qs.length ? Math.round(avg(qs)) : null;
    x.criteria = Object.fromEntries(
      CRIT.map((k) => [
        k,
        +(
          avg(
            ls.flatMap((t) =>
              Object.values(t.grades || {})
                .filter((g) => g && !g.error)
                .map((g) => g[k]),
            ),
          ) || 0
        ).toFixed(1),
      ]),
    );
    x.byJudge = Object.fromEntries(
      JUDGES.map((j) => [
        j,
        (() => {
          const v = avg(
            ls
              .map((t) => t.grades?.[j])
              .filter((g) => g && !g.error)
              .map((g) => avg(CRIT.map((k) => g[k])) * 20),
          );
          return v == null ? null : Math.round(v);
        })(),
      ]),
    );
    x.issues = ls
      .flatMap((t) =>
        Object.values(t.grades || {})
          .flatMap((g) => g?.issues || [])
          .map((i) => `${t.task.slice(7)}: ${i}`),
      )
      .slice(0, 8);
    x.verdict = verdictOf(x.lessonScore, ls, x.quality);
  }
}

// ---------------------------------------------------------------- modes that reuse a saved run (no new lessons)
if (arg('--rescore')) {
  const saved = JSON.parse(fs.readFileSync(arg('--rescore'), 'utf8'));
  for (const x of saved.results) {
    for (const t of x.tasks)
      if (t.task.startsWith('lesson')) {
        if (
          t.task === 'lesson:webpage' &&
          t.ok &&
          t.html != null &&
          (t.ran == null || t.ran === 'page' || t.ran === 'broken page')
        )
          t.ran = t.html ? 'page' : 'broken page';
        t.score = scoreOf(t);
      }
    const ls = x.tasks.filter((t) => t.task.startsWith('lesson'));
    x.lessonScore = Math.round(avg(ls.map((t) => t.score)));
    x.verdict = verdictOf(x.lessonScore, ls, x.quality);
  }
  writeReport(saved);
  process.exit(0);
}
// --recapture <lessons file>: run every saved lesson's code again in a hidden app with no AI (free), and record what the
// learner sees, with the output reader as it is now. --fix-links also applies Bento's line-link repair to the text, so
// lessons written before it can be compared fairly with ones written after.
if (arg('--recapture')) {
  const file = path.resolve(arg('--recapture'));
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { fixLinks } = await import('../src/verify.js');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-recap-'));
  fs.writeFileSync(
    path.join(profile, 'bento-store.json'),
    JSON.stringify({
      'bento.settings': {
        onboarded: true,
        model: 'claude:sonnet',
        lang: 'python',
        level: 'student',
      },
    }),
  );
  const env = {
    ...process.env,
    BENTO_HIDDEN: '1',
    BENTO_USERDATA: profile,
    BENTO_PRETEND_MISSING: [...AI_IDS, 'gh'].join(','),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BENTO_DEV;
  delete env.BENTO_FAKE_AI;
  const app = await electron.launch({
    executablePath: exe,
    args: packaged ? [] : [root],
    env,
    timeout: 90000,
  });
  const p = await app.firstWindow();
  await p.waitForSelector('.side', { timeout: 60000 });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  );
  await p.evaluate(() => {
    for (const k of ['lesson', 'home', 'path', 'atlas', 'desk'])
      localStorage.setItem(`bento.coach.${k}`, '1');
  });
  // Python takes a while to start the first time: start it before the first lesson counts
  await p.evaluate(() =>
    window.__openLesson({
      id: 'recap-warm',
      q: 'warm',
      mode: 'explain',
      lang: 'python',
      level: 'student',
      status: 'done',
      title: 'Warm',
      kicker: '',
      concepts: [],
      story: [{ t: 'p', md: '.' }],
      code: 'print("warm")',
      file: 'main.py',
      pseudo: [],
      notes: [],
      steps: [],
      chat: [],
      createdAt: Date.now(),
      builtin: true,
    }),
  );
  await p.waitForTimeout(300);
  await p.click('.act.run').catch(() => {});
  await p
    .waitForFunction(
      () => /warm/.test(document.querySelector('.stage-body .console')?.innerText || ''),
      null,
      { timeout: 180000 },
    )
    .catch(() => console.log('Python didn’t start in 3 minutes'));
  let n = 0;
  for (const L of saved) {
    const c = L.content;
    if (!c) continue;
    if (flag('--fix-links'))
      c.text = c.text
        .split('\n\n')
        .map((b) => fixLinks(c.code, b).md)
        .join('\n\n');
    if (c.lang === 'html') continue;
    const id = `recap-${n++}`;
    await p.evaluate(
      ([id, c]) =>
        window.__openLesson({
          id,
          q: c.q,
          mode: 'explain',
          lang: c.lang,
          level: c.level,
          status: 'done',
          title: c.title,
          kicker: '',
          concepts: [],
          story: [{ t: 'p', md: '.' }],
          code: c.code,
          file: c.lang === 'python' ? 'main.py' : 'main.js',
          pseudo: [],
          notes: [],
          steps: [],
          chat: [],
          createdAt: Date.now(),
          builtin: true,
        }),
      [id, c],
    );
    const before = c.output;
    const makes = /(^|[^.\w])(print|show|circle|line|rect|text)\s*\(|console\.log\(/.test(c.code);
    for (let attempt = 0; attempt < 2; attempt++) {
      // once more if a program that prints or draws came back empty
      await p.waitForTimeout(300);
      await p.click('.act.run').catch(() => {});
      await p
        .waitForFunction(
          () => {
            const b = document.querySelector('.stage-body');
            return (
              b &&
              !b.querySelector('.console.live') &&
              b.querySelector('.console, figure.viz, .err-card, .stage-empty')
            );
          },
          null,
          { timeout: 120000 },
        )
        .catch(() => {});
      await p.waitForTimeout(800);
      c.output = await outputOf(p);
      if (!makes || !/PRINTED:\n\(nothing\)\n\nPICTURES[^\n]*\n\(none\)/.test(c.output)) break;
    }
    console.log(
      `${L.model.padEnd(24)} ${L.id.padEnd(11)} ${before === c.output ? 'same' : 'updated'} · ${c.output.split('\n')[1]?.slice(0, 60) || ''}`,
    );
  }
  await app.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.writeFileSync(file, JSON.stringify(saved) + '\n');
  console.log(`Recaptured ${n} lessons in ${path.relative(root, file) || file}.`);
  process.exit(0);
}
if (arg('--judge')) {
  const saved = JSON.parse(fs.readFileSync(arg('--judge'), 'utf8'));
  const side = sidecarOf(arg('--judge'));
  const lessons = fs.existsSync(side) ? JSON.parse(fs.readFileSync(side, 'utf8')) : [];
  if (!lessons.length) {
    console.error(`No saved lessons to grade (${path.relative(root, side)}).`);
    process.exit(1);
  }
  // --models: grade only these models' lessons again, and keep everyone else's grades
  const only = arg('--models') ? arg('--models').split(',') : null;
  const todo = lessons.filter((L) => L.content && (!only || only.includes(L.model)));
  for (const L of todo) delete L.grades;
  console.log(`Grading ${todo.length} lessons with ${JUDGES.join(' and ')}…`);
  await judgeAll(todo);
  saved.judges = JUDGES;
  await withLock(() => {
    fs.writeFileSync(side, JSON.stringify(lessons) + '\n');
    applyGrades(saved, lessons);
    writeReport(saved);
  });
  compareIfAsked(saved);
  process.exit(process.exitCode || 0);
}

// ---------------------------------------------------------------- the run
const scanApp = await launch(null, 'claude:sonnet'); // which AIs are here and signed in (no request is made)
const scan = await scanApp.p.evaluate(() => window.bento.scan());
await scanApp.close();
const ready = (id) => scan[id]?.installed && scan[id]?.loggedIn && !scan[id]?.outdated;
const wanted = arg('--models')
  ? arg('--models').split(',')
  : CAT.providers.filter((x) => ready(x.id)).flatMap((x) => x.models.map((m) => m.id));
console.log(
  'AIs here:',
  AI_IDS.map(
    (id) => `${id}${ready(id) ? ` ✓ ${scan[id].plan || scan[id].method || ''}` : ' ✗'}`,
  ).join(' · '),
);
console.log('models:', wanted.join(', '), '\n');

const results = [];
const plans = {};
const lessons = [];
for (const model of wanted) {
  const prov = model.split(':')[0];
  if (!ready(prov)) {
    console.log(`– ${model}: ${prov} isn’t ready on this Mac, skipped`);
    continue;
  }
  const { p, close } = await launch(prov, model);
  const before = await p.evaluate(() => window.bento.limits.get({ refresh: true }));
  plans[prov] ||= { before: before[prov] || null };
  const out = { model, tasks: [] };
  let lastLid = null;
  for (const L of LESSONS) {
    const { r, lid, content } = await lesson(p, model, L);
    out.tasks.push(r);
    lastLid = lid;
    lessons.push({ model, id: L.id, content });
    console.log(
      `${model.padEnd(24)} ${r.task.padEnd(18)} ${String(r.score).padStart(3)}  ${r.ok ? `“${r.title}”` : `✗ ${r.error || 'not written'}`} · first words ${r.firstMs ?? '–'} ms · written ${(r.writtenMs / 1000).toFixed(0)} s · code ${r.ran || '–'}${r.runError ? ` (${r.runError})` : ''} · ${r.corrections} correction${r.corrections === 1 ? '' : 's'}${r.pseudoFinal ? '' : ` · plain words ${r.pseudoLines}/${r.codeLines} lines`}${r.longParas ? ` · ${r.longParas} long paragraph${r.longParas > 1 ? 's' : ''}` : ''}`,
    );
  }
  // the fast model's jobs: once per AI, from its first model
  if (!results.some((x) => x.model.startsWith(`${prov}:`))) {
    if (lastLid) {
      const a = await answer(p, lastLid).catch((e) => ({
        task: 'answer',
        ok: false,
        score: 0,
        error: e.message.split('\n')[0],
      }));
      out.tasks.push(a);
      console.log(
        `${model.padEnd(24)} ${'answer'.padEnd(18)} ${String(a.score).padStart(3)}  ${a.ok ? `${a.words} words · ${a.next} follow-ups · ${a.check ? 'a check' : 'no check'}` : `✗ ${a.error || 'no answer'}`} · ${((a.ms || 0) / 1000).toFixed(1)} s`,
      );
    }
    const d = await pathDesign(p).catch((e) => ({
      task: 'path',
      ok: false,
      score: 0,
      error: e.message.split('\n')[0],
    }));
    out.tasks.push(d);
    console.log(
      `${model.padEnd(24)} ${'path'.padEnd(18)} ${String(d.score).padStart(3)}  ${d.ok ? `“${d.title}” · ${d.stops} stops` : `✗ ${d.error || `${d.stops || 0} stops`}`} · ${((d.ms || 0) / 1000).toFixed(1)} s`,
    );
  }
  const usage = await p.evaluate(() => window.bento.usage());
  out.tokens = usage.by?.[prov]?.tokens || 0;
  out.requests = usage.by?.[prov]?.n || 0;
  const after = await p.evaluate(() => window.bento.limits.get({ refresh: true }));
  plans[prov].after = after[prov] || null;
  const ls = out.tasks.filter((t) => t.task.startsWith('lesson'));
  out.lessonScore = Math.round(avg(ls.map((t) => t.score)));
  out.verdict = verdictOf(out.lessonScore, ls);
  results.push(out);
  console.log(
    `${model.padEnd(24)} structure ${out.lessonScore}/100 · ${out.requests} requests, about ${Math.round(out.tokens / 1000)}k tokens\n`,
  );
  await close();
}

// ---------------------------------------------------------------- grading, then the report
const report = {
  at: STARTED,
  app: packaged ? 'packaged' : 'source',
  ais: Object.fromEntries(
    AI_IDS.map((id) => [
      id,
      {
        version: scan[id]?.version || null,
        plan: scan[id]?.plan || scan[id]?.method || null,
        ready: !!ready(id),
      },
    ]),
  ),
  lessons: LESSONS,
  question: QUESTION,
  goal: GOAL,
  judges: flag('--no-judge') ? [] : JUDGES,
  results,
  plans,
};
if (!flag('--no-judge')) {
  console.log(
    `Grading ${lessons.filter((L) => L.content).length} lessons with ${JUDGES.join(' and ')}…`,
  );
  await judgeAll(lessons.filter((L) => L.content));
  applyGrades(report, lessons);
}
// a run of only some models joins the day's earlier results (each model's newest run counts)
// (several runs at once, one per AI, take turns here)
await withLock(() => {
  const dayFile = path.join(DOCS, `ai-${localDay(report.at)}.json`);
  const earlier =
    !pretend && fs.existsSync(dayFile) ? JSON.parse(fs.readFileSync(dayFile, 'utf8')) : null;
  if (earlier) {
    report.results.unshift(
      ...earlier.results.filter((x) => !report.results.some((y) => y.model === x.model)),
    );
    for (const [k, v] of Object.entries(earlier.plans || {})) report.plans[k] ||= v;
    if (!report.judges.length) report.judges = earlier.judges || [];
  }
  const side = sidecarOf(dayFile);
  const keptLessons =
    !pretend && fs.existsSync(side)
      ? JSON.parse(fs.readFileSync(side, 'utf8')).filter(
          (L) => !lessons.some((m) => m.model === L.model),
        )
      : [];
  if (!pretend) {
    fs.mkdirSync(DOCS, { recursive: true });
    fs.writeFileSync(side, JSON.stringify([...keptLessons, ...lessons]) + '\n');
  }
  writeReport(report);
});
compareIfAsked(report);

// ---------------------------------------------------------------- helpers
async function withLock(fn) {
  if (pretend) return fn();
  fs.mkdirSync(DOCS, { recursive: true });
  const lock = path.join(DOCS, '.bench-lock');
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch {
      if (i > 1200) fs.rmSync(lock, { recursive: true, force: true });
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
// the day as the person running it sees it (a UTC date would split one evening's runs across two files)
function localDay(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}
function sidecarOf(file) {
  return path.join(path.dirname(file), path.basename(file).replace(/^ai-/, 'lessons-'));
}
// great: well built and graded highly; good: solid; weak: unreliable; no: not usable
function verdictOf(score, ls, quality) {
  const okN = ls.filter((t) => t.ok).length;
  if (quality != null)
    return score >= 85 && quality >= 85 && okN === ls.length
      ? 'great'
      : score >= 70 && quality >= 70 && okN >= ls.length - 1
        ? 'good'
        : score >= 40 && quality >= 50
          ? 'weak'
          : 'no';
  return score >= 85 && okN === ls.length
    ? 'great'
    : score >= 65 && okN >= 2
      ? 'good'
      : score >= 40
        ? 'weak'
        : 'no';
}
// --compare <baseline>: any model whose structure or quality fell by more than 8 points, or that now fails a lesson
function compareIfAsked(report) {
  // a run becomes the baseline only if it didn't make any model worse (a bad run must never become the new normal)
  const save = () => {
    if (flag('--save-baseline') && !pretend) {
      fs.writeFileSync(
        path.join(DOCS, 'baseline.json'),
        JSON.stringify(
          {
            at: report.at,
            results: report.results.map(({ model, lessonScore, quality }) => ({
              model,
              lessonScore,
              quality,
            })),
          },
          null,
          2,
        ) + '\n',
      );
      console.log('Saved as the baseline: docs/benchmarks/baseline.json');
    }
  };
  if (!arg('--compare')) return save();
  const base = JSON.parse(fs.readFileSync(arg('--compare'), 'utf8'));
  let worse = 0;
  console.log('\nCompared with the baseline:');
  for (const x of report.results) {
    const b = base.results.find((y) => y.model === x.model);
    if (!b) continue;
    const ds = b.lessonScore != null ? x.lessonScore - b.lessonScore : 0,
      dq = b.quality != null && x.quality != null ? x.quality - b.quality : 0;
    const bad = ds < -8 || dq < -8;
    if (bad) worse++;
    console.log(
      `  ${bad ? '✗' : '✓'} ${x.model.padEnd(24)} structure ${b.lessonScore} → ${x.lessonScore} (${ds >= 0 ? '+' : ''}${ds})${x.quality != null ? `   quality ${b.quality ?? '–'} → ${x.quality} (${dq >= 0 ? '+' : ''}${dq})` : ''}`,
    );
  }
  if (worse) {
    console.log(
      `\n${worse} model${worse > 1 ? 's' : ''} got worse${flag('--save-baseline') ? ', so the baseline stays as it was' : ''}.`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nNo model got worse.');
    save();
  }
}
// a saved run (JSON) and a readable summary, in docs/benchmarks/ (a dry run writes to a temporary folder)
function writeReport(report) {
  const day = localDay(report.at);
  const dir = pretend ? null : OUT || DOCS;
  if (dir) fs.mkdirSync(dir, { recursive: true }); // a dry run only prints its report
  const used = (L) => {
    const w = (L?.windows || []).slice().sort((a, b) => (b.used ?? 0) - (a.used ?? 0))[0];
    return w ? (w.of ? `${w.n}/${w.of} ${w.label}` : `${w.used}% ${w.label}`) : 'not reported';
  };
  if (dir)
    fs.writeFileSync(path.join(dir, `ai-${day}.json`), JSON.stringify(report, null, 2) + '\n');
  const VERDICT = { great: 'Great', good: 'Good', weak: 'Unreliable', no: 'Not usable' };
  const ids = (report.lessons || LESSONS).map((l) => l.id);
  const graded = report.results.some((x) => x.quality != null);
  const sorted = [...report.results].sort(
    (a, b) => (b.quality ?? -1) - (a.quality ?? -1) || b.lessonScore - a.lessonScore,
  );
  const md = [
    `# How each AI does Bento's jobs (${day})`,
    '',
    `Measured with \`scripts/bench-ai.mjs\` in the ${report.app} app, one AI at a time, on real plans. Lessons: ${(report.lessons || LESSONS).map((l) => `“${l.q}” (${l.level || 'student'}, ${l.lang})`).join('; ')}.`,
    '',
    `**Structure** (out of 100): written in full (30), the code runs or the page is complete (25), few corrections from Bento's own check (15), and the lesson's parts: plain-English lines that match the code, a quiz, new words, margin notes, enough explanation (30).${graded ? ` **Quality** (out of 100): ${report.judges.join(' and ')} each read every lesson blind, with what its code really printed, and scored it 1–5 on correct, clear, visual, code, teaching and overall.` : ''}`,
    '',
    `| Model | ${graded ? 'Quality | ' : ''}Structure | ${ids.map((i) => i[0].toUpperCase() + i.slice(1)).join(' | ')} | Code runs | Avg. time | Answer | Path | Verdict |`,
    `|---|${graded ? '---|' : ''}---|${ids.map(() => '---').join('|')}|---|---|---|---|---|`,
    ...sorted.map((x) => {
      const T = (id) => x.tasks.find((t) => t.task === id);
      const ls = x.tasks.filter((t) => t.task.startsWith('lesson'));
      return `| \`${x.model}\` | ${graded ? `**${x.quality ?? '–'}** | ` : ''}${x.lessonScore} | ${ids
        .map((i) => {
          const t = T(`lesson:${i}`);
          return t ? (graded && t.quality != null ? `${t.quality}` : `${t.score}`) : '–';
        })
        .join(
          ' | ',
        )} | ${ls.filter((t) => t.ran === 'ok' || t.ran === 'page').length}/${ls.length} | ${Math.round(avg(ls.map((t) => t.writtenMs || 0)) / 1000)} s | ${T('answer')?.score ?? '·'} | ${T('path')?.score ?? '·'} | ${VERDICT[x.verdict]} |`;
    }),
    '',
    graded
      ? 'Per-lesson columns show quality when graded. “Answer” and “Path” use each AI’s fast model, so they’re measured once per AI.'
      : '“Answer” and “Path” use each AI’s fast model, so they’re measured once per AI.',
    '',
    ...(graded
      ? [
          '## Quality in detail (1–5)',
          '',
          `| Model | Correct | Clear | Visual | Code | Teaching | Overall | ${report.judges.map((j) => `By ${j}`).join(' | ')} |`,
          `|---|---|---|---|---|---|---|${report.judges.map(() => '---').join('|')}|`,
          ...sorted
            .filter((x) => x.criteria)
            .map(
              (x) =>
                `| \`${x.model}\` | ${CRIT.map((k) => x.criteria[k]).join(' | ')} | ${report.judges.map((j) => x.byJudge?.[j] ?? '–').join(' | ')} |`,
            ),
          '',
          '## What the graders noticed',
          '',
          ...sorted
            .filter((x) => x.issues?.length)
            .flatMap((x) => [
              `**\`${x.model}\`**`,
              ...x.issues.slice(0, 4).map((i) => `- ${i}`),
              '',
            ]),
          '',
        ]
      : []),
    '## Habits Bento asks for',
    '',
    '| Model | Long paragraphs | Links into the code | Pictures drawn (show) | Code size right | Plain English matches |',
    '|---|---|---|---|---|---|',
    ...sorted.map((x) => {
      const ls = x.tasks.filter((t) => t.task.startsWith('lesson') && t.ok);
      const code = ls.filter((t) => t.shows != null);
      return `| \`${x.model}\` | ${ls.reduce((s, t) => s + (t.longParas || 0), 0)} | ${(avg(ls.map((t) => t.links || 0)) ?? 0).toFixed(1)} per lesson | ${code.filter((t) => t.shows > 0).length}/${code.length} lessons | ${ls.filter((t) => t.codeSizeOk).length}/${ls.length} | ${ls.filter((t) => t.pseudoFinal ?? t.pseudoLines === t.codeLines).length}/${ls.length} |`;
    }),
    '',
    '## Plans used by this run',
    '',
    ...Object.entries(report.plans).map(
      ([id, v]) =>
        `- **${CAT.providers.find((x) => x.id === id)?.name}**: ${used(v.before)} before, ${used(v.after)} after`,
    ),
    '',
  ].join('\n');
  if (dir) fs.writeFileSync(path.join(dir, `ai-${day}.md`), md);
  console.log(md);
}
