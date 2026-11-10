// A small log of what went wrong in the main process, for "Report a problem" (Help → Show Logs).
// Only errors and app events: never prompts, answers, code or file contents. Kept under about 2 MB.
const fs = require('node:fs');
const path = require('node:path');

let file = null;
function init(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'main.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, `${file}.1`);
  } catch { file = null; }
  return file;
}
const show = (x) => (x instanceof Error ? (x.stack || x.message) : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());
function log(...parts) {
  if (!file) return;
  try { fs.appendFileSync(file, `${new Date().toISOString()} ${parts.map(show).join(' ').slice(0, 4000)}\n`); } catch {}
}
module.exports = { init, log };
