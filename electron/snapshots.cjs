// A quiet daily copy of your lessons, progress, settings and projects, kept for a week. If the live file is ever damaged
// or something goes wrong, Settings → Restore… opens this folder and any day can come back. Same format as a manual
// backup ("Back up…"), so restoring works the same way. Runs in the background: nothing here blocks the app.
const fs = require('node:fs');
const path = require('node:path');

const KEEP = /^bento\.(lessons|progress|settings|projects)$/;
const NAME = /^Bento backup (\d{4}-\d{2}-\d{2})\.json$/;

// write(file, text) saves a file and says whether it worked (true), or returns a promise of that
async function daily(dir, store, write, { days = 7, now = new Date() } = {}) {
  const data = Object.fromEntries(Object.entries(store || {}).filter(([k]) => KEEP.test(k)));
  if (!(data['bento.lessons'] || []).length && !data['bento.progress']) return null; // nothing worth keeping yet
  try { await fs.promises.mkdir(dir, { recursive: true }); } catch { return null; }
  const day = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); // your local date
  const file = path.join(dir, `Bento backup ${day}.json`);
  const exists = await fs.promises.access(file).then(() => true, () => false);
  const wrote = exists ? null : ((await write(file, JSON.stringify({ bento: 'backup', v: 1, auto: true, at: now.toISOString(), data }))) ? file : null);
  // keep the newest week; never touch files that aren't ours
  const ours = (await fs.promises.readdir(dir).catch(() => [])).filter((f) => NAME.test(f)).sort();
  for (const f of ours.slice(0, Math.max(0, ours.length - days))) await fs.promises.rm(path.join(dir, f), { force: true }).catch(() => {});
  return wrote;
}

module.exports = { daily };
