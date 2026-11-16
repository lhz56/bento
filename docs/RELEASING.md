# Releasing Bento for the Mac

Bento ships the way T3 Code (and Lemma) do: a **Developer ID–signed, notarized** `.dmg` and `.zip` for Apple
Silicon and Intel, on GitHub Releases in the **public** repo [`lhz56/bento-releases`](https://github.com/lhz56/bento-releases).
The source repo can stay private: installed copies only need to read the releases repo, and they update themselves
from it. It is not on the Mac App Store: the App Store sandbox would stop Bento from running the `claude`, `codex`,
`gemini`, `copilot`, `gh` and `git` tools already on your Mac, and running those tools is the whole point.

Releases are made from this Mac with one command. Nothing runs in CI, so there are no certificates or Apple keys in
GitHub, and no password in the repo or the environment.

## One-time setup (done once per Mac)

1. **Certificate.** One **Developer ID Application** certificate signs all your apps, and Apple allows only a few per
   team, so reuse the one you have. Only if `security find-identity -v -p codesigning` doesn't list one yet:
   Xcode → Settings → Accounts → Manage Certificates → **+** → Developer ID Application.
2. **Notary credentials.** Preferred: the team's App Store Connect API key (App Store Connect → Users and Access →
   Integrations → Team Keys, access Developer). Keep the `.p8` at `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`
   (chmod 600) and put `{"keyId":"<KEYID>","issuer":"<ISSUER ID>"}` in `~/.appstoreconnect/notary.json`. notarytool
   reads it from disk, so releases work while the Mac is locked. Lemma's release script uses the same file.
   Fallback: a notarytool keychain profile (default `lemma-notary`). macOS hides it while the screen is locked. Make
   it with `xcrun notarytool store-credentials <name> --apple-id <Apple ID> --team-id <TEAMID>` and set
   `APPLE_KEYCHAIN_PROFILE=<name>`.
3. **Releases repo.** Public, with one commit so releases have something to tag:
   `gh repo create lhz56/bento-releases --public --add-readme`.
4. **Check.** `npm run preflight`. Every line should be ✓.

## Each release

1. Bump `version` in `package.json` (for example `0.3.0`), add a `## 0.3.0` section to `CHANGELOG.md` (it becomes
   the release notes that "What's new" opens), and commit.
2. `npm run release -- --publish`. It:
   - runs the preflight and every test;
   - builds both architectures into `release/v0.3.0/` (never `release/mac-arm64/`, the copy `npm run app` makes),
     signs them and notarizes the apps;
   - signs, notarizes and staples each `.dmg` too (`scripts/notarize-dmg.mjs`), so the download itself passes Gatekeeper;
   - opens every `.dmg` and `.zip` and checks the app inside (architecture, version, update feed, `codesign`,
     Gatekeeper, the stapled ticket) and that `latest-mac.yml` matches the files byte for byte
     (`scripts/verify-mac-release.mjs`);
   - starts the app once, hidden, with its own profile and no AI, and checks its page ran with no errors; then drives
     that same signed app through a new learner's first session (`scripts/smoke-app.mjs --app`, over the DevTools
     protocol since the release's debugger switch is off);
   - **only then** publishes `v0.3.0` (uploaded as a draft first, so nobody ever sees a half-uploaded release), checks
     that the live update feed says `0.3.0` and the download links work, tags the source and deletes the build.

   Apple usually notarizes in minutes; the first submissions on a new account took ~40 minutes each.

   It needs about 1 GB of free disk per architecture plus 1.5 GB to spare (3.5 GB for both), and refuses to start with
   less: a disk that fills up mid-build breaks every other app and build on the Mac too.

What gets published:

- `Bento-arm64.dmg`, `Bento-x64.dmg`: what people download. No version in the name, so
  `https://github.com/lhz56/bento-releases/releases/latest/download/Bento-arm64.dmg` always means the newest one.
- `Bento-0.3.0-arm64.zip`, `Bento-0.3.0-x64.zip` and their `.blockmap`s: what auto-update downloads (the `.dmg`s
  aren't in the update feed, so stapling them changes nothing there)
- `latest-mac.yml`: how installed copies learn there's a new version
- `SHA256SUMS.txt`: checksums of the `.dmg`s and `.zip`s (`shasum -a 256 -c SHA256SUMS.txt`)

It refuses to publish with uncommitted changes, or over a release that's already out.

Without `--publish`, `npm run release` does everything except publishing and leaves the files in `release/v0.3.0/`
to try first. `--arch arm64` builds one architecture (quicker). Without a certificate, `npm run dist` still makes an
unsigned build (people would have to right-click → Open the first time, and it can't update itself);
`npm run verify-release -- --unsigned` checks such a build, minus the Developer ID and notarization.

## How updates work

`electron/updater.cjs` uses `electron-updater` with the GitHub feed baked into the app (`app-update.yml`):

- Off in development, in tests (`BENTO_HIDDEN`), with `BENTO_DISABLE_UPDATES=1`, and in any copy that isn't
  Developer ID–signed (macOS refuses to update those anyway).
- 15 seconds after launch, then every 4 hours, it checks quietly. A new version downloads in the background.
- When it's ready, a small **Update ready · Restart** pill appears above the sidebar footer. Restarting installs it;
  otherwise it installs the next time you quit. Lessons are saved first, as on any quit.
- Only full releases count. Drafts and pre-releases are ignored.
- After an update, the sidebar says **What's new in 0.x ↗** once, linking to that release's notes on GitHub (so write good release notes).
- **Settings → Bento 0.x** shows what the updater is doing, has **Check now**, and an **Automatically** switch (off means no checks in the background). The menu has **Bento → Check for Updates…** too.
- A signed copy opened from the disk image or Downloads offers, once, to **move itself to Applications** (it can't update itself from a disk image).

## What the build locks down

Set in `package.json` → `build`:

| Setting | Why |
| --- | --- |
| `hardenedRuntime` + `build/entitlements.mac.plist` | Required for notarization. The only entitlement is `allow-jit` (JavaScript and WebAssembly; Python runs as WebAssembly). No camera, microphone or contacts. |
| `asar` + `onlyLoadAppFromAsar` + `enableEmbeddedAsarIntegrityValidation` | The app's code lives in one archive whose hash is checked at launch, so nobody can quietly edit it on disk. |
| `runAsNode: false` | `ELECTRON_RUN_AS_NODE=1 Bento` can't turn Bento into a plain Node.js process that inherits its permissions. |
| `enableNodeOptionsEnvironmentVariable: false`, `enableNodeCliInspectArguments: false` | No `NODE_OPTIONS` or `--inspect` code injection into a shipped copy. Local test builds (`npm run app`) and CI turn the inspect switch back on so Playwright can drive the app. |
| `resetAdHocDarwinSignature` | Flipping the switches above changes the binary. Unsigned local builds get a fresh ad-hoc signature, or macOS would refuse to open them. |
| `electronLanguages` | Ships 26 Chromium language packs instead of ~55. Bento's own words are translated by your AI. |
| `minimumSystemVersion: 12.0` | What Electron 45 supports. |

In the app itself (`electron/main.cjs`):

- The window only ever shows Bento. Navigating elsewhere is blocked. Web links open in your browser, and only
  `https:`, `http:` and `mailto:` links leave the app.
- A shipped copy ignores `BENTO_DEV` (which loads the page from a local development server), and the pretend AI used by tests only works in hidden test mode.
- Every IPC call is checked to come from Bento's own page. Lesson pages run on their own `play://` origin with no
  bridge at all.
- Permission requests are denied unless they're notifications, copying, or fullscreen from Bento's own page.
- Files are read only inside folders you opened. A symlink in a downloaded project can't lead outside it.
- Repo names must look like `owner/name`.
- CLIs are found the way a new Terminal would find them: your login shell's `PATH` (read once, time-limited), then
  `launchctl`, then the usual install folders. Opening Bento from the Dock still finds `claude` installed with
  nvm, fnm, volta, asdf, pnpm, Homebrew or npm.

## A real Mac app

- **Menu bar** (`electron/menu.cjs`): About, Check for Updates…, Settings… ⌘,, New Question ⌘N, Search ⌘K, the sidebar ⌘\\, zoom, Keyboard Shortcuts ⌘/, Bento on GitHub, Report a Problem… (opens a GitHub issue with the version and macOS filled in, nothing else) and Show Logs. No Electron links, and Reload and DevTools only in development, so ⌘R can't throw away a lesson that's still being written.
- **Logs** (`electron/log.cjs`): `~/Library/Logs/Bento/main.log`, under 2 MB, errors and app events only (never prompts, answers or code).
- **Window** (`electron/winstate.cjs`): reopens at the same size and place, or on the main screen if that display is gone.
- **Installer window**: the DMG opens on a 640×432 window titled "Bento 0.x Installer", with 120-pt icons, Bento on the left and Applications on the right, over `build/background.tiff` (1× and 2× in one file). The background stays light because Finder draws installer windows with a picture in light mode, even in dark mode, so the names under the icons stay readable. To change it, edit `scripts/dmg-background.cjs` and run `npx electron scripts/dmg-background.cjs`.
- **Crashes**: if the page crashes it reloads by itself (up to three times a minute); lessons are on disk.

## Checklist before tagging

```sh
npm run preflight                          # version, notes, files, signing and notarization setup, fuses, then the tests
npm run app                                # build the packaged app (hidden tests can drive this one)
for s in smoke-app smoke-tour smoke-stream smoke-ais smoke-guards audit-a11y audit-keyboard; do node scripts/$s.mjs --packaged || break; done
```

The same checks run in CI on every push (macOS, Windows and Linux; the two audits on macOS). None of them use an AI
plan: the AI tools are hidden, or pretend ones stream the lesson.

