// A small log of what went wrong in the main process, for "Report a problem" (Help → Show Logs).
// Only errors and app events: never prompts, answers, code or file contents. Kept under about 2 MB.
// Written in the background, in order: logging never holds up the app.
const fs = require('node:fs');
const path = require('node:path');

let file = null;
let chain = Promise.resolve();
function init(dir) {
  file = path.join(dir, 'main.log');
  chain = chain.then(async () => {
    await fs.promises.mkdir(dir, { recursive: true });
    const st = await fs.promises.stat(file).catch(() => null);
    if (st && st.size > 1_000_000) await fs.promises.rename(file, `${file}.1`);
  }).catch(() => { file = null; });
  return file;
}
const show = (x) => (x instanceof Error ? (x.stack || x.message) : typeof x === 'string' ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })());
function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.map(show).join(' ').slice(0, 4000)}\n`;
  chain = chain.then(() => file && fs.promises.appendFile(file, line)).catch(() => {});
  return chain;
}
// the last lines, written before the app goes away (an exit right after an error mustn't lose it)
const flush = () => chain;
module.exports = { init, log, flush };
