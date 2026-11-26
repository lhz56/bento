// When things go wrong: Bento never hangs, never shows a blank window or a stack trace, and says what happened in
// plain words, with a way forward. Each case runs the real app (hidden, its own profile, no AI):
//   - the saved lessons file is damaged          → Bento starts normally and keeps the damaged file aside
//   - offline                                     → searching and downloading a project fail in plain words; the app stays usable
//   - the disk fills up while Bento is open       → a calm note, and it saves again by itself once there's space
//   - Bento may no longer write its data folder   → the same note, and recovery
//   - a file it isn't allowed to read, or that was deleted, in a project you opened → a plain answer
//   - starting on a full disk                     → it still opens
//   npx vite build && node scripts/smoke-failures.mjs          (macOS: the full-disk cases use a small disk image)
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
const exe = createRequire(import.meta.url)('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;

async function open(profile, { args = [], env: extra = {} } = {}) {
  const env = {
    ...process.env,
    BENTO_USERDATA: profile,
    BENTO_HIDDEN: '1',
    BENTO_NO_GH: '1',
    BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh',
    ...extra,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BENTO_DEV;
  const app = await electron.launch({
    executablePath: exe,
    args: [
      root,
      ...args,
      ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []),
    ],
    env,
    timeout: 90000,
  });
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (/Content-Security-Policy/.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 160)}`);
  });
  return { app, p, errors };
}
// what every case must leave behind: a drawn window, no page errors, nothing technical on screen, nothing uncaught
async function sane({ p, errors }, profile) {
  await p.waitForSelector('.onb, .side', { timeout: 30000 });
  const text = await p.evaluate(() => document.body.innerText);
  if (text.trim().length < 40) throw new Error('the window is (nearly) blank');
  const tech =
    /Error invoking remote method|\n\s+at [\w.<>$]+ \(|ENOENT|EACCES|ENOSPC|EPERM|TypeError|undefined is not/.exec(
      text,
    );
  if (tech) throw new Error(`technical text on screen: "${tech[0].trim().slice(0, 60)}"`);
  if (errors.length) throw new Error(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  const log = path.join(profile, 'logs', 'main.log');
  const uncaught =
    fs.existsSync(log) &&
    fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .find((l) => /uncaught|unhandled/.test(l));
  if (uncaught) throw new Error(`main process: ${uncaught.slice(25, 160)}`);
}
async function skipWelcome(p) {
  await p.waitForSelector('.onb, .side', { timeout: 30000 });
  if (!(await p.locator('.onb').count())) return;
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('bento.settings') || '{}');
    s.onboarded = true;
    localStorage.setItem('bento.settings', JSON.stringify(s));
  });
  await p.reload();
  await p.waitForSelector('.side', { timeout: 30000 });
}
const banner = (p) => p.evaluate(() => document.querySelector('.save-trouble')?.innerText || '');
async function step(name, fn) {
  const t0 = Date.now();
  let run = null;
  try {
    const note = await fn((r) => {
      run = r;
    });
    console.log(`✓ ${name}${note ? ` · ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    fail++;
    console.log(`✗ ${name} → ${String(e.message).split('\n')[0]}`);
    await run?.p
      .screenshot({ path: path.join(OUT, `fail-${name.replace(/\W+/g, '-')}.png`) })
      .catch(() => {});
  } finally {
    await run?.app.close().catch(() => {});
    for (const d of made.splice(0)) {
      try {
        fs.chmodSync(d, 0o755);
      } catch {}
      fs.rmSync(d, { recursive: true, force: true });
    }
  }
}
// folders made for a case are removed once its app has closed (Chromium still writes to its profile while quitting)
const made = [];
const tmp = (n) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `bento-fail-${n}-`));
  made.push(d);
  return d;
};

await step('a damaged lessons file: Bento starts normally and keeps it aside', async (keep) => {
  const profile = tmp('damaged');
  fs.writeFileSync(
    path.join(profile, 'bento-store.json'),
    '{"bento.lessons": [{"id": "a", "title": "Lo',
  );
  const r = await open(profile);
  keep(r);
  await sane(r, profile);
  await sleep(500);
  const aside = fs.readdirSync(profile).find((f) => /^bento-store damaged .*\.json$/.test(f));
  if (!aside) throw new Error('the damaged file wasn’t kept aside');
  return aside;
});

await step(
  'offline: searching and downloading say so plainly, and Bento stays usable',
  async (keep) => {
    const profile = tmp('offline');
    const dead = 'http://127.0.0.1:9';
    const r = await open(profile, {
      args: [`--proxy-server=${dead}`, '--host-resolver-rules=MAP * ~NOTFOUND'],
      env: {
        HTTPS_PROXY: dead,
        HTTP_PROXY: dead,
        ALL_PROXY: dead,
        https_proxy: dead,
        http_proxy: dead,
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    keep(r);
    const { p } = r;
    await skipWelcome(p);
    await p.click('.side nav button:has-text("Explore")');
    await p.click('.gtabs button:has-text("Code")');
    // a project that isn't built in, so it has to be downloaded
    await p.fill('.ex-inner input', 'https://github.com/pallets/flask');
    await p.keyboard.press('Enter');
    await p.waitForSelector('.atlas-loading .story-err', { timeout: 60000 }); // "Couldn’t open it." with Try again
    const said = await p.evaluate(() =>
      document.querySelector('.atlas-loading .story-err').innerText.replace(/\s+/g, ' '),
    );
    if (!(await p.locator('.atlas-loading .story-err button:has-text("Try again")').count()))
      throw new Error('no way to try again');
    if (
      !/Couldn’t reach GitHub.*internet connection/.test(said) ||
      /Cloning|\/var\/|\/tmp\/|fatal:/.test(said)
    )
      throw new Error(`not plain: ${said.slice(0, 120)}`);
    await sane(r, profile);
    // still usable: back to Learn
    await p.click('.side nav button:has-text("Learn")');
    await p.waitForSelector('.home, .cx', { timeout: 10000 });
    return said.slice(0, 90);
  },
);

// (Windows doesn't take file permissions from chmod, so the two permission cases run on macOS and Linux)
if (process.platform !== 'win32')
  await step(
    'a file Bento may not read, or that was deleted, gets a plain answer',
    async (keep) => {
      const profile = tmp('perm');
      const proj = tmp('proj');
      fs.writeFileSync(path.join(proj, 'main.py'), 'from util import greet\nprint(greet("you"))\n');
      fs.writeFileSync(path.join(proj, 'util.py'), 'def greet(who):\n    return "hi " + who\n');
      fs.writeFileSync(path.join(proj, 'gone.py'), 'x = 1\n');
      const r = await open(profile);
      keep(r);
      const { app, p } = r;
      await skipWelcome(p);
      // "Open a folder on this Mac…", with the folder picked for it (the real dialog would need a person)
      await app.evaluate(({ dialog }, dir) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
      }, proj);
      await p.click('.side nav button:has-text("Explore")');
      await p.click('.gtabs button:has-text("Code")');
      await p.click('button:has-text("Open a folder on this Mac")');
      await p.waitForSelector('.ab-nav', { timeout: 30000 }); // read and taken apart (in the worker)
      fs.chmodSync(path.join(proj, 'util.py'), 0o000);
      fs.rmSync(path.join(proj, 'gone.py'));
      const answers = await p.evaluate(
        async (root) =>
          Promise.all(
            ['util.py', 'gone.py', '../etc/passwd'].map((f) =>
              window.bento.readFile(root, f).then(
                () => 'read it',
                (e) => e.message,
              ),
            ),
          ),
        proj,
      );
      if (
        !/isn’t allowed to read/.test(answers[0]) ||
        !/isn’t there any more/.test(answers[1]) ||
        !/didn’t look right/.test(answers[2])
      )
        throw new Error(answers.join(' | '));
      await sane(r, profile);
      fs.chmodSync(path.join(proj, 'util.py'), 0o644);
      return answers.join(' · ');
    },
  );

if (process.platform !== 'win32')
  await step(
    'Bento may no longer write its data folder: it says so, and recovers',
    async (keep) => {
      const profile = tmp('ro');
      const r = await open(profile);
      keep(r);
      const { p } = r;
      await skipWelcome(p);
      await sleep(800);
      fs.chmodSync(profile, 0o555);
      try {
        await p.evaluate(() => window.bento.storeSet('bento.smoke', { at: Date.now() }));
        await p.waitForFunction(() => !!document.querySelector('.save-trouble'), null, {
          timeout: 5000,
        });
        const said = await banner(p);
        if (!/can’t save/.test(said)) throw new Error(said);
      } finally {
        fs.chmodSync(profile, 0o755);
      }
      await p.evaluate(() => window.bento.storeSet('bento.smoke', { at: Date.now() }));
      await p.waitForFunction(() => !document.querySelector('.save-trouble'), null, {
        timeout: 5000,
      });
      await sane(r, profile);
      return 'note shown, then gone once it could save again';
    },
  );

if (process.platform === 'darwin') {
  // a 12 MB disk of its own, mounted out of sight
  const img = path.join(os.tmpdir(), `bento-full-${process.pid}.dmg`);
  const mnt = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-full-mnt-'));
  execFileSync('hdiutil', [
    'create',
    '-quiet',
    '-size',
    '12m',
    '-fs',
    'HFS+',
    '-volname',
    'BentoFull',
    '-layout',
    'NONE',
    img,
  ]);
  execFileSync('hdiutil', [
    'attach',
    '-quiet',
    '-nobrowse',
    '-noautoopen',
    '-mountpoint',
    mnt,
    img,
  ]);
  const profile = path.join(mnt, 'profile');
  fs.mkdirSync(profile);
  const filler = path.join(mnt, 'filler');
  const fill = () => {
    const fd = fs.openSync(filler, 'a');
    const chunk = Buffer.alloc(256 * 1024);
    try {
      for (;;) fs.writeSync(fd, chunk);
    } catch {
    } finally {
      fs.closeSync(fd);
    }
    try {
      const fd2 = fs.openSync(path.join(mnt, 'crumbs'), 'a');
      const small = Buffer.alloc(512);
      try {
        for (;;) fs.writeSync(fd2, small);
      } catch {}
      fs.closeSync(fd2);
    } catch {}
  };
  const unfill = () => {
    fs.rmSync(filler, { force: true });
    fs.rmSync(path.join(mnt, 'crumbs'), { force: true });
  };
  try {
    await step(
      'the disk fills up while Bento is open: a calm note, and it saves again once there’s space',
      async (keep) => {
        const r = await open(profile);
        keep(r);
        const { p } = r;
        await skipWelcome(p);
        await sleep(800);
        fill();
        await p.evaluate(() => window.bento.storeSet('bento.smoke', { big: 'x'.repeat(200000) }));
        await p.waitForFunction(() => !!document.querySelector('.save-trouble'), null, {
          timeout: 8000,
        });
        const said = await banner(p);
        if (!/disk is full/.test(said)) throw new Error(said);
        await sane(r, profile);
        unfill();
        await p.evaluate(() => window.bento.storeSet('bento.smoke', { small: 1 }));
        await p.waitForFunction(() => !document.querySelector('.save-trouble'), null, {
          timeout: 8000,
        });
        const saved = JSON.parse(fs.readFileSync(path.join(profile, 'bento-store.json'), 'utf8'));
        if (saved['bento.smoke']?.small !== 1)
          throw new Error('the save after freeing space didn’t land');
        return said.split('\n')[0];
      },
    );
    await step('starting on a full disk still opens Bento', async (keep) => {
      fill();
      const r = await open(profile);
      keep(r);
      await sane(r, profile);
      unfill();
      return 'window drawn, no errors';
    });
  } finally {
    unfill();
    try {
      execFileSync('hdiutil', ['detach', '-quiet', mnt]);
    } catch {
      try {
        execFileSync('hdiutil', ['detach', '-quiet', '-force', mnt]);
      } catch {}
    }
    fs.rmSync(img, { force: true });
    fs.rmSync(mnt, { recursive: true, force: true });
  }
}

console.log(
  fail
    ? `\n${fail} check(s) failed. Screenshots: ${OUT}`
    : '\nBento handles every failure here calmly.',
);
process.exit(fail ? 1 : 0);
