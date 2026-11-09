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
7. **Your words**: every new technical term, with flashcards that space themselves out.
8. **⌘K** searches or asks anything. **⌘,** opens settings (22 explanation languages). **?** shows all shortcuts.

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

## Checking it yourself

```bash
npm test                       # 63 checks: runtimes, stepping, TypeScript, loop guard, repo analysis, error explanations, web-page export, construct spotting
npm run dev                    # hot reload
npm run app                    # rebuild release/mac-arm64/Bento.app
BENTO_USERDATA=/tmp/demo npm start                           # a clean profile (fresh welcome)
BENTO_PRETEND_MISSING=claude,codex,gh BENTO_USERDATA=/tmp/x npm start   # see what a brand-new user sees
BENTO_FAKE_LIMIT=claude BENTO_USERDATA=/tmp/x npm start                 # Claude says "usage limit": watch Bento route to Codex
```

## Known gaps

- The app is unsigned; the first launch needs right-click → Open.
- New lessons you ask for take 10–40 s (longer ones up to a minute). The wait shows progress stages.
- Very large repos show their most important ~100 buildings in the city; everything else is in the Files map.
- Website detection only sees what a browser sees (headers, scripts, markup), so server-side databases are inferred, not proven. The lesson says "likely" when it guesses.
- Nothing has been committed to git yet. The repo is ready for a first commit when you want it.
