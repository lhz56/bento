# What changed overnight (Nov 9, 2026)

Bento opens with a short welcome. It checks which AI you already have on this Mac and routes to it.

## A 5-minute tour

1. **Welcome.** Bento finds Claude Code, Codex and GitHub, shows your plan, and asks how much code you've seen, which language you want explanations in, and what you're curious about.
2. **Explore code → paste `shadcn-ui/taxonomy`** (or any repo or website):
   - *Overview*: one headline, a vitals card, and **the big picture**, an animated flow of the whole system. Click any part to see its plain name, what it does, and the real technical word. **▶ Walk me through it** visits each part and reads it aloud.
   - *What it takes to build this*, then **Build a mini version with me**: a step-by-step runnable toy version of the app. New: **Turn these into my learning path** turns the skills list into a custom path on The path (taxonomy became an 8-stop track in about 6 seconds).
   - *Built with*: a strip of real logos. Click one to see why this project picked it, and "Pick X when…" for each alternative.
   - *Anatomy*: the code city. Hover buildings; play a journey.
   - *Hot spots*: risk types at a glance, with a tiny building for each risky file.
   - *Files*: a **map** of every file, sized by code and coloured by layer. Open any file and press **How do others write this?** to get a side-by-side lesson with the same function from another open-source project.
   - Every open file shows its **ripple**: rings of the files that would feel a change to it (direct users, then their users), with the words *coupling* and *blast radius*. `lib/utils.ts` in taxonomy reaches 85 files; a page reaches none.
   - *Study it*: a reading tour, file by file. Plus **🕵 Code detective**: Bento shows the top of five real files and you guess what each one does (three choices, stars for each right answer), a game for the most underrated skill, reading code.
   - **Ask bar**: a quick answer in about 4 seconds, with clickable files. ⌘↵ turns it into a full lesson.
   - With no AI connected yet, Explore's **Ready instantly** box still opens three fully explained projects (a web app, a Python bot and a game).
3. **Paste a website** (`stripe.com`, `wikipedia.org`): what it's built with, from its headers and scripts, and the trip from your keyboard to the page.
4. **Clever ideas**: 32 famous engineering tricks (Uber H3, Dropbox blocks, Amazon Dynamo vector clocks, LinkedIn's Kafka log, Google Spanner TrueTime, Facebook's memcache leases, AWS backoff with jitter, Raft elections in etcd, Apple's differential privacy, Chrome's Bloom filter, Google's hedged requests, Netflix Chaos Monkey, Bitcoin proof of work, Google Docs collaboration, Twitter timelines…). Each is a runnable blog post with the obvious way next to the clever way. When the company's code is open source, **See the real code** opens the exact file inside the Atlas (Uber's `algos.c` in h3, Redis's `evict.c`, Bitcoin's `pow.cpp`, Discord's hash ring…). All 32 **ship with the app and open instantly**, even with no AI connected. Plus **algorithm races** (sorting, searching, Fibonacci, counting, two-sum) that open instantly.
5. **The path**: three tracks: *Zero to a real app* (ending with **Build your first app**, a to-do web app built step by step that remembers your tasks), *How the web works* (real web pages with a live preview), *AI from scratch*. All 26 path lessons (and Home's six simulation questions) **ship with the app** (beginner level), so a brand-new user can learn before connecting any AI. **Make your own path**: type any goal ("learn SQL", "build a Discord bot") and Bento designs a 6–9 stop track for you in about 15 seconds; each stop becomes a lesson when you press Start.
6. **In any lesson**:
   - ↵ in the ask box gives a short inline answer. **Second opinion** asks your other AI the same question.
   - Select any text and press **Explain**.
   - **Explain change** walks you through your own edits.
   - **Simpler / Deeper** re-teaches the lesson at another level.
   - **Find this in real code** searches GitHub for the idea, then opens the result in the Atlas.
   - **Read as article** turns the lesson into one readable column, with the code and its charts inline, like an engineering blog post.
   - **✨ New in your code**: when you write or edit code, Bento notices constructs you haven't met yet (list comprehensions, f-strings, `enumerate`, arrow functions, `?.`, `async/await`, about 27 in all) and explains each one instantly with an everyday comparison, no AI needed. One click adds it to Your words.
   - **🔮 Predict** (next to Output): guess what the code will print, then run it. Bento colours each line you got right, and **Why is it different?** points at the exact line that surprised you (e.g. `sort()` changes the list in place, `append` returns `None`).
   - **Explain it back** (end of every lesson): write the idea in your own words; your AI says what you got, what to add, and asks one question that pushes further, with a 3-step meter. A vague answer about Bloom filters scored *Getting there*; a full one scored *You've got it*. It's saved with the lesson.
   - **◫ Web page** saves the lesson as one self-contained `.html` blog post (to `Desktop/Bento pages`) that anyone can open in a browser: the code is editable and **Run** works there too (JavaScript directly, Python by loading Pyodide), with drawings, bar charts and the quizzes.
   - Also: **Listen**, **Copy as notes**, **Share** (`.bento` files), and **⎘ remix** into your own scratchpad.
7. **Puzzles: LeetCode, from the top down** (new, sidebar ◇):
   - **The one chart behind every puzzle**: a slider from n = 10 to a billion, with six Big-O classes racing as bars ("compare every pair: 3 thousand years; try every combination: longer than the universe’s age"). Each row opens a puzzle that runs at that speed.
   - A **metro line of 13 patterns**, easiest at the top: the shape of every puzzle → hash maps → two pointers → sliding window → stacks → binary search → heaps → trees → graphs → dynamic programming → backtracking → sort-then-sweep → design a tiny system → *beyond one computer* (which hands over to Clever ideas). Each station has a small animated picture and an everyday analogy.
   - **34 puzzles** (FizzBuzz, Two Sum, Valid Parentheses, Number of Islands, Coin Change, N-Queens, LRU Cache…), each 🌱 warm-up, 🧩 classic or 🔥 boss, with its LeetCode number. Statements are written fresh and link to the same puzzle on LeetCode.
   - Each puzzle opens with **code that already works** (the obvious way), or a short starter, then earns three stars: ✓ **works** (tests), 👾 **gremlin-proof** (3 hidden edge cases, like an empty list or a repeated number) and 🚀 **scales**. **Check** races the obvious way, your code and the clever way on inputs up to 131,072 items in real Python, then shows the ladder up to a billion: "Two Sum, obvious way: 2 s at LeetCode’s size (*Time Limit Exceeded*), 5.7 hours at a million, 648 years at a billion; the clever way: 2 minutes." The recursive paint bucket visibly **crashes** at 1,024 squares; recursive Climbing Stairs would take **5 million years** at 100 steps.
   - **Blank page** turns it into LeetCode mode (just the function signature). Hints step up gently; **Show me a clever solution** needs two clicks.
   - **Talk me through it** (with an AI connected): explain your solution like in an interview. Your AI plays a fair interviewer and asks the follow-up a real one would ("What happens if you swap the check and the store, with [3, 3]?").
   - **🧭 Which pattern?**: a game where you read a puzzle and pick the way of thinking, the skill interviews actually test.
   - Every puzzle ends with **when n is bigger than one computer**: where this exact pattern runs at real scale (Redis’s hash table, LevelDB’s merging, `git bisect`, Lucene’s top-k queue, SQLite’s B-tree, Python’s own `heapq` and `lru_cache`), with the matching clever idea.
   - Works with no AI connected. `npm test` now also runs every puzzle in real Python (`scripts/check-puzzles.mjs`).
8. **Your words**: every new technical term, with flashcards that space themselves out.
9. **⌘K** searches or asks anything. **⌘,** opens settings (22 explanation languages). **?** shows all shortcuts.

## Ready for the Mac (Nov 10, early morning)

**Learning**

- **Home, split.** One calm ask box on the left with ideas drifting underneath as tiny moving pictures (a search tree growing, cars bunching into a traffic jam, a fire spreading, money snowballing). Each opens instantly. On the right, *Today*: your next path stop, a short plan that ticks itself off, how your map is filling in, and your streak. Past chats moved to the sidebar's *Recent* shelf, grouped by day.
- **The map is a treemap** (option 9): six areas sized by how many skills they hold. Tiles fill in only from evidence (seen → practising → yours), and picking one shows what earned it, what would move it on, and **Quiz me**.
- **Topics aren't mistaken for projects.** "How does a binary search tree work?" used to send Bento searching GitHub for a project called *binary search tree*; a name that matches one of Bento's own lessons is now treated as a topic. Real projects ("how does T3 Code work?") still open their code. The suggestions under the ask box pick the lesson named after your topic, and stay quiet for vague questions ("how does this code work?").
- **⌘K knows what ships with Bento.** Typing "binary search trees" offers the built-in lesson first (*instant*), above "ask for a new lesson". Before, it went to your AI and spent your plan on a lesson Bento already had.
- **Map tiles fit their names.** Columns follow each area's real width (one column when an area is narrow, as with the card open), so names like "Interactive pages" and "Backtracking" are never cut mid-word.
- **⌘K puts the lesson named exactly what you typed first**, ahead of look-alikes ("Remix of…").
- **⌘K searches inside your lessons**, not just their titles, and shows the passage that matched ("vector clock" finds the Amazon cart lesson).
- **Waiting for a new lesson is a picture now**: six small marks on a line (👀 🎯 ☕️ ⌨️ 👉 🧩), ticked as the tutor plans, with only the current step in words.
- **Asking inside a lesson shows you the answer.** Before, the answer appeared at the bottom of the lesson while the page stayed where it was; now the question scrolls into view, and again when the answer lands.
- **Day one on the map** shows where to begin: the first skill says *start here* instead of 43 grey tiles.
- **Recent stays tidy.** Remixing the same lesson again replaces a remix you never touched, instead of adding another identical "Remix of…". Anything you've changed or asked about stays.

**A real Mac app**

- **A real Mac menu bar**: About, Check for Updates…, Settings, New Question, Search, the sidebar, Keyboard Shortcuts, Report a Problem and Show Logs. Electron's own links and DevTools are gone. Bento also reopens where you left it, brings itself back if the page ever crashes, and keeps a small error log for bug reports.
- **A friendlier first run**: install commands that work on *this* Mac (Claude Code's own installer needs nothing else; Homebrew or npm for the others, or a download link), an **Open Terminal** button, and Bento looks again by itself when you come back from Terminal. The last step also offers "or just ask anything".
- **Settings shows your version** with Check now and an Automatically switch for updates.
- **Small windows work.** At the smallest window size the code panel's Run button was cut off; the lenses now shorten to Code / Both / Plain when the panel is narrow. The map scrolls instead of squashing tiles, and the Atlas tabs fade at the edge when there are more to scroll to, with its buttons turning into icons when space is short.
- **Quitting mid-lesson asks first.** ⌘Q or Restart-to-update while a lesson is being written would throw it away, and the part of your plan it used. Bento now asks.
- **A real installer window**: the DMG opens on "Drag Bento into *Applications*" with an arrow, sharp on Retina.
- **Easier on the battery.** Home's drifting ideas, glows and the path's "you are here" ring now rest while Bento isn't the app you're using, or after 45 seconds without a touch, and start again with the first mouse move. Idle on Home went from about 12% CPU to under 1%. Spinners and progress keep moving; with Reduce Motion on, the decorations don't move at all.

**Shipping**

- **Signed, notarized, self-updating**: `npm run dist` makes the `.dmg` and `.zip` for Apple Silicon and Intel. Tag `v0.3.0` and `.github/workflows/release.yml` signs, notarizes and publishes them. Installed copies update quietly and show **Update ready · Restart**. All you need is the Apple Developer certificate and five GitHub secrets: [RELEASING.md](RELEASING.md).
- **`npm run preflight`** checks a release before you tag it: version, files, packaging, fuses, entitlements, your Developer ID certificate and notarization key, then the tests.

**Safe and reliable**

- **Finds `claude` however you installed it.** Opened from the Dock, Bento now asks your login shell for its `PATH`, like T3 Code does, so nvm, fnm, volta, asdf and pnpm installs are found, not just Homebrew and npm.
- **Locked down for shipping**: the window can't be sent to a website, only Bento's own page can use its bridge, camera and microphone requests are refused, symlinks in a downloaded project can't lead outside it, and the shipped app's code is integrity-checked with Electron's dangerous switches off.
- **Saving is safe on a full disk.** Saving on quit used to write straight over your lessons file, so quitting with a full disk could leave it half-written. Every Bento file is now written as a new copy, then swapped in.
- **Outdated CLIs are caught early.** The welcome checks that Claude Code and Codex still understand every option Bento passes them. If one is too old, it says so with the update command, and Bento uses your other AI meanwhile. If a CLI update ever renames an option, the error says to update instead of showing a parser message.
- **A daily copy of your learning**, kept for a week, in the same format as a manual backup: Settings → Restore… opens them, so any day can come back.

**Tested without spending your plan**

- **The core path is tested for free**: a pretend Claude streams a lesson so CI checks asking, streaming and running on every change, without spending anyone's plan.
- **Every check lives in the repo now**, and CI runs them on each change: the app smoke test, a learner's tour (`scripts/smoke-tour.mjs`), a lesson streaming in from the pretend AI, the guard rails (`scripts/smoke-guards.mjs`), every screen through axe-core in light and dark (`scripts/audit-a11y.mjs`) and the keyboard walk (`scripts/audit-keyboard.mjs`). They set up what they need themselves. Running them from a fresh profile found three things the old checks never reached: the first-lesson tips bubble, a project's loading screen and the model picker's "Connect" row. All three are fixed.
- **Tests never spend your plan.** The "no AI" app test was quietly running Claude Sonnet, because hiding a CLI only hid it from detection. A hidden CLI now can't be started at all.

## A sky you earn, answers you can use (Nov 10)

- **Your map is a night sky** (since replaced by the treemap above), and a star only glows with evidence: questions you asked, checks you got right, puzzles solved. Opening a lesson just leaves a faint ring. Pick a star for what earned it, what would make it shine, and a **Quiz me** that writes fresh questions when your lessons have none.
- **Answers you can do something with.** After an answer: tap a suggested next question, ask for it *simpler* or *with an example*, and an optional *check yourself* question (right answers count on your map).
- **Path lessons say where they are**: the path, the stop number and a *Next stop* button.
- **Room to read**: a wider story column, whole-width answers instead of chat bubbles pushed to the side, and a sidebar you can hide (⌘\\).
- **A real model picker**: each AI as a card with what it's good at, speed and depth, and whether it's connected.
- **Stepping through code you can follow**: slow, normal or fast, a longer look wherever something changes or prints, and what changed on each step ("score: 0 → 10").

## Real projects, and a calmer sidebar (Nov 10)

- **"How does T3 Code work?"** Bento looks on your Mac first (your installed T3 Code says its code is `pingdotgg/t3code`), opens the real code and answers there, from its files. A copy already on your Mac is used instead of downloading. Something found only on GitHub asks first.
- **It remembers what you were reading.** Name a project you've opened, or ask about "it" right after, and the question goes to that project's conversation, docked beside its code. Follow-ups remember earlier answers, and files named in answers open with one click.
- **Big projects read properly.** The "this one is huge" warning used GitHub's size with the whole history (0.7 GB for T3 Code; Bento downloads about 120 MB). Every app and package of a big monorepo is now read, not just the first folders in alphabetical order.
- **The sidebar is five places**: Learn, Explore, Practice, Path, You. Related pages are tabs at the top. Lessons and projects share one *Recent* list, and the model, AI use and GitHub sit in one footer row. Buttons give a little when pressed; cards lift when you point at them.
- **Fixed on the way**: file reads checked only that a path *started with* the project folder (so `../bento-secrets` passed); a stopped reading restarted on its own when you reopened the project; big files were invisible to answers.

## Quality pass (Nov 10)

- **Lessons are checked against reality.** After a new lesson's code runs, Bento fixes what it can prove for free (links and notes past the end of the code, broken quizzes), then asks your fast model whether each quiz answer and claim matches the code's real output. Wrong answers get corrected with a new explanation, and the lesson shows **✓ Checked · N fixes**. On a lesson with three planted mistakes it caught all three; on three real lessons it changed nothing.
- **You can see what uses your AI.** A meter in the sidebar counts today's requests with real token counts. A repeat quick question answers from a saved copy, free, and asking for a lesson you already have reopens it.
- **Lesson code can't reach your Mac or home network.** `requests.get("http://192.168.1.1")` or a public link that redirects there is refused, checked again at the moment of connecting.
- **Keyboard and screen readers.** 15 screens × light and dark mode pass axe-core with zero violations, down from 288 problems. Text meets WCAG AA contrast. Windows keep focus inside and give it back when they close. The map stars, the system designer's parts and the code city work with Tab, the arrow keys and Enter. Charts have text summaries, and runs, crashes and finished lessons are announced.
- **Windows and Linux.** Shortcuts used to check only the Mac's ⌘ key, so none of them worked on Windows or Linux. Now Ctrl works there, and the app writes "Ctrl+K". CI tests, packages and opens the real app on macOS, Windows and Ubuntu (`scripts/smoke-app.mjs`, 14 checks).

## New after the audit (Nov 10)

Everything from the full audit, built and checked in the app:

- **Beginner walls gone.** `input()` works: the program pauses and you answer right in the output. Slow programs print as they go. Lesson code can reach the internet (a real London temperature from a weather service, GitHub's API). Pressing Enter with no AI connected no longer starts a lesson that never arrives.
- **Small fixes.**
  - Compare offers the three ready-made apps.
  - The Run button stays visible in narrow windows.
  - `⌘/` (or `?` in an empty ask box) opens the shortcut sheet.
  - The games shelf shows real variety (2048, Flexbox Froggy, shapez.io) instead of twenty Snakes.
  - Grey text now meets the WCAG AA contrast minimum.
  - Puzzle pictures respect "Reduce motion".
  - The welcome offers Puzzles.
  - Your words starts with eight everyday words.
  - Menus and buttons switch language too (Spanish appeared in about 3 seconds, then instantly after a relaunch).
  - A damaged save file can no longer blank the app, and a crash shows a friendly recovery screen.
- **One journey.**
  - Every lesson opens with its picture.
  - The end of a lesson is one card: Play with it, Go further, Prove it.
  - Algorithm races moved into Puzzles.
  - Home has a **Today** strip.
  - **Your map** shows every concept as a star that dims when you haven't touched it; *Review what's fading* replays your own lessons' quick checks.
- **Playgrounds.** A SQL café database with eight challenges and a step-by-step picture of each query; a pretend terminal and Git with eight missions, a status picture and a commit graph; and **Design for a billion**, five levels from "your app goes viral" to a million requests a second.
- **Multi-file projects** (Python modules, or a web page with its CSS and JS), **Publish** to GitHub Pages with your own account, **Back up / Restore**, and an **Open in Bento** bookmark (`bento://`).
- **Movie mode** for step-through (arrows for `i`/`j`, windows for slices) and a **Stuck?** card after three identical errors or three failed test runs.
- **Watch it grow** (Flask's 2,283 commits replay in about half a second to load) and **Help out**: good first issues, explained, with the files and the real pull-request steps (tried on Excalidraw).
- **Content packs**: a shareable JSON of puzzles, paths and ideas ([PACKS.md](PACKS.md), [example-pack.json](example-pack.json)), checked in real Python by `check-puzzles --pack`.
- **Windows and Linux builds** are set up (`npm run dist:win`, `npm run dist:linux`): CLIs start through a shell, prompts go over standard input, and the window has its own title bar. They are **not tested yet** on those systems.

## New since last night

- Welcome flow, subscription scan, auto-routing, and friendlier errors (usage limits, signed out, not installed).
- Atlas overview: big picture, vitals, logo strip, "what it takes", build-a-mini-version.
- Website take-apart; Compare (vertical flows, shared/unique tools, compare lessons using real code from both apps).
- Clever ideas (32), algorithm races (5), the path (3 tracks plus your own), daily bug.
- TypeScript (real compiler type errors as you type), HTML/CSS/JS live previews on an isolated origin.
- Words and flashcards, inline answers, second opinion, select-to-explain, explain-my-change.
- If a freshly written example crashes, Bento quietly fixes it once and says what it changed (never in challenges).
- Lessons, progress and settings are mirrored to disk (crash-safe).
- You can **stop** a lesson or an Atlas reading mid-way (the AI process is really killed). Quitting Bento stops any running AI process. A watchdog gives up on an AI that goes silent for too long, allowing more time for Codex, which only answers at the end.
- TypeScript errors have an **explain** button that says what's wrong in plain words. Your words can be exported for Anki or Quizlet.
- 22 explanation languages; code stays in English.
- Questions about systems ("how does email work?") come with an animated diagram of the whole system.
- Websites that link to their GitHub code offer **take apart the code**.
- In web-page lessons, **point at anything on the page** to light up the line of code that made it. Pages keep their own storage between runs, and **Save my page** writes a real `.html` file to `Desktop/Bento pages`.
- Home's *From your GitHub* card suggests three lessons picked from what your repos actually use (refreshed daily). Paste a GitHub **file** link to open that exact file in the Atlas.
- First-time hints point at the key controls in your first lesson and first Atlas (once, ever).
- Huge repos (like Linux) ask before downloading. Settings shows how much space downloaded code uses, with a button to free it.
- **Build a mini version** of a web project builds a live web page.
- Explore has a **New this month** shelf; Home shows your streak; finishing a path stop gets a small celebration.
- Grids of a few values (forests, mazes, game boards) now draw as coloured squares, and lists of records draw as real tables. When code shows the same kind of picture several times in a row (each tick of a simulation), they become one **flipbook** you can play and scrub.
- **Practice this** at the end of a lesson creates a quick challenge on the same topic, with tests that light up.
- Clicking a district sign in the code city jumps to just those files in the file map.
- **Errors explain themselves instantly**, with no AI needed: about 35 of the most common Python and JavaScript errors (missing key, text + number, forgotten colon, `undefined`, infinite loops…) get a plain-words "what happened" and a "try this" right away. Common JavaScript habits in Python are caught too (`push` → `.append(x)`). **Explain it for my code** still asks your AI when you want more.
- Bar charts titled "A vs B" now label each bar.
- Tools found only in a project's docs website or examples are set aside ("only for its docs site and examples"), so a C library like Uber's h3 no longer looks like a React app.
- If Bento was closed before a project's reading began, reopening it starts the reading again instead of showing an error.
- The welcome screen is now three tiny living scenes (a city building itself, code running line by line with its variable counting up, your AI plugging into Bento) instead of three text cards.
- **Automatic routing between your AIs.** If Claude hits its usage limit, is signed out or missing, Bento quietly asks Codex instead (and the other way round) for lessons, project readings and quick answers. A lesson that was rerouted says so at the top. Tested with `BENTO_FAKE_LIMIT=claude`.
- Home's stats line ends with a tiny bar for each of the last 28 days you learned (taller = more lessons and new words that day).
- **Your words** is lighter: each card shows the word and its everyday comparison; the definition appears when you point at it or click.
- Python lessons can use **numpy and pandas** (and other Pyodide packages): they download from Pyodide's CDN the first time code imports them (about half a second for numpy), then stay cached. Lessons still prefer the standard library.
- The **Daily bug** opens instantly, even offline: 12 pre-written Python bugs (one per rotating topic: off-by-one, recursion, dictionaries…) ship with the app. Each was checked to pass some tests and fail others, so there's a real bug to find. Other languages and levels still get a fresh one from your AI.
- Clever ideas features **today's pick**, an idea you haven't read yet that changes daily, instead of always Uber.
- Open-source repo hygiene: README with screenshots, LICENSE (MIT), CONTRIBUTING, ARCHITECTURE (including a safety section), CI workflow, `npm test`.
- Fixed overnight: crash recovery didn't fully work. When browser storage was lost, Bento saved its fresh defaults before reading the disk copy, so your words, progress and project list weren't restored (and the welcome could come back). It now restores from the disk copy as it was at launch.
- Fixed overnight: Bento used to keep only your newest 60 lessons, so older ones silently disappeared, and the sidebar showed only 30 lessons and 5 projects (now with **Show more**). Now every lesson is kept on disk (the newest 60 also stay in fast browser storage), and the last edit is saved even if you quit right away.
- Fixed overnight: a Python import-reading bug that hid outside packages, stale output when switching lessons quickly, and arrow functions returning objects in step-through.

- **The path, reworked.** Paths are compact tabs with progress rings. Each one has a header with where it ends, the number of stops, rough time and a **Continue** button. **Make your own path** now designs one running project: every stop says what it adds ("you'll make…"), each new stop's lesson knows the whole path and continues from the previous stop's code, and the last stop finishes the project.

- Fixed: panels that slide in from the right (a file from the Files map, for example) opened off screen when you had scrolled down the Atlas. Line links no longer repeat a number the text already says ("line 7⁷"). **Second opinion** now asks the AI that *didn't* write the answer, even after you switch models, and both answers are labelled.
- Taking apart a new repo now shows each step long enough to read, with what it found ("8 files · 706 lines · 10 imports followed · 2 outside packages"). Saved and featured projects still open instantly (about 0.35 s).
- Bento runs as a single copy. Opening it again brings the open window forward. Two copies on one profile used to fight over its storage, which made every launch wait about 4 s.

## Checking it yourself

```bash
node scripts/smoke-app.mjs     # open the real app and use it, hidden, no AI used (after npx vite build)
npm test                       # runtimes, stepping, TypeScript, repo analysis, errors, export, constructs, playgrounds, skill map, packs, Big-O fitting, input() + all 34 puzzles in real Python
npm run dev                    # hot reload
npm run app                    # rebuild release/mac-arm64/Bento.app
BENTO_USERDATA=/tmp/demo npm start                           # a clean profile (fresh welcome)
BENTO_PRETEND_MISSING=claude,codex,gh BENTO_USERDATA=/tmp/x npm start   # see what a brand-new user sees
BENTO_FAKE_LIMIT=claude BENTO_USERDATA=/tmp/x npm start                 # Claude says "usage limit": watch Bento route to Codex
```

## Known gaps

- Until the Apple Developer certificate is added, builds are unsigned: the first launch needs right-click → Open, and they can't update themselves. Everything else for signing, notarizing and updates is in place ([RELEASING.md](RELEASING.md)).
- New lessons you ask for take 10–40 s (longer ones up to a minute). The wait shows progress stages.
- Very large repos show their most important ~100 buildings in the city; everything else is in the Files map.
- Website detection only sees what a browser sees (headers, scripts, markup), so server-side databases are inferred, not proven. The lesson says "likely" when it guesses.
- Linux was run for real (Debian 12 on arm64, in a container): the tests pass, the app packages, opens, runs Python and JavaScript, and passes all 14 smoke checks. Windows was checked by making the app believe it runs on Windows (shortcuts, labels, Ctrl+Enter); the CI workflow runs it on a real Windows machine on the next push. Ubuntu 24.04 limits the Chromium sandbox for AppImages, so some desktops may need an AppArmor profile or `--no-sandbox`. That hasn't been tested.
- Accessibility was checked with axe-core and keyboard-only scripts, not yet with VoiceOver, NVDA or a real screen-reader user.
- Publishing to GitHub Pages was checked with a dry run (the exact `gh` commands), not on a real account.
