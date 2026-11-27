// Checking what you learned inside a lesson: a quiz block, an optional quick check after a chat answer, the note
// that says the lesson's facts were checked (and what was corrected), and explaining the lesson back in your own words.
import { useState } from 'react';
import { t } from '../../i18n.js';
import Md from '../Md.jsx';
import { haptic } from '../touch.js';

export function Quiz({ block, onAnswer }) {
  const [pick, setPick] = useState(null);
  const ok = pick === block.answer;
  return (
    <div className="quiz">
      <div className="quiz-q">
        <span className="quiz-k">quick check</span>
        {block.q}
      </div>
      <div className="quiz-choices">
        {(block.choices || []).map((choice, i) => (
          <button
            key={i}
            disabled={pick != null}
            className={`choice ${pick != null && i === block.answer ? 'right' : ''} ${pick === i && !ok ? 'wrong' : ''}`}
            onClick={() => {
              setPick(i);
              haptic(i === block.answer ? 'success' : 'warn');
              onAnswer?.(i === block.answer);
            }}
          >
            {choice}
          </button>
        ))}
      </div>
      {pick != null && (
        <div className={`quiz-why ${ok ? 'ok' : ''}`}>
          <b>{ok ? 'Yes!' : 'Not quite.'}</b> {block.why}
          {!ok && (
            <button className="link" onClick={() => setPick(null)}>
              try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// "Check yourself": one optional question after an answer. Getting it right lights your map; it's never required.
export function QuickCheck({ check, onDone }) {
  const [pick, setPick] = useState(null);
  const ok = pick === check.answer;
  return (
    <div className={`qcheck ${pick == null ? '' : ok ? 'ok' : 'no'}`}>
      <div className="qc-h">
        <span>{t('Check yourself')}</span>
        {pick == null && <i>{t('optional')}</i>}
      </div>
      <div className="qc-q">{check.q}</div>
      <div className="qc-row">
        {check.choices.map((x, k) => (
          <button
            key={k}
            disabled={pick != null}
            className={pick == null ? '' : k === check.answer ? 'right' : k === pick ? 'wrong' : ''}
            onClick={() => {
              setPick(k);
              haptic(k === check.answer ? 'success' : 'warn');
              onDone?.(k === check.answer);
            }}
          >
            {x}
          </button>
        ))}
      </div>
      {pick != null && (
        <div className="qc-why">
          {ok ? '✓ ' : ''}
          {check.why}
        </div>
      )}
    </div>
  );
}

// "Find this in real code": the same idea, in projects people actually use
// Teach it back: the learner explains the idea in their own words; the tutor says what landed and what's missing.
export function TeachBack({ lesson, onTeachBack }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const teach = lesson.teach;
  const go = async () => {
    if (text.trim().length < 12 || busy) return;
    setBusy(true);
    try {
      await onTeachBack(lesson, text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="teach fade-in">
      {lesson.puzzle ? (
        <div className="teach-h">
          <span className="teach-i">🎤</span>
          <div>
            <b>{t('Talk me through it')}</b>
            <span>
              Like in a real interview: explain your approach and how fast it is. Your AI plays the
              interviewer.
            </span>
          </div>
        </div>
      ) : (
        <div className="teach-h">
          <span className="teach-i">🗣</span>
          <div>
            <b>{t('Explain it back')}</b>
            <span>
              The fastest way to know you understand: say it in your own words, like you’re telling
              a friend.
            </span>
          </div>
        </div>
      )}
      {teach && !busy && (
        <div className="teach-r">
          <div className="teach-meter">
            {[0, 1, 2].map((k) => (
              <i key={k} className={k < teach.score ? 'on' : ''} />
            ))}
            <em>
              {['Not yet', 'Getting there', 'Nearly there', 'You’ve got it'][teach.score] || ''}
            </em>
          </div>
          <blockquote>“{teach.said}”</blockquote>
          {teach.got?.length > 0 && (
            <div className="teach-row ok">
              <b>✓ You got</b>
              {teach.got.map((x, i) => (
                <span key={i}>
                  <Md text={x} />
                </span>
              ))}
            </div>
          )}
          {teach.missing?.length > 0 && (
            <div className="teach-row miss">
              <b>+ Add</b>
              {teach.missing.map((x, i) => (
                <span key={i}>
                  <Md text={x} />
                </span>
              ))}
            </div>
          )}
          {teach.next && (
            <div className="teach-row tnext">
              <b>→ Try this</b>
              <span>
                <Md text={teach.next} />
              </span>
            </div>
          )}
        </div>
      )}
      <div className="teach-box">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          placeholder={
            teach
              ? 'Try again with what you just learned…'
              : lesson.puzzle
                ? 'My idea is… It works because… It takes O(…) time because…'
                : `In my own words, ${(lesson.title || 'this')
                    .replace(/[.?!]$/, '')
                    .toLowerCase()
                    .slice(0, 60)} is…`
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go();
          }}
        />
        <button className="btn" disabled={busy || text.trim().length < 12} onClick={go}>
          {busy ? t('Reading…') : t('Check me')}
        </button>
      </div>
    </div>
  );
}

// "✓ Checked": the lesson was compared with what its code really did; corrections are listed, never hidden
export function Checked({ check }) {
  const [open, setOpen] = useState(false);
  const count = (check.corrections || []).length + (check.local || []).length;
  return (
    <span className={`checked ${count ? 'fixed' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        title={
          check.by
            ? 'Bento ran the code and checked the quiz answers and claims against what it really printed'
            : 'Bento ran the code and checked the lesson’s links and quizzes'
        }
      >
        ✓ {t('Checked')}
        {count ? ` · ${count} ${count === 1 ? t('fix') : t('fixes')}` : ''}
      </button>
      {open && (
        <span className="checked-pop" role="dialog" aria-label={t('What Bento checked')}>
          <b>{t('What Bento checked')}</b>
          <span>✓ {t('The code runs without errors.')}</span>
          {check.by ? (
            <span>✓ {t('Quiz answers and claims compared with the real output.')}</span>
          ) : (
            <span className="muted">
              {t('Connect an AI to also check quiz answers against the output.')}
            </span>
          )}
          {(check.corrections || []).map((x, i) => (
            <span key={i} className="cp-fix">
              {x.kind === 'quiz' ? (
                <>
                  {t('Quiz answer corrected')}: <s>{x.was}</s> → <b>{x.now}</b>
                </>
              ) : (
                <>
                  {t('Corrected')}: <s>{x.was}</s> → {x.now}
                </>
              )}
            </span>
          ))}
          {(check.local || []).map((x, i) => (
            <span key={`l${i}`} className="cp-fix">
              {t('Tidied')}: {t(x)}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
