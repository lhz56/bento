// What a lesson's code does, under the editor: what it printed and drew, a guess before you run it, stepping through
// it line by line (with a movie of lists and pointers), how its time grows as the input gets bigger, and help when
// you keep hitting the same error. Each of those lives in src/ui/stage/; this file switches between them.
import { useState, useEffect } from 'react';
import { t } from '../i18n.js';
import { announce } from './a11y.js';
import { Growth } from './stage/Growth.jsx';
import { Predict, Output } from './stage/Output.jsx';
import { Steps } from './stage/Steps.jsx';
import { Tests } from './stage/Tests.jsx';

const TAB_TIPS = {
  output: 'What the code printed and drew',
  steps: 'Replay the program one line at a time, with every value',
  growth: 'How much more work the code does as its input grows (Big-O)',
  tests: 'Checks that say whether the code does what it should',
};

export default function Stage(props) {
  const { tab, setTab, lesson } = props;
  // Predict, then run: guess the output first, then see how close you were.
  const [pred, setPred] = useState(null); // { phase: 'ask' | 'wait' | 'done', guess, result }
  useEffect(() => setPred(null), [lesson?.id]);
  useEffect(() => {
    if (pred?.phase === 'wait' && props.result && props.result !== pred.before)
      setPred((x) => ({ ...x, phase: 'done', result: props.result }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a guess is settled when a new result comes in
  }, [props.result]);
  // screen readers hear how each run ended, without losing their place in the code
  useEffect(() => {
    const result = props.result;
    if (!result || props.running) return;
    if (result.error)
      announce(
        `${t('Your code stopped')}${result.error.line ? ` ${t('on line')} ${result.error.line}` : ''}: ${result.error.msg}`,
      );
    else if (!result.need) {
      const n = (result.logs || []).filter((l) => l.k !== 'in').length;
      const v = (result.visuals || []).length;
      announce(
        `${t('Ran')}. ${n} ${n === 1 ? t('line printed') : t('lines printed')}${v ? `, ${v} ${v === 1 ? t('picture') : t('pictures')}` : ''}.`,
      );
    }
  }, [props.result, props.running]);
  const tabs = [
    ['output', 'Output'],
    ['steps', 'Steps'],
    ['growth', 'Growth'],
    ...(lesson?.tests ? [['tests', 'Tests']] : []),
  ];
  return (
    <div className="stage">
      <div className="stage-tabs">
        {tabs.map(([tabId, label]) => (
          <button
            key={tabId}
            className={`stab ${tab === tabId ? 'on' : ''}`}
            onClick={() => setTab(tabId)}
            title={t(TAB_TIPS[tabId])}
          >
            {t(label)}
            {tabId === 'tests' && props.tests && (
              <span className={`stab-dot ${props.tests.every((r) => r.ok) ? 'ok' : 'bad'}`} />
            )}
            {tabId === 'output' && props.result?.error && <span className="stab-dot bad" />}
          </button>
        ))}
        {props.onWhyDiff && (
          <button
            className={`stab predict ${pred ? 'on' : ''}`}
            title="Guess what the code will print before you run it"
            onClick={() => {
              setTab('output');
              setPred(pred ? null : { phase: 'ask', guess: '' });
            }}
          >
            {t('🔮 Predict')}
          </button>
        )}
        <div className="stage-meta">
          {props.running ? (
            <span className="runpulse">running</span>
          ) : props.result?.ms != null && tab === 'output' ? (
            `${props.result.ms < 1 ? '<1' : Math.round(props.result.ms)} ms`
          ) : (
            ''
          )}
        </div>
      </div>
      <div className="stage-body" tabIndex={0} role="region" aria-label={t('What your code did')}>
        {tab === 'output' && pred && (
          <Predict
            pred={pred}
            setPred={setPred}
            run={() => {
              setPred((x) => ({ ...x, phase: 'wait', before: props.result }));
              props.onRun();
            }}
            onWhyDiff={props.onWhyDiff}
          />
        )}
        {tab === 'output' && (!pred || pred.phase === 'done') && <Output {...props} />}
        {tab === 'steps' && <Steps {...props} />}
        {tab === 'growth' && <Growth {...props} />}
        {tab === 'tests' && <Tests {...props} />}
      </div>
    </div>
  );
}
