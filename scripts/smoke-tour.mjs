// A tour of Bento the way a learner moves through it: Home, the path, Explore, ideas, words, a built-in lesson that
// runs and steps through, a remix, ⌘K, a project's big picture, its code city and files, Compare, a clever idea, the
// shortcut sheet, and copying notes. No AI, a throwaway profile, a private clipboard.
//
//   npx vite build && node scripts/smoke-tour.mjs       the app from this folder
//   node scripts/smoke-tour.mjs --packaged              the app electron-builder made
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
  if (process.platform === 'darwin') {
    const d = dirs.find(
      (x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app')),
    );
    return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento');
  }
  if (process.platform === 'win32') {
    const d = dirs.find((x) => x.startsWith('win') && x.endsWith('unpacked'));
    return d && path.join(rel, d, 'Bento.exe');
  }
  const d = dirs.find((x) => x.startsWith('linux') && x.endsWith('unpacked'));
  return d && ['bento', 'Bento'].map((n) => path.join(rel, d, n)).find((f) => fs.existsSync(f));
}
const exe = packaged ? packagedApp() : createRequire(import.meta.url)('electron');
if (!exe || !fs.existsSync(exe)) {
  console.error('✗ can’t find the app');
  process.exit(1);
}
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-tour-'));
fs.writeFileSync(
  path.join(profile, 'bento-store.json'),
  JSON.stringify({ 'bento.settings': { onboarded: true, model: 'claude:sonnet', lang: 'python' } }),
);
const env = {
  ...process.env,
  BENTO_HIDDEN: '1',
  BENTO_USERDATA: profile,
  BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh',
  BENTO_NO_GH: '1',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
const app = await electron.launch({
  executablePath: exe,
  args: packaged ? [] : [root],
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
}; // never touch the real clipboard
await app.context().addInitScript(CLIP);
await p.evaluate(CLIP);
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
);
// taxonomy ships with Bento, already read, so it opens without a download; after the first time it's in Recent
const openProject = async () => {
  const recent = p.locator('.side .recent .rl-main:has-text("taxonomy")');
  if (await recent.count()) await recent.first().click();
  else {
    await p.click('.side nav button:has-text("Explore")');
    await p.click('.gtabs button:has-text("Code")');
    await p.click('.feat-i:has-text("taxonomy")');
  }
  await p.waitForSelector('.ab-nav', { timeout: 30000 });
};

const errs = [];
p.on('pageerror', (e) => errs.push('PAGE ' + e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|ERR_/.test(m.text()))
    errs.push('console ' + m.text().slice(0, 200));
});
const OUT = path.join(root, 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
const step = async (name, fn) => {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, e.message.split('\n')[0]);
    errs.push(name);
    await p
      .screenshot({ path: path.join(OUT, `tour-fail-${name.replace(/\W+/g, '-')}.png`) })
      .catch(() => {});
  }
};
await step('home doors', async () => {
  await p.click('text=Learn');
  await p.waitForSelector('.composer.cx', { timeout: 5000 });
  await p.waitForSelector('.ideaflow', { timeout: 5000 });
});
await step('path', async () => {
  await p.click('.side nav button:has-text("Path")');
  await p.waitForSelector('.stop', { timeout: 5000 });
});
// every kind of stop, on the newer paths: a lesson (pre-written, so it opens with no AI), a playground, a clever idea
const pathStop = async (track, stop) => {
  await p.click('.side nav button:has-text("Path")');
  await p.click(`.pcard:has-text("${track}")`);
  await p.locator(`.stop:has(b:text-is("${stop}")) .stop-foot button`).click();
};
await step('seven paths, each a card with a dot per stop', async () => {
  const n = await p.locator('.pcard').count();
  if (n < 7) throw new Error(`${n} paths`);
  const dots = await p.locator('.pcard:has-text("Data and SQL") .pcard-dots i').count();
  if (dots !== 8) throw new Error(`${dots} dots for 8 stops`);
});
await step('a lesson on a new path opens instantly, with no AI', async () => {
  await pathStop('Building with AI', 'Talking to a model');
  await p.waitForSelector('.story-head h1:not(.sr-only)', { timeout: 8000 });
  if (await p.locator('.writing').count()) throw new Error('it’s being written');
});
await step('a playground stop opens that playground and counts as done', async () => {
  await pathStop('Data and SQL', 'Answer real questions');
  await p.waitForSelector('.shelf.on:has-text("SQL")', { timeout: 5000 });
  await p.click('.side nav button:has-text("Path")');
  await p.waitForSelector('.stop.done:has(b:text-is("Answer real questions"))', { timeout: 5000 });
});
await step('a clever-idea stop opens the idea, ready to read', async () => {
  await pathStop('Apps for millions', 'What to forget');
  await p.waitForSelector('.story-head h1:not(.sr-only)', { timeout: 8000 });
  const h = await p.locator('.story-head h1:not(.sr-only)').innerText();
  if (!/Redis/.test(h)) throw new Error(h);
});
await step('“Next stop” from a lesson opens a clever idea, and the path comes along', async () => {
  await pathStop('Apps for millions', 'Caching: keep answers close');
  await p.waitForSelector('.pathbar');
  await p.click('.pathbar .btn:has-text("Next stop")');
  await p.waitForFunction(
    () => /Redis/.test(document.querySelector('.story-head h1:not(.sr-only)')?.innerText || ''),
    null,
    { timeout: 8000 },
  );
  if (!/Apps for millions/.test(await p.locator('.pathbar .pb-name').innerText()))
    throw new Error('no path strip on the idea');
});
await step('a playground opened from a path shows the path and the next stop', async () => {
  await pathStop('Data and SQL', 'Answer real questions');
  await p.waitForSelector('.playgrounds .pathbar', { timeout: 5000 });
  await p.click('.playgrounds .pathbar .btn:has-text("Next stop")');
  await p.waitForFunction(
    () => /Reddit/.test(document.querySelector('.story-head h1:not(.sr-only)')?.innerText || ''),
    null,
    { timeout: 8000 },
  );
});
await step('the map offers a ready-made path lesson for a skill', async () => {
  await p.click('.side nav button:has-text("You")');
  await p.click('.gtabs button:has-text("Your map")');
  await p.click('.tm-cell:has-text("Git")');
  await p.click('.tm-card .btn:has-text("Git: save points for code")');
  await p.waitForFunction(
    () => /Git/.test(document.querySelector('.story-head h1:not(.sr-only)')?.innerText || ''),
    null,
    { timeout: 8000 },
  );
  if (await p.locator('.writing').count()) throw new Error('it’s being written');
});
await step('Today on Home continues the path you picked', async () => {
  await p.click('.side nav button:has-text("Learn")');
  const t = await p.locator('.rail-hero').innerText({ timeout: 5000 });
  if (!/Data and SQL/.test(t)) throw new Error(t.replace(/\s+/g, ' '));
}); // the last path picked above
// GitHub's public search allows few requests without signing in, and CI machines share it: a clear "limit reached"
// message is a pass too (what's being checked is that Explore shows results or says why not, instead of hanging)
await step('explore search', async () => {
  await p.click('.side nav button:has-text("Explore")');
  await p.click('.gtabs button:has-text("Code")');
  await p.waitForSelector('.spec:not(.ghost), .story-err', { timeout: 30000 });
  if (await p.locator('.story-err').count())
    console.log(
      '   (GitHub said: ' + (await p.locator('.story-err').first().innerText()).slice(0, 80) + ')',
    );
});
await step('ideas', async () => {
  await p.click('.side nav button:has-text("Explore")');
  await p.click('.gtabs button:has-text("Clever ideas")');
  await p.waitForSelector('.idea-card', { timeout: 5000 });
});
await step('words', async () => {
  await p.click('.side nav button:has-text("You")');
  await p.click('.gtabs button:has-text("Your words")');
  await p.waitForSelector('.home-h', { timeout: 5000 });
});
await step('sample lesson runs', async () => {
  await p.keyboard.press(`${MOD}+k`);
  await p.keyboard.type('Binary search trees');
  await p.waitForTimeout(300);
  await p.click(
    '.pl-i:has(.pl-l:text-is("Binary search trees")):not(:has-text("new lesson")) >> nth=0',
  );
  await p.waitForSelector('.tree', { timeout: 60000 });
});
await step('step-through', async () => {
  await p.click('.act:has(.act-i:text("⏵⏵"))');
  await p.waitForSelector('.narration', { timeout: 30000 });
});
await step('remix → scratch', async () => {
  await p.click('.reset.remix');
  await p.waitForSelector('.story-head h1:has-text("Remix")', { timeout: 5000 });
  await p.click('.act.run');
  await p.waitForSelector('.tree', { timeout: 30000 });
});
await step('palette', async () => {
  await p.keyboard.press(`${MOD}+k`);
  await p.waitForSelector('.pal');
  await p.keyboard.type('flask');
  await p.waitForSelector('.pl-i');
  await p.keyboard.press('Escape');
});
await step('atlas overview', async () => {
  await openProject();
  await p.waitForSelector('.flow', { timeout: 30000 });
  await p.locator('.fnode').first().click();
  await p.waitForSelector('.dive.open', { timeout: 5000 });
});
await step('city hover', async () => {
  await p.click('.ab-nav button:has-text("Anatomy")');
  await p.waitForTimeout(600);
  // a first-visit tip may be up, as for anyone: skip it, the way a person would
  const skip = p.locator('.coach-tip button:has-text("Skip")');
  if (await skip.count()) await skip.first().click();
  const top = p.locator('.bld .f-t').nth(1);
  await top.scrollIntoViewIfNeeded();
  const bb = await top.boundingBox();
  const x = bb.x + bb.width / 2,
    y = bb.y + bb.height / 2;
  const under = await p.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('.bld')
        ? null
        : `${el?.tagName.toLowerCase()}.${String(el?.className?.baseVal ?? el?.className ?? '')
            .split(' ')
            .join('.')}`;
    },
    [x, y],
  );
  if (under) throw new Error(`the building is covered by ${under}`);
  await p.mouse.move(x, y, { steps: 4 });
  await p.waitForSelector('.cap-f', { timeout: 5000 });
});
await step('drawer', async () => {
  await p.locator('.bld').nth(1).dispatchEvent('click');
  await p.waitForSelector('.drawer .cm-content', { timeout: 10000 });
  await p.keyboard.press('Escape');
});
await step('compare page', async () => {
  await p.keyboard.press(`${MOD}+k`);
  await p.keyboard.type('compare');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.cmp-cols', { timeout: 5000 });
});
await step('idea lesson (cached) + toc', async () => {
  await p.click('.side nav button:has-text("Explore")');
  await p.click('.gtabs button:has-text("Clever ideas")');
  await p.click('.idea-hero');
  await p.waitForSelector('.lesson .story-head h1', { timeout: 120000 });
});
await step('shortcuts sheet', async () => {
  await p.click('text=Learn');
  await p.mouse.click(600, 60);
  await p.keyboard.press('?');
  await p.waitForSelector('.keys', { timeout: 3000 });
  await p.keyboard.press('Escape');
});
await step('listen + copy notes', async () => {
  await p.keyboard.press(`${MOD}+k`);
  await p.keyboard.type('Binary search trees');
  await p.waitForTimeout(300);
  await p.click(
    '.pl-i:has(.pl-l:text-is("Binary search trees")):not(:has-text("new lesson")) >> nth=0',
  );
  await p.waitForSelector('.listen', { timeout: 5000 });
  await p.click('.listen:has-text("Copy")');
  const t = await p.evaluate(() => navigator.clipboard.readText());
  if (!t.includes('```python')) throw new Error('notes: ' + t.slice(0, 60));
});
await step('atlas notes copy', async () => {
  await openProject();
  await p.waitForSelector('.flow');
  await p.click('.chip.icon[title^="Copy"]');
  const t = await p.evaluate(() => navigator.clipboard.readText());
  if (!t.startsWith('# ')) throw new Error('clipboard: ' + t.slice(0, 40));
});
await step('atlas walk + file map', async () => {
  await openProject();
  await p.waitForSelector('.flow');
  if (await p.locator('.walk-btn').count()) {
    await p.click('.walk-btn');
    await p.waitForSelector('.dive.open', { timeout: 5000 });
    await p.click('.walk-btn');
  }
  await p.click('.ab-nav button:has-text("Files")');
  await p.waitForSelector('.fm-tile', { timeout: 5000 });
}); // walk me through
await app.close();
fs.rmSync(profile, { recursive: true, force: true });
errs.push(
  ...(
    await p
      .evaluate(() =>
        performance
          .getEntriesByType('mark')
          .filter((m) => m.name.startsWith('bento:csp'))
          .map((m) => m.name),
      )
      .catch(() => [])
  ).map((m) => `CSP ${m}`),
);
console.log(errs.length ? `\nFailed: ${errs.join(' | ')}` : '\nThe whole tour works.');
process.exit(errs.length ? 1 : 0);
