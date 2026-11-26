// Atlas: bring any repo onto the Mac and take it apart.
// fetch  → shallow clone (gh for private repos, git for public) into userData/repos
// analyze → every file's language, size, layer, imports (resolved to files) and outside packages,
//           plus manifests, env keys, docker images and entry points. Pure static analysis, no model.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.venv',
  'venv',
  'env',
  '__pycache__',
  '.DS_Store',
  'Pods',
  '.turbo',
  'coverage',
  'target',
  'vendor',
  '.cache',
  '.idea',
  '.vscode',
  'bower_components',
  '.expo',
  '.parcel-cache',
  'release',
  'site-packages',
  '.mypy_cache',
  '.pytest_cache',
  '.gradle',
]);
const LANG = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  dart: 'Dart',
  c: 'C',
  h: 'C',
  cc: 'C++',
  cpp: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  cs: 'C#',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  sass: 'CSS',
  less: 'CSS',
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  sql: 'SQL',
  lua: 'Lua',
  ex: 'Elixir',
  exs: 'Elixir',
  scala: 'Scala',
  r: 'R',
  jl: 'Julia',
  zig: 'Zig',
};
const DOC = /\.(md|mdx|markdown|txt|rst)$/i;
const DATA =
  /\.(json|jsonc|ya?ml|toml|ini|cfg|csv|xml|env|example|lock|prisma|graphql|gql|proto)$/i;
const ASSET =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|icns|bmp|tiff?|mp4|webm|mov|mp3|wav|ogg|m4a|woff2?|ttf|otf|eot|pdf|zip|gz|wasm|glb|gltf|obj|psd|sketch|fig)$/i;
const LOCK =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum|uv\.lock)$/;

// --------------------------------------------------------------------------- fetch
function run(cmd, args, opts = {}, onErrLine) {
  return new Promise((resolve, reject) => {
    // git and gh are real programs on every system (git.exe, gh.exe on Windows): started directly, never through a shell
    const c = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '',
      err = '';
    c.stdout.on('data', (d) => {
      out += d;
      if (opts.maxOut && out.length > opts.maxOut) {
        c.kill();
        reject(new Error('too much history'));
      }
    });
    c.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      if (onErrLine) s.split(/[\r\n]+/).forEach((l) => l && onErrLine(l));
    });
    c.on('error', reject);
    c.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(
            new Error(
              err
                .trim()
                .split('\n')
                .filter((l) => !/%/.test(l))
                .slice(-2)
                .join(' ') || `${cmd} failed (${code})`,
            ),
          ),
    );
  });
}

async function fetchRepo({ full, base, env, hasGh, onProgress }) {
  const dir = path.join(base, full.replace('/', '__'));
  if (fs.existsSync(path.join(dir, '.git'))) {
    onProgress?.({ phase: 'cached', pct: 100 });
    return dir;
  }
  fs.mkdirSync(base, { recursive: true });
  const tmp = `${dir}.part`;
  fs.rmSync(tmp, { recursive: true, force: true });
  const prog = (l) => {
    const m = /(Receiving objects|Resolving deltas|Counting objects|Updating files):\s+(\d+)%/.exec(
      l,
    );
    if (m) onProgress?.({ phase: m[1].split(' ')[0].toLowerCase(), pct: +m[2] });
  };
  const gitArgs = ['--depth', '1', '--single-branch', '--filter=blob:limit=3m', '--progress'];
  try {
    if (hasGh) await run('gh', ['repo', 'clone', full, tmp, '--', ...gitArgs], { env }, prog);
    else
      await run('git', ['clone', ...gitArgs, `https://github.com/${full}.git`, tmp], { env }, prog);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(downloadTrouble(full, e.message));
  }
  fs.renameSync(tmp, dir);
  return dir;
}

// what git or gh said when a download failed, as a sentence for people (never its raw output, with its temp paths)
function downloadTrouble(full, said) {
  const m = String(said || '');
  if (
    /Repository not found|not found|does not exist|Could not read from remote/i.test(m) &&
    !/resolve host/i.test(m)
  )
    return `Couldn’t find ${full} on GitHub. Is the name right, and is it public (or yours)?`;
  if (
    /resolve host|Failed to connect|unable to access|Could not connect|timed out|Network is unreachable|Connection refused|Connection reset|proxy|SSL|TLS|early EOF|RPC failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(
      m,
    )
  )
    return `Couldn’t reach GitHub to download ${full}. Check your internet connection, then try again.`;
  if (/No space left|ENOSPC/i.test(m))
    return `Your disk is full, so ${full} couldn’t be downloaded. Free up some space, then try again.`;
  if (/ENOENT|command not found|spawn git/i.test(m))
    return process.platform === 'win32'
      ? 'Downloading projects needs git, which isn’t on this PC yet. Install it from git-scm.com, then open Bento again.'
      : process.platform === 'darwin'
        ? 'Downloading projects needs git, which isn’t on this Mac yet. Install it with: xcode-select --install'
        : 'Downloading projects needs git. Install it with your package manager, then open Bento again.';
  if (/Authentication|could not read Username|terminal prompts disabled|403/i.test(m))
    return `GitHub wouldn’t let Bento download ${full}. If it’s private, sign in with gh auth login in Terminal.`;
  return `Couldn’t download ${full}. Try again in a moment.`;
}

// --------------------------------------------------------------------------- walk + classify
function walkAll(root) {
  const out = [];
  const go = (rel, depth) => {
    if (out.length > 40000 || depth > 12) return; // names only, so this stays fast; pickFiles chooses what to read
    let ents = [];
    try {
      ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of ents) {
      const name = d.name;
      if (SKIP.has(name)) continue;
      if (
        name.startsWith('.') &&
        ![
          '.github',
          '.env.example',
          '.env.sample',
          '.env.local.example',
          '.eslintrc',
          '.eslintrc.json',
          '.eslintrc.js',
          '.eslintrc.cjs',
          '.prettierrc',
          '.babelrc',
          '.prettierrc.json',
        ].includes(name)
      )
        continue;
      const r = rel ? `${rel}/${name}` : name;
      if (d.isDirectory()) go(r, depth + 1);
      else if (d.isFile()) out.push(r);
    }
  };
  go('', 0);
  return out;
}

const segs = (p) => p.toLowerCase().split('/');
const has = (dirs, list) => dirs.some((d) => list.includes(d));
const TEST_D = [
  '__tests__',
  'test',
  'tests',
  'spec',
  'specs',
  'e2e',
  'cypress',
  'playwright',
  '__mocks__',
  'fixtures',
  'testing',
];
const DOC_D = ['docs', 'doc', 'documentation', 'examples', 'example', 'demo', 'demos', 'samples'];
const SCRIPT_D = [
  'scripts',
  'script',
  'tools',
  'bin',
  '.github',
  'deploy',
  'infra',
  'terraform',
  'ci',
  'config',
  'configs',
  'k8s',
  'helm',
];
const DATA_D = [
  'models',
  'model',
  'schema',
  'schemas',
  'db',
  'database',
  'databases',
  'migrations',
  'migration',
  'prisma',
  'entities',
  'entity',
  'repositories',
  'repository',
  'seeds',
  'seed',
  'supabase',
  'drizzle',
  'sql',
  'dal',
  'orm',
  'convex',
  'store',
  'stores',
  'redux',
  'state',
];
const SERVER_D = [
  'api',
  'apis',
  'server',
  'servers',
  'backend',
  'routes',
  'route',
  'routers',
  'router',
  'controllers',
  'controller',
  'handlers',
  'handler',
  'endpoints',
  'middleware',
  'middlewares',
  'functions',
  'lambda',
  'lambdas',
  'webhooks',
  'resolvers',
  'graphql',
  'trpc',
  'actions',
  'cli',
  'commands',
  'command',
  'cmd',
  'cogs',
  'electron',
  'workers',
  'jobs',
  'tasks',
  'services',
  'service',
  'socket',
  'sockets',
  'bot',
  'netlify',
  'edge',
];
const UI_D = [
  'components',
  'component',
  'pages',
  'page',
  'app',
  'views',
  'view',
  'screens',
  'screen',
  'layouts',
  'layout',
  'ui',
  'templates',
  'template',
  'styles',
  'style',
  'css',
  'widgets',
  'public',
  'static',
  'assets',
  'theme',
  'themes',
  'frontend',
  'client',
  'web',
  'www',
  'renderer',
  'icons',
  'partials',
  'sections',
  'blocks',
  'features',
];
const UI_GENERIC = [
  'app',
  'client',
  'web',
  'www',
  'frontend',
  'renderer',
  'features',
  'public',
  'static',
];
const CONFIG_NAME =
  /^(package\.json|tsconfig.*\.json|jsconfig\.json|.*\.config\.[cm]?[jt]s|.*rc(\.json|\.js|\.cjs)?|dockerfile|docker-compose.*|compose\.ya?ml|makefile|procfile|requirements.*\.txt|setup\.py|setup\.cfg|pyproject\.toml|go\.mod|cargo\.toml|gemfile|composer\.json|.*\.toml|.*\.ya?ml|\.env\..*|manage\.py|vercel\.json|netlify\.toml|components\.json|turbo\.json|nx\.json|pubspec\.yaml|deno\.jsonc?|biome\.jsonc?|index\.d\.ts|.*\.d\.ts|next-env\.d\.ts)$/i;
const SERVER_NAME =
  /^(route|server|api|app|main|wsgi|asgi|views|urls|routes|bot|handler|handlers|worker|cli|index)\.(py|go|rb|php)$|^(route|server|api|middleware|worker|handler|main|preload)\.[cm]?[jt]s$/i;
const DATA_NAME =
  /^(models?|schema|db|database|store|entities|repository)\.(py|[cm]?[jt]s|rb|go)$|\.(sql|prisma)$/i;

function classify(p, lang) {
  const parts = segs(p);
  const name = parts[parts.length - 1];
  const dirs = parts.slice(0, -1);
  if (
    /\.(test|spec|e2e|stories|story)\.[a-z]+$/.test(name) ||
    /^test_.*\.py$|_test\.(py|go)$/.test(name) ||
    has(dirs, TEST_D) ||
    name === 'conftest.py'
  )
    return ['support', 'tests'];
  if (DOC.test(name) || has(dirs, DOC_D)) return ['support', 'docs'];
  if (CONFIG_NAME.test(name) && (dirs.length <= 1 || !lang || /\.d\.ts$|config\./.test(name)))
    return ['support', 'config'];
  if (has(dirs, SCRIPT_D) || /^(scripts?|tools)\//.test(p)) return ['support', 'scripts'];
  if (DATA.test(name) && !lang) return ['support', 'config'];
  if (!lang && !/\.(sql|prisma)$/.test(name))
    return [
      'support',
      /^(license|licence|readme|changelog|changes|authors|contributing|notice|copying)/.test(name)
        ? 'docs'
        : 'config',
    ];
  if (DATA_NAME.test(name) || has(dirs, DATA_D)) return ['data', ''];
  if (has(dirs, SERVER_D) || SERVER_NAME.test(name)) {
    if (/\.(css|scss|html|svg)$/.test(name)) return ['ui', ''];
    return ['server', ''];
  }
  if (
    /\.(jsx|tsx|vue|svelte|astro|html|htm|css|scss|sass|less)$/.test(name) ||
    /^use[A-Z]/.test(p.split('/').pop())
  )
    return ['ui', ''];
  // plain .ts/.js/.py files only count as UI when they sit in a clearly visual folder
  if (dirs.some((d) => UI_D.includes(d) && !UI_GENERIC.includes(d))) return ['ui', ''];
  return ['logic', ''];
}

// --------------------------------------------------------------------------- imports
const JS_RX =
  /(?:^|[^\w.$])(?:import|export)\s+(?:type\s+)?(?:[\w*${}\s,]+\s+from\s+)?['"]([^'"\n]+)['"]|require\(\s*['"]([^'"\n]+)['"]\s*\)|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
// names may span lines only inside parentheses: `from x import (a,\n b)`
const PY_RX =
  /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(?:\(([^)]*)\)|([\w*, \t]+))|^[ \t]*import[ \t]+([\w., \t]+)/gm;
const GO_RX = /import\s*(?:\(\s*([\s\S]*?)\)|"([^"]+)")/g;
const NODE_BUILTIN = new Set(
  'assert buffer child_process cluster crypto dgram dns events fs http http2 https module net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib'.split(
    ' ',
  ),
);
const PY_STD = new Set(
  '__future__ abc argparse array ast asyncio base64 bisect builtins calendar collections concurrent contextlib copy csv ctypes dataclasses datetime decimal difflib email enum errno functools gc getpass glob gzip hashlib heapq hmac html http importlib inspect io ipaddress itertools json logging math mimetypes multiprocessing operator os pathlib pickle platform pprint queue random re secrets select shlex shutil signal socket sqlite3 ssl statistics string struct subprocess sys tempfile textwrap threading time timeit tkinter traceback types typing unittest urllib uuid warnings weakref xml zipfile zoneinfo code readline rlcompleter _typeshed sysconfig site atexit codecs locale numbers fractions cmath gettext keyword token tokenize dis pdb profile cProfile tracemalloc unicodedata binascii fnmatch filecmp graphlib http.server wsgiref xmlrpc sqlite3 curses getopt optparse configparser pkgutil runpy symtable stat struct marshal'.split(
    ' ',
  ),
);
const PY_ALIAS = {
  sklearn: 'scikit-learn',
  cv2: 'opencv-python',
  PIL: 'pillow',
  bs4: 'beautifulsoup4',
  yaml: 'pyyaml',
  discord: 'discord.py',
  telegram: 'python-telegram-bot',
  jwt: 'pyjwt',
  dotenv: 'python-dotenv',
  psycopg2: 'psycopg2',
  googleapiclient: 'google-api-python-client',
  slack_sdk: 'slack-sdk',
  slack_bolt: 'slack-bolt',
  socketio: 'python-socketio',
  huggingface_hub: 'huggingface-hub',
  torch: 'torch',
};
const JS_EXT = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
  '/index.vue',
];

function readText(root, p, max = 400_000) {
  try {
    const f = path.join(root, p);
    const st = fs.statSync(f);
    if (st.size > max) return null;
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
}
function jsonLoose(s) {
  try {
    return JSON.parse(
      s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1'),
    );
  } catch {
    return null;
  }
}

const extOf = (p) => (/\.([^./]+)$/.exec(p)?.[1] || '').toLowerCase();
const isTextPath = (p) =>
  !!(
    LANG[extOf(p)] ||
    DOC.test(p) ||
    DATA.test(p) ||
    /(^|\/)(Dockerfile|Makefile|Procfile|Gemfile|CNAME|LICENSE|artisan)$/i.test(p)
  );
const skipPath = (p) =>
  LOCK.test(p) ||
  ASSET.test(p) ||
  /\.min\.(js|css)$/.test(p) ||
  /(^|\/)(generated|__generated__)\//.test(p);
// Big projects (monorepos with apps/web, apps/server, packages/…) have more files than Bento reads. Instead of
// the first 3,000 in alphabetical order (which can skip whole apps), every part of the project gets a fair turn,
// with source before tests, examples and docs.
const MONO =
  /^(apps|packages|libs|lib|services|crates|modules|plugins|extensions|projects|components|sdks|tools)$/;
function pickFiles(all, max = 3000) {
  const cands = all.filter((p) => !skipPath(p) && isTextPath(p));
  if (cands.length <= max) return { picked: cands, of: cands.length };
  const area = (p) => {
    const s = p.split('/');
    return s.length > 2 && MONO.test(s[0]) ? `${s[0]}/${s[1]}` : s.length > 1 ? s[0] : '.';
  };
  const rank = (p) =>
    (/(^|\/)(__tests__|tests?|spec|specs|e2e|fixtures?|__mocks__|mocks?|testing|stories|__snapshots__|testdata)(\/|$)|\.(test|spec|stories)\.[a-z]+$/i.test(
      p,
    )
      ? 3
      : 0) +
    (/(^|\/)(docs?|examples?|demos?|samples?|benchmarks?)(\/|$)/i.test(p) ? 2 : 0) +
    (LANG[extOf(p)] ? 0 : 1) +
    p.split('/').length * 0.05;
  const groups = new Map();
  for (const p of cands) {
    const a = area(p);
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(p);
  }
  const queues = [...groups.values()].map((g) => g.sort((x, y) => rank(x) - rank(y)));
  const keep = new Set();
  let i = 0;
  while (keep.size < max) {
    let added = false;
    for (const q of queues)
      if (i < q.length && keep.size < max) {
        keep.add(q[i]);
        added = true;
      }
    if (!added) break;
    i++;
  }
  return { picked: cands.filter((p) => keep.has(p)), of: cands.length };
}

function analyze(root, meta = {}) {
  const all = walkAll(root);
  const set = new Set(all);
  const files = [];
  const idx = new Map();
  let assets = 0,
    assetBytes = 0;
  for (const p of all)
    if (ASSET.test(p) && !LOCK.test(p)) {
      assets++;
      if (assets <= 4000) {
        try {
          assetBytes += fs.statSync(path.join(root, p)).size;
        } catch {}
      }
    }
  const { picked, of } = pickFiles(all);
  for (const p of picked) {
    const lang = LANG[extOf(p)] || null;
    const text = readText(root, p);
    const lines = text == null ? 0 : text.split('\n').length;
    const [layer, sub] = classify(p, lang);
    const f = { p, lang, lines, layer, sub, imp: [], ext: [] };
    if (text && lang) f._t = text;
    idx.set(p, files.length);
    files.push(f);
  }

  // tsconfig paths ("@/*": ["./src/*"])
  const aliases = [];
  for (const tc of ['tsconfig.json', 'jsconfig.json']) {
    const j = set.has(tc) && jsonLoose(readText(root, tc) || '');
    const ps = j?.compilerOptions?.paths || {};
    const baseUrl = (j?.compilerOptions?.baseUrl || '.').replace(/^\.\/?/, '');
    for (const [k, v] of Object.entries(ps)) {
      const from = k.replace(/\*$/, '');
      const to = String(v?.[0] || '')
        .replace(/^\.\//, '')
        .replace(/\*$/, '');
      aliases.push([from, path.posix.join(baseUrl, to)]);
    }
  }
  if (!aliases.some((a) => a[0] === '@/'))
    aliases.push(
      ['@/', set.has('src') || all.some((p) => p.startsWith('src/')) ? 'src/' : ''],
      ['~/', all.some((p) => p.startsWith('src/')) ? 'src/' : ''],
    );

  const resolveJs = (from, spec) => {
    let base = null;
    if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec);
    else
      for (const [a, to] of aliases)
        if (spec.startsWith(a)) {
          base = path.posix.join(to, spec.slice(a.length));
          break;
        }
    if (base == null) return null;
    for (const e of JS_EXT) {
      const c = base + e;
      if (idx.has(c)) return c;
    }
    const stripped = base.replace(/\.(js|jsx|mjs)$/, ''); // TS imports "./x.js" meaning x.ts
    for (const e of JS_EXT) {
      const c = stripped + e;
      if (idx.has(c)) return c;
    }
    return '';
  };
  const pyRoots = ['', 'src/', 'app/'];
  const resolvePy = (from, mod, names) => {
    const out = [];
    const tryMod = (m, dir) => {
      const rel = m.replace(/\./g, '/');
      for (const r of dir != null ? [dir] : pyRoots) {
        const b = r ? path.posix.join(r, rel) : rel;
        if (idx.has(`${b}.py`)) return `${b}.py`;
        if (idx.has(`${b}/__init__.py`)) return `${b}/__init__.py`;
      }
      return null;
    };
    if (mod.startsWith('.')) {
      const dots = /^\.+/.exec(mod)[0].length;
      let dir = path.posix.dirname(from);
      for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir);
      if (dir === '.') dir = '';
      const rest = mod.slice(dots);
      if (rest) {
        const r = tryMod(rest, dir);
        if (r) out.push(r);
      } else
        for (const n of names) {
          const r = tryMod(n, dir);
          if (r) out.push(r);
        }
      return { files: out, ext: null };
    }
    const r =
      tryMod(mod) || (names.length ? names.map((n) => tryMod(`${mod}.${n}`)).find(Boolean) : null);
    if (r) return { files: [r], ext: null };
    // a sibling module in the same folder (scripts often import each other by bare name)
    const sib = tryMod(mod, path.posix.dirname(from) === '.' ? '' : path.posix.dirname(from));
    if (sib) return { files: [sib], ext: null };
    const top = mod.split('.')[0];
    if (PY_STD.has(top)) return { files: [], ext: null };
    return { files: [], ext: PY_ALIAS[top] || top };
  };
  let goModule = '';
  if (set.has('go.mod'))
    goModule = /^module\s+(\S+)/m.exec(readText(root, 'go.mod') || '')?.[1] || '';
  const dirFiles = new Map();
  for (const f of files)
    if (f.lang === 'Go') {
      const d = path.posix.dirname(f.p);
      if (!dirFiles.has(d)) dirFiles.set(d, []);
      dirFiles.get(d).push(f.p);
    }

  for (const f of files) {
    const t = f._t;
    if (!t) continue;
    const imp = new Set(),
      ext = new Set();
    if (['TypeScript', 'JavaScript', 'Vue', 'Svelte', 'Astro'].includes(f.lang)) {
      let m;
      JS_RX.lastIndex = 0;
      while ((m = JS_RX.exec(t))) {
        const spec = m[1] || m[2] || m[3];
        if (!spec) continue;
        const r = resolveJs(f.p, spec);
        if (r) imp.add(r);
        else if (r === null && !spec.startsWith('.') && !spec.startsWith('/')) {
          if (spec.startsWith('node:') || NODE_BUILTIN.has(spec.split('/')[0])) continue;
          const pkg = spec.startsWith('@')
            ? spec.split('/').slice(0, 2).join('/')
            : spec.split('/')[0];
          if (pkg && !/^[$~#]/.test(pkg)) ext.add(pkg);
        }
      }
    } else if (f.lang === 'Python') {
      let m;
      PY_RX.lastIndex = 0;
      while ((m = PY_RX.exec(t))) {
        if (m[1]) {
          const names = (m[2] || m[3] || '')
            .split(/[,\s()]+/)
            .filter((x) => x && x !== '*' && x !== 'as');
          const r = resolvePy(f.p, m[1], names);
          r.files.forEach((x) => imp.add(x));
          if (r.ext) ext.add(r.ext);
        } else if (m[4])
          for (const part of m[4].split(',')) {
            const mod = part.trim().split(/\s+/)[0];
            if (!mod) continue;
            const r = resolvePy(f.p, mod, []);
            r.files.forEach((x) => imp.add(x));
            if (r.ext) ext.add(r.ext);
          }
      }
    } else if (f.lang === 'Go') {
      let m;
      GO_RX.lastIndex = 0;
      while ((m = GO_RX.exec(t))) {
        const specs = m[2] ? [m[2]] : [...(m[1] || '').matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        for (const s of specs) {
          if (goModule && s.startsWith(goModule + '/')) {
            const d = s.slice(goModule.length + 1);
            const fs2 = dirFiles.get(d);
            if (fs2?.length) imp.add(fs2[0]);
          } else if (s.includes('.')) ext.add(s.split('/').slice(0, 3).join('/'));
        }
      }
    }
    imp.delete(f.p);
    f.imp = [...imp].map((p) => idx.get(p)).filter((x) => x != null);
    f.ext = [...ext].slice(0, 30);
  }

  // in-degree, entry points
  const inDeg = new Array(files.length).fill(0);
  files.forEach((f) =>
    f.imp.forEach((j) => {
      inDeg[j]++;
    }),
  );
  files.forEach((f, i) => {
    f.used = inDeg[i];
  });

  // ------------------------------------------------------------ manifests
  const sig = {
    npm: {},
    pip: [],
    go: [],
    gem: [],
    cargo: [],
    composer: [],
    env: [],
    dock: [],
    prisma: [],
    scripts: {},
    pkgName: '',
    bins: [],
    mains: [],
  };
  for (const f of files) {
    const name = f.p.split('/').pop();
    const depth = f.p.split('/').length;
    if (f.sub === 'docs' || f.sub === 'tests') continue; // examples/ and tests/ manifests aren't the app's own stack
    if (name === 'package.json' && depth <= 4) {
      const j = jsonLoose(readText(root, f.p) || '');
      if (!j) continue;
      for (const [k, v] of Object.entries({
        ...(j.dependencies || {}),
        ...(j.peerDependencies || {}),
      }))
        sig.npm[k] = sig.npm[k] || { v: String(v), dev: false, where: f.p };
      for (const [k, v] of Object.entries(j.devDependencies || {}))
        sig.npm[k] = sig.npm[k] || { v: String(v), dev: true, where: f.p };
      if (depth === 1) {
        sig.scripts = j.scripts || {};
        sig.pkgName = j.name || '';
        sig.pkgDesc = j.description || '';
        if (j.main) sig.mains.push(String(j.main).replace(/^\.\//, ''));
        if (j.bin)
          sig.bins.push(
            ...(typeof j.bin === 'string' ? [j.bin] : Object.values(j.bin)).map((b) =>
              String(b).replace(/^\.\//, ''),
            ),
          );
      }
    }
    if (/^requirements.*\.txt$/.test(name))
      for (const l of (readText(root, f.p) || '').split('\n')) {
        const m = /^\s*([A-Za-z0-9][\w.-]*)/.exec(l);
        if (m && !l.trim().startsWith('#') && !l.trim().startsWith('-'))
          sig.pip.push(m[1].toLowerCase());
      }
    if (name === 'pyproject.toml' || name === 'Pipfile' || name === 'setup.py') {
      const t = readText(root, f.p) || '';
      for (const arr of t.matchAll(
        /(?:dependencies|requires|install_requires|dev)\s*=\s*\[([\s\S]*?)\]/g,
      ))
        for (const m of arr[1].matchAll(/["']([A-Za-z][\w.-]*)/g))
          if (m[1].length > 1) sig.pip.push(m[1].toLowerCase());
      const poetry = /\[tool\.poetry\.(?:dev-)?dependencies\]([\s\S]*?)(\n\[|$)/.exec(t)?.[1] || '';
      for (const m of poetry.matchAll(/^([A-Za-z][\w.-]*)\s*=/gm)) sig.pip.push(m[1].toLowerCase());
      const pipfile = /\[(?:dev-)?packages\]([\s\S]*?)(\n\[|$)/.exec(t)?.[1] || '';
      for (const m of pipfile.matchAll(/^([A-Za-z][\w.-]*)\s*=/gm))
        sig.pip.push(m[1].toLowerCase());
    }
    if (name === 'go.mod')
      for (const m of (readText(root, f.p) || '').matchAll(
        /^\s*(?:require\s+)?([\w.-]+\.[\w.-]+\/[\w.\-/]+)\s+v/gm,
      ))
        sig.go.push(m[1]);
    if (name === 'Gemfile')
      for (const m of (readText(root, f.p) || '').matchAll(/^\s*gem\s+['"]([\w-]+)['"]/gm))
        sig.gem.push(m[1]);
    if (name === 'Cargo.toml') {
      const t = readText(root, f.p) || '';
      const d = /\[(?:dev-)?dependencies\]([\s\S]*?)(\n\[|$)/.exec(t)?.[1] || '';
      for (const m of d.matchAll(/^([\w-]+)\s*=/gm)) sig.cargo.push(m[1]);
    }
    if (name === 'composer.json') {
      const j = jsonLoose(readText(root, f.p) || '');
      sig.composer.push(...Object.keys(j?.require || {}));
    }
    if (/^\.env\.(example|sample|local\.example|template)$|^env\.example$/.test(name))
      for (const m of (readText(root, f.p) || '').matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm))
        sig.env.push(m[1]);
    if (/^(docker-)?compose.*\.ya?ml$/.test(name))
      for (const m of (readText(root, f.p) || '').matchAll(/image:\s*["']?([\w.\-/]+)/g))
        sig.dock.push(m[1].split('/').pop());
    if (name === 'Dockerfile')
      for (const m of (readText(root, f.p) || '').matchAll(/^FROM\s+([\w.\-/]+)/gm))
        sig.dock.push(m[1].split('/').pop());
    if (/\.prisma$/.test(name))
      for (const m of (readText(root, f.p) || '').matchAll(/provider\s*=\s*"(\w+)"/g))
        sig.prisma.push(m[1]);
  }
  // env keys used in code even without an .env.example
  const envSeen = new Set(sig.env);
  for (const f of files)
    if (f._t)
      for (const m of f._t.matchAll(
        /(?:process\.env\.|import\.meta\.env\.|os\.environ(?:\.get)?\(\s*["']|os\.getenv\(\s*["']|getenv\(\s*["'])([A-Z][A-Z0-9_]{2,})/g,
      ))
        envSeen.add(m[1]);
  sig.env = [...envSeen].slice(0, 120);
  sig.pip = [...new Set(sig.pip)];

  // entry points: the files you'd open first
  const ENTRY =
    /^(index\.html|src\/(main|index|app)\.[cm]?[jt]sx?|src\/app\/(page|layout)\.[jt]sx?|app\/(page|layout)\.[jt]sx?|pages\/(index|_app)\.[jt]sx?|src\/pages\/(index|_app)\.[jt]sx?|main\.py|app\.py|manage\.py|bot\.py|server\.[cm]?[jt]s|index\.[cm]?[jt]s|main\.go|cmd\/[^/]+\/main\.go|src\/main\.rs|src\/lib\.rs|src\/App\.(vue|svelte|[jt]sx?)|electron\/main\.[cm]?[jt]s|src\/routes\/\+page\.svelte|src\/[\w-]+\/__main__\.py|[\w-]+\/__main__\.py)$/;
  const entries = new Set([...sig.mains, ...sig.bins].filter((p) => idx.has(p)));
  for (const f of files) if (ENTRY.test(f.p)) entries.add(f.p);
  for (const s of Object.values(sig.scripts))
    for (const m of String(s).matchAll(/([\w./-]+\.(?:[cm]?[jt]s|py))/g))
      if (idx.has(m[1].replace(/^\.\//, ''))) entries.add(m[1].replace(/^\.\//, ''));
  files.forEach((f) => {
    if (entries.has(f.p)) f.entry = true;
  });

  // readme
  const readmeP = all.find((p) => /^readme(\.md|\.markdown|\.rst|\.txt)?$/i.test(p));
  const readme = readmeP ? (readText(root, readmeP) || '').slice(0, 7000) : '';

  // languages by lines (code only)
  const langs = {};
  for (const f of files)
    if (f.lang && f.sub !== 'docs') langs[f.lang] = (langs[f.lang] || 0) + f.lines;

  // cycles (a ↔ b)
  const cycles = [];
  files.forEach((f, i) =>
    f.imp.forEach((j) => {
      if (j > i && files[j].imp.includes(i)) cycles.push([i, j]);
    }),
  );

  // short heads of the most telling files for the model (entries, hubs, biggest per layer)
  const pick = new Set();
  files
    .filter((f) => f.entry)
    .slice(0, 5)
    .forEach((f) => pick.add(f.p));
  [...files]
    .filter((f) => f.lang)
    .sort((a, b) => b.used - a.used)
    .slice(0, 5)
    .forEach((f) => f.used > 1 && pick.add(f.p));
  for (const layer of ['server', 'data', 'ui', 'logic'])
    [...files]
      .filter((f) => f.layer === layer && f.lang && !/\.(css|scss|html)$/.test(f.p))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 2)
      .forEach((f) => pick.add(f.p));
  const heads = [...pick].slice(0, 14).map((p) => {
    const f = files[idx.get(p)];
    return { p, head: (f._t || '').split('\n').slice(0, 70).join('\n').slice(0, 3200) };
  });

  for (const f of files) delete f._t;
  return {
    root,
    name: meta.name || path.basename(root),
    files,
    langs,
    sig,
    readme,
    readmeP,
    heads,
    cycles,
    assets,
    assetBytes,
    totals: {
      files: files.length,
      lines: files.reduce((a, f) => a + (f.lang ? f.lines : 0), 0),
      code: files.filter((f) => f.lang).length,
    },
    analyzedAt: Date.now(),
    v: 5,
    readOf: of,
  };
}

// Watch it grow: the project's history (commits and folder trees only, no file contents), boiled down to
// ~90 snapshots of which files existed, plus the biggest moments. Mainline commits only (--first-parent).
async function history({ full, base, env, onProgress }) {
  const dir = path.join(base, '__history', `${full.replace('/', '__')}.git`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const tmp = `${dir}.part`;
    fs.rmSync(tmp, { recursive: true, force: true });
    try {
      await run(
        'git',
        [
          'clone',
          '--bare',
          '--filter=blob:none',
          '--single-branch',
          '--progress',
          `https://github.com/${full}.git`,
          tmp,
        ],
        { env },
        (l) => {
          const m = /(Receiving objects|Resolving deltas):\s+(\d+)%/.exec(l);
          if (m) onProgress?.({ phase: m[1].split(' ')[0].toLowerCase(), pct: +m[2] });
        },
      );
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(downloadTrouble(full, e.message));
    }
    fs.renameSync(tmp, dir);
  }
  const count = +(
    await run('git', ['-C', dir, 'rev-list', '--count', '--first-parent', 'HEAD'], { env })
  ).trim();
  if (count > 40000)
    throw new Error(`This project has ${count.toLocaleString()} commits, too many to replay here.`);
  onProgress?.({ phase: 'reading', pct: 0, commits: count });
  const log = await run(
    'git',
    [
      '-C',
      dir,
      'log',
      '--first-parent',
      '--reverse',
      '--no-renames',
      '--name-status',
      '--format=%x1e%at%x1f%an%x1f%s%x1f%b%x1d',
    ],
    { env, maxOut: 400e6 },
  );
  const files = new Set();
  const people = new Set();
  /** @type {Array<{ n?: number, at: number, author: any, msg: string, add: number, del: number, total: number, people: number, snap: any, files?: any }>} */
  const commits = [];
  for (const chunk of log.split('\x1e')) {
    if (!chunk.trim()) continue;
    const cut = chunk.indexOf('\x1d');
    const [at, author, subject, body = ''] = chunk.slice(0, cut).split('\x1f');
    const rest = chunk.slice(cut + 1).split('\n');
    // "Merge pull request #12 from someone/branch" says little; the pull request's title is the body's first line
    const title = body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    const msg = /^Merge pull request/.test(subject) && title ? title : subject;
    let add = 0,
      del = 0;
    for (const line of rest) {
      const m = /^([AMDT])\t(.+)$/.exec(line);
      if (!m) continue;
      if (m[1] === 'A') {
        if (!files.has(m[2])) add++;
        files.add(m[2]);
      } else if (m[1] === 'D') {
        if (files.delete(m[2])) del++;
      }
    }
    people.add(author);
    commits.push({
      at: +at * 1000,
      author,
      msg: String(msg || '').slice(0, 120),
      add,
      del,
      total: files.size,
      people: people.size,
      snap: null,
    });
    // keep a folder count for sampled commits only (cheap enough to recompute)
    commits[commits.length - 1].files =
      commits.length % Math.max(1, Math.floor(count / 90)) === 0 || commits.length === count
        ? [...files]
        : null;
  }
  const top = (p) => (p.includes('/') ? p.split('/')[0] : '(top level)');
  const frames = commits
    .filter((c) => c.files)
    .map((c) => {
      const dirs = {};
      for (const f of c.files) {
        const k = top(f);
        dirs[k] = (dirs[k] || 0) + 1;
      }
      return {
        at: c.at,
        author: c.author,
        msg: c.msg,
        total: c.total,
        people: c.people,
        n: commits.indexOf(c) + 1,
        dirs,
      };
    });
  if (commits.length && !frames.length)
    frames.push({
      at: commits[0].at,
      author: commits[0].author,
      msg: commits[0].msg,
      total: commits[0].total,
      people: 1,
      n: 1,
      dirs: {},
    });
  const moments = [
    commits[0] && { ...commits[0], n: 1, first: true },
    ...commits
      .map((c, i) => ({ ...c, n: i + 1 }))
      .slice(1)
      .sort((a, b) => b.add + b.del - (a.add + a.del))
      .slice(0, 6),
  ]
    .filter(Boolean)
    .map(({ files: _f, snap: _s, ...c }) => c)
    .sort((a, b) => a.n - b.n);
  return {
    full,
    commits: commits.length,
    people: people.size,
    from: commits[0]?.at,
    to: commits[commits.length - 1]?.at,
    frames,
    moments,
  };
}

// --------------------------------------------------------------------------- search, file lists, sizes
// Which files actually talk about this? A plain word search through the project's files (no AI), so a question like
// "where does it copy the last answer" finds the message components even when no file is called "copy".
const SEARCH_CODE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|vue|svelte|astro|scala|ex|exs|dart|lua|sql|sh)$/i;
const SEARCH_NOISE =
  /(^|\/)(__tests__|tests?|spec|specs|e2e|evals?|fixtures?|__mocks__|mocks?|testing|examples?|docs?|stories|benchmarks?|dist|build|vendor)(\/|$)|\.(test|spec|stories|d)\.[a-z]+$/i;
function search(root, ws) {
  // every code file in the project, not just the ones Bento analysed (big projects have more than it reads)
  const all = walkAll(root)
    .filter((p) => SEARCH_CODE.test(p) && !SEARCH_NOISE.test(p))
    .slice(0, 12000);
  const out = [];
  for (const p of all) {
    let t;
    try {
      const f = path.join(root, p);
      if (fs.statSync(f).size > 2000000) continue;
      t = fs.readFileSync(f, 'utf8').toLowerCase();
    } catch {
      continue;
    }
    const name = p.toLowerCase().split('/').pop();
    let score = 0,
      kinds = 0,
      first = -1;
    const words = [];
    for (const w of ws) {
      let i = t.indexOf(w),
        n = 0;
      while (i >= 0 && n < 25) {
        if (first < 0 || i < first) first = i;
        n++;
        i = t.indexOf(w, i + w.length);
      }
      if (n) {
        kinds++;
        score += 1 + Math.log2(1 + n);
        words.push(w);
      }
      if (name.includes(w)) score += 10; // a file named after the thing is usually the place
    }
    if (kinds) out.push({ p, score: score * (1 + 0.35 * (kinds - 1)), at: first, words });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}

// a folder you opened: its code files (up to 600, six folders deep), for the file list
const FOLDER_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.DS_Store',
  'Pods',
  '.turbo',
  'coverage',
  'target',
]);
const FOLDER_CODE =
  /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|html|css|scss|json|md|sql|sh|vue|svelte|toml|yaml|yml)$/i;
function codeFiles(root, rel = '', out = [], depth = 0) {
  if (out.length > 600 || depth > 6) return out;
  let ents = [];
  try {
    ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of ents) {
    if (FOLDER_SKIP.has(d.name) || d.name.startsWith('.')) continue;
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) codeFiles(root, r, out, depth + 1);
    else if (FOLDER_CODE.test(d.name)) out.push(r);
  }
  return out;
}

// bytes on disk under a folder (links counted as links, never followed)
function dirSize(d) {
  let n = 0;
  const go = (p) => {
    let es = [];
    try {
      es = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const q = path.join(p, e.name);
      if (e.isDirectory()) go(q);
      else {
        try {
          n += fs.lstatSync(q).size;
        } catch {}
      }
    }
  };
  go(d);
  return n;
}

module.exports = {
  fetchRepo,
  analyze,
  walkAll,
  history,
  search,
  codeFiles,
  dirSize,
  downloadTrouble,
  CODE_EXT: FOLDER_CODE,
  SKIP_DIRS: FOLDER_SKIP,
};
