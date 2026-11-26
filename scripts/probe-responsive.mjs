// Does Bento stay responsive while it works? Drives the real app (any build, signed releases included, over the
// DevTools protocol), hidden, with its own profile, and measures:
//   1. while a big project is taken apart and searched: how long a round trip to the main process takes (pinged every
//      10 ms). If the main process is busy, everything waits: menus, saving, a lesson streaming in.
//   2. while a lesson streams in (a pretend AI, so no plan is used): how long each keystroke takes to show on screen
//      (Chromium's Event Timing: input → next paint), long tasks on the page, and main-process round trips.
//   node scripts/probe-responsive.mjs --source                      this folder (after vite build)
//   node scripts/probe-responsive.mjs /path/to/Bento.app            a packaged build
//   --project <folder>   the project to take apart (default: the biggest one Bento has downloaded on this Mac)
//   (2) needs a build that allows the pretend AI: the source, a test build, or a release before 0.2.1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SOURCE = args.includes('--source');
const appPath = SOURCE
  ? root
  : path.resolve(
      args.find(
        (a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--project'),
      ) || '',
    );
const bin = SOURCE
  ? (await import('electron')).default
  : path.join(appPath, 'Contents/MacOS', path.basename(appPath, '.app'));
const REPOS = path.join(os.homedir(), 'Library/Application Support/Bento/repos');
const project = args.includes('--project')
  ? path.resolve(args[args.indexOf('--project') + 1])
  : fs.existsSync(REPOS)
    ? fs
        .readdirSync(REPOS)
        .map((d) => path.join(REPOS, d))
        .filter((d) => fs.existsSync(path.join(d, '.git')))
        .sort((a, b) => fs.readdirSync(b).length - fs.readdirSync(a).length)[0]
    : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const q = (f) => v[Math.min(v.length - 1, Math.floor(f * v.length))] ?? 0;
  return {
    n: v.length,
    p50: Math.round(q(0.5)),
    p95: Math.round(q(0.95)),
    max: Math.round(v[v.length - 1] ?? 0),
  };
};

async function launch(extraEnv = {}, store = null) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-probe-'));
  if (store) fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify(store));
  const env = {
    ...process.env,
    BENTO_HIDDEN: '1',
    BENTO_USERDATA: profile,
    BENTO_DISABLE_UPDATES: '1',
    BENTO_NO_GH: '1',
    BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh',
    ...extraEnv,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BENTO_DEV;
  const child = spawn(bin, [...(SOURCE ? [root] : []), '--remote-debugging-port=0'], {
    env,
    stdio: 'ignore',
  });
  const pf = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(pf) || !fs.readFileSync(pf, 'utf8').trim(); i++) {
    if (i > 600) throw new Error('no DevTools port');
    await sleep(50);
  }
  const browser = await chromium.connectOverCDP(
    `http://127.0.0.1:${fs.readFileSync(pf, 'utf8').split('\n')[0]}`,
  );
  let p;
  for (
    let i = 0;
    !(p = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((x) => x.url().startsWith('app://bento')));
    i++
  ) {
    if (i > 300) throw new Error('no page');
    await sleep(50);
  }
  await p.waitForSelector('.onb, .side', { timeout: 30000 });
  const close = async () => {
    await browser.close().catch(() => {});
    child.kill('SIGTERM');
    await new Promise((r) => {
      const t = setTimeout(r, 4000);
      child.once('exit', () => {
        clearTimeout(t);
        r();
      });
    });
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { p, close };
}
// ping the main process every 10 ms until stop() and return the round-trip times
const pinger = (p) =>
  p.evaluate(() => {
    window.__pings = [];
    window.__pinging = true;
    (async () => {
      while (window.__pinging) {
        const t = performance.now();
        await window.bento.update.get();
        window.__pings.push(performance.now() - t);
        await new Promise((r) => setTimeout(r, 10));
      }
    })();
  });
const pings = (p) =>
  p.evaluate(() => {
    window.__pinging = false;
    return window.__pings;
  });

console.log(`${appPath}`);
// ---- 1. a big project, taken apart and searched
if (!project)
  console.log('\n1. skipped: no downloaded project on this Mac (pass --project <folder>)');
else {
  const { p, close } = await launch();
  try {
    const opened = await p.evaluate((dir) => window.bento.atlasReopen(dir), project);
    if (!opened) throw new Error(`Bento wouldn’t open ${project}`);
    await pinger(p);
    await sleep(300);
    const t = await p.evaluate(async (dir) => {
      const a = performance.now();
      const f = await window.bento.atlasAnalyze(dir, 'probe');
      const b = performance.now();
      await window.bento.atlasSearch(dir, ['session', 'store', 'token']);
      return {
        analyze: performance.now() - a - (performance.now() - b),
        search: performance.now() - b,
        files: f?.files?.length,
      };
    }, project);
    await sleep(200);
    const s = stats(await pings(p));
    console.log(
      `\n1. taking apart ${path.basename(project)} (${t.files} files): analyse ${Math.round(t.analyze)} ms, search ${Math.round(t.search)} ms`,
    );
    console.log(
      `   main-process round trips meanwhile (${s.n}): median ${s.p50} ms, 95% ${s.p95} ms, worst ${s.max} ms`,
    );
  } finally {
    await close();
  }
}

// ---- 2. a lesson streaming in while you type
// only for builds that use the pretend AI (from source, a test build, or a release before 0.2.1): never a real AI
const meta = SOURCE
  ? { bentoTestBuild: true }
  : (() => {
      try {
        return JSON.parse(
          createRequire(import.meta.url)('@electron/asar')
            .extractFile(path.join(appPath, 'Contents/Resources/app.asar'), 'package.json')
            .toString(),
        );
      } catch {
        return {};
      }
    })();
const pretendOk =
  meta.bentoTestBuild === true ||
  (meta.version &&
    meta.version
      .split('.')
      .map(Number)
      .reduce((a, n) => a * 1000 + n, 0) < 2001);
if (!pretendOk)
  console.log(
    '\n2. skipped: this build doesn’t use the pretend AI (a release), and a real AI is never used for a test',
  );
else {
  const { p, close } = await launch(
    {
      BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-claude.mjs'),
      BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh',
      FAKE_AI_THINK_MS: '300',
      FAKE_AI_STEP_MS: '160',
    },
    {
      'bento.settings': {
        onboarded: true,
        model: 'claude:sonnet',
        lang: 'python',
        level: 'student',
      },
    },
  );
  try {
    // one record per keystroke (Chromium reports keydown, keypress, input and keyup separately): its slowest part, and
    // whether it was typed into the search box or opened it. Keystrokes under 16 ms aren't reported at all: those are fast.
    await p.evaluate(() => {
      window.__ia = new Map();
      window.__lt = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (!e.interactionId) continue;
          const o = window.__ia.get(e.interactionId) || { d: 0, inSearch: false };
          o.d = Math.max(o.d, e.duration);
          o.inSearch ||= !!e.target?.closest?.('.pal');
          window.__ia.set(e.interactionId, o);
        }
      }).observe({ type: 'event', durationThreshold: 16 });
      new PerformanceObserver((l) =>
        window.__lt.push(...l.getEntries().map((e) => e.duration)),
      ).observe({ type: 'longtask' });
    });
    await p.click('.cx textarea');
    await p.keyboard.type('How does a hash map find things so fast?');
    await p.keyboard.press('Enter');
    await p.waitForSelector('.wr .wr-node.now', { timeout: 15000 }).catch(() => {
      throw new Error('no lesson started: this build doesn’t allow the pretend AI');
    });
    await sleep(300);
    await p.evaluate(() => {
      window.__ia.clear();
      window.__lt.length = 0;
    }); // only what happens while it streams
    await pinger(p);
    const t0 = Date.now();
    let typed = 0,
      opened = 0;
    const done = () =>
      p.evaluate(() => /red coat/.test(document.querySelector('.stage-body')?.innerText || ''));
    while (Date.now() - t0 < 20000 && !(await done())) {
      await p.keyboard.press('Meta+k');
      opened++;
      await p.waitForSelector('.pal', { timeout: 5000 });
      for (const ch of 'binary search') {
        await p.keyboard.type(ch);
        typed++;
        await sleep(40);
      }
      await p.keyboard.press('Escape');
      await sleep(80);
    }
    const streamed = Date.now() - t0;
    const ia = await p.evaluate(() => [...window.__ia.values()]);
    const lt = await p.evaluate(() => window.__lt);
    const s = stats(await pings(p));
    const slowTyping = ia.filter((x) => x.inSearch).map((x) => x.d),
      slowOpen = ia.filter((x) => !x.inSearch).map((x) => x.d);
    // a keystroke is reported once it takes 16 ms or more to show (one screen frame); 100 ms is where people feel lag
    const show = (xs) => {
      const t = stats(xs);
      return `${t.n} timed: median ${t.p50} ms, 95% ${t.p95} ms, worst ${t.max} ms; ${xs.filter((x) => x >= 100).length} at 100 ms or more`;
    };
    console.log(
      `\n2. a lesson streaming in for ${(streamed / 1000).toFixed(1)} s, meanwhile ⌘K search opened ${opened} times and ${typed} letters typed into it:`,
    );
    console.log(`   letters, key press to screen: ${show(slowTyping)}`);
    console.log(`   opening and closing search: ${show(slowOpen)}`);
    console.log(
      `   long tasks on the page (50 ms+): ${lt.length}${lt.length ? `, longest ${Math.round(Math.max(...lt))} ms` : ''}`,
    );
    console.log(
      `   main-process round trips meanwhile (${s.n}): median ${s.p50} ms, 95% ${s.p95} ms, worst ${s.max} ms`,
    );
  } catch (err) {
    console.log(`\n2. ${err.message}`);
  } finally {
    await close();
  }
}
