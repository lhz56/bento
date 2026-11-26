// Pre-writes the 12 daily-bug challenges through the real app. Run one topic per launch:  node scripts/pregen-bugs.mjs <n> 1 "recursion"  (writes /tmp/bugs-<n>.json; needs playwright)
// Generate the 12 daily-bug challenges (Python, beginner) through the real app.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const [, , worker, total, only] = process.argv;
const TOPICS = [
  'arrays',
  'strings',
  'loops',
  'recursion',
  'dictionaries',
  'off-by-one errors',
  'sorting',
  'string formatting',
  'conditionals',
  'functions and return values',
  'nested lists',
  'counting things',
];
const env = { ...process.env, BENTO_USERDATA: `/tmp/bento-bug${worker}`, BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
fs.rmSync(`/tmp/bento-bug${worker}`, { recursive: true, force: true });
const app = await electron.launch({ args: [new URL('..', import.meta.url).pathname], env });
const p = await app.firstWindow();
await p.waitForSelector('.side, .onb');
await p.evaluate(() => {
  localStorage.setItem(
    'bento.settings',
    JSON.stringify({
      onboarded: true,
      model: 'claude:sonnet',
      level: 'student',
      lang: 'python',
      voice: 'English',
    }),
  );
  localStorage.setItem('bento.coach.lesson', '1');
});
await p.reload();
await p.waitForSelector('.side');
const out = {};
for (const topic of only ? only.split(',') : TOPICS.filter((_, i) => i % +total === +worker)) {
  const t0 = Date.now();
  try {
    await p.evaluate(
      (t) => window.__ask(t, { mode: 'challenge', lang: 'python', level: 'student' }),
      topic,
    );
    await p.waitForSelector('.lesson .story-head h1', { timeout: 240000 });
    await p.waitForSelector('.writing', { state: 'detached', timeout: 300000 });
    await p.waitForTimeout(6000);
    const L = await p.evaluate(
      (t) =>
        JSON.parse(localStorage.getItem('bento.lessons')).find(
          (l) => l.q === t && l.mode === 'challenge',
        ),
      topic,
    );
    const ok = L && L.status === 'done' && L.code && L.tests?.cases?.length !== 0 && L.tests;
    console.log(
      `[b${worker}] ${topic} ${((Date.now() - t0) / 1000).toFixed(0)}s ok=${!!ok} tests=${JSON.stringify(L?.tests)?.slice(0, 60)}`,
    );
    if (ok) out[topic] = L;
  } catch (e) {
    console.log(`[b${worker}] ${topic} FAILED ${e.message.split('\n')[0]}`);
  }
}
fs.writeFileSync(`/tmp/bugs-${worker}.json`, JSON.stringify(out));
await app.close();
