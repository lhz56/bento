import { useState } from 'react';
import { Detective } from './Detective.jsx';

// Studying a project: ways to learn from it, from a guided read to building a mini version.

export function Study({
  facts,
  readFile,
  onOpen,
  atlas,
  narration,
  onAsk,
  onFeature,
  narrating,
  tour = [],
  onTour,
}) {
  const [feat, setFeat] = useState('');
  const qs = narration?.learn?.length
    ? narration.learn
    : [
        'Where does this app start?',
        'How does data flow through it?',
        'Which file should I read first?',
      ];
  return (
    <section className="asec" id="sec-study">
      <div className="sec-head">
        <div>
          <div className="kicker">study it</div>
          <h2>Go deeper</h2>
          <p className="sec-sub">
            Each question opens a lesson built on the real files, with the code on the right.
          </p>
        </div>
      </div>
      {tour.length > 0 && (
        <div className="tour">
          <div className="tour-h">
            <span className="mini-h">read it in this order</span>
            <button className="btn" onClick={() => onTour(0)}>
              Start the tour →
            </button>
          </div>
          <ol>
            {tour.map((t, i) => (
              <li key={t.p}>
                <button onClick={() => onTour(i)}>
                  <span className="tour-n">{i + 1}</span>
                  <span className="tour-p">{t.p}</span>
                  <span className="tour-w">{t.why}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!narrating && readFile && (
        <Detective facts={facts} narration={narration} readFile={readFile} onOpen={onOpen} />
      )}
      <div className="study">
        <div className="nexts">
          {qs.map((q, i) => (
            <button key={i} className="next" onClick={() => onAsk(q)}>
              {q}
              <span>→</span>
            </button>
          ))}
          {narrating && !narration?.learn?.length && (
            <div className="muted small" style={{ marginTop: 8 }}>
              Better questions arrive when the reading is done.
            </div>
          )}
        </div>
        <form
          className="cv-feature"
          onSubmit={(e) => {
            e.preventDefault();
            if (feat.trim()) {
              onFeature(feat.trim());
              setFeat('');
            }
          }}
        >
          <span className="cv-fi">⌁</span>
          <input
            value={feat}
            onChange={(e) => setFeat(e.target.value)}
            placeholder={`Build a feature in ${atlas.name.split('/').pop()}: “add a dark mode toggle”…`}
          />
          <button className="btn" disabled={!feat.trim()}>
            Show me how
          </button>
        </form>
      </div>
    </section>
  );
}
