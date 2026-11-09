// Pre-generates The path's lessons (beginner level, English) through the real app, like pregen-ideas.mjs.
// node scripts/pregen-path.mjs <worker> <total>   then   node scripts/merge-path.mjs
import { _electron as electron } from 'playwright';
import fs from 'fs';
const [, , worker, total] = process.argv;
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p10', 'p11', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const ROOT = new URL('..', import.meta.url).pathname;
const env = { ...process.env, BENTO_USERDATA: `/tmp/bento-path${worker}`, BENTO_NO_GH: '1' }; delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ args: [ROOT], env });
const p = await app.firstWindow(); await p.waitForSelector('.side, .onb');
await p.evaluate(() => { localStorage.setItem('bento.settings', JSON.stringify({ onboarded: true, model: 'claude:sonnet', level: 'kid', lang: 'python', voice: 'English' })); localStorage.setItem('bento.coach.lesson', '1'); });
await p.reload(); await p.waitForSelector('.side');
const out = {};
for (const id of IDS.filter((_, i) => i % +total === +worker)) {
  const t0 = Date.now();
  try {
    const lid = await p.evaluate((id) => window.__genStop(id), id);
    await p.waitForSelector('.lesson .story-head h1', { timeout: 240000 });
    await p.waitForSelector('.writing', { state: 'detached', timeout: 400000 });
    await p.waitForTimeout(9000);
    const st = await p.evaluate(() => ({ err: document.querySelector('.err-card')?.innerText || null, viz: document.querySelectorAll('.viz, .webviz').length }));
    const L = await p.evaluate((lid) => JSON.parse(localStorage.getItem('bento.lessons')).find((l) => l.id === lid), lid);
    console.log(`[w${worker}] ${id} ${((Date.now() - t0) / 1000).toFixed(0)}s err=${!!st.err} viz=${st.viz} title=${L?.title}`);
    if (L && !st.err && L.status === 'done' && (L.code || L.steps?.length)) out[id] = L; else console.log(`[w${worker}] ${id} SKIPPED ${st.err?.slice(0, 120)}`);
  } catch (e) { console.log(`[w${worker}] ${id} FAILED ${e.message.split('\n')[0]}`); }
}
fs.writeFileSync(`/tmp/pathgen-${worker}.json`, JSON.stringify(out));
await app.close();
