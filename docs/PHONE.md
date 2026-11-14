# Bento on your iPhone and iPad

Bento on your Mac can be used from your phone and iPad, the way T3 Code's phone app works with your computer: the Mac
does the work (your AIs write the lessons, projects are read there, everything is saved there), and the phone shows
it. Nothing is hosted anywhere else and nothing costs extra: your devices talk straight to your Mac.

## Set it up

1. On the Mac, open Bento → **Settings** → **Your phone and iPad**, and turn it on.
2. Choose **Add a device**. A QR code appears for 10 minutes.
3. Scan it with the iPhone or iPad's camera. Bento opens in Safari, already connected.
4. Optional: tap **Share → Add to Home Screen**. Bento then opens like an app, full screen, already connected
   (that copy gets a one-time code of its own; Bento shows a reminder the first time).

Paired devices are listed in the same place, with when they were last seen. **Remove** stops one at once; it would
need a new code to come back. On the phone, Settings → **Disconnect** does the same from that side.

## How your devices reach the Mac

- **Tailscale** (free, recommended): install it on the Mac and your phone, signed in to the same account. Bento then
  works from anywhere: home, school, the train. Bento uses this Mac's Tailscale name (like
  `your-mac.tail1234.ts.net:4917`). Tailscale encrypts everything between your devices.
- **Your Wi-Fi** (off unless you turn on "Also on this Wi-Fi"): at home, without Tailscale. Anyone on that Wi-Fi can
  see the traffic, so use it on networks you trust.

Bento must be open on the Mac (its window can be closed), and the Mac awake. If the phone can't reach it, a quiet
line says so and everything already on screen keeps working; it reconnects by itself, and a lesson that was being
written while the phone slept arrives in full.

## What's the same, and what stays on the Mac

The same on every device: your lessons, progress, settings, projects and words. A change on one shows up on the others
(and in the Mac's own window) within a moment.

On the phone: asking, lessons (code runs on the phone itself: Python, JavaScript, TypeScript, SQL), the Atlas for any
project (the big picture, the code city, files, questions), ideas, puzzles, playgrounds, paths, your map and words.

Only on the Mac: installing or signing in to an AI (Terminal), opening a folder from your disk, backups to a file,
updates, the bookmarklet. Those are hidden on the phone.

## On the phone

- Tabs at the bottom (Learn, Explore, Practice, Path, You); Back at the top (Safari's swipe back works too).
- Your recent lessons and projects, the model and Settings: the button at the top left.
- A lesson has two pages, **Lesson** and **Code** (with Run and what the code does). Tapping a line the lesson
  points at jumps to the code.
- A project's Atlas is laid out as a phone page of its own (`src/ui/AtlasPhone.jsx`), plain words first and the
  technical side as you scroll:
  - **Summary**: the project's icon, name and maker, its numbers in a row (stars, language, size), what it is in
    one sentence, what it's like, and a checklist of what you can do with it.
  - **How it works**: a card per step, from the person using it to everything behind the screen; tap one to see
    what it does and the real word for it.
  - **Parts**: one bar for the whole app, then a row per kind of part (what you see, the brains, memory…).
  - **Services**: the services it signs up for as cards (tap one for what it does here, why it was picked and what
    else would have worked), then the code it's built from.
  - **Under the hood**: the code city (drag sideways; tap a building to see it, again to open it), hot spots, the
    language, how it grew.
  - **Code**: folders and files like a code app's file browser. A file opens as a sheet with **About** (what it
    uses, what uses it, who'd feel a change) and **Code**, and a box to ask about it.
  - **Learn it**: the order to read it in, and questions that open lessons. The question box for the whole project
    is always at the bottom; **⋯** has Fork, GitHub, Compare and notes.
- It moves the way an iPhone app does. A page you open slides in; Back and the tabs bring you back to the exact spot
  you left. A file, Settings, search or a conversation is a sheet: drag it down (or tap ✕) and it slides away. The
  drawer drags shut. In the Home Screen app, where Safari has no swipe of its own, a swipe from the left edge goes
  back, and on a tab's own page it opens the drawer. While you type, the keyboard takes the bottom of the screen and
  the top bar stays put. Settings is the gear at the bottom of the drawer.
- Built for a thumb: anything you tap is at least about 36 points tall, rows across the screen light up under your
  finger as in any iPhone list, and rows of choices (kinds of project, Atlas filters, paths) scroll sideways
  instead of piling up. `src/mobile.css` holds all of it; the Mac's layout doesn't change.

## Safety

- Off until you turn it on. Listens only on Tailscale (and your Wi-Fi if you choose), plus the Mac itself; never a
  public address.
- Only paired devices get in. The QR code holds a one-time code (10 minutes, one use; wrong guesses are capped at 30
  a minute for the whole Mac). Each device then has its own key; the Mac keeps only a hash of it.
- Every call carries that key in a header, so another website open on your phone can't make calls for you. Requests
  must name this Mac as their host, so a website can't point its own name at your Mac and get in.
- A phone can ask for what Bento's own page asks for, from a short list. Terminal, Finder, file dialogs, updates and
  backups are never reachable from a phone.
- Lesson web pages come from a different port, an origin of their own, as `play://` does in the app. Lesson code
  reaches the internet through the same guarded fetch as on the Mac: public sites only, never your home network.

How it's built: `electron/host.cjs` (the server, pairing, the stream), `src/remote.js` (the page's side),
`src/ui/Phone.jsx` and `src/mobile.css` (the phone layout), `src/ui/touch.js` (the gestures and the keyboard). Tests: `node test/host.test.mjs` and
`node scripts/smoke-phone.mjs [--ipad]` (needs `npx playwright-core install webkit` once).

## Next

- A small native iPhone and iPad app (SwiftUI around the same page) that scans the QR code itself, keeps the key in
  the Keychain and remembers your Macs. It needs Apple's TestFlight to install, so it waits for the signing setup.
- HTTPS through Tailscale (`tailscale serve`), for the few things Safari only allows on secure pages (offline use,
  copying to the clipboard).
