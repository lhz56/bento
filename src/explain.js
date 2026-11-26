import { lookup } from './dict.js';
import { quickPrompts, parseJSONLoose } from './lesson.js';

const cache = new Map();
const esc = (s) => s.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

function findDef(word, lang, lines) {
  const w = esc(word);
  const rxs =
    lang === 'python'
      ? [
          new RegExp(`^\\s*(def|class)\\s+${w}\\b`),
          new RegExp(`^\\s*(for\\s+)?${w}(\\s*,\\s*\\w+)*\\s*(=(?!=)|in\\b)`),
          new RegExp(`^\\s*def\\s+\\w+\\s*\\([^)]*\\b${w}\\b`),
          new RegExp(`^\\s*for\\s+.*\\b${w}\\b.*\\bin\\b`),
        ]
      : [
          new RegExp(`\\b(function|class)\\s+${w}\\b`),
          new RegExp(`\\b(const|let|var)\\s+(\\[[^\\]]*\\b${w}\\b|\\{[^}]*\\b${w}\\b|${w}\\b)`),
          new RegExp(`function\\s*\\w*\\s*\\([^)]*\\b${w}\\b`),
          new RegExp(`\\(([^)]*\\b${w}\\b[^)]*)\\)\\s*=>`),
          new RegExp(`\\b${w}\\s*=>`),
        ];
  for (const rx of rxs) {
    const i = lines.findIndex((l) => rx.test(l));
    if (i >= 0) return i + 1;
  }
  return null;
}

// Returns info synchronously when we can (instant), else a Promise from the model.
export function explainToken({
  word,
  lineText = '',
  lineNo,
  lang,
  doc = '',
  english = [],
  model,
  quick,
  isMember,
}) {
  const d =
    !isMember ||
    /^(append|add|get|split|join|push|pop|map|filter|reduce|forEach|length|includes|slice|log|cos|sin|random|floor)$/.test(
      word,
    )
      ? lookup(word, lang)
      : null;
  if (d) return { ...d };
  const lines = doc.split('\n');
  if (!isMember) {
    const def = findDef(word, lang, lines);
    if (def) {
      const same = def === lineNo;
      return {
        title: word,
        t: 'yours',
        w: same ? `This line creates ${word}.` : `Defined in your code on line ${def}.`,
        p: english[def - 1] || '',
        ex: lines[def - 1]?.trim() || '',
        line: same ? null : def,
      };
    }
  }
  if (!quick) return null;
  const key = `${lang}|${word}|${lineText.trim()}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      quick(
        model,
        quickPrompts.token({
          word,
          line: lineText.trim(),
          lang: lang === 'python' ? 'Python' : lang === 'typescript' ? 'TypeScript' : 'JavaScript',
          kind: isMember ? 'method/property' : 'name',
        }),
      )
        .then((s) => {
          const j = parseJSONLoose(s);
          if (!j) throw new Error('bad');
          return {
            title: j.title || word,
            t: isMember ? 'method' : 'name',
            w: j.what,
            p: j.plain,
            ex: j.example,
          };
        })
        .catch((e) => {
          cache.delete(key);
          throw e;
        }),
    );
  }
  return cache.get(key);
}
