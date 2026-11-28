# Changelog

Each version's section becomes its GitHub release notes, which is what "What's new" in the sidebar opens.
Write for learners, not for developers.

## 0.3.3

- **Sharper answers about a project.** Ask how something in a project works and Bento now reads the right files: questions about "the AI" find the code that talks to it, filler words no longer crowd the search, and built or minified copies of the code no longer push the real source aside.
- **A truer Atlas.** A project's toolbelt lists only the tools it really uses. Sample code inside its tests no longer counts. Projects you took apart before are read again, once, to pick this up.
- Two quick questions in a lesson that are answered out of order both keep their answers.
- A trace, a speed measurement or a test run that finishes after you've moved to another lesson stays with the lesson it came from, and doesn't count toward the new one.
- Your edits to a lesson's code are saved once you pause, not on every key you press.
- The reading tour and the file drawer show code names as code, not with backticks around them.
- Bento's words follow the AI you use now, and `bento://` links open with your current settings.
- **Bento in your browser**: [takeitapart.app/try](https://takeitapart.app/try) runs the lessons that come with Bento, with nothing to install.

## 0.3.2

- **A friendlier first minute.** Bento looks for your AI and says what it found ("Found Claude. You're ready.") instead of showing a wall of install buttons; the others fold into "Add another AI". The last step suggests where to start for you, and Enter moves you along.
- **Use Bento from your own AI agent.** Add Bento to Claude Code, Codex, Gemini, Copilot or any agent that speaks MCP with one command (Settings → **Use Bento from your AI agent**). Then ask it to "show me in Bento": it writes the lesson and Bento puts it on your screen and runs the code. It can see the code you're editing and what it did, point at lines with a note, and try changes for you. Your agent's plan does the thinking; Bento uses none of yours.
- First-time tips step aside when you switch to a part of the screen they don't point at.
- **Find on the page** with ⌘F: every match is marked, with "3 of 8"; Enter for the next one.
- **Back and Forward**: ⌘[ and ⌘], your mouse's side buttons, or View → Back.
- **Right-click** works: Copy, Paste, Look Up a word, and Open or Copy a link.
- After an update, **What's new** opens right in Bento.
- **Retry with another AI** is respected everywhere: when it's off, no other AI's plan is ever used, and when it's on, Bento says which AI answered.
- GitHub Copilot gets its request privately (not on the command line, where other programs can read it).
- Your phone can no longer publish pages or fork projects on your GitHub account; do that on your Mac. Settings says plainly that the Wi-Fi option isn't encrypted.
- Windows: setup offers Windows commands in PowerShell (winget and npm), the window's top bar follows dark mode, and Bento says "PC" where it means your computer.
- Security: the newest Electron 45, with the latest Chromium fixes.

## 0.3.1

- Try a runnable spiral lesson directly from the welcome screen, even before connecting an AI.
- See the teaching provider and its sign-in method when asking a question. Automatic retries with another provider are an option in Settings.
- The Mac download requires macOS 13 or newer.
- Setting up your AI fits any window size: the steps no longer slide under the dots at the top, **Continue** stays on screen, and once one AI is ready the others shrink to a single **Install** button.
- ChatGPT (Codex) has its own mark instead of a plain letter, and Explore offers **Connect GitHub** instead of a Terminal command.
- A first lesson's tips start with **Run**, and a Mac with no AI says so plainly, with a **Connect an AI** button in Settings too.

## 0.3.0

Bento on your iPhone and iPad, and steadier on your Mac.

- Turn on **Settings → Your phone and iPad**, open the **Bento Code** app, and your Mac pops up on it the way people do in AirDrop. Tap it and click **Allow** on the Mac (both screens show the same number, and the phone shows you the box to look for), and you're in. Or scan the QR code with your phone, and Bento opens there. Your Mac still does the work with your own AI, and nothing is hosted: your phone talks straight to your Mac, over Tailscale from anywhere, or your Wi-Fi at home.
- Made for a phone: tabs at the bottom, Back at the top, your recent things a swipe away. Lessons are two pages, the story and the code (which runs right on the phone). A project's Atlas fits your thumb: tap a building in the code city to see what it is, tap again to open the file.
- **Keep this Mac awake** (on by default): while your phone can use it and it's plugged in, your Mac doesn't fall asleep, so Bento is there when you're out. The screen still turns off.
- Settings explains it all in one place: how to connect, where your phone can reach your Mac (anywhere with Tailscale, or at home on your Wi-Fi), and your devices.
- Your lessons and progress are the same on every device, and change everywhere at once.
- It looks like an iPhone app everywhere now, not only in the Atlas: one typeface (the iPhone's own) at the iPhone's own sizes, a short line under each title instead of a paragraph, and settings on cards as in the iPhone's Settings. Settings now scrolls all the way down on a phone; before, its bottom half was out of reach.
- The drawer shows the Mac you're using and whether it can be reached. In the Bento Code app, tap it to switch to another Mac, add one, or forget one. If a Mac forgets your phone (you removed it in that Mac's Settings), the app asks that Mac again straight away: click **Allow** and you're back, with no code to type.
- In the app, picking a tab, a segment or a switch gives a small tick under your finger, as iPhone apps do. A right answer in a quick check taps back with a little cheer and a wrong one buzzes; so do tests passing or failing, and code that stops on an error.
- Code on a phone is made for reading with your finger. Long lines wrap (no more scrolling sideways), and a tap never brings up the keyboard: tap a word to see what it means, tap a note like "base case" to open it right under its line, or drag any number sideways to change it and watch the result redraw as you go, with a tick at every step. Tap **Edit** when you want to type. A "try" idea in the lesson now takes you to the code, so you see it happen.
- Things move the way they do on an iPhone: a switch's highlight slides to what you picked, sheets rise from the bottom of the screen on a spring, and cards give under your finger and spring back. Press and hold something in Recent to open it or take it off the list. Tapping a button no longer leaves it looking pressed.
- On a phone, the bar between the code and what it does is big enough for your thumb: drag it to give either more room. A quick check's answers are big rows, and the right one turns green with a tick. In the app, tapping the very top of the screen scrolls back to the top.
- **Growth** now measures the right function in code that has a class (it used to try the class's own setup and stop with an error).
- Put it on your Home Screen and it opens like an app, already connected.
- It moves like an app, too: pages slide in, Back and the tabs return you to the exact spot you left, sheets drag down to close, the drawer drags shut, and in the Home Screen app a swipe from the left edge goes back. When you type, the keyboard takes the bottom of the screen and the top bar stays where it is.
- Every screen fits a phone. The Path is one column you scroll down, with the paths in a row you swipe. Projects in Explore and puzzles in Practice are full-width rows that light up under your finger, as in any iPhone list, and the rows of topics and filters scroll sideways instead of piling up. Small buttons and links are now big enough for a thumb, and no text is too small to read. In dark mode, the screen is never white while Bento loads.
- Taking apart an app is made for a phone, like an iPhone app's own pages. It opens like an App Store page: the project's icon, its numbers, what it is in one sentence and what you can do with it. Then how it works as one picture: who uses it at the top, the app's own parts, where it keeps things and the outside services it talks to, with lines (and little moving dots) showing who talks to whom. Tap any box for what it does, the real word for it and where it lives in the code, or follow one thing ("when you click upgrade to Pro") through it step by step. Below that, what it's made of (a bar like iPhone Storage) and the services it uses (tap Stripe, say, for what it does here and what else would have worked). Under the hood: the code city (full screen), where it could break, its language, and its code as a file browser you open folder by folder. Everything you tap opens as a sheet from the bottom, and asking about the project reads like a chat.

Steadier and safer, especially when something goes wrong:

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
