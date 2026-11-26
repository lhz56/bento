// Bento with only a keyboard: the skip link, dialogs that keep focus and give it back, ⌘K as a real combobox, the map,
// the system designer and the code city all work with Tab, the arrow keys, Enter and Space, and a crash is announced.
// Sets up what it needs itself and uses no AI. On Windows and Linux, ⌘ is Ctrl.
//
//   npx vite build && node scripts/audit-keyboard.mjs     the app from this folder
//   node scripts/audit-keyboard.mjs --packaged            the app electron-builder made
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-keys-'));
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
// a project to walk through: taxonomy ships with Bento, already read, so it opens without a download
const openTaxonomy = async () => {
  await p.click('.side nav button:has-text("Explore")');
  await p.click('.gtabs button:has-text("Code")');
  await p
    .click('.ready-box button:has-text("taxonomy"), .spec:has-text("taxonomy")')
    .catch(async () => {
      await p.click('text=taxonomy');
    });
  await p.waitForSelector('.ab-nav', { timeout: 30000 });
};

let fail = 0;
const check = (ok, label, extra = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` → ${extra}`}`);
};
const active = () =>
  p.evaluate(() => {
    const a = document.activeElement;
    return {
      cls: String(a?.className?.baseVal ?? a?.className ?? ''),
      tag: a?.tagName,
      text: (a?.innerText || a?.getAttribute?.('aria-label') || '').slice(0, 50),
    };
  });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => {
  if (/Content-Security-Policy/.test(m.text())) errs.push(`CSP: ${m.text().slice(0, 160)}`);
});

// a fresh page, like a person arriving: Home puts you straight in the ask box (inside the main area)
await p.reload();
await p.waitForSelector('.side');
await p.waitForTimeout(500);
const start = await p.evaluate(
  () =>
    !!document.activeElement?.closest('#content') && document.activeElement.tagName === 'TEXTAREA',
);
check(start, 'Home starts in the ask box', JSON.stringify(await active()));
// the skip link is the first stop of the page: walk back to it and use it
let steps = 0;
while (steps < 60 && !/skip/.test((await active()).cls)) {
  await p.keyboard.press('Shift+Tab');
  steps++;
}
check(
  /skip/.test((await active()).cls),
  `“Skip to the main area” is the first stop (${steps} steps back)`,
  JSON.stringify(await active()),
);
await p.keyboard.press('Enter');
check(
  (await active()).cls.includes('sheet'),
  'skip link moves focus to the main area',
  JSON.stringify(await active()),
);

// Settings: focus moves in, Tab can't escape, Escape closes, focus comes back
await p.focus('.side nav button:has-text("Practice")');
await p.keyboard.press(`${MOD}+,`);
await p.waitForSelector('.settings[role="dialog"]');
let inside = true;
for (let i = 0; i < 40; i++) {
  await p.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
  if (!(await p.evaluate(() => !!document.activeElement.closest('.settings')))) {
    inside = false;
    break;
  }
}
check(inside, 'Tab and Shift+Tab stay inside Settings (40 presses)');
await p.keyboard.press('Escape');
await p.waitForTimeout(200);
check(!(await p.locator('.settings').count()), 'Escape closes Settings');
check(
  (await active()).text.includes('Practice'),
  'focus goes back to where it was',
  JSON.stringify(await active()),
);

// Palette: a combobox; arrows move the highlighted option; Enter runs it
await p.keyboard.press(`${MOD}+k`);
await p.waitForSelector('.pal[role="dialog"]');
await p.keyboard.type('your map');
await p.waitForTimeout(150);
const ad = await p.evaluate(() => {
  const i = document.querySelector('.pal-in input');
  const id = i.getAttribute('aria-activedescendant');
  return { role: i.getAttribute('role'), id, opt: id && document.getElementById(id)?.innerText };
});
check(
  ad.role === 'combobox' && /map/i.test(ad.opt || ''),
  'search box is a combobox pointing at the highlighted result',
  JSON.stringify(ad),
);
await p.keyboard.press('Enter');
await p.waitForSelector('.tm');
check(true, 'Enter on “Your map” opens the map');

// Map: Tab reaches the stars; Enter opens one; the name says what it is
let star = null;
for (let i = 0; i < 120 && !star; i++) {
  await p.keyboard.press('Tab');
  const a = await active();
  if (a.cls.includes('tm-cell')) star = a;
}
check(!!star, 'Tab reaches the stars on the map');
const starName = await p.evaluate(() => {
  const a = document.activeElement;
  return `${a.tagName} · ${a.getAttribute('title')}`;
});
await p.keyboard.press('Enter');
await p.waitForTimeout(250);
check((await p.locator('.tm-card').count()) === 1, `Enter on a skill opens its card (${starName})`);
const snap = await p
  .locator('.tm')
  .ariaSnapshot()
  .catch((e) => 'ERR ' + e.message);
check(
  /button "[^"]+"/.test(snap),
  'skills are buttons with names a screen reader can say',
  snap.slice(0, 200),
);
console.log(
  '   e.g.',
  snap
    .split('\n')
    .filter((l) => /button/.test(l))
    .slice(0, 3)
    .join(' | '),
);

// Design for a billion: parts open with the keyboard
await p.click('.side nav button:has-text("Practice")');
await p.click('.gtabs button:has-text("Playgrounds")');
await p.click('.shelf:has-text("Design for a billion")');
await p.waitForSelector('.sb-svg');
await p.locator('.sb-node:has-text("Cache")').focus();
await p.keyboard.press('Enter');
await p.waitForTimeout(200);
check(
  (
    await p
      .locator('.sb-info')
      .innerText()
      .catch(() => '')
  ).includes('Cache'),
  'Enter on a part shows what it does',
);
await p.locator('.sb-node:has-text("Load balancer")').focus();
await p.keyboard.press(' ');
await p.waitForTimeout(200);
check(
  (
    await p
      .locator('.sb-info')
      .innerText()
      .catch(() => '')
  ).includes('Load balancer'),
  'Space works too',
);

// Code city: arrow keys walk the buildings, Enter opens one
await openTaxonomy();
await p.click('.ab-nav button:has-text("Anatomy")');
await p.waitForSelector('.city-svg', { timeout: 30000 });
// the city can be redrawn once just after it appears, which drops focus: refocus it, and keep walking until it speaks
let said = '';
for (let i = 0; i < 12 && !/\.\w+, in /.test(said); i++) {
  if (!(await p.evaluate(() => document.activeElement?.classList?.contains('city-svg'))))
    await p.locator('.city-svg').focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(250);
  said = await p.evaluate(() =>
    [...document.querySelectorAll('.city .sr-only')].map((x) => x.textContent).join(''),
  );
}
const where = () =>
  p.evaluate(() => {
    const a = document.activeElement;
    return `focus on ${a?.tagName?.toLowerCase()}.${String(a?.className?.baseVal ?? a?.className ?? '').split(' ')[0]} · ${document.querySelector('.city-svg')?.getAttribute('aria-label')?.slice(0, 50)}`;
  });
check(
  /\.\w+, in /.test(said),
  'walking the city says each file and its district',
  said || (await where()),
);
await p.keyboard.press('Enter');
await p.waitForSelector('aside.drawer', { timeout: 10000 }).catch(() => {});
check((await p.locator('aside.drawer').count()) === 1, 'Enter opens that file');
await p.keyboard.press('Escape');

// Running code is announced
await p.click('.side nav button:has-text("Learn")');
await p
  .click('.cx-btn.quiet')
  .then(() => p.click('.cx-set .seg button:has-text("Python")'))
  .then(() => p.mouse.click(5, 300))
  .catch(() => {});
await p.keyboard.press(`${MOD}+k`);
await p.keyboard.type('Scratchpad');
await p.waitForTimeout(250);
await p.keyboard.press('Enter');
await p.waitForSelector('.cm-content');
const cmName = await p.getAttribute('.cm-content', 'aria-label');
check(/code editor/.test(cmName || ''), 'the editor has a name and says how to leave it', cmName);
await p.click('.cm-content');
await p.keyboard.press(`${MOD}+a`);
await p.keyboard.insertText('print("hi")\nprint(1/0)\n');
await p.keyboard.press(`${MOD}+Enter`);
await p.waitForSelector('.err-card', { timeout: 30000 });
await p.waitForTimeout(400);
const live = await p.evaluate(() =>
  [...document.querySelectorAll('body > .sr-only[aria-live]')]
    .map((x) => x.textContent)
    .join(' | '),
);
check(/stopped on line 2/.test(live), 'a crash is announced with its line', live);
check((await p.getAttribute('.err-card', 'role')) === 'alert', 'the error card is an alert');
await p.keyboard.press('Escape');
await p.keyboard.press('Tab');
check(
  !(await p.evaluate(() => !!document.activeElement.closest('.cm-editor'))),
  'Escape then Tab leaves the editor',
  JSON.stringify(await active()),
);

console.log(errs.length ? `page errors:\n${errs.join('\n')}` : 'no page errors');
await app.close();
fs.rmSync(profile, { recursive: true, force: true });
errs.push(
  ...(await p
    .evaluate(() =>
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith('bento:csp'))
        .map((m) => m.name),
    )
    .catch(() => [])),
);
if (errs.length) console.log(`✗ errors on the page: ${errs.slice(0, 3).join(' | ')}`);
console.log(
  fail || errs.length
    ? `\n${fail} keyboard check${fail === 1 ? '' : 's'} failed.`
    : '\nEverything works from the keyboard.',
);
process.exit(fail || errs.length ? 1 : 0);
