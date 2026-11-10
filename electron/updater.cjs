// Updates, the T3 Code way: signed releases on GitHub, downloaded quietly in the background, installed the next time
// you quit (or right away if you press "Restart"). It only runs in a signed, packaged copy that knows where its
// releases live; in development, tests and unsigned local builds it does nothing at all.
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const HOURS = 4;
let state = { status: 'off', version: null, reason: null };
let send = () => {};
let updater = null;
let auto = true; let prefFile = null; let save = null;

function set(next) { state = { ...state, ...next }; send(state); }

// Squirrel (the Mac installer underneath) refuses to update an app that isn't signed by a developer.
function isDeveloperSigned(app) {
  if (process.platform !== 'darwin') return Promise.resolve(true);
  const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
  return new Promise((res) => execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], { timeout: 5000 }, (_e, _o, err) => res(/Authority=Developer ID Application/.test(String(err || '')))));
}

async function start(app, { onState, disabled, prefs, writeSafe }) {
  send = onState || send;
  // "Update automatically" (Settings): off means no checks in the background; Check now still works
  prefFile = prefs; save = writeSafe;
  try { auto = JSON.parse(fs.readFileSync(prefFile, 'utf8')).auto !== false; } catch {}
  set({ auto });
  const feed = path.join(process.resourcesPath || '', 'app-update.yml');
  const why = !app.isPackaged ? 'development copy'
    : disabled ? 'turned off'
    : process.env.BENTO_DISABLE_UPDATES ? 'BENTO_DISABLE_UPDATES is set'
    : !fs.existsSync(feed) ? 'no release feed in this build'
    : !(await isDeveloperSigned(app)) ? 'this copy isn’t signed, so it can’t update itself'
    : null;
  if (why) return set({ status: 'off', reason: why });
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch (e) { return set({ status: 'off', reason: e.message }); }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.logger = null;
  updater.on('checking-for-update', () => set({ status: 'checking' }));
  updater.on('update-not-available', () => set({ status: 'current' }));
  updater.on('update-available', (i) => set({ status: 'downloading', version: i?.version || null }));
  updater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p?.percent || 0) }));
  updater.on('update-downloaded', (i) => set({ status: 'ready', version: i?.version || state.version }));
  updater.on('error', (e) => set({ status: 'error', reason: String(e?.message || e).split('\n')[0].slice(0, 160) }));
  const background = () => { if (auto) updater.checkForUpdates().catch(() => {}); };
  setTimeout(background, 15_000); // not during launch: let Bento open first
  setInterval(background, HOURS * 3600_000).unref?.();
}

const getState = () => state;
const check = () => updater ? updater.checkForUpdates().then(() => true, () => false) : Promise.resolve(false);
// quit and install now; lessons in progress are saved by the usual quit path first
function install() { if (state.status === 'ready' && updater) { setImmediate(() => updater.quitAndInstall(false, true)); return true; } return false; }

function setAuto(on) { auto = !!on; if (prefFile && save) save(prefFile, JSON.stringify({ auto })); set({ auto }); return auto; }

module.exports = { start, getState, check, install, setAuto, isDeveloperSigned };
