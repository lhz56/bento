// Notarizes and staples each signed .dmg in release/, the file people actually download. electron-builder
// notarizes the app inside; this does the disk image around it, so Gatekeeper accepts the download itself and a
// changed byte anywhere in it is caught. `npm run dist` runs it after the build.
//   node scripts/notarize-dmg.mjs [--dir release]
// Apple credentials, as for electron-builder: APPLE_KEYCHAIN_PROFILE (a notarytool keychain profile, on your Mac)
// or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER (an App Store Connect key, in CI).
// Unsigned test builds are skipped. The .dmg isn't in latest-mac.yml (dmg.writeUpdateInfo: false: updates use the
// .zip), so stapling, which changes its bytes, leaves the update feed correct.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = path.resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : path.join(root, 'release'));
const sh = (cmd, a, inherit = false) => { const r = spawnSync(cmd, a, { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` }; };
const e = process.env;
const creds = e.APPLE_KEYCHAIN_PROFILE ? ['--keychain-profile', e.APPLE_KEYCHAIN_PROFILE]
  : e.APPLE_API_KEY && e.APPLE_API_KEY_ID && e.APPLE_API_ISSUER ? ['--key', e.APPLE_API_KEY, '--key-id', e.APPLE_API_KEY_ID, '--issuer', e.APPLE_API_ISSUER]
  : null;

const dmgs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.dmg')) : [];
let failed = 0;
for (const name of dmgs) {
  const dmg = path.join(dir, name);
  if (!/Authority=Developer ID Application:/.test(sh('codesign', ['-dvv', dmg]).out)) { console.log(`- ${name}: not Developer ID–signed (a test build), not notarizing`); continue; }
  if (sh('xcrun', ['stapler', 'validate', dmg]).ok) { console.log(`✓ ${name}: already notarized and stapled`); continue; }
  if (!creds) { console.error(`✗ ${name} is signed but there are no Apple credentials to notarize it: set APPLE_KEYCHAIN_PROFILE, or APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER`); failed++; continue; }
  console.log(`  ${name}: sending to Apple (usually a few minutes)…`);
  const sub = sh('xcrun', ['notarytool', 'submit', dmg, ...creds, '--wait', '--output-format', 'json']);
  let res = {}; try { res = JSON.parse(sub.out.slice(sub.out.indexOf('{'))); } catch {}
  if (res.status !== 'Accepted') {
    console.error(`✗ ${name}: Apple said ${res.status || 'nothing'}${res.id ? ` (submission ${res.id})` : ''}\n${sub.out.trim()}`);
    if (res.id) sh('xcrun', ['notarytool', 'log', res.id, ...creds], true);
    failed++; continue;
  }
  const st = sh('xcrun', ['stapler', 'staple', dmg]);
  if (!st.ok) { console.error(`✗ ${name}: notarized, but stapling failed\n${st.out.trim()}`); failed++; continue; }
  console.log(`✓ ${name}: notarized (${res.id}) and stapled`);
}
if (!dmgs.length) console.log(`No .dmg in ${dir}.`);
process.exit(failed ? 1 : 0);
