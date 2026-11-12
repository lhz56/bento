// Draws the installer window's background (build/background.tiff, 1× and 2× in one file).
//   npx electron scripts/dmg-background.cjs                     redraw build/background.tiff
//   npx electron scripts/dmg-background.cjs --preview out.png   also draw the whole window as Finder shows it, to look at
// The window's size and where Finder puts the two icons come from package.json (build.dmg), so the picture and the
// icons can't drift apart. The window's height includes Finder's title bar (about 32 points), so the picture is drawn
// for the 400 points below it; the strip underneath is plain paper in case the title bar is shorter.
// Finder always shows a window with a background picture in its light look, even in Dark Mode, so the names under
// the icons stay dark: keep the paper light.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform === 'darwin') app.dock?.hide(); // no Dock icon while it draws
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const dmg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build.dmg;
const W = dmg.window.width, H = dmg.window.height, TITLE_BAR = 32, SEEN = H - TITLE_BAR;
const ICON = dmg.iconSize || 80;
const appAt = dmg.contents.find((c) => c.type === 'file'), appsAt = dmg.contents.find((c) => c.type === 'link');
const previewTo = process.argv.includes('--preview') ? path.resolve(process.argv[process.argv.indexOf('--preview') + 1]) : null;

// The arrow runs between the two icons, a little above their middles, with room on both ends.
const gap = ICON / 2 + 22;
const x1 = appAt.x + gap, x2 = appsAt.x - gap, y = appAt.y - 6, lift = 34;

const design = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: #fbf8f3; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; position: relative; }
  .glow { position: absolute; left: 0; top: 0; width: ${W}px; height: ${SEEN}px; background:
    radial-gradient(300px 220px at 10% 0%, rgba(255, 138, 91, .20), transparent 70%),
    radial-gradient(300px 240px at 96% 6%, rgba(165, 139, 255, .16), transparent 70%),
    radial-gradient(340px 150px at 50% 104%, rgba(76, 201, 160, .13), transparent 70%); }
  .mark { position: absolute; left: 24px; top: 20px; display: flex; align-items: center; gap: 8px;
    font: 650 13px "SF Pro Rounded", ui-rounded, -apple-system, sans-serif; color: #2b241e; letter-spacing: -.1px; }
  .mark svg { display: block; }
  h1 { position: absolute; top: 62px; left: 0; right: 0; margin: 0; text-align: center;
    font: 600 25px "New York", "Iowan Old Style", Georgia, serif; color: #241e1a; letter-spacing: -.3px; }
  h1 em { color: #c94d1c; font-style: italic; }
  p { position: absolute; top: ${SEEN - 52}px; left: 0; right: 0; margin: 0; text-align: center; font-size: 12px; color: #6e655b; }
  .arrow { position: absolute; left: 0; top: 0; }
</style></head><body><div class="glow"></div>
  <div class="mark">
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="5.5" fill="#211c19"/>
      <rect x="3.6" y="3.6" width="5.6" height="12.8" rx="1.9" fill="#ff8a5b"/>
      <rect x="10.8" y="3.6" width="5.6" height="5.6" rx="1.9" fill="#4fd1a5"/>
      <rect x="10.8" y="10.8" width="5.6" height="5.6" rx="1.9" fill="#a58bff"/>
    </svg>Bento
  </div>
  <h1>Drag Bento into <em>Applications</em></h1>
  <svg class="arrow" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><marker id="a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L8 5 L1 9" fill="none" stroke="#ff6b3d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    <path d="M${x1} ${y} C ${x1 + (x2 - x1) * 0.28} ${y - lift}, ${x2 - (x2 - x1) * 0.28} ${y - lift}, ${x2} ${y}" fill="none" stroke="#ff6b3d" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" marker-end="url(#a)"/>
  </svg>
  <p>Then open Bento from Applications or Spotlight.</p>
</body></html>`;

// What Finder will show: a title bar, then the picture with both icons and their names on top.
const finder = (bg1, bg2, appIcon, appsIcon, alias) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: #1e1e1e; }
  .win { position: relative; width: ${W}px; height: ${H}px; margin: 24px; border-radius: 12px; overflow: hidden; box-shadow: 0 0 0 .5px rgba(255,255,255,.18), 0 18px 50px rgba(0,0,0,.55); }
  .bar { height: ${TITLE_BAR}px; background: #2c2b2e; display: flex; align-items: center; justify-content: center; position: relative; font: 600 13px -apple-system, sans-serif; color: #e8e6e3; }
  .dots { position: absolute; left: 14px; top: 10px; display: flex; gap: 8px; } .dots i { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .view { position: relative; height: ${SEEN}px; background: url("${bg1}"); background-image: image-set("${bg1}" 1x, "${bg2}" 2x); background-size: ${W}px auto; background-repeat: no-repeat; }
  .icon { position: absolute; width: ${ICON}px; text-align: center; transform: translate(-50%, -50%); }
  .icon img { width: ${ICON}px; height: ${ICON}px; display: block; }
  .icon .badge { position: absolute; left: 0; bottom: 0; width: ${ICON}px; height: ${ICON}px; }
  .icon span { position: absolute; left: 50%; transform: translateX(-50%); top: ${ICON + 3}px; font: ${dmg.iconTextSize || 12}px -apple-system, sans-serif; color: #000; white-space: nowrap; }
</style></head><body><div class="win">
  <div class="bar"><div class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>${(dmg.title || 'Bento').replace(/\$\{productName\}/g, 'Bento').replace(/\$\{version\}/g, require(path.join(ROOT, 'package.json')).version)}</div>
  <div class="view">
    <div class="icon" style="left:${appAt.x}px; top:${appAt.y}px"><img src="${appIcon}"><span>Bento</span></div>
    <div class="icon" style="left:${appsAt.x}px; top:${appsAt.y}px"><img src="${appsIcon}">${alias ? `<img class="badge" src="${alias}">` : ''}<span>Applications</span></div>
  </div>
</div></body></html>`;

app.on('window-all-closed', () => {}); // between the windows there are none; don't quit then
app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-dmg-'));
  try {
    const shot = async (file, w, h, scale) => {
      const win = new BrowserWindow({ show: false, width: w * scale, height: h * scale, useContentSize: true, frame: false, webPreferences: { offscreen: true } });
      await win.loadFile(file);
      await win.webContents.executeJavaScript(`document.documentElement.style.zoom = '${scale}'`); // 2×: the same design, twice the pixels
      await new Promise((r) => setTimeout(r, 500));
      const img = await win.webContents.capturePage({ x: 0, y: 0, width: w * scale, height: h * scale });
      win.destroy();
      return img.resize({ width: w * scale, height: h * scale }).toPNG();
    };
    const page = path.join(tmp, 'design.html');
    fs.writeFileSync(page, design);
    const one = path.join(tmp, 'background.png'), two = path.join(tmp, 'background@2x.png');
    fs.writeFileSync(one, await shot(page, W, H, 1)); fs.writeFileSync(two, await shot(page, W, H, 2));
    // one TIFF holding both sizes: sharp on Retina screens, right-sized on the rest
    execFileSync('/usr/bin/tiffutil', ['-cathidpicheck', one, two, '-out', path.join(OUT, 'background.tiff')]);
    console.log(`wrote build/background.tiff (${W}×${H}, 1× and 2×)`);

    if (previewTo) {
      const res = '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources';
      const png = (icns, name) => { const p = path.join(tmp, name); try { execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '256', icns, '--out', p], { stdio: 'ignore' }); return 'file://' + p; } catch { return ''; } };
      const view = path.join(tmp, 'finder.html');
      fs.writeFileSync(view, finder('file://' + one, 'file://' + two, 'file://' + path.join(OUT, 'icon.png'), png(`${res}/ApplicationsFolderIcon.icns`, 'apps.png'), png(`${res}/AliasBadgeIcon.icns`, 'alias.png')));
      fs.writeFileSync(previewTo, await shot(view, W + 48, H + 48, 2));
      console.log('wrote', previewTo);
    }
  } catch (e) { console.error('failed:', e); process.exitCode = 1; }
  fs.rmSync(tmp, { recursive: true, force: true });
  app.quit();
});
