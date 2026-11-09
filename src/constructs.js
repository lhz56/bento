// Spots well-known code constructs as you write, so Bento can say "you just used X" and explain it instantly (no AI).
// Each: [id, name, langs, regex, plain explanation, everyday comparison]
const C = [
  ['listcomp', 'list comprehension', 'py', /\[[^[\]\n]+\bfor\b[^[\]\n]+\bin\b[^\]\n]+\]/, 'Builds a new list in one line: “for each item in this, keep this”.', 'Like telling a helper “bring me a copy of every red card”.'],
  ['dictcomp', 'dict comprehension', 'py', /\{[^{}\n]+:[^{}\n]+\bfor\b[^{}\n]+\bin\b[^}\n]+\}/, 'Builds a dictionary in one line, a key and a value for each item.', 'Like writing name tags for everyone in a room at once.'],
  ['fstring', 'f-string', 'py', /\bf["']/, 'Text with {placeholders} that Python fills in with values.', 'Like a form letter: “Dear {name}”.'],
  ['lambda', 'lambda', 'py', /\blambda\b[^:\n]*:/, 'A tiny function with no name, written in one line.', 'Like a sticky note with one instruction on it.'],
  ['yield', 'generator (yield)', 'py', /\byield\b/, 'A function that hands out values one at a time, pausing between them.', 'Like a ticket machine that prints the next number only when asked.'],
  ['tryexcept', 'try / except', 'py', /^\s*try\s*:/m, 'Run some code, and if it fails, run a backup plan instead of crashing.', 'Like a safety net under a trapeze.'],
  ['with', 'with statement', 'py', /^\s*with\s+[^\n]+:/m, 'Opens something and guarantees it gets closed afterwards, even on errors.', 'Like a library book that returns itself.'],
  ['decorator', 'decorator', 'py', /^\s*@\w+/m, 'Wraps a function to add extra behaviour without changing its code.', 'Like putting a phone in a case: same phone, new powers.'],
  ['class', 'class', 'both', /^\s*class\s+\w+/m, 'A blueprint for making objects that bundle data with the things they can do.', 'Like a cookie cutter: one shape, many cookies.'],
  ['enumerate', 'enumerate', 'py', /\benumerate\(/, 'Loops over items and gives you each one’s position too.', 'Like numbering the people in a queue as you greet them.'],
  ['zip', 'zip', 'py', /\bzip\(/, 'Walks through two lists side by side, pairing their items.', 'Like a zipper joining two rows of teeth.'],
  ['slice', 'slicing', 'py', /\w\[\s*-?\w*\s*:\s*-?\w*\s*(:\s*-?\w*\s*)?\]/, 'Takes a piece of a list or text by start and end positions.', 'Like cutting a few slices from a loaf.'],
  ['unpack', 'unpacking', 'py', /^\s*\w+\s*,\s*\w+(\s*,\s*\w+)*\s*=[^=]/m, 'Gives several names to the parts of a list or tuple at once.', 'Like unpacking a bag straight onto labelled shelves.'],
  ['ternarypy', 'conditional expression', 'py', /=\s*[^=\n]+\bif\b[^:\n]+\belse\b[^:\n]+$/m, 'Picks one of two values in a single line: A if this is true, else B.', 'Like “umbrella if it’s raining, else sunglasses”.'],
  ['while', 'while loop', 'py', /^\s*while\b[^\n]*:/m, 'Repeats as long as a condition stays true.', 'Like stirring until the sauce thickens.'],
  ['dictget', 'dict.get', 'py', /\.get\(/, 'Looks up a key, and returns a default instead of crashing if it’s missing.', 'Like asking “do you have it? if not, no worries”.'],
  ['arrow', 'arrow function', 'js', /=>/, 'A short way to write a function: inputs on the left, result on the right.', 'Like a vending machine: coin in, snack out.'],
  ['template', 'template literal', 'js', /`[^`]*\$\{/, 'Text in backticks with ${placeholders} filled in with values.', 'Like a form letter: “Dear ${name}”.'],
  ['destructure', 'destructuring', 'js', /\b(const|let|var)\s*[[{]/, 'Pulls values out of an object or array straight into named variables.', 'Like unpacking a lunchbox into labelled plates.'],
  ['spread', 'spread (...)', 'js', /\.\.\.\w/, 'Copies all the items of an array or object into a new one.', 'Like pouring one jar of buttons into another.'],
  ['await', 'async / await', 'js', /\bawait\b/, 'Waits for something slow (like the network) without freezing everything else.', 'Like ordering coffee and stepping aside until your name is called.'],
  ['optional', 'optional chaining (?.)', 'js', /\?\.\w/, 'Reads a property only if the thing before it exists, otherwise gives undefined.', 'Like “if there is a mailbox, check it”.'],
  ['nullish', 'nullish coalescing (??)', 'js', /\?\?/, 'Uses a fallback only when the value is missing (null or undefined).', 'Like a spare key under the mat.'],
  ['mapfilter', 'map / filter / reduce', 'js', /\.(map|filter|reduce)\(/, 'Transform, keep or combine every item of an array without writing a loop.', 'Like an assembly line where each station does one job.'],
  ['ternaryjs', 'ternary operator', 'js', /[^?]\?\s*[^?.:\s][^:\n]*\s:\s/, 'Picks one of two values in one line: condition ? this : that.', 'Like a fork in the road with a signpost.'],
  ['trycatch', 'try / catch', 'js', /\btry\s*\{/, 'Runs some code, and if it throws an error, handles it instead of crashing.', 'Like a safety net under a trapeze.'],
  ['promise', 'Promise', 'js', /new Promise\(/, 'An object standing for a result that will arrive later.', 'Like a restaurant buzzer that goes off when your food is ready.'],
];

export function spotConstructs(code = '', lang = 'python') {
  const L = lang === 'python' ? 'py' : 'js';
  const out = [];
  for (const [id, name, langs, rx, plain, like] of C) {
    if (langs !== 'both' && langs !== L) continue;
    const m = rx.exec(code); if (!m) continue;
    out.push({ id, name, plain, like, line: code.slice(0, m.index).split('\n').length });
  }
  return out;
}
