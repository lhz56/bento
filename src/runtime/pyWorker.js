// Runs Python (Pyodide / real CPython in WebAssembly) in a worker.
let py = null;
let booting = null;

const PRELUDE = String.raw`
import sys, json, math, random, copy, traceback, builtins

class _Stop(Exception): pass

_B = {'logs': [], 'visuals': [], 'canvas': None}

class _W:
    def __init__(s, k, live=False): s.k = k; s.buf = ''; s.live = live
    def write(s, t):
        s.buf += t
        while '\n' in s.buf:
            line, s.buf = s.buf.split('\n', 1)
            _B['logs'].append({'k': s.k, 's': line})
            if s.live: _live(s.k, line)
        return len(t)
    def flush(s):
        if s.buf:
            _B['logs'].append({'k': s.k, 's': s.buf})
            if s.live: _live(s.k, s.buf)
            s.buf = ''

def _live(k, line):
    try:
        import js
        js.bentoLive(k, line)
    except Exception:
        pass

# input(): answers come from the learner, one per question; with none left, the run pauses to ask
class _NeedInput(Exception):
    def __init__(s, prompt): Exception.__init__(s, prompt); s.prompt = prompt

def _make_input(answers, out):
    def input(prompt=''):
        out.flush()
        p = str(prompt)
        if answers:
            a = str(answers.pop(0))
            _B['logs'].append({'k': 'in', 'p': p, 's': a})
            if out.live: _live('in', p + a)
            return a
        raise _NeedInput(p)
    return input

# The internet, through the app (so websites that block browsers still answer, like they would for a script)
class _NetResponse:
    def __init__(s, url, status, text, headers):
        s.url, s.status, s.status_code, s.code, s.text, s.headers = url, status, status, status, text, headers
        s.ok = 200 <= status < 400; s.reason = 'OK' if s.ok else 'Error'
    def read(s, *a): return s.text.encode('utf-8')
    @property
    def content(s): return s.text.encode('utf-8')
    def json(s): return json.loads(s.text)
    def getcode(s): return s.status
    def raise_for_status(s):
        if not s.ok: raise RuntimeError('HTTP %d from %s' % (s.status, s.url))
    def __enter__(s): return s
    def __exit__(s, *a): return False
    def close(s): pass

def _net(url, method='GET', data=None, headers=None):
    import js
    if not str(url).startswith(('http://', 'https://')): raise ValueError('Only web addresses that start with http:// or https:// can be fetched')
    xhr = js.XMLHttpRequest.new()
    xhr.open(method, '/__net?u=' + str(js.encodeURIComponent(str(url))), False)
    for k, v in (headers or {}).items(): xhr.setRequestHeader('x-h-' + str(k).lower(), str(v))
    if isinstance(data, bytes): data = data.decode('utf-8', 'replace')
    xhr.send(data if data is not None else None)
    status = int(xhr.getResponseHeader('x-status') or xhr.status or 0)
    if status == 0: raise ConnectionError(xhr.responseText or ("Couldn't reach %s (are you online?)" % url))
    return _NetResponse(str(url), status, str(xhr.responseText), {'content-type': str(xhr.getResponseHeader('x-content-type') or '')})

def _urlopen(url, data=None, timeout=None, **kw):
    import urllib.error
    method, headers = 'GET', {}
    if hasattr(url, 'full_url'):
        method = url.get_method(); data = url.data if data is None else data; headers = dict(url.header_items()); url = url.full_url
    elif data is not None: method = 'POST'
    r = _net(url, method, data, headers)
    if r.status >= 400: raise urllib.error.HTTPError(url, r.status, 'HTTP %d' % r.status, r.headers, None)
    return r

def _install_net():
    import urllib.request, types, urllib.parse
    urllib.request.urlopen = _urlopen
    m = types.ModuleType('requests')
    def _with(url, params):
        return url + (('&' if '?' in url else '?') + urllib.parse.urlencode(params)) if params else url
    m.get = lambda url, params=None, headers=None, timeout=None, **k: _net(_with(url, params), 'GET', None, headers)
    m.delete = lambda url, params=None, headers=None, timeout=None, **k: _net(_with(url, params), 'DELETE', None, headers)
    def _send(method):
        def f(url, data=None, json=None, headers=None, timeout=None, **k):
            h = dict(headers or {})
            if json is not None:
                import json as _j; data = _j.dumps(json); h.setdefault('content-type', 'application/json')
            elif isinstance(data, dict): data = urllib.parse.urlencode(data); h.setdefault('content-type', 'application/x-www-form-urlencoded')
            return _net(url, method, data, h)
        return f
    m.post, m.put, m.patch = _send('POST'), _send('PUT'), _send('PATCH')
    m.Response = _NetResponse
    m.RequestException = Exception
    sys.modules['requests'] = m

# a tree node: an object with left and right (or a children list), or the same as a dict, the way most lessons write
# trees in Python ({"value": 5, "left": {...}, "right": None}); a dict whose left/right are plain values isn't one
def _get(n, k, default=None):
    return n.get(k, default) if isinstance(n, dict) else getattr(n, k, default)

def _label(n):
    if isinstance(n, (str, int, float)) and not isinstance(n, bool): return n
    for k in ('val', 'value', 'key', 'data', 'name', 'label'):
        if (k in n) if isinstance(n, dict) else hasattr(n, k): return _get(n, k)
    return '•'

def _is_node(x):
    if isinstance(x, dict):
        ks = [k for k in ('left', 'right') if k in x]  # one child is a tree too (a chain of calls), as long as it's a node
        lr = bool(ks) and all(x[k] is None or isinstance(x[k], dict) for k in ks) and (len(ks) == 2 or isinstance(x[ks[0]], dict))
        ch = isinstance(x.get('children'), list) and all(isinstance(c, (dict, str, int, float)) for c in x['children'])
        return lr or ch
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
    if n is None or budget[0] > 200: return None
    if isinstance(n, (str, int, float)): budget[0] += 1; return {'v': str(n), 'kids': [], 'binary': False}
    if id(n) in seen: return None
    seen.add(id(n)); budget[0] += 1
    kids = _get(n, 'children')
    if isinstance(kids, list):
        return {'v': str(_label(n)), 'kids': [_tree(c, seen, budget) for c in kids], 'binary': False}
    return {'v': str(_label(n)), 'kids': [_tree(_get(n, 'left'), seen, budget), _tree(_get(n, 'right'), seen, budget)], 'binary': True}

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
    out, err = _W('log', mode == 'run'), _W('err', mode == 'run')
    files = extra.get('files') or []
    if files:
        import os, importlib, re as _re
        proj = '/home/pyodide/project'
        os.makedirs(proj, exist_ok=True)
        for f in files:
            name = str(f.get('name', ''))
            if not _re.match(r'^[A-Za-z_][\w]*\.py$', name): continue
            with open(os.path.join(proj, name), 'w') as fh: fh.write(str(f.get('code', '')))
            sys.modules.pop(name[:-3], None)  # pick up your latest edits
        if proj not in sys.path: sys.path.insert(0, proj)
        importlib.invalidate_caches()
    answers = list(extra.get('answers') or [])
    g['input'] = _make_input(answers, out)
    if extra.get('seed') is not None: random.seed(extra['seed'])
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
        elif mode == 'scale':
            # real time per call (builtins included, which step counting can't see), on bigger and bigger inputs
            exec(compiled, g)
            exec(compile(extra['setup'], '<setup>', 'exec'), g)
            sys.stdout = sys.stderr = _W('null')
            make = g['make_input']
            call_c = compile(extra['call'].replace('make_input(n)', '__input'), '<call>', 'eval')
            import time
            fresh_in = bool(extra.get('fresh'))
            pts, crash, t_all = [], None, time.perf_counter()
            for n in (extra.get('ns') or [2 ** k for k in range(4, 18)]):
                inp = make(n); best = None
                try:
                    for _batch in range(2):  # two batches, keep the faster: a hiccup can only ever add time
                        reps = 0; spent = 0.0
                        while True:
                            if (reps or _batch) and fresh_in: inp = make(n)
                            t = time.perf_counter(); eval(call_c, g, {'n': n, '__input': inp}); spent += time.perf_counter() - t; reps += 1
                            _B['logs'] = []; _B['visuals'] = []
                            if spent > 0.006 or reps >= (3 if fresh_in else 3000) or time.perf_counter() - t_all > 3: break
                        best = spent / reps if best is None else min(best, spent / reps)
                        if best > 0.05 or time.perf_counter() - t_all > 3: break
                except BaseException as e:
                    crash = {'n': n, 'msg': _err(e)['msg']}; break
                pts.append([n, best])
                if best > 0.25 or time.perf_counter() - t_all > 2.5: break
            res['scale'] = {'pts': pts, 'crash': crash}
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
                    except _NeedInput as e:
                        results.append({'ok': False, 'got': 'it asked for input() (%s), but tests can only pass values in' % e.prompt})
                    except Exception as e:
                        results.append({'ok': False, 'got': '%s: %s' % (type(e).__name__, e)})
                    finally: sys.settrace(None)
                res['tests'] = results
    except _NeedInput as e:
        res['need'] = {'prompt': e.prompt}
        if mode == 'trace': res['steps'] = steps
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
    py.runPython('_install_net()');
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

// Printed lines reach the screen while a slow program is still running (quick runs just return at the end)
let liveId = null, liveBuf = [], liveT0 = 0, liveLast = 0;
self.bentoLive = (k, s) => {
  liveBuf.push({ k, s: String(s) });
  const now = performance.now();
  if (now - liveT0 > 250 && now - liveLast > 50) { self.postMessage({ id: liveId, live: liveBuf }); liveBuf = []; liveLast = now; }
};

self.onmessage = async (e) => {
  const { id, mode, code, extra } = e.data;
  if (mode === 'boot') { try { await boot(); self.postMessage({ id, result: { ok: true } }); } catch (err) { self.postMessage({ id, result: { error: { msg: String(err) } } }); } return; }
  try {
    await boot();
    if (/^\s*(import|from)\s+(numpy|pandas|matplotlib|scipy|sklearn|networkx|sympy|PIL)\b/m.test(code)) {
      try { await py.loadPackagesFromImports(code); }
      catch (err) { self.postMessage({ id, result: { logs: [], visuals: [], error: { msg: `ModuleNotFoundError: couldn't download a package this code imports (are you online?) ${String(err?.message || err).split('\n')[0].slice(0, 120)}`, line: null } } }); return; }
    }
    liveId = id; liveBuf = []; liveT0 = performance.now(); liveLast = 0;
    const run = py.globals.get('_run');
    // called "promising" where the engine can switch stacks (Electron's can), so asyncio.run() and await asyncio.sleep()
    // really wait, the way they do on a Mac, instead of failing with "Cannot stack switch"
    const promising = typeof run.callPromising === 'function' && typeof WebAssembly.Suspending === 'function';
    const json = promising ? await run.callPromising(code, mode, extra ? JSON.stringify(extra) : '') : run(code, mode, extra ? JSON.stringify(extra) : '');
    run.destroy?.();
    const result = JSON.parse(json);
    if (result.growth) result.growth.fit = fitGrowth(result.growth.pts);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, result: { logs: [], visuals: [], error: { msg: String(err?.message || err).split('\n').slice(-2).join(' '), line: null } } });
  }
};
