// Videos play only while you can see them; sections rise in as you reach them; the latest version and the star count
// come from GitHub when it answers (the page works the same when it doesn't).
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const seen = new IntersectionObserver((es) => {
  for (const e of es) {
    const v = e.target;
    if (v.tagName === 'VIDEO') { if (e.isIntersecting && !still) v.play().catch(() => {}); else v.pause(); }
    else if (e.isIntersecting) { v.classList.add('in'); seen.unobserve(v); }
  }
}, { threshold: 0.25 });
document.querySelectorAll('video').forEach((v) => seen.observe(v));
document.querySelectorAll('.split, .wide, .grid-sec .card, .grid-sec .head, .phone-sec, .open, .last, .works').forEach((el) => { el.classList.add('rv'); seen.observe(el); });

// an Intel Mac says so in its user agent only in some browsers; when it does, its button gets the Intel build
if (/Intel Mac/.test(navigator.userAgent) && navigator.userAgentData?.platform === 'macOS') {
  navigator.userAgentData.getHighEntropyValues?.(['architecture']).then((h) => {
    if (h.architecture === 'x86') document.querySelectorAll('[data-dl]').forEach((a) => { a.href = a.href.replace('arm64', 'x64'); });
  }).catch(() => {});
}

fetch('https://api.github.com/repos/lhz56/bento-releases/releases/latest').then((r) => (r.ok ? r.json() : null)).then((j) => {
  if (j?.tag_name) document.querySelectorAll('[data-version]').forEach((s) => { s.textContent = `· ${j.tag_name}`; });
}).catch(() => {});
fetch('https://api.github.com/repos/lhz56/bento').then((r) => (r.ok ? r.json() : null)).then((j) => {
  const n = j?.stargazers_count; if (n == null) return;
  document.querySelectorAll('[data-stars]').forEach((s) => { s.textContent = n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); });
}).catch(() => {});
