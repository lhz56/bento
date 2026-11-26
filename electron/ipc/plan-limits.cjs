'use strict';
// How much of each plan is used
// The last thing each AI said about its plan's limits, kept on disk so the meter has something to show at launch.
// Claude says it with every reply; Codex and Copilot can be asked any time for free; Gemini doesn't say, so Bento
// counts its own requests instead (usage:get).
const path = require('node:path');
const fsp = require('node:fs').promises;
const providers = require('../providers.cjs');
const { app, ipcMain } = require('electron');
const { writeSafeAsync } = require('../safewrite.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerPlanLimits(ctx) {
  const { HOOKS, aiCtx, which } = ctx;
  const LIMITS_FILE = path.join(app.getPath('userData'), 'plan-limits.json');
  let LIMITS = {},
    limitsTimer = null;
  // Bento's small files are read in the background as it starts, and every handler that needs one waits for it
  const readJson = (f, d) =>
    fsp
      .readFile(f, 'utf8')
      .then(JSON.parse)
      .catch(() => d);
  const limitsReady = readJson(LIMITS_FILE, {}).then((v) => {
    LIMITS = v && typeof v === 'object' ? v : {};
  });
  const limitsAll = () => LIMITS;
  function saveLimits(id, limits) {
    if (!limits) return;
    const all = limitsAll();
    all[id] = { ...all[id], ...limits, plan: limits.plan || all[id]?.plan || null, at: Date.now() };
    clearTimeout(limitsTimer);
    limitsTimer = setTimeout(() => writeSafeAsync(LIMITS_FILE, JSON.stringify(all)), 600);
    if (ctx.win && !ctx.win.isDestroyed()) ctx.win.webContents.send('limits', all);
    ctx.host?.broadcast('limits', [all]);
  }
  const limitsAsked = {};
  async function refreshLimits(only) {
    await limitsReady;
    await Promise.all(
      providers.IDS.filter(
        (id) =>
          (!only || id === only) &&
          providers.ADAPTERS[id].limits &&
          Date.now() - (limitsAsked[id] || 0) > 45000,
      ).map(async (id) => {
        if (!(await which(providers.BY[id].bin))) return;
        limitsAsked[id] = Date.now();
        try {
          saveLimits(id, await providers.ADAPTERS[id].limits(aiCtx(id)));
        } catch {}
      }),
    );
    return limitsAll();
  }
  ipcMain.handle('limits:get', async (_e, o) => {
    await limitsReady;
    return o?.refresh === true ? refreshLimits() : limitsAll();
  });

  // The learner's language for explanations (code stays in English so it runs everywhere).
  let VOICE = '';
  // "Retry with another AI" (Settings, off unless you turn it on): only then may an answer come from another AI's plan
  let FALLBACK = false;
  ipcMain.on('prefs', (_e, p) => {
    VOICE =
      typeof p?.voice === 'string' && /^[\p{L}\p{M} ()-]{2,30}$/u.test(p.voice) ? p.voice : '';
    FALLBACK = p?.fallback === true;
  });
  const withVoice = (system) =>
    VOICE && VOICE !== 'English'
      ? `${system}\n\nLANGUAGE: Write every human-readable string (titles, paragraphs, pseudocode, notes, labels, quiz, hints, terms, answers) in ${VOICE}. Keep code, identifiers, file paths and JSON keys exactly as they are, in English. Technical terms may keep their common English name with the ${VOICE} word next to it.`
      : system;

  // Streams text deltas to onText. Returns {promise, kill}.
  // BENTO_FAKE_LIMIT=claude makes that CLI answer "usage limit" (to test automatic routing to your other AI).
  const FAKE_LIMIT = HOOKS.fakeLimit;
  return {
    readJson,
    limitsReady,
    limitsAll,
    saveLimits,
    refreshLimits,
    get VOICE() {
      return VOICE;
    },
    set VOICE(v) {
      VOICE = v;
    },
    get FALLBACK() {
      return FALLBACK;
    },
    set FALLBACK(v) {
      FALLBACK = v;
    },
    withVoice,
    FAKE_LIMIT,
  };
};
