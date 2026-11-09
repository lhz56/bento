// Runs Python (Pyodide / real CPython in WebAssembly) in a worker.
let py = null;
let booting = null;

const PRELUDE = String.raw`
import sys, json, math, random, copy, traceback, builtins

class _Stop(Exception): pass

_B = {'logs': [], 'visuals': [], 'canvas': None}

class _W:
    def __init__(s, k): s.k = k; s.buf = ''
    def write(s, t):
        s.buf += t
        while '\n' in s.buf:
            line, s.buf = s.buf.split('\n', 1)
            _B['logs'].append({'k': s.k, 's': line})
        return len(t)
    def flush(s):
        if s.buf:
            _B['logs'].append({'k': s.k, 's': s.buf}); s.buf = ''

def _label(n):
    for k in ('val', 'value', 'key', 'data', 'name', 'label'):
        if hasattr(n, k): return getattr(n, k)
    return '•'

def _is_node(x):
    return (hasattr(x, 'left') and hasattr(x, 'right')) or isinstance(getattr(x, 'children', None), list)

def _short(v, d=0):
    try:
        if v is None: return 'None'
        if isinstance(v, bool): return str(v)
        if isinstance(v, (int, float)): return repr(v) if not isinstance(v, float) else ('%.6g' % v)
        if isinstance(v, str): return repr(v if len(v) <= 40 else v[:38] + '…')
        if callable(v) and not _is_node(v): return 'ƒ ' + getattr(v, '__name__', '')
        if d > 1: return '[…]' if isinstance(v, (list, tuple)) else '{…}'
        if isinstance(v, (list, tuple)):
            s = [_short(x, d + 1) for x in list(v)[:10]]
            if len(v) > 10: s.append('…')
            return ('[%s]' if isinstance(v, list) else '(%s)') % ', '.join(s)
        if isinstance(v, set):
            s = [_short(x, d + 1) for x in list(v)[:8]]
            return '{%s}' % ', '.join(s + (['…'] if len(v) > 8 else [])) if v else 'set()'
        if isinstance(v, dict):
            items = list(v.items())
            s = ['%s: %s' % (_short(k, d + 1), _short(x, d + 1)) for k, x in items[:6]]
            if len(items) > 6: s.append('…')
            return '{%s}' % ', '.join(s)
        if _is_node(v): return '%s(%s)' % (type(v).__name__, _short(_label(v), 2))
        r = repr(v)
        return r if len(r) <= 50 else r[:48] + '…'
    except Exception:
        return '?'

def _tree(n, seen=None, budget=None):
    if seen is None: seen, budget = set(), [0]
    if n is None or id(n) in seen or budget[0] > 200: return None
    seen.add(id(n)); budget[0] += 1
    kids = getattr(n, 'children', None)
    if isinstance(kids, list):
        return {'v': str(_label(n)), 'kids': [_tree(c, seen, budget) for c in kids], 'binary': False}
    return {'v': str(_label(n)), 'kids': [_tree(getattr(n, 'left', None), seen, budget), _tree(getattr(n, 'right', None), seen, budget)], 'binary': True}

def _viz(x, label=None):
    if isinstance(x, (list, tuple)) and x and all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in x):
        return {'type': 'bars', 'data': list(x)[:200], 'label': label}
    if isinstance(x, (list, tuple)) and x and all(isinstance(r, (list, tuple)) for r in x):
        return {'type': 'grid', 'data': [[_short(c, 1) for c in list(r)[:40]] for r in list(x)[:40]], 'label': label}
    if isinstance(x, (list, tuple)) and x and all(isinstance(r, dict) for r in x):
        cols = []
        for r in list(x)[:60]:
            for k in r.keys():
                if k not in cols and len(cols) < 8: cols.append(k)
        return {'type': 'records', 'cols': [str(c) for c in cols], 'rows': [[_short(r.get(c), 1) if c in r else '' for c in cols] for r in list(x)[:60]], 'label': label}
    if _is_node(x): return {'type': 'tree', 'root': _tree(x), 'label': label}
    if isinstance(x, dict): return {'type': 'table', 'rows': [[k if isinstance(k, str) else _short(k, 1), _short(v, 1)] for k, v in list(x.items())[:60]], 'label': label}
    return {'type': 'text', 'text': x if isinstance(x, str) else _short(x), 'label': label}

def show(x, label=None):
    if len(_B['visuals']) < 40: _B['visuals'].append(_viz(x, label))

def _canvas():
    if _B['canvas'] is None:
        _B['canvas'] = {'type': 'canvas', 'w': 400, 'h': 400, 'cmds': []}
        _B['visuals'].append(_B['canvas'])
    c = _B['canvas']
    if len(c['cmds']) > 60000: raise RuntimeError('Too many drawing commands')
    return c
def size(w, h): c = _canvas(); c['w'] = w; c['h'] = h
def background(col): _canvas()['cmds'].append(['bg', col])
def circle(x, y, r, col='black'): _canvas()['cmds'].append(['circle', x, y, r, col])
def rect(x, y, w, h, col='black'): _canvas()['cmds'].append(['rect', x, y, w, h, col])
def line(x1, y1, x2, y2, col='black', width=1): _canvas()['cmds'].append(['line', x1, y1, x2, y2, col, width])
def text(s, x, y, col='black'): _canvas()['cmds'].append(['text', str(s), x, y, col])

_HELPERS = {'show': show, 'size': size, 'background': background, 'circle': circle, 'rect': rect, 'line': line, 'text': text}
_HIDE = set(_HELPERS) | {'__builtins__', '__name__', '__doc__', '__loader__', '__spec__', '__package__', '__annotations__', '__input'}

def _fresh():
    _B['logs'] = []; _B['visuals'] = []; _B['canvas'] = None
    g = {'__name__': '__main__'}; g.update(_HELPERS)
    return g

def _vars(frame, is_module):
    out = {}
    src = frame.f_globals if is_module else frame.f_locals
    for k, v in list(src.items()):
        if k in _HIDE or k.startswith('__'): continue
        if type(v).__name__ == 'module': continue
        if is_module and (callable(v) and not _is_node(v)): continue
        out[k] = _short(v)
    return out

def _stack(frame):
    fr = []
    f = frame
    while f is not None and f.f_code.co_filename == '<bento>':
        co = f.f_code
        name = 'main' if co.co_name == '<module>' else co.co_name
        args = ', '.join('%s=%s' % (a, _short(f.f_locals.get(a), 1)) for a in co.co_varnames[:co.co_argcount] if a != 'self')
        fr.append({'name': name, 'args': args, 'id': id(f)})
        f = f.f_back
    fr.reverse()
    return fr

def _err(e):
    line = None
    if isinstance(e, SyntaxError) and e.filename == '<bento>':
        return {'msg': 'SyntaxError: %s' % e.msg, 'line': e.lineno}
    tb = e.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == '<bento>': line = tb.tb_lineno
        tb = tb.tb_next
    return {'msg': '%s: %s' % (type(e).__name__, e), 'line': line}

def _run(code, mode, extra_json):
    extra = json.loads(extra_json) if extra_json else {}
    g = _fresh()
    out, err = _W('log'), _W('err')
    sys.stdout, sys.stderr = out, err
    res = {}
    steps = []
    rets = {}
    count = [0]
    LIMIT = 2500

    def local_full(frame, event, arg):
        if event == 'line':
            if len(steps) >= LIMIT: raise _Stop("Stopped after %d steps (that's plenty to learn from!)" % LIMIT)
            st = _stack(frame)
            for f in st: f['ret'] = rets.get(f['id'])
            steps.append({'line': frame.f_lineno, 'vars': _vars(frame, frame.f_code.co_name == '<module>'),
                          'stack': [{'name': f['name'], 'args': f['args'], 'ret': f['ret']} for f in st],
                          'logs': len(_B['logs']) , 'viz': len(_B['visuals'])})
        elif event == 'return' and frame.f_code.co_name != '<module>':
            rets[id(frame)] = _short(arg, 1)
            if len(steps) < LIMIT:
                st = _stack(frame)
                for f in st: f['ret'] = rets.get(f['id'])
                steps.append({'line': frame.f_lineno, 'vars': steps[-1]['vars'] if steps else {}, 'ret': True,
                              'stack': [{'name': f['name'], 'args': f['args'], 'ret': f['ret']} for f in st],
                              'logs': len(_B['logs']), 'viz': len(_B['visuals'])})
        return local_full

    def global_full(frame, event, arg):
        if frame.f_code.co_filename != '<bento>': return None
        if len(_stack(frame)) > 200: raise _Stop('Stopped: recursion went more than 200 deep.')
        return local_full

    def local_count(frame, event, arg):
        if event == 'line':
            count[0] += 1
            if count[0] > 4000000: raise _Stop('Stopped after 4 million steps — is there an infinite loop?')
        return local_count
    def global_count(frame, event, arg):
        return local_count if frame.f_code.co_filename == '<bento>' else None

    try:
        compiled = compile(code, '<bento>', 'exec')
        if mode == 'trace':
            sys.settrace(global_full)
            try: exec(compiled, g)
            finally: sys.settrace(None)
            res['steps'] = steps
        elif mode == 'run':
            sys.settrace(global_count)
            try: exec(compiled, g)
            finally: sys.settrace(None)
        elif mode == 'growth':
            exec(compiled, g)
            if extra.get('setup'): exec(compile(extra['setup'], '<setup>', 'exec'), g)
            import re
            call = re.sub(r'make_?[iI]nput\(\s*n\s*\)', '__input', extra['call'])
            make = g.get('make_input') or g.get('makeInput') or (lambda n: n)
            call_c = compile(call, '<call>', 'eval')
            pts = []
            import time
            for n in [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]:
                inp = make(n)
                count[0] = 0
                t = time.time()
                sys.settrace(global_count)
                try: eval(call_c, g, {'n': n, '__input': inp})
                except _Stop: break
                finally: sys.settrace(None)
                pts.append([n, count[0]])
                if count[0] > 1500000 or time.time() - t > 0.9: break
            res['growth'] = {'pts': pts}
        elif mode == 'tests':
            sys.settrace(global_count)
            try: exec(compiled, g)
            finally: sys.settrace(None)
            fn = g.get(extra['fn'])
            if not callable(fn):
                res['error'] = {'msg': "Couldn't find a function called %s" % extra['fn'], 'line': None}
            else:
                results = []
                for c in extra['cases']:
                    count[0] = 0
                    sys.settrace(global_count)
                    try:
                        got = fn(*copy.deepcopy(c['args']))
                        ok = got == c['expect'] or (isinstance(got, tuple) and list(got) == c['expect'])
                        results.append({'ok': bool(ok), 'got': _short(got)})
                    except Exception as e:
                        results.append({'ok': False, 'got': '%s: %s' % (type(e).__name__, e)})
                    finally: sys.settrace(None)
                res['tests'] = results
    except _Stop as e:
        res['error'] = {'msg': str(e), 'line': None}
        if mode == 'trace': res['steps'] = steps
    except BaseException as e:
        res['error'] = _err(e)
        if mode == 'trace': res['steps'] = steps
    finally:
        sys.settrace(None)
        out.flush(); err.flush()
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
    if mode == 'trace' and steps:
        steps.append({'line': steps[-1]['line'], 'vars': steps[-1]['vars'], 'stack': [], 'end': True, 'logs': len(_B['logs']), 'viz': len(_B['visuals'])})
    res['logs'] = _B['logs']; res['visuals'] = _B['visuals']
    return json.dumps(res, default=str)
`;

async function boot() {
  if (py) return py;
  if (booting) return booting;
  booting = (async () => {
    const base = `${self.location.origin}/pyodide/`;
    const mod = await import(/* @vite-ignore */ `${base}pyodide.mjs`);
    // the core ships with the app; extra packages (numpy, pandas, …) download from Pyodide's CDN the first time a lesson imports them
    py = await mod.loadPyodide({ indexURL: base, packageBaseUrl: `https://cdn.jsdelivr.net/pyodide/v${mod.version}/full/` });
    py.runPython(PRELUDE);
    return py;
  })();
  return booting;
}

function fitGrowth(pts) {
  if (pts.length < 3) return null;
  const F = { 'O(1)': () => 1, 'O(log n)': (n) => Math.log2(n), 'O(n)': (n) => n, 'O(n log n)': (n) => n * Math.log2(n), 'O(n²)': (n) => n * n, 'O(n³)': (n) => n * n * n, 'O(2ⁿ)': (n) => Math.pow(2, Math.min(n, 60)) };
  let best = null;
  const use = pts.slice(Math.floor(pts.length / 3));
  for (const [k, f] of Object.entries(F)) {
    const a = use.reduce((s, [n, c]) => s + c * f(n), 0) / use.reduce((s, [n]) => s + f(n) * f(n), 0);
    const err = use.reduce((s, [n, c]) => s + Math.pow((c - a * f(n)) / Math.max(c, 1), 2), 0);
    if (!best || err < best.err) best = { label: k, a, err };
  }
  const [n1, c1] = pts[pts.length - 2], [n2, c2] = pts[pts.length - 1];
  return { label: best.label, a: best.a, ratio: c2 / Math.max(c1, 1), nRatio: n2 / n1 };
}

self.onmessage = async (e) => {
  const { id, mode, code, extra } = e.data;
  if (mode === 'boot') { try { await boot(); self.postMessage({ id, result: { ok: true } }); } catch (err) { self.postMessage({ id, result: { error: { msg: String(err) } } }); } return; }
  try {
    await boot();
    if (/^\s*(import|from)\s+(numpy|pandas|matplotlib|scipy|sklearn|networkx|sympy|PIL)\b/m.test(code)) {
      try { await py.loadPackagesFromImports(code); }
      catch (err) { self.postMessage({ id, result: { logs: [], visuals: [], error: { msg: `ModuleNotFoundError: couldn't download a package this code imports (are you online?) ${String(err?.message || err).split('\n')[0].slice(0, 120)}`, line: null } } }); return; }
    }
    const run = py.globals.get('_run');
    const json = run(code, mode, extra ? JSON.stringify(extra) : '');
    run.destroy?.();
    const result = JSON.parse(json);
    if (result.growth) result.growth.fit = fitGrowth(result.growth.pts);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, result: { logs: [], visuals: [], error: { msg: String(err?.message || err).split('\n').slice(-2).join(' '), line: null } } });
  }
};
