// Apps opened from Finder or the Dock start with a tiny PATH (/usr/bin:/bin...), so CLIs installed with Homebrew,
// npm, nvm, fnm, volta, asdf or pnpm look "missing". Like T3 Code, ask the person's own login shell once for the PATH
// a new terminal would get (time-limited), fall back to launchctl, and keep a list of usual folders as a last resort.
const { execFile, spawn } = require('node:child_process');
const os = require('node:os');

const MARK = '__BENTO_PATH__';
const run = (cmd, args, opts) =>
  new Promise((res) => execFile(cmd, args, opts, (e, out) => res({ e, out: String(out || '') })));

function loginShell(env = process.env) {
  let s = env.SHELL || '';
  try {
    s = s || os.userInfo().shell || '';
  } catch {}
  return /\/(zsh|bash|fish|sh|ksh|dash)$/.test(s) ? s : '/bin/zsh';
}

async function fromShell(shell, env, timeout) {
  const fish = /fish$/.test(shell);
  const cmd = fish
    ? `printf '${MARK}%s${MARK}' (string join : $PATH)`
    : `printf '${MARK}%s${MARK}' "$PATH"`;
  // -i reads .zshrc/.bashrc too (where nvm and friends add themselves); stdin is closed so nothing can wait on input
  const out = await new Promise((res) => {
    let buf = '';
    const child = spawn(shell, ['-ilc', cmd], {
      env: { ...env, TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true,
    });
    const stop = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {}
      }
    }, timeout);
    child.stdout.on('data', (d) => {
      if (buf.length < 1 << 20) buf += d;
    });
    child.on('error', () => {
      clearTimeout(stop);
      res('');
    });
    child.on('close', () => {
      clearTimeout(stop);
      res(buf);
    });
  });
  const m = new RegExp(`${MARK}(.*?)${MARK}`, 's').exec(out);
  return m && m[1].includes('/') ? m[1].trim() : null;
}

async function fromLaunchctl() {
  const { e, out } = await run('/bin/launchctl', ['getenv', 'PATH'], { timeout: 1500 });
  return e ? null : out.trim() || null;
}

// put `first` ahead of `rest`, dropping empties and repeats
function mergePath(first, rest) {
  const seen = new Set();
  return [...String(first || '').split(':'), ...String(rest || '').split(':')]
    .filter((d) => d && !seen.has(d) && seen.add(d))
    .join(':');
}

async function resolvePath(current, { env = process.env, timeout = 4000 } = {}) {
  if (process.platform === 'win32') return current;
  const found =
    (await fromShell(loginShell(env), env, timeout).catch(() => null)) ||
    (await fromLaunchctl().catch(() => null));
  return found ? mergePath(found, current) : current;
}

module.exports = { resolvePath, mergePath, loginShell };
