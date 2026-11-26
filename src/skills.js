// The skill map: ~45 core concepts in six regions, lit up by everything you do in Bento
// (lessons, puzzles, path stops, clever ideas, words) and dimming when you haven't touched them in a while.
export const REGIONS = [
  { id: 'basics', name: 'The basics', color: '#ff8a5b', at: [215, 190] },
  { id: 'algo', name: 'Algorithms', color: '#7c5cff', at: [640, 190] },
  { id: 'web', name: 'The web', color: '#2f80ed', at: [1035, 190] },
  { id: 'tools', name: 'Tools of the trade', color: '#12a37a', at: [215, 480] },
  { id: 'systems', name: 'Big systems', color: '#e5484d', at: [640, 480] },
  { id: 'ai', name: 'AI', color: '#d4a017', at: [1035, 480] },
];

// [id, region, name, aliases (matched as whole words in any concept, word or tag), plain words]
/** Each skill: [id, region, name, words that count as this skill, what it is]
 * @type {Array<[string, string, string, string[], string]>} */
export const SKILLS = [
  [
    'program',
    'basics',
    'Programs',
    ['program', 'statement', 'print'],
    'Instructions the computer follows one line at a time.',
  ],
  [
    'variable',
    'basics',
    'Variables',
    ['variable', 'variables', 'value', 'assignment'],
    'Named boxes that remember values.',
  ],
  [
    'types',
    'basics',
    'Types',
    [
      'type',
      'types',
      'string',
      'strings',
      'number',
      'integer',
      'float',
      'boolean',
      'string formatting',
    ],
    'What kind of thing a value is: text, a number, true/false.',
  ],
  [
    'condition',
    'basics',
    'Decisions',
    ['condition', 'conditionals', 'if', 'else', 'boolean logic'],
    'Doing different things depending on what’s true.',
  ],
  [
    'loop',
    'basics',
    'Loops',
    ['loop', 'loops', 'for loop', 'while loop', 'iteration', 'range'],
    'Repeating steps for each item or until something happens.',
  ],
  [
    'function',
    'basics',
    'Functions',
    [
      'function',
      'functions',
      'parameter',
      'return',
      'functions and return values',
      'closure',
      'closures',
    ],
    'Named recipes you can reuse with different inputs.',
  ],
  [
    'list',
    'basics',
    'Lists',
    ['list', 'lists', 'array', 'arrays', 'index', 'nested lists', 'slicing'],
    'Ordered rows of values you reach by position.',
  ],
  [
    'dict',
    'basics',
    'Dictionaries',
    ['dictionary', 'dictionaries', 'dict', 'object', 'map', 'key value', 'counting things'],
    'Look things up by name instead of position.',
  ],
  [
    'recursion',
    'basics',
    'Recursion',
    ['recursion', 'recursive', 'base case', 'call stack'],
    'A function that solves a problem by calling itself on a smaller piece.',
  ],
  [
    'class',
    'basics',
    'Classes',
    ['class', 'classes', 'object oriented', 'method', 'oop'],
    'Blueprints that bundle data with what it can do.',
  ],
  [
    'debug',
    'basics',
    'Debugging',
    ['bug', 'debugging', 'error', 'errors', 'exception', 'off by one errors', 'off-by-one'],
    'Finding out why code doesn’t do what you meant.',
  ],

  [
    'bigo',
    'algo',
    'Big-O',
    ['big o', 'big-o', 'complexity', 'time complexity', 'performance', 'scaling', 'growth'],
    'How the work grows as the input grows.',
  ],
  [
    'search',
    'algo',
    'Searching',
    ['binary search', 'search', 'searching', 'bisect'],
    'Finding things fast, often by throwing away half.',
  ],
  [
    'sort',
    'algo',
    'Sorting',
    ['sorting', 'sort', 'merge sort', 'quicksort', 'sweep line'],
    'Putting things in order, and why order helps.',
  ],
  [
    'hashmap',
    'algo',
    'Hash maps',
    ['hash map', 'hash maps', 'hashing', 'hash', 'hash table', 'hash function', 'set'],
    'Instant lookups by turning a key into a location.',
  ],
  [
    'pointers',
    'algo',
    'Two pointers',
    ['two pointers', 'sliding window', 'window'],
    'Walking a list with two fingers instead of checking every pair.',
  ],
  [
    'stack',
    'algo',
    'Stacks & queues',
    ['stack', 'stacks', 'queue', 'queues', 'deque', 'monotonic stack'],
    'Last in first out, and first in first out.',
  ],
  [
    'heap',
    'algo',
    'Heaps',
    ['heap', 'heaps', 'priority queue', 'top k'],
    'Always knowing the biggest or smallest item.',
  ],
  [
    'tree',
    'algo',
    'Trees',
    ['tree', 'trees', 'binary tree', 'bst', 'binary search tree', 'trie', 'merkle tree'],
    'Things that branch: folders, pages, search trees.',
  ],
  [
    'graph',
    'algo',
    'Graphs',
    [
      'graph',
      'graphs',
      'bfs',
      'dfs',
      'breadth first search',
      'shortest path',
      'pagerank',
      'grid',
      'neighbours',
    ],
    'Things connected to things: maps, friends, the web.',
  ],
  [
    'dp',
    'algo',
    'Dynamic programming',
    ['dynamic programming', 'memoization', 'memoisation', 'dp', 'diff'],
    'Solving big problems by writing down small answers.',
  ],
  [
    'backtrack',
    'algo',
    'Backtracking',
    ['backtracking', 'permutations', 'subsets', 'combinations'],
    'Try, undo, try again.',
  ],

  [
    'html',
    'web',
    'HTML & CSS',
    ['html', 'css', 'web page', 'layout', 'dom'],
    'The structure and style of a web page.',
  ],
  [
    'browserjs',
    'web',
    'Interactive pages',
    ['event', 'events', 'javascript', 'click', 'browser'],
    'Making pages react to what you do.',
  ],
  [
    'http',
    'web',
    'HTTP & APIs',
    ['http', 'api', 'apis', 'request', 'json', 'rest', 'webhook', 'fetch'],
    'How programs ask other programs for things over the internet.',
  ],
  [
    'database',
    'web',
    'Databases & SQL',
    ['database', 'databases', 'sql', 'query', 'table', 'sqlite', 'orm'],
    'Where apps keep their data, and how they ask for it.',
  ],
  [
    'auth',
    'web',
    'Logins & security',
    ['authentication', 'auth', 'login', 'password', 'encryption', 'security', 'key exchange'],
    'Knowing who someone is, and keeping secrets secret.',
  ],
  [
    'async',
    'web',
    'Waiting well',
    ['async', 'await', 'promise', 'concurrency', 'thread', 'threads'],
    'Doing other things while something slow finishes.',
  ],

  [
    'git',
    'tools',
    'Git',
    ['git', 'commit', 'branch', 'version control', 'merge'],
    'Saving every version of your project, and working together.',
  ],
  [
    'terminal',
    'tools',
    'The terminal',
    ['terminal', 'command line', 'shell', 'cli'],
    'Talking to your computer by typing commands.',
  ],
  [
    'testing',
    'tools',
    'Testing',
    ['test', 'tests', 'testing', 'test case', 'unit test'],
    'Checks that prove your code does what it should.',
  ],
  [
    'reading',
    'tools',
    'Reading real code',
    ['codebase', 'repository', 'architecture', 'reading code', 'modules', 'imports'],
    'Finding your way around a project someone else wrote.',
  ],

  [
    'cache',
    'systems',
    'Caching',
    ['cache', 'caching', 'lru', 'eviction'],
    'Keeping popular things close so they’re fast.',
  ],
  [
    'sharding',
    'systems',
    'Spreading the load',
    ['consistent hashing', 'sharding', 'load balancing', 'hash ring', 'replication'],
    'Splitting work and data across many machines.',
  ],
  [
    'dist',
    'systems',
    'Distributed systems',
    [
      'distributed systems',
      'distributed',
      'consensus',
      'raft',
      'clocks',
      'vector clocks',
      'idempotency',
    ],
    'Many computers agreeing even when some fail.',
  ],
  [
    'streams',
    'systems',
    'Logs & streams',
    ['log', 'logs', 'stream', 'streams', 'kafka', 'message queue', 'fanout'],
    'Events written down in order, read by many.',
  ],
  [
    'approx',
    'systems',
    'Clever approximations',
    [
      'bloom filter',
      'hyperloglog',
      'false positives',
      'probabilistic',
      'bit array',
      'spatial index',
    ],
    'Being slightly wrong to be enormously faster.',
  ],
  [
    'ratelimit',
    'systems',
    'Limits & resilience',
    ['rate limiting', 'rate limit', 'token bucket', 'retries', 'backoff', 'jitter', 'chaos'],
    'Staying up when traffic spikes or things break.',
  ],

  [
    'random',
    'ai',
    'Randomness & chance',
    ['randomness', 'random', 'probability', 'statistics', 'privacy', 'shuffle'],
    'Using chance on purpose, and reasoning about it.',
  ],
  [
    'sim',
    'ai',
    'Simulation',
    ['simulation', 'simulations', 'model', 'cellular automata'],
    'Understanding the world by running a tiny copy of it.',
  ],
  [
    'nn',
    'ai',
    'Neural networks',
    [
      'neural network',
      'neural networks',
      'neuron',
      'training',
      'gradient descent',
      'learning rate',
    ],
    'Programs that learn from examples.',
  ],
  [
    'embed',
    'ai',
    'Embeddings',
    ['embedding', 'embeddings', 'vector', 'vectors', 'similarity'],
    'Turning words and things into points you can measure.',
  ],
  [
    'attention',
    'ai',
    'Attention & transformers',
    ['attention', 'transformer', 'transformers', 'token', 'tokens', 'language model'],
    'How modern AI decides what to focus on.',
  ],
];

// prerequisite paths drawn as lines
export const EDGES = [
  ['program', 'variable'],
  ['variable', 'types'],
  ['variable', 'condition'],
  ['condition', 'loop'],
  ['loop', 'list'],
  ['list', 'dict'],
  ['function', 'recursion'],
  ['loop', 'function'],
  ['dict', 'class'],
  ['program', 'debug'],
  ['list', 'bigo'],
  ['bigo', 'search'],
  ['bigo', 'sort'],
  ['dict', 'hashmap'],
  ['list', 'pointers'],
  ['list', 'stack'],
  ['stack', 'heap'],
  ['recursion', 'tree'],
  ['tree', 'graph'],
  ['recursion', 'dp'],
  ['recursion', 'backtrack'],
  ['sort', 'search'],
  ['html', 'browserjs'],
  ['http', 'database'],
  ['http', 'auth'],
  ['browserjs', 'async'],
  ['function', 'browserjs'],
  ['terminal', 'git'],
  ['debug', 'testing'],
  ['git', 'reading'],
  ['hashmap', 'cache'],
  ['hashmap', 'sharding'],
  ['sharding', 'dist'],
  ['dist', 'streams'],
  ['hashmap', 'approx'],
  ['http', 'ratelimit'],
  ['random', 'sim'],
  ['sim', 'nn'],
  ['nn', 'embed'],
  ['embed', 'attention'],
];

const norm = (s) =>
  ` ${String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()} `;
/** @type {Array<[string, string[]]>} */
const MATCH = SKILLS.map(([id, , , aliases]) => [id, aliases.map((a) => norm(a))]);
// which skills a free-form concept ("hash maps", "Big-O", "binary search trees") belongs to
export function skillsFor(text) {
  const t = norm(text);
  if (t.trim().length < 2) return [];
  return MATCH.filter(([, al]) => al.some((a) => t.includes(a))).map(([id]) => id);
}

// puzzle stations → skills
const STATION_SKILL = {
  start: ['function'],
  hash: ['hashmap', 'dict'],
  pointers: ['pointers'],
  window: ['pointers'],
  stack: ['stack'],
  binary: ['search'],
  heap: ['heap'],
  tree: ['tree', 'recursion'],
  graph: ['graph'],
  dp: ['dp'],
  backtrack: ['backtrack'],
  intervals: ['sort'],
  design: ['cache', 'class'],
};

// Everything we know about what you've done → { [skill]: { pts, last, from: [...] } }
// What you know, from evidence, not from opening things. Each skill collects four kinds of evidence:
//   seen: you read or opened something about it
//   asked: questions you asked in its lessons
//   practised: you ran or stepped through its code, or did a playground mission
//   proven: a quiz or quick check you got right, a puzzle star, a solved challenge, a review you passed
// and its level follows from that: 1 seen, 2 getting it, 3 know it. Only 2 and 3 light a star.
/**
 * How well you know each skill, from the evidence: lessons, puzzles, path stops, ideas read, checks.
 * @param {{ progress?: Record<string, any>, lessons?: any[], puzzles?: any[], stops?: any[], ideas?: any[], readIds?: Record<string, any> }} input
 */
export function masteryOf({
  progress = {},
  lessons = [],
  puzzles = [],
  stops = [],
  ideas = [],
  readIds = {},
}) {
  /** @typedef {{ seen: number, asked: number, practised: number, proven: number, last: number, from: any[], level?: number, pts?: number }} Mastery */
  /** @type {Record<string, Mastery>} */
  const m = Object.fromEntries(
    SKILLS.map(([id]) => [id, { seen: 0, asked: 0, practised: 0, proven: 0, last: 0, from: [] }]),
  );
  const add = (ids, kind, n, at, label) =>
    ids.forEach((id) => {
      const x = m[id];
      if (!x || !n) return;
      x[kind] += n;
      x.last = Math.max(x.last, at || 0);
      if (label && x.from.length < 16 && !x.from.some((f) => f.label === label && f.kind === kind))
        x.from.push({ label, kind, at: at || 0 });
    });
  const awarded = new Set(progress.awarded || []);
  for (const L of lessons) {
    if (L.status !== 'done' || (L.builtin && !L.touched && !(L.chat || []).length)) continue;
    const ids = [...new Set((L.concepts || []).flatMap(skillsFor))];
    if (!ids.length) continue;
    const at = L.createdAt || 0;
    const title = L.title || L.q || 'a lesson';
    add(ids, 'seen', 1, at, title);
    const asked = (L.chat || []).filter((c) => c.q && !c.loading).length;
    if (asked)
      add(ids, 'asked', asked, at, `${asked} question${asked > 1 ? 's' : ''} in “${title}”`);
    if (awarded.has(`${L.id}:run`)) add(ids, 'practised', 1, at, `ran the code in “${title}”`);
    if (awarded.has(`${L.id}:step`)) add(ids, 'practised', 1, at, `stepped through “${title}”`);
    const right = Math.max(
      awarded.has(`${L.id}:quiz`) ? 1 : 0,
      (L.checks || []).filter((c) => c.ok).length,
    );
    if (right)
      add(ids, 'proven', right, at, `${right} check${right > 1 ? 's' : ''} right in “${title}”`);
    if (awarded.has(`${L.id}:challenge`)) add(ids, 'proven', 2, at, `solved “${title}”`);
  }
  for (const p of puzzles) {
    const r = progress.puzzles?.[p.id];
    if (!r) continue;
    const stars = (r.s || []).filter(Boolean).length;
    if (stars)
      add(STATION_SKILL[p.st] || [], 'proven', stars, r.at, `${'★'.repeat(stars)} ${p.title}`);
  }
  for (const s of stops)
    if (progress.path?.[s.id])
      add(
        [...new Set([...(s.sk || []), ...(s.words || []).flatMap(skillsFor)])],
        'seen',
        1,
        0,
        `path: ${s.t}`,
      );
  for (const I of ideas)
    if (readIds[I.id])
      add([...new Set((I.concepts || []).flatMap(skillsFor))], 'seen', 1, 0, `read “${I.title}”`);
  for (const w of Object.values(progress.words || {}))
    add(skillsFor(w.term), 'seen', 1, w.at, null);
  for (const at of Object.values(progress.sql || {}))
    add(['database'], 'proven', 1, at, 'a SQL challenge, checked');
  for (const at of Object.values(progress.git || {}))
    add(['git', 'terminal'], 'practised', 1, at, 'a Git mission');
  for (const at of Object.values(progress.design || {}))
    add(
      ['cache', 'sharding', 'ratelimit', 'dist'],
      'proven',
      1,
      at,
      'a Design-for-a-billion level',
    );
  for (const [id, r] of Object.entries(progress.reviewScores || {}))
    if (r?.right) add([id], 'proven', r.right, r.at, `${r.right}/${r.total} in a quiz`);
  for (const [id, at] of Object.entries(progress.reviewed || {}))
    if (m[id]) m[id].last = Math.max(m[id].last, at);
  for (const x of Object.values(m)) {
    x.level =
      x.proven >= 2 || (x.proven >= 1 && x.asked >= 3)
        ? 3
        : x.proven >= 1 || x.asked >= 3 || x.practised >= 2
          ? 2
          : x.seen || x.asked || x.practised
            ? 1
            : 0;
    x.pts = [0, 1, 4, 10][x.level]; // older screens read pts
  }
  return m;
}
export const levelOf = (pts) => (pts >= 10 ? 3 : pts >= 4 ? 2 : pts > 0 ? 1 : 0);
// how fresh it is: 1 = this week, fading over about a month
export const freshness = (last) =>
  !last ? 0.55 : Math.max(0.25, Math.min(1, 1 - (Date.now() - last) / (30 * 864e5)));
export const isFading = (x) =>
  (x.level || 0) >= 2 && x.last > 0 && Date.now() - x.last > 10 * 864e5;
