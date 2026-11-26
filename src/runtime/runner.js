// Main-thread side of the code runners. One worker per language, restarted on timeout.
import JsWorker from './jsWorker.js?worker';
import PyWorker from './pyWorker.js?worker';
import { WEB, webBridge } from '../web.js';
// TypeScript runs as JavaScript once its types are stripped. Sucrase keeps every line where it was,
// so step-through, errors and line links still point at the right place. It loads the first time TypeScript runs.
let sucrase = null;
const stripTypes = async (code) =>
  (await (sucrase ??= import('sucrase'))).transform(code, {
    transforms: ['typescript'],
    disableESTransforms: true,
  }).code;

const make = { javascript: () => new JsWorker(), python: () => new PyWorker() };
const workers = {};
const pending = new Map();
let seq = 0;
export const pyState = { ready: false, listeners: new Set() };
const notify = () => pyState.listeners.forEach((f) => f(pyState.ready));

function get(lang) {
  if (!workers[lang]) {
    const w = make[lang]();
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.live) {
        p.onLive?.(e.data.live);
        return;
      } // lines printed while the program is still running
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      p.resolve(e.data.result);
    };
    workers[lang] = w;
  }
  return workers[lang];
}
function restart(lang) {
  workers[lang]?.terminate();
  delete workers[lang];
  if (lang === 'python') {
    pyState.ready = false;
    notify();
    warmPython();
  }
}

let playV = 0;
// Mark every element with the line it was written on, so pointing at it on the page can light up the code.
function tagLines(html) {
  let inRaw = null;
  return html
    .split('\n')
    .map((line, i) => {
      let out = '';
      let rest = line;
      while (rest) {
        if (inRaw) {
          const end = rest.search(new RegExp(`</${inRaw}\\s*>`, 'i'));
          if (end < 0) {
            out += rest;
            rest = '';
          } else {
            out += rest.slice(0, end);
            rest = rest.slice(end);
            inRaw = null;
          }
          continue;
        }
        const m = /<([a-zA-Z][\w-]*)(?=[\s>/])/.exec(rest);
        if (!m) {
          out += rest;
          break;
        }
        const tag = m[1].toLowerCase();
        out +=
          rest.slice(0, m.index) +
          `<${m[1]}` +
          (tag === 'html' || tag === 'head' ? '' : ` data-bl="${i + 1}"`);
        rest = rest.slice(m.index + m[0].length);
        if (tag === 'script' || tag === 'style') {
          const close = rest.indexOf('>');
          out += rest.slice(0, close + 1);
          rest = rest.slice(close + 1);
          inRaw = tag;
        }
      }
      return out;
    })
    .join('\n');
}
export async function runWeb(code, key) {
  const api = window.bento || (WEB ? webBridge : null);
  if (!api?.playPut)
    return { logs: [], visuals: [], error: { msg: 'Web pages run in the Bento app.', line: null } };
  const id = await api.playPut(tagLines(code), key);
  return { logs: [], visuals: [{ type: 'web', id, v: ++playV }], web: true };
}

export async function run(lang, mode, code, extra, opts = {}) {
  if (lang === 'html')
    return mode === 'run'
      ? runWeb(code, extra?.key)
      : {
          logs: [],
          visuals: [],
          error: {
            msg: 'Step-through works for Python, JavaScript and TypeScript. For web pages, change the code and watch the page update.',
            line: null,
          },
        };
  if (lang === 'typescript') {
    try {
      code = await stripTypes(code);
      if (extra?.setup) extra = { ...extra, setup: await stripTypes(extra.setup) };
    } catch (e) {
      return {
        logs: [],
        visuals: [],
        error: {
          msg: `TypeScript: ${String(e.message).replace(/\s*\(\d+:\d+\)$/, '')}`,
          line: e.loc?.line ?? null,
        },
      };
    }
  }
  lang = lang === 'python' ? 'python' : 'javascript';
  const id = ++seq;
  const w = get(lang);
  // programs that wait on purpose (sleep, countdowns, typing answers) get longer before Bento calls it an infinite loop
  const patient = /\bsleep\s*\(|setTimeout|setInterval|\bfetch\s*\(/.test(code);
  const limit = (lang === 'python' ? (pyState.ready ? 12000 : 30000) : 6000) * (patient ? 5 : 1);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      restart(lang);
      resolve({
        logs: [],
        visuals: [],
        error: { msg: `Stopped: took longer than ${limit / 1000}s (infinite loop?)`, line: null },
      });
    }, limit);
    pending.set(id, { resolve, timer, onLive: opts.onLive });
    w.postMessage({ id, mode, code, extra });
  });
}

export function warmPython() {
  const id = ++seq;
  const w = get('python');
  pending.set(id, {
    resolve: (r) => {
      pyState.ready = !r?.error;
      notify();
    },
    timer: null,
  });
  w.postMessage({ id, mode: 'boot' });
}

// TypeScript type checking: a separate worker that loads the compiler the first time it's needed.
let tsw = null;
let tsSeq = 0;
const tsPending = new Map();
export function typeCheck(code) {
  if (!tsw) {
    tsw = new Worker(new URL('./tsWorker.js', import.meta.url), { type: 'module' });
    tsw.onmessage = (e) => {
      const r = tsPending.get(e.data.id);
      if (r) {
        tsPending.delete(e.data.id);
        r(e.data.diags);
      }
    };
  }
  const id = ++tsSeq;
  return new Promise((resolve) => {
    tsPending.set(id, resolve);
    tsw.postMessage({ id, code });
    setTimeout(() => {
      if (tsPending.has(id)) {
        tsPending.delete(id);
        resolve([]);
      }
    }, 15000);
  });
}
