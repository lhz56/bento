// Opens the real Bento app and uses it, the way a new learner would, on this computer (Mac, Windows or Linux).
// No AI is used: Claude and Codex are hidden, so this checks everything that works on its own.
//
//   npx vite build && node scripts/smoke-app.mjs              the app from this folder
//   npx electron-builder --dir && node scripts/smoke-app.mjs --packaged    the app electron-builder made
//   On Linux without a screen: xvfb-run -a node scripts/smoke-app.mjs
//   node scripts/smoke-app.mjs --app /path/Bento.app    a release build (signed, the debugger switch off): driven over the
//                                                       DevTools protocol instead, exactly as people get it
import { _electron as electron, chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = process.argv.includes('--app') ? path.resolve(process.argv[process.argv.indexOf('--app') + 1]) : null;
const packaged = process.argv.includes('--packaged') || !!RELEASE;
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
const exe = RELEASE ? path.join(RELEASE, 'Contents/MacOS', path.basename(RELEASE, '.app')) : packaged ? packagedApp() : createRequire(import.meta.url)('electron');
if (!exe || !fs.existsSync(exe)) { console.error(`✗ can't find the app${packaged ? ' in release/ (run electron-builder --dir first)' : ''}`); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-smoke-'));
// off-screen unless you pass --show, so running it never covers what you're doing
const env = { ...process.env, BENTO_USERDATA: profile, BENTO_NO_GH: '1', BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh', ...(process.argv.includes('--show') ? {} : { BENTO_HIDDEN: '1' }) };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
// Containers and CI machines often can't give Chromium its sandbox; a learner's desktop can.
const args = [...(packaged ? [] : [root]), ...(process.platform === 'linux' && (process.env.CI || process.getuid?.() === 0) ? ['--no-sandbox'] : [])];
console.log(`${process.platform}/${process.arch} · ${packaged ? 'packaged app' : 'from source'} · ${exe}`);

let fail = 0;
// a release build can't be attached to the usual way (its --inspect switch is fused off): start it with a DevTools port
async function launchRelease() {
  const child = spawn(exe, ['--remote-debugging-port=0'], { env, stdio: 'ignore' });
  const pf = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; !fs.existsSync(pf) || !fs.readFileSync(pf, 'utf8').trim(); i++) { if (i > 600) throw new Error('no DevTools port'); await new Promise((r) => setTimeout(r, 50)); }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${fs.readFileSync(pf, 'utf8').split('\n')[0]}`);
  const page = async () => { for (let i = 0; ; i++) { const pg = browser.contexts().flatMap((c) => c.pages()).find((x) => x.url().startsWith('app://bento')); if (pg) return pg; if (i > 300) throw new Error('no Bento page'); await new Promise((r) => setTimeout(r, 50)); } };
  return { firstWindow: page, evaluate: async () => {}, close: async () => { await browser.close().catch(() => {}); child.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(r, 4000); child.once('exit', () => { clearTimeout(t); r(); }); }); } };
}
const app = RELEASE ? await launchRelease() : await electron.launch({ executablePath: exe, args, env, timeout: 90000 });
const p = await app.firstWindow();
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (/Content-Security-Policy/.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 160)}`); });
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
await step('try a runnable lesson without connecting an AI', async () => {
  await p.getByRole('button', { name: /Try a lesson/ }).click();
  await p.getByRole('heading', { name: 'Drawing a spiral with code' }).first().waitFor();
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
await step('a line that appears twice keeps its own plain English in each place', async () => {
  await p.evaluate(() => window.__openLesson({ id: 'twice', q: 'twice', mode: 'explain', lang: 'python', level: 'student', status: 'done', title: 'Twice', kicker: '', concepts: [], story: [{ t: 'p', md: '.' }], code: 'x = 0\nshow(x)\nx = 1\nshow(x)', file: 'a.py', pseudo: ['Start at zero', 'Draw it at zero', 'Now make it one', 'Draw it at one'], notes: [], steps: [], chat: [], createdAt: Date.now(), builtin: true }));
  await p.click('.lenses .lens:has-text("Plain")'); await p.waitForSelector('.il-en', { timeout: 10000 });
  const en = await p.locator('.il-en').allInnerTexts(); await p.click('.lenses .lens:has-text("Code")');
  if (en[1] !== 'Draw it at zero' || en[3] !== 'Draw it at one') throw new Error(en.join(' | ')); return `${en[1]} · ${en[3]}`;
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
await step('an answer given while the code is still re-running is kept', async () => {
  // typing starts a run by itself; Run pressed during it waits its turn, and the answer arrives during that one
  await typeCode('n = sum(range(4000000))\nname = input("Name? ")\nprint("Hi again " + name)\n');
  await p.waitForTimeout(700); await run();
  await p.waitForSelector('.log.asking input', { timeout: 30000 }); await p.fill('.log.asking input', 'Bo'); await p.keyboard.press('Enter');
  await p.waitForFunction(() => /Hi again Bo/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
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
await step('Python’s asyncio really waits, and a tree written as dicts is drawn as a tree', async () => {
  await typeCode('import asyncio\n\nasync def cook(dish, s):\n    await asyncio.sleep(s)\n    print(dish, "ready")\n\nasync def main():\n    await asyncio.gather(cook("soup", 0.3), cook("tea", 0.1))\n    show({"value": 8, "left": {"value": 3, "left": None, "right": None}, "right": None})\n\nasyncio.run(main())\n'); await run();
  await p.waitForFunction(() => /soup ready/.test(document.querySelector('.stage-body')?.innerText || '') || document.querySelector('.stage-body .err-card'), null, { timeout: 60000 });
  const t = await output(); if (!/tea ready\s+soup ready/.test(t)) throw new Error(t.slice(0, 160));
  const tree = await p.locator('.stage-body figure.viz-tree').count(); if (!tree) throw new Error('the dict tree was not drawn as a tree'); return 'tea, then soup; a tree';
});
await step('JavaScript runs', async () => {
  await blankPage('JavaScript'); await typeCode('const xs = [3, 1, 2].sort();\nconsole.log("sorted", xs.join(","));\n'); await run();
  await p.waitForFunction(() => /sorted 1,2,3/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
});
await step('JavaScript waits for its timers and promises', async () => {
  await typeCode('const wait = (ms) => new Promise((r) => setTimeout(r, ms));\nasync function main() {\n  await wait(300);\n  console.log("soup ready");\n}\nmain().then(() => console.log("dinner served"));\nconsole.log("meanwhile");\n'); await run();
  await p.waitForFunction(() => /dinner served/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 30000 });
  const t = await output(); if (!/meanwhile\s+soup ready\s+dinner served/.test(t)) throw new Error(t.slice(0, 160)); return 'meanwhile, soup ready, dinner served';
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
await step('a featured project stays on screen once it’s open', async () => {
  await p.click('.side nav button:has-text("Explore")'); await p.click('.gtabs button:has-text("Code")');
  await p.click('.feat-i:has-text("taxonomy")');
  await p.waitForSelector('.ab-nav', { timeout: 30000 });
  // its code then downloads quietly; that mustn't bring the loading steps back over the project
  const back = await p.evaluate(() => new Promise((r) => { const t0 = Date.now(); const iv = setInterval(() => { const l = !!document.querySelector('.atlas-loading'); if (l || Date.now() - t0 > 5000) { clearInterval(iv); r(l); } }, 40); }));
  if (back) throw new Error('the loading steps came back after the project was on screen');
});
// your own AI agent (electron/agent.cjs): this very app started with --mcp, the way Claude Code or Codex starts it
await step('an AI agent can use Bento: --mcp answers, shows its lesson and runs it', async () => {
  const c = spawn(exe, [...(packaged ? [] : [root]), '--mcp'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = '', n = 0; const w = new Map();
  c.stdout.setEncoding('utf8'); c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); w.get(m.id)?.(m); } });
  const rpc = (method, params) => new Promise((res, rej) => { const id = ++n; const t = setTimeout(() => rej(new Error(`${method}: no answer`)), 60000); w.set(id, (m) => { clearTimeout(t); res(m); }); c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  try {
    if ((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke' } })).result?.serverInfo?.name !== 'bento') throw new Error('no MCP answer');
    const r = await rpc('tools/call', { name: 'show_lesson', arguments: { title: 'Agent check', language: 'python', code: 'show([3, 1, 2])\nprint("agent ok")' } });
    const text = r.result?.content?.[0]?.text || JSON.stringify(r);
    if (!/agent ok/.test(text) || !/bar chart/.test(text)) throw new Error(text.slice(0, 200));
  } finally { c.stdin.end(); c.kill(); }
  return 'lesson shown, code ran';
});
await step('no errors on the page, and nothing blocked by the Content-Security-Policy', async () => { errors.push(...((await p.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('bento:csp')).map((m) => m.name)).catch(() => [])))); if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

await app.close().catch(() => {});
fs.rmSync(profile, { recursive: true, force: true });
console.log(fail ? `\n${fail} check(s) failed. Screenshots: ${OUT}` : '\nBento works on this computer.');
process.exit(fail ? 1 : 0);
