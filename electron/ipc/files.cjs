'use strict';
// lesson web pages: keep the last few, each with a tiny script that reports console output to Bento
const path = require('node:path');
const fsp = require('node:fs').promises;
const { app, ipcMain, dialog, shell } = require('electron');
const { execFile } = require('node:child_process');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerFiles(ctx) {
  const { MAC, WIN, openOutside, optStr, refuse, sizeOf, str, work } = ctx;
  const PLAY = new Map();
  const PLAY_SHIM = `<script>(function(){var send=function(k,a){try{parent.postMessage({bentoPlay:1,k:k,s:Array.prototype.map.call(a,function(x){try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ')},'*')}catch(e){}};['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});window.addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});var last=null;document.addEventListener('mouseover',function(e){var el=e.target.closest&&e.target.closest('[data-bl]');if(el===last)return;if(last)last.style.outline=last.__o||'';last=el;if(el){el.__o=el.style.outline;el.style.outline='2px solid rgba(124,92,255,.7)';try{parent.postMessage({bentoPlay:1,k:'hover',line:+el.getAttribute('data-bl')},'*')}catch(x){}}},true);document.addEventListener('mouseleave',function(){if(last){last.style.outline=last.__o||'';last=null}try{parent.postMessage({bentoPlay:1,k:'hover',line:0},'*')}catch(x){}});})();<\/script>`;
  ipcMain.handle('play:put', (_e, html, key) => {
    html = str(html, 2_000_000);
    key = typeof key === 'string' ? key : '';
    // one stable origin per lesson, so the page's localStorage survives re-runs ("remember my tasks")
    const id = /^[a-z0-9-]{3,40}$/i.test(key)
      ? `l-${key.toLowerCase()}`
      : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const doc = html.slice(0, 400000);
    PLAY.set(
      id,
      /<head[^>]*>/i.test(doc)
        ? doc.replace(/<head[^>]*>/i, (m) => m + PLAY_SHIM)
        : PLAY_SHIM + doc,
    );
    while (PLAY.size > 20) PLAY.delete(PLAY.keys().next().value);
    return id;
  });
  ipcMain.handle('lesson:export', async (_e, lesson) => {
    if (!lesson || typeof lesson !== 'object' || sizeOf(lesson) > 5_000_000) refuse();
    const safe =
      String(lesson?.title || 'lesson')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .slice(0, 60) || 'lesson';
    const r = await dialog.showSaveDialog(ctx.win, {
      defaultPath: path.join(app.getPath('desktop'), `${safe}.bento`),
      filters: [{ name: 'Bento lesson', extensions: ['bento'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fsp
      .writeFile(
        r.filePath,
        JSON.stringify({ bento: 1, exported: new Date().toISOString(), lesson }, null, 1),
      )
      .catch(saveError);
    return r.filePath;
  });
  // what went wrong writing a file you asked for, in plain words
  function saveError(e) {
    throw new Error(
      e?.code === 'ENOSPC'
        ? 'Your disk is full. Free up some space and try again.'
        : e?.code === 'EACCES' || e?.code === 'EPERM' || e?.code === 'EROFS'
          ? 'Bento isn’t allowed to save there. Choose another place.'
          : 'Couldn’t save the file.',
    );
  }
  // Save a lesson's web page as a real file you can open in any browser (or send to a friend).
  ipcMain.handle('web:save', async (_e, html, title) => {
    html = str(html, 5_000_000);
    title = optStr(title, 300);
    const dir = path.join(app.getPath('desktop'), 'Bento pages');
    await fsp.mkdir(dir, { recursive: true }).catch(saveError);
    const base =
      (title || 'my page')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .slice(0, 50) || 'my page';
    let file = path.join(dir, `${base}.html`);
    let n = 2;
    while (
      await fsp.access(file).then(
        () => true,
        () => false,
      )
    )
      file = path.join(dir, `${base} ${n++}.html`);
    await fsp.writeFile(file, html, { flag: 'wx' }).catch(saveError);
    shell.showItemInFolder(file);
    return file;
  });
  // How much space downloaded repos take, and a way to clear them (the Atlas notes stay cached).
  ipcMain.handle('repos:usage', async () => {
    const es = await fsp.readdir(ctx.REPOS).catch(() => []);
    const sizes = await Promise.all(es.map((e) => work('dirSize', [path.join(ctx.REPOS, e)])));
    return { bytes: sizes.reduce((a, b) => a + b, 0), count: es.length };
  });
  ipcMain.handle('repos:clear', async () => {
    await work('remove', [ctx.REPOS]).catch(() => {});
    await fsp.mkdir(ctx.REPOS, { recursive: true }).catch(() => {});
    return true;
  });
  ipcMain.handle('open:data', () => shell.openPath(app.getPath('userData')));
  // the welcome's "Open Terminal": to paste an install command (Bento never runs installers itself)
  ipcMain.handle('open:terminal', () =>
    MAC
      ? shell.openPath('/System/Applications/Utilities/Terminal.app')
      : WIN
        ? new Promise((res) =>
            execFile(
              'powershell.exe',
              ['-NoProfile', '-Command', 'Start-Process powershell.exe'],
              { windowsHide: true },
              (e) => res(!e),
            ),
          )
        : false,
  );
  ipcMain.handle('open:external', (_e, url) => openOutside(str(url, 4000)));
  return {
    PLAY,
    saveError,
  };
};
