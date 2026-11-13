// The guard rails, checked in the real app (hidden, a throwaway profile, no AI): what a page can and can't reach,
// the menu bar, getting back from a crashed page, saying "what's new" once after an update, and decorative motion
// resting while nobody is looking.
//
//   npx vite build && node scripts/smoke-guards.mjs        the app from this folder
//   node scripts/smoke-guards.mjs --packaged               the app electron-builder made (BENTO_RELEASE_DIR to point elsewhere)
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

// a little project to open: one real file, a link to a file outside it, a linked folder leading outside it
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-guards-'));
const proj = path.join(tmp, 'proj'), outside = path.join(tmp, 'outside');
fs.mkdirSync(path.join(proj, 'src'), { recursive: true }); fs.mkdirSync(outside);
fs.writeFileSync(path.join(outside, 'key'), 'SECRET'); fs.writeFileSync(path.join(proj, 'src', 'a.py'), 'print(1)');
let links = true; try { fs.symlinkSync(path.join(outside, 'key'), path.join(proj, 'leak')); fs.symlinkSync(outside, path.join(proj, 'docs'), 'dir'); } catch { links = false; } // Windows may not allow links

const profile = path.join(tmp, 'profile'); fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true } }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], env, timeout: 90000 });
let p = await app.firstWindow(); await p.waitForSelector('.side', { timeout: 60000 });
let fail = 0;
const step = async (label, fn) => { try { const note = await fn(); console.log(`✓ ${label}${note ? ` · ${note}` : ''}`); } catch (e) { fail++; console.log(`✗ ${label}: ${String(e.message).split('\n')[0]}`); } };
const must = (ok, why) => { if (!ok) throw new Error(why); };
const call = (fn, arg) => p.evaluate(fn, arg).then((v) => ({ v }), (e) => ({ e: String(e.message || e) }));

const REFUSED = /didn’t look right/; // what Bento says to a request that isn't allowed
await step('a project folder opens and its own files read', async () => {
  // "Open a folder…", with the dialog answered for it (a person would pick the folder)
  await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, proj);
  must((await call(() => window.bento.openFolder())).v?.root === proj, 'didn’t open');
  must((await call((x) => window.bento.readFile(x, 'src/a.py'), proj)).v?.includes('print'), 'couldn’t read its file');
});
await step('nothing outside it can be read: ../, or links that lead out', async () => {
  must(REFUSED.test((await call((x) => window.bento.readFile(x, '../outside/key'), proj)).e || ''), '../ was allowed');
  if (links) {
    must(REFUSED.test((await call((x) => window.bento.readFile(x, 'leak'), proj)).e || ''), 'a link to a file outside was followed');
    must(REFUSED.test((await call((x) => window.bento.readFile(x, 'docs/key'), proj)).e || ''), 'a linked folder outside was followed');
  }
  return links ? 'links too' : 'links not testable here';
});
await step('a path the page writes itself can’t pass for a dropped file', async () => {
  for (const x of [path.join(os.homedir(), '.ssh', 'id_rsa'), path.join(os.homedir(), '.config', 'gh', 'hosts.yml'), proj]) {
    must(/Drop a file from Finder/.test((await call((f) => window.bento.dropOpen(f), x)).e || ''), `${x} was read`);
  }
});
await step('the whole disk and the home folder can’t be opened as a project', async () => {
  must((await call((x) => window.bento.atlasReopen(x), path.parse(proj).root)).v === false, 'the disk reopened');
  must((await call((x) => window.bento.atlasReopen(x), os.homedir())).v === false, 'home reopened');
});
await step('repo names are owner/name, never ../..', async () => { must(REFUSED.test((await call(() => window.bento.ghTree('../..'))).e || ''), '../.. accepted'); });
await step('requests of the wrong shape are refused in plain words', async () => {
  const r = await Promise.all([call(() => window.bento.readFile(42, {})), call(() => window.bento.storeSet('not-ours', 1)), call(() => window.bento.ghSearch('x'.repeat(5000))), call(() => window.bento.siteInspect('http://127.0.0.1:22/'))]);
  must(r.slice(0, 3).every((x) => REFUSED.test(x.e || '')), r.map((x) => x.e || 'allowed').join(' | '));
  must(/public websites/.test(r[3].e || ''), `a local address was fetched: ${r[3].e || 'allowed'}`);
  must(r.every((x) => !/Error invoking remote method/.test(x.e || '')), 'technical wording reached the page');
});
await step('a lesson page is walled off from Bento', async () => {
  const id = (await call(() => window.bento.playPut('<html><head></head><body>x</body></html>', 'guard'))).v;
  const r = await p.evaluate(() => new Promise((res) => { const f = document.createElement('iframe'); f.src = 'play://l-guard/'; f.onload = () => { let o; try { o = typeof f.contentWindow.bento; } catch { o = 'cross-origin'; } f.remove(); res(o); }; document.body.appendChild(f); }));
  must(id && (r === 'cross-origin' || r === 'undefined'), `the page saw ${r}`);
});
await step('Bento’s own files can’t be used to reach files beside them', async () => {
  // app://bento serves only dist/: an escaped "../" (or a folder named like it, "dist-evil") must never get out
  const r = await p.evaluate(() => Promise.all(['..%2f..%2fpackage.json', '%2e%2e/%2e%2e/package.json', '..%5c..%5cpackage.json', 'index.html'].map((u) => fetch(`app://bento/${u}`).then((x) => x.status, () => 'refused'))));
  must(r.slice(0, 3).every((x) => x === 403 || x === 'refused' || x === 404) && r[3] === 200, r.join(' '));
  return r.join(' ');
});
await step('the window can’t be sent to another page', async () => {
  const before = p.url(); await p.evaluate(() => { location.href = 'file:///etc/hosts'; }).catch(() => {}); await p.waitForTimeout(800);
  must(p.url() === before, p.url());
});
await step('the menu bar has Bento’s commands, and no Electron links or DevTools', async () => {
  const items = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.flatMap((m) => m.submenu.items.map((i) => i.label)));
  const all = items.join(' | ');
  for (const want of ['Settings…', 'Search Everything', 'Keyboard Shortcuts', 'Report a Problem…']) must(all.includes(want), `no ${want}`);
  must(!/Learn More|Documentation|Community Discussions|Toggle Developer Tools|Reload/.test(all), 'Electron items left in');
});
await step('menu commands reach the page, without doubling up a shortcut', async () => {
  const send = (a) => app.evaluate(({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send('menu', a), a);
  await send('search'); await p.waitForSelector('.pal', { timeout: 3000 }); await p.keyboard.press('Escape');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await p.keyboard.press(`${mod}+\\`); await send('sidebar'); await p.waitForTimeout(300);
  must(await p.locator('.side-open').count() === 1, 'the sidebar toggled twice'); await p.keyboard.press(`${mod}+\\`);
});
await step('decorative motion rests after 45 s without a touch, and wakes on the first move', async () => {
  await p.click('.side nav button:has-text("Learn")');
  const play = () => p.evaluate(() => getComputedStyle(document.querySelector('.if-track')).animationPlayState);
  must(await play() === 'running', 'not moving to begin with');
  await p.waitForTimeout(50000); must(await play() === 'paused', 'still moving after 45 s');
  await p.mouse.move(300, 300); await p.waitForTimeout(200); must(await play() === 'running', 'didn’t wake up');
});
await step('after an update, “What’s new” shows once', async () => {
  await p.evaluate(() => localStorage.setItem('bento.seenVersion', '0.0.1')); await p.reload(); await p.waitForSelector('.side'); await p.waitForTimeout(600);
  must(/What’s new in/.test(await p.locator('.upd-pill.fresh').innerText().catch(() => '')), 'not shown');
  await p.click('.upd-pill.fresh .upd-x'); await p.reload(); await p.waitForSelector('.side'); await p.waitForTimeout(600);
  must(await p.locator('.upd-pill.fresh').count() === 0, 'shown again');
});
await step('a crashed page comes back by itself, and the crash is logged', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  await new Promise((r) => setTimeout(r, 3500));
  const back = await app.evaluate(async ({ BrowserWindow }) => { const wc = BrowserWindow.getAllWindows()[0].webContents; return !wc.isCrashed() && await wc.executeJavaScript("!!document.querySelector('.side')"); });
  must(back, 'still crashed');
  const log = path.join(profile, 'logs', 'main.log'); must(fs.existsSync(log) && /page gone/.test(fs.readFileSync(log, 'utf8')), 'not logged');
});

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} guard${fail > 1 ? 's' : ''} failed.` : '\nThe guard rails hold.');
process.exit(fail ? 1 : 0);
