// What to learn from a project, on a phone.
import { useState } from 'react';
import { Head, I, Group, FileRow, Chev } from './kit.jsx';

// ---------------------------------------------------------------- learning from it
export function Learn({
  name,
  narration,
  tour,
  onTour,
  onAsk,
  onFeature,
  onMakePath,
  onBuild,
  narrating,
  detective,
}) {
  const [feat, setFeat] = useState('');
  const [path, setPath] = useState(null);
  const qs = narration?.learn?.length
    ? narration.learn
    : [
        'Where does this app start?',
        'How does data flow through it?',
        'Which file should I read first?',
      ];
  const build = narration?.build;
  return (
    <section className="asec" id="sec-study">
      <Head
        title="Learn from it"
        sub="Read it in a sensible order, turn a question into a lesson, or build a small one yourself."
      />
      {build && (
        <div className="bd-card">
          <div className="bd-top">
            <span className="ph-ic xl" style={{ '--c': 'var(--accent)' }}>
              <I n="hammer" s={26} />
            </span>
            <div>
              <span>To build something like it</span>
              <b>{build.time || 'a while'}</b>
              <i>for a beginner</i>
            </div>
          </div>
          {build.skills?.length > 0 && (
            <ol className="bd-skills">
              {build.skills.map((s, i) => (
                <li key={i}>
                  <i>{i + 1}</i>
                  {s}
                </li>
              ))}
            </ol>
          )}
          {build.mini && onBuild && (
            <>
              <p className="bd-mini">{build.mini}</p>
              <button className="ps-btn" onClick={() => onBuild(build.mini)}>
                Build a mini version with me
              </button>
            </>
          )}
          {onMakePath && build.skills?.length > 0 && (
            <button
              className="ps-btn tinted"
              disabled={path === 'busy'}
              onClick={async () => {
                setPath('busy');
                try {
                  await onMakePath(
                    `be able to build something like ${name}. It takes: ${build.skills.join(', ')}. ${build.mini ? `A first small version: ${build.mini}` : ''}`,
                  );
                  setPath(null);
                } catch (e) {
                  setPath(String(e.message || e));
                }
              }}
            >
              {path === 'busy' ? 'Designing your path…' : 'Make these my learning path'}
            </button>
          )}
          {path && path !== 'busy' && <p className="bd-mini">{path}</p>}
        </div>
      )}
      {tour.length > 0 && (
        <Group
          title="Read it in this order"
          action={
            <button className="ph-gh-btn" onClick={() => onTour(0)}>
              Start
            </button>
          }
        >
          {tour.map((t, i) => (
            <FileRow
              key={t.p}
              file={{ p: t.p }}
              number={i + 1}
              sub={t.why}
              onOpen={() => onTour(i)}
            />
          ))}
        </Group>
      )}
      <Group
        title="Questions to explore"
        foot={
          narrating && !narration?.learn?.length
            ? 'Better questions arrive when the reading is done.'
            : 'Each one opens a lesson built on the real files.'
        }
      >
        {qs.map((q, i) => (
          <button key={i} className="ph-cell" onClick={() => onAsk(q)}>
            <span className="ph-ic round sm" style={{ '--c': 'var(--violet)' }}>
              <I n="spark" s={14} w={2.2} />
            </span>
            <span className="ph-ct">
              <b className="reg">{q}</b>
            </span>
            <Chev />
          </button>
        ))}
      </Group>
      {detective}
      <form
        className="ph-feature"
        onSubmit={(e) => {
          e.preventDefault();
          if (feat.trim()) {
            onFeature(feat.trim());
            setFeat('');
          }
        }}
      >
        <div className="ph-gh">
          <span>Add a feature to {name}</span>
        </div>
        <div className="ph-ff">
          <input
            value={feat}
            onChange={(e) => setFeat(e.target.value)}
            placeholder="A dark mode switch…"
            enterKeyHint="go"
            aria-label={`A feature to add to ${name}`}
          />
          <button className="ps-btn" disabled={!feat.trim()}>
            Show me how
          </button>
        </div>
      </form>
    </section>
  );
}
