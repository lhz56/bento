// "How does T3 Code work?" — is that a real project? Look where it might already be:
// 1. apps installed on this Mac (an app often says where its source code lives),
// 2. code folders on this Mac (a clone you already have, so nothing needs downloading),
// 3. GitHub (by name, most-starred first).
// Read-only and quick: no AI, nothing is downloaded or changed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\((beta|alpha|preview|nightly|canary|insiders)\)/g, '')
    .replace(/\b(beta|alpha|preview|nightly|canary|insiders)\b/g, '')
    .replace(/\.app$/, '')
    .replace(/[^a-z0-9]+/g, '');

// "git@github.com:owner/repo.git", "https://github.com/owner/repo", "github:owner/repo" → "owner/repo"
function ghFull(s) {
  const m = /(?:github\.com[/:]|^github:)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(
    String(s || '').trim(),
  );
  return m ? `${m[1]}/${m[2]}` : null;
}

const plistValue = (file, key) =>
  new Promise((resolve) => {
    execFile(
      '/usr/bin/plutil',
      ['-extract', key, 'raw', '-o', '-', file],
      { timeout: 1500 },
      (e, out) => resolve(e ? null : String(out).trim() || null),
    );
  });

// Where an installed app keeps its source: electron-builder's app-update.yml, or the app's own package.json
function sourceOfApp(appPath) {
  const res = path.join(appPath, 'Contents', 'Resources');
  try {
    const y = fs.readFileSync(path.join(res, 'app-update.yml'), 'utf8');
    if (/provider:\s*github/.test(y)) {
      const o = /owner:\s*([\w.-]+)/.exec(y)?.[1];
      const r = /repo:\s*([\w.-]+)/.exec(y)?.[1];
      if (o && r) return { full: `${o}/${r}`, how: 'its update settings' };
    }
  } catch {}
  for (const pj of ['app.asar/package.json', 'app/package.json']) {
    try {
      // Electron reads inside .asar archives as if they were folders
      const p = JSON.parse(fs.readFileSync(path.join(res, pj), 'utf8'));
      const full =
        ghFull(typeof p.repository === 'string' ? p.repository : p.repository?.url) ||
        ghFull(p.homepage) ||
        ghFull(p.bugs?.url || p.bugs);
      if (full) return { full, how: 'its package.json' };
    } catch {}
  }
  return null;
}

// the app's own icon, as a small picture (macOS's sips turns .icns into .png)
function iconOf(appPath, iconFile) {
  if (!iconFile) return Promise.resolve(null);
  const src = path.join(
    appPath,
    'Contents',
    'Resources',
    /\.icns$/.test(iconFile) ? iconFile : `${iconFile}.icns`,
  );
  if (!fs.existsSync(src)) return Promise.resolve(null);
  const out = path.join(os.tmpdir(), `bento-icon-${process.pid}-${Date.now()}.png`);
  return new Promise((resolve) =>
    execFile(
      '/usr/bin/sips',
      ['-s', 'format', 'png', '-Z', '96', src, '--out', out],
      { timeout: 2500 },
      (e) => {
        try {
          if (e) return resolve(null);
          resolve(`data:image/png;base64,${fs.readFileSync(out).toString('base64')}`);
        } catch {
          resolve(null);
        } finally {
          fs.rm(out, { force: true }, () => {});
        }
      },
    ),
  );
}

async function installedApps(names) {
  if (process.platform !== 'darwin') return [];
  const want = new Set(names.map(norm).filter((n) => n.length >= 2));
  const dirs = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
    '/Applications/Utilities',
  ];
  const out = [];
  for (const d of dirs) {
    let list = [];
    try {
      list = fs.readdirSync(d);
    } catch {
      continue;
    }
    for (const item of list) {
      if (!item.endsWith('.app') || !want.has(norm(item))) continue;
      const appPath = path.join(d, item);
      const plist = path.join(appPath, 'Contents', 'Info.plist');
      const [version, id, iconFile] = await Promise.all([
        plistValue(plist, 'CFBundleShortVersionString'),
        plistValue(plist, 'CFBundleIdentifier'),
        plistValue(plist, 'CFBundleIconFile'),
      ]);
      out.push({
        app: item.replace(/\.app$/, ''),
        path: appPath,
        version,
        id,
        source: sourceOfApp(appPath),
        icon: await iconOf(appPath, iconFile),
      });
    }
  }
  return out;
}

// Code folders people usually keep on a Mac. Documents, Desktop and Downloads are left out on purpose:
// macOS would pop up a permission prompt just for looking.
const CODE_ROOTS = [
  'Projects',
  'projects',
  'Code',
  'code',
  'dev',
  'Dev',
  'src',
  'Developer',
  'GitHub',
  'github',
  'repos',
  'Repos',
  'workspace',
  'Workspace',
  'git',
  'Sites',
  'work',
];
function originOf(dir) {
  try {
    const cfg = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8');
    const m = /\[remote "origin"\][^[]*?url\s*=\s*(.+)/.exec(cfg);
    return m ? ghFull(m[1]) : null;
  } catch {
    return null;
  }
}
function localClones(names, fulls) {
  const want = new Set(names.map(norm).filter((n) => n.length >= 2));
  const wantFull = new Set(fulls.map((f) => f.toLowerCase()));
  const home = os.homedir();
  const out = [];
  const seen = new Set();
  const consider = (dir) => {
    if (seen.has(dir) || !fs.existsSync(path.join(dir, '.git'))) return;
    seen.add(dir);
    const remote = originOf(dir);
    const byRemote =
      remote && (wantFull.has(remote.toLowerCase()) || want.has(norm(remote.split('/')[1])));
    if (byRemote || want.has(norm(path.basename(dir))))
      out.push({ root: dir, name: path.basename(dir), remote, byRemote: !!byRemote });
  };
  // BENTO_CODE_ROOTS=/a,/b looks only there (tests, or people who keep code somewhere unusual)
  const bases = process.env.BENTO_CODE_ROOTS
    ? process.env.BENTO_CODE_ROOTS.split(',').filter(Boolean)
    : CODE_ROOTS.map((r) => path.join(home, r));
  for (const base of bases) {
    let kids = [];
    try {
      kids = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      if (!k.isDirectory() || k.name.startsWith('.') || k.name === 'node_modules') continue;
      const dir = path.join(base, k.name);
      consider(dir);
      // ~/GitHub/owner/repo and ~/code/org/repo layouts: one level deeper, only for plain folders
      if (!fs.existsSync(path.join(dir, '.git'))) {
        let sub = [];
        try {
          sub = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 80);
        } catch {}
        for (const s of sub)
          if (s.isDirectory() && !s.name.startsWith('.') && s.name !== 'node_modules')
            consider(path.join(dir, s.name));
      }
    }
  }
  return out.sort((a, b) => Number(b.byRemote) - Number(a.byRemote));
}

/**
 * @param {string[]} names
 * @param {{ searchGitHub?: Function, repoMeta?: Function, localClones?: Function, installedApps?: Function }} [sources]
 */
async function find(
  names,
  { searchGitHub, repoMeta, localClones: findClones, installedApps: findApps } = {},
) {
  names = [
    ...new Set(
      (Array.isArray(names) ? names : [names])
        .map((n) => String(n || '').trim())
        .filter((n) => n && n.length <= 60),
    ),
  ].slice(0, 4);
  if (!names.length) return { names, installed: [], local: [], github: [] };
  const installed = await (findApps ? findApps(names) : installedApps(names)).catch(() => []);
  const fromApps = installed.map((a) => a.source?.full).filter(Boolean);
  // the folder scan runs wherever the caller says (Bento: its worker thread); here otherwise
  const local = await (
    findClones
      ? findClones(names, fromApps)
      : Promise.resolve().then(() => localClones(names, fromApps))
  ).catch(() => []);
  const fulls = [...new Set([...fromApps, ...local.map((l) => l.remote).filter(Boolean)])];
  // GitHub: the repos named by the app or the clone, plus a search by name
  const deadline = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const metas = await Promise.all(
    fulls.slice(0, 3).map((f) =>
      deadline(
        repoMeta?.(f).catch(() => null),
        3000,
      ),
    ),
  );
  let found = metas.filter(Boolean);
  if (searchGitHub) {
    // "t3 code" finds repos named with those words; "t3code" finds the one-word name
    const top = names.slice().sort((a, b) => b.length - a.length)[0];
    const words = top
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const qs = [...new Set([norm(top), words])]
      .filter((x) => x.length >= 2)
      .map((x) => `${x} in:name`);
    const lists = await Promise.all(
      qs.map((q) =>
        deadline(
          searchGitHub(q).catch(() => null),
          3500,
        ),
      ),
    );
    for (const r of lists.flat().filter(Boolean))
      if (!found.some((x) => x.full.toLowerCase() === r.full.toLowerCase())) found.push(r);
    found = [
      ...found.filter((x) => fulls.includes(x.full)),
      ...found
        .filter((x) => !fulls.includes(x.full))
        .sort((a, b) => (b.stars || 0) - (a.stars || 0)),
    ];
  }
  return { names, installed, local, github: found.slice(0, 8) };
}

module.exports = { find, norm, ghFull, sourceOfApp, localClones, installedApps };
