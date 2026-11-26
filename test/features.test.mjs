// Checks for the playgrounds, skill map, packs, Big-O fitting and input() — the logic, without the app.
// node test/features.test.mjs
globalThis.self = globalThis.self || {};
let fail = 0;
const check = (ok, label, extra = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` → ${extra}`}`);
};

// timers and promises in JavaScript: the run waits for them, so a promise lesson shows its whole story
{
  const { handle } = await import('../src/runtime/jsWorker.js');
  const dinner =
    'function cook(dish, ms) {\n  return new Promise((resolve) => {\n    setTimeout(() => resolve(`${dish} ready`), ms);\n  });\n}\n\nasync function dinner() {\n  console.log("Start cooking");\n  const soup = await cook("soup", 300);\n  console.log(soup);\n  const [rice, tea] = await Promise.all([cook("rice", 200), cook("tea", 100)]);\n  console.log(rice, "+", tea);\n  return "Dinner served!";\n}\n\ndinner().then((msg) => console.log(msg));\nconsole.log("Meanwhile, setting the table...");';
  const r = await handle({ id: 11, mode: 'run', code: dinner });
  check(
    r.logs.map((l) => l.s).join(' | ') ===
      'Start cooking | Meanwhile, setting the table... | soup ready | rice ready + tea ready | Dinner served!' &&
      !r.error,
    'a promise lesson prints everything, in order, after its timers fire',
    r.logs.map((l) => l.s).join(' | '),
  );
  const t0 = Date.now();
  const rep = await handle({
    id: 12,
    mode: 'run',
    code: 'let n = 0;\nsetInterval(() => { n++; }, 50);\nconsole.log("ticking");',
  });
  check(
    Date.now() - t0 < 6000 &&
      /stopped a timer that repeats/.test(rep.logs.map((l) => l.s).join(' ')) &&
      !rep.error,
    'a timer that repeats forever is stopped after a few seconds, and says so',
    `${Date.now() - t0} ms ${JSON.stringify(rep.logs)}`,
  );
  const late = await handle({
    id: 13,
    mode: 'run',
    code: 'console.log("first");\nsetTimeout(() => {\n  null.boom;\n}, 30);',
  });
  check(
    late.error &&
      /TypeError/.test(late.error.msg) &&
      late.error.line === 3 &&
      late.logs[0]?.s === 'first',
    'an error inside a timer is the run’s error, on its own line',
    JSON.stringify(late.error),
  );
  const off = await handle({
    id: 14,
    mode: 'run',
    code: 'const t = setTimeout(() => console.log("never"), 100);\nclearTimeout(t);\nconsole.log("done");',
  });
  check(
    off.logs.map((l) => l.s).join('|') === 'done',
    'a cleared timer never fires, and the run doesn’t wait for it',
    JSON.stringify(off.logs),
  );
}

// show() in Python draws a tree written as dicts (the way most lessons write one) as a tree, like JavaScript does; a dict
// that merely has "left" and "right" numbers stays a table. Runs the runner's own Python functions, where Python is installed.
{
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/runtime/pyWorker.js', import.meta.url), 'utf8');
  const code = src.slice(
    src.indexOf('# a tree node: an object'),
    src.indexOf('def show(x, label=None):'),
  );
  const py = ['python3', 'python'].find((c) => spawnSync(c, ['--version']).status === 0);
  if (py) {
    const r = spawnSync(
      py,
      [
        '-I',
        '-c',
        `import json\n${code}\nt = {'value': 'top', 'left': {'value': 'a', 'left': None, 'right': None}, 'right': {'value': 'b', 'left': None, 'right': None}}\nprint(json.dumps([_viz(t)['type'], _viz(t)['root']['kids'][1]['v'], _viz({'name': 'r', 'children': ['x', 1, 1]})['root']['kids'][2]['v'], _viz({'left': 3, 'right': 5})['type'], _viz({'value': 'f(2)', 'left': {'value': 'f(1)'}})['type'], _viz({'left': None})['type']]))`,
      ],
      { encoding: 'utf8' },
    );
    check(
      r.stdout.trim() === '["tree", "b", "1", "table", "tree", "table"]',
      'Python: a tree written as dicts is drawn as a tree (a one-child chain too); {"left": 3, "right": 5} stays a table',
      r.stdout + r.stderr,
    );
  }
}

// show() in JavaScript: a tree (a one-child chain too) is drawn as a tree; an object with plain-number left/right is a table
{
  const { handle } = await import('../src/runtime/jsWorker.js');
  const r = await handle({
    id: 21,
    mode: 'run',
    code: 'show({ value: "f(3)", left: { value: "f(2)", left: { value: "f(1)" } } });\nshow({ value: 8, left: { value: 3, left: null, right: null }, right: null });\nshow({ left: 3, right: 5 });',
  });
  check(
    r.visuals.map((v) => v.type).join(',') === 'tree,tree,table' &&
      r.visuals[0].root.kids[0].kids[0].v === 'f(1)',
    'JavaScript: trees and one-child chains are drawn as trees; {left: 3, right: 5} is a table',
    r.visuals.map((v) => v.type).join(','),
  );
}

// input()/prompt() in JavaScript: answers come in; with none left, the run asks
{
  const { handle } = await import('../src/runtime/jsWorker.js');
  const code =
    'const name = prompt("Name? ");\nconst age = Number(prompt("Age? "));\nconsole.log(name + " will be " + (age + 1));';
  const r1 = await handle({ id: 1, mode: 'run', code, extra: { answers: [] } });
  check(
    r1.need?.prompt === 'Name? ' && !r1.error,
    'prompt() pauses to ask',
    JSON.stringify(r1.need || r1.error),
  );
  const r2 = await handle({ id: 2, mode: 'run', code, extra: { answers: ['Ana', '9'] } });
  check(
    r2.logs.map((l) => l.s).join('|') === 'Ana|9|Ana will be 10' && !r2.need,
    'answers replay in order',
    r2.logs.map((l) => l.s).join('|'),
  );
}

// The pretend terminal and Git
{
  const G = await import('../src/gitsim.js');
  let S = G.fresh();
  const done = new Set();
  for (const c of [
    'mkdir my-app',
    'cd my-app',
    'git init',
    'echo "Hello" > index.html',
    'git add index.html',
    'git commit -m "First"',
    'git switch -c dark',
    'echo "Dark" > index.html',
    'git add .',
    'git commit -m "Dark"',
    'git switch main',
    'git merge dark',
  ]) {
    S = G.run(S, c);
    G.MISSIONS.forEach((m, i) => m[3](S) && done.add(i));
  }
  check(
    done.size === G.MISSIONS.length,
    'all git missions can be completed',
    `${done.size}/${G.MISSIONS.length}`,
  );
  check(
    S.files['/home/my-app/index.html'] === 'Dark',
    'fast-forward merge brings the change',
    S.files['/home/my-app/index.html'],
  );
  S = G.run(S, 'git switch -c a');
  S = G.run(S, 'echo "A" > x.txt');
  S = G.run(S, 'git add .');
  S = G.run(S, 'git commit -m a');
  S = G.run(S, 'git switch main');
  S = G.run(S, 'echo "B" > x.txt');
  S = G.run(S, 'git add .');
  S = G.run(S, 'git commit -m b');
  S = G.run(S, 'git merge a');
  check(
    /CONFLICT/.test(S.out.at(-1).s) && S.files['/home/my-app/x.txt'].includes('<<<<<<<'),
    'conflicting changes show conflict markers',
  );
  S = G.run(S, 'echo "AB" > x.txt');
  S = G.run(S, 'git add x.txt');
  S = G.run(S, 'git commit -m resolve');
  const last = Object.values(S.repo.commits)
    .sort((a, b) => a.at - b.at)
    .at(-1);
  check(
    last.parents.length === 2,
    'resolving a conflict makes a merge commit',
    JSON.stringify(last.parents),
  );
  check(
    G.run(G.fresh(), 'git status').out.at(-1).k === 'err',
    'git outside a repository explains itself',
  );
}

// SQL: how a query runs, step by step; answers compared fairly
{
  const Q = await import('../src/sql.js');
  const steps = Q.pipeline(Q.CHALLENGES.find((c) => c[0] === 'boss')[3])
    .map((s) => s.k)
    .join(' ');
  check(
    steps === 'FROM JOIN GROUP BY SELECT ORDER BY',
    'a join + group query becomes steps',
    steps,
  );
  check(Q.clauses('SELECT (SELECT 1) FROM t') === null, 'subqueries skip the picture');
  check(
    Q.sameResult({ cols: ['a'], rows: [[1], [2]] }, { cols: ['x'], rows: [[2], [1]] }, false) &&
      !Q.sameResult({ cols: ['a'], rows: [[1], [2]] }, { cols: ['x'], rows: [[2], [1]] }, true),
    'row order matters only when sorting',
  );
}

// Skill map: free-form concepts land on the right stars
{
  const K = await import('../src/skills.js');
  for (const [c, want] of [
    ['hash maps', 'hashmap'],
    ['Big-O', 'bigo'],
    ['binary search trees', 'tree'],
    ['SQL', 'database'],
    ['off-by-one errors', 'debug'],
    ['consistent hashing', 'sharding'],
  ])
    check(K.skillsFor(c).includes(want), `“${c}” lights ${want}`, K.skillsFor(c).join(','));
  // stars light from evidence, not from opening things
  const L = (extra) => ({
    id: 'l1',
    status: 'done',
    title: 'Hash maps',
    concepts: ['hash maps'],
    createdAt: 1,
    chat: [],
    ...extra,
  });
  const lv = (opts) =>
    K.masteryOf({ progress: {}, lessons: [], puzzles: [], stops: [], ideas: [], ...opts }).hashmap
      .level;
  check(
    lv({ lessons: [L()] }) === 1,
    'opening a lesson only counts as “seen” (the star stays dark)',
  );
  check(
    lv({ lessons: [L({ chat: [{ q: 'a' }, { q: 'b' }, { q: 'c' }] })] }) === 2,
    'asking three questions about it means “getting it”',
  );
  check(
    lv({ lessons: [L({ checks: [{ ok: true }, { ok: true }] })] }) === 3,
    'two checks right means “know it”',
  );
  check(
    lv({ lessons: [L({ checks: [{ ok: false }, { ok: false }] })] }) === 1,
    'wrong answers don’t light anything',
  );
  check(
    lv({ progress: { awarded: ['l1:run', 'l1:step'] }, lessons: [L()] }) === 2,
    'running and stepping through the code means “getting it”',
  );
  check(
    lv({ progress: { reviewScores: { hashmap: { right: 2, total: 3, at: 1 } } } }) === 3,
    'a map quiz passed counts as proof',
  );
  const m = K.masteryOf({
    progress: {},
    lessons: [L({ chat: [{ q: 'why?' }] })],
    puzzles: [],
    stops: [],
    ideas: [],
  });
  check(
    m.hashmap.from.some((f) => f.kind === 'asked') && m.hashmap.from.some((f) => f.kind === 'seen'),
    'each star keeps the evidence behind it',
    JSON.stringify(m.hashmap.from),
  );
}

// Content packs
{
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const P = await import('../src/packs.js');
  const fs = await import('node:fs');
  const good = P.validatePack(
    JSON.parse(fs.readFileSync(new URL('../docs/example-pack.json', import.meta.url))),
  );
  check(
    !good.errors.length && good.pack.puzzles.length === 2 && good.pack.paths[0].stops.length === 4,
    'the example pack is valid',
    good.errors.join(' '),
  );
  const bad = P.validatePack({ bento: 'pack', name: 'x', puzzles: [{ id: 'a', title: 'A' }] });
  check(
    bad.errors.length === 1 && /missing/.test(bad.errors[0]),
    'a broken pack says what’s missing',
    bad.errors.join(' '),
  );
  check(P.validatePack({ name: 'nope' }).errors.length === 1, 'non-packs are refused');
}

// Big-O from timings: shapes, plus the never-better-than-target rule
{
  const Z = await import('../src/puzzles.js');
  const pts = (f) => [16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map((n) => [n, f(n) * 1e-7]);
  check(
    Z.fitScale(
      pts((n) => n * n),
      'O(n)',
    ).label === 'O(n²)',
    'quadratic timings read as O(n²)',
  );
  check(
    Z.fitScale(
      pts((n) => n),
      'O(n)',
    ).label === 'O(n)',
    'linear timings read as O(n)',
  );
  check(
    Z.fitScale(
      pts((n) => Math.log2(n) * 50),
      'O(log n)',
    ).label === 'O(log n)',
    'log timings read as O(log n)',
  );
  const exp = [4, 6, 8, 10, 12, 14, 16].map((n) => [n, Math.pow(1.6, n) * 1e-6]);
  check(Z.fitScale(exp, 'O(n)').label === 'O(2ⁿ)', 'step-by-step sizes catch exponential growth');
  check(
    Z.humanTime(86400 * 1.2).t === '1 day' && Z.humanTime(3600 * 5).t === '5 hours',
    'times read naturally',
    Z.humanTime(86400 * 1.2).t,
  );
}

// Lesson code can reach the public internet only: never your Mac or your home network, not even through a redirect
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const N = require('../electron/netfetch.cjs');
  const priv = [
    '127.0.0.1',
    '10.0.0.8',
    '192.168.1.1',
    '172.20.3.4',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:192.168.0.1',
    '::ffff:127.0.0.1',
  ];
  check(
    priv.every(N.isPrivate),
    'loopback, private, link-local and mapped addresses count as private',
    priv.filter((x) => !N.isPrivate(x)).join(' '),
  );
  check(
    ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '172.32.0.1'].every(
      (x) => !N.isPrivate(x),
    ),
    'public addresses are allowed',
  );
  check(
    [
      'localhost',
      'printer.local',
      'db.internal',
      'nas.home.arpa',
      'x.localhost',
      '[::1]',
      '192.168.0.10',
    ].every((h) => !N.hostAllowed(h)),
    'local names are refused before any lookup',
  );
  let msg = '';
  try {
    await N.safeFetch('http://127.0.0.1:1/');
  } catch (e) {
    msg = e.message;
  }
  check(/public internet/.test(msg), 'fetching 127.0.0.1 is refused with a plain explanation', msg);
  msg = '';
  try {
    await N.safeFetch('file:///etc/passwd');
  } catch (e) {
    msg = e.message;
  }
  check(/Only http/.test(msg), 'file:// addresses are refused', msg);
  // a public page that redirects into your network: the next hop goes through the same guard
  const hops = [];
  const fake = async (url, o) => {
    hops.push(url);
    if (url.startsWith('https://public.example'))
      return { status: 302, headers: { location: 'http://192.168.1.1/admin' }, text: '' };
    return N.once(url, o);
  };
  msg = '';
  try {
    await N.follow('https://public.example/go', {}, fake);
  } catch (e) {
    msg = e.message;
  }
  check(
    hops.length === 2 && /192\.168\.1\.1/.test(msg),
    'a redirect into the home network is refused',
    `${hops.join(' → ')} :: ${msg}`,
  );
  // DNS rebinding: a public-looking name that resolves to a private address is refused at connect time
  const dns = require('node:dns');
  const real = dns.lookup;
  dns.lookup = (host, opts, cb) =>
    host === 'sneaky.example'
      ? cb(null, [{ address: '10.0.0.5', family: 4 }])
      : real(host, opts, cb);
  msg = '';
  try {
    await N.safeFetch('http://sneaky.example/');
  } catch (e) {
    msg = e.message;
  } finally {
    dns.lookup = real;
  }
  check(
    /public internet/.test(msg),
    'a name that resolves to a private address is refused when connecting',
    msg,
  );
  // 303 after a POST turns into a GET without the body
  const seen = [];
  const r = await N.follow(
    'https://a.example/form',
    { method: 'POST', body: 'x=1' },
    async (url, o) => {
      seen.push(`${o.method || 'GET'} ${url} ${o.body ? 'body' : ''}`.trim());
      return url.endsWith('/form')
        ? { status: 303, headers: { location: '/done' }, text: '' }
        : { status: 200, headers: { 'content-type': 'text/plain' }, text: 'ok' };
    },
  );
  check(
    r.text === 'ok' && seen[1] === 'GET https://a.example/done',
    '303 after a form post continues as a plain GET',
    seen.join(' | '),
  );
}

// Checking AI-written lessons against what the code really did
{
  const V = await import('../src/verify.js');
  const L = {
    title: 'Sum',
    lang: 'python',
    code: 'total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)',
    pseudo: ['start at zero', 'go through each number', 'add it', 'show it'],
    notes: [
      { from: 2, to: 3, text: 'the loop' },
      { from: 9, text: 'past the end' },
    ],
    story: [
      {
        t: 'p',
        md: 'Line [[4|print]] shows the total, and [[12|this]] is wrong. The program prints 7 at the end.',
      },
      {
        t: 'quiz',
        q: 'What does it print?',
        choices: ['5', '6', '7'],
        answer: 2,
        why: 'Because 1+2+3 is 7.',
      },
      { t: 'quiz', q: 'broken', choices: ['only one'], answer: 0 },
    ],
  };
  const loc = V.localChecks(L);
  // line links that slipped (counted wrong by the AI) are moved back; links that describe, or point well, stay put
  {
    const code =
      'function brew(name, ms) {\n  return new Promise((resolve) => setTimeout(() => resolve(name), ms));\n}\n\nconsole.log("1. ordering");\n\nbrew("Latte", 300).then(msg => console.log("3. " + msg));\n\nasync function morning() {\n  try {\n    const a = await brew("Espresso", 200);\n    console.log("4. " + a);\n  } catch (err) {}\n}';
    const r = V.fixLinks(
      code,
      '[[4|Step 1]] orders, [[6|the latte]] uses [[6|then()]], [[8|the async function]] waits at [[10|await]]. [[7|The latte line]] and [[9-11|the morning]] are fine.',
    );
    check(
      r.md ===
        '[[5|Step 1]] orders, [[7|the latte]] uses [[7|then()]], [[9|the async function]] waits at [[11|await]]. [[7|The latte line]] and [[9-11|the morning]] are fine.',
      'line links that slipped onto a blank line, or off their code, are moved back; good ones stay',
      r.md,
    );
    const fs = await import('node:fs');
    let moved = 0,
      paras = 0;
    for (const f of ['path-prebuilt.json', 'ideas-prebuilt.json', 'sims-prebuilt.json'])
      for (const P of Object.values(
        JSON.parse(fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')),
      ))
        for (const b of P.story || [])
          if (b.t === 'p' && b.md && P.code && !P.steps?.length) {
            paras++;
            moved += V.fixLinks(P.code, b.md).moved.length;
          }
    check(
      paras > 400 && moved === 0,
      `the link repair leaves every hand-checked lesson alone (${paras} paragraphs)`,
      `${moved} moved`,
    );
    let nMoved = 0,
      nNotes = 0;
    for (const f of ['path-prebuilt.json', 'ideas-prebuilt.json', 'sims-prebuilt.json'])
      for (const P of Object.values(
        JSON.parse(fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')),
      ))
        if (P.code && P.notes?.length && !P.steps?.length) {
          nNotes += P.notes.length;
          nMoved += V.fixNotes(P.code, P.notes).moved.length;
        }
    const nn = V.fixNotes(code, [
      { from: 4, to: 4, label: 'the first log', text: '' },
      { from: 10, to: 10, label: 'await()', text: '' },
      { from: 9, to: 9, label: 'the async part', text: '' },
    ]);
    check(
      nn.notes.map((x) => x.from).join(',') === '5,11,9' && nMoved === 0 && nNotes > 100,
      `margin notes on blank lines, or off their code, are moved back; every hand-checked note stays put (${nNotes})`,
      `${nn.notes.map((x) => x.from)} · ${nMoved} hand-checked moved`,
    );
    const page = V.tidyLesson({
      code: '<!doctype html>\n<p>hi</p>',
      lang: 'html',
      story: [{ t: 'p', md: 'See [[9|the end]].' }],
      notes: [{ from: 37, to: 39, label: 'x', text: 'y' }],
      pseudo: [],
    });
    check(
      page.notes?.length === 0 && page.story?.[0].md === 'See the end.',
      'a web page’s notes and links past the end are dropped when it finishes (Bento never runs pages)',
      JSON.stringify(page),
    );
    const T = V.tidyLesson({ code, pseudo: ['x'], story: [{ t: 'p', md: 'See [[10|await]].' }] });
    check(
      T.pseudo?.length === 0 && T.story[0].md === 'See [[11|await]].',
      'a finished lesson is tidied: slipped plain English cleared, slipped links moved back',
      JSON.stringify(T),
    );
  }
  // plain English that slipped off its lines (one missing, so every later line explains the wrong code) is caught;
  // English that lines up passes, with blank comments, closing brackets and tags, and a trailing blank either way
  {
    const code =
      'def find(items, x):\n    low = 0\n\n    while low < 3:\n        if items[low] == x:\n            return low\n        low += 1\n\n    return -1';
    const good = [
      'To find x in items:',
      'Start at the first spot',
      '',
      'Keep going while there are spots',
      'Is this the one?',
      'Then say where it is',
      'Move to the next spot',
      '',
      'Not found',
    ];
    const slipped = [
      'To find x in items:',
      'Start at the first spot',
      '',
      'Keep going while there are spots',
      'Is this the one? Then say where',
      'Move to the next spot',
      '',
      'Not found',
    ];
    const page =
      '<!doctype html>\n<html>\n<body>\n  <!-- the count -->\n  <p id="n">0</p>\n  <script>\n    let n = 0;\n    document.body.onclick = () => {\n      n += 1;\n    };\n  </script>\n</body>\n</html>';
    const pageEn = [
      'A web page',
      'The page starts',
      'What you see',
      '',
      'The count, at zero',
      'The page’s code',
      'Start counting at zero',
      'On every click:',
      'add one',
      '',
      '',
      '',
      '',
    ];
    check(
      V.pseudoFits(code, good) &&
        V.pseudoFits(code, [...good, '']) &&
        V.pseudoFits(page, pageEn) &&
        V.pseudoFits(page, pageEn.slice(0, -1)),
      'plain English that lines up with its code passes (closing tags, comments and a trailing blank are fine)',
      '',
    );
    check(
      !V.pseudoFits(code, slipped) &&
        !V.pseudoFits(code, good.slice(0, 6)) &&
        !V.pseudoFits(code, []),
      'plain English that slipped a line, or is far too short, is caught',
      '',
    );
    check(
      V.localChecks({ code, pseudo: slipped, story: [], notes: [] }).patch.pseudo?.length === 0,
      'Bento’s check clears slipped plain English so it’s written again',
      '',
    );
    const { quickPrompts } = await import('../src/lesson.js');
    const qp = quickPrompts.pseudo({ code, lang: 'Python', only: [5, 6] });
    check(
      /for lines 5, 6 of this/.test(qp) &&
        qp.includes('6|             return low') &&
        /exactly these keys: 5, 6/.test(qp),
      'plain English is asked for by line number, only for the lines without it',
      qp.slice(0, 120),
    );
  }
  check(
    loc.patch.story &&
      !loc.patch.story[0].md.includes('[[12|') &&
      loc.patch.story[0].md.includes('[[4|print]]'),
    'links to lines that don’t exist become plain text; good links stay',
  );
  check(
    loc.patch.story.filter((b) => b.t === 'quiz').length === 1,
    'a quiz without a valid answer is removed',
  );
  check(loc.patch.notes?.length === 1, 'notes pointing past the code are dropped');
  const run = { logs: [{ k: 'out', s: '6' }] };
  const prompt = V.checkPrompt({ ...L, ...loc.patch }, run);
  check(
    prompt.includes('ACTUAL OUTPUT WHEN RUN:\n6') && prompt.includes('4| print(total)'),
    'the fact-check sees the numbered code and the real output',
  );
  const L2 = { ...L, ...loc.patch };
  const verdict = {
    quizzes: [{ i: 0, correct: 1, sure: true, why: '1 + 2 + 3 is 6.' }],
    fixes: [
      { p: 0, quote: 'The program prints 7 at the end.', fix: 'The program prints 6 at the end.' },
      { p: 0, quote: 'words that are not there', fix: 'x' },
    ],
  };
  const out = V.applyCheck(L2, verdict);
  const q = out.patch.story.find((b) => b.t === 'quiz');
  check(
    q.answer === 1 && q.why.startsWith('1 + 2 + 3 is 6.') && !q.why.includes('is 7'),
    'a wrong quiz answer is corrected, with a new explanation',
    JSON.stringify(q),
  );
  check(
    out.patch.story[0].md.includes('prints 6 at the end') && out.corrections.length === 2,
    'a false sentence is fixed; a quote that isn’t in the text is ignored',
    JSON.stringify(out.corrections),
  );
  const unsure = V.applyCheck(L2, { quizzes: [{ i: 0, correct: 1, sure: false }], fixes: [] });
  check(
    !unsure.corrections.length && !unsure.patch.story,
    'nothing changes when the checker isn’t sure',
  );
}

// Questions about real projects open the real code: the name, where it is (this Mac, GitHub), and the decision
{
  const F = await import('../src/findProject.js');
  const names = (q) => F.projectNames(q);
  check(
    JSON.stringify(names('hey explain how t3 code works')) === '["t3 code"]',
    'the project name is pulled out of a casual question',
    JSON.stringify(names('hey explain how t3 code works')),
  );
  check(
    names('explain the excalidraw codebase')[0] === 'excalidraw' &&
      names('what is the architecture of VS Code')[0] === 'VS Code',
    'codebase and architecture questions name their project',
  );
  check(
    [
      'how does a hash map work',
      'how does recursion work',
      'why do traffic jams appear from nowhere?',
      'how does the internet work',
      'how do neural networks learn',
    ].every((q) => !names(q).length),
    'ordinary questions about ideas are left alone',
  );
  const t3 = {
    stars: 54552,
    full: 'pingdotgg/t3code',
    description: 'A minimal web GUI for coding agents',
  };
  const app = { app: 'T3 Code (Beta)', version: '0.1.6', source: { full: 'pingdotgg/t3code' } };
  const d1 = F.decide('hey explain how t3 code works', ['t3 code'], {
    installed: [app],
    local: [],
    github: [t3],
  });
  check(
    d1.kind === 'go' &&
      d1.why === 'installed' &&
      d1.pick.full === 'pingdotgg/t3code' &&
      d1.pick.app.version === '0.1.6',
    'an app on this Mac that names its source goes straight to that repo',
    JSON.stringify(d1).slice(0, 160),
  );
  const d2 = F.decide('how does t3 code work', ['t3 code'], {
    installed: [app],
    local: [{ root: '/x/t3code', name: 't3code', remote: 'pingdotgg/t3code', byRemote: true }],
    github: [t3],
  });
  check(
    d2.pick.local?.root === '/x/t3code',
    'a clone you already have is used instead of downloading',
  );
  const d3 = F.decide('how does t3 code work', ['t3 code'], {
    installed: [],
    local: [],
    github: [t3, { full: 'someone/t3code-fork', stars: 40 }],
  });
  check(
    d3.kind === 'ask' && d3.pick.full === 'pingdotgg/t3code',
    'found only on GitHub: Bento asks before opening it',
    JSON.stringify(d3).slice(0, 120),
  );
  const d4 = F.decide('explain the t3code codebase', ['t3code'], {
    installed: [],
    local: [],
    github: [t3],
  });
  check(d4.kind === 'go', '“the … codebase” with one famous match goes straight there');
  const what = names('what is python');
  check(
    !what.length ||
      F.decide('what is python', what, {
        installed: [],
        local: [],
        github: [{ full: 'TheAlgorithms/Python', stars: 200000 }],
      }).kind === 'none',
    '“what is python” stays a lesson even though a famous repo is called Python',
  );
  check(
    F.decide('how does obscure thing work', ['obscure thing'], {
      installed: [],
      local: [],
      github: [{ full: 'a/obscurething', stars: 12 }],
    }).kind === 'none',
    'small look-alike repos are ignored',
  );
}
{
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const P = require('../electron/findproject.cjs');
  check(
    P.ghFull('git@github.com:pingdotgg/t3code.git') === 'pingdotgg/t3code' &&
      P.ghFull('https://github.com/a/b/tree/main') === 'a/b' &&
      P.norm('T3 Code (Beta).app') === 't3code',
    'GitHub addresses and app names are read the same way',
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-find-'));
  // a pretend app bundle that says where its code lives
  const res = path.join(tmp, 'Apps', 'Thing (Beta).app', 'Contents', 'Resources');
  fs.mkdirSync(path.join(res, 'app'), { recursive: true });
  fs.writeFileSync(
    path.join(res, 'app', 'package.json'),
    JSON.stringify({
      name: 'thing',
      repository: { url: 'git+https://github.com/someone/thing.git' },
    }),
  );
  check(
    P.sourceOfApp(path.join(tmp, 'Apps', 'Thing (Beta).app'))?.full === 'someone/thing',
    'an app’s package.json leads to its repo',
  );
  fs.writeFileSync(
    path.join(res, 'app-update.yml'),
    'owner: pingdotgg\nrepo: t3code\nprovider: github\n',
  );
  check(
    P.sourceOfApp(path.join(tmp, 'Apps', 'Thing (Beta).app'))?.full === 'pingdotgg/t3code',
    'an app’s update settings lead to its repo',
  );
  // pretend code folders: a clone named differently but pointing at the repo, and one with the same name
  const code = path.join(tmp, 'code');
  fs.mkdirSync(path.join(code, 'my-fork', '.git'), { recursive: true });
  fs.mkdirSync(path.join(code, 'org', 't3code', '.git'), { recursive: true });
  fs.writeFileSync(
    path.join(code, 'my-fork', '.git', 'config'),
    '[remote "origin"]\n\turl = git@github.com:pingdotgg/t3code.git\n',
  );
  process.env.BENTO_CODE_ROOTS = code;
  const found = P.localClones(['t3 code'], ['pingdotgg/t3code']);
  check(
    found[0]?.name === 'my-fork' &&
      found[0].byRemote &&
      found.some((f) => f.root.endsWith(path.join('org', 't3code'))),
    'clones are found by where they came from, and by name one folder deeper',
    JSON.stringify(found),
  );
  delete process.env.BENTO_CODE_ROOTS;
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Opened from Finder, the app starts with a tiny PATH: it asks your login shell for the real one, and never hangs on it
if (process.platform !== 'win32') {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const S = req('../electron/shellenv.cjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  check(
    S.mergePath('/a:/b', '/b:/c:') === '/a:/b:/c',
    'PATH pieces merge without repeats',
    S.mergePath('/a:/b', '/b:/c:'),
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-sh-'));
  const fake = path.join(dir, 'zsh');
  fs.writeFileSync(
    fake,
    '#!/bin/sh\nprintf "noise from a greeting\\n"; printf "__BENTO_PATH__/opt/fake/bin:/usr/bin__BENTO_PATH__"\n',
  );
  fs.chmodSync(fake, 0o755);
  const got = await S.resolvePath('/usr/bin:/bin', { env: { ...process.env, SHELL: fake } });
  check(
    got.startsWith('/opt/fake/bin:/usr/bin') && got.endsWith(':/bin'),
    'the login shell PATH comes first, even with a chatty shell startup',
    got,
  );
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 20\n');
  const t0 = Date.now();
  const slow = await S.resolvePath('/usr/bin:/bin', {
    env: { ...process.env, SHELL: fake },
    timeout: 600,
  });
  check(
    Date.now() - t0 < 3000 && slow.includes('/usr/bin'),
    'a shell that never answers is given up on quickly',
    `${Date.now() - t0}ms`,
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// A question a built-in lesson already answers is offered ready-made, before asking your AI
{
  const { coveredBy } = await import('../src/findProject.js');
  const bst = 'Binary search trees How does a binary search tree work? trees recursion';
  check(
    coveredBy('how does a binary search tree work?', bst) &&
      coveredBy('binary search trees please', bst),
    'questions a built-in lesson covers find it',
    '',
  );
  check(
    !coveredBy('what is a hash map', bst) &&
      !coveredBy('how do search trees handle deletes', bst) &&
      !coveredBy('how does it work', bst),
    'other questions don’t',
    '',
  );
  check(
    !coveredBy(
      'Binary search trees',
      'Search race: one by one vs halving Linear search vs binary search race',
    ),
    'a search race is not a lesson about search trees',
    '',
  );
}

// Saving on a full disk (or crashing mid-write) keeps the last good copy instead of half a file
{
  const { createRequire } = await import('node:module');
  const { writeSafe } = createRequire(import.meta.url)('../electron/safewrite.cjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-sw-'));
  const f = path.join(dir, 'store.json');
  check(
    writeSafe(f, '{"a":1}') && fs.readFileSync(f, 'utf8') === '{"a":1}',
    'a save writes the file',
    '',
  );
  fs.mkdirSync(`${f}.tmp`); // the new copy can't be written (as on a full disk)
  const ok = writeSafe(f, '{"a":2}');
  check(
    !ok && fs.readFileSync(f, 'utf8') === '{"a":1}',
    'a save that fails leaves the last good copy',
    fs.readFileSync(f, 'utf8'),
  );
  // the background save: same promise, and it says why it failed (a full disk shows up as ENOSPC)
  const { writeSafeAsync } = createRequire(import.meta.url)('../electron/safewrite.cjs');
  check(
    (await writeSafeAsync(f, '{"a":3}')) === null && fs.readFileSync(f, 'utf8') === '{"a":3}',
    'a background save writes the file',
    '',
  );
  const why = await writeSafeAsync(path.join(dir, 'missing', 'store.json'), '{}');
  check(
    why === 'ENOENT' &&
      fs.readFileSync(f, 'utf8') === '{"a":3}' &&
      !fs.readdirSync(dir).some((x) => /\.\d+\.tmp$/.test(x)),
    'a background save that fails says why and leaves nothing half-written',
    String(why),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// Bento reopens where you left it, unless that screen is gone
{
  const { createRequire } = await import('node:module');
  const W = createRequire(import.meta.url)('../electron/winstate.cjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-ws-'));
  const f = path.join(dir, 'window.json');
  const fb = { width: 1440, height: 900, minWidth: 1080, minHeight: 680 };
  const laptop = [{ workArea: { x: 0, y: 25, width: 1512, height: 920 } }];
  check(
    W.load(f, laptop, fb).x == null && W.load(f, laptop, fb).width === 1440,
    'first launch uses the default size',
    '',
  );
  fs.writeFileSync(f, JSON.stringify({ x: 40, y: 60, width: 1200, height: 800, maximized: false }));
  const a = W.load(f, laptop, fb);
  check(
    a.x === 40 && a.y === 60 && a.width === 1200,
    'the last size and place come back',
    JSON.stringify(a),
  );
  fs.writeFileSync(f, JSON.stringify({ x: 2600, y: 100, width: 1300, height: 820 })); // it was on an external screen, now unplugged
  const b = W.load(f, laptop, fb);
  check(
    b.x == null && b.width === 1300,
    'a window on an unplugged screen opens on this one',
    JSON.stringify(b),
  );
  fs.writeFileSync(f, JSON.stringify({ x: 10, y: 30, width: 300, height: 200 }));
  check(W.load(f, laptop, fb).width === 1080, 'never smaller than the minimum', '');
  fs.writeFileSync(f, 'not json');
  check(W.load(f, laptop, fb).width === 1440, 'a damaged file falls back to the default', '');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Release notes: one version's section of the changelog, nothing more
{
  const { notesFor } = await import('../scripts/release-notes.mjs');
  const md = '# Changelog\n\n## 0.3.0\n\n- New map\n\n## 0.2.0\n\n- First release\n';
  check(
    notesFor(md, '0.3.0') === '- New map' && notesFor(md, '0.2.0') === '- First release',
    'each version gets only its own notes',
    JSON.stringify(notesFor(md, '0.3.0')),
  );
  check(
    notesFor(md, '0.4.0') === null && notesFor(md, '0.2') === null,
    'a version with no notes is caught, and 0.2 isn’t 0.2.0',
    '',
  );
}

// A daily copy of your lessons, a week kept, in the same format Restore… reads
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { daily } = req('../electron/snapshots.cjs');
  const { writeSafe } = req('../electron/safewrite.cjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-snap-'));
  check(
    (await daily(dir, { 'bento.settings': {} }, writeSafe)) === null,
    'nothing is copied before there is anything to keep',
    '',
  );
  const store = {
    'bento.lessons': [{ id: 'a', title: 'Loops' }],
    'bento.progress': { words: {} },
    'bento.storyW': 0.5,
  };
  for (let d = 1; d <= 9; d++)
    await daily(dir, store, writeSafe, { now: new Date(2026, 10, d, 12) });
  fs.writeFileSync(path.join(dir, 'my notes.txt'), 'mine');
  await daily(dir, store, writeSafe, { now: new Date(2026, 10, 9, 18) }); // same day again: no second copy
  const left = fs.readdirSync(dir).sort();
  check(
    left.filter((f) => f.startsWith('Bento backup')).length === 7 &&
      left.includes('Bento backup 2026-11-09.json') &&
      !left.includes('Bento backup 2026-11-02.json'),
    'a week of daily copies is kept, oldest dropped',
    left.join(', '),
  );
  check(left.includes('my notes.txt'), 'files that aren’t Bento’s are left alone', '');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'Bento backup 2026-11-09.json'), 'utf8'));
  check(
    j.bento === 'backup' &&
      j.data['bento.lessons'][0].title === 'Loops' &&
      !('bento.storyW' in j.data),
    'a copy restores like a manual backup, with only what matters',
    JSON.stringify(Object.keys(j.data)),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// Picking the built-in lesson that fits best, and telling a lesson topic from a project
{
  const { bestBuiltin, namesALesson } = await import('../src/findProject.js');
  const B = [
    {
      label: 'Drawing a spiral',
      alt: 'Draw a sunflower with math',
      find: 'Drawing a spiral loops trig',
    },
    {
      label: 'Doing things again',
      alt: 'Loops: drawing a pattern',
      find: 'Doing things again Loops: drawing a pattern Teach me loops',
    },
    {
      label: 'Binary search trees',
      alt: 'How does a binary search tree work?',
      find: 'Binary search trees How does a binary search tree work? trees recursion',
    },
    {
      label: 'Clicks that run code',
      alt: '',
      find: 'Clicks that run code How do clicks on a web page run code?',
    },
  ];
  check(
    bestBuiltin('teach me loops', B)?.label === 'Doing things again',
    'the lesson named after the topic wins over one that only mentions it',
    bestBuiltin('teach me loops', B)?.label,
  );
  check(
    !bestBuiltin('how does this code work', B) && !bestBuiltin('what is code', B),
    'a vague question gets no suggestion',
    '',
  );
  check(
    namesALesson('binary search tree', B) &&
      !namesALesson('t3 code', B) &&
      !namesALesson('react', B),
    '“binary search tree” is a topic; “T3 Code” and “React” are projects',
    '',
  );
}

// Test switches: pretend AIs only in test builds or from source, hidden; a release asked for them hides every AI
{
  const { createRequire } = await import('node:module');
  const { testHooks } = createRequire(import.meta.url)('../electron/testhooks.cjs');
  const env = {
    BENTO_FAKE_AI: '/x/fake-ai.mjs',
    BENTO_FAKE_LIMIT: 'claude',
    BENTO_DRY_PUBLISH: '1',
  };
  const release = testHooks({ packaged: true, testBuild: false, offscreen: true, env });
  check(
    !release.fakeAI && !release.fakeLimit && !release.dryPublish && release.hideAllAIs,
    'a release ignores the test switches, and hides every AI rather than use the real ones',
    JSON.stringify(release),
  );
  const testBuild = testHooks({ packaged: true, testBuild: true, offscreen: true, env });
  check(
    testBuild.fakeAI === '/x/fake-ai.mjs' &&
      testBuild.fakeLimit === 'claude' &&
      testBuild.dryPublish &&
      !testBuild.hideAllAIs,
    'a hidden test build uses the pretend AIs',
    JSON.stringify(testBuild),
  );
  const shown = testHooks({ packaged: false, testBuild: false, offscreen: false, env });
  check(
    !shown.fakeAI && shown.hideAllAIs,
    'a window on screen never uses pretend AIs, and still never falls back to real ones',
    JSON.stringify(shown),
  );
  check(
    !testHooks({ packaged: true, testBuild: false, offscreen: true, env: {} }).hideAllAIs,
    'a normal launch hides nothing',
    '',
  );
}

// Folders a page could open as a project on its own: real projects yes, the whole disk, home, system or secrets no
{
  const { createRequire } = await import('node:module');
  const { projectRootOk } = createRequire(import.meta.url)('../electron/roots.cjs');
  const win = process.platform === 'win32',
    H = win ? 'C:\\Users\\ana' : '/Users/ana';
  const no = win
    ? [
        'C:\\',
        'D:\\',
        H,
        'C:\\Users',
        `${H}\\.ssh`,
        `${H}\\AppData\\Roaming`,
        'C:\\Windows\\System32',
        'C:\\Program Files\\app',
        'D:\\ProgramData\\x',
      ]
    : [
        '/',
        H,
        '/Users',
        `${H}/.ssh`,
        `${H}/Library/Keychains`,
        `${H}/.config`,
        '/etc',
        '/System/Library',
      ];
  const yes = win
    ? [`${H}\\Projects\\app`, 'D:\\code\\app', `${H}\\Desktop\\site`]
    : [
        `${H}/Projects/app`,
        `${H}/Library/Application Support/Bento/repos/a__b`,
        '/Volumes/Work/code/app',
        `${H}/Desktop/site`,
      ];
  check(
    no.every((p) => !projectRootOk(p, H)),
    'the disk, home, system folders and secrets can’t be opened as a project',
    no.filter((p) => projectRootOk(p, H)).join('  '),
  );
  check(
    yes.every((p) => projectRootOk(p, H)),
    'real project folders can',
    yes.filter((p) => !projectRootOk(p, H)).join('  '),
  );
  // a project Bento downloaded reopens wherever Bento keeps its data (AppData on Windows, ~/.config on Linux)
  const own = win ? `${H}\\AppData\\Roaming\\Bento\\repos` : `${H}/.config/Bento/repos`;
  check(
    projectRootOk(`${own}${win ? '\\' : '/'}a__b`, H, own) && !projectRootOk(H, H, own),
    'a project Bento downloaded can be reopened, wherever Bento keeps its data',
    '',
  );
}

// Paths: every stop has its own id and is one thing; every lesson on a path ships pre-written (it opens instantly,
// with no AI); stops that open another part of Bento point at something real
{
  const { TRACKS, ALL_STOPS } = await import('../src/paths.js');
  const { ideaById } = await import('../src/ideas.js');
  const fs = await import('node:fs');
  const PRE = JSON.parse(
    fs.readFileSync(new URL('../src/path-prebuilt.json', import.meta.url), 'utf8'),
  );
  const ids = ALL_STOPS.map((s) => s.id);
  check(
    new Set(ids).size === ids.length && new Set(TRACKS.map((x) => x.k)).size === TRACKS.length,
    'every path and every stop has its own id',
    ids.filter((x, i) => ids.indexOf(x) !== i).join(' '),
  );
  const kind = (s) => ['q', 'explore', 'site', 'play', 'idea'].filter((k) => s[k]);
  check(
    ALL_STOPS.every((s) => kind(s).length === 1 && s.t && s.d),
    'every stop is one thing: a lesson, a real app or website, a playground or a clever idea',
    ALL_STOPS.filter((s) => kind(s).length !== 1)
      .map((s) => s.id)
      .join(' '),
  );
  check(
    ALL_STOPS.filter((s) => s.idea).every((s) => ideaById[s.idea]) &&
      ALL_STOPS.filter((s) => s.play).every((s) => ['sql', 'git', 'design'].includes(s.play)),
    'clever-idea and playground stops point at real ones',
    '',
  );
  check(
    TRACKS.every((x) => x.icon && x.title && x.d && x.end && x.stops.length >= 6),
    'every path has an icon, a finish line and at least six stops',
    '',
  );
  const { SKILLS, skillsFor } = await import('../src/skills.js');
  const { stopSkills } = await import('../src/paths.js');
  const known = new Set(SKILLS.map((x) => x[0]));
  const badSk = ALL_STOPS.flatMap((s) =>
    (s.sk || []).filter((k) => !known.has(k)).map((k) => `${s.id}:${k}`),
  );
  const noSk = ALL_STOPS.filter((s) => !stopSkills(s, skillsFor).length).map((s) => s.id);
  check(
    !badSk.length && noSk.length <= 2,
    'path stops fill in real skills on your map',
    `unknown ${badSk.join(' ')} · none ${noSk.join(' ')}`,
  );
  const missing = ALL_STOPS.filter((s) => s.q && !PRE[s.id]).map((s) => s.id);
  check(
    !missing.length,
    'every lesson on a path ships pre-written',
    `not written yet: ${missing.join(' ')}`,
  );
  const bad = Object.entries(PRE)
    .filter(
      ([, L]) =>
        !L.story?.length ||
        !(L.code || L.steps?.length) ||
        (L.code && L.pseudo?.length !== L.code.split('\n').length),
    )
    .map(([k]) => k);
  check(
    !bad.length,
    'each pre-written path lesson has a story, code, and a plain-English line for every line of code',
    bad.join(' '),
  );
}

// Every AI Bento can teach with: run exactly as Bento runs it (its pretend twin refuses unless tools, plugins and
// personal settings are off), its stream read back into the same lesson, its errors explained in its own words
{
  const { createRequire } = await import('node:module');
  const P = createRequire(import.meta.url)('../electron/providers.cjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const fake = (await import('node:url')).fileURLToPath(
    new URL('./fixtures/fake-ai.mjs', import.meta.url),
  ); // a real path on Windows too
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-ai-'));
  const files = P.setupFiles(dir);
  P._resetCodexFeatures([
    'shell_tool',
    'unified_exec',
    'apps',
    'plugins',
    'browser_use',
    'computer_use',
    'view_image',
    'image_generation',
  ]);
  const sysFile = path.join(dir, 'instructions.md');
  fs.writeFileSync(sysFile, 'You teach by showing short, runnable code.');
  P._setAgyModels(['gemini-3.8-flash-medium', 'gemini-3.8-flash-low']);
  for (const id of P.IDS) {
    const b = P.ADAPTERS[id].build({
      name: P.parseModel(P.BY[id].default).name,
      system: 'You teach by showing short, runnable code.',
      prompt: 'How does a hash map work?',
      sysFile,
      files,
      token: id === 'copilot' ? 'gho_pretend' : null,
    });
    const env = { ...process.env, ...b.env, FAKE_AI_THINK_MS: '1', FAKE_AI_STEP_MS: '1' };
    for (const [k, v] of Object.entries(b.env || {})) if (v === undefined) delete env[k];
    const r = spawnSync(process.execPath, [fake, '--as', id, ...b.args], {
      input: b.stdin ?? '',
      env,
      encoding: 'utf8',
    });
    let full = '',
      tokens = null,
      err = '';
    const seen = new Set();
    const sink = {
      text: (t) => {
        full += t;
      },
      think: () => {},
      tokens: (i, o) => {
        tokens = { i, o };
      },
      error: (m) => {
        err = m;
      },
      limits: () => {},
      requests: () => {},
      full: () => full,
      seen: (x, c) => {
        if (c) return seen.has(x);
        seen.add(x);
        return false;
      },
    };
    for (const line of r.stdout.split('\n')) {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      P.ADAPTERS[id].parse(o, sink);
    }
    const kinds = full
      .split('\n')
      .map((l) => {
        try {
          return JSON.parse(l).t;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    check(
      r.status === 0 && kinds[0] === 'title' && kinds.includes('code') && !err,
      `${P.label(id)}: runs as a writer only, and its stream becomes the whole lesson`,
      (r.stderr || err).slice(0, 160) || kinds.join(','),
    );
    if (id !== 'copilot') check(!!tokens, `${P.label(id)}: token counts are read`, ''); // Copilot shares no token counts (Bento estimates them)
    check(
      !b.args.some((x) => /hash map work/.test(x)),
      `${P.label(id)}: the request never goes on the command line`,
      b.args.join(' ').slice(0, 120),
    );
  }
  // a name Codex doesn't know is never passed (a real one stops with an error)
  P._resetCodexFeatures(['shell_tool']);
  const cx = P.ADAPTERS.codex.build({ name: 'default', system: 's', prompt: 'p' });
  check(
    cx.args.filter((x) => x === '--disable').length === 1 && cx.args.includes('shell_tool'),
    'Codex: only the features it has are switched off',
    cx.args.join(' '),
  );
  // Copilot: a personal allow-everything setting never applies; a lent GitHub sign-in gets a home folder of its own
  const cp = P.ADAPTERS.copilot.build({
    name: 'auto',
    system: 's',
    prompt: 'p',
    files,
    token: 'gho_x',
  });
  check(
    'COPILOT_ALLOW_ALL' in cp.env &&
      cp.env.COPILOT_ALLOW_ALL === undefined &&
      cp.env.COPILOT_HOME === files.copilotHome,
    'Copilot: no allow-all, and lessons stay out of your Copilot history',
    JSON.stringify(cp.env),
  );
  // plan limits: Claude's fraction becomes a percentage; whole percentages are never read as fractions
  const cl = P.claudeLimits({
    status: 'allowed_warning',
    unifiedWindows: {
      five_hour: { utilization: 0.86, resetsAt: 1800000000, status: 'allowed_warning' },
    },
  });
  check(
    cl.windows[0].used === 86 && cl.windows[0].warn && cl.windows[0].label === '5-hour window',
    'Claude’s limit reading becomes “86% of the 5-hour window”',
    JSON.stringify(cl),
  );
  // errors in each AI's own words, with its own command
  check(
    /Gemini API key.*Antigravity/.test(
      P.humanize('gemini', 'Please set an Auth method in your settings.json'),
    ),
    'Gemini CLI without a key: says how to set one up, or to use Antigravity',
    P.humanize('gemini', 'Please set an Auth method'),
  );
  check(
    /through Antigravity/.test(
      P.humanize(
        'gemini',
        'IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals. Please migrate to the Antigravity suite',
      ),
    ),
    'Gemini CLI refused for a personal account: points to Antigravity',
    '',
  );
  check(
    /isn’t signed in.*`agy`/.test(
      P.humanize('antigravity', 'Error: Please sign in to view available models.'),
    ),
    'Antigravity signed out: says how to sign in',
    '',
  );
  // Gemini CLI: a personal Google sign-in is refused by Google now, so it only counts as ready with a Cloud project
  {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-gem-'));
    const was = process.env.GEMINI_CLI_HOME;
    process.env.GEMINI_CLI_HOME = home;
    fs.mkdirSync(path.join(home, '.gemini'));
    fs.writeFileSync(
      path.join(home, '.gemini', 'settings.json'),
      JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }),
    );
    fs.writeFileSync(path.join(home, '.gemini', 'oauth_creds.json'), '{}');
    const a = await P.ADAPTERS.gemini.auth({ env: {} }),
      b = await P.ADAPTERS.gemini.auth({ env: { GOOGLE_CLOUD_PROJECT: 'my-proj' } }),
      c = await P.ADAPTERS.gemini.auth({ env: { GEMINI_API_KEY: 'k' } });
    check(
      !a.loggedIn &&
        a.personal &&
        b.loggedIn &&
        b.method === 'Google Cloud' &&
        c.loggedIn &&
        c.method === 'API key',
      'Gemini CLI: a personal Google sign-in isn’t ready (Google refuses it); a Cloud project or an API key is',
      JSON.stringify([a, b, c]),
    );
    if (was == null) delete process.env.GEMINI_CLI_HOME;
    else process.env.GEMINI_CLI_HOME = was;
    fs.rmSync(home, { recursive: true, force: true });
  }
  // Antigravity: model names stand for the newest matching model this account offers
  P._setAgyModels([
    'gemini-3.5-flash-medium',
    'gemini-3.8-flash-medium',
    'gemini-3.8-flash-low',
    'claude-sonnet-4-6',
  ]);
  check(
    P.agyModel('flash') === 'gemini-3.8-flash-medium' &&
      P.agyModel('flash-low') === 'gemini-3.8-flash-low' &&
      P.agyModel('claude') === 'claude-sonnet-4-6' &&
      P.agyModel('flash-high') === null,
    'Antigravity: “flash” means the newest Flash this account has',
    '',
  );
  // only rule kinds Antigravity knows (one it doesn't would make it drop every rule), covering every kind there is
  check(
    ['command', 'write_file', 'read_file', 'mcp', 'read_url', 'execute_url', 'download_url'].every(
      (k) => P.AGY_DENY.includes(`${k}(*)`),
    ) &&
      P.AGY_DENY.length === 7 &&
      P.AGY_SETTINGS.allowNonWorkspaceAccess === false,
    'Antigravity: every kind of tool is denied, with only rule kinds it accepts',
    JSON.stringify(P.AGY_DENY),
  );
  // the moment it reaches for any tool, Bento stops it
  {
    const b = P.ADAPTERS.antigravity.build({ name: 'flash', system: 's', prompt: 'p' });
    let stopped = null;
    const r = spawnSync(process.execPath, [fake, '--as', 'agy', ...b.args], {
      input: b.stdin,
      env: { ...process.env, FAKE_AI_AGY_TOOL: 'search_web', FAKE_AI_THINK_MS: '1' },
      encoding: 'utf8',
      timeout: 8000,
    });
    const sink = {
      text() {},
      think() {},
      tokens() {},
      error() {},
      limits() {},
      requests() {},
      full: () => '',
      seen: () => false,
      abort: (m) => {
        stopped ||= m;
      },
    };
    for (const line of r.stdout.split('\n')) {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      P.ADAPTERS.antigravity.parse(o, sink);
    }
    check(
      /search_web.*Bento stopped it/.test(stopped || ''),
      'Antigravity reaching for a tool (web search here) is stopped at once',
      stopped || 'not stopped',
    );
  }
  check(
    /github\.com\/settings\/copilot/.test(
      P.humanize('copilot', 'Error: No Copilot access for this account'),
    ),
    'Copilot without a plan: says how to turn on Copilot Free',
    '',
  );
  check(
    /version Bento can’t talk to yet.*codex update/.test(
      P.humanize('codex', 'Error: Unknown feature flag: shell_tool'),
    ),
    'an outdated Codex: says how to update it',
    P.humanize('codex', 'Error: Unknown feature flag: x'),
  );
  check(
    P.parseModel('gemini:flash; rm -rf /').id === 'gemini:auto' &&
      P.parseModel('nobody:x').prov === 'claude',
    'odd model names never reach a command line',
    JSON.stringify(P.parseModel('gemini:flash; rm -rf /')),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

// Reading a lesson as it streams, forgiving the slips models make: a comma after each block (Claude Haiku does this
// on some replies), the whole lesson in [ ], fences, a block over several lines, and one broken block among good ones
{
  const { ndjsonParser } = await import('../src/lesson.js');
  const read = (text, chunk = 7) => {
    const out = [];
    const p = ndjsonParser((b) => out.push(b));
    for (let i = 0; i < text.length; i += chunk) p.push(text.slice(i, i + chunk));
    p.end();
    return out;
  };
  const blocks = [
    { t: 'title', title: 'Binary search' },
    { t: 'p', md: 'Halve it, every time.' },
    { t: 'code', file: 'b.py', code: 'x = 1\nprint(x)' },
  ];
  const kinds = (bs) => bs.map((b) => b.t).join(',');
  check(
    kinds(read(blocks.map((b) => JSON.stringify(b)).join('\n'))) === 'title,p,code',
    'clean lines are read',
    '',
  );
  check(
    kinds(read(blocks.map((b) => JSON.stringify(b) + ',').join('\n'))) === 'title,p,code',
    'a comma after each block is forgiven',
    kinds(read(blocks.map((b) => JSON.stringify(b) + ',').join('\n'))),
  );
  check(
    kinds(read('[\n' + blocks.map((b) => JSON.stringify(b)).join(',\n') + '\n]')) ===
      'title,p,code',
    'a lesson wrapped in [ ] is read',
    '',
  );
  check(
    kinds(read('```json\n' + blocks.map((b) => JSON.stringify(b)).join('\n') + '\n```')) ===
      'title,p,code',
    'code fences around it are ignored',
    '',
  );
  check(
    kinds(
      read(
        [
          JSON.stringify(blocks[0]),
          JSON.stringify(blocks[1], null, 2),
          JSON.stringify(blocks[2]),
        ].join('\n'),
      ),
    ) === 'title,p,code',
    'a block spread over several lines is read',
    '',
  );
  check(
    kinds(
      read(
        [
          JSON.stringify(blocks[0]),
          '{"t":"p","md":"oops, cut off',
          JSON.stringify(blocks[1]),
          JSON.stringify(blocks[2]),
        ].join('\n'),
      ),
    ) === 'title,p,code',
    'one broken block doesn’t swallow the rest of the lesson',
    '',
  );
  const notes = { t: 'notes', items: [{ from: 1, to: 2, label: 'a', text: 'b' }] };
  check(
    kinds(read(JSON.stringify(notes, null, 2))) === 'notes' &&
      read(JSON.stringify(notes, null, 2))[0].items.length === 1,
    'a spread-out block with objects inside stays one block',
    JSON.stringify(read(JSON.stringify(notes, null, 2))),
  );
}
// code a model wrote by hand, not quite JSON: it's mended, never dropped (a lost code block leaves a lesson pointing at nothing)
{
  const { ndjsonParser } = await import('../src/lesson.js');
  const codeOf = (text) => {
    const got = [];
    const p = ndjsonParser((b) => got.push(b));
    p.push('{"t":"title","title":"T"}\n' + text + '\n{"t":"pseudo","lines":["a"]}\n');
    p.end();
    return got.find((b) => b.t === 'code')?.code;
  };
  check(
    codeOf(
      String.raw`{"t":"code","file":"a.py","code":"import re\nprint(re.findall(r'\d+', 'a1'), 'it\'s')"}`,
    ) ===
      String.raw`import re` + '\n' + String.raw`print(re.findall(r'\d+', 'a1'), 'it\'s')`,
    "a Python backslash left as it is (\\d, \\') doesn’t lose the code",
    codeOf(String.raw`{"t":"code","file":"a.py","code":"print(r'\d')"}`),
  );
  const five = codeOf(
    '{"t":"code","file":"a.py","code":"def f(n):\n    if n == 0:\n        return 1\n    return n * f(n - 1)\nprint(f(4))"}',
  );
  check(
    five === 'def f(n):\n    if n == 0:\n        return 1\n    return n * f(n - 1)\nprint(f(4))',
    'code spread over many lines with real breaks is read whole, indentation kept',
    JSON.stringify(five),
  );
  check(
    codeOf('{"t":"code","file":"a.py","code":"x = 1\tprint(x)"}') === 'x = 1\tprint(x)',
    'a raw tab inside the code is kept',
    '',
  );
}

// your own AI agent using Bento (electron/agent.cjs, src/agent.js): arguments are checked, its lesson becomes a real
// lesson, runs are put into words, and the setup command quotes a path with spaces
{
  const { createRequire } = await import('node:module');
  const { checkArgs, TOOLS } = createRequire(import.meta.url)('../electron/agent.cjs');
  const { lessonFromAgent, describeRun, describeView, agentCommand, agentName } =
    await import('../src/agent.js');
  check(
    TOOLS.map((t) => t.name).join() === 'show_lesson,get_learner_view,highlight_code,run_code' &&
      TOOLS.every((t) => t.inputSchema?.type === 'object' && t.description.length > 40),
    'four tools, each with a schema and a description',
    TOOLS.map((t) => t.name).join(),
  );
  check(
    /language must be/.test(
      checkArgs('show_lesson', { title: 'x', code: 'x', language: 'cobol' }).error,
    ) &&
      /needs code/.test(
        checkArgs('show_lesson', { title: 'x', language: 'python', code: '  ' }).error,
      ) &&
      /no tool/.test(checkArgs('rm_rf', {}).error),
    'show_lesson refuses a made-up language or no code; unknown tools are refused',
    '',
  );
  const a = checkArgs('show_lesson', {
    title: 'T',
    language: 'python',
    code: 'a = 1\nb = 2\nprint(a + b)',
    pseudo: ['one'],
    quiz: { q: '?', choices: ['3'], answer: 0 },
    notes: [{ from: '2', text: 'n' }, { text: 'no line' }],
  }).args;
  check(
    a.quiz === null && a.notes.length === 1 && a.notes[0].from === 2 && a.notes[0].to === 2,
    'a one-choice quiz is dropped; notes need a line (numbers written as text count)',
    JSON.stringify(a),
  );
  const L = lessonFromAgent(a, 'claude-code');
  check(
    L.status === 'done' &&
      L.agent === 'Claude Code' &&
      L.kicker === 'from Claude Code' &&
      L.code.startsWith('a = 1') &&
      L.pseudo.length === 3 &&
      L.pseudo[1] === '' &&
      L.lang === 'python',
    'its lesson is a finished Bento lesson, signed by the agent, one plain-English line per code line',
    JSON.stringify({ ...L, story: undefined }),
  );
  check(
    agentName('codex-mcp-client') === 'Codex' &&
      agentName('') === 'your agent' &&
      agentName('Zed') === 'Zed',
    'agents are named the way people know them',
    '',
  );
  const d = describeRun({
    logs: [{ k: 'log', s: 'hi' }],
    visuals: [{ type: 'bars', data: [1, 2], label: 'n' }],
    error: { msg: 'NameError: x', line: 4 },
  });
  check(
    /Printed:\nhi/.test(d) &&
      /bar chart "n": \[1, 2\]/.test(d) &&
      /Error on line 4: NameError/.test(d),
    'a run is put into words: what printed, what it drew, the error and its line',
    d,
  );
  check(
    /home page/.test(describeView({ view: 'home' })) &&
      /No lesson is open/.test(describeView({ view: 'home' })),
    'with no lesson open the agent is told so',
    '',
  );
  const v = describeView({
    view: 'lesson',
    lesson: L,
    code: 'a = 5\nprint(a)',
    run: { r: { logs: [{ k: 'log', s: '5' }] }, src: 'a = 5\nprint(a)' },
  });
  check(
    /they changed it/.test(v) &&
      /  2  print\(a\)/.test(v) &&
      /Printed:\n5/.test(v) &&
      !/earlier version/.test(v),
    'the learner’s own edits are shown with line numbers, with the run of that very code',
    v,
  );
  const cmd = ['/Applications/My Apps/Bento.app/Contents/MacOS/Bento', '--mcp'];
  check(
    agentCommand('claude', cmd) ===
      'claude mcp add bento --scope user -- "/Applications/My Apps/Bento.app/Contents/MacOS/Bento" --mcp',
    'the Claude Code command quotes a path with a space',
    agentCommand('claude', cmd),
  );
  check(
    agentCommand('gemini', ['/x/Bento', '--mcp']) ===
      'gemini mcp add --scope user bento /x/Bento --mcp' &&
      JSON.parse(agentCommand('json', cmd)).mcpServers.bento.args[0] === '--mcp',
    'Gemini and the plain settings shape are right too',
    agentCommand('gemini', ['/x/Bento', '--mcp']),
  );
}

// ---------------------------------------------------------------- Windows, and "What's new"
{
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const W = req('../electron/wincmd.cjs');
  const CAT = req('../electron/ai-catalog.json');
  const claude = CAT.providers.find((p) => p.id === 'claude');
  check(
    W.forPlatform(claude, 'win32').install[0].cmd.startsWith('irm ') &&
      W.forPlatform(claude, 'darwin').install[0].cmd.startsWith('curl '),
    'Windows: Claude installs with PowerShell there, curl on the Mac',
    '',
  );
  check(
    CAT.providers.every(
      (p) => !(W.forPlatform(p, 'win32').install || []).some((i) => /\bbrew\b|\| bash/.test(i.cmd)),
    ) && !/brew/.test(W.forPlatform(CAT.github, 'win32').update),
    'Windows: no Homebrew or bash commands are offered',
    '',
  );
  const [exe, args] = W.powershellWindow('irm https://claude.ai/install.ps1 | iex');
  check(
    exe === 'powershell.exe' &&
      args.at(-1) ===
        "Start-Process powershell.exe -ArgumentList '-NoExit -Command irm https://claude.ai/install.ps1 | iex'",
    'Windows: a setup command opens in its own PowerShell window',
    args.at(-1),
  );
  check(
    W.psQuote("it's") === "'it''s'",
    'Windows: a quote inside a PowerShell string is doubled',
    W.psQuote("it's"),
  );
  let threw = false;
  try {
    W.powershellWindow('a\nb');
  } catch {
    threw = true;
  }
  check(threw, 'Windows: a command with a line break is refused', '');
  const { swapMacWords } = await import('../src/winwords.js');
  check(
    swapMacWords('Open a folder on this Mac') === 'Open a folder on this PC' &&
      swapMacWords('MacBook and macOS') === 'MacBook and macOS' &&
      swapMacWords('your Mac’s name') === 'your PC’s name',
    'Windows: Bento’s own words say PC, and MacBook or macOS stay as they are',
    swapMacWords('Open a folder on this Mac'),
  );
  const { notesFor } = await import('../src/notes.js');
  const fs = await import('node:fs');
  const log = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const n = notesFor('0.3.1', log);
  check(
    n && n.items.length >= 3 && /spiral/.test(n.items[0]) && !notesFor('9.9.9', log),
    'What’s new: a version’s notes come from CHANGELOG.md',
    n ? `${n.items.length} items` : 'none',
  );
}

process.exit(fail ? 1 : 0);
