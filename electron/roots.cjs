// Which folders may be opened as a project without you choosing them in a dialog (dropped in, or reopened after a
// restart). Real projects are fine; your whole disk, your home folder, system folders and places secrets live are not,
// so even a page that went wrong couldn't read them through Bento.
const path = require('node:path');
const os = require('node:os');

// own: the folder Bento downloads projects into (its data folder: ~/Library/Application Support on a Mac,
// ~/.config on Linux, AppData on Windows), so they reopen wherever that is.
function projectRootOk(p, home = os.homedir(), own = null) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return false;
  const r = path.resolve(p);
  if (r === path.parse(r).root) return false; // the whole disk
  const rel = path.relative(r, home);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) return false; // your home folder, or a folder that contains it
  if (own) {
    const o = path.relative(path.resolve(own), r);
    if (o && !o.startsWith('..') && !path.isAbsolute(o)) return true;
  } // a project Bento downloaded
  // your own temporary folders are fine (a project unpacked there), just not the folder itself
  if (
    process.platform !== 'win32' &&
    /^(\/private)?\/(var\/folders\/[^/]+\/[^/]+\/[^/]+\/.+|tmp\/.+)/.test(r)
  )
    return true;
  const SYSTEM = [
    '/System',
    '/Library',
    '/private',
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/dev',
    '/Volumes',
    '/cores',
    '/opt',
  ];
  if (process.platform !== 'win32' && SYSTEM.some((s) => r === s || r.startsWith(s + path.sep)))
    return /^\/(Volumes|opt)\/.+\/.+/.test(r); // an external drive's or /opt's subfolders are fine
  if (
    process.platform === 'win32' &&
    /^[a-z]:\\(windows|program files|program files \(x86\)|programdata|\$recycle\.bin|system volume information|recovery)(\\|$)/i.test(
      r,
    )
  )
    return false; // Windows' own folders, on any drive
  const inHome = path.relative(home, r);
  if (!inHome.startsWith('..') && !path.isAbsolute(inHome)) {
    const top = inHome.split(path.sep)[0];
    if (
      [
        'Library',
        'AppData',
        '.ssh',
        '.aws',
        '.gnupg',
        '.config',
        '.kube',
        '.docker',
        '.password-store',
        '.local',
      ].includes(top) &&
      !/^Library[\\/]Application Support[\\/]Bento/.test(inHome)
    )
      return false;
  }
  return true;
}
module.exports = { projectRootOk };
