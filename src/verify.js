// Checking a freshly written lesson against reality. AI lessons can be confidently wrong, so after the
// lesson's code has run cleanly, Bento checks (1) the things it can prove locally, for free, and
// (2) with one small call to the learner's fast model, whether each quiz answer and each claim about
// the code matches what the code ACTUALLY printed. It fixes what it can prove, and says so.

const LINK = /\[\[(\d+)(?:-(\d+))?\|([^\]]+)\]\]/g;

// The plain English beside the code is matched to it line by line, so one entry missing or extra moves every line after
// it onto the wrong code ("return mid" reading "otherwise, if it's smaller…"). Does it still line up? A blank code line
// has no English, and a line of real code has some (closing brackets and tags, and comments, may go either way); a
// single miss can be a model's choice, two mean it slipped. Any length off by more than one has slipped too.
const LOOSE = (k) => !k || /^[}\])]+[;,)]*$/.test(k) || /^<\/[\w-]+>$/.test(k) || /^(#|\/\/|\/\*|\*|<!--)/.test(k);
export function pseudoFits(code, pseudo) {
  if (!Array.isArray(pseudo) || !pseudo.length) return false;
  const c = String(code || '').split('\n'); const p = pseudo.map((x) => String(x ?? '').trim());
  while (c.length && !c[c.length - 1].trim()) c.pop();
  while (p.length > c.length && !p[p.length - 1]) p.pop();
  if (Math.abs(p.length - c.length) > 1) return false;
  let off = 0;
  c.forEach((l, i) => { const k = l.trim(), e = p[i]; if (e === undefined ? !LOOSE(k) : (!k && e) || (!LOOSE(k) && !e)) off++; });
  return off < 2;
}

// Line links ([[12|the latte]]) are numbers the AI counts in its head while it writes the code as one string, and it
// slips by a line or two (about one link in eight in the Nov 10 benchmark, all models together). Two slips can be proven
// and fixed: a link to a blank line, and a link whose code-shaped label (btn.textContent, then(), await) isn't on its
// line but is right next to it. Links that describe ("nudges the knob") are left alone, and so are ranges.
const COMMON = new Set('the a an this that these line lines here there and or of to in on at is it its with from into what when then for by as be we you your our run runs code loop part step steps one two first last next new all every each same how why which'.split(' '));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function fixLinks(code, md) {
  const c = String(code || '').split('\n'); const moved = [];
  const has = (n, t) => n >= 1 && n <= c.length && new RegExp(`(^|[^A-Za-z0-9_])${esc(t)}($|[^A-Za-z0-9_])`, 'i').test(c[n - 1]);
  const out = String(md || '').replace(LINK, (m, a, z, text) => {
    const A = +a; if (z && +z !== A) return m;
    const toks = (text.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter((w) => w.length >= 3 && !COMMON.has(w.toLowerCase()));
    const codey = /[`.(]|_|[a-z][A-Z]/.test(text) || /^\s*(await|async|yield|return|then|catch|try|finally|lambda|import|class|break|continue)\s*$/.test(text);
    let to = null;
    if (A >= 1 && A <= c.length && !c[A - 1].trim()) {
      for (const d of [1, -1, 2, -2]) if (c[A + d - 1]?.trim() && toks.some((t) => has(A + d, t))) { to = A + d; break; }
      if (to == null) for (const d of [1, -1]) if (c[A + d - 1]?.trim()) { to = A + d; break; }
    } else if (codey && toks.length && !toks.some((t) => has(A, t))) {
      for (const d of [1, -1, 2, -2]) if (toks.some((t) => has(A + d, t))) { to = A + d; break; }
    }
    if (to == null) return m;
    moved.push({ from: A, to, text }); return `[[${to}|${text}]]`;
  });
  return { md: out, moved };
}

// Margin notes slip the same way. A note is moved only on the same proof as a link: it sits on blank lines, or its
// code-shaped label (show(), getElementById) isn't in its lines but is in the lines just next to them.
export function fixNotes(code, notes) {
  const c = String(code || '').split('\n'); const moved = [];
  const has = (n, t) => n >= 1 && n <= c.length && new RegExp(`(^|[^A-Za-z0-9_])${esc(t)}($|[^A-Za-z0-9_])`, 'i').test(c[n - 1]);
  const out = (notes || []).map((N) => {
    const a = +N.from, b = +(N.to || N.from); if (!(a >= 1 && b <= c.length && a <= b)) return N; // past the end: the free checks drop it
    const label = String(N.label || ''); const toks = (label.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter((w) => w.length >= 3 && !COMMON.has(w.toLowerCase()));
    const inRange = (d) => { for (let k = a + d; k <= b + d; k++) if (toks.some((t) => has(k, t))) return true; return false; };
    let d = null;
    if (c.slice(a - 1, b).every((l) => !l.trim())) { for (const x of [1, -1, 2, -2]) if (a + x >= 1 && b + x <= c.length && c.slice(a + x - 1, b + x).some((l) => l.trim())) { d = x; break; } }
    else if ((/[`.(]|_|[a-z][A-Z]/.test(label)) && toks.length && !inRange(0)) { for (const x of [1, -1, 2, -2]) if (a + x >= 1 && b + x <= c.length && inRange(x)) { d = x; break; } }
    if (d == null) return N;
    moved.push({ from: a, to: a + d, label }); return { ...N, from: a + d, to: b + d };
  });
  return { notes: out, moved };
}

// When a lesson finishes writing, before anyone reads it (web pages too, which Bento never runs): line links and margin
// notes that slipped are moved back, plain English that slipped off its lines is cleared (the Desk writes it again, by
// line number), and the free checks drop what points past the code or can't be answered. Returns a lesson patch.
export function tidyLesson(L) {
  const patch = {};
  if (L.code && !L.steps?.length) {
    let n = 0; const story = (L.story || []).map((b) => { if (b.t !== 'p' || !b.md) return b; const r = fixLinks(L.code, b.md); n += r.moved.length; return r.moved.length ? { ...b, md: r.md } : b; });
    if (n) patch.story = story;
    const N = fixNotes(L.code, L.notes); if (N.moved.length) patch.notes = N.notes;
  }
  if (L.code) Object.assign(patch, localChecks({ ...L, ...patch }).patch);
  return patch;
}

// Free checks. Returns { lesson patch, notes[] }
export function localChecks(L) {
  const notes = []; const patch = {};
  const lines = String(L.code || '').split('\n').length;
  // line links that point past the end of the code become plain text
  const story = (L.story || []).map((b) => {
    if (b.t !== 'p' || !b.md) return b;
    let bad = 0;
    const md = b.md.replace(LINK, (m, a, z, text) => { const A = +a, Z = +(z || a); if (A >= 1 && Z <= lines && A <= Z) return m; bad++; return text; });
    if (bad) notes.push(`${bad} link${bad > 1 ? 's' : ''} to lines that don’t exist`);
    return bad ? { ...b, md } : b;
  }).map((b) => {
    if (b.t !== 'quiz') return b;
    const ch = Array.isArray(b.choices) ? b.choices : [];
    if (ch.length < 2 || !Number.isInteger(b.answer) || b.answer < 0 || b.answer >= ch.length) { notes.push('a quiz without a valid answer was removed'); return null; }
    return b;
  }).filter(Boolean);
  if (story.length !== (L.story || []).length || story.some((b, i) => b !== L.story[i])) patch.story = story;
  const notesOk = (L.notes || []).filter((n) => n.from >= 1 && (n.to || n.from) <= lines && n.from <= (n.to || n.from));
  if (notesOk.length !== (L.notes || []).length) { patch.notes = notesOk; notes.push('notes pointing past the code'); }
  if (L.pseudo?.length && !pseudoFits(L.code, L.pseudo)) { patch.pseudo = []; notes.push('plain-words lines that didn’t match the code (they’ll be rewritten)'); }
  return { patch, notes };
}

// The fast model's fact-check prompt: the code, what it really printed, the quizzes and the claims
export function checkPrompt(L, run) {
  const code = String(L.code || '').split('\n').map((x, i) => `${i + 1}| ${x}`).join('\n').slice(0, 5000);
  const out = (run?.logs || []).map((l) => (l.k === 'in' ? `${l.p || ''}${l.s}` : l.s)).slice(0, 40).join('\n').slice(0, 2500);
  const pics = (run?.visuals || []).slice(0, 6).map((v) => v.type + (v.label ? ` "${v.label}"` : '')).join(', ');
  const text = (L.story || []).filter((b) => b.t === 'p').map((b, i) => `[${i}] ${b.md}`).join('\n').slice(0, 5000);
  const quizzes = (L.story || []).filter((b) => b.t === 'quiz').map((b, i) => `Q${i}: ${b.q}\n${b.choices.map((c, k) => `  ${k}) ${c}`).join('\n')}\n  lesson says: ${b.answer}`).join('\n');
  return `You are checking a beginner coding lesson for factual mistakes, using what its code ACTUALLY did when run.
LESSON: "${L.title}" (${L.lang})
CODE:
${code}

ACTUAL OUTPUT WHEN RUN:
${out || '(nothing printed)'}${pics ? `\nPICTURES DRAWN: ${pics}` : ''}

LESSON TEXT (numbered paragraphs):
${text}

QUIZZES:
${quizzes || '(none)'}

1) For each quiz, which choice is actually correct for THIS code and output? Mark "sure": true only if the code/output proves it.
2) Quote up to 3 sentences from the lesson text that state something false about what this code does or prints (wrong numbers, wrong output, wrong line behaviour). Not style, not simplifications for beginners. Give a corrected sentence in the same tone and language.
If a quiz's answer is wrong, also give "why": one plain sentence explaining the right answer.
Reply JSON only: {"quizzes":[{"i":0,"correct":1,"sure":true,"why":"only when the lesson's answer was wrong"}],"fixes":[{"p":0,"quote":"exact words from the text","fix":"corrected sentence"}]}`;
}

// Apply the model's verdict (only what it's sure of, and only exact quotes). Returns { patch, corrections[] }
export function applyCheck(L, j) {
  const corrections = []; let story = [...(L.story || [])];
  let qi = -1;
  story = story.map((b) => {
    if (b.t !== 'quiz') return b; qi++;
    const v = (j?.quizzes || []).find((x) => x.i === qi);
    if (!v || !v.sure || !Number.isInteger(v.correct) || v.correct < 0 || v.correct >= b.choices.length || v.correct === b.answer) return b;
    corrections.push({ kind: 'quiz', was: b.choices[b.answer], now: b.choices[v.correct], q: b.q });
    // the old explanation argued for the wrong answer, so it goes too
    const why = String(v.why || '').trim() || `The code’s real output shows the answer is ${b.choices[v.correct]}.`;
    return { ...b, answer: v.correct, why: `${why} (Bento double-checked this against the code’s real output.)` };
  });
  const paras = story.map((b, i) => (b.t === 'p' ? i : -1)).filter((i) => i >= 0);
  for (const f of (j?.fixes || []).slice(0, 3)) {
    const at = paras[f.p]; const quote = String(f.quote || '').trim(); const fix = String(f.fix || '').trim();
    if (at == null || quote.length < 12 || !fix || fix === quote) continue;
    const md = story[at].md; const k = md.indexOf(quote);
    if (k < 0) continue; // only exact quotes: never guess where a correction goes
    story[at] = { ...story[at], md: md.slice(0, k) + fix + md.slice(k + quote.length) };
    corrections.push({ kind: 'text', was: quote, now: fix });
  }
  return { patch: corrections.length ? { story } : {}, corrections };
}
