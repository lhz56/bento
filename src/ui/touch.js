// Bento's gestures on a phone, the ones an iPhone app has: drag a sheet down to put it away, push the drawer back,
// swipe from the left edge to go back (in the Home Screen app, where Safari has no swipe of its own) or, on a tab's
// own page, to open the drawer. And the small things: a button answers the moment a finger lands on it, a sheet
// slides away instead of vanishing, and the keyboard takes the bottom of the screen without pushing the top bar off it.
import { useEffect, useRef } from 'react';
import { t } from '../i18n.js';

// the Home Screen copy, or Bento's iPhone and iPad app (ios/), which shows this page full screen with no Safari around it
export const STANDALONE =
  typeof navigator !== 'undefined' &&
  (navigator.standalone === true ||
    matchMedia('(display-mode: standalone)').matches ||
    /\bBentoApp\//.test(navigator.userAgent));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Bento Code (ios/WebShell.swift) listens for a few things only it can do: its own Your Macs sheet, connecting again
// with Allow on the Mac when the Mac has forgotten this device, and the iPhone's haptics (a web page has none on iOS).
const bridge = () =>
  typeof window !== 'undefined' && /\bBentoApp\//.test(navigator.userAgent)
    ? window.webkit?.messageHandlers?.bento
    : null;
export const IN_APP = !!bridge();
export const native = (type, more) => {
  try {
    bridge()?.postMessage({ type, ...more });
    return !!bridge();
  } catch {
    return false;
  }
};
/** a tick under the finger: 'select' (a tab, a switch, a picked option), 'light', 'success', 'warn' */
export const haptic = (kind = 'select') => native('haptic', { kind });
if (IN_APP) {
  // what an iPhone ticks for on its own: picking a tab, a segment or an option, and flipping a switch
  const TICK =
    '.ptabs button, .pseg button, .seg button, .lens, .stab, .ab-nav button, [role=tab], [role=switch], .switch, .shelf, .int, .set-models button, .pz-chip';
  addEventListener(
    'click',
    (e) => {
      const b = /** @type {HTMLButtonElement | null} */ (
        /** @type {Element} */ (e.target).closest?.(TICK)
      );
      if (!b || b.disabled) return;
      // (a switch ticks both ways; a tab or segment only when it changes)
      if (
        b.matches('[role=switch], .switch') ||
        (b.getAttribute('aria-selected') !== 'true' && !b.classList.contains('on'))
      )
        haptic('select');
    },
    true,
  );
  // a tap on the status bar (the app passes it on): what you're looking at goes back to its top, as anywhere on an iPhone
  window.__bentoTop = () => {
    const top = document.querySelector('.hold-menu')
      ? null
      : document.querySelector('.settings, .drawer, .cv-full') ||
        document.getElementById('content');
    if (!top) return;
    const shown = (el) => {
      const rect = el.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.right > 0 &&
        rect.left < innerWidth &&
        getComputedStyle(el).visibility !== 'hidden'
      );
    };
    [top, ...top.querySelectorAll('*')]
      .filter((el) => el.scrollTop > 0 && shown(el))
      .forEach((el) => el.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  };
  // and a firmer tap for sending something off: a question, a repo to take apart
  addEventListener(
    'click',
    (e) => {
      const b = /** @type {HTMLButtonElement | null} */ (
        /** @type {Element} */ (e.target).closest?.('.send, .ask-go')
      );
      if (b && !b.disabled) haptic('light');
    },
    true,
  );
}
const OUT = 'cubic-bezier(.4, 0, .9, .6)',
  SPRING = 'cubic-bezier(.2, .9, .3, 1)';

// ---------------------------------------------------------------- springs
// A real spring, the kind an iPhone moves things with (SwiftUI's .spring(response:, dampingFraction:)): its curve,
// written out as a CSS linear() easing, and how long it takes to come to rest.
const LINEAR =
  typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
const springs = new Map();
export function spring(response = 0.4, damping = 0.86) {
  const k = `${response}/${damping}`;
  if (springs.has(k)) return springs.get(k);
  const w = (2 * Math.PI) / response,
    z = Math.min(damping, 0.999),
    wd = w * Math.sqrt(1 - z * z);
  const x = (t) =>
    1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  const settleTime = Math.log(1000) / (z * w); // within a thousandth of where it's going
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(i === 40 ? 1 : +x((settleTime * i) / 40).toFixed(4));
  const motion = {
    easing: LINEAR ? `linear(${pts.join(', ')})` : SPRING,
    ms: Math.round(settleTime * 1000),
  };
  springs.set(k, motion);
  return motion;
}

// ---------------------------------------------------------------- a switch's thumb slides to what you picked
// (Lesson | Code, Puzzles | Playgrounds, Code | Both | Plain, Output | Steps | Growth…). The page only moves its
// "on" look from one button to the next; a stand-in thumb glides between them while it does.
const GLIDE = [
  ['.pseg', 'button'],
  ['.seg', 'button'],
  ['.lenses', '.lens:not(.twin)'],
  ['.stage-tabs', '.stab:not(.predict)'],
];
function glide(e) {
  const button = e.target.closest?.('button');
  const box = button?.parentElement;
  if (!box || button.disabled || reduced()) return;
  const glide = GLIDE.find(([c, it]) => box.matches(c) && button.matches(it));
  if (!glide) return;
  const items = [...box.children].filter((x) => x.matches(glide[1]));
  const from = box.__glide?.ghost || items.find((x) => x.classList.contains('on'));
  if (!from || (from === button && !box.__glide)) return;
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
  box.style.isolation = 'isolate';
  const bx = box.getBoundingClientRect(),
    fr = from.getBoundingClientRect();
  let ghost = box.__glide?.ghost;
  if (ghost) box.__glide.anim?.cancel();
  else {
    const cs = getComputedStyle(from);
    ghost = document.createElement('i');
    ghost.className = 'glide';
    Object.assign(ghost.style, {
      background: cs.backgroundColor,
      boxShadow: cs.boxShadow,
      borderRadius: cs.borderRadius,
    });
    box.prepend(ghost);
    box.classList.add('gliding');
  }
  const at = (r) => ({
    transform: `translate(${r.left - bx.left - box.clientLeft}px, ${r.top - bx.top - box.clientTop}px)`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
  Object.assign(ghost.style, at(fr));
  /** @type {{ ghost: HTMLElement, anim?: Animation }} */
  const me = (box.__glide = { ghost });
  let tries = 0;
  // the page shows the new choice once it has heard the tap: then the thumb follows it there
  const go = () => {
    if (box.__glide !== me) return;
    let to = button.isConnected && button.classList.contains('on') ? button : null;
    if (!to && ++tries < 6) {
      requestAnimationFrame(go);
      return;
    }
    to = to || items.find((x) => x.classList.contains('on') && x.isConnected);
    // (the real thumb takes over where the stand-in stopped, without fading in: one frame with no transitions)
    const done = () => {
      if (box.__glide !== me) return;
      box.classList.add('glided');
      ghost.remove();
      box.classList.remove('gliding');
      box.__glide = null;
      box.style.isolation = '';
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('glided')));
    };
    if (!to || !box.isConnected) {
      done();
      return;
    }
    const motion = spring(0.34, 0.8);
    me.anim = ghost.animate([at(fr), at(to.getBoundingClientRect())], {
      duration: motion.ms,
      easing: motion.easing,
      fill: 'forwards',
    });
    me.anim.onfinish = done;
  };
  requestAnimationFrame(go);
}

// ---------------------------------------------------------------- press and hold: a menu, as on any iPhone list
// The row lifts out of a blurred page and its actions open under it. Today: Recent (open it, or take it off the list).
const HOLD = [
  {
    sel: '.side .rl',
    items: (row) => [
      {
        label: t('Open'),
        icon: 'M5 12h14M13 6l6 6-6 6',
        run: () => row.querySelector('.rl-main')?.click(),
      },
      {
        label: t('Remove from Recent'),
        icon: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
        danger: true,
        run: () => row.querySelector('.rl-x')?.click(),
      },
    ],
  },
];
// a copy of the row that looks the same anywhere on the page (its styles come from where it sits, so they go with it)
const LOOK = [
  'display',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'flex',
  'padding',
  'width',
  'height',
  'min-width',
  'min-height',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
  'color',
  'background-color',
  'border-radius',
  'overflow',
  'white-space',
  'text-overflow',
  'box-shadow',
  'opacity',
  'object-fit',
  'stroke',
  'fill',
];
function lookalike(el) {
  const clone = el.cloneNode(true);
  const walk = (a, b) => {
    if (!(a instanceof Element)) return;
    const cs = getComputedStyle(a);
    for (const k of LOOK) b.style.setProperty(k, cs.getPropertyValue(k));
    [...a.children].forEach((x, i) => walk(x, b.children[i]));
  };
  walk(el, clone);
  return clone;
}
function holdMenu(row, spec, done) {
  haptic('light');
  const rect = row.getBoundingClientRect();
  const veil = document.createElement('div');
  veil.className = 'hold-veil';
  const lift = lookalike(row);
  lift.classList.add('hold-lift');
  lift.removeAttribute('id');
  lift.setAttribute('aria-hidden', 'true');
  lift.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  Object.assign(lift.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  const menu = document.createElement('div');
  menu.className = 'hold-menu';
  menu.setAttribute('role', 'menu');
  const close = (then) => {
    veil.classList.add('out');
    lift.classList.add('out');
    menu.classList.add('out');
    setTimeout(() => {
      veil.remove();
      lift.remove();
      menu.remove();
      row.style.visibility = '';
      done();
      then?.();
    }, 180);
  };
  for (const it of spec.items(row)) {
    const button = document.createElement('button');
    button.setAttribute('role', 'menuitem');
    if (it.danger) button.className = 'danger';
    button.innerHTML = `<span></span><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="${it.icon}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    button.firstChild.textContent = it.label;
    button.onclick = (e) => {
      e.stopPropagation();
      if (it.danger) haptic('warn');
      close(it.run);
    };
    menu.append(button);
  }
  veil.onclick = () => close();
  menu.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(() => row.querySelector('button')?.focus());
    }
  };
  document.body.append(veil, lift, menu);
  // under the row if it fits, over it if not, never off the screen
  const mh = menu.offsetHeight,
    below = rect.bottom + 10 + mh < innerHeight - 20;
  Object.assign(menu.style, {
    left: `${Math.min(Math.max(12, rect.left + 8), innerWidth - menu.offsetWidth - 12)}px`,
    top: `${below ? rect.bottom + 10 : Math.max(20, rect.top - 10 - mh)}px`,
    transformOrigin: below ? 'top left' : 'bottom left',
  });
  row.style.visibility = 'hidden';
  const motion = spring(0.32, 0.72);
  lift.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }], {
    duration: motion.ms,
    easing: motion.easing,
    fill: 'forwards',
  });
  menu.querySelector('button')?.focus({ preventScroll: true });
}

// the sheets that slide up over a page, and how each is put away (the same way Esc or its ✕ does)
const esc = (el) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const SHEETS = [
  { sel: '.drawer', veil: '.drawer-veil', x: '.dr-x', close: esc },
  { sel: '.settings', veil: '.pal-veil', x: '.set-h .ib', close: esc },
  { sel: '.pal', veil: '.pal-veil', x: '.pal-cancel', close: esc },
  // a conversation about a project: down makes it small (its ✕ clears it)
  {
    sel: '.aq-dock',
    x: '.aq-dock-h .ib',
    close: (el) => el.querySelector('.aq-dock-h .ib')?.click(),
  },
];
const veilOf = (s, el) =>
  s.veil
    ? el.closest(s.veil) ||
      el.parentElement?.querySelector(`:scope > ${s.veil}`) ||
      document.querySelector(s.veil)
    : null;

const set = (el, st) => {
  if (el) Object.assign(el.style, st);
};
const clear = (el, ...props) => {
  if (el)
    props.forEach((p) => {
      el.style[p] = '';
    });
};

/** slide a sheet off the bottom of the screen, then put it away for real */
function slideAway(el, motion, after) {
  const veil = veilOf(motion, el);
  if (reduced()) {
    after();
    return;
  }
  const h = el.getBoundingClientRect().height;
  set(el, {
    animation: 'none',
    transition: `transform .24s ${OUT}`,
    transform: `translateY(${h + 24}px)`,
  });
  if (veil)
    set(
      veil,
      veil.contains(el)
        ? { transition: 'background-color .24s', backgroundColor: 'transparent' }
        : { transition: 'opacity .24s', opacity: '0' },
    );
  setTimeout(() => {
    after();
    // if it didn't go away after all, bring it back rather than leave it hidden off-screen
    setTimeout(() => {
      if (el.isConnected) {
        clear(el, 'transform', 'transition', 'animation');
        clear(veil, 'opacity', 'backgroundColor', 'transition');
      }
    }, 400);
  }, 220);
}
const snapBack = (el, veil) => {
  const sp = spring(0.38, 0.8);
  set(el, { transition: `transform ${sp.ms}ms ${sp.easing}`, transform: '' });
  if (veil)
    set(veil, {
      transition: 'opacity .32s, background-color .32s',
      opacity: '',
      backgroundColor: '',
    });
  setTimeout(() => {
    clear(el, 'transition');
    clear(veil, 'transition');
  }, 340);
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
export function useTouch(on, options) {
  const ref = useRef(options);
  ref.current = options;
  useEffect(() => {
    if (!on) return undefined;
    let gesture = null; // the gesture in progress
    const width = () => innerWidth;

    // ---------------------------------------------------------------- a button answers as soon as you touch it
    let pressed = null,
      pressT = 0,
      p0 = [0, 0];
    // a row across the screen lights up behind its words (as in an iPhone list); a big card gives a little; the rest dim
    const press = (el) => {
      el.classList.remove('unpress');
      el.classList.add('pressed');
      const rect = el.getBoundingClientRect();
      const row = rect.width > innerWidth * 0.7 && rect.height < 130;
      el.classList.toggle('prow', row);
      el.classList.toggle('big', !row && rect.width * rect.height > 9000 && rect.height > 54);
    };
    const unpress = () => {
      clearTimeout(pressT);
      const el = pressed;
      pressed = null;
      if (!el) return;
      const release = () => {
        el.classList.remove('pressed');
        el.classList.add('unpress');
        setTimeout(() => el.classList.remove('unpress', 'big', 'prow'), 520);
      };
      if (el.classList.contains('pressed')) release();
      else {
        press(el);
        requestAnimationFrame(() => requestAnimationFrame(release));
      } // a quick tap still shows
    };
    const unpressNow = () => {
      clearTimeout(pressT);
      if (pressed) pressed.classList.remove('pressed', 'big', 'prow');
      pressed = null;
    };

    // press and hold (a menu): the finger stays put for half a second
    let holdT = 0,
      holding = false,
      eatUntil = 0;
    const holdOff = () => {
      clearTimeout(holdT);
      holdT = 0;
    };

    const start = (e) => {
      holdOff();
      if (e.touches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = e.touches[0];
      const tgt = e.target instanceof Element ? e.target : e.target?.parentElement;
      if (!tgt) return;
      const x = ref.current;
      p0 = [touch.clientX, touch.clientY];
      // the press
      const pressable = tgt.closest(PRESSABLE);
      if (
        pressable &&
        !pressable.disabled &&
        !pressable.closest('.cm-editor, .city') &&
        pressable.getAttribute('aria-disabled') !== 'true'
      ) {
        pressed = pressable;
        pressT = window.setTimeout(() => pressed === pressable && press(pressable), 60);
      }
      for (const h of HOLD) {
        const row = tgt.closest(h.sel);
        if (!row || tgt.closest('.rl-x') || document.querySelector('.hold-menu')) continue;
        holdT = window.setTimeout(() => {
          holdT = 0;
          unpressNow();
          gesture = null;
          holding = true;
          holdMenu(row, h, () => {});
        }, 480);
      }
      gesture = {
        x0: touch.clientX,
        y0: touch.clientY,
        trail: [[e.timeStamp, 0, 0]],
        mode: null,
        lock: false,
      };
      if (!x.phone) return;
      for (const sheet of SHEETS) {
        const el = tgt.closest(sheet.sel);
        if (el) {
          if (atTop(tgt, el) && !tgt.closest('input, textarea, [contenteditable]'))
            Object.assign(gesture, { mode: 'sheet', el, s: sheet, veil: veilOf(sheet, el) });
          return;
        }
      }
      const side = document.querySelector('.app.phone .side');
      if (x.drawerOpen()) {
        if (side && (side.contains(tgt) || tgt.closest('.pveil')))
          Object.assign(gesture, {
            mode: 'drawer',
            el: side,
            veil: document.querySelector('.pveil'),
          });
        return;
      }
      if (
        !x.swipe ||
        touch.clientX > 22 ||
        document.querySelector('.drawer, .pal-veil, .aq-dock, .coach-tip')
      )
        return;
      if (x.canBack())
        Object.assign(gesture, {
          mode: 'back',
          el: document.getElementById('content'),
          bar: document.querySelector('.pbar-mid'),
        });
      else if (x.atRoot() && side)
        Object.assign(gesture, { mode: 'open', el: side, veil: document.querySelector('.pveil') });
    };

    const move = (e) => {
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - p0[0]) > 8 || Math.abs(touch.clientY - p0[1]) > 8) {
        holdOff();
        if (pressed) unpressNow();
      }
      if (holding) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!gesture?.mode) return;
      const dx = touch.clientX - gesture.x0,
        dy = touch.clientY - gesture.y0;
      if (!gesture.lock) {
        // decided on the first move: once Safari starts scrolling, it can't be taken back
        const ok =
          gesture.mode === 'sheet'
            ? dy > 0 && dy >= Math.abs(dx)
            : gesture.mode === 'drawer'
              ? dx < 0 && -dx > Math.abs(dy)
              : dx > 0 && dx > Math.abs(dy);
        if (!ok || !e.cancelable) {
          gesture = null;
          return;
        }
        gesture.lock = true;
        unpressNow();
        set(gesture.el, { transition: 'none', animation: 'none' });
        if (gesture.veil) set(gesture.veil, { transition: 'none', animation: 'none' });
        if (gesture.mode === 'back')
          set(gesture.el, { boxShadow: '-10px 0 30px rgba(0, 0, 0, .14)' });
        if (gesture.mode === 'open') set(gesture.el, { visibility: 'visible' });
        if (gesture.mode === 'open' && gesture.veil)
          set(gesture.veil, { display: 'block', pointerEvents: 'none' });
      }
      e.preventDefault();
      gesture.trail.push([e.timeStamp, dx, dy]);
      if (gesture.trail.length > 6) gesture.trail.shift();
      const w = width();
      if (gesture.mode === 'sheet') {
        const y = Math.max(0, dy);
        gesture.el.style.transform = `translateY(${y}px)`;
        if (gesture.veil)
          gesture.veil.contains(gesture.el)
            ? (gesture.veil.style.backgroundColor = `rgba(30, 24, 18, ${0.16 * Math.max(0, 1 - y / 400)})`)
            : (gesture.veil.style.opacity = String(Math.max(0, 1 - y / 500)));
      } else if (gesture.mode === 'drawer') {
        const sw = gesture.el.offsetWidth;
        const x = Math.min(0, dx);
        gesture.el.style.transform = `translateX(${x}px)`;
        if (gesture.veil) gesture.veil.style.opacity = String(1 + x / sw);
      } else if (gesture.mode === 'open') {
        const sw = gesture.el.offsetWidth;
        const x = Math.min(0, -sw + dx);
        gesture.el.style.transform = `translateX(${x}px)`;
        if (gesture.veil) gesture.veil.style.opacity = String(Math.max(0, 1 + x / sw));
      } else {
        const x = Math.max(0, dx);
        gesture.el.style.transform = `translateX(${x}px)`;
        if (gesture.bar) gesture.bar.style.opacity = String(Math.max(0, 1 - (2 * x) / w));
      }
    };

    const end = () => {
      holdOff();
      // (the click a lifted finger may still send lands on the shade: it isn't a tap to close the menu)
      if (holding) {
        holding = false;
        eatUntil = Date.now() + 250;
      }
      unpress();
      const k = gesture;
      gesture = null;
      if (!k?.lock) return;
      const [first, last] = [k.trail[0], k.trail[k.trail.length - 1]];
      const dt = Math.max(1, last[0] - first[0]);
      const vx = (last[1] - first[1]) / dt,
        vy = (last[2] - first[2]) / dt;
      const [, dx, dy] = last;
      const w = width();
      const x = ref.current;
      if (k.mode === 'sheet') {
        const h = k.el.getBoundingClientRect().height;
        if (dy > Math.min(150, h * 0.3) || (vy > 0.5 && dy > 24))
          slideAway(k.el, k.s, () => k.s.close(k.el));
        else snapBack(k.el, k.veil);
      } else if (k.mode === 'drawer' || k.mode === 'open') {
        const sw = k.el.offsetWidth;
        const closing =
          k.mode === 'drawer' ? -dx > sw * 0.3 || vx < -0.4 : !(dx > sw * 0.35 || vx > 0.4);
        set(k.el, {
          transition: `transform .26s ${closing ? OUT : SPRING}`,
          transform: closing ? 'translateX(-104%)' : 'translateX(0)',
        });
        if (k.veil) set(k.veil, { transition: 'opacity .26s', opacity: closing ? '0' : '1' });
        setTimeout(() => {
          if (k.mode === 'drawer' && closing) x.closeDrawer();
          if (k.mode === 'open' && !closing) x.openDrawer();
          requestAnimationFrame(() => {
            clear(k.el, 'transition', 'transform', 'visibility', 'animation');
            clear(k.veil, 'transition', 'opacity', 'display', 'pointerEvents', 'animation');
          });
        }, 250);
      } else {
        const go = dx > w * 0.33 || (vx > 0.35 && dx > 30);
        set(k.el, {
          transition: `transform ${go ? '.2s' : '.3s'} ${go ? OUT : SPRING}`,
          transform: go ? `translateX(${w}px)` : '',
        });
        if (k.bar) set(k.bar, { transition: 'opacity .2s', opacity: go ? '0' : '' });
        setTimeout(
          () => {
            if (go) {
              set(k.el, { visibility: 'hidden' });
              x.back();
              setTimeout(() => settle(k), 700);
            } // the next page clears this (enter, Phone.jsx); this is in case it never comes
            else settle(k);
          },
          go ? 190 : 300,
        );
      }
    };
    const settle = (k) => {
      clear(k.el, 'transition', 'transform', 'boxShadow', 'visibility', 'animation');
      clear(k.bar, 'transition', 'opacity');
    };

    // ---------------------------------------------------------------- ✕ and the shade behind a sheet: it slides away first
    // (only a finger's own tap: the click that follows the slide, or one Bento makes itself, goes straight through)
    const tapAway = (e) => {
      const tgt = e.target instanceof Element ? e.target : null;
      // the finger that held a row down for its menu lifts: that's not a tap on the row
      if (e.type === 'click' && Date.now() < eatUntil && !tgt?.closest('.hold-menu')) {
        eatUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!tgt || !e.isTrusted || !ref.current.phone) return;
      for (const kind of SHEETS) {
        const btn = kind.x && tgt.closest(kind.x);
        const el = btn?.closest(kind.sel);
        if (btn && el) {
          if (
            e.type !== 'click' ||
            (kind.sel === '.aq-dock' && btn !== el.querySelector('.aq-dock-h .ib'))
          )
            return; // ✕ on a conversation clears it: no slide
          e.preventDefault();
          e.stopPropagation();
          slideAway(el, kind, () => btn.click());
          return;
        }
        // the shade itself (not the sheet on it)
        if (kind.veil && tgt.matches(kind.veil)) {
          const sheet =
            tgt.querySelector(kind.sel) ||
            (kind.sel === '.drawer' && document.querySelector('.drawer'));
          if (!sheet || (e.type === 'mousedown') !== (kind.veil === '.pal-veil')) continue;
          e.preventDefault();
          e.stopPropagation();
          slideAway(sheet, kind, () => kind.close(sheet));
          return;
        }
      }
    };

    // ---------------------------------------------------------------- the keyboard: the app fits in what's left above it
    // (Safari would slide the whole page up instead, top bar and all, to show the box you're typing in)
    const vv = window.visualViewport;
    const root = document.documentElement;
    const typingIn = () =>
      document.activeElement?.matches?.(
        'input:not([type=checkbox], [type=radio], [type=range]), textarea, [contenteditable=true]',
      );
    // (iOS 26 shrinks innerHeight with the keyboard, so it's measured against the height with no keyboard up)
    let full = vv ? vv.height : innerHeight;
    const fit = () => {
      if (!ref.current.phone || !vv) return;
      const on = typingIn();
      if (!on && !root.classList.contains('kb')) full = vv.height;
      if (on && full - vv.height > 120) {
        // (Safari may also pan what you see down the page a little, which nothing can undo: the app moves to meet it)
        root.style.setProperty('--kb-h', `${Math.round(vv.height)}px`);
        root.style.setProperty('--kb-top', `${Math.max(0, Math.round(vv.offsetTop - scrollY))}px`);
        if (!root.classList.contains('kb')) {
          root.classList.add('kb');
          requestAnimationFrame(() =>
            document.activeElement?.scrollIntoView?.({ block: 'nearest' }),
          );
        }
        if (scrollY || vv.offsetTop) scrollTo(0, 0);
      } else if (root.classList.contains('kb')) {
        root.classList.remove('kb');
        root.style.removeProperty('--kb-h');
        root.style.removeProperty('--kb-top');
        if (scrollY) scrollTo(0, 0);
        full = vv.height;
      }
    };
    // Safari scrolls the page to show the box you tapped; the app already shows it, so the page stays put
    const stay = () => {
      if (root.classList.contains('kb') && scrollY) scrollTo(0, 0);
    };
    addEventListener('scroll', stay, { passive: true });
    const out = () => setTimeout(fit, 60);
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    document.addEventListener('focusout', out);

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    document.addEventListener('click', tapAway, true);
    document.addEventListener('mousedown', tapAway, true);
    document.addEventListener('click', glide, true);
    root.style.setProperty('--spring-press', spring(0.42, 0.58).easing);
    root.style.setProperty('--spring-sheet', spring(0.5, 0.94).easing);
    return () => {
      holdOff();
      document.removeEventListener('click', glide, true);
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      document.removeEventListener('focusout', out);
      removeEventListener('scroll', stay);
      root.classList.remove('kb');
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
      document.removeEventListener('click', tapAway, true);
      document.removeEventListener('mousedown', tapAway, true);
    };
  }, [on]);
}
