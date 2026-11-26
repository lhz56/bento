// Bento on a phone, for real: the Mac app (hidden, its own profile, pretend AIs) serves Bento to an iPhone-sized
// WebKit that pairs with it the way a person would (the QR code's link). Then it opens screens and takes pictures.
// Nothing reaches an AI or your real Tailscale/Wi-Fi: the host listens on this Mac only (BENTO_HOST, test builds).
//
//   npx vite build && node scripts/shoot-phone.mjs [out-dir] [--ipad] [--dark]
import { _electron as electron, webkit, devices } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out =
  process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(root, 'smoke-out', 'phone');
fs.mkdirSync(out, { recursive: true });
const IPAD = process.argv.includes('--ipad'),
  DARK = process.argv.includes('--dark');
const PORT = 4937;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-phone-'));
fs.writeFileSync(
  path.join(profile, 'bento-store.json'),
  JSON.stringify({
    'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python', level: 'student' },
  }),
);
const env = {
  ...process.env,
  BENTO_HIDDEN: '1',
  BENTO_USERDATA: profile,
  BENTO_HOST: '1',
  BENTO_HOST_PORT: String(PORT),
  BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-claude.mjs'),
  BENTO_FAKE_AS: 'claude',
  BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh',
  BENTO_NO_GH: '1',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
const app = await electron.launch({
  executablePath: createRequire(import.meta.url)('electron'),
  args: [root],
  env,
  timeout: 90000,
});
const mac = await app.firstWindow();
await mac.waitForFunction(() => window.bento?.host, null, { timeout: 30000 });
await mac.waitForFunction(() => window.bento.host.get().then((s) => s.on), null, {
  timeout: 30000,
});
const st = await mac.evaluate(() => window.bento.host.pair());
// the playwright WebKit build that's installed (WK= to choose another)
const wk =
  process.env.WK ||
  ['webkit-2388', 'webkit-2370']
    .map((d) => path.join(os.homedir(), 'Library/Caches/ms-playwright', d, 'pw_run.sh'))
    .find((f) => fs.existsSync(f));
const browser = await webkit.launch(wk ? { executablePath: wk } : {});
// APP=1: as the Bento Code app shows it (its user agent, the whole screen, no Safari bars)
const dev = devices[IPAD ? 'iPad Pro 11' : 'iPhone 15 Pro'];
const inApp = process.env.APP
  ? {
      userAgent: `${dev.userAgent} BentoApp/1.0`,
      viewport: IPAD ? { width: 834, height: 1194 } : { width: 393, height: 852 },
    }
  : {};
const ctx = await browser.newContext({ ...dev, ...inApp, colorScheme: DARK ? 'dark' : 'light' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text().slice(0, 200));
});
const shot = async (name) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, `${name}.png`) });
  console.log('📷', name);
};
console.log('pair link:', st.pairUrl);
if (!process.env.NOPAIR) await p.goto(st.pairUrl);
await p.waitForSelector('.home, .sheet', { timeout: 30000 }).catch(() => {});
await shot('01-home');
const script = process.env.SHOTS ? (await import(path.resolve(process.env.SHOTS))).default : null;
if (script) await script({ p, mac, app, shot });
console.log('errors:', errs.length ? errs.slice(0, 5) : 'none');
await browser.close();
await app.close().catch(() => {});
fs.rmSync(profile, { recursive: true, force: true });
