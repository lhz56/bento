// Bento on your phone and iPad, the way T3 Code works: the Mac app serves Bento's own page to your other devices and
// does their work. Lessons and answers come from your AIs on this Mac (your plan, nothing extra), projects are read
// here, everything is saved here. Nothing is hosted anywhere else.
//
// Who may use it: only devices you paired. Settings shows a QR code holding a one-time code (10 minutes, one use);
// the device trades it for its own key, which only it keeps (this Mac keeps a hash of it). Or the Bento Code app asks
// ("Approve on Mac"): it finds this Mac nearby, asks to connect, and this Mac shows a native Allow dialog with the same
// 4-digit number the phone shows; Allow hands that one asker a one-time code, which it trades for a key the same way. Remove a device in Settings
// and its key stops working at once. Every call carries the key in a header, so another website open on the phone
// can't make one; it must arrive on an address Bento chose (Tailscale, or your Wi-Fi if you turned that on) and name
// this Mac as its host, so a website can't point its own name at this Mac and get in that way either.
//
// The wire: calls are POSTs (/api/call: one answer), streams are Server-Sent Events (/api/events: a lesson being
// written, a project being read, changes made on another device). Every event is numbered and the last few minutes are
// kept, so a phone that locks mid-lesson picks up where it left off when you come back.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const PORT = 4917; // Bento's page; lesson web pages get the next port, an origin of their own
const PAIR_MS = 10 * 60_000;
const ASK_MS = 2 * 60_000;      // how long an "Approve on Mac" request waits for an answer
const ASK_COOL_MS = 30_000;     // after Don't Allow, how long before anyone may ask again
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');
const ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L: easy to type from the screen
const newCode = () => Array.from(crypto.randomBytes(8), (b) => ABC[b % ABC.length]).join('');
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 16);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Tailscale hands out 100.64.0.0/10; home networks use the private ranges
const isTailscale = (ip) => { const p = String(ip).split('.').map(Number); return p.length === 4 && p[0] === 100 && p[1] >= 64 && p[1] <= 127; };
const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(ip));
function addressesOf(ifaces, { wifi }) {
  const out = [];
  for (const [ifname, list] of Object.entries(ifaces || {})) for (const a of list || []) {
    if (a.family !== 'IPv4' && a.family !== 4) continue;
    if (a.internal) continue;
    if (isTailscale(a.address)) out.push({ ip: a.address, kind: 'tailscale', ifname });
    else if (wifi && isPrivate(a.address)) out.push({ ip: a.address, kind: 'wifi', ifname });
  }
  return out;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.whl': 'application/zip', '.map': 'application/json', '.webmanifest': 'application/manifest+json' };
const PACKED = /^(text\/|application\/(json|wasm|manifest)|image\/svg)/;
const BASE_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin' };

/**
 * o: {
 *   dist, devicesFile, name (this Mac, for people), version,
 *   call(ch, args, sender) → Promise, send(ch, args, sender),   // Bento's own handlers (main.cjs decides which)
 *   netProxy(request: Request, url: URL) → Promise<Response>,   // lesson code's internet, as in the app
 *   playGet(id) → html | undefined,                             // a lesson's web page
 *   dnsNames() → Promise<string[]>,                             // this Mac's names on Tailscale (full and short)
 *   writeFile(file, text), log(...), onChange(),                // Settings is told when something changes
 *   onAsk?({ id, name, kind, code, exp }),                     // a device asks to connect: show Allow / Don't Allow
 *   onAskEnd?(id, state),                                       // …and it was answered, ran out, or the device gave up
 *   interfaces?() (tests), port?, ttlMs?, askMs?, askCoolMs? (tests)
 * }
 */
function createHost(o) {
  const port = o.port || PORT, playPort = port + 1;
  let devices = [];
  try { const d = JSON.parse(fs.readFileSync(o.devicesFile, 'utf8')); if (Array.isArray(d)) devices = d.filter((x) => x && typeof x.hash === 'string' && typeof x.id === 'string'); } catch {}
  const saveDevices = () => o.writeFile(o.devicesFile, JSON.stringify(devices.map(({ id, name, hash, added, seen }) => ({ id, name, hash, added, seen }))));
  let pairing = null; // { code, exp, misses }
  // a paired iPhone or iPad putting Bento on its Home Screen: that copy has storage of its own, so it gets a one-time
  // code of its own in its start link (never the device's key), good for 30 minutes
  const handoffs = new Map(); // code → { exp, name }
  let misses = []; // when wrong codes were tried
  // "Approve on Mac": one request at a time. Its id and secret go only to the device that asked (the secret never
  // leaves it except to ask how it went); the 4-digit number is only for people to compare the two screens.
  let ask = null; // { id, secret, name, kind, code, exp, state: 'waiting'|'allowed'|'denied'|'expired', pair, waiters }
  let askTimes = [], askCool = 0;
  const clients = new Map(); // id → { id, deviceId, res, buf: [], seq, gone, idleAt }
  const tickets = new Map(); // ticket → { client, exp }
  const netKeys = new Map(); // key → deviceId (a cookie that lets lesson code reach the web, and nothing else)
  const servers = new Map(); // ip → [main server, play server]
  let wifi = false, local = false, on = false, names = [], error = null, scanTimer = null, beatTimer = null;
  const changed = () => { try { o.onChange?.(); } catch {} };

  // ---------------------------------------------------------------- devices and pairing
  const deviceFor = (req) => {
    const m = /^Bearer ([\w-]{20,200})$/.exec(String(req.headers.authorization || ''));
    if (!m) return null;
    const h = sha(m[1]);
    const d = devices.find((x) => same(x.hash, h));
    if (d && Date.now() - (d.seen || 0) > 60_000) { d.seen = Date.now(); saveDevices(); }
    return d || null;
  };
  function newPairing() { pairing = { code: newCode(), exp: Date.now() + (o.ttlMs || PAIR_MS), misses: 0 }; changed(); return pairing; }
  function tryPair(code, name) {
    const c0 = cleanCode(code);
    for (const [k, v] of handoffs) if (Date.now() > v.exp) handoffs.delete(k);
    const hand = [...handoffs.keys()].find((k) => same(k, c0));
    if (hand) { const v = handoffs.get(hand); handoffs.delete(hand); return addDevice(`${v.name} (Home Screen)`); }
    if (!pairing || Date.now() > pairing.exp) { pairing = null; return { error: 'That code has expired. Make a new one in Bento’s Settings on your Mac.' }; }
    if (!same(cleanCode(code), pairing.code)) {
      // ten wrong tries and the code is gone: guessing gets nowhere
      if (++pairing.misses >= 10) { pairing = null; changed(); return { error: 'Too many wrong codes. Make a new one in Bento’s Settings on your Mac.' }; }
      return { error: 'That code isn’t right. Check it on your Mac’s screen.' };
    }
    pairing = null;
    return addDevice(name);
  }
  function addDevice(name) {
    const token = rand(32);
    const dev = { id: rand(9), name: String(name || 'A device').replace(/[^\p{L}\p{N} ’'().-]/gu, '').slice(0, 40) || 'A device', hash: sha(token), added: Date.now(), seen: Date.now() };
    devices.push(dev); saveDevices(); changed();
    return { token, device: { id: dev.id, name: dev.name } };
  }
  function forget(id) {
    devices = devices.filter((d) => d.id !== id); saveDevices();
    // and every Home Screen code it made: a removed device must not be able to let itself back in
    for (const [k, v] of handoffs) if (v.from === id) handoffs.delete(k);
    for (const [k, v] of netKeys) if (v === id) netKeys.delete(k);
    for (const c of clients.values()) if (c.deviceId === id) dropClient(c, 'removed');
    changed();
  }

  function settle(a, st) {
    if (a.state !== 'waiting') return;
    a.state = st; clearTimeout(a.timer);
    for (const w of a.waiters) w(); a.waiters.clear(); changed();
    try { o.onAskEnd?.(a.id, st); } catch {}
  }
  function newAsk(name, kind) {
    const now = Date.now();
    if (ask?.state === 'waiting' && now < ask.exp) return { status: 429, error: 'Your Mac is already showing a request. Answer that one first.' };
    if (now < askCool) return { status: 429, error: 'Your Mac said no a moment ago. Wait half a minute, then try again.' };
    askTimes = askTimes.filter((t) => now - t < 60_000);
    if (askTimes.length >= 5) return { status: 429, error: 'Too many requests. Wait a minute, then try again.' };
    askTimes.push(now);
    const clean = (x, d) => String(x || '').replace(/[^\p{L}\p{N} ’'().-]/gu, '').trim().slice(0, 40) || d;
    const a = { id: rand(16), secret: rand(24), name: clean(name, 'A device'), kind: ['phone', 'tablet'].includes(kind) ? kind : 'phone',
      code: String(crypto.randomInt(0, 10000)).padStart(4, '0'), exp: now + (o.askMs || ASK_MS), state: 'waiting', pair: null, waiters: new Set() };
    a.timer = setTimeout(() => settle(a, 'expired'), a.exp - now); a.timer.unref?.();
    ask = a; changed();
    try { o.onAsk?.({ id: a.id, name: a.name, kind: a.kind, code: a.code, exp: a.exp }); } catch (e) { o.log?.('ask dialog', e); }
    return { id: a.id, secret: a.secret, code: a.code, exp: a.exp, mac: typeof o.name === 'function' ? o.name() : o.name };
  }
  /** The person answered on this Mac. Allow mints a one-time pairing code that only this request's device receives. */
  function answer(id, allow) {
    const a = ask;
    if (!a || a.id !== id || a.state !== 'waiting' || !on) return false;
    if (Date.now() > a.exp) { settle(a, 'expired'); return false; }
    if (allow) { a.pair = newPairing().code; settle(a, 'allowed'); } else { askCool = Date.now() + (o.askCoolMs || ASK_COOL_MS); settle(a, 'denied'); }
    return true;
  }

  // ---------------------------------------------------------------- clients and their streams
  function dropClient(c, why) { c.gone = true; clients.delete(c.id); try { c.res?.write(`event: bye\ndata: ${JSON.stringify(why)}\n\n`); c.res?.end(); } catch {} c.res = null; }
  function push(c, ch, args) {
    if (!c || c.gone) return;
    const ev = { s: ++c.seq, ch, a: args, at: Date.now() };
    c.buf.push(ev);
    // keep a few minutes (and not too much) for a phone that went to sleep mid-lesson
    while (c.buf.length > 4000 || (c.buf.length && Date.now() - c.buf[0].at > 10 * 60_000)) c.buf.shift();
    if (c.res) try { c.res.write(`id: ${ev.s}\ndata: ${JSON.stringify({ s: ev.s, ch, a: args })}\n\n`); } catch {}
  }
  const senderFor = (c) => ({ send: (ch, ...args) => push(c, ch, args), isDestroyed: () => !c || c.gone, remote: true, deviceId: c?.deviceId, clientId: c?.id });
  /** Send an event to every connected device (except one: the device that made the change already has it). */
  function broadcast(ch, args, except) { for (const c of clients.values()) if (c !== except && c.id !== except) push(c, ch, args); }

  // ---------------------------------------------------------------- the page
  const etags = new Map(); const packed = new Map();
  function fileInfo(f) { const st = fs.statSync(f); const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`; return { st, tag }; }
  const pageHtml = (hostName) => {
    // the same page as in the app, plus what a phone needs to keep it on the Home Screen, and lesson pages from the
    // next port (their own origin) instead of play://
    let html = fs.readFileSync(path.join(o.dist, 'index.html'), 'utf8');
    const play = `http://${hostName}:${playPort}`;
    html = html.replace(/frame-src play:/, `frame-src ${play}`);
    // a tap into a text box mustn't zoom the page (pinching to zoom still works: iOS keeps that for everyone)
    html = html.replace('initial-scale=1, viewport-fit=cover', 'initial-scale=1, maximum-scale=1, viewport-fit=cover');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] || "default-src 'self'";
    const head = [
      '<meta name="bento-host" content="1">',
      '<link rel="manifest" href="/manifest.webmanifest">',
      '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
      '<meta name="apple-mobile-web-app-capable" content="yes">', '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-title" content="Bento">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
      '<meta name="theme-color" content="#fbf8f3" media="(prefers-color-scheme: light)">', '<meta name="theme-color" content="#18171b" media="(prefers-color-scheme: dark)">',
      // Bento's own background from the very first moment (no white flash in dark mode while the rest arrives)
      '<style>html{background:#fbf8f3}@media (prefers-color-scheme:dark){html{background:#18171b;color-scheme:dark}}</style>',
    ].join('\n  ');
    return { html: html.replace('<title>', `${head}\n  <title>`), csp };
  };
  const manifest = (code) => JSON.stringify({ name: 'Bento', short_name: 'Bento', description: 'Learn how software is really built, with the AI on your Mac.', start_url: code ? `/#pair=${code}` : '/', id: '/', scope: '/', display: 'standalone', orientation: 'any', background_color: '#fbf8f3', theme_color: '#fbf8f3', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] });

  function sendBody(req, res, status, headers, body) {
    const type = headers['content-type'] || '';
    if (body.length > 1024 && PACKED.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      headers['content-encoding'] = 'gzip'; headers.vary = 'accept-encoding';
      const key = headers.etag ? `${req.url}|${headers.etag}` : null;
      let z = key && packed.get(key);
      if (!z) { z = zlib.gzipSync(body, { level: 6 }); if (key && z.length < 8_000_000) { packed.set(key, z); if (packed.size > 400) packed.delete(packed.keys().next().value); } }
      body = z;
    }
    res.writeHead(status, { ...BASE_HEADERS, ...headers, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
  function serveStatic(req, res, u, hostName) {
    let p; try { p = decodeURIComponent(u.pathname); } catch { return plain(res, 400, 'no'); }
    if (p === '/' || p === '/index.html') {
      const { html, csp } = pageHtml(hostName);
      return sendBody(req, res, 200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache', 'content-security-policy': `${csp}; frame-ancestors 'none'`, 'x-frame-options': 'DENY', 'cross-origin-opener-policy': 'same-origin' }, Buffer.from(html));
    }
    if (p === '/manifest.webmanifest') { const code = cleanCode(u.searchParams.get('pair')); return sendBody(req, res, 200, { 'content-type': TYPES['.webmanifest'], 'cache-control': 'no-store' }, Buffer.from(manifest(code.length === 8 ? code : ''))); }
    // inside dist only: "/../" and folders that merely start with the same letters ("dist-evil") never get out
    const root = path.resolve(o.dist), f = path.resolve(root, `.${p}`);
    if (!f.startsWith(root + path.sep)) return plain(res, 403, 'no');
    let info; try { info = fileInfo(f); if (!info.st.isFile()) throw 0; } catch { return plain(res, 404, 'Not here.'); }
    const hashed = /^\/assets\//.test(p);
    const headers = { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', etag: info.tag, 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (String(req.headers['if-none-match'] || '') === info.tag) { res.writeHead(304, { ...BASE_HEADERS, etag: info.tag, 'cache-control': headers['cache-control'] }); return res.end(); }
    etags.set(f, info.tag);
    return sendBody(req, res, 200, headers, fs.readFileSync(f));
  }
  const plain = (res, status, text) => { res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(text); };
  const json = (res, status, v, extra = {}) => { const b = Buffer.from(JSON.stringify(v)); res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': b.length, ...extra }); res.end(b); };
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      let n = 0; const parts = [];
      req.on('data', (d) => { n += d.length; if (n > max) { reject(Object.assign(new Error('too big'), { status: 413 })); req.destroy(); } else parts.push(d); });
      req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject);
    });
  }
  const readJson = async (req, max = 1_000_000) => { try { return JSON.parse((await readBody(req, max)).toString('utf8') || 'null'); } catch (e) { if (e.status) throw e; throw Object.assign(new Error('bad json'), { status: 400 }); } };

  // ---------------------------------------------------------------- who may knock
  // the Host header must name this Mac (by an address Bento listens on, or its Tailscale/local name): a website that
  // points its own name at this Mac ("DNS rebinding") gets nothing
  function hostOk(req, p) {
    const h = String(req.headers.host || '').toLowerCase();
    const m = /^([a-z0-9.-]+|\[[0-9a-f:]+\]):(\d+)$/.exec(h); if (!m || Number(m[2]) !== p) return null;
    const name = m[1];
    const ok = name === 'localhost' || name === '127.0.0.1' || servers.has(name) || names.includes(name) || name === `${os.hostname().toLowerCase()}.local`;
    return ok ? name : null;
  }
  const originOk = (req, hostName) => { const or = req.headers.origin; if (!or) return true; try { const u = new URL(or); return u.hostname.toLowerCase() === hostName && Number(u.port) === port && u.protocol === 'http:'; } catch { return false; } };
  const cookie = (req, k) => { for (const part of String(req.headers.cookie || '').split(';')) { const [a, ...b] = part.trim().split('='); if (a === k) return b.join('='); } return null; };

  async function onMain(req, res) {
    const hostName = hostOk(req, port);
    if (!hostName) return plain(res, 421, 'This isn’t the address Bento is listening on.');
    let u; try { u = new URL(req.url, `http://${hostName}:${port}`); } catch { return plain(res, 400, 'no'); }
    try {
      if (u.pathname.startsWith('/api/')) {
        if (req.method !== 'POST' && u.pathname !== '/api/events') return plain(res, 405, 'no');
        if (!originOk(req, hostName)) return plain(res, 403, 'Not from Bento’s page.');
        return await api(req, res, u);
      }
      if (u.pathname === '/__net') {
        // lesson code reaching the web (fetch, requests): paired devices only, through the same guarded fetch as the app
        const k = cookie(req, 'bento_net'); if (!k || !netKeys.has(k)) return plain(res, 401, 'Pair this device with your Mac first.');
        const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req, 2_000_000);
        const headers = new Headers(); for (const [k2, v] of Object.entries(req.headers)) if (k2.startsWith('x-h-') && typeof v === 'string') headers.set(k2, v);
        const r = await o.netProxy(new Request(u.toString(), { method: req.method, headers, body }), u);
        const buf = Buffer.from(await r.arrayBuffer()); const out = {}; r.headers.forEach((v, k2) => { out[k2] = v; });
        res.writeHead(r.status, { ...BASE_HEADERS, ...out, 'cache-control': 'no-store', 'content-length': buf.length }); return res.end(buf);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'no');
      return serveStatic(req, res, u, hostName);
    } catch (e) {
      if (!res.headersSent) return plain(res, e.status || 500, e.status ? 'That request didn’t look right.' : 'Something went wrong on your Mac.');
      try { res.end(); } catch {}
    }
  }

  async function api(req, res, u) {
    const route = u.pathname.slice(5);
    if (route === 'connect' || route === 'connect/state' || route === 'connect/cancel') {
      // only the Bento Code app asks this way, never a web page: browsers always send Origin with these, the app never
      // does, so a page on any device on the Wi-Fi (or one that points its own name at this Mac) can't raise the dialog
      if (req.headers.origin) return json(res, 403, { error: 'Ask from the Bento Code app.' });
      const b = await readJson(req, 4000);
      if (route === 'connect') { const r = newAsk(b?.name, b?.kind); return json(res, r.status || 200, r.status ? { error: r.error } : r); }
      const a = ask && typeof b?.id === 'string' && same(b.id, ask.id) && typeof b?.secret === 'string' && same(b.secret, ask.secret) ? ask : null;
      if (!a) return json(res, 404, { state: 'gone' });
      if (route === 'connect/cancel') { settle(a, 'expired'); if (ask === a) ask = null; return json(res, 200, { state: 'expired' }); }
      // wait (up to 25 s) for the answer, so the phone hears it the moment you click
      if (a.state === 'waiting') await new Promise((r) => { const t = setTimeout(r, 25_000); const w = () => { clearTimeout(t); r(); }; a.waiters.add(w); req.on('close', () => { a.waiters.delete(w); clearTimeout(t); r(); }); });
      if (res.destroyed) return undefined;
      if (a.state === 'allowed') {
        // the code goes out once: then this request is done
        const pair = a.pair; if (ask === a) ask = null;
        return json(res, 200, { state: 'allowed', pair, mac: typeof o.name === 'function' ? o.name() : o.name });
      }
      return json(res, 200, { state: a.state });
    }
    if (route === 'pair') {
      // however many addresses someone tries from, wrong codes slow to a stop: 30 a minute for the whole Mac
      const now = Date.now(); misses = misses.filter((t) => now - t < 60_000);
      if (misses.length >= 30) return json(res, 429, { error: 'Too many tries. Wait a minute, then scan the code on your Mac again.' });
      const b = await readJson(req, 4000);
      const r = tryPair(b?.code, b?.name);
      if (r.error) misses.push(now);
      return json(res, r.error ? 403 : 200, r);
    }
    if (route === 'events') {
      // a stream for one client; the ticket came from /api/hello a moment ago (an EventSource can't carry the key)
      const t = tickets.get(u.searchParams.get('ticket') || ''); tickets.delete(u.searchParams.get('ticket') || '');
      const c = t && Date.now() < t.exp ? clients.get(t.client) : null;
      if (!c) return plain(res, 401, 'Pair this device with your Mac first.');
      try { c.res?.end(); } catch {}
      res.writeHead(200, { ...BASE_HEADERS, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(': hello\n\n');
      const after = Number(u.searchParams.get('after')) || 0;
      for (const ev of c.buf) if (ev.s > after) res.write(`id: ${ev.s}\ndata: ${JSON.stringify({ s: ev.s, ch: ev.ch, a: ev.a })}\n\n`);
      c.res = res; c.idleAt = 0; changed();
      req.on('close', () => { if (c.res === res) { c.res = null; c.idleAt = Date.now(); changed(); } });
      return undefined;
    }
    const dev = deviceFor(req);
    if (!dev) return json(res, 401, { error: 'unpaired' });
    if (route === 'hello') {
      const b = await readJson(req, 4000);
      let c = typeof b?.client === 'string' ? clients.get(b.client) : null;
      if (!c || c.deviceId !== dev.id) { c = { id: rand(12), deviceId: dev.id, res: null, buf: [], seq: 0, gone: false, idleAt: Date.now() }; clients.set(c.id, c); }
      const ticket = rand(18); tickets.set(ticket, { client: c.id, exp: Date.now() + 30_000 });
      for (const [k, v] of tickets) if (Date.now() > v.exp) tickets.delete(k);
      const net = rand(24); netKeys.set(net, dev.id); if (netKeys.size > 200) netKeys.delete(netKeys.keys().next().value);
      return json(res, 200, { client: c.id, ticket, seq: c.seq, device: { id: dev.id, name: dev.name }, host: { name: typeof o.name === 'function' ? o.name() : o.name, version: o.version } }, { 'set-cookie': `bento_net=${net}; Path=/__net; HttpOnly; SameSite=Strict` });
    }
    const c = clients.get(String(req.headers['x-bento-client'] || ''));
    if (!c || c.deviceId !== dev.id) return json(res, 409, { error: 'reconnect' });
    if (route === 'call' || route === 'send') {
      const b = await readJson(req, 64_000_000);
      const ch = typeof b?.ch === 'string' ? b.ch : ''; const args = Array.isArray(b?.args) ? b.args : [];
      if (route === 'send') { try { o.send(ch, args, senderFor(c)); } catch {} res.writeHead(204, BASE_HEADERS); return res.end(); }
      try { const v = await o.call(ch, args, senderFor(c)); return json(res, 200, { ok: true, v: v === undefined ? null : v }); }
      catch (e) { return json(res, 200, { ok: false, e: String(e?.message || e).slice(0, 2000) }); }
    }
    if (route === 'bye') { dropClient(c, 'bye'); changed(); res.writeHead(204, BASE_HEADERS); return res.end(); }
    if (route === 'home-screen') {
      for (const [k, v] of handoffs) if (Date.now() > v.exp || v.from === dev.id) handoffs.delete(k);
      if (handoffs.size >= 20) return json(res, 429, { error: 'busy' });
      const code = newCode(); handoffs.set(code, { exp: Date.now() + 30 * 60_000, name: dev.name, from: dev.id });
      return json(res, 200, { code });
    }
    if (route === 'forget-me') { forget(dev.id); res.writeHead(204, BASE_HEADERS); return res.end(); }
    return plain(res, 404, 'no');
  }

  // lesson web pages, on their own port: their own origin, so they can't read Bento's page or its key
  function onPlay(req, res) {
    const hostName = hostOk(req, playPort);
    if (!hostName) return plain(res, 421, 'no');
    if (req.method !== 'GET') return plain(res, 405, 'no');
    const m = /^\/p\/([a-z0-9-]{3,48})\/?$/i.exec(new URL(req.url, 'http://x').pathname);
    const html = m && o.playGet(m[1]);
    if (!html) return plain(res, 404, 'Run the code again to see the page.');
    const b = Buffer.from(html);
    res.writeHead(200, { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-length': b.length,
      'content-security-policy': `default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; connect-src https:; frame-ancestors http://${hostName}:${port}` });
    res.end(b);
  }

  // ---------------------------------------------------------------- listening
  // always this Mac itself (the iOS Simulator reaches it there too); `local` (tests) means only that
  const wanted = () => [{ ip: '127.0.0.1', kind: 'local' }, ...(local ? [] : addressesOf(o.interfaces ? o.interfaces() : os.networkInterfaces(), { wifi }))];
  const listenOn = (ip) => new Promise((resolve) => {
    const a = http.createServer(onMain), b = http.createServer(onPlay);
    for (const s of [a, b]) { s.keepAliveTimeout = 65_000; s.headersTimeout = 30_000; s.requestTimeout = 0; }
    let n = 0, failed = null;
    const done = (e) => { if (e) failed = e; if (++n < 2) return; if (failed) { a.close(); b.close(); resolve(failed); } else { servers.set(ip, [a, b]); resolve(null); } };
    a.once('error', done); b.once('error', done);
    a.listen(port, ip, () => done()); b.listen(playPort, ip, () => done());
  });
  async function scan() {
    if (!on) return;
    try { names = (await o.dnsNames?.().catch(() => []) || []).map((x) => String(x).toLowerCase()); } catch { names = []; }
    const want = wanted(); const ips = new Set(want.map((w) => w.ip));
    for (const [ip, ss] of servers) if (!ips.has(ip)) { ss.forEach((s) => s.close()); servers.delete(ip); }
    let err = null;
    for (const w of want) if (!servers.has(w.ip)) { const e = await listenOn(w.ip); if (e) err = e.code === 'EADDRINUSE' ? `Port ${port} is in use by another app, so your devices can’t reach Bento.` : `Couldn’t listen on ${w.ip}: ${e.message}`; }
    if (err !== error) { error = err; if (err) o.log?.('host', err); }
    changed();
  }
  async function start(opts = {}) {
    wifi = !!opts.wifi; local = !!opts.local; on = true;
    await scan();
    clearInterval(scanTimer); scanTimer = setInterval(scan, 30_000); scanTimer.unref?.(); // Tailscale or Wi-Fi coming and going
    clearInterval(beatTimer); beatTimer = setInterval(() => {
      for (const c of clients.values()) {
        if (c.res) try { c.res.write(': still here\n\n'); } catch {}
        else if (c.idleAt && Date.now() - c.idleAt > 15 * 60_000) dropClient(c, 'idle');
      }
    }, 20_000); beatTimer.unref?.();
  }
  async function stop() {
    on = false; clearInterval(scanTimer); clearInterval(beatTimer);
    for (const c of [...clients.values()]) dropClient(c, 'off');
    await Promise.all([...servers.values()].flat().map((s) => new Promise((r) => { s.close(() => r()); s.closeAllConnections?.(); })));
    if (ask) settle(ask, 'expired'); ask = null;
    servers.clear(); pairing = null; error = null; changed();
  }
  function urls() {
    const out = [];
    const ts = [...servers.keys()].filter(isTailscale);
    const full = names.find((n) => n.endsWith('.ts.net'));
    if (ts.length) out.push({ kind: 'tailscale', url: `http://${full || ts[0]}:${port}`, ip: ts[0] });
    for (const ip of [...servers.keys()].filter((x) => isPrivate(x))) out.push({ kind: 'wifi', url: `http://${ip}:${port}`, ip });
    if (local) out.push({ kind: 'local', url: `http://127.0.0.1:${port}`, ip: '127.0.0.1' });
    return out;
  }
  function state() {
    const online = new Set([...clients.values()].filter((c) => c.res).map((c) => c.deviceId));
    return {
      on, wifi, port, error, urls: urls(),
      devices: devices.map((d) => ({ id: d.id, name: d.name, added: d.added, seen: d.seen, online: online.has(d.id) })),
      pairing: pairing && Date.now() < pairing.exp ? { code: pairing.code, exp: pairing.exp } : null,
      ask: ask && ask.state === 'waiting' && Date.now() < ask.exp ? { id: ask.id, name: ask.name, kind: ask.kind, code: ask.code, exp: ask.exp } : null,
    };
  }
  return { start, stop, state, newPairing, answer, forget, broadcast, push, isOn: () => on, PORT: port, _clients: clients };
}

module.exports = { createHost, addressesOf, isTailscale, isPrivate, cleanCode, PORT };
