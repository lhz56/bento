// A lesson's tests: each case, what came back, and whether it passed.
import { t } from '../../i18n.js';

export function Tests({ lesson, tests, onRunTests, testing }) {
  const cases = lesson.tests.cases || [];
  const allOk = tests && tests.length && tests.every((r) => r.ok);
  const fmtArgs = (a) => a.map((x) => JSON.stringify(x)).join(', ');
  return (
    <div className={`tests ${allOk ? 'win' : ''}`}>
      <div className="tests-head">
        <div className="col-h" role="status">
          {allOk
            ? 'All green 🎉'
            : tests
              ? `${tests.filter((r) => r.ok).length} of ${cases.length} passing`
              : `${cases.length} tests`}
        </div>
        <button className="btn" onClick={onRunTests} disabled={testing}>
          {testing ? t('Running…') : t('Run tests')}
        </button>
      </div>
      {cases.map((testCase, i) => {
        const r = tests?.[i];
        return (
          <div key={i} className={`test ${r ? (r.ok ? 'ok' : 'bad') : ''}`}>
            <span className="lamp" aria-hidden="true" />
            <span className="mono">
              {lesson.tests.fn}({fmtArgs(testCase.args)})
            </span>
            <span className="muted">→ {JSON.stringify(testCase.expect)}</span>
            {r && !r.ok && <span className="got">got {r.got}</span>}
          </div>
        );
      })}
      {allOk && (
        <div className="confetti">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </div>
      )}
    </div>
  );
}
