<p align="center"><img src="docs/media/banner.png" width="100%" alt="Bento: take software apart. Ask anything, get a lesson you can run, with the AI you already pay for."></p>

<h3 align="center">Ask anything, get a lesson you can run.<br>Paste any GitHub repo, get its blueprint.</h3>

<p align="center">A free, open-source Mac app that teaches how real software is built, using the Claude, ChatGPT, Gemini or Copilot plan you already have. No API key, no account.</p>


<p align="center">
  <a href="https://github.com/lhz56/bento-releases/releases/latest/download/Bento-arm64.dmg"><img src="https://img.shields.io/badge/Download-for%20Mac-121212?style=for-the-badge&logo=apple&logoColor=white" alt="Download for Mac"></a>
  <a href="https://github.com/lhz56/bento-releases/releases/latest/download/Bento-x64.dmg"><img src="https://img.shields.io/badge/Intel-Mac-ffffff?style=for-the-badge&logo=intel&logoColor=121212&labelColor=ffffff" alt="Intel Mac"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-121212?style=for-the-badge" alt="MIT license"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-13%2B-121212?style=flat-square" alt="macOS 13+">
  <img src="https://img.shields.io/badge/API%20keys-0-121212?style=flat-square" alt="No API keys">
  <img src="https://img.shields.io/badge/accounts-0-121212?style=flat-square" alt="No accounts">
  <img src="https://img.shields.io/badge/telemetry-none-121212?style=flat-square" alt="No telemetry">
  <img src="https://img.shields.io/badge/signed%20%26%20notarized-Apple-121212?style=flat-square" alt="Signed and notarized by Apple">
</p>

<p align="center"><sub>🤖 <b>Using an AI agent?</b> Paste this into Claude Code, Codex or Cursor: <code>Install Bento from github.com/lhz56/bento</code>. It follows <a href="AGENTS.md">AGENTS.md</a>.</sub></p>

<p align="center">
  <a href="https://takeitapart.app"><b>takeitapart.app</b></a> ·
  <a href="#learn">Learn</a> ·
  <a href="#take-apart">Take apart</a> ·
  <a href="#in-the-box">In the box</a> ·
  <a href="#your-ai">Your AI</a> ·
  <a href="#build-it-yourself">Build it</a> ·
  <a href="docs/FEATURES.md">Everything it does</a>
</p>

<br>

<p align="center"><img src="docs/media/ask.webp" width="900" alt="A question typed into Bento becomes a lesson that writes itself, runs its code, and explains every line in plain English"></p>

<br>

> **Why not just ask ChatGPT?** ChatGPT tells you. Bento shows you: the code runs, the picture moves, every line has plain words, and you can take apart real apps, not just toy examples.

## ▍Learn

### Every answer is a lesson you can **run**.

Ask *“How does Uber find a driver?”* and get the real idea: code you can run, a picture that moves, every line in plain English. Plus 32 famous engineering tricks from Uber, Discord and Google.

<p align="center"><img src="docs/media/idea.webp" width="900" alt="Discord's hash ring as a lesson: it runs, a phrase is tapped to show its code, then the plain-words view"></p>

<p align="center"><img src="docs/media/how.png" width="900" alt="How it works: you ask, the AI already signed in on your Mac writes a lesson, Bento runs it in a sandbox. All on your Mac."></p>

## ▍Take apart

### Paste a GitHub link. Get the blueprint.

The whole app as one picture. Click any part for the real word. Watch a request travel through a code city.

<p align="center"><img src="docs/media/atlas.webp" width="900" alt="T3 Code taken apart: the big picture, one part opened, a request travelling through a code city, then the toolbelt"></p>

## ▍In the box

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/media/toolbelt.webp" alt="The toolbelt: every tool T3 Code uses, why Electron was picked, and what else it could have been"><br><b>The toolbelt</b><br><sub>Every tool an app uses, and why it was picked.</sub></td>
    <td width="50%" valign="top"><img src="docs/media/hotspots.webp" alt="Hot spots: where T3 Code could break, in plain words, down to the file"><br><b>Hot spots</b><br><sub>Where it could break, in plain words.</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/media/files.webp" alt="Every file of T3 Code, sorted by what it does, then a search"><br><b>Every file</b><br><sub>Sorted by what it does. Find any one.</sub></td>
    <td width="50%" valign="top"><img src="docs/media/path.webp" alt="Learning paths: pick one, then short stops in order"><br><b>Paths</b><br><sub>Seven of them. Zero to a real app, in order.</sub></td>
  </tr>
</table>

**Puzzles that scale.** 34 interview puzzles, pushed from ten items to a billion, raced live.

<p align="center"><img src="docs/media/practice.webp" width="900" alt="How long an algorithm takes at a billion items, then a live sorting race"></p>

## ▍Your AI

Any one is enough. Bento drives the official tool already signed in on your Mac, with its tools switched off, so the model can only write text.

| | Uses | Plan you already have |
|---|---|---|
| <img src="site/img/claude.svg" width="16"> **Claude** | `claude` | Pro or Max |
| **ChatGPT** | `codex` | Plus, Pro or Business |
| <img src="site/img/googlegemini.svg" width="16"> **Gemini** | `agy` or `gemini` | AI Pro (free for students), or an API key |
| <img src="site/img/githubcopilot.svg" width="16"> **Copilot** | `copilot` | Free with GitHub |

Missing one? Bento installs it in Terminal, where you can watch every step.

<p align="center"><img src="docs/media/start.webp" width="900" alt="Bento's first minute: it finds the AI already signed in, asks how much code you've seen, and offers four places to start"></p>

## ▍Private by design

| | |
|---|---|
| **Your code** | Runs on your Mac. Python is real CPython in WebAssembly, in a sandbox. |
| **Apps you take apart** | Only read, never run. |
| **What leaves your Mac** | Your questions, to your own AI. The pages you ask for. Nothing else. |
| **Telemetry** | None. No analytics, no account. |

**On your iPhone and iPad:** coming soon.

## ▍Build it yourself

```bash
git clone https://github.com/lhz56/bento && cd bento
npm install
npm run dev      # the app, with hot reload
npm test         # no check ever spends an AI plan
npm run smoke    # the real app, hidden, end to end
```

Node 20+ and one signed-in AI CLI. Working with an AI agent? Point it at [AGENTS.md](AGENTS.md). How it fits together: [ARCHITECTURE](docs/ARCHITECTURE.md) · Shipping: [RELEASING](docs/RELEASING.md) · Help out: [CONTRIBUTING](CONTRIBUTING.md) · Problems: [issues](https://github.com/lhz56/bento/issues) · Security: [SECURITY](SECURITY.md)

<sub>Every clip here is the real app, filmed by <code>scripts/record-media.mjs</code> with a pretend AI and finished by <code>scripts/compose-media.mjs</code>.</sub>

<br>

<p align="center"><a href="https://github.com/lhz56/bento-releases/releases/latest/download/Bento-arm64.dmg"><img src="docs/media/end.png" width="100%" alt="What will you take apart first? Download Bento for Mac."></a></p>

<p align="center"><b>⭐ Star the repo to follow along.</b> New lessons, new puzzles, and Windows and iPhone on the way.</p>

<p align="center"><sub>Made by <a href="https://github.com/lhz56">Lin Zaw</a> · MIT</sub></p>
