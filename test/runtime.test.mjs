// Runs the JavaScript runtime (instrumentation + run + step tracing) on tricky snippets.
// node test/runtime.test.mjs
globalThis.self = {};
const { handle } = await import('../src/runtime/jsWorker.js');
const cases = [
  ['object-returning arrow', `const xs = [1,2].map((v, i) => ({ v, i }));\nconsole.log(xs[1].v);`, '2'],
  ['emoji strings + nested arrows', `const a = ["🟥 Ada", "🟦 Bo"];\nconst p = a.flatMap((x) => Array.from({ length: 2 }, (_, j) => ({ x, j })));\nconsole.log(p.length);`, '4'],
  ['double parens', `const f = (a) => ((a + 1));\nconsole.log(f(1));`, '2'],
  ['closure counter', `function counter() { let n = 0; return () => ++n; }\nconst c = counter(); c(); console.log(c());`, '2'],
  ['class + method', `class A { constructor(x) { this.x = x; } twice() { return this.x * 2; } }\nconsole.log(new A(4).twice());`, '8'],
  ['async/await', `const wait = (v) => new Promise((r) => setTimeout(() => r(v), 1));\nconsole.log(await wait(7));`, '7'],
  ['recursion', `function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }\nconsole.log(fib(10));`, '55'],
  ['destructuring', `const { a, b: [c] } = { a: 1, b: [2] };\nconsole.log(a + c);`, '3'],
];
let fail = 0;
for (const [name, code, want] of cases) {
  for (const mode of ['run', 'trace']) {
    const r = await handle({ mode, code });
    const got = r.logs.map((l) => l.s).join('|');
    const ok = !r.error && got === want;
    if (!ok) fail++;
    console.log(`${ok ? '✓' : '✗'} ${name} (${mode})${ok ? '' : ` → ${r.error ? r.error.msg : got}`}`);
  }
}
// TypeScript: types are stripped (lines preserved), then it runs like JavaScript
const { transform } = await import('sucrase');
const ts = 'interface Item { name: string; price: number }\nconst cart: Item[] = [{ name: "tea", price: 3 }, { name: "cake", price: 5 }];\nconst total: number = cart.reduce((s: number, i: Item) => s + i.price, 0);\nconsole.log(total);';
const js = transform(ts, { transforms: ['typescript'], disableESTransforms: true }).code;
for (const mode of ['run', 'trace']) { const r = await handle({ mode, code: js }); const ok = !r.error && r.logs.map((l) => l.s).join('|') === '8' && (mode === 'run' || r.steps.every((st) => st.line <= 4)); if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} typescript (${mode})`); }
const rec = await handle({ mode: 'run', code: 'show([{ name: "Ana", age: 9 }, { name: "Bo", city: "Oslo" }]);' });
const rv = rec.visuals[0]; const recOk = rv?.type === 'records' && rv.cols.join() === 'name,age,city' && rv.rows[1][2] === '"Oslo"';
if (!recOk) fail++; console.log(`${recOk ? '✓' : '✗'} list of records draws as a table`);
const loop = await handle({ mode: 'run', code: 'while (true) {}' });
console.log(`${loop.error?.msg?.includes('Stopped') ? '✓' : '✗'} infinite loop is stopped`); if (!loop.error) fail++;
// Instant error explanations: real error messages from the runtime get a plain-words explanation
const { explainLocal } = await import('../src/errors.js');
for (const [code, word] of [['console.log(totl);', 'variable'], ['const o = undefined; o.name;', 'undefined'], ['const c = 1; c = 2;', 'const'], ['const f = 3; f();', 'function'], ['function r() { return r(); } r();', 'recursion'], ['while (true) {}', 'infinite loop']]) {
  const r = await handle({ mode: 'run', code }); const e = explainLocal(r.error?.msg);
  const ok = e?.word === word; if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} explains "${r.error?.msg}"${ok ? '' : ` → ${JSON.stringify(e)}`}`);
}
for (const [msg, word] of [["NameError: name 'totl' is not defined", 'variable'], ["SyntaxError: expected an indented block after 'if' statement on line 1", 'indentation'], ["KeyError: 'age'", 'dictionary'], ['IndexError: list index out of range', 'index'], ["AttributeError: 'NoneType' object has no attribute 'x'", 'None'], ['TypeError: can only concatenate str (not "int") to str', 'type'], ['TypeError: add() missing 1 required positional argument: \'b\'', 'parameter'], ["SyntaxError: '(' was never closed", 'syntax']]) {
  const e = explainLocal(msg); const ok = e?.word === word; if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} explains ${msg.slice(0, 50)}${ok ? '' : ` → ${JSON.stringify(e)}`}`);
}
// Lessons export to self-contained web pages
{ const { lessonHtml } = await import('../src/exportHtml.js'); const fs = await import('node:fs');
  const all = [...Object.values(JSON.parse(fs.readFileSync(new URL('../src/ideas-prebuilt.json', import.meta.url)))), ...Object.values(JSON.parse(fs.readFileSync(new URL('../src/path-prebuilt.json', import.meta.url))))].flat();
  let bad = 0; for (const L of all) { if (!L?.title) continue; const h = lessonHtml(L); if (!h.includes('</html>') || /undefined|\[object Object\]/.test(h.replace(/<script>[\s\S]*<\/script>/, '')) || (['python', 'javascript'].includes(L.lang) && L.code && !h.includes('onclick="run()"'))) bad++; }
  const ok = all.length > 20 && !bad; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${all.length} shipped lessons export to web pages${bad ? ` (${bad} bad)` : ''}`); }
// Spotting constructs as you write (no AI): finds them, and stays quiet on plain code
{ const { spotConstructs: sc } = await import('../src/constructs.js');
  const cases = [['squares = [x*x for x in range(9)]', 'python', 'listcomp'], ['print(f"hi {n}")', 'python', 'fstring'], ['const f = (a) => a * 2;', 'javascript', 'arrow'], ['const u = d?.user ?? "guest";', 'javascript', 'nullish'],
    ['for i in range(3):\n    print(i)', 'python', null], ['d = {"a": 1}\nprint(d["a"])', 'python', null], ['const o = { a: 1 };\nconsole.log(o.a);', 'javascript', null]];
  for (const [code, lang, want] of cases) { const got = sc(code, lang).map((x) => x.id); const ok = want ? got.includes(want) : got.length === 0; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} spots ${want || 'nothing'} in ${JSON.stringify(code.slice(0, 30))}${ok ? '' : ` → ${got}`}`); } }
process.exit(fail ? 1 : 0);
