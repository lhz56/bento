// Turns a raw recording (frames + what happened when, from record-media.mjs or record-phone.mjs) into a finished clip:
// the window floats on a soft Bento backdrop, a camera glides in on whatever is happening and back out, slow parts
// play faster, and a short caption names each step. Drawn frame by frame on a canvas in headless Chromium.
//
//   node scripts/compose-media.mjs <raw dir> <out.mp4> [--w 1920 --h 1200]
//   raw dir: frames/*.jpg and track.json { kind: 'mac'|'phone', W, H, frames: [{ f, t }], cam: [{ t, x, y, z }],
//            caps: [{ t, text, n }], speed: [{ t, r }] }   (t in seconds, x/y in page pixels; z 1 = the whole window)
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
export async function compose(raw, out, { W, H, fps = 30, crf = 25 } = {}) {
  const tr = JSON.parse(fs.readFileSync(path.join(raw, 'track.json'), 'utf8'));
  const phone = tr.kind === 'phone';
  const OW = W || (phone ? 1080 : 1920), OH = H || (phone ? 1350 : 1200); // a phone films upright, 4:5
  const t0 = tr.frames[0].t, tEnd = Math.max(tr.frames.at(-1).t, tr.end ?? 0); // a still screen sends no frames: hold the last one until filming stopped
  // where the window sits on the backdrop at z = 1: a little high, leaving room for the caption underneath
  // a phone gets a status bar above its page (the page itself starts at the very top)
  const SB = phone ? 50 : 0, EH = tr.H + SB;
  const ww = phone ? OH * 0.8 * tr.W / EH : OW * 0.84, wh = ww * EH / tr.W;
  const wx = (OW - ww) / 2, wy = phone ? (OH - wh) / 2 - OH * 0.035 : (OH - wh) / 2 - 42;
  const toComp = (x, y) => [wx + x * ww / tr.W, wy + (y + SB) * wh / EH];

  // the source time each output frame shows: slow parts (marked in the track) play faster
  const rateAt = (s) => { let r = 1; for (const k of tr.speed || []) if (k.t <= s) r = k.r; return r; };
  // camera targets, smoothed by a critically damped spring so every move eases in and settles
  const camAt = (s) => { let c = { x: tr.W / 2, y: tr.H / 2, z: 1 }; for (const k of tr.cam || []) if (k.t <= s) c = k; return c; };
  const clamp = (C, z) => { // zoomed in, stay on the window (a little backdrop at its edge, never more)
    const hx = OW / 2 / z, hy = OH / 2 / z, m = 36;
    const ax = (lo, hi, h, v) => (hi - lo < 2 * h ? (lo + hi) / 2 : Math.min(Math.max(v, lo + h), hi - h));
    const bx = ax(Math.max(0, wx - m), Math.min(OW, wx + ww + m), hx, C[0]), by = ax(Math.max(0, wy - m), Math.min(OH, wy + wh + m), hy, C[1]);
    const k = Math.min(1, (z - 1) / 0.25); // blend in, so leaving z = 1 doesn't jump
    return [OW / 2 + (bx - OW / 2) * k, OH / 2 + (by - OH / 2) * k];
  };
  const plan = [];
  let s = t0, cx = OW / 2, cy = OH / 2, lz = 0, vx = 0, vy = 0, vz = 0, fi = 0, capI = -1, capSince = 0, prevCap = null;
  const dt = 1 / fps, w0 = 7.5; // spring stiffness: ~0.7 s to settle
  for (let k = 0; s <= tEnd + 0.0001; k++) {
    while (fi + 1 < tr.frames.length && tr.frames[fi + 1].t <= s) fi++;
    const tg = camAt(s); const [gx, gy] = tg.z <= 1.001 ? [OW / 2, OH / 2] : toComp(tg.x, tg.y); const gz = Math.log(tg.z);
    const step = (p, v, g) => { const a = -w0 * w0 * (p - g) - 2 * w0 * v; v += a * dt; return [p + v * dt, v]; };
    if (k === 0) { cx = gx; cy = gy; lz = gz; } else { [cx, vx] = step(cx, vx, gx); [cy, vy] = step(cy, vy, gy); [lz, vz] = step(lz, vz, gz); }
    const z = Math.max(1, Math.exp(lz)); const [ccx, ccy] = z <= 1.0005 ? [OW / 2, OH / 2] : clamp([cx, cy], z);
    // the caption showing now, and how long it has been showing (in output time)
    let ci = -1; (tr.caps || []).forEach((c, i) => { if (c.t <= s) ci = i; });
    if (ci !== capI) { prevCap = capI >= 0 ? { ...tr.caps[capI], since: k * dt } : null; capI = ci; capSince = k * dt; }
    const cap = ci >= 0 && tr.caps[ci].text ? { text: tr.caps[ci].text, n: tr.caps[ci].n, age: k * dt - capSince } : null;
    const old = prevCap && prevCap.text && k * dt - prevCap.since < 0.25 ? { text: prevCap.text, n: prevCap.n, age: k * dt - prevCap.since } : null;
    plan.push({ f: tr.frames[fi].f, C: [ccx, ccy], z, cap, old });
    s += dt * rateAt(s);
  }
  // hold the last picture a moment, then let the loop begin again
  for (let i = 0; i < Math.round(fps * 0.4); i++) plan.push({ ...plan.at(-1) });

  const exe = ['chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
    .map((p) => path.join(os.homedir(), 'Library/Caches/ms-playwright', p)).find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: OW, height: OH } });
  await page.route('http://compose.local/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: `<body style="margin:0"><canvas id=c width=${OW} height=${OH}></canvas>` });
    return r.fulfill({ path: path.join(raw, 'frames', path.basename(u.pathname)) });
  });
  await page.goto('http://compose.local/');
  await page.evaluate(([OW, OH, wx, wy, ww, wh, phone, sbk]) => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    // the backdrop: Bento's paper, a warm glow and a cool one, and a faint grid fading out
    const bg = new OffscreenCanvas(OW, OH), b = bg.getContext('2d');
    const lin = b.createLinearGradient(0, 0, OW, OH); lin.addColorStop(0, '#fbf3ea'); lin.addColorStop(1, '#f1ebf6'); b.fillStyle = lin; b.fillRect(0, 0, OW, OH);
    const blob = (x, y, r, col) => { const rg = b.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = rg; b.fillRect(0, 0, OW, OH); };
    blob(OW * 0.12, OH * 0.1, OW * 0.55, 'rgba(255,170,130,.55)'); blob(OW * 0.92, OH * 0.95, OW * 0.55, 'rgba(176,156,255,.45)'); blob(OW * 0.75, OH * 0.05, OW * 0.3, 'rgba(255,214,160,.35)');
    b.strokeStyle = 'rgba(120,100,80,.07)'; b.lineWidth = 1; const gs = OW / 30;
    for (let x = 0; x < OW; x += gs) { b.beginPath(); b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, OH); b.stroke(); }
    for (let y = 0; y < OH; y += gs) { b.beginPath(); b.moveTo(0, y + 0.5); b.lineTo(OW, y + 0.5); b.stroke(); }
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const R = phone ? ww * 0.16 : ww * 0.0095;
    let last = null, img = null; const px = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
    const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const pill = (cap, out) => {
      const a = out ? 1 - ease(cap.age / 0.22) : ease(cap.age / 0.35); if (a <= 0) return;
      const dy = out ? -14 * (1 - a) : 22 * (1 - a);
      g.save(); g.globalAlpha = a; g.font = `600 ${OH * 0.03}px -apple-system, "SF Pro Display", system-ui`;
      const tw = g.measureText(cap.text).width, H = OH * 0.062, dot = cap.n ? H * 0.62 : 0, pad = H * 0.42;
      const W = tw + pad * 2 + (dot ? dot + pad * 0.5 : 0), x = (OW - W) / 2, y = OH - H - OH * 0.032 + dy;
      g.shadowColor = 'rgba(30,20,10,.28)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
      rr(x, y, W, H, H / 2); g.fillStyle = 'rgba(28,24,20,.94)'; g.fill(); g.shadowColor = 'transparent';
      let tx = x + pad;
      if (dot) { g.fillStyle = '#ff6b3d'; g.beginPath(); g.arc(x + pad * 0.55 + dot / 2, y + H / 2, dot / 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.font = `700 ${dot * 0.56}px ui-monospace, "SF Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(cap.n), x + pad * 0.55 + dot / 2, y + H / 2 + 1);
        tx = x + pad * 0.55 + dot + pad * 0.55; g.font = `600 ${OH * 0.03}px -apple-system, "SF Pro Display", system-ui`; }
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(cap.text, tx, y + H / 2 + 1); g.restore();
    };
    window.draw = async ({ f, C, z, cap, old }) => {
      if (f !== last) { img?.close?.(); img = await createImageBitmap(await (await fetch(`/f/${f}`)).blob()); last = f; }
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg, 0, 0);
      g.setTransform(z, 0, 0, z, OW / 2 - C[0] * z, OH / 2 - C[1] * z);
      g.save(); g.shadowColor = 'rgba(50,30,10,.30)'; g.shadowBlur = 70; g.shadowOffsetY = 34; rr(wx, wy, ww, wh, R); g.fillStyle = '#e9e4dc'; g.fill(); g.restore();
      if (phone) { g.save(); rr(wx - ww * 0.035, wy - ww * 0.035, ww * 1.07, wh + ww * 0.07, R + ww * 0.035); g.fillStyle = '#121014'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#3a363f'; g.stroke(); g.restore(); }
      g.save(); rr(wx, wy, ww, wh, R); g.clip(); g.imageSmoothingQuality = 'high';
      if (phone) {
        // the status bar takes the colour of the page's top edge
        const sb = wh * sbk; px.drawImage(img, img.width / 2, 2, 1, 1, 0, 0, 1, 1); const [r, gg, bb] = px.getImageData(0, 0, 1, 1).data;
        g.fillStyle = `rgb(${r},${gg},${bb})`; g.fillRect(wx, wy, ww, sb + 2); g.drawImage(img, wx, wy + sb, ww, wh - sb);
        const dark = r * 0.3 + gg * 0.59 + bb * 0.11 < 120; g.fillStyle = dark ? '#fff' : '#111';
        g.font = `600 ${sb * 0.36}px -apple-system, "SF Pro Text", system-ui`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('9:41', wx + ww * 0.17, wy + sb * 0.56);
        const bx = wx + ww * 0.8, by = wy + sb * 0.56; // signal, wifi, battery
        for (let i = 0; i < 4; i++) { const h = sb * (0.1 + i * 0.05); g.fillRect(bx - ww * 0.06 + i * ww * 0.012, by + sb * 0.12 - h, ww * 0.008, h); }
        g.beginPath(); g.arc(bx + ww * 0.03, by + sb * 0.12, sb * 0.24, -Math.PI * 0.75, -Math.PI * 0.25); g.lineTo(bx + ww * 0.03, by + sb * 0.12); g.fill();
        g.save(); g.globalAlpha = 0.4; rr(bx + ww * 0.07, by - sb * 0.12, ww * 0.06, sb * 0.24, sb * 0.07); g.lineWidth = 1.5; g.strokeStyle = g.fillStyle; g.stroke(); g.restore();
        rr(bx + ww * 0.075, by - sb * 0.08, ww * 0.045, sb * 0.16, sb * 0.04); g.fill();
      } else g.drawImage(img, wx, wy, ww, wh);
      g.restore();
      if (!phone) { g.save(); rr(wx, wy, ww, wh, R); g.lineWidth = 1.5 / z; g.strokeStyle = 'rgba(31,27,22,.16)'; g.stroke(); g.restore(); }
      else { g.save(); g.fillStyle = '#000'; const iw = ww * 0.31, ih = ww * 0.088; rr(wx + (ww - iw) / 2, wy + ww * 0.028, iw, ih, ih / 2); g.fill(); g.restore(); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (old) pill(old, true); if (cap) pill(cap, false);
      return c.toDataURL('image/jpeg', 0.93);
    };
  }, [OW, OH, wx, wy, ww, wh, phone, SB / EH]);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-comp-'));
  for (let i = 0; i < plan.length; i++) {
    const url = await page.evaluate((p) => window.draw(p), plan[i]);
    fs.writeFileSync(path.join(dir, `o${String(i).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'o%05d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg failed');
  // the poster: the clip's busiest, most zoomed-out moment is its last frame
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.1', '-i', out, '-frames:v', '1', '-q:v', '3', out.replace(/\.mp4$/, '.jpg')]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✓ ${path.basename(out)} · ${(plan.length / fps).toFixed(1)}s · ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await compose(path.resolve(process.argv[2]), path.resolve(process.argv[3]), { W: Number(arg('--w', 0)) || undefined, H: Number(arg('--h', 0)) || undefined });
}
