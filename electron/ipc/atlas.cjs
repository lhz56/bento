'use strict';
// Atlas: bring a repo in and take it apart
const path = require('node:path');
const fsp = require('node:fs').promises;
const { app, ipcMain, net } = require('electron');
const { projectRootOk } = require('../roots.cjs');
const { writeSafeAsync } = require('../safewrite.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerAtlas(ctx) {
  const { ENV, envReady, gh, optStr, refuse, roots, str, strList, which, work } = ctx;
  const REPOS = path.join(app.getPath('userData'), 'repos');
  const CACHE = path.join(app.getPath('userData'), 'atlas');
  const cacheReady = fsp.mkdir(CACHE, { recursive: true }).catch(() => {});
  const ghOk = (() => {
    let value = null;
    return async () =>
      (value ??=
        !process.env.BENTO_NO_GH &&
        !!(await which('gh')) &&
        (await gh(['auth', 'status']).then(
          () => true,
          () => false,
        )));
  })();
  const REPO_RX = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/; // owner/name, never ../..

  ipcMain.handle('atlas:fetch', async (e, full) => {
    if (!REPO_RX.test(str(full, 200))) throw new Error('That doesn’t look like owner/name.');
    await envReady; // git, found the way a new Terminal finds it
    const wc = e.sender;
    const dir = await work(
      'fetchRepo',
      [{ full, base: REPOS, env: ENV, hasGh: await ghOk() }],
      (p) => !wc.isDestroyed() && wc.send('atlas:progress', full, p),
    );
    roots.add(dir);
    return { kind: 'github', root: dir, name: full, full };
  });
  // Beginner-friendly open issues in a project ("good first issue" and friends), newest first
  ipcMain.handle('gh:issues', async (_e, full) => {
    if (!REPO_RX.test(str(full, 200))) refuse();
    const labels = [
      'good first issue',
      'good-first-issue',
      'help wanted',
      'beginner',
      'easy',
      'first-timers-only',
    ];
    const seen = new Map();
    for (const label of labels) {
      const query = `repos/${full}/issues?state=open&per_page=12&labels=${encodeURIComponent(label)}`;
      let rows = [];
      try {
        rows = (await ghOk())
          ? JSON.parse(await gh(['api', query]))
          : await (
              await net.fetch(`https://api.github.com/${query}`, {
                headers: { 'user-agent': 'Bento', accept: 'application/vnd.github+json' },
              })
            ).json();
      } catch {
        rows = [];
      }
      for (const row of Array.isArray(rows) ? rows : [])
        if (!row.pull_request && !seen.has(row.number))
          seen.set(row.number, {
            n: row.number,
            title: row.title,
            url: row.html_url,
            body: String(row.body || '').slice(0, 4000),
            labels: (row.labels || []).map((l) => l.name),
            comments: row.comments,
            at: row.created_at,
            assigned: !!(row.assignee || row.assignees?.length),
          });
      if (seen.size >= 12) break;
    }
    return [...seen.values()]
      .sort((a, b) => a.assigned - b.assigned || (b.at > a.at ? 1 : -1))
      .slice(0, 12);
  });
  ipcMain.handle('atlas:history', async (e, full) => {
    if (!REPO_RX.test(str(full, 200))) throw new Error('That doesn’t look like owner/name.');
    await envReady; // git, found the way a new Terminal finds it
    const wc = e.sender;
    return work(
      'history',
      [{ full, base: REPOS, env: ENV }],
      (p) => !wc.isDestroyed() && wc.send('atlas:progress', `history:${full}`, p),
    );
  });
  ipcMain.handle('atlas:refresh', async (e, full) => {
    if (!REPO_RX.test(str(full, 200))) refuse();
    await work('remove', [path.join(REPOS, full.replace('/', '__'))]);
    await fsp
      .rm(path.join(CACHE, `${full.replace('/', '__')}.json`), { force: true })
      .catch(() => {});
    return true;
  });
  ipcMain.handle('atlas:analyze', async (_e, root, name) => {
    root = str(root, 4096);
    name = optStr(name, 300);
    if (!roots.has(root))
      throw new Error('That project isn’t open in Bento any more. Open it again.');
    return work('analyze', [root, { name }]);
  });
  async function repoMeta(full) {
    if (!REPO_RX.test(full)) return null;
    const pick = (repo) => ({
      full: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      license: repo.license?.spdx_id,
      topics: repo.topics || [],
      avatar: repo.owner?.avatar_url,
      owner: repo.owner?.login,
      url: repo.html_url,
      homepage: repo.homepage,
      pushed: repo.pushed_at,
      created: repo.created_at,
      language: repo.language,
      size: repo.size,
      fork: repo.fork,
      parent: repo.parent?.full_name,
      isPrivate: repo.private,
    });
    try {
      if (await ghOk()) return pick(JSON.parse(await gh(['api', `repos/${full}`])));
    } catch {}
    try {
      const r = await net.fetch(`https://api.github.com/repos/${full}`, {
        headers: { 'User-Agent': 'bento-app' },
      });
      if (r.ok) return pick(await r.json());
    } catch {}
    return null;
  }
  ipcMain.handle('atlas:meta', (_e, full) => repoMeta(str(full, 200)));
  // Which files actually talk about this? A plain word search through the project's files (no AI), so a question like
  // "where does it copy the last answer" finds the message components even when no file is called "copy".
  // Which files actually talk about this? A plain word search (no AI), in the worker.
  ipcMain.handle('atlas:search', async (_e, root, words) => {
    root = str(root, 4096);
    if (!roots.has(root))
      throw new Error('That project isn’t open in Bento any more. Open it again.');
    const ws = [
      ...new Set(
        strList(words || [], 50, 200)
          .map((w) => w.toLowerCase())
          .filter((w) => w.length >= 3),
      ),
    ].slice(0, 10);
    if (!ws.length) return [];
    return work('search', [root, ws]);
  });
  const cacheFile = (key) =>
    path.join(
      CACHE,
      `${str(key, 600)
        .replace(/[^\w.-]+/g, '__')
        .slice(0, 200)}.json`,
    );
  ipcMain.handle('atlas:cache:get', async (_e, key) => {
    const f = cacheFile(key);
    return fsp
      .readFile(f, 'utf8')
      .then(JSON.parse)
      .catch(() => null);
  });
  ipcMain.handle('atlas:cache:put', async (_e, key, v) => {
    const f = cacheFile(key);
    const t = JSON.stringify(v);
    if (!t || t.length > 50_000_000) refuse();
    await cacheReady;
    return !(await writeSafeAsync(f, t));
  });
  ipcMain.handle('atlas:list', async () => {
    await cacheReady;
    const out = [];
    for (const file of (await fsp.readdir(CACHE).catch(() => [])).filter((x) =>
      x.endsWith('.json'),
    )) {
      try {
        const [st, j] = await Promise.all([
          fsp.stat(path.join(CACHE, file)),
          fsp.readFile(path.join(CACHE, file), 'utf8').then(JSON.parse),
        ]);
        if (!j?.src) continue;
        const lang = Object.entries(j.facts?.langs || {})
          .sort((a, b) => b[1] - a[1])
          .find(([l]) => !['HTML', 'CSS', 'Shell'].includes(l))?.[0];
        out.push({
          key: j.src.kind === 'github' ? j.src.full : `local:${j.src.root}`,
          name: j.name,
          kind: j.src.kind,
          full: j.src.full,
          root: j.src.root,
          lang,
          at: j.at || st.mtimeMs,
        });
      } catch {}
    }
    return out.sort((a, b) => b.at - a.at);
  });
  ipcMain.handle('atlas:reopen', async (_e, root) => {
    if (
      typeof root === 'string' &&
      root.length <= 4096 &&
      projectRootOk(root, undefined, REPOS) &&
      (await fsp.stat(root).then(
        (st) => st.isDirectory(),
        () => false,
      ))
    ) {
      roots.add(root);
      return true;
    }
    return false;
  });
  return {
    REPOS,
    ghOk,
    REPO_RX,
    repoMeta,
  };
};
