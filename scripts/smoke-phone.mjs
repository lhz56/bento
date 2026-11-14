// Bento on a phone, end to end: the Mac app (hidden, its own profile, a pretend Claude) serves Bento to an iPhone-sized
// WebKit, which pairs the way a person would (the QR code's link) and then uses it: the tabs, Back, a lesson whose
// Python runs on the phone, a new lesson written by the Mac's AI (and the same lesson then in the Mac's own window),
// a project taken apart, a file opened from its code city, and finally being removed in the Mac's Settings.
// On an iPhone also how it moves: Back and the tabs keep your place, a section chip lands on its section, a sheet drags
// away, and (as in the Home Screen app) a swipe from the left edge goes back.
// Nothing reaches a real AI, and the Mac listens on itself only (BENTO_HOST, test builds), never Tailscale or Wi-Fi.
//
//   npx vite build && node scripts/smoke-phone.mjs            an iPhone
//   node scripts/smoke-phone.mjs --ipad                        an iPad (the same checks, the iPad's layout)
//   node scripts/smoke-phone.mjs --packaged                    the test build electron-builder made (BENTO_RELEASE_DIR to point elsewhere)
// WebKit comes from Playwright (npx playwright-core install webkit); WK=/path/to/pw_run.sh picks another build.
import { _electron as electron, webkit, devices } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IPAD = process.argv.includes('--ipad');
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
const PORT = 4937 + (IPAD ? 10 : 0);
const OUT = path.join(root, 'smoke-out'); fs.mkdirSync(OUT, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-phone-'));
fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python', level: 'student' } }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_HOST: '1', BENTO_HOST_PORT: String(PORT), BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-claude.mjs'), BENTO_FAKE_AS: 'claude', BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;

const app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], env, timeout: 90000 });
const mac = await app.firstWindow();
const wk = process.env.WK || ['webkit-2388', 'webkit-2370', 'webkit-2336'].map((d) => path.join(os.homedir(), 'Library/Caches/ms-playwright', d, 'pw_run.sh')).find((f) => fs.existsSync(f));
const browser = await webkit.launch(wk ? { executablePath: wk } : {});
const ctx = await browser.newContext({ ...devices[IPAD ? 'iPad Pro 11' : 'iPhone 15 Pro'] });
// the phone's clipboard is never the real one
await ctx.addInitScript(() => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {}, readText: async () => '' }, configurable: true }); } catch {} sessionStorage.setItem('bento.swipe', '1'); });
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (/Content-Security-Policy/.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 160)}`); });
console.log(`${IPAD ? 'iPad' : 'iPhone'} · WebKit ${browser.version()} · the Mac on 127.0.0.1:${PORT}`);

let fail = 0;
const step = async (label, fn) => {
  const t0 = Date.now();
  try { const note = await fn(); console.log(`✓ ${label}${note ? ` · ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`✗ ${label}: ${String(e.message).split('\n')[0]}`); await p.screenshot({ path: path.join(OUT, `phone-fail-${label.replace(/\W+/g, '-').slice(0, 60)}.png`) }).catch(() => {}); }
};
const must = (ok, why) => { if (!ok) throw new Error(why); };
// ask the Mac until the answer is yes (or time runs out)
const until = async (fn, ms = 10000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 250))) { const v = await mac.evaluate(fn).catch(() => null); if (v) return v; } return null; };
// a finger on the glass: down, along, up (WebKit here won't make real Touch objects, so these carry the same fields)
const swipe = (x0, y0, x1, y1, ms = 180, steps = 10) => p.evaluate(async ([x0, y0, x1, y1, ms, steps]) => {
  const tgt = document.elementFromPoint(x0, y0);
  const fire = (type, x, y) => { const t = { identifier: 1, target: tgt, clientX: x, clientY: y }; const ev = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] }); tgt.dispatchEvent(ev); };
  fire('touchstart', x0, y0);
  for (let i = 1; i <= steps; i++) { await new Promise((r) => setTimeout(r, ms / steps)); fire('touchmove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); }
  fire('touchend', x1, y1);
}, [x0, y0, x1, y1, ms, steps]);
// the page's main scrolling area, and putting it somewhere
const mainScroll = (y) => p.evaluate((y) => { const c = [...document.querySelectorAll('#content *')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20).sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (!c) return null; if (y != null) { c.style.scrollBehavior = 'auto'; c.scrollTop = y; c.dispatchEvent(new Event('scroll')); } return Math.round(c.scrollTop); }, y);
const skipTips = async () => { const s = p.locator('.coach-tip button:has-text("Skip")'); if (await s.count()) await s.first().click({ timeout: 3000 }).catch(() => {}); };
const nav = IPAD ? { tab: async (name) => p.click(`.side nav button:has-text("${name}")`), sub: async (name) => p.click(`.gtabs button:has-text("${name}")`) }
  : { tab: async (name) => p.click(`.ptabs button:has-text("${name}")`), sub: async (name) => p.click(`.pseg button:has-text("${name}")`) };

let st;
await step('the Mac is ready for devices', async () => {
  must(await until(() => window.bento?.host?.get().then((s) => s.on && s.urls.length > 0), 30000), 'the Mac never started listening');
  st = await mac.evaluate(() => window.bento.host.pair());
  must(/^http:\/\/127\.0\.0\.1:\d+\/#pair=[0-9A-Z]{8}$/.test(st.pairUrl || ''), `pair link ${st.pairUrl}`);
  return st.pairUrl.replace(/#pair=.*/, '#pair=…');
});
await step('an unpaired device sees how to pair, and a wrong code is refused', async () => {
  await p.goto(st.pairUrl.replace(/#.*/, ''));
  await p.waitForSelector('.pair', { timeout: 20000 });
  await p.fill('.pair-code', 'ZZZZZZZZ'); await p.click('.pair-go');
  await p.waitForSelector('.pair-err', { timeout: 10000 });
  return await p.locator('.pair-err').innerText();
});
await step('the QR code’s link pairs it, straight into Bento', async () => {
  await p.goto(st.pairUrl);
  await p.waitForSelector(IPAD ? '.side nav' : '.ptabs', { timeout: 30000 });
  // (the QR code's own code; the Home Screen tip may put a new one-time code there on purpose, for Add to Home Screen)
  must(!p.url().includes(st.pairUrl.split('#pair=')[1]), 'the code stayed in the address');
  await until(() => window.bento.host.get().then((x) => x.devices[0]?.online));
  const s = await mac.evaluate(() => window.bento.host.get());
  must(s.devices.length === 1 && s.devices[0].online, `Mac sees ${JSON.stringify(s.devices)}`);
  return `${s.devices[0].name}, connected`;
});
if (!IPAD) await step('the tabs and the sections inside them', async () => {
  await nav.tab('Explore'); await p.waitForSelector('.explore', { timeout: 10000 });
  await nav.sub('Clever ideas'); await p.waitForSelector('.ideas', { timeout: 10000 });
  await nav.tab('Practice'); await nav.tab('You'); await nav.tab('Learn');
  await p.waitForSelector('.home', { timeout: 10000 });
  const h = await p.evaluate(() => [document.querySelector('.ptabs').getBoundingClientRect().bottom, innerHeight]);
  must(Math.abs(h[0] - h[1]) < 2, `the tabs aren't at the bottom: ${h}`);
});
let homeAt = 0;
await step('a built-in lesson: its story, then its Python, run on this device', async () => {
  if (!IPAD) { await mainScroll(400); await p.waitForTimeout(150); homeAt = await mainScroll(); }
  await p.click(IPAD ? '.side-search[aria-label^="Search"]' : '.pbar-btn[aria-label^="Search"]'); await p.keyboard.type('Binary search trees'); await p.waitForTimeout(300);
  await p.locator('.pl-i:has(.pl-l:text-is("Binary search trees"))').first().click();
  await p.waitForSelector('.story-head h1', { timeout: 20000 }); await skipTips();
  if (!IPAD) { await p.click('.pseg button:has-text("Code")'); await p.waitForTimeout(400); }
  await p.locator('.desk button:has-text("Run")').first().click();
  await p.waitForSelector('.stage-body svg, .stage-body .tree, .stage-body .viz', { timeout: 120000 });
});
if (!IPAD) await step('Back returns to where you were, at the same spot; a tab keeps its spot too', async () => {
  await p.click('.pbar-back'); await p.waitForSelector('.home', { timeout: 10000 }); await p.waitForTimeout(300);
  const back = await mainScroll(); must(homeAt > 100 && Math.abs(back - homeAt) < 4, `Home was at ${homeAt}, came back at ${back}`);
  await nav.tab('Path'); await p.waitForTimeout(400); await nav.tab('Learn'); await p.waitForTimeout(300);
  const again = await mainScroll(); must(Math.abs(again - homeAt) < 4, `after another tab, Home was at ${again}`);
  await mainScroll(0); return `${homeAt}px`;
});
let title = '';
await step('asking writes a new lesson with the Mac’s AI, and the Mac shows it too', async () => {
  if (IPAD) await nav.tab('Learn');
  await p.waitForSelector('.cx textarea', { timeout: 20000 });
  await p.click('.cx textarea'); await p.keyboard.type('How does a hash map find things so fast?'); await p.keyboard.press('Enter');
  await p.waitForSelector('.story-head h1', { timeout: 60000 });
  await p.waitForFunction(() => !document.querySelector('.story .dots, .writing'), null, { timeout: 120000 }).catch(() => {});
  title = await p.locator('.story-head h1').innerText();
  await mac.waitForFunction((t) => (JSON.parse(localStorage.getItem('bento.lessons') || '[]')).some((l) => l.title === t && l.status === 'done'), title, { timeout: 20000 });
  return title;
});
await step('a project, taken apart, and a file opened from its code city', async () => {
  if (!IPAD) await p.click('.pbar-back').catch(() => {});
  await nav.tab('Explore'); await nav.sub('Code');
  await p.click('.feat-i:has-text("taxonomy")');
  await p.waitForSelector('.ab-nav', { timeout: 30000 }); await skipTips();
  await p.evaluate(() => document.querySelector('.city')?.scrollIntoView({ block: 'center' }));
  // its code arrives on the Mac in the background; the city's buildings can open files once it has
  await p.waitForFunction(() => document.querySelectorAll('.city .bld').length > 3, null, { timeout: 60000 });
  const b = p.locator('.city .bld').nth(3);
  await b.click({ force: true }); await p.waitForSelector('.cap-f', { timeout: 5000 });
  for (let i = 0; i < 20 && !(await p.locator('.drawer').count()); i++) { await b.click({ force: true }); await p.waitForTimeout(1500); }
  await p.waitForSelector('.drawer', { timeout: 10000 });
  // (on an iPhone a file opens on what it's about; its code is the other tab)
  if (await p.locator('.dr-tabs').count()) await p.click('.dr-tabs button:has-text("Code")');
  await p.waitForFunction(() => /\w/.test(document.querySelector('.drawer .cm-content, .drawer pre, .drawer code')?.textContent || ''), null, { timeout: 90000 });
  return (await p.locator('.drawer').innerText()).split('\n').find((l) => /\.\w+$/.test(l)) || '';
});
if (!IPAD) await step('a file’s sheet drags down and away; a section chip lands on its section', async () => {
  await p.waitForTimeout(500); // (the sheet has finished sliding up)
  await swipe(196, 150, 196, 540); await p.waitForTimeout(700);
  must(!(await p.locator('.drawer').count()), 'the sheet stayed');
  await p.click('.ab-nav button:text-is("Code")'); await p.waitForTimeout(1400);
  const off = await p.evaluate(() => Math.round(document.querySelector('#sec-files').getBoundingClientRect().top - document.querySelector('.atlas-bar').getBoundingClientRect().bottom));
  must(Math.abs(off) < 40 && (await p.locator('.ab-nav button.on').innerText()) === 'Code', `Code landed ${off}px off`);
});
if (!IPAD) await step('a swipe from the left edge goes back, and the page is whole after', async () => {
  await swipe(4, 420, 330, 425, 220); await p.waitForSelector('.explore', { timeout: 10000 }); await p.waitForTimeout(400);
  must(await p.evaluate(() => { const m = document.getElementById('content'); return !m.style.transform && !m.style.visibility; }), 'the page was left moved');
});
await step('nothing went wrong on the page, and nothing was blocked', async () => { must(!errors.length, errors.slice(0, 3).join(' | ')); });
await step('removed in the Mac’s Settings, the device is asked to pair again', async () => {
  const s = await mac.evaluate(() => window.bento.host.get());
  await mac.evaluate((id) => window.bento.host.forget(id), s.devices[0].id);
  await p.waitForSelector('.pair', { timeout: 20000 });
  await p.waitForTimeout(3000);
  must(await p.locator('.pair').count() && (await mac.evaluate(() => window.bento.host.get())).devices.length === 0, 'it found its way back in');
});
await step('a fresh QR code pairs it, even while it holds an old key', async () => {
  await p.evaluate(() => localStorage.setItem('bentoHost.key', 'an-old-key-the-mac-has-forgotten'));
  const fresh = await mac.evaluate(() => window.bento.host.pair());
  await p.goto(fresh.pairUrl.replace('/#', '/?again=1#'));
  await p.waitForSelector(IPAD ? '.side nav' : '.ptabs', { timeout: 30000 });
  must((await mac.evaluate(() => window.bento.host.get())).devices.length === 1, 'the Mac doesn’t see it');
});

await browser.close(); await app.close().catch(() => {});
fs.rmSync(profile, { recursive: true, force: true });
console.log(fail ? `\n${fail} check(s) failed.` : `\nBento works on ${IPAD ? 'an iPad' : 'a phone'}.`);
process.exit(fail ? 1 : 0);
