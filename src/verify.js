// Checking a freshly written lesson against reality. AI lessons can be confidently wrong, so after the
// lesson's code has run cleanly, Bento checks (1) the things it can prove locally, for free, and
// (2) with one small call to the learner's fast model, whether each quiz answer and each claim about
// the code matches what the code ACTUALLY printed. It fixes what it can prove, and says so.

const LINK = /\[\[(\d+)(?:-(\d+))?\|([^\]]+)\]\]/g;

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
  if (L.pseudo?.length && Math.abs(L.pseudo.length - lines) > 1) { patch.pseudo = []; notes.push('plain-words lines that didn’t match the code (they’ll be rewritten)'); }
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
