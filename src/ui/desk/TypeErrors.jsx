// TypeScript's type errors in the code: each one jumps to its line, and your AI can say what it means in plain words.
import { parseJSONLoose, quickPrompts } from '../../lesson.js';

export default function TypeErrors({ code, ed, model, quick, setTypeEx, typeErrs, typeEx }) {
  return (
    <div className="typebar">
      <span className="tb-k">
        TypeScript found {typeErrs.length === 1 ? 'a problem' : `${typeErrs.length} problems`}
      </span>
      {typeErrs.map((typeError, i) => (
        <div key={i} className="tb-row">
          <button onClick={() => ed.current?.setCursorLine(typeError.line)}>
            <b>line {typeError.line}</b> {typeError.msg}
          </button>
          <button
            className="tb-ex"
            onClick={async () => {
              setTypeEx((m) => ({ ...m, [typeError.msg]: '…' }));
              try {
                const j = parseJSONLoose(
                  await quick(
                    model,
                    quickPrompts.error({
                      code,
                      err: `TypeScript type error: ${typeError.msg} (line ${typeError.line})`,
                      lang: 'TypeScript',
                    }),
                  ),
                );
                setTypeEx((m) => ({
                  ...m,
                  [typeError.msg]: j
                    ? `${j.plain}${j.fix ? ` Fix: ${j.fix}` : ''}`
                    : 'Couldn’t explain this one.',
                }));
              } catch {
                setTypeEx((m) => ({ ...m, [typeError.msg]: 'The model didn’t answer.' }));
              }
            }}
          >
            explain
          </button>
          {typeEx[typeError.msg] && <div className="tb-plain">{typeEx[typeError.msg]}</div>}
        </div>
      ))}
      <span className="tb-note">
        The code still runs (types vanish when it runs), but TypeScript is warning you before it
        breaks.
      </span>
    </div>
  );
}
