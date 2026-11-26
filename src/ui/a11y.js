import { useEffect, useRef } from 'react';

// Small helpers so every part of Bento works with a keyboard and a screen reader.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A window that sits on top (Settings, the search palette, the shortcut sheet): focus moves into it,
// Tab and Shift+Tab stay inside it, Escape closes it, and focus goes back to where it was afterwards.
export function useDialog(onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const before = document.activeElement;
    const list = () => [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
    if (!el.contains(document.activeElement))
      (el.querySelector('[data-autofocus]') || list()[0] || el).focus();
    const key = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = list();
      if (!f.length) {
        e.preventDefault();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || !el.contains(document.activeElement))
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('keydown', key);
      if (before instanceof HTMLElement && document.contains(before))
        before.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

// Something that's clickable but isn't a <button> (an SVG star, a part in a diagram): reachable with Tab,
// and Enter or Space does the same as a click.
// In SVG, give it a <title> child instead of a label: that's its name for mouse hover and screen readers alike.
export const pressable = (onPress, label) => ({
  role: 'button',
  tabIndex: 0,
  ...(label ? { 'aria-label': label } : {}),
  onClick: onPress,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPress(e);
    }
  },
});

// Say something to screen readers without moving focus ("Your code ran", "3 of 4 tests pass")
let live = null;
export function announce(text, polite = true) {
  if (typeof document === 'undefined' || !text) return;
  if (!live) {
    live = document.createElement('div');
    live.className = 'sr-only';
    live.setAttribute('aria-live', polite ? 'polite' : 'assertive');
    live.setAttribute('role', 'status');
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => {
    live.textContent = text;
  }, 40);
}
