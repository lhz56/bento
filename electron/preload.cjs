const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listeners = new Map();
ipcRenderer.on('ask:chunk', (_e, id, t) => listeners.get(id)?.chunk?.(t));
ipcRenderer.on('ask:think', (_e, id, t) => listeners.get(id)?.think?.(t));
ipcRenderer.on('ask:done', (_e, id) => { listeners.get(id)?.done?.(); listeners.delete(id); });
ipcRenderer.on('ask:error', (_e, id, m) => { listeners.get(id)?.error?.(m); listeners.delete(id); });

contextBridge.exposeInMainWorld('bento', {
  providers: () => ipcRenderer.invoke('providers'),
  scan: () => ipcRenderer.invoke('scan'),
  openTerminal: () => ipcRenderer.invoke('open:terminal'),
  // install, sign in to or update an AI in Terminal, where the person sees what runs (only commands Bento knows)
  aiTerminal: (id, action, tools) => ipcRenderer.invoke('ai:terminal', String(id), String(action), { brew: !!tools?.brew, npm: !!tools?.npm, brewInstalled: !!tools?.brewInstalled }),
  exportLesson: (l) => ipcRenderer.invoke('lesson:export', l),
  saveWeb: (html, title) => ipcRenderer.invoke('web:save', html, title),
  publishWeb: (html, title) => ipcRenderer.invoke('web:publish', html, title),
  playPut: (html, key) => ipcRenderer.invoke('play:put', html, key),
  setPrefs: (p) => ipcRenderer.send('prefs', p),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  dropOpen: (p) => ipcRenderer.invoke('drop:open', p),
  storeGet: () => ipcRenderer.invoke('store:get'),
  backupSave: () => ipcRenderer.invoke('backup:save'),
  usage: () => ipcRenderer.invoke('usage:get'),
  // how much of each plan is used: the last reading, or a fresh one (free) with { refresh: true }
  limits: { get: (o) => ipcRenderer.invoke('limits:get', { refresh: !!o?.refresh }), on(fn) { const h = (_e, x) => fn(x); ipcRenderer.on('limits', h); return () => ipcRenderer.removeListener('limits', h); } },
  clearSavedAnswers: () => ipcRenderer.invoke('usage:clearSaved'),
  pendingLink: () => ipcRenderer.invoke('deeplink:pending'),
  update: { get: () => ipcRenderer.invoke('update:get'), install: () => ipcRenderer.invoke('update:install'), check: () => ipcRenderer.invoke('update:check'), setAuto: (on) => ipcRenderer.invoke('update:auto', on), on(fn) { const h = (_e, st) => fn(st); ipcRenderer.on('update:state', h); return () => ipcRenderer.removeListener('update:state', h); } },
  onMenu(fn) { const h = (_e, a) => fn(a); ipcRenderer.on('menu', h); return () => ipcRenderer.removeListener('menu', h); },
  onDeepLink(fn) { const h = (_e, u) => fn(u); ipcRenderer.on('deeplink', h); return () => ipcRenderer.removeListener('deeplink', h); },
  backupLoad: () => ipcRenderer.invoke('backup:load'),
  storeSet: (k, v) => ipcRenderer.invoke('store:set', k, v),
  ask(model, prompt, { chunk, done, error, think }, system) {
    const id = Math.random().toString(36).slice(2);
    listeners.set(id, { chunk, done, error, think });
    ipcRenderer.send('ask:start', id, { model, prompt, system });
    return () => { listeners.delete(id); ipcRenderer.send('ask:cancel', id); };
  },
  quick: (model, prompt) => ipcRenderer.invoke('quick', { model, prompt }),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  readFile: (root, rel) => ipcRenderer.invoke('folder:read', root, rel),
  ghMe: () => ipcRenderer.invoke('gh:me'),
  ghRepos: () => ipcRenderer.invoke('gh:repos'),
  ghTree: (full) => ipcRenderer.invoke('gh:tree', full),
  ghFile: (full, p) => ipcRenderer.invoke('gh:file', full, p),
  openData: () => ipcRenderer.invoke('open:data'),
  reposUsage: () => ipcRenderer.invoke('repos:usage'),
  reposClear: () => ipcRenderer.invoke('repos:clear'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  atlasFetch: (full) => ipcRenderer.invoke('atlas:fetch', full),
  atlasHistory: (full) => ipcRenderer.invoke('atlas:history', full),
  ghIssues: (full) => ipcRenderer.invoke('gh:issues', full),
  atlasRefresh: (full) => ipcRenderer.invoke('atlas:refresh', full),
  atlasAnalyze: (root, name) => ipcRenderer.invoke('atlas:analyze', root, name),
  atlasMeta: (full) => ipcRenderer.invoke('atlas:meta', full),
  atlasList: () => ipcRenderer.invoke('atlas:list'),
  atlasReopen: (root) => ipcRenderer.invoke('atlas:reopen', root),
  cacheGet: (k) => ipcRenderer.invoke('atlas:cache:get', k),
  cachePut: (k, v) => ipcRenderer.invoke('atlas:cache:put', k, v),
  onAtlasProgress(fn) { const h = (_e, full, p) => fn(full, p); ipcRenderer.on('atlas:progress', h); return () => ipcRenderer.removeListener('atlas:progress', h); },
  ghSearch: (q, opts) => ipcRenderer.invoke('gh:search', q, opts),
  findProject: (names) => ipcRenderer.invoke('project:find', names),
  atlasSearch: (root, words, paths) => ipcRenderer.invoke('atlas:search', root, words, paths),
  openLocalProject: (root) => ipcRenderer.invoke('project:openLocal', root),
  ghCode: (q, lang) => ipcRenderer.invoke('gh:code', q, lang),
  siteInspect: (url) => ipcRenderer.invoke('site:inspect', url),
  ghFork: (full) => ipcRenderer.invoke('gh:fork', full),
});
