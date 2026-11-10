// A pretend terminal with a pretend Git, for learning without touching real files.
// Enough of both to learn the everyday loop: make files, stage them, commit, branch, merge (with conflicts).
let seq = 0;
const id = () => (++seq).toString(16).padStart(4, '0') + Math.random().toString(16).slice(2, 5);

export function fresh() {
  return { cwd: '/home', files: { '/home': null }, repo: null, out: [{ k: 'sys', s: 'A pretend terminal. Nothing here touches your real files. Type `help` to see what it understands.' }], last: null };
}

const join = (cwd, p) => { if (!p || p === '~') return '/home'; let parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/'); const out = []; for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); } return '/' + out.join('/'); };
const isDir = (S, p) => S.files[p] === null;
const children = (S, dir) => Object.keys(S.files).filter((p) => p !== dir && p.startsWith(dir === '/' ? '/' : dir + '/') && !p.slice(dir.length + 1).includes('/'));
const rel = (S, p) => p.slice(S.repo.root.length + 1);
const inRepo = (S, p) => S.repo && (p === S.repo.root || p.startsWith(S.repo.root + '/'));
function workTree(S) { const t = {}; for (const [p, v] of Object.entries(S.files)) if (v !== null && inRepo(S, p)) t[rel(S, p)] = v; return t; }
const headTree = (S) => { const c = S.repo.commits[S.repo.branches[S.repo.head]]; return c ? c.tree : {}; };

export function status(S) {
  if (!S.repo) return null;
  const W = workTree(S), I = S.repo.index, H = headTree(S);
  const names = [...new Set([...Object.keys(W), ...Object.keys(I), ...Object.keys(H)])].sort();
  return names.map((n) => {
    const staged = I[n] !== H[n] ? (H[n] === undefined ? 'new' : I[n] === undefined ? 'deleted' : 'modified') : null;
    const work = W[n] !== I[n] ? (I[n] === undefined ? 'untracked' : W[n] === undefined ? 'deleted' : 'modified') : null;
    return { name: n, staged, work };
  }).filter((x) => x.staged || x.work);
}

function tokens(line) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]); return out; }
function ancestors(S, cid) { const seen = new Set(); const st = [cid]; while (st.length) { const c = st.pop(); if (!c || seen.has(c)) continue; seen.add(c); st.push(...(S.repo.commits[c]?.parents || [])); } return seen; }

// Plain words for each command, shown after you run it
export const EXPLAIN = {
  pwd: ['Where am I?', 'Prints the folder you’re in.', 'like checking the “you are here” dot on a map'],
  ls: ['List', 'Shows what’s in this folder.', 'like opening a drawer to look inside'],
  cd: ['Change directory', 'Moves you into another folder. `..` means “up one”.', 'like walking into another room'],
  mkdir: ['Make directory', 'Creates a new, empty folder.', 'like putting a new empty box on the shelf'],
  touch: ['Touch', 'Creates an empty file (or updates its time if it exists).', 'like putting a blank sheet of paper in the box'],
  echo: ['Echo', 'Prints text. With `>` it writes the text into a file; `>>` adds to the end.', 'like writing on the sheet of paper'],
  cat: ['Cat', 'Shows what’s inside a file.', 'like reading the sheet aloud'],
  rm: ['Remove', 'Deletes a file. There’s no bin, so be careful in a real terminal!', 'like shredding the paper'],
  'git init': ['Start a repository', 'Tells Git to start watching this folder and keep its history.', 'like giving a project its own photo album'],
  'git status': ['Status', 'Shows what changed since your last commit, and what’s ready to commit.', 'like checking which photos you’ve picked but not stuck in the album yet'],
  'git add': ['Stage', 'Picks changes to go into the next commit (the “staging area”).', 'like putting photos in a pile, ready to stick in the album'],
  'git commit': ['Commit', 'Saves everything you staged as one snapshot, with a message saying why.', 'like sticking the pile into the album and writing a caption'],
  'git log': ['Log', 'Lists the snapshots, newest first.', 'like flipping back through the album'],
  'git branch': ['Branch', 'Makes a new line of work that starts from here, without touching the main one.', 'like photocopying the album to try a new layout'],
  'git checkout': ['Switch', 'Moves you to another branch: your files change to match it.', 'like picking up the other copy of the album'],
  'git switch': ['Switch', 'Moves you to another branch: your files change to match it.', 'like picking up the other copy of the album'],
  'git merge': ['Merge', 'Brings another branch’s work into this one. If both changed the same lines, you decide.', 'like combining the two albums into one'],
  'git diff': ['Diff', 'Shows exactly which lines changed and haven’t been staged yet.', 'like comparing two drafts side by side'],
  'git restore': ['Restore', 'Throws away changes to a file, back to the last staged version.', 'like tearing up a draft and taking the clean copy'],
};

export function run(S0, line) {
  const S = { ...S0, files: { ...S0.files }, repo: S0.repo ? { ...S0.repo, index: { ...S0.repo.index }, branches: { ...S0.repo.branches }, commits: { ...S0.repo.commits } } : null, out: [...S0.out, { k: 'cmd', s: line, cwd: S0.cwd, branch: S0.repo?.head }], last: null };
  const say = (s, k = 'out') => S.out.push({ k, s });
  const t = tokens(line.trim()); if (!t.length) return S0;
  const [cmd, ...a] = t;
  const key = cmd === 'git' ? `git ${a[0] || ''}`.trim() : cmd;
  S.last = EXPLAIN[key] ? key : null;
  try {
    if (cmd === 'help') say('Folders & files: pwd · ls · cd <folder> · mkdir <name> · touch <file> · echo "text" > <file> · cat <file> · rm <file> · clear\nGit: git init · git status · git add <file|.> · git commit -m "message" · git log · git branch [name] · git switch <branch> (or checkout, -c to create) · git merge <branch> · git diff · git restore <file>');
    else if (cmd === 'clear') S.out = [];
    else if (cmd === 'pwd') say(S.cwd);
    else if (cmd === 'ls') { const kids = children(S, S.cwd).map((p) => p.split('/').pop() + (isDir(S, p) ? '/' : '')).sort(); say(kids.length ? kids.join('  ') : '(empty)'); }
    else if (cmd === 'cd') { const p = join(S.cwd, a[0]); if (!isDir(S, p)) throw new Error(`cd: no such folder: ${a[0]}`); S.cwd = p; }
    else if (cmd === 'mkdir') { if (!a[0]) throw new Error('mkdir: give the folder a name'); const p = join(S.cwd, a[0]); if (p in S.files) throw new Error(`mkdir: ${a[0]} already exists`); S.files[p] = null; }
    else if (cmd === 'touch') { if (!a[0]) throw new Error('touch: give the file a name'); for (const f of a) { const p = join(S.cwd, f); if (!(p in S.files)) S.files[p] = ''; } }
    else if (cmd === 'cat') { const p = join(S.cwd, a[0]); if (S.files[p] == null) throw new Error(`cat: ${a[0]}: no such file`); say(S.files[p] || '(empty file)'); }
    else if (cmd === 'rm') { const p = join(S.cwd, a[0]); if (!(p in S.files) || isDir(S, p)) throw new Error(`rm: ${a[0]}: no such file`); delete S.files[p]; }
    else if (cmd === 'echo') {
      const i = a.findIndex((x) => x === '>' || x === '>>'); const text = (i < 0 ? a : a.slice(0, i)).join(' ');
      if (i < 0) say(text); else { const p = join(S.cwd, a[i + 1]); if (!a[i + 1]) throw new Error('echo: where should the text go?'); if (isDir(S, p)) throw new Error(`${a[i + 1]} is a folder`); S.files[p] = a[i] === '>>' && S.files[p] ? `${S.files[p]}\n${text}` : text; }
    }
    else if (cmd === 'git') gitCmd(S, a, say);
    else throw new Error(`${cmd}: command not found. Type help to see what this terminal understands.`);
  } catch (e) { say(e.message, 'err'); S.last = null; }
  return S;
}

function gitCmd(S, a, say) {
  const sub = a[0];
  if (sub === 'init') { if (S.repo) throw new Error('There’s already a repository here.'); S.repo = { root: S.cwd, head: 'main', branches: { main: null }, commits: {}, index: {} }; say(`Initialized an empty Git repository in ${S.cwd}`); return; }
  if (!S.repo || !inRepo(S, S.cwd)) throw new Error('fatal: not a git repository. Run `git init` first.');
  const R = S.repo;
  if (sub === 'status') {
    const st = status(S); say(`On branch ${R.head}`);
    if (!st.length) { say(R.branches[R.head] ? 'nothing to commit, working tree clean' : 'No commits yet. Nothing to commit (create a file, then git add it)'); return; }
    const staged = st.filter((x) => x.staged), work = st.filter((x) => x.work && x.work !== 'untracked'), un = st.filter((x) => x.work === 'untracked');
    if (staged.length) say('Changes to be committed:\n' + staged.map((x) => `    ${x.staged}: ${x.name}`).join('\n'), 'ok');
    if (work.length) say('Changes not staged for commit:\n' + work.map((x) => `    ${x.work}: ${x.name}`).join('\n'), 'warn');
    if (un.length) say('Untracked files:\n' + un.map((x) => `    ${x.name}`).join('\n'), 'err');
    return;
  }
  if (sub === 'add') {
    if (!a[1]) throw new Error('Nothing specified. Try `git add .` (everything) or `git add <file>`.');
    const W = workTree(S); const names = a[1] === '.' || a[1] === '-A' ? [...new Set([...Object.keys(W), ...Object.keys(R.index)])] : a.slice(1).map((f) => rel(S, join(S.cwd, f)));
    for (const n of names) { if (W[n] === undefined && R.index[n] === undefined) throw new Error(`fatal: pathspec '${n}' did not match any files`); if (W[n] === undefined) delete R.index[n]; else R.index[n] = W[n]; }
    return;
  }
  if (sub === 'commit') {
    const mi = a.indexOf('-m'); const msg = mi >= 0 ? a[mi + 1] : null; if (!msg) throw new Error('Add a message: git commit -m "what you changed and why"');
    const H = headTree(S); if (JSON.stringify(R.index) === JSON.stringify(H)) throw new Error('nothing to commit (did you `git add` your changes?)');
    const parents = R.branches[R.head] ? [R.branches[R.head]] : []; if (R.merging) parents.push(R.merging); // finishing a merge you resolved by hand
    const c = { id: id(), msg, parents, tree: { ...R.index }, branch: R.head, at: Date.now() }; R.merging = null;
    R.commits[c.id] = c; R.branches[R.head] = c.id; say(`[${R.head} ${c.id.slice(0, 7)}] ${msg}`, 'ok'); return;
  }
  if (sub === 'log') { let c = R.branches[R.head]; if (!c) throw new Error('No commits yet.'); const lines = []; while (c) { const C = R.commits[c]; lines.push(`${C.id.slice(0, 7)}  ${C.msg}${Object.entries(R.branches).filter(([, v]) => v === c).map(([b]) => `  (${b})`).join('')}`); c = C.parents[0]; } say(lines.join('\n')); return; }
  if (sub === 'branch') { if (!a[1]) { say(Object.keys(R.branches).map((b) => (b === R.head ? `* ${b}` : `  ${b}`)).join('\n')); return; } if (!R.branches[R.head]) throw new Error('Make a first commit before branching.'); if (a[1] in R.branches) throw new Error(`A branch named '${a[1]}' already exists.`); R.branches[a[1]] = R.branches[R.head]; return; }
  if (sub === 'checkout' || sub === 'switch') {
    const create = a[1] === '-b' || a[1] === '-c'; const name = create ? a[2] : a[1]; if (!name) throw new Error('Which branch?');
    if (create) { if (name in R.branches) throw new Error(`A branch named '${name}' already exists.`); R.branches[name] = R.branches[R.head]; R.head = name; say(`Switched to a new branch '${name}'`, 'ok'); return; }
    if (!(name in R.branches)) throw new Error(`error: no branch called '${name}'. Make it with git branch ${name}.`);
    if (status(S).some((x) => x.work && x.work !== 'untracked' || x.staged)) throw new Error('error: your changes would be lost. Commit them (or git restore) before switching.');
    setTree(S, R.commits[R.branches[name]]?.tree || {}); R.head = name; say(`Switched to branch '${name}'`, 'ok'); return;
  }
  if (sub === 'merge') {
    const name = a[1]; if (!(name in R.branches)) throw new Error(`merge: ${name} - not something we can merge`);
    const ours = R.branches[R.head], theirs = R.branches[name];
    if (theirs === ours || ancestors(S, ours).has(theirs)) { say('Already up to date.'); return; }
    if (!ours || ancestors(S, theirs).has(ours)) { R.branches[R.head] = theirs; setTree(S, R.commits[theirs].tree); say(`Fast-forward: ${R.head} now includes everything from ${name}`, 'ok'); return; }
    // a real merge: find what each side changed since they split
    const base = [...ancestors(S, ours)].find((c) => ancestors(S, theirs).has(c) && ![...ancestors(S, ours)].some((d) => d !== c && ancestors(S, theirs).has(d) && ancestors(S, d).has(c)));
    const B = R.commits[base]?.tree || {}, O = R.commits[ours].tree, T = R.commits[theirs].tree; const out = {}; const conflicts = [];
    for (const n of new Set([...Object.keys(B), ...Object.keys(O), ...Object.keys(T)])) {
      if (O[n] === T[n]) { if (O[n] !== undefined) out[n] = O[n]; } else if (O[n] === B[n]) { if (T[n] !== undefined) out[n] = T[n]; } else if (T[n] === B[n]) { if (O[n] !== undefined) out[n] = O[n]; }
      else { conflicts.push(n); out[n] = `<<<<<<< ${R.head}\n${O[n] ?? ''}\n=======\n${T[n] ?? ''}\n>>>>>>> ${name}`; }
    }
    setTree(S, out);
    if (conflicts.length) { R.index = { ...O }; R.merging = theirs; say(`CONFLICT in ${conflicts.join(', ')}: both branches changed the same thing.\nOpen the file (cat), write the version you want (echo "…" > file), then git add and git commit.`, 'err'); return; }
    R.index = { ...out }; const c = { id: id(), msg: `Merge ${name} into ${R.head}`, parents: [ours, theirs], tree: { ...out }, branch: R.head, at: Date.now() };
    R.commits[c.id] = c; R.branches[R.head] = c.id; say(`Merged ${name} into ${R.head} with a merge commit.`, 'ok'); return;
  }
  if (sub === 'diff') { const W = workTree(S); const lines = []; for (const [n, v] of Object.entries(W)) { const old = R.index[n]; if (old === undefined || old === v) continue; lines.push(`--- ${n}`); for (const l of old.split('\n')) if (!v.split('\n').includes(l)) lines.push(`- ${l}`); for (const l of v.split('\n')) if (!old.split('\n').includes(l)) lines.push(`+ ${l}`); } say(lines.length ? lines.join('\n') : '(no unstaged changes)'); return; }
  if (sub === 'restore') { const n = rel(S, join(S.cwd, a[1] || '')); if (R.index[n] === undefined) throw new Error(`error: ${a[1]} isn’t tracked yet`); S.files[`${R.root}/${n}`] = R.index[n]; return; }
  throw new Error(`git: '${sub}' isn't something this pretend Git knows. Type help.`);
}
function setTree(S, tree) {
  for (const p of Object.keys(S.files)) if (S.files[p] !== null && inRepo(S, p)) delete S.files[p];
  for (const [n, v] of Object.entries(tree)) { const p = `${S.repo.root}/${n}`; const dir = p.slice(0, p.lastIndexOf('/')); if (!(dir in S.files)) S.files[dir] = null; S.files[p] = v; }
}

// A short guided tour; each mission is done when its check is true
export const MISSIONS = [
  ['Make a project folder', 'Create a folder called `my-app` and go into it.', 'mkdir my-app, then cd my-app', (S) => S.cwd === '/home/my-app'],
  ['Start keeping history', 'Turn the folder into a Git repository.', 'git init', (S) => !!S.repo],
  ['Write your first file', 'Create `index.html` with some text in it.', 'echo "Hello" > index.html', (S) => S.repo && !!S.files[`${S.repo.root}/index.html`]],
  ['Stage it', 'Put the file in the staging area, ready to save.', 'git add index.html', (S) => S.repo && S.repo.index['index.html'] !== undefined],
  ['Save a snapshot', 'Commit it with a message.', 'git commit -m "First page"', (S) => S.repo && Object.keys(S.repo.commits).length >= 1],
  ['Try an idea on a branch', 'Make a branch called `dark` and switch to it.', 'git switch -c dark', (S) => S.repo?.head === 'dark'],
  ['Change it there', 'Change index.html on the dark branch, then add and commit.', 'echo "Hello in the dark" > index.html, git add ., git commit -m "Dark mode"', (S) => S.repo && Object.values(S.repo.commits).some((c) => c.branch === 'dark')],
  ['Bring it home', 'Switch back to main and merge dark into it.', 'git switch main, then git merge dark', (S) => S.repo?.head === 'main' && S.repo.branches.main && S.repo.branches.main === S.repo.branches.dark || Object.values(S.repo?.commits || {}).some((c) => c.parents.length === 2)],
];
