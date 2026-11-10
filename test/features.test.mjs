// Checks for the playgrounds, skill map, packs, Big-O fitting and input() — the logic, without the app.
// node test/features.test.mjs
globalThis.self = globalThis.self || {};
let fail = 0;
const check = (ok, label, extra = '') => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` → ${extra}`}`); };

// input()/prompt() in JavaScript: answers come in; with none left, the run asks
{ const { handle } = await import('../src/runtime/jsWorker.js');
  const code = 'const name = prompt("Name? ");\nconst age = Number(prompt("Age? "));\nconsole.log(name + " will be " + (age + 1));';
  const r1 = await handle({ id: 1, mode: 'run', code, extra: { answers: [] } });
  check(r1.need?.prompt === 'Name? ' && !r1.error, 'prompt() pauses to ask', JSON.stringify(r1.need || r1.error));
  const r2 = await handle({ id: 2, mode: 'run', code, extra: { answers: ['Ana', '9'] } });
  check(r2.logs.map((l) => l.s).join('|') === 'Ana|9|Ana will be 10' && !r2.need, 'answers replay in order', r2.logs.map((l) => l.s).join('|')); }

// The pretend terminal and Git
{ const G = await import('../src/gitsim.js');
  let S = G.fresh(); const done = new Set();
  for (const c of ['mkdir my-app', 'cd my-app', 'git init', 'echo "Hello" > index.html', 'git add index.html', 'git commit -m "First"', 'git switch -c dark', 'echo "Dark" > index.html', 'git add .', 'git commit -m "Dark"', 'git switch main', 'git merge dark']) { S = G.run(S, c); G.MISSIONS.forEach((m, i) => m[3](S) && done.add(i)); }
  check(done.size === G.MISSIONS.length, 'all git missions can be completed', `${done.size}/${G.MISSIONS.length}`);
  check(S.files['/home/my-app/index.html'] === 'Dark', 'fast-forward merge brings the change', S.files['/home/my-app/index.html']);
  S = G.run(S, 'git switch -c a'); S = G.run(S, 'echo "A" > x.txt'); S = G.run(S, 'git add .'); S = G.run(S, 'git commit -m a'); S = G.run(S, 'git switch main'); S = G.run(S, 'echo "B" > x.txt'); S = G.run(S, 'git add .'); S = G.run(S, 'git commit -m b'); S = G.run(S, 'git merge a');
  check(/CONFLICT/.test(S.out.at(-1).s) && S.files['/home/my-app/x.txt'].includes('<<<<<<<'), 'conflicting changes show conflict markers');
  S = G.run(S, 'echo "AB" > x.txt'); S = G.run(S, 'git add x.txt'); S = G.run(S, 'git commit -m resolve');
  const last = Object.values(S.repo.commits).sort((a, b) => a.at - b.at).at(-1);
  check(last.parents.length === 2, 'resolving a conflict makes a merge commit', JSON.stringify(last.parents));
  check(G.run(G.fresh(), 'git status').out.at(-1).k === 'err', 'git outside a repository explains itself'); }

// SQL: how a query runs, step by step; answers compared fairly
{ const Q = await import('../src/sql.js');
  const steps = Q.pipeline(Q.CHALLENGES.find((c) => c[0] === 'boss')[3]).map((s) => s.k).join(' ');
  check(steps === 'FROM JOIN GROUP BY SELECT ORDER BY', 'a join + group query becomes steps', steps);
  check(Q.clauses('SELECT (SELECT 1) FROM t') === null, 'subqueries skip the picture');
  check(Q.sameResult({ cols: ['a'], rows: [[1], [2]] }, { cols: ['x'], rows: [[2], [1]] }, false) && !Q.sameResult({ cols: ['a'], rows: [[1], [2]] }, { cols: ['x'], rows: [[2], [1]] }, true), 'row order matters only when sorting'); }

// Skill map: free-form concepts land on the right stars
{ const K = await import('../src/skills.js');
  for (const [c, want] of [['hash maps', 'hashmap'], ['Big-O', 'bigo'], ['binary search trees', 'tree'], ['SQL', 'database'], ['off-by-one errors', 'debug'], ['consistent hashing', 'sharding']]) check(K.skillsFor(c).includes(want), `“${c}” lights ${want}`, K.skillsFor(c).join(','));
  // stars light from evidence, not from opening things
  const L = (extra) => ({ id: 'l1', status: 'done', title: 'Hash maps', concepts: ['hash maps'], createdAt: 1, chat: [], ...extra });
  const lv = (opts) => K.masteryOf({ progress: {}, lessons: [], puzzles: [], stops: [], ideas: [], ...opts }).hashmap.level;
  check(lv({ lessons: [L()] }) === 1, 'opening a lesson only counts as “seen” (the star stays dark)');
  check(lv({ lessons: [L({ chat: [{ q: 'a' }, { q: 'b' }, { q: 'c' }] })] }) === 2, 'asking three questions about it means “getting it”');
  check(lv({ lessons: [L({ checks: [{ ok: true }, { ok: true }] })] }) === 3, 'two checks right means “know it”');
  check(lv({ lessons: [L({ checks: [{ ok: false }, { ok: false }] })] }) === 1, 'wrong answers don’t light anything');
  check(lv({ progress: { awarded: ['l1:run', 'l1:step'] }, lessons: [L()] }) === 2, 'running and stepping through the code means “getting it”');
  check(lv({ progress: { reviewScores: { hashmap: { right: 2, total: 3, at: 1 } } } }) === 3, 'a map quiz passed counts as proof');
  const m = K.masteryOf({ progress: {}, lessons: [L({ chat: [{ q: 'why?' }] })], puzzles: [], stops: [], ideas: [] });
  check(m.hashmap.from.some((f) => f.kind === 'asked') && m.hashmap.from.some((f) => f.kind === 'seen'), 'each star keeps the evidence behind it', JSON.stringify(m.hashmap.from)); }

// Content packs
{ globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const P = await import('../src/packs.js'); const fs = await import('node:fs');
  const good = P.validatePack(JSON.parse(fs.readFileSync(new URL('../docs/example-pack.json', import.meta.url))));
  check(!good.errors.length && good.pack.puzzles.length === 2 && good.pack.paths[0].stops.length === 4, 'the example pack is valid', good.errors.join(' '));
  const bad = P.validatePack({ bento: 'pack', name: 'x', puzzles: [{ id: 'a', title: 'A' }] });
  check(bad.errors.length === 1 && /missing/.test(bad.errors[0]), 'a broken pack says what’s missing', bad.errors.join(' '));
  check(P.validatePack({ name: 'nope' }).errors.length === 1, 'non-packs are refused'); }

// Big-O from timings: shapes, plus the never-better-than-target rule
{ const Z = await import('../src/puzzles.js');
  const pts = (f) => [16, 32, 64, 128, 256, 512, 1024, 2048, 4096].map((n) => [n, f(n) * 1e-7]);
  check(Z.fitScale(pts((n) => n * n), 'O(n)').label === 'O(n²)', 'quadratic timings read as O(n²)');
  check(Z.fitScale(pts((n) => n), 'O(n)').label === 'O(n)', 'linear timings read as O(n)');
  check(Z.fitScale(pts((n) => Math.log2(n) * 50), 'O(log n)').label === 'O(log n)', 'log timings read as O(log n)');
  const exp = [4, 6, 8, 10, 12, 14, 16].map((n) => [n, Math.pow(1.6, n) * 1e-6]);
  check(Z.fitScale(exp, 'O(n)').label === 'O(2ⁿ)', 'step-by-step sizes catch exponential growth');
  check(Z.humanTime(86400 * 1.2).t === '1 day' && Z.humanTime(3600 * 5).t === '5 hours', 'times read naturally', Z.humanTime(86400 * 1.2).t); }

// Lesson code can reach the public internet only: never your Mac or your home network, not even through a redirect
{ const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url);
  const N = require('../electron/netfetch.cjs');
  const priv = ['127.0.0.1', '10.0.0.8', '192.168.1.1', '172.20.3.4', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.0.1', '::ffff:127.0.0.1'];
  check(priv.every(N.isPrivate), 'loopback, private, link-local and mapped addresses count as private', priv.filter((x) => !N.isPrivate(x)).join(' '));
  check(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '172.32.0.1'].every((x) => !N.isPrivate(x)), 'public addresses are allowed');
  check(['localhost', 'printer.local', 'db.internal', 'nas.home.arpa', 'x.localhost', '[::1]', '192.168.0.10'].every((h) => !N.hostAllowed(h)), 'local names are refused before any lookup');
  let msg = ''; try { await N.safeFetch('http://127.0.0.1:1/'); } catch (e) { msg = e.message; }
  check(/public internet/.test(msg), 'fetching 127.0.0.1 is refused with a plain explanation', msg);
  msg = ''; try { await N.safeFetch('file:///etc/passwd'); } catch (e) { msg = e.message; }
  check(/Only http/.test(msg), 'file:// addresses are refused', msg);
  // a public page that redirects into your network: the next hop goes through the same guard
  const hops = []; const fake = async (url, o) => { hops.push(url); if (url.startsWith('https://public.example')) return { status: 302, headers: { location: 'http://192.168.1.1/admin' }, text: '' }; return N.once(url, o); };
  msg = ''; try { await N.follow('https://public.example/go', {}, fake); } catch (e) { msg = e.message; }
  check(hops.length === 2 && /192\.168\.1\.1/.test(msg), 'a redirect into the home network is refused', `${hops.join(' → ')} :: ${msg}`);
  // DNS rebinding: a public-looking name that resolves to a private address is refused at connect time
  const dns = require('node:dns'); const real = dns.lookup;
  dns.lookup = (host, opts, cb) => (host === 'sneaky.example' ? cb(null, [{ address: '10.0.0.5', family: 4 }]) : real(host, opts, cb));
  msg = ''; try { await N.safeFetch('http://sneaky.example/'); } catch (e) { msg = e.message; } finally { dns.lookup = real; }
  check(/public internet/.test(msg), 'a name that resolves to a private address is refused when connecting', msg);
  // 303 after a POST turns into a GET without the body
  const seen = []; const r = await N.follow('https://a.example/form', { method: 'POST', body: 'x=1' }, async (url, o) => { seen.push(`${o.method || 'GET'} ${url} ${o.body ? 'body' : ''}`.trim()); return url.endsWith('/form') ? { status: 303, headers: { location: '/done' }, text: '' } : { status: 200, headers: { 'content-type': 'text/plain' }, text: 'ok' }; });
  check(r.text === 'ok' && seen[1] === 'GET https://a.example/done', '303 after a form post continues as a plain GET', seen.join(' | ')); }

// Checking AI-written lessons against what the code really did
{ const V = await import('../src/verify.js');
  const L = { title: 'Sum', lang: 'python', code: 'total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)', pseudo: ['start at zero', 'go through each number', 'add it', 'show it'],
    notes: [{ from: 2, to: 3, text: 'the loop' }, { from: 9, text: 'past the end' }],
    story: [{ t: 'p', md: 'Line [[4|print]] shows the total, and [[12|this]] is wrong. The program prints 7 at the end.' },
      { t: 'quiz', q: 'What does it print?', choices: ['5', '6', '7'], answer: 2, why: 'Because 1+2+3 is 7.' },
      { t: 'quiz', q: 'broken', choices: ['only one'], answer: 0 }] };
  const loc = V.localChecks(L);
  check(loc.patch.story && !loc.patch.story[0].md.includes('[[12|') && loc.patch.story[0].md.includes('[[4|print]]'), 'links to lines that don’t exist become plain text; good links stay');
  check(loc.patch.story.filter((b) => b.t === 'quiz').length === 1, 'a quiz without a valid answer is removed');
  check(loc.patch.notes?.length === 1, 'notes pointing past the code are dropped');
  const run = { logs: [{ k: 'out', s: '6' }] };
  const prompt = V.checkPrompt({ ...L, ...loc.patch }, run);
  check(prompt.includes('ACTUAL OUTPUT WHEN RUN:\n6') && prompt.includes('4| print(total)'), 'the fact-check sees the numbered code and the real output');
  const L2 = { ...L, ...loc.patch };
  const verdict = { quizzes: [{ i: 0, correct: 1, sure: true, why: '1 + 2 + 3 is 6.' }], fixes: [{ p: 0, quote: 'The program prints 7 at the end.', fix: 'The program prints 6 at the end.' }, { p: 0, quote: 'words that are not there', fix: 'x' }] };
  const out = V.applyCheck(L2, verdict);
  const q = out.patch.story.find((b) => b.t === 'quiz');
  check(q.answer === 1 && q.why.startsWith('1 + 2 + 3 is 6.') && !q.why.includes('is 7'), 'a wrong quiz answer is corrected, with a new explanation', JSON.stringify(q));
  check(out.patch.story[0].md.includes('prints 6 at the end') && out.corrections.length === 2, 'a false sentence is fixed; a quote that isn’t in the text is ignored', JSON.stringify(out.corrections));
  const unsure = V.applyCheck(L2, { quizzes: [{ i: 0, correct: 1, sure: false }], fixes: [] });
  check(!unsure.corrections.length && !unsure.patch.story, 'nothing changes when the checker isn’t sure'); }

// Questions about real projects open the real code: the name, where it is (this Mac, GitHub), and the decision
{ const F = await import('../src/findProject.js');
  const names = (q) => F.projectNames(q);
  check(JSON.stringify(names('hey explain how t3 code works')) === '["t3 code"]', 'the project name is pulled out of a casual question', JSON.stringify(names('hey explain how t3 code works')));
  check(names('explain the excalidraw codebase')[0] === 'excalidraw' && names('what is the architecture of VS Code')[0] === 'VS Code', 'codebase and architecture questions name their project');
  check(['how does a hash map work', 'how does recursion work', 'why do traffic jams appear from nowhere?', 'how does the internet work', 'how do neural networks learn'].every((q) => !names(q).length), 'ordinary questions about ideas are left alone');
  const t3 = { stars: 54552, full: 'pingdotgg/t3code', description: 'A minimal web GUI for coding agents' };
  const app = { app: 'T3 Code (Beta)', version: '0.1.6', source: { full: 'pingdotgg/t3code' } };
  const d1 = F.decide('hey explain how t3 code works', ['t3 code'], { installed: [app], local: [], github: [t3] });
  check(d1.kind === 'go' && d1.why === 'installed' && d1.pick.full === 'pingdotgg/t3code' && d1.pick.app.version === '0.1.6', 'an app on this Mac that names its source goes straight to that repo', JSON.stringify(d1).slice(0, 160));
  const d2 = F.decide('how does t3 code work', ['t3 code'], { installed: [app], local: [{ root: '/x/t3code', name: 't3code', remote: 'pingdotgg/t3code', byRemote: true }], github: [t3] });
  check(d2.pick.local?.root === '/x/t3code', 'a clone you already have is used instead of downloading');
  const d3 = F.decide('how does t3 code work', ['t3 code'], { installed: [], local: [], github: [t3, { full: 'someone/t3code-fork', stars: 40 }] });
  check(d3.kind === 'ask' && d3.pick.full === 'pingdotgg/t3code', 'found only on GitHub: Bento asks before opening it', JSON.stringify(d3).slice(0, 120));
  const d4 = F.decide('explain the t3code codebase', ['t3code'], { installed: [], local: [], github: [t3] });
  check(d4.kind === 'go', '“the … codebase” with one famous match goes straight there');
  const what = names('what is python');
  check(!what.length || F.decide('what is python', what, { installed: [], local: [], github: [{ full: 'TheAlgorithms/Python', stars: 200000 }] }).kind === 'none', '“what is python” stays a lesson even though a famous repo is called Python');
  check(F.decide('how does obscure thing work', ['obscure thing'], { installed: [], local: [], github: [{ full: 'a/obscurething', stars: 12 }] }).kind === 'none', 'small look-alike repos are ignored'); }
{ const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url);
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const P = require('../electron/findproject.cjs');
  check(P.ghFull('git@github.com:pingdotgg/t3code.git') === 'pingdotgg/t3code' && P.ghFull('https://github.com/a/b/tree/main') === 'a/b' && P.norm('T3 Code (Beta).app') === 't3code', 'GitHub addresses and app names are read the same way');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-find-'));
  // a pretend app bundle that says where its code lives
  const res = path.join(tmp, 'Apps', 'Thing (Beta).app', 'Contents', 'Resources'); fs.mkdirSync(path.join(res, 'app'), { recursive: true });
  fs.writeFileSync(path.join(res, 'app', 'package.json'), JSON.stringify({ name: 'thing', repository: { url: 'git+https://github.com/someone/thing.git' } }));
  check(P.sourceOfApp(path.join(tmp, 'Apps', 'Thing (Beta).app'))?.full === 'someone/thing', 'an app’s package.json leads to its repo');
  fs.writeFileSync(path.join(res, 'app-update.yml'), 'owner: pingdotgg\nrepo: t3code\nprovider: github\n');
  check(P.sourceOfApp(path.join(tmp, 'Apps', 'Thing (Beta).app'))?.full === 'pingdotgg/t3code', 'an app’s update settings lead to its repo');
  // pretend code folders: a clone named differently but pointing at the repo, and one with the same name
  const code = path.join(tmp, 'code'); fs.mkdirSync(path.join(code, 'my-fork', '.git'), { recursive: true }); fs.mkdirSync(path.join(code, 'org', 't3code', '.git'), { recursive: true });
  fs.writeFileSync(path.join(code, 'my-fork', '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:pingdotgg/t3code.git\n');
  process.env.BENTO_CODE_ROOTS = code;
  const found = P.localClones(['t3 code'], ['pingdotgg/t3code']);
  check(found[0]?.name === 'my-fork' && found[0].byRemote && found.some((f) => f.root.endsWith(path.join('org', 't3code'))), 'clones are found by where they came from, and by name one folder deeper', JSON.stringify(found));
  delete process.env.BENTO_CODE_ROOTS; fs.rmSync(tmp, { recursive: true, force: true }); }

// Opened from Finder, the app starts with a tiny PATH: it asks your login shell for the real one, and never hangs on it
if (process.platform !== 'win32') { const { createRequire } = await import('node:module'); const req = createRequire(import.meta.url);
  const S = req('../electron/shellenv.cjs'); const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  check(S.mergePath('/a:/b', '/b:/c:') === '/a:/b:/c', 'PATH pieces merge without repeats', S.mergePath('/a:/b', '/b:/c:'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-sh-')); const fake = path.join(dir, 'zsh');
  fs.writeFileSync(fake, '#!/bin/sh\nprintf "noise from a greeting\\n"; printf "__BENTO_PATH__/opt/fake/bin:/usr/bin__BENTO_PATH__"\n'); fs.chmodSync(fake, 0o755);
  const got = await S.resolvePath('/usr/bin:/bin', { env: { ...process.env, SHELL: fake } });
  check(got.startsWith('/opt/fake/bin:/usr/bin') && got.endsWith(':/bin'), 'the login shell PATH comes first, even with a chatty shell startup', got);
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 20\n');
  const t0 = Date.now(); const slow = await S.resolvePath('/usr/bin:/bin', { env: { ...process.env, SHELL: fake }, timeout: 600 });
  check(Date.now() - t0 < 3000 && slow.includes('/usr/bin'), 'a shell that never answers is given up on quickly', `${Date.now() - t0}ms`);
  fs.rmSync(dir, { recursive: true, force: true }); }

// A question a built-in lesson already answers is offered ready-made, before asking your AI
{ const { coveredBy } = await import('../src/findProject.js');
  const bst = 'Binary search trees How does a binary search tree work? trees recursion';
  check(coveredBy('how does a binary search tree work?', bst) && coveredBy('binary search trees please', bst), 'questions a built-in lesson covers find it', '');
  check(!coveredBy('what is a hash map', bst) && !coveredBy('how do search trees handle deletes', bst) && !coveredBy('how does it work', bst), 'other questions don’t', '');
  check(!coveredBy('Binary search trees', 'Search race: one by one vs halving Linear search vs binary search race'), 'a search race is not a lesson about search trees', ''); }

// Saving on a full disk (or crashing mid-write) keeps the last good copy instead of half a file
{ const { createRequire } = await import('node:module'); const { writeSafe } = createRequire(import.meta.url)('../electron/safewrite.cjs');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-sw-')); const f = path.join(dir, 'store.json');
  check(writeSafe(f, '{"a":1}') && fs.readFileSync(f, 'utf8') === '{"a":1}', 'a save writes the file', '');
  fs.mkdirSync(`${f}.tmp`); // the new copy can't be written (as on a full disk)
  const ok = writeSafe(f, '{"a":2}');
  check(!ok && fs.readFileSync(f, 'utf8') === '{"a":1}', 'a save that fails leaves the last good copy', fs.readFileSync(f, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true }); }

// Bento reopens where you left it, unless that screen is gone
{ const { createRequire } = await import('node:module'); const W = createRequire(import.meta.url)('../electron/winstate.cjs');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-ws-')); const f = path.join(dir, 'window.json');
  const fb = { width: 1440, height: 900, minWidth: 1080, minHeight: 680 }; const laptop = [{ workArea: { x: 0, y: 25, width: 1512, height: 920 } }];
  check(W.load(f, laptop, fb).x == null && W.load(f, laptop, fb).width === 1440, 'first launch uses the default size', '');
  fs.writeFileSync(f, JSON.stringify({ x: 40, y: 60, width: 1200, height: 800, maximized: false }));
  const a = W.load(f, laptop, fb); check(a.x === 40 && a.y === 60 && a.width === 1200, 'the last size and place come back', JSON.stringify(a));
  fs.writeFileSync(f, JSON.stringify({ x: 2600, y: 100, width: 1300, height: 820 })); // it was on an external screen, now unplugged
  const b = W.load(f, laptop, fb); check(b.x == null && b.width === 1300, 'a window on an unplugged screen opens on this one', JSON.stringify(b));
  fs.writeFileSync(f, JSON.stringify({ x: 10, y: 30, width: 300, height: 200 })); check(W.load(f, laptop, fb).width === 1080, 'never smaller than the minimum', '');
  fs.writeFileSync(f, 'not json'); check(W.load(f, laptop, fb).width === 1440, 'a damaged file falls back to the default', '');
  fs.rmSync(dir, { recursive: true, force: true }); }

// Release notes: one version's section of the changelog, nothing more
{ const { notesFor } = await import('../scripts/release-notes.mjs');
  const md = '# Changelog\n\n## 0.3.0\n\n- New map\n\n## 0.2.0\n\n- First release\n';
  check(notesFor(md, '0.3.0') === '- New map' && notesFor(md, '0.2.0') === '- First release', 'each version gets only its own notes', JSON.stringify(notesFor(md, '0.3.0')));
  check(notesFor(md, '0.4.0') === null && notesFor(md, '0.2') === null, 'a version with no notes is caught, and 0.2 isn’t 0.2.0', ''); }

// A daily copy of your lessons, a week kept, in the same format Restore… reads
{ const { createRequire } = await import('node:module'); const req = createRequire(import.meta.url);
  const { daily } = req('../electron/snapshots.cjs'); const { writeSafe } = req('../electron/safewrite.cjs');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-snap-'));
  check(daily(dir, { 'bento.settings': {} }, writeSafe) === null, 'nothing is copied before there is anything to keep', '');
  const store = { 'bento.lessons': [{ id: 'a', title: 'Loops' }], 'bento.progress': { words: {} }, 'bento.storyW': 0.5 };
  for (let d = 1; d <= 9; d++) daily(dir, store, writeSafe, { now: new Date(2026, 10, d, 12) });
  fs.writeFileSync(path.join(dir, 'my notes.txt'), 'mine');
  daily(dir, store, writeSafe, { now: new Date(2026, 10, 9, 18) }); // same day again: no second copy
  const left = fs.readdirSync(dir).sort();
  check(left.filter((f) => f.startsWith('Bento backup')).length === 7 && left.includes('Bento backup 2026-11-09.json') && !left.includes('Bento backup 2026-11-02.json'), 'a week of daily copies is kept, oldest dropped', left.join(', '));
  check(left.includes('my notes.txt'), 'files that aren’t Bento’s are left alone', '');
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'Bento backup 2026-11-09.json'), 'utf8'));
  check(j.bento === 'backup' && j.data['bento.lessons'][0].title === 'Loops' && !('bento.storyW' in j.data), 'a copy restores like a manual backup, with only what matters', JSON.stringify(Object.keys(j.data)));
  fs.rmSync(dir, { recursive: true, force: true }); }

// Picking the built-in lesson that fits best, and telling a lesson topic from a project
{ const { bestBuiltin, namesALesson } = await import('../src/findProject.js');
  const B = [{ label: 'Drawing a spiral', alt: 'Draw a sunflower with math', find: 'Drawing a spiral loops trig' }, { label: 'Doing things again', alt: 'Loops: drawing a pattern', find: 'Doing things again Loops: drawing a pattern Teach me loops' },
    { label: 'Binary search trees', alt: 'How does a binary search tree work?', find: 'Binary search trees How does a binary search tree work? trees recursion' }, { label: 'Clicks that run code', alt: '', find: 'Clicks that run code How do clicks on a web page run code?' }];
  check(bestBuiltin('teach me loops', B)?.label === 'Doing things again', 'the lesson named after the topic wins over one that only mentions it', bestBuiltin('teach me loops', B)?.label);
  check(!bestBuiltin('how does this code work', B) && !bestBuiltin('what is code', B), 'a vague question gets no suggestion', '');
  check(namesALesson('binary search tree', B) && !namesALesson('t3 code', B) && !namesALesson('react', B), '“binary search tree” is a topic; “T3 Code” and “React” are projects', ''); }

// Folders a page could open as a project on its own: real projects yes, the whole disk, home, system or secrets no
{ const { createRequire } = await import('node:module'); const { projectRootOk } = createRequire(import.meta.url)('../electron/roots.cjs');
  const H = '/Users/ana';
  check(['/', H, '/Users', `${H}/.ssh`, `${H}/Library/Keychains`, '/etc', '/System/Library'].every((p) => !projectRootOk(p, H)), 'the disk, home, system folders and secrets can’t be opened as a project', '');
  check([`${H}/Projects/app`, `${H}/Library/Application Support/Bento/repos/a__b`, '/Volumes/Work/code/app', `${H}/Desktop/site`].every((p) => projectRootOk(p, H)), 'real project folders can', ''); }

// Paths: every stop has its own id and is one thing; every lesson on a path ships pre-written (it opens instantly,
// with no AI); stops that open another part of Bento point at something real
{ const { TRACKS, ALL_STOPS } = await import('../src/paths.js'); const { ideaById } = await import('../src/ideas.js');
  const fs = await import('node:fs'); const PRE = JSON.parse(fs.readFileSync(new URL('../src/path-prebuilt.json', import.meta.url), 'utf8'));
  const ids = ALL_STOPS.map((s) => s.id);
  check(new Set(ids).size === ids.length && new Set(TRACKS.map((x) => x.k)).size === TRACKS.length, 'every path and every stop has its own id', ids.filter((x, i) => ids.indexOf(x) !== i).join(' '));
  const kind = (s) => ['q', 'explore', 'site', 'play', 'idea'].filter((k) => s[k]);
  check(ALL_STOPS.every((s) => kind(s).length === 1 && s.t && s.d), 'every stop is one thing: a lesson, a real app or website, a playground or a clever idea', ALL_STOPS.filter((s) => kind(s).length !== 1).map((s) => s.id).join(' '));
  check(ALL_STOPS.filter((s) => s.idea).every((s) => ideaById[s.idea]) && ALL_STOPS.filter((s) => s.play).every((s) => ['sql', 'git', 'design'].includes(s.play)), 'clever-idea and playground stops point at real ones', '');
  check(TRACKS.every((x) => x.icon && x.title && x.d && x.end && x.stops.length >= 6), 'every path has an icon, a finish line and at least six stops', '');
  const { SKILLS, skillsFor } = await import('../src/skills.js'); const { stopSkills } = await import('../src/paths.js'); const known = new Set(SKILLS.map((x) => x[0]));
  const badSk = ALL_STOPS.flatMap((s) => (s.sk || []).filter((k) => !known.has(k)).map((k) => `${s.id}:${k}`));
  const noSk = ALL_STOPS.filter((s) => !stopSkills(s, skillsFor).length).map((s) => s.id);
  check(!badSk.length && noSk.length <= 2, 'path stops fill in real skills on your map', `unknown ${badSk.join(' ')} · none ${noSk.join(' ')}`);
  const missing = ALL_STOPS.filter((s) => s.q && !PRE[s.id]).map((s) => s.id);
  check(!missing.length, 'every lesson on a path ships pre-written', `not written yet: ${missing.join(' ')}`);
  const bad = Object.entries(PRE).filter(([, L]) => !L.story?.length || !(L.code || L.steps?.length) || (L.code && L.pseudo?.length !== L.code.split('\n').length)).map(([k]) => k);
  check(!bad.length, 'each pre-written path lesson has a story, code, and a plain-English line for every line of code', bad.join(' ')); }

process.exit(fail ? 1 : 0);
