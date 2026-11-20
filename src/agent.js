// Your own AI agent using Bento (electron/agent.cjs): its lesson becomes a real Bento lesson, and what's on screen and
// what code did is put into words for it. Pure functions; App.jsx does the rest.
import { emptyLesson, applyBlock } from './lesson.js';

// Agents name themselves in plain words ("Claude Code") or as programs ("claude-code", "codex-mcp-client")
const KNOWN = [[/claude/i, 'Claude Code'], [/codex/i, 'Codex'], [/gemini/i, 'Gemini'], [/copilot/i, 'Copilot'], [/cursor/i, 'Cursor'], [/antigravity|agy/i, 'Antigravity'], [/t3/i, 'T3 Code']];
export const agentName = (client) => (KNOWN.find(([r]) => r.test(client || '')) || [null, String(client || '').trim().slice(0, 40) || 'your agent'])[1];

const paras = (md) => String(md || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);

// show_lesson's arguments (checked in agent.cjs) → a finished Bento lesson
export function lessonFromAgent(a, client) {
  const lines = a.code.replace(/\s+$/, '').split('\n');
  const blocks = [
    { t: 'title', title: a.title, kicker: `from ${agentName(client)}`, lang: a.language, concepts: [] },
    ...paras(a.intro).map((md) => ({ t: 'p', md })),
    ...a.terms.map((x) => ({ t: 'term', ...x })),
    { t: 'code', code: a.code, file: a.language === 'html' ? 'index.html' : a.language === 'python' ? 'main.py' : a.language === 'typescript' ? 'main.ts' : 'main.js' },
    // one plain-English line per line of code; missing ones stay blank (Bento never spends your plan filling them in)
    { t: 'pseudo', lines: lines.map((_, i) => a.pseudo[i] ?? '') },
    { t: 'notes', items: a.notes },
    ...paras(a.explanation).map((md) => ({ t: 'p', md })),
    ...(a.quiz ? [{ t: 'quiz', ...a.quiz }] : []),
    ...(a.try.length ? [{ t: 'try', items: a.try }] : []),
    ...(a.next.length ? [{ t: 'next', items: a.next }] : []),
  ];
  let L = emptyLesson(a.question || a.title, { mode: 'explain', lang: a.language });
  for (const b of blocks) L = applyBlock(L, b);
  return { ...L, status: 'done', agent: agentName(client) };
}

// what a run did, for the agent to read
const short = (s, n) => (s.length > n ? `${s.slice(0, n)}… (${s.length - n} more characters)` : s);
function seen(v) {
  const label = v.label ? ` "${v.label}"` : '';
  switch (v.type) {
    case 'bars': return `bar chart${label}: [${(v.data || []).slice(0, 30).join(', ')}${(v.data || []).length > 30 ? ', …' : ''}]`;
    case 'grid': return `grid${label}, ${(v.data || []).length}×${(v.data?.[0] || []).length}: ${(v.data || []).slice(0, 8).map((r) => r.join(' ')).join(' / ')}`;
    case 'records': return `table${label} with columns ${(v.cols || []).join(', ')}, ${(v.rows || []).length} rows; first: ${(v.rows?.[0] || []).join(' | ')}`;
    case 'table': return `table${label}: ${(v.rows || []).slice(0, 12).map(([k, x]) => `${k} = ${x}`).join('; ')}`;
    case 'tree': return `tree diagram${label}`;
    case 'canvas': return `a drawing on the canvas (${(v.cmds || []).length} shapes)`;
    case 'web': return 'the web page, live in Bento’s preview';
    case 'text': return `text${label}: ${short(String(v.text || ''), 300)}`;
    default: return `${v.type || 'a picture'}${label}`;
  }
}
export function describeRun(r) {
  if (!r) return 'It hasn’t run yet.';
  const out = [];
  const logs = (r.logs || []).map((l) => (l.k === 'in' ? `${l.p || ''}${l.s} (typed in)` : l.k === 'err' ? `[error output] ${l.s}` : l.s));
  if (logs.length) out.push(`Printed:\n${short(logs.join('\n'), 4000)}`);
  const vis = (r.visuals || []).map(seen);
  if (vis.length) out.push(`Showed ${vis.length === 1 ? 'a picture' : `${vis.length} pictures`}:\n${vis.slice(0, 12).map((x) => `- ${x}`).join('\n')}`);
  if (r.need) out.push(`It is waiting for the learner to type an answer${r.need.prompt ? ` to "${r.need.prompt}"` : ''}.`);
  if (r.error) out.push(`Error${r.error.line ? ` on line ${r.error.line}` : ''}: ${r.error.msg}`);
  if (!out.length) out.push('It ran without printing or showing anything.');
  return out.join('\n\n');
}

export const numbered = (code) => String(code || '').split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');

const VIEW = { home: 'the home page', lesson: 'a lesson', atlas: 'a project being taken apart (Atlas)', site: 'a website being taken apart', compare: 'two projects side by side', explore: 'Explore (finding projects)', path: 'a learning path', puzzles: 'puzzles', play: 'a playground', ideas: 'clever ideas', map: 'the skill map', words: 'the words they have learned' };
export function describeView({ view, lesson, code, run, project }) {
  const out = [`The learner is on ${VIEW[view] || view}.`];
  if (view === 'atlas' && project) out.push(`Project: ${project}.`);
  if (view !== 'lesson' || !lesson) { out.push('No lesson is open. show_lesson opens one.'); return out.join('\n'); }
  out.push(`Lesson: "${lesson.title || lesson.q}" (${lesson.lang}${lesson.agent ? `, written by ${lesson.agent}` : ''}).`);
  if (lesson.q && lesson.q !== lesson.title) out.push(`They asked: ${lesson.q}`);
  if (lesson.status === 'streaming') out.push('Bento is still writing this lesson.');
  const edited = code != null && code !== lesson.code;
  out.push(`${edited ? 'Their code in the editor (they changed it from the lesson’s):' : 'The code in the editor:'}\n${numbered(code ?? lesson.code)}`);
  out.push(`Last run${run && run.src !== (code ?? lesson.code) ? ' (of an earlier version of this code)' : ''}:\n${describeRun(run?.r)}`);
  return out.join('\n\n');
}

// the one command that adds Bento to an agent (Settings → Use Bento from your AI agent); "json" is the shape most other
// apps' MCP settings take. cmd is what starts Bento's tool server: [program, ...arguments].
const q = (x) => (/^[\w@%+=:,./-]+$/.test(x) ? x : `"${x.replace(/(["\\$`])/g, '\\$1')}"`);
export function agentCommand(which, cmd) {
  const [bin, ...args] = cmd; const run = [bin, ...args].map(q).join(' ');
  if (which === 'claude') return `claude mcp add bento --scope user -- ${run}`;
  if (which === 'codex') return `codex mcp add bento -- ${run}`;
  if (which === 'gemini') return `gemini mcp add --scope user bento ${run}`;
  if (which === 'copilot') return `copilot mcp add bento -- ${run}`;
  return JSON.stringify({ mcpServers: { bento: { command: bin, args } } }, null, 2);
}
