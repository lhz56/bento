// Bento on an iPhone, filmed for the README and the website: the Mac app (hidden, a throwaway profile, a pretend AI)
// serves Bento to an iPhone-sized WebKit that pairs like the Bento Code app does. WebKit can't stream its screen, so
// time is stepped by hand: every frame, the page's clock and every animation move on 1/30 s, then a picture is taken.
// The result is smooth however slow the pictures are.
//
//   npx vite build && node scripts/record-phone.mjs <scene> [--profile dir] [--out dir] [--dark]
//   --profile: a copy of a Bento data folder to start from (the Atlas scenes need one where pingdotgg/t3code was
//   taken apart; a recording never changes the original)
import { _electron as electron, webkit, devices } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const scene = process.argv[2];
const OUT = path.resolve(arg('--out', path.join(root, 'site', 'media'))); fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-recp-'));
const profile = path.join(tmp, 'p');
if (arg('--profile')) fs.cpSync(arg('--profile'), profile, { recursive: true }); else { fs.mkdirSync(profile); fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python' } })); }
const PORT = 4947;
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_HOST: '1', BENTO_HOST_PORT: String(PORT), BENTO_NO_AGENT: '1',
  BENTO_FAKE_AI: process.env.BENTO_FAKE_AI || path.join(root, 'test/fixtures/fake-ai.mjs'), BENTO_FAKE_AS: 'claude', BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [root], env, timeout: 90000 });
const mac = await app.firstWindow();
await mac.waitForFunction(() => window.bento?.host, null, { timeout: 30000 });
await mac.waitForFunction(() => window.bento.host.get().then((s) => s.on), null, { timeout: 30000 });
const st = await mac.evaluate(() => window.bento.host.pair());
const wk = process.env.WK || ['webkit-2388', 'webkit-2370'].map((d) => path.join(os.homedir(), 'Library/Caches/ms-playwright', d, 'pw_run.sh')).find((f) => fs.existsSync(f));
const browser = await webkit.launch(wk ? { executablePath: wk } : {});
const dev = devices['iPhone 15 Pro'];
const ctx = await browser.newContext({ ...dev, userAgent: `${dev.userAgent} BentoApp/1.0`, viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, colorScheme: process.argv.includes('--dark') ? 'dark' : 'light' });
const p = await ctx.newPage();
await p.goto(st.pairUrl);
await p.waitForSelector('.home, .sheet, .app', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);

// a fingertip people can follow
const FINGER = () => { if (window.__dot) return; const st = document.createElement('style'); st.textContent = '::-webkit-scrollbar{display:none!important;width:0!important}*{scrollbar-width:none!important}'; document.head.appendChild(st); const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid rgba(0,0,0,.18);box-shadow:0 2px 10px rgba(0,0,0,.18);z-index:2147483647;pointer-events:none;opacity:0;transform:scale(.6);transition:opacity .15s,transform .15s'; document.documentElement.appendChild(d); window.__dot = d; };
// stepped time: the page's clock (timers, requestAnimationFrame) and every animation and transition, frame by frame
await p.clock.install();
const FRAME = 1000 / 30;
let frames = 0, filming = false, dir = '';
async function frame() {
  await p.clock.runFor(FRAME);
  await p.evaluate((dt) => { window.__vt = (window.__vt || 0) + dt; for (const a of document.getAnimations()) { if (a.__s == null) { a.__s = window.__vt - (Number(a.currentTime) || 0); a.pause(); } const d = a.effect?.getComputedTiming?.().endTime; let t = window.__vt - a.__s; if (Number.isFinite(d) && t > d) t = d; a.currentTime = t; } }, FRAME);
  if (filming) await p.screenshot({ path: path.join(dir, `f${String(frames++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
}
const wait = async (ms) => { for (let i = 0; i < Math.round(ms / FRAME); i++) await frame(); };
async function tap(sel, { hold = 160 } = {}) {
  const l = typeof sel === 'string' ? p.locator(sel).first() : sel; await l.scrollIntoViewIfNeeded().catch(() => {}); const b = await l.boundingBox(); if (!b) throw new Error(`can’t see ${sel}`);
  const x = b.x + b.width / 2, y = b.y + b.height / 2; await p.evaluate(FINGER);
  await p.evaluate(([x, y]) => { const d = window.__dot; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.opacity = '1'; d.style.transform = 'scale(1)'; }, [x, y]);
  await wait(hold); await l.tap().catch(() => l.click()); await p.evaluate(() => { const d = window.__dot; d.style.opacity = '0'; d.style.transform = 'scale(1.3)'; }); await wait(200);
}
// a thumb's swipe up on whatever scrolls under (x, y)
async function swipe(x, y, dy, ms = 500) {
  await p.evaluate(FINGER); const n = Math.round(ms / FRAME);
  const el = await p.evaluateHandle(([x, y]) => { let e = document.elementFromPoint(x, y); while (e && !(e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; return e || document.scrollingElement; }, [x, y]);
  for (let i = 1; i <= n; i++) { const k = i / n, e = 1 - Math.pow(1 - k, 3); await p.evaluate(([el, x, y, top]) => { el.scrollTop = top; const d = window.__dot; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.opacity = '1'; d.style.transform = 'scale(1)'; }, [el, x, y - dy * k, (await el.evaluate((e) => e.__st ??= e.scrollTop)) + dy * e]); await frame(); }
  await el.evaluate((e) => { delete e.__st; }); await p.evaluate(() => { window.__dot.style.opacity = '0'; }); await wait(150);
}
async function film(name, fn) {
  dir = fs.mkdtempSync(path.join(tmp, 'frames-')); frames = 0; filming = true;
  try { await fn(); } finally { filming = false; }
  const mp4 = path.join(OUT, `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(dir, 'f%05d.jpg'), '-vf', 'scale=786:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg failed');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, 'f00010.jpg'), '-vf', 'scale=786:-2', '-q:v', '3', path.join(OUT, `${name}.jpg`)]);
  console.log(`✓ ${name}.mp4 · ${(frames / 30).toFixed(1)}s · ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB`);
  fs.rmSync(dir, { recursive: true, force: true });
}
const shot = async (name) => { await wait(300); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`✓ ${name}.png`); };

const SCENES = {
  // the iPhone: take apart a real app with a thumb
  async atlas({ film }) {
    await film('phone-atlas', async () => {
      await wait(900); await tap(p.getByRole('button', { name: 'Explore' }).last()); await wait(1300);
      await tap(p.locator('text=pingdotgg/t3code').first()); await wait(2600);
      await swipe(196, 640, 420, 650); await wait(900); await swipe(196, 640, 420, 650); await wait(1400);
      await tap(p.locator('text=The local server').first()); await wait(3200);
      await p.keyboard.press('Escape'); await wait(900);
      await swipe(196, 640, 520, 700); await wait(1800);
    });
  },
  async atlasTry() {
    await p.evaluate(() => {}); await tap(p.getByRole('button', { name: 'Explore' }).last()); await wait(1200); await shot('p-explore');
    await tap(p.locator('text=pingdotgg/t3code').first()); await wait(3000); await shot('p-atlas1');
    await swipe(196, 600, 500); await wait(800); await shot('p-atlas2');
    await swipe(196, 600, 500); await wait(800); await shot('p-atlas3');
  },
  async stills() { await shot('p-home'); console.log(await p.evaluate(() => [...document.querySelectorAll('button, a')].map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60).join(' | '))); },
};
try {
  if (!SCENES[scene]) throw new Error(`which scene? ${Object.keys(SCENES).join(', ')}`);
  await SCENES[scene]({ p, tap, swipe, wait, film, shot });
} catch (e) { console.error('✗', e.message.split('\n')[0]); await p.screenshot({ path: path.join(OUT, `fail-${scene}.png`) }).catch(() => {}); process.exitCode = 1; }
await browser.close(); await app.close().catch(() => {});
fs.rmSync(tmp, { recursive: true, force: true });
