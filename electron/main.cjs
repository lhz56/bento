// Bento — Electron main process.
// Talks to the user's own Claude Code / Codex CLIs (their subscription), GitHub via `gh`,
// and local folders. The renderer never touches the shell directly.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { SYSTEM, QUICK_SYSTEM, ATLAS_SYSTEM, SITE_SYSTEM } = require('./prompts.cjs');
const atlas = require('./atlas.cjs');

const DEV = !!process.env.BENTO_DEV;
// A separate profile (fresh lessons, projects and settings), handy for demos, screenshots and tests.
if (process.env.BENTO_USERDATA) app.setPath('userData', process.env.BENTO_USERDATA);
const DIST = path.join(__dirname, '..', 'dist');

// Apps launched from Finder get a tiny PATH. Add the usual places CLIs live.
const HOME = os.homedir();
const EXTRA_PATH = [`${HOME}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', `${HOME}/.npm-global/bin`, `${HOME}/.bun/bin`, '/usr/bin', '/bin'];
const ENV = { ...process.env, PATH: [...EXTRA_PATH, process.env.PATH || ''].join(':') };
const WORKDIR = path.join(app.getPath('temp'), 'bento-work');
fs.mkdirSync(WORKDIR, { recursive: true });

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }, { scheme: 'play', privileges: { standard: true, secure: true } }]);

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 680,
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar', visualEffectState: 'active', backgroundColor: '#00000000',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  if (DEV) win.loadURL('http://localhost:5199');
  else win.loadURL('app://bento/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // each time the page (re)loads, remember the disk copy as it is before the page writes anything (crash recovery compares against it)
  win.webContents.on('did-start-loading', () => { try { bootStore = JSON.parse(JSON.stringify(readStore())); } catch {} });
}

// two copies on one profile fight over its storage lock (each launch then stalls ~4 s) and overwrite each other's saves
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); });

app.whenReady().then(() => {
  // play://<id>/ serves a lesson's web page on its own origin, so it can never reach the app.
  protocol.handle('play', (req) => {
    const id = new URL(req.url).hostname;
    const html = PLAY.get(id);
    if (!html) return new Response('Run the code again to see the page.', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; connect-src https:" } });
  });
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || !p) p = '/index.html';
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST)) return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------------------------------------------------------------- providers
// BENTO_PRETEND_MISSING=claude,codex,gh hides CLIs, to test what a brand-new user sees.
const HIDDEN = new Set(String(process.env.BENTO_PRETEND_MISSING || '').split(',').filter(Boolean));
function which(cmd) {
  if (HIDDEN.has(cmd)) return Promise.resolve(null);
  return new Promise((res) => execFile('/usr/bin/which', [cmd], { env: ENV }, (e, out) => res(e ? null : out.trim())));
}
// Onboarding: find what the person already has. Nothing is installed or signed in for them.
function runQuiet(cmd, args, timeout = 8000) {
  return new Promise((res) => execFile(cmd, args, { env: ENV, timeout }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || '') })));
}
ipcMain.handle('scan', async () => {
  const [cp, xp, gp] = await Promise.all([which('claude'), which('codex'), which('gh')]);
  const r = { claude: { installed: !!cp }, codex: { installed: !!xp }, gh: { installed: !!gp } };
  await Promise.all([
    cp && (async () => {
      const v = await runQuiet('claude', ['--version']); r.claude.version = v.out.trim().split(' ')[0];
      const a = await runQuiet('claude', ['auth', 'status']);
      try { const j = JSON.parse(a.out); r.claude.loggedIn = !!j.loggedIn; r.claude.plan = j.subscriptionType || null; r.claude.method = j.authMethod; } catch { r.claude.loggedIn = a.ok; }
    })(),
    xp && (async () => {
      const v = await runQuiet('codex', ['--version']); r.codex.version = v.out.trim().split(' ').pop();
      const a = await runQuiet('codex', ['login', 'status']); const t = (a.out + a.err).trim();
      r.codex.loggedIn = a.ok && /logged in/i.test(t); r.codex.method = /chatgpt/i.test(t) ? 'ChatGPT' : /api key/i.test(t) ? 'API key' : null;
    })(),
    gp && (async () => {
      const a = await runQuiet('gh', ['api', 'user', '--jq', '.login']); r.gh.loggedIn = a.ok && !!a.out.trim(); r.gh.user = a.out.trim() || null;
    })(),
  ].filter(Boolean));
  return r;
});
ipcMain.handle('providers', async () => {
  const [claude, codex, gh] = await Promise.all([which('claude'), which('codex'), which('gh')]);
  return { claude: !!claude, codex: !!codex, gh: !!gh && !process.env.BENTO_NO_GH, dark: nativeTheme.shouldUseDarkColors };
});

// model ids look like "claude:sonnet" / "claude:haiku" / "codex:default"
function buildCommand(model, system, prompt) {
  let [prov, name] = (model || 'claude:sonnet').split(':');
  if (!/^(claude|codex)$/.test(prov)) prov = 'claude';
  if (name && !/^[\w.-]{1,40}$/.test(name)) name = prov === 'codex' ? 'default' : 'sonnet'; // never let odd text reach the command line
  if (prov === 'codex') {
    const args = ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-c', 'model_reasoning_effort=low'];
    if (name && name !== 'default') args.push('-m', name);
    args.push(`${system}\n\n---\n\n${prompt}\n\n(Do not run any commands. Answer directly in the required format.)`);
    return { cmd: 'codex', args, kind: 'codex' };
  }
  return {
    cmd: 'claude', kind: 'claude',
    args: ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', name || 'sonnet', ...(name === 'haiku' ? ['--effort', 'low'] : []),
      '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence', '--system-prompt', system],
  };
}

// Turn CLI errors into something a learner can act on.
function humanize(cmd, msg) {
  const who = cmd === 'codex' ? 'Codex (ChatGPT)' : 'Claude';
  if (/usage limit|rate.?limit|quota|too many requests|429|limit reached|exceeded/i.test(msg)) return `${who} says you’ve hit your plan’s usage limit for now. Try again later, or switch to your other AI in the bottom-left.`;
  if (/not logged in|please run \/login|login required|unauthori[sz]ed|401|invalid api key|authentication/i.test(msg)) return `${who} isn’t signed in on this Mac. Open Terminal and run \`${cmd === 'codex' ? 'codex login' : 'claude'}\` to sign in, then try again.`;
  if (/ENOENT|not found|command not found/i.test(msg)) return `${who} isn’t installed. Open Settings → Connections to see how to install it.`;
  if (/network|ENOTFOUND|ECONNRESET|ETIMEDOUT|getaddrinfo/i.test(msg)) return `Couldn’t reach ${who}. Check your internet connection and try again.`;
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg;
}

// The learner's language for explanations (code stays in English so it runs everywhere).
let VOICE = '';
ipcMain.on('prefs', (_e, p) => { VOICE = typeof p?.voice === 'string' && /^[\p{L}\p{M} ()-]{2,30}$/u.test(p.voice) ? p.voice : ''; });
const withVoice = (system) => (VOICE && VOICE !== 'English' ? `${system}\n\nLANGUAGE: Write every human-readable string (titles, paragraphs, pseudocode, notes, labels, quiz, hints, terms, answers) in ${VOICE}. Keep code, identifiers, file paths and JSON keys exactly as they are, in English. Technical terms may keep their common English name with the ${VOICE} word next to it.` : system);

// Streams text deltas to onText. Returns {promise, kill}.
// BENTO_FAKE_LIMIT=claude makes that CLI answer "usage limit" (to test automatic routing to your other AI).
const FAKE_LIMIT = String(process.env.BENTO_FAKE_LIMIT || '');
function runModel(model, system, prompt, onText, onThink) {
  const { cmd, args, kind } = buildCommand(model, withVoice(system), prompt);
  if (FAKE_LIMIT && kind === FAKE_LIMIT) return { promise: Promise.reject(new Error(humanize(cmd, 'Claude AI usage limit reached'))), kill: () => {} };
  const child = spawn(cmd, args, { cwd: WORKDIR, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }); // no stdin: codex waits on an open pipe
  let buf = '', full = '', err = '';
  let last = Date.now(); let stalled = false;
  const quietLimit = kind === 'codex' ? 360000 : 150000; // Codex says nothing until it's done; Claude streams constantly
  const dog = setInterval(() => { if (Date.now() - last > quietLimit) { stalled = true; clearInterval(dog); try { child.kill('SIGTERM'); } catch {} } }, 5000);
  const promise = new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      last = Date.now();
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (kind === 'claude') {
          if (o.type === 'stream_event' && o.event?.delta?.type === 'thinking_delta') onThink?.(o.event.delta.thinking || '', o.event.delta.estimated_tokens || 0);
          if (o.type === 'stream_event' && o.event?.type === 'content_block_delta' && o.event.delta?.type === 'text_delta') {
            full += o.event.delta.text; onText?.(o.event.delta.text);
          } else if (o.type === 'result') {
            if (o.is_error) err = String(o.result || 'model error');
            else if (!full && o.result) { full = o.result; onText?.(o.result); }
          }
        } else {
          if (o.type === 'item.completed' && o.item?.type === 'agent_message') { full += o.item.text; onText?.(o.item.text); }
          if (o.type === 'item.completed' && o.item?.type === 'reasoning' && o.item.text) onThink?.(o.item.text + '\n');
          if (o.type === 'error' || o.type === 'turn.failed') err = JSON.stringify(o.error || o);
        }
      }
    });
    child.stderr.on('data', (d) => { last = Date.now(); err += d.toString(); });
    child.on('error', (e) => reject(new Error(humanize(cmd, `Couldn't start ${cmd}: ${e.message}`))));
    child.on('close', (code) => {
      clearInterval(dog);
      if (stalled && !full) return reject(new Error(`${cmd === 'codex' ? 'Codex' : 'Claude'} went quiet for too long, so Bento stopped waiting. Try again, or switch model.`));
      if (full) resolve(full);
      else reject(new Error(humanize(cmd, err.trim().split('\n').slice(-3).join(' ') || `${cmd} exited with ${code}`)));
    });
  });
  return { promise, kill: () => { try { child.kill('SIGTERM'); } catch {} } };
}

const running = new Map();
ipcMain.on('ask:start', (e, id, { model, prompt, system }) => {
  const wc = e.sender;
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
ipcMain.on('ask:cancel', (_e, id) => { running.get(id)?.kill(); running.delete(id); });
// quitting mid-lesson shouldn't leave AI processes running in the background
app.on('will-quit', () => { for (const r of running.values()) r.kill(); running.clear(); });

// small one-shot calls (token cards, pseudocode refresh, translations)
ipcMain.handle('quick', async (_e, { model, prompt }) => {
  // quick calls use the fast model of the same provider
  const fast = (model || '').startsWith('codex') ? model : 'claude:haiku';
  try { return await runModel(fast, QUICK_SYSTEM, prompt).promise; }
  catch (err) {
    // this AI can't answer right now (limit, signed out, missing): quietly try your other one
    if (!/usage limit|isn’t signed in|isn’t installed/.test(err.message)) throw err;
    const other = fast.startsWith('codex') ? 'claude:haiku' : 'codex:default';
    try { return await runModel(other, QUICK_SYSTEM, prompt).promise; } catch { throw err; }
  }
});

// ---------------------------------------------------------------- local folders
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', '.DS_Store', 'Pods', '.turbo', 'coverage', 'target']);
const CODE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|html|css|scss|json|md|sql|sh|vue|svelte|toml|yaml|yml)$/i;
function walk(root, rel = '', out = [], depth = 0) {
  if (out.length > 600 || depth > 6) return out;
  let ents = []; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const d of ents) {
    if (SKIP.has(d.name) || d.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) walk(root, r, out, depth + 1);
    else if (CODE_EXT.test(d.name)) out.push(r);
  }
  return out;
}
const roots = new Set();
ipcMain.handle('folder:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const root = r.filePaths[0]; roots.add(root);
  return { kind: 'local', root, name: path.basename(root), files: walk(root) };
});
// Something dragged onto the window: a folder becomes a project, a code file becomes a lesson.
ipcMain.handle('drop:open', async (_e, p) => {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !fs.existsSync(p)) throw new Error('Couldn’t read that.');
  const st = fs.statSync(p);
  if (st.isDirectory()) { roots.add(p); return { kind: 'local', root: p, name: path.basename(p) }; }
  if (/\.bento$/i.test(p)) {
    if (st.size > 2_000_000) throw new Error('That lesson file is too big.');
    let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { throw new Error('That .bento file is damaged.'); }
    if (j?.bento !== 1 || !j.lesson?.title) throw new Error('That isn’t a Bento lesson.');
    return { kind: 'lesson', lesson: j.lesson };
  }
  if (st.size > 200_000) throw new Error('That file is too big to explain in one go.');
  if (!CODE_EXT.test(p)) throw new Error('Drop a code file (like .py or .js) or a project folder.');
  return { kind: 'file', name: path.basename(p), text: fs.readFileSync(p, 'utf8') };
});
ipcMain.handle('folder:read', async (_e, root, rel) => {
  if (!roots.has(root)) throw new Error('folder not opened');
  const f = path.join(root, rel);
  if (!f.startsWith(root)) throw new Error('bad path');
  const st = fs.statSync(f); if (st.size > 300_000) return '// (file too large to show)';
  return fs.readFileSync(f, 'utf8');
});

// ---------------------------------------------------------------- GitHub via gh
function gh(args) {
  return new Promise((res, rej) => execFile('gh', args, { env: ENV, maxBuffer: 20 * 1024 * 1024 }, (e, out, se) => e ? rej(new Error((se || e.message).trim())) : res(out)));
}
ipcMain.handle('gh:me', async () => {
  try { const u = JSON.parse(await gh(['api', 'user'])); return { login: u.login, name: u.name, avatar: u.avatar_url }; } catch { return null; }
});
ipcMain.handle('gh:repos', async () => JSON.parse(await gh(['repo', 'list', '--limit', '40', '--json', 'name,nameWithOwner,primaryLanguage,description,updatedAt,isPrivate'])));
ipcMain.handle('gh:tree', async (_e, full) => {
  const t = JSON.parse(await gh(['api', `repos/${full}/git/trees/HEAD?recursive=1`]));
  const files = (t.tree || []).filter((x) => x.type === 'blob' && CODE_EXT.test(x.path) && !x.path.split('/').some((s) => SKIP.has(s))).map((x) => x.path).slice(0, 600);
  return { kind: 'github', root: full, name: full, files };
});
ipcMain.handle('gh:file', async (_e, full, p) => {
  const o = JSON.parse(await gh(['api', `repos/${full}/contents/${encodeURI(p)}`]));
  if (o.size > 300_000) return '// (file too large to show)';
  return Buffer.from(o.content || '', 'base64').toString('utf8');
});
// lesson web pages: keep the last few, each with a tiny script that reports console output to Bento
const PLAY = new Map();
const PLAY_SHIM = `<script>(function(){var send=function(k,a){try{parent.postMessage({bentoPlay:1,k:k,s:Array.prototype.map.call(a,function(x){try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ')},'*')}catch(e){}};['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});window.addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});var last=null;document.addEventListener('mouseover',function(e){var el=e.target.closest&&e.target.closest('[data-bl]');if(el===last)return;if(last)last.style.outline=last.__o||'';last=el;if(el){el.__o=el.style.outline;el.style.outline='2px solid rgba(124,92,255,.7)';try{parent.postMessage({bentoPlay:1,k:'hover',line:+el.getAttribute('data-bl')},'*')}catch(x){}}},true);document.addEventListener('mouseleave',function(){if(last){last.style.outline=last.__o||'';last=null}try{parent.postMessage({bentoPlay:1,k:'hover',line:0},'*')}catch(x){}});})();<\/script>`;
ipcMain.handle('play:put', (_e, html, key) => {
  // one stable origin per lesson, so the page's localStorage survives re-runs ("remember my tasks")
  const id = key && /^[a-z0-9-]{3,40}$/i.test(key) ? `l-${key.toLowerCase()}` : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const doc = String(html || '').slice(0, 400000);
  PLAY.set(id, /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => m + PLAY_SHIM) : PLAY_SHIM + doc);
  while (PLAY.size > 20) PLAY.delete(PLAY.keys().next().value);
  return id;
});
ipcMain.handle('lesson:export', async (_e, lesson) => {
  const safe = String(lesson?.title || 'lesson').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'lesson';
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), `${safe}.bento`), filters: [{ name: 'Bento lesson', extensions: ['bento'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify({ bento: 1, exported: new Date().toISOString(), lesson }, null, 1));
  return r.filePath;
});
// Save a lesson's web page as a real file you can open in any browser (or send to a friend).
ipcMain.handle('web:save', async (_e, html, title) => {
  const dir = path.join(app.getPath('desktop'), 'Bento pages'); fs.mkdirSync(dir, { recursive: true });
  const base = String(title || 'my page').replace(/[^\w\- ]+/g, '').trim().slice(0, 50) || 'my page';
  let file = path.join(dir, `${base}.html`); let n = 2;
  while (fs.existsSync(file)) file = path.join(dir, `${base} ${n++}.html`);
  fs.writeFileSync(file, String(html || ''));
  shell.showItemInFolder(file);
  return file;
});
// How much space downloaded repos take, and a way to clear them (the Atlas notes stay cached).
const dirSize = (d) => { let n = 0; const walk = (p) => { let es = []; try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; } for (const e of es) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else { try { n += fs.lstatSync(q).size; } catch {} } } }; walk(d); return n; };
ipcMain.handle('repos:usage', () => { let n = 0, count = 0; try { for (const e of fs.readdirSync(REPOS)) { n += dirSize(path.join(REPOS, e)); count++; } } catch {} return { bytes: n, count }; });
ipcMain.handle('repos:clear', () => { try { fs.rmSync(REPOS, { recursive: true, force: true }); fs.mkdirSync(REPOS, { recursive: true }); } catch {} return true; });
ipcMain.handle('open:data', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('open:external', (_e, url) => /^https:\/\//.test(url) && shell.openExternal(url));

// ---------------------------------------------------------------- Atlas: bring a repo in and take it apart
const REPOS = path.join(app.getPath('userData'), 'repos');
const CACHE = path.join(app.getPath('userData'), 'atlas');
fs.mkdirSync(CACHE, { recursive: true });
const ghOk = (() => { let v = null; return async () => (v ??= !process.env.BENTO_NO_GH && !!(await which('gh')) && await gh(['auth', 'status']).then(() => true, () => false)); })();
const REPO_RX = /^[\w.-]+\/[\w.-]+$/;

ipcMain.handle('atlas:fetch', async (e, full) => {
  if (!REPO_RX.test(full)) throw new Error('That doesn’t look like owner/name.');
  const wc = e.sender;
  const dir = await atlas.fetchRepo({ full, base: REPOS, env: ENV, hasGh: await ghOk(), onProgress: (p) => !wc.isDestroyed() && wc.send('atlas:progress', full, p) });
  roots.add(dir);
  return { kind: 'github', root: dir, name: full, full };
});
ipcMain.handle('atlas:refresh', async (e, full) => {
  if (!REPO_RX.test(full)) throw new Error('bad repo');
  fs.rmSync(path.join(REPOS, full.replace('/', '__')), { recursive: true, force: true });
  fs.rmSync(path.join(CACHE, `${full.replace('/', '__')}.json`), { force: true });
  return true;
});
ipcMain.handle('atlas:analyze', async (_e, root, name) => {
  if (!roots.has(root)) throw new Error('not opened');
  return atlas.analyze(root, { name });
});
ipcMain.handle('atlas:meta', async (_e, full) => {
  if (!REPO_RX.test(full)) return null;
  const pick = (r) => ({ full: r.full_name, description: r.description, stars: r.stargazers_count, forks: r.forks_count, license: r.license?.spdx_id, topics: r.topics || [], avatar: r.owner?.avatar_url, owner: r.owner?.login, url: r.html_url, homepage: r.homepage, pushed: r.pushed_at, created: r.created_at, language: r.language, size: r.size, fork: r.fork, parent: r.parent?.full_name, isPrivate: r.private });
  try { if (await ghOk()) return pick(JSON.parse(await gh(['api', `repos/${full}`]))); } catch {}
  try { const r = await net.fetch(`https://api.github.com/repos/${full}`, { headers: { 'User-Agent': 'bento-app' } }); if (r.ok) return pick(await r.json()); } catch {}
  return null;
});
const cacheFile = (key) => path.join(CACHE, `${String(key).replace(/[^\w.-]+/g, '__')}.json`);
ipcMain.handle('atlas:cache:get', async (_e, key) => { try { return JSON.parse(fs.readFileSync(cacheFile(key), 'utf8')); } catch { return null; } });
ipcMain.handle('atlas:cache:put', async (_e, key, v) => { try { fs.writeFileSync(cacheFile(key), JSON.stringify(v)); return true; } catch { return false; } });
ipcMain.handle('atlas:list', async () => {
  const out = [];
  for (const f of fs.readdirSync(CACHE).filter((x) => x.endsWith('.json'))) {
    try {
      const st = fs.statSync(path.join(CACHE, f)); const j = JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
      if (!j?.src) continue;
      const lang = Object.entries(j.facts?.langs || {}).sort((a, b) => b[1] - a[1]).find(([l]) => !['HTML', 'CSS', 'Shell'].includes(l))?.[0];
      out.push({ key: j.src.kind === 'github' ? j.src.full : `local:${j.src.root}`, name: j.name, kind: j.src.kind, full: j.src.full, root: j.src.root, lang, at: j.at || st.mtimeMs });
    } catch {}
  }
  return out.sort((a, b) => b.at - a.at);
});
ipcMain.handle('atlas:reopen', async (_e, root) => { if (typeof root === 'string' && path.isAbsolute(root) && fs.existsSync(root)) { roots.add(root); return true; } return false; });

// A plain JSON mirror of what the renderer keeps in localStorage, so a crash never loses lessons.
const STORE = path.join(app.getPath('userData'), 'bento-store.json');
let storeCache = null; let storeTimer = null;
let bootStore = null; // the disk copy as it was at launch, before this session wrote anything
const readStore = () => { if (storeCache) return storeCache; try { const raw = fs.readFileSync(STORE, 'utf8'); storeCache = JSON.parse(raw); bootStore = JSON.parse(raw); } catch { storeCache = {}; bootStore = {}; } return storeCache; };
ipcMain.handle('store:get', () => { readStore(); return bootStore; });
ipcMain.handle('store:set', (_e, key, value) => {
  readStore()[key] = value;
  clearTimeout(storeTimer);
  storeTimer = setTimeout(() => { try { fs.writeFileSync(`${STORE}.tmp`, JSON.stringify(storeCache)); fs.renameSync(`${STORE}.tmp`, STORE); } catch {} }, 500);
  return true;
});
app.on('before-quit', () => { if (storeTimer) { clearTimeout(storeTimer); try { fs.writeFileSync(STORE, JSON.stringify(storeCache)); } catch {} } });

ipcMain.handle('gh:search', async (_e, q, opts = {}) => {
  const fields = 'fullName,description,stargazersCount,language,size,owner,updatedAt';
  if (await ghOk()) {
    const args = ['search', 'repos', ...String(q).split(/\s+/).filter(Boolean), '--limit', String(opts.limit || 24), '--json', fields, '--sort', opts.sort || 'stars'];
    if (opts.language) args.push('--language', opts.language);
    if (opts.stars) args.push('--stars', opts.stars);
    if (opts.size) args.push('--size', opts.size);
    const rows = JSON.parse(await gh(args));
    return rows.map((r) => ({ full: r.fullName, description: r.description, stars: r.stargazersCount, language: r.language, size: r.size, owner: r.owner?.login, updated: r.updatedAt }));
  }
  const r = await net.fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q + (opts.language ? ` language:${opts.language}` : ''))}&sort=stars&per_page=${opts.limit || 24}`, { headers: { 'User-Agent': 'bento-app' } });
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub search limit reached. Sign in with gh auth login for more.' : `GitHub search failed (${r.status})`);
  const j = await r.json();
  return (j.items || []).map((x) => ({ full: x.full_name, description: x.description, stars: x.stargazers_count, language: x.language, size: x.size, owner: x.owner?.login, updated: x.updated_at }));
});
// Real code in the wild: GitHub code search (needs gh signed in). One result per repo, short snippets.
ipcMain.handle('gh:code', async (_e, q, language) => {
  if (!(await ghOk())) throw new Error('Sign in to GitHub (gh auth login) to search real code.');
  const args = ['search', 'code', q, '--limit', '30', '--json', 'repository,path,textMatches,url'];
  if (language) args.push('--language', language);
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
ipcMain.handle('site:inspect', async (_e, url) => {
  let u; try { u = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`); } catch { throw new Error('That doesn’t look like a web address.'); }
  if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|0\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|::|.*\.local$|.*\.internal$)/i.test(u.hostname)) throw new Error('Only public websites, please.');
  const t0 = Date.now();
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
  let r; try { r = await net.fetch(u.toString(), { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', Accept: 'text/html' } }); }
  catch (e) { throw new Error(`Couldn’t reach ${u.hostname}: ${e.message}`); } finally { clearTimeout(timer); }
  const ms = Date.now() - t0;
  const html = (await r.text()).slice(0, 600000);
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
  if (!REPO_RX.test(full)) throw new Error('bad repo');
  if (!(await ghOk())) throw new Error('Sign in to GitHub first: run gh auth login in Terminal.');
  const out = await gh(['repo', 'fork', full, '--clone=false']).catch((e) => e.message);
  const me = JSON.parse(await gh(['api', 'user'])).login;
  return { url: `https://github.com/${me}/${full.split('/')[1]}`, note: String(out).trim() };
});
