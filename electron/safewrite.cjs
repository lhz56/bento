// Bento's own files are written as a new copy, then swapped in: a full disk or a crash mid-write leaves the last good
// copy, never half a file. writeSafeAsync is the one to use while Bento runs (it never blocks the main process and
// flushes the copy to disk before swapping it in); writeSafe is for the last save while quitting.
const fs = require('node:fs');

function writeSafe(file, data) {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
    return false;
  }
}

// Resolves to null when written, or the error's code ('ENOSPC' for a full disk, 'EACCES'/'EPERM' when not allowed).
// Writes to the same file wait their turn. After stopWrites() (quitting: the last save is then written directly with
// writeSafe), a background write still on its way gives up instead of swapping in an older copy over the newer one.
const queues = new Map();
let stopped = false;
async function writeOnce(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  let fh = null;
  try {
    fh = await fs.promises.open(tmp, 'w');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close();
    fh = null;
    if (stopped) throw Object.assign(new Error('quitting'), { code: 'ECANCELED' });
    await fs.promises.rename(tmp, file);
    return null;
  } catch (e) {
    try {
      await fh?.close();
    } catch {}
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    return e?.code || 'EIO';
  }
}
function writeSafeAsync(file, data) {
  if (stopped) return Promise.resolve('ECANCELED');
  const next = (queues.get(file) || Promise.resolve()).then(() => writeOnce(file, data));
  queues.set(file, next);
  next.then(() => {
    if (queues.get(file) === next) queues.delete(file);
  });
  return next;
}
const stopWrites = () => {
  stopped = true;
};

module.exports = { writeSafe, writeSafeAsync, stopWrites };
