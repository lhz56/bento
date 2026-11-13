// Asks a real question and watches the lesson arrive, with a pretend Claude (test/fixtures/fake-claude.mjs) standing in
// for the real one: the planning track, the title, the code, the lesson running by itself, the request being counted,
// then a question inside the lesson (a short answer, follow-ups, an optional check that counts on your map).
// Nothing reaches an AI, so it costs nothing and runs anywhere (CI included).
//
//   npx vite build && node scripts/smoke-stream.mjs              the app from this folder
//   node scripts/smoke-stream.mjs --packaged                     the app electron-builder made (BENTO_RELEASE_DIR to point elsewhere)
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
function packagedApp() {
  const rel = process.env.BENTO_RELEASE_DIR || path.join(root, 'release');
  const dirs = fs.existsSync(rel) ? fs.readdirSync(rel) : [];
  if (process.platform === 'darwin') { const d = dirs.find((x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app'))); return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento'); }
  if (process.platform === 'win32') { const d = dirs.find((x) => x.startsWith('win') && x.endsWith('unpacked')); return d && path.join(rel, d, 'Bento.exe'); }
  const d = dirs.find((x) => x.startsWith('linux') && x.endsWith('unpacked'));
  return d && ['bento', 'Bento'].map((n) => path.join(rel, d, n)).find((f) => fs.existsSync(f));
}
const exe = packaged ? packagedApp() : createRequire(import.meta.url)('electron');
if (!exe || !fs.existsSync(exe)) { console.error('✗ can’t find the app'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-stream-'));
fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python', level: 'student' } }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-claude.mjs'), BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1', FAKE_AI_THINK_MS: '2500', FAKE_AI_STEP_MS: '90' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], env, timeout: 90000 });
const p = await app.firstWindow();
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (/Content-Security-Policy/.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 160)}`); });
let fail = 0;
const step = async (label, fn) => { const t0 = Date.now(); try { const note = await fn(); console.log(`✓ ${label}${note ? ` · ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); } catch (e) { fail++; console.log(`✗ ${label}: ${String(e.message).split('\n')[0]}`); } };

await step('Home is ready to ask', async () => { await p.waitForSelector('.cx textarea', { timeout: 60000 }); });
await step('asking starts a lesson and shows its plan as a picture', async () => {
  await p.click('.cx textarea'); await p.keyboard.type('How does a hash map find things so fast?'); await p.keyboard.press('Enter');
  await p.waitForSelector('.wr .wr-node.now', { timeout: 10000 });
  return await p.locator('.wr-now').innerText();
});
await step('the lesson streams in: title, words and code', async () => {
  await p.waitForSelector('.story-head h1:not(.sr-only):has-text("hash map")', { timeout: 30000 });
  await p.waitForSelector('.cm-content:has-text("hook_for")', { timeout: 30000 });
  return await p.locator('.story-head h1:not(.sr-only)').innerText();
});
await step('when it’s written, its code runs by itself', async () => {
  await p.waitForFunction(() => /red coat/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 60000 });
});
await step('the new word is saved to Your words', async () => {
  await p.waitForFunction(() => /hash function/i.test(localStorage.getItem('bento.progress') || ''), null, { timeout: 10000 });
});
await step('the request is counted in AI use', async () => {
  const u = await p.evaluate(() => window.bento.usage());
  const today = u.days[u.days.length - 1]; if (!today || today.lessons < 1) throw new Error(JSON.stringify(today));
  return `${today.lessons} lesson today`;
});
await step('a question inside the lesson gets a short answer, with what to ask next', async () => {
  await p.click('#followup'); await p.keyboard.type('Why is that so fast?'); await p.keyboard.press('Enter');
  await p.waitForSelector('.qa .qa-a:has-text("hook")', { timeout: 30000 });
  const next = await p.locator('.qa-next button').count(); if (next !== 2) throw new Error(`${next} follow-ups`);
  // the question settles near the top, its answer below (the scroll is smooth: slower machines take longer than a frame or two)
  const settled = () => p.waitForFunction(() => { const q = [...document.querySelectorAll('.qa')].pop().getBoundingClientRect(); return q.top >= 0 && q.top < innerHeight / 2; }, null, { timeout: 5000 }).then(() => true, () => false);
  if (!(await settled())) throw new Error('the answer is off screen');
  return `${next} follow-ups, Simpler and Show an example`;
});
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
await step('its optional check counts a right answer', async () => {
  await p.click('.qcheck .qc-row button:has-text("A hook number")'); await p.waitForSelector('.qcheck.ok', { timeout: 5000 });
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('bento.lessons') || '[]').some((l) => (l.checks || []).some((c) => c.ok)), null, { timeout: 5000 });
});
await step('“Simpler” asks again and brings the new answer into view', async () => {
  await p.click('.qa .qa-chip:has-text("Simpler")');
  await p.waitForFunction(() => document.querySelectorAll('.qa').length === 2 && !document.querySelector('.qa:last-child .dots'), null, { timeout: 30000 });
  const settled2 = await p.waitForFunction(() => { const q = [...document.querySelectorAll('.qa')].pop().getBoundingClientRect(); return q.top >= 0 && q.top < innerHeight / 2; }, null, { timeout: 5000 }).then(() => true, () => false);
  if (!settled2) throw new Error('the new answer is off screen');
});
await step('no errors on the page', async () => { if (errors.length) throw new Error(errors.join(' | ')); });

await app.close();
fs.rmSync(profile, { recursive: true, force: true });
console.log(fail ? `\n${fail} check${fail > 1 ? 's' : ''} failed.` : '\nLessons stream in and run.');
process.exit(fail ? 1 : 0);
