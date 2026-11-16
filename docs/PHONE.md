# Bento on your iPhone and iPad

Bento on your Mac can be used from your phone and iPad, the way T3 Code's phone app works with your computer: the Mac
does the work (your AIs write the lessons, projects are read there, everything is saved there), and the phone shows
it. Nothing is hosted anywhere else and nothing costs extra: your devices talk straight to your Mac.

## Set it up

With the **Bento Code** app (iPhone and iPad, `ios/`):

1. On the Mac, open Bento → **Settings** → **Your phone and iPad**, and turn it on.
2. Open Bento Code on the phone. Your Mac shows up under **On this Wi-Fi**: tap it.
3. The Mac asks "Allow “iPhone” to use Bento on this Mac?", and both screens show the same 4-digit number. Check it
   and click **Allow**. The phone opens Bento, connected, and remembers this Mac.

Away from home, **Type your Mac's name** asks the same way over Tailscale (the name is in the Mac's Settings). The
QR code and its 8-letter code still work too: in the app (**Scan its code**, **Enter its code**), or with the
Camera, which opens Bento in Safari (then **Share → Add to Home Screen** makes it open like an app).

Paired devices are listed in the same place, with when they were last seen. **Remove** stops one at once; it would
need to connect again to come back. On the phone, Settings → **Disconnect** does the same from that side.

## How your devices reach the Mac

- **Tailscale** (free, recommended): install it on the Mac and your phone, signed in to the same account. Bento then
  works from anywhere: home, school, the train. Bento uses this Mac's Tailscale name (like
  `your-mac.tail1234.ts.net:4917`). Tailscale encrypts everything between your devices.
- **Your Wi-Fi** (off unless you turn on "At home, on this Wi-Fi"): at home, without Tailscale. Anyone on that Wi-Fi
  can see the traffic, so use it on networks you trust.

While phone access is on, the Mac also says it's there on the Wi-Fi (Bonjour, `_bento._tcp`, with its Tailscale name
and Wi-Fi address), which is how the app finds it. That stops when phone access is off or Bento quits.

Bento must be open on the Mac (its window can be closed), and the Mac awake. **Keep this Mac awake** (on by default)
stops it from sleeping while it's plugged in and phone access is on; the screen still turns off, and on battery it
sleeps as usual. A Mac that's shut down can't be reached: the app says so and connects by itself once it's back. If the phone can't reach it, a quiet
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
- A project's Atlas is laid out as a phone page of its own (`src/ui/AtlasPhone.jsx`), the way an iPhone app lays out a
  page: a grouped background with white rows and cards, the system typeface at the iPhone's own sizes, and a sheet from
  the bottom for anything you tap. Plain words first, the technical side as you scroll:
  - **Summary**: like an App Store page. The icon, name and maker, Ask and ⋯, its numbers in a strip (stars, kind,
    language, size), what it is in one sentence, what it's like, and what you can do with it.
  - **How it works**: one picture of the whole app. Who uses it at the top, the app's own parts, where it keeps things
    and the outside services (dashed), in rows from top to bottom, with lines and a moving dot showing who talks to
    whom. A box opens a sheet: what it does, the real word for it, what it talks to, where it lives in the code. Then
    *Follow one thing through it* (a click or a sign-in, step by step, as a sheet) and *Words you'll meet*.
  - **What it's made of**: one bar like iPhone Storage, then a row per kind of part with the logos of what it's made
    with; a row opens a sheet with its biggest files.
  - **Services it uses**: a card each (tap one for what it does here, why it was picked and what else would have
    worked), then *Built with*, three rows you page through as in the App Store.
  - **Under the hood**: the code city as a picture (tap it for the city full screen, with its journeys), where it could
    break (a sheet each), the language, how it grew.
  - **The code**: a search field, the kinds of part, and folders you open one at a time, as in a code app. A file opens
    as a sheet with **About** (what it uses, what uses it, who'd feel a change) and **Code**, and a box to ask about it.
  - **Learn from it**: what it takes to build something like it, the order to read it in, questions that open lessons,
    and adding a feature. The question box for the whole project floats at the bottom; a conversation reads like a
    chat. **⋯** (at the top, and in the bar of sections that appears once you scroll) has Fork, GitHub, Compare and
    notes.
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
- Approve on Mac: the answer comes only from a native dialog on the Mac, never from a page. One request at a time
  (five a minute at most, half a minute's pause after Don't Allow, two minutes to answer). Requests that carry an
  `Origin` header (any web page) are refused, so a website can't raise the dialog. Allow gives a normal one-time
  code, and only to the device that asked (it holds the request's secret); that device's page trades it for a key
  as above.
- Every call carries that key in a header, so another website open on your phone can't make calls for you. Requests
  must name this Mac as their host, so a website can't point its own name at your Mac and get in.
- A phone can ask for what Bento's own page asks for, from a short list. Terminal, Finder, file dialogs, updates and
  backups are never reachable from a phone.
- Lesson web pages come from a different port, an origin of their own, as `play://` does in the app. Lesson code
  reaches the internet through the same guarded fetch as on the Mac: public sites only, never your home network.

How it's built: `electron/host.cjs` (the server, pairing, Approve on Mac, the stream), `electron/main.cjs` (the Allow
dialog, Bonjour, keeping the Mac awake), `ios/` (the Bento Code app), `src/remote.js` (the page's side),
`src/ui/Phone.jsx` and `src/mobile.css` (the phone layout), `src/ui/touch.js` (the gestures and the keyboard). Tests: `node test/host.test.mjs` and
`node scripts/smoke-phone.mjs [--ipad]` (needs `npx playwright-core install webkit` once).

## Using your AI plan without the Mac

Not possible for Claude: Anthropic only lets Pro and Max plans be used in its own apps (Claude Code, Claude.ai), and
doesn't let other apps sign people in with them or send requests on them. Bento uses Claude Code on your Mac for that
reason. OpenAI's **Sign in with ChatGPT** lets approved apps use a ChatGPT plan; it's open to a limited set of
partners, and an app joins by applying to OpenAI. Until Bento is one of them, the Mac does the AI work.

## Next

- HTTPS through Tailscale (`tailscale serve`), for the few things Safari only allows on secure pages (offline use,
  copying to the clipboard).
