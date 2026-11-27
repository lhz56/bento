// Lesson model: streaming NDJSON parser, prompt builders, and the built-in lessons.
import { keys } from './platform.js';

// the model may say "py", "Python", "ts"…; keep TypeScript only if the lesson asked for it
const langOf = (x, cur) =>
  /^py/i.test(x)
    ? 'python'
    : /^(ts|typescript)$/i.test(x)
      ? 'typescript'
      : /^(html|web|css)/i.test(x)
        ? 'html'
        : cur === 'typescript' || cur === 'html'
          ? cur
          : 'javascript';
export const LANG_NAME = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML/CSS/JS (a web page)',
};

export const uid = () => Math.random().toString(36).slice(2, 10);

// A chat entry is written twice: once when asked (loading), once when answered. Each has its own id, so an answer
// that arrives late replaces only its own question, never one asked after it.
export const newChatId = () =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** @param {Array<{ id?: string }>} chat @param {{ id: string }} entry */
export const putChatEntry = (chat = [], entry) =>
  chat.some((x) => x.id === entry.id)
    ? chat.map((x) => (x.id === entry.id ? entry : x))
    : [...chat, entry];

export function emptyLesson(question, opts = {}) {
  return {
    id: uid(),
    q: question,
    mode: opts.mode || 'explain',
    lang: opts.lang || 'python',
    level: opts.level || 'student',
    model: opts.model,
    createdAt: Date.now(),
    status: 'streaming',
    error: null,
    title: '',
    kicker: '',
    concepts: [],
    story: [],
    code: '',
    file: '',
    pseudo: [],
    notes: [],
    growth: null,
    tests: null,
    hints: [],
    steps: [],
    twin: null,
    work: null,
    context: opts.context || null,
  };
}

// Apply one parsed block to a lesson (returns a new lesson object)
export function applyBlock(lesson, block) {
  if (!block || typeof block !== 'object' || !block.t) return lesson;
  const next = { ...lesson };
  switch (block.t) {
    case 'title':
      next.title = block.title || next.title;
      next.kicker = block.kicker || '';
      if (block.lang) next.lang = langOf(block.lang, next.lang);
      next.concepts = Array.isArray(block.concepts) ? block.concepts : [];
      break;
    case 'code':
      next.code = String(block.code || '').replace(/\s+$/, '');
      next.file = block.file || next.file;
      if (block.lang) next.lang = langOf(block.lang, next.lang);
      break;
    case 'pseudo':
      next.pseudo = Array.isArray(block.lines) ? block.lines.map(String) : [];
      break;
    case 'notes':
      next.notes = (block.items || []).filter((n) => n && n.from).slice(0, 6);
      break;
    case 'growth':
      next.growth = block;
      break;
    case 'tests':
      next.tests = block;
      break;
    case 'hints':
      next.hints = block.items || [];
      break;
    case 'step': {
      next.steps = [
        ...next.steps,
        {
          title: block.title,
          file: block.file,
          md: block.md,
          code: String(block.code || '').replace(/\s+$/, ''),
        },
      ];
      next.code = next.steps[next.steps.length - 1].code;
      next.file = block.file || next.file;
      next.story = [...next.story, { t: 'step', i: next.steps.length - 1 }];
      break;
    }
    case 'term':
      next.terms = [...(next.terms || []), block];
      next.story = [...next.story, block];
      break;
    case 'diagram':
      if (Array.isArray(block.nodes) && block.nodes.length) next.story = [...next.story, block];
      break;
    case 'p':
    case 'h':
    case 'quiz':
    case 'try':
    case 'next':
      next.story = [...next.story, block];
      break;
    default:
      break;
  }
  return next;
}

// Incremental NDJSON parser tolerant of code fences and pretty-printed objects.
// One block per line, read as it streams. Models don't always write it cleanly, so the usual slips are forgiven: a
// comma after a block (as if in a list), the list's own [ and ], code fences, and a block spread over several lines.
// A line that is a whole block on its own always counts, so one broken block can't swallow the rest of the lesson.
const tidy = (s) => s.replace(/^\[\s*(?=\{)/, '').replace(/\}\s*,?\s*\]?\s*,?$/, '}');
// What a model writes by hand isn't always valid JSON: a Python backslash left as it is (r'\d+', it\'s), a tab, or code
// spread over several lines with real line breaks inside its string. Mended only when a line won't parse as it is:
// inside strings, raw breaks and tabs become escapes and a backslash that starts no JSON escape is doubled.
function mendJSON(text) {
  let out = '',
    str = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!str) {
      if (ch === '"') str = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      const nx = text[i + 1];
      if (
        nx &&
        ('"\\/bfnrt'.includes(nx) ||
          (nx === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))))
      ) {
        out += ch + nx;
        i++;
      } else out += '\\\\';
      continue;
    }
    if (ch === '"') {
      str = false;
      out += ch;
      continue;
    }
    out += ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '' : ch;
  }
  return out;
}
const asBlock = (text) => {
  try {
    const o = JSON.parse(text);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
};
const parseBlock = (s) => asBlock(tidy(s)) || asBlock(tidy(mendJSON(s)));
export function ndjsonParser(onBlock) {
  let buf = '',
    pend = '';
  const tryLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('```')) return;
    if (pend) {
      const whole = trimmed.startsWith('{') && parseBlock(trimmed);
      if (whole && typeof whole.t === 'string') {
        pend = '';
        onBlock(whole);
        return;
      } // a block of its own (not a part of the one being collected)
      // the block goes on over this line, kept exactly as written (its indentation is Python's): a break inside a string
      // needs an escaped newline, one between parts doesn't
      const raw = line.replace(/\r$/, '');
      const block = parseBlock(pend + '\n' + raw) || parseBlock(pend + '\\n' + raw);
      if (block) {
        pend = '';
        onBlock(block);
      } else pend = (pend + '\n' + raw).length < 60000 ? pend + '\n' + raw : '';
      return;
    }
    if (trimmed === '[' || trimmed === ']' || trimmed === '],') return; // the list a lesson was wrapped in
    const block = parseBlock(trimmed);
    if (block) onBlock(block);
    else if (/^\[?\s*\{/.test(trimmed)) pend = trimmed;
  };
  return {
    push(text) {
      buf += text;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        tryLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    },
    end() {
      if (buf) tryLine(buf);
      buf = '';
      if (pend) {
        const o = parseBlock(pend);
        if (o) onBlock(o);
        pend = '';
      }
    },
  };
}

const LEVEL = {
  kid: 'kid (explain with analogies, no jargon)',
  student: 'student',
  engineer: 'engineer (precise, mention trade-offs)',
};

export function buildPrompt({ q, mode, lang, level, context, prev, path }) {
  const langInfo = LANG_NAME[lang] || 'Python';
  let prompt = `MODE: ${mode}\nLANGUAGE: ${langInfo}\nLEVEL: ${LEVEL[level] || 'student'}\n`;
  if (path) prompt += `\nLEARNING PATH: ${path}\n`;
  if (prev)
    prompt += `\nThis is a FOLLOW-UP to the lesson "${prev.title}". Its code was:\n${prev.code}\n`;
  if (mode === 'explain') prompt += `\nQUESTION: ${q}\n`;
  if (mode === 'code' && context?.repo && context?.key?.length) {
    prompt += `\nREPO MODE. The student is studying the real repository "${context.repo}"${context.gist ? ` (${context.gist})` : ''} and asks: ${q}\nTeach how THIS repo does it. The code block must be a VERBATIM excerpt (12–45 consecutive lines) from the most relevant file below; set "file" to its path. Line links refer to lines of your excerpt. Pseudo must cover every excerpt line. Mention other files by path in backticks when the flow crosses them. The code isn't runnable: skip growth and tests. Keep the quiz about this repo.\n`;
    prompt += `\nFILE TREE (partial, path — role):\n${(context.files || []).slice(0, 160).join('\n')}\n`;
    for (const f of context.key || []) prompt += `\n--- ${f.path} ---\n${f.text.slice(0, 9000)}\n`;
    return prompt;
  }
  if (mode === 'code')
    prompt += `\nExplain THIS code from the student's own project${context?.path ? ` (${context.path})` : ''}. Use it verbatim as the code block (if longer than 60 lines, pick the most interesting 15–40 line section, keep it verbatim). Pseudo must cover every line. Notes should explain the non-obvious parts. The code may not be runnable; that's fine.${q ? `\nThe student asks: ${q}` : ''}\n\nCODE:\n${context?.code || ''}\n`;
  if (mode === 'compare' && context?.a) {
    const side = (site, n) =>
      `\n=== APP ${n}: ${site.repo}${site.gist ? ` (${site.gist})` : ''} ===\nFILES (partial):\n${(site.files || []).slice(0, 70).join('\n')}\n${(site.key || []).map((f) => `\n--- ${site.repo}: ${f.path} ---\n${f.text.slice(0, 7000)}`).join('\n')}\n`;
    prompt += `\nCOMPARE MODE. The learner wants to see how two real apps solve the same problem: ${q}\n${side(context.a, 'A')}${side(context.b, 'B')}`;
    prompt += `\nWrite the lesson around the difference. Title like "Two ways to …". The code block shows a VERBATIM excerpt from each app (8–20 lines each), A first, separated by a comment line naming the app and file (e.g. "# ── A · repo/file.py ──" or "// ── B · repo/file.js ──"); set file to "compare". Line links refer to lines of this combined block. Use h blocks: "App A’s way", "App B’s way", "Which would you pick?". Use term blocks for new words. Skip growth/tests. Quiz: which app does X. Next: more comparisons.\n`;
    return prompt;
  }
  if (mode === 'build') {
    prompt += `\nBUILD MODE. Guide the learner to build, step by step, a tiny runnable version of: ${q}${context?.inspired ? `\nIt is inspired by the real project ${context.inspired} (${context.gist || ''}).` : ''}\nUse 3–5 step blocks INSTEAD of a single code block. Each step's "code" is the FULL runnable program so far (no network, no files, no input(); simulate outside services with small functions that print or show()). Each step should run and show something new. Step md: what we add and why, with one technical word named in **bold**; put a term block right after a step when it introduces a new word. Order: title → p (what we'll build, 1–2 sentences) → step → [term] → step … → pseudo (for the LAST step) → notes (for the last step) → p (what you built, and how the real project does it bigger) → quiz → try → next.\n`;
    return prompt;
  }
  if (mode === 'idea' && context) {
    const ctx = context;
    prompt += `\nCASE STUDY MODE. Write this like a superb engineering blog post for a curious learner, with runnable code they can play with.\nTITLE: ${ctx.title}\nCOMPANY: ${ctx.company}\nFACTS (stay strictly inside these; do not invent numbers, dates or internal details):\n${ctx.brief}\n${ctx.repo ? `REAL OPEN-SOURCE CODE: github.com/${ctx.repo} (mention it at the end)\n` : ''}`;
    prompt += `\nSTRUCTURE (use h blocks for sections):\n1. title (kicker = "${ctx.company}")\n2. h "The problem" + 1–2 p: the real situation at ${ctx.company}, concrete and vivid.\n3. h "The obvious way" + 1 p: ${ctx.vs}, and exactly why it breaks.\n4. h "The clever idea" + 1–2 p with an everyday analogy, then term blocks for new words.\n5. code + pseudo + notes. CODE BRIEF: ${ctx.code} The code MUST run both the obvious way and the clever way and show() the difference, so the learner SEES why it wins. 25–45 lines is fine here.\n6. h "How the code does it" + 1–2 p with line links.\n7. h "Trade-offs" + 1 p: what it costs, when NOT to use it.\n8. h "Where else you’ll see it" + 1 short p.\n9. quiz, try (experiments like changing a constant), next.\n`;
    return prompt;
  }
  if (mode === 'challenge')
    prompt += `\nCHALLENGE TOPIC: ${q || 'arrays and loops'}\nWrite a short function with EXACTLY ONE subtle, realistic bug. Emit a tests block (some cases pass, at least one fails because of the bug), and a hints block. The p blocks describe the task and goal but must NOT reveal the bug. The code block should also call the function once with console.log/print. Skip the quiz.\n`;
  if (mode === 'feature') {
    prompt += `\nFEATURE MODE. The student wants to build this in their own project: ${q}\nUse "step" blocks (2–5), using their real stack, file names and conventions.\n`;
    if (context) {
      prompt += `\nPROJECT: ${context.name}\nFILE TREE (partial):\n${(context.files || []).slice(0, 180).join('\n')}\n`;
      for (const f of context.key || [])
        prompt += `\n--- ${f.path} ---\n${f.text.slice(0, 6000)}\n`;
    }
  }
  return prompt;
}

export const quickPrompts = {
  repair: ({ code, err, lang }) =>
    `This ${lang} teaching example was just written for a lesson, but it fails when run inside Bento (where show(), print(), size(), background(), circle(), rect(), line() and text() always exist; no network, files or input()).\nERROR: ${err}\n\nCODE:\n${code}\n\nFix it with the SMALLEST change, keeping the same number of lines if at all possible and the same teaching idea.\nReply JSON: {"code":"the full fixed code","note":"what was wrong, max 14 words"}`,
  change: ({ before, after, lang, output }) =>
    `A learner edited this ${lang} code. Explain what THEIR CHANGE does, warmly, to someone new to code. Mention the effect on the output if visible. If it introduces a bug, say so gently and hint the fix.\nReply JSON: {"said":"max 34 words, plain English, may use one technical term in **bold**","term":"that technical term or null","plain":"one-line definition of the term or null"}\n\nBEFORE:\n${before}\n\nAFTER:\n${after}\n${output ? `\nOUTPUT NOW:\n${output.slice(0, 600)}` : ''}`,
  token: ({ word, line, lang, kind }) =>
    `In this ${lang} line:\n${line}\nexplain the ${kind || 'token'} "${word}" to a student.\nReply JSON: {"title":"${word}","what":"one friendly sentence, max 22 words","plain":"what it means here in plain English, max 10 words","example":"a tiny ${lang} example, max 2 lines"}`,
  // by line number, so a skipped or merged line can't move the rest; only the lines still without English
  pseudo: ({ code, lang, only, again }) => {
    const ls = code.split('\n');
    const want = only?.length ? only : ls.map((l, i) => (l.trim() ? i + 1 : 0)).filter(Boolean);
    return `Write plain-English pseudocode for lines ${want.join(', ')} of this ${lang} code, one entry per line number. Max 9 words each, friendly, present tense, no code syntax. A closing bracket or a blank line → "".${again ? ' Some lines were missed last time: answer every line number listed.' : ''}\nReply JSON: {"lines":{"${want[0] || 1}":"...", ...}} with exactly these keys: ${want.join(', ')}.\n\nCODE (line number| code):\n${ls.map((l, i) => `${i + 1}| ${l}`).join('\n')}`;
  },
  twin: ({ code, from, to }) =>
    `Translate this ${from} code into idiomatic ${to}, keeping the same structure and the same helper calls (show, print, size, circle... exist in both). Also map lines: pairs of [lineInOriginal, lineInTranslation] (1-based) for lines that correspond.\nReply JSON: {"code":"...","map":[[1,1],[2,2]]}\n\nCODE:\n${code}`,
  error: ({ code, err, lang }) =>
    `(Context: this runs inside Bento, where show(), print(), size(), background(), circle(), rect(), line() and text() are built-in helpers that always exist.)\nA student's ${lang} code fails with:\n${err}\n\nCODE:\n${code}\n\nReply JSON: {"plain":"what went wrong in plain words, max 25 words","fix":"what to change, max 20 words","line":<1-based line number or null>}`,
};

export function parseJSONLoose(text) {
  if (!text) return null;
  const trimmed = text
    .replace(/^```(json)?/m, '')
    .replace(/```\s*$/m, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf('{'),
    end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
}

// ------------------------------------------------------------------ built-in lessons
const blank = (lesson) => ({
  ...emptyLesson(lesson.q, lesson),
  ...lesson,
  status: 'done',
  builtin: true,
});

export const SAMPLES = [
  blank({
    id: 'sample-bst',
    q: 'How does a binary search tree work?',
    lang: 'python',
    title: 'Binary search trees',
    kicker: 'data structures',
    concepts: ['trees', 'recursion'],
    file: 'bst.py',
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
    pseudo: [
      'A Node is one box in the tree',
      'Making a node needs a value',
      'Store the value',
      'No left child yet',
      'No right child yet',
      '',
      'To insert a value into a tree:',
      'If this spot is empty…',
      '…put a new node here',
      'If the value is smaller…',
      '…insert it on the left side',
      'Otherwise…',
      '…insert it on the right side',
      'Hand back this (updated) node',
      '',
      'Start with an empty tree',
      'For each number in the list',
      'insert it, and keep the root',
      '',
      'Draw the tree',
    ],
    notes: [
      {
        from: 8,
        to: 9,
        label: 'base case',
        text: "The recursion stops at an empty spot. That's exactly where the new value lands.",
      },
      {
        from: 10,
        to: 13,
        label: 'the one rule',
        text: 'Smaller goes left, bigger goes right. This comparison is why searching skips half the tree each step.',
      },
      {
        from: 18,
        to: 18,
        label: 'why reassign?',
        text: 'insert returns the root, so the very first call turns None into a real node.',
      },
    ],
    story: [
      {
        t: 'p',
        md: 'A **binary search tree** keeps numbers sorted *as you add them*. Every node has at most two children: smaller values go left, bigger values go right.',
      },
      {
        t: 'p',
        md: 'Look at [[10-13|the comparison]]: each insert walks down the tree, turning left or right at every node until it reaches [[8-9|an empty spot]]. That is **recursion**: `insert` calls itself on a smaller tree.',
      },
      {
        t: 'p',
        md: 'Because each step throws away half of what is left, finding a value among a million sorted numbers takes about 20 steps. Press **Step** to watch the calls stack up.',
      },
      {
        t: 'quiz',
        q: 'You insert 5 into this tree. Where does it land?',
        choices: ['Left child of 6', 'Right child of 4', 'Right child of 2'],
        answer: 0,
        why: '5 < 8 → go left. 5 > 4 → go right, to 6. 5 < 6 → left of 6, which is empty.',
      },
      {
        t: 'try',
        items: [
          'Add 5 to the list',
          'Insert sorted numbers: 1, 2, 3, 4, 5',
          'Step through one insert',
        ],
      },
      {
        t: 'next',
        items: [
          'How do I search a BST?',
          'Why do trees get unbalanced?',
          'How does deleting a node work?',
        ],
      },
    ],
  }),
  blank({
    id: 'sample-bigo',
    q: 'What does O(n²) vs O(n) actually mean?',
    lang: 'python',
    title: 'Big-O, by counting steps',
    kicker: 'complexity',
    concepts: ['big-o', 'sets'],
    file: 'dupes.py',
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
    pseudo: [
      'Slow way: does the list repeat?',
      'Pick each number in turn',
      'Compare with every number before it',
      'If two match…',
      '…we found a duplicate',
      'No matches anywhere: no duplicate',
      '',
      'Fast way: same question',
      "Start an empty 'seen it' set",
      'Walk through the numbers once',
      'Already seen this one?',
      "Then it's a duplicate",
      'Remember this number',
      'Reached the end: no duplicate',
      '',
      'Some test numbers',
      'Ask the slow way',
      'Ask the fast way',
    ],
    notes: [
      {
        from: 2,
        to: 3,
        label: 'loop inside a loop',
        text: 'For every number, scan all earlier ones. Double the list → about 4× the work.',
      },
      {
        from: 9,
        to: 11,
        label: 'the trick',
        text: "Checking 'x in seen' on a set is instant, however big the set gets.",
      },
    ],
    growth: {
      setup: 'def make_input(n):\n    return list(range(n))',
      calls: [
        { label: 'has_dupe_slow', call: 'has_dupe_slow(make_input(n))' },
        { label: 'has_dupe_fast', call: 'has_dupe_fast(make_input(n))' },
      ],
      label: 'Worst case: lists with no duplicates',
    },
    story: [
      {
        t: 'p',
        md: '**Big-O** describes how the work grows as the input gets bigger. Not seconds: *steps*.',
      },
      {
        t: 'p',
        md: 'Both functions answer the same question. [[2-5|The slow one]] compares every pair, so 1,000 numbers means about 500,000 comparisons. [[9-13|The fast one]] remembers what it has seen in a `set`, so it touches each number once.',
      },
      {
        t: 'p',
        md: 'Open **Growth** below. Bento runs both functions on bigger and bigger lists and counts every step. The shape of the curve *is* the Big-O.',
      },
      {
        t: 'quiz',
        q: 'You double the size of the list. Roughly how much more work does has_dupe_slow do?',
        choices: ['2× more', '4× more', 'The same'],
        answer: 1,
        why: 'It compares pairs, and the number of pairs grows like n². Double n → 4× the pairs.',
      },
      {
        t: 'try',
        items: [
          'Measure both in Growth',
          'Remove the second 8 and run',
          'Step through has_dupe_fast',
        ],
      },
      {
        t: 'next',
        items: ['What is O(log n)?', 'Why are sets so fast?', 'Would sorting first help?'],
      },
    ],
  }),
  blank({
    id: 'sample-spiral',
    q: 'How do people make generative art with code?',
    lang: 'javascript',
    title: 'Drawing a spiral with code',
    kicker: 'generative art',
    concepts: ['generative-art', 'loops'],
    file: 'spiral.js',
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
    pseudo: [
      '(a note for humans)',
      'Make a 400 × 400 canvas',
      'Paint it warm white',
      '',
      'Four colors to cycle through',
      '',
      'Repeat 260 times, counting with i',
      'Turn a little more each time',
      'Step a little further out',
      "Work out the dot's left–right spot",
      "Work out the dot's up–down spot",
      'Draw a dot that slowly grows',
      '',
    ],
    notes: [
      {
        from: 8,
        to: 9,
        label: 'the whole trick',
        text: 'Angle and distance both grow with i. Together they trace a spiral.',
      },
      {
        from: 10,
        to: 11,
        label: 'cos & sin',
        text: 'They turn an angle + distance into x and y on the screen.',
      },
      {
        from: 12,
        to: 12,
        label: 'i % 4',
        text: 'The remainder after dividing by 4: 0, 1, 2, 3, 0, 1… so the colors repeat.',
      },
    ],
    story: [
      {
        t: 'p',
        md: 'Generative art is a loop with a rule. Here the rule is: **turn a little, step out a little, draw a dot.**',
      },
      {
        t: 'p',
        md: '[[8-9|These two lines]] are the whole idea. `Math.cos` and `Math.sin` turn an angle and a distance into a position on screen: [[10-11|x and y]].',
      },
      {
        t: 'p',
        md: `Hold **${keys('⌥ Option')}** and drag any number in the code. The picture redraws as you drag. Try an angle step of **2.4**: the golden angle, the one sunflowers use.`,
      },
      {
        t: 'quiz',
        q: 'What happens if you change 0.38 to 0?',
        choices: ['A straight line of dots', 'A circle', 'Nothing is drawn'],
        answer: 0,
        why: 'No turning, only stepping out: every dot sits on the same ray, so they form a line.',
      },
      { t: 'try', items: ['Change 0.38 to 2.4', 'Change 0.7 to 1.4', 'Change 260 to 900'] },
      {
        t: 'next',
        items: [
          'How do I animate this?',
          'What are sin and cos, really?',
          'How do I make random art?',
        ],
      },
    ],
  }),
  blank({
    id: 'sample-closure',
    q: "What's a closure?",
    lang: 'javascript',
    title: 'Closures',
    kicker: 'functions',
    concepts: ['closures', 'functions'],
    file: 'counter.js',
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
    pseudo: [
      'A function that builds counters',
      'Each counter starts at 0',
      'Hand back a little function…',
      '…that adds one to its count',
      '…and reports the new count',
      '',
      '',
      '',
      'Build counter a',
      'Build a separate counter b',
      '',
      'Tick a → 1',
      'Tick a again → 2',
      'Tick b → 1 (its own count)',
    ],
    notes: [
      {
        from: 2,
        to: 3,
        label: 'the backpack',
        text: 'tick is born here, so it keeps a private link to count, even after makeCounter returns.',
      },
      {
        from: 9,
        to: 10,
        label: 'two backpacks',
        text: 'Each call makes a fresh count. a and b never share.',
      },
    ],
    story: [
      {
        t: 'p',
        md: 'A **closure** is a function that remembers the variables from where it was created, like carrying a backpack.',
      },
      {
        t: 'p',
        md: '[[3-6|tick]] is created inside `makeCounter`, so it can still see [[2|count]] after `makeCounter` has finished. Nothing else can touch that count: it is private.',
      },
      {
        t: 'p',
        md: 'Press **Step** and watch the call stack: `makeCounter` disappears, but `count` lives on.',
      },
      {
        t: 'quiz',
        q: 'If you call b() one more time after the last line, what does it return?',
        choices: ['1', '2', '3'],
        answer: 1,
        why: 'b has its own count. It was 1, so the next tick makes it 2.',
      },
      { t: 'try', items: ['Add a third counter c', 'Make tick add 10 instead', 'Step through it'] },
      {
        t: 'next',
        items: ['Where do closures show up in React?', 'Closure vs class?', 'What is scope?'],
      },
    ],
  }),
];

export const CHALLENGE = blank({
  id: 'sample-bug',
  q: 'Daily bug',
  mode: 'challenge',
  lang: 'javascript',
  title: 'Daily bug: largest()',
  kicker: 'challenge #1',
  concepts: ['loops', 'arrays'],
  file: 'largest.js',
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
  pseudo: [
    'To find the biggest number:',
    'Start our best guess at 0',
    'Look at each number',
    'Is it bigger than our best?',
    "Then it's the new best",
    '',
    '',
    'Report the best we found',
    '',
    '',
    'Try it on a small list',
  ],
  notes: [],
  tests: {
    fn: 'largest',
    cases: [
      { args: [[3, 9, 2]], expect: 9 },
      { args: [[7]], expect: 7 },
      { args: [[-5, -2, -9]], expect: -2 },
      { args: [[4, 4, 1]], expect: 4 },
    ],
  },
  hints: [
    'What happens when every number is negative?',
    'Look at the starting value on line 2. Is 0 a fair first guess?',
    'Start with the first item instead: let best = nums[0];',
  ],
  story: [
    {
      t: 'p',
      md: '`largest` should return the biggest number in a list. It passes some tests and quietly fails others. Find the bug and turn every light green.',
    },
    {
      t: 'p',
      md: 'Run the **Tests** first. Then change the last line to the failing input and press **Step** to watch [[2|best]] change.',
    },
    { t: 'try', items: ['Run the tests', 'Step through it'] },
    { t: 'next', items: ['Give me another bug', 'How do I test my own code?'] },
  ],
});

// concept map (for the Map view)
export const CONCEPTS = [
  ['variables', 'Variables', 70, 70],
  ['conditionals', 'Conditionals', 200, 50],
  ['loops', 'Loops', 330, 80],
  ['functions', 'Functions', 150, 160],
  ['strings', 'Strings', 470, 50],
  ['arrays', 'Arrays', 420, 170],
  ['objects', 'Objects', 560, 150],
  ['hash-maps', 'Hash maps', 640, 240],
  ['sets', 'Sets', 760, 170],
  ['recursion', 'Recursion', 120, 280],
  ['closures', 'Closures', 260, 250],
  ['classes', 'Classes', 520, 290],
  ['big-o', 'Big-O', 380, 330],
  ['sorting', 'Sorting', 250, 380],
  ['searching', 'Searching', 120, 420],
  ['stacks-queues', 'Stacks & queues', 560, 400],
  ['linked-lists', 'Linked lists', 720, 350],
  ['trees', 'Trees', 420, 460],
  ['graphs', 'Graphs', 640, 480],
  ['async', 'Async', 820, 290],
  ['apis', 'APIs', 860, 410],
  ['react-state', 'React state', 840, 520],
  ['dom', 'The DOM', 760, 590],
  ['generative-art', 'Generative art', 230, 520],
];
export const EDGES = [
  ['variables', 'conditionals'],
  ['conditionals', 'loops'],
  ['variables', 'functions'],
  ['loops', 'arrays'],
  ['strings', 'arrays'],
  ['arrays', 'objects'],
  ['objects', 'hash-maps'],
  ['hash-maps', 'sets'],
  ['functions', 'recursion'],
  ['functions', 'closures'],
  ['objects', 'classes'],
  ['arrays', 'big-o'],
  ['loops', 'big-o'],
  ['big-o', 'sorting'],
  ['sorting', 'searching'],
  ['recursion', 'searching'],
  ['classes', 'stacks-queues'],
  ['classes', 'linked-lists'],
  ['recursion', 'trees'],
  ['big-o', 'trees'],
  ['linked-lists', 'trees'],
  ['trees', 'graphs'],
  ['hash-maps', 'graphs'],
  ['closures', 'async'],
  ['async', 'apis'],
  ['objects', 'react-state'],
  ['closures', 'react-state'],
  ['react-state', 'dom'],
  ['loops', 'generative-art'],
];
