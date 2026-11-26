// Bento — Electron main process.
// Talks to the user's own Claude Code / Codex CLIs (their subscription), GitHub via `gh`,
// and local folders. The renderer never touches the shell directly.
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  shell,
  nativeTheme,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const { safeFetch } = require('./netfetch.cjs');
const updater = require('./updater.cjs');
const menu = require('./menu.cjs');
const winstate = require('./winstate.cjs');
const logger = require('./log.cjs');
const snapshots = require('./snapshots.cjs');
const { writeSafe, writeSafeAsync } = require('./safewrite.cjs'); // a new copy, then swapped in: never half a file

// development only: a shipped copy never loads its page from a local server, whatever the environment says
const DEV = !!process.env.BENTO_DEV && !app.isPackaged;
// Test builds (`npm run app`, CI) are packaged with "bentoTestBuild": true; releases never are (the release check
// refuses one). Only they, or a copy run from source, listen to the switches that swap in pretend AIs or fake answers.
const TEST_BUILD = !app.isPackaged || require('../package.json').bentoTestBuild === true;
// Bento's own page: app://bento in the app, the Vite server in development. Nothing else may use Bento's powers.
const isAppUrl = (url) => {
  try {
    const u = new URL(String(url));
    return DEV ? u.origin === 'http://localhost:5199' : u.protocol === 'app:' && u.host === 'bento';
  } catch {
    return false;
  }
};
// Lesson pages (play://) and any website can never reach the main process; check every call anyway, in case one tries.
// Each handler is also noted by name: a paired phone or iPad (host.cjs) calls the same ones, from a short list.
const RAW = { handle: new Map(), on: new Map() };
let host = null; // Bento for your phone and iPad, when it's on (see the end of this file)
for (const kind of ['handle', 'on']) {
  const add = ipcMain[kind].bind(ipcMain);
  ipcMain[kind] = (channel, fn) => {
    RAW[kind].set(channel, fn);
    return add(channel, (e, ...args) => {
      if (isAppUrl(e.senderFrame?.url)) return fn(e, ...args);
      if (kind === 'on') {
        e.returnValue = null;
        return undefined;
      }
      return Promise.reject(new Error('Not allowed.'));
    });
  };
}
// Links leave Bento only for the web (https; an http link opens as https) or email, never file:, smb:, javascript: or
// app-launching schemes. Anything else is dropped.
function openOutside(url) {
  let u;
  try {
    u = new URL(String(url).slice(0, 4000));
  } catch {
    return false;
  }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (!['https:', 'mailto:'].includes(u.protocol) || (u.protocol === 'https:' && !u.hostname))
    return false;
  shell.openExternal(u.href).catch(() => {});
  return true;
}
// Every call from the page is checked: the right types, sensible sizes. Anything else is refused in plain words.
class BadInput extends Error {}
const refuse = () => {
  throw new BadInput('Bento couldn’t do that: the request didn’t look right.');
};
const str = (v, max = 2000) => (typeof v === 'string' && v.length <= max ? v : refuse());
const optStr = (v, max) => (v == null || v === '' ? '' : str(v, max));
const strList = (v, n, max) =>
  Array.isArray(v) && v.length <= n ? v.map((x) => str(x, max)) : refuse();
const sizeOf = (v) => {
  try {
    return JSON.stringify(v)?.length || 0;
  } catch {
    return Infinity;
  }
};
// A separate profile (fresh lessons, projects and settings), handy for demos, screenshots and tests.
if (process.env.BENTO_USERDATA) app.setPath('userData', process.env.BENTO_USERDATA);
// `Bento --mcp`: started by your AI agent (Claude Code, Codex…) as its tool server. No window, no Dock icon, none of
// the app below: it passes the agent's tool calls to the Bento you have open (agent.cjs). Its own scratch data goes in
// a folder of its own, so it never touches the open Bento's.
if (process.argv.includes('--mcp')) {
  const agent = require('./agent.cjs');
  const sock = agent.socketPath(app.getPath('userData'));
  app.setPath('userData', path.join(app.getPath('userData'), 'agent-bridge'));
  if (process.platform === 'darwin') {
    try {
      app.setActivationPolicy('prohibited');
    } catch {}
    app.dock?.hide();
  }
  // a shipped copy starts Bento if it isn't open (tests and development never start one on their own)
  const bundle =
    process.platform === 'darwin' && app.isPackaged && !process.env.BENTO_USERDATA
      ? path.resolve(process.execPath, '../../..')
      : null; // (never for a test or demo profile)
  const launch = () => {
    if (!bundle || !/\.app$/.test(bundle)) return false;
    try {
      spawn('/usr/bin/open', ['-g', bundle], { stdio: 'ignore', detached: true }).unref();
      return true;
    } catch {
      return false;
    }
  };
  agent.bridge({ sock, version: app.getVersion(), launch, onEnd: () => app.exit(0) });
  return;
}
const DIST = path.join(__dirname, '..', 'dist');
// errors go to ~/Library/Logs/Bento/main.log (Help → Show Logs); test and demo profiles keep theirs inside the profile
const LOGS = process.env.BENTO_USERDATA
  ? path.join(app.getPath('userData'), 'logs')
  : app.getPath('logs');
logger.init(LOGS);

// The heavy work (downloading, taking apart and searching projects, their history, folder sizes) runs in worker.cjs,
// a thread of its own, so nothing here ever waits on it. Started on first use; if it ever dies, the next call starts it again.
let worker = null;
const jobs = new Map();
let jobSeq = 0;
function work(op, args = [], onProgress) {
  if (!worker) {
    const w = (worker = new Worker(path.join(__dirname, 'worker.cjs')));
    w.on('message', ({ id, ok, v, e, progress }) => {
      const j = jobs.get(id);
      if (!j) return;
      if (progress !== undefined) return j.onProgress?.(progress);
      jobs.delete(id);
      ok ? j.res(v) : j.rej(new Error(e));
    });
    const lost = (why) => {
      if (worker !== w) return;
      worker = null;
      logger.log('worker stopped', why);
      for (const j of jobs.values())
        j.rej(new Error('Bento’s project reader stopped unexpectedly. Try again.'));
      jobs.clear();
    };
    w.on('error', lost);
    w.on('exit', (code) => lost(`exit ${code}`));
  }
  return new Promise((res, rej) => {
    const id = ++jobSeq;
    jobs.set(id, { res, rej, onProgress });
    worker.postMessage({ id, op, args });
  });
}
process.on('uncaughtException', (e) => logger.log('uncaught', e));
process.on('unhandledRejection', (e) => logger.log('unhandled rejection', e));

// Apps launched from Finder get a tiny PATH. Add the usual places CLIs live.
const HOME = os.homedir();
const WIN = process.platform === 'win32',
  MAC = process.platform === 'darwin';
const EXTRA_PATH = WIN
  ? [
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(HOME, '.local', 'bin'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI'),
    ]
  : [
      `${HOME}/.local/bin`,
      `${HOME}/.claude/local`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      `${HOME}/.npm-global/bin`,
      `${HOME}/.bun/bin`,
      `${HOME}/Library/pnpm`,
      `${HOME}/.volta/bin`,
      `${HOME}/.asdf/shims`,
      `${HOME}/.cargo/bin`,
      '/usr/bin',
      '/bin',
    ];
const ENV = {
  ...process.env,
  PATH: [...EXTRA_PATH, process.env.PATH || process.env.Path || ''].join(path.delimiter),
};
// That list is a guess: ask your own login shell for the real PATH once (see shellenv.cjs). Calls that start a CLI wait for it.
const envReady = require('./shellenv.cjs')
  .resolvePath(ENV.PATH)
  .then(
    (p) => {
      ENV.PATH = p;
    },
    () => {},
  );
// How to start a program with these arguments: always as an argument list, never through a shell, except on Windows
// for npm-installed CLIs, which are .cmd scripts that only cmd.exe can start. Those get each argument quoted, and
// characters cmd.exe would still act on inside quotes (" % ! ^ and line breaks) are refused rather than passed.
const winArg = (a) => {
  const v = String(a);
  if (/["%!^\r\n]/.test(v)) throw new Error('That can’t be passed to a command safely on Windows.');
  return !v || /[\s&|<>()]/.test(v) ? `"${v}"` : v;
};
async function launch(cmd, args) {
  if (!WIN) return [cmd, args, {}];
  const at = path.isAbsolute(cmd) ? cmd : (await ctx.which(cmd)) || cmd;
  if (/\.(cmd|bat)$/i.test(at))
    return [`"${at}"`, args.map(winArg), { shell: true, windowsHide: true }];
  return [at, args, { windowsHide: true }];
}
const WORKDIR = path.join(app.getPath('temp'), 'bento-work');
const workdirReady = fsp.mkdir(WORKDIR, { recursive: true }).catch(() => {});

// app:// keeps a compiled-code cache like a website would, so from the second launch on V8 skips compiling Bento's code
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
  { scheme: 'play', privileges: { standard: true, secure: true } },
]);

// Lesson code (running in a worker) reaches the web through here, like a script on your Mac would:
// no browser cross-site rules, http(s) only, small answers, a time limit.
async function netProxy(req, u) {
  const target = u.searchParams.get('u') || '';
  const reply = (status, body, type = 'text/plain') =>
    new Response(body, {
      status: 200,
      headers: {
        'x-status': String(status),
        'x-content-type': type,
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  const headers = { 'user-agent': 'Bento (learning app; https://github.com/lhz56/bento-releases)' };
  for (const [k, v] of req.headers)
    if (k.startsWith('x-h-') && !/^x-h-(host|cookie|authorization-proxy)$/.test(k))
      headers[k.slice(4)] = v;
  try {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
    const r = await safeFetch(target, { method: req.method, headers, body });
    return reply(r.status, r.text, r.type);
  } catch (e) {
    return reply(0, e.message);
  }
}

let win;
// Off-screen when asked (BENTO_HIDDEN=1), and whenever a test tool is driving the app (it adds a debugging port),
// so automated checks never pop up over what you're doing. BENTO_SHOW=1 brings the window back for watching a test.
const OFFSCREEN =
  !process.env.BENTO_SHOW &&
  (!!process.env.BENTO_HIDDEN || process.argv.some((a) => a.startsWith('--remote-debugging-port')));
const WIN_FILE = path.join(app.getPath('userData'), 'window.json');
// read while Electron starts up, so the window can open in its old place without waiting on the disk
const savedPlace = OFFSCREEN
  ? Promise.resolve(null)
  : fsp
      .readFile(WIN_FILE, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
// Windows and Linux draw their own window buttons over Bento's top bar: in Bento's colours, light or dark like the page
const overlayColors = () =>
  nativeTheme.shouldUseDarkColors
    ? { color: '#222027', symbolColor: '#cfc8bf' }
    : { color: '#f3eee6', symbolColor: '#4f4841' };
if (!MAC)
  nativeTheme.on('updated', () => {
    try {
      if (win && !win.isDestroyed()) {
        win.setTitleBarOverlay?.({ ...overlayColors(), height: 40 });
        win.setBackgroundColor(overlayColors().color);
      }
    } catch {}
  });
function createWindow(saved) {
  if (OFFSCREEN && process.platform === 'darwin') app.setActivationPolicy?.('accessory');
  const place = OFFSCREEN
    ? { width: 1440, height: 900 }
    : winstate.place(saved, require('electron').screen.getAllDisplays(), {
        width: 1440,
        height: 900,
        minWidth: 1080,
        minHeight: 680,
      });
  win = new BrowserWindow({
    width: place.width,
    height: place.height,
    ...(place.x != null ? { x: place.x, y: place.y } : {}),
    minWidth: 1080,
    minHeight: 680,
    ...(MAC
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 18, y: 18 },
          vibrancy: 'sidebar',
          visualEffectState: 'active',
          backgroundColor: '#00000000',
        }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: { ...overlayColors(), height: 40 },
          backgroundColor: overlayColors().color,
        }),
    show: false,
    // the page gets Bento's narrow bridge (preload.cjs) and nothing else: no Node.js, its own isolated world, Chromium's sandbox
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  });
  // BENTO_HIDDEN=1: tests run the real app off-screen, without a Dock icon or taking focus from what you're doing
  if (OFFSCREEN) {
    win.setPosition(-20000, -20000);
    win.webContents.setBackgroundThrottling(false);
  } else {
    win.once('ready-to-show', () => {
      if (place.maximized) win.maximize();
      win.show();
      setTimeout(offerMove, 1200);
    });
    winstate.track(win, WIN_FILE, writeSafeAsync, writeSafe);
  }
  // if the page ever crashes, bring it straight back (your lessons are on disk); give up after three crashes in a minute
  let crashes = [];
  win.webContents.on('render-process-gone', (_e, d) => {
    logger.log('page gone', d?.reason, d?.exitCode);
    if (d?.reason === 'clean-exit' || win.isDestroyed()) return;
    crashes = [...crashes.filter((t) => Date.now() - t < 60000), Date.now()];
    if (crashes.length <= 3)
      setTimeout(() => {
        if (!win.isDestroyed()) win.reload();
      }, 400);
  });
  win.webContents.on('unresponsive', () => logger.log('page unresponsive'));
  if (DEV) win.loadURL('http://localhost:5199');
  else win.loadURL('app://bento/index.html');
  // each time the page (re)loads, remember the disk copy as it is before the page writes anything (crash recovery compares against it)
  win.webContents.on('did-start-loading', () => {
    ctx.storeReady.then(() => {
      ctx.bootStore = structuredClone(ctx.storeCache);
    });
  });
}

// Opened straight from the downloaded disk image (or Downloads)? Offer to move into Applications, where it can update
// itself. Only real, signed downloads ask, once; "Don't ask again" is remembered.
async function offerMove() {
  if (
    !MAC ||
    !app.isPackaged ||
    OFFSCREEN ||
    process.env.BENTO_USERDATA ||
    app.isInApplicationsFolder()
  )
    return;
  const file = path.join(app.getPath('userData'), 'install.json');
  const pref = await fsp
    .readFile(file, 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));
  if (pref.dontAskMove || !(await updater.isDeveloperSigned(app))) return;
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    message: 'Move Bento to your Applications folder?',
    detail:
      'From Applications, Bento can update itself and is easy to find. Your lessons stay where they are.',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: 'Don’t ask again',
  });
  if (r.checkboxChecked) writeSafeAsync(file, JSON.stringify({ ...pref, dontAskMove: true }));
  if (r.response !== 0) return;
  try {
    app.moveToApplicationsFolder({ conflictHandler: (kind) => kind !== 'existsAndRunning' });
  } catch (e) {
    logger.log('move to Applications failed', e);
    dialog.showMessageBox(win, {
      type: 'warning',
      message: 'Couldn’t move Bento',
      detail: 'Drag Bento into the Applications folder in Finder instead.',
      buttons: ['OK'],
    });
  }
}

// two copies on one profile fight over its storage lock (each launch then stalls ~4 s) and overwrite each other's saves.
// The lock is a file: on a full disk it can't be made, and that mustn't look like "already open" (Bento would quietly
// never start). So Bento only steps aside when the lock is there and names a copy that's still running.
function anotherCopyRunning() {
  if (process.platform === 'win32') return true; // a named lock there, not a file: failing means another copy has it
  try {
    const pid = Number(
      String(fs.readlinkSync(path.join(app.getPath('userData'), 'SingletonLock')))
        .split('-')
        .pop(),
    );
    if (!pid || pid === process.pid) return false;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  } // no lock file (it couldn't be made), or its copy is gone
}
let secondCopy = false; // this copy is quitting because another is open: it must not take over that one's agent socket
if (!app.requestSingleInstanceLock()) {
  if (anotherCopyRunning()) {
    secondCopy = true;
    app.quit();
  } else
    logger.log('opening without the one-copy lock: it couldn’t be created (is the disk full?)');
}
// bento:// links ("Open in Bento" from a browser bookmark): macOS sends open-url, Windows and Linux start a second copy with the link
let pendingLink = null;
const deliverLink = (url) => {
  if (!/^bento:\/\//i.test(String(url || ''))) return;
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    win.webContents.send('deeplink', url);
    if (!OFFSCREEN) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  } else pendingLink = url;
};
if (app.isPackaged && !OFFSCREEN && !process.env.BENTO_USERDATA)
  app.setAsDefaultProtocolClient('bento'); // only the real app claims bento:// (not test, demo or dev runs)
app.on('open-url', (e, url) => {
  e.preventDefault();
  deliverLink(url);
});
app.on('second-instance', (_e, argv) => {
  if (!win || win.isDestroyed()) return;
  if (!OFFSCREEN) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  deliverLink(argv.find((a) => /^bento:\/\//i.test(a)));
});
ipcMain.handle('update:get', () => ({ ...updater.getState(), current: app.getVersion() }));
ipcMain.handle('update:install', async () => {
  if (!(await ctx.okToLeave('restart'))) return false;
  ctx.leaveOk = true;
  return updater.install();
});
ipcMain.handle('update:check', async () => {
  await updater.check();
  return { ...updater.getState(), current: app.getVersion() };
});
ipcMain.handle('update:auto', (_e, on) => updater.setAuto(on === true));
ipcMain.handle('deeplink:pending', () => {
  const u = pendingLink || process.argv.find((a) => /^bento:\/\//i.test(a)) || null;
  pendingLink = null;
  return u;
});

app.whenReady().then(async () => {
  // hidden runs (tests, pre-writing lessons) never pop a notification on your screen
  const ALLOWED = new Set([
    'clipboard-sanitized-write',
    'fullscreen',
    ...(OFFSCREEN ? [] : ['notifications']),
  ]);
  const ses = require('electron').session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, done, details) =>
    done(ALLOWED.has(permission) && isAppUrl(details?.requestingUrl)),
  );
  ses.setPermissionCheckHandler(
    (_wc, permission, origin) => ALLOWED.has(permission) && isAppUrl(origin),
  );
  // play://<id>/ serves a lesson's web page on its own origin, so it can never reach the app.
  protocol.handle('play', (req) => {
    const id = new URL(req.url).hostname;
    const html = ctx.PLAY.get(id);
    if (!html)
      return new Response('Run the code again to see the page.', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      });
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          "default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; connect-src https:",
      },
    });
  });
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    if (u.pathname === '/__net') return netProxy(req, u);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || !p) p = '/index.html';
    const file = path.resolve(DIST, `.${p}`);
    const inside = path.relative(DIST, file);
    if (!inside || inside.startsWith('..') || path.isAbsolute(inside))
      return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  app.setAboutPanelOptions({
    applicationName: 'Bento',
    applicationVersion: app.getVersion(),
    version: '',
    copyright: 'MIT License',
    credits: 'Learn how software is really built, with the AI subscription you already have.',
    website: menu.REPO,
  });
  menu.build({
    dev: DEV,
    logsDir: LOGS,
    send: (a) => {
      if (win && !win.isDestroyed()) win.webContents.send('menu', a);
    },
    checkForUpdates: () => menu.explainUpdates(updater, win),
  });
  createWindow(await savedPlace);
  // today's copy of your lessons and progress (a week is kept; Settings → Restore… opens them)
  const copyToday = () =>
    ctx.storeReady
      .then(() =>
        snapshots.daily(ctx.SNAPS, ctx.storeCache, (f, d) => writeSafeAsync(f, d).then((e) => !e)),
      )
      .catch((e) => logger.log('daily copy failed', e));
  setTimeout(copyToday, 8000);
  setInterval(copyToday, 4 * 3600_000).unref?.(); // and for anyone who leaves Bento open for days
  // updates from GitHub releases (signed copies only; off in tests and development)
  updater.start(app, {
    disabled: OFFSCREEN,
    prefs: path.join(app.getPath('userData'), 'updates.json'),
    writeSafe: writeSafeAsync,
    onState: (st) => {
      if (win && !win.isDestroyed()) win.webContents.send('update:state', st);
    },
  });
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow(
        await fsp
          .readFile(WIN_FILE, 'utf8')
          .then(JSON.parse)
          .catch(() => null),
      );
  });
});
// For every page Bento ever has (the window, lesson pages in their frames): no webviews, no new windows (a link opens in
// your browser instead), and the window itself never navigates or redirects away from Bento, where a website would
// otherwise get Bento's bridge.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  // right-click: the usual Copy, Paste and friends (Electron has no menu of its own), Look Up on a Mac, and a link's address
  wc.on('context-menu', (_e, p) => {
    const { Menu, clipboard } = require('electron');
    const f = p.editFlags || {};
    const sel = String(p.selectionText || '').trim();
    const items = [];
    if (MAC && sel && !p.isEditable)
      items.push(
        {
          label: `Look Up “${sel.length > 24 ? `${sel.slice(0, 24)}…` : sel}”`,
          click: () => wc.showDefinitionForSelection(),
        },
        { type: 'separator' },
      );
    if (p.isEditable)
      items.push(
        { role: 'undo', enabled: f.canUndo },
        { role: 'redo', enabled: f.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: f.canCut },
        { role: 'copy', enabled: f.canCopy },
        { role: 'paste', enabled: f.canPaste },
        { role: 'selectAll', enabled: f.canSelectAll },
      );
    else if (sel) items.push({ role: 'copy' });
    if (/^https?:/i.test(p.linkURL || ''))
      items.push(
        ...(items.length ? [{ type: 'separator' }] : []),
        { label: 'Open Link in Browser', click: () => openOutside(p.linkURL) },
        { label: 'Copy Link', click: () => clipboard.writeText(p.linkURL) },
      );
    if (!items.length) return;
    const owner = BrowserWindow.fromWebContents(wc) || win;
    Menu.buildFromTemplate(items).popup({ window: owner || undefined });
  });
  const stay = (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
      openOutside(url);
    }
  };
  wc.on('will-navigate', stay);
  wc.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
    if (isMainFrame && !isAppUrl(url)) e.preventDefault();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// What the IPC modules (./ipc) share with this file. Getters keep values live: a module always sees the current
// window, the current settings and so on, however late they were set.
const ctx = {
  get BadInput() {
    return BadInput;
  },
  get DIST() {
    return DIST;
  },
  get ENV() {
    return ENV;
  },
  get MAC() {
    return MAC;
  },
  get OFFSCREEN() {
    return OFFSCREEN;
  },
  get RAW() {
    return RAW;
  },
  get TEST_BUILD() {
    return TEST_BUILD;
  },
  get WIN() {
    return WIN;
  },
  get WORKDIR() {
    return WORKDIR;
  },
  get envReady() {
    return envReady;
  },
  get host() {
    return host;
  },
  set host(v) {
    host = v;
  },
  get launch() {
    return launch;
  },
  get netProxy() {
    return netProxy;
  },
  get openOutside() {
    return openOutside;
  },
  get optStr() {
    return optStr;
  },
  get refuse() {
    return refuse;
  },
  get secondCopy() {
    return secondCopy;
  },
  set secondCopy(v) {
    secondCopy = v;
  },
  get sizeOf() {
    return sizeOf;
  },
  get str() {
    return str;
  },
  get strList() {
    return strList;
  },
  get win() {
    return win;
  },
  set win(v) {
    win = v;
  },
  get work() {
    return work;
  },
  get workdirReady() {
    return workdirReady;
  },
  // a module's exports join the context, so later modules (and this file) can use them
  add(exports) {
    Object.defineProperties(this, Object.getOwnPropertyDescriptors(exports || {}));
    return exports || {};
  },
};
ctx.add(require('./ipc/connections.cjs')(ctx));
ctx.add(require('./ipc/plan-limits.cjs')(ctx));
ctx.add(require('./ipc/ask.cjs')(ctx));
ctx.add(require('./ipc/folders.cjs')(ctx));
ctx.add(require('./ipc/github.cjs')(ctx));
ctx.add(require('./ipc/files.cjs')(ctx));
ctx.add(require('./ipc/atlas.cjs')(ctx));
ctx.add(require('./ipc/store.cjs')(ctx));
ctx.add(require('./ipc/search.cjs')(ctx));
ctx.add(require('./ipc/devices.cjs')(ctx));
ctx.add(require('./ipc/agent.cjs')(ctx));
