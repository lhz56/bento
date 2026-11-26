'use strict';
// What used your AI
// Every request is noted (what for, which model, how long, tokens: real counts when the CLI reports them),
// so Settings and the sidebar can show where your plan's usage goes. Quick answers are also kept for 14 days,
// so asking the same thing again costs nothing.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs').promises;
const providers = require('../providers.cjs');
const { app, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { SYSTEM, QUICK_SYSTEM, ATLAS_SYSTEM, SITE_SYSTEM } = require('../prompts.cjs');
const { writeSafeAsync } = require('../safewrite.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerAsk(ctx) {
  const {
    AI_FILES,
    ENV,
    FAKE_LIMIT,
    WORKDIR,
    aiCtx,
    envReady,
    ghToken,
    isHidden,
    launch,
    optStr,
    readJson,
    refreshLimits,
    saveLimits,
    str,
    viaFake,
    which,
    withVoice,
  } = ctx;
  const USAGE = path.join(app.getPath('userData'), 'usage.json');
  const QCACHE = path.join(app.getPath('userData'), 'quick-cache.json');
  let usageLog = [],
    qcache = {};
  const usageReady = Promise.all([
    readJson(USAGE, []).then((v) => {
      usageLog = Array.isArray(v) ? v : [];
    }),
    readJson(QCACHE, {}).then((v) => {
      qcache = v && typeof v === 'object' ? v : {};
    }),
  ]);
  const usage = () => usageLog;
  let usageTimer = null;
  function noteUsage(e) {
    usageReady.then(() => {
      const u = usage();
      u.push(e);
      if (u.length > 3000) u.splice(0, u.length - 3000);
      clearTimeout(usageTimer);
      usageTimer = setTimeout(() => {
        writeSafeAsync(USAGE, JSON.stringify(u));
      }, 800);
    });
  }
  const quickCache = () => qcache;
  let qcTimer = null;
  function saveQuick() {
    clearTimeout(qcTimer);
    qcTimer = setTimeout(() => {
      try {
        const c = quickCache();
        const keys = Object.keys(c);
        if (keys.length > 800)
          keys
            .sort((a, b) => c[a].at - c[b].at)
            .slice(0, keys.length - 800)
            .forEach((k) => delete c[k]);
        writeSafeAsync(QCACHE, JSON.stringify(c));
      } catch {}
    }, 800);
  }
  // a short human label for a quick request, from what it asks
  function labelOf(prompt) {
    const p = String(prompt).slice(0, 400);
    /** @type {Array<[RegExp, string]>} */
    const purposes = [
      [/Translate these short labels/, 'translating the menus'],
      [/checking a beginner coding lesson/, 'checking a lesson'],
      [/interviewer/i, 'interview practice'],
      [/is stuck on this/, 'a stuck hint'],
      [/SQL query/, 'explaining SQL'],
      [/first open-source contribution/, 'planning an issue'],
      [/explained it back|explain(ed)? it back/i, 'explain it back'],
      [/plain English|pseudo/i, 'plain words'],
      [/error/i, 'explaining an error'],
      [/learning path|stops/i, 'designing a path'],
      [/tutoring/i, 'answering a question'],
    ];
    return (purposes.find(([r]) => r.test(p)) || [null, 'a quick answer'])[1];
  }

  // What a CLI printed when it failed, minus stack traces and dumped request details: the lines that say what went wrong
  const errorLines = (err) => {
    const ls = String(err)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^at |^\{|^\}|^[\w$]+: [[{'"\w]|^[\]}),]+$/.test(l));
    const said = ls.filter((l) =>
      /error|fail|denied|exhausted|quota|limit|not |unable|requires|invalid|unknown|eligib/i.test(
        l,
      ),
    );
    return (said.length ? said : ls).slice(-3).join(' ');
  };
  // Runs one request on the chosen AI and streams its text to onText. Returns { promise, kill }.
  function runModel(model, system, prompt, onText, onThink) {
    const purpose =
      system === QUICK_SYSTEM
        ? labelOf(prompt)
        : system === ATLAS_SYSTEM
          ? 'reading a project'
          : system === SITE_SYSTEM
            ? 'reading a website'
            : 'writing a lesson';
    const { prov, name, id: modelId } = providers.parseModel(model);
    const adapter = providers.ADAPTERS[prov],
      bin = providers.BY[prov].bin;
    // a hidden CLI (tests, demos of a brand-new Mac) is never started: hiding it must not quietly spend your plan
    if (isHidden(bin))
      return {
        promise: Promise.reject(new Error(providers.humanize(prov, 'ENOENT'))),
        kill: () => {},
      };
    if (FAKE_LIMIT && prov === FAKE_LIMIT)
      return {
        promise: Promise.reject(new Error(providers.humanize(prov, 'usage limit reached'))),
        kill: () => {},
      };
    const t0 = Date.now();
    let child = null,
      killed = false,
      sysFile = null;
    const promise = (async () => {
      await envReady;
      await adapter.prepare?.(aiCtx(prov));
      // instructions go in a private temporary file and the request on standard input, never on the command line
      const sys = withVoice(system);
      sysFile = path.join(WORKDIR, `instructions-${crypto.randomBytes(6).toString('hex')}.md`);
      await fsp.mkdir(WORKDIR, { recursive: true });
      await fsp.writeFile(sysFile, sys, { mode: 0o600 });
      const token =
        prov === 'copilot' && !(ENV.COPILOT_GITHUB_TOKEN || ENV.GH_TOKEN || ENV.GITHUB_TOKEN)
          ? await ghToken()
          : null;
      const b = adapter.build({
        name,
        system: sys,
        prompt,
        sysFile,
        files: await AI_FILES(),
        token,
      });
      if (killed) throw new Error('Stopped.');
      if (b.noModel)
        throw new Error(
          `${providers.label(prov)} doesn’t offer ${modelId.split(':')[1]} on this account right now. Choose another model in the bottom-left.`,
        );
      const env = { ...ENV, ...b.env };
      for (const [k, v] of Object.entries(b.env || {})) if (v === undefined) delete env[k];
      const [runCmd, runArgs, runOpts] = await launch(...viaFake(bin, b.args));
      if (killed) throw new Error('Stopped.');
      return new Promise((resolve, reject) => {
        child = spawn(runCmd, runArgs, {
          cwd: WORKDIR,
          env,
          stdio: [b.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
          ...runOpts,
        }); // no open stdin otherwise: some CLIs wait on an open pipe
        if (b.stdin != null) {
          child.stdin.on('error', () => {});
          child.stdin.end(b.stdin);
        }
        let buf = '',
          full = '',
          err = '',
          tokens = null,
          requests = null,
          limits = null,
          aborted = null;
        const seen = new Set();
        const sink = {
          text: (t) => {
            full += t;
            onText?.(t);
          },
          think: (t, n) => onThink?.(t, n),
          error: (m) => {
            err = m;
          },
          tokens: (i, o) => {
            tokens = { in: i, out: o };
          },
          requests: (n) => {
            requests = n;
          },
          limits: (planLimits) => {
            limits = planLimits;
          },
          full: () => full,
          seen: (id, check) => {
            if (check) return seen.has(id);
            seen.add(id);
            return false;
          },
          // the AI did something a writer never does (reached for a tool): stop it now, and say why
          abort: (m) => {
            if (aborted) return;
            aborted = m;
            try {
              child.kill('SIGTERM');
            } catch {}
          },
        };
        let last = Date.now(),
          stalled = false;
        const quietLimit = providers.BY[prov].slow ? 360000 : 150000; // Codex says nothing until it's done; the others stream constantly
        const dog = setInterval(() => {
          if (Date.now() - last > quietLimit) {
            stalled = true;
            clearInterval(dog);
            try {
              child.kill('SIGTERM');
            } catch {}
          }
        }, 5000);
        child.stdout.on('data', (d) => {
          last = Date.now();
          buf += d.toString();
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            let o;
            try {
              o = JSON.parse(line);
            } catch {
              continue;
            }
            adapter.parse(o, sink);
          }
        });
        child.stderr.on('data', (d) => {
          last = Date.now();
          err += d.toString();
        });
        child.on('error', (e) => {
          clearInterval(dog);
          reject(new Error(providers.humanize(prov, `Couldn't start ${bin}: ${e.message}`)));
        });
        child.on('close', (code) => {
          clearInterval(dog);
          noteUsage({
            at: t0,
            what: purpose,
            model: modelId,
            prov,
            ms: Date.now() - t0,
            ok: !!full,
            in: tokens?.in ?? Math.round((system.length + String(prompt).length) / 4),
            out: tokens?.out ?? Math.round(full.length / 4),
            est: !tokens,
            ...(requests != null ? { requests } : {}),
          });
          if (limits) saveLimits(prov, limits);
          if (full && adapter.limits) setTimeout(() => refreshLimits(prov).catch(() => {}), 1500); // the meter moves after each answer
          if (aborted) return reject(new Error(aborted));
          if (stalled && !full)
            return reject(
              new Error(
                `${providers.label(prov)} went quiet for too long, so Bento stopped waiting. Try again, or switch model.`,
              ),
            );
          if (full) resolve(full);
          else
            reject(
              new Error(providers.humanize(prov, errorLines(err) || `${bin} exited with ${code}`)),
            );
        });
      });
    })().finally(() => {
      if (sysFile) fs.rm(sysFile, { force: true }, () => {});
    });
    return {
      promise,
      kill: () => {
        killed = true;
        try {
          child?.kill('SIGTERM');
        } catch {}
      },
    };
  }

  const running = new Map();
  const cancelled = new Set();
  ipcMain.on('ask:start', async (e, id, req) => {
    const wc = e.sender;
    let model, prompt, system;
    try {
      id = str(id, 64);
      model = str(req?.model, 200);
      prompt = str(req?.prompt, 400_000);
      system = optStr(req?.system, 20);
    } catch (err) {
      if (typeof id === 'string' && !wc.isDestroyed())
        wc.send('ask:error', id.slice(0, 64), err.message);
      return;
    }
    await envReady; // only waits in the first seconds after launch, while your shell's PATH is read
    if (cancelled.delete(id)) return;
    // thinking: some CLIs share the text, others only that it's happening (plus a rough token count)
    let thinkBuf = '',
      thinkT = 0,
      ticks = 0,
      est = 0;
    const r = runModel(
      model,
      system === 'atlas' ? ATLAS_SYSTEM : system === 'site' ? SITE_SYSTEM : SYSTEM,
      prompt,
      (t) => {
        if (!wc.isDestroyed()) wc.send('ask:chunk', id, t);
      },
      (t, e) => {
        thinkBuf = (thinkBuf + t).slice(-400);
        ticks++;
        est += e || 0;
        const now = Date.now();
        if (now - thinkT > 250 && !wc.isDestroyed()) {
          thinkT = now;
          wc.send('ask:think', id, { text: thinkBuf, n: Math.max(ticks, est) });
        }
      },
    );
    running.set(id, r);
    r.promise
      .then(() => !wc.isDestroyed() && wc.send('ask:done', id))
      .catch((err) => !wc.isDestroyed() && wc.send('ask:error', id, err.message))
      .finally(() => running.delete(id));
  });
  ipcMain.on('ask:cancel', (_e, id) => {
    if (typeof id !== 'string' || id.length > 64) return;
    const r = running.get(id);
    if (r) {
      r.kill();
      running.delete(id);
    } else {
      cancelled.add(id);
      setTimeout(() => cancelled.delete(id), 10000);
    }
  });
  // quitting mid-lesson shouldn't leave AI processes running in the background
  app.on('will-quit', () => {
    for (const r of running.values()) r.kill();
    running.clear();
  });

  // small one-shot calls (token cards, pseudocode refresh, translations)
  const ACCOUNT_TROUBLE =
    /usage limit|isn’t signed in|isn’t installed|can’t talk to yet|doesn’t have Copilot|no longer lets personal|isn’t set up with a key|doesn’t offer|can’t use Gemini/;
  ipcMain.handle('quick', async (_e, req) => {
    const model = str(req?.model, 200),
      prompt = str(req?.prompt, 400_000);
    await envReady;
    await usageReady;
    // quick calls use the fast model of the same AI
    const fast = providers.fastOf(model);
    // the same question (same model, same language) within 14 days: answer from the saved copy
    const key = crypto.createHash('sha1').update(`${fast}\n${ctx.VOICE}\n${prompt}`).digest('hex');
    const hit = quickCache()[key];
    if (hit && Date.now() - hit.at < 14 * 864e5) {
      noteUsage({
        at: Date.now(),
        what: labelOf(prompt),
        model: fast,
        prov: providers.parseModel(fast).prov,
        ms: 0,
        ok: true,
        in: 0,
        out: 0,
        saved: Math.round(String(prompt).length / 4) + Math.round(hit.a.length / 4),
      });
      return hit.a;
    }
    const keep = (a) => {
      quickCache()[key] = { a, at: Date.now() };
      saveQuick();
      return a;
    };
    try {
      return keep(await runModel(fast, QUICK_SYSTEM, prompt).promise);
    } catch (err) {
      // this AI can't answer right now (limit, signed out, missing): with "Retry with another AI" on, try the next one you
      // have, in order, and say which one answered (its plan pays). Off, the answer is the honest error.
      if (!ctx.FALLBACK || !ACCOUNT_TROUBLE.test(err.message)) throw err;
      const mine = providers.parseModel(fast).prov;
      for (const id of providers.IDS.filter((x) => x !== mine)) {
        if (!(await which(providers.BY[id].bin))) continue;
        try {
          const a = keep(await runModel(providers.BY[id].fast, QUICK_SYSTEM, prompt).promise);
          _e.sender?.send?.('ai:fallback', {
            from: providers.label(mine),
            to: providers.label(id),
          });
          return a;
        } catch (e2) {
          if (!ACCOUNT_TROUBLE.test(e2.message)) throw err;
        }
      }
      throw err;
    }
  });
  // the last 7 days of AI use, for the sidebar meter and Settings, with each AI's share of today
  ipcMain.handle('usage:get', async () => {
    await usageReady;
    const u = usage();
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    const today = day(Date.now());
    const days = Array.from({ length: 7 }, (_, i) => day(Date.now() - (6 - i) * 864e5)).map(
      (d) => ({
        d,
        lessons: 0,
        quick: 0,
        other: 0,
        saved: 0,
        tokens: 0,
      }),
    );
    const by = {}; // today, per AI: requests and tokens
    for (const e of u) {
      const todayRow = days.find((x) => x.d === day(e.at));
      if (!todayRow) continue;
      if (e.saved) {
        todayRow.saved++;
        continue;
      }
      if (e.ok === false) continue; // it never got an answer (signed out, not installed, stopped): none of the plan was used
      if (e.what === 'writing a lesson') todayRow.lessons++;
      else if (/^reading/.test(e.what)) todayRow.other++;
      else todayRow.quick++;
      todayRow.tokens += (e.in || 0) + (e.out || 0);
      if (todayRow.d === today) {
        const k = e.prov || String(e.model || '').split(':')[0] || 'claude';
        const b = (by[k] ||= { n: 0, lessons: 0, tokens: 0 });
        b.n++;
        if (e.what === 'writing a lesson') b.lessons++;
        b.tokens += (e.in || 0) + (e.out || 0);
      }
    }
    const recent = u
      .slice(-14)
      .reverse()
      .map((e) => ({
        at: e.at,
        what: e.what,
        model: e.model,
        saved: !!e.saved,
        tokens: (e.in || 0) + (e.out || 0),
        est: !!e.est,
        ms: e.ms,
        ok: e.ok,
      }));
    return {
      days,
      today: days.find((x) => x.d === today),
      by,
      recent,
      savedAnswers: Object.keys(quickCache()).length,
    };
  });
  ipcMain.handle('usage:clearSaved', async () => {
    await usageReady;
    qcache = {};
    await fsp.rm(QCACHE, { force: true }).catch(() => {});
    return true;
  });
  return {
    running,
  };
};
