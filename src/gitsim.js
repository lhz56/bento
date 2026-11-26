// A pretend terminal with a pretend Git, for learning without touching real files.
// Enough of both to learn the everyday loop: make files, stage them, commit, branch, merge (with conflicts).
let seq = 0;
const id = () => (++seq).toString(16).padStart(4, '0') + Math.random().toString(16).slice(2, 5);

export function fresh() {
  return {
    cwd: '/home',
    files: { '/home': null },
    repo: null,
    out: [
      {
        k: 'sys',
        s: 'A pretend terminal. Nothing here touches your real files. Type `help` to see what it understands.',
      },
    ],
    last: null,
  };
}

const join = (cwd, p) => {
  if (!p || p === '~') return '/home';
  let parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/');
  const out = [];
  for (const x of parts) {
    if (!x || x === '.') continue;
    if (x === '..') out.pop();
    else out.push(x);
  }
  return '/' + out.join('/');
};
const isDir = (sim, p) => sim.files[p] === null;
const children = (sim, dir) =>
  Object.keys(sim.files).filter(
    (p) =>
      p !== dir &&
      p.startsWith(dir === '/' ? '/' : dir + '/') &&
      !p.slice(dir.length + 1).includes('/'),
  );
const rel = (sim, p) => p.slice(sim.repo.root.length + 1);
const inRepo = (sim, p) => sim.repo && (p === sim.repo.root || p.startsWith(sim.repo.root + '/'));
function workTree(sim) {
  const t = {};
  for (const [p, v] of Object.entries(sim.files))
    if (v !== null && inRepo(sim, p)) t[rel(sim, p)] = v;
  return t;
}
const headTree = (sim) => {
  const c = sim.repo.commits[sim.repo.branches[sim.repo.head]];
  return c ? c.tree : {};
};

export function status(sim) {
  if (!sim.repo) return null;
  const width = workTree(sim),
    index = sim.repo.index,
    head = headTree(sim);
  const names = [
    ...new Set([...Object.keys(width), ...Object.keys(index), ...Object.keys(head)]),
  ].sort();
  return names
    .map((n) => {
      const staged =
        index[n] !== head[n]
          ? head[n] === undefined
            ? 'new'
            : index[n] === undefined
              ? 'deleted'
              : 'modified'
          : null;
      const work =
        width[n] !== index[n]
          ? index[n] === undefined
            ? 'untracked'
            : width[n] === undefined
              ? 'deleted'
              : 'modified'
          : null;
      return { name: n, staged, work };
    })
    .filter((x) => x.staged || x.work);
}

function tokens(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
function ancestors(sim, cid) {
  const seen = new Set();
  const st = [cid];
  while (st.length) {
    const c = st.pop();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    st.push(...(sim.repo.commits[c]?.parents || []));
  }
  return seen;
}

// Plain words for each command, shown after you run it
export const EXPLAIN = {
  pwd: [
    'Where am I?',
    'Prints the folder you’re in.',
    'like checking the “you are here” dot on a map',
  ],
  ls: ['List', 'Shows what’s in this folder.', 'like opening a drawer to look inside'],
  cd: [
    'Change directory',
    'Moves you into another folder. `..` means “up one”.',
    'like walking into another room',
  ],
  mkdir: [
    'Make directory',
    'Creates a new, empty folder.',
    'like putting a new empty box on the shelf',
  ],
  touch: [
    'Touch',
    'Creates an empty file (or updates its time if it exists).',
    'like putting a blank sheet of paper in the box',
  ],
  echo: [
    'Echo',
    'Prints text. With `>` it writes the text into a file; `>>` adds to the end.',
    'like writing on the sheet of paper',
  ],
  cat: ['Cat', 'Shows what’s inside a file.', 'like reading the sheet aloud'],
  rm: [
    'Remove',
    'Deletes a file. There’s no bin, so be careful in a real terminal!',
    'like shredding the paper',
  ],
  'git init': [
    'Start a repository',
    'Tells Git to start watching this folder and keep its history.',
    'like giving a project its own photo album',
  ],
  'git status': [
    'Status',
    'Shows what changed since your last commit, and what’s ready to commit.',
    'like checking which photos you’ve picked but not stuck in the album yet',
  ],
  'git add': [
    'Stage',
    'Picks changes to go into the next commit (the “staging area”).',
    'like putting photos in a pile, ready to stick in the album',
  ],
  'git commit': [
    'Commit',
    'Saves everything you staged as one snapshot, with a message saying why.',
    'like sticking the pile into the album and writing a caption',
  ],
  'git log': ['Log', 'Lists the snapshots, newest first.', 'like flipping back through the album'],
  'git branch': [
    'Branch',
    'Makes a new line of work that starts from here, without touching the main one.',
    'like photocopying the album to try a new layout',
  ],
  'git checkout': [
    'Switch',
    'Moves you to another branch: your files change to match it.',
    'like picking up the other copy of the album',
  ],
  'git switch': [
    'Switch',
    'Moves you to another branch: your files change to match it.',
    'like picking up the other copy of the album',
  ],
  'git merge': [
    'Merge',
    'Brings another branch’s work into this one. If both changed the same lines, you decide.',
    'like combining the two albums into one',
  ],
  'git diff': [
    'Diff',
    'Shows exactly which lines changed and haven’t been staged yet.',
    'like comparing two drafts side by side',
  ],
  'git restore': [
    'Restore',
    'Throws away changes to a file, back to the last staged version.',
    'like tearing up a draft and taking the clean copy',
  ],
};

export function run(S0, line) {
  const sim = {
    ...S0,
    files: { ...S0.files },
    repo: S0.repo
      ? {
          ...S0.repo,
          index: { ...S0.repo.index },
          branches: { ...S0.repo.branches },
          commits: { ...S0.repo.commits },
        }
      : null,
    out: [...S0.out, { k: 'cmd', s: line, cwd: S0.cwd, branch: S0.repo?.head }],
    last: null,
  };
  const say = (s, k = 'out') => sim.out.push({ k, s });
  const t = tokens(line.trim());
  if (!t.length) return S0;
  const [cmd, ...a] = t;
  const key = cmd === 'git' ? `git ${a[0] || ''}`.trim() : cmd;
  sim.last = EXPLAIN[key] ? key : null;
  try {
    if (cmd === 'help')
      say(
        'Folders & files: pwd · ls · cd <folder> · mkdir <name> · touch <file> · echo "text" > <file> · cat <file> · rm <file> · clear\nGit: git init · git status · git add <file|.> · git commit -m "message" · git log · git branch [name] · git switch <branch> (or checkout, -c to create) · git merge <branch> · git diff · git restore <file>',
      );
    else if (cmd === 'clear') sim.out = [];
    else if (cmd === 'pwd') say(sim.cwd);
    else if (cmd === 'ls') {
      const kids = children(sim, sim.cwd)
        .map((p) => p.split('/').pop() + (isDir(sim, p) ? '/' : ''))
        .sort();
      say(kids.length ? kids.join('  ') : '(empty)');
    } else if (cmd === 'cd') {
      const p = join(sim.cwd, a[0]);
      if (!isDir(sim, p)) throw new Error(`cd: no such folder: ${a[0]}`);
      sim.cwd = p;
    } else if (cmd === 'mkdir') {
      if (!a[0]) throw new Error('mkdir: give the folder a name');
      const p = join(sim.cwd, a[0]);
      if (p in sim.files) throw new Error(`mkdir: ${a[0]} already exists`);
      sim.files[p] = null;
    } else if (cmd === 'touch') {
      if (!a[0]) throw new Error('touch: give the file a name');
      for (const f of a) {
        const p = join(sim.cwd, f);
        if (!(p in sim.files)) sim.files[p] = '';
      }
    } else if (cmd === 'cat') {
      const p = join(sim.cwd, a[0]);
      if (sim.files[p] == null) throw new Error(`cat: ${a[0]}: no such file`);
      say(sim.files[p] || '(empty file)');
    } else if (cmd === 'rm') {
      const p = join(sim.cwd, a[0]);
      if (!(p in sim.files) || isDir(sim, p)) throw new Error(`rm: ${a[0]}: no such file`);
      delete sim.files[p];
    } else if (cmd === 'echo') {
      const i = a.findIndex((x) => x === '>' || x === '>>');
      const text = (i < 0 ? a : a.slice(0, i)).join(' ');
      if (i < 0) say(text);
      else {
        const p = join(sim.cwd, a[i + 1]);
        if (!a[i + 1]) throw new Error('echo: where should the text go?');
        if (isDir(sim, p)) throw new Error(`${a[i + 1]} is a folder`);
        sim.files[p] = a[i] === '>>' && sim.files[p] ? `${sim.files[p]}\n${text}` : text;
      }
    } else if (cmd === 'git') gitCmd(sim, a, say);
    else
      throw new Error(
        `${cmd}: command not found. Type help to see what this terminal understands.`,
      );
  } catch (e) {
    say(e.message, 'err');
    sim.last = null;
  }
  return sim;
}

function gitCmd(sim, a, say) {
  const sub = a[0];
  if (sub === 'init') {
    if (sim.repo) throw new Error('There’s already a repository here.');
    sim.repo = { root: sim.cwd, head: 'main', branches: { main: null }, commits: {}, index: {} };
    say(`Initialized an empty Git repository in ${sim.cwd}`);
    return;
  }
  if (!sim.repo || !inRepo(sim, sim.cwd))
    throw new Error('fatal: not a git repository. Run `git init` first.');
  const repo = sim.repo;
  if (sub === 'status') {
    const st = status(sim);
    say(`On branch ${repo.head}`);
    if (!st.length) {
      say(
        repo.branches[repo.head]
          ? 'nothing to commit, working tree clean'
          : 'No commits yet. Nothing to commit (create a file, then git add it)',
      );
      return;
    }
    const staged = st.filter((x) => x.staged),
      work = st.filter((x) => x.work && x.work !== 'untracked'),
      un = st.filter((x) => x.work === 'untracked');
    if (staged.length)
      say(
        'Changes to be committed:\n' + staged.map((x) => `    ${x.staged}: ${x.name}`).join('\n'),
        'ok',
      );
    if (work.length)
      say(
        'Changes not staged for commit:\n' + work.map((x) => `    ${x.work}: ${x.name}`).join('\n'),
        'warn',
      );
    if (un.length) say('Untracked files:\n' + un.map((x) => `    ${x.name}`).join('\n'), 'err');
    return;
  }
  if (sub === 'add') {
    if (!a[1])
      throw new Error('Nothing specified. Try `git add .` (everything) or `git add <file>`.');
    const width = workTree(sim);
    const names =
      a[1] === '.' || a[1] === '-A'
        ? [...new Set([...Object.keys(width), ...Object.keys(repo.index)])]
        : a.slice(1).map((f) => rel(sim, join(sim.cwd, f)));
    for (const n of names) {
      if (width[n] === undefined && repo.index[n] === undefined)
        throw new Error(`fatal: pathspec '${n}' did not match any files`);
      if (width[n] === undefined) delete repo.index[n];
      else repo.index[n] = width[n];
    }
    return;
  }
  if (sub === 'commit') {
    const mi = a.indexOf('-m');
    const msg = mi >= 0 ? a[mi + 1] : null;
    if (!msg) throw new Error('Add a message: git commit -m "what you changed and why"');
    const head = headTree(sim);
    if (JSON.stringify(repo.index) === JSON.stringify(head))
      throw new Error('nothing to commit (did you `git add` your changes?)');
    const parents = repo.branches[repo.head] ? [repo.branches[repo.head]] : [];
    if (repo.merging) parents.push(repo.merging); // finishing a merge you resolved by hand
    const c = {
      id: id(),
      msg,
      parents,
      tree: { ...repo.index },
      branch: repo.head,
      at: Date.now(),
    };
    repo.merging = null;
    repo.commits[c.id] = c;
    repo.branches[repo.head] = c.id;
    say(`[${repo.head} ${c.id.slice(0, 7)}] ${msg}`, 'ok');
    return;
  }
  if (sub === 'log') {
    let c = repo.branches[repo.head];
    if (!c) throw new Error('No commits yet.');
    const lines = [];
    while (c) {
      const commit = repo.commits[c];
      lines.push(
        `${commit.id.slice(0, 7)}  ${commit.msg}${Object.entries(repo.branches)
          .filter(([, v]) => v === c)
          .map(([b]) => `  (${b})`)
          .join('')}`,
      );
      c = commit.parents[0];
    }
    say(lines.join('\n'));
    return;
  }
  if (sub === 'branch') {
    if (!a[1]) {
      say(
        Object.keys(repo.branches)
          .map((b) => (b === repo.head ? `* ${b}` : `  ${b}`))
          .join('\n'),
      );
      return;
    }
    if (!repo.branches[repo.head]) throw new Error('Make a first commit before branching.');
    if (a[1] in repo.branches) throw new Error(`A branch named '${a[1]}' already exists.`);
    repo.branches[a[1]] = repo.branches[repo.head];
    return;
  }
  if (sub === 'checkout' || sub === 'switch') {
    const create = a[1] === '-b' || a[1] === '-c';
    const name = create ? a[2] : a[1];
    if (!name) throw new Error('Which branch?');
    if (create) {
      if (name in repo.branches) throw new Error(`A branch named '${name}' already exists.`);
      repo.branches[name] = repo.branches[repo.head];
      repo.head = name;
      say(`Switched to a new branch '${name}'`, 'ok');
      return;
    }
    if (!(name in repo.branches))
      throw new Error(`error: no branch called '${name}'. Make it with git branch ${name}.`);
    if (status(sim).some((x) => (x.work && x.work !== 'untracked') || x.staged))
      throw new Error(
        'error: your changes would be lost. Commit them (or git restore) before switching.',
      );
    setTree(sim, repo.commits[repo.branches[name]]?.tree || {});
    repo.head = name;
    say(`Switched to branch '${name}'`, 'ok');
    return;
  }
  if (sub === 'merge') {
    const name = a[1];
    if (!(name in repo.branches)) throw new Error(`merge: ${name} - not something we can merge`);
    const ours = repo.branches[repo.head],
      theirs = repo.branches[name];
    if (theirs === ours || ancestors(sim, ours).has(theirs)) {
      say('Already up to date.');
      return;
    }
    if (!ours || ancestors(sim, theirs).has(ours)) {
      repo.branches[repo.head] = theirs;
      setTree(sim, repo.commits[theirs].tree);
      say(`Fast-forward: ${repo.head} now includes everything from ${name}`, 'ok');
      return;
    }
    // a real merge: find what each side changed since they split
    const base = [...ancestors(sim, ours)].find(
      (c) =>
        ancestors(sim, theirs).has(c) &&
        ![...ancestors(sim, ours)].some(
          (d) => d !== c && ancestors(sim, theirs).has(d) && ancestors(sim, d).has(c),
        ),
    );
    const baseTree = repo.commits[base]?.tree || {},
      oursTree = repo.commits[ours].tree,
      theirsTree = repo.commits[theirs].tree;
    const out = {};
    const conflicts = [];
    for (const n of new Set([
      ...Object.keys(baseTree),
      ...Object.keys(oursTree),
      ...Object.keys(theirsTree),
    ])) {
      if (oursTree[n] === theirsTree[n]) {
        if (oursTree[n] !== undefined) out[n] = oursTree[n];
      } else if (oursTree[n] === baseTree[n]) {
        if (theirsTree[n] !== undefined) out[n] = theirsTree[n];
      } else if (theirsTree[n] === baseTree[n]) {
        if (oursTree[n] !== undefined) out[n] = oursTree[n];
      } else {
        conflicts.push(n);
        out[n] =
          `<<<<<<< ${repo.head}\n${oursTree[n] ?? ''}\n=======\n${theirsTree[n] ?? ''}\n>>>>>>> ${name}`;
      }
    }
    setTree(sim, out);
    if (conflicts.length) {
      repo.index = { ...oursTree };
      repo.merging = theirs;
      say(
        `CONFLICT in ${conflicts.join(', ')}: both branches changed the same thing.\nOpen the file (cat), write the version you want (echo "…" > file), then git add and git commit.`,
        'err',
      );
      return;
    }
    repo.index = { ...out };
    const c = {
      id: id(),
      msg: `Merge ${name} into ${repo.head}`,
      parents: [ours, theirs],
      tree: { ...out },
      branch: repo.head,
      at: Date.now(),
    };
    repo.commits[c.id] = c;
    repo.branches[repo.head] = c.id;
    say(`Merged ${name} into ${repo.head} with a merge commit.`, 'ok');
    return;
  }
  if (sub === 'diff') {
    const width = workTree(sim);
    const lines = [];
    for (const [n, v] of Object.entries(width)) {
      const old = repo.index[n];
      if (old === undefined || old === v) continue;
      lines.push(`--- ${n}`);
      for (const l of old.split('\n')) if (!v.split('\n').includes(l)) lines.push(`- ${l}`);
      for (const l of v.split('\n')) if (!old.split('\n').includes(l)) lines.push(`+ ${l}`);
    }
    say(lines.length ? lines.join('\n') : '(no unstaged changes)');
    return;
  }
  if (sub === 'restore') {
    const n = rel(sim, join(sim.cwd, a[1] || ''));
    if (repo.index[n] === undefined) throw new Error(`error: ${a[1]} isn’t tracked yet`);
    sim.files[`${repo.root}/${n}`] = repo.index[n];
    return;
  }
  throw new Error(`git: '${sub}' isn't something this pretend Git knows. Type help.`);
}
function setTree(sim, tree) {
  for (const p of Object.keys(sim.files))
    if (sim.files[p] !== null && inRepo(sim, p)) delete sim.files[p];
  for (const [n, v] of Object.entries(tree)) {
    const p = `${sim.repo.root}/${n}`;
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (!(dir in sim.files)) sim.files[dir] = null;
    sim.files[p] = v;
  }
}

// A short guided tour; each mission is done when its check is true
export const MISSIONS = [
  [
    'Make a project folder',
    'Create a folder called `my-app` and go into it.',
    'mkdir my-app, then cd my-app',
    (sim) => sim.cwd === '/home/my-app',
  ],
  [
    'Start keeping history',
    'Turn the folder into a Git repository.',
    'git init',
    (sim) => !!sim.repo,
  ],
  [
    'Write your first file',
    'Create `index.html` with some text in it.',
    'echo "Hello" > index.html',
    (sim) => sim.repo && !!sim.files[`${sim.repo.root}/index.html`],
  ],
  [
    'Stage it',
    'Put the file in the staging area, ready to save.',
    'git add index.html',
    (sim) => sim.repo && sim.repo.index['index.html'] !== undefined,
  ],
  [
    'Save a snapshot',
    'Commit it with a message.',
    'git commit -m "First page"',
    (sim) => sim.repo && Object.keys(sim.repo.commits).length >= 1,
  ],
  [
    'Try an idea on a branch',
    'Make a branch called `dark` and switch to it.',
    'git switch -c dark',
    (sim) => sim.repo?.head === 'dark',
  ],
  [
    'Change it there',
    'Change index.html on the dark branch, then add and commit.',
    'echo "Hello in the dark" > index.html, git add ., git commit -m "Dark mode"',
    (sim) => sim.repo && Object.values(sim.repo.commits).some((c) => c.branch === 'dark'),
  ],
  [
    'Bring it home',
    'Switch back to main and merge dark into it.',
    'git switch main, then git merge dark',
    (sim) =>
      (sim.repo?.head === 'main' &&
        sim.repo.branches.main &&
        sim.repo.branches.main === sim.repo.branches.dark) ||
      Object.values(sim.repo?.commits || {}).some((c) => c.parents.length === 2),
  ],
];
