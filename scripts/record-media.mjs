// Screen recordings of the real app for the README and the website: the app, hidden and off-screen, with a throwaway
// profile, driven like a person would (a visible pointer that glides and clicks, typing at a human pace) and filmed
// through Chromium's own screencast. Lessons come from a pretend AI (test/fixtures), so no plan is ever used.
//
//   npx vite build && node scripts/record-media.mjs <scene> [--profile dir] [--out dir] [--raw dir]
//   scenes: see SCENES below; every clip is an H.264 .mp4 (and a .jpg poster) in --out, finished by compose-media.mjs
//   (the window on a backdrop, a camera that follows what's happening, a caption per step). --raw keeps the unedited
//   frames, so a clip can be finished again without filming it again: node scripts/compose-media.mjs <raw>/<name> out.mp4
//   --profile: a copy of a Bento data folder to start from (the Atlas scenes need one where pingdotgg/t3code was
//   taken apart; a recording never changes the original)
import { _electron as electron } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { compose } from './compose-media.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : d;
};
const scene = process.argv[2];
const OUT = path.resolve(arg('--out', path.join(root, 'site', 'media')));
const RAW = arg('--raw') && path.resolve(arg('--raw'));
const W = Number(arg('--w', 1440)),
  H = Number(arg('--h', 900));
fs.mkdirSync(OUT, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-rec-'));
const profile = path.join(tmp, 'p');
const seed = arg('--profile');
if (seed) fs.cpSync(seed, profile, { recursive: true });
else if (process.argv.includes('--fresh')) fs.mkdirSync(profile);
else {
  fs.mkdirSync(profile);
  fs.writeFileSync(
    path.join(profile, 'bento-store.json'),
    JSON.stringify({
      'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python' },
    }),
  );
}
const env = {
  ...process.env,
  BENTO_HIDDEN: '1',
  BENTO_HOST: '1',
  BENTO_HOST_PORT: '4977', // the phone host, on this Mac only
  BENTO_USERDATA: profile,
  BENTO_NO_GH: '1',
  BENTO_NO_AGENT: '1',
  BENTO_FAKE_AI: process.env.BENTO_FAKE_AI || path.join(root, 'test/fixtures/demo-ai.mjs'),
  BENTO_FAKE_AS: 'claude',
  BENTO_PRETEND_MISSING: 'codex,antigravity,gemini,copilot,gh',
  FAKE_AI_THINK_MS: process.env.FAKE_AI_THINK_MS || '900',
  FAKE_AI_STEP_MS: process.env.FAKE_AI_STEP_MS || '90',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
const app = await electron.launch({
  executablePath: createRequire(import.meta.url)('electron'),
  args: [root, '--force-device-scale-factor=2'],
  env,
  timeout: 90000,
});
const p = await app.firstWindow();
await p.waitForSelector('.side', { timeout: 60000 });
const CLIP = () => {
  let c = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (t) => {
        c = String(t);
      },
      readText: async () => c,
    },
  });
};
await app.context().addInitScript(CLIP);
await p.evaluate(CLIP);
await app.evaluate(
  ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
  [W, H],
);
if (process.argv.includes('--dark'))
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark';
  });
if (!process.argv.includes('--tips')) {
  await p.evaluate(() => {
    for (const k of ['lesson', 'atlas']) localStorage.setItem(`bento.coach.${k}`, '1');
  });
  await p.reload();
  await p.waitForSelector('.side', { timeout: 60000 });
}
await p.waitForTimeout(800);

// a pointer people can follow: a macOS-style arrow that glides, and a ring where it clicks
const POINTER = () => {
  if (window.__cur) return;
  // an off-screen window can't draw macOS's see-through sidebar or its traffic lights: stand-ins that look the same
  const st = document.createElement('style');
  st.textContent =
    'html{background:#e9e4dc!important}@media (prefers-color-scheme:dark){html{background:#1d1b20!important}}';
  document.head.appendChild(st);
  const tl = document.createElement('div');
  tl.style.cssText =
    'position:fixed;left:13px;top:13px;display:flex;gap:8px;z-index:2147483640;pointer-events:none';
  tl.innerHTML = ['#ff5f57', '#febc2e', '#28c840']
    .map(
      (c) =>
        `<i style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15)"></i>`,
    )
    .join('');
  document.documentElement.appendChild(tl);
  const c = document.createElement('div');
  c.style.cssText =
    'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))';
  c.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.7 6.3 3-1.3-2.7-6.2h6z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
  let x = innerWidth * 0.62,
    y = innerHeight * 0.7;
  const put = () => {
    c.style.transform = `translate(${x - 5}px,${y - 2.5}px)`;
  };
  put();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  window.__cur = {
    move(tx, ty, ms) {
      const sx = x,
        sy = y,
        t0 = performance.now();
      return new Promise((r) => {
        const f = (now) => {
          const k = Math.min(1, (now - t0) / ms),
            e = ease(k);
          x = sx + (tx - sx) * e;
          y = sy + (ty - sy) * e;
          put();
          k < 1 ? requestAnimationFrame(f) : r();
        };
        requestAnimationFrame(f);
      });
    },
    press() {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(232,120,40,.28);border:2px solid rgba(232,120,40,.7);z-index:2147483646;pointer-events:none;transform:scale(.4);opacity:1;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .45s`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => {
        r.style.transform = 'scale(1.25)';
        r.style.opacity = '0';
      });
      setTimeout(() => r.remove(), 500);
    },
    hide() {
      c.style.opacity = '0';
    },
    show() {
      c.style.opacity = '1';
    },
  };
};
await p.evaluate(POINTER);
const loc = (s) => (typeof s === 'string' ? p.locator(s).first() : s);
async function glide(s, { ms = 750, dx = 0.5, dy = 0.5 } = {}) {
  if (s && s.x != null && typeof s.boundingBox !== 'function') {
    await p.evaluate(POINTER);
    await p.evaluate(([x, y, ms]) => window.__cur.move(x, y, ms), [s.x, s.y, ms]);
    await p.mouse.move(s.x, s.y);
    return s;
  }
  const l = loc(s);
  await l.scrollIntoViewIfNeeded().catch(() => {});
  const b = await l.boundingBox();
  if (!b) throw new Error(`can’t see ${s}`);
  const x = b.x + b.width * dx,
    y = b.y + b.height * dy;
  await p.evaluate(POINTER);
  await p.evaluate(([x, y, ms]) => window.__cur.move(x, y, ms), [x, y, ms]);
  await p.mouse.move(x, y);
  return { x, y };
}
async function click(s, o) {
  await glide(s, o);
  await p.waitForTimeout(120);
  await p.evaluate(() => window.__cur.press());
  await loc(s).click();
  await p.waitForTimeout(250);
}
async function type(text, delay = 55) {
  for (const ch of text) {
    await p.keyboard.insertText(ch);
    await p.waitForTimeout(delay + Math.random() * 40);
  }
}
const wait = (ms) => p.waitForTimeout(ms);

// filming: every frame Chromium paints, with its time, plus where the camera should look and what the caption says
const cdp = await p.context().newCDPSession(p);
let frames = [],
  filming = false,
  dir = '',
  track = null;
const now = () => Date.now() / 1000;
cdp.on('Page.screencastFrame', async (f) => {
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  if (!filming) return;
  const n = frames.length;
  const name = `f${String(n).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(dir, 'frames', name), Buffer.from(f.data, 'base64'));
  frames.push({ f: name, t: now() });
});
// the camera: look at a thing (a selector, a locator or { x, y } in page pixels) at a zoom, or 'full' for the whole window
async function cam(target, z = 1.6, { dx = 0.5, dy = 0.5 } = {}) {
  if (!track) return;
  if (target === 'full') {
    track.cam.push({ t: now(), x: W / 2, y: H / 2, z: 1 });
    return;
  }
  let x, y;
  if (target.x != null) ({ x, y } = target);
  else {
    const b = await loc(target).boundingBox();
    if (!b) return;
    x = b.x + b.width * dx;
    y = b.y + b.height * dy;
  }
  track.cam.push({ t: now(), x, y, z });
}
const cap = (text, n) => track?.caps.push({ t: now(), text, n });
const speed = (r) => track?.speed.push({ t: now(), r });
async function film(name, fn) {
  dir = RAW ? path.join(RAW, name) : fs.mkdtempSync(path.join(tmp, 'raw-'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  frames = [];
  track = { kind: 'mac', W, H, cam: [], caps: [], speed: [] };
  filming = true;
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: W * 2,
    maxHeight: H * 2,
    everyNthFrame: 1,
  });
  // a still page sends no frames: nudge the compositor so the first and last moments are filmed too
  const keep = setInterval(
    () =>
      p
        .evaluate(() => {
          document.documentElement.style.outline = document.documentElement.style.outline
            ? ''
            : '0px solid transparent';
        })
        .catch(() => {}),
    1000 / 30,
  );
  try {
    await fn();
  } finally {
    track.end = now();
    clearInterval(keep);
    filming = false;
    await cdp.send('Page.stopScreencast').catch(() => {});
  }
  if (frames.length < 2) throw new Error('no frames');
  fs.writeFileSync(path.join(dir, 'track.json'), JSON.stringify({ ...track, frames }));
  track = null;
  await compose(dir, path.join(OUT, `${name}.mp4`));
}
async function shot(name) {
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}
const nav = (n) => click(`.side nav button:has-text("${n}")`);

const SCENES = {
  // stills of every main screen, to look at before filming
  async stills() {
    await shot('s-home');
    await nav('Explore');
    await wait(800);
    await shot('s-explore');
    await nav('Practice');
    await wait(800);
    await shot('s-practice');
    await nav('Path');
    await wait(800);
    await shot('s-path');
    await nav('You');
    await wait(800);
    await shot('s-you');
    await nav('Learn');
    await wait(500);
  },
  // Home → a question → the lesson writes itself → it runs and draws → every line in plain English
  async ask({ film }) {
    await film('ask', async () => {
      await cam('full');
      await wait(900);
      cap('Ask anything', 1);
      await cam('.composer.cx', 1.9, { dy: 0.4 });
      await wait(500);
      await click('.composer.cx textarea');
      await type('Why is a sorted list so fast to search?', 45);
      await wait(350);
      await p.keyboard.press('Enter');
      cap('Get a lesson, written for you', 2);
      await cam('full');
      speed(1.8);
      await p.waitForSelector('.story-head h1:not(.sr-only)', { timeout: 20000 });
      await wait(400);
      await cam('.story', 1.45, { dy: 0.3 });
      await p
        .waitForFunction(() => !document.querySelector('.writing'), null, { timeout: 30000 })
        .catch(() => {});
      speed(1);
      await wait(1600);
      cap('Run it', 3);
      await cam('.stage', 1.3, { dy: 0.5 });
      await wait(700);
      await click('.act.run');
      await wait(500);
      await cam('.stage', 1.6, { dy: 0.82 });
      await wait(2600);
      cap('Every line in plain English', 4);
      await cam('.lenses', 1.5, { dy: 6 });
      await wait(500);
      await click('.lenses button:has-text("Side by side")');
      await wait(2800);
      cap(null);
      await cam('full');
      await wait(1600);
    });
  },
  // a real open-source app taken apart: paste its link, the big picture, one part up close, a journey, the toolbelt
  async atlas({ film }) {
    await nav('Explore');
    await wait(900);
    await film('atlas', async () => {
      await cam('full');
      await wait(700);
      cap('Paste any GitHub link', 1);
      await cam('main input', 1.8);
      await wait(400);
      await click('main input');
      await type('github.com/pingdotgg/t3code', 38);
      await wait(300);
      await p.keyboard.press('Enter');
      await p.waitForSelector('.bigpic', { timeout: 30000 });
      cap('See the whole app as one picture', 2);
      await cam('full');
      await wait(600);
      await cam('.bigpic', 1.3);
      await wait(2600);
      cap('Click any part', 3);
      await cam('.bigpic >> text=The local server', 1.8);
      await glide('.bigpic >> text=The local server');
      await wait(400);
      await click('.bigpic >> text=The local server');
      await wait(600);
      await cam('full');
      await wait(2600);
      await p.keyboard.press('Escape');
      await wait(500);
      cap('Watch a request travel', 4);
      await click('.ab-nav button:has-text("Anatomy")');
      await wait(1200);
      const j = p.locator('button:has-text("When you send a task from the phone")').first();
      if (await j.count()) {
        await cam(j, 1.7);
        await wait(300);
        await click(j);
        await wait(500);
        await cam({ x: W * 0.58, y: H * 0.55 }, 1.25);
        await wait(5000);
      }
      cap('Every tool, and why it was picked', 5);
      await cam('.ab-nav', 1.6, { dy: 2 });
      await click('.ab-nav button:has-text("Toolbelt")');
      await wait(400);
      await cam({ x: W * 0.58, y: H * 0.45 }, 1.3);
      await wait(2800);
      cap(null);
      await cam('full');
      await wait(1400);
    });
  },
  // a famous engineering trick you can run: Discord's ring
  async idea({ film }) {
    await nav('Explore');
    await click('.gtabs button:has-text("Clever ideas")');
    await wait(900);
    const card = p.locator('.idea-card, .idea-hero').filter({ hasText: 'Discord' }).first();
    await card.scrollIntoViewIfNeeded();
    await wait(400);
    await film('idea', async () => {
      await cam('full');
      await wait(600);
      cap('How Uber, Google and Discord did it', 1);
      await cam(card, 1.6);
      await wait(900);
      await click(card);
      await p.waitForSelector('.story-head h1:not(.sr-only)');
      await cam('full');
      await wait(1500);
      cap('Run the real idea', 2);
      await cam('.stage', 1.4, { dy: 0.4 });
      await wait(500);
      await click('.act.run');
      await wait(3400);
      cap('Tap a phrase, see its code', 3);
      await cam('text=the fragile part', 1.7);
      await wait(500);
      await click('text=the fragile part');
      await wait(400);
      await cam('.stage', 1.45, { dy: 0.3 });
      await wait(2200);
      cap('Or read it in plain words', 4);
      await click('.lenses button:has-text("Plain words")');
      await wait(2600);
      cap(null);
      await cam('full');
      await wait(1400);
    });
  },
  // practice: how long at a billion, then a live race
  async practice({ film }) {
    await nav('Practice');
    await wait(900);
    await film('practice', async () => {
      await cam('full');
      await wait(600);
      const r = p.locator('.puzzles input[type=range], input[aria-label="how many items"]').first();
      const b = await r.boundingBox();
      cap('Push it to a billion', 1);
      await cam({ x: b.x - b.width * 0.9, y: b.y + 75 }, 1.55);
      await wait(300);
      await glide(r, { dx: 0.27 });
      await p.evaluate(() => window.__cur.press());
      await p.mouse.down();
      for (let i = 0; i <= 30; i++) {
        const x = b.x + b.width * (0.27 + (0.7 * i) / 30);
        await p.evaluate(([x, y]) => window.__cur.move(x, y, 40), [x, b.y + b.height / 2]);
        await p.mouse.move(x, b.y + b.height / 2);
        await wait(70);
      }
      await p.mouse.up();
      await wait(1600);
      cap('Watch them race', 2);
      await cam('full');
      await click('text=Sorting race');
      await wait(900);
      await cam({ x: W * 0.6, y: H * 0.5 }, 1.3);
      await wait(5600);
      cap(null);
      await cam('full');
      await wait(1200);
    });
  },
  // the first minute: Bento finds the AI you already have, asks what you know, and you start
  async start({ film }) {
    await film('start', async () => {
      await cam('.onb-pane', 1.55, { dy: 0.6 });
      cap('Open Bento', 1);
      await wait(1500);
      await click('button:has-text("Get started")');
      cap('It finds the AI you already have', 2);
      await wait(300);
      await cam('.conns', 1.6, { dy: 0.35 });
      await wait(2600);
      await cam('.onb-pane', 1.45, { dy: 0.6 });
      await wait(300);
      await click('.onb-go');
      await wait(300);
      cap('Tell it what you know', 3);
      await cam('.levels', 1.6);
      await wait(800);
      await click('.lvl >> nth=1');
      await wait(900);
      await cam('.onb-pane', 1.45, { dy: 0.6 });
      await click('.onb-go');
      await wait(300);
      cap('Start anywhere', 4);
      await cam('.starts3', 1.6);
      await wait(800);
      for (const i of [0, 1, 2, 3]) await glide(`.s3 >> nth=${i}`, { ms: 420 });
      await wait(300);
      await click('.s3 >> nth=0');
      cap(null);
      await cam('full');
      await wait(1900);
    });
  },
  // your phone: Settings → Your phone and iPad → on → a code to scan (or Allow on the Mac)
  async pair({ film }) {
    // the Mac's own name and address stay out of the picture
    const mine = spawnSync('scutil', ['--get', 'ComputerName']).stdout?.toString().trim();
    await p.evaluate((mine) => {
      const fix = (n) => {
        let t = n.nodeValue;
        if (mine) t = t.split(mine).join('MacBook Pro');
        t = t.replace(/127\.0\.0\.1:\d+/g, 'your-mac.ts.net');
        if (t !== n.nodeValue) n.nodeValue = t;
      };
      const walk = (r) => {
        const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) fix(w.currentNode);
      };
      walk(document.body);
      new MutationObserver((ms) =>
        ms.forEach((m) => {
          if (m.type === 'characterData') fix(m.target);
          m.addedNodes.forEach((n) => (n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n)));
        }),
      ).observe(document.body, { subtree: true, childList: true, characterData: true });
    }, mine);
    await p.keyboard.press('Meta+Comma');
    await wait(1200);
    const dv = p.locator('.dv').first();
    await dv.scrollIntoViewIfNeeded();
    await wait(400);
    if (await p.locator('.dv-head .switch.on').count()) {
      await p.locator('.dv-head .switch').click();
      await wait(1200);
    }
    await film('pair', async () => {
      await cam('full');
      await wait(700);
      cap('Settings → Your phone and iPad', 1);
      await cam('.dv-head', 1.7);
      await wait(900);
      await click('.dv-head .switch');
      await wait(1200);
      cap('Scan it, or tap Allow', 2);
      await cam('.dv-connect', 1.6);
      await wait(3600);
      cap('Your Mac does the work', 3);
      await cam('.dv-group', 1.5);
      await wait(2200);
      cap(null);
      await cam('full');
      await wait(1200);
    });
  },
  // the box on the website: four short close-ups of one feature each
  async box({ film }) {
    const open = async () => {
      await click('.side .recent .rl-main:has-text("t3code")');
      await p.waitForSelector('.ab-nav', { timeout: 30000 });
      await wait(1200);
    };
    const tab = async (t) => {
      await click(`.ab-nav button:has-text("${t}")`);
      await wait(1300);
    };
    // the first match for some text that's on screen right now
    const seen = async (t) => {
      const all = p.getByText(t, { exact: true });
      for (let i = 0; i < (await all.count()); i++) {
        const b = await all.nth(i).boundingBox();
        if (b && b.y > 60 && b.y < H - 40 && b.width > 0) return all.nth(i);
      }
      throw new Error(`can’t see ${t}`);
    };
    await open();
    await tab('Toolbelt');
    await film('toolbelt', async () => {
      cap('Every tool it’s built with', 1);
      await cam({ x: 470, y: 330 }, 1.45);
      await wait(2000);
      await glide(await seen('Electron'));
      cap('Why this one', 2);
      await cam({ x: 1150, y: 330 }, 1.6);
      await wait(2800);
      cap('And what else it could have been', 3);
      await cam({ x: 1110, y: 450 }, 1.7);
      await glide({ x: 1115, y: 455 });
      await wait(2800);
      cap(null);
      await cam({ x: 720, y: 400 }, 1.15);
      await wait(1200);
    });
    await tab('Hot spots');
    await film('hotspots', async () => {
      cap('Where it could break', 1);
      await cam({ x: 560, y: 225 }, 1.6);
      await wait(2200);
      cap('Why, in plain words', 2);
      await cam({ x: 760, y: 320 }, 1.55);
      await glide({ x: 700, y: 318 });
      await wait(2600);
      cap('Down to the file', 3);
      await cam({ x: 600, y: 360 }, 1.7);
      await wait(2800);
      cap(null);
      await cam('full');
      await wait(1200);
    });
    await tab('Files');
    await film('files', async () => {
      cap('Every file of the app', 1);
      await cam({ x: 830, y: 520 }, 1.15);
      await wait(1800);
      cap('Sorted by what it does', 2);
      await cam({ x: 560, y: 220 }, 1.7);
      await wait(400);
      for (const c of ['The brains', 'What you see', 'All']) {
        await click(`main button:has-text("${c}")`);
        await wait(1000);
        await cam({ x: 830, y: 520 }, 1.15);
        await wait(800);
        await cam({ x: 560, y: 220 }, 1.7);
      }
      cap('Find any file', 3);
      const f = p.locator('main input[placeholder*="Find a file"]').first();
      await cam(f, 1.8);
      await click(f);
      await type('database', 70);
      await wait(900);
      await cam({ x: 830, y: 480 }, 1.2);
      await wait(2400);
      cap(null);
      await cam('full');
      await wait(1000);
    });
    await nav('Path');
    await wait(1200);
    await film('path', async () => {
      cap('Pick a path', 1);
      await cam({ x: 830, y: 245 }, 1.55);
      await wait(400);
      for (let i = 0; i < 4; i++) await glide(`.pcard >> nth=${i}`, { ms: 450 });
      await wait(400);
      cap('Short stops, in order', 2);
      await p.mouse.wheel(0, 360);
      await wait(300);
      await cam({ x: 720, y: 500 }, 1.35);
      await wait(2400);
      cap('Start where you are', 3);
      const st = p
        .locator('.stop-card button:has-text("Start"), button:has-text("Start: stop 1")')
        .first();
      await cam(st, 1.7);
      await glide(st);
      await wait(2000);
      cap(null);
      await cam('full');
      await wait(1000);
    });
  },
  async atlasStills() {
    await click('.side .recent .rl-main:has-text("t3code")');
    await p.waitForSelector('.ab-nav', { timeout: 30000 });
    await wait(2500);
    await shot('a-overview');
    for (const s of ['Anatomy', 'Toolbelt', 'Hot spots', 'Files', 'Growth']) {
      const b = p.locator(`.ab-nav button:has-text("${s}")`).first();
      if (await b.count()) {
        await click(b);
        await wait(2500);
        await shot(`a-${s.replace(/\W+/g, '').toLowerCase()}`);
      }
    }
  },
  async moreStills() {
    await nav('Explore');
    await click('.gtabs button:has-text("Clever ideas")');
    await wait(1200);
    await shot('i-ideas');
    await click('.idea-card >> nth=2');
    await p.waitForSelector('.story-head h1:not(.sr-only)');
    await wait(1500);
    await click('.act.run');
    await wait(4000);
    await shot('i-idea-lesson');
    await nav('Practice');
    await wait(1200);
    await shot('pr-practice');
    await click('.side .recent .rl-main:has-text("Recursion")');
    await wait(1500);
    await click('.act.run');
    await wait(5000);
    await shot('l-lesson');
  },
};
try {
  if (!SCENES[scene]) throw new Error(`which scene? ${Object.keys(SCENES).join(', ')}`);
  await SCENES[scene]({ film, shot });
} catch (e) {
  console.error('✗', e.message.split('\n')[0]);
  await p.screenshot({ path: path.join(OUT, `fail-${scene}.png`) }).catch(() => {});
  process.exitCode = 1;
}
await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
