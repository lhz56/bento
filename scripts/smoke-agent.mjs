// Your own AI agent using Bento (electron/agent.cjs), checked for real: a hidden Bento with a throwaway profile and no
// AI at all, and `Bento --mcp` started the way Claude Code or Codex starts it, spoken to in MCP over its standard input
// and output. Nothing here uses anyone's plan: the "agent" is this script.
//
//   npx vite build && node scripts/smoke-agent.mjs        the app from this folder
//   node scripts/smoke-agent.mjs --packaged               the app electron-builder made (BENTO_RELEASE_DIR to point elsewhere)
import { _electron as electron } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
function packagedApp() {
  const rel = process.env.BENTO_RELEASE_DIR || path.join(root, 'release');
  const dirs = fs.existsSync(rel) ? fs.readdirSync(rel) : [];
  if (process.platform === 'darwin') { const d = dirs.find((x) => x.startsWith('mac') && fs.existsSync(path.join(rel, x, 'Bento.app'))); return d && path.join(rel, d, 'Bento.app', 'Contents', 'MacOS', 'Bento'); }
  if (process.platform === 'win32') { const d = dirs.find((x) => x.startsWith('win') && x.endsWith('unpacked')); return d && path.join(rel, d, 'Bento.exe'); }
  const d = dirs.find((x) => x.startsWith('linux') && x.endsWith('unpacked'));
  return d && ['bento', 'Bento'].map((n) => path.join(rel, d, n)).find((f) => fs.existsSync(f));
}
const exe = packaged ? packagedApp() : createRequire(import.meta.url)('electron');
if (!exe || !fs.existsSync(exe)) { console.error('✗ can’t find the app'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-agent-'));
const profile = path.join(tmp, 'p'); fs.mkdirSync(profile);
fs.writeFileSync(path.join(profile, 'bento-store.json'), JSON.stringify({ 'bento.settings': { onboarded: true } }));
const env = { ...process.env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_PRETEND_MISSING: 'claude,codex,antigravity,gemini,copilot,gh', BENTO_NO_GH: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.BENTO_DEV;
const app = await electron.launch({ executablePath: exe, args: packaged ? [] : [root], env, timeout: 90000 });
const p = await app.firstWindow(); await p.waitForSelector('.side', { timeout: 60000 });

let fail = 0;
const step = async (label, fn) => { try { const note = await fn(); console.log(`✓ ${label}${note ? ` · ${note}` : ''}`); } catch (e) { fail++; console.log(`✗ ${label}: ${String(e.message).split('\n')[0]}`); } };
const must = (ok, why) => { if (!ok) throw new Error(why); };

// an MCP client over stdio, the way agents start Bento's tool server
function agent(userData) {
  const child = spawn(exe, [...(packaged ? [] : [root]), '--mcp'], { env: { ...env, BENTO_USERDATA: userData }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', seq = 0; const waits = new Map(); const stray = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch { stray.push(line); continue; } waits.get(m.id)?.(m); waits.delete(m.id); } });
  const rpc = (method, params, ms = 60000) => new Promise((res, rej) => { const id = ++seq; const t = setTimeout(() => rej(new Error(`${method}: no answer`)), ms); waits.set(id, (m) => { clearTimeout(t); res(m); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const tool = async (name, args) => { const m = await rpc('tools/call', { name, arguments: args }); if (m.error) throw new Error(m.error.message); return { text: m.result.content.map((c) => c.text).join('\n'), isError: !!m.result.isError }; };
  return { child, rpc, tool, stray, notify: (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'), close: () => { child.stdin.end(); } };
}

const A = agent(profile);
await step('an agent connects: Bento answers MCP and lists its four tools', async () => {
  const init = await A.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '9' } });
  must(init.result?.serverInfo?.name === 'bento', 'no serverInfo');
  must(init.result.protocolVersion === '2025-06-18', `protocol ${init.result.protocolVersion}`);
  A.notify('notifications/initialized');
  const names = (await A.rpc('tools/list', {})).result.tools.map((t) => t.name).sort().join(',');
  must(names === 'get_learner_view,highlight_code,run_code,show_lesson', names);
  return names;
});
await step('it sees the home page, and is told there is no lesson to point at yet', async () => {
  const v = await A.tool('get_learner_view', {});
  must(/home page/.test(v.text), v.text);
  const h = await A.tool('highlight_code', { from: 1 });
  must(h.isError && /No lesson is open/.test(h.text), h.text);
});
const CODE = 'nums = [5, 2, 9, 1]\nfor i in range(len(nums)):\n    nums[i] = nums[i] * 2\nshow(nums, "doubled")\nprint("biggest", max(nums))';
await step('show_lesson puts the agent’s lesson on screen, runs it, and says what it did', async () => {
  const r = await A.tool('show_lesson', { title: 'Doubling a list', question: 'how do loops change a list?', language: 'python', code: CODE,
    pseudo: ['Start with four numbers', 'Visit each position', 'Double the number there', 'Draw the list as bars', 'Say the biggest one'],
    intro: 'A **loop** visits each spot in a list, one by one.', explanation: 'Line [[3|this line]] changes the list in place.',
    notes: [{ from: 2, to: 3, label: 'the loop', text: 'range(len(nums)) gives the positions 0 to 3.' }],
    terms: [{ term: 'loop', plain: 'Code that repeats for each item.', like: 'Checking every seat in a row.' }],
    quiz: { q: 'What is printed?', choices: ['biggest 9', 'biggest 18'], answer: 1, why: 'Every number was doubled first.' }, try: ['Change 2 to 3'] });
  must(!r.isError, r.text);
  must(/Doubling a list/.test(r.text) && /bar chart "doubled": \[10, 4, 18, 2\]/.test(r.text) && /biggest 18/.test(r.text), r.text);
  await p.waitForSelector('text=Doubling a list', { timeout: 10000 });
  must(await p.locator('text=from Claude Code').count() > 0, 'no “from Claude Code” on the lesson');
  return 'ran: bars + “biggest 18”';
});
await step('get_learner_view gives the code with line numbers and the last run', async () => {
  const v = await A.tool('get_learner_view', {});
  must(/Lesson: "Doubling a list" \(python, written by Claude Code\)/.test(v.text), v.text.slice(0, 200));
  must(/ {2}3 {2} {4}nums\[i\] = nums\[i\] \* 2/.test(v.text), 'no numbered line 3');
  must(/biggest 18/.test(v.text), 'no last run');
});
await step('highlight_code lights lines and pins the agent’s note beside them', async () => {
  const h = await A.tool('highlight_code', { from: 3, to: 3, note: 'This is where each number doubles.' });
  must(!h.isError && /Lines? 3/.test(h.text), h.text);
  await p.waitForFunction(() => document.body.innerText.includes('This is where each number doubles.'), null, { timeout: 5000 });
  const out = await A.tool('highlight_code', { from: 40 });
  must(out.isError && /has 5 lines/.test(out.text), out.text);
});
await step('run_code puts new code in the editor, runs it and reports the error with its line', async () => {
  const r = await A.tool('run_code', { code: 'x = [1, 2]\nprint(x[5])' });
  must(/Error on line 2/.test(r.text) && /IndexError|index out of range/.test(r.text), r.text);
  const v = await A.tool('get_learner_view', {});
  must(/they changed it/.test(v.text) && /print\(x\[5\]\)/.test(v.text), 'the editor doesn’t hold the new code');
  const again = await A.tool('run_code', {});
  must(/Ran the learner’s code/.test(again.text) && /Error on line 2/.test(again.text), again.text);
});
await step('bad arguments get a sentence the agent can act on', async () => {
  const r = await A.tool('show_lesson', { title: 'x', language: 'cobol', code: 'x' });
  must(r.isError && /language must be one of/.test(r.text), r.text);
  const u = await A.rpc('tools/call', { name: 'delete_everything', arguments: {} });
  must(u.error && /Unknown tool/.test(u.error.message), JSON.stringify(u));
});
await step('none of the learner’s AI plan was used, and nothing but MCP came out on standard output', async () => {
  const u = await p.evaluate(() => window.bento.usage());
  must(!u.recent.length, `${u.recent.length} AI requests`);
  must(!A.stray.length, `stray output: ${A.stray[0]}`);
});
await step('the lesson stays in the library after the agent goes', async () => {
  A.close(); await new Promise((r) => A.child.once('exit', r));
  const n = await p.evaluate(() => JSON.parse(localStorage.getItem('bento.lessons') || '[]').filter((l) => l.agent === 'Claude Code').length).catch(() => 0);
  const store = JSON.parse(fs.readFileSync(path.join(profile, 'bento-store.json'), 'utf8'));
  must(n > 0 || (store['bento.lessons'] || []).some((l) => l.agent === 'Claude Code'), 'not saved');
});
await step('with Bento closed, the agent hears “open Bento” instead of hanging', async () => {
  const other = path.join(tmp, 'q'); fs.mkdirSync(other);
  const B = agent(other);
  await B.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex' } });
  const r = await B.tool('get_learner_view', {});
  must(r.isError && /isn’t open/.test(r.text), r.text);
  B.close();
});

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
