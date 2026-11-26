// The app's own words (menus, buttons, headings) in the learner's language.
// Strings are written in English and wrapped in t(). The first time a language is used, your own AI
// translates whatever is on screen in a few small batches; the result is kept on this Mac, so it
// happens once. With no AI connected, everything simply stays in English.
import { createElement, Fragment, useSyncExternalStore } from 'react';

let lang = 'English';
let dict = {};
let translate = null; // (strings[], language) => Promise<{ [english]: translated }>
const missing = new Set();
const tried = new Set();
let timer = null;
let version = 0;
const subs = new Set();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};
const key = (l) => `bento.ui.${l}`;

export function setUILanguage(l, translator) {
  translate = translator || translate;
  if (l === lang) return;
  lang = l || 'English';
  try {
    dict = lang === 'English' ? {} : JSON.parse(localStorage.getItem(key(lang)) || '{}');
  } catch {
    dict = {};
  }
  missing.clear();
  tried.clear();
  bump();
}

function queue(s) {
  if (lang === 'English' || !translate || tried.has(s)) return;
  missing.add(s);
  tried.add(s);
  clearTimeout(timer);
  timer = setTimeout(flush, 350);
}
async function flush() {
  const batch = [...missing].slice(0, 90);
  batch.forEach((s) => missing.delete(s));
  if (!batch.length) return;
  const forLang = lang;
  try {
    const got = await translate(batch, forLang);
    if (forLang !== lang || !got) return;
    for (const s of batch) if (typeof got[s] === 'string' && got[s].trim()) dict[s] = got[s];
    localStorage.setItem(key(lang), JSON.stringify(dict));
    bump();
  } catch {
    /* stays English; we'll try again next launch */
  }
  if (missing.size) timer = setTimeout(flush, 200);
}

// t('Run') → 'Ejecutar'. Words between *stars* become emphasis when rendered with tx().
export function t(s) {
  if (lang === 'English' || !s) return s;
  const v = dict[s];
  if (v == null) queue(s);
  return v ?? s;
}
// "Learn it *in order*." → ['Learn it ', <em>in order</em>, '.']
export function tx(s) {
  return String(t(s))
    .split(/(\*[^*]+\*)/)
    .map((p, i) =>
      p.startsWith('*') && p.endsWith('*') && p.length > 2
        ? createElement('em', { key: i }, p.slice(1, -1))
        : createElement(Fragment, { key: i }, p),
    );
}
// re-render when translations arrive
export function useT() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => version,
  );
  return t;
}
export const uiLanguage = () => lang;
