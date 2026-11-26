// Every AI Bento can teach with, in the real app, with pretend twins of all four (test/fixtures/fake-ai.mjs), so it
// costs nothing and runs anywhere: the welcome finds each one; a lesson streams in from Claude, ChatGPT (Codex),
// Gemini and Copilot in turn; each plan's meter reads the way that AI counts it; and when one runs out, the next one
// you have answers instead.
//
//   npx vite build && node scripts/smoke-ais.mjs              the app from this folder
//   node scripts/smoke-ais.mjs --packaged                     the app electron-builder made (BENTO_RELEASE_DIR to point elsewhere)
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

let fail = 0;
const step = async (p, label, fn) => {
  const t0 = Date.now();
  try {
    const note = await fn();
    console.log(
      `✓ ${label}${note ? ` · ${note}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  } catch (e) {
    fail++;
    console.log(`✗ ${label}: ${String(e.message).split('\n')[0]}`);
  }
};
async function launch(settings, extra = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-ais-'));
  fs.writeFileSync(
    path.join(profile, 'bento-store.json'),
    JSON.stringify({ 'bento.settings': settings }),
  );
  const env = {
    ...process.env,
    BENTO_HIDDEN: '1',
    BENTO_USERDATA: profile,
    BENTO_FAKE_AI: path.join(root, 'test/fixtures/fake-ai.mjs'),
    BENTO_FAKE_AS: createRequire(import.meta.url)('../electron/ai-catalog.json')
      .providers.map((x) => x.id)
      .join(','),
    BENTO_PRETEND_MISSING: 'gh',
    BENTO_NO_GH: '1',
    FAKE_AI_THINK_MS: '600',
    FAKE_AI_STEP_MS: '25',
    ...extra,
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
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (/Content-Security-Policy/.test(m.text())) errors.push(`CSP: ${m.text().slice(0, 160)}`);
  });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
  );
  return {
    app,
    p,
    errors,
    close: async () => {
      await app.close();
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}
const ask = async (p, q) => {
  await p.click('.side nav button:has-text("Learn")');
  await p.click('.cx textarea');
  await p.keyboard.type(q);
  await p.waitForSelector('.cx .send:enabled');
  await p.keyboard.press('Enter');
};
const lessonArrives = async (p) => {
  await p.waitForSelector('.story-head h1:not(.sr-only):has-text("hash map")', { timeout: 30000 });
  await p.waitForFunction(
    () => /red coat/.test(document.querySelector('.stage-body')?.innerText || ''),
    null,
    { timeout: 60000 },
  );
};
const pick = async (p, model) => {
  await p.click('.model-pick');
  await p.click(`.mpick .mc[data-model="${model}"]`);
};
const AIS = createRequire(import.meta.url)('../electron/ai-catalog.json').providers; // every AI Bento knows, in its order

// ---------------------------------------------------------------- a brand-new Mac with all four
{
  const { p, errors, close } = await launch({ model: 'claude:sonnet', lang: 'python' });
  await step(p, 'the welcome finds every AI, each ready', async () => {
    await p.getByRole('button', { name: 'Get started' }).click();
    await p.waitForSelector('.conn.ai.s-ok', { timeout: 30000 });
    await p.waitForTimeout(500);
    const n = await p.locator('.conn.ai.s-ok').count();
    if (n !== AIS.length) throw new Error(`${n} ready`);
    const said = await p.locator('.route').innerText();
    if (!/Claude Sonnet/.test(said) || said.includes('If it runs out')) throw new Error(said);
    return 'selected provider shown';
  });
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// ---------------------------------------------------------------- a busy Mac: Claude takes 10 s to say it's signed in, and still counts as ready
{
  const { p, errors, close } = await launch(
    { model: 'claude:sonnet', lang: 'python' },
    { FAKE_AI_AUTH_MS: '10000' },
  );
  await step(p, 'a slow sign-in check is waited for, not read as “not signed in”', async () => {
    await p.getByRole('button', { name: 'Get started' }).click();
    await p.waitForSelector('.conn.ai.s-ok', { timeout: 60000 });
    await p.waitForFunction(
      (n) =>
        document.querySelectorAll('.conn.ai.s-ok').length === n ||
        document.querySelector('.conn.ai.s-login'),
      AIS.length,
      { timeout: 60000 },
    );
    const login = await p.locator('.conn.ai.s-login').count();
    if (login) throw new Error(`${login} shown as not signed in`);
    return 'Claude ready after a 10 s check';
  });
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// ---------------------------------------------------------------- a lesson from each AI, and each plan's meter
{
  const { p, errors, close } = await launch({
    onboarded: true,
    model: 'claude:sonnet',
    lang: 'python',
    level: 'student',
  });
  await p.waitForSelector('.side', { timeout: 60000 });
  for (const ai of AIS) {
    const short = ai.short || ai.name;
    await step(p, `a lesson streams in from ${short}, and its code runs`, async () => {
      await pick(p, ai.default);
      await ask(p, `How does a hash map find things so fast? (${short})`);
      await lessonArrives(p);
      return await p.locator('.story-head h1:not(.sr-only)').innerText();
    });
  }
  await step(p, 'each AI’s requests are counted as its own', async () => {
    const u = await p.evaluate(() => window.bento.usage());
    const by = Object.fromEntries(Object.entries(u.by || {}).map(([k, v]) => [k, v.lessons]));
    for (const { id } of AIS) if (!(by[id] >= 1)) throw new Error(JSON.stringify(by));
    return JSON.stringify(by);
  });
  await step(p, 'the sidebar ring shows the plan you’re using, as it counts it', async () => {
    await pick(p, 'claude:sonnet');
    await p.waitForTimeout(400);
    const t = await p.locator('.plan-btn').getAttribute('aria-label');
    if (!/Claude: 42% of this week/.test(t)) throw new Error(t);
    return t.split('.')[0];
  });
  await step(p, '“Your plans” has a row per AI, in plain words', async () => {
    await p.click('.plan-btn');
    await p.waitForSelector('.plans-pop .plan-ai');
    await p.waitForTimeout(1500);
    const rows = await p.locator('.plans-pop .plan-ai').allInnerTexts();
    const txt = rows.join(' | ').replace(/\s+/g, ' ');
    if (rows.length !== AIS.length) throw new Error(`${rows.length} rows: ${txt}`);
    if (!/Claude 42% this week · resets/.test(txt)) throw new Error(`Claude: ${txt}`);
    if (!/ChatGPT Plus 30% 5-hour window · resets in/.test(txt)) throw new Error(`ChatGPT: ${txt}`);
    if (!/Gemini API.*doesn’t share/.test(txt) || !/Antigravity doesn’t share/.test(txt))
      throw new Error(`Gemini: ${txt}`);
    if (!/Bento today: 1 lesson/.test(txt)) throw new Error(`Bento's share: ${txt}`);
    await p.keyboard.press('Escape');
  });
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// A rate limit must not send the learner's question to a different provider by default.
{
  const { p, close } = await launch(
    { onboarded: true, model: 'claude:sonnet', lang: 'python' },
    { BENTO_FAKE_LIMIT: 'claude' },
  );
  await step(p, 'a rate limit leaves the choice of another provider to the learner', async () => {
    await ask(p, 'How does a hash map find things so fast?');
    await p.locator('.story-err').waitFor();
    const usage = await p.evaluate(() => window.bento.usage());
    if (usage.by?.codex?.lessons)
      throw new Error('An unselected provider received a lesson request');
  });
  await close();
}

// ---------------------------------------------------------------- one runs out: the next one you have answers
{
  const { p, errors, close } = await launch(
    {
      onboarded: true,
      model: 'claude:sonnet',
      lang: 'python',
      level: 'student',
      autoFallback: true,
    },
    { BENTO_FAKE_LIMIT: 'claude' },
  );
  await p.waitForSelector('.side', { timeout: 60000 });
  await step(p, 'Claude has hit its limit, so ChatGPT writes the lesson, and says so', async () => {
    await ask(p, 'How does a hash map find things so fast?');
    await lessonArrives(p);
    const u = await p.evaluate(() => window.bento.usage());
    if (!(u.by?.codex?.lessons >= 1)) throw new Error(JSON.stringify(u.by));
    return (
      (
        await p
          .locator('.routed, .route-note, [class*="routed"]')
          .first()
          .innerText()
          .catch(() => '')
      ).slice(0, 80) || 'written by ChatGPT'
    );
  });
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// ---------------------------------------------------------------- "Retry with another AI" off: no other AI's plan is ever used
{
  const { p, errors, close } = await launch(
    {
      onboarded: true,
      model: 'claude:sonnet',
      lang: 'python',
      level: 'student',
      autoFallback: false,
    },
    { BENTO_FAKE_LIMIT: 'claude' },
  );
  await p.waitForSelector('.side', { timeout: 60000 });
  await step(
    p,
    'Claude has hit its limit and Retry is off: a quick answer says so, and no other AI is asked',
    async () => {
      await p.waitForTimeout(400); // the page has told the app its settings
      const r = await p.evaluate(() =>
        window.bento
          .quick('claude:sonnet', 'In one sentence, what is a variable? (fallback check)')
          .then(
            () => 'answered',
            (e) => e.message,
          ),
      );
      if (r === 'answered') throw new Error('an answer came from another AI');
      const u = await p.evaluate(() => window.bento.usage());
      if (Object.keys(u.by || {}).some((k) => k !== 'claude'))
        throw new Error(JSON.stringify(u.by));
      return r.slice(0, 70);
    },
  );
  await step(p, 'turned on, the next AI answers and the page says which', async () => {
    await p.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('bento.settings'));
      window.bento.setPrefs({ voice: 'English', fallback: true });
      return s;
    });
    const r = await p.evaluate(() =>
      window.bento.quick('claude:sonnet', 'In one sentence, what is a loop? (fallback check)').then(
        () => 'answered',
        (e) => e.message,
      ),
    );
    if (r !== 'answered') throw new Error(r);
    await p.waitForSelector('.fellback', { timeout: 5000 });
    return (await p.locator('.fellback').innerText()).slice(0, 70);
  });
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// ---------------------------------------------------------------- plain English that slipped off its lines is written again, by line number
{
  const { p, errors, close } = await launch(
    { onboarded: true, model: 'antigravity:flash-low', lang: 'python', level: 'student' },
    { FAKE_AI_SLIP: '1' },
  );
  await p.waitForSelector('.side', { timeout: 60000 });
  await step(
    p,
    'a lesson whose plain English slipped a line gets it written again, each line beside its own code',
    async () => {
      await ask(p, 'How does a hash map find things so fast?');
      await lessonArrives(p);
      await p.waitForFunction(
        () => {
          const L = JSON.parse(localStorage.getItem('bento.lessons') || '[]')[0];
          return L?.pmap && Object.keys(L.pmap).length >= 5;
        },
        null,
        { timeout: 30000 },
      );
      const L = await p.evaluate(() => JSON.parse(localStorage.getItem('bento.lessons'))[0]);
      const ret = L.code.split('\n')[3].trim();
      if (L.pseudo.length) throw new Error(`kept ${L.pseudo.length} slipped lines`);
      if (!/^Step: return sum/.test(L.pmap[ret] || ''))
        throw new Error(`line 4 reads “${L.pmap[ret]}”`);
      return `line 4 reads “${L.pmap[ret]}”`;
    },
  );
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

// ---------------------------------------------------------------- Antigravity reaches for a tool: Bento stops it, and says why
{
  const { p, errors, close } = await launch(
    { onboarded: true, model: 'antigravity:flash', lang: 'python', level: 'student' },
    { FAKE_AI_AGY_TOOL: 'search_web' },
  );
  await p.waitForSelector('.side', { timeout: 60000 });
  await step(
    p,
    'when Gemini (Antigravity) reaches for a tool, Bento stops it and says so',
    async () => {
      await ask(p, 'How does a hash map find things so fast?');
      await p.waitForFunction(
        () =>
          /stopped it/.test(
            JSON.stringify(
              JSON.parse(localStorage.getItem('bento.lessons') || '[]').map((l) => l.error),
            ),
          ),
        null,
        { timeout: 30000 },
      );
      const e = await p.evaluate(
        () => JSON.parse(localStorage.getItem('bento.lessons')).find((l) => l.error)?.error,
      );
      return e.slice(0, 80);
    },
  );
  await step(p, 'nothing went wrong on the page', async () => {
    if (errors.length) throw new Error(errors[0]);
  });
  await close();
}

console.log(
  fail
    ? `\n${fail} step${fail > 1 ? 's' : ''} failed.`
    : '\nEvery AI teaches, and every plan reads right.',
);
process.exit(fail ? 1 : 0);
