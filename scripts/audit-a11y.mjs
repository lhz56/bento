// Every main screen, in light and dark, checked with axe-core (WCAG AA, contrast included): Home, the path, Explore,
// clever ideas, puzzles, the playgrounds, the map, words, a project's Atlas, a lesson, settings, ⌘K, the model picker,
// and the sidebar closed. It sets up what it needs itself (a pretend AI writes the lesson), so it costs nothing.
//
//   npx vite build && node scripts/audit-a11y.mjs        the app from this folder
//   node scripts/audit-a11y.mjs --packaged               the app electron-builder made
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const packaged = process.argv.includes('--packaged');
function packagedApp() {
  const rel = process.env.BENTO_RELEASE_DIR || path.join(root, 'release');
  const dirs = fs.existsSync(rel) ? fs.readdirSync(rel) : [];
  if (process.platform === 'darwin') { const d = dirs.find((x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app'))); return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento'); }
  if (process.platform === 'win32') { const d = dirs.find((x) => x.startsWith('win') && x.endsWith('unpacked')); return d && path.join(rel, d, 'Bento.exe'); }
  const d = dirs.find((x) => x.startsWith('linux') && x.endsWith('unpacked'));
  return d && ['bento', 'Bento'].map((n) => path.join(rel, d, n)).find((f) => fs.existsSync(f));
}
const exe = packaged ? packagedApp() : require('electron');
if (!exe || !fs.existsSync(exe)) { console.error('✗ can’t find the app'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-a11y-'));
fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python', level: 'student' } }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-claude.mjs'), BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1', FAKE_AI_THINK_MS: '300', FAKE_AI_STEP_MS: '20' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], env, timeout: 90000 });
const p = await app.firstWindow(); await p.waitForSelector('.side', { timeout: 60000 });
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

// what the screens need: a lesson of your own (written by the pretend AI, which also fills in a little of the map)
await p.click('.cx textarea'); await p.keyboard.type('How does a hash map find things so fast?'); await p.keyboard.press('Enter');
await p.waitForFunction(() => /red coat/.test(document.querySelector('.stage-body')?.innerText || ''), null, { timeout: 60000 });

let bad = 0; const found = {};
// every screen, light and dark, must also load with nothing blocked by the Content-Security-Policy
const csp = []; p.on('console', (m) => { if (/Content-Security-Policy/.test(m.text())) csp.push(m.text().slice(0, 160)); });
const audit = async (name, theme) => {
  await p.waitForTimeout(700);
  if (!(await p.evaluate(() => !!window.axe))) await p.evaluate(AXE + '\n;0');
  const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: true } } }))
    .violations.map((x) => ({ id: x.id, n: x.nodes.length, ex: x.nodes.slice(0, 2).map((n) => n.target.join(' ')) })));
  if (v.length) bad++;
  for (const x of v) (found[x.id] ||= []).push(`${theme}:${name} → ${x.ex.join(' · ')}`);
  console.log(`${`${theme}: ${name}`.padEnd(26)} ${v.length ? v.map((x) => `✗ ${x.id}×${x.n}`).join(', ') : '✓'}`);
};
const nav = async (group, tab) => { await p.click(`.side nav button:has-text("${group}")`); if (tab) await p.click(`.gtabs button:has-text("${tab}")`); };
const pass = async (theme) => {
  await nav('Learn'); await audit('home', theme);
  await nav('Path'); await audit('path', theme);
  await nav('Explore', 'Code'); await p.waitForTimeout(1200); await audit('explore', theme);
  await nav('Explore', 'Clever ideas'); await audit('clever ideas', theme);
  await nav('Practice', 'Puzzles'); await audit('puzzles', theme);
  await p.click('.pz-chip:has(.pz-name:text-is("Two Sum"))'); await p.waitForSelector('.pz-card'); await audit('a puzzle', theme);
  await nav('Practice', 'Playgrounds'); await p.waitForTimeout(1200); await audit('sql', theme);
  await p.click('.shelf:has-text("Terminal & Git")'); await audit('git', theme);
  await p.click('.shelf:has-text("Design for a billion")'); await audit('design', theme);
  await nav('You', 'Your map'); await audit('map', theme);
  await p.locator('.tm-cell').first().click(); await audit('map, a skill open', theme); await p.click('.tm-x');
  await nav('You', 'Your words'); await audit('words', theme);
  await nav('Explore', 'Code'); await p.click('.feat-i:has-text("taxonomy")');
  await p.waitForSelector('.ab-nav', { timeout: 30000 }); await audit('a project (Atlas)', theme);
  await p.click('.side .recent .rl-main:has-text("hash map")'); await p.waitForSelector('.story-head h1:not(.sr-only)'); await audit('a lesson', theme);
  await p.keyboard.press(`${MOD}+,`); await p.waitForSelector('.settings'); await audit('settings', theme); await p.keyboard.press('Escape');
  await p.keyboard.press(`${MOD}+k`); await audit('⌘K', theme); await p.keyboard.press('Escape');
  await p.click('.model-pick'); await audit('model picker', theme); await p.keyboard.press('Escape');
  await p.keyboard.press(`${MOD}+\\`); await audit('sidebar closed', theme); await p.keyboard.press(`${MOD}+\\`);
};
await pass('light');
await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(500);
await pass('dark');

await app.close();
fs.rmSync(profile, { recursive: true, force: true });
if (bad) { console.log('\nWhat to fix:'); for (const [id, where] of Object.entries(found)) console.log(`  ${id}: ${where.slice(0, 4).join(' | ')}`); }
csp.push(...(await p.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('bento:csp')).map((m) => m.name)).catch(() => [])));
if (csp.length) { bad++; console.log(`✗ blocked by the Content-Security-Policy: ${[...new Set(csp)].slice(0, 4).join(' | ')}`); } else console.log('✓ nothing on any screen was blocked by the Content-Security-Policy');
console.log(bad ? `\n${bad} screen${bad > 1 ? 's' : ''} need work.` : '\nEvery screen passes, light and dark.');
process.exit(bad ? 1 : 0);
