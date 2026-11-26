'use strict';
// Providers
// Each AI's adapter (finding it, checking it, running it as a writer only, reading its stream and its plan's limits)
// is in providers.cjs; the names and commands people see are in ai-catalog.json.
const path = require('node:path');
const fsp = require('node:fs').promises;
const logger = require('../log.cjs');
const { app, ipcMain, nativeTheme } = require('electron');
const { spawn, execFile } = require('node:child_process');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerConnections(ctx) {
  const { ENV, MAC, OFFSCREEN, TEST_BUILD, WIN, WORKDIR, envReady, launch, workdirReady } = ctx;
  const P = require('../providers.cjs');
  const AI_FILES = () => (aiFiles ??= P.setupFilesAsync(path.join(app.getPath('userData'), 'ai')));
  let aiFiles = null;
  // BENTO_PRETEND_MISSING=claude,codex,gemini,copilot,gh hides CLIs, to test what a brand-new user sees.
  const HIDDEN = new Set(
    String(process.env.BENTO_PRETEND_MISSING || '')
      .split(',')
      .filter(Boolean),
  );
  // BENTO_FAKE_AI=test/fixtures/fake-ai.mjs: tests stand in pretend CLIs that stream a canned lesson in each AI's own
  // format, so the whole ask → stream → run path is checked without using anyone's plan. BENTO_FAKE_AS says which AIs
  // are pretend (Claude by default). Only honoured in hidden test mode, and only by a test build or a copy run from source:
  // a release ignores it.
  // (testhooks.cjs decides; a release asked for them hides every AI rather than use your real ones)
  const HOOKS = require('../testhooks.cjs').testHooks({
    packaged: app.isPackaged,
    testBuild: TEST_BUILD,
    offscreen: OFFSCREEN,
    env: process.env,
  });
  const FAKE_AI = HOOKS.fakeAI ? path.resolve(HOOKS.fakeAI) : null;
  const FAKE_AS = new Set(HOOKS.fakeAs);
  if (HOOKS.hideAllAIs)
    logger.log(
      'BENTO_FAKE_AI is set, but this build doesn’t use pretend AIs: every AI is hidden, so none of your real ones runs',
    );
  // an AI can be named by its id ("antigravity") or its program ("agy")
  const idOfBin = (cmd) => P.IDS.find((id) => P.BY[id].bin === cmd) || cmd;
  const isHidden = (cmd) =>
    HIDDEN.has(cmd) ||
    HIDDEN.has(idOfBin(cmd)) ||
    (HOOKS.hideAllAIs && P.IDS.includes(idOfBin(cmd)));
  const isFake = (cmd) => !!FAKE_AI && (FAKE_AS.has(cmd) || FAKE_AS.has(idOfBin(cmd)));
  const viaFake = (cmd, args) =>
    isFake(cmd) ? ['node', [FAKE_AI, '--as', cmd, ...args]] : [cmd, args];
  async function which(cmd) {
    if (isHidden(cmd)) return null;
    if (isFake(cmd)) return FAKE_AI;
    await envReady;
    return new Promise((res) =>
      execFile(WIN ? 'where' : 'which', [cmd], { env: ENV, windowsHide: true }, (e, out) =>
        res(e ? null : String(out).split(/\r?\n/)[0].trim() || null),
      ),
    );
  }
  // Onboarding: find what the person already has. Nothing is installed or signed in for them.
  async function runQuiet(cmd, args, timeout = 8000) {
    await envReady;
    let c, a, o;
    try {
      [c, a, o] = await launch(...viaFake(cmd, args));
    } catch (e) {
      return { ok: false, out: '', err: e.message, timedOut: false };
    }
    return new Promise((res) =>
      execFile(c, a, { env: ENV, timeout, maxBuffer: 4 << 20, ...o }, (e, out, err) =>
        res({ ok: !e, out: String(out || ''), err: String(err || ''), timedOut: !!e?.killed }),
      ),
    );
  }
  // the GitHub CLI's sign-in, which Copilot accepts; read when needed, kept in memory for 10 minutes, never saved
  let ghTok = { v: null, at: 0 };
  async function ghToken() {
    if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) return null;
    if (Date.now() - ghTok.at < 600000) return ghTok.v;
    const r = await runQuiet('gh', ['auth', 'token'], 5000);
    const t = r.out.trim();
    ghTok = { v: r.ok && /^(gh[opsu]_|github_pat_)[\w-]+$/.test(t) ? t : null, at: Date.now() };
    return ghTok.v;
  }
  const ghApi = async (route) => {
    if (HIDDEN.has('gh') || process.env.BENTO_NO_GH) return null;
    const r = await runQuiet('gh', ['api', route], 8000);
    try {
      return r.ok ? JSON.parse(r.out) : null;
    } catch {
      return null;
    }
  };
  // a short JSON-RPC exchange with a CLI's own server mode (Codex's app server answers "how much of my plan is used"
  // without asking a model): send the messages, wait for the reply with the given id, then stop it
  async function spawnJson(cmd, args, messages, waitId, timeout = 12000) {
    await envReady;
    await workdirReady;
    if (isHidden(cmd)) return null;
    let c, a, o;
    try {
      [c, a, o] = await launch(...viaFake(cmd, args));
    } catch {
      return null;
    }
    return new Promise((res) => {
      let child;
      try {
        child = spawn(c, a, { cwd: WORKDIR, env: ENV, stdio: ['pipe', 'pipe', 'ignore'], ...o });
      } catch {
        return res(null);
      }
      const done = (v) => {
        clearTimeout(t);
        try {
          child.kill();
        } catch {}
        res(v);
      };
      const t = setTimeout(() => done(null), timeout);
      let buf = '';
      child.on('error', () => done(null));
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            const o = JSON.parse(line);
            if (o.id === waitId) done(o.result ?? null);
          } catch {}
        }
      });
      for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
    });
  }
  // a tool that didn't answer in time (a busy Mac, a cold start, five tools starting at once) is asked once more with
  // more patience: no answer isn't "not signed in"
  const runPatient = async (bin, args, t = 8000) => {
    const r = await runQuiet(bin, args, t);
    return r.timedOut ? runQuiet(bin, args, t * 3) : r;
  };
  const aiCtx = (id) => ({
    run: (args, t) => runPatient(P.BY[id].bin, args, t),
    env: ENV,
    ghToken,
    ghApi,
    spawnJson: (args, msgs, wait) => spawnJson(P.BY[id].bin, args, msgs, wait),
  });

  // what each AI tool says about itself: installed, a version Bento can talk to, signed in (and with which plan)
  async function scanConnections() {
    await ctx.limitsReady;
    const bins = [
      ...P.IDS.map((id) => P.BY[id].bin),
      'gh',
      'npm',
      'brew',
      ...(WIN ? ['winget'] : []),
    ];
    const at = Object.fromEntries(await Promise.all(bins.map(async (b) => [b, await which(b)])));
    // which installers this Mac already has, so the welcome only suggests commands that will work here
    /** @type {Record<string, any>} what is installed and signed in, per AI and tool */
    const r = {
      tools: { npm: !!at.npm, brew: !!at.brew, winget: !!at.winget },
      gh: { installed: !!at.gh },
    };
    await Promise.all(
      [
        ...P.IDS.map(async (id) => {
          const A = P.ADAPTERS[id],
            bin = P.BY[id].bin,
            x = (r[id] = /** @type {Record<string, any>} */ ({ installed: !!at[bin] }));
          if (!at[bin]) return;
          x.brew = /\/(Cellar|Caskroom)\//.test(await fsp.realpath(at[bin]).catch(() => at[bin])); // updates go the way it was installed
          const [v, h] = await Promise.all([
            runPatient(bin, ['--version']),
            runPatient(bin, A.compat.help),
          ]);
          x.version = A.version(v.out || '') || null;
          x.outdated = P.missingFlags(h, A.compat.flags);
          // a pretend CLI in tests only knows the commands real ones have; sign-in that's read from files is assumed
          Object.assign(
            x,
            isFake(bin) && !['claude', 'codex', 'antigravity'].includes(id)
              ? { loggedIn: true, method: 'test' }
              : await A.auth(aiCtx(id)),
          );
          const L = ctx.limitsAll()[id];
          if (L?.plan && !x.plan) x.plan = L.plan;
        }),
        at.gh &&
          (async () => {
            const a = await runQuiet('gh', ['api', 'user', '--jq', '.login']);
            r.gh.loggedIn = a.ok && !!a.out.trim();
            r.gh.user = a.out.trim() || null;
          })(),
      ].filter(Boolean),
    );
    ctx.refreshLimits().catch(() => {});
    return r;
  }
  let connectionScan;
  function scanOnce() {
    return (connectionScan ??= scanConnections().finally(() => {
      connectionScan = null;
    }));
  }
  ipcMain.handle('scan', scanOnce);
  ipcMain.handle('providers', async () => {
    const scan = await scanOnce();
    const ready = {},
      accounts = {};
    for (const id of P.IDS) {
      const state = scan[id];
      ready[id] = !!(state.installed && state.loggedIn && !state.outdated);
      accounts[id] = [state.method, state.plan].filter(Boolean).join(' · ');
    }
    return {
      ...ready,
      accounts,
      gh: scan.gh.loggedIn === true,
      dark: nativeTheme.shouldUseDarkColors,
    };
  });

  // One click from the welcome: run the install, sign-in or update command for an AI in Terminal, where the person
  // sees exactly what runs. Only commands from ai-catalog.json can be run this way.
  const wincmd = require('../wincmd.cjs');
  ipcMain.handle('ai:terminal', async (_e, id, action, tools = {}) => {
    if (!MAC && !WIN) return false;
    const p = wincmd.forPlatform(id === 'gh' ? P.CAT.github : P.BY[id]);
    if (!p || !['install', 'signIn', 'update'].includes(action)) return false;
    const cmd =
      action === 'install'
        ? (p.install.find((i) => !i.needs || tools[i.needs]) || {}).cmd
        : action === 'update'
          ? (tools.brewInstalled && p.updateBrew) || p.update
          : p.signIn;
    if (!cmd) return false;
    if (WIN) {
      /** @type {string} */ let c;
      /** @type {string[]} */ let a;
      try {
        [c, a] = wincmd.powershellWindow(cmd);
      } catch {
        return false;
      }
      return new Promise((res) => execFile(c, a, { windowsHide: true }, (e) => res(!e)));
    }
    const esc = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return new Promise((res) =>
      execFile(
        'osascript',
        [
          '-e',
          'tell application "Terminal" to activate',
          '-e',
          `tell application "Terminal" to do script "${esc}"`,
        ],
        (e) => res(!e),
      ),
    );
  });
  return {
    P,
    AI_FILES,
    HIDDEN,
    HOOKS,
    isHidden,
    viaFake,
    which,
    runQuiet,
    ghToken,
    aiCtx,
  };
};
