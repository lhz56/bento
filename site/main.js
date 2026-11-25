// Recordings play only while you can see them, sections fade in once, the feature tabs play through by themselves,
// the nav marks where you are. The version and star count come from GitHub.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// recordings: play in view, pause out of it
const vids = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting && !still) e.target.play().catch(() => {}); else e.target.pause();
}), { threshold: 0.25 });
$$('video').forEach((v) => vids.observe(v));

// arrivals
const once = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return; once.unobserve(e.target); e.target.classList.add('in');
}), { threshold: 0.15 });
$$('.ais, .feature .copy, .feature .window, .tabs, .facts, .open > *, .last').forEach((el) => { el.classList.add('rv'); once.observe(el); });

// nav: a hairline once you scroll, and the section you're in
const nav = $('.nav');
const marks = $$('.links a').map((a) => [a, $(a.getAttribute('href'))]).filter(([, s]) => s);
const onScroll = () => {
  nav.classList.toggle('scrolled', scrollY > 8);
  const y = innerHeight * 0.4; let cur = null;
  for (const [a, s] of marks) { const b = s.getBoundingClientRect(); if (b.top < y && b.bottom > y) cur = a; }
  marks.forEach(([a]) => a.classList.toggle('on', a === cur));
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// feature tabs: each opens its recording; the open one fills as it plays, then the next one opens
const stage = $('.stage');
if (stage) {
  const v = $('video', stage); const tabs = $$('.tabs button'); const line = $('[data-line]'); let cur = 0;
  const lines = {
    practice: 'Push a puzzle to a billion and watch the answers race.',
    toolbelt: 'Every tool an app uses, and why it was picked.',
    hotspots: 'Where an app could break, in plain words.',
    files: 'Every file, sorted by what it does. Find any one.',
    path: 'From zero to a real app, one short stop at a time.',
  };
  const show = async (i) => {
    cur = (i + tabs.length) % tabs.length; const name = tabs[cur].dataset.clip;
    tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === cur))); stage.style.setProperty('--p', 0);
    stage.classList.add('swap'); line.classList.add('swap'); await sleep(200);
    v.poster = `media/${name}.jpg`; v.src = `media/${name}.mp4`; v.load(); line.textContent = lines[name] || '';
    stage.classList.remove('swap'); line.classList.remove('swap');
    if (!still) v.play().catch(() => {});
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));
  v.addEventListener('timeupdate', () => { if (v.duration) stage.style.setProperty('--p', (v.currentTime / v.duration).toFixed(3)); });
  v.addEventListener('ended', () => show(cur + 1));
  v.addEventListener('playing', () => { const n = tabs[(cur + 1) % tabs.length].dataset.clip; const l = document.createElement('link'); l.rel = 'prefetch'; l.href = `media/${n}.mp4`; document.head.appendChild(l); });
}

// copy the build commands
$$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1600);
}));

// an Intel Mac says so only in some browsers; when it does, its buttons get the Intel build
if (navigator.userAgentData?.platform === 'macOS') {
  navigator.userAgentData.getHighEntropyValues?.(['architecture']).then((h) => {
    if (h.architecture === 'x86') $$('[data-dl]').forEach((a) => { a.href = a.href.replace('arm64', 'x64'); });
  }).catch(() => {});
}

fetch('https://api.github.com/repos/lhz56/bento-releases/releases/latest').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (j?.tag_name) $$('[data-version]').forEach((s) => { s.textContent = `· ${j.tag_name}`; });
}).catch(() => {});
fetch('https://api.github.com/repos/lhz56/bento').then((r) => (r.ok ? r.json() : null)).then((j) => {
  const n = j?.stargazers_count; if (n == null) return;
  $$('[data-stars]').forEach((s) => { s.textContent = n < 10 ? 'Star' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); });
}).catch(() => {});

// visit and click counts for Lin's dashboard: one anonymous row per event (no cookies, no IP, no ID), sent to a small
// counter that only adds rows. Where a visit came from is just the other site's name (x.com, news.ycombinator.com).
const COUNT = 'https://cykxdotlcscwrnwgdtwl.supabase.co/rest/v1/rpc/bento_hit';
const KEY = 'sb_publishable_Q4Eu-Gj2XdubpQpz8YiQxg_s3LBYemA';
const from = (() => {
  try {
    const q = new URLSearchParams(location.search).get('ref') || new URLSearchParams(location.search).get('utm_source');
    if (q) return q.slice(0, 40);
    const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
    return h && h !== location.hostname ? h : null;
  } catch { return null; }
})();
const dev = matchMedia('(max-width: 700px)').matches ? 'phone' : 'computer';
const count = (ev, detail) => { try { fetch(COUNT, { method: 'POST', keepalive: true, headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ ev, detail: detail || null, ref: from, dev }) }).catch(() => {}); } catch {} };
count('view');
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a'); if (!a) return;
  const h = a.getAttribute('href') || '';
  if (/\.dmg$/.test(h)) count('click', 'download'); else if (/^try\/?$/.test(h)) count('click', 'try'); else if (/github\.com\/lhz56\/bento(\/|$)/.test(h)) count('click', 'github');
}, true);
