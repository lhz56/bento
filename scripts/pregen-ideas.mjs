// Pre-generates Clever-idea lessons through the real app (needs `claude` signed in and `npm run build` first).
// Run 3 in parallel:  node scripts/pregen-ideas.mjs 0 3 & node scripts/pregen-ideas.mjs 1 3 & node scripts/pregen-ideas.mjs 2 3
// then: node scripts/merge-ideas.mjs   (merges into src/ideas-prebuilt.json). ONLY=id1,id2 limits the run to those ideas. Needs `npm i -D playwright`.
// Generate idea lessons through the real app (so auto-repair and the real runtimes apply), then dump them.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const [, , worker, total] = process.argv;
const env = { ...process.env, BENTO_USERDATA: `/tmp/bento-gen${worker}`, BENTO_NO_GH: '1' }; delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const ROOT = new URL('..', import.meta.url).pathname;
const app = await electron.launch({ args: [ROOT], env });
const p = await app.firstWindow(); await p.waitForSelector('.side, .onb');
await p.evaluate(() => localStorage.setItem('bento.settings', JSON.stringify({ onboarded: true, model: 'claude:sonnet', level: 'student', lang: 'python', voice: 'English' })));
await p.evaluate(() => { localStorage.setItem('bento.coach.lesson', '1'); });
await p.reload(); await p.waitForSelector('.side');
const ids = await p.evaluate(() => [...document.querySelectorAll('nav button')].length) && (await import('../src/ideas.js')).IDEAS.map((i) => i.id);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; // ONLY=id1,id2 regenerates just those
const mine = ids.filter((id) => !only || only.includes(id)).filter((_, i) => i % +total === +worker);
const out = {};
for (const id of mine) {
  const t0 = Date.now();
  try {
    await p.click('text=Clever ideas'); await p.waitForSelector('.idea-card');
    await p.evaluate((id) => window.__openIdea?.(id), id);
    await p.waitForSelector('.lesson .story-head h1', { timeout: 240000 });
    await p.waitForSelector('.writing', { state: 'detached', timeout: 300000 });
    await p.waitForTimeout(9000); // let it run, and auto-repair if it crashed
    const st = await p.evaluate(() => ({ err: document.querySelector('.err-card')?.innerText || null, viz: document.querySelectorAll('.viz').length }));
    const L = await p.evaluate((id) => JSON.parse(localStorage.getItem('bento.lessons')).find((l) => l.context?.ideaId === id), id);
    console.log(`[w${worker}] ${id} ${((Date.now() - t0) / 1000).toFixed(0)}s err=${!!st.err} viz=${st.viz} repaired=${!!L?.repaired}`);
    if (L && !st.err && L.status === 'done') out[id] = L; else console.log(`[w${worker}] ${id} SKIPPED ${st.err?.slice(0, 120)}`);
  } catch (e) { console.log(`[w${worker}] ${id} FAILED ${e.message.split('\n')[0]}`); }
}
fs.writeFileSync(`/tmp/pregen-${worker}.json`, JSON.stringify(out));
await app.close();
