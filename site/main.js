// The page's motion: recordings play only while you can see them, things arrive as you reach them, the headline names
// what you could take apart, the hero's notes light up with the recording, questions type themselves, a link types
// itself into the blueprint, the box's drawings move, a terminal builds Bento. Version and stars come from GitHub.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// recordings: play in view, pause out of it
const vids = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting && !still) e.target.play().catch(() => {}); else e.target.pause();
}), { threshold: 0.2 });
$$('video').forEach((v) => vids.observe(v));

// arrivals, and things that start when you reach them
const once = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return; const el = e.target; once.unobserve(el);
  el.classList.add('in'); el.dispatchEvent(new Event('arrive'));
}), { threshold: 0.2 });
$$('.parts, .prompt-sec, .sheet-copy, .sheet > .specimen, .soon-art, .bp-in > *, .bench, .promise, .term, .last > h2').forEach((el) => { el.classList.add('rv'); once.observe(el); });

// the bar marks the section you're in
const marks = $$('.links a').map((a) => [a, document.querySelector(a.getAttribute('href'))]).filter(([, s]) => s);
const onScroll = () => {
  const y = innerHeight * 0.35; let cur = null;
  for (const [a, s] of marks) { const b = s.getBoundingClientRect(); if (b.top < y && b.bottom > y) cur = a; }
  marks.forEach(([a]) => a.classList.toggle('on', a === cur));
};
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// the headline: software, Discord, Uber… with the highlighter wiping across each new word
const w = $('.swap-w');
if (w && !still) {
  const box = w.parentElement; const words = w.dataset.words.split('|').map((x) => x.replace(/&nbsp;/g, ' '));
  const size = () => { box.style.width = `${w.getBoundingClientRect().width}px`; };
  document.fonts?.ready.then(size); size();
  let i = 0;
  setInterval(async () => {
    box.classList.add('wipe'); w.classList.add('out'); await sleep(330);
    i = (i + 1) % words.length; w.textContent = words[i]; w.classList.remove('out'); size();
    w.classList.add('in'); await sleep(120); box.classList.remove('wipe'); await sleep(400); w.classList.remove('in');
  }, 2600);
}

// the hero's notes (A–D) light up as the recording reaches each step
const hv = $('.hero-spec video'); const notes = $$('.notes li');
if (hv && notes.length) {
  hv.addEventListener('timeupdate', () => {
    if (!hv.duration) return; const k = Math.min(notes.length - 1, Math.floor((hv.currentTime / hv.duration) * notes.length));
    notes.forEach((n, j) => n.classList.toggle('on', j === k));
  });
}

// questions type themselves
const q = $('[data-qs]');
if (q && !still) {
  const qs = q.dataset.qs.split('|');
  const run = async () => {
    for (let i = 0; ; i = (i + 1) % qs.length) {
      const t = qs[i];
      for (let j = 0; j <= t.length; j++) { q.textContent = t.slice(0, j); await sleep(38 + Math.random() * 40); }
      await sleep(1700);
      for (let j = t.length; j >= 0; j -= 2) { q.textContent = t.slice(0, j); await sleep(14); }
      await sleep(250);
    }
  };
  q.textContent = ''; $('.prompt-sec').addEventListener('arrive', run, { once: true });
}

// a GitHub link types itself into the blueprint
const typed = $('[data-type]');
if (typed) {
  const bar = typed.closest('.urlbar'); const text = typed.dataset.type;
  const run = async () => { for (;;) { bar.classList.remove('done'); typed.textContent = ''; await sleep(500); for (const ch of text) { typed.textContent += ch; await sleep(60 + Math.random() * 60); } await sleep(300); bar.classList.add('done'); await sleep(4200); } };
  if (still) { typed.textContent = text; bar.classList.add('done'); } else bar.addEventListener('arrive', run, { once: true });
  bar.classList.add('rv'); once.observe(bar);
}

// the bench: each drawer opens its recording; the open one fills as it plays, then the next one opens
const stage = $('.stage');
if (stage) {
  const v = $('video', stage); const tabs = $$('.drawers button'); let cur = 0;
  const show = async (i, play = true) => {
    cur = (i + tabs.length) % tabs.length; const name = tabs[cur].dataset.clip;
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === cur)); t.style.setProperty('--p', 0); });
    $('[data-fig]').textContent = tabs[cur].querySelector('i').textContent;
    stage.classList.add('swap'); await sleep(200);
    v.poster = `media/${name}.jpg`; v.src = `media/${name}.mp4`; v.load();
    stage.classList.remove('swap');
    if (play && !still) v.play().catch(() => {});
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));
  v.addEventListener('timeupdate', () => { if (v.duration) tabs[cur].style.setProperty('--p', (v.currentTime / v.duration).toFixed(3)); });
  v.addEventListener('ended', () => show(cur + 1));
  // the next drawer's recording waits in the cache
  v.addEventListener('playing', () => { const n = tabs[(cur + 1) % tabs.length].dataset.clip; const l = document.createElement('link'); l.rel = 'prefetch'; l.href = `media/${n}.mp4`; document.head.appendChild(l); });
}

// a terminal builds Bento
const term = $('[data-term]');
if (term) {
  const lines = [
    ['cmd', 'git clone https://github.com/lhz56/bento'], ['dim', 'Cloning into ‘bento’… done.'],
    ['cmd', 'cd bento && npm install'], ['dim', 'added 412 packages in 9s'],
    ['cmd', 'npm run dev'], ['ok', '✓ Bento is running. Ask it anything.'],
  ];
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const html = (n, partial) => lines.slice(0, n).map(([k, t]) => (k === 'cmd' ? `<span class="p">$</span> ${esc(t)}` : `<span class="${k}">${esc(t)}</span>`)).join('\n') + (partial != null ? `${n ? '\n' : ''}<span class="p">$</span> ${esc(partial)}` : '') + '<span class="cur"></span>';
  const run = async () => {
    for (;;) {
      for (let n = 0; n < lines.length; n++) {
        const [k, t] = lines[n];
        if (k === 'cmd') { for (let j = 0; j <= t.length; j++) { term.innerHTML = html(n, t.slice(0, j)); await sleep(28 + Math.random() * 30); } await sleep(350); } else await sleep(500);
        term.innerHTML = html(n + 1);
      }
      await sleep(5000);
    }
  };
  if (still) term.innerHTML = html(lines.length); else $('.term').addEventListener('arrive', run, { once: true });
}

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
  $$('[data-stars]').forEach((s) => { s.textContent = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); });
}).catch(() => {});
