// The AIs Bento can teach with, one adapter each. Every adapter knows how to:
//   check   a version Bento can talk to (its --help lists every option Bento passes) and whether it's signed in
//   build   the command that runs it as a writer only: no tools, no files, no plugins or tool servers, none of the
//           person's own settings, and nothing saved to their history. The request goes in on standard input or a
//           temporary file, never on the command line (where other programs can read it, and Windows cuts it short)
//   parse   one line of what it streams, into text, thinking, token counts, errors and plan limits
//   limits  how much of the person's plan is used, when the tool can say so without spending anything
// Names, models and install/sign-in commands people see live in ai-catalog.json, shared with the screens (src/ai.js).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const CAT = require('./ai-catalog.json');

const BY = Object.fromEntries(CAT.providers.map((p) => [p.id, p]));
const IDS = CAT.providers.map((p) => p.id);
const label = (id) => {
  const p = BY[id];
  return p ? (p.via ? `${p.name} (${p.via})` : p.name) : id;
};

// "claude:sonnet" → { prov, name }. Unknown providers or odd text fall back to a default: nothing unexpected ever
// reaches a command line.
function parseModel(model) {
  let [prov, name] = String(model || '').split(':');
  if (!BY[prov]) prov = IDS[0];
  if (!name || !/^[\w.-]{1,40}$/.test(name)) name = BY[prov].default.split(':')[1];
  return { prov, name, id: `${prov}:${name}` };
}
const fastOf = (model) => BY[parseModel(model).prov].fast;

// whether a --help text lists every option Bento passes (null: no usable help text, so no verdict)
// (a flag can be a list of the ways its help may spell it, such as Claude's "--system-prompt[-file]")
const missingFlags = (help, flags) => {
  const t = `${help.out}${help.err}`;
  if (!help.ok || t.length < 200) return null;
  const gone = flags
    .filter((f) => ![].concat(f).some((x) => t.includes(x)))
    .map((f) => [].concat(f)[0]);
  return gone.length ? gone : null;
};

// plan names as people know them
const PLAN = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  promax: 'Pro Max',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
  max: 'Max',
};
const planName = (p) =>
  p
    ? PLAN[String(p).toLowerCase()] ||
      String(p)
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
const clamp = (x) =>
  typeof x !== 'number' || !isFinite(x) ? null : Math.max(0, Math.min(100, Math.round(x)));
// Claude gives a fraction (0.53); a number above 1.5 can only be a percentage already
const pct = (x) => (typeof x !== 'number' || !isFinite(x) ? null : clamp(x <= 1.5 ? x * 100 : x));
const windowName = (mins) =>
  mins === 300
    ? '5-hour window'
    : mins === 10080
      ? 'this week'
      : mins === 1440
        ? 'today'
        : mins
          ? `${Math.round(mins / 60)}-hour window`
          : 'usage';

// ---------------------------------------------------------------- Claude Code
const claude = {
  compat: {
    help: ['--help'],
    flags: [
      '--output-format',
      '--include-partial-messages',
      '--tools',
      '--strict-mcp-config',
      '--setting-sources',
      '--no-session-persistence',
      ['--system-prompt-file', '--system-prompt[-file]'],
    ],
  },
  version: (out) => out.trim().split(' ')[0],
  async auth({ run }) {
    const a = await run(['auth', 'status']);
    try {
      const j = JSON.parse(a.out);
      return {
        loggedIn: !!j.loggedIn,
        plan: planName(j.subscriptionType),
        method: j.authMethod || null,
      };
    } catch {
      return { loggedIn: a.ok };
    }
  },
  build({ name, sysFile, prompt }) {
    return {
      args: [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--model',
        name,
        ...(name === 'haiku' ? ['--effort', 'low'] : []),
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--system-prompt-file',
        sysFile,
      ],
      stdin: prompt,
    };
  },
  parse(o, s) {
    if (o.type === 'stream_event' && o.event?.delta?.type === 'thinking_delta')
      s.think(o.event.delta.thinking || '', o.event.delta.estimated_tokens || 0);
    else if (
      o.type === 'stream_event' &&
      o.event?.type === 'content_block_delta' &&
      o.event.delta?.type === 'text_delta'
    )
      s.text(o.event.delta.text);
    else if (o.type === 'rate_limit_event' && o.rate_limit_info)
      s.limits(claudeLimits(o.rate_limit_info));
    else if (o.type === 'result') {
      if (o.usage)
        s.tokens(
          (o.usage.input_tokens || 0) +
            (o.usage.cache_read_input_tokens || 0) +
            (o.usage.cache_creation_input_tokens || 0),
          o.usage.output_tokens || 0,
        );
      if (o.is_error) s.error(String(o.result || 'model error'));
      else if (!s.full() && o.result) s.text(o.result);
    }
  },
};
// Claude reports the window that matters right now (5 hours or the week) with each reply
const CLAUDE_WINDOWS = {
  five_hour: '5-hour window',
  seven_day: 'this week',
  seven_day_opus: 'Opus this week',
  seven_day_sonnet: 'Sonnet this week',
};
function claudeLimits(info) {
  const wins = Object.entries(info.unifiedWindows || {})
    .filter(([k]) => CLAUDE_WINDOWS[k])
    .map(([k, w]) => ({
      key: k,
      label: CLAUDE_WINDOWS[k],
      used: pct(w.utilization),
      resetsAt: w.resetsAt ? w.resetsAt * 1000 : null,
      warn: w.status === 'allowed_warning',
      out: w.status === 'rejected',
    }));
  if (!wins.length && CLAUDE_WINDOWS[info.rateLimitType])
    wins.push({
      key: info.rateLimitType,
      label: CLAUDE_WINDOWS[info.rateLimitType],
      used: pct(info.utilization),
      resetsAt: info.resetsAt ? info.resetsAt * 1000 : null,
      warn: info.status === 'allowed_warning',
      out: info.status === 'rejected',
    });
  return { windows: wins, out: info.status === 'rejected' };
}

// ---------------------------------------------------------------- Codex (ChatGPT)
// Codex turns on shell commands, plugins, apps, browser and computer use by default. A lesson writer needs none of
// them, so each one Codex reports having is switched off (naming a feature it doesn't have is an error, so only
// names from its own `features list` are used).
const CODEX_OFF = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'remote_plugin',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'in_app_browser',
  'image_generation',
  'view_image',
  'multi_agent',
  'skill_search',
  'tool_suggest',
  'sleep_tool',
  'hooks',
  'goals',
  'workspace_dependencies',
  'skill_mcp_dependency_install',
  'memories',
];
let codexFeatures = null; // the names Codex knows, read once
const codex = {
  compat: {
    help: ['exec', '--help'],
    flags: [
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox',
      '--ignore-user-config',
      '--ignore-rules',
      '--disable',
    ],
  },
  version: (out) => out.trim().split(' ').pop(),
  async auth({ run }) {
    const a = await run(['login', 'status']);
    const t = (a.out + a.err).trim();
    return {
      loggedIn: a.ok && /logged in/i.test(t),
      method: /chatgpt/i.test(t) ? 'ChatGPT' : /api key/i.test(t) ? 'API key' : null,
    };
  },
  async prepare({ run }) {
    if (codexFeatures) return;
    const r = await run(['features', 'list']);
    codexFeatures = new Set(
      r.ok
        ? r.out
            .split('\n')
            .map((l) => l.trim().split(/\s+/)[0])
            .filter(Boolean)
        : [],
    );
  },
  build({ name, system, prompt }) {
    const off = CODEX_OFF.filter((f) => codexFeatures?.has(f)).flatMap((f) => ['--disable', f]);
    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '-s',
      'read-only',
      '-c',
      'model_reasoning_effort=low',
      ...off,
    ];
    if (name !== 'default') args.push('-m', name);
    args.push('-');
    return {
      args,
      stdin: `${system}\n\n---\n\n${prompt}\n\n(Do not run any commands. Answer directly in the required format.)`,
    };
  },
  parse(o, s) {
    // each message on its own line: a short "I'll …" before the answer must never merge into the first line of a lesson
    if (o.type === 'item.completed' && o.item?.type === 'agent_message' && o.item.text) {
      if (s.full() && !s.full().endsWith('\n')) s.text('\n');
      s.text(o.item.text);
    } else if (o.type === 'item.completed' && o.item?.type === 'reasoning' && o.item.text)
      s.think(o.item.text + '\n');
    else if (o.type === 'turn.completed' && o.usage)
      s.tokens(
        (o.usage.input_tokens || 0) + (o.usage.cached_input_tokens || 0),
        o.usage.output_tokens || 0,
      );
    else if (o.type === 'error' || o.type === 'turn.failed')
      s.error(
        typeof o.error === 'string'
          ? o.error
          : o.error?.message || o.message || JSON.stringify(o.error || o),
      );
  },
  // the plan's limits, read from Codex's own app server: no model is asked, so this costs nothing
  async limits({ spawnJson }) {
    const r = await spawnJson(
      ['app-server'],
      [
        { id: 1, method: 'initialize', params: { clientInfo: { name: 'bento', version: '1' } } },
        { method: 'initialized' },
        { id: 2, method: 'account/rateLimits/read' },
      ],
      2,
    );
    const rl = r?.rateLimits;
    if (!rl) return null;
    const wins = [rl.primary, rl.secondary].filter(Boolean).map((w) => ({
      key: String(w.windowDurationMins),
      label: windowName(w.windowDurationMins),
      used: clamp(w.usedPercent),
      resetsAt: w.resetsAt ? w.resetsAt * 1000 : null,
      warn: w.usedPercent >= 80,
      out: w.usedPercent >= 100,
    }));
    return {
      plan: planName(rl.planType),
      windows: wins,
      out: !!rl.rateLimitReachedType || r.ordinaryUsageAllowed === false,
    };
  },
};

// ---------------------------------------------------------------- Gemini CLI
// Gemini allows its read-only tools (files, search) on its own. One admin-tier policy denies every tool, built-in or
// from a tool server, so the model never even sees them; extensions and tool servers aren't loaded at all; and
// Bento's instructions replace Gemini's own (GEMINI_SYSTEM_MD) instead of sitting on top of an agent's.
const GEMINI_POLICY =
  '# Bento: Gemini only writes text here. No tool of any kind, built-in or from a tool server.\n[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n\n[[rule]]\ntoolName = "*"\nmcpName = "*"\ndecision = "deny"\npriority = 999\n';
const geminiHome = () => path.join(process.env.GEMINI_CLI_HOME || os.homedir(), '.gemini');
const gemini = {
  compat: {
    help: ['--help'],
    flags: [
      '--output-format',
      'stream-json',
      '--model',
      '--approval-mode',
      '--admin-policy',
      '--extensions',
      '--allowed-mcp-server-names',
      '--skip-trust',
    ],
  },
  version: (out) => out.trim().split(/\s+/).pop(),
  // signed in = a cached Google sign-in, or a key/cloud setup in the environment (read from files; nothing is run)
  async auth({ env }) {
    if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return { loggedIn: true, method: 'API key' };
    if (/^(1|true)$/i.test(env.GOOGLE_GENAI_USE_VERTEXAI || ''))
      return { loggedIn: true, method: 'Google Cloud' };
    let sel = null;
    try {
      const j = JSON.parse(
        await fs.promises.readFile(path.join(geminiHome(), 'settings.json'), 'utf8'),
      );
      sel = j?.security?.auth?.selectedType || j?.selectedAuthType || null;
    } catch {}
    const creds = await fs.promises.access(path.join(geminiHome(), 'oauth_creds.json')).then(
      () => true,
      () => false,
    );
    // a personal Google sign-in only works with a Google Cloud project now (Google moved personal accounts to
    // Antigravity): without one, every request is refused, so it isn't ready, and the welcome says what to do instead
    const project = env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT_ID;
    if (sel === 'oauth-personal' || (!sel && creds))
      return {
        loggedIn: creds && !!project,
        method: project ? 'Google Cloud' : 'Google account',
        ...(creds && !project ? { personal: true } : {}),
      };
    if (sel)
      return {
        loggedIn: true,
        method:
          sel === 'vertex-ai' || sel === 'compute-default-credentials' ? 'Google Cloud' : 'API key',
      };
    return { loggedIn: false };
  },
  build({ name, sysFile, prompt, files }) {
    return {
      args: [
        '--output-format',
        'stream-json',
        '--model',
        name,
        '--approval-mode',
        'default',
        '--admin-policy',
        files.geminiPolicy,
        '--extensions',
        'none',
        '--allowed-mcp-server-names',
        'bento-none',
        '--skip-trust',
      ],
      stdin: prompt,
      env: { GEMINI_SYSTEM_MD: sysFile },
    };
  },
  parse(o, s) {
    if (o.type === 'message' && o.role === 'assistant' && typeof o.content === 'string')
      s.text(o.content);
    else if (o.type === 'result') {
      const st = o.stats || {};
      if (st.input_tokens != null || st.output_tokens != null)
        s.tokens(st.input_tokens || 0, st.output_tokens || 0);
      if (o.status === 'error') s.error(o.error?.message || 'Gemini error');
    } else if (o.type === 'error' && o.severity === 'error') s.error(o.message || 'Gemini error');
  },
};

// ---------------------------------------------------------------- GitHub Copilot CLI
// Copilot keeps every run as a session in its history and loads plugins and tool servers from its home folder. With a
// GitHub sign-in to lend it (the GitHub CLI's own token, which Copilot accepts), Bento gives it a home folder of its
// own, so lessons never show up in the person's Copilot history. Either way it gets no tools at all: only tools named
// in --available-tools exist, and the one name given isn't a tool.
const copilot = {
  compat: {
    help: ['--help'],
    flags: [
      '--output-format',
      '--stream',
      '--available-tools',
      '--disable-builtin-mcps',
      '--no-custom-instructions',
      '--no-ask-user',
      '--model',
    ],
  },
  version: (out) => (out.match(/\d+\.\d+\.\d+/) || [''])[0],
  async auth({ env, ghToken }) {
    if (env.COPILOT_GITHUB_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN)
      return { loggedIn: true, method: 'GitHub token' };
    if (await ghToken()) return { loggedIn: true, method: 'GitHub' };
    // its own sign-in (copilot login) is in the Keychain; the config only says who
    try {
      const t = (
        await fs.promises.readFile(
          path.join(env.COPILOT_HOME || path.join(os.homedir(), '.copilot'), 'config.json'),
          'utf8',
        )
      ).replace(/^\s*\/\/.*$/gm, '');
      const j = JSON.parse(t);
      if ((j.logged_in_users || j.loggedInUsers || []).length || j.last_logged_in_user)
        return { loggedIn: true, method: 'Copilot' };
    } catch {}
    return { loggedIn: false };
  },
  build({ name, system, prompt, files, token }) {
    const env = { COPILOT_ALLOW_ALL: undefined }; // a personal "allow everything" must never apply here
    if (token) {
      env.GH_TOKEN = token;
      env.COPILOT_HOME = files.copilotHome;
    }
    return {
      // the request goes in on standard input (Copilot reads it there when no -p is given): never on the command line,
      // where other programs could read it, Windows would refuse its line breaks and long requests wouldn't fit
      args: [
        '--output-format',
        'json',
        '--stream',
        'on',
        '--model',
        name,
        '--available-tools',
        'bento-text-only',
        '--disable-builtin-mcps',
        '--no-custom-instructions',
        '--no-ask-user',
        '--no-auto-update',
        '--disallow-temp-dir',
      ],
      stdin: `${system}\n\n---\n\n${prompt}`,
      env,
    };
  },
  parse(o, s) {
    const d = o.data || {};
    if (o.type === 'assistant.message_delta' && d.deltaContent) {
      s.seen(d.messageId);
      s.text(d.deltaContent);
    } else if (o.type === 'assistant.message' && d.content && !s.seen(d.messageId, true)) {
      if (s.full() && !s.full().endsWith('\n')) s.text('\n');
      s.text(d.content);
    } else if (o.type === 'assistant.reasoning_delta' && d.deltaContent) s.think(d.deltaContent);
    else if (o.type === 'session.usage_checkpoint' && d.totalPremiumRequests != null)
      s.requests(d.totalPremiumRequests);
    else if (/error/i.test(o.type) && (d.message || d.error))
      s.error(String(d.message || d.error?.message || d.error));
  },
  // the monthly allowance, from GitHub (the same numbers GitHub shows in its own apps); costs nothing
  async limits({ ghApi }) {
    const j = await ghApi('/copilot_internal/user');
    if (!j) return null;
    const q = j.quota_snapshots || {};
    const pick =
      q.premium_interactions?.entitlement > 0 || q.premium_interactions?.unlimited
        ? q.premium_interactions
        : q.chat;
    const free = /free/i.test(j.access_type_sku || '');
    const plan = free
      ? 'Free'
      : /pro_plus|proplus/i.test(j.access_type_sku || '')
        ? 'Pro+'
        : j.copilot_plan === 'business'
          ? 'Business'
          : j.copilot_plan === 'enterprise'
            ? 'Enterprise'
            : 'Pro';
    if (!pick) return { plan, windows: [] };
    if (pick.unlimited)
      return { plan, windows: [{ key: 'month', label: 'this month', used: 0, unlimited: true }] };
    const of = pick.entitlement || 0,
      left = Math.max(0, pick.remaining ?? 0),
      n = Math.max(0, of - left);
    return {
      plan,
      windows: [
        {
          key: 'month',
          label: 'this month',
          used: of ? clamp((n / of) * 100) : null,
          n,
          of,
          unit: 'requests',
          resetsAt: j.quota_reset_date ? Date.parse(j.quota_reset_date) : null,
          warn: of > 0 && n / of >= 0.8,
          out: of > 0 && left === 0,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- Antigravity (Google AI Pro, students' free plan)
// Google moved personal Gemini plans from the Gemini CLI to Antigravity's CLI (agy). It's an agent with many tools
// (commands, files, a browser, web search, sub-agents), and none of them can be switched off for one run. So Bento
// keeps it a writer two ways:
//   1. Antigravity's own rules deny every kind of tool it lets you name: commands, reading and writing files, tool
//      servers, opening, running or downloading web addresses; nothing outside an empty work folder; the terminal
//      sandboxed. Only rule kinds Antigravity accepts are used: one it doesn't know makes it drop the whole list.
//   2. Bento watches the stream and stops the run the moment the model reaches for any tool at all (web search and
//      sub-agents included). A lesson never needs one, so that's always a mistake, never a lesson.
// Its sign-in lives in your own Antigravity folder, so Bento can't give it a folder of its own, and its runs appear in
// your Antigravity history. Model names like "flash" stand for the newest matching model it offers (`agy models`).
const AGY_DENY = [
  'command(*)',
  'write_file(*)',
  'read_file(*)',
  'mcp(*)',
  'read_url(*)',
  'execute_url(*)',
  'download_url(*)',
];
const AGY_SETTINGS = {
  toolPermission: 'request-review',
  permissions: { allow: [], ask: [], deny: AGY_DENY },
  allowNonWorkspaceAccess: false,
  enableTerminalSandbox: true,
};
const AGY_ALIAS = {
  flash: /^gemini-[\d.]+-flash-medium$/,
  'flash-high': /^gemini-[\d.]+-flash-high$/,
  'flash-low': /^gemini-[\d.]+-flash-low$/,
  claude: /^claude-sonnet-[\d-]+/,
};
let agyModels = null,
  agyAt = 0; // what `agy models` offers this account, read when needed (it asks no model)
const versionOf = (id) => (id.match(/\d+(?:[.-]\d+)*/) || ['0'])[0].split(/[.-]/).map(Number);
const newer = (a, b) => {
  const x = versionOf(a),
    y = versionOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};
function agyModel(name) {
  if (AGY_ALIAS[name])
    return (agyModels || []).filter((m) => AGY_ALIAS[name].test(m)).sort(newer)[0] || null;
  return (agyModels || []).includes(name) ? name : null; // a model it offers, named exactly
}
const antigravity = {
  compat: {
    help: ['--help'],
    flags: [
      '--print',
      '--output-format',
      '--input-format',
      '--model',
      '--settings',
      '--disable-slash-commands',
    ],
  },
  version: (out) => (out.match(/\d+\.\d+\.\d+/) || [''])[0],
  // signed in = it can list this account's models (no model is asked)
  async auth({ run }) {
    const r = await run(['models'], 25000);
    const ids = r.ok
      ? r.out
          .split('\n')
          .map((l) => l.split('\t')[0].trim())
          .filter((x) => /^[a-z][\w.-]+$/.test(x))
      : [];
    if (ids.length) {
      agyModels = ids;
      agyAt = Date.now();
    }
    return ids.length
      ? { loggedIn: true, method: 'Google account', models: ids }
      : { loggedIn: false };
  },
  async prepare(ctx) {
    if (!agyModels || Date.now() - agyAt > 600000) await antigravity.auth(ctx);
  },
  build({ name, system, prompt }) {
    const model = agyModel(name);
    return {
      args: [
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--disable-slash-commands',
        '--settings',
        JSON.stringify(AGY_SETTINGS),
        ...(model ? ['--model', model] : []),
        '-p=',
      ],
      stdin:
        JSON.stringify({
          event: 'user',
          message: {
            content: `${system}\n\n---\n\n${prompt}\n\n(Answer directly in the required format. Do not use any tools: no commands, files, browser, web search or subagents.)`,
          },
        }) + '\n',
      noModel: !model && !!AGY_ALIAS[name], // asked for "flash" but this account offers none: say so plainly
    };
  },
  parse(o, s) {
    if (o.event === 'step_update') {
      const u = o.step_update || {};
      if (u.step_type === 'tool' || u.tool_name)
        return s.abort(
          `Gemini (Antigravity) reached for a tool (${u.tool_name || 'unknown'}), so Bento stopped it: lessons never need tools. Try again, or switch model.`,
        );
      if (u.step_type === 'agent_response' && typeof u.text_delta === 'string')
        s.text(u.text_delta);
    } else if (o.event === 'result') {
      const r = o.result || {};
      if (r.usage)
        s.tokens(
          (r.usage.input_tokens || 0) + (r.usage.cache_read_tokens || 0),
          (r.usage.output_tokens || 0) + (r.usage.thinking_tokens || 0),
        );
      if (r.status && r.status !== 'SUCCESS') s.error(r.error || 'Antigravity error');
      else if (!s.full() && r.response) s.text(r.response);
    }
  },
};

const ADAPTERS = { claude, codex, antigravity, gemini, copilot };

// Turn a CLI's error into something a learner can act on, in its own words for each AI
function humanize(id, msg) {
  const P = BY[id] || BY.claude;
  const who = label(P.id);
  const m = String(msg || '');
  if (id === 'antigravity' && /please sign in|not logged in|sign in to/i.test(m))
    return `Gemini (Antigravity) isn’t signed in on this Mac. Open Terminal and run \`agy\` to sign in with your Google account, then try again.`;
  if (
    id === 'antigravity' &&
    /unknown setting|took .* as its prompt|flag provided but not defined/i.test(m)
  )
    return `Antigravity on this Mac is a version Bento can’t talk to yet. Update it in Terminal (\`agy update\`), then try again.`;
  if (
    id === 'gemini' &&
    /no longer supported for Gemini Code Assist for individuals|migrate to the Antigravity/i.test(m)
  )
    return `Google no longer lets personal accounts use the Gemini CLI. Use Gemini through Antigravity instead (choose it in the bottom-left), or give the Gemini CLI an API key.`;
  if (
    id === 'gemini' &&
    /set an auth method|not logged in|login required|unauthori[sz]ed|\b401\b|authentication/i.test(
      m,
    )
  )
    return `The Gemini CLI isn’t set up with a key. Give it a Gemini API key (free from Google AI Studio), or use Gemini through Antigravity instead (bottom-left).`;
  // Gemini's account setup (before any lesson): a school or work account needing a Cloud project, or Google's own reason
  if (id === 'gemini' && /GOOGLE_CLOUD_PROJECT/.test(m))
    return `This Google account can’t use Gemini on its own (school and work accounts often need a Google Cloud project). Sign in to Gemini with a personal Google account: run \`gemini\` in Terminal and choose “Sign in with Google”.`;
  if (id === 'gemini' && /IneligibleTier|not eligible|ineligible/i.test(m))
    return `Google says this account can’t use Gemini here yet: ${m.replace(/^.*?(IneligibleTierError:?\s*)?/i, '').slice(0, 200)}`;
  if (
    id === 'gemini' &&
    /onboardUser|Error authenticating/i.test(m) &&
    /exhausted|429|quota/i.test(m)
  )
    return `Google is still setting up Gemini for this account and asked Bento to wait. Try again in a few minutes.`;
  if (
    /usage limit|rate.?limit|quota|too many requests|\b429\b|limit reached|exceeded|resource.?exhausted/i.test(
      m,
    )
  )
    return `${who} says you’ve hit your plan’s usage limit for now. Try again later, or switch to another AI in the bottom-left.`;
  if (
    /no (active )?copilot|copilot (is )?not enabled|not authorized to use copilot|access to copilot/i.test(
      m,
    )
  )
    return `This GitHub account doesn’t have Copilot turned on yet. Turn on Copilot Free at github.com/settings/copilot, then try again.`;
  if (
    /not logged in|please run \/login|login required|unauthori[sz]ed|\b401\b|invalid api key|authentication|set an auth method|sign in/i.test(
      m,
    )
  )
    return `${who} isn’t signed in on this Mac. Open Terminal and run \`${P.signIn}\` to sign in, then try again.`;
  // an update renamed or dropped an option Bento passes: say what to do, not the raw parser error
  if (
    /unknown option|unexpected argument|unrecognized (option|argument)|unknown argument|invalid value for '--|unknown feature flag/i.test(
      m,
    )
  )
    return `${who} on this Mac is a version Bento can’t talk to yet. Update it in Terminal (\`${P.update}\`), then try again.`;
  if (/ENOENT|not found|command not found/i.test(m))
    return `${who} isn’t installed. Open Settings → Connections to see how to install it.`;
  if (/network|ENOTFOUND|ECONNRESET|ETIMEDOUT|getaddrinfo/i.test(m))
    return `Couldn’t reach ${who}. Check your internet connection and try again.`;
  return m.length > 300 ? m.slice(0, 300) + '…' : m;
}

// Files the adapters need, made once: Gemini's deny-every-tool policy, and Copilot's own home folder for Bento
function setupFiles(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const geminiPolicy = path.join(dir, 'gemini-text-only.toml');
  try {
    if (!fs.existsSync(geminiPolicy) || fs.readFileSync(geminiPolicy, 'utf8') !== GEMINI_POLICY)
      fs.writeFileSync(geminiPolicy, GEMINI_POLICY);
  } catch {}
  const copilotHome = path.join(dir, 'copilot-home');
  try {
    fs.mkdirSync(copilotHome, { recursive: true });
  } catch {}
  return { geminiPolicy, copilotHome };
}
// the same, without blocking (what the app uses)
async function setupFilesAsync(dir) {
  const fsp = fs.promises;
  await fsp.mkdir(dir, { recursive: true });
  const geminiPolicy = path.join(dir, 'gemini-text-only.toml');
  if ((await fsp.readFile(geminiPolicy, 'utf8').catch(() => null)) !== GEMINI_POLICY)
    await fsp.writeFile(geminiPolicy, GEMINI_POLICY).catch(() => {});
  const copilotHome = path.join(dir, 'copilot-home');
  await fsp.mkdir(copilotHome, { recursive: true }).catch(() => {});
  return { geminiPolicy, copilotHome };
}

module.exports = {
  CAT,
  BY,
  IDS,
  ADAPTERS,
  label,
  parseModel,
  fastOf,
  missingFlags,
  humanize,
  setupFiles,
  setupFilesAsync,
  claudeLimits,
  GEMINI_POLICY,
  CODEX_OFF,
  AGY_DENY,
  AGY_SETTINGS,
  agyModel,
  _resetCodexFeatures: (s) => {
    codexFeatures = s ? new Set(s) : null;
  },
  _setAgyModels: (m) => {
    agyModels = m;
    agyAt = Date.now();
  },
};
