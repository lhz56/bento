// Turns the raw facts from electron/atlas.cjs into things people understand:
// the stack (with icons and alternatives), plain-English guesses for every file,
// hot spots, and the prompt that asks the model to narrate the whole thing.
import { CATALOG, CATS, BY_ID, LANGS } from './catalog.js';

export const LAYERS = [
  ['ui', 'What you see', 'Screens, buttons and styles', 'var(--accent)'],
  ['server', 'Doors to the outside', 'Where requests, commands and messages come in', 'var(--sky)'],
  ['logic', 'The brains', 'Rules, helpers and the real work', 'var(--violet)'],
  ['data', 'Memory', 'How things are shaped and stored', 'var(--mint)'],
  ['support', 'Backstage', 'Settings, tests, docs and scripts', 'var(--ink-4)'],
];
export const LAYER = Object.fromEntries(LAYERS.map((l) => [l[0], l]));
const WORKSHOP = new Set(['build', 'tidy', 'test', 'ci']);
const CAT_ORDER = Object.keys(CATS);

// the version of what electron/atlas.cjs finds in a project (its facts.v); a saved project from an older version is
// read again when it's opened. Keep the two equal.
export const ANALYSIS_VERSION = 6;

const norm = (s) => String(s).toLowerCase().replace(/_/g, '-');

export function detectStack(facts) {
  const sig = facts.sig || {};
  const npm = sig.npm || {};
  const pip = new Set((sig.pip || []).map(norm));
  const env = sig.env || [];
  // package → the files that import it; docs and tests don't count, since a test's sample code isn't the project's
  const extUse = new Map();
  facts.files.forEach(
    (f, i) =>
      f.sub !== 'docs' &&
      f.sub !== 'tests' &&
      (f.ext || []).forEach((e) => {
        const k = norm(e);
        if (!extUse.has(k)) extUse.set(k, []);
        extUse.get(k).push(i);
      }),
  );
  const paths = facts.files.map((f) => f.p);
  const out = [];
  for (const e of CATALOG) {
    const ev = [];
    const used = new Set();
    for (const matcher of e.m) {
      const [kind, value] = [
        matcher.slice(0, matcher.indexOf(':')),
        matcher.slice(matcher.indexOf(':') + 1),
      ];
      if (kind === 'npm') {
        if (npm[value]) ev.push(npm[value].dev ? `${npm[value].where} (dev)` : npm[value].where);
        (extUse.get(norm(value)) || []).forEach((i) => used.add(i));
      } else if (kind === 'pip') {
        if (pip.has(norm(value))) ev.push('Python requirements');
        (extUse.get(norm(value)) || []).forEach((i) => used.add(i));
        (extUse.get(norm(value).replace(/-python$|^python-|-py$|\.py$/g, '')) || []).forEach((i) =>
          used.add(i),
        );
      } else if (kind === 'go') {
        if ((sig.go || []).some((g) => g.startsWith(value))) ev.push('go.mod');
      } else if (kind === 'gem') {
        if ((sig.gem || []).includes(value)) ev.push('Gemfile');
      } else if (kind === 'cargo') {
        if ((sig.cargo || []).includes(value)) ev.push('Cargo.toml');
      } else if (kind === 'env') {
        const hit = env.find((x) => x.startsWith(value));
        if (hit) ev.push(`secret ${hit}`);
      } else if (kind === 'dock') {
        if ((sig.dock || []).some((d) => d.startsWith(value))) ev.push('docker image');
      } else if (kind === 'prisma') {
        if ((sig.prisma || []).includes(value)) ev.push('Prisma schema');
      } else if (kind === 'file') {
        const rx = new RegExp(value, 'i');
        const hit = paths.find((p) => rx.test(p));
        if (hit) ev.push(hit);
      }
    }
    if (ev.length || used.size)
      out.push({
        ...e,
        evidence: [...new Set(ev)].slice(0, 3),
        used: [...used],
        dev: ev.length > 0 && ev.every((x) => /\(dev\)/.test(x)),
      });
  }
  const ids = new Set(out.map((x) => x.id));
  // implied tools
  if (ids.has('django'))
    out.push({ ...BY_ID.djangoorm, evidence: ['comes with Django'], used: [] });
  if (
    !ids.has('tailwind') &&
    !ids.has('sass') &&
    !ids.has('styled') &&
    facts.files.some((f) => /\.css$/.test(f.p) && f.sub !== 'docs')
  )
    out.push({ ...BY_ID.cssmod, evidence: ['.css files'], used: [] });
  if (ids.has('rn') || ids.has('expo')) {
    const r = out.find((x) => x.id === 'react');
    if (r) r.hideAsUi = true;
  }
  if (ids.has('next') || ids.has('remix')) {
    const v = out.find((x) => x.id === 'vite');
    if (v && !v.used.length) v.cat = 'build';
  }
  if (ids.has('supabase') && !ids.has('postgres'))
    out.push({ ...BY_ID.postgres, evidence: ['inside Supabase'], used: [] });
  // Tools that only live in the project's docs site or examples (h3's website/ is React, but h3 is a C library).
  const SIDE = /^(website|docs?|site|examples?|demos?|playground|benchmarks?)\//i;
  for (const x of out)
    x.side =
      x.evidence.length > 0 &&
      x.evidence.every((e) => SIDE.test(e)) &&
      x.used.every((i) => SIDE.test(facts.files[i]?.p || ''));
  for (const x of out)
    x.workshop =
      x.side ||
      WORKSHOP.has(x.cat) ||
      (x.dev && !['test', 'build'].includes(x.cat) && x.cat !== 'frame' && !x.used.length);
  out.sort(
    (a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || b.used.length - a.used.length,
  );
  return out;
}

// --------------------------------------------------------------------- per-file plain English
const GENERIC = new Set([
  'index',
  'page',
  'route',
  'layout',
  'main',
  '__init__',
  'mod',
  'app',
  'default',
  'handler',
  'loading',
  'error',
  'template',
  '+page',
  '+layout',
  '+server',
  'view',
  'views',
]);
const PKG = new Set(['index', '__init__', 'mod', '__main__']);
let dupes = new Set();
// Call once per repo: base names that appear more than once get their folder in front.
export function setDupes(files) {
  const counts = {};
  files.forEach((f) => {
    const b = f.p
      .split('/')
      .pop()
      .replace(/\.[^.]+$/, '');
    counts[b] = (counts[b] || 0) + 1;
  });
  dupes = new Set(Object.keys(counts).filter((k) => counts[k] > 1));
}
export function displayName(filePath) {
  const parts = filePath.split('/').map((x) => x.replace(/^\d{8,}_/, ''));
  const file = parts.pop();
  const base = file.replace(/\.[^.]+$/, '').replace(/\.(test|spec|stories|d)$/, '');
  const low = base.toLowerCase();
  if (parts.length && PKG.has(low)) {
    let dir = parts.pop();
    if (/^\[.*\]$|^\(.*\)$/.test(dir) && parts.length) dir = `${parts.pop()}/${dir}`;
    return low === '__main__' ? `${dir} ▸ main` : `${dir}/${file}`;
  }
  if (parts.length && (GENERIC.has(low) || dupes.has(base))) {
    let dir = parts.pop();
    if (/^\[.*\]$|^\(.*\)$/.test(dir) && parts.length) dir = `${parts.pop()}/${dir}`;
    return `${dir}/${base}`;
  }
  return base;
}

export function guessRole(filePath) {
  const lowerPath = filePath.p.toLowerCase();
  const name = lowerPath.split('/').pop();
  if (filePath.sub === 'tests') return 'Automatic checks that the code still works';
  if (filePath.sub === 'docs')
    return /readme/i.test(name)
      ? 'The front page: what this project is and how to use it'
      : 'Documentation or examples';
  if (name === 'package.json') return 'The shopping list: which packages it needs and its commands';
  if (/requirements.*\.txt|pyproject\.toml/.test(name)) return 'Which Python packages it needs';
  if (/^dockerfile$/.test(name)) return 'Instructions to pack the app into a container';
  if (/tsconfig/.test(name)) return 'Settings for TypeScript';
  if (/\.config\.|rc$|rc\.json$/.test(name)) return 'Settings for one of the tools';
  if (/\.github\/workflows/.test(lowerPath)) return 'A robot job that runs on GitHub';
  if (filePath.sub === 'config') return 'Project settings';
  if (filePath.sub === 'scripts') return 'A helper script for developers';
  if (/\.(css|scss|sass|less)$/.test(name))
    return /global|app|main|index/.test(name)
      ? 'The site-wide styles'
      : 'Styles for part of the page';
  if (/(^|\/)api\/.*route\.[jt]s$/.test(lowerPath))
    return `An API door at /${lowerPath.replace(/^.*?api\//, 'api/').replace(/\/route\.[jt]s$/, '')}`;
  if (/(^|\/)layout\.[jt]sx?$/.test(lowerPath)) return 'The frame every page sits inside';
  if (/(^|\/)page\.[jt]sx?$/.test(lowerPath) || /(^|\/)pages\//.test(lowerPath)) {
    const r = lowerPath
      .replace(/^.*?(app|pages)\//, '')
      .replace(/\/?(page|index)\.[jt]sx?$/, '')
      .replace(/\.[jt]sx?$/, '');
    return r ? `The screen at /${r}` : 'The home screen';
  }
  if (/components\/ui\//.test(lowerPath))
    return `A reusable ${displayName(filePath.p).replace(/-/g, ' ')} building block`;
  if (/components?\//.test(lowerPath))
    return `A piece of the screen: ${displayName(filePath.p).replace(/[-_]/g, ' ')}`;
  if (/^use[a-z]/i.test(name) || /hooks?\//.test(lowerPath))
    return 'A reusable bit of screen behaviour';
  if (/utils?|helpers?|lib\//.test(lowerPath) && filePath.used > 3)
    return 'Small helpers used all over the app';
  if (/models?|schema/.test(lowerPath)) return 'Describes the shape of the stored data';
  if (/migrations?/.test(lowerPath)) return 'A change to the database structure';
  if (/store|state/.test(lowerPath)) return 'Keeps track of data the app shares';
  if (/auth|login|session/.test(lowerPath)) return 'Handles logging in and who you are';
  if (filePath.layer === 'server') return 'Handles requests coming in';
  if (filePath.entry) return 'Where the program starts';
  if (filePath.layer === 'ui') return 'Part of what you see';
  if (filePath.layer === 'data') return 'Part of how data is stored';
  return 'Part of the inner workings';
}

// --------------------------------------------------------------------- hot spots you can measure
export function measuredHotspots(facts) {
  const code = facts.files.filter((f) => f.lang && f.layer !== 'support');
  const length = Math.max(1, code.length);
  const out = [];
  const hubs = [...code]
    .sort((a, b) => b.used - a.used)
    .filter((f) => f.used >= Math.max(6, length * 0.12))
    .slice(0, 2);
  for (const hub of hubs)
    out.push({
      p: hub.p,
      kind: 'fragile',
      title: `${hub.used} files lean on this one`,
      md: `A change in ${displayName(hub.p)} ripples into ${hub.used} other files. Keep it small and well tested, or split it so each part has fewer dependents.`,
      measured: true,
    });
  const big = [...code]
    .filter((f) => f.lines > 450 && !/\.(css|scss|json|html|sql)$/.test(f.p))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 2);
  for (const file of big)
    out.push({
      p: file.p,
      kind: 'complex',
      title: `${file.lines.toLocaleString()} lines in one file`,
      md: `Long files are hard to read and easy to break. It probably does several jobs; splitting it by job would make it easier to change safely.`,
      measured: true,
    });
  if ((facts.cycles || []).length) {
    const [from, to] = facts.cycles[0];
    out.push({
      p: facts.files[from].p,
      p2: facts.files[to].p,
      kind: 'fragile',
      title: `${facts.cycles.length} import loop${facts.cycles.length > 1 ? 's' : ''}`,
      md: `${displayName(facts.files[from].p)} and ${displayName(facts.files[to].p)} import each other. Loops like this make load order surprising; moving shared bits into a third file breaks the loop.`,
      measured: true,
    });
  }
  if (code.length > 8 && !facts.files.some((f) => f.sub === 'tests'))
    out.push({
      p: null,
      kind: 'fragile',
      title: 'No automated tests',
      md: 'Nothing checks the code automatically, so every change has to be tested by hand. A handful of tests on the core files would catch regressions early.',
      measured: true,
    });
  const deps = Object.keys(facts.sig?.npm || {}).filter((k) => !k.startsWith('@types/')).length;
  if (deps > 70)
    out.push({
      p: 'package.json',
      kind: 'scale',
      title: `${deps} outside packages`,
      md: 'Every package is code someone else maintains: more to update, more to download, more ways to break. Worth checking which ones are still used.',
      measured: true,
    });
  return out;
}

export function heat(f, maxUsed) {
  const a = Math.min(1, f.used / Math.max(4, maxUsed));
  const b = Math.min(1, Math.max(0, (f.lines - 150) / 700));
  return Math.max(a, b * 0.9);
}

export const sizeWord = (kb) =>
  kb == null
    ? ''
    : kb < 600
      ? 'bite-size'
      : kb < 6000
        ? 'an afternoon read'
        : kb < 60000
          ? 'a week of reading'
          : 'a deep dive';
export const langColor = (l) => LANGS[l]?.color || '#9a8f84';
export const fmtN = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// --------------------------------------------------------------------- the narration prompt
export function buildAtlasPrompt(facts, meta, stack, level) {
  const files = facts.files;
  const important = new Set();
  files.forEach((f, i) => {
    if (f.entry || f.used >= 2 || (f.layer !== 'support' && f.lines > 120)) important.add(i);
  });
  const list = files
    .map((f, i) => ({ f, i }))
    .filter(
      ({ f, i }) =>
        important.has(i) ||
        (f.layer !== 'support' && files.length < 260) ||
        (f.layer === 'support' && f.p.split('/').length <= 1),
    )
    .slice(0, 320)
    .map(
      ({ f }) =>
        `${f.p} | ${f.layer}${f.sub ? '/' + f.sub : ''} | ${f.lines}L | used by ${f.used}${f.entry ? ' | ENTRY' : ''}${f.ext?.length ? ` | uses ${f.ext.slice(0, 5).join(',')}` : ''}`,
    );
  const st = stack
    .filter((s) => !s.workshop || ['test', 'ci'].includes(s.cat))
    .slice(0, 22)
    .map(
      (s) =>
        `${s.id} = ${s.name} [${s.cat}] evidence: ${s.evidence.join('; ') || 'imports'}${s.used.length ? `; imported in ${s.used.length} files` : ''}`,
    );
  const langs = Object.entries(facts.langs)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n} lines`)
    .join(', ');
  const hot = measuredHotspots(facts)
    .map((h) => `- ${h.title}${h.p ? ` (${h.p})` : ''}`)
    .join('\n');
  let prompt = `LEVEL: ${level === 'kid' ? 'kid (lots of analogies, zero jargon)' : level === 'engineer' ? 'engineer (still plain, but name patterns precisely)' : 'curious beginner'}\n`;
  prompt += `REPO: ${meta?.full || facts.name}${meta?.description ? ` — ${meta.description}` : ''}${meta?.stars != null ? ` (★${meta.stars})` : ''}${meta?.topics?.length ? ` topics: ${meta.topics.join(', ')}` : ''}\n`;
  if (facts.sig?.pkgName)
    prompt += `package.json name: ${facts.sig.pkgName}${facts.sig.pkgDesc ? ` — ${facts.sig.pkgDesc}` : ''}\nscripts: ${Object.entries(
      facts.sig.scripts || {},
    )
      .slice(0, 10)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ')}\n`;
  prompt += `TOTALS: ${facts.totals.files} files, ${facts.totals.lines} lines of code. Languages: ${langs}\n`;
  prompt += `\nDETECTED TOOLS (use these ids):\n${st.join('\n') || '(none)'}\n`;
  prompt += `\nMEASURED:\n${hot || '- nothing alarming'}\nimport loops: ${(facts.cycles || []).length}\n`;
  if (facts.readme) prompt += `\nREADME (excerpt):\n${facts.readme.slice(0, 4500)}\n`;
  prompt += `\nFILES (path | layer | lines | used by N files | notes):\n${list.join('\n')}\n`;
  for (const h of facts.heads || []) prompt += `\n--- ${h.p} (first lines) ---\n${h.head}\n`;
  return prompt;
}

// --------------------------------------------------------------------- narration blocks → state
export function emptyNarr() {
  return {
    gist: null,
    flow: null,
    terms: [],
    layers: {},
    journeys: [],
    stack: {},
    lang: null,
    roles: {},
    hot: [],
    learn: [],
  };
}
export function applyNarr(narration, block) {
  if (!block || !block.t) return narration;
  const next = { ...narration };
  if (block.t === 'gist') next.gist = block;
  else if (block.t === 'flow' && Array.isArray(block.nodes)) next.flow = block;
  else if (block.t === 'build') next.build = block;
  else if (block.t === 'tour' && Array.isArray(block.steps)) next.tour = block.steps;
  else if (block.t === 'term' && block.term) next.terms = [...(next.terms || []), block];
  else if (block.t === 'layer' && block.id) next.layers = { ...next.layers, [block.id]: block.md };
  else if (block.t === 'journey' && Array.isArray(block.steps))
    next.journeys = [...next.journeys, block];
  else if (block.t === 'stack' && (block.id || block.name))
    next.stack = { ...next.stack, [block.id || block.name]: block };
  else if (block.t === 'lang') next.lang = block;
  else if (block.t === 'file' && block.p) next.roles = { ...next.roles, [block.p]: block.role };
  else if (block.t === 'hot') next.hot = [...next.hot, block];
  else if (block.t === 'learn') next.learn = block.items || [];
  return next;
}

// Pick the files that matter for a question about the repo (for "Ask about this repo").
// "How does this whole thing work?": the project's main parts (each app or package, biggest first),
// with the most-used file of each, so an overview answer starts from the big picture, not one corner.
const MONO_AREA =
  /^(apps|packages|libs|lib|services|crates|modules|plugins|extensions|projects|sdks)$/;
export const areaOf = (p) => {
  const s = p.split('/');
  return s.length > 2 && MONO_AREA.test(s[0]) ? `${s[0]}/${s[1]}` : s.length > 1 ? s[0] : '.';
};
export function projectParts(facts, max = 10) {
  const by = new Map();
  for (const file of facts.files) {
    if (!file.lang || file.layer === 'support' || file.sub === 'docs' || file.sub === 'tests')
      continue;
    const area = areaOf(file.p);
    if (area === '.' || /^(\.github|docs?|scripts|infra|evals?|third-party.*)$/.test(area))
      continue;
    const x = by.get(area) || { area: area, files: 0, lines: 0, top: null };
    x.files++;
    x.lines += file.lines || 0;
    if (!x.top || (file.used || 0) > (x.top.used || 0) || (file.entry && !x.top.entry))
      x.top = file;
    by.set(area, x);
  }
  return [...by.values()].sort((a, b) => b.lines - a.lines).slice(0, max);
}
export const isOverviewQuestion = (q) =>
  /\b(how (does|do|is|are) .{0,40}\bwork|what (is|does) |overview|architecture|big picture|explain|walk me through|talk about|tell me about|learn about|what about|how .{0,30}(built|structured|put together))\b/i.test(
    q,
  ) && !/\b(where|which file|function|line|bug|error|why does .{0,30} fail)\b/i.test(q);

export function filesForQuestion(facts, narr, question) {
  const words = (question.toLowerCase().match(/[a-z]{3,}/g) || []).filter(
    (w) =>
      ![
        'the',
        'how',
        'does',
        'what',
        'where',
        'when',
        'this',
        'that',
        'work',
        'works',
        'with',
        'from',
        'here',
        'app',
        'code',
        'file',
        'why',
      ].includes(w),
  );
  const score = (file) => {
    const hay =
      `${file.p} ${narr?.roles?.[file.p] || ''} ${(file.ext || []).join(' ')}`.toLowerCase();
    return (
      words.reduce(
        (s, w) => s + (hay.includes(w) ? (file.p.toLowerCase().includes(w) ? 3 : 2) : 0),
        0,
      ) +
      (file.entry ? 0.5 : 0) +
      Math.min(1, file.used / 10)
    );
  };
  return facts.files
    .filter((f) => f.lang && f.sub !== 'docs')
    .map((f) => [f, score(f)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map((x) => x[0].p);
}

// The words in a question worth searching the code for, plus the words code usually uses for them
const STOP = new Set([
  'the',
  'how',
  'does',
  'what',
  'where',
  'when',
  'this',
  'that',
  'work',
  'works',
  'with',
  'from',
  'here',
  'app',
  'code',
  'file',
  'files',
  'why',
  'and',
  'for',
  'are',
  'can',
  'you',
  'your',
  'its',
  'into',
  'about',
  'there',
  'they',
  'them',
  'have',
  'has',
  'any',
  'all',
  'some',
  'add',
  'make',
  'build',
  'want',
  'would',
  'could',
  'should',
  'please',
  'hey',
  'lets',
  'let',
  'talk',
  'tell',
  'explain',
  'show',
  'which',
  'who',
  'way',
  'thing',
  'things',
  'part',
  'parts',
  'use',
  'uses',
  'used',
  'using',
  'get',
  'gets',
  'like',
  'just',
  'really',
  'actually',
  'handle',
  'handles',
  'project',
  'repo',
  'onto',
  'while',
  'being',
  'been',
  'then',
  'also',
  'will',
  'happen',
  'happens',
]);
const ALSO = {
  answer: ['message', 'reply', 'response', 'assistant'],
  answers: ['message', 'assistant'],
  chat: ['message', 'thread', 'conversation'],
  copy: ['clipboard', 'copy'],
  copies: ['clipboard', 'copy'],
  login: ['auth', 'session', 'token'],
  auth: ['auth', 'token', 'session'],
  signin: ['auth', 'login'],
  ai: ['agent', 'model', 'provider'],
  stream: ['stream', 'chunk'],
  streaming: ['stream', 'chunk'],
  written: ['stream'],
  writing: ['stream'],
  agent: ['agent', 'provider'],
  agents: ['agent', 'provider'],
  claude: ['claude', 'anthropic'],
  codex: ['codex', 'openai'],
  database: ['db', 'sql', 'schema'],
  save: ['persist', 'store', 'write'],
  saves: ['persist', 'store'],
  settings: ['settings', 'config', 'preferences'],
  theme: ['theme', 'dark', 'color'],
  button: ['button', 'onclick'],
  key: ['shortcut', 'keybinding', 'hotkey'],
  shortcut: ['shortcut', 'keybinding', 'hotkey'],
  notify: ['notification'],
  upload: ['upload', 'attachment'],
  image: ['image', 'attachment'],
  search: ['search', 'filter', 'query'],
  terminal: ['terminal', 'pty', 'shell'],
  git: ['git', 'commit', 'branch'],
  test: ['test', 'spec'],
  tests: ['test', 'spec'],
};
export function searchWords(question) {
  // two-letter words only when they stand for something (ai, ui, db), through ALSO
  const ws = (
    String(question)
      .toLowerCase()
      .match(/[a-z][a-z0-9]+/g) || []
  ).filter((w) => !STOP.has(w) && (w.length >= 3 || ALSO[w]));
  return [
    ...new Set(
      ws.flatMap((w) => [
        w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')),
        ...(ALSO[w] || []),
      ]),
    ),
  ]
    .filter((w) => w.length >= 3)
    .slice(0, 10);
}
