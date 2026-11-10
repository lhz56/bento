# Releasing Bento for the Mac

Bento ships the way T3 Code does: a **Developer ID–signed, notarized** `.dmg` and `.zip` on GitHub Releases,
for Apple Silicon and Intel. Copies already installed update themselves from the same releases. It is not on the
Mac App Store: the App Store sandbox would stop Bento from running the `claude`, `codex`, `gh` and `git` tools
already on your Mac, and running those tools is the whole point.

## One-time setup (Apple Developer account)

1. **Certificate.** In Xcode → Settings → Accounts → Manage Certificates, add a **Developer ID Application**
   certificate. Then, in Keychain Access, export it with its private key as a `.p12` file and give it a password.
2. **Notarization key.** In [App Store Connect](https://appstoreconnect.apple.com/access/integrations/api) →
   Users and Access → Integrations → Team Keys, create a key with the *Developer* role. Download `AuthKey_XXXX.p8`
   (you can only download it once) and note its **Key ID** and the **Issuer ID**.
3. **GitHub secrets.** In the repository's Settings → Secrets and variables → Actions, add:

   | Secret | Value |
   | --- | --- |
   | `MAC_CERT_P12_BASE64` | `base64 -i DeveloperID.p12 \| pbcopy`, then paste |
   | `MAC_CERT_PASSWORD` | the `.p12` password |
   | `APPLE_API_KEY_P8` | the whole text of `AuthKey_XXXX.p8` |
   | `APPLE_API_KEY_ID` | the Key ID |
   | `APPLE_API_ISSUER` | the Issuer ID |

## Each release

1. Bump `version` in `package.json` (for example `0.3.0`), add a `## 0.3.0` section to `CHANGELOG.md` (it becomes the release notes that "What's new" opens), and commit.
2. Tag and push: `git tag v0.3.0 && git push origin v0.3.0`.
3. `.github/workflows/release.yml` tests, builds both architectures, signs, notarizes, staples, verifies with
   `codesign`, `spctl` and `stapler`, and publishes a GitHub release with:
   - `Bento-0.3.0-arm64.dmg`, `Bento-0.3.0-x64.dmg`: what people download
   - `Bento-0.3.0-arm64.zip`, `Bento-0.3.0-x64.zip` and their `.blockmap`s: what auto-update downloads
   - `latest-mac.yml`: how installed copies learn there's a new version

The workflow refuses to run if the tag and `package.json` disagree.

### From your own Mac instead

With the certificate in your login keychain:

```sh
export APPLE_API_KEY=~/keys/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=xxxxxxxx-...
export GH_TOKEN=$(gh auth token)
npm run release     # build, sign, notarize, publish
npm run dist        # the same without publishing (files land in release/)
```

Without a certificate, `npm run dist` still works: the result is unsigned (people would have to right-click → Open
the first time, and it can't update itself).

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
- **Installer window**: the DMG opens on a 600×400 window, Bento on the left and Applications on the right, over `build/background.tiff` ("Drag Bento into *Applications*", 1× and 2× in one file). To change it, edit `scripts/dmg-background.cjs` and run `npx electron scripts/dmg-background.cjs`.
- **Crashes**: if the page crashes it reloads by itself (up to three times a minute); lessons are on disk.

## Checklist before tagging

```sh
npm run preflight                          # version, notes, files, signing and notarization setup, fuses, then the tests
npm run app                                # build the packaged app (hidden tests can drive this one)
for s in smoke-app smoke-tour smoke-stream smoke-guards audit-a11y audit-keyboard; do node scripts/$s.mjs --packaged || break; done
```

The same checks run in CI on every push (macOS, Windows and Linux; the two audits on macOS). None of them use an AI
plan: Claude and Codex are hidden, or a pretend Claude streams the lesson.

