#!/usr/bin/env node
// The pretend AI the screen recordings use (scripts/record-media.mjs): fake-ai.mjs with a lesson that answers the
// question the recordings ask ("Why is a sorted list so fast to search?"). Nothing leaves the machine.
// Each one also refuses to run unless Bento passes the options that keep it a text-only writer (no tools, no plugins,
// none of the person's settings), the way a real one would misbehave without them: so if Bento ever stops passing them,
// the tests fail.
import fs from 'node:fs';

let a = process.argv.slice(2);
let as = 'claude';
if (a[0] === '--as') { as = a[1]; a = a.slice(2); }
const has = (f) => a.includes(f);
const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const refuse = (why) => { process.stderr.write(`pretend ${as}: ${why}\n`); process.exit(3); };
const THINK = Number(process.env.FAKE_AI_THINK_MS || 1500), STEP = Number(process.env.FAKE_AI_STEP_MS || 120);
const help = (flags) => `Usage: ${as} [options]\n\n${flags.map((f) => `  ${f}   (pretend option)`).join('\n')}\n\nA pretend help text, long enough to count as help text for Bento's version check.\n`;

const blocks = [
 {
  "t": "title",
  "title": "Why a sorted list is so fast to search",
  "kicker": "algorithms",
  "lang": "python",
  "concepts": [
   "binary search",
   "big o"
  ]
 },
 {
  "t": "p",
  "md": "Looking for a word in a dictionary? You don't start at page one. You open the **middle**, see if you went too far, and throw away half the book. Every look halves what's left."
 },
 {
  "t": "code",
  "file": "search.py",
  "code": "pages = list(range(1, 1001))\ntarget = 737\nlo, hi = 0, len(pages) - 1\nleft = []\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    left.append(hi - lo + 1)\n    if pages[mid] == target:\n        break\n    if pages[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nshow(left, \"pages left after each look\")\nprint(\"found\", target, \"in\", len(left), \"looks\")"
 },
 {
  "t": "pseudo",
  "lines": [
   "A book of 1,000 pages",
   "The page we want",
   "Start with the whole book",
   "Remember how much is left",
   "While there's still some book:",
   "open the middle",
   "note how many pages are left",
   "if it's our page,",
   "stop",
   "if we're too early,",
   "keep the back half",
   "otherwise,",
   "keep the front half",
   "Draw what's left after each look",
   "Say how many looks it took"
  ]
 },
 {
  "t": "term",
  "term": "binary search",
  "plain": "Finding something in a sorted list by halving it again and again.",
  "like": "Guessing a number when someone says “higher” or “lower”."
 },
 {
  "t": "p",
  "md": "That's [[6-7|halving]]: 1,000 pages take 10 looks. A billion take only 30. Computer people write this as **O(log n)**."
 },
 {
  "t": "quiz",
  "q": "About how many looks for a million pages?",
  "choices": [
   "About 20",
   "About 1,000",
   "About 500,000"
  ],
  "answer": 0,
  "why": "Halving a million twenty times gets you down to one page."
 }
];
// a question asked inside a lesson: the short-answer JSON, with two follow-ups and a quick check
const tutor = { answer: 'Each name is turned into a number by **hook_for** [[3-4|this function]], and that number is the hook. Same name, same hook, so finding it is one step.', term: 'bucket', plain: 'One slot in a hash map where values with the same number go.', next: ['What if two names get the same hook?', 'Why 8 hooks?'], check: { q: 'What does hook_for give back?', choices: ['A coat', 'A hook number', 'A list of names'], answer: 1 } };
// "Make your own path": a small plan of stops
const path = { title: 'SQL for a shop', d: 'Tables to totals.', project: 'a tiny shop database', end: 'A report of the best sellers.', stops: ['Tables', 'Asking questions', 'Sorting', 'Counting', 'Joining', 'A report'].map((t, i) => ({ t, d: `Stop ${i + 1}`, q: `Teach me ${t.toLowerCase()} in SQL with the shop database`, mins: 8, words: ['SQL'] })) };
// a grader (scripts/bench-ai.mjs): scores 1–5 and one issue
const grade = { correct: 5, clear: 4, visual: 4, code: 5, teaching: 4, overall: 4, issues: ['The second paragraph could be shorter.'] };
const english = (prompt) => { const want = ((prompt.match(/for lines ([\d, ]+) of this/) || [])[1] || '').split(',').map((x) => +x.trim()).filter(Boolean); const code = (prompt.split('CODE (line number| code):\n')[1] || '').split('\n').map((l) => l.replace(/^\d+\| /, '')); return { lines: Object.fromEntries(want.map((n) => [n, `Step: ${(code[n - 1] || '').trim().slice(0, 20)}`])) }; };
const answerFor = (prompt) => (/Score each from 1 \(poor\) to 5/.test(prompt) ? JSON.stringify(grade) : /Write plain-English pseudocode/.test(prompt) ? JSON.stringify(english(prompt)) : /You are tutoring/.test(prompt) ? JSON.stringify(tutor) : /Design a learning path/.test(prompt) ? JSON.stringify(path) : /Reply (with )?JSON/i.test(prompt) ? '{}' : blocks.map((b) => JSON.stringify(b.t === 'pseudo' && process.env.FAKE_AI_SLIP ? { ...b, lines: b.lines.filter((_, i) => i !== 2) } : b)).join('\n') + '\n'); // FAKE_AI_SLIP: one plain-English line left out, so the rest slip
const readStdin = async () => { let s = ''; for await (const c of process.stdin) s += c; return s; };
// the answer in pieces, one every STEP ms after THINK ms
const drip = (text, each, end) => { let i = 0; const tick = () => { if (i >= text.length) return end(); each(text.slice(i, i + 70)); i += 70; setTimeout(tick, STEP); }; setTimeout(tick, THINK); };
const week = () => Math.floor(Date.now() / 1000) + 3 * 86400;

// ---------------------------------------------------------------- Claude Code
if (as === 'claude') {
  const FLAGS = ['--print', '--output-format', '--verbose', '--include-partial-messages', '--model', '--effort', '--tools', '--strict-mcp-config', '--setting-sources', '--no-session-persistence', '--system-prompt', '--system-prompt-file'];
  if (a[0] === '--version') { console.log('2.1.317 (Claude Code)'); process.exit(0); }
  if (a[0] === '--help') { console.log(help(FLAGS)); process.exit(0); }
  if (a[0] === 'auth') { await new Promise((r) => setTimeout(r, +(process.env.FAKE_AI_AUTH_MS || 0))); console.log(JSON.stringify({ loggedIn: true, subscriptionType: 'max', authMethod: 'claude.ai' })); process.exit(0); } // FAKE_AI_AUTH_MS: a slow answer (a busy Mac)
  if (val('--tools') !== '' || !has('--strict-mcp-config') || val('--setting-sources') !== '' || !has('--no-session-persistence')) refuse('tools, tool servers or personal settings were left on');
  let prompt = a.find((x, i) => i > 0 && a[i - 1] === '-p' && !x.startsWith('--')) || '';
  if (!prompt) prompt = await readStdin(); // Bento sends the request on standard input
  const used = Number(process.env.FAKE_AI_USED || 0.42); const st = used >= 1 ? 'rejected' : used >= 0.8 ? 'allowed_warning' : 'allowed'; // FAKE_AI_USED=0.86: a nearly full week
  out({ type: 'rate_limit_event', rate_limit_info: { status: st, rateLimitType: 'seven_day', unifiedWindows: { seven_day: { utilization: used, resetsAt: week(), status: st } } } });
  drip(answerFor(prompt), (t) => out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } }),
    () => { out({ type: 'result', is_error: false, result: '', usage: { input_tokens: 1200, output_tokens: 600 } }); process.exit(0); });
}

// ---------------------------------------------------------------- Codex (ChatGPT)
else if (as === 'codex') {
  const FEATURES = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use', 'computer_use', 'view_image', 'image_generation'];
  if (a[0] === '--version') { console.log('codex-cli 0.166.0'); process.exit(0); }
  if (a[0] === 'login' && a[1] === 'status') { console.log('Logged in using ChatGPT'); process.exit(0); }
  if (a[0] === 'features' && a[1] === 'list') { console.log(FEATURES.map((f) => `${f.padEnd(30)} stable  true`).join('\n')); process.exit(0); }
  if (a[0] === 'exec' && a[1] === '--help') { console.log(help(['--json', '--skip-git-repo-check', '--ephemeral', '--sandbox', '--ignore-user-config', '--ignore-rules', '--disable', '--model'])); process.exit(0); }
  if (a[0] === 'app-server') {
    // just enough of the app server to answer "how much of my plan is used"
    let buf = ''; process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.method === 'initialize') out({ id: m.id, result: { userAgent: 'pretend' } });
      if (m.method === 'account/rateLimits/read') out({ id: m.id, result: { ordinaryUsageAllowed: true, rateLimits: { limitId: 'codex', planType: 'plus', primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 7200 }, secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: week() }, rateLimitReachedType: null } } });
    } });
    setTimeout(() => process.exit(0), 5000);
  } else if (a[0] === 'exec') {
    // a real Codex rejects feature names it doesn't know, and must have its tools switched off and your config ignored
    for (let i = 0; i < a.length; i++) if (a[i] === '--disable' && !FEATURES.includes(a[i + 1])) { process.stderr.write(`Error: Unknown feature flag: ${a[i + 1]}\n`); process.exit(2); }
    if (!has('--ignore-user-config') || !has('--ephemeral') || val('-s') !== 'read-only' || !a.includes('shell_tool')) refuse('shell, your Codex config or saved sessions were left on');
    const prompt = await readStdin();
    out({ type: 'thread.started', thread_id: 'pretend' }); out({ type: 'turn.started' });
    // Codex writes nothing until it's done, sometimes with a short note first: that note must stay on its own line
    setTimeout(() => {
      out({ type: 'item.completed', item: { id: 'i0', type: 'agent_message', text: 'I’ll write the lesson now.' } });
      out({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: answerFor(prompt) } });
      out({ type: 'turn.completed', usage: { input_tokens: 1300, cached_input_tokens: 200, output_tokens: 640 } });
      process.exit(0);
    }, THINK + 400);
  }
}

// ---------------------------------------------------------------- Gemini CLI
else if (as === 'gemini') {
  if (a[0] === '--version') { console.log('0.67.0'); process.exit(0); }
  if (a[0] === '--help') { console.log(help(['--output-format', 'stream-json', '--model', '--approval-mode', '--admin-policy', '--extensions', '--allowed-mcp-server-names', '--skip-trust'])); process.exit(0); }
  const policy = val('--admin-policy'); const sys = process.env.GEMINI_SYSTEM_MD;
  if (!policy || !/toolName = "\*"[\s\S]*decision = "deny"/.test(fs.existsSync(policy) ? fs.readFileSync(policy, 'utf8') : '') || val('--extensions') !== 'none' || !has('--allowed-mcp-server-names')) refuse('its tools, extensions or tool servers were left on');
  if (!sys || !fs.existsSync(sys)) refuse('Bento’s instructions file is missing');
  const prompt = await readStdin();
  out({ type: 'init', session_id: 'pretend', model: val('--model') || 'auto' });
  out({ type: 'message', role: 'user', content: prompt.slice(0, 40) });
  drip(answerFor(prompt), (t) => out({ type: 'message', role: 'assistant', content: t, delta: true }),
    () => { out({ type: 'result', status: 'success', stats: { total_tokens: 1900, input_tokens: 1250, output_tokens: 650, duration_ms: 1800 } }); process.exit(0); });
}

// ---------------------------------------------------------------- GitHub Copilot CLI
else if (as === 'copilot') {
  if (a[0] === '--version') { console.log('GitHub Copilot CLI 1.0.109.'); process.exit(0); }
  if (a[0] === '--help') { console.log(help(['--output-format', '--stream', '--available-tools', '--disable-builtin-mcps', '--no-custom-instructions', '--no-ask-user', '--model'])); process.exit(0); }
  if (!has('--available-tools') || !has('--disable-builtin-mcps') || !has('--no-custom-instructions') || process.env.COPILOT_ALLOW_ALL) refuse('its tools, tool servers or your instructions were left on');
  const prompt = val('-p') || '';
  const id = 'm1';
  out({ type: 'session.start', data: { sessionId: 'pretend', selectedModel: val('--model') || 'auto' } });
  out({ type: 'assistant.message_start', data: { messageId: id, phase: 'final_answer' } });
  const text = answerFor(prompt);
  drip(text, (t) => out({ type: 'assistant.message_delta', data: { messageId: id, deltaContent: t } }), () => {
    out({ type: 'assistant.message', data: { messageId: id, content: text } });
    out({ type: 'session.usage_checkpoint', data: { totalPremiumRequests: 1 } });
    out({ type: 'assistant.idle', data: {} }); out({ type: 'result', data: null });
    process.exit(0);
  });
}
// ---------------------------------------------------------------- Antigravity (agy)
else if (as === 'agy' || as === 'antigravity') {
  const MODELS = ['gemini-3.8-flash-high\tGemini 3.8 Flash (High)', 'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)', 'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)', 'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)'];
  if (a[0] === '--version') { console.log('1.5.5'); process.exit(0); }
  if (a[0] === '--help') { console.log(help(['--print', '--output-format', '--input-format', '--model', '--settings', '--disable-slash-commands'])); process.exit(0); }
  if (a[0] === 'models') { console.log('Fetching available models...'); console.log(MODELS.join('\n')); process.exit(0); }
  // every kind of tool must be denied, and slash commands off; an unknown rule kind would make the real one drop them all
  let st = {}; try { st = JSON.parse(val('--settings') || '{}'); } catch {}
  const deny = st.permissions?.deny || []; const KNOWN = ['command', 'write_file', 'read_file', 'mcp', 'read_url', 'execute_url', 'download_url'];
  if (!KNOWN.every((k) => deny.includes(`${k}(*)`)) || deny.some((r) => !KNOWN.includes(r.split('(')[0])) || !has('--disable-slash-commands') || st.allowNonWorkspaceAccess !== false) refuse('its tools were left on, or a rule kind it doesn’t know would drop them all');
  if (!a.includes('-p=') || val('--input-format') !== 'stream-json') refuse('the request has to come in on standard input');
  const line = (await readStdin()).split('\n').find((l) => l.trim()); let prompt = '';
  try { const m = JSON.parse(line); if (m.event !== 'user') throw 0; prompt = m.message?.content || ''; } catch { refuse('the input message isn’t {"event":"user","message":{"content":…}}'); }
  const id = 'pretend-conversation'; const up = (u) => out({ event: 'step_update', step_update: { conversation_id: id, ...u } });
  out({ event: 'init', conversation_id: id, init: { model: val('--model') || 'gemini-3.8-flash-medium', cwd: process.cwd(), tools: ['run_command', 'read_file', 'search_web'] } });
  up({ step_index: 0, state: 'DONE', step_type: 'user_input' });
  // FAKE_AI_AGY_TOOL=search_web: the model reaches for a tool first, as a real one sometimes does
  if (process.env.FAKE_AI_AGY_TOOL) { up({ step_index: 1, state: 'ACTIVE', step_type: 'tool', tool_name: process.env.FAKE_AI_AGY_TOOL, tool_info: { name: process.env.FAKE_AI_AGY_TOOL, parameters: { query: 'x' } } }); setTimeout(() => process.exit(0), 3000); }
  else drip(answerFor(prompt), (t) => up({ step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: t }), () => {
    up({ step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: '\n', usage: { input_tokens: 1300, output_tokens: 620, thinking_tokens: 0 } });
    out({ event: 'result', result: { conversation_id: id, status: 'SUCCESS', response: '', num_turns: 1, usage: { input_tokens: 1300, output_tokens: 620, thinking_tokens: 0, cache_read_tokens: 0 } } });
    process.exit(0);
  });
}
else refuse('unknown tool');
