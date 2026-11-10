// Before you tag a release: is everything in place to sign, notarize and publish it?
//   node scripts/check-release.mjs          everything, including the tests
//   node scripts/check-release.mjs --quick  skip the tests
// Nothing is built, uploaded or changed. Missing Apple pieces are warnings on your own Mac (CI has them as secrets).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const b = pkg.build || {};
let bad = 0, warn = 0;
const ok = (cond, label, fix = '', soft = false) => {
  if (cond) return console.log(`✓ ${label}`);
  if (soft) { warn++; return console.log(`! ${label}${fix ? `\n    → ${fix}` : ''}`); }
  bad++; console.log(`✗ ${label}${fix ? `\n    → ${fix}` : ''}`);
};
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

console.log(`Bento ${pkg.version}\n`);

// the version
ok(/^\d+\.\d+\.\d+$/.test(pkg.version), `version ${pkg.version} is a plain release number`, 'use x.y.z (pre-releases are ignored by auto-update)');
// in the release workflow this runs on the new tag itself, which doesn't count as already released
const releasing = process.env.GITHUB_REF_NAME === `v${pkg.version}`;
const tags = run('git', ['tag', '--list', 'v*']).split('\n').filter((t) => t && !(releasing && t === `v${pkg.version}`));
ok(!tags.includes(`v${pkg.version}`), `v${pkg.version} hasn't been released yet`, 'bump "version" in package.json');
const newer = (a, c) => { const x = a.split('.').map(Number), y = c.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const latest = tags.map((t) => t.slice(1)).filter((t) => /^\d+\.\d+\.\d+$/.test(t)).sort((a, c) => (newer(a, c) ? 1 : -1)).pop();
ok(!latest || newer(pkg.version, latest), latest ? `${pkg.version} is newer than the last release (${latest})` : 'first release', 'installed copies only update to a higher version');

// what "What's new" will show
const { notesFor } = await import('./release-notes.mjs');
const cl = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
ok(!!notesFor(cl, pkg.version), `CHANGELOG.md has notes for ${pkg.version} (they become the release text)`, `add a "## ${pkg.version}" section to CHANGELOG.md`);

// the files the build needs
for (const f of ['build/icon.icns', 'build/icon.png', 'build/entitlements.mac.plist', '.github/workflows/release.yml']) ok(fs.existsSync(path.join(root, f)), `${f} is there`);
ok(fs.existsSync(path.join(root, 'node_modules/electron-updater')), 'electron-updater is installed', 'npm install');
ok(pkg.dependencies?.['electron-updater'], 'electron-updater ships with the app (a dependency, not a devDependency)');

// how it's packaged
const m = b.mac || {};
ok(m.hardenedRuntime === true, 'hardened runtime is on (notarization needs it)');
ok(m.notarize === true, 'notarization is on');
ok(JSON.stringify(m.target || []).includes('dmg') && JSON.stringify(m.target || []).includes('zip'), 'builds a .dmg (to download) and a .zip (for auto-update)');
ok(m.identity === undefined, 'no "identity: null" left in the config (it would skip signing)', 'remove mac.identity from package.json');
const pub = [].concat(b.publish || [])[0] || {};
ok(pub.provider === 'github' && pub.owner && pub.repo, `publishes to github.com/${pub.owner}/${pub.repo}`);
const remote = run('git', ['remote', 'get-url', 'origin']);
ok(!remote || remote.includes(`${pub.owner}/${pub.repo}`), `git remote matches the publish target${remote ? ` (${remote})` : ''}`, 'update build.publish or the git remote', true);
const fz = b.electronFuses || {};
ok(b.asar === true && fz.onlyLoadAppFromAsar && fz.enableEmbeddedAsarIntegrityValidation, 'app code is in an integrity-checked archive');
ok(fz.runAsNode === false && fz.enableNodeOptionsEnvironmentVariable === false && fz.enableNodeCliInspectArguments === false, 'Electron’s run-as-Node, NODE_OPTIONS and --inspect switches are off in releases');
const ent = fs.readFileSync(path.join(root, 'build/entitlements.mac.plist'), 'utf8');
ok(!/disable-library-validation|allow-dyld-environment-variables|get-task-allow/.test(ent), 'entitlements ask for nothing risky');

// signing and notarizing on this Mac (warnings: CI uses repository secrets instead)
if (process.platform === 'darwin') {
  const ids = run('security', ['find-identity', '-v', '-p', 'codesigning']);
  ok(/Developer ID Application/.test(ids) || !!process.env.CSC_LINK, 'a Developer ID Application certificate is available', 'Xcode → Settings → Accounts → Manage Certificates → + Developer ID Application (see docs/RELEASING.md)', true);
  const api = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;
  const idp = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID;
  ok(api || idp || process.env.APPLE_KEYCHAIN_PROFILE, 'notarization credentials are set', 'export APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER (see docs/RELEASING.md)', true);
  if (process.env.APPLE_API_KEY) ok(fs.existsSync(process.env.APPLE_API_KEY), 'the notarization key file exists', process.env.APPLE_API_KEY);
}
ok(!!(process.env.GH_TOKEN || run('gh', ['auth', 'token'])), 'a GitHub token is available to publish', 'gh auth login, or export GH_TOKEN', true);

// the tests
if (!process.argv.includes('--quick')) {
  console.log('\nRunning the tests…');
  const t = spawnSync('npm', ['test', '--silent'], { cwd: root, encoding: 'utf8' });
  ok(t.status === 0, 'npm test passes', (t.stdout + t.stderr).split('\n').filter((l) => l.startsWith('✗')).slice(0, 5).join('\n    → '));
}

console.log(bad ? `\n${bad} thing${bad > 1 ? 's' : ''} to fix before releasing.` : warn ? `\nReady, apart from ${warn} thing${warn > 1 ? 's' : ''} only your Mac or CI can provide (above).` : '\nReady to release: tag it (git tag v' + pkg.version + ' && git push origin v' + pkg.version + ').');
process.exit(bad ? 1 : 0);
