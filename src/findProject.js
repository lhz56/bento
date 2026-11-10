// Questions about a real project ("how does T3 Code work?", "explain the excalidraw codebase") should open
// that project's real code, not a made-up toy version. This file decides, without any AI:
//   projectNames(q)        → the name(s) a question is about, or [] for ordinary questions
//   decide(q, names, found) → go straight there, ask which one, or just write a lesson

const FILLER = /^(?:hey|hi|hello|yo|ok(?:ay)?|so|alright|please|pls|can you|could you|would you|i want to|i'd like to|i wanna|help me|tell me|show me|teach me|explain(?: to me)?|walk me through|break down|take apart|dig into|deep dive into|look at|understand)\b[\s,]*/i;
const PROJECT_WORDS = /\b(?:repo|repository|codebase|code ?base|source(?: code)?|open[- ]source|github|architecture|internals|under the hood|how (?:it'?s|is it|was it) built|built|structured|implemented|engineered)\b/i;
const tidy = (s) => String(s || '').replace(/[?.!,;:]+$/g, '').replace(/^(?:the|a|an|this|that)\s+/i, '').replace(/['’]s$/i, '').trim();
export const norm = (s) => String(s || '').toLowerCase().replace(/\((beta|alpha|preview|nightly|canary)\)/g, '').replace(/[^a-z0-9]+/g, '');

// words that are ideas, not products: "how does recursion work" is a lesson, never a repo
const CONCEPTS = new Set(['recursion', 'hashmap', 'hashtable', 'map', 'set', 'list', 'array', 'loop', 'loops', 'function', 'functions', 'variable', 'variables', 'class', 'classes', 'object', 'objects',
  'internet', 'theinternet', 'web', 'email', 'dns', 'http', 'https', 'tcp', 'wifi', 'bluetooth', 'gps', 'encryption', 'hashing', 'compression', 'sorting', 'search', 'binarysearch', 'gradientdescent',
  'neuralnetwork', 'neuralnetworks', 'ai', 'llm', 'llms', 'transformer', 'transformers', 'attention', 'blockchain', 'bitcoin', 'cache', 'caching', 'database', 'databases', 'compiler', 'compilers',
  'interpreter', 'garbagecollection', 'memory', 'cpu', 'gpu', 'computer', 'computers', 'program', 'programs', 'code', 'coding', 'programming', 'api', 'apis', 'oauth', 'jwt', 'cookies', 'sessions',
  'async', 'await', 'promises', 'threads', 'concurrency', 'git', 'python', 'javascript', 'typescript', 'java', 'rust', 'golang', 'go', 'c', 'cpp', 'sql', 'html', 'css', 'closure', 'closures', 'pointer', 'pointers', 'regex', 'json', 'yaml', 'markdown', 'unicode', 'bigo', 'pagerank', 'trafficjams', 'herdimmunity', 'compoundinterest', 'money', 'math', 'physics', 'life', 'it', 'this', 'that', 'things', 'stuff']);

export function projectNames(q) {
  let s = String(q || '').trim().replace(/\s+/g, ' ');
  if (!s || s.length > 220 || /\n/.test(q)) return [];
  for (let i = 0; i < 4; i++) s = s.replace(FILLER, '');
  const out = [];
  const pats = [
    /^how (?:does|do|did|is|are|was)?\s*(.+?)\s+(?:actually\s+|really\s+)?(?:works?|work under the hood|run|runs|get built|built|made|implemented|structured|designed|architected)\b/i,
    /^(?:what(?:'s| is) )?(?:the )?(?:architecture|internals|source(?: code)?|codebase|code ?base|design|structure|stack|tech stack) (?:of|behind|for|in) (.+)$/i,
    /^(?:how (?:is|was) )?(.+?)['’]s (?:architecture|internals|source(?: code)?|codebase|code|design|structure|stack|tech stack)\b/i,
    /^(.+?) (?:architecture|internals|codebase|code ?base|source code|repo|repository)\b/i,
    /^(?:what is|what's|whats|what are)\s+(.+?)(?:\s+and how (?:does|do) it work.*)?$/i,
    /^(?:inside|about)\s+(.+)$/i,
    /^(?:let'?s |lets |can we |could we |i want to |wanna )?(?:talk|chat|learn|know|hear) (?:more )?about\s+(.+)$/i,
    /^(?:more )?(?:on|about|regarding)\s+(.+)$/i,
    /^(?:what about|thoughts on|what do you think (?:of|about))\s+(.+)$/i,
  ];
  let weak = false;
  for (const [i, rx] of pats.entries()) { const m = rx.exec(s); if (m) { out.push(tidy(m[1])); weak = i >= 4; break; } }
  const names = [...new Set(out)].filter((n) => {
    const k = norm(n); const w = n.split(/\s+/).length;
    return k.length >= 2 && k.length <= 40 && w <= 4 && !CONCEPTS.has(k) && !/^(how|why|what|when|where|who|i|my|your|our|we|you)\b/i.test(n);
  });
  // "what is X" and "about X" are usually ideas; they only count when X is on this Mac or the question says "code"
  names.weak = weak;
  return names;
}

// found = { installed: [{app, version, source: {full}}], local: [{root, remote}], github: [{full, stars, description}] }
// → { kind: 'go' | 'ask' | 'none', pick, options[], why }
export function decide(q, names, found, known = []) {
  if (!names.length || !found) return { kind: 'none' };
  const keys = new Set(names.map(norm));
  const repoKey = (full) => norm(String(full).split('/')[1]);
  const meta = (full) => found.github.find((g) => g.full.toLowerCase() === String(full).toLowerCase()) || { full };
  // 1. an app on this Mac that says where its code lives → that's the one
  const app = found.installed.find((a) => a.source?.full);
  if (app) {
    const local = found.local.find((l) => l.remote && l.remote.toLowerCase() === app.source.full.toLowerCase());
    return { kind: 'go', why: 'installed', pick: { ...meta(app.source.full), app, local }, options: [] };
  }
  // 2. a clone already in your code folders
  const local = found.local.find((l) => l.byRemote || keys.has(norm(l.name)));
  if (local) return { kind: 'go', why: 'local', pick: { ...(local.remote ? meta(local.remote) : { full: null }), local }, options: [] };
  // 3. something you already took apart in Bento
  const mine = known.find((p) => p.kind === 'github' && keys.has(repoKey(p.full || p.key)));
  if (mine) return { kind: 'go', why: 'known', pick: meta(mine.full || mine.key), options: [] };
  // 4. GitHub: a well-known repo with exactly this name
  if (names.weak && !PROJECT_WORDS.test(q)) return { kind: 'none' };
  const exact = found.github.filter((g) => keys.has(repoKey(g.full)) && (g.stars || 0) >= 300).sort((a, b) => (b.stars || 0) - (a.stars || 0));
  if (!exact.length) return { kind: 'none' };
  const top = exact[0];
  const others = found.github.filter((g) => g.full !== top.full && (g.stars || 0) >= 300).slice(0, 2);
  // clearly about the code ("the t3code repo", "excalidraw's architecture") and clearly the famous one → go
  if (PROJECT_WORDS.test(q) && (top.stars || 0) >= 2000 && (!exact[1] || (top.stars || 0) > 10 * (exact[1].stars || 0))) return { kind: 'go', why: 'github', pick: top, options: others };
  return { kind: 'ask', why: 'github', pick: top, options: others };
}

export const fmtStars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));

// A project you've already opened in Bento, named anywhere in the question ("hey lets talk about t3 code").
// Names are compared without spaces or dashes, so "t3 code", "t3code" and "T3-Code" all match pingdotgg/t3code.
export function mentionedProject(q, projects = []) {
  const words = String(q || '').toLowerCase().match(/[a-z0-9][a-z0-9._-]*/g) || [];
  const grams = new Set();
  for (let n = 1; n <= 4; n++) for (let i = 0; i + n <= words.length; i++) grams.add(norm(words.slice(i, i + n).join('')));
  let best = null;
  for (const p of projects) {
    if (p.kind !== 'github' && p.kind !== 'local') continue;
    const name = norm(String(p.full || p.name || '').split('/').pop());
    if (name.length < 4 || CONCEPTS.has(name) || !grams.has(name)) continue;
    if (!best || (p.at || 0) > (best.at || 0)) best = p;
  }
  return best;
}

// "how does it handle auth?", "what does this do?", "where is the code for X": the question points back at
// whatever you were just reading, instead of naming something new.
const AUX = new Set(['does', 'do', 'did', 'is', 'are', 'was', 'were', 'can', 'could', 'would', 'should', 'will', 'me', 'us', 'you', 'a', 'an', 'so', 'and', 'then', 'exactly', 'actually', 'really', 'in', 'about']);
const BACK = new Set(['it', 'its', "it's", 'this', 'that', 'they', 'them', 'these', 'those', 'here']);
const BACK_NOUN = /^(app|project|repo|repository|codebase|code|server|backend|frontend|ui|thing|tool)s?$/;
export function pointsBack(q) {
  const s = String(q || '').toLowerCase().replace(FILLER, '').trim();
  // "add a dark mode toggle to it", "make this faster": a request to change the thing you were reading
  if (/^(?:(?:can|could) you |please |let'?s |lets )?(?:add|build|make|change|create|implement|write|fix|refactor|extend|improve|speed up|clean up)\b/.test(s) && /\b(it|its|this|that|here|the (app|project|repo|codebase|code))\b/.test(s)) return true;
  const m = /^(?:how|what|where|why|when|which|who|does|do|is|are|can|could|should|explain|show|describe|summari[sz]e|walk me through)\b\s*(.*)$/.exec(s);
  if (!m) return false;
  const toks = (m[1].match(/[a-z0-9'’]+/g) || []).map((x) => x.replace('’', "'"));
  for (let i = 0; i < Math.min(toks.length, 6); i++) {
    const w = toks[i];
    if (AUX.has(w)) continue;
    if (BACK.has(w)) return true;
    if (w === 'the' || w === 'this' || w === 'that') return BACK_NOUN.test(toks[i + 1] || '');
    return false;
  }
  return false;
}

// "how does a binary search tree work?" is covered by a lesson whose words include binary, search and tree
const STOP = new Set('how does do did what why when is are was the a an work works working explain teach show tell me about with and of in on to i can you it this that make my happen happens happening really actually exactly'.split(' '));
// words too general to recognise a lesson by on their own ("how does this code work?")
const WEAK = new Set(['code', 'app', 'program', 'computer', 'thing', 'stuff', 'use', 'using', 'make', 'build']);
export function coveredBy(q, text) {
  const words = String(q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (/[^s]s$/.test(w) ? w.slice(0, -1) : w));
  const f = String(text).toLowerCase();
  // every word, or all but one in a longer question ("binary search trees please"); "binary search trees" is not the search race
  if (!words.some((w) => !WEAK.has(w))) return false;
  const hits = words.filter((w) => f.includes(w)).length;
  return words.length > 0 && hits >= (words.length >= 4 ? words.length - 1 : words.length);
}

const contentWords = (q) => String(q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => (/[^s]s$/.test(w) ? w.slice(0, -1) : w));
// how well a built-in lesson fits: 0 if it doesn't, more when the question's words are in its titles
export function coverScore(q, text, title = '') {
  if (!coveredBy(q, text)) return 0;
  const words = contentWords(q); const tl = String(title).toLowerCase();
  const inTitle = words.filter((w) => tl.includes(w)).length;
  if (words.length === 1 && !inTitle) return 0; // one loose word ("website") isn't enough unless it names the lesson
  return 1 + inTitle * 2;
}
const titlesOf = (b) => `${b.label} ${b.alt || ''}`;
// the best-fitting built-in lesson for a question, or null
export function bestBuiltin(q, builtins) {
  let best = null, top = 0;
  for (const b of builtins) { const sc = coverScore(q, b.find, titlesOf(b)); if (sc > top) { top = sc; best = b; } }
  return best;
}
// "binary search tree" is a topic Bento has a lesson called that, not a project to look for on GitHub
export function namesALesson(name, builtins) {
  // every word of the name counts, short ones too: "t3" in "T3 Code" is what makes it a project
  const words = String(name).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w)).map((w) => (/[^s]s$/.test(w) ? w.slice(0, -1) : w));
  if (!words.length || words.every((w) => WEAK.has(w))) return false;
  return builtins.some((b) => { const tl = titlesOf(b).toLowerCase(); return words.every((w) => tl.includes(w)); });
}
