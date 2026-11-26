import { useEffect, useRef } from 'react';
import { api } from '../bridge.js';
import { mod, TOUCH } from '../platform.js';

// Keyboard shortcuts (⌘N, ⌘K, ⌘\, ⌘/ ...) and the Mac menu bar's commands, which arrive from the main process.
export default function useShortcuts({
  desk,
  openFolderAtlas,
  setFindOpen,
  setLinkRange,
  setOnb,
  setPal,
  setPop,
  setShowKeys,
  setShowSettings,
  setSideOpen,
  setViewRaw,
  view,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (mod(e) && e.key === 'n') {
        e.preventDefault();
        setViewRaw('home');
      }
      if (mod(e) && e.key === 'f' && !TOUCH && !document.activeElement?.closest?.('.cm-editor')) {
        e.preventDefault();
        setFindOpen(true);
      }
      if (
        mod(e) &&
        (e.key === '[' || e.key === ']') &&
        !document.activeElement?.closest?.('.cm-editor')
      ) {
        e.preventDefault();
        e.key === '[' ? history.back() : history.forward();
      }
      if (mod(e) && e.key === '\\') {
        e.preventDefault();
        setSideOpen((x) => !x);
      }
      if (mod(e) && e.key === 'k') {
        e.preventDefault();
        setPal((x) => !x);
      }
      if (mod(e) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if (e.key === '/' && mod(e)) {
        e.preventDefault();
        setShowKeys((x) => !x);
      }
      const emptyAsk =
        document.activeElement?.matches?.('.composer textarea') &&
        !(/** @type {HTMLTextAreaElement} */ (document.activeElement).value);
      if (
        e.key === '?' &&
        !mod(e) &&
        (emptyAsk ||
          (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName) &&
            !document.activeElement?.closest?.('.cm-editor')))
      ) {
        e.preventDefault();
        setShowKeys((x) => !x);
      }
      if (e.key === 'Escape') setShowKeys(false);
      if (mod(e) && e.key === 'l') {
        e.preventDefault();
        if (view === 'lesson') document.getElementById('followup')?.focus();
        else if (view === 'atlas') document.getElementById('atlas-ask')?.focus();
        else
          /** @type {HTMLElement | null} */ (
            document.querySelector('.composer textarea, .ex-search input')
          )?.focus();
      }
      if (e.key === 'Escape') {
        setPop(null);
        setLinkRange(null);
      }
      if (
        mod(e) &&
        e.key === 'Enter' &&
        view === 'lesson' &&
        !document.activeElement?.closest?.('.cm-editor')
      ) {
        e.preventDefault();
        e.shiftKey ? desk.current?.step() : desk.current?.run();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [view]);
  // The menu bar sends the same commands. If you just pressed that shortcut, the page has already done it.
  const menuActs = useRef(/** @type {Record<string, () => void>} */ ({}));
  menuActs.current = { openFolderAtlas };
  useEffect(() => {
    let lastMod = 0;
    const noteMod = (e) => {
      if (mod(e)) lastMod = Date.now();
    };
    addEventListener('keydown', noteMod, true);
    const off = api.onMenu?.((action) => {
      const keyed = Date.now() - lastMod < 500;
      if (action === 'openFolder') return menuActs.current.openFolderAtlas?.();
      if (action === 'setup') return setOnb(1);
      if (keyed) return;
      if (action === 'settings') setShowSettings(true);
      if (action === 'new') setViewRaw('home');
      if (action === 'search') setPal((x) => !x);
      if (action === 'sidebar') setSideOpen((x) => !x);
      if (action === 'keys') setShowKeys(true);
      if (action === 'find') setFindOpen(true);
      if (action === 'back') history.back();
      if (action === 'forward') history.forward();
    });
    // a mouse's side buttons
    const side = (e) => {
      if (e.button === 3) {
        e.preventDefault();
        history.back();
      } else if (e.button === 4) {
        e.preventDefault();
        history.forward();
      }
    };
    addEventListener('mouseup', side);
    return () => {
      removeEventListener('keydown', noteMod, true);
      removeEventListener('mouseup', side);
      off?.();
    };
  }, []);
  return {};
}
