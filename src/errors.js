// Instant, offline explanations for the errors beginners hit most. No AI needed.
// Each rule: [regex on the error message, (match) => { plain, fix, word }].
const q = (s) => `\`${s}\``;
const NOUN = {
  int: 'a whole number (int)',
  float: 'a decimal number (float)',
  str: 'text (str)',
  list: 'a list',
  dict: 'a dictionary',
  tuple: 'a tuple',
  NoneType: 'None (nothing)',
  bool: 'True/False (bool)',
  set: 'a set',
  function: 'a function',
};
const a = (t) => NOUN[t] || `a ${q(t)} value`;
const PY_NAMES = {
  push: '.append(x)',
  length: 'len(x)',
  toUpperCase: '.upper()',
  toLowerCase: '.lower()',
  forEach: 'a for loop',
  includes: 'x in items',
  indexOf: '.index(x)',
  trim: '.strip()',
  size: 'len(x)',
  add: 'set.add(x) — or .append(x) for a list',
};
/** @typedef {{ plain: string, fix?: string, word?: string }} Explained */
/** Each rule: an error message pattern, and how to explain a match
 * @type {Array<[RegExp, (m: RegExpMatchArray) => Explained]>} */
const RULES = [
  // Python
  [
    /NameError: name '(\w+)' is not defined/,
    (m) => ({
      plain: `Python doesn’t know anything called ${q(m[1])} yet. Either it’s misspelled, or it’s used before the line that creates it.`,
      fix: `Check the spelling, or make sure ${q(m[1])} = … runs above this line.`,
      word: 'variable',
    }),
  ],
  [
    /UnboundLocalError: .*'(\w+)'/,
    (m) => ({
      plain: `Inside this function, ${q(m[1])} is changed, so Python treats it as the function’s own variable, but it’s read before it gets a value.`,
      fix: `Give ${q(m[1])} a value at the top of the function, or pass it in as a parameter.`,
      word: 'scope',
    }),
  ],
  [
    /IndentationError|TabError|indent/,
    () => ({
      plain:
        'Python uses indentation (the spaces at the start of a line) to know which lines belong together. One line is shifted the wrong amount.',
      fix: 'Line it up with the lines around it. Use 4 spaces per level.',
      word: 'indentation',
    }),
  ],
  [
    /SyntaxError: .*(was never closed|unexpected EOF)/,
    () => ({
      plain:
        'A bracket or quote was opened and never closed, so Python reached the end still waiting for it.',
      fix: 'Count your ( [ { and quotes on this line and the one above.',
      word: 'syntax',
    }),
  ],
  [
    /SyntaxError: invalid syntax\. Perhaps you forgot a comma/,
    () => ({
      plain: 'Two things sit next to each other with nothing between them.',
      fix: 'Add the missing comma between the items.',
      word: 'syntax',
    }),
  ],
  [
    /SyntaxError: expected ':'/,
    () => ({
      plain: 'Lines that start a block (if, for, while, def, class) must end with a colon.',
      fix: 'Add `:` at the end of that line.',
      word: 'syntax',
    }),
  ],
  [
    /SyntaxError/,
    () => ({
      plain: 'Python couldn’t read this line. It’s a grammar mistake, so nothing ran yet.',
      fix: 'Look for a missing bracket, quote, colon or comma near the marked line.',
      word: 'syntax',
    }),
  ],
  [
    /ZeroDivisionError/,
    () => ({
      plain: 'The code divided by zero, which has no answer.',
      fix: 'Check the number you divide by first: `if n != 0:`.',
      word: 'edge case',
    }),
  ],
  [
    /IndexError: (list|string|tuple) index out of range/,
    (m) => ({
      plain: `The code asked for a position the ${m[1]} doesn’t have. Positions start at 0, so a ${m[1]} of 3 items has positions 0, 1 and 2.`,
      fix: 'Use `len(...)` to stay inside, or `range(len(x))` in loops.',
      word: 'index',
    }),
  ],
  [
    /KeyError: (.+)/,
    (m) => ({
      plain: `The dictionary has no key ${q(m[1].trim())}. Asking for a missing key is an error in Python.`,
      fix: `Use \`d.get(${m[1].trim()})\` to get None instead, or check with \`if ${m[1].trim()} in d:\`.`,
      word: 'dictionary',
    }),
  ],
  [
    /AttributeError: 'NoneType'/,
    () => ({
      plain: 'The value is None (nothing). Often a function forgot to `return` something.',
      fix: 'Find where this value came from and make sure it returns a result.',
      word: 'None',
    }),
  ],
  [
    /AttributeError: '(\w+)' object has no attribute '(\w+)'/,
    (m) => ({
      plain: `${a(m[1]).replace(/^a/, 'A')} doesn’t have anything called ${q(m[2])}.`,
      fix: PY_NAMES[m[2]]
        ? `In Python that’s ${q(PY_NAMES[m[2]])} (${q(m[2])} is the JavaScript name).`
        : `Check the spelling, or check that the value really is what you think. Print it with \`print(type(x))\`.`,
      word: 'attribute',
    }),
  ],
  [
    /TypeError: can only concatenate str \(not "(\w+)"\) to str/,
    (m) => ({
      plain: `Text and ${a(m[1])} were joined with +. Python won’t mix them automatically.`,
      fix: 'Turn the number into text with `str(n)`, or use an f-string: `f"total: {n}"`.',
      word: 'type',
    }),
  ],
  [
    /TypeError: unsupported operand type\(s\) for (.+): '(\w+)' and '(\w+)'/,
    (m) => ({
      plain: `${q(m[1])} doesn’t work between ${a(m[2])} and ${a(m[3])}.`,
      fix: 'Convert one side so both are the same type, like `int(x)` or `str(x)`.',
      word: 'type',
    }),
  ],
  [
    /TypeError: '(\w+)' object is not callable/,
    (m) => ({
      plain: `The code used ${a(m[1])} as if it were a function (with ( ) after it). Often a variable has the same name as a function.`,
      fix: 'Rename the variable, or remove the ( ).',
      word: 'function',
    }),
  ],
  [
    /TypeError: '(\w+)' object is not subscriptable/,
    (m) => ({
      plain: `The code used [ ] on ${a(m[1])}, which has no positions or keys to look up.`,
      fix: 'Check that the value is a list or dict before indexing it.',
      word: 'index',
    }),
  ],
  [
    /TypeError: '(\w+)' object is not iterable/,
    (m) => ({
      plain: `A loop tried to go through ${a(m[1])} one item at a time, but it’s a single value.`,
      fix: 'Loop over a list, or use `range(n)` to count.',
      word: 'loop',
    }),
  ],
  [
    /TypeError: (\w+)\(\) missing (\d+) required positional argument/,
    (m) => ({
      plain: `${q(m[1] + '()')} needs ${m[2]} more input${m[2] === '1' ? '' : 's'} than it was given.`,
      fix: 'Pass every value listed in its `def` line.',
      word: 'parameter',
    }),
  ],
  [
    /TypeError: (\w+)\(\) takes (\d+) positional arguments? but (\d+) (?:were|was) given/,
    (m) => ({
      plain: `${q(m[1] + '()')} takes ${m[2]} input${m[2] === '1' ? '' : 's'}, but it got ${m[3]}. Inside a class, ${q('self')} counts as one.`,
      fix: 'Match the call to the `def` line, or add `self` as the first parameter of a method.',
      word: 'parameter',
    }),
  ],
  [
    /ValueError: invalid literal for int\(\) with base 10: (.+)/,
    (m) => ({
      plain: `${m[1]} isn’t a whole number, so int() can’t convert it.`,
      fix: 'Check the text first, or use `float()` for decimals.',
      word: 'type',
    }),
  ],
  [
    /ValueError: too many values to unpack|not enough values to unpack/,
    () => ({
      plain:
        'The number of names on the left of `=` doesn’t match the number of values on the right.',
      fix: 'Make the counts match: `a, b = 1, 2`.',
      word: 'unpacking',
    }),
  ],
  [
    /RecursionError|recursion went more than/,
    () => ({
      plain:
        'A function kept calling itself and never stopped, until Python ran out of room to remember the calls.',
      fix: 'Add a base case: a condition where it returns without calling itself.',
      word: 'recursion',
    }),
  ],
  [
    /ModuleNotFoundError: No module named '(\w+)'/,
    (m) => ({
      plain: `${q(m[1])} isn’t available here. Lessons run in your browser, so only Python’s built-in modules (and a few like numpy) work.`,
      fix: 'Use a built-in module, or write the part you need yourself.',
      word: 'module',
    }),
  ],
  [
    /(step limit|too many steps|infinite loop|took too long)/i,
    () => ({
      plain:
        'The code ran for so long that Bento stopped it. Usually a loop whose condition never becomes false.',
      fix: 'Check that something inside the loop moves it towards the end (like `i += 1`).',
      word: 'infinite loop',
    }),
  ],
  // JavaScript
  [
    /ReferenceError: (\w+) is not defined/,
    (m) => ({
      plain: `JavaScript doesn’t know anything called ${q(m[1])}. It’s misspelled, or created somewhere this line can’t see.`,
      fix: `Declare it first: \`let ${m[1]} = …\`.`,
      word: 'variable',
    }),
  ],
  [
    /ReferenceError: Cannot access '(\w+)' before initialization/,
    (m) => ({
      plain: `${q(m[1])} is used on a line above the one that creates it.`,
      fix: 'Move the `let`/`const` line above the first use.',
      word: 'scope',
    }),
  ],
  [
    /TypeError: Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(\w+)'\))?/,
    (m) => ({
      plain: `The code asked for ${m[2] ? q('.' + m[2]) : 'a property'} on a value that is ${m[1]} (nothing there).`,
      fix:
        'Print the value just before this line. Use `x?.' +
        (m[2] || 'name') +
        '` to skip it safely when it’s missing.',
      word: m[1],
    }),
  ],
  [
    /TypeError: (.+) is not a function/,
    (m) => ({
      plain: `${q(m[1])} isn’t a function, so it can’t be called with ( ).`,
      fix: 'Check the spelling, and that the value is what you expect (`console.log(typeof x)`).',
      word: 'function',
    }),
  ],
  [
    /TypeError: Assignment to constant variable/,
    () => ({
      plain: 'A `const` can’t be given a new value.',
      fix: 'Use `let` for values that change.',
      word: 'const',
    }),
  ],
  [
    /RangeError: Maximum call stack size exceeded/,
    () => ({
      plain: 'A function kept calling itself and never stopped.',
      fix: 'Add a base case that returns without calling itself.',
      word: 'recursion',
    }),
  ],
  [
    /SyntaxError: (Unexpected token|Unexpected end of input|missing \) after|Unterminated)/,
    () => ({
      plain: 'JavaScript couldn’t read the code: a bracket, quote or comma is missing or extra.',
      fix: 'Count the ( { [ and quotes near the marked line.',
      word: 'syntax',
    }),
  ],
];

export function explainLocal(msg = '') {
  for (const [rx, fn] of RULES) {
    const m = String(msg).match(rx);
    if (m) return { ...fn(m), local: true };
  }
  return null;
}
