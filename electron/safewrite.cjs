// Bento's own files are written as a new copy, then swapped in: a full disk or a crash mid-write leaves the last good
// copy, never half a file.
const fs = require('node:fs');

function writeSafe(file, data) {
  const tmp = `${file}.tmp`;
  try { fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); return true; }
  catch { try { fs.rmSync(tmp, { force: true }); } catch {} return false; }
}

module.exports = { writeSafe };
