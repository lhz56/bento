'use strict';
// A plain JSON mirror of what the renderer keeps in localStorage, so a crash never loses lessons.
const path = require('node:path');
const fsp = require('node:fs').promises;
const logger = require('../log.cjs');
const { app, ipcMain, dialog } = require('electron');
const { writeSafe, writeSafeAsync, stopWrites } = require('../safewrite.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerStore(ctx) {
  const { OFFSCREEN, refuse, running, saveError, str } = ctx;
  const STORE = path.join(app.getPath('userData'), 'bento-store.json');
  const SNAPS = path.join(app.getPath('userData'), 'Backups');
  let storeCache = {};
  let storeTimer = null;
  let bootStore = {}; // the disk copy as it was at launch, before this session wrote anything
  // Read once, in the background, as Bento starts. A damaged file is set aside under a new name, never overwritten, so it
  // (and the daily copies in Backups) can still bring things back.
  const storeReady = fsp
    .readFile(STORE, 'utf8')
    .then(
      async (raw) => {
        try {
          storeCache = JSON.parse(raw);
        } catch {
          const aside = path.join(
            path.dirname(STORE),
            `bento-store damaged ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`,
          );
          logger.log('the saved lessons file was damaged; kept as', path.basename(aside));
          await fsp.rename(STORE, aside).catch(() => {});
        }
      },
      () => {},
    )
    .then(() => {
      if (!storeCache || typeof storeCache !== 'object' || Array.isArray(storeCache))
        storeCache = {};
      bootStore = structuredClone(storeCache);
    });
  ipcMain.handle('store:get', async (e) => {
    await storeReady;
    return /** @type {any} */ (e)?.remote ? storeCache : bootStore; // remote: a paired phone or iPad (host.cjs)
  });
  // Back up everything to one file (to move to another Mac, or just to be safe), and bring it back
  ipcMain.handle('backup:save', async () => {
    const day = new Date().toISOString().slice(0, 10);
    const choice = await dialog.showSaveDialog(ctx.win, {
      defaultPath: path.join(app.getPath('documents'), `Bento backup ${day}.json`),
      filters: [{ name: 'Bento backup', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePath) return null;
    await storeReady;
    const keep = Object.fromEntries(
      Object.entries(storeCache).filter(([k]) =>
        /^bento\.(lessons|progress|settings|projects)$/.test(k),
      ),
    );
    await fsp
      .writeFile(
        choice.filePath,
        JSON.stringify({ bento: 'backup', v: 1, at: new Date().toISOString(), data: keep }),
      )
      .catch(saveError);
    return choice.filePath;
  });
  ipcMain.handle('backup:load', async () => {
    const snaps = await fsp.access(SNAPS).then(
      () => SNAPS,
      () => undefined,
    );
    const choice = await dialog.showOpenDialog(ctx.win, {
      properties: ['openFile'],
      defaultPath: snaps,
      filters: [{ name: 'Bento backup', extensions: ['json'] }],
    });
    if (choice.canceled || !choice.filePaths?.[0]) return null;
    const st = await fsp.stat(choice.filePaths[0]).catch(() => null);
    if (!st || st.size > 100_000_000) throw new Error('That file is too big to be a Bento backup.');
    let j;
    try {
      j = JSON.parse(await fsp.readFile(choice.filePaths[0], 'utf8'));
    } catch {
      throw new Error('That file is damaged, or isn’t a Bento backup.');
    }
    if (j?.bento !== 'backup' || !j.data) throw new Error('That file isn’t a Bento backup.');
    return j.data;
  });
  const SHARED = /^bento\.(lessons|progress|settings|projects|savedAt)$/;
  ipcMain.handle('store:set', async (_e, key, value) => {
    if (!/^bento\.[\w.-]{1,80}$/.test(str(key, 90))) refuse();
    await storeReady;
    // your lessons, progress, settings and projects are the same on every device: a change here is passed on to the others
    const before =
      SHARED.test(key) && (ctx.host?.isOn() || /** @type {any} */ (_e?.sender)?.remote)
        ? JSON.stringify(storeCache[key] ?? null)
        : null;
    if (value === undefined) delete storeCache[key];
    else storeCache[key] = value;
    if (before !== null && JSON.stringify(value ?? null) !== before)
      ctx.shareChange(key, value, _e.sender);
    clearTimeout(storeTimer);
    storeTimer = setTimeout(saveStore, 500);
    return true;
  });
  // Saved in the background. If saving starts failing (a full disk, a folder Bento may no longer write to), the page is
  // told once, in plain words, and again when it works: nothing is lost while Bento stays open.
  let storeTrouble = null;
  async function saveStore() {
    storeTimer = null;
    let text;
    try {
      text = JSON.stringify(storeCache);
    } catch (e) {
      logger.log('save skipped', e);
      return;
    }
    const why = await writeSafeAsync(STORE, text);
    if (why === 'ECANCELED') return;
    if (why && !storeTimer) storeTimer = setTimeout(saveStore, 30_000); // keep trying: freeing some space is enough
    if (why === storeTrouble) return;
    storeTrouble = why;
    if (why) logger.log('saving lessons failed', why);
    if (ctx.win && !ctx.win.isDestroyed())
      ctx.win.webContents.send('store:health', why ? { error: why } : { ok: true });
    ctx.host?.broadcast('store:health', [why ? { error: why } : { ok: true }]);
  }
  // Quitting (or restarting for an update) while Bento is still writing a lesson or reading a project throws that away,
  // along with the part of your plan it used. Ask first. Tests, and quits you already confirmed, go straight through.
  let leaveOk = false;
  async function okToLeave(verb) {
    if (leaveOk || OFFSCREEN || !running.size || !ctx.win || ctx.win.isDestroyed()) return true;
    const count = running.size;
    const choice = await dialog.showMessageBox(ctx.win, {
      type: 'warning',
      message:
        count > 1
          ? `Bento is still writing ${count} things for you`
          : 'Bento is still writing for you',
      detail: `A lesson or a project reading is in progress. If you ${verb} now, it stops and has to be asked again.`,
      buttons: [verb === 'quit' ? 'Quit Anyway' : 'Restart Anyway', 'Keep Writing'],
      defaultId: 1,
      cancelId: 1,
    });
    return choice.response === 0;
  }
  app.on('before-quit', (e) => {
    if (!leaveOk && !OFFSCREEN && running.size) {
      e.preventDefault();
      okToLeave('quit').then((ok) => {
        if (ok) {
          leaveOk = true;
          app.quit();
        }
      });
      return;
    }
    // the last save is written right here (a background save still on its way stands down, so it can't land after it)
    if (storeTimer) {
      clearTimeout(storeTimer);
      storeTimer = null;
      stopWrites();
      writeSafe(STORE, JSON.stringify(storeCache));
    }
  });
  return {
    SNAPS,
    get storeCache() {
      return storeCache;
    },
    set storeCache(v) {
      storeCache = v;
    },
    get bootStore() {
      return bootStore;
    },
    set bootStore(v) {
      bootStore = v;
    },
    storeReady,
    get leaveOk() {
      return leaveOk;
    },
    set leaveOk(v) {
      leaveOk = v;
    },
    okToLeave,
  };
};
