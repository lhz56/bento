// Bento for your phone and iPad (electron/host.cjs): who may connect, and what they get. Runs the real server on
// localhost, on a spare port, with a tiny pretend Bento behind it. No Electron, no AI, nothing leaves this computer.
// node test/host.test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { createHost, addressesOf, cleanCode, pageCsp } = require('../electron/host.cjs');
const { writeSafeAsync } = require('../electron/safewrite.cjs');
const { mergeLessons } = await import('../src/sync.js');

let fail = 0;
const check = (ok, label, extra = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` → ${extra}`}`);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-host-'));
const dist = path.join(dir, 'dist');
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.writeFileSync(
  path.join(dist, 'index.html'),
  '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; frame-src play:; connect-src \'self\'"><title>Bento</title></head><body></body></html>',
);
fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log("bento");'.repeat(200));
fs.mkdirSync(path.join(dir, 'dist-evil'));
fs.writeFileSync(path.join(dir, 'dist-evil', 'secret.txt'), 'nope');
fs.writeFileSync(path.join(dir, 'secret.txt'), 'nope');

const port = 47000 + Math.floor(Math.random() * 900) * 2;
const calls = [];
const sends = [];
const asks = [];
const askEnds = [];
const host = createHost({
  dist,
  devicesFile: path.join(dir, 'devices.json'),
  name: 'Test Mac',
  version: '9.9.9',
  port,
  ttlMs: 60_000,
  askMs: 1500,
  askCoolMs: 400,
  onAsk: (a) => asks.push(a),
  onAskEnd: (id, st) => askEnds.push(st),
  interfaces: () => ({}), // localhost only
  call: async (ch, args, sender) => {
    calls.push({ ch, args, sender });
    if (ch === 'boom') throw new Error('it broke');
    if (ch === 'stream') {
      sender.send('ask:chunk', 'x1', 'hello');
      sender.send('ask:done', 'x1');
    }
    return { ch, args };
  },
  send: (ch, args, sender) => sends.push({ ch, args, sender }),
  netProxy: async (req, u) =>
    new Response(`proxied ${u.searchParams.get('u')} ${req.headers.get('x-h-accept') || ''}`, {
      headers: { 'x-status': '200' },
    }),
  playGet: (id) => (id === 'l-demo' ? '<p>my page</p>' : undefined),
  dnsNames: async () => ['test-mac.tail123.ts.net', 'test-mac'],
  // the app's own writer (main.cjs passes the same one): saves of one file wait their turn, which Windows needs, since
  // it refuses to swap in a file while another save is swapping in the same one (EPERM)
  writeFile: writeSafeAsync,
  log: () => {},
});
await host.start({ wifi: false });

// a raw request, so the Host and Origin headers can be anything (fetch won't let a test set Host)
function req(
  method,
  p,
  { headers = {}, body, hostHeader = `127.0.0.1:${port}`, toPort = port } = {},
) {
  return new Promise((resolve, reject) => {
    const b =
      body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request(
      {
        host: '127.0.0.1',
        port: toPort,
        method,
        path: p,
        headers: {
          host: hostHeader,
          ...(b ? { 'content-type': 'application/json', 'content-length': b.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const parts = [];
        res.on('data', (d) => parts.push(d));
        res.on('end', () => {
          const text = Buffer.concat(parts).toString();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    r.on('error', reject);
    if (b) r.write(b);
    r.end();
  });
}
const post = (p, body, key, extra = {}) =>
  req('POST', p, {
    body,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra },
  });

// ---- the page
{
  const r = await req('GET', '/');
  check(
    r.status === 200 &&
      /<meta name="bento-host" content="1">/.test(r.text) &&
      /frame-src http:\/\/127\.0\.0\.1:\d+/.test(r.text) &&
      !/frame-src play:/.test(r.text),
    'the page is Bento’s, marked as served by the Mac, with lesson pages from the next port',
    r.text.slice(0, 200),
  );
  check(
    /frame-ancestors 'none'/.test(r.headers['content-security-policy'] || '') &&
      r.headers['x-frame-options'] === 'DENY' &&
      r.headers['x-content-type-options'] === 'nosniff',
    'the page can’t be framed by another site, with the same strict policy as the app',
    JSON.stringify(r.headers),
  );
  const a = await req('GET', '/assets/app-abc123.js', { headers: { 'accept-encoding': 'gzip' } });
  check(
    a.status === 200 &&
      a.headers['content-encoding'] === 'gzip' &&
      /immutable/.test(a.headers['cache-control']),
    'its code is compressed and cached for good (the names change with each version)',
    JSON.stringify(a.headers),
  );
  const again = await req('GET', '/assets/app-abc123.js', {
    headers: { 'if-none-match': a.headers.etag },
  });
  check(again.status === 304, 'a file the device already has isn’t sent again', again.status);
  const m = await req('GET', '/manifest.webmanifest');
  check(
    m.status === 200 && m.json?.display === 'standalone' && m.json?.start_url === '/',
    'it can live on the Home Screen as an app',
    m.text.slice(0, 120),
  );
  const outs = await Promise.all(
    [
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fdist-evil/secret.txt',
      '/../dist-evil/secret.txt',
    ].map((p) => req('GET', p)),
  );
  check(
    outs.every((x) => x.status === 403 || x.status === 404) &&
      outs.every((x) => !/nope/.test(x.text)),
    'nothing outside Bento’s own files can be read, not even a folder named like it',
    outs.map((x) => x.status).join(' '),
  );
}

// ---- who may knock
{
  const evil = await req('GET', '/', { hostHeader: `evil.example:${port}` });
  check(
    evil.status === 421,
    'a website that points its own name at this Mac gets nothing',
    evil.status,
  );
  const named = await req('GET', '/', { hostHeader: `test-mac.tail123.ts.net:${port}` });
  check(
    named.status === 200 &&
      new RegExp(`frame-src http://test-mac\\.tail123\\.ts\\.net:${port + 1}`).test(named.text),
    'this Mac’s Tailscale name works, and lesson pages use the same name',
    named.status,
  );
  const anon = await post('/api/call', { ch: 'providers', args: [] });
  check(
    anon.status === 401 && calls.length === 0,
    'an unpaired device can’t ask for anything',
    anon.status,
  );
}

// ---- pairing
let key;
{
  check(
    cleanCode('ab cd-ef gh') === 'ABCDEFGH',
    'a typed code is read the way people type it',
    cleanCode('ab cd-ef gh'),
  );
  const none = await post('/api/pair', { code: 'AAAAAAAA', name: 'iPhone' });
  check(
    none.status === 403 && /expired/.test(none.json?.error || ''),
    'with no code on the Mac’s screen, nothing pairs',
    none.text,
  );
  const { code } = host.newPairing();
  const wrong = await post('/api/pair', { code: 'ZZZZZZZZ', name: 'iPhone' });
  check(
    wrong.status === 403 && /isn’t right/.test(wrong.json?.error || ''),
    'a wrong code is refused',
    wrong.text,
  );
  const ok = await post('/api/pair', {
    code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`,
    name: 'iPhone<script>',
  });
  key = ok.json?.token;
  check(
    ok.status === 200 && key && ok.json.device.name === 'iPhonescript',
    'the right code pairs once, and the device gets its own key',
    ok.text,
  );
  const twice = await post('/api/pair', { code, name: 'iPad' });
  check(twice.status === 403, 'the same code can’t pair a second device', twice.status);
  let saved = null;
  for (let i = 0; i < 40 && !saved; i++) {
    try {
      saved = JSON.parse(fs.readFileSync(path.join(dir, 'devices.json'), 'utf8'));
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  check(
    saved.length === 1 && !JSON.stringify(saved).includes(key) && saved[0].hash.length === 64,
    'the Mac keeps only a hash of the key',
    JSON.stringify(saved),
  );
  host.newPairing();
  for (let i = 0; i < 10; i++) await post('/api/pair', { code: 'ZZZZZZZZ' });
  check(
    host.state().pairing === null,
    'ten wrong guesses and the code is gone',
    JSON.stringify(host.state().pairing),
  );
}

// ---- calls, events, and a phone that slept
{
  const bad = await post('/api/hello', {}, 'not-a-real-key-at-all-123');
  check(bad.status === 401, 'a made-up key gets nothing', bad.status);
  const hi = await post('/api/hello', {}, key);
  const client = hi.json?.client;
  check(
    hi.status === 200 &&
      client &&
      hi.json.host.name === 'Test Mac' &&
      /bento_net=[\w-]+; Path=\/__net; HttpOnly; SameSite=Strict/.test(
        hi.headers['set-cookie']?.[0] || '',
      ),
    'a paired device says hello and gets its stream ticket (and a cookie that only fetches for lesson code)',
    hi.text,
  );
  const cross = await post('/api/call', { ch: 'providers', args: [] }, key, {
    'x-bento-client': client,
    origin: 'https://evil.example',
  });
  check(
    cross.status === 403,
    'a call from another website’s page is refused, even with a key',
    cross.status,
  );
  const r = await post('/api/call', { ch: 'providers', args: [1, 'two'] }, key, {
    'x-bento-client': client,
    origin: `http://127.0.0.1:${port}`,
  });
  check(
    r.json?.ok &&
      r.json.v.ch === 'providers' &&
      calls.at(-1).sender.remote === true &&
      calls.at(-1).sender.clientId === client,
    'a call reaches Bento’s handler, marked as coming from that device',
    r.text,
  );
  const e = await post('/api/call', { ch: 'boom', args: [] }, key, { 'x-bento-client': client });
  check(
    e.json?.ok === false && e.json.e === 'it broke',
    'a failure comes back as Bento’s own words',
    e.text,
  );
  // events stream in; disconnect; more arrive; reconnect and catch up from the last one seen
  const events = [];
  let stream;
  const listen = (ticket, after) =>
    new Promise((resolve) => {
      stream = http.get(
        {
          host: '127.0.0.1',
          port,
          path: `/api/events?ticket=${ticket}&after=${after}`,
          headers: { host: `127.0.0.1:${port}` },
        },
        (res) => {
          res.setEncoding('utf8');
          let buf = '';
          res.on('data', (d) => {
            buf += d;
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const m = /^data: (.*)$/m.exec(block);
              if (m) events.push(JSON.parse(m[1]));
            }
          });
          resolve(res.statusCode);
        },
      );
    });
  check((await listen(hi.json.ticket, 0)) === 200, 'its ticket opens the stream', '');
  const reuse = await req('GET', `/api/events?ticket=${hi.json.ticket}&after=0`);
  check(reuse.status === 401, 'a ticket works once', reuse.status);
  await post('/api/call', { ch: 'stream', args: [] }, key, { 'x-bento-client': client });
  await new Promise((r) => setTimeout(r, 150));
  check(
    events.map((x) => x.ch).join(',') === 'ask:chunk,ask:done' && events[0].a[1] === 'hello',
    'a lesson being written streams to the device that asked',
    JSON.stringify(events),
  );
  stream.destroy();
  await new Promise((r) => setTimeout(r, 100));
  host.broadcast('store:changed', ['bento.lessons', [{ id: 'a' }]]);
  host.broadcast('limits', [{ claude: 40 }], client); // made by this device: not sent back to it
  const back = await post('/api/hello', { client }, key);
  check(
    back.json?.client === client,
    'after the phone slept, it comes back as the same client',
    back.text,
  );
  await listen(back.json.ticket, events.at(-1).s);
  await new Promise((r) => setTimeout(r, 150));
  check(
    events.map((x) => x.ch).join(',') === 'ask:chunk,ask:done,store:changed',
    'what happened while it slept arrives, once, in order (and not its own changes)',
    JSON.stringify(events.map((x) => x.ch)),
  );
  const sendR = await post('/api/send', { ch: 'ask:start', args: ['id1', { model: 'm' }] }, key, {
    'x-bento-client': client,
  });
  check(
    sendR.status === 204 && sends.at(-1).ch === 'ask:start' && sends.at(-1).sender.remote,
    'starting a lesson reaches Bento’s handler',
    sendR.status,
  );
  const cookieV = /bento_net=([\w-]+)/.exec(hi.headers['set-cookie'][0])[1];
  const net = await req('GET', '/__net?u=https%3A%2F%2Fexample.com%2F', {
    headers: { cookie: `bento_net=${cookieV}`, 'x-h-accept': 'text/plain' },
  });
  const noNet = await req('GET', '/__net?u=https%3A%2F%2Fexample.com%2F');
  check(
    net.status === 200 &&
      net.text === 'proxied https://example.com/ text/plain' &&
      noNet.status === 401,
    'lesson code reaches the web through the Mac, only from a paired device',
    `${net.status} ${net.text} ${noNet.status}`,
  );
  // lesson pages: their own origin
  const page = await req('GET', '/p/l-demo/?v=1', {
    toPort: port + 1,
    hostHeader: `127.0.0.1:${port + 1}`,
  });
  const nope = await req('GET', '/p/l-other/', {
    toPort: port + 1,
    hostHeader: `127.0.0.1:${port + 1}`,
  });
  check(
    page.status === 200 &&
      page.text === '<p>my page</p>' &&
      new RegExp(`frame-ancestors http://127\\.0\\.0\\.1:${port}`).test(
        page.headers['content-security-policy'],
      ) &&
      nope.status === 404,
    'a lesson’s web page comes from its own port, framed only by Bento',
    `${page.status} ${page.headers['content-security-policy']}`,
  );
  // putting Bento on the Home Screen: a one-time code for that copy, in its start link, never the key
  const hs = await post('/api/home-screen', {}, key, { 'x-bento-client': client });
  const hsCode = hs.json?.code;
  const man = await req('GET', `/manifest.webmanifest?pair=${hsCode}`);
  check(
    hs.status === 200 &&
      /^[0-9A-Z]{8}$/.test(hsCode || '') &&
      man.json?.start_url === `/#pair=${hsCode}` &&
      !man.text.includes(key),
    'the Home Screen copy starts from a link with a one-time code (never this device’s key)',
    `${hs.text} ${man.text.slice(0, 120)}`,
  );
  const evilMan = await req('GET', '/manifest.webmanifest?pair=%22%3E%3Cscript%3E');
  check(
    evilMan.json?.start_url === '/',
    'a made-up start link can’t put anything else in the manifest',
    evilMan.text.slice(0, 120),
  );
  const hsPair = await post('/api/pair', { code: hsCode, name: 'whatever' });
  const hsAgain = await post('/api/pair', { code: hsCode, name: 'whatever' });
  check(
    hsPair.status === 200 &&
      hsPair.json.device.name === 'iPhonescript (Home Screen)' &&
      hsAgain.status === 403,
    'that code pairs the Home Screen copy once, named after the device it came from',
    `${hsPair.text} ${hsAgain.status}`,
  );
  const hsKey = hsPair.json.token;
  const bye = await post('/api/forget-me', {}, hsKey, {
    'x-bento-client': (await post('/api/hello', {}, hsKey)).json.client,
  });
  check(
    bye.status === 204 &&
      (await post('/api/hello', {}, hsKey)).status === 401 &&
      host.state().devices.length === 1,
    'a device can disconnect itself, and the Mac forgets it',
    `${bye.status} ${host.state().devices.length}`,
  );
  // removing the device: its key stops working at once, and its stream is told
  const dev = host.state().devices[0];
  check(
    dev && dev.online === true && dev.name === 'iPhonescript',
    'Settings shows the device, connected',
    JSON.stringify(host.state().devices),
  );
  const spare = (await post('/api/home-screen', {}, key, { 'x-bento-client': client })).json?.code; // kept back, as a removed device might
  host.forget(dev.id);
  await new Promise((r) => setTimeout(r, 100));
  const sneak = await post('/api/pair', { code: spare, name: 'me again' });
  check(
    spare && sneak.status === 403,
    'a removed device can’t let itself back in with a Home Screen code it kept',
    `${spare} ${sneak.status}`,
  );
  const after = await post('/api/hello', {}, key);
  const netAfter = await req('GET', '/__net?u=https%3A%2F%2Fexample.com%2F', {
    headers: { cookie: `bento_net=${cookieV}` },
  });
  check(
    after.status === 401 && netAfter.status === 401,
    'a removed device can’t do anything any more, lesson code included',
    `${after.status} ${netAfter.status}`,
  );
  stream.destroy();
}

// ---- "Approve on Mac": the Bento Code app asks, you answer on the Mac
{
  const fromPage = await post('/api/connect', { name: 'iPhone', kind: 'phone' }, null, {
    origin: `http://127.0.0.1:${port}`,
  });
  check(
    fromPage.status === 403 && asks.length === 0,
    'a web page can’t ask to connect (only the app can), so it can’t raise the dialog',
    fromPage.status,
  );
  const a = await post('/api/connect', { name: 'Lin’s iPhone<b>', kind: 'phone' });
  check(
    a.status === 200 &&
      /^\d{4}$/.test(a.json?.code || '') &&
      a.json.id &&
      a.json.secret &&
      a.json.mac === 'Test Mac' &&
      asks.length === 1 &&
      asks[0].code === a.json.code &&
      asks[0].name === 'Lin’s iPhoneb' &&
      !('secret' in asks[0]),
    'the app asks: the Mac is shown its name and the same 4-digit number (never its secret)',
    a.text,
  );
  const busy = await post('/api/connect', { name: 'Someone else', kind: 'phone' });
  check(
    busy.status === 429 && asks.length === 1,
    'while one request waits, nobody else can raise another',
    busy.status,
  );
  check(
    host.state().ask?.code === a.json.code,
    'Settings knows a device is asking',
    JSON.stringify(host.state().ask),
  );
  const guess = await post('/api/connect/state', { id: a.json.id, secret: 'a-guess' });
  check(
    guess.status === 404,
    'without the request’s secret, nobody can hear the answer',
    guess.status,
  );
  const waiting = post('/api/connect/state', { id: a.json.id, secret: a.json.secret });
  await new Promise((r) => setTimeout(r, 150));
  check(host.answer(a.json.id, true) === true, 'Allow, on the Mac', '');
  const w = await waiting;
  check(
    w.status === 200 && w.json?.state === 'allowed' && /^[0-9A-Z]{8}$/.test(w.json.pair || ''),
    'the waiting app hears Allow at once, with a one-time code',
    w.text,
  );
  const again = await post('/api/connect/state', { id: a.json.id, secret: a.json.secret });
  check(again.status === 404, 'that code is handed out once', again.status);
  const paired = await post('/api/pair', { code: w.json.pair, name: 'iPhone' });
  check(
    paired.status === 200 && paired.json?.token,
    'the app’s page trades the code for its own key, as with the QR code',
    paired.text,
  );
  host.forget(paired.json.device.id);
  const b = await post('/api/connect', { name: 'iPad', kind: 'tablet' });
  check(host.answer(b.json.id, false) && !host.answer(b.json.id, true), 'Don’t Allow is final', '');
  const no = await post('/api/connect/state', { id: b.json.id, secret: b.json.secret });
  const soon = await post('/api/connect', { name: 'iPad', kind: 'tablet' });
  check(
    no.json?.state === 'denied' && soon.status === 429,
    'Don’t Allow is heard, and then nobody may ask for a while',
    `${no.text} ${soon.status}`,
  );
  await new Promise((r) => setTimeout(r, 450));
  const d = await post('/api/connect', { name: 'iPad', kind: 'tablet' });
  const quit = await post('/api/connect/cancel', { id: d.json?.id, secret: d.json?.secret });
  check(
    quit.json?.state === 'expired' && !host.state().ask && !host.answer(d.json.id, true),
    'the app can take its request back (and the dialog goes)',
    quit.text,
  );
  const c = await post('/api/connect', { name: 'iPad', kind: 'tablet' });
  const t0 = Date.now();
  const gone = await post('/api/connect/state', { id: c.json?.id, secret: c.json?.secret });
  check(
    askEnds.join() === 'allowed,denied,expired,expired' &&
      c.status === 200 &&
      gone.json?.state === 'expired' &&
      Date.now() - t0 < 3000 &&
      !host.state().ask &&
      !host.answer(c.json.id, true),
    'a request nobody answers runs out, and a late Allow does nothing',
    `${askEnds} ${c.status} ${gone.text}`,
  );
}

// ---- guessing codes gets nowhere fast
{
  host.newPairing();
  let last;
  for (let i = 0; i < 32; i++)
    last = await post('/api/pair', { code: `ZZZZ${String(i).padStart(4, '0')}` });
  check(
    last.status === 429,
    'after 30 wrong codes in a minute, pairing waits (whatever address the tries come from)',
    last.status,
  );
}

// ---- addresses: Tailscale always, your Wi-Fi only when you say so
{
  const ifs = {
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    en1: [{ family: 'IPv4', address: '192.168.1.20', internal: false }],
    utun9: [{ family: 'IPv4', address: '100.101.102.103', internal: false }],
    en5: [{ family: 'IPv4', address: '8.8.4.4', internal: false }],
  };
  const a = addressesOf(ifs, { wifi: false })
    .map((x) => `${x.kind}:${x.ip}`)
    .join(' ');
  const b = addressesOf(ifs, { wifi: true })
    .map((x) => `${x.kind}:${x.ip}`)
    .join(' ');
  check(
    a === 'tailscale:100.101.102.103' && b === 'wifi:192.168.1.20 tailscale:100.101.102.103',
    'Bento listens on Tailscale; on your Wi-Fi only when turned on; never on a public address',
    `${a} | ${b}`,
  );
}

// ---- the same lessons on every device
{
  const now = 1_000_000_000;
  const mine = [
    { id: 'new-here', createdAt: now - 10_000 },
    { id: 'writing', status: 'streaming', code: 'newer words', createdAt: now - 400_000 },
    { id: 'kept', title: 'old title', createdAt: now - 900_000 },
    { id: 'deleted-there', createdAt: now - 900_000 },
  ];
  const theirs = [
    { id: 'from-phone', createdAt: now - 5_000 },
    { id: 'writing', status: 'streaming', code: 'older', createdAt: now - 400_000 },
    { id: 'kept', title: 'renamed on the phone', createdAt: now - 900_000 },
  ];
  const m = mergeLessons(mine, theirs, new Map([['writing', () => {}]]), now);
  check(
    m.map((l) => l.id).join(',') === 'new-here,from-phone,writing,kept' &&
      m[2].code === 'newer words' &&
      m[3].title === 'renamed on the phone',
    'another device’s lessons win, except one being written here and one just made here; one deleted there goes',
    JSON.stringify(m.map((l) => [l.id, l.code || l.title])),
  );
}

// the phone gets the page's own Content-Security-Policy, however index.html's tag is formatted
{
  const real = pageCsp(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  check(
    /img-src 'self' data: blob: https:\/\/avatars\.githubusercontent\.com/.test(real),
    "the phone page keeps index.html's policy (avatars and inline images allowed)",
    real.slice(0, 120),
  );
  check(
    pageCsp('<meta http-equiv="Content-Security-Policy" content="img-src data:">') ===
      'img-src data:' && pageCsp('<title>x</title>') === "default-src 'self'",
    'a one-line tag is read too, and no tag means only the page’s own files',
  );
}

await host.stop();
fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} check(s) failed.` : '\nPhones and iPads connect safely.');
process.exit(fail ? 1 : 0);
