// Takes apart one repo through the real app and saves the result for src/atlas-featured.json.
// node scripts/featured-atlas.mjs owner/repo 0   → /tmp/feat-0.json (see docs/ARCHITECTURE.md)
import { _electron as electron } from 'playwright';
import fs from 'fs';
const [, , repo, w] = process.argv;
const ud = `/tmp/bento-feat${w}`;
const env = { ...process.env, BENTO_USERDATA: ud };
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
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
  localStorage.setItem('bento.coach.atlas', '1');
});
await p.reload();
await p.waitForSelector('.side');
const t0 = Date.now();
await p.click('text=Explore code');
await p.fill('.ex-search input', repo);
await p.keyboard.press('Enter');
await p.waitForSelector('.flow', { timeout: 200000 });
await p.waitForSelector('.ab-live', { timeout: 60000 }).catch(() => {});
await p.waitForSelector('.ab-live', { state: 'detached', timeout: 400000 });
await p.waitForTimeout(1500);
const c = JSON.parse(fs.readFileSync(`${ud}/atlas/${repo.replace('/', '__')}.json`, 'utf8'));
const N = c.narr || {};
console.log(
  repo,
  ((Date.now() - t0) / 1000).toFixed(0) + 's',
  'done',
  c.done,
  'flow',
  !!N.flow,
  'terms',
  N.terms?.length,
  'build',
  !!N.build,
  'tour',
  N.tour?.length,
  'journeys',
  N.journeys?.length,
  'roles',
  Object.keys(N.roles || {}).length,
);
fs.writeFileSync(`/tmp/feat-${w}.json`, JSON.stringify(c));
await app.close();
