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
npm test          # runtime tests
npx vite build    # make sure it builds
```

New to the codebase? Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ground rules

- Explain like a kind expert: give the everyday picture first, then the real word.
- No API keys and no servers. Bento only talks to the user's own CLIs.
- Keep it fast. Anything that can be computed locally should be.
