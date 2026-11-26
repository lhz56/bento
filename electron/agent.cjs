// Your own AI agent can use Bento (the Model Context Protocol, MCP). The idea, from apps that give agents tools instead
// of building an AI in: Bento is the classroom (the screen, the code runner, the pictures) and the agent you already
// talk to (Claude Code, Codex, Gemini, Copilot, Cursor…) brings the brains. It writes a lesson and Bento shows and runs
// it; it asks what you're looking at; it points at lines; it runs your code and reads what happened. Bento spends
// nothing of your plan on any of it: the agent's own plan pays for its thinking, and Bento only draws and runs.
//
// How it's wired:
//   agent ──stdio (MCP)──▶ `Bento --mcp` (this file's bridge: a second copy of Bento with no window and no Dock icon)
//          ──local socket──▶ the Bento you have open (serve(), started by main.cjs) ──IPC──▶ the window (App.jsx)
// The socket lives in Bento's own data folder and only your user account can open it (0600), so nothing else on the
// network can reach it. Every call names one of the tools below, with arguments checked here before the window sees them.
'use strict';
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// where the open Bento listens (macOS and Linux: a socket file; Windows: a named pipe per data folder)
function socketPath(userData) {
  if (process.platform === 'win32')
    return `\\\\.\\pipe\\bento-agent-${crypto.createHash('sha1').update(userData).digest('hex').slice(0, 12)}`;
  return path.join(userData, 'agent.sock');
}

// ---------------------------------------------------------------- the tools
const LANGS = ['python', 'javascript', 'typescript', 'html'];
const TOOLS = [
  {
    name: 'show_lesson',
    title: 'Show a lesson in Bento',
    description: [
      "Open a lesson in the Bento app on the learner's computer: your explanation beside runnable code, with plain-English lines, margin notes, new words, a quiz and experiments. Bento runs the code right away and returns what it printed, drew or raised, so you can check it and fix it with show_lesson again or run_code.",
      'Use it whenever the learner wants to understand an idea through code ("show me how recursion works"). Teach in layers: an everyday picture first, then the real term in **bold**, then the detail.',
      'code: 8–40 lines, runnable, no input(), no files or network. Python and JavaScript have built-in helpers (no import): show(x, "label") draws x (a list of numbers → bars, a dict with left/right → a tree, a list of dicts → a table, a 2D grid of a few values → coloured squares; calling it again on the same shape animates), and canvas helpers size(w,h), background(c), circle(x,y,r,c), rect(x,y,w,h,c), line(x1,y1,x2,y2,c,w), text(s,x,y,c). Call show() on the value that makes the idea visible. For "html" the code is one complete web page that renders live.',
      'Markdown in intro/explanation: **bold**, `code`, and line links [[4-6|the loop]] that light up those lines of the code when hovered (line 1 is the first line; use 2–4).',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short lesson title, e.g. "Binary search trees".' },
        question: {
          type: 'string',
          description: 'What the learner asked, in their words (optional).',
        },
        language: { type: 'string', enum: LANGS },
        code: { type: 'string', description: 'The runnable example.' },
        pseudo: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Exactly one plain-English line per line of code (≤ 9 words each; "" for blank lines and closing brackets). Shown in the Plain words lens.',
        },
        intro: {
          type: 'string',
          description: '1–2 short paragraphs before the code (blank line between paragraphs).',
        },
        explanation: {
          type: 'string',
          description: '1–3 short paragraphs after the code, pointing at it with [[line|links]].',
        },
        notes: {
          type: 'array',
          description: '2–4 margin notes pinned to lines: the why of the tricky parts.',
          items: {
            type: 'object',
            properties: {
              from: { type: 'integer' },
              to: { type: 'integer' },
              label: { type: 'string' },
              text: { type: 'string' },
            },
            required: ['from', 'text'],
          },
        },
        terms: {
          type: 'array',
          description: 'New words the lesson uses.',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              plain: { type: 'string', description: 'One-sentence definition, no other jargon.' },
              like: { type: 'string', description: 'An everyday comparison.' },
            },
            required: ['term', 'plain'],
          },
        },
        quiz: {
          type: 'object',
          description: 'One question that checks understanding (predict the output, what breaks).',
          properties: {
            q: { type: 'string' },
            choices: { type: 'array', items: { type: 'string' } },
            answer: { type: 'integer', description: 'Index of the right choice.' },
            why: { type: 'string' },
          },
          required: ['q', 'choices', 'answer'],
        },
        try: {
          type: 'array',
          items: { type: 'string' },
          description: '2–3 tiny experiments, each a concrete edit ("Change 5 to 50").',
        },
        next: {
          type: 'array',
          items: { type: 'string' },
          description: '3 follow-up questions the learner might ask next.',
        },
      },
      required: ['title', 'language', 'code'],
    },
  },
  {
    name: 'get_learner_view',
    title: 'See what the learner is looking at in Bento',
    description:
      'What is on the learner\'s Bento screen right now: which page, and for a lesson its title, the code as it is in the editor now (with line numbers, including their own edits) and what it did the last time it ran (output, pictures, error). Use it when they say "this", "my code", "why did that break" or "what did I just do", and before pointing at lines.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'highlight_code',
    title: 'Point at lines in Bento',
    description:
      'Light up lines of the code in the open Bento lesson, and optionally pin a short note to them in the margin. Use it to point while you explain ("this loop, here"). Line numbers are the ones get_learner_view shows.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'integer', minimum: 1 },
        to: { type: 'integer', minimum: 1 },
        note: { type: 'string', description: 'Optional: ≤ 25 words, pinned beside those lines.' },
        label: { type: 'string', description: 'Optional: 1–3 word heading for the note.' },
      },
      required: ['from'],
    },
  },
  {
    name: 'run_code',
    title: 'Run code in Bento',
    description:
      'Run the code in the open Bento lesson and return what it printed, drew and any error (with its line). Give code to replace what is in the editor first (the learner sees the change); leave it out to run their code as it is.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
  },
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// arguments as the window expects them, or a sentence saying what's wrong (the agent reads it and tries again)
const s = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const strs = (v, n, max) =>
  Array.isArray(v)
    ? v
        .filter((x) => typeof x === 'string')
        .slice(0, n)
        .map((x) => x.slice(0, max))
    : undefined;
const int = (v) =>
  Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;
function checkArgs(name, args) {
  args = args && typeof args === 'object' ? args : {};
  if (name === 'show_lesson') {
    const title = s(args.title, 120),
      code = s(args.code, 60000);
    if (!title) return { error: 'show_lesson needs a title.' };
    if (!code || !code.trim())
      return { error: 'show_lesson needs code: the runnable example the lesson is about.' };
    if (!LANGS.includes(args.language))
      return { error: `language must be one of ${LANGS.join(', ')}.` };
    const notes = Array.isArray(args.notes)
      ? args.notes
          .filter((n) => n && int(n.from) && typeof n.text === 'string')
          .slice(0, 6)
          .map((n) => ({
            from: int(n.from),
            to: int(n.to) || int(n.from),
            label: s(n.label, 40) || '',
            text: n.text.slice(0, 400),
          }))
      : [];
    const terms = Array.isArray(args.terms)
      ? args.terms
          .filter((x) => x && typeof x.term === 'string' && typeof x.plain === 'string')
          .slice(0, 6)
          .map((x) => ({
            term: x.term.slice(0, 60),
            plain: x.plain.slice(0, 300),
            like: s(x.like, 200) || '',
          }))
      : [];
    const q = args.quiz && typeof args.quiz === 'object' ? args.quiz : null;
    const quiz =
      q &&
      typeof q.q === 'string' &&
      Array.isArray(q.choices) &&
      q.choices.length >= 2 &&
      int(q.answer) != null &&
      int(q.answer) < q.choices.length
        ? {
            q: q.q.slice(0, 400),
            choices: strs(q.choices, 5, 200),
            answer: int(q.answer),
            why: s(q.why, 500) || '',
          }
        : null;
    return {
      args: {
        title,
        code,
        language: args.language,
        question: s(args.question, 500) || '',
        pseudo: strs(args.pseudo, 400, 200) || [],
        intro: s(args.intro, 4000) || '',
        explanation: s(args.explanation, 6000) || '',
        notes,
        terms,
        quiz,
        try: strs(args.try, 4, 120) || [],
        next: strs(args.next, 4, 120) || [],
      },
    };
  }
  if (name === 'highlight_code') {
    const from = int(args.from);
    if (!from || from < 1)
      return {
        error: 'highlight_code needs from: the first line to light up (1 is the first line).',
      };
    const to = Math.max(from, int(args.to) || from);
    return { args: { from, to, note: s(args.note, 400) || '', label: s(args.label, 40) || '' } };
  }
  if (name === 'run_code')
    return { args: { code: typeof args.code === 'string' ? args.code.slice(0, 60000) : null } };
  if (name === 'get_learner_view') return { args: {} };
  return { error: `Bento has no tool called ${name}.` };
}

// ---------------------------------------------------------------- the open Bento: listen for agents
// call(tool, args, client) → Promise<text>. One JSON message per line each way: { id, tool, args, client } → { id, text } | { id, error }.
/**
 * Listen for agent tool calls on the socket.
 * @param {{ sock: string, call: (tool: string, args: any, client: string) => Promise<string>, log?: (...a: any[]) => void }} o
 */
function serve({ sock, call, log = () => {} }) {
  if (process.platform !== 'win32') {
    try {
      fs.rmSync(sock, { force: true });
    } catch {}
  }
  const server = net.createServer((conn) => {
    conn.setEncoding('utf8');
    let buf = '';
    conn.on('error', () => {});
    conn.on('data', (d) => {
      buf += d;
      if (buf.length > 2_000_000) {
        conn.destroy();
        return;
      }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let match;
        try {
          match = JSON.parse(line);
        } catch {
          continue;
        }
        if (!match || typeof match !== 'object') continue;
        const reply = (o) => {
          if (!conn.destroyed) conn.write(JSON.stringify({ id: match.id, ...o }) + '\n');
        };
        const checked = checkArgs(String(match.tool), match.args);
        if (checked.error) {
          reply({ error: checked.error });
          continue;
        }
        Promise.resolve()
          .then(() => call(String(match.tool), checked.args, s(match.client, 60) || ''))
          .then(
            (text) => reply({ text: String(text) }),
            (e) => reply({ error: String(e?.message || e) }),
          );
      }
    });
  });
  server.on('error', (e) => log('agent socket', e));
  server.listen(sock, () => {
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(sock, 0o600);
      } catch {}
    }
  });
  return {
    close: () => {
      try {
        server.close();
      } catch {}
      if (process.platform !== 'win32') {
        try {
          fs.rmSync(sock, { force: true });
        } catch {}
      }
    },
  };
}

// ---------------------------------------------------------------- `Bento --mcp`: the agent's side
// Speaks MCP on standard input and output (one JSON-RPC message per line) and passes tool calls to the open Bento.
// Nothing else may ever be written to standard output: it is the agent's channel.
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/**
 * `Bento --mcp`: speak MCP on stdio to the agent, and pass its tool calls to the open Bento over the socket.
 * @param {{ sock: string, version?: string, launch?: () => boolean, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, onEnd?: () => void }} o
 */
function bridge({
  sock,
  version = '0',
  launch,
  input = process.stdin,
  output = process.stdout,
  onEnd = () => process.exit(0),
}) {
  let client = '',
    conn = null,
    seq = 0;
  const waiting = new Map();
  const send = (o) => output.write(JSON.stringify(o) + '\n');
  const connect = () =>
    new Promise((res, rej) => {
      const c = net.createConnection(sock);
      c.once('connect', () => {
        c.setEncoding('utf8');
        let buf = '';
        c.on('data', (d) => {
          buf += d;
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            let m;
            try {
              m = JSON.parse(line);
            } catch {
              continue;
            }
            const w = waiting.get(m.id);
            if (w) {
              waiting.delete(m.id);
              w(m);
            }
          }
        });
        c.on('close', () => {
          conn = null;
          for (const w of waiting.values())
            w({ error: 'Bento closed while it was working on that. Open Bento and try again.' });
          waiting.clear();
        });
        res(c);
      });
      c.once('error', rej);
    });
  // the open Bento, or start it (a shipped copy only) and wait for it to be ready
  const reach = async () => {
    if (conn) return conn;
    try {
      return (conn = await connect());
    } catch {}
    if (!launch || !launch())
      throw new Error('Bento isn’t open. Open the Bento app, then try again.');
    for (let t = 0; t < 60; t++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return (conn = await connect());
      } catch {}
    }
    throw new Error('Bento didn’t start in time. Open the Bento app, then try again.');
  };
  const callBento = async (tool, args) => {
    const c = await reach();
    const id = ++seq;
    return new Promise((res) => {
      waiting.set(id, res);
      c.write(JSON.stringify({ id, tool, args, client }) + '\n');
    });
  };
  const handle = async (m) => {
    const ok = (result) => m.id != null && send({ jsonrpc: '2.0', id: m.id, result });
    const fail = (code, message) =>
      m.id != null && send({ jsonrpc: '2.0', id: m.id, error: { code, message } });
    switch (m.method) {
      case 'initialize': {
        client = s(m.params?.clientInfo?.title || m.params?.clientInfo?.name, 60) || '';
        const want = m.params?.protocolVersion;
        return ok({
          protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'bento', title: 'Bento', version },
          instructions:
            "Bento is a learning app open on this computer. Teach by showing: put lessons on the learner's screen with show_lesson (Bento runs the code and tells you what happened), look at what they are doing with get_learner_view, point with highlight_code, and try changes with run_code. Bento uses none of the learner's AI plan: you do the thinking.",
        });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = m.params?.name;
        if (!TOOL[name]) return fail(-32602, `Unknown tool: ${name}`);
        const checked = checkArgs(name, m.params?.arguments);
        if (checked.error)
          return ok({ content: [{ type: 'text', text: checked.error }], isError: true });
        let r;
        try {
          r = await callBento(name, checked.args);
        } catch (e) {
          r = { error: e.message };
        }
        return ok(
          r.error
            ? { content: [{ type: 'text', text: r.error }], isError: true }
            : { content: [{ type: 'text', text: r.text }] },
        );
      }
      default:
        if (m.method?.startsWith('notifications/') || m.id == null) return undefined; // notifications need no answer
        return fail(-32601, `Bento doesn’t support ${m.method}.`);
    }
  };
  let buf = '';
  input.setEncoding?.('utf8');
  input.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        continue;
      }
      for (const one of Array.isArray(m) ? m : [m]) handle(one).catch(() => {});
    }
  });
  input.on('end', () => {
    try {
      conn?.end();
    } catch {}
    onEnd();
  });
}

module.exports = { TOOLS, checkArgs, socketPath, serve, bridge };
