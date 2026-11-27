# Contributing to Bento

Thanks for helping people learn how software works.

## Code style

- **Formatting is Prettier's** (`npm run format`), at 100 columns. Don't hand-format.
- **Names say what a thing is**: `lesson`, `atlas`, `facts`, `narration`, not `L`, `A`, `F`, `N`. Single letters
  are fine for loop indices, coordinates and callbacks a line or two long (`(x) => x.id`).
- **One job per file.** New app behaviour is a hook in `src/hooks/` (exported from its `index.js`) that takes
  what it needs as named arguments and returns what the screens use. A new group of IPC handlers is a module in `electron/ipc/` that exports `register(ctx)`. A
  new screen is a component in `src/screens/`, with its own styles in `src/styles/app/` (added to `index.css` in
  cascade order).
- **Every file opens with what it's for**: a comment on its first lines, in plain words, before the imports
  (`npm test` checks). Someone reading the top of a file, or Bento taking apart this project, should know whether
  it's the one they want.
- **Types live in JSDoc** (`/** @param {string} q */`), checked by `npm run typecheck`. New non-component modules
  must pass it.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#code-layout) for where things live.

## Add a clever idea

Ideas live in `src/ideas.js`. Each one needs:

- `title`, `company`, `slug`: the slug is a [simple-icons](https://simpleicons.org) logo. Run `node scripts/gen-icons.mjs` after adding one.
- `hook`: one sentence that makes you want to read it.
- `brief`: **only facts you can cite.** The lesson is told to stay inside them, so dates, numbers and claims about a company's internals must come from a public post, a paper or open-source code. Put the source in `link`.
- `vs`: the obvious approach that the clever one beats.
- `code`: what the runnable toy should do. It must run both approaches and `show()` the difference.
- `art`: a small SVG illustration in `src/ui/Ideas.jsx` (`IdeaArt`).
- Then pre-generate it so it opens instantly: see the comment at the top of `scripts/pregen-ideas.mjs`, and read the result before committing.

## Add a tool to the catalog

`src/atlas/catalog.js` holds one line per tool: id, name, logo slug, category, matchers (`npm:`, `pip:`, `env:`, `file:`, `dock:`…), a plain-English `what`, a `when` ("pick it when…") and alternatives. Then regenerate icons with `node scripts/gen-icons.mjs`.

## Before you open a pull request

```bash
npm run check                   # ESLint, Prettier, TypeScript (checkJs), then npm test (CI runs the same on every push)
npm test                        # runtime tests, repo analysis, and every puzzle in real Python (needs python3)
npx vite build                  # make sure it builds
node scripts/smoke-app.mjs      # open the real app (hidden) and use it: lessons, Python, JavaScript, SQL, the terminal
node scripts/smoke-tour.mjs     # a learner's tour: lessons, a project's picture and code city, Compare, ideas, notes
node scripts/smoke-stream.mjs   # ask a question and watch a lesson stream in, from a pretend AI
node scripts/smoke-ais.mjs      # a lesson from each AI in turn, every plan meter, falling back when one runs out
node scripts/smoke-guards.mjs   # what pages can and can't reach, the menu, crash recovery, idle motion (~1 min)
node scripts/audit-a11y.mjs     # every screen, light and dark, checked with axe-core (WCAG AA)
node scripts/audit-keyboard.mjs # the skip link, dialogs, ⌘K, the map, the code city and the editor with only a keyboard
npm run smoke:phone             # the app served to an iPhone and an iPad (WebKit), paired, used, then removed
npm run smoke:web               # takeitapart.app and /try as published, in Chromium and WebKit, Python included
# or all of the app checks at once: npm run smoke && npm run audit
```

The app tests open Bento off-screen with a throwaway profile, and they never use anyone's AI plan: the AI tools
are hidden (`BENTO_PRETEND_MISSING`), or pretend ones stand in (`BENTO_FAKE_AI=test/fixtures/fake-ai.mjs`, with
`BENTO_FAKE_AS=claude,codex,gemini,copilot` for which; only honoured in hidden test mode). Each pretend tool refuses to
run unless Bento switches its tools off, so a test fails if that ever slips.

**Which models are good enough, and is any getting worse:** `node scripts/bench-ai.mjs` runs Bento's real jobs through
each signed-in model, one AI at a time: six lessons (a picture, an algorithm, a web page, a complete beginner, an
engineer, JavaScript), a question inside a lesson, and designing a path. Each lesson gets a structure score (written in
full, its code runs, few corrections, plain English beside every line, a quiz, new words) and a quality score: two
graders from different companies (Claude Sonnet and Gemini Flash by default) read it blind, with what its code really
printed, and score it 1–5 on correct, clear, visual, code, teaching and overall. The report goes to `docs/benchmarks/`.
It uses real plans, so it isn't part of CI. Before changing a prompt or the lesson format, compare with the baseline:
`--compare docs/benchmarks/baseline.json` fails if any model drops more than 8 points (`--save-baseline` keeps a new
one). `--pretend` checks the script itself for free, `--judge <file>` grades a saved run again, `--rescore <file>`
rescores its structure, and runs for different AIs can go at the same time (`--models`, then `--judge`).

**Adding an AI:** add it to `electron/ai-catalog.json` (name, models, plan, install, sign-in and update commands), give
it an adapter in `electron/providers.cjs` (check, build a text-only command, parse its stream, read its limits if it
can for free), and a pretend twin in `test/fixtures/fake-ai.mjs`. The contract test in `test/features.test.mjs` and
`scripts/smoke-ais.mjs` pick it up from the catalog. Please keep new tests that way, and don't let them touch the real clipboard.

New to the codebase? Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ground rules

- Explain like a kind expert: give the everyday picture first, then the real word.
- No API keys and no servers. Bento only talks to the user's own CLIs.
- Keep it fast. Anything that can be computed locally should be.
- Keep it light. Decorative motion goes in the list `html.still` pauses (see `src/still.js`), so it rests when nobody is looking.
