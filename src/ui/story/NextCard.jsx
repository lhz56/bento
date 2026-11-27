// The end of a lesson: what to try, ask or learn next, and the same idea found in real open-source code (Wild).
import { useState, useEffect } from 'react';
import { t } from '../../i18n.js';
import { TeachBack } from './Checks.jsx';

// Everything that comes after a lesson, in one place: play with it, go further, prove it
export function NextCard({ lesson, storyProps }) {
  const tries = lesson.story.filter((b) => b.t === 'try').flatMap((b) => b.items || []);
  const nexts = lesson.story.filter((b) => b.t === 'next').flatMap((b) => b.items || []);
  const [open, setOpen] = useState(lesson.teach ? 'teach' : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- opening a lesson shows its explain-it-back card if it has one; later changes don't reopen it
  useEffect(() => setOpen(lesson.teach ? 'teach' : null), [lesson.id]);
  const depth = !lesson.scratch && lesson.mode !== 'challenge' && storyProps.onDepth;
  const practice =
    storyProps.onPractice &&
    !lesson.scratch &&
    lesson.mode !== 'challenge' &&
    lesson.mode !== 'compare' &&
    lesson.lang !== 'html';
  const teach = storyProps.onTeachBack && !lesson.scratch && lesson.mode !== 'challenge';
  const wild =
    storyProps.onWild && (lesson.mode === 'explain' || lesson.race || lesson.mode === 'idea');
  const prove = practice || teach || wild;
  if (!tries.length && !nexts.length && !depth && !prove) return null;
  return (
    <>
      <section className="whatnext fade-in" aria-label={t('What next?')}>
        <header className="wn-top">
          <b>{t('What next?')}</b>
          {depth && (
            <span className="wn-depth" role="group" aria-label={t('Explain it again')}>
              <button
                onClick={() => storyProps.onDepth('simpler')}
                title={t('The same idea, simpler, with an everyday example')}
              >
                ↓ {t('Simpler')}
              </button>
              <button
                onClick={() => storyProps.onDepth('deeper')}
                title={t('What’s really happening underneath, and the trade-offs')}
              >
                ↑ {t('Deeper')}
              </button>
            </span>
          )}
        </header>
        {tries.length > 0 && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic play" aria-hidden="true">
                🧪
              </i>
              <span>
                <b>{t('Play with it')}</b>
                <em>{t('Bento changes the code and runs it')}</em>
              </span>
            </div>
            <div className="wn-list">
              {tries.map((x, j) => (
                <button key={j} className="wn-card" onClick={() => storyProps.onTry(x)}>
                  <span className="wn-t">{x}</span>
                  <span className="wn-go play">▶ {t('try')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {nexts.length > 0 && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic next" aria-hidden="true">
                🔭
              </i>
              <span>
                <b>{t('Go further')}</b>
                <em>{t('Each one opens a new lesson')}</em>
              </span>
            </div>
            <div className="wn-list">
              {nexts.map((x, j) => (
                <button key={j} className="wn-card" onClick={() => storyProps.onNext(x)}>
                  <span className="wn-t">{x}</span>
                  <span className="wn-go">+ {t('lesson')} →</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {prove && (
          <div className="wn-group">
            <div className="wn-h">
              <i className="wn-ic prove" aria-hidden="true">
                🎯
              </i>
              <span>
                <b>{t('Prove it')}</b>
                <em>{t('Lights up your map')}</em>
              </span>
            </div>
            <div className="wn-prove">
              {practice && (
                <button className="wn-big" onClick={() => storyProps.onPractice(lesson)}>
                  <span className="wn-bi" aria-hidden="true">
                    🎯
                  </span>
                  <b>{t('Practice')}</b>
                  <em>{t('a short challenge on this')}</em>
                </button>
              )}
              {teach && (
                <button
                  className={`wn-big ${open === 'teach' ? 'on' : ''}`}
                  aria-expanded={open === 'teach'}
                  onClick={() => setOpen(open === 'teach' ? null : 'teach')}
                >
                  <span className="wn-bi" aria-hidden="true">
                    🗣
                  </span>
                  <b>{t('Explain it back')}</b>
                  <em>{t('in your own words')}</em>
                </button>
              )}
              {wild && (
                <button
                  className={`wn-big ${open === 'wild' ? 'on' : ''}`}
                  aria-expanded={open === 'wild'}
                  onClick={() => setOpen(open === 'wild' ? null : 'wild')}
                >
                  <span className="wn-bi" aria-hidden="true">
                    ◈
                  </span>
                  <b>{t('Real code')}</b>
                  <em>{t('find it in open source')}</em>
                </button>
              )}
            </div>
          </div>
        )}
      </section>
      {open === 'teach' && teach && (
        <TeachBack lesson={lesson} onTeachBack={storyProps.onTeachBack} />
      )}
      {open === 'wild' && wild && (
        <Wild lesson={lesson} onWild={storyProps.onWild} onOpenAt={storyProps.onOpenAt} auto />
      )}
    </>
  );
}

function Wild({ lesson, onWild, onOpenAt, auto }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    setSt(null);
    if (auto) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new lesson clears the last answer, and asks again if it asks by itself
  }, [lesson.id]);
  const go = async () => {
    setSt({ loading: true });
    try {
      setSt({ rows: await onWild(lesson) });
    } catch (e) {
      setSt({
        err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      });
    }
  };
  return (
    <div className="wild fade-in">
      {!st && (
        <button className="wild-go" onClick={go}>
          <span className="wild-ic">◈</span>
          <span>
            <b>Find this in real code</b>
            <i>Search GitHub for projects that use it, then open one to see where it lives.</i>
          </span>
          <span className="wild-arrow">→</span>
        </button>
      )}
      {st?.loading && (
        <div className="writing">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          Searching GitHub…
        </div>
      )}
      {st?.err && <div className="story-err">{st.err}</div>}
      {st?.rows && (
        <>
          <div className="mini-h">in the wild</div>
          {st.rows.length === 0 && (
            <div className="muted small">Nothing found. Try a follow-up question instead.</div>
          )}
          {st.rows.map((row) => (
            <button
              key={row.repo + row.path}
              className="wild-row"
              onClick={() => onOpenAt(row.repo, row.path)}
            >
              <div className="wr-top">
                <b>{row.repo}</b>
                <span>{row.path}</span>
                <em>open in Atlas →</em>
              </div>
              <pre>{row.fragment}</pre>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
