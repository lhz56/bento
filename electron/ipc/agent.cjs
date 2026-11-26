'use strict';
// Your own AI agent uses Bento (agent.cjs)
// Claude Code, Codex and other agents start `Bento --mcp`, which reaches this copy through a socket only your user can
// open. Each tool call goes to the window, which does it (App.jsx) and answers in words for the agent. Showing a lesson
// or pointing at lines brings Bento forward; looking and running don't.
const path = require('node:path');
const logger = require('../log.cjs');
const { app, ipcMain } = require('electron');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerAgent(ctx) {
  const { MAC, OFFSCREEN } = ctx;
  const agentApi = require('../agent.cjs');
  const AGENT_SOCK = agentApi.socketPath(app.getPath('userData'));
  const agentWaits = new Map();
  let agentSeq = 0,
    agentServer = null;
  ipcMain.on('agent:reply', (_e, id, r) => {
    const w = agentWaits.get(id);
    if (w) {
      agentWaits.delete(id);
      w(r && typeof r === 'object' ? r : { error: 'Bento couldn’t do that.' });
    }
  });
  function agentCall(tool, args, client) {
    if (!ctx.win || ctx.win.isDestroyed())
      return Promise.reject(
        new Error('Bento’s window is closed. Click Bento in the Dock, then try again.'),
      );
    if (['show_lesson', 'highlight_code'].includes(tool) && !OFFSCREEN) {
      if (ctx.win.isMinimized()) ctx.win.restore();
      ctx.win.show();
      if (MAC) app.focus({ steal: true });
      else ctx.win.focus();
    }
    const id = ++agentSeq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        agentWaits.delete(id);
        rej(new Error('Bento took too long to answer. Is a lesson still loading? Try again.'));
      }, 90_000);
      agentWaits.set(id, (r) => {
        clearTimeout(t);
        r.error ? rej(new Error(String(r.error))) : res(String(r.text ?? ''));
      });
      ctx.win.webContents.send('agent:call', id, tool, args, client);
    });
  }
  ipcMain.handle('agent:info', () => {
    // the command an agent runs to start Bento's tool server: this very app, with --mcp
    const cmd = app.isPackaged
      ? [process.execPath]
      : [process.execPath, path.resolve(__dirname, '../..')];
    return { cmd: [...cmd, '--mcp'], on: !!agentServer };
  });
  app.whenReady().then(() => {
    if (process.env.BENTO_NO_AGENT || ctx.secondCopy) return;
    try {
      agentServer = agentApi.serve({
        sock: AGENT_SOCK,
        call: agentCall,
        log: (...a) => logger.log(...a),
      });
    } catch (e) {
      logger.log('agent socket failed', e);
    }
  });
  app.on('will-quit', () => agentServer?.close());
};
