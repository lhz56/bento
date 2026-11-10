// Checks every puzzle in real Python (python3 on this machine):
//  - the clever solution passes the visible tests and the hidden "gremlins"
//  - a working starter passes them too; an unfinished starter fails at least one visible test
//  - LeetCode mode's blank page and every demo run without crashing
//  - timing: the clever way meets its Big-O target, and a working starter really is slower (or crashes)
// node scripts/check-puzzles.mjs            (ONLY=twosum,lru to check a few)
import { spawnSync } from 'node:child_process';
import { PUZZLES, codeParts, codeOf, fitScale, tierOf } from '../src/puzzles.js';

import fs from 'node:fs';
import { validatePack } from '../src/packs.js';
// node scripts/check-puzzles.mjs --pack my-pack.json checks a content pack's puzzles the same way
const packAt = process.argv.indexOf('--pack');
let source = PUZZLES;
if (packAt > 0) {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
  const { errors, pack } = validatePack(JSON.parse(fs.readFileSync(process.argv[packAt + 1], 'utf8')));
  if (errors.length) { console.log('✗ pack has problems:\n  - ' + errors.join('\n  - ')); process.exit(1); }
  console.log(`checking pack “${pack.name}”: ${pack.puzzles.length} puzzle(s), ${pack.ideas.length} idea(s), ${pack.paths.length} path(s)`);
  source = pack.puzzles;
}
const which = process.env.ONLY ? source.filter((p) => process.env.ONLY.split(',').includes(p.id)) : source;
// python3 on Mac and Linux, often just python on Windows
const PY = ['python3', 'python'].find((c) => { const r = spawnSync(c, ['--version'], { encoding: 'utf8' }); return r.status === 0 && /Python 3/.test(r.stdout + r.stderr); });
if (!PY) { console.log('· skipped puzzle checks: Python 3 not found'); process.exit(0); }

const HARNESS = String.raw`
import sys, json, copy, time, io, contextlib
spec = json.loads(sys.stdin.read())
def show(*a, **k): pass
def fresh():
    return {'__name__': '__main__', 'show': show}
def run_code(code):
    g = fresh()
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(code, '<bento>', 'exec'), g)
    return g
def same(got, want):
    return got == want or (isinstance(got, tuple) and list(got) == want)
def cases(g, fn, cs):
    out = []
    for args, want in cs:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                got = g[fn](*copy.deepcopy(args))
            out.append([same(got, want), repr(got)[:120]])
        except Exception as e:
            out.append([False, '%s: %s' % (type(e).__name__, e)])
    return out
def scale(code, setup, call, ns, fresh_input):
    g = run_code(code)
    exec(compile(setup, '<setup>', 'exec'), g)
    make = g['make_input']
    c = compile(call.replace('make_input(n)', '__input'), '<call>', 'eval')
    pts, crash, t_all = [], None, time.perf_counter()
    for n in ns:
        inp = make(n); best = None
        try:
            for batch in range(2):
                reps = 0; spent = 0.0
                while True:
                    if (reps or batch) and fresh_input: inp = make(n)
                    t = time.perf_counter()
                    with contextlib.redirect_stdout(io.StringIO()):
                        eval(c, g, {'n': n, '__input': inp})
                    spent += time.perf_counter() - t; reps += 1
                    if spent > 0.006 or reps >= (3 if fresh_input else 3000) or time.perf_counter() - t_all > 3: break
                best = spent / reps if best is None else min(best, spent / reps)
                if best > 0.05 or time.perf_counter() - t_all > 3: break
        except BaseException as e:
            crash = {'n': n, 'msg': '%s: %s' % (type(e).__name__, e)}; break
        pts.append([n, best])
        if best > 0.25 or time.perf_counter() - t_all > 2.5: break
    return {'pts': pts, 'crash': crash}
res = {}
for k in ('start', 'fast', 'blank'):
    try: g = run_code(spec[k]); res[k + '_ok'] = True
    except Exception as e: res[k + '_ok'] = '%s: %s' % (type(e).__name__, e); g = None
    if g is not None and k != 'blank':
        res[k + '_tests'] = cases(g, spec['fn'], spec['tests'])
        res[k + '_grem'] = cases(g, spec['fn'], spec['gremlins'])
ns = spec['ns'] or [2 ** k for k in range(4, 18)]
res['fast_scale'] = scale(spec['fast'], spec['setup'], spec['call'], ns, spec['fresh'])
if spec['startWorks']: res['start_scale'] = scale(spec['start'], spec['setup'], spec['call'], ns, spec['fresh'])
print(json.dumps(res))
`;

let bad = 0;
for (const p of which) {
  const spec = {
    start: codeOf(codeParts(p, 'start')), fast: codeOf(codeParts(p, 'fast')), blank: codeOf(codeParts(p, 'blank')),
    fn: p.fn, tests: p.tests, gremlins: p.gremlins.map(([, a, e]) => [a, e]), setup: p.setup, call: p.call, ns: p.ns || null, fresh: !!p.fresh, startWorks: p.startWorks,
  };
  // Timings on a busy machine (CI, a laptop doing other work) can wobble. Wrong answers fail at once;
  // a puzzle that only missed its speed shape is measured again, up to three times in all.
  let tries = 0; let R; let errs; let ff; let sf; let timingOnly;
  do {
  tries++;
  const r = spawnSync(PY, ['-I', '-c', HARNESS], { input: JSON.stringify(spec), encoding: 'utf8', maxBuffer: 1 << 24, timeout: 60000 });
  if (r.status !== 0) { R = null; break; }
  R = JSON.parse(r.stdout); errs = []; let timing = 0;
  for (const k of ['start', 'fast', 'blank']) if (R[`${k}_ok`] !== true) errs.push(`${k} code crashed: ${R[`${k}_ok`]}`);
  (R.fast_tests || []).forEach(([ok, got], i) => { if (!ok) errs.push(`clever way fails test ${i + 1}: got ${got}`); });
  (R.fast_grem || []).forEach(([ok, got], i) => { if (!ok) errs.push(`clever way fails gremlin "${p.gremlins[i][0]}": got ${got}`); });
  if (p.startWorks) {
    (R.start_tests || []).forEach(([ok, got], i) => { if (!ok) errs.push(`starter fails test ${i + 1}: got ${got}`); });
    (R.start_grem || []).forEach(([ok, got], i) => { if (!ok) errs.push(`starter fails gremlin "${p.gremlins[i][0]}": got ${got}`); });
  } else if ((R.start_tests || []).every(([ok]) => ok)) errs.push('unfinished starter already passes every test');
  ff = fitScale(R.fast_scale.pts, p.target);
  if (R.fast_scale.crash) errs.push(`clever way crashed at n=${R.fast_scale.crash.n}: ${R.fast_scale.crash.msg}`);
  else if (!ff || ff.tier > tierOf(p.target)) { timing++; errs.push(`clever way measured ${ff?.label} (k=${ff?.k?.toFixed(2)}), target ${p.target}`); }
  sf = null;
  if (p.startWorks) {
    sf = fitScale(R.start_scale.pts, p.target);
    if (!R.start_scale.crash && (!sf || sf.tier <= tierOf(p.target))) { timing++; errs.push(`obvious way isn't slower: ${sf?.label} (k=${sf?.k?.toFixed(2)}) vs target ${p.target}`); }
  }
  timingOnly = errs.length > 0 && timing === errs.length;
  } while (timingOnly && tries < 3);
  if (!R) { bad++; console.log(`✗ ${p.id}: python failed`); continue; }
  const desc = `clever ${ff?.label}${ff?.k != null ? ` k=${ff.k.toFixed(2)}` : ff?.base ? ` ×${ff.base.toFixed(2)}/n` : ''}${p.startWorks ? ` · obvious ${R.start_scale.crash ? `💥 n=${R.start_scale.crash.n}` : `${sf?.label}${sf?.k != null ? ` k=${sf.k.toFixed(2)}` : sf?.base ? ` ×${sf.base.toFixed(2)}/n` : ''}`}` : ''}`;
  if (errs.length) { bad++; console.log(`✗ ${p.id} (${desc})\n  - ${errs.join('\n  - ')}`); } else console.log(`✓ puzzle ${p.id} (${desc})${tries > 1 ? ` · timings settled on try ${tries}` : ''}`);
}
console.log(bad ? `${bad} puzzle(s) need fixing` : `all ${which.length} puzzles check out`);
process.exit(bad ? 1 : 0);
