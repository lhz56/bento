# Changelog

Each version's section becomes its GitHub release notes, which is what "What's new" in the sidebar opens.
Write for learners, not for developers.

## Unreleased

Bento on your iPhone and iPad.

- Turn on **Settings → Your phone and iPad**, scan the QR code with your phone, and Bento opens there. Your Mac still does the work with your own AI, and nothing is hosted: your phone talks straight to your Mac, over Tailscale from anywhere, or your Wi-Fi at home.
- Made for a phone: tabs at the bottom, Back at the top, your recent things a swipe away. Lessons are two pages, the story and the code (which runs right on the phone). A project's Atlas fits your thumb: tap a building in the code city to see what it is, tap again to open the file.
- Your lessons and progress are the same on every device, and change everywhere at once.
- Put it on your Home Screen and it opens like an app, already connected.

## 0.2.1

Steadier and safer, especially when something goes wrong.

- Bento opens even when your disk is full. If saving ever fails, a calm note says so, and Bento saves again by itself once there's space: nothing is lost while it stays open.
- Big projects (thousands of files) are taken apart without Bento stopping for a moment: menus, saving and a lesson that's streaming in all keep going.
- Answering a program's `input()` while it's still re-running no longer makes it ask you again.
- A featured project no longer flickers back to its loading screen once it's open.
- Offline, or a project that can't be downloaded? You get a plain sentence and a Try again button, not git's own output.
- Opens faster from the second launch on, and the first launch loads less.
- Tighter security: the window only ever runs Bento's own code, a file you drop is the only file Bento reads that way, website inspection can't be pointed at your own network, and links leave only for the web or email.

## 0.2.0

The first release for the Mac: signed, notarized, and it keeps itself up to date.

**Learn**
- Home is one calm ask box, with ideas drifting underneath as tiny moving pictures (a search tree growing, a traffic jam forming) that open instantly. *Today* sits beside it: your next path stop, a short plan, your map and your streak.
- Ask about a real project ("how does T3 Code work?") and Bento opens its actual code, from your Mac if you have it, and answers there, with a conversation that remembers what you asked.
- Short answers end with what to do next: simpler, an example, a follow-up, or a quick check.
- Lessons Bento already has open instantly, from ⌘K or the ask box, without using your AI.
- Seven paths to follow in order, four of them new: *Data and SQL*, *How teams build software*, *Apps for millions* and *Building with AI*. Each one ends in a playground, a clever idea or a real app, and every lesson on them opens instantly. Wherever a stop takes you (a lesson, a playground, a clever idea) the path comes along, with the next stop one click away, and your map points to the path lesson that teaches each skill.

**Lessons that hold up, whichever AI writes them**
- Every AI Bento offers was tested on the same six lessons and graded blind by two AIs from different companies. What the grading found is fixed for all of them:
  - Lessons draw their idea now, not just print it: a recursion lesson shows its calls as a tree, a promise lesson a table of what happened when.
  - JavaScript waits for timers and promises, so an async lesson shows its whole story instead of stopping after the first line. A timer that repeats forever is stopped after a few seconds, and says so.
  - Python's `asyncio` works, and a tree written as dictionaries is drawn as a tree.
  - The plain English beside each line stays on its own line: if an AI's list slips by a line, Bento writes it again, line by line.
  - Links and margin notes that an AI counted wrong (pointing at a blank line, or one line off) are moved back to the code they name, on web pages too.

**See what you know**
- Your map: every skill as a tile, filled in only by evidence (questions asked, code run, checks right, puzzles solved). Quizzes are optional.

**Feels like a Mac app**
- A proper menu bar, a sidebar you can hide (⌘\), a model picker that shows how fast and how deep each AI is, and step-through playback you can slow down.
- Works at every window size and in dark mode, with the keyboard and with screen readers.

**Safe by default**
- Your AI can only write text: no tools, no plugins, none of your Claude settings. Lesson code can't reach your Mac or home network.
- Teach with whichever AI you have: Claude, ChatGPT (through Codex), Gemini on a Google AI Pro plan (free for students, through Antigravity), GitHub Copilot (free with GitHub) or the Gemini API. One click installs or signs in to any of them, in Terminal, where you see what runs. When one runs out, Bento asks the next.
- See how much of each plan you've used, the way the plan counts it (“54% of this week”, “1 of 200 this month”), with when it resets and what Bento used of it today. Home warns you before a plan runs out.
- Bento finds each AI tool however you installed it, and tells you when one needs updating.
