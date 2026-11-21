// The page's motion: videos play only while you can see them, sections arrive as you reach them, the hero recording
// tilts flat as you scroll, the headline names what you could learn, a link types itself, the box's lid lifts off,
// a terminal builds Bento. The latest version and the star count come from GitHub when it answers.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// videos: play in view, pause out of it
const vids = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting && !still) e.target.play().catch(() => {}); else e.target.pause();
}), { threshold: 0.2 });
$$('video').forEach((v) => vids.observe(v));

// arrivals, and things that start when you reach them
const once = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return; const el = e.target; once.unobserve(el);
  el.classList.add('in'); el.dispatchEvent(new Event('arrive'));
}), { threshold: 0.18 });
$$('.works, .ask-wall h2, .split .copy, .split .clip, .apart-in > *, .head, .box, .duo, .phone-sec .chips, .open .copy, .term, .last > *').forEach((el) => { el.classList.add('rv'); once.observe(el); });

// the hero recording lies back, then stands up as you scroll
const tilt = document.querySelector('.tilt');
let ticking = false;
const onScroll = () => {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    if (tilt && !still) { const r = tilt.getBoundingClientRect(); const k = Math.min(1, Math.max(0, (r.top - innerHeight * 0.18) / (innerHeight * 0.62))); tilt.parentElement.style.setProperty('--t', k.toFixed(3)); }
    // the nav turns dark over the dark sections
    const y = 40; const dark = $$('.apart, .phone-sec').some((s) => { const b = s.getBoundingClientRect(); return b.top < y && b.bottom > y; });
    document.querySelector('.nav').classList.toggle('on-dark', dark);
  });
};
addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();

// the headline: software, Discord, Uber…
const rotW = document.querySelector('.rot-w');
if (rotW && !still) {
  const box = rotW.parentElement; const words = rotW.dataset.words.split('|').map((w) => w.replace(/&nbsp;/g, ' '));
  const size = () => { box.style.width = `${rotW.getBoundingClientRect().width + parseFloat(getComputedStyle(box).paddingLeft) * 2}px`; };
  document.fonts?.ready.then(size); size();
  let i = 0;
  setInterval(async () => {
    rotW.classList.add('out'); await sleep(360);
    i = (i + 1) % words.length; rotW.textContent = words[i]; rotW.classList.remove('out'); size();
    rotW.classList.add('in'); await sleep(520); rotW.classList.remove('in');
  }, 2600);
}

// the question wall loops seamlessly: each row carries a copy of itself
$$('.marquee .row').forEach((r) => { r.innerHTML += r.innerHTML; });

// a GitHub link types itself into the bar
const typed = document.querySelector('[data-type]');
if (typed) {
  const bar = typed.closest('.urlbar'); const text = typed.dataset.type;
  const run = async () => { for (;;) { bar.classList.remove('done'); typed.textContent = ''; for (const ch of text) { typed.textContent += ch; await sleep(55 + Math.random() * 50); } bar.classList.add('done'); await sleep(4200); } };
  if (still) { typed.textContent = text; bar.classList.add('done'); } else bar.closest('.apart-in').addEventListener('arrive', run, { once: true });
  once.observe(bar.closest('.apart-in'));
}

// the lid lifts off the box
const bx = document.querySelector('.box');
bx?.addEventListener('arrive', () => setTimeout(() => bx.classList.add('lifted'), 250), { once: true });

// a terminal builds Bento
const term = document.querySelector('[data-term]');
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
        if (k === 'cmd') { for (let j = 0; j <= t.length; j++) { term.innerHTML = html(n, t.slice(0, j)); await sleep(28 + Math.random() * 30); } await sleep(350); }
        else { await sleep(500); }
        term.innerHTML = html(n + 1);
      }
      await sleep(5000);
    }
  };
  if (still) term.innerHTML = html(lines.length); else document.querySelector('.term').addEventListener('arrive', run, { once: true });
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
