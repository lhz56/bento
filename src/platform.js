// Mac, Windows or Linux: shortcuts use ⌘ on a Mac and Ctrl everywhere else, and are written the way each one does.
export const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// the "command" key for this computer: ⌘ on a Mac, Ctrl on Windows and Linux
export const mod = (e) => (IS_MAC ? e.metaKey : e.ctrlKey);

// key names for this computer: "⌘⇧↵" stays as it is on a Mac and becomes "Ctrl+Shift+Enter" elsewhere
export function keys(shortcut) {
  if (IS_MAC || !shortcut) return shortcut;
  return String(shortcut)
    .replace(/⌥ Option/g, 'Alt')
    .replace(/⌥/g, 'Alt')
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/\+↵/g, '+Enter');
}

// a touch screen (a phone, an iPad without a trackpad): no hover, so a first tap shows what hovering would, and hints say
// "tap" instead of "click"
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const tap = (shortcut) =>
  TOUCH
    ? String(shortcut)
        .replace(/\bClick\b/g, 'Tap')
        .replace(/\bclick\b/g, 'tap')
        .replace(/\bPoint at\b/g, 'Tap')
        .replace(/\bhover anything · /g, '')
    : shortcut;

// single keys, for hints drawn as separate <kbd> boxes
export const K = IS_MAC
  ? { mod: '⌘', shift: '⇧', alt: '⌥', enter: '↵' }
  : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', enter: 'Enter' };
