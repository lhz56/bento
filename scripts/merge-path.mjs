import fs from 'fs';
const out = {};
for (const w of [0, 1, 2]) { try { Object.assign(out, JSON.parse(fs.readFileSync(`/tmp/pathgen-${w}.json`, 'utf8'))); } catch {} }
const clean = {};
for (const [id, L] of Object.entries(out)) {
  const { thinking, _ask, chat, work, repaired, touched, model, ...keep } = L;
  if ((!keep.code && !keep.steps?.length) || !keep.story?.length) continue;
  const n = keep.code.split('\n').length;
  if (!Array.isArray(keep.pseudo)) keep.pseudo = [];
  if (keep.pseudo.length !== n) { console.log(`  ${id}: pseudo ${keep.pseudo.length} vs ${n} lines, padding`); keep.pseudo = [...keep.pseudo.slice(0, n), ...Array(Math.max(0, n - keep.pseudo.length)).fill('')]; }
  keep.notes = (keep.notes || []).filter((x) => x.from >= 1 && x.to <= n);
  clean[id] = { ...keep, level: 'kid' };
}
const dst = new URL('../src/path-prebuilt.json', import.meta.url).pathname;
fs.writeFileSync(dst, JSON.stringify(clean));
console.log(Object.keys(clean).length, 'lessons,', (fs.statSync(dst).size / 1024).toFixed(0), 'KB:', Object.keys(clean).join(' '));
