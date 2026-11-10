// Adds the lessons pregen-path.mjs wrote (/tmp/pathgen-*.json) to src/path-prebuilt.json, keeping the ones already there.
import fs from 'fs';
const dst = new URL('../src/path-prebuilt.json', import.meta.url).pathname;
const out = {};
for (const f of fs.readdirSync('/tmp').filter((f) => /^pathgen-\d+\.json$/.test(f))) { try { Object.assign(out, JSON.parse(fs.readFileSync(`/tmp/${f}`, 'utf8'))); } catch {} }
const clean = JSON.parse(fs.readFileSync(dst, 'utf8'));
const before = Object.keys(clean).length;
for (const [id, L] of Object.entries(out)) {
  const { thinking, _ask, chat, work, repaired, touched, model, check, ...keep } = L; // check: the writing run's own review, not the learner's
  if ((!keep.code && !keep.steps?.length) || !keep.story?.length) continue;
  const n = (keep.code || '').split('\n').length;
  if (!Array.isArray(keep.pseudo)) keep.pseudo = [];
  if (keep.code && keep.pseudo.length !== n) { console.log(`  ${id}: pseudo ${keep.pseudo.length} vs ${n} lines, padding`); keep.pseudo = [...keep.pseudo.slice(0, n), ...Array(Math.max(0, n - keep.pseudo.length)).fill('')]; }
  keep.notes = (keep.notes || []).filter((x) => x.from >= 1 && x.to <= n);
  clean[id] = { ...keep, level: 'kid' };
}
fs.writeFileSync(dst, JSON.stringify(clean));
console.log(`${Object.keys(clean).length - before} added,`, Object.keys(clean).length, 'lessons,', (fs.statSync(dst).size / 1024).toFixed(0), 'KB:', Object.keys(clean).join(' '));
