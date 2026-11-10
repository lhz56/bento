// Opens the real Bento app and uses it, the way a new learner would, on this computer (Mac, Windows or Linux).
// No AI is used: Claude and Codex are hidden, so this checks everything that works on its own.
//
//   npx vite build && node scripts/smoke-app.mjs              the app from this folder
//   npx electron-builder --dir && node scripts/smoke-app.mjs --packaged    the app electron-builder made
//   On Linux without a screen: xvfb-run -a node scripts/smoke-app.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const OUT = path.join(root, 'smoke-out'); fs.mkdirSync(OUT, { recursive: true });
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

function packagedApp() {
  const rel = process.env.BENTO_RELEASE_DIR || path.join(root, 'release'); // or wherever electron-builder wrote it
  const dirs = fs.existsSync(rel) ? fs.readdirSync(rel) : [];
  if (process.platform === 'darwin') { const d = dirs.find((x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app'))); return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento'); }
  if (process.platform === 'win32') { const d = dirs.find((x) => x.startsWith('win') && x.endsWith('unpacked')); return d && path.join(rel, d, 'Bento.exe'); }
  const d = dirs.find((x) => x.startsWith('linux') && x.endsWith('unpacked'));
  return d && ['bento', 'Bento'].map((n) => path.join(rel, d, n)).find((f) => fs.existsSync(f));
}
const exe = packaged ? packagedApp() : createRequire(import.meta.url)('electron');
if (!exe || !fs.existsSync(exe)) { console.error(`✗ can't find the app${packaged ? ' in release/ (run electron-builder --dir first)' : ''}`); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-smoke-'));
// off-screen unless you pass --show, so running it never covers what you're doing
const env = { ...process.env, BENTO_USERDATA: profile, BENTO_NO_GH: '1', BENTO_PRETEND_MISSING: 'claude,codex,gh', ...(process.argv.includes('--show') ? {} : { BENTO_HIDDEN: '1' }) };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
// Containers and CI machines often can't give Chromium its sandbox; a learner's desktop can.
const args = [...(packaged ? [] : [root]), ...(process.platform === 'linux' && (process.env.CI || process.getuid?.() === 0) ? ['--no-sandbox'] : [])];
console.log(`${process.platform}/${process.arch} · ${packaged ? 'packaged app' : 'from source'} · ${exe}`);

let fail = 0;
const app = await electron.launch({ executablePath: exe, args, env, timeout: 90000 });
const p = await app.firstWindow();
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const note = await fn(); console.log(`✓ ${name}${note ? ` · ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`✗ ${name} → ${String(e.message).split('\n')[0]}`); await p.screenshot({ path: path.join(OUT, `fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {}); }
};
const output = () => p.locator('.stage-body').innerText();
const typeCode = async (code) => { await p.click('.cm-content'); await p.keyboard.press(`${MOD}+a`); await p.keyboard.insertText(code); };
const blankPage = async (lang) => {
  await p.click('.side nav button:has-text("Learn")'); await p.click('.cx-btn.quiet'); await p.click(`.cx-set .seg button:has-text("${lang}")`); await p.mouse.click(5, 300);
  await p.keyboard.press(`${MOD}+k`); await p.keyboard.type('Scratchpad'); await p.waitForTimeout(250); await p.keyboard.press('Enter'); await p.waitForSelector('.cm-content');
};
const run = async () => { await p.click('.act.run'); };

await step('the window opens on the welcome screen', async () => { await p.waitForSelector('.onb', { timeout: 60000 }); return (await p.title()) || 'Bento'; });
await step('welcome can be skipped', async () => {
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('bento.settings') || '{}'); s.onboarded = true; localStorage.setItem('bento.settings', JSON.stringify(s)); });
  await p.reload(); await p.waitForSelector('.side', { timeout: 30000 });
});
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 820)).catch(() => {});
await step('shortcuts are written for this computer', async () => {
  const k = await p.locator('.side .new kbd').innerText();
  const want = process.platform === 'darwin' ? '⌘N' : 'Ctrl+N';
  if (k !== want) throw new Error(`shows “${k}”, expected “${want}”`); return k;
});
await step(`${MOD === 'Meta' ? '⌘' : 'Ctrl+'}K opens search, Escape closes it`, async () => {
  await p.keyboard.press(`${MOD}+k`); await p.waitForSelector('.pal[role="dialog"]', { timeout: 5000 });
  await p.keyboard.press('Escape'); await p.waitForSelector('.pal', { state: 'detached', timeout: 5000 });
});
await step('a built-in lesson opens and draws its picture', async () => {
  await p.click('.side nav button:has-text("Learn")'); await p.keyboard.press(`${MOD}+k`); await p.keyboard.type('Binary search trees'); await p.waitForTimeout(250); await p.click('.pl-i:has(.pl-l:text-is("Binary search trees")):not(:has-text("new lesson")) >> nth=0');
  await p.waitForSelector('.story-head h1', { timeout: 20000 }); await p.waitForSelector('.stage-body .viz, .stage-body svg, .stage-body .tree', { timeout: 120000 });
  return await p.locator('.story-head h1').innerText();
});
await step('Python runs', async () => {
  await blankPage('Python'); await typeCode('print(sum(range(5)), "squares:", [n * n for n in range(4)])\n'); await run();
  await p.waitForFunction(() => /10 squares: \[0, 1, 4, 9\]/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 120000 });
});
await step('Python asks a question with input()', async () => {
  await typeCode('name = input("Name? ")\nprint("Hi " + name)\n'); await run();
  await p.waitForSelector('.log.asking input', { timeout: 30000 }); await p.fill('.log.asking input', 'Ana'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /Hi Ana/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
});
await step('a crash points at its line', async () => {
  await typeCode('x = 1\nprint(x / 0)\n'); await run(); await p.waitForSelector('.err-card', { timeout: 30000 });
  const t = await p.locator('.err-card').innerText(); if (!/line 2/.test(t)) throw new Error(t.slice(0, 120)); return t.split('\n')[0].slice(0, 60);
});
await step('lesson code can’t reach this computer', async () => {
  await typeCode('import urllib.request\ntry:\n    urllib.request.urlopen("http://127.0.0.1:9/")\n    print("REACHED")\nexcept Exception as e:\n    print("blocked:", e)\n'); await run();
  await p.waitForFunction(() => /blocked:|REACHED/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 60000 });
  const t = await output(); if (!/public internet/.test(t)) throw new Error(t.slice(0, 160)); return 'refused';
});
await step('JavaScript runs', async () => {
  await blankPage('JavaScript'); await typeCode('const xs = [3, 1, 2].sort();\nconsole.log("sorted", xs.join(","));\n'); await run();
  await p.waitForFunction(() => /sorted 1,2,3/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
});
await step('TypeScript runs (types stripped, lines kept)', async () => {
  await blankPage('TypeScript'); await typeCode('const add = (a: number, b: number): number => a + b;\nconsole.log("total", add(2, 3));\n'); await run();
  await p.waitForFunction(() => /total 5/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
});
await step('the SQL playground answers its first challenge', async () => {
  await p.click('.side nav button:has-text("Practice")'); await p.click('.gtabs button:has-text("Playgrounds")'); await p.click('.shelf:has-text("SQL")');
  await p.waitForSelector('.sql-res, .ch-goal.ok', { timeout: 120000 });
});
await step('the pretend terminal runs git', async () => {
  await p.click('.shelf:has-text("Terminal & Git")'); await p.waitForSelector('.t-line input');
  for (const c of ['mkdir demo', 'cd demo', 'git init']) { await p.fill('.t-line input', c); await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => /Initialized/i.test(document.querySelector('.pg-git')?.innerText || ''), null, { timeout: 10000 });
});
await step('Settings open and close from the keyboard', async () => {
  await p.keyboard.press(`${MOD}+,`); await p.waitForSelector('.settings[role="dialog"]', { timeout: 5000 });
  await p.keyboard.press('Escape'); await p.waitForSelector('.settings', { state: 'detached', timeout: 5000 });
});
await p.waitForTimeout(700); await p.screenshot({ path: path.join(OUT, `bento-${process.platform}.png`) }).catch(() => {});
await step('no errors on the page', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await app.close().catch(() => {});
fs.rmSync(profile, { recursive: true, force: true });
console.log(fail ? `\n${fail} check(s) failed. Screenshots: ${OUT}` : '\nBento works on this computer.');
process.exit(fail ? 1 : 0);
