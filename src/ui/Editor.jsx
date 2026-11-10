import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { EditorState, StateField, StateEffect, Compartment, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, Decoration, ViewPlugin, hoverTooltip, WidgetType } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, syntaxTree, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { sql, SQLite } from '@codemirror/lang-sql';
import { css } from '@codemirror/lang-css';
import { tags as t } from '@lezer/highlight';

// ---------------------------------------------------------------- theme
const hl = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--syn-kw)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: 'var(--syn-fn)' },
  { tag: [t.className, t.typeName, t.definition(t.className)], color: 'var(--syn-type)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-str)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.propertyName], color: 'var(--syn-prop)' },
  { tag: [t.self], color: 'var(--syn-kw)', fontStyle: 'italic' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--syn-punc)' },
]);
const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--code-size)', background: 'transparent', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.75', overflow: 'auto' },
  '.cm-content': { padding: '14px 0 40px', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 18px 0 6px' },
  '.cm-gutters': { background: 'transparent', border: 'none', color: 'var(--ink-4)', paddingLeft: '6px' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 8px', minWidth: '30px', fontSize: '11.5px' },
  '.cm-activeLine': { background: 'var(--active-line)' },
  '.cm-activeLineGutter': { background: 'transparent', color: 'var(--ink-2)' },
  '.cm-cursor': { borderLeft: '2px solid var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { background: 'var(--selection) !important' },
  '.cm-matchingBracket': { background: 'var(--butter-soft)', outline: 'none', borderRadius: '3px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': { border: 'none', background: 'transparent' },
});

// ---------------------------------------------------------------- marks (highlights / step / error / diff)
const setMarks = StateEffect.define();
const marksField = StateField.define({
  create: () => ({ link: null, step: null, err: null, diff: null, note: null, hover: null }),
  update(v, tr) { for (const e of tr.effects) if (e.is(setMarks)) v = { ...v, ...e.value }; return v; },
});
class ErrWidget extends WidgetType {
  constructor(msg) { super(); this.msg = msg; }
  eq(o) { return o.msg === this.msg; }
  toDOM() { const d = document.createElement('div'); d.className = 'cm-err-msg'; d.textContent = this.msg; return d; }
}
const marksDeco = EditorView.decorations.compute([marksField, 'doc'], (state) => {
  const m = state.field(marksField); const doc = state.doc; const n = doc.lines;
  const cls = new Map();
  const add = (l, c) => { if (l >= 1 && l <= n) cls.set(l, (cls.get(l) || '') + ' ' + c); };
  if (m.diff) m.diff.forEach((l) => add(l, 'cm-hl-add'));
  if (m.link) for (let l = m.link[0]; l <= m.link[1]; l++) add(l, 'cm-hl-link' + (l === m.link[0] ? ' cm-hl-first' : '') + (l === m.link[1] ? ' cm-hl-last' : ''));
  if (m.note) for (let l = m.note[0]; l <= m.note[1]; l++) add(l, 'cm-hl-note');
  if (m.step) add(m.step, 'cm-hl-step');
  if (m.err?.line) add(m.err.line, 'cm-hl-err');
  const b = new RangeSetBuilder();
  [...cls.keys()].sort((a, c) => a - c).forEach((l) => {
    const line = doc.line(l);
    b.add(line.from, line.from, Decoration.line({ class: cls.get(l).trim() }));
    if (m.err?.line === l && m.err.msg) b.add(line.to, line.to, Decoration.widget({ widget: new ErrWidget(m.err.msg), block: true, side: 1 }));
  });
  return b.finish();
});

// ---------------------------------------------------------------- scrubbable numbers
const numMark = Decoration.mark({ class: 'cm-num' });
const numberPlugin = ViewPlugin.fromClass(class {
  constructor(v) { this.decorations = this.build(v); }
  update(u) { if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = this.build(u.view); }
  build(v) {
    const b = new RangeSetBuilder();
    for (const { from, to } of v.visibleRanges) syntaxTree(v.state).iterate({ from, to, enter: (n) => { if (n.name === 'Number') b.add(n.from, n.to, numMark); } });
    return b.finish();
  }
}, { decorations: (p) => p.decorations });

function scrubHandler(getOnScrub) {
  return EditorView.domEventHandlers({
    mousedown(e, view) {
      if (!e.altKey) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      let node = syntaxTree(view.state).resolveInner(pos, 1);
      if (node.name !== 'Number') node = syntaxTree(view.state).resolveInner(pos, -1);
      if (node.name !== 'Number') return false;
      e.preventDefault();
      const from = node.from; let len = node.to - node.from;
      const text = view.state.sliceDoc(node.from, node.to);
      const v0 = parseFloat(text); if (Number.isNaN(v0)) return false;
      const dec = (text.split('.')[1] || '').length;
      const step = dec ? Math.pow(10, -dec) : 1;
      const x0 = e.clientX;
      document.body.classList.add('scrubbing');
      const badge = document.createElement('div'); badge.className = 'scrub-badge'; document.body.appendChild(badge);
      const move = (ev) => {
        const px = ev.clientX - x0;
        const mult = ev.shiftKey ? 10 : 1;
        let v = v0 + Math.round(px / (dec ? 3 : 4)) * step * mult;
        if (v0 >= 0 && !dec && v < 0) v = 0;
        const s = dec ? v.toFixed(dec) : String(Math.round(v));
        view.dispatch({ changes: { from, to: from + len, insert: s }, userEvent: 'input.scrub' });
        len = s.length;
        badge.textContent = `${s}`; badge.style.left = `${ev.clientX + 12}px`; badge.style.top = `${ev.clientY - 30}px`;
        getOnScrub()?.();
      };
      const up = () => { document.body.classList.remove('scrubbing'); badge.remove(); removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
      return true;
    },
  });
}

// ---------------------------------------------------------------- token hover cards
function tokenTooltip(getExplain) {
  return hoverTooltip((view, pos, side) => {
    const node = syntaxTree(view.state).resolveInner(pos, side);
    if (/String|Comment|Number/.test(node.name)) return null;
    const w = view.state.wordAt(pos);
    if (!w) return null;
    const word = view.state.sliceDoc(w.from, w.to);
    if (!/^[A-Za-z_$][\w$]*$/.test(word) || word.length > 40) return null;
    const line = view.state.doc.lineAt(pos);
    const isMember = view.state.sliceDoc(w.from - 1, w.from) === '.';
    return {
      pos: w.from, end: w.to, above: true,
      create() {
        const dom = document.createElement('div'); dom.className = 'tok-card';
        const fill = (info) => {
          if (!info) { dom.innerHTML = ''; dom.classList.add('empty'); return; }
          dom.innerHTML = '';
          const head = el('div', 'tok-head'); head.append(el('span', 'tok-word', info.title || word), el('span', 'tok-kind', info.t || ''));
          dom.append(head);
          if (info.w) dom.append(el('div', 'tok-what', info.w));
          if (info.p) { const p = el('div', 'tok-plain'); p.append(el('span', 'tok-plain-k', 'here'), el('span', '', info.p)); dom.append(p); }
          if (info.ex) dom.append(el('pre', 'tok-ex', info.ex));
          if (info.line) { const j = el('button', 'tok-jump', `Jump to line ${info.line} ↵`); j.onclick = () => { const l = view.state.doc.line(info.line); view.dispatch({ selection: { anchor: l.from }, scrollIntoView: true }); view.focus(); }; dom.append(j); }
        };
        const r = getExplain()?.(word, line.text, { isMember, lineNo: line.number, doc: view.state.doc.toString() });
        if (r && typeof r.then === 'function') {
          dom.classList.add('loading'); dom.append(el('div', 'tok-head', ''), el('div', 'shimmer', ''), el('div', 'shimmer short', ''));
          dom.firstChild.append(el('span', 'tok-word', word), el('span', 'tok-kind', 'asking…'));
          r.then((info) => { dom.classList.remove('loading'); fill(info); }).catch(() => fill(null));
        } else fill(r);
        return { dom };
      },
    };
  }, { hoverTime: 240 });
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

const langExt = (lang) => (lang === 'python' ? python() : lang === 'html' ? html() : lang === 'css' ? css() : lang === 'sql' ? sql({ dialect: SQLite, upperCaseKeywords: true }) : javascript({ jsx: true, typescript: lang === 'typescript' }));

// ---------------------------------------------------------------- component
const Editor = forwardRef(function Editor(props, ref) {
  const { value, lang, readOnly, onChange, marks, lens = 'code', english, notes = [], onLineHover, hoverLine, onEnglishHover } = props;
  const host = useRef(null), wrap = useRef(null);
  const view = useRef(null);
  const cb = useRef(props); cb.current = props;
  const langC = useRef(new Compartment()), roC = useRef(new Compartment());
  const [geo, setGeo] = useState({ tops: [], lh: 22, off: 0 });
  const [openNote, setOpenNote] = useState(null);

  useImperativeHandle(ref, () => ({
    view: () => view.current,
    scrollToLine(n) { const v = view.current; if (!v || n < 1 || n > v.state.doc.lines) return; const l = v.state.doc.line(n); v.dispatch({ effects: EditorView.scrollIntoView(l.from, { y: 'center' }) }); },
    focus() { view.current?.focus(); },
    setCursorLine(n) { const v = view.current; if (!v) return; const l = v.state.doc.line(Math.min(Math.max(1, n), v.state.doc.lines)); v.dispatch({ selection: { anchor: l.to }, scrollIntoView: true }); v.focus(); },
  }));

  useEffect(() => {
    const measureSoon = () => requestAnimationFrame(measure);
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value || '',
        extensions: [
          lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), history(), indentOnInput(), bracketMatching(), closeBrackets(),
          indentUnit.of(lang === 'python' ? '    ' : '  '), EditorState.tabSize.of(4),
          syntaxHighlighting(hl), theme, marksField, marksDeco, numberPlugin,
          EditorView.contentAttributes.of({ 'aria-label': props.label || (readOnly ? `${lang} code (read only)` : `${lang} code editor. Press Escape, then Tab, to leave it.`) }),
          scrubHandler(() => cb.current.onScrub), tokenTooltip(() => cb.current.explain),
          langC.current.of(langExt(lang)), roC.current.of(EditorState.readOnly.of(!!readOnly)),
          keymap.of([
            { key: 'Mod-Enter', run: () => { cb.current.onRun?.(); return true; } },
            { key: 'Shift-Mod-Enter', run: () => { cb.current.onStep?.(); return true; } },
            ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation?.(extAnno))) cb.current.onChange?.(u.state.doc.toString(), u.transactions.some((tr) => tr.isUserEvent('input.scrub')));
            if (u.docChanged || u.geometryChanged || u.viewportChanged) measureSoon();
          }),
        ],
      }),
    });
    view.current = v;
    v.scrollDOM.addEventListener('scroll', measureSoon, { passive: true });
    const onMove = (e) => { const p = v.posAtCoords({ x: e.clientX, y: e.clientY }); cb.current.onLineHover?.(p == null ? null : v.state.doc.lineAt(p).number); };
    const onLeave = () => cb.current.onLineHover?.(null);
    v.contentDOM.addEventListener('mousemove', onMove); v.contentDOM.addEventListener('mouseleave', onLeave);
    const ro = new ResizeObserver(measureSoon); ro.observe(host.current);
    measureSoon();
    return () => { ro.disconnect(); v.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function measure() {
    const v = view.current; if (!v || !wrap.current) return;
    const off = v.documentTop - wrap.current.getBoundingClientRect().top;
    const tops = []; const doc = v.state.doc;
    for (let i = 1; i <= doc.lines; i++) tops.push(v.lineBlockAt(doc.line(i).from).top);
    setGeo({ tops, lh: v.defaultLineHeight, off });
  }

  // external value changes (lesson switch, try-chips, steps)
  useEffect(() => {
    const v = view.current; if (!v) return;
    const cur = v.state.doc.toString();
    if (value != null && value !== cur) v.dispatch({ changes: { from: 0, to: cur.length, insert: value }, annotations: extAnno.of(true) });
  }, [value]);
  useEffect(() => { view.current?.dispatch({ effects: langC.current.reconfigure(langExt(lang)) }); }, [lang]);
  useEffect(() => { view.current?.dispatch({ effects: roC.current.reconfigure(EditorState.readOnly.of(!!readOnly)) }); }, [readOnly]);
  useEffect(() => { view.current?.dispatch({ effects: setMarks.of(marks || {}) }); }, [marks]);
  useLayoutEffect(() => { requestAnimationFrame(measure); }, [lens]);

  const lineY = (i) => geo.off + (geo.tops[i - 1] ?? (i - 1) * geo.lh);
  const showEnglish = lens === 'both';

  return (
    <div className={`ed-wrap lens-${lens}`} ref={wrap}>
      <div className="ed-code" ref={host} />
      {lens !== 'english' && notes.length > 0 && (
        <div className="ed-notes" style={{ right: showEnglish ? 'calc(42% + 10px)' : 10 }}>
          {notes.map((n, i) => (
            <div key={i} className={`note-pin ${openNote === i ? 'open' : ''} c${i % 4}`} style={{ top: lineY(n.from) + 2 }}
              onMouseEnter={() => { setOpenNote(i); cb.current.onNoteHover?.([n.from, n.to || n.from]); }}
              onMouseLeave={() => { setOpenNote(null); cb.current.onNoteHover?.(null); }}>
              <span className="note-dot" /><span className="note-label">{n.label}</span>
              {openNote === i && <div className="note-text">{n.text}</div>}
            </div>
          ))}
        </div>
      )}
      {showEnglish && (
        <div className="ed-english">
          {(english || []).map((s, i) => (
            <div key={i} className={`en-line ${s === null ? 'pending' : ''} ${hoverLine === i + 1 ? 'hot' : ''} ${marks?.step === i + 1 ? 'step' : ''} ${marks?.link && i + 1 >= marks.link[0] && i + 1 <= marks.link[1] ? 'linked' : ''}`}
              style={{ top: lineY(i + 1), height: geo.lh }}
              onMouseEnter={() => onEnglishHover?.(i + 1)} onMouseLeave={() => onEnglishHover?.(null)}
              onClick={() => cb.current.onEnglishClick?.(i + 1)}>
              {s === null ? <span className="en-shimmer" /> : s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
import { Annotation } from '@codemirror/state';
const extAnno = Annotation.define();
export default Editor;
