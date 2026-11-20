# Security

Bento runs code, drives AI tools signed in on your Mac, and (if you turn it on) serves itself to your phone, so
security reports are very welcome.

## Reporting a problem

Please don't open a public issue. Use **[Report a vulnerability](https://github.com/lhz56/bento/security/advisories/new)**
on GitHub instead. Say what you found, how to reproduce it, and what someone could do with it. You'll hear back within a
few days, and you'll be credited in the release notes unless you'd rather not be.

## What's in scope

- The Mac app (`electron/`): what the page can reach through the bridge, lesson code escaping its sandbox, repo code
  being run instead of read, the AI tools being given more than text-only access.
- Phone access (`electron/host.cjs`): pairing, device keys, reaching the Mac without being paired.
- Your own agent's tool server (`electron/agent.cjs`).
- The Bento Code iPhone app (`ios/`).
- Signed releases and updates from [lhz56/bento-releases](https://github.com/lhz56/bento-releases).

How Bento keeps each of these safe is written up in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#safety) and
[docs/PHONE.md](docs/PHONE.md#safety).

## Supported versions

Only the latest release. Bento updates itself, so fixes reach everyone quickly.
