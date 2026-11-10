# Content packs

A content pack is one JSON file of **puzzles**, **paths** and **clever ideas** that anyone can write and share: a teacher with a class, a club with its members, a friend with a friend. People add packs in **Settings → Content packs**, from a file or a link (a GitHub link to the file works).

Bento checks a pack's shape before adding it and explains what's missing. Before you share a pack, run its puzzles in real Python the same way the built-in ones are checked:

```bash
node scripts/check-puzzles.mjs --pack my-pack.json
```

That checks each clever solution against every test and hidden "gremlin", checks that an unfinished starter fails at least one test, and times both solutions on inputs up to 131,072 items. It then confirms that the clever way meets its Big-O target and that a working starter really is slower.

[`example-pack.json`](example-pack.json) is a complete small pack: two puzzles, one path and one idea.

## The file

```json
{
  "bento": "pack",
  "id": "my-pack",
  "name": "My pack",
  "author": "Your name",
  "puzzles": [],
  "paths": [],
  "ideas": []
}
```

## Puzzles

Each puzzle has these fields:

| Field | What it is |
|---|---|
| `id`, `title`, `hook` | A short id, the title, and a one-line teaser |
| `st` | Which station it belongs to: `start`, `hash`, `pointers`, `window`, `stack`, `binary`, `heap`, `tree`, `graph`, `dp`, `backtrack`, `intervals` or `design`. Anything else goes on a "From your packs" station. |
| `tier` | `warm`, `classic` or `boss` |
| `lc` | Optional `[number, "slug"]` of the same puzzle on LeetCode |
| `md` | The puzzle in your own words (Markdown) |
| `fn` | The function the tests call |
| `start` | The code people start with: a working but slow solution (set `"startWorks": true`), or an unfinished one |
| `fast` | A clever solution (shown only if they ask) |
| `helpers`, `demo` | Optional code after the solution, and a short example at the end |
| `tests` | At least two visible tests: `[[args...], expected]` |
| `gremlins` | Hidden edge cases: `["label", [args...], expected]` |
| `setup`, `call` | `setup` defines `make_input(n)`, the worst-case input of size n. `call` is how to call it, e.g. `two_sum(*make_input(n))`. |
| `target` | The Big-O to beat: `O(log n)`, `O(n)`, `O(n log n)`, `O(n²)` … |
| `big` | LeetCode's biggest input size (for the *Time Limit Exceeded* marker) |
| `hints`, `scale.text` | Up to 5 hints, and a sentence on where this runs at real scale |

**Plain words for free.** Put `#>` after a line of code, followed by what the line means. Bento shows it in *Plain words* and *Side by side*, with no AI needed:

```python
def count_vowels(text):          #> take some text
    count = 0                    #> no vowels yet
```

## Paths

```json
{ "id": "data-detective", "title": "Data detective", "d": "One line about it",
  "stops": [ { "t": "Lists of numbers", "d": "One line", "q": "What to ask for this lesson", "words": ["list"] } ] }
```

Each stop becomes a lesson when someone presses **Start**, written by their own AI from your `q`.

## Ideas

```json
{ "id": "luhn", "title": "How your card number catches typos by itself", "company": "Visa & Mastercard",
  "hook": "One line", "brief": "The facts the lesson must get right", "concepts": ["checksums"], "lang": "python", "link": "https://…" }
```

The `brief` matters most: it's what the learner's AI builds the lesson from, so make it accurate.
