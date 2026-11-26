// Pre-writes The path's lessons (beginner level, English) through the real app, like pregen-ideas.mjs. It uses your
// own AI plan (Claude Sonnet), in a hidden window with a throwaway profile, and writes only stops that don't have a
// lesson yet, so adding a path means writing just its new stops.
//   node scripts/pregen-path.mjs <worker> <total> [stop ids…]   then   node scripts/merge-path.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
const [, , worker, total, ...only] = process.argv;
const ROOT = new URL('..', import.meta.url).pathname;
const profile = `/tmp/bento-path${worker}`;
const SETTINGS = {
  onboarded: true,
  model: 'claude:sonnet',
  level: 'kid',
  lang: 'python',
  voice: 'English',
};
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(`${profile}/bento-store.json`, JSON.stringify({ 'bento.settings': SETTINGS }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.BENTO_DEV;
const app = await electron.launch({
  executablePath: (await import('electron')).default,
  args: [ROOT],
  env,
});
const p = await app.firstWindow();
await p.waitForSelector('.side, .onb');
await p.evaluate((s) => {
  localStorage.setItem('bento.settings', JSON.stringify(s));
  localStorage.setItem('bento.coach.lesson', '1');
}, SETTINGS);
await p.reload();
await p.waitForSelector('.side');
const IDS = only.length ? only : await p.evaluate(() => window.__missingStops());
const out = {};
for (const id of IDS.filter((_, i) => i % +total === +worker)) {
  const t0 = Date.now();
  try {
    const lid = await p.evaluate((id) => window.__genStop(id), id);
    // finished when the saved lesson stops streaming
    await p.waitForFunction(
      (lid) => {
        const L = JSON.parse(localStorage.getItem('bento.lessons') || '[]').find(
          (l) => l.id === lid,
        );
        return L && L.status !== 'streaming';
      },
      lid,
      { timeout: 600000, polling: 2000 },
    );
    await p.waitForTimeout(9000);
    const st = await p.evaluate(() => ({
      err: document.querySelector('.err-card')?.innerText || null,
      viz: document.querySelectorAll('.viz, .webviz').length,
    }));
    const L = await p.evaluate(
      (lid) => JSON.parse(localStorage.getItem('bento.lessons')).find((l) => l.id === lid),
      lid,
    );
    console.log(
      `[w${worker}] ${id} ${((Date.now() - t0) / 1000).toFixed(0)}s err=${!!st.err} viz=${st.viz} title=${L?.title}`,
    );
    if (L && !st.err && L.status === 'done' && (L.code || L.steps?.length)) out[id] = L;
    else console.log(`[w${worker}] ${id} SKIPPED ${st.err?.slice(0, 120)}`);
  } catch (e) {
    console.log(`[w${worker}] ${id} FAILED ${e.message.split('\n')[0]}`);
  }
}
fs.writeFileSync(`/tmp/pathgen-${worker}.json`, JSON.stringify(out));
await app.close();
fs.rmSync(profile, { recursive: true, force: true });
