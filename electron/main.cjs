// Bento — Electron main process.
// Talks to the user's own Claude Code / Codex CLIs (their subscription), GitHub via `gh`,
// and local folders. The renderer never touches the shell directly.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeTheme } = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const { SYSTEM, QUICK_SYSTEM, ATLAS_SYSTEM, SITE_SYSTEM } = require('./prompts.cjs');
const atlas = require('./atlas.cjs');
const { safeFetch, follow, hostAllowed } = require('./netfetch.cjs');
const updater = require('./updater.cjs');
const menu = require('./menu.cjs');
const winstate = require('./winstate.cjs');
const logger = require('./log.cjs');
const snapshots = require('./snapshots.cjs');
const { projectRootOk } = require('./roots.cjs');
const { writeSafe, writeSafeAsync, stopWrites } = require('./safewrite.cjs'); // a new copy, then swapped in: never half a file

// development only: a shipped copy never loads its page from a local server, whatever the environment says
const DEV = !!process.env.BENTO_DEV && !app.isPackaged;
// Test builds (`npm run app`, CI) are packaged with "bentoTestBuild": true; releases never are (the release check
// refuses one). Only they, or a copy run from source, listen to the switches that swap in pretend AIs or fake answers.
const TEST_BUILD = !app.isPackaged || require('../package.json').bentoTestBuild === true;
// Bento's own page: app://bento in the app, the Vite server in development. Nothing else may use Bento's powers.
const isAppUrl = (url) => { try { const u = new URL(String(url)); return DEV ? u.origin === 'http://localhost:5199' : u.protocol === 'app:' && u.host === 'bento'; } catch { return false; } };
// Lesson pages (play://) and any website can never reach the main process; check every call anyway, in case one tries.
// Each handler is also noted by name: a paired phone or iPad (host.cjs) calls the same ones, from a short list.
const RAW = { handle: new Map(), on: new Map() };
let host = null; // Bento for your phone and iPad, when it's on (see the end of this file)
for (const kind of ['handle', 'on']) {
  const add = ipcMain[kind].bind(ipcMain);
  ipcMain[kind] = (channel, fn) => { RAW[kind].set(channel, fn); return add(channel, (e, ...args) => {
    if (isAppUrl(e.senderFrame?.url)) return fn(e, ...args);
    if (kind === 'on') { e.returnValue = null; return undefined; }
    return Promise.reject(new Error('Not allowed.'));
  }); };
}
// Links leave Bento only for the web (https; an http link opens as https) or email, never file:, smb:, javascript: or
// app-launching schemes. Anything else is dropped.
function openOutside(url) {
  let u; try { u = new URL(String(url).slice(0, 4000)); } catch { return false; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (!['https:', 'mailto:'].includes(u.protocol) || (u.protocol === 'https:' && !u.hostname)) return false;
  shell.openExternal(u.href).catch(() => {});
  return true;
}
// Every call from the page is checked: the right types, sensible sizes. Anything else is refused in plain words.
class BadInput extends Error {}
const refuse = () => { throw new BadInput('Bento couldn’t do that: the request didn’t look right.'); };
const str = (v, max = 2000) => (typeof v === 'string' && v.length <= max ? v : refuse());
const optStr = (v, max) => (v == null || v === '' ? '' : str(v, max));
const strList = (v, n, max) => (Array.isArray(v) && v.length <= n ? v.map((x) => str(x, max)) : refuse());
const sizeOf = (v) => { try { return JSON.stringify(v)?.length || 0; } catch { return Infinity; } };
// A separate profile (fresh lessons, projects and settings), handy for demos, screenshots and tests.
if (process.env.BENTO_USERDATA) app.setPath('userData', process.env.BENTO_USERDATA);
const DIST = path.join(__dirname, '..', 'dist');
// errors go to ~/Library/Logs/Bento/main.log (Help → Show Logs); test and demo profiles keep theirs inside the profile
const LOGS = process.env.BENTO_USERDATA ? path.join(app.getPath('userData'), 'logs') : app.getPath('logs');
logger.init(LOGS);

// The heavy work (downloading, taking apart and searching projects, their history, folder sizes) runs in worker.cjs,
// a thread of its own, so nothing here ever waits on it. Started on first use; if it ever dies, the next call starts it again.
let worker = null; const jobs = new Map(); let jobSeq = 0;
function work(op, args = [], onProgress) {
  if (!worker) {
    const w = (worker = new Worker(path.join(__dirname, 'worker.cjs')));
    w.on('message', ({ id, ok, v, e, progress }) => {
      const j = jobs.get(id); if (!j) return;
      if (progress !== undefined) return j.onProgress?.(progress);
      jobs.delete(id); ok ? j.res(v) : j.rej(new Error(e));
    });
    const lost = (why) => { if (worker !== w) return; worker = null; logger.log('worker stopped', why); for (const j of jobs.values()) j.rej(new Error('Bento’s project reader stopped unexpectedly. Try again.')); jobs.clear(); };
    w.on('error', lost); w.on('exit', (code) => lost(`exit ${code}`));
  }
  return new Promise((res, rej) => { const id = ++jobSeq; jobs.set(id, { res, rej, onProgress }); worker.postMessage({ id, op, args }); });
}
process.on('uncaughtException', (e) => logger.log('uncaught', e));
process.on('unhandledRejection', (e) => logger.log('unhandled rejection', e));

// Apps launched from Finder get a tiny PATH. Add the usual places CLIs live.
const HOME = os.homedir();
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const EXTRA_PATH = WIN
  ? [path.join(process.env.APPDATA || '', 'npm'), path.join(HOME, '.local', 'bin'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI')]
  : [`${HOME}/.local/bin`, `${HOME}/.claude/local`, '/opt/homebrew/bin', '/usr/local/bin', `${HOME}/.npm-global/bin`, `${HOME}/.bun/bin`, `${HOME}/Library/pnpm`, `${HOME}/.volta/bin`, `${HOME}/.asdf/shims`, `${HOME}/.cargo/bin`, '/usr/bin', '/bin'];
const ENV = { ...process.env, PATH: [...EXTRA_PATH, process.env.PATH || process.env.Path || ''].join(path.delimiter) };
// That list is a guess: ask your own login shell for the real PATH once (see shellenv.cjs). Calls that start a CLI wait for it.
const envReady = require('./shellenv.cjs').resolvePath(ENV.PATH).then((p) => { ENV.PATH = p; }, () => {});
// How to start a program with these arguments: always as an argument list, never through a shell, except on Windows
// for npm-installed CLIs, which are .cmd scripts that only cmd.exe can start. Those get each argument quoted, and
// characters cmd.exe would still act on inside quotes (" % ! ^ and line breaks) are refused rather than passed.
const winArg = (a) => { const v = String(a); if (/["%!^\r\n]/.test(v)) throw new Error('That can’t be passed to a command safely on Windows.'); return !v || /[\s&|<>()]/.test(v) ? `"${v}"` : v; };
async function launch(cmd, args) {
  if (!WIN) return [cmd, args, {}];
  const at = path.isAbsolute(cmd) ? cmd : (await which(cmd)) || cmd;
  if (/\.(cmd|bat)$/i.test(at)) return [`"${at}"`, args.map(winArg), { shell: true, windowsHide: true }];
  return [at, args, { windowsHide: true }];
}
const WORKDIR = path.join(app.getPath('temp'), 'bento-work');
const workdirReady = fsp.mkdir(WORKDIR, { recursive: true }).catch(() => {});

// app:// keeps a compiled-code cache like a website would, so from the second launch on V8 skips compiling Bento's code
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }, { scheme: 'play', privileges: { standard: true, secure: true } }]);

// Lesson code (running in a worker) reaches the web through here, like a script on your Mac would:
// no browser cross-site rules, http(s) only, small answers, a time limit.
async function netProxy(req, u) {
  const target = u.searchParams.get('u') || '';
  const reply = (status, body, type = 'text/plain') => new Response(body, { status: 200, headers: { 'x-status': String(status), 'x-content-type': type, 'content-type': 'text/plain; charset=utf-8' } });
  const headers = { 'user-agent': 'Bento (learning app; https://github.com/lhz56/bento-releases)' };
  for (const [k, v] of req.headers) if (k.startsWith('x-h-') && !/^x-h-(host|cookie|authorization-proxy)$/.test(k)) headers[k.slice(4)] = v;
  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
    const r = await safeFetch(target, { method: req.method, headers, body });
    return reply(r.status, r.text, r.type);
  } catch (e) { return reply(0, e.message); }
}

let win;
// Off-screen when asked (BENTO_HIDDEN=1), and whenever a test tool is driving the app (it adds a debugging port),
// so automated checks never pop up over what you're doing. BENTO_SHOW=1 brings the window back for watching a test.
const OFFSCREEN = !process.env.BENTO_SHOW && (!!process.env.BENTO_HIDDEN || process.argv.some((a) => a.startsWith('--remote-debugging-port')));
const WIN_FILE = path.join(app.getPath('userData'), 'window.json');
// read while Electron starts up, so the window can open in its old place without waiting on the disk
const savedPlace = OFFSCREEN ? Promise.resolve(null) : fsp.readFile(WIN_FILE, 'utf8').then(JSON.parse).catch(() => null);
function createWindow(saved) {
  if (OFFSCREEN && process.platform === 'darwin') app.setActivationPolicy?.('accessory');
  const place = OFFSCREEN ? { width: 1440, height: 900 } : winstate.place(saved, require('electron').screen.getAllDisplays(), { width: 1440, height: 900, minWidth: 1080, minHeight: 680 });
  win = new BrowserWindow({
    width: place.width, height: place.height, ...(place.x != null ? { x: place.x, y: place.y } : {}), minWidth: 1080, minHeight: 680,
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'active', backgroundColor: '#00000000' }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f3eee6', symbolColor: '#4f4841', height: 40 }, backgroundColor: '#f3eee6' }),
    show: false,
    // the page gets Bento's narrow bridge (preload.cjs) and nothing else: no Node.js, its own isolated world, Chromium's sandbox
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false, spellcheck: false },
  });
  // BENTO_HIDDEN=1: tests run the real app off-screen, without a Dock icon or taking focus from what you're doing
  if (OFFSCREEN) { win.setPosition(-20000, -20000); win.webContents.setBackgroundThrottling(false); }
  else { win.once('ready-to-show', () => { if (place.maximized) win.maximize(); win.show(); setTimeout(offerMove, 1200); }); winstate.track(win, WIN_FILE, writeSafeAsync, writeSafe); }
  // if the page ever crashes, bring it straight back (your lessons are on disk); give up after three crashes in a minute
  let crashes = [];
  win.webContents.on('render-process-gone', (_e, d) => {
    logger.log('page gone', d?.reason, d?.exitCode);
    if (d?.reason === 'clean-exit' || win.isDestroyed()) return;
    crashes = [...crashes.filter((t) => Date.now() - t < 60000), Date.now()];
    if (crashes.length <= 3) setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 400);
  });
  win.webContents.on('unresponsive', () => logger.log('page unresponsive'));
  if (DEV) win.loadURL('http://localhost:5199');
  else win.loadURL('app://bento/index.html');
  // each time the page (re)loads, remember the disk copy as it is before the page writes anything (crash recovery compares against it)
  win.webContents.on('did-start-loading', () => { storeReady.then(() => { bootStore = structuredClone(storeCache); }); });
}

// Opened straight from the downloaded disk image (or Downloads)? Offer to move into Applications, where it can update
// itself. Only real, signed downloads ask, once; "Don't ask again" is remembered.
async function offerMove() {
  if (!MAC || !app.isPackaged || OFFSCREEN || process.env.BENTO_USERDATA || app.isInApplicationsFolder()) return;
  const file = path.join(app.getPath('userData'), 'install.json');
  const pref = await fsp.readFile(file, 'utf8').then(JSON.parse).catch(() => ({}));
  if (pref.dontAskMove || !(await updater.isDeveloperSigned(app))) return;
  const r = await dialog.showMessageBox(win, { type: 'question', message: 'Move Bento to your Applications folder?', detail: 'From Applications, Bento can update itself and is easy to find. Your lessons stay where they are.', buttons: ['Move to Applications', 'Not Now'], defaultId: 0, cancelId: 1, checkboxLabel: 'Don’t ask again' });
  if (r.checkboxChecked) writeSafeAsync(file, JSON.stringify({ ...pref, dontAskMove: true }));
  if (r.response !== 0) return;
  try { app.moveToApplicationsFolder({ conflictHandler: (kind) => kind !== 'existsAndRunning' }); }
  catch (e) { logger.log('move to Applications failed', e); dialog.showMessageBox(win, { type: 'warning', message: 'Couldn’t move Bento', detail: 'Drag Bento into the Applications folder in Finder instead.', buttons: ['OK'] }); }
}

// two copies on one profile fight over its storage lock (each launch then stalls ~4 s) and overwrite each other's saves.
// The lock is a file: on a full disk it can't be made, and that mustn't look like "already open" (Bento would quietly
// never start). So Bento only steps aside when the lock is there and names a copy that's still running.
function anotherCopyRunning() {
  if (process.platform === 'win32') return true; // a named lock there, not a file: failing means another copy has it
  try {
    const pid = Number(String(fs.readlinkSync(path.join(app.getPath('userData'), 'SingletonLock'))).split('-').pop());
    if (!pid || pid === process.pid) return false;
    process.kill(pid, 0); return true;
  } catch (e) { return e?.code === 'EPERM'; } // no lock file (it couldn't be made), or its copy is gone
}
if (!app.requestSingleInstanceLock()) {
  if (anotherCopyRunning()) app.quit();
  else logger.log('opening without the one-copy lock: it couldn’t be created (is the disk full?)');
}
// bento:// links ("Open in Bento" from a browser bookmark): macOS sends open-url, Windows and Linux start a second copy with the link
let pendingLink = null;
const deliverLink = (url) => { if (!/^bento:\/\//i.test(String(url || ''))) return; if (win && !win.isDestroyed() && !win.webContents.isLoading()) { win.webContents.send('deeplink', url); if (!OFFSCREEN) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } } else pendingLink = url; };
if (app.isPackaged && !OFFSCREEN && !process.env.BENTO_USERDATA) app.setAsDefaultProtocolClient('bento'); // only the real app claims bento:// (not test, demo or dev runs)
app.on('open-url', (e, url) => { e.preventDefault(); deliverLink(url); });
app.on('second-instance', (_e, argv) => { if (!win || win.isDestroyed()) return; if (!OFFSCREEN) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } deliverLink(argv.find((a) => /^bento:\/\//i.test(a))); });
ipcMain.handle('update:get', () => ({ ...updater.getState(), current: app.getVersion() }));
ipcMain.handle('update:install', async () => { if (!(await okToLeave('restart'))) return false; leaveOk = true; return updater.install(); });
ipcMain.handle('update:check', async () => { await updater.check(); return { ...updater.getState(), current: app.getVersion() }; });
ipcMain.handle('update:auto', (_e, on) => updater.setAuto(on === true));
ipcMain.handle('deeplink:pending', () => { const u = pendingLink || process.argv.find((a) => /^bento:\/\//i.test(a)) || null; pendingLink = null; return u; });

app.whenReady().then(async () => {
  // hidden runs (tests, pre-writing lessons) never pop a notification on your screen
  const ALLOWED = new Set(['clipboard-sanitized-write', 'fullscreen', ...(OFFSCREEN ? [] : ['notifications'])]);
  const ses = require('electron').session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, done, details) => done(ALLOWED.has(permission) && isAppUrl(details?.requestingUrl)));
  ses.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED.has(permission) && isAppUrl(origin));
  // play://<id>/ serves a lesson's web page on its own origin, so it can never reach the app.
  protocol.handle('play', (req) => {
    const id = new URL(req.url).hostname;
    const html = PLAY.get(id);
    if (!html) return new Response('Run the code again to see the page.', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; connect-src https:" } });
  });
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    if (u.pathname === '/__net') return netProxy(req, u);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || !p) p = '/index.html';
    const file = path.resolve(DIST, `.${p}`);
    const inside = path.relative(DIST, file);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  app.setAboutPanelOptions({ applicationName: 'Bento', applicationVersion: app.getVersion(), version: '', copyright: 'MIT License', credits: 'Learn how software is really built, with the AI subscription you already have.', website: menu.REPO });
  menu.build({ dev: DEV, logsDir: LOGS, send: (a) => { if (win && !win.isDestroyed()) win.webContents.send('menu', a); }, checkForUpdates: () => menu.explainUpdates(updater, win) });
  createWindow(await savedPlace);
  // today's copy of your lessons and progress (a week is kept; Settings → Restore… opens them)
  const copyToday = () => storeReady.then(() => snapshots.daily(SNAPS, storeCache, (f, d) => writeSafeAsync(f, d).then((e) => !e))).catch((e) => logger.log('daily copy failed', e));
  setTimeout(copyToday, 8000); setInterval(copyToday, 4 * 3600_000).unref?.(); // and for anyone who leaves Bento open for days
  // updates from GitHub releases (signed copies only; off in tests and development)
  updater.start(app, { disabled: OFFSCREEN, prefs: path.join(app.getPath('userData'), 'updates.json'), writeSafe: writeSafeAsync, onState: (st) => { if (win && !win.isDestroyed()) win.webContents.send('update:state', st); } });
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(await fsp.readFile(WIN_FILE, 'utf8').then(JSON.parse).catch(() => null)); });
});
// For every page Bento ever has (the window, lesson pages in their frames): no webviews, no new windows (a link opens in
// your browser instead), and the window itself never navigates or redirects away from Bento, where a website would
// otherwise get Bento's bridge.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  const stay = (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); openOutside(url); } };
  wc.on('will-navigate', stay);
  wc.on('will-redirect', (e, url, _inPlace, isMainFrame) => { if (isMainFrame && !isAppUrl(url)) e.preventDefault(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------------------------------------------------------------- providers
// Each AI's adapter (finding it, checking it, running it as a writer only, reading its stream and its plan's limits)
// is in providers.cjs; the names and commands people see are in ai-catalog.json.
const P = require('./providers.cjs');
const AI_FILES = () => (aiFiles ??= P.setupFilesAsync(path.join(app.getPath('userData'), 'ai'))); let aiFiles = null;
// BENTO_PRETEND_MISSING=claude,codex,gemini,copilot,gh hides CLIs, to test what a brand-new user sees.
const HIDDEN = new Set(String(process.env.BENTO_PRETEND_MISSING || '').split(',').filter(Boolean));
// BENTO_FAKE_AI=test/fixtures/fake-ai.mjs: tests stand in pretend CLIs that stream a canned lesson in each AI's own
// format, so the whole ask → stream → run path is checked without using anyone's plan. BENTO_FAKE_AS says which AIs
// are pretend (Claude by default). Only honoured in hidden test mode, and only by a test build or a copy run from source:
// a release ignores it.
// (testhooks.cjs decides; a release asked for them hides every AI rather than use your real ones)
const HOOKS = require('./testhooks.cjs').testHooks({ packaged: app.isPackaged, testBuild: TEST_BUILD, offscreen: OFFSCREEN, env: process.env });
const FAKE_AI = HOOKS.fakeAI ? path.resolve(HOOKS.fakeAI) : null;
const FAKE_AS = new Set(HOOKS.fakeAs);
if (HOOKS.hideAllAIs) logger.log('BENTO_FAKE_AI is set, but this build doesn’t use pretend AIs: every AI is hidden, so none of your real ones runs');
// an AI can be named by its id ("antigravity") or its program ("agy")
const idOfBin = (cmd) => P.IDS.find((id) => P.BY[id].bin === cmd) || cmd;
const isHidden = (cmd) => HIDDEN.has(cmd) || HIDDEN.has(idOfBin(cmd)) || (HOOKS.hideAllAIs && P.IDS.includes(idOfBin(cmd)));
const isFake = (cmd) => !!FAKE_AI && (FAKE_AS.has(cmd) || FAKE_AS.has(idOfBin(cmd)));
const viaFake = (cmd, args) => (isFake(cmd) ? ['node', [FAKE_AI, '--as', cmd, ...args]] : [cmd, args]);
async function which(cmd) {
  if (isHidden(cmd)) return null;
  if (isFake(cmd)) return FAKE_AI;
  await envReady;
  return new Promise((res) => execFile(WIN ? 'where' : 'which', [cmd], { env: ENV, windowsHide: true }, (e, out) => res(e ? null : String(out).split(/\r?\n/)[0].trim() || null)));
}
// Onboarding: find what the person already has. Nothing is installed or signed in for them.
async function runQuiet(cmd, args, timeout = 8000) {
  await envReady;
  let c, a, o; try { [c, a, o] = await launch(...viaFake(cmd, args)); } catch (e) { return { ok: false, out: '', err: e.message, timedOut: false }; }
  return new Promise((res) => execFile(c, a, { env: ENV, timeout, maxBuffer: 4 << 20, ...o }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || ''), timedOut: !!e?.killed })));
}
// the GitHub CLI's sign-in, which Copilot accepts; read when needed, kept in memory for 10 minutes, never saved
let ghTok = { v: null, at: 0 };
async function ghToken() {
  if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) return null;
  if (Date.now() - ghTok.at < 600000) return ghTok.v;
  const r = await runQuiet('gh', ['auth', 'token'], 5000); const t = r.out.trim();
  ghTok = { v: r.ok && /^(gh[opsu]_|github_pat_)[\w-]+$/.test(t) ? t : null, at: Date.now() }; return ghTok.v;
}
const ghApi = async (route) => { if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) return null; const r = await runQuiet('gh', ['api', route], 8000); try { return r.ok ? JSON.parse(r.out) : null; } catch { return null; } };
// a short JSON-RPC exchange with a CLI's own server mode (Codex's app server answers "how much of my plan is used"
// without asking a model): send the messages, wait for the reply with the given id, then stop it
async function spawnJson(cmd, args, messages, waitId, timeout = 12000) {
  await envReady; await workdirReady; if (isHidden(cmd)) return null;
  let c, a, o; try { [c, a, o] = await launch(...viaFake(cmd, args)); } catch { return null; }
  return new Promise((res) => {
    let child; try { child = spawn(c, a, { cwd: WORKDIR, env: ENV, stdio: ['pipe', 'pipe', 'ignore'], ...o }); } catch { return res(null); }
    const done = (v) => { clearTimeout(t); try { child.kill(); } catch {} res(v); };
    const t = setTimeout(() => done(null), timeout); let buf = '';
    child.on('error', () => done(null));
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const o = JSON.parse(line); if (o.id === waitId) done(o.result ?? null); } catch {} } });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
  });
}
// a tool that didn't answer in time (a busy Mac, a cold start, five tools starting at once) is asked once more with
// more patience: no answer isn't "not signed in"
const runPatient = async (bin, args, t = 8000) => { const r = await runQuiet(bin, args, t); return r.timedOut ? runQuiet(bin, args, t * 3) : r; };
const aiCtx = (id) => ({ run: (args, t) => runPatient(P.BY[id].bin, args, t), env: ENV, ghToken, ghApi, spawnJson: (args, msgs, wait) => spawnJson(P.BY[id].bin, args, msgs, wait) });

// what each AI tool says about itself: installed, a version Bento can talk to, signed in (and with which plan)
ipcMain.handle('scan', async () => {
  await limitsReady;
  const bins = [...P.IDS.map((id) => P.BY[id].bin), 'gh', 'npm', 'brew'];
  const at = Object.fromEntries(await Promise.all(bins.map(async (b) => [b, await which(b)])));
  // which installers this Mac already has, so the welcome only suggests commands that will work here
  const r = { tools: { npm: !!at.npm, brew: !!at.brew }, gh: { installed: !!at.gh } };
  await Promise.all([
    ...P.IDS.map(async (id) => {
      const A = P.ADAPTERS[id], bin = P.BY[id].bin, x = (r[id] = { installed: !!at[bin] });
      if (!at[bin]) return;
      x.brew = /\/(Cellar|Caskroom)\//.test(await fsp.realpath(at[bin]).catch(() => at[bin])); // updates go the way it was installed
      const [v, h] = await Promise.all([runPatient(bin, ['--version']), runPatient(bin, A.compat.help)]);
      x.version = A.version(v.out || '') || null; x.outdated = P.missingFlags(h, A.compat.flags);
      // a pretend CLI in tests only knows the commands real ones have; sign-in that's read from files is assumed
      Object.assign(x, isFake(bin) && !['claude', 'codex', 'antigravity'].includes(id) ? { loggedIn: true, method: 'test' } : await A.auth(aiCtx(id)));
      const L = limitsAll()[id]; if (L?.plan && !x.plan) x.plan = L.plan;
    }),
    at.gh && (async () => { const a = await runQuiet('gh', ['api', 'user', '--jq', '.login']); r.gh.loggedIn = a.ok && !!a.out.trim(); r.gh.user = a.out.trim() || null; })(),
  ].filter(Boolean));
  refreshLimits().catch(() => {});
  return r;
});
ipcMain.handle('providers', async () => {
  const has = await Promise.all(P.IDS.map((id) => which(P.BY[id].bin)));
  const gh = await which('gh');
  return { ...Object.fromEntries(P.IDS.map((id, i) => [id, !!has[i]])), gh: !!gh && !process.env.BENTO_NO_GH, dark: nativeTheme.shouldUseDarkColors };
});

// One click from the welcome: run the install, sign-in or update command for an AI in Terminal, where the person
// sees exactly what runs. Only commands from ai-catalog.json can be run this way.
ipcMain.handle('ai:terminal', async (_e, id, action, tools = {}) => {
  if (!MAC) return false;
  const p = id === 'gh' ? P.CAT.github : P.BY[id]; if (!p || !['install', 'signIn', 'update'].includes(action)) return false;
  const cmd = action === 'install' ? (p.install.find((i) => !i.needs || tools[i.needs]) || {}).cmd : action === 'update' ? (tools.brewInstalled && p.updateBrew) || p.update : p.signIn;
  if (!cmd) return false;
  const esc = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return new Promise((res) => execFile('osascript', ['-e', 'tell application "Terminal" to activate', '-e', `tell application "Terminal" to do script "${esc}"`], (e) => res(!e)));
});

// ---------------------------------------------------------------- how much of each plan is used
// The last thing each AI said about its plan's limits, kept on disk so the meter has something to show at launch.
// Claude says it with every reply; Codex and Copilot can be asked any time for free; Gemini doesn't say, so Bento
// counts its own requests instead (usage:get).
const LIMITS_FILE = path.join(app.getPath('userData'), 'plan-limits.json');
let LIMITS = {}, limitsTimer = null;
// Bento's small files are read in the background as it starts, and every handler that needs one waits for it
const readJson = (f, d) => fsp.readFile(f, 'utf8').then(JSON.parse).catch(() => d);
const limitsReady = readJson(LIMITS_FILE, {}).then((v) => { LIMITS = v && typeof v === 'object' ? v : {}; });
const limitsAll = () => LIMITS;
function saveLimits(id, L) {
  if (!L) return;
  const all = limitsAll(); all[id] = { ...all[id], ...L, plan: L.plan || all[id]?.plan || null, at: Date.now() };
  clearTimeout(limitsTimer); limitsTimer = setTimeout(() => writeSafeAsync(LIMITS_FILE, JSON.stringify(all)), 600);
  if (win && !win.isDestroyed()) win.webContents.send('limits', all);
  host?.broadcast('limits', [all]);
}
const limitsAsked = {};
async function refreshLimits(only) {
  await limitsReady;
  await Promise.all(P.IDS.filter((id) => (!only || id === only) && P.ADAPTERS[id].limits && Date.now() - (limitsAsked[id] || 0) > 45000).map(async (id) => {
    if (!(await which(P.BY[id].bin))) return;
    limitsAsked[id] = Date.now();
    try { saveLimits(id, await P.ADAPTERS[id].limits(aiCtx(id))); } catch {}
  }));
  return limitsAll();
}
ipcMain.handle('limits:get', async (_e, o) => { await limitsReady; return o?.refresh === true ? refreshLimits() : limitsAll(); });

// The learner's language for explanations (code stays in English so it runs everywhere).
let VOICE = '';
ipcMain.on('prefs', (_e, p) => { VOICE = typeof p?.voice === 'string' && /^[\p{L}\p{M} ()-]{2,30}$/u.test(p.voice) ? p.voice : ''; });
const withVoice = (system) => (VOICE && VOICE !== 'English' ? `${system}\n\nLANGUAGE: Write every human-readable string (titles, paragraphs, pseudocode, notes, labels, quiz, hints, terms, answers) in ${VOICE}. Keep code, identifiers, file paths and JSON keys exactly as they are, in English. Technical terms may keep their common English name with the ${VOICE} word next to it.` : system);

// Streams text deltas to onText. Returns {promise, kill}.
// BENTO_FAKE_LIMIT=claude makes that CLI answer "usage limit" (to test automatic routing to your other AI).
const FAKE_LIMIT = HOOKS.fakeLimit;
// ---------------------------------------------------------------- what used your AI
// Every request is noted (what for, which model, how long, tokens: real counts when the CLI reports them),
// so Settings and the sidebar can show where your plan's usage goes. Quick answers are also kept for 14 days,
// so asking the same thing again costs nothing.
const USAGE = path.join(app.getPath('userData'), 'usage.json');
const QCACHE = path.join(app.getPath('userData'), 'quick-cache.json');
let usageLog = [], qcache = {};
const usageReady = Promise.all([readJson(USAGE, []).then((v) => { usageLog = Array.isArray(v) ? v : []; }), readJson(QCACHE, {}).then((v) => { qcache = v && typeof v === 'object' ? v : {}; })]);
const usage = () => usageLog;
let usageTimer = null;
function noteUsage(e) { usageReady.then(() => { const u = usage(); u.push(e); if (u.length > 3000) u.splice(0, u.length - 3000); clearTimeout(usageTimer); usageTimer = setTimeout(() => { writeSafeAsync(USAGE, JSON.stringify(u)); }, 800); }); }
const quickCache = () => qcache;
let qcTimer = null;
function saveQuick() { clearTimeout(qcTimer); qcTimer = setTimeout(() => { try { const c = quickCache(); const keys = Object.keys(c); if (keys.length > 800) keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - 800).forEach((k) => delete c[k]); writeSafeAsync(QCACHE, JSON.stringify(c)); } catch {} }, 800); }
// a short human label for a quick request, from what it asks
function labelOf(prompt) {
  const p = String(prompt).slice(0, 400);
  const L = [[/Translate these short labels/, 'translating the menus'], [/checking a beginner coding lesson/, 'checking a lesson'], [/interviewer/i, 'interview practice'], [/is stuck on this/, 'a stuck hint'], [/SQL query/, 'explaining SQL'], [/first open-source contribution/, 'planning an issue'], [/explained it back|explain(ed)? it back/i, 'explain it back'], [/plain English|pseudo/i, 'plain words'], [/error/i, 'explaining an error'], [/learning path|stops/i, 'designing a path'], [/tutoring/i, 'answering a question']];
  return (L.find(([r]) => r.test(p)) || [null, 'a quick answer'])[1];
}

// What a CLI printed when it failed, minus stack traces and dumped request details: the lines that say what went wrong
const errorLines = (err) => { const ls = String(err).split('\n').map((l) => l.trim()).filter((l) => l && !/^at |^\{|^\}|^[\w$]+: [\[{'"\w]|^[\]}),]+$/.test(l)); const said = ls.filter((l) => /error|fail|denied|exhausted|quota|limit|not |unable|requires|invalid|unknown|eligib/i.test(l)); return (said.length ? said : ls).slice(-3).join(' '); };
// Runs one request on the chosen AI and streams its text to onText. Returns { promise, kill }.
function runModel(model, system, prompt, onText, onThink) {
  const purpose = system === QUICK_SYSTEM ? labelOf(prompt) : system === ATLAS_SYSTEM ? 'reading a project' : system === SITE_SYSTEM ? 'reading a website' : 'writing a lesson';
  const { prov, name, id: modelId } = P.parseModel(model);
  const A = P.ADAPTERS[prov], bin = P.BY[prov].bin;
  // a hidden CLI (tests, demos of a brand-new Mac) is never started: hiding it must not quietly spend your plan
  if (isHidden(bin)) return { promise: Promise.reject(new Error(P.humanize(prov, 'ENOENT'))), kill: () => {} };
  if (FAKE_LIMIT && prov === FAKE_LIMIT) return { promise: Promise.reject(new Error(P.humanize(prov, 'usage limit reached'))), kill: () => {} };
  const t0 = Date.now(); let child = null, killed = false, sysFile = null;
  const promise = (async () => {
    await envReady;
    await A.prepare?.(aiCtx(prov));
    // instructions go in a private temporary file and the request on standard input, never on the command line
    const sys = withVoice(system);
    sysFile = path.join(WORKDIR, `instructions-${crypto.randomBytes(6).toString('hex')}.md`);
    await fsp.mkdir(WORKDIR, { recursive: true }); await fsp.writeFile(sysFile, sys, { mode: 0o600 });
    const token = prov === 'copilot' && !(ENV.COPILOT_GITHUB_TOKEN || ENV.GH_TOKEN || ENV.GITHUB_TOKEN) ? await ghToken() : null;
    const b = A.build({ name, system: sys, prompt, sysFile, files: await AI_FILES(), token });
    if (killed) throw new Error('Stopped.');
    if (b.noModel) throw new Error(`${P.label(prov)} doesn’t offer ${modelId.split(':')[1]} on this account right now. Choose another model in the bottom-left.`);
    const env = { ...ENV, ...b.env }; for (const [k, v] of Object.entries(b.env || {})) if (v === undefined) delete env[k];
    const [runCmd, runArgs, runOpts] = await launch(...viaFake(bin, b.args));
    if (killed) throw new Error('Stopped.');
    return new Promise((resolve, reject) => {
      child = spawn(runCmd, runArgs, { cwd: WORKDIR, env, stdio: [b.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], ...runOpts }); // no open stdin otherwise: some CLIs wait on an open pipe
      if (b.stdin != null) { child.stdin.on('error', () => {}); child.stdin.end(b.stdin); }
      let buf = '', full = '', err = '', tokens = null, requests = null, limits = null, aborted = null;
      const seen = new Set();
      const sink = {
        text: (t) => { full += t; onText?.(t); }, think: (t, n) => onThink?.(t, n), error: (m) => { err = m; },
        tokens: (i, o) => { tokens = { in: i, out: o }; }, requests: (n) => { requests = n; }, limits: (L) => { limits = L; },
        full: () => full, seen: (id, check) => { if (check) return seen.has(id); seen.add(id); return false; },
        // the AI did something a writer never does (reached for a tool): stop it now, and say why
        abort: (m) => { if (aborted) return; aborted = m; try { child.kill('SIGTERM'); } catch {} },
      };
      let last = Date.now(), stalled = false;
      const quietLimit = P.BY[prov].slow ? 360000 : 150000; // Codex says nothing until it's done; the others stream constantly
      const dog = setInterval(() => { if (Date.now() - last > quietLimit) { stalled = true; clearInterval(dog); try { child.kill('SIGTERM'); } catch {} } }, 5000);
      child.stdout.on('data', (d) => {
        last = Date.now(); buf += d.toString(); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; let o; try { o = JSON.parse(line); } catch { continue; } A.parse(o, sink); }
      });
      child.stderr.on('data', (d) => { last = Date.now(); err += d.toString(); });
      child.on('error', (e) => { clearInterval(dog); reject(new Error(P.humanize(prov, `Couldn't start ${bin}: ${e.message}`))); });
      child.on('close', (code) => {
        clearInterval(dog);
        noteUsage({ at: t0, what: purpose, model: modelId, prov, ms: Date.now() - t0, ok: !!full, in: tokens?.in ?? Math.round((system.length + String(prompt).length) / 4), out: tokens?.out ?? Math.round(full.length / 4), est: !tokens, ...(requests != null ? { requests } : {}) });
        if (limits) saveLimits(prov, limits);
        if (full && A.limits) setTimeout(() => refreshLimits(prov).catch(() => {}), 1500); // the meter moves after each answer
        if (aborted) return reject(new Error(aborted));
        if (stalled && !full) return reject(new Error(`${P.label(prov)} went quiet for too long, so Bento stopped waiting. Try again, or switch model.`));
        if (full) resolve(full);
        else reject(new Error(P.humanize(prov, errorLines(err) || `${bin} exited with ${code}`)));
      });
    });
  })().finally(() => { if (sysFile) fs.rm(sysFile, { force: true }, () => {}); });
  return { promise, kill: () => { killed = true; try { child?.kill('SIGTERM'); } catch {} } };
}

const running = new Map();
const cancelled = new Set();
ipcMain.on('ask:start', async (e, id, req) => {
  const wc = e.sender;
  let model, prompt, system;
  try { id = str(id, 64); model = str(req?.model, 200); prompt = str(req?.prompt, 400_000); system = optStr(req?.system, 20); }
  catch (err) { if (typeof id === 'string' && !wc.isDestroyed()) wc.send('ask:error', id.slice(0, 64), err.message); return; }
  await envReady; // only waits in the first seconds after launch, while your shell's PATH is read
  if (cancelled.delete(id)) return;
  // thinking: some CLIs share the text, others only that it's happening (plus a rough token count)
  let thinkBuf = '', thinkT = 0, ticks = 0, est = 0;
  const r = runModel(model, system === 'atlas' ? ATLAS_SYSTEM : system === 'site' ? SITE_SYSTEM : SYSTEM, prompt, (t) => { if (!wc.isDestroyed()) wc.send('ask:chunk', id, t); }, (t, e) => {
    thinkBuf = (thinkBuf + t).slice(-400); ticks++; est += e || 0; const now = Date.now();
    if (now - thinkT > 250 && !wc.isDestroyed()) { thinkT = now; wc.send('ask:think', id, { text: thinkBuf, n: Math.max(ticks, est) }); }
  });
  running.set(id, r);
  r.promise.then(() => !wc.isDestroyed() && wc.send('ask:done', id))
    .catch((err) => !wc.isDestroyed() && wc.send('ask:error', id, err.message))
    .finally(() => running.delete(id));
});
ipcMain.on('ask:cancel', (_e, id) => { if (typeof id !== 'string' || id.length > 64) return; const r = running.get(id); if (r) { r.kill(); running.delete(id); } else { cancelled.add(id); setTimeout(() => cancelled.delete(id), 10000); } });
// quitting mid-lesson shouldn't leave AI processes running in the background
app.on('will-quit', () => { for (const r of running.values()) r.kill(); running.clear(); });

// small one-shot calls (token cards, pseudocode refresh, translations)
const ACCOUNT_TROUBLE = /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/;
ipcMain.handle('quick', async (_e, req) => {
  const model = str(req?.model, 200), prompt = str(req?.prompt, 400_000);
  await envReady; await usageReady;
  // quick calls use the fast model of the same AI
  const fast = P.fastOf(model);
  // the same question (same model, same language) within 14 days: answer from the saved copy
  const key = crypto.createHash('sha1').update(`${fast}\n${VOICE}\n${prompt}`).digest('hex');
  const hit = quickCache()[key];
  if (hit && Date.now() - hit.at < 14 * 864e5) { noteUsage({ at: Date.now(), what: labelOf(prompt), model: fast, prov: P.parseModel(fast).prov, ms: 0, ok: true, in: 0, out: 0, saved: Math.round(String(prompt).length / 4) + Math.round(hit.a.length / 4) }); return hit.a; }
  const keep = (a) => { quickCache()[key] = { a, at: Date.now() }; saveQuick(); return a; };
  try { return keep(await runModel(fast, QUICK_SYSTEM, prompt).promise); }
  catch (err) {
    // this AI can't answer right now (limit, signed out, missing): quietly try the next one you have, in order
    if (!ACCOUNT_TROUBLE.test(err.message)) throw err;
    const mine = P.parseModel(fast).prov;
    for (const id of P.IDS.filter((x) => x !== mine)) {
      if (!(await which(P.BY[id].bin))) continue;
      try { return keep(await runModel(P.BY[id].fast, QUICK_SYSTEM, prompt).promise); } catch (e2) { if (!ACCOUNT_TROUBLE.test(e2.message)) throw err; }
    }
    throw err;
  }
});
// the last 7 days of AI use, for the sidebar meter and Settings, with each AI's share of today
ipcMain.handle('usage:get', async () => {
  await usageReady;
  const u = usage(); const day = (t) => new Date(t).toISOString().slice(0, 10); const today = day(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => day(Date.now() - (6 - i) * 864e5)).map((d) => ({ d, lessons: 0, quick: 0, other: 0, saved: 0, tokens: 0 }));
  const by = {}; // today, per AI: requests and tokens
  for (const e of u) {
    const D = days.find((x) => x.d === day(e.at)); if (!D) continue;
    if (e.saved) { D.saved++; continue; }
    if (e.ok === false) continue; // it never got an answer (signed out, not installed, stopped): none of the plan was used
    if (e.what === 'writing a lesson') D.lessons++; else if (/^reading/.test(e.what)) D.other++; else D.quick++;
    D.tokens += (e.in || 0) + (e.out || 0);
    if (D.d === today) { const k = e.prov || String(e.model || '').split(':')[0] || 'claude'; const b = (by[k] ||= { n: 0, lessons: 0, tokens: 0 }); b.n++; if (e.what === 'writing a lesson') b.lessons++; b.tokens += (e.in || 0) + (e.out || 0); }
  }
  const recent = u.slice(-14).reverse().map((e) => ({ at: e.at, what: e.what, model: e.model, saved: !!e.saved, tokens: (e.in || 0) + (e.out || 0), est: !!e.est, ms: e.ms, ok: e.ok }));
  return { days, today: days.find((x) => x.d === today), by, recent, savedAnswers: Object.keys(quickCache()).length };
});
ipcMain.handle('usage:clearSaved', async () => { await usageReady; qcache = {}; await fsp.rm(QCACHE, { force: true }).catch(() => {}); return true; });

// ---------------------------------------------------------------- local folders
const { SKIP_DIRS: SKIP, CODE_EXT } = atlas;
const roots = new Set();
ipcMain.handle('folder:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const root = r.filePaths[0]; roots.add(root);
  return { kind: 'local', root, name: path.basename(root), files: await work('codeFiles', [root]) };
});
// Something dragged onto the window: a folder becomes a project, a code file becomes a lesson. The path comes from the
// dropped file itself (preload.cjs asks Electron for it), so the page can't name a file you didn't drop.
ipcMain.handle('drop:open', async (_e, p) => {
  p = str(p, 4096);
  const st = path.isAbsolute(p) ? await fsp.stat(p).catch(() => null) : null;
  if (!st) throw new Error('Couldn’t read that.');
  if (st.isDirectory()) { if (!projectRootOk(p, undefined, REPOS)) throw new Error('Bento opens project folders, not your whole disk, home folder or system folders.'); roots.add(p); return { kind: 'local', root: p, name: path.basename(p) }; }
  if (/\.bento$/i.test(p)) {
    if (st.size > 2_000_000) throw new Error('That lesson file is too big.');
    let j; try { j = JSON.parse(await fsp.readFile(p, 'utf8')); } catch { throw new Error('That .bento file is damaged.'); }
    if (j?.bento !== 1 || !j.lesson?.title) throw new Error('That isn’t a Bento lesson.');
    return { kind: 'lesson', lesson: j.lesson };
  }
  if (st.size > 200_000) throw new Error('That file is too big to explain in one go.');
  if (!CODE_EXT.test(p)) throw new Error('Drop a code file (like .py or .js) or a project folder.');
  return { kind: 'file', name: path.basename(p), text: await fsp.readFile(p, 'utf8') };
});
const insideOf = (root, f) => { const r = path.relative(root, f); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
ipcMain.handle('folder:read', async (_e, root, rel) => {
  root = str(root, 4096); rel = optStr(rel, 4096);
  if (!roots.has(root)) throw new Error('That folder isn’t open in Bento any more. Open it again.');
  const f = path.resolve(root, rel);
  // inside the opened folder only: "../bento-secrets" must not pass just because it starts with the same letters
  if (!insideOf(root, f)) refuse();
  // ...for real: a link inside a downloaded project ("notes -> ~/.ssh") must not lead out of it
  const [real, realRoot] = await Promise.all([fsp.realpath(f), fsp.realpath(root)]).catch(() => [null, null]);
  if (!real) throw new Error('That file isn’t there any more.');
  if (!insideOf(realRoot, real)) refuse();
  const st = await fsp.stat(real); if (!st.isFile()) refuse(); if (st.size > 3_000_000) return '// (file too large to show)';
  return fsp.readFile(real, 'utf8').catch((e) => { throw new Error(e.code === 'EACCES' || e.code === 'EPERM' ? 'Bento isn’t allowed to read that file.' : 'Couldn’t read that file.'); });
});

// ---------------------------------------------------------------- GitHub via gh
// Publish a page with your own GitHub account: one public repo, "bento-pages", served by GitHub Pages.
// Nothing is hosted by Bento. BENTO_DRY_PUBLISH=1 records the gh commands instead of running them (for tests).
ipcMain.handle('web:publish', async (_e, html, title) => {
  html = str(html, 2_000_000); title = optStr(title, 300);
  const dry = HOOKS.dryPublish ? [] : null;
  const call = async (args) => { if (dry) { dry.push(['gh', ...args.map((a) => (a.length > 80 ? a.slice(0, 40) + '…' : a))].join(' ')); return args.includes('user') ? 'learner' : ''; } return gh(args); };
  const slug = String(title || 'my page').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'my-page';
  const login = String(await call(['api', 'user', '--jq', '.login'])).trim();
  if (!login) throw new Error('Sign in to GitHub first: open Terminal and run gh auth login');
  const repo = `${login}/bento-pages`;
  let exists = true; try { if (!dry) await call(['repo', 'view', repo, '--json', 'name']); else exists = false; } catch { exists = false; }
  if (!exists) await call(['repo', 'create', 'bento-pages', '--public', '--description', 'Pages I made while learning with Bento', '--add-readme']);
  let sha = ''; try { if (!dry) sha = String(await call(['api', `repos/${repo}/contents/${slug}/index.html`, '--jq', '.sha'])).trim(); } catch { sha = ''; }
  await call(['api', '-X', 'PUT', `repos/${repo}/contents/${slug}/index.html`, '-f', `message=Publish ${slug} from Bento`, '-f', `content=${Buffer.from(String(html || '')).toString('base64')}`, ...(sha ? ['-f', `sha=${sha}`] : [])]);
  try { await call(['api', '-X', 'POST', `repos/${repo}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/']); } catch { /* already on */ }
  return { url: `https://${login}.github.io/bento-pages/${slug}/`, repo, dry };
});

async function gh(args) {
  if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) throw new Error('GitHub CLI isn’t available.');
  await envReady;
  const [c, a, o] = await launch('gh', args);
  return new Promise((res, rej) => execFile(c, a, { env: ENV, maxBuffer: 20 * 1024 * 1024, ...o }, (e, out, se) => e ? rej(new Error((se || e.message).trim())) : res(out)));
}
ipcMain.handle('gh:me', async () => {
  try { const u = JSON.parse(await gh(['api', 'user'])); return { login: u.login, name: u.name, avatar: u.avatar_url }; } catch { return null; }
});
ipcMain.handle('gh:repos', async () => JSON.parse(await gh(['repo', 'list', '--limit', '40', '--json', 'name,nameWithOwner,primaryLanguage,description,updatedAt,isPrivate'])));
ipcMain.handle('gh:tree', async (_e, full) => {
  if (!REPO_RX.test(str(full, 200))) refuse();
  const t = JSON.parse(await gh(['api', `repos/${full}/git/trees/HEAD?recursive=1`]));
  const files = (t.tree || []).filter((x) => x.type === 'blob' && CODE_EXT.test(x.path) && !x.path.split('/').some((s) => SKIP.has(s))).map((x) => x.path).slice(0, 600);
  return { kind: 'github', root: full, name: full, files };
});
ipcMain.handle('gh:file', async (_e, full, p) => {
  p = str(p, 1000);
  if (!REPO_RX.test(str(full, 200)) || !p || p.split('/').some((x) => !x || x === '..' || x === '.')) refuse();
  const o = JSON.parse(await gh(['api', `repos/${full}/contents/${p.split('/').map(encodeURIComponent).join('/')}`]));
  if (o.size > 300_000) return '// (file too large to show)';
  return Buffer.from(o.content || '', 'base64').toString('utf8');
});
// lesson web pages: keep the last few, each with a tiny script that reports console output to Bento
const PLAY = new Map();
const PLAY_SHIM = `<script>(function(){var send=function(k,a){try{parent.postMessage({bentoPlay:1,k:k,s:Array.prototype.map.call(a,function(x){try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ')},'*')}catch(e){}};['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});window.addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});var last=null;document.addEventListener('mouseover',function(e){var el=e.target.closest&&e.target.closest('[data-bl]');if(el===last)return;if(last)last.style.outline=last.__o||'';last=el;if(el){el.__o=el.style.outline;el.style.outline='2px solid rgba(124,92,255,.7)';try{parent.postMessage({bentoPlay:1,k:'hover',line:+el.getAttribute('data-bl')},'*')}catch(x){}}},true);document.addEventListener('mouseleave',function(){if(last){last.style.outline=last.__o||'';last=null}try{parent.postMessage({bentoPlay:1,k:'hover',line:0},'*')}catch(x){}});})();<\/script>`;
ipcMain.handle('play:put', (_e, html, key) => {
  html = str(html, 2_000_000); key = typeof key === 'string' ? key : '';
  // one stable origin per lesson, so the page's localStorage survives re-runs ("remember my tasks")
  const id = /^[a-z0-9-]{3,40}$/i.test(key) ? `l-${key.toLowerCase()}` : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const doc = html.slice(0, 400000);
  PLAY.set(id, /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => m + PLAY_SHIM) : PLAY_SHIM + doc);
  while (PLAY.size > 20) PLAY.delete(PLAY.keys().next().value);
  return id;
});
ipcMain.handle('lesson:export', async (_e, lesson) => {
  if (!lesson || typeof lesson !== 'object' || sizeOf(lesson) > 5_000_000) refuse();
  const safe = String(lesson?.title || 'lesson').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'lesson';
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), `${safe}.bento`), filters: [{ name: 'Bento lesson', extensions: ['bento'] }] });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, JSON.stringify({ bento: 1, exported: new Date().toISOString(), lesson }, null, 1)).catch(saveError);
  return r.filePath;
});
// what went wrong writing a file you asked for, in plain words
function saveError(e) { throw new Error(e?.code === 'ENOSPC' ? 'Your disk is full. Free up some space and try again.' : e?.code === 'EACCES' || e?.code === 'EPERM' || e?.code === 'EROFS' ? 'Bento isn’t allowed to save there. Choose another place.' : 'Couldn’t save the file.'); }
// Save a lesson's web page as a real file you can open in any browser (or send to a friend).
ipcMain.handle('web:save', async (_e, html, title) => {
  html = str(html, 5_000_000); title = optStr(title, 300);
  const dir = path.join(app.getPath('desktop'), 'Bento pages'); await fsp.mkdir(dir, { recursive: true }).catch(saveError);
  const base = (title || 'my page').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'my page';
  let file = path.join(dir, `${base}.html`); let n = 2;
  while (await fsp.access(file).then(() => true, () => false)) file = path.join(dir, `${base} ${n++}.html`);
  await fsp.writeFile(file, html, { flag: 'wx' }).catch(saveError);
  shell.showItemInFolder(file);
  return file;
});
// How much space downloaded repos take, and a way to clear them (the Atlas notes stay cached).
ipcMain.handle('repos:usage', async () => { const es = await fsp.readdir(REPOS).catch(() => []); const sizes = await Promise.all(es.map((e) => work('dirSize', [path.join(REPOS, e)]))); return { bytes: sizes.reduce((a, b) => a + b, 0), count: es.length }; });
ipcMain.handle('repos:clear', async () => { await work('remove', [REPOS]).catch(() => {}); await fsp.mkdir(REPOS, { recursive: true }).catch(() => {}); return true; });
ipcMain.handle('open:data', () => shell.openPath(app.getPath('userData')));
// the welcome's "Open Terminal": to paste an install command (Bento never runs installers itself)
ipcMain.handle('open:terminal', () => (MAC ? shell.openPath('/System/Applications/Utilities/Terminal.app') : false));
ipcMain.handle('open:external', (_e, url) => openOutside(str(url, 4000)));

// ---------------------------------------------------------------- Atlas: bring a repo in and take it apart
const REPOS = path.join(app.getPath('userData'), 'repos');
const CACHE = path.join(app.getPath('userData'), 'atlas');
const cacheReady = fsp.mkdir(CACHE, { recursive: true }).catch(() => {});
const ghOk = (() => { let v = null; return async () => (v ??= !process.env.BENTO_NO_GH && !!(await which('gh')) && await gh(['auth', 'status']).then(() => true, () => false)); })();
const REPO_RX = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/; // owner/name, never ../..

ipcMain.handle('atlas:fetch', async (e, full) => {
  if (!REPO_RX.test(str(full, 200))) throw new Error('That doesn’t look like owner/name.');
  await envReady; // git, found the way a new Terminal finds it
  const wc = e.sender;
  const dir = await work('fetchRepo', [{ full, base: REPOS, env: ENV, hasGh: await ghOk() }], (p) => !wc.isDestroyed() && wc.send('atlas:progress', full, p));
  roots.add(dir);
  return { kind: 'github', root: dir, name: full, full };
});
// Beginner-friendly open issues in a project ("good first issue" and friends), newest first
ipcMain.handle('gh:issues', async (_e, full) => {
  if (!REPO_RX.test(str(full, 200))) refuse();
  const labels = ['good first issue', 'good-first-issue', 'help wanted', 'beginner', 'easy', 'first-timers-only'];
  const seen = new Map();
  for (const label of labels) {
    const q = `repos/${full}/issues?state=open&per_page=12&labels=${encodeURIComponent(label)}`;
    let rows = [];
    try { rows = (await ghOk()) ? JSON.parse(await gh(['api', q])) : await (await net.fetch(`https://api.github.com/${q}`, { headers: { 'user-agent': 'Bento', accept: 'application/vnd.github+json' } })).json(); } catch { rows = []; }
    for (const r of Array.isArray(rows) ? rows : []) if (!r.pull_request && !seen.has(r.number)) seen.set(r.number, { n: r.number, title: r.title, url: r.html_url, body: String(r.body || '').slice(0, 4000), labels: (r.labels || []).map((l) => l.name), comments: r.comments, at: r.created_at, assigned: !!(r.assignee || r.assignees?.length) });
    if (seen.size >= 12) break;
  }
  return [...seen.values()].sort((a, b) => (a.assigned - b.assigned) || (b.at > a.at ? 1 : -1)).slice(0, 12);
});
ipcMain.handle('atlas:history', async (e, full) => {
  if (!REPO_RX.test(str(full, 200))) throw new Error('That doesn’t look like owner/name.');
  await envReady; // git, found the way a new Terminal finds it
  const wc = e.sender;
  return work('history', [{ full, base: REPOS, env: ENV }], (p) => !wc.isDestroyed() && wc.send('atlas:progress', `history:${full}`, p));
});
ipcMain.handle('atlas:refresh', async (e, full) => {
  if (!REPO_RX.test(str(full, 200))) refuse();
  await work('remove', [path.join(REPOS, full.replace('/', '__'))]);
  await fsp.rm(path.join(CACHE, `${full.replace('/', '__')}.json`), { force: true }).catch(() => {});
  return true;
});
ipcMain.handle('atlas:analyze', async (_e, root, name) => {
  root = str(root, 4096); name = optStr(name, 300);
  if (!roots.has(root)) throw new Error('That project isn’t open in Bento any more. Open it again.');
  return work('analyze', [root, { name }]);
});
async function repoMeta(full) {
  if (!REPO_RX.test(full)) return null;
  const pick = (r) => ({ full: r.full_name, description: r.description, stars: r.stargazers_count, forks: r.forks_count, license: r.license?.spdx_id, topics: r.topics || [], avatar: r.owner?.avatar_url, owner: r.owner?.login, url: r.html_url, homepage: r.homepage, pushed: r.pushed_at, created: r.created_at, language: r.language, size: r.size, fork: r.fork, parent: r.parent?.full_name, isPrivate: r.private });
  try { if (await ghOk()) return pick(JSON.parse(await gh(['api', `repos/${full}`]))); } catch {}
  try { const r = await net.fetch(`https://api.github.com/repos/${full}`, { headers: { 'User-Agent': 'bento-app' } }); if (r.ok) return pick(await r.json()); } catch {}
  return null;
}
ipcMain.handle('atlas:meta', (_e, full) => repoMeta(str(full, 200)));
// Which files actually talk about this? A plain word search through the project's files (no AI), so a question like
// "where does it copy the last answer" finds the message components even when no file is called "copy".
// Which files actually talk about this? A plain word search (no AI), in the worker.
ipcMain.handle('atlas:search', async (_e, root, words) => {
  root = str(root, 4096);
  if (!roots.has(root)) throw new Error('That project isn’t open in Bento any more. Open it again.');
  const ws = [...new Set(strList(words || [], 50, 200).map((w) => w.toLowerCase()).filter((w) => w.length >= 3))].slice(0, 10);
  if (!ws.length) return [];
  return work('search', [root, ws]);
});
const cacheFile = (key) => path.join(CACHE, `${str(key, 600).replace(/[^\w.-]+/g, '__').slice(0, 200)}.json`);
ipcMain.handle('atlas:cache:get', async (_e, key) => { const f = cacheFile(key); return fsp.readFile(f, 'utf8').then(JSON.parse).catch(() => null); });
ipcMain.handle('atlas:cache:put', async (_e, key, v) => { const f = cacheFile(key); const t = JSON.stringify(v); if (!t || t.length > 50_000_000) refuse(); await cacheReady; return !(await writeSafeAsync(f, t)); });
ipcMain.handle('atlas:list', async () => {
  await cacheReady;
  const out = [];
  for (const f of (await fsp.readdir(CACHE).catch(() => [])).filter((x) => x.endsWith('.json'))) {
    try {
      const [st, j] = await Promise.all([fsp.stat(path.join(CACHE, f)), fsp.readFile(path.join(CACHE, f), 'utf8').then(JSON.parse)]);
      if (!j?.src) continue;
      const lang = Object.entries(j.facts?.langs || {}).sort((a, b) => b[1] - a[1]).find(([l]) => !['HTML', 'CSS', 'Shell'].includes(l))?.[0];
      out.push({ key: j.src.kind === 'github' ? j.src.full : `local:${j.src.root}`, name: j.name, kind: j.src.kind, full: j.src.full, root: j.src.root, lang, at: j.at || st.mtimeMs });
    } catch {}
  }
  return out.sort((a, b) => b.at - a.at);
});
ipcMain.handle('atlas:reopen', async (_e, root) => { if (typeof root === 'string' && root.length <= 4096 && projectRootOk(root, undefined, REPOS) && (await fsp.stat(root).then((st) => st.isDirectory(), () => false))) { roots.add(root); return true; } return false; });

// A plain JSON mirror of what the renderer keeps in localStorage, so a crash never loses lessons.
const STORE = path.join(app.getPath('userData'), 'bento-store.json');
const SNAPS = path.join(app.getPath('userData'), 'Backups');
let storeCache = {}; let storeTimer = null;
let bootStore = {}; // the disk copy as it was at launch, before this session wrote anything
// Read once, in the background, as Bento starts. A damaged file is set aside under a new name, never overwritten, so it
// (and the daily copies in Backups) can still bring things back.
const storeReady = fsp.readFile(STORE, 'utf8').then(async (raw) => {
  try { storeCache = JSON.parse(raw); } catch {
    const aside = path.join(path.dirname(STORE), `bento-store damaged ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
    logger.log('the saved lessons file was damaged; kept as', path.basename(aside));
    await fsp.rename(STORE, aside).catch(() => {});
  }
}, () => {}).then(() => { if (!storeCache || typeof storeCache !== 'object' || Array.isArray(storeCache)) storeCache = {}; bootStore = structuredClone(storeCache); });
ipcMain.handle('store:get', async (e) => { await storeReady; return e?.remote ? storeCache : bootStore; });
// Back up everything to one file (to move to another Mac, or just to be safe), and bring it back
ipcMain.handle('backup:save', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), `Bento backup ${day}.json`), filters: [{ name: 'Bento backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  await storeReady;
  const keep = Object.fromEntries(Object.entries(storeCache).filter(([k]) => /^bento\.(lessons|progress|settings|projects)$/.test(k)));
  await fsp.writeFile(r.filePath, JSON.stringify({ bento: 'backup', v: 1, at: new Date().toISOString(), data: keep })).catch(saveError);
  return r.filePath;
});
ipcMain.handle('backup:load', async () => {
  const snaps = await fsp.access(SNAPS).then(() => SNAPS, () => undefined);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], defaultPath: snaps, filters: [{ name: 'Bento backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths?.[0]) return null;
  const st = await fsp.stat(r.filePaths[0]).catch(() => null);
  if (!st || st.size > 100_000_000) throw new Error('That file is too big to be a Bento backup.');
  let j; try { j = JSON.parse(await fsp.readFile(r.filePaths[0], 'utf8')); } catch { throw new Error('That file is damaged, or isn’t a Bento backup.'); }
  if (j?.bento !== 'backup' || !j.data) throw new Error('That file isn’t a Bento backup.');
  return j.data;
});
const SHARED = /^bento\.(lessons|progress|settings|projects|savedAt)$/;
ipcMain.handle('store:set', async (_e, key, value) => {
  if (!/^bento\.[\w.-]{1,80}$/.test(str(key, 90))) refuse();
  await storeReady;
  // your lessons, progress, settings and projects are the same on every device: a change here is passed on to the others
  const before = SHARED.test(key) && (host?.isOn() || _e?.sender?.remote) ? JSON.stringify(storeCache[key] ?? null) : null;
  if (value === undefined) delete storeCache[key]; else storeCache[key] = value;
  if (before !== null && JSON.stringify(value ?? null) !== before) shareChange(key, value, _e.sender);
  clearTimeout(storeTimer);
  storeTimer = setTimeout(saveStore, 500);
  return true;
});
// Saved in the background. If saving starts failing (a full disk, a folder Bento may no longer write to), the page is
// told once, in plain words, and again when it works: nothing is lost while Bento stays open.
let storeTrouble = null;
async function saveStore() {
  storeTimer = null;
  let text; try { text = JSON.stringify(storeCache); } catch (e) { logger.log('save skipped', e); return; }
  const why = await writeSafeAsync(STORE, text);
  if (why === 'ECANCELED') return;
  if (why && !storeTimer) storeTimer = setTimeout(saveStore, 30_000); // keep trying: freeing some space is enough
  if (why === storeTrouble) return;
  storeTrouble = why;
  if (why) logger.log('saving lessons failed', why);
  if (win && !win.isDestroyed()) win.webContents.send('store:health', why ? { error: why } : { ok: true });
  host?.broadcast('store:health', [why ? { error: why } : { ok: true }]);
}
// Quitting (or restarting for an update) while Bento is still writing a lesson or reading a project throws that away,
// along with the part of your plan it used. Ask first. Tests, and quits you already confirmed, go straight through.
let leaveOk = false;
async function okToLeave(verb) {
  if (leaveOk || OFFSCREEN || !running.size || !win || win.isDestroyed()) return true;
  const n = running.size;
  const r = await dialog.showMessageBox(win, { type: 'warning', message: n > 1 ? `Bento is still writing ${n} things for you` : 'Bento is still writing for you',
    detail: `A lesson or a project reading is in progress. If you ${verb} now, it stops and has to be asked again.`, buttons: [verb === 'quit' ? 'Quit Anyway' : 'Restart Anyway', 'Keep Writing'], defaultId: 1, cancelId: 1 });
  return r.response === 0;
}
app.on('before-quit', (e) => {
  if (!leaveOk && !OFFSCREEN && running.size) { e.preventDefault(); okToLeave('quit').then((ok) => { if (ok) { leaveOk = true; app.quit(); } }); return; }
  // the last save is written right here (a background save still on its way stands down, so it can't land after it)
  if (storeTimer) { clearTimeout(storeTimer); storeTimer = null; stopWrites(); writeSafe(STORE, JSON.stringify(storeCache)); }
});

// a search's options, checked: anything unexpected is dropped rather than passed on to gh
const searchOpts = (o) => {
  o = o && typeof o === 'object' ? o : {};
  const ok = (v, rx) => (typeof v === 'string' && rx.test(v) ? v : undefined);
  return { limit: Number.isInteger(o.limit) ? Math.min(50, Math.max(1, o.limit)) : 24, sort: ['stars', 'updated', 'forks', 'help-wanted-issues', 'best-match'].includes(o.sort) ? o.sort : 'stars',
    language: ok(o.language, /^[\w#+. -]{1,40}$/), stars: ok(o.stars, /^[<>=]{0,2}\d+(\.\.\d+)?$/), size: ok(o.size, /^[<>=]{0,2}\d+(\.\.\d+)?$/) };
};
async function searchRepos(q, opts = {}) {
  q = str(q, 300); opts = searchOpts(opts);
  const fields = 'fullName,description,stargazersCount,language,size,owner,updatedAt';
  if (await ghOk()) {
    const args = ['search', 'repos', '--limit', String(opts.limit), '--json', fields, '--sort', opts.sort];
    if (opts.language) args.push('--language', opts.language);
    if (opts.stars) args.push('--stars', opts.stars);
    if (opts.size) args.push('--size', opts.size);
    args.push('--', ...q.split(/\s+/).filter(Boolean)); // the words are only ever words to search for, even "-x" or "--web"
    const rows = JSON.parse(await gh(args));
    return rows.map((r) => ({ full: r.fullName, description: r.description, stars: r.stargazersCount, language: r.language, size: r.size, owner: r.owner?.login, updated: r.updatedAt }));
  }
  const r = await net.fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q + (opts.language ? ` language:${opts.language}` : ''))}&sort=stars&per_page=${opts.limit}`, { headers: { 'User-Agent': 'bento-app' } });
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub search limit reached. Sign in with gh auth login for more.' : `GitHub search failed (${r.status})`);
  const j = await r.json();
  return (j.items || []).map((x) => ({ full: x.full_name, description: x.description, stars: x.stargazers_count, language: x.language, size: x.size, owner: x.owner?.login, updated: x.updated_at }));
}
ipcMain.handle('gh:search', (_e, q, opts = {}) => searchRepos(q, opts));

// "How does T3 Code work?": is it an app on this Mac, a clone in your code folders, or a project on GitHub?
const findproject = require('./findproject.cjs');
const foundRoots = new Set();
ipcMain.handle('project:find', async (_e, names) => {
  names = Array.isArray(names) ? strList(names.slice(0, 8), 8, 200) : [str(names, 200)];
  const r = await findproject.find(names, { searchGitHub: (q) => searchRepos(q, { limit: 6 }), repoMeta, localClones: (n, f) => work('localClones', [n, f]), installedApps: (n) => work('installedApps', [n]) });
  for (const l of r.local) foundRoots.add(l.root);
  return r;
});
// a clone that project:find found may be opened in the Atlas (read-only, like a folder you picked)
ipcMain.handle('project:openLocal', async (_e, root) => { if (typeof root !== 'string' || !foundRoots.has(root) || !(await fsp.access(root).then(() => true, () => false))) return null; roots.add(root); return { root, name: path.basename(root) }; });
// Real code in the wild: GitHub code search (needs gh signed in). One result per repo, short snippets.
ipcMain.handle('gh:code', async (_e, q, language) => {
  q = str(q, 300); language = optStr(language, 40);
  if (language && !/^[\w#+. -]{1,40}$/.test(language)) refuse();
  if (!(await ghOk())) throw new Error('Sign in to GitHub (gh auth login) to search real code.');
  const args = ['search', 'code', '--limit', '30', '--json', 'repository,path,textMatches,url'];
  if (language) args.push('--language', language);
  args.push('--', q);
  const rows = JSON.parse(await gh(args));
  const seen = new Set(); const out = [];
  for (const r of rows) {
    const full = r.repository?.nameWithOwner; if (!full || seen.has(full) || r.repository?.isFork) continue;
    if (/(^|\/)(test|tests|node_modules|vendor|site-packages)\//i.test(r.path)) continue;
    seen.add(full);
    out.push({ repo: full, path: r.path, url: r.url, fragment: (r.textMatches?.[0]?.fragment || '').split('\n').slice(0, 8).join('\n') });
    if (out.length >= 6) break;
  }
  return out;
});
// Take apart a website: fetch it like a browser would and keep the clues (headers, scripts, meta tags).
// Fetched the way lesson code fetches (netfetch.cjs): public internet only, checked again at every redirect and at the
// moment of connecting, so a website can't send Bento into your own Mac or home network.
ipcMain.handle('site:inspect', async (_e, url) => {
  url = str(url, 2000).trim();
  let u; try { u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { throw new Error('That doesn’t look like a web address.'); }
  if (!/^https?:$/.test(u.protocol) || !hostAllowed(u.hostname)) throw new Error('Only public websites, please.');
  const t0 = Date.now();
  let r; try { r = await follow(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', accept: 'text/html' } }); }
  catch (e) { throw new Error(e.code === 'EBLOCKED' ? 'Only public websites, please.' : `Couldn’t reach ${u.hostname}: ${e.message}`); }
  const ms = Date.now() - t0;
  const html = r.text.slice(0, 600000);
  r.headers = { get: (k) => { const v = r.rawHeaders?.[k]; return v == null ? null : String(v); } };
  const H = {}; for (const k of ['server', 'x-powered-by', 'cf-ray', 'x-vercel-id', 'x-nf-request-id', 'x-served-by', 'x-cache', 'via', 'x-amz-cf-id', 'x-github-request-id', 'x-shopify-stage', 'x-wix-request-id', 'x-generator', 'content-type', 'strict-transport-security', 'x-fastly-request-id', 'fly-request-id', 'x-render-origin-server', 'x-railway-request-id', 'x-cache-status', 'alt-svc']) { const v = r.headers.get(k); if (v) H[k] = v.slice(0, 120); }
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 80);
  const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map((m) => m[1]).slice(0, 30);
  const meta = (n) => (new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${n}["']`, 'i').exec(html))?.[1] || '';
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim().slice(0, 140);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
  const repos = [...new Set([...html.matchAll(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?["'#?/\s]/gi)].map((m) => m[1]).filter((r) => !/^(orgs|sponsors|features|about|login|settings|topics|marketplace|apps|site|contact|pricing|enterprise|security|collections|trending)\//i.test(r) && !/\/\.github$/i.test(r)))].slice(0, 6);
  const counts = { scripts: (html.match(/<script/gi) || []).length, images: (html.match(/<img/gi) || []).length, links: (html.match(/<a\s/gi) || []).length, iframes: (html.match(/<iframe/gi) || []).length };
  const finalUrl = r.url || u.toString();
  return { url: u.toString(), final: finalUrl, host: new URL(finalUrl).hostname, status: r.status, ms, bytes: html.length, headers: H, scripts, styles, repos, title, description: meta('description') || meta('og:description'), generator: meta('generator'), counts, text, html: html.slice(0, 120000) };
});
ipcMain.handle('gh:fork', async (_e, full) => {
  if (!REPO_RX.test(str(full, 200))) refuse();
  if (!(await ghOk())) throw new Error('Sign in to GitHub first: run gh auth login in Terminal.');
  const out = await gh(['repo', 'fork', full, '--clone=false']).catch((e) => e.message);
  const me = JSON.parse(await gh(['api', 'user'])).login;
  return { url: `https://github.com/${me}/${full.split('/')[1]}`, note: String(out).trim() };
});

// ---------------------------------------------------------------- your phone and iPad
// Off until you turn it on in Settings. Then this Mac serves Bento's page to the devices you pair (host.cjs) and does
// their work with your AIs, the way T3 Code's phone app works with your computer: nothing hosted, nothing extra to pay.
// What a device may ask for: everything Bento does for its page, except what only makes sense sitting at the Mac
// (Terminal, Finder, file dialogs, updates, backups); those tell the person to use the Mac.
const REMOTE_CALLS = new Set(['providers', 'scan', 'limits:get', 'usage:get', 'usage:clearSaved', 'quick', 'store:get', 'store:set', 'folder:read', 'gh:me', 'gh:repos', 'gh:tree', 'gh:file',
  'atlas:fetch', 'atlas:history', 'gh:issues', 'atlas:refresh', 'atlas:analyze', 'atlas:meta', 'atlas:list', 'atlas:reopen', 'atlas:cache:get', 'atlas:cache:put', 'atlas:search',
  'gh:search', 'project:find', 'project:openLocal', 'gh:code', 'site:inspect', 'gh:fork', 'web:publish', 'play:put', 'update:get', 'repos:usage']);
const REMOTE_SENDS = new Set(['ask:start', 'ask:cancel', 'prefs']);
const HOST_FILE = path.join(app.getPath('userData'), 'host.json');
let hostPrefs = { on: false, wifi: false }, macName = os.hostname();
// this Mac's names on Tailscale ("my-mac.tail1234.ts.net" and "my-mac"), so a link can use them
let tsNames = { v: [], at: 0 };
async function tailscaleNames() {
  if (Date.now() - tsNames.at < 5 * 60_000) return tsNames.v;
  tsNames.at = Date.now();
  for (const bin of [await which('tailscale'), MAC ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale' : null].filter(Boolean)) {
    const r = await runQuiet(bin, ['status', '--json'], 5000);
    try { const n = String(JSON.parse(r.out)?.Self?.DNSName || '').replace(/\.$/, '').toLowerCase(); if (r.ok && /^[a-z0-9.-]+$/.test(n)) return (tsNames.v = [n, n.split('.')[0]]); } catch {}
  }
  return (tsNames.v = []);
}
function hostNow() {
  return (host ??= require('./host.cjs').createHost({
    dist: DIST, devicesFile: path.join(app.getPath('userData'), 'devices.json'), name: () => macName, version: app.getVersion(),
    call: async (ch, args, sender) => {
      const fn = REMOTE_CALLS.has(ch) && RAW.handle.get(ch);
      if (!fn) throw new Error('That works on your Mac: open Bento there to do it.');
      try { return await fn({ sender, remote: true }, ...args); } catch (e) { throw new Error(e instanceof BadInput ? e.message : String(e?.message || e)); }
    },
    send: (ch, args, sender) => { if (REMOTE_SENDS.has(ch)) RAW.on.get(ch)?.({ sender, remote: true }, ...args); },
    netProxy, playGet: (id) => PLAY.get(id), dnsNames: tailscaleNames, writeFile: writeSafeAsync, log: logger.log,
    onChange: () => { clearTimeout(hostTick); hostTick = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('host:state', hostState()); }, 120); },
    port: TEST_BUILD && Number(process.env.BENTO_HOST_PORT) ? Number(process.env.BENTO_HOST_PORT) : undefined,
  }));
}
let hostTick = null;
function hostState() {
  const st = host ? host.state() : { on: false, wifi: hostPrefs.wifi, urls: [], devices: [], pairing: null, error: null };
  const url = st.urls[0]?.url;
  return { ...st, name: macName, pairUrl: st.pairing && url ? `${url}/#pair=${st.pairing.code}` : null };
}
// a change made on one device appears on the others (and in the Mac's own window)
function shareChange(key, value, from) {
  if (from?.remote && win && !win.isDestroyed()) win.webContents.send('store:changed', key, value);
  host?.broadcast('store:changed', [key, value], from?.clientId);
}
ipcMain.handle('host:get', () => hostState());
ipcMain.handle('host:set', async (_e, p) => {
  hostPrefs = { on: p?.on === true, wifi: p?.wifi === true };
  await writeSafeAsync(HOST_FILE, JSON.stringify(hostPrefs));
  if (hostPrefs.on) await hostNow().start({ wifi: hostPrefs.wifi, local: TEST_BUILD && !!process.env.BENTO_HOST }); else await host?.stop();
  return hostState();
});
ipcMain.handle('host:pair', () => { if (!host?.isOn()) throw new Error('Turn on “Use Bento on your phone and iPad” first.'); host.newPairing(); return hostState(); });
ipcMain.handle('host:forget', (_e, id) => { host?.forget(str(id, 40)); return hostState(); });
// what this Mac is called, for people ("My Mac"), then start if it was on when Bento last quit
app.whenReady().then(async () => {
  if (MAC) { const r = await runQuiet('/usr/sbin/scutil', ['--get', 'ComputerName'], 3000); if (r.ok && r.out.trim()) macName = r.out.trim().slice(0, 60); }
  const saved = await readJson(HOST_FILE, {}); hostPrefs = { on: saved?.on === true, wifi: saved?.wifi === true };
  // tests (test builds only): on, and only on this Mac itself, never your real Tailscale or Wi-Fi
  const testHost = TEST_BUILD && !!process.env.BENTO_HOST; if (testHost) hostPrefs = { on: true, wifi: false };
  if (hostPrefs.on) hostNow().start({ wifi: hostPrefs.wifi, local: testHost }).catch((e) => logger.log('host start failed', e));
});
app.on('will-quit', () => { host?.stop(); });
