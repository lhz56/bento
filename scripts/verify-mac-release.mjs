// Checks the finished Mac build in release/ before anything is published: what people download (.dmg),
// what auto-update downloads (.zip) and how installed copies find it (latest-mac.yml).
//   node scripts/verify-mac-release.mjs              a signed, notarized build (npm run release runs this)
//   node scripts/verify-mac-release.mjs --unsigned   a local test build: skips the Developer ID and Apple checks
//   node scripts/verify-mac-release.mjs --dir /tmp/x another folder
// Disk images are mounted hidden (never shown in Finder) and unmounted again. Nothing is changed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const { getCurrentFuseWire, FuseV1Options } = req('@electron/fuses');
const asar = req('@electron/asar');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const unsigned = args.includes('--unsigned');
const dir = path.resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(root, 'release'));
const product = pkg.build?.productName || pkg.name;
const pub = [].concat(pkg.build?.publish || [])[0] || {};

let bad = 0;
const ok = (cond, label, why = '') => {
  if (cond) return console.log(`  ✓ ${label}`);
  bad++; console.log(`  ✗ ${label}${why ? `\n      ${why.trim().split('\n').slice(-4).join('\n      ')}` : ''}`);
};
// stdout and stderr together, always: codesign -d and spctl report on stderr even when all is well
const sh = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` || r.error?.message || '' }; };
const archOf = (file) => (/-arm64[.-]/.test(file) ? 'arm64' : /-x64[.-]/.test(file) ? 'x86_64' : null);

// Electron's switches, as burnt into the binary: what a downloaded copy will actually do
const FUSES = { RunAsNode: 0, EnableNodeOptionsEnvironmentVariable: 0, EnableNodeCliInspectArguments: 0, EnableEmbeddedAsarIntegrityValidation: 1, OnlyLoadAppFromAsar: 1, EnableCookieEncryption: 1, GrantFileProtocolExtraPrivileges: 0 };
async function checkApp(app, arch) {
  ok(fs.existsSync(app), `${product}.app is inside`);
  if (!fs.existsSync(app)) return;
  const wire = await getCurrentFuseWire(app).catch(() => null);
  const wrong = Object.entries(FUSES).filter(([k, want]) => !wire || String.fromCharCode(wire[FuseV1Options[k]]) !== String(want)).map(([k]) => k);
  ok(!wrong.length, 'Electron fuses: no run-as-Node, NODE_OPTIONS or --inspect; code only from the checked archive; cookies encrypted', wrong.join(', '));
  let meta = {}; try { meta = JSON.parse(asar.extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json').toString()); } catch {}
  ok(meta.version === pkg.version && meta.bentoTestBuild === undefined, 'a release build, not a test build (pretend AIs and other test switches are off)', meta.bentoTestBuild ? 'bentoTestBuild is set' : `package.json in the app: ${meta.version}`);
  const bin = path.join(app, 'Contents/MacOS', product);
  if (arch) { const l = sh('lipo', ['-archs', bin]); ok(l.ok && l.out.trim().split(/\s+/).includes(arch), `built for ${arch}`, l.out); }
  const v = sh('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(app, 'Contents/Info.plist')]);
  ok(v.out.trim() === pkg.version, `version ${pkg.version}`, `the app says ${v.out.trim()}`);
  const advertised = pkg.build.mac.minimumSystemVersion;
  const minimum = sh('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', path.join(app, 'Contents/Info.plist')]);
  ok(minimum.out.trim() === advertised, `bundle advertises macOS ${advertised}`, minimum.out);
  for (const executable of [bin, path.join(app, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')]) {
    const build = sh('xcrun', ['vtool', '-show-build', executable]);
    const target = /^\s*minos\s+([\d.]+)/m.exec(build.out)?.[1];
    ok(build.ok && target && target.localeCompare(advertised, 'en', { numeric: true }) <= 0,
      `${path.basename(executable)} supports the advertised macOS minimum`, target || build.out);
  }
  const feed = path.join(app, 'Contents/Resources/app-update.yml');
  const feedText = fs.existsSync(feed) ? fs.readFileSync(feed, 'utf8') : '';
  ok(feedText.includes('provider: github') && feedText.includes(`owner: ${pub.owner}`) && feedText.includes(`repo: ${pub.repo}`), `looks for updates at github.com/${pub.owner}/${pub.repo}`, feedText || 'no app-update.yml');
  const integrity = sh('codesign', ['--verify', '--deep', '--strict', app]);
  ok(integrity.ok, 'every file matches its signature (nothing changed after signing)', integrity.out);
  if (unsigned) return;
  const info = sh('codesign', ['-dvv', app]).out;
  ok(/Authority=Developer ID Application:/.test(info), 'signed with a Developer ID Application certificate', info.split('\n').filter((l) => l.startsWith('Authority=')).join('\n') || info);
  ok(/flags=0x[0-9a-f]+\([^)]*\bruntime\b[^)]*\)/.test(info), 'hardened runtime is on', info.split('\n').find((l) => l.includes('flags=')) || info);
  const gk = sh('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  ok(gk.ok && /source=Notarized Developer ID/.test(gk.out), 'Gatekeeper accepts it as notarized', gk.out);
  const st = sh('xcrun', ['stapler', 'validate', app]);
  ok(st.ok, 'the notarization ticket is stapled (opens even offline)', st.out);
}

if (!fs.existsSync(dir)) { console.error(`No ${dir}. Build first (npm run dist).`); process.exit(1); }
const files = fs.readdirSync(dir);
const dmgs = files.filter((f) => f.endsWith('.dmg'));
const zips = files.filter((f) => f.endsWith('.zip'));
console.log(`${product} ${pkg.version} in ${dir}${unsigned ? ' (unsigned test build: Developer ID and notarization not checked)' : ''}\n`);
ok(dmgs.length > 0 && zips.length > 0, `found ${dmgs.length} .dmg and ${zips.length} .zip`);

for (const dmg of dmgs) {
  console.log(`\n${dmg}`);
  if (!unsigned) { // the download itself, before it's even opened
    const d = path.join(dir, dmg);
    ok(/Authority=Developer ID Application:/.test(sh('codesign', ['-dvv', d]).out), 'the disk image is signed with your Developer ID');
    const st = sh('xcrun', ['stapler', 'validate', d]);
    ok(st.ok, 'the disk image has its notarization ticket stapled', st.out);
    const gk = sh('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', d]);
    ok(gk.ok && /source=Notarized Developer ID/.test(gk.out), 'Gatekeeper accepts the download as notarized', gk.out);
  }
  const att =sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-plist', path.join(dir, dmg)]);
  ok(att.ok, 'opens (checksum verified)', att.out);
  if (!att.ok) continue;
  const mnt = (att.out.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/) || [])[1];
  try {
    ok(path.basename(mnt || '') === (pkg.build?.dmg?.title || '').replace('${productName}', product).replace('${version}', pkg.version), `window title "${path.basename(mnt || '')}"`);
    ok(fs.existsSync(path.join(mnt, 'Applications')) && fs.readlinkSync(path.join(mnt, 'Applications')) === '/Applications', 'has the Applications shortcut to drag onto');
    ok(fs.existsSync(path.join(mnt, '.DS_Store')) && fs.readdirSync(mnt).some((f) => /^\.background/.test(f)), 'has the installer layout and background picture');
    await checkApp(path.join(mnt, `${product}.app`), archOf(dmg));
  } finally {
    if (mnt && !sh('hdiutil', ['detach', mnt, '-quiet']).ok) sh('hdiutil', ['detach', mnt, '-force', '-quiet']);
  }
}

for (const zip of zips) {
  console.log(`\n${zip} (what auto-update downloads)`);
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-verify-'));
  try {
    const x = sh('ditto', ['-x', '-k', path.join(dir, zip), t]);
    ok(x.ok, 'unzips', x.out);
    if (x.ok) await checkApp(path.join(t, `${product}.app`), archOf(zip));
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

console.log('\nlatest-mac.yml (how installed copies find this version)');
const feedFile = path.join(dir, 'latest-mac.yml');
const feed = fs.existsSync(feedFile) ? fs.readFileSync(feedFile, 'utf8') : '';
ok(!!feed, 'is there');
ok(new RegExp(`^version: '?${pkg.version.replace(/\./g, '\\.')}'?$`, 'm').test(feed), `says version ${pkg.version}`);
const listed = [...feed.matchAll(/^\s+- url: (.+)\n\s+sha512: (.+)\n\s+size: (\d+)/gm)].map(([, url, sha512, size]) => ({ url: url.trim(), sha512: sha512.trim(), size: Number(size) }));
for (const zip of zips) ok(listed.some((f) => f.url === zip), `lists ${zip}`);
for (const f of listed) {
  const p = path.join(dir, f.url);
  if (!fs.existsSync(p)) { ok(false, `${f.url} exists`, 'listed in latest-mac.yml but not built'); continue; }
  const hash = crypto.createHash('sha512').update(fs.readFileSync(p)).digest('base64');
  ok(hash === f.sha512 && fs.statSync(p).size === f.size, `${f.url}: size and SHA-512 match (an update with a wrong hash is refused)`);
}

console.log(bad ? `\n${bad} problem${bad > 1 ? 's' : ''}. Don't publish this build.` : `\nAll good${unsigned ? ' for an unsigned test build' : ': safe to publish'}.`);
process.exit(bad ? 1 : 0);
