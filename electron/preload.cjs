const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listeners = new Map();
ipcRenderer.on('ask:chunk', (_e, id, t) => listeners.get(id)?.chunk?.(t));
ipcRenderer.on('ask:think', (_e, id, t) => listeners.get(id)?.think?.(t));
ipcRenderer.on('ask:done', (_e, id) => { listeners.get(id)?.done?.(); listeners.delete(id); });
ipcRenderer.on('ask:error', (_e, id, m) => { listeners.get(id)?.error?.(m); listeners.delete(id); });

contextBridge.exposeInMainWorld('bento', {
  providers: () => ipcRenderer.invoke('providers'),
  scan: () => ipcRenderer.invoke('scan'),
  exportLesson: (l) => ipcRenderer.invoke('lesson:export', l),
  saveWeb: (html, title) => ipcRenderer.invoke('web:save', html, title),
  playPut: (html, key) => ipcRenderer.invoke('play:put', html, key),
  setPrefs: (p) => ipcRenderer.send('prefs', p),
  pathForFile: (f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  dropOpen: (p) => ipcRenderer.invoke('drop:open', p),
  storeGet: () => ipcRenderer.invoke('store:get'),
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
  atlasRefresh: (full) => ipcRenderer.invoke('atlas:refresh', full),
  atlasAnalyze: (root, name) => ipcRenderer.invoke('atlas:analyze', root, name),
  atlasMeta: (full) => ipcRenderer.invoke('atlas:meta', full),
  atlasList: () => ipcRenderer.invoke('atlas:list'),
  atlasReopen: (root) => ipcRenderer.invoke('atlas:reopen', root),
  cacheGet: (k) => ipcRenderer.invoke('atlas:cache:get', k),
  cachePut: (k, v) => ipcRenderer.invoke('atlas:cache:put', k, v),
  onAtlasProgress(fn) { const h = (_e, full, p) => fn(full, p); ipcRenderer.on('atlas:progress', h); return () => ipcRenderer.removeListener('atlas:progress', h); },
  ghSearch: (q, opts) => ipcRenderer.invoke('gh:search', q, opts),
  ghCode: (q, lang) => ipcRenderer.invoke('gh:code', q, lang),
  siteInspect: (url) => ipcRenderer.invoke('site:inspect', url),
  ghFork: (full) => ipcRenderer.invoke('gh:fork', full),
});
