// Bento's gestures on a phone, the ones an iPhone app has: drag a sheet down to put it away, push the drawer back,
// swipe from the left edge to go back (in the Home Screen app, where Safari has no swipe of its own) or, on a tab's
// own page, to open the drawer. And the small things: a button answers the moment a finger lands on it, a sheet
// slides away instead of vanishing, and the keyboard takes the bottom of the screen without pushing the top bar off it.
import { useEffect, useRef } from 'react';

// the Home Screen copy, or Bento's iPhone and iPad app (ios/), which shows this page full screen with no Safari around it
export const STANDALONE = typeof navigator !== 'undefined' && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || /\bBentoApp\//.test(navigator.userAgent));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Bento Code (ios/WebShell.swift) listens for a few things only it can do: its own Your Macs sheet, connecting again
// with Allow on the Mac when the Mac has forgotten this device, and the iPhone's haptics (a web page has none on iOS).
const bridge = () => (typeof window !== 'undefined' && /\bBentoApp\//.test(navigator.userAgent) ? window.webkit?.messageHandlers?.bento : null);
export const IN_APP = !!bridge();
export const native = (type, more) => { try { bridge()?.postMessage({ type, ...more }); return !!bridge(); } catch { return false; } };
/** a tick under the finger: 'select' (a tab, a switch, a picked option), 'light', 'success', 'warn' */
export const haptic = (kind = 'select') => native('haptic', { kind });
if (IN_APP) {
  // what an iPhone ticks for on its own: picking a tab, a segment or an option, and flipping a switch
  const TICK = '.ptabs button, .pseg button, .seg button, .ab-nav button, [role=tab], [role=switch], .switch, .shelf, .int, .set-models button, .pz-chip';
  addEventListener('click', (e) => {
    const b = e.target.closest?.(TICK); if (!b || b.disabled) return;
    // (a switch ticks both ways; a tab or segment only when it changes)
    if (b.matches('[role=switch], .switch') || (b.getAttribute('aria-selected') !== 'true' && !b.classList.contains('on'))) haptic('select');
  }, true);
}
const OUT = 'cubic-bezier(.4, 0, .9, .6)', SPRING = 'cubic-bezier(.2, .9, .3, 1)';

// the sheets that slide up over a page, and how each is put away (the same way Esc or its ✕ does)
const esc = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const SHEETS = [
  { sel: '.drawer', veil: '.drawer-veil', x: '.dr-x', close: esc },
  { sel: '.settings', veil: '.pal-veil', x: '.set-h .ib', close: esc },
  { sel: '.pal', veil: '.pal-veil', x: '.pal-cancel', close: esc },
  // a conversation about a project: down makes it small (its ✕ clears it)
  { sel: '.aq-dock', x: '.aq-dock-h .ib', close: (el) => el.querySelector('.aq-dock-h .ib')?.click() },
];
const veilOf = (s, el) => (s.veil ? el.closest(s.veil) || el.parentElement?.querySelector(`:scope > ${s.veil}`) || document.querySelector(s.veil) : null);

const set = (el, st) => { if (el) Object.assign(el.style, st); };
const clear = (el, ...props) => { if (el) props.forEach((p) => { el.style[p] = ''; }); };

/** slide a sheet off the bottom of the screen, then put it away for real */
function slideAway(el, s, after) {
  const veil = veilOf(s, el);
  if (reduced()) { after(); return; }
  const h = el.getBoundingClientRect().height;
  set(el, { animation: 'none', transition: `transform .24s ${OUT}`, transform: `translateY(${h + 24}px)` });
  if (veil) set(veil, veil.contains(el) ? { transition: 'background-color .24s', backgroundColor: 'transparent' } : { transition: 'opacity .24s', opacity: '0' });
  setTimeout(() => {
    after();
    // if it didn't go away after all, bring it back rather than leave it hidden off-screen
    setTimeout(() => { if (el.isConnected) { clear(el, 'transform', 'transition', 'animation'); clear(veil, 'opacity', 'backgroundColor', 'transition'); } }, 400);
  }, 220);
}
const snapBack = (el, veil) => {
  set(el, { transition: `transform .32s ${SPRING}`, transform: '' });
  if (veil) set(veil, { transition: 'opacity .32s, background-color .32s', opacity: '', backgroundColor: '' });
  setTimeout(() => { clear(el, 'transition'); clear(veil, 'transition'); }, 340);
};

// what can scroll between the finger and the sheet: a sheet only moves once that's at its top
const atTop = (from, sheet) => {
  for (let n = from; n && n !== sheet.parentElement; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
    if (n === sheet) break;
  }
  return true;
};
const PRESSABLE = 'button, a[href], [role=button], [role=tab], [role=option], label, summary';

/**
 * o: { phone, back(), canBack(), atRoot(), drawerOpen(), openDrawer(), closeDrawer(), swipe } (read fresh at every touch).
 * On an iPad (phone false) a button still answers at once; the sheets there are the Mac's panels, so no dragging them.
 * swipe: the edge swipes are on (the Home Screen app; Safari's own swipe does Back elsewhere).
 */
export function useTouch(on, o) {
  const ref = useRef(o); ref.current = o;
  useEffect(() => {
    if (!on) return undefined;
    let g = null; // the gesture in progress
    const W = () => innerWidth;

    // ---------------------------------------------------------------- a button answers as soon as you touch it
    let pressed = null, pressT = 0, p0 = [0, 0];
    // a row across the screen lights up behind its words (as in an iPhone list); a big card gives a little; the rest dim
    const press = (el) => {
      el.classList.remove('unpress'); el.classList.add('pressed'); const r = el.getBoundingClientRect();
      const row = r.width > innerWidth * 0.7 && r.height < 130;
      el.classList.toggle('prow', row); el.classList.toggle('big', !row && r.width * r.height > 9000 && r.height > 54);
    };
    const unpress = () => {
      clearTimeout(pressT); const el = pressed; pressed = null; if (!el) return;
      const release = () => { el.classList.remove('pressed'); el.classList.add('unpress'); setTimeout(() => el.classList.remove('unpress', 'big', 'prow'), 280); };
      if (el.classList.contains('pressed')) release(); else { press(el); requestAnimationFrame(() => requestAnimationFrame(release)); } // a quick tap still shows
    };
    const unpressNow = () => { clearTimeout(pressT); if (pressed) pressed.classList.remove('pressed', 'big', 'prow'); pressed = null; };

    const start = (e) => {
      if (e.touches.length !== 1) { g = null; return; }
      const t = e.touches[0]; const tgt = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (!tgt) return;
      const x = ref.current; p0 = [t.clientX, t.clientY];
      // the press
      const b = tgt.closest(PRESSABLE);
      if (b && !b.disabled && !b.closest('.cm-editor, .city') && b.getAttribute('aria-disabled') !== 'true') { pressed = b; pressT = setTimeout(() => pressed === b && press(b), 60); }
      g = { x0: t.clientX, y0: t.clientY, trail: [[e.timeStamp, 0, 0]], mode: null, lock: false };
      if (!x.phone) return;
      for (const s of SHEETS) {
        const el = tgt.closest(s.sel);
        if (el) { if (atTop(tgt, el) && !tgt.closest('input, textarea, [contenteditable]')) Object.assign(g, { mode: 'sheet', el, s, veil: veilOf(s, el) }); return; }
      }
      const side = document.querySelector('.app.phone .side');
      if (x.drawerOpen()) { if (side && (side.contains(tgt) || tgt.closest('.pveil'))) Object.assign(g, { mode: 'drawer', el: side, veil: document.querySelector('.pveil') }); return; }
      if (!x.swipe || t.clientX > 22 || document.querySelector('.drawer, .pal-veil, .aq-dock, .coach-tip')) return;
      if (x.canBack()) Object.assign(g, { mode: 'back', el: document.getElementById('content'), bar: document.querySelector('.pbar-mid') });
      else if (x.atRoot() && side) Object.assign(g, { mode: 'open', el: side, veil: document.querySelector('.pveil') });
    };

    const move = (e) => {
      const t = e.touches[0];
      if (pressed && (Math.abs(t.clientX - p0[0]) > 8 || Math.abs(t.clientY - p0[1]) > 8)) unpressNow();
      if (!g?.mode) return;
      const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (!g.lock) {
        // decided on the first move: once Safari starts scrolling, it can't be taken back
        const ok = g.mode === 'sheet' ? dy > 0 && dy >= Math.abs(dx) : g.mode === 'drawer' ? dx < 0 && -dx > Math.abs(dy) : dx > 0 && dx > Math.abs(dy);
        if (!ok || !e.cancelable) { g = null; return; }
        g.lock = true; unpressNow();
        set(g.el, { transition: 'none', animation: 'none' });
        if (g.veil) set(g.veil, { transition: 'none', animation: 'none' });
        if (g.mode === 'back') set(g.el, { boxShadow: '-10px 0 30px rgba(0, 0, 0, .14)' });
        if (g.mode === 'open') set(g.el, { visibility: 'visible' });
        if (g.mode === 'open' && g.veil) set(g.veil, { display: 'block', pointerEvents: 'none' });
      }
      e.preventDefault();
      g.trail.push([e.timeStamp, dx, dy]); if (g.trail.length > 6) g.trail.shift();
      const w = W();
      if (g.mode === 'sheet') {
        const y = Math.max(0, dy); g.el.style.transform = `translateY(${y}px)`;
        if (g.veil) g.veil.contains(g.el) ? (g.veil.style.backgroundColor = `rgba(30, 24, 18, ${0.16 * Math.max(0, 1 - y / 400)})`) : (g.veil.style.opacity = String(Math.max(0, 1 - y / 500)));
      } else if (g.mode === 'drawer') {
        const sw = g.el.offsetWidth; const x = Math.min(0, dx); g.el.style.transform = `translateX(${x}px)`; if (g.veil) g.veil.style.opacity = String(1 + x / sw);
      } else if (g.mode === 'open') {
        const sw = g.el.offsetWidth; const x = Math.min(0, -sw + dx); g.el.style.transform = `translateX(${x}px)`; if (g.veil) g.veil.style.opacity = String(Math.max(0, 1 + x / sw));
      } else {
        const x = Math.max(0, dx); g.el.style.transform = `translateX(${x}px)`; if (g.bar) g.bar.style.opacity = String(Math.max(0, 1 - (2 * x) / w));
      }
    };

    const end = () => {
      unpress();
      const k = g; g = null;
      if (!k?.lock) return;
      const [a, b] = [k.trail[0], k.trail[k.trail.length - 1]]; const dt = Math.max(1, b[0] - a[0]);
      const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; const [, dx, dy] = b; const w = W(); const x = ref.current;
      if (k.mode === 'sheet') {
        const h = k.el.getBoundingClientRect().height;
        if (dy > Math.min(150, h * 0.3) || (vy > 0.5 && dy > 24)) slideAway(k.el, k.s, () => k.s.close(k.el)); else snapBack(k.el, k.veil);
      } else if (k.mode === 'drawer' || k.mode === 'open') {
        const sw = k.el.offsetWidth; const closing = k.mode === 'drawer' ? -dx > sw * 0.3 || vx < -0.4 : !(dx > sw * 0.35 || vx > 0.4);
        set(k.el, { transition: `transform .26s ${closing ? OUT : SPRING}`, transform: closing ? 'translateX(-104%)' : 'translateX(0)' });
        if (k.veil) set(k.veil, { transition: 'opacity .26s', opacity: closing ? '0' : '1' });
        setTimeout(() => {
          if (k.mode === 'drawer' && closing) x.closeDrawer(); if (k.mode === 'open' && !closing) x.openDrawer();
          requestAnimationFrame(() => { clear(k.el, 'transition', 'transform', 'visibility', 'animation'); clear(k.veil, 'transition', 'opacity', 'display', 'pointerEvents', 'animation'); });
        }, 250);
      } else {
        const go = dx > w * 0.33 || (vx > 0.35 && dx > 30);
        set(k.el, { transition: `transform ${go ? '.2s' : '.3s'} ${go ? OUT : SPRING}`, transform: go ? `translateX(${w}px)` : '' });
        if (k.bar) set(k.bar, { transition: 'opacity .2s', opacity: go ? '0' : '' });
        setTimeout(() => {
          if (go) { set(k.el, { visibility: 'hidden' }); x.back(); setTimeout(() => settle(k), 700); } // the next page clears this (enter, Phone.jsx); this is in case it never comes
          else settle(k);
        }, go ? 190 : 300);
      }
    };
    const settle = (k) => { clear(k.el, 'transition', 'transform', 'boxShadow', 'visibility', 'animation'); clear(k.bar, 'transition', 'opacity'); };

    // ---------------------------------------------------------------- ✕ and the shade behind a sheet: it slides away first
    // (only a finger's own tap: the click that follows the slide, or one Bento makes itself, goes straight through)
    const tapAway = (e) => {
      const tgt = e.target instanceof Element ? e.target : null; if (!tgt || !e.isTrusted || !ref.current.phone) return;
      for (const s of SHEETS) {
        const btn = s.x && tgt.closest(s.x); const el = btn?.closest(s.sel);
        if (btn && el) {
          if (e.type !== 'click' || (s.sel === '.aq-dock' && btn !== el.querySelector('.aq-dock-h .ib'))) return; // ✕ on a conversation clears it: no slide
          e.preventDefault(); e.stopPropagation(); slideAway(el, s, () => btn.click()); return;
        }
        // the shade itself (not the sheet on it)
        if (s.veil && tgt.matches(s.veil)) {
          const sheet = tgt.querySelector(s.sel) || (s.sel === '.drawer' && document.querySelector('.drawer'));
          if (!sheet || (e.type === 'mousedown') !== (s.veil === '.pal-veil')) continue;
          e.preventDefault(); e.stopPropagation(); slideAway(sheet, s, () => s.close(sheet)); return;
        }
      }
    };

    // ---------------------------------------------------------------- the keyboard: the app fits in what's left above it
    // (Safari would slide the whole page up instead, top bar and all, to show the box you're typing in)
    const vv = window.visualViewport; const root = document.documentElement;
    const typingIn = () => document.activeElement?.matches?.('input:not([type=checkbox], [type=radio], [type=range]), textarea, [contenteditable=true]');
    // (iOS 26 shrinks innerHeight with the keyboard, so it's measured against the height with no keyboard up)
    let full = vv ? vv.height : innerHeight;
    const fit = () => {
      if (!ref.current.phone || !vv) return;
      const on = typingIn();
      if (!on && !root.classList.contains('kb')) full = vv.height;
      if (on && full - vv.height > 120) {
        // (Safari may also pan what you see down the page a little, which nothing can undo: the app moves to meet it)
        root.style.setProperty('--kb-h', `${Math.round(vv.height)}px`); root.style.setProperty('--kb-top', `${Math.max(0, Math.round(vv.offsetTop - scrollY))}px`);
        if (!root.classList.contains('kb')) { root.classList.add('kb'); requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: 'nearest' })); }
        if (scrollY || vv.offsetTop) scrollTo(0, 0);
      } else if (root.classList.contains('kb')) { root.classList.remove('kb'); root.style.removeProperty('--kb-h'); root.style.removeProperty('--kb-top'); if (scrollY) scrollTo(0, 0); full = vv.height; }
    };
    // Safari scrolls the page to show the box you tapped; the app already shows it, so the page stays put
    const stay = () => { if (root.classList.contains('kb') && scrollY) scrollTo(0, 0); };
    addEventListener('scroll', stay, { passive: true });
    const out = () => setTimeout(fit, 60);
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit); document.addEventListener('focusout', out);

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
    document.addEventListener('click', tapAway, true); document.addEventListener('mousedown', tapAway, true);
    return () => {
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); document.removeEventListener('focusout', out); removeEventListener('scroll', stay); root.classList.remove('kb');
      document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end);
      document.removeEventListener('click', tapAway, true); document.removeEventListener('mousedown', tapAway, true);
    };
  }, [on]);
}
