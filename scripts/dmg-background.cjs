// Draws the installer window's background (build/background.tiff, 1× and 2× in one file).
//   npx electron scripts/dmg-background.cjs
// The window is 600×400 (package.json → build.dmg). Finder puts Bento's icon at (150, 200) and the Applications
// folder at (450, 200), with their names underneath; this only draws what goes around them.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform === 'darwin') app.dock?.hide(); // no Dock icon while it draws
const OUT = path.join(__dirname, '..', 'build');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 600px; height: 400px; overflow: hidden; }
  body { background: #fbf8f3; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif; position: relative; }
  .glow { position: absolute; inset: 0; background:
    radial-gradient(260px 200px at 18% 8%, rgba(255, 138, 91, .22), transparent 70%),
    radial-gradient(280px 220px at 88% 18%, rgba(165, 139, 255, .18), transparent 70%),
    radial-gradient(300px 160px at 50% 110%, rgba(76, 201, 160, .14), transparent 70%); }
  h1 { position: absolute; top: 46px; left: 0; right: 0; margin: 0; text-align: center; font: 600 23px "New York", "Iowan Old Style", Georgia, serif; color: #241e1a; letter-spacing: -.2px; }
  h1 em { color: #d4561f; font-style: italic; }
  p { position: absolute; bottom: 34px; left: 0; right: 0; margin: 0; text-align: center; font-size: 12px; color: #8a7f75; }
  svg { position: absolute; left: 0; top: 0; }
</style></head><body><div class="glow"></div>
  <h1>Drag Bento into <em>Applications</em></h1>
  <svg width="600" height="400" viewBox="0 0 600 400">
    <defs><marker id="a" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M1 1 L8 5 L1 9" fill="none" stroke="#ff6b3d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    <path d="M232 196 C 270 160, 330 160, 368 196" fill="none" stroke="#ff6b3d" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" marker-end="url(#a)"/>
  </svg>
  <p>Then open Bento from Launchpad or Spotlight.</p>
</body></html>`;

const page = path.join(require('node:os').tmpdir(), `bento-dmg-${process.pid}.html`);
app.on('window-all-closed', () => {}); // between the 1× and 2× windows there are none; don't quit then
app.whenReady().then(async () => { try {
  fs.writeFileSync(page, html);
  const shot = async (scale) => {
    const win = new BrowserWindow({ show: false, width: 600 * scale, height: 400 * scale, useContentSize: true, frame: false, webPreferences: { offscreen: true } });
    await win.loadFile(page);
    await win.webContents.executeJavaScript(`document.documentElement.style.zoom = '${scale}'`); // 2×: the same 600×400 design, twice the pixels
    await new Promise((r) => setTimeout(r, 400));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 600 * scale, height: 400 * scale });
    win.destroy();
    return img.resize({ width: 600 * scale, height: 400 * scale }).toPNG();
  };
  const one = path.join(OUT, 'background.png'), two = path.join(OUT, 'background@2x.png');
  fs.writeFileSync(one, await shot(1)); fs.writeFileSync(two, await shot(2));
  // one TIFF holding both sizes: sharp on Retina screens, right-sized on the rest
  execFileSync('/usr/bin/tiffutil', ['-cathidpicheck', one, two, '-out', path.join(OUT, 'background.tiff')]);
  fs.rmSync(one); fs.rmSync(two); fs.rmSync(page, { force: true });
  console.log('wrote build/background.tiff');
  } catch (e) { console.error('failed:', e); process.exitCode = 1; }
  app.quit();
});
