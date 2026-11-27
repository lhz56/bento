'use strict';
// GitHub via gh
// Publish a page with your own GitHub account: one public repo, "bento-pages", served by GitHub Pages.
// Nothing is hosted by Bento. BENTO_DRY_PUBLISH=1 records the gh commands instead of running them (for tests).
const { ipcMain } = require('electron');
const { execFile } = require('node:child_process');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerGithub(ctx) {
  const { CODE_EXT, ENV, HIDDEN, HOOKS, SKIP, envReady, launch, optStr, refuse, str } = ctx;
  ipcMain.handle('web:publish', async (_e, html, title) => {
    html = str(html, 2_000_000);
    title = optStr(title, 300);
    const dry = HOOKS.dryPublish ? [] : null;
    const call = async (args) => {
      if (dry) {
        dry.push(['gh', ...args.map((a) => (a.length > 80 ? a.slice(0, 40) + '…' : a))].join(' '));
        return args.includes('user') ? 'learner' : '';
      }
      return gh(args);
    };
    const slug =
      String(title || 'my page')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) || 'my-page';
    const login = String(await call(['api', 'user', '--jq', '.login'])).trim();
    if (!login) throw new Error('Sign in to GitHub first: open Terminal and run gh auth login');
    const repo = `${login}/bento-pages`;
    let exists = true;
    try {
      if (!dry) await call(['repo', 'view', repo, '--json', 'name']);
      else exists = false;
    } catch {
      exists = false;
    }
    if (!exists)
      await call([
        'repo',
        'create',
        'bento-pages',
        '--public',
        '--description',
        'Pages I made while learning with Bento',
        '--add-readme',
      ]);
    let sha = '';
    try {
      if (!dry)
        sha = String(
          await call(['api', `repos/${repo}/contents/${slug}/index.html`, '--jq', '.sha']),
        ).trim();
    } catch {
      sha = '';
    }
    await call([
      'api',
      '-X',
      'PUT',
      `repos/${repo}/contents/${slug}/index.html`,
      '-f',
      `message=Publish ${slug} from Bento`,
      '-f',
      `content=${Buffer.from(String(html || '')).toString('base64')}`,
      ...(sha ? ['-f', `sha=${sha}`] : []),
    ]);
    try {
      await call([
        'api',
        '-X',
        'POST',
        `repos/${repo}/pages`,
        '-f',
        'source[branch]=main',
        '-f',
        'source[path]=/',
      ]);
    } catch {
      /* already on */
    }
    return { url: `https://${login}.github.io/bento-pages/${slug}/`, repo, dry };
  });

  async function gh(args) {
    if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) throw new Error('GitHub CLI isn’t available.');
    await envReady;
    const [code, stdout, stderr] = await launch('gh', args);
    return new Promise((res, rej) =>
      execFile(code, stdout, { env: ENV, maxBuffer: 20 * 1024 * 1024, ...stderr }, (e, out, se) =>
        e ? rej(new Error(String(se || e.message).trim())) : res(out),
      ),
    );
  }
  ipcMain.handle('gh:me', async () => {
    try {
      const u = JSON.parse(await gh(['api', 'user']));
      return { login: u.login, name: u.name, avatar: u.avatar_url };
    } catch {
      return null;
    }
  });
  ipcMain.handle('gh:repos', async () =>
    JSON.parse(
      await gh([
        'repo',
        'list',
        '--limit',
        '40',
        '--json',
        'name,nameWithOwner,primaryLanguage,description,updatedAt,isPrivate',
      ]),
    ),
  );
  ipcMain.handle('gh:tree', async (_e, full) => {
    if (!ctx.REPO_RX.test(str(full, 200))) refuse();
    const parsed = JSON.parse(await gh(['api', `repos/${full}/git/trees/HEAD?recursive=1`]));
    const files = (parsed.tree || [])
      .filter(
        (x) =>
          x.type === 'blob' && CODE_EXT.test(x.path) && !x.path.split('/').some((s) => SKIP.has(s)),
      )
      .map((x) => x.path)
      .slice(0, 600);
    return { kind: 'github', root: full, name: full, files };
  });
  ipcMain.handle('gh:file', async (_e, full, filePath) => {
    filePath = str(filePath, 1000);
    if (
      !ctx.REPO_RX.test(str(full, 200)) ||
      !filePath ||
      filePath.split('/').some((x) => !x || x === '..' || x === '.')
    )
      refuse();
    const parsed = JSON.parse(
      await gh([
        'api',
        `repos/${full}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`,
      ]),
    );
    if (parsed.size > 300_000) return '// (file too large to show)';
    return Buffer.from(parsed.content || '', 'base64').toString('utf8');
  });
  return {
    gh,
  };
};
