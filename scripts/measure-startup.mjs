// How fast does a packaged Bento start? Launches the real app (signed builds included: no debugger fuse needed) with
// a brand-new profile, hidden and with no AI tools, and reads the page's own timings over the DevTools protocol.
//   node scripts/measure-startup.mjs /Applications/Bento.app            5 launches
//   node scripts/measure-startup.mjs release/v0.3.0/mac-arm64/Bento.app --runs 9
// Every time is measured from the moment the process is started:
//   page     the page starts loading (Electron and the main process are up, the window exists)
//   paint    first contentful paint: something of Bento's is on screen
//   lcp      largest contentful paint: the first screen's main content is drawn
//   ready    the first screen is drawn and its data loaded, so it answers input (Bento's "bento:interactive" mark;
//            builds before 0.2.1 don't set it)
//   code     the page's JavaScript bundle is downloaded, parsed and has run (DOMContentLoaded, for a module bundle)
// and heap: the page's JavaScript memory about 2 s in (MB).
// Starting from Finder adds macOS's part (and, on a download's first launch only, Gatekeeper's check), not counted here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const SOURCE = args.includes('--source'); // the copy in this folder (after vite build), run by the Electron in node_modules
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appPath = SOURCE
  ? root
  : path.resolve(args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || '');
const RUNS = args.includes('--runs') ? +args[args.indexOf('--runs') + 1] : 5;
const bin = SOURCE
  ? (await import('electron')).default
  : path.join(appPath, 'Contents/MacOS', path.basename(appPath, '.app'));
if (!fs.existsSync(bin)) {
  console.error(`No app at ${appPath}`);
  process.exit(1);
}
const KEYS = ['page', 'code', 'paint', 'lcp', 'ready', 'heap'];
const MORE = args.includes('--detail');
if (MORE) KEYS.splice(2, 0, 'js', 'render');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --warm: one profile for every launch (the first one isn't counted), like someone who has used Bento before: what the
// app keeps between launches (its compiled-code cache, saved lessons) is there
const WARM = args.includes('--warm');
const warmProfile = WARM ? fs.mkdtempSync(path.join(os.tmpdir(), 'bento-startup-')) : null;
async function once() {
  const profile = warmProfile || fs.mkdtempSync(path.join(os.tmpdir(), 'bento-startup-'));
  fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
  const env = {
    ...process.env,
    BENTO_HIDDEN: '1',
    BENTO_USERDATA: profile,
    BENTO_DISABLE_UPDATES: '1',
    BENTO_NO_GH: '1',
    BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const t0 = Date.now();
  const child = spawn(bin, [...(SOURCE ? [root] : []), '--remote-debugging-port=0'], {
    env,
    stdio: 'ignore',
  });
  let browser;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) || !fs.readFileSync(portFile, 'utf8').trim(); i++) {
      if (i > 600) throw new Error('no DevTools port after 30 s');
      await sleep(50);
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    let page;
    for (let i = 0; !page; i++) {
      page = browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('app://bento'));
      if (!page) {
        if (i > 300) throw new Error('no Bento page');
        await sleep(50);
      }
    }
    await page.waitForSelector('.onb, .side', { timeout: 30000 });
    const m = await page.evaluate(async () => {
      const seen = (type) =>
        new Promise((res) => {
          const out = [];
          try {
            new PerformanceObserver((l) => out.push(...l.getEntries())).observe({
              type,
              buffered: true,
            });
          } catch {}
          setTimeout(() => res(out), 50);
        });
      const fcpOf = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      for (let i = 0; i < 500 && fcpOf() == null; i++) await new Promise((r) => setTimeout(r, 20));
      // let the first screen settle, then read what it took
      await new Promise((r) => setTimeout(r, 1500));
      const lcp = (await seen('largest-contentful-paint')).pop()?.startTime;
      const nav = performance.getEntriesByType('navigation')[0];
      const mk = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
      return {
        origin: performance.timeOrigin,
        dcl: nav?.domContentLoadedEventEnd,
        fcp: fcpOf(),
        lcp,
        mark: mk('bento:interactive'),
        js: mk('bento:js'),
        rendered: mk('bento:rendered'),
      };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const M = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
    );
    const at = (t) => (t == null ? null : Math.round(m.origin + t - t0));
    return {
      page: Math.round(m.origin - t0),
      code: at(m.dcl),
      js: at(m.js),
      render: at(m.rendered),
      paint: at(m.fcp),
      lcp: at(m.lcp),
      ready: at(m.mark),
      heap: Math.round(M.JSHeapUsedSize / 1048576),
    };
  } finally {
    await browser?.close().catch(() => {});
    child.kill('SIGTERM');
    await new Promise((r) => {
      const t = setTimeout(r, 4000);
      child.once('exit', () => {
        clearTimeout(t);
        r();
      });
    });
    if (!WARM) fs.rmSync(profile, { recursive: true, force: true });
  }
}

console.log(
  `${appPath}\n${RUNS} launches, ${WARM ? 'one profile used again each time (after a first launch that isn’t counted)' : 'each with a new profile'}, hidden, no AI tools (times from process start, ms)\n`,
);
if (WARM) await once();
const rows = [];
for (let i = 0; i < RUNS; i++) {
  const r = await once();
  rows.push(r);
  console.log(
    `  #${i + 1}  ${KEYS.map((k) => `${k} ${String(r[k] ?? '–').padStart(5)}`).join('   ')}`,
  );
}
const med = (k) => {
  const v = rows
    .map((r) => r[k])
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : '–';
};
console.log(`\nmedian  ${KEYS.map((k) => `${k} ${String(med(k)).padStart(5)}`).join('   ')}`);
console.log(
  `\nms from process start · code: the page's JavaScript is loaded and has run · heap: JS memory in MB`,
);
if (warmProfile) fs.rmSync(warmProfile, { recursive: true, force: true });
