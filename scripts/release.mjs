// Releases Bento for the Mac from this Mac, the way Lemma does: build both architectures, sign with the Developer
// ID certificate in your keychain, notarize the apps and the disk images with your notarytool profile, check all of
// it, start the app once, and (with --publish) put it on the public repo named in package.json → build.publish.
// Installed copies update from there. The source repo can stay private.
//   npm run release                   build and check only; the files stay in release/v<version>/ to try
//   npm run release -- --publish      the same, then publish the GitHub release
//   npm run release -- --arch arm64   one architecture only (a quicker test build)
// Apple credentials: the team's App Store Connect API key when it's set up (~/.appstoreconnect/notary.json with
// {"keyId","issuer"}, plus ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8). notarytool reads it from disk, so a
// release works while the Mac is locked. Otherwise a notarytool keychain profile (APPLE_KEYCHAIN_PROFILE, default
// "lemma-notary"), which macOS hides while the screen is locked. No password or key is ever in the repo or the output.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version, TAG = `v${pkg.version}`, PRODUCT = pkg.build.productName;
const pub = [].concat(pkg.build.publish || [])[0] || {};
const TARGET = `${pub.owner}/${pub.repo}`;
const args = process.argv.slice(2);
const PUBLISH = args.includes('--publish');
const ARCHS = args.includes('--arch') ? [args[args.indexOf('--arch') + 1]] : ['arm64', 'x64'];
const PROFILE = process.env.APPLE_KEYCHAIN_PROFILE || 'lemma-notary';
// Never release/ itself: release/mac-arm64 is the copy `npm run app` makes, and it may be the one you're running.
const OUT = path.join(root, 'release', TAG);

const ASC = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.appstoreconnect', 'notary.json'), 'utf8'));
    const key = path.join(os.homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${c.keyId}.p8`);
    return c.keyId && c.issuer && fs.existsSync(key) ? { ...c, key } : null;
  } catch { return null; }
})();
const NOTARY = ASC ? ['--key', ASC.key, '--key-id', ASC.keyId, '--issuer', ASC.issuer] : ['--keychain-profile', PROFILE];

// Only these Apple credentials, so nothing else in the environment can change how it's signed or notarized.
const env = { ...process.env };
for (const k of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'APPLE_KEYCHAIN_PROFILE', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'ELECTRON_RUN_AS_NODE']) delete env[k];
Object.assign(env, ASC ? { APPLE_API_KEY: ASC.key, APPLE_API_KEY_ID: ASC.keyId, APPLE_API_ISSUER: ASC.issuer } : { APPLE_KEYCHAIN_PROFILE: PROFILE });

const step = (t) => console.log(`\n▸ ${t}`);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };
const run = (cmd, a) => { if (spawnSync(cmd, a, { cwd: root, env, stdio: 'inherit' }).status !== 0) fail(`${cmd} ${a.join(' ')} failed`); };
const quiet = (cmd, a) => { const r = spawnSync(cmd, a, { cwd: root, env, encoding: 'utf8' }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() }; };

// Start the built app once, hidden, with its own profile and no AI tools, and check the page really ran.
async function launchOnce(app) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-release-launch-'));
  const p = spawn(path.join(app, 'Contents/MacOS', PRODUCT), [], {
    env: { ...env, BENTO_HIDDEN: '1', BENTO_USERDATA: profile, BENTO_DISABLE_UPDATES: '1', BENTO_PRETEND_MISSING: 'claude,codex,gemini,copilot,gh' },
    stdio: 'ignore',
  });
  let exited = null; p.on('exit', (code, sig) => { exited = sig || `code ${code}`; });
  await new Promise((r) => setTimeout(r, 20000));
  const alive = !exited, saved = fs.existsSync(path.join(profile, 'bento-store.json'));
  p.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 2000));
  const logs = path.join(profile, 'logs');
  const errors = fs.existsSync(logs) ? fs.readdirSync(logs).map((f) => fs.readFileSync(path.join(logs, f), 'utf8')).join('').trim() : '';
  fs.rmSync(profile, { recursive: true, force: true });
  if (!alive) fail(`${PRODUCT} quit by itself (${exited}) right after starting`);
  if (!saved) fail(`${PRODUCT} started, but its page never ran (nothing was saved in 20 s)`);
  if (errors) fail(`${PRODUCT} logged errors when it started:\n${errors.split('\n').slice(-10).join('\n')}`);
  console.log(`✓ ${path.basename(path.dirname(app))}/${PRODUCT}.app starts, runs its page and logs no errors`);
}

console.log(`${PRODUCT} ${VERSION} for ${ARCHS.join(' + ')}${PUBLISH ? `, publishing to github.com/${TARGET}` : ' (build and check only)'}`);

step('Preflight');
// A build needs about 1 GB per architecture at its peak (the apps, the .dmg and .zip, the checks unpacking them), and
// other work on this Mac (other apps' builds too) needs room meanwhile: a full disk breaks everything at once, so
// refuse up front rather than run out halfway.
{
  const st = fs.statfsSync(root); const free = (st.bavail * st.bsize) / 2 ** 30, need = ARCHS.length + 1.5;
  if (free < need) fail(`Only ${free.toFixed(1)} GB free on this disk; a build needs ${need.toFixed(1)} GB (about 1 GB per architecture, plus room for everything else). Free some space first, or build one architecture: --arch arm64`);
  console.log(`✓ ${free.toFixed(1)} GB free (needs ${need.toFixed(1)} GB)`);
}
if (PUBLISH && quiet('git', ['status', '--porcelain']).out) fail('There are uncommitted changes. Commit them first, so the release matches a commit.');
run('node', ['scripts/check-release.mjs']);
if (!/Developer ID Application/.test(quiet('security', ['find-identity', '-v', '-p', 'codesigning']).out)) fail('No Developer ID Application certificate in the keychain.');
if (!quiet('xcrun', ['notarytool', 'history', ...NOTARY]).ok) fail(ASC ? `Apple rejected the App Store Connect API key ${ASC.keyId}.` : `The notarytool profile "${PROFILE}" doesn't work. Set APPLE_KEYCHAIN_PROFILE to yours.`);
if (PUBLISH && quiet('gh', ['repo', 'view', TARGET, '--json', 'visibility', '--jq', '.visibility']).out !== 'PUBLIC') fail(`github.com/${TARGET} must exist and be public (gh repo create ${TARGET} --public --add-readme).`);

step(`Building, signing and notarizing the apps (Apple usually takes a few minutes per app)`);
fs.rmSync(OUT, { recursive: true, force: true });
run('npx', ['vite', 'build']);
run('npx', ['electron-builder', '--mac', 'dmg', 'zip', ...ARCHS.map((a) => `--${a}`), '--publish', 'never', `-c.directories.output=${path.relative(root, OUT)}`]);

step('Notarizing and stapling the disk images');
run('node', ['scripts/notarize-dmg.mjs', '--dir', OUT]);

step('Checking what people will download');
run('node', ['scripts/verify-mac-release.mjs', '--dir', OUT]);

step('Starting it once, then using it the way a new learner would');
const native = process.arch === 'arm64' ? 'arm64' : 'x64';
if (ARCHS.includes(native)) {
  const built = path.join(OUT, native === 'arm64' ? 'mac-arm64' : 'mac', `${PRODUCT}.app`);
  await launchOnce(built);
  // the exact signed app that's about to ship, driven over the DevTools protocol: lessons, Python, JavaScript,
  // TypeScript, SQL, the network guard, a project, with no AI and nothing blocked by the Content-Security-Policy
  run('node', ['scripts/smoke-app.mjs', '--app', built]);
} else console.log(`- skipped: this Mac is ${native}`);

step('Checksums');
const uploads = fs.readdirSync(OUT).filter((f) => /\.(dmg|zip)$/.test(f)).sort();
const sums = uploads.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, f))).digest('hex')}  ${f}`).join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), sums);
process.stdout.write(sums);
// keep only what gets uploaded (the unpacked apps are ~300 MB each)
for (const f of fs.readdirSync(OUT)) if (!/\.(dmg|zip|zip\.blockmap)$|^latest-mac\.yml$|^SHA256SUMS\.txt$/.test(f)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });

if (!PUBLISH) {
  console.log(`\n✓ ${PRODUCT} ${VERSION} is built, signed, notarized and checked, in ${path.relative(root, OUT)}/ (nothing was published).\n  Try it: open ${path.relative(root, path.join(OUT, `${PRODUCT}-${native}.dmg`))}\n  Publish: npm run release -- --publish`);
  process.exit(0);
}

step(`Publishing ${TAG} to github.com/${TARGET}`);
const notes = path.join(OUT, 'release-notes.md');
const n = quiet('node', ['scripts/release-notes.mjs']);
if (!n.ok) fail(n.out);
fs.writeFileSync(notes, n.out + '\n');
const state = quiet('gh', ['release', 'view', TAG, '--repo', TARGET, '--json', 'isDraft', '--jq', '.isDraft']);
if (state.ok && state.out === 'false') fail(`${TAG} is already published on github.com/${TARGET}. Bump the version.`);
if (state.ok && state.out === 'true') run('gh', ['release', 'delete', TAG, '--repo', TARGET, '--yes']); // a draft left by an earlier run
// a draft first: installed copies ignore drafts, so nobody ever sees a half-uploaded release
run('gh', ['release', 'create', TAG, '--repo', TARGET, '--draft', '--title', `${PRODUCT} ${VERSION}`, '--notes-file', notes,
  ...fs.readdirSync(OUT).filter((f) => f !== 'release-notes.md').map((f) => path.join(OUT, f))]);
run('gh', ['release', 'edit', TAG, '--repo', TARGET, '--draft=false', '--latest']);

// what an installed copy and a new visitor will now see
// (GitHub's "latest" links can take a minute to reach a release that was a draft a moment ago: ask again before failing)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getFeed = () => quiet('curl', ['-fsSL', `https://github.com/${TARGET}/releases/latest/download/latest-mac.yml`]);
let feed = getFeed();
for (let i = 0; i < 10 && !(feed.ok && feed.out.includes(`version: ${VERSION}`)); i++) { await sleep(9000); feed = getFeed(); }
if (!feed.ok || !feed.out.includes(`version: ${VERSION}`)) fail(`Published, but the live update feed doesn't say ${VERSION} yet:\n${feed.out.slice(0, 300)}`);
console.log(`✓ the live update feed says ${VERSION}`);
for (const a of ARCHS) {
  const url = `https://github.com/${TARGET}/releases/latest/download/${PRODUCT}-${a}.dmg`;
  let ok = false; for (let i = 0; i < 10 && !(ok = quiet('curl', ['-fsSIL', '-o', '/dev/null', url]).ok); i++) await sleep(9000);
  if (!ok) fail(`Published, but ${url} doesn't download`);
  console.log(`✓ ${url}`);
}

if (!quiet('git', ['rev-parse', '-q', '--verify', `refs/tags/${TAG}`]).ok) quiet('git', ['tag', TAG]);
const pushed = quiet('git', ['push', 'origin', TAG]);
console.log(pushed.ok ? `✓ tagged the source ${TAG}` : `! tagged the source ${TAG} here, but couldn't push the tag: git push origin ${TAG}`);
fs.rmSync(OUT, { recursive: true, force: true });
console.log(`\n✓ ${PRODUCT} ${VERSION} is out: https://github.com/${TARGET}/releases/tag/${TAG}`);
