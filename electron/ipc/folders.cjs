'use strict';
// Local folders
const path = require('node:path');
const fsp = require('node:fs').promises;
const atlas = require('../atlas.cjs');
const { ipcMain, dialog } = require('electron');
const { projectRootOk } = require('../roots.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerFolders(ctx) {
  const { optStr, refuse, str, work } = ctx;
  const { SKIP_DIRS: SKIP, CODE_EXT } = atlas;
  const roots = new Set();
  ipcMain.handle('folder:open', async () => {
    const r = await dialog.showOpenDialog(ctx.win, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const root = r.filePaths[0];
    roots.add(root);
    return {
      kind: 'local',
      root,
      name: path.basename(root),
      files: await work('codeFiles', [root]),
    };
  });
  // Something dragged onto the window: a folder becomes a project, a code file becomes a lesson. The path comes from the
  // dropped file itself (preload.cjs asks Electron for it), so the page can't name a file you didn't drop.
  ipcMain.handle('drop:open', async (_e, p) => {
    p = str(p, 4096);
    const st = path.isAbsolute(p) ? await fsp.stat(p).catch(() => null) : null;
    if (!st) throw new Error('Couldn’t read that.');
    if (st.isDirectory()) {
      if (!projectRootOk(p, undefined, ctx.REPOS))
        throw new Error(
          'Bento opens project folders, not your whole disk, home folder or system folders.',
        );
      roots.add(p);
      return { kind: 'local', root: p, name: path.basename(p) };
    }
    if (/\.bento$/i.test(p)) {
      if (st.size > 2_000_000) throw new Error('That lesson file is too big.');
      let j;
      try {
        j = JSON.parse(await fsp.readFile(p, 'utf8'));
      } catch {
        throw new Error('That .bento file is damaged.');
      }
      if (j?.bento !== 1 || !j.lesson?.title) throw new Error('That isn’t a Bento lesson.');
      return { kind: 'lesson', lesson: j.lesson };
    }
    if (st.size > 200_000) throw new Error('That file is too big to explain in one go.');
    if (!CODE_EXT.test(p))
      throw new Error('Drop a code file (like .py or .js) or a project folder.');
    return { kind: 'file', name: path.basename(p), text: await fsp.readFile(p, 'utf8') };
  });
  const insideOf = (root, f) => {
    const r = path.relative(root, f);
    return !!r && !r.startsWith('..') && !path.isAbsolute(r);
  };
  ipcMain.handle('folder:read', async (_e, root, rel) => {
    root = str(root, 4096);
    rel = optStr(rel, 4096);
    if (!roots.has(root))
      throw new Error('That folder isn’t open in Bento any more. Open it again.');
    const f = path.resolve(root, rel);
    // inside the opened folder only: "../bento-secrets" must not pass just because it starts with the same letters
    if (!insideOf(root, f)) refuse();
    // ...for real: a link inside a downloaded project ("notes -> ~/.ssh") must not lead out of it
    const [real, realRoot] = await Promise.all([fsp.realpath(f), fsp.realpath(root)]).catch(() => [
      null,
      null,
    ]);
    if (!real) throw new Error('That file isn’t there any more.');
    if (!insideOf(realRoot, real)) refuse();
    const st = await fsp.stat(real);
    if (!st.isFile()) refuse();
    if (st.size > 3_000_000) return '// (file too large to show)';
    return fsp.readFile(real, 'utf8').catch((e) => {
      throw new Error(
        e.code === 'EACCES' || e.code === 'EPERM'
          ? 'Bento isn’t allowed to read that file.'
          : 'Couldn’t read that file.',
      );
    });
  });
  return {
    SKIP,
    CODE_EXT,
    roots,
  };
};
