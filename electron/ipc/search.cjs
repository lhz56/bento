'use strict';
// search
const path = require('node:path');
const fsp = require('node:fs').promises;
const { ipcMain, net } = require('electron');
const { follow, hostAllowed } = require('../netfetch.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerSearch(ctx) {
  const { REPO_RX, gh, ghOk, optStr, refuse, repoMeta, roots, str, strList, work } = ctx;

  // a search's options, checked: anything unexpected is dropped rather than passed on to gh
  const searchOpts = (opts) => {
    opts = opts && typeof opts === 'object' ? opts : {};
    const ok = (v, rx) => (typeof v === 'string' && rx.test(v) ? v : undefined);
    return {
      limit: Number.isInteger(opts.limit) ? Math.min(50, Math.max(1, opts.limit)) : 24,
      sort: ['stars', 'updated', 'forks', 'help-wanted-issues', 'best-match'].includes(opts.sort)
        ? opts.sort
        : 'stars',
      language: ok(opts.language, /^[\w#+. -]{1,40}$/),
      stars: ok(opts.stars, /^[<>=]{0,2}\d+(\.\.\d+)?$/),
      size: ok(opts.size, /^[<>=]{0,2}\d+(\.\.\d+)?$/),
    };
  };
  async function searchRepos(q, opts = {}) {
    q = str(q, 300);
    opts = searchOpts(opts);
    const fields = 'fullName,description,stargazersCount,language,size,owner,updatedAt';
    if (await ghOk()) {
      const args = [
        'search',
        'repos',
        '--limit',
        String(opts.limit),
        '--json',
        fields,
        '--sort',
        opts.sort,
      ];
      if (opts.language) args.push('--language', opts.language);
      if (opts.stars) args.push('--stars', opts.stars);
      if (opts.size) args.push('--size', opts.size);
      args.push('--', ...q.split(/\s+/).filter(Boolean)); // the words are only ever words to search for, even "-x" or "--web"
      const rows = JSON.parse(await gh(args));
      return rows.map((r) => ({
        full: r.fullName,
        description: r.description,
        stars: r.stargazersCount,
        language: r.language,
        size: r.size,
        owner: r.owner?.login,
        updated: r.updatedAt,
      }));
    }
    const r = await net.fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q + (opts.language ? ` language:${opts.language}` : ''))}&sort=stars&per_page=${opts.limit}`,
      { headers: { 'User-Agent': 'bento-app' } },
    );
    if (!r.ok)
      throw new Error(
        r.status === 403
          ? 'GitHub search limit reached. Sign in with gh auth login for more.'
          : `GitHub search failed (${r.status})`,
      );
    const j = await r.json();
    return (j.items || []).map((x) => ({
      full: x.full_name,
      description: x.description,
      stars: x.stargazers_count,
      language: x.language,
      size: x.size,
      owner: x.owner?.login,
      updated: x.updated_at,
    }));
  }
  ipcMain.handle('gh:search', (_e, q, opts = {}) => searchRepos(q, opts));

  // "How does T3 Code work?": is it an app on this Mac, a clone in your code folders, or a project on GitHub?
  const findproject = require('../findproject.cjs');
  const foundRoots = new Set();
  ipcMain.handle('project:find', async (_e, names) => {
    names = Array.isArray(names) ? strList(names.slice(0, 8), 8, 200) : [str(names, 200)];
    const r = await findproject.find(names, {
      searchGitHub: (q) => searchRepos(q, { limit: 6 }),
      repoMeta,
      localClones: (n, f) => work('localClones', [n, f]),
      installedApps: (n) => work('installedApps', [n]),
    });
    for (const l of r.local) foundRoots.add(l.root);
    return r;
  });
  // a clone that project:find found may be opened in the Atlas (read-only, like a folder you picked)
  ipcMain.handle('project:openLocal', async (_e, root) => {
    if (
      typeof root !== 'string' ||
      !foundRoots.has(root) ||
      !(await fsp.access(root).then(
        () => true,
        () => false,
      ))
    )
      return null;
    roots.add(root);
    return { root, name: path.basename(root) };
  });
  // Real code in the wild: GitHub code search (needs gh signed in). One result per repo, short snippets.
  ipcMain.handle('gh:code', async (_e, q, language) => {
    q = str(q, 300);
    language = optStr(language, 40);
    if (language && !/^[\w#+. -]{1,40}$/.test(language)) refuse();
    if (!(await ghOk())) throw new Error('Sign in to GitHub (gh auth login) to search real code.');
    const args = ['search', 'code', '--limit', '30', '--json', 'repository,path,textMatches,url'];
    if (language) args.push('--language', language);
    args.push('--', q);
    const rows = JSON.parse(await gh(args));
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const full = r.repository?.nameWithOwner;
      if (!full || seen.has(full) || r.repository?.isFork) continue;
      if (/(^|\/)(test|tests|node_modules|vendor|site-packages)\//i.test(r.path)) continue;
      seen.add(full);
      out.push({
        repo: full,
        path: r.path,
        url: r.url,
        fragment: (r.textMatches?.[0]?.fragment || '').split('\n').slice(0, 8).join('\n'),
      });
      if (out.length >= 6) break;
    }
    return out;
  });
  // Take apart a website: fetch it like a browser would and keep the clues (headers, scripts, meta tags).
  // Fetched the way lesson code fetches (netfetch.cjs): public internet only, checked again at every redirect and at the
  // moment of connecting, so a website can't send Bento into your own Mac or home network.
  ipcMain.handle('site:inspect', async (_e, url) => {
    url = str(url, 2000).trim();
    let u;
    try {
      u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      throw new Error('That doesn’t look like a web address.');
    }
    if (!/^https?:$/.test(u.protocol) || !hostAllowed(u.hostname))
      throw new Error('Only public websites, please.');
    const t0 = Date.now();
    let r;
    try {
      r = await follow(u.toString(), {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          accept: 'text/html',
        },
      });
    } catch (e) {
      throw new Error(
        e.code === 'EBLOCKED'
          ? 'Only public websites, please.'
          : `Couldn’t reach ${u.hostname}: ${e.message}`,
      );
    }
    const ms = Date.now() - t0;
    const html = r.text.slice(0, 600000);
    r.headers = {
      get: (k) => {
        const v = r.rawHeaders?.[k];
        return v == null ? null : String(v);
      },
    };
    const headers = {};
    for (const k of [
      'server',
      'x-powered-by',
      'cf-ray',
      'x-vercel-id',
      'x-nf-request-id',
      'x-served-by',
      'x-cache',
      'via',
      'x-amz-cf-id',
      'x-github-request-id',
      'x-shopify-stage',
      'x-wix-request-id',
      'x-generator',
      'content-type',
      'strict-transport-security',
      'x-fastly-request-id',
      'fly-request-id',
      'x-render-origin-server',
      'x-railway-request-id',
      'x-cache-status',
      'alt-svc',
    ]) {
      const v = r.headers.get(k);
      if (v) headers[k] = v.slice(0, 120);
    }
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .slice(0, 80);
    const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)]
      .map((m) => m[1])
      .slice(0, 30);
    const meta = (n) =>
      (new RegExp(
        `<meta[^>]+(?:name|property)=["']${n}["'][^>]+content=["']([^"']*)["']`,
        'i',
      ).exec(html) ||
        new RegExp(
          `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${n}["']`,
          'i',
        ).exec(html))?.[1] || '';
    const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim().slice(0, 140);
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);
    const repos = [
      ...new Set(
        [...html.matchAll(/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?["'#?/\s]/gi)]
          .map((m) => m[1])
          .filter(
            (r) =>
              !/^(orgs|sponsors|features|about|login|settings|topics|marketplace|apps|site|contact|pricing|enterprise|security|collections|trending)\//i.test(
                r,
              ) && !/\/\.github$/i.test(r),
          ),
      ),
    ].slice(0, 6);
    const counts = {
      scripts: (html.match(/<script/gi) || []).length,
      images: (html.match(/<img/gi) || []).length,
      links: (html.match(/<a\s/gi) || []).length,
      iframes: (html.match(/<iframe/gi) || []).length,
    };
    const finalUrl = r.url || u.toString();
    return {
      url: u.toString(),
      final: finalUrl,
      host: new URL(finalUrl).hostname,
      status: r.status,
      ms,
      bytes: html.length,
      headers,
      scripts,
      styles,
      repos,
      title,
      description: meta('description') || meta('og:description'),
      generator: meta('generator'),
      counts,
      text,
      html: html.slice(0, 120000),
    };
  });
  ipcMain.handle('gh:fork', async (_e, full) => {
    if (!REPO_RX.test(str(full, 200))) refuse();
    if (!(await ghOk())) throw new Error('Sign in to GitHub first: run gh auth login in Terminal.');
    const out = await gh(['repo', 'fork', full, '--clone=false']).catch((e) => e.message);
    const me = JSON.parse(await gh(['api', 'user'])).login;
    return { url: `https://github.com/${me}/${full.split('/')[1]}`, note: String(out).trim() };
  });
};
