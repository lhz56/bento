// Screen recordings of the real app for the README and the website: the app, hidden and off-screen, with a throwaway
// profile, driven like a person would (a visible pointer that glides and clicks, typing at a human pace) and filmed
// through Chromium's own screencast. Lessons come from a pretend AI (test/fixtures), so no plan is ever used.
//
//   npx vite build && node scripts/record-media.mjs <scene> [--profile dir] [--out dir]
//   scenes: see SCENES below; every clip is an H.264 .mp4 (and a .jpg poster) in --out
//   --profile: a copy of a Bento data folder to start from (the Atlas scenes need one where pingdotgg/t3code was
//   taken apart; a recording never changes the original)
import { _electron as electron } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const scene = process.argv[2];
const OUT = path.resolve(arg('--out', path.join(root, 'site', 'media')));
const W = Number(arg('--w', 1440)), H = Number(arg('--h', 900));
fs.mkdirSync(OUT, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-rec-'));
const profile = path.join(tmp, 'p');
const seed = arg('--profile');
if (seed) fs.cpSync(seed, profile, { recursive: true }); else { fs.mkdirSync(profile); fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python' } })); }
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_NO_GH: '1', BENTO_NO_AGENT: '1',
  BENTO_FAKE_AI: process.env.BENTO_FAKE_AI || path.join(root, 'test/fixtures/fake-ai.mjs'), BENTO_FAKE_AS: 'claude',
  BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh', FAKE_AI_THINK_MS: process.env.FAKE_AI_THINK_MS || '900', FAKE_AI_STEP_MS: process.env.FAKE_AI_STEP_MS || '90' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [root, '--force-device-scale-factor=2'], env, timeout: 90000 });
const p = await app.firstWindow(); await p.waitForSelector('.side', { timeout: 60000 });
const CLIP = () => { let c = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { c = String(t); }, readText: async () => c } }); };
await app.context().addInitScript(CLIP); await p.evaluate(CLIP);
await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H]);
if (process.argv.includes('--dark')) await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
if (!process.argv.includes('--tips')) { await p.evaluate(() => { for (const k of ['lesson', 'atlas']) localStorage.setItem(`bento.coach.${k}`, '1'); }); await p.reload(); await p.waitForSelector('.side', { timeout: 60000 }); }
await p.waitForTimeout(800);

// a pointer people can follow: a macOS-style arrow that glides, and a ring where it clicks
const POINTER = () => {
  if (window.__cur) return;
  // an off-screen window can't draw macOS's see-through sidebar or its traffic lights: stand-ins that look the same
  const st = document.createElement('style');
  st.textContent = 'html{background:#e9e4dc!important}@media (prefers-color-scheme:dark){html{background:#1d1b20!important}}';
  document.head.appendChild(st);
  const tl = document.createElement('div');
  tl.style.cssText = 'position:fixed;left:13px;top:13px;display:flex;gap:8px;z-index:2147483640;pointer-events:none';
  tl.innerHTML = ['#ff5f57', '#febc2e', '#28c840'].map((c) => `<i style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15)"></i>`).join('');
  document.documentElement.appendChild(tl);
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))';
  c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.7 6.3 3-1.3-2.7-6.2h6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
  let x = innerWidth * 0.62, y = innerHeight * 0.7; const put = () => { c.style.transform = `translate(${x - 5}px,${y - 2.5}px)`; }; put();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  window.__cur = {
    move(tx, ty, ms) { const sx = x, sy = y, t0 = performance.now(); return new Promise((r) => { const f = (now) => { const k = Math.min(1, (now - t0) / ms), e = ease(k); x = sx + (tx - sx) * e; y = sy + (ty - sy) * e; put(); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); },
    press() { const r = document.createElement('div'); r.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(232,120,40,.28);border:2px solid rgba(232,120,40,.7);z-index:2147483646;pointer-events:none;transform:scale(.4);opacity:1;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .45s`; document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.transform = 'scale(1.25)'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 500); },
    hide() { c.style.opacity = '0'; }, show() { c.style.opacity = '1'; },
  };
};
await p.evaluate(POINTER);
const loc = (s) => (typeof s === 'string' ? p.locator(s).first() : s);
async function glide(s, { ms = 750, dx = 0.5, dy = 0.5 } = {}) {
  const l = loc(s); await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox(); if (!b) throw new Error(`can’t see ${s}`);
  const x = b.x + b.width * dx, y = b.y + b.height * dy; await p.evaluate(POINTER);
  await p.evaluate(([x, y, ms]) => window.__cur.move(x, y, ms), [x, y, ms]); await p.mouse.move(x, y); return { x, y };
}
async function click(s, o) { await glide(s, o); await p.waitForTimeout(120); await p.evaluate(() => window.__cur.press()); await loc(s).click(); await p.waitForTimeout(250); }
async function type(text, delay = 55) { for (const ch of text) { await p.keyboard.insertText(ch); await p.waitForTimeout(delay + Math.random() * 40); } }
const wait = (ms) => p.waitForTimeout(ms);

// filming: every frame Chromium paints, with its time, then made into a steady 30 fps video
const cdp = await p.context().newCDPSession(p);
let frames = [], filming = false, dir = '';
cdp.on('Page.screencastFrame', async (f) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); if (!filming) return; const n = frames.length; const file = path.join(dir, `f${String(n).padStart(5, '0')}.jpg`); fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ file, t: f.metadata.timestamp }); });
async function film(name, fn) {
  dir = fs.mkdtempSync(path.join(tmp, 'frames-')); frames = []; filming = true;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  // a still page sends no frames: nudge the compositor so the first and last moments are filmed too
  const keep = setInterval(() => p.evaluate(() => { document.documentElement.style.outline = document.documentElement.style.outline ? '' : '0px solid transparent'; }).catch(() => {}), 1000 / 30);
  try { await fn(); } finally { clearInterval(keep); filming = false; await cdp.send('Page.stopScreencast').catch(() => {}); }
  if (frames.length < 2) throw new Error('no frames');
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? f.t + 1 / 30) - f.t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const mp4 = path.join(OUT, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', `fps=30,scale=${Math.min(W * 2, 2400)}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg failed');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.2', '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(OUT, `${name}.jpg`)]);
  const secs = (frames.at(-1).t - frames[0].t).toFixed(1);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✓ ${name}.mp4 · ${secs}s · ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB`);
}
async function shot(name) { await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`✓ ${name}.png`); }
const nav = (n) => click(`.side nav button:has-text("${n}")`);

const SCENES = {
  // stills of every main screen, to look at before filming
  async stills() {
    await shot('s-home'); await nav('Explore'); await wait(800); await shot('s-explore');
    await nav('Practice'); await wait(800); await shot('s-practice'); await nav('Path'); await wait(800); await shot('s-path');
    await nav('You'); await wait(800); await shot('s-you'); await nav('Learn'); await wait(500);
  },
  // Home → a question → the lesson writes itself → it runs and draws → the plain-English lens
  async ask({ film }) {
    await film('ask', async () => {
      await wait(700); await click('.composer.cx textarea'); await type('Why is a sorted list so fast to search?');
      await wait(300); await p.keyboard.press('Enter');
      await p.waitForSelector('.story-head h1:not(.sr-only)', { timeout: 20000 });
      await p.waitForFunction(() => !document.querySelector('.writing'), null, { timeout: 30000 }).catch(() => {});
      await wait(1200); await click('.act.run'); await wait(2600);
      await click('.lenses button:has-text("Side by side")'); await wait(2400);
      await click('.lenses button:has-text("Code")'); await wait(800);
    });
  },
  // a real open-source app taken apart: the big picture, one part up close, the code city, a journey, the toolbelt
  async atlas({ film }) {
    await film('atlas', async () => {
      await wait(500); await click('.side .recent .rl-main:has-text("t3code")'); await p.waitForSelector('.bigpic', { timeout: 30000 }); await wait(3200);
      await glide('.bigpic >> text=The local server'); await wait(500); await click('.bigpic >> text=The local server'); await wait(3000);
      await p.keyboard.press('Escape'); await wait(600);
      await click('.ab-nav button:has-text("Anatomy")'); await wait(2200);
      const j = p.locator('button:has-text("When you send a task from the phone")').first(); if (await j.count()) { await click(j); await wait(5200); }
      await click('.ab-nav button:has-text("Toolbelt")'); await wait(3000);
    });
  },
  // a famous engineering trick you can run: Discord's ring
  async idea({ film }) {
    await nav('Explore'); await click('.gtabs button:has-text("Clever ideas")'); await wait(900);
    await film('idea', async () => {
      await wait(600); const card = p.locator('.idea-card, .idea-hero').filter({ hasText: 'Discord' }).first(); await card.scrollIntoViewIfNeeded(); await wait(500); await click(card); await p.waitForSelector('.story-head h1:not(.sr-only)'); await wait(1800);
      await click('.act.run'); await wait(3800);
      await click('text=the fragile part'); await wait(2200);
      await click('.lenses button:has-text("Plain words")'); await wait(2600);
    });
  },
  // practice: how long at a billion, then a live race
  async practice({ film }) {
    await nav('Practice'); await wait(900);
    await film('practice', async () => {
      await wait(500); const r = p.locator('.puzzles input[type=range], input[aria-label="how many items"]').first(); const b = await r.boundingBox();
      await glide(r, { dx: 0.27 }); await p.evaluate(() => window.__cur.press()); await p.mouse.down();
      for (let i = 0; i <= 30; i++) { const x = b.x + b.width * (0.27 + 0.7 * i / 30); await p.evaluate(([x, y]) => window.__cur.move(x, y, 40), [x, b.y + b.height / 2]); await p.mouse.move(x, b.y + b.height / 2); await wait(70); }
      await p.mouse.up(); await wait(1600);
      await click('text=Sorting race'); await wait(7000);
    });
  },
  async atlasStills() {
    await click('.side .recent .rl-main:has-text("t3code")'); await p.waitForSelector('.ab-nav', { timeout: 30000 }); await wait(2500); await shot('a-overview');
    for (const s of ['Anatomy', 'Toolbelt', 'Hot spots', 'Files', 'Growth']) { const b = p.locator(`.ab-nav button:has-text("${s}")`).first(); if (await b.count()) { await click(b); await wait(2500); await shot(`a-${s.replace(/\W+/g, '').toLowerCase()}`); } }
  },
  async moreStills() {
    await nav('Explore'); await click('.gtabs button:has-text("Clever ideas")'); await wait(1200); await shot('i-ideas');
    await click('.idea-card >> nth=2'); await p.waitForSelector('.story-head h1:not(.sr-only)'); await wait(1500); await click('.act.run'); await wait(4000); await shot('i-idea-lesson');
    await nav('Practice'); await wait(1200); await shot('pr-practice');
    await click('.side .recent .rl-main:has-text("Recursion")'); await wait(1500); await click('.act.run'); await wait(5000); await shot('l-lesson');
  },
};
try {
  if (!SCENES[scene]) throw new Error(`which scene? ${Object.keys(SCENES).join(', ')}`);
  await SCENES[scene]({ film, shot });
} catch (e) { console.error('✗', e.message.split('\n')[0]); await p.screenshot({ path: path.join(OUT, `fail-${scene}.png`) }).catch(() => {}); process.exitCode = 1; }
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
