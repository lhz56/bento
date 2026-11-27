// takeitapart.app as it's published, end to end: the site from site/ and Bento in the browser at /try (dist-web/),
// served together the way .github/workflows/pages.yml puts them, then opened in Chromium on a computer and WebKit on
// an iPhone. It checks the site loads, /try opens on Learn, every tab opens without an error, and a Python lesson
// runs in the page (Pyodide must load from /try/pyodide/, not the site's root). The visit counter is blocked, so
// nothing is counted.
//
//   npm run build:web && node scripts/smoke-web.mjs
// WebKit comes from Playwright (npx playwright-core install webkit chromium); WK=/path/to/pw_run.sh picks another build.
import { chromium, devices, webkit } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_BUILD = path.join(root, 'dist-web');
const SITE = path.join(root, 'site');
if (!fs.existsSync(path.join(WEB_BUILD, 'index.html'))) {
  console.error('No web build: run `npm run build:web` first.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

// a request the published site would answer with 404
const missing = [];
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const inTry = urlPath === '/try' || urlPath.startsWith('/try/');
  let file = inTry ? path.join(WEB_BUILD, urlPath.slice('/try'.length)) : path.join(SITE, urlPath);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(inTry ? WEB_BUILD : SITE) || !fs.existsSync(file)) {
    missing.push(urlPath);
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
async function step(name, run) {
  try {
    const detail = await run();
    console.log(`✓ ${name}${detail ? ` (${detail})` : ''}`);
  } catch (err) {
    failures++;
    console.log(`✗ ${name}: ${String(err.message || err).split('\n')[0]}`);
  }
}

const webkitBuild =
  process.env.WK ||
  ['webkit-2388', 'webkit-2370', 'webkit-2336']
    .map((dir) => path.join(os.homedir(), 'Library/Caches/ms-playwright', dir, 'pw_run.sh'))
    .find((file) => fs.existsSync(file));

const browsers = [
  {
    label: 'a computer (Chromium)',
    type: chromium,
    device: { viewport: { width: 1400, height: 900 } },
  },
  {
    label: 'an iPhone (WebKit)',
    type: webkit,
    device: devices['iPhone 15 Pro'],
    launch: webkitBuild ? { executablePath: webkitBuild } : {},
  },
];

for (const { label, type, device, launch = {} } of browsers) {
  console.log(`\n${label}`);
  const browser = await type.launch(launch);
  const context = await browser.newContext(device);
  // nothing is counted, and the real clipboard is never touched
  await context.route(/supabase\.co/, (route) => route.abort());
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {}, readText: async () => '' },
        configurable: true,
      });
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  missing.length = 0;

  await step('the site loads', async () => {
    await page.goto(`${base}/`);
    const title = await page.title();
    if (!/Bento/.test(title)) throw new Error(`title is “${title}”`);
    return title;
  });

  await step('/try opens on Learn', async () => {
    await page.goto(`${base}/try/`);
    await page.getByText('Ask anything').first().waitFor({ timeout: 30000 });
  });

  await step('every tab opens without an error', async () => {
    const tabs = ['Explore', 'Practice', 'Path', 'You', 'Learn'];
    for (const tab of tabs) {
      await page.getByRole('button', { name: tab, exact: true }).first().click();
      await page.waitForTimeout(400);
    }
    if (errors.length) throw new Error(errors[0]);
    return tabs.join(' · ');
  });

  await step('a Python lesson runs in the page', async () => {
    await page.evaluate(() =>
      window.__openLesson({
        id: 'web-python',
        q: 'web python',
        mode: 'explain',
        lang: 'python',
        level: 'student',
        status: 'done',
        title: 'Python on the web',
        kicker: '',
        concepts: [],
        story: [{ t: 'p', md: '.' }],
        code: 'print(sum(range(10)) * 1001)',
        file: 'a.py',
        pseudo: [],
        notes: [],
        steps: [],
        chat: [],
        createdAt: Date.now(),
        builtin: true,
      }),
    );
    // the lesson runs itself as soon as Python is ready; its output is 45045
    await page.getByText('45045').first().waitFor({ state: 'attached', timeout: 90000 });
  });

  await step('nothing it asked for was missing', async () => {
    const real = missing.filter((p) => !/favicon/.test(p));
    if (real.length) throw new Error(`404: ${[...new Set(real)].join(', ')}`);
  });

  await step('no page errors', async () => {
    if (errors.length) throw new Error(errors.join(' | '));
  });
  await browser.close();
}

server.close();
console.log(failures ? `\n${failures} failed` : '\nThe site and /try work.');
process.exit(failures ? 1 : 0);
