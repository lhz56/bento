'use strict';
// Your phone and iPad
// Off until you turn it on in Settings. Then this Mac serves Bento's page to the devices you pair (host.cjs) and does
// their work with your AIs, the way T3 Code's phone app works with your computer: nothing hosted, nothing extra to pay.
// What a device may ask for: everything Bento does for its page, except what only makes sense sitting at the Mac
// (Terminal, Finder, file dialogs, updates, backups); those tell the person to use the Mac.
const path = require('node:path');
const os = require('node:os');
const logger = require('../log.cjs');
const { app, ipcMain, dialog, powerSaveBlocker, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const { writeSafeAsync } = require('../safewrite.cjs');

/** @param {Record<string, any>} ctx what main.cjs shares with this module (see "const ctx" there) */
module.exports = function registerDevices(ctx) {
  const { BadInput, DIST, MAC, PLAY, RAW, TEST_BUILD, netProxy, readJson, runQuiet, str, which } =
    ctx;
  const REMOTE_CALLS = new Set([
    'providers',
    'scan',
    'limits:get',
    'usage:get',
    'usage:clearSaved',
    'quick',
    'store:get',
    'store:set',
    'folder:read',
    'gh:me',
    'gh:repos',
    'gh:tree',
    'gh:file',
    'atlas:fetch',
    'atlas:history',
    'gh:issues',
    'atlas:refresh',
    'atlas:analyze',
    'atlas:meta',
    'atlas:list',
    'atlas:reopen',
    'atlas:cache:get',
    'atlas:cache:put',
    'atlas:search',
    'gh:search',
    'project:find',
    'project:openLocal',
    'gh:code',
    'site:inspect',
    'play:put',
    'update:get',
    'repos:usage',
  ]);
  // (not from a phone: publishing a page or forking a repo acts on your GitHub account in public, so it's done at the Mac)
  const REMOTE_SENDS = new Set(['ask:start', 'ask:cancel', 'prefs']);
  const HOST_FILE = path.join(app.getPath('userData'), 'host.json');
  let hostPrefs = { on: false, wifi: false, awake: true },
    macName = os.hostname();
  // this Mac's names on Tailscale ("my-mac.tail1234.ts.net" and "my-mac"), so a link can use them
  let tsNames = { v: [], at: 0 };
  async function tailscaleNames() {
    if (Date.now() - tsNames.at < 5 * 60_000) return tsNames.v;
    tsNames.at = Date.now();
    for (const bin of [
      await which('tailscale'),
      MAC ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale' : null,
    ].filter(Boolean)) {
      const r = await runQuiet(bin, ['status', '--json'], 5000);
      try {
        const n = String(JSON.parse(r.out)?.Self?.DNSName || '')
          .replace(/\.$/, '')
          .toLowerCase();
        if (r.ok && /^[a-z0-9.-]+$/.test(n)) return (tsNames.v = [n, n.split('.')[0]]);
      } catch {}
    }
    return (tsNames.v = []);
  }
  function hostNow() {
    return (ctx.host ??= require('../host.cjs').createHost({
      dist: DIST,
      devicesFile: path.join(app.getPath('userData'), 'devices.json'),
      name: () => macName,
      version: app.getVersion(),
      call: async (ch, args, sender) => {
        const fn = REMOTE_CALLS.has(ch) && RAW.handle.get(ch);
        if (!fn) throw new Error('That works on your Mac: open Bento there to do it.');
        try {
          return await fn({ sender, remote: true }, ...args);
        } catch (e) {
          throw new Error(e instanceof BadInput ? e.message : String(e?.message || e));
        }
      },
      send: (ch, args, sender) => {
        if (REMOTE_SENDS.has(ch)) RAW.on.get(ch)?.({ sender, remote: true }, ...args);
      },
      netProxy,
      playGet: (id) => PLAY.get(id),
      dnsNames: tailscaleNames,
      writeFile: writeSafeAsync,
      log: logger.log,
      onChange: () => {
        clearTimeout(hostTick);
        hostTick = setTimeout(() => {
          advertise();
          keepAwake();
          if (ctx.win && !ctx.win.isDestroyed())
            ctx.win.webContents.send('host:state', hostState());
        }, 120);
      },
      onAsk: (a) => askOnMac(a),
      onAskEnd: (id) => {
        if (askBox?.id === id) askBox.ctl.abort();
      }, // the phone gave up, or time ran out: the dialog goes
      port:
        TEST_BUILD && Number(process.env.BENTO_HOST_PORT)
          ? Number(process.env.BENTO_HOST_PORT)
          : undefined,
    }));
  }
  let hostTick = null;
  function hostState() {
    const st = ctx.host
      ? ctx.host.state()
      : {
          on: false,
          wifi: hostPrefs.wifi,
          urls: [],
          devices: [],
          pairing: null,
          ask: null,
          error: null,
        };
    const url = st.urls[0]?.url;
    return {
      ...st,
      name: macName,
      pairUrl: st.pairing && url ? `${url}/#pair=${st.pairing.code}` : null,
      awake: hostPrefs.awake !== false,
      awakeNow: awakeId != null,
      battery: powerMonitor.isOnBatteryPower(),
      nearby: !!bonjour,
    };
  }

  // "Approve on Mac": the Bento Code app on a phone asks to connect. The answer comes only from here, a native dialog on
  // this Mac (never from a page), showing the same 4-digit number as the phone so you know it's yours.
  let askBox = null; // { id, ctl }: the dialog on screen, and how to close it
  async function askOnMac(a) {
    askBox?.ctl.abort();
    const box = new AbortController();
    askBox = { id: a.id, ctl: box };
    const t = setTimeout(() => box.abort(), Math.max(1000, a.exp - Date.now()));
    // tests: answer by itself (allow / deny), or leave it waiting (never); a test never puts a dialog on the screen
    if (TEST_BUILD && process.env.BENTO_TEST_ASK) {
      if (process.env.BENTO_TEST_ASK !== 'never')
        setTimeout(
          () => ctx.host?.answer(a.id, process.env.BENTO_TEST_ASK === 'allow'),
          Number(process.env.BENTO_TEST_ASK_MS) || 400,
        );
      return;
    }
    const parent = ctx.win && !ctx.win.isDestroyed() && ctx.win.isVisible() ? ctx.win : null;
    if (MAC) {
      app.focus({ steal: true });
      app.dock?.bounce('informational');
    }
    if (parent?.isMinimized()) parent.restore();
    const what = a.kind === 'tablet' ? 'iPad' : 'iPhone';
    const opts = {
      type: 'question',
      message: `Allow “${a.name}” to use Bento on this Mac?`,
      detail: `Check that your ${what} shows ${a.code.split('').join(' ')}.\n\nIt will see your lessons and projects, and ask your AI through this Mac. You can remove it any time in Settings → Your phone and iPad.`,
      buttons: ['Allow', 'Don’t Allow'],
      defaultId: 0,
      cancelId: 1,
      signal: box.signal,
    };
    try {
      const r = await (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts));
      if (!box.signal.aborted) ctx.host?.answer(a.id, r.response === 0);
    } catch (e) {
      logger.log('ask dialog', e);
    } finally {
      clearTimeout(t);
      if (askBox?.ctl === box) askBox = null;
    }
  }

  // Macs nearby: the Bento Code app finds this Mac on the Wi-Fi by Bonjour, and learns from it how to reach it (its
  // Tailscale name, its Wi-Fi address). Only while phone access is on. dns-sd runs under a tiny shell that ends it when
  // Bento ends, even if Bento crashes, so a Mac never keeps advertising a Bento that isn't there.
  let bonjour = null,
    bonjourKey = '';
  function advertise() {
    const st = ctx.host?.isOn() ? ctx.host.state() : null;
    let args = null;
    if (st && MAC && (!TEST_BUILD || process.env.BENTO_HOST_BONJOUR === '1')) {
      const txt = ['v=1'],
        hp = (u) => u.url.replace(/^http:\/\//, '');
      const ts = st.urls.find((u) => u.kind === 'tailscale'),
        lan = st.urls.find((u) => u.kind === 'wifi'),
        loc = st.urls.find((u) => u.kind === 'local');
      if (ts) txt.push(`ts=${hp(ts)}`);
      if (lan) txt.push(`lan=${hp(lan)}`);
      if (loc) txt.push(`local=${hp(loc)}`);
      if (txt.length > 1)
        args = [
          '-R',
          TEST_BUILD ? `${macName} (test)` : macName,
          '_bento._tcp',
          'local',
          String(st.port),
          ...txt,
        ];
    }
    const key = args ? args.join('\u0000') : '';
    if (key === bonjourKey) return;
    bonjourKey = key;
    try {
      bonjour?.kill();
    } catch {}
    bonjour = null;
    if (!args) return;
    const script = `/usr/bin/dns-sd "$@" & c=$!; trap 'kill $c 2>/dev/null; exit 0' TERM INT HUP; while kill -0 ${process.pid} 2>/dev/null && kill -0 $c 2>/dev/null; do sleep 2; done; kill $c 2>/dev/null`;
    const me = (bonjour = spawn('/bin/sh', ['-c', script, 'bento-nearby', ...args], {
      stdio: 'ignore',
    }));
    me.on('error', (e) => logger.log('bonjour', e));
    me.on('exit', () => {
      if (bonjour === me) {
        bonjour = null;
        bonjourKey = '';
      }
    });
  }

  // Keep this Mac awake while phone access is on and it's plugged in, so your phone can reach it when you're away. The
  // screen still turns off; on battery the Mac sleeps as usual.
  let awakeId = null;
  function keepAwake() {
    const want =
      !!ctx.host?.isOn() &&
      hostPrefs.awake !== false &&
      !powerMonitor.isOnBatteryPower() &&
      !(TEST_BUILD && process.env.BENTO_HOST);
    if (want && awakeId == null) awakeId = powerSaveBlocker.start('prevent-app-suspension');
    if (!want && awakeId != null) {
      powerSaveBlocker.stop(awakeId);
      awakeId = null;
    }
  }
  // a change made on one device appears on the others (and in the Mac's own window)
  function shareChange(key, value, from) {
    if (from?.remote && ctx.win && !ctx.win.isDestroyed())
      ctx.win.webContents.send('store:changed', key, value);
    ctx.host?.broadcast('store:changed', [key, value], from?.clientId);
  }
  ipcMain.handle('host:get', () => hostState());
  ipcMain.handle('host:set', async (_e, p) => {
    hostPrefs = { on: p?.on === true, wifi: p?.wifi === true, awake: p?.awake !== false };
    await writeSafeAsync(HOST_FILE, JSON.stringify(hostPrefs));
    if (hostPrefs.on)
      await hostNow().start({
        wifi: hostPrefs.wifi,
        local: TEST_BUILD && !!process.env.BENTO_HOST,
      });
    else await ctx.host?.stop();
    advertise();
    keepAwake();
    return hostState();
  });
  ipcMain.handle('host:pair', () => {
    if (!ctx.host?.isOn()) throw new Error('Turn on “Use Bento on your phone and iPad” first.');
    ctx.host.newPairing();
    return hostState();
  });
  ipcMain.handle('host:forget', (_e, id) => {
    ctx.host?.forget(str(id, 40));
    return hostState();
  });
  // what this Mac is called, for people ("My Mac"), then start if it was on when Bento last quit
  app.whenReady().then(async () => {
    if (MAC) {
      const r = await runQuiet('/usr/sbin/scutil', ['--get', 'ComputerName'], 3000);
      if (r.ok && r.out.trim()) macName = r.out.trim().slice(0, 60);
    }
    const saved = await readJson(HOST_FILE, {});
    hostPrefs = {
      on: saved?.on === true,
      wifi: saved?.wifi === true,
      awake: saved?.awake !== false,
    };
    powerMonitor.on('on-ac', keepAwake);
    powerMonitor.on('on-battery', keepAwake);
    // tests (test builds only): on, and only on this Mac itself, never your real Tailscale or Wi-Fi
    const testHost = TEST_BUILD && !!process.env.BENTO_HOST;
    if (testHost) hostPrefs = { on: true, wifi: false, awake: false };
    if (hostPrefs.on)
      hostNow()
        .start({ wifi: hostPrefs.wifi, local: testHost })
        .catch((e) => logger.log('host start failed', e));
  });
  app.on('will-quit', () => {
    ctx.host?.stop();
    try {
      bonjour?.kill();
    } catch {}
    if (awakeId != null) powerSaveBlocker.stop(awakeId);
  });
  return {
    shareChange,
  };
};
