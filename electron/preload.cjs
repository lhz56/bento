const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Every call to the main process. Its errors arrive as "Error invoking remote method 'x': Error: what happened": the page
// only ever gets the plain part, the sentence written for people.
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch((e) => { throw new Error(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')); });

const listeners = new Map();
ipcRenderer.on('ask:chunk', (_e, id, t) => listeners.get(id)?.chunk?.(t));
ipcRenderer.on('ask:think', (_e, id, t) => listeners.get(id)?.think?.(t));
ipcRenderer.on('ask:done', (_e, id) => { listeners.get(id)?.done?.(); listeners.delete(id); });
ipcRenderer.on('ask:error', (_e, id, m) => { listeners.get(id)?.error?.(m); listeners.delete(id); });

contextBridge.exposeInMainWorld('bento', {
  providers: () => call('providers'),
  scan: () => call('scan'),
  openTerminal: () => call('open:terminal'),
  // install, sign in to or update an AI in Terminal, where the person sees what runs (only commands Bento knows)
  aiTerminal: (id, action, tools) => call('ai:terminal', String(id), String(action), { brew: !!tools?.brew, npm: !!tools?.npm, brewInstalled: !!tools?.brewInstalled }),
  exportLesson: (l) => call('lesson:export', l),
  saveWeb: (html, title) => call('web:save', html, title),
  publishWeb: (html, title) => call('web:publish', html, title),
  playPut: (html, key) => call('play:put', html, key),
  setPrefs: (p) => ipcRenderer.send('prefs', p),
  // a file or folder dropped on the window: its path comes from the dropped file itself, never from the page
  dropOpen: (file) => { let p = ''; try { p = webUtils.getPathForFile(file); } catch {} return p ? call('drop:open', p) : Promise.reject(new Error('Couldn’t read that. Drop a file from Finder.')); },
  // saving starts or stops failing (a full disk, a folder Bento may no longer write to)
  onStoreHealth(fn) { const h = (_e, x) => fn(x); ipcRenderer.on('store:health', h); return () => ipcRenderer.removeListener('store:health', h); },
  storeGet: () => call('store:get'),
  // your phone or iPad changed your lessons, progress, settings or projects: the page shows the same
  onStoreChanged(fn) { const h = (_e, k, v) => fn(k, v); ipcRenderer.on('store:changed', h); return () => ipcRenderer.removeListener('store:changed', h); },
  // Settings → Your phone and iPad: serve Bento to devices you pair (host.cjs)
  host: { get: () => call('host:get'), set: (p) => call('host:set', { on: !!p?.on, wifi: !!p?.wifi }), pair: () => call('host:pair'), forget: (id) => call('host:forget', String(id)), on(fn) { const h = (_e, st) => fn(st); ipcRenderer.on('host:state', h); return () => ipcRenderer.removeListener('host:state', h); } },
  backupSave: () => call('backup:save'),
  usage: () => call('usage:get'),
  // how much of each plan is used: the last reading, or a fresh one (free) with { refresh: true }
  limits: { get: (o) => call('limits:get', { refresh: !!o?.refresh }), on(fn) { const h = (_e, x) => fn(x); ipcRenderer.on('limits', h); return () => ipcRenderer.removeListener('limits', h); } },
  clearSavedAnswers: () => call('usage:clearSaved'),
  pendingLink: () => call('deeplink:pending'),
  update: { get: () => call('update:get'), install: () => call('update:install'), check: () => call('update:check'), setAuto: (on) => call('update:auto', on), on(fn) { const h = (_e, st) => fn(st); ipcRenderer.on('update:state', h); return () => ipcRenderer.removeListener('update:state', h); } },
  onMenu(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('menu', h); return () => ipcRenderer.removeListener('menu', h); },
  onDeepLink(fn) { const h = (_e, u) => fn(u); ipcRenderer.on('deeplink', h); return () => ipcRenderer.removeListener('deeplink', h); },
  backupLoad: () => call('backup:load'),
  storeSet: (k, v) => call('store:set', k, v),
  ask(model, prompt, { chunk, done, error, think }, system) {
    const id = Math.random().toString(36).slice(2);
    listeners.set(id, { chunk, done, error, think });
    ipcRenderer.send('ask:start', id, { model, prompt, system });
    return () => { listeners.delete(id); ipcRenderer.send('ask:cancel', id); };
  },
  quick: (model, prompt) => call('quick', { model, prompt }),
  openFolder: () => call('folder:open'),
  readFile: (root, rel) => call('folder:read', root, rel),
  ghMe: () => call('gh:me'),
  ghRepos: () => call('gh:repos'),
  ghTree: (full) => call('gh:tree', full),
  ghFile: (full, p) => call('gh:file', full, p),
  openData: () => call('open:data'),
  reposUsage: () => call('repos:usage'),
  reposClear: () => call('repos:clear'),
  openExternal: (url) => call('open:external', url),
  atlasFetch: (full) => call('atlas:fetch', full),
  atlasHistory: (full) => call('atlas:history', full),
  ghIssues: (full) => call('gh:issues', full),
  atlasRefresh: (full) => call('atlas:refresh', full),
  atlasAnalyze: (root, name) => call('atlas:analyze', root, name),
  atlasMeta: (full) => call('atlas:meta', full),
  atlasList: () => call('atlas:list'),
  atlasReopen: (root) => call('atlas:reopen', root),
  cacheGet: (k) => call('atlas:cache:get', k),
  cachePut: (k, v) => call('atlas:cache:put', k, v),
  onAtlasProgress(fn) { const h = (_e, full, p) => fn(full, p); ipcRenderer.on('atlas:progress', h); return () => ipcRenderer.removeListener('atlas:progress', h); },
  ghSearch: (q, opts) => call('gh:search', q, opts),
  findProject: (names) => call('project:find', names),
  atlasSearch: (root, words, paths) => call('atlas:search', root, words, paths),
  openLocalProject: (root) => call('project:openLocal', root),
  ghCode: (q, lang) => call('gh:code', q, lang),
  siteInspect: (url) => call('site:inspect', url),
  ghFork: (full) => call('gh:fork', full),
});
