# How Bento works

Bento is an Electron app. The **main process** (`electron/`) owns everything outside the window: your AI CLIs, git and GitHub, files, and websites. The **renderer** (`src/`) is a React app that never touches the shell. They talk over a small IPC bridge (`electron/preload.cjs` → `window.bento`).

```
 You ──▶ React UI (src/) ──IPC──▶ main process (electron/) ──▶ claude / codex CLI (your subscription)
                │                         ├──▶ git clone + static analysis (atlas.cjs)
                │                         ├──▶ gh (GitHub search, repos, forks)
                │                         └──▶ net.fetch (websites)
                └──▶ Web Workers: Python (Pyodide), JavaScript (instrumented), TypeScript checker
```

## 1. Talking to AI without API keys

`runModel()` in `electron/main.cjs` spawns the CLI the user already signed into:

- **Claude Code**: `claude -p … --output-format stream-json --include-partial-messages --tools ""`. Tools are off, so the model can only write text.
- **Codex**: `codex exec --json -s read-only --ephemeral`.

Output streams back line by line (`ask:chunk`). Thinking progress arrives as `ask:think`. Errors are translated into plain advice by `humanize()` (usage limit, signed out, not installed). When the error is about the account (limit, signed out, missing), Bento retries once with the other provider: lessons in `askLesson` (`src/App.jsx`), Atlas readings in `narrate` (`src/hooks/useLibrary.js`) and quick calls in the `quick` handler. The learner's chosen language is appended to every system prompt by `withVoice()`.

## 2. Lessons are streamed blocks

The model writes **NDJSON**: one JSON object per line (`title`, `p`, `code`, `pseudo`, `notes`, `term`, `quiz`, `step`, …). The format lives in `electron/prompts.cjs`. `ndjsonParser()` in `src/lesson.js` parses each line as it arrives, and `applyBlock()` folds it into the lesson, so text, code and word cards appear while the model is still writing.

Modes change the prompt, not the format: `explain`, `code` (your code or a repo file), `feature` (recipe steps with diffs), `challenge`, `idea` (case study, facts from `src/ideas.js`), `compare`, `build`.

## 3. Running code

| Language | Where | How stepping works |
|---|---|---|
| Python | `src/runtime/pyWorker.js` (Pyodide; the core ships with the app, packages like numpy load from Pyodide's CDN on first import) | `sys.settrace` records each line and its variables |
| JavaScript | `src/runtime/jsWorker.js` | acorn rewrites the code to call `__s(line, vars)` before each statement |
| TypeScript | stripped by Sucrase (line numbers kept), then run as JS | same as JS. `tsWorker.js` runs the real compiler for type errors |
| HTML | served from `play://<id>/`, a separate origin | no stepping. The page's console is relayed with `postMessage` |

The same instrumentation counts steps for the **Growth** chart (Big-O) and stops infinite loops. `show()`, `print()` and the canvas helpers exist in every language.

## 4. The Atlas (taking a repo apart)

1. `fetchRepo` makes a shallow clone into `~/Library/Application Support/bento/repos`.
2. `analyze()` in `electron/atlas.cjs` does pure static analysis with no model: language and size per file, a **layer** (`ui`, `server`, `logic`, `data`, `support`), imports resolved to files (JS/TS aliases, Python packages, Go modules), outside packages, manifests, env keys, docker images and entry points.
3. `detectStack()` in `src/atlas/analyze.js` matches all of that against `src/atlas/catalog.js` (190+ tools with logos, plain-English roles and alternatives).
4. `buildAtlasPrompt()` sends the facts to the model, which streams back `gist`, `flow` (the big picture), `term`, `layer`, `journey`, `stack`, `file` roles, `hot` spots, `tour` and `learn` blocks.
5. Everything is cached in `~/Library/Application Support/bento/atlas/`, so reopening is instant.

Websites (`site:inspect`) work the same way, using headers, scripts and markup as the clues (`src/atlas/site.js`).

## Shipped content

The idea lessons (`src/ideas-prebuilt.json`), the path lessons (`src/path-prebuilt.json`) and three featured Atlases (`src/atlas-featured.json`), plus 12 daily bugs (`src/bugs-prebuilt.json`) are generated with the real app by `scripts/pregen-ideas.mjs`, `scripts/pregen-path.mjs` and `scripts/featured-atlas.mjs`, and checked to run without errors. They let new users learn before connecting an AI. The pre-written lessons are used only when the explanation language is English; otherwise Bento writes them fresh.

## 5. Storage

Everything is local. The renderer saves to `localStorage` and mirrors to `bento-store.json` on disk (`store:set`). On launch, whichever copy is newer wins. Lessons are the exception to "same data in both": browser storage holds the newest 60 for a fast start, and the disk copy holds all of them (up to 2,000), merged back in at launch (`saveLessons` in `src/store.js`). Atlases and site results live in their own cache files.

## Where to add things

- A clever idea: `src/ideas.js` plus a small SVG in `IdeaArt` (`src/ui/Ideas.jsx`).
- A tool: `src/atlas/catalog.js`, then run `node scripts/gen-icons.mjs`.
- A website signature: `SITE_SIGNS` in `src/atlas/site.js`.
- A path stop: `src/ui/Path.jsx`.
- An algorithm race: add it to `scripts/gen-races.py` and run it. Code and pseudocode are paired line by line, and the script checks they match.

## Safety

- **Your AI can only write text.** Claude Code runs with `--tools ""` and no MCP servers. Codex runs with a read-only sandbox. Neither can run commands or edit files through Bento.
- **Repos are read, never run.** Cloned code is only parsed (regexes and file reads). Bento never installs dependencies or executes anything from a repo.
- **Lesson code runs sandboxed.** Python and JavaScript run in Web Workers with step and time limits. Lesson web pages are served from `play://`, a separate origin in a sandboxed iframe, so they can't reach the app or its bridge.
- **Websites are fetched like a browser would, without your cookies.** Private and local addresses (`localhost`, `10.*`, `192.168.*`, `*.local`) are refused.
- **The renderer has no Node access.** `contextIsolation` and `sandbox` are on, and everything privileged goes through a small, explicit IPC list in `electron/preload.cjs`.
- **No telemetry.** Bento has no server. The only network traffic is your CLI talking to its provider, `gh` or `git` talking to GitHub, websites you ask it to read, and Pyodide's CDN when lesson code imports a package like numpy.
