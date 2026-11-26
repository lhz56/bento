// Bento on a phone or iPad: the same page as on the Mac, with the same `window.bento` the app gives it, carried over the
// network to Bento on your Mac (electron/host.cjs). Calls are POSTs; what streams in (a lesson being written, a project
// being read, a change made on another device) comes as numbered events, so after the phone sleeps, or Wi-Fi drops,
// it reconnects and picks up from the last one it saw.
//
// This file runs before anything else on the page (main.jsx imports it first), so every part of Bento finds
// window.bento already there, exactly as in the app.

let spare = ''; // a pairing code from the link this page opened with, while it had a key already (see the bottom)
const KEY = 'bentoHost.key'; // this device's key, from pairing (only this device has it; the Mac keeps a hash)
export const isHosted = () =>
  typeof document !== 'undefined' && !!document.querySelector('meta[name="bento-host"]');
const OFFLINE =
  'Can’t reach your Mac. Bento needs to be open on it, and this device on the same Tailscale or Wi-Fi.';
const ON_MAC = 'That works on your Mac: open Bento there to do it.';
// only what's the same on every device goes to the Mac; how this screen is arranged stays on this device
const SHARED = /^bento\.(lessons|progress|settings|projects|savedAt)$/;

export function createRemote() {
  let key = null;
  try {
    key = localStorage.getItem(KEY);
  } catch {}
  let client = null,
    seq = 0,
    es = null,
    retry = 0,
    retryTimer = null,
    hostInfo = null,
    connecting = null;
  let state = key ? 'connecting' : 'unpaired';
  const watchers = new Set();
  const handlers = new Map(); // channel → Set(fn)
  const setState = (s) => {
    if (s === state) return;
    state = s;
    watchers.forEach((f) => {
      try {
        f(s, hostInfo);
      } catch {}
    });
  };
  const listen = (ch, fn) => {
    if (!handlers.has(ch)) handlers.set(ch, new Set());
    handlers.get(ch).add(fn);
    return () => handlers.get(ch)?.delete(fn);
  };
  const emit = (ch, args) =>
    handlers.get(ch)?.forEach((f) => {
      try {
        f(...args);
      } catch (e) {
        console.error(e);
      }
    });
  const asks = new Map(); // a lesson being written: its id → { chunk, think, done, error }
  const lastSent = new Map(); // what this device last sent to the Mac (or got from it), per key

  const headers = () => ({
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...(client ? { 'x-bento-client': client } : {}),
  });

  async function hello() {
    let r;
    try {
      r = await fetch('/api/hello', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ client }),
      });
    } catch {
      throw Object.assign(new Error(OFFLINE), { offline: true });
    }
    if (r.status === 401) {
      forgetKey();
      throw new Error('This device isn’t paired with your Mac any more. Pair it again.');
    }
    if (!r.ok) throw Object.assign(new Error(OFFLINE), { offline: true });
    const j = await r.json();
    if (client && j.client !== client) {
      // the Mac's Bento restarted (or forgot this page while it slept): what it was writing for this page is gone
      seq = 0;
      for (const [id, l] of asks) {
        asks.delete(id);
        l.error?.('Bento on your Mac restarted, so this stopped. Ask again.');
      }
    }
    client = j.client;
    hostInfo = { ...j.host, device: j.device };
    stream(j.ticket);
    return j;
  }
  function stream(ticket) {
    try {
      es?.close();
    } catch {}
    es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}&after=${seq}`);
    es.onopen = () => {
      retry = 0;
      setState('online');
    };
    es.onmessage = (m) => {
      let ev;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      if (!ev || ev.s <= seq) return;
      seq = ev.s;
      dispatch(ev.ch, Array.isArray(ev.a) ? ev.a : []);
    };
    es.addEventListener('bye', (m) => {
      try {
        es.close();
      } catch {}
      es = null;
      if (/removed/.test(m.data)) {
        forgetKey();
      } else later();
    });
    // the stream dropped (sleep, a new network, the Mac restarting): a fresh ticket, then carry on from the last event
    es.onerror = () => {
      try {
        es.close();
      } catch {}
      es = null;
      if (state !== 'unpaired') {
        setState('offline');
        later();
      }
    };
  }
  function later() {
    clearTimeout(retryTimer);
    const wait = Math.min(15000, 800 * 2 ** retry++);
    retryTimer = setTimeout(() => connect().catch(() => {}), wait);
  }
  function connect() {
    if (!key) {
      setState('unpaired');
      return Promise.reject(new Error('Pair this device with your Mac first.'));
    }
    return (connecting ??= hello().then(
      (j) => {
        connecting = null;
        return j;
      },
      (e) => {
        connecting = null;
        if (e.offline) {
          setState('offline');
          later();
        }
        throw e;
      },
    ));
  }
  function forgetKey() {
    key = null;
    client = null;
    try {
      localStorage.removeItem(KEY);
    } catch {}
    try {
      es?.close();
    } catch {}
    es = null;
    setState('unpaired');
  }
  function dispatch(ch, a) {
    if (ch === 'ask:chunk') return asks.get(a[0])?.chunk?.(a[1]);
    if (ch === 'ask:think') return asks.get(a[0])?.think?.(a[1]);
    if (ch === 'ask:done') {
      const l = asks.get(a[0]);
      asks.delete(a[0]);
      return l?.done?.();
    }
    if (ch === 'ask:error') {
      const l = asks.get(a[0]);
      asks.delete(a[0]);
      return l?.error?.(a[1]);
    }
    if (ch === 'store:changed')
      try {
        lastSent.set(a[0], JSON.stringify(a[1]));
      } catch {}
    emit(ch, a);
  }
  // back from the background, or back online: reconnect now rather than waiting out the timer
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && key && !es) {
        retry = 0;
        connect().catch(() => {});
      }
    });
    addEventListener('online', () => {
      if (key && !es) {
        retry = 0;
        connect().catch(() => {});
      }
    });
  }

  async function call(ch, ...args) {
    if (!client) await connect();
    for (let attempt = 0; ; attempt++) {
      let r;
      try {
        r = await fetch('/api/call', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ ch, args }),
        });
      } catch {
        setState('offline');
        later();
        throw new Error(OFFLINE);
      }
      if (r.status === 409 && attempt === 0) {
        client = null;
        await connect();
        continue;
      }
      if (r.status === 401) {
        forgetKey();
        throw new Error('This device isn’t paired with your Mac any more. Pair it again.');
      }
      if (!r.ok)
        throw new Error(r.status === 413 ? 'That’s too big to send to your Mac.' : OFFLINE);
      const j = await r.json();
      if (!j.ok) throw new Error(j.e || 'Something went wrong on your Mac.');
      return j.v;
    }
  }
  const send = (ch, ...args) => {
    (client ? Promise.resolve() : connect())
      .then(() =>
        fetch('/api/send', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ ch, args }),
          keepalive: true,
        }),
      )
      .catch(() => {});
  };
  const onMac = () => Promise.reject(new Error(ON_MAC));
  // a file "saved" on a phone: downloaded (Files on iPhone and iPad)
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return name;
  };
  const fileName = (t, ext) =>
    `${
      String(t || 'Bento')
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .slice(0, 60) || 'Bento'
    }.${ext}`;

  const api = {
    remote: true,
    providers: () => call('providers'),
    scan: () => call('scan'),
    openTerminal: onMac,
    aiTerminal: onMac,
    dropOpen: onMac,
    openFolder: async () => null,
    openData: async () => false,
    backupSave: onMac,
    backupLoad: onMac,
    reposClear: onMac,
    exportLesson: async (l) =>
      download(
        fileName(l?.title || 'lesson', 'bento'),
        JSON.stringify({ bento: 1, exported: new Date().toISOString(), lesson: l }, null, 1),
        'application/json',
      ),
    saveWeb: async (html, title) =>
      download(fileName(title || 'my page', 'html'), String(html), 'text/html'),
    // (publishing a page acts on your GitHub account in public: only at the Mac, so no button for it here)
    playPut: (html, key2) => call('play:put', html, key2),
    // lesson web pages come from the next port on the Mac: their own origin, as play:// is in the app
    playUrl: (id, v) =>
      `${location.protocol}//${location.hostname}:${Number(location.port || 80) + 1}/p/${encodeURIComponent(id)}/?v=${v || 0}`,
    setPrefs: (p) => send('prefs', p),
    onStoreHealth: (fn) => listen('store:health', fn),
    onStoreChanged: (fn) => listen('store:changed', fn),
    storeGet: () => call('store:get'),
    storeSet: async (k, v) => {
      if (!SHARED.test(k)) return true;
      let t;
      try {
        t = JSON.stringify(v);
      } catch {
        return false;
      }
      if (lastSent.get(k) === t) return true; // nothing new: don't send it again
      lastSent.set(k, t);
      return call('store:set', k, v).catch((e) => {
        lastSent.delete(k);
        throw e;
      });
    },
    usage: () => call('usage:get'),
    limits: {
      get: (o) => call('limits:get', { refresh: !!o?.refresh }),
      on: (fn) => listen('limits', fn),
    },
    clearSavedAnswers: () => call('usage:clearSaved'),
    pendingLink: async () => null,
    update: {
      get: () => call('update:get'),
      install: onMac,
      check: () => call('update:get'),
      setAuto: onMac,
      on: () => () => {},
    },
    onMenu: () => () => {},
    onDeepLink: () => () => {},
    ask(model, prompt, { chunk, done, error, think }, system) {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      asks.set(id, { chunk, done, error, think });
      (client ? Promise.resolve() : connect())
        .then(() =>
          fetch('/api/send', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ ch: 'ask:start', args: [id, { model, prompt, system }] }),
          }).then((r) => {
            if (!r.ok) throw new Error(OFFLINE);
          }),
        )
        .catch((e) => {
          if (asks.delete(id)) error?.(e.message || OFFLINE);
        });
      return () => {
        asks.delete(id);
        send('ask:cancel', id);
      };
    },
    quick: (model, prompt) => call('quick', { model, prompt }),
    readFile: (root, rel) => call('folder:read', root, rel),
    ghMe: () => call('gh:me'),
    ghRepos: () => call('gh:repos'),
    ghTree: (full) => call('gh:tree', full),
    ghFile: (full, p) => call('gh:file', full, p),
    reposUsage: () => call('repos:usage'),
    // a link opens on this device, in its own browser
    openExternal: async (url) => {
      try {
        const u = new URL(String(url));
        if (u.protocol === 'http:') u.protocol = 'https:';
        if (!['https:', 'mailto:'].includes(u.protocol)) return false;
        window.open(u.href, '_blank', 'noopener');
        return true;
      } catch {
        return false;
      }
    },
    atlasFetch: (full) => call('atlas:fetch', full),
    atlasHistory: (full) => call('atlas:history', full),
    ghIssues: (full) => call('gh:issues', full),
    atlasRefresh: (full) => call('atlas:refresh', full),
    atlasAnalyze: (root, name) => call('atlas:analyze', root, name),
    atlasMeta: (full) => call('atlas:meta', full),
    atlasList: () => call('atlas:list'),
    atlasReopen: (root) => call('atlas:reopen', root),
    cacheGet: (k) => call('atlas:cache:get', k),
    cachePut: (k, v) => call('atlas:cache:put', k, v),
    onAtlasProgress: (fn) => listen('atlas:progress', fn),
    ghSearch: (q, opts) => call('gh:search', q, opts),
    findProject: (names) => call('project:find', names),
    atlasSearch: (root, words, paths) => call('atlas:search', root, words, paths),
    openLocalProject: (root) => call('project:openLocal', root),
    ghCode: (q, lang) => call('gh:code', q, lang),
    siteInspect: (url) => call('site:inspect', url),
  };

  async function pair(code, name) {
    let r;
    try {
      r = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name }),
      });
    } catch {
      throw new Error(OFFLINE);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) throw new Error(j.error || 'Couldn’t pair. Try a new code.');
    key = j.token;
    try {
      localStorage.setItem(KEY, key);
    } catch {}
    setState('connecting');
    await connect();
    return j.device;
  }
  // putting Bento on the Home Screen: that copy starts with empty storage, so its start link carries a one-time code
  // (30 minutes) instead of this device's key. The page's address and the manifest both point at it.
  async function armHomeScreen() {
    if (!client) await connect();
    const r = await fetch('/api/home-screen', { method: 'POST', headers: headers(), body: '{}' });
    if (!r.ok) return null;
    const { code } = await r.json();
    history.replaceState(history.state, '', `${location.pathname}${location.search}#pair=${code}`);
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.href = `/manifest.webmanifest?pair=${code}`;
    return code;
  }
  // this device stops using Bento on the Mac (the Mac forgets it too)
  async function disconnect() {
    try {
      await fetch('/api/forget-me', { method: 'POST', headers: headers(), body: '{}' });
    } catch {}
    forgetKey();
  }
  const takeSpareCode = () => {
    const c = spare;
    spare = '';
    return c;
  };
  const remote = {
    get state() {
      return state;
    },
    get host() {
      return hostInfo;
    },
    on(fn) {
      watchers.add(fn);
      return () => watchers.delete(fn);
    },
    pair,
    connect,
    forget: forgetKey,
    disconnect,
    armHomeScreen,
    takeSpareCode,
  };
  return { api, remote };
}

// what this device is, for the list of paired devices on the Mac ("iPhone", "iPad")
export function deviceName() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'A Mac';
  if (/Windows/.test(ua)) return 'A Windows PC';
  return 'A browser';
}

// installed first thing on the page (see the top of main.jsx)
if (isHosted() && !window.bento) {
  // already paired, opened from a Home Screen link that still carries its (used) pairing code: tidy the address.
  // The code is kept aside: if this device's key turns out to be stale (a fresh QR code scanned with an old key), pairing uses it.
  try {
    if (localStorage.getItem(KEY) && /^#pair=/.test(location.hash)) {
      spare = location.hash.slice(6);
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch {}
  const { api, remote } = createRemote();
  window.bento = api;
  window.bentoRemote = remote;
  if (remote.state !== 'unpaired') remote.connect().catch(() => {});
}
