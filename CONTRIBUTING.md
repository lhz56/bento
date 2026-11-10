# Contributing to Bento

Thanks for helping people learn how software works.

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
npm test                        # runtime tests, repo analysis, and every puzzle in real Python (needs python3)
npx vite build                  # make sure it builds
node scripts/smoke-app.mjs      # open the real app (hidden) and use it: lessons, Python, JavaScript, SQL, the terminal
node scripts/smoke-tour.mjs     # a learner's tour: lessons, a project's picture and code city, Compare, ideas, notes
node scripts/smoke-stream.mjs   # ask a question and watch a lesson stream in, from a pretend AI
node scripts/smoke-guards.mjs   # what pages can and can't reach, the menu, crash recovery, idle motion (~1 min)
node scripts/audit-a11y.mjs     # every screen, light and dark, checked with axe-core (WCAG AA)
node scripts/audit-keyboard.mjs # the skip link, dialogs, ⌘K, the map, the code city and the editor with only a keyboard
# or all of the app checks at once: npm run smoke && npm run audit
```

The app tests open Bento off-screen with a throwaway profile, and they never use anyone's AI plan: Claude and Codex
are hidden (`BENTO_PRETEND_MISSING`), or a pretend Claude stands in (`BENTO_FAKE_AI=test/fixtures/fake-claude.mjs`,
only honoured in hidden test mode). Please keep new tests that way, and don't let them touch the real clipboard.

New to the codebase? Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ground rules

- Explain like a kind expert: give the everyday picture first, then the real word.
- No API keys and no servers. Bento only talks to the user's own CLIs.
- Keep it fast. Anything that can be computed locally should be.
- Keep it light. Decorative motion goes in the list `html.still` pauses (see `src/still.js`), so it rests when nobody is looking.
