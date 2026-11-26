// Web requests for lesson code (urllib / requests / fetch inside Bento), made safely:
// - public internet only: loopback, private, link-local and other special addresses are refused,
//   checked at the moment of connecting (Node's lookup hook), so a name can't switch to a local
//   address after it's been checked (DNS rebinding), and every redirect is checked again;
// - http(s) only, 15 seconds, answers up to 5 MB, no cookies, at most 5 redirects.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');

function v4Private(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
function isPrivate(ip) {
  if (net.isIPv4(ip)) return v4Private(ip);
  const s = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return v4Private(mapped[1]);
  return (
    s === '::' ||
    s === '::1' ||
    /^f[cd]/.test(s) ||
    /^fe[89ab]/.test(s) ||
    /^ff/.test(s) ||
    s.startsWith('64:ff9b:') ||
    s.startsWith('2001:db8')
  );
}
const BLOCKED = (host) =>
  `Lessons can only reach the public internet, not ${host} (your Mac or your home network).`;
function hostAllowed(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.home.arpa')
  )
    return false;
  return !(net.isIP(h) && isPrivate(h));
}
// runs when the socket connects: refuse if the name resolves to a private address
/**
 * @param {string} hostname
 * @param {any} opts
 * @param {(err: Error | null, address?: any, family?: number) => void} cb
 */
function guardedLookup(hostname, opts, cb) {
  dns.lookup(hostname, { ...opts, all: true }, (err, /** @type {any[]} */ addrs) => {
    if (err) return cb(err);
    const bad = addrs.find((a) => isPrivate(a.address));
    if (bad) {
      return cb(Object.assign(new Error(BLOCKED(hostname)), { code: 'EBLOCKED' }));
    }
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}

/**
 * One request, no redirects.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: any }} [opts]
 */
function once(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`That isn’t a web address: ${url}`));
    }
    if (!/^https?:$/.test(u.protocol))
      return reject(new Error('Only http:// and https:// addresses can be fetched.'));
    if (!hostAllowed(u.hostname)) return reject(new Error(BLOCKED(u.hostname)));
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method,
        headers: { 'accept-encoding': 'identity', ...headers },
        lookup: guardedLookup,
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 5e6) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(new Error(`${u.hostname} took longer than 15 seconds to answer.`)),
    );
    req.on('error', (/** @type {NodeJS.ErrnoException} */ e) =>
      reject(
        e.code === 'EBLOCKED'
          ? e
          : new Error(
              e.code === 'ENOTFOUND' ? `Couldn't find ${u.hostname} (are you online?)` : e.message,
            ),
      ),
    );
    if (body != null && !['GET', 'HEAD'].includes(method)) req.write(body);
    req.end();
  });
}

// every hop goes through `request` (the guarded one), so a public site can't redirect you into your own network
/**
 * A request that follows redirects, checking every hop.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: any }} [opts]
 */
async function follow(url, opts = {}, request = once) {
  let cur = url;
  let o = { ...opts };
  for (let hop = 0; hop < 6; hop++) {
    const r = await request(cur, o);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      cur = new URL(r.headers.location, cur).toString();
      if (
        r.status === 303 ||
        ((r.status === 301 || r.status === 302) && o.method && o.method !== 'GET')
      )
        o = { ...o, method: 'GET', body: undefined };
      continue;
    }
    return {
      status: r.status,
      type: String(r.headers['content-type'] || ''),
      text: r.text,
      rawHeaders: r.headers,
      url: cur,
    };
  }
  throw new Error('Too many redirects.');
}

const safeFetch = (url, opts) => follow(url, opts, once);
module.exports = { safeFetch, follow, once, isPrivate, hostAllowed };
