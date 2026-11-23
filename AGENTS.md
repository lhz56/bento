# Bento, for AI agents

You're an AI agent (Claude Code, Codex, Cursor, Copilot, Gemini…) and someone sent you this repo. They almost certainly want one of two things:

- **"Install Bento"** → follow [Install the app](#install-the-app). Takes about a minute, no build needed.
- **"Work on Bento"** → follow [Work on the code](#work-on-the-code).

If it isn't clear which, install the app.

Bento is a free, open-source Mac app that teaches how software is built. It uses the AI plan the person already has (Claude, ChatGPT, Gemini or Copilot) through that AI's official command-line tool. It has no account, no API key of its own and no telemetry.

---

## Install the app

**Needs:** macOS 13 or later, Apple Silicon or Intel. On Windows or Linux, stop here and tell the person: the Windows version isn't released yet, and there's no Linux version. They can still [run it from source](#work-on-the-code).

### 1. Check what's there

```bash
sw_vers -productVersion                     # must be 13.0 or later
uname -m                                    # arm64 = Apple Silicon, x86_64 = Intel
ls -d /Applications/Bento.app 2>/dev/null   # already installed?
```

If Bento is already installed, **don't reinstall it.** It updates itself. Just open it: `open -a Bento`.

### 2. Download, check the signature, install

The releases are signed with a Developer ID and notarized by Apple. Verify that before copying anything into `/Applications`.

```bash
set -e
F=$([ "$(uname -m)" = arm64 ] && echo Bento-arm64.dmg || echo Bento-x64.dmg)
T=$(mktemp -d)
curl -fsSL -o "$T/$F" "https://github.com/lhz56/bento-releases/releases/latest/download/$F"
hdiutil attach -nobrowse -readonly -mountpoint "$T/mnt" "$T/$F" >/dev/null
ditto "$T/mnt/Bento.app" "$T/Bento.app"
hdiutil detach -quiet "$T/mnt"

# all three must pass, or stop and tell the person
codesign --verify --deep --strict "$T/Bento.app"
codesign -dv "$T/Bento.app" 2>&1 | grep -q 'TeamIdentifier=ZX6ABY8QF9'
spctl --assess --type execute "$T/Bento.app"

ditto "$T/Bento.app" /Applications/Bento.app
rm -rf "$T"
open -a Bento
```

If `/Applications` isn't writable, use `~/Applications` instead. Don't use `sudo` unless the person says so.

### 3. Make sure one AI is ready

Bento needs **one** of these command-line tools, signed in. Check which exist:

```bash
for c in claude codex agy gemini copilot; do command -v $c >/dev/null && echo "found: $c"; done
```

| AI | Tool | Plan it uses | Install (if none found) |
|---|---|---|---|
| Claude | `claude` | Claude Pro or Max | `curl -fsSL https://claude.ai/install.sh \| bash` |
| ChatGPT | `codex` | ChatGPT Plus, Pro or Business | `brew install --cask codex` or `npm i -g @openai/codex` |
| Gemini | `agy` | Google AI Pro (free for students) | the Antigravity app from Google |
| Gemini API | `gemini` | a free Gemini API key | `brew install gemini-cli` or `npm i -g @google/gemini-cli` |
| Copilot | `copilot` | free with GitHub | `brew install copilot-cli` or `npm i -g @github/copilot` |

- **If you're one of these tools yourself** (for example you're Claude Code, so `claude` is already signed in), say so: the person is already set up.
- **Never sign in for the person,** and never ask for their password or a token. Signing in is theirs to do. Tell them to run the tool once (`claude`, then `/login`; `codex login`; `copilot login`) or to press **Sign in** inside Bento, which opens Terminal for them.
- If you install a tool, only install one, and only the one they asked for or already pay for.

You don't have to do this step at all: on first launch, Bento finds the AIs by itself and offers an **Install** button for each.

### 4. Tell the person what's next

Something short, like:

> Bento is installed and open. It found Claude on your Mac, so you're ready: press **Get started**. Try pasting any GitHub link to see how that app is built.

---

## Work on the code

```bash
git clone https://github.com/lhz56/bento && cd bento
npm install          # Node 20+
npm run dev          # the app with hot reload
npm test             # unit tests, repo analysis, every puzzle in real Python (needs python3)
npm run smoke        # the real app, in a hidden window, end to end
```

- **Map of the code:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Everything it does: [docs/FEATURES.md](docs/FEATURES.md). How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md).
- `electron/` is the main process (AI providers, sandboxing, the repo reader, the phone host). `src/` is the React app. `test/` and `scripts/smoke-*.mjs` are the checks.

### Rules that matter

1. **Tests never spend anyone's AI plan.** App checks run with `BENTO_HIDDEN=1` and a throwaway `BENTO_USERDATA` folder. They either hide every real AI (`BENTO_PRETEND_MISSING=claude,codex,antigravity,gemini,copilot,gh`) or use the pretend one (`BENTO_FAKE_AI=test/fixtures/fake-ai.mjs` with `BENTO_FAKE_AS=claude`). New test scripts must do the same.
2. **Don't disturb the person's screen or data.** Use hidden windows only. Never quit or replace a Bento that is already running. Never use the real clipboard in tests.
3. **The AI only ever writes text.** Bento runs every AI tool with its own tools switched off. Keep it that way: see `electron/providers.cjs` and the guard tests in `scripts/smoke-guards.mjs`.
4. **Picture first, few words.** Bento is for people who've never coded. New screens lead with a picture, keep visible text to about one line per thing, and put detail behind a click.
5. **Before you call it done:** `npm test` and `npm run smoke` pass. For anything visible, look at it in light and dark (`node scripts/audit-a11y.mjs` checks every screen).

### Shipping

Releases, signing and notarizing are done by the maintainer: see [docs/RELEASING.md](docs/RELEASING.md). Don't publish releases, tags or the website without being asked.
