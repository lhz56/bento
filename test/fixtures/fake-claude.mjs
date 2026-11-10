#!/usr/bin/env node
// A pretend Claude Code for tests (BENTO_FAKE_AI): answers --version, --help and auth like the real one, and streams a
// short lesson in the same stream-json format, slowly enough to watch it arrive. Nothing leaves the machine.
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('2.1.317 (Claude Code)'); process.exit(0); }
if (a[0] === '--help') { console.log('Usage: claude [options] --print --output-format --verbose --include-partial-messages --model --effort --tools --strict-mcp-config --setting-sources --no-session-persistence --system-prompt  (pretend help text long enough to count as help text for the check)'); process.exit(0); }
if (a[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, subscriptionType: 'max', authMethod: 'claude.ai' })); process.exit(0); }
const blocks = [
  { t: 'title', title: 'How a hash map finds things fast', kicker: 'data structures', lang: 'python', concepts: ['hash maps', 'hashing'] },
  { t: 'p', md: 'Picture a coat check. You hand over your coat and get a **ticket number**. Later, the number takes the attendant straight to the right hook: no searching.' },
  { t: 'code', file: 'coats.py', code: 'hooks = [None] * 8\n\ndef hook_for(name):\n    return sum(map(ord, name)) % len(hooks)\n\nhooks[hook_for("Ana")] = "red coat"\nprint(hook_for("Ana"), hooks[hook_for("Ana")])\nshow(hooks)' },
  { t: 'pseudo', lines: ['Make 8 empty hooks', '', 'To find a hook: turn the name into a number, wrap it to 8', '', 'Hang Ana’s coat on her hook', 'Print which hook, and what’s on it', 'Draw the hooks'] },
  { t: 'term', term: 'hash function', plain: 'A recipe that turns a key into a slot number, the same number every time.', like: 'The ticket number at a coat check.' },
  { t: 'p', md: 'That recipe is a [[3|hash function]]. Python’s `dict` does exactly this, with smarter numbers.' },
];
let prompt = a[a.indexOf('-p') + 1] || '';
// On Windows Bento sends the instructions and the question on standard input (cmd.exe can't take them as arguments)
if (!prompt || prompt.startsWith('--')) { prompt = ''; for await (const chunk of process.stdin) prompt += chunk; }
// a question asked inside a lesson: the short-answer JSON, with two follow-ups and a quick check
const tutor = { answer: 'Each name is turned into a number by **hook_for** [[3-4|this function]], and that number is the hook. Same name, same hook, so finding it is one step.', term: 'bucket', plain: 'One slot in a hash map where values with the same number go.', next: ['What if two names get the same hook?', 'Why 8 hooks?'], check: { q: 'What does hook_for give back?', choices: ['A coat', 'A hook number', 'A list of names'], answer: 1 } };
const text = /You are tutoring/.test(prompt) ? JSON.stringify(tutor) : /Reply (with )?JSON/i.test(prompt) ? '{}' : blocks.map((b) => JSON.stringify(b)).join('\n') + '\n';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let i = 0; const step = 70;
const tick = () => {

  if (i >= text.length) { out({ type: 'result', is_error: false, result: '', usage: { input_tokens: 1200, output_tokens: 600 } }); process.exit(0); }
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(i, i + step) } } }); i += step;
  setTimeout(tick, Number(process.env.FAKE_AI_STEP_MS || 120));
};
setTimeout(tick, Number(process.env.FAKE_AI_THINK_MS || 1500)); // the real one thinks for a few seconds before writing
