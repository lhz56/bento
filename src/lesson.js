import { keys } from './platform.js';
// Lesson model: streaming NDJSON parser, prompt builders, and the built-in lessons.

// the model may say "py", "Python", "ts"…; keep TypeScript only if the lesson asked for it
const langOf = (x, cur) => (/^py/i.test(x) ? 'python' : /^(ts|typescript)$/i.test(x) ? 'typescript' : /^(html|web|css)/i.test(x) ? 'html' : cur === 'typescript' || cur === 'html' ? cur : 'javascript');
export const LANG_NAME = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML/CSS/JS (a web page)' };

export const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyLesson(q, opts = {}) {
  return {
    id: uid(), q, mode: opts.mode || 'explain', lang: opts.lang || 'python', level: opts.level || 'student', model: opts.model,
    createdAt: Date.now(), status: 'streaming', error: null,
    title: '', kicker: '', concepts: [], story: [], code: '', file: '', pseudo: [], notes: [],
    growth: null, tests: null, hints: [], steps: [], twin: null, work: null, context: opts.context || null,
  };
}

// Apply one parsed block to a lesson (returns a new lesson object)
export function applyBlock(L, b) {
  if (!b || typeof b !== 'object' || !b.t) return L;
  const l = { ...L };
  switch (b.t) {
    case 'title':
      l.title = b.title || l.title; l.kicker = b.kicker || ''; if (b.lang) l.lang = langOf(b.lang, l.lang);
      l.concepts = Array.isArray(b.concepts) ? b.concepts : []; break;
    case 'code': l.code = String(b.code || '').replace(/\s+$/, ''); l.file = b.file || l.file; if (b.lang) l.lang = langOf(b.lang, l.lang); break;
    case 'pseudo': l.pseudo = Array.isArray(b.lines) ? b.lines.map(String) : []; break;
    case 'notes': l.notes = (b.items || []).filter((n) => n && n.from).slice(0, 6); break;
    case 'growth': l.growth = b; break;
    case 'tests': l.tests = b; break;
    case 'hints': l.hints = b.items || []; break;
    case 'step': {
      l.steps = [...l.steps, { title: b.title, file: b.file, md: b.md, code: String(b.code || '').replace(/\s+$/, '') }];
      l.code = l.steps[l.steps.length - 1].code; l.file = b.file || l.file;
      l.story = [...l.story, { t: 'step', i: l.steps.length - 1 }]; break;
    }
    case 'term': l.terms = [...(l.terms || []), b]; l.story = [...l.story, b]; break;
    case 'diagram': if (Array.isArray(b.nodes) && b.nodes.length) l.story = [...l.story, b]; break;
    case 'p': case 'h': case 'quiz': case 'try': case 'next':
      l.story = [...l.story, b]; break;
    default: break;
  }
  return l;
}

// Incremental NDJSON parser tolerant of code fences and pretty-printed objects.
export function ndjsonParser(onBlock) {
  let buf = '', pend = '';
  const tryLine = (line) => {
    const s = line.trim();
    if (!s || s.startsWith('```')) return;
    const cand = pend ? pend + '\n' + line : s;
    try { onBlock(JSON.parse(cand)); pend = ''; }
    catch { if (cand.startsWith('{')) { pend = cand.length < 60000 ? cand : ''; } }
  };
  return {
    push(t) { buf += t; let i; while ((i = buf.indexOf('\n')) >= 0) { tryLine(buf.slice(0, i)); buf = buf.slice(i + 1); } },
    end() { if (buf) tryLine(buf); buf = ''; if (pend) { try { onBlock(JSON.parse(pend)); } catch {} pend = ''; } },
  };
}

const LEVEL = { kid: 'kid (explain with analogies, no jargon)', student: 'student', engineer: 'engineer (precise, mention trade-offs)' };

export function buildPrompt({ q, mode, lang, level, context, prev, path }) {
  const L = LANG_NAME[lang] || 'Python';
  let p = `MODE: ${mode}\nLANGUAGE: ${L}\nLEVEL: ${LEVEL[level] || 'student'}\n`;
  if (path) p += `\nLEARNING PATH: ${path}\n`;
  if (prev) p += `\nThis is a FOLLOW-UP to the lesson "${prev.title}". Its code was:\n${prev.code}\n`;
  if (mode === 'explain') p += `\nQUESTION: ${q}\n`;
  if (mode === 'code' && context?.repo && context?.key?.length) {
    p += `\nREPO MODE. The student is studying the real repository "${context.repo}"${context.gist ? ` (${context.gist})` : ''} and asks: ${q}\nTeach how THIS repo does it. The code block must be a VERBATIM excerpt (12–45 consecutive lines) from the most relevant file below; set "file" to its path. Line links refer to lines of your excerpt. Pseudo must cover every excerpt line. Mention other files by path in backticks when the flow crosses them. The code isn't runnable: skip growth and tests. Keep the quiz about this repo.\n`;
    p += `\nFILE TREE (partial, path — role):\n${(context.files || []).slice(0, 160).join('\n')}\n`;
    for (const f of context.key || []) p += `\n--- ${f.path} ---\n${f.text.slice(0, 9000)}\n`;
    return p;
  }
  if (mode === 'code') p += `\nExplain THIS code from the student's own project${context?.path ? ` (${context.path})` : ''}. Use it verbatim as the code block (if longer than 60 lines, pick the most interesting 15–40 line section, keep it verbatim). Pseudo must cover every line. Notes should explain the non-obvious parts. The code may not be runnable; that's fine.${q ? `\nThe student asks: ${q}` : ''}\n\nCODE:\n${context?.code || ''}\n`;
  if (mode === 'compare' && context?.a) {
    const side = (X, n) => `\n=== APP ${n}: ${X.repo}${X.gist ? ` (${X.gist})` : ''} ===\nFILES (partial):\n${(X.files || []).slice(0, 70).join('\n')}\n${(X.key || []).map((f) => `\n--- ${X.repo}: ${f.path} ---\n${f.text.slice(0, 7000)}`).join('\n')}\n`;
    p += `\nCOMPARE MODE. The learner wants to see how two real apps solve the same problem: ${q}\n${side(context.a, 'A')}${side(context.b, 'B')}`;
    p += `\nWrite the lesson around the difference. Title like "Two ways to …". The code block shows a VERBATIM excerpt from each app (8–20 lines each), A first, separated by a comment line naming the app and file (e.g. "# ── A · repo/file.py ──" or "// ── B · repo/file.js ──"); set file to "compare". Line links refer to lines of this combined block. Use h blocks: "App A’s way", "App B’s way", "Which would you pick?". Use term blocks for new words. Skip growth/tests. Quiz: which app does X. Next: more comparisons.\n`;
    return p;
  }
  if (mode === 'build') {
    p += `\nBUILD MODE. Guide the learner to build, step by step, a tiny runnable version of: ${q}${context?.inspired ? `\nIt is inspired by the real project ${context.inspired} (${context.gist || ''}).` : ''}\nUse 3–5 step blocks INSTEAD of a single code block. Each step's "code" is the FULL runnable program so far (no network, no files, no input(); simulate outside services with small functions that print or show()). Each step should run and show something new. Step md: what we add and why, with one technical word named in **bold**; put a term block right after a step when it introduces a new word. Order: title → p (what we'll build, 1–2 sentences) → step → [term] → step … → pseudo (for the LAST step) → notes (for the last step) → p (what you built, and how the real project does it bigger) → quiz → try → next.\n`;
    return p;
  }
  if (mode === 'idea' && context) {
    const I = context;
    p += `\nCASE STUDY MODE. Write this like a superb engineering blog post for a curious learner, with runnable code they can play with.\nTITLE: ${I.title}\nCOMPANY: ${I.company}\nFACTS (stay strictly inside these; do not invent numbers, dates or internal details):\n${I.brief}\n${I.repo ? `REAL OPEN-SOURCE CODE: github.com/${I.repo} (mention it at the end)\n` : ''}`;
    p += `\nSTRUCTURE (use h blocks for sections):\n1. title (kicker = "${I.company}")\n2. h "The problem" + 1–2 p: the real situation at ${I.company}, concrete and vivid.\n3. h "The obvious way" + 1 p: ${I.vs}, and exactly why it breaks.\n4. h "The clever idea" + 1–2 p with an everyday analogy, then term blocks for new words.\n5. code + pseudo + notes. CODE BRIEF: ${I.code} The code MUST run both the obvious way and the clever way and show() the difference, so the learner SEES why it wins. 25–45 lines is fine here.\n6. h "How the code does it" + 1–2 p with line links.\n7. h "Trade-offs" + 1 p: what it costs, when NOT to use it.\n8. h "Where else you’ll see it" + 1 short p.\n9. quiz, try (experiments like changing a constant), next.\n`;
    return p;
  }
  if (mode === 'challenge') p += `\nCHALLENGE TOPIC: ${q || 'arrays and loops'}\nWrite a short function with EXACTLY ONE subtle, realistic bug. Emit a tests block (some cases pass, at least one fails because of the bug), and a hints block. The p blocks describe the task and goal but must NOT reveal the bug. The code block should also call the function once with console.log/print. Skip the quiz.\n`;
  if (mode === 'feature') {
    p += `\nFEATURE MODE. The student wants to build this in their own project: ${q}\nUse "step" blocks (2–5), using their real stack, file names and conventions.\n`;
    if (context) {
      p += `\nPROJECT: ${context.name}\nFILE TREE (partial):\n${(context.files || []).slice(0, 180).join('\n')}\n`;
      for (const f of context.key || []) p += `\n--- ${f.path} ---\n${f.text.slice(0, 6000)}\n`;
    }
  }
  return p;
}

export const quickPrompts = {
  repair: ({ code, err, lang }) => `This ${lang} teaching example was just written for a lesson, but it fails when run inside Bento (where show(), print(), size(), background(), circle(), rect(), line() and text() always exist; no network, files or input()).\nERROR: ${err}\n\nCODE:\n${code}\n\nFix it with the SMALLEST change, keeping the same number of lines if at all possible and the same teaching idea.\nReply JSON: {"code":"the full fixed code","note":"what was wrong, max 14 words"}`,
  change: ({ before, after, lang, output }) => `A learner edited this ${lang} code. Explain what THEIR CHANGE does, warmly, to someone new to code. Mention the effect on the output if visible. If it introduces a bug, say so gently and hint the fix.\nReply JSON: {"said":"max 34 words, plain English, may use one technical term in **bold**","term":"that technical term or null","plain":"one-line definition of the term or null"}\n\nBEFORE:\n${before}\n\nAFTER:\n${after}\n${output ? `\nOUTPUT NOW:\n${output.slice(0, 600)}` : ''}`,
  token: ({ word, line, lang, kind }) => `In this ${lang} line:\n${line}\nexplain the ${kind || 'token'} "${word}" to a student.\nReply JSON: {"title":"${word}","what":"one friendly sentence, max 22 words","plain":"what it means here in plain English, max 10 words","example":"a tiny ${lang} example, max 2 lines"}`,
  pseudo: ({ code, lang }) => `Write plain-English pseudocode for EACH line of this ${lang} code (one entry per line, same order, blank line or closing bracket → ""). Max 9 words each, friendly, no code syntax.\nReply JSON: {"lines":[...]} with exactly ${code.split('\n').length} entries.\n\nCODE:\n${code}`,
  twin: ({ code, from, to }) => `Translate this ${from} code into idiomatic ${to}, keeping the same structure and the same helper calls (show, print, size, circle... exist in both). Also map lines: pairs of [lineInOriginal, lineInTranslation] (1-based) for lines that correspond.\nReply JSON: {"code":"...","map":[[1,1],[2,2]]}\n\nCODE:\n${code}`,
  error: ({ code, err, lang }) => `(Context: this runs inside Bento, where show(), print(), size(), background(), circle(), rect(), line() and text() are built-in helpers that always exist.)\nA student's ${lang} code fails with:\n${err}\n\nCODE:\n${code}\n\nReply JSON: {"plain":"what went wrong in plain words, max 25 words","fix":"what to change, max 20 words","line":<1-based line number or null>}`,
};

export function parseJSONLoose(s) {
  if (!s) return null;
  const t = s.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

// ------------------------------------------------------------------ built-in lessons
const B = (lesson) => ({ ...emptyLesson(lesson.q, lesson), ...lesson, status: 'done', builtin: true });

export const SAMPLES = [
  B({
    id: 'sample-bst', q: 'How does a binary search tree work?', lang: 'python', title: 'Binary search trees', kicker: 'data structures', concepts: ['trees', 'recursion'], file: 'bst.py',
    code: `class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return Node(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

root = None
for v in [8, 4, 12, 2, 6, 10, 14]:
    root = insert(root, v)

show(root, "your tree")`,
    pseudo: ['A Node is one box in the tree', 'Making a node needs a value', 'Store the value', 'No left child yet', 'No right child yet', '', 'To insert a value into a tree:', 'If this spot is empty…', '…put a new node here', 'If the value is smaller…', '…insert it on the left side', 'Otherwise…', '…insert it on the right side', 'Hand back this (updated) node', '', 'Start with an empty tree', 'For each number in the list', 'insert it, and keep the root', '', 'Draw the tree'],
    notes: [
      { from: 8, to: 9, label: 'base case', text: "The recursion stops at an empty spot. That's exactly where the new value lands." },
      { from: 10, to: 13, label: 'the one rule', text: 'Smaller goes left, bigger goes right. This comparison is why searching skips half the tree each step.' },
      { from: 18, to: 18, label: 'why reassign?', text: 'insert returns the root, so the very first call turns None into a real node.' },
    ],
    story: [
      { t: 'p', md: 'A **binary search tree** keeps numbers sorted *as you add them*. Every node has at most two children: smaller values go left, bigger values go right.' },
      { t: 'p', md: 'Look at [[10-13|the comparison]]: each insert walks down the tree, turning left or right at every node until it reaches [[8-9|an empty spot]]. That is **recursion**: `insert` calls itself on a smaller tree.' },
      { t: 'p', md: 'Because each step throws away half of what is left, finding a value among a million sorted numbers takes about 20 steps. Press **Step** to watch the calls stack up.' },
      { t: 'quiz', q: 'You insert 5 into this tree. Where does it land?', choices: ['Left child of 6', 'Right child of 4', 'Right child of 2'], answer: 0, why: '5 < 8 → go left. 5 > 4 → go right, to 6. 5 < 6 → left of 6, which is empty.' },
      { t: 'try', items: ['Add 5 to the list', 'Insert sorted numbers: 1, 2, 3, 4, 5', 'Step through one insert'] },
      { t: 'next', items: ['How do I search a BST?', 'Why do trees get unbalanced?', 'How does deleting a node work?'] },
    ],
  }),
  B({
    id: 'sample-bigo', q: 'What does O(n²) vs O(n) actually mean?', lang: 'python', title: 'Big-O, by counting steps', kicker: 'complexity', concepts: ['big-o', 'sets'], file: 'dupes.py',
    code: `def has_dupe_slow(nums):
    for i in range(len(nums)):
        for j in range(i):
            if nums[i] == nums[j]:
                return True
    return False

def has_dupe_fast(nums):
    seen = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False

data = [3, 8, 1, 9, 4, 8]
print("slow:", has_dupe_slow(data))
print("fast:", has_dupe_fast(data))`,
    pseudo: ['Slow way: does the list repeat?', 'Pick each number in turn', 'Compare with every number before it', 'If two match…', '…we found a duplicate', 'No matches anywhere: no duplicate', '', 'Fast way: same question', "Start an empty 'seen it' set", 'Walk through the numbers once', 'Already seen this one?', "Then it's a duplicate", 'Remember this number', 'Reached the end: no duplicate', '', 'Some test numbers', 'Ask the slow way', 'Ask the fast way'],
    notes: [
      { from: 2, to: 3, label: 'loop inside a loop', text: 'For every number, scan all earlier ones. Double the list → about 4× the work.' },
      { from: 9, to: 11, label: 'the trick', text: "Checking 'x in seen' on a set is instant, however big the set gets." },
    ],
    growth: { setup: 'def make_input(n):\n    return list(range(n))', calls: [{ label: 'has_dupe_slow', call: 'has_dupe_slow(make_input(n))' }, { label: 'has_dupe_fast', call: 'has_dupe_fast(make_input(n))' }], label: 'Worst case: lists with no duplicates' },
    story: [
      { t: 'p', md: '**Big-O** describes how the work grows as the input gets bigger. Not seconds: *steps*.' },
      { t: 'p', md: 'Both functions answer the same question. [[2-5|The slow one]] compares every pair, so 1,000 numbers means about 500,000 comparisons. [[9-13|The fast one]] remembers what it has seen in a `set`, so it touches each number once.' },
      { t: 'p', md: 'Open **Growth** below. Bento runs both functions on bigger and bigger lists and counts every step. The shape of the curve *is* the Big-O.' },
      { t: 'quiz', q: 'You double the size of the list. Roughly how much more work does has_dupe_slow do?', choices: ['2× more', '4× more', 'The same'], answer: 1, why: 'It compares pairs, and the number of pairs grows like n². Double n → 4× the pairs.' },
      { t: 'try', items: ['Measure both in Growth', 'Remove the second 8 and run', 'Step through has_dupe_fast'] },
      { t: 'next', items: ['What is O(log n)?', 'Why are sets so fast?', 'Would sorting first help?'] },
    ],
  }),
  B({
    id: 'sample-spiral', q: 'How do people make generative art with code?', lang: 'javascript', title: 'Drawing a spiral with code', kicker: 'generative art', concepts: ['generative-art', 'loops'], file: 'spiral.js',
    code: `// A spiral: each dot turns a bit and steps out a bit
size(400, 400);
background("#fffaf2");

const colors = ["#ff8a5b", "#ff5d8f", "#a78bfa", "#5aa9ff"];

for (let i = 0; i < 260; i++) {
  const angle = i * 0.38;
  const dist = i * 0.7;
  const x = 200 + Math.cos(angle) * dist;
  const y = 200 + Math.sin(angle) * dist;
  circle(x, y, 2 + i * 0.02, colors[i % 4]);
}`,
    pseudo: ['(a note for humans)', 'Make a 400 × 400 canvas', 'Paint it warm white', '', 'Four colors to cycle through', '', 'Repeat 260 times, counting with i', 'Turn a little more each time', 'Step a little further out', "Work out the dot's left–right spot", "Work out the dot's up–down spot", 'Draw a dot that slowly grows', ''],
    notes: [
      { from: 8, to: 9, label: 'the whole trick', text: 'Angle and distance both grow with i. Together they trace a spiral.' },
      { from: 10, to: 11, label: 'cos & sin', text: 'They turn an angle + distance into x and y on the screen.' },
      { from: 12, to: 12, label: 'i % 4', text: 'The remainder after dividing by 4: 0, 1, 2, 3, 0, 1… so the colors repeat.' },
    ],
    story: [
      { t: 'p', md: 'Generative art is a loop with a rule. Here the rule is: **turn a little, step out a little, draw a dot.**' },
      { t: 'p', md: '[[8-9|These two lines]] are the whole idea. `Math.cos` and `Math.sin` turn an angle and a distance into a position on screen: [[10-11|x and y]].' },
      { t: 'p', md: `Hold **${keys('⌥ Option')}** and drag any number in the code. The picture redraws as you drag. Try an angle step of **2.4**: the golden angle, the one sunflowers use.` },
      { t: 'quiz', q: 'What happens if you change 0.38 to 0?', choices: ['A straight line of dots', 'A circle', 'Nothing is drawn'], answer: 0, why: 'No turning, only stepping out: every dot sits on the same ray, so they form a line.' },
      { t: 'try', items: ['Change 0.38 to 2.4', 'Change 0.7 to 1.4', 'Change 260 to 900'] },
      { t: 'next', items: ['How do I animate this?', 'What are sin and cos, really?', 'How do I make random art?'] },
    ],
  }),
  B({
    id: 'sample-closure', q: "What's a closure?", lang: 'javascript', title: 'Closures', kicker: 'functions', concepts: ['closures', 'functions'], file: 'counter.js',
    code: `function makeCounter() {
  let count = 0;
  return function tick() {
    count = count + 1;
    return count;
  };
}

const a = makeCounter();
const b = makeCounter();

console.log(a()); // 1
console.log(a()); // 2
console.log(b()); // 1`,
    pseudo: ['A function that builds counters', 'Each counter starts at 0', 'Hand back a little function…', '…that adds one to its count', '…and reports the new count', '', '', '', 'Build counter a', 'Build a separate counter b', '', 'Tick a → 1', 'Tick a again → 2', 'Tick b → 1 (its own count)'],
    notes: [
      { from: 2, to: 3, label: 'the backpack', text: 'tick is born here, so it keeps a private link to count, even after makeCounter returns.' },
      { from: 9, to: 10, label: 'two backpacks', text: 'Each call makes a fresh count. a and b never share.' },
    ],
    story: [
      { t: 'p', md: 'A **closure** is a function that remembers the variables from where it was created, like carrying a backpack.' },
      { t: 'p', md: '[[3-6|tick]] is created inside `makeCounter`, so it can still see [[2|count]] after `makeCounter` has finished. Nothing else can touch that count: it is private.' },
      { t: 'p', md: 'Press **Step** and watch the call stack: `makeCounter` disappears, but `count` lives on.' },
      { t: 'quiz', q: 'If you call b() one more time after the last line, what does it return?', choices: ['1', '2', '3'], answer: 1, why: 'b has its own count. It was 1, so the next tick makes it 2.' },
      { t: 'try', items: ['Add a third counter c', 'Make tick add 10 instead', 'Step through it'] },
      { t: 'next', items: ['Where do closures show up in React?', 'Closure vs class?', 'What is scope?'] },
    ],
  }),
];

export const CHALLENGE = B({
  id: 'sample-bug', q: 'Daily bug', mode: 'challenge', lang: 'javascript', title: 'Daily bug: largest()', kicker: 'challenge #1', concepts: ['loops', 'arrays'], file: 'largest.js',
  code: `function largest(nums) {
  let best = 0;
  for (const n of nums) {
    if (n > best) {
      best = n;
    }
  }
  return best;
}

console.log(largest([3, 9, 2]));`,
  pseudo: ['To find the biggest number:', 'Start our best guess at 0', 'Look at each number', 'Is it bigger than our best?', "Then it's the new best", '', '', 'Report the best we found', '', '', 'Try it on a small list'],
  notes: [],
  tests: { fn: 'largest', cases: [{ args: [[3, 9, 2]], expect: 9 }, { args: [[7]], expect: 7 }, { args: [[-5, -2, -9]], expect: -2 }, { args: [[4, 4, 1]], expect: 4 }] },
  hints: ['What happens when every number is negative?', 'Look at the starting value on line 2. Is 0 a fair first guess?', 'Start with the first item instead: let best = nums[0];'],
  story: [
    { t: 'p', md: '`largest` should return the biggest number in a list. It passes some tests and quietly fails others. Find the bug and turn every light green.' },
    { t: 'p', md: 'Run the **Tests** first. Then change the last line to the failing input and press **Step** to watch [[2|best]] change.' },
    { t: 'try', items: ['Run the tests', 'Step through it'] },
    { t: 'next', items: ['Give me another bug', 'How do I test my own code?'] },
  ],
});

// concept map (for the Map view)
export const CONCEPTS = [
  ['variables', 'Variables', 70, 70], ['conditionals', 'Conditionals', 200, 50], ['loops', 'Loops', 330, 80], ['functions', 'Functions', 150, 160],
  ['strings', 'Strings', 470, 50], ['arrays', 'Arrays', 420, 170], ['objects', 'Objects', 560, 150], ['hash-maps', 'Hash maps', 640, 240],
  ['sets', 'Sets', 760, 170], ['recursion', 'Recursion', 120, 280], ['closures', 'Closures', 260, 250], ['classes', 'Classes', 520, 290],
  ['big-o', 'Big-O', 380, 330], ['sorting', 'Sorting', 250, 380], ['searching', 'Searching', 120, 420], ['stacks-queues', 'Stacks & queues', 560, 400],
  ['linked-lists', 'Linked lists', 720, 350], ['trees', 'Trees', 420, 460], ['graphs', 'Graphs', 640, 480], ['async', 'Async', 820, 290],
  ['apis', 'APIs', 860, 410], ['react-state', 'React state', 840, 520], ['dom', 'The DOM', 760, 590], ['generative-art', 'Generative art', 230, 520],
];
export const EDGES = [['variables', 'conditionals'], ['conditionals', 'loops'], ['variables', 'functions'], ['loops', 'arrays'], ['strings', 'arrays'], ['arrays', 'objects'], ['objects', 'hash-maps'], ['hash-maps', 'sets'], ['functions', 'recursion'], ['functions', 'closures'], ['objects', 'classes'], ['arrays', 'big-o'], ['loops', 'big-o'], ['big-o', 'sorting'], ['sorting', 'searching'], ['recursion', 'searching'], ['classes', 'stacks-queues'], ['classes', 'linked-lists'], ['recursion', 'trees'], ['big-o', 'trees'], ['linked-lists', 'trees'], ['trees', 'graphs'], ['hash-maps', 'graphs'], ['closures', 'async'], ['async', 'apis'], ['objects', 'react-state'], ['closures', 'react-state'], ['react-state', 'dom'], ['loops', 'generative-art']];
