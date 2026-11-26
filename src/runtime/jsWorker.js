// Runs JavaScript in a worker. Supports: run, trace (step-through), growth (count steps vs n), tests.
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const STEP_LIMIT = 2500;
const COUNT_LIMIT = 4_000_000;
class Stop extends Error {}
class NeedInput extends Error {
  constructor(prompt) {
    super(prompt);
    this.prompt = prompt;
  }
}
let liveId = null,
  liveMode = null,
  liveT0 = 0,
  liveLast = 0,
  liveBuf = [];
function live(k, s) {
  if (liveMode !== 'run') return;
  liveBuf.push({ k, s });
  const now = performance.now();
  if (now - liveT0 > 250 && now - liveLast > 50) {
    self.postMessage?.({ id: liveId, live: liveBuf });
    liveBuf = [];
    liveLast = now;
  }
}

// ---------- value formatting
function short(v, d = 0) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v.length > 40 ? v.slice(0, 38) + '…' : v);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'function') return `ƒ ${v.name || ''}`.trim();
  if (d > 1) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) {
    const s = v.slice(0, 10).map((x) => short(x, d + 1));
    if (v.length > 10) s.push('…');
    return `[${s.join(', ')}]`;
  }
  if (v instanceof Map)
    return `Map(${v.size}) {${[...v]
      .slice(0, 6)
      .map(([k, x]) => `${short(k, d + 1)} → ${short(x, d + 1)}`)
      .join(', ')}${v.size > 6 ? ', …' : ''}}`;
  if (v instanceof Set)
    return `Set(${v.size}) {${[...v]
      .slice(0, 8)
      .map((x) => short(x, d + 1))
      .join(', ')}${v.size > 8 ? ', …' : ''}}`;
  if (isNode(v))
    return `${v.constructor?.name && v.constructor.name !== 'Object' ? v.constructor.name : 'Node'}(${short(nodeLabel(v), 2)})`;
  const ks = Object.keys(v);
  const s = ks.slice(0, 6).map((k) => `${k}: ${short(v[k], d + 1)}`);
  if (ks.length > 6) s.push('…');
  return `{${s.join(', ')}}`;
}
// a tree node: left and right (either may be empty), or only one of them holding a node (a chain), or a children list
const kid = (x) => x == null || (typeof x === 'object' && !Array.isArray(x));
const isNode = (v) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  (('left' in v && 'right' in v && kid(v.left) && kid(v.right)) ||
    ('left' in v !== 'right' in v &&
      [v.left, v.right].some((x) => x && typeof x === 'object' && !Array.isArray(x))) ||
    Array.isArray(v.children));
const nodeLabel = (v) =>
  ['val', 'value', 'key', 'data', 'name', 'label'].map((k) => v[k]).find((x) => x !== undefined) ??
  '•';

function toTree(n, seen = new Set(), budget = { n: 0 }) {
  if (n == null || seen.has(n) || budget.n++ > 200) return null;
  seen.add(n);
  if (Array.isArray(n.children))
    return {
      v: String(nodeLabel(n)),
      kids: n.children.map((c) => toTree(c, seen, budget)),
      binary: false,
    };
  return {
    v: String(nodeLabel(n)),
    kids: [toTree(n.left, seen, budget), toTree(n.right, seen, budget)],
    binary: true,
  };
}
function toViz(x, label) {
  if (Array.isArray(x) && x.length && x.every((n) => typeof n === 'number'))
    return { type: 'bars', data: x.slice(0, 200), label };
  if (Array.isArray(x) && x.length && x.every((r) => Array.isArray(r)))
    return {
      type: 'grid',
      data: x.slice(0, 40).map((r) => r.slice(0, 40).map((c) => short(c, 1))),
      label,
    };
  if (
    Array.isArray(x) &&
    x.length &&
    x.every(
      (r) =>
        r &&
        typeof r === 'object' &&
        !Array.isArray(r) &&
        !isNode(r) &&
        !(r instanceof Map) &&
        !(r instanceof Set),
    )
  ) {
    const cols = [];
    for (const r of x.slice(0, 60))
      for (const k of Object.keys(r)) if (!cols.includes(k) && cols.length < 8) cols.push(k);
    return {
      type: 'records',
      cols,
      rows: x.slice(0, 60).map((r) => cols.map((c) => (c in r ? short(r[c], 1) : ''))),
      label,
    };
  }
  if (isNode(x)) return { type: 'tree', root: toTree(x), label };
  if (x instanceof Map)
    return {
      type: 'table',
      rows: [...x].slice(0, 60).map(([k, v]) => [short(k, 1), short(v, 1)]),
      label,
    };
  if (x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Set))
    return {
      type: 'table',
      rows: Object.entries(x)
        .slice(0, 60)
        .map(([k, v]) => [k, short(v, 1)]),
      label,
    };
  return { type: 'text', text: typeof x === 'string' ? x : short(x), label };
}

// ---------- helpers exposed to user code
let out;
function fresh() {
  out = { logs: [], visuals: [], canvas: null };
  answers = [];
  stopTimers();
  lateError = null;
}
// Timers and fetches the program starts: the run waits for them to finish (a promise lesson's "soup ready" after 300 ms
// is the point of the lesson), instead of ending as soon as the top-level code does. A timer that repeats forever is
// stopped after a few seconds, and says so. An error inside a timer, or a rejected promise nobody handled, is the run's
// error instead of vanishing.
const timers = new Map();
let timerSeq = 0,
  inflight = 0,
  lateError = null;
const WAIT_LIMIT = 20000,
  REPEAT_LIMIT = 3000;
function stopTimers() {
  for (const t of timers.values()) (t.every ? clearInterval : clearTimeout)(t.h);
  timers.clear();
  inflight = 0;
}
const later =
  (every) =>
  (fn, ms = 0, ...args) => {
    const id = ++timerSeq;
    const run = () => {
      if (!every) timers.delete(id);
      try {
        if (typeof fn === 'function') fn(...args);
      } catch (e) {
        lateError ||= e;
      }
    };
    timers.set(id, {
      every,
      h: every ? setInterval(run, Math.max(10, +ms || 0)) : setTimeout(run, +ms || 0),
    });
    return id;
  };
const cancel = (id) => {
  const t = timers.get(id);
  if (t) {
    (t.every ? clearInterval : clearTimeout)(t.h);
    timers.delete(id);
  }
};
self.addEventListener?.('unhandledrejection', (e) => {
  lateError ||= e.reason ?? new Error('A promise was rejected and nothing caught it');
  e.preventDefault?.();
});
let answers = [];
function canvas() {
  if (!out.canvas) {
    out.canvas = { type: 'canvas', w: 400, h: 400, cmds: [] };
    out.visuals.push(out.canvas);
  }
  return out.canvas;
}
const cap = (c) => {
  if (c.cmds.length > 60000) throw new Error('Too many drawing commands');
  return c;
};
const logf =
  (k) =>
  (...a) => {
    const s = a.map((x) => (typeof x === 'string' ? x : short(x))).join(' ');
    out.logs.push({ k, s });
    live(k, s);
  };
// prompt()/input(): answers come from the learner; with none left, the run pauses to ask
const ask = (msg = '') => {
  const p = String(msg ?? '');
  if (answers.length) {
    const a = String(answers.shift());
    out.logs.push({ k: 'in', p, s: a });
    live('in', p + a);
    return a;
  }
  throw new NeedInput(p);
};
// fetch() goes through the app, so sites that block browser pages still answer
async function netFetch(url, opts = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(opts.headers || {})) headers[`x-h-${k.toLowerCase()}`] = v;
  const r = await self.fetch(`/__net?u=${encodeURIComponent(String(url))}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });
  const status = +r.headers.get('x-status') || 0;
  const text = await r.text();
  if (!status) throw new TypeError(`Failed to fetch: ${text}`);
  return new Response(text, {
    status,
    headers: { 'content-type': r.headers.get('x-content-type') || 'text/plain' },
  });
}
const H = {
  print: logf('log'),
  console: {
    log: logf('log'),
    info: logf('log'),
    warn: logf('warn'),
    error: logf('err'),
    table: (x) => out.visuals.push(toViz(x)),
  },
  prompt: ask,
  input: ask,
  fetch: (...a) => {
    inflight++;
    return netFetch(...a).finally(() => {
      inflight = Math.max(0, inflight - 1);
    });
  },
  sleep: (ms) => new Promise((r) => later(false)(r, ms)),
  setTimeout: later(false),
  setInterval: later(true),
  clearTimeout: cancel,
  clearInterval: cancel,
  show: (x, label) => {
    if (out.visuals.length < 40) out.visuals.push(toViz(x, label));
  },
  size: (w, h) => {
    const c = canvas();
    c.w = w;
    c.h = h;
  },
  background: (c) => cap(canvas()).cmds.push(['bg', c]),
  circle: (x, y, r, c) => cap(canvas()).cmds.push(['circle', x, y, r, c]),
  rect: (x, y, w, h, c) => cap(canvas()).cmds.push(['rect', x, y, w, h, c]),
  line: (x1, y1, x2, y2, c, w) => cap(canvas()).cmds.push(['line', x1, y1, x2, y2, c, w]),
  text: (s, x, y, c) => cap(canvas()).cmds.push(['text', String(s), x, y, c]),
};
const HN = Object.keys(H);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Line offset of user code inside a `new AsyncFunction` body
// user line 1 sits on the same stack line as this probe's throw
const OFFSET = (() => {
  try {
    new Function('a', 'b', '\nthrow new Error("x")')();
  } catch (e) {
    const m = /<anonymous>:(\d+)/.exec(e.stack);
    return m ? +m[1] - 1 : 3;
  }
  return 3;
})();

function errInfo(e, extraOffset = 0) {
  if (e instanceof Stop) return { msg: e.message, line: null };
  const m = /<anonymous>:(\d+):(\d+)/.exec(e?.stack || '');
  let line = m ? +m[1] - OFFSET - extraOffset : null;
  return { msg: `${e?.name || 'Error'}: ${e?.message ?? e}`, line: line && line > 0 ? line : null };
}
function syntaxCheck(code) {
  try {
    acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      locations: true,
    });
    return null;
  } catch (e) {
    return {
      msg: `SyntaxError: ${e.message.replace(/ \(\d+:\d+\)$/, '')}`,
      line: e.loc?.line ?? null,
    };
  }
}

// ---------- instrumentation (trace + count)
function instrument(code, { snapshots }) {
  const ast = acorn.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    locations: true,
  });
  const edits = []; // {pos, text, prio}
  const add = (pos, text, prio = 0) => edits.push({ pos, text, prio });

  // collect declared names per scope node
  const scopeNames = new Map();
  const declIn = (scope, name) => {
    if (!scopeNames.has(scope)) scopeNames.set(scope, new Set());
    scopeNames.get(scope).add(name);
  };
  const patNames = (p, f) => {
    if (!p) return;
    if (p.type === 'Identifier') f(p.name);
    else if (p.type === 'ObjectPattern')
      p.properties.forEach((q) => patNames(q.value || q.argument, f));
    else if (p.type === 'ArrayPattern') p.elements.forEach((q) => patNames(q, f));
    else if (p.type === 'RestElement') patNames(p.argument, f);
    else if (p.type === 'AssignmentPattern') patNames(p.left, f);
  };
  walk.ancestor(ast, {
    VariableDeclaration(node, anc) {
      const scope =
        node.kind === 'var'
          ? [...anc].reverse().find((a) => /Function|Program/.test(a.type))
          : [...anc]
              .reverse()
              .slice(1)
              .find((a) => /BlockStatement|Program|For/.test(a.type) || /Function/.test(a.type));
      node.declarations.forEach((d) =>
        patNames(d.id, (n) => declIn(scope?.type?.startsWith('For') ? scope : scope, n)),
      );
    },
    FunctionDeclaration(node, anc) {
      const s = [...anc]
        .reverse()
        .slice(1)
        .find((a) => /BlockStatement|Program/.test(a.type));
      if (node.id) declIn(s, node.id.name);
    },
    ClassDeclaration(node, anc) {
      const s = [...anc]
        .reverse()
        .slice(1)
        .find((a) => /BlockStatement|Program/.test(a.type));
      if (node.id) declIn(s, node.id.name);
    },
    Function(node) {
      node.params.forEach((p) => patNames(p, (n) => declIn(node, n)));
    },
  });

  const fnName = (node, parent) =>
    node.id?.name ||
    (parent?.type === 'VariableDeclarator' && parent.id.name) ||
    (parent?.type === 'MethodDefinition' && parent.key.name) ||
    (parent?.type === 'Property' && parent.key.name) ||
    'anonymous';
  const visible = (anc) => {
    const s = new Set();
    for (const a of anc) scopeNames.get(a)?.forEach((n) => s.add(n));
    return [...s];
  };
  const snap = (names) =>
    snapshots ? `,()=>({${names.map((n) => `${JSON.stringify(n)}:__v(()=>${n})`).join(',')}})` : '';

  walk.ancestor(ast, {
    Statement(node, anc) {
      const parent = anc[anc.length - 2];
      if (!parent) return;
      const inBody =
        (parent.type === 'BlockStatement' ||
          parent.type === 'Program' ||
          parent.type === 'SwitchCase') &&
        (parent.body || parent.consequent)?.includes?.(node);
      if (!inBody) return;
      if (/^(FunctionDeclaration|ClassDeclaration|EmptyStatement)$/.test(node.type)) return;
      add(node.start, `__s(${node.loc.start.line}${snap(visible(anc))});`, 0);
    },
    ReturnStatement(node) {
      if (node.argument) {
        add(node.argument.start, '__ret(', 1);
        add(node.argument.end, ')', -1);
      }
    },
    // empty or single-statement loops still count as steps, so `while (true) {}` gets stopped
    WhileStatement(node) {
      if (node.body.type === 'BlockStatement' && !node.body.body.length)
        add(node.body.start + 1, `__s(${node.loc.start.line});`, 0);
    },
    ForStatement(node) {
      if (node.body.type === 'BlockStatement' && !node.body.body.length)
        add(node.body.start + 1, `__s(${node.loc.start.line});`, 0);
    },
    DoWhileStatement(node) {
      if (node.body.type === 'BlockStatement' && !node.body.body.length)
        add(node.body.start + 1, `__s(${node.loc.start.line});`, 0);
    },
  });
  walk.ancestor(ast, {
    Function(node, anc) {
      const parent = anc[anc.length - 2];
      const name = JSON.stringify(fnName(node, parent));
      const params = [];
      node.params.forEach((p) => patNames(p, (n) => params.push(n)));
      const args = `{${params.map((n) => `${JSON.stringify(n)}:__v(()=>${n})`).join(',')}}`;
      if (node.body.type === 'BlockStatement') {
        add(node.body.start + 1, `__enter(${name},${args},${node.loc.start.line});try{`, 5);
        add(node.body.end - 1, `}finally{__exit()}`, 5);
      } else {
        // expression body: wrap OUTSIDE any parentheses, so "=> ({ a: 1 })" stays an object, not a block
        let b0 = node.body.start,
          b1 = node.body.end;
        for (;;) {
          let i = b0 - 1;
          while (i >= 0 && /\s/.test(code[i])) i--;
          let j = b1;
          while (j < code.length && /\s/.test(code[j])) j++;
          if (code[i] === '(' && code[j] === ')') {
            b0 = i;
            b1 = j + 1;
          } else break;
        }
        add(b0, `{__enter(${name},${args},${node.loc.start.line});try{return __ret(`, 5);
        add(b1, `)}finally{__exit()}}`, -0.5 + anc.length * 0.001); // inner closers must land before outer ones
      }
    },
  });
  edits.sort((a, b) => b.pos - a.pos || a.prio - b.prio);
  let s = code;
  for (const e of edits) s = s.slice(0, e.pos) + e.text + s.slice(e.pos);
  return s;
}

function makeTracer({ snapshots }) {
  const steps = [];
  const stack = [{ name: 'main', args: '', line: 1 }];
  let count = 0;
  let line = 1;
  const T = {
    __v: (f) => {
      try {
        return f();
      } catch {
        return undefined;
      }
    },
    __s: (l, snapFn) => {
      line = l;
      if (!snapshots) {
        if (++count > COUNT_LIMIT)
          throw new Stop('Stopped after 4 million steps — is there an infinite loop?');
        return;
      }
      if (steps.length >= STEP_LIMIT)
        throw new Stop(`Stopped after ${STEP_LIMIT} steps (that's plenty to learn from!)`);
      const vars = {};
      const raw = snapFn ? snapFn() : {};
      for (const k in raw) {
        if (raw[k] !== undefined && !HN.includes(k) && typeof raw[k] !== 'function')
          vars[k] = short(raw[k]);
      }
      steps.push({
        line: l,
        vars,
        stack: stack.map((f) => ({ name: f.name, args: f.args, ret: f.ret })),
        logs: out.logs.length,
        viz: out.visuals.length,
      });
    },
    __enter: (name, args, l) => {
      if (stack.length > 200) throw new Stop('Stopped: recursion went more than 200 deep.');
      stack.push({
        name,
        args: Object.entries(args)
          .map(([k, v]) => `${k}=${short(v, 1)}`)
          .join(', '),
        line: l,
      });
    },
    __exit: () => {
      stack.pop();
    },
    __ret: (v) => {
      if (snapshots && stack.length > 1 && steps.length < STEP_LIMIT) {
        const top = stack[stack.length - 1];
        top.ret = short(v, 1);
        steps.push({
          line,
          vars: steps[steps.length - 1]?.vars || {},
          stack: stack.map((f) => ({ name: f.name, args: f.args, ret: f.ret })),
          ret: true,
          logs: out.logs.length,
          viz: out.visuals.length,
        });
      }
      return v;
    },
  };
  return {
    T,
    steps,
    get count() {
      return count;
    },
    reset() {
      count = 0;
    },
  };
}

async function exec(code, extraNames = [], extraVals = [], suffix = '') {
  const names = [...HN, ...extraNames];
  const fn = new AsyncFunction(...names, `\n${code}\n${suffix}`);
  return fn(...HN.map((k) => H[k]), ...extraVals);
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
// after the program's own code: wait for its timers and fetches, then a moment for the promises they settle
async function settle() {
  const t0 = performance.now();
  await tick(0);
  let repeatSince = null;
  while ((timers.size || inflight) && performance.now() - t0 < WAIT_LIMIT) {
    const onlyRepeats = !inflight && [...timers.values()].every((t) => t.every);
    if (onlyRepeats) {
      repeatSince ??= performance.now();
      if (performance.now() - repeatSince > REPEAT_LIMIT) break;
    } else repeatSince = null;
    await tick(10);
  }
  if (timers.size) {
    const n = timers.size;
    const rep = [...timers.values()].some((t) => t.every);
    stopTimers();
    logf('warn')(
      rep
        ? `(Bento stopped ${n === 1 ? 'a timer that repeats' : `${n} timers that repeat`} after a few seconds, so the run could finish.)`
        : '(Bento stopped waiting for timers after 20 seconds.)',
    );
  }
  await tick(40);
  if (lateError) {
    const e = lateError;
    lateError = null;
    throw e;
  }
}
const clone = (x) =>
  typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function handle({ id, mode, code, extra }) {
  fresh();
  answers = [...(extra?.answers || [])];
  liveId = id;
  liveMode = mode;
  liveT0 = performance.now();
  liveLast = 0;
  liveBuf = [];
  const se = syntaxCheck(code);
  if (se) return { logs: [], visuals: [], error: se };
  const t0 = performance.now();
  try {
    if (mode === 'run') {
      // run with a cheap step counter so infinite loops stop instead of freezing
      const tr = makeTracer({ snapshots: false });
      const inst = instrument(code, { snapshots: false });
      try {
        await exec(inst, Object.keys(tr.T), Object.values(tr.T));
        await settle();
      } catch (e) {
        if (e instanceof NeedInput)
          return { ...out, need: { prompt: e.prompt }, ms: performance.now() - t0 };
        const ei = errInfo(e, 0);
        ei.line = ei.line ? mapLine(code, inst, ei.line) : null;
        return { ...out, error: ei, ms: performance.now() - t0 };
      }
      return { ...out, ms: performance.now() - t0 };
    }
    if (mode === 'trace') {
      const tr = makeTracer({ snapshots: true });
      const inst = instrument(code, { snapshots: true });
      let error = null;
      try {
        await exec(inst, Object.keys(tr.T), Object.values(tr.T));
        await settle();
      } catch (e) {
        if (e instanceof NeedInput) {
          const steps = tr.steps;
          return { ...out, steps, need: { prompt: e.prompt } };
        }
        error = errInfo(e);
        if (error.line) error.line = mapLine(code, inst, error.line);
      }
      const steps = tr.steps;
      if (steps.length)
        steps.push({
          line: steps[steps.length - 1].line,
          vars: steps[steps.length - 1].vars,
          stack: [],
          end: true,
          logs: out.logs.length,
          viz: out.visuals.length,
        });
      return { ...out, steps, error };
    }
    if (mode === 'growth') {
      const { setup, call } = extra;
      const tr = makeTracer({ snapshots: false });
      const inst = instrument(code, { snapshots: false });
      const callExpr = call.replace(/make_?[iI]nput\(\s*n\s*\)/g, '__input');
      const factory = await exec(
        `${inst}\n;${setup || ''}\n;return { make: typeof makeInput==='function'?makeInput:(typeof make_input==='function'?make_input:(n)=>n), f: (n, __input) => (${callExpr}) };`,
        Object.keys(tr.T),
        Object.values(tr.T),
      );
      const pts = [];
      for (const n of [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]) {
        const inp = factory.make(n);
        tr.reset();
        const ts = performance.now();
        try {
          factory.f(n, inp);
        } catch (e) {
          if (e instanceof Stop) break;
          throw e;
        }
        pts.push([n, tr.count]);
        if (tr.count > 1_500_000 || performance.now() - ts > 700) break;
      }
      return { logs: [], visuals: [], growth: { pts, fit: fitGrowth(pts) } };
    }
    if (mode === 'tests') {
      const { fn, cases } = extra;
      const inst = instrument(code, { snapshots: false });
      const tr = makeTracer({ snapshots: false });
      const f = await exec(
        `${inst}\n;return typeof ${fn}==='function'?${fn}:undefined;`,
        Object.keys(tr.T),
        Object.values(tr.T),
      );
      if (!f)
        return { ...out, error: { msg: `Couldn't find a function called ${fn}`, line: null } };
      const results = [];
      for (const c of cases) {
        tr.reset();
        try {
          const got = await f(...clone(c.args));
          results.push({ ok: eq(got, c.expect), got: short(got) });
        } catch (e) {
          results.push({ ok: false, got: errInfo(e).msg });
        }
      }
      return { ...out, tests: results };
    }
  } catch (e) {
    return { ...out, error: errInfo(e) };
  }
}
// map a line in instrumented code back to the original (instrumentation never adds newlines)
function mapLine(_orig, _inst, l) {
  return l;
}

function fitGrowth(pts) {
  if (pts.length < 3) return null;
  const F = {
    'O(1)': () => 1,
    'O(log n)': (n) => Math.log2(n),
    'O(n)': (n) => n,
    'O(n log n)': (n) => n * Math.log2(n),
    'O(n²)': (n) => n * n,
    'O(n³)': (n) => n * n * n,
    'O(2ⁿ)': (n) => Math.pow(2, Math.min(n, 60)),
  };
  let best = null;
  for (const [k, f] of Object.entries(F)) {
    const use = pts.slice(Math.floor(pts.length / 3));
    const a =
      use.reduce((s, [n, c]) => s + c * f(n), 0) / use.reduce((s, [n]) => s + f(n) * f(n), 0);
    const err = use.reduce((s, [n, c]) => s + Math.pow((c - a * f(n)) / Math.max(c, 1), 2), 0);
    if (!best || err < best.err) best = { label: k, a, err };
  }
  const [n1, c1] = pts[pts.length - 2],
    [n2, c2] = pts[pts.length - 1];
  return { label: best.label, a: best.a, ratio: c2 / Math.max(c1, 1), nRatio: n2 / n1 };
}

self.onmessage = async (e) => {
  const { id } = e.data;
  const result = await handle(e.data);
  try {
    self.postMessage({ id, result });
  } catch {
    self.postMessage({
      id,
      result: { logs: [{ k: 'err', s: 'Result could not be displayed' }], visuals: [] },
    });
  }
};
export { instrument, handle };
