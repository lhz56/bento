# How Bento works

Bento is an Electron app. The **main process** (`electron/`) owns everything outside the window: your AI CLIs, git and GitHub, files, and websites. The **renderer** (`src/`) is a React app that never touches the shell. They talk over a small IPC bridge (`electron/preload.cjs` → `window.bento`).

```
 You ──▶ React UI (src/) ──IPC──▶ main process (electron/) ──▶ claude / codex / gemini / copilot CLI (your plan)
                │                         ├──▶ git clone + static analysis (atlas.cjs)
                │                         ├──▶ gh (GitHub search, repos, forks)
                │                         └──▶ net.fetch (websites)
                └──▶ Web Workers: Python (Pyodide), JavaScript (instrumented), TypeScript checker
```

## 1. Talking to AI without API keys

`runModel()` in `electron/ipc/ask.cjs` spawns the CLI the user already signed into:

Each AI has one adapter in `electron/providers.cjs`; its name, models, plan and install, sign-in and update commands are in `electron/ai-catalog.json`, which the screens read too (`src/ai.js`). An adapter checks the CLI (`--help` must list every option Bento passes; the sign-in), builds its command, reads its stream and, where it can for free, reads the plan's limits. Instructions go in a private temporary file and the request on standard input, never on the command line (where other programs can read it, and Windows cuts it short). Every one runs as a writer only:

- **Claude Code**: `claude -p --output-format stream-json --include-partial-messages --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --system-prompt-file …`.
- **Codex**: `codex exec --json --ephemeral --ignore-user-config --ignore-rules -s read-only`, with `--disable` for each tool feature Codex reports having (shell, plugins, apps, browser and computer use…; `codex features list` says which exist, since an unknown name is an error).
- **Gemini CLI**: `gemini -o stream-json --admin-policy <deny every tool> --extensions none --allowed-mcp-server-names bento-none`, with Bento's instructions replacing Gemini's own (`GEMINI_SYSTEM_MD`). Denied tools are hidden from the model entirely.
- **Antigravity** (`agy`, for Google AI Pro and students): Google's agent can't have its tools switched off for one run, so it gets two locks. Its own rules deny every kind of tool it lets you name (`command`, `read_file`, `write_file`, `mcp`, `read_url`, `execute_url`, `download_url`; an unknown kind would make it drop the whole list, so only these are used), with no access outside an empty work folder. And Bento stops the run the moment the stream shows the model reaching for any tool (web search and sub-agents included): a lesson never needs one. The request goes in as a stream-json message on standard input. `flash`, `flash-low`, `flash-high` and `claude` stand for the newest matching model `agy models` lists. Its sign-in lives in your Antigravity folder, so its runs appear in your Antigravity history.
- **Copilot CLI**: `copilot -p … --output-format json --available-tools <none> --disable-builtin-mcps --no-custom-instructions --no-ask-user`, with `COPILOT_ALLOW_ALL` removed. When the GitHub CLI is signed in, Bento lends Copilot that sign-in (which Copilot accepts) and its own home folder, so lessons stay out of your Copilot history.

`test/fixtures/fake-ai.mjs` has a pretend twin of each that refuses to run unless those options are there, so `test/features.test.mjs` and `scripts/smoke-ais.mjs` fail the moment one goes missing.

Output streams back line by line (`ask:chunk`). Thinking progress arrives as `ask:think`. Errors are translated into plain advice by `humanize()` (usage limit, signed out, not installed). When the error is about the account (limit, signed out, missing), Bento retries with the next AI you have, in the catalog's order: lessons in `askLesson` (`src/hooks/useLessons.js`), Atlas readings in `narrate` (`src/hooks/useLibrary.js`) and quick calls in the `quick` handler. The learner's chosen language is appended to every system prompt by `withVoice()`.

## 2. Lessons are streamed blocks

The model writes **NDJSON**: one JSON object per line (`title`, `p`, `code`, `pseudo`, `notes`, `term`, `quiz`, `step`, …). The format lives in `electron/prompts.cjs`. `ndjsonParser()` in `src/lesson.js` parses each line as it arrives, and `applyBlock()` folds it into the lesson, so text, code and word cards appear while the model is still writing.

Modes change the prompt, not the format: `explain`, `code` (your code or a repo file), `feature` (recipe steps with diffs), `challenge`, `idea` (case study, facts from `src/ideas.js`), `compare`, `build`.

## 3. Running code

| Language | Where | How stepping works |
|---|---|---|
| Python | `src/runtime/pyWorker.js` (Pyodide; the core ships with the app, packages like numpy load from Pyodide's CDN on first import). Code is called with `callPromising` where the engine can switch stacks, so `asyncio.run()` really waits | `sys.settrace` records each line and its variables |
| JavaScript | `src/runtime/jsWorker.js`. The program gets its own `setTimeout`/`setInterval` and a counted `fetch`, and the run waits for them (20 s at most; a timer that only repeats is stopped after 3 s, and says so). An error inside a timer, or an unhandled rejection, is the run's error | acorn rewrites the code to call `__s(line, vars)` before each statement |
| TypeScript | stripped by Sucrase (line numbers kept), then run as JS | same as JS. `tsWorker.js` runs the real compiler for type errors |
| HTML | served from `play://<id>/`, a separate origin | no stepping. The page's console is relayed with `postMessage` |

The same instrumentation counts steps for the **Growth** chart (Big-O) and stops infinite loops. Puzzles add a `scale` mode to the Python worker: no tracing, just real time per call (so hidden costs inside built-ins like `list.insert(0, x)` or `x in a_list` count too) on inputs from 16 to 131,072 items, stopping early at a quarter second per call. `fitScale()` in `src/puzzles.js` turns those points into a Big-O class (log–log slope over the biggest sizes, or growth per step for exponential puzzles) and stretches it to a million and a billion. `show()`, `print()` and the canvas helpers exist in every language.

## 4. The Atlas (taking a repo apart)

1. `fetchRepo` makes a shallow clone into `~/Library/Application Support/bento/repos`.
2. `analyze()` in `electron/atlas.cjs` does pure static analysis with no model: language and size per file, a **layer** (`ui`, `server`, `logic`, `data`, `support`), imports resolved to files (JS/TS aliases, Python packages, Go modules), outside packages, manifests, env keys, docker images and entry points.
3. `detectStack()` in `src/atlas/analyze.js` matches all of that against `src/atlas/catalog.js` (190+ tools with logos, plain-English roles and alternatives).
4. `buildAtlasPrompt()` sends the facts to the model, which streams back `gist`, `flow` (the big picture), `term`, `layer`, `journey`, `stack`, `file` roles, `hot` spots, `tour` and `learn` blocks.
5. Everything is cached in `~/Library/Application Support/bento/atlas/`, so reopening is instant.

Websites (`site:inspect`) work the same way, using headers, scripts and markup as the clues (`src/atlas/site.js`).

## Shipped content

The idea lessons (`src/ideas-prebuilt.json`), the path lessons (`src/path-prebuilt.json`) and three featured Atlases (`src/atlas-featured.json`), plus 12 daily bugs (`src/bugs-prebuilt.json`) are generated with the real app by `scripts/pregen-ideas.mjs`, `scripts/pregen-path.mjs` and `scripts/featured-atlas.mjs`, and checked to run without errors. They let new users learn before connecting an AI. The pre-written lessons are used only when the explanation language is English; otherwise Bento writes them fresh.

## Paths

The built-in paths live in `src/paths.js`: each path is a list of stops, and each stop is one thing. Most are lessons (`q`, the question that writes it), and some open another part of Bento: `explore` (take apart a real app), `site` (a website), `play: 'sql' | 'git' | 'design'` (a playground) or `idea: '<id>'` (a clever idea). A stop that opens something counts as done once it's opened, and the page it opens shows the path strip (`src/ui/PathBar.jsx`) with the next stop. A stop's `words` are the terms it teaches and fill in the map; `sk` names map skills (`src/skills.js`) when the words alone don't match one, and the map offers each skill's path lesson. `test/features.test.mjs` checks that ids are unique, that idea and playground stops point at real ones, and that every lesson stop ships pre-written.

To add a path: add its stops and a `TRACKS` entry, run `npx vite build`, then `node scripts/pregen-path.mjs <worker> <total>` (for example three workers: `0 3`, `1 3`, `2 3`) and `node scripts/merge-path.mjs`. The script writes only the stops that don't have a lesson yet, in a hidden window with a throwaway profile, using your own Claude plan (Sonnet). The merge keeps the lessons already there.

## Programs that talk back

- **`input()` / `prompt()`**: the workers read answers from `extra.answers`. With none left they stop with a "need input" result, the output panel shows an answer box where the program asked, and the run starts again with one more answer. While you're answering, the random seed stays the same (`extra.seed`), so games replay identically.
- **Live output**: the Python worker calls `self.bentoLive` for each printed line; after 250 ms, batches go to the page as `{ live }` messages, so slow programs print as they go.
- **The internet**: `urllib.request.urlopen`, a small `requests` stand-in, and `fetch` in JavaScript all go to `/__net` on the app's own origin. `electron/main.cjs` (or the Vite dev server) fetches the page like a script would (http(s) only, 15 s, 5 MB), so browser cross-site rules don't block lessons.
- **Projects**: a lesson with `files: [{ name, code }]` shows tabs. Python writes the extra files to `/home/pyodide/project` and puts it on `sys.path`; web pages get their linked CSS/JS stitched in, after the HTML, so line numbers still match.

## Playgrounds, the map and packs

- `src/sql.js`: the café database, the challenges, and `pipeline()`, which splits a simple SELECT into clauses and counts the rows left at each step. It runs in SQLite inside Python.
- `src/gitsim.js`: a pure-JavaScript pretend filesystem and Git (index, commits, branches, fast-forward and three-way merges with conflict markers). `src/ui/Sandbox.jsx`: a small queueing model (utilisation → waiting time → errors) for "Design for a billion".
- `src/skills.js`: about 45 skills in six regions; `skillsFor()` maps any free-form concept to skills. `masteryOf()` counts **evidence** per skill: *seen* (lessons, ideas and stops opened), *asked* (questions in a lesson's conversation), *practised* (code run, stepped through, playgrounds) and *proven* (checks and quizzes right, puzzles solved). Level 1 is seen, level 2 needs three or more questions or real practice, level 3 needs proof. Only levels 2 and 3 fill in on the map (`src/ui/SkillMap.jsx`, a treemap whose area sizes follow the number of skills), and freshness comes from the latest activity.
- `src/packs.js`: validates content packs; their puzzles join the built-in ones through `setPackPuzzles()`. `scripts/check-puzzles.mjs --pack file.json` checks a pack's puzzles in real Python.
- `src/i18n.js`: `t('Run')` returns the interface's words in the chosen language. Missing ones are translated in batches by the learner's own AI and cached in `localStorage`.
- Watch it grow: `history()` in `electron/atlas.cjs` makes a bare, blob-less clone (commits and trees only), reads `git log --first-parent --name-status`, and returns about 90 folder snapshots plus the biggest moments.

## Puzzles

`src/puzzles.js` holds 34 hand-written LeetCode-style puzzles grouped into 13 patterns (`STATIONS`, easiest first). Each puzzle has a starter (`start`, usually the obvious working solution), the clever solution (`fast`), optional `helpers` and a `demo`. Every code line carries its plain-English reading after `#>`, so *Plain words* works offline. Visible tests and hidden "gremlins" are `[args, expected]` pairs; `setup` defines `make_input(n)`, the worst-case input used for timing. `scripts/check-puzzles.mjs` (part of `npm test`) runs everything in real Python: both solutions against every test and gremlin, the blank LeetCode-mode page, and the timing claims (the clever way meets its target, and the obvious way really is slower or crashes).

## Checking lessons and counting AI use

- **`src/verify.js`** tidies a lesson the moment it finishes writing (`tidyLesson`, called from `askLesson`): plain English that has slipped off its lines (`pseudoFits`: lengths, and blank code lines against blank English) is cleared so Desk writes it again by line number, line links and margin notes an AI counted wrong (`fixLinks`, `fixNotes`: pointing at blank lines, or a code-shaped label like `btn.textContent` that's on the next line) are moved back, and the free checks below run at once, web pages included (Bento never runs those). It also checks a fresh lesson once its code has run cleanly. `localChecks` fixes what can be proven for free (line links and notes past the end of the code, quizzes without a valid answer, plain-words lines that don't match the code). `checkPrompt` sends the numbered code, the real output, the paragraphs and the quizzes to the fast model; `applyCheck` applies only answers the model is sure of and only text fixes whose exact quote is in the lesson. Desk stores the result on the lesson as `check`, and Story shows it as the *✓ Checked* badge.
- **Usage**: `runModel` in `electron/ipc/ask.cjs` records every request that got an answer (what it was for, the AI and model, time, and token counts where the CLI reports them) in `usage.json`. Quick answers are saved in `quick-cache.json` for 14 days, keyed by model, voice and prompt. `usage:get` gives the week, and today per AI.
- **Plan limits**: how full each plan is, as the plan counts it, kept in `plan-limits.json` and pushed to the screens (`limits`). Claude sends a `rate_limit_event` with each answer (5-hour and weekly windows); Codex answers `account/rateLimits/read` from its app server and Copilot's allowance comes from GitHub, both without asking a model, so they're read when you open the panel and after each answer. Gemini doesn't share its numbers. `src/ui/Plans.jsx` turns a reading into the sidebar ring, the "Your plans" rows and Home's warning, translating only fixed words (never the numbers).

## Questions about real projects

- **`src/findProject.js`** (no AI): `projectNames(q)` pulls the project name out of a question, `mentionedProject` matches projects you've opened, `pointsBack` spots "it"/"this" questions, and `decide` picks: go straight there, ask which one, or write a lesson.
- **`electron/findproject.cjs`**: looks in `/Applications` (an app's `app-update.yml` or `package.json` names its GitHub repo; its icon comes from `sips`), in common code folders (never Documents, Desktop or Downloads, which would trigger a macOS permission prompt), and on GitHub by name. `BENTO_CODE_ROOTS` overrides the folders.
- **The conversation** lives in the Atlas's `AskBar`, saved per project (`bento.atlasThreads`, mirrored to disk). `atlas:search` finds the files whose contents mention the question's words (every code file, up to 2 MB each), and answers read the part of each file where the words are.
- **Big projects**: the analyser walks every file name, then reads up to 3,000 files taking a fair share from every app and package (`pickFiles`), source before tests and docs.

## Accessibility

`src/ui/a11y.js` holds the shared pieces: `useDialog` (focus moves in, Tab stays inside, Escape closes, focus returns), `pressable` (SVG parts that act like buttons) and `announce` (a polite live region). Colours come in two sets: the bright ones (`--accent`, `--mint`, `--violet`…) are for pictures and lines; words in colour use the `-ink` shades, which reach 4.5:1 on every background in both themes. To check, run axe-core against each screen (the project's audit visits 15 screens in light and dark mode and expects zero violations).

## Windows and Linux

Shortcuts go through `src/platform.js`: `mod(e)` is ⌘ on a Mac and Ctrl elsewhere, and `keys('⌘↵')` writes "Ctrl+Enter" on Windows and Linux. Test tools run the app off-screen: `BENTO_HIDDEN=1`, or automatically whenever a test tool drives it (it adds a debugging port); `BENTO_SHOW=1` shows the window. CI (`.github/workflows/ci.yml`) runs the tests on macOS, Windows and Ubuntu, packages the app with `electron-builder --dir`, then opens it and uses it with `scripts/smoke-app.mjs`.

## Finding your CLIs, and updates

- Apps opened from the Dock get a tiny `PATH`. `electron/shellenv.cjs` does what T3 Code does: it asks your login shell once (`$SHELL -ilc`, four-second limit, no stdin) for the `PATH` a new Terminal would have, falls back to `launchctl getenv PATH`, and keeps the usual install folders (Homebrew, npm, bun, pnpm, volta, asdf, `~/.local/bin`, `~/.claude/local`) as a last resort. Everything that starts a CLI waits for it (only in the first moments after launch).
- The welcome's scan also reads each CLI's `--help` and compares it with the options its adapter passes (`compat.flags` in `electron/providers.cjs`). A missing option marks the CLI outdated: the welcome shows its update command, and requests route to the next AI. One click on Install, Sign in or Update runs that AI's command from `ai-catalog.json` in Terminal (`ai:terminal`; no other command can be run this way).
- `electron/updater.cjs`: `electron-updater` against GitHub Releases. It runs only in a packaged, Developer ID–signed copy that has a release feed. It checks 15 s after launch and every 4 h, downloads quietly, and shows **Update ready · Restart** in the sidebar. See [RELEASING.md](RELEASING.md).

- The menu bar is `electron/menu.cjs`. Bento's own commands are sent to the page (`menu` events), which already owns their shortcuts; a menu event that arrives right after the same shortcut was pressed is ignored, so nothing runs twice. Errors go to `electron/log.cjs`, and window size and place to `electron/winstate.cjs`.

- `src/still.js` puts `html.still` on the page while Bento isn't focused or after 45 s without input; the stylesheet pauses only decorative animations under it (and IdeaFlow pauses its SVG motion), so an idle Home costs under 1% CPU instead of about 12%.

## Your own agent uses Bento (MCP)

Lessons usually go one way: Bento asks your AI and draws what comes back. `electron/agent.cjs` adds the other way: your
own agent (Claude Code, Codex, Gemini, Copilot, Cursor…) does the thinking and uses Bento as its classroom, so Bento
spends nothing of your plan.

```
 agent ──stdio, MCP──▶ Bento --mcp (no window, no Dock icon) ──socket──▶ the open Bento (ipc/agent.cjs) ──IPC──▶ useAgentBridge
```

- **`Bento --mcp`** is the app itself, started by the agent with one switch. `main.cjs` sees it before anything else
  starts (no window, no one-copy lock, a scratch folder of its own) and runs `bridge()`: MCP over standard input and
  output (`initialize`, `tools/list`, `tools/call`), nothing else ever written to standard output. A shipped copy opens
  Bento in the background if it isn't running; test and demo profiles never do.
- **The socket** is `agent.sock` in Bento's data folder (a named pipe on Windows), made by `serve()` once the app is
  ready, readable only by your user (0600). Arguments are checked in `checkArgs()` before the window sees them, and the
  agent gets a sentence it can act on when something is wrong.
- **The window** (`src/hooks/useAgentBridge.js`, with the pure parts in `src/agent.js`) does each tool: `show_lesson` turns the agent's
  fields into Bento blocks and opens a finished lesson signed "from Claude Code" (it waits for the first run and reports
  it), `get_learner_view` describes the page and the editor's code with line numbers, `highlight_code` sets the same
  line highlight a `[[4-6|link]]` does and pins the note open, `run_code` runs through the desk and reports logs,
  pictures and the error line (`describeRun()`).
- **No quiet spending:** a lesson from an agent never triggers Bento's own AI (no plain-English fill-in, no repair, no
  double-check); the agent is told about errors and fixes its own.

`scripts/smoke-agent.mjs` drives all of it as an agent would, against a hidden Bento with no AI; `smoke-app.mjs`
checks `--mcp` on the signed release too.

## 5. Storage

Everything is local. The renderer saves to `localStorage` and mirrors to `bento-store.json` on disk (`store:set`). On launch, whichever copy is newer wins. Lessons are the exception to "same data in both": browser storage holds the newest 60 for a fast start, and the disk copy holds all of them (up to 2,000), merged back in at launch (`saveLessons` in `src/store.js`). Atlases and site results live in their own cache files.

Every day (at launch and every 4 hours), `electron/snapshots.cjs` writes `Backups/Bento backup YYYY-MM-DD.json` in the backup format `backup:load` reads, and keeps the newest seven.

## Code layout

```
electron/                 the main process (Node)
  main.cjs                app lifecycle, the window, the IPC guard, process helpers, and the shared context
  ipc/<area>.cjs          one module per group of IPC handlers; each exports register(ctx)
    connections           finding each AI's CLI, its sign-in, Terminal for install and login
    plan-limits           how full each plan is
    ask                   runModel(), lessons streaming in (ask:*), quick answers, what used your AI
    folders, files        local folders; lesson web pages, exports, saving
    github, atlas, search gh, bringing a repo in and taking it apart, search and websites
    store                 the disk mirror of what the page saves, backups
    devices, agent        your phone and iPad; your own AI agent (MCP)
  providers.cjs           one adapter per AI CLI;  prompts.cjs  the system prompts
  atlas.cjs, worker.cjs   static analysis of a repo, on a thread of its own
src/                      the renderer (React)
  App.jsx                 wires the hooks together and lays out the screens
  screens/                the larger screens App.jsx shows (a lesson, a project's Atlas)
  ui/                     components
  hooks/                  the app's state and behaviour, one hook per job: useLessons (opening and asking),
                          usePersistence (saving), useQuestionRouting, useNavigation, useLibrary (repos,
                          folders, sites)... index.js lists them all
  runtime/                running code: Python, JavaScript, TypeScript workers
  atlas/                  what a repo is made of (stack detection, the catalog, prompts)
  styles/app, styles/touch  the styles, one file per screen, imported in cascade order by index.css
```

`main.cjs` builds one `ctx` object of getters, so a module always sees the current window and settings, and each
module's exports join it for the modules after it. Nothing else is shared between modules.

Checks: `npm run lint` (ESLint), `npm run format:check` (Prettier), `npm run typecheck` (TypeScript over the
JavaScript, with `checkJs`), `npm test` and `npm run smoke`.

## Where to add things

- A clever idea: `src/ideas.js` plus a small SVG in `IdeaArt` (`src/ui/Ideas.jsx`).
- A tool: `src/atlas/catalog.js`, then run `node scripts/gen-icons.mjs`.
- A website signature: `SITE_SIGNS` in `src/atlas/site.js`.
- A path stop: `src/ui/Path.jsx`.
- A puzzle: add it to `PUZZLES` in `src/puzzles.js` (statement in your own words, starter, clever solution, tests, gremlins, a worst-case `make_input`), then run `node scripts/check-puzzles.mjs`.
- An algorithm race: add it to `scripts/gen-races.py` and run it. Code and pseudocode are paired line by line, and the script checks they match.

## Safety

- **Your AI can only write text.** Every AI runs with its tools, plugins and tool servers off and none of your personal settings (see the adapters above). None can run commands, read files or edit anything through Bento.
- **Repos are read, never run.** Cloned code is only parsed (regexes and file reads). Bento never installs dependencies or executes anything from a repo.
- **Lesson code runs sandboxed.** Python and JavaScript run in Web Workers with step and time limits. Lesson web pages are served from `play://`, a separate origin in a sandboxed iframe, so they can't reach the app or its bridge.
- **Websites are fetched like a browser would, without your cookies.** Private and local addresses (`localhost`, `10.*`, `192.168.*`, `*.local`) are refused.
- **Lesson code reaches the public internet only.** `urllib`, `requests` and `fetch` in lesson code go through `/__net`, answered by `electron/netfetch.cjs` (and by the same file in `vite.config.js` during development). It allows http(s) only, refuses local names and private, loopback and link-local addresses, and checks the address again at the moment of connecting (Node's `lookup` hook), so a name can't switch to a local address after it was checked (DNS rebinding). Every redirect goes through the same check. Answers are capped at 15 seconds and 5 MB, and no cookies are sent.
- **The window only shows Bento.** `will-navigate` blocks every page that isn't Bento's own. Links open in your browser, and only `https:`, `http:` and `mailto:` ever leave the app. Webviews and new windows are refused.
- **Only Bento's page can use the bridge.** Every IPC call is checked against the sender's address (`app://bento`, or the Vite server in development). Permission requests (camera, microphone, location…) are denied, except notifications, copying and fullscreen for Bento's own page.
- **Only real project folders open by themselves.** A folder dropped in or reopened after a restart can't be the whole disk, your home folder, a system folder or a place secrets live (`~/.ssh`, `~/.aws`, `~/Library`…); see `electron/roots.cjs`. Choosing a folder in the Open dialog is up to you.
- **Files stay inside what you opened.** `folder:read` resolves real paths, so `../` and symlinks in a downloaded project ("notes → ~/.ssh") can't reach outside it. Repo names must be `owner/name`.
- **Saves never leave half a file.** Bento's own files (`bento-store.json`, usage, the quick-answer and Atlas caches) are written as a new copy and then swapped in (`electron/safewrite.cjs`), so a full disk or a crash mid-save keeps the last good copy.
- **Tests can use pretend AIs.** `BENTO_FAKE_AI=test/fixtures/fake-ai.mjs` with `BENTO_FAKE_AS=claude,codex,gemini,copilot` (honoured only in hidden test mode) stands in for each CLI: answering `--version`, `--help`, sign-in and limits like the real one, and streaming a short lesson in its own format. `scripts/smoke-stream.mjs` and `scripts/smoke-ais.mjs` use them to check asking, streaming, each AI in turn, the plan meters and falling back to the next AI, on every CI run, for free.
- **A hidden CLI is never started.** `BENTO_PRETEND_MISSING=claude,codex,gemini,copilot,gh` (used by tests) refuses to run those tools at all, so a test can never quietly spend your plan.
- **The shipped app is locked.** Signed with the hardened runtime, code in an integrity-checked asar, and Electron's `RunAsNode`, `NODE_OPTIONS` and `--inspect` switches off. See [RELEASING.md](RELEASING.md).
- **The renderer has no Node access.** `contextIsolation` and `sandbox` are on, and everything privileged goes through a small, explicit IPC list in `electron/preload.cjs`.
- **No telemetry.** Bento has no server. The only network traffic is your CLI talking to its provider, `gh` or `git` talking to GitHub, websites you ask it to read, and Pyodide's CDN when lesson code imports a package like numpy.
