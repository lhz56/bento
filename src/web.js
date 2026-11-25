// Bento on the web (takeitapart.app/try): the same app, in any browser, with no AI behind it. Everything that ships
// already written works: the clever ideas, the path, puzzles, the daily bug, simulations and the featured apps taken
// apart, with lesson code running right in the page. Anything that needs an AI (a new question, a follow-up, taking
// apart another repo or a website) opens a sheet pointing to the Mac app instead. Built by `npm run build:web`.
export const WEB = import.meta.env.VITE_BENTO_WEB === '1';

export const MAC_ONLY = 'That needs the free Mac app: it uses the AI you already have.';
export const DOWNLOAD = 'https://takeitapart.app/';

// anonymous counts for Lin's dashboard, the same counter as the website's (site/main.js): one row per event, no cookies,
// no IP, no ID. Only the web version counts; the Mac app never does.
const COUNT = 'https://yngmegperhdsjxnmamtn.supabase.co/rest/v1/rpc/bento_hit';
const KEY = 'sb_publishable_SD2YnsphnqtARoCDCf39Vg_3OMHB4Ke';
const from = (() => { try { const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; return h && h !== location.hostname ? h : (h ? 'site' : null); } catch { return null; } })();
export const count = (ev, detail) => {
  if (!WEB) return;
  try { fetch(COUNT, { method: 'POST', keepalive: true, headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ ev, detail: detail || null, ref: from, dev: matchMedia('(max-width: 700px)').matches ? 'phone' : 'computer' }) }).catch(() => {}); } catch {}
};
const seen = new Set();
export const countOnce = (ev, key, detail) => { if (seen.has(ev + key)) return; seen.add(ev + key); count(ev, detail); };

// ask the page to show the "get the Mac app" sheet (ui/WebBar.jsx listens)
export const needsMac = (what) => { count('needs_mac', what); try { window.dispatchEvent(new CustomEvent('bento:needs-mac', { detail: what || null })); } catch {} };
const refuse = (what) => { needsMac(what); return Promise.reject(new Error(MAC_ONLY)); };

// a featured repo's files come straight from GitHub, read-only
const RAW = 'https://raw.githubusercontent.com';
const gh = (root) => (String(root).startsWith('gh:') ? String(root).slice(3) : null);

// a lesson's web page (runtime/runner.js runWeb): the Mac app serves it on its own origin; here it goes into a
// sandboxed frame (public/web-play.html, ui/Viz.jsx) with no access to this page. Same little script as the app's (electron/main.cjs
// PLAY_SHIM) reporting console output and hovered lines, plus a stand-in localStorage (a sandboxed frame has none).
const STORE_SHIM = '<script>(function(){try{localStorage.length}catch(e){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};try{Object.defineProperty(window,"localStorage",{value:s})}catch(x){}}})();<\/script>';
const PLAY_SHIM = STORE_SHIM + `<script>(function(){var send=function(k,a){try{parent.postMessage({bentoPlay:1,k:k,s:Array.prototype.map.call(a,function(x){try{return typeof x==='string'?x:JSON.stringify(x)}catch(e){return String(x)}}).join(' ')},'*')}catch(e){}};['log','info','warn','error'].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});window.addEventListener('error',function(e){send('error',[e.message+(e.lineno?' (line '+e.lineno+')':'')])});var last=null;document.addEventListener('mouseover',function(e){var el=e.target.closest&&e.target.closest('[data-bl]');if(el===last)return;if(last)last.style.outline=last.__o||'';last=el;if(el){el.__o=el.style.outline;el.style.outline='2px solid rgba(124,92,255,.7)';try{parent.postMessage({bentoPlay:1,k:'hover',line:+el.getAttribute('data-bl')},'*')}catch(x){}}},true);document.addEventListener('mouseleave',function(){if(last){last.style.outline=last.__o||'';last=null}try{parent.postMessage({bentoPlay:1,k:'hover',line:0},'*')}catch(x){}});})();<\/script>`;
const PLAY = new Map();
export function playPut(html, key) {
  const id = /^[a-z0-9-]{3,40}$/i.test(key || '') ? `l-${key.toLowerCase()}` : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const doc = String(html || '').slice(0, 400000);
  PLAY.set(id, /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => m + PLAY_SHIM) : PLAY_SHIM + doc);
  while (PLAY.size > 20) PLAY.delete(PLAY.keys().next().value);
  return Promise.resolve(id);
}
export const playDoc = (id) => PLAY.get(id) || '';

export const webBridge = {
  web: true,
  playPut,
  ask(_model, _prompt, { error }, kind) { needsMac(kind); setTimeout(() => error?.(MAC_ONLY), 0); return () => {}; },
  quick: () => refuse('quick'),
  cacheGet: async () => null,
  cachePut: async () => {},
  atlasReopen: async () => false,
  atlasList: async () => [],
  atlasFetch: async (full) => { countOnce('repo', full, full); return { kind: 'github', full, root: `gh:${full}` }; },
  async readFile(root, p) {
    const full = gh(root); if (!full) throw new Error(MAC_ONLY);
    const r = await fetch(`${RAW}/${full}/HEAD/${String(p).split('/').map(encodeURIComponent).join('/')}`);
    if (!r.ok) throw new Error(`GitHub didn’t send this file (${r.status}).`);
    return r.text();
  },
  atlasMeta: () => refuse('repo'), atlasAnalyze: () => refuse('repo'), atlasRefresh: () => refuse('repo'), atlasSearch: () => refuse('repo'),
  // browsing GitHub works (straight from the visitor's browser); taking a result apart is the Mac app's
  async ghSearch(q, { limit = 18, language, stars, size } = {}) {
    const words = [String(q || '').slice(0, 200), language && `language:${language}`, stars && `stars:${stars}`, size && `size:${size}`].filter(Boolean).join(' ');
    const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(words)}&sort=stars&per_page=${Math.min(+limit || 18, 30)}`);
    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub’s search limit for this browser was reached. Try again in a minute.' : `GitHub search failed (${r.status}).`);
    const j = await r.json();
    return (j.items || []).map((x) => ({ full: x.full_name, description: x.description, stars: x.stargazers_count, language: x.language, size: x.size, owner: x.owner?.login, updated: x.updated_at }));
  },
  findProject: () => Promise.reject(new Error(MAC_ONLY)), ghCode: () => refuse('repo'), siteInspect: () => refuse('site'),
  openFolder: async () => { needsMac('folder'); return null; },
  openExternal: async (u) => { try { window.open(u, '_blank', 'noopener'); } catch {} },
};
