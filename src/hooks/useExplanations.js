import { useState, useEffect } from 'react';
import { api } from '../bridge.js';
import { explainToken } from '../explain.js';
import { parseJSONLoose } from '../lesson.js';

// Explanations on demand: tap a word in a lesson (onTerm), select any text and press Explain (sel,
// explainSelection), or tap a "try" chip under the code (onTry): a change it can make itself, or one your AI makes.
// The answer shows in the popover (pop), which closes when you click anywhere else.
export default function useExplanations({
  atlasKey,
  atlases,
  current,
  desk,
  phone,
  setPane,
  setPop,
  settings,
  view,
}) {
  // try chips: make every suggestion actually do something
  const onTry = async (t) => {
    const lesson = current;
    if (!lesson) return;
    const deskEl = desk.current;
    // on a phone the code is on the other page: go there, so you see what the try does
    if (phone) setPane('code');
    if (/step/i.test(t)) return deskEl?.step();
    if (/run the tests|tests/i.test(t) && lesson.tests) return deskEl?.tests();
    if (/measure|growth/i.test(t))
      return /** @type {HTMLElement | null} */ (
        document.querySelector('.stab:nth-child(3)')
      )?.click();
    const code = deskEl?.getCode() ?? lesson.code;
    const m = /^change\s+(.+?)\s+to\s+(.+?)\.?$/i.exec(t);
    if (m) {
      const from = m[1].replace(/^["'`]|["'`]$/g, '');
      let to = m[2].replace(/^["'`]|["'`]$/g, '');
      // "Change size=4 to 2" means change the value, keep the name
      const kv = /^([\w.]+)\s*(=|:)\s*(.+)$/.exec(from);
      if (kv && !/[=:]/.test(to)) to = from.slice(0, from.length - kv[3].length) + to;
      const rx = new RegExp(`(^|[^\\w.])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`);
      if (rx.test(code)) {
        deskEl?.setCode(code.replace(rx, (all, pre) => pre + to));
        setTimeout(() => deskEl?.run(), 30);
        return;
      }
    }
    setPop({
      x: innerWidth * 0.3,
      y: innerHeight * 0.5,
      word: t,
      info: null,
      loading: true,
      kind: 'try',
    });
    try {
      const s = await api.quick(
        settings.model,
        `Apply this small experiment to the student's ${lesson.lang} code: "${t}". Change as little as possible.\nReply JSON: {"code":"the full updated code","note":"what changed, max 15 words"}\n\nCODE:\n${code}`,
      );
      const j = parseJSONLoose(s);
      if (j?.code) {
        deskEl?.setCode(j.code);
        setTimeout(() => deskEl?.run(), 30);
        setPop(null);
      } else setPop(null);
    } catch {
      setPop(null);
    }
  };
  // select any text (story, code, atlas) → a small "Explain" bubble
  const [sel, setSel] = useState(null);
  useEffect(() => {
    const up = (e) => {
      if (e.target.closest?.('.sel-pill, .pop, input, textarea')) return;
      setTimeout(() => {
        const s0 = window.getSelection();
        const t = s0?.toString().trim();
        if (!t || t.length < 2 || t.length > 400 || !s0.rangeCount) return setSel(null);
        const n = s0.anchorNode?.parentElement;
        if (!n?.closest('.story, .cm-content, .atlas, .ideas, .words')) return setSel(null);
        const r = s0.getRangeAt(0).getBoundingClientRect();
        setSel({ text: t, x: r.left + r.width / 2, y: r.top, inCode: !!n.closest('.cm-content') });
      }, 10);
    };
    addEventListener('mouseup', up);
    return () => removeEventListener('mouseup', up);
  }, []);
  const explainSelection = async () => {
    const selection = sel;
    setSel(null);
    window.getSelection()?.removeAllRanges();
    const lesson = view === 'lesson' ? current : null;
    const atlas = view === 'atlas' ? atlases[atlasKey] : null;
    const ctx = lesson
      ? `It appears in a lesson titled "${lesson.title}"${selection.inCode ? ` in this ${lesson.lang} code:\n${(lesson.work ?? lesson.code ?? '').slice(0, 2500)}` : '.'}`
      : atlas
        ? `It appears while studying the repository ${atlas.name} (${atlas.narr?.gist?.one || ''}).`
        : '';
    const base = {
      x: Math.max(16, selection.x - 160),
      y: selection.y + 28,
      word: selection.text.length > 40 ? selection.text.slice(0, 38) + '…' : selection.text,
    };
    setPop({ ...base, loading: true });
    try {
      const j = parseJSONLoose(
        await api.quick(
          settings.model,
          `A learner (${settings.level}) selected this and wants it explained:\n"${selection.text}"\n${ctx}\nExplain what it means in plain words, then name the technical idea if there is one. If the selection is a fragment, quietly explain the idea it belongs to; never comment on the selection itself.\nReply JSON: {"title":"short label, max 5 words","what":"plain explanation, max 45 words","plain":"the key idea in max 10 words","example":"tiny example if useful, max 2 lines, else empty"}`,
        ),
      );
      setPop((p) =>
        p?.word === base.word
          ? {
              ...base,
              info: j
                ? {
                    title: j.title || base.word,
                    w: j.what,
                    p: j.plain,
                    ex: j.example,
                    t: 'explained',
                  }
                : {
                    title: base.word,
                    w: 'Couldn’t explain that one. Try selecting a little more.',
                  },
            }
          : p,
      );
    } catch {
      setPop(null);
    }
  };
  const onTerm = (word, elx) => {
    const lesson = current;
    const r = elx.getBoundingClientRect();
    const doc = lesson.work ?? lesson.code ?? '';
    const info = explainToken({
      word: word.replace(/\(.*$/, '').replace(/^.*\./, ''),
      lineText: word,
      lang: lesson.lang,
      doc,
      english: lesson.pseudo,
      model: settings.model,
      quick: api.quick,
      isMember: /\./.test(word),
    });
    const base = { x: r.left, y: r.bottom + 8, word };
    if (info && typeof info.then === 'function') {
      setPop({ ...base, loading: true });
      info
        .then((i) => setPop((p) => (p?.word === word ? { ...base, info: i } : p)))
        .catch(() => setPop(null));
    } else setPop({ ...base, info: info || { title: word, w: 'A term from this lesson.' } });
  };
  useEffect(() => {
    const h = (e) => {
      if (!e.target.closest?.('.pop, .term, .sel-pill')) setPop(null);
    };
    addEventListener('mousedown', h);
    return () => removeEventListener('mousedown', h);
  }, []);
  return { explainSelection, onTerm, onTry, sel };
}
