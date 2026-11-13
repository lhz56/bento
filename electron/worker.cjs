// Bento's heavy lifting, off the main process. Downloading a project, taking it apart, searching its files, replaying
// its history, sizing and deleting downloads, and looking for clones on this Mac all happen in this worker thread, so
// the window, the menus and a lesson that's streaming in never wait on them (taking apart T3 Code's 7,700 files takes
// most of a second; its history can be hundreds of megabytes of git log).
const fs = require('node:fs');
const { parentPort } = require('node:worker_threads');
const atlas = require('./atlas.cjs');
const findproject = require('./findproject.cjs');

const OPS = {
  fetchRepo: (o, progress) => atlas.fetchRepo({ ...o, onProgress: progress }),
  history: (o, progress) => atlas.history({ ...o, onProgress: progress }),
  analyze: (root, meta) => atlas.analyze(root, meta),
  search: (root, words) => atlas.search(root, words),
  codeFiles: (root) => atlas.codeFiles(root),
  dirSize: (dir) => atlas.dirSize(dir),
  remove: (p) => fs.promises.rm(p, { recursive: true, force: true }).then(() => true),
  localClones: (names, fulls) => findproject.localClones(names, fulls),
};

parentPort.on('message', async ({ id, op, args }) => {
  const progress = (p) => parentPort.postMessage({ id, progress: p });
  try {
    if (!OPS[op]) throw new Error(`unknown job ${op}`);
    parentPort.postMessage({ id, ok: true, v: await OPS[op](...args, progress) });
  } catch (e) { parentPort.postMessage({ id, ok: false, e: String(e?.message || e) }); }
});
