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
  const [first, second] = ip.split('.').map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}
function isPrivate(ip) {
  if (net.isIPv4(ip)) return v4Private(ip);
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return v4Private(mapped[1]);
  return (
    lower === '::' ||
    lower === '::1' ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    /^ff/.test(lower) ||
    lower.startsWith('64:ff9b:') ||
    lower.startsWith('2001:db8')
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
    let target;
    try {
      target = new URL(url);
    } catch {
      return reject(new Error(`That isn’t a web address: ${url}`));
    }
    if (!/^https?:$/.test(target.protocol))
      return reject(new Error('Only http:// and https:// addresses can be fetched.'));
    if (!hostAllowed(target.hostname)) return reject(new Error(BLOCKED(target.hostname)));
    const mod = target.protocol === 'https:' ? https : http;
    const req = mod.request(
      target,
      {
        method,
        headers: { 'accept-encoding': 'identity', ...headers },
        lookup: guardedLookup,
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 5e6) {
            req.destroy();
            return;
          }
          chunks.push(chunk);
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
      req.destroy(new Error(`${target.hostname} took longer than 15 seconds to answer.`)),
    );
    req.on('error', (/** @type {NodeJS.ErrnoException} */ e) =>
      reject(
        e.code === 'EBLOCKED'
          ? e
          : new Error(
              e.code === 'ENOTFOUND'
                ? `Couldn't find ${target.hostname} (are you online?)`
                : e.message,
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
  let options = { ...opts };
  for (let hop = 0; hop < 6; hop++) {
    const res = await request(cur, options);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      cur = new URL(res.headers.location, cur).toString();
      if (
        res.status === 303 ||
        ((res.status === 301 || res.status === 302) && options.method && options.method !== 'GET')
      )
        options = { ...options, method: 'GET', body: undefined };
      continue;
    }
    return {
      status: res.status,
      type: String(res.headers['content-type'] || ''),
      text: res.text,
      rawHeaders: res.headers,
      url: cur,
    };
  }
  throw new Error('Too many redirects.');
}

const safeFetch = (url, opts) => follow(url, opts, once);
module.exports = { safeFetch, follow, once, isPrivate, hostAllowed };
