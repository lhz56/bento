// Clever ideas: the tricks behind famous software, one card each, with today's pick on top and races (the same job
// done two ways, timed). Most ship already written, so they open at once with no AI.
import { useState } from 'react';
import { t, tx } from '../i18n.js';
import { IDEAS, THEMES } from '../ideas.js';
import Brand from './Brand.jsx';
import { IdeaArt } from './IdeaArt.jsx';

export default function Ideas({
  onRead,
  readIds = {},
  races = [],
  onRace,
  instant = {},
  extra = [],
}) {
  const [theme, setTheme] = useState('all');
  const list = [...IDEAS, ...extra].filter((i) => theme === 'all' || i.theme === theme);
  // today's pick: something you haven't read yet, changing each day
  const unread = list.filter((i) => !readIds[i.id]);
  const day = Math.floor(Date.now() / 864e5);
  const featured = (unread.length ? unread : list)[
    day % Math.max(1, (unread.length ? unread : list).length)
  ];
  const rest = list.filter((i) => i !== featured);
  return (
    <div className="ideas">
      <div className="ideas-inner">
        <div className="hello">{t('Clever ideas')}</div>
        <h1 className="home-h">{tx('The tricks behind *famous* software.')}</h1>
        <p className="ex-sub long">
          {t(
            `${IDEAS.length} real problems from Uber, Google, Amazon, Discord and more, each a short blog post with code you can run: the obvious way next to the clever way.`,
          )}
        </p>
        <p className="ex-sub short">
          {t(`${IDEAS.length} real tricks from Uber, Google, Discord and more, with code you run.`)}
        </p>
        <div className="shelves">
          {THEMES.map(([themeId, l]) => (
            <button
              key={themeId}
              className={`shelf ${theme === themeId ? 'on' : ''}`}
              onClick={() => setTheme(themeId)}
            >
              {l}
            </button>
          ))}
        </div>

        {featured && (
          <button className="idea-hero" onClick={() => onRead(featured)}>
            <div className="ih-art">
              <IdeaArt kind={featured.art} big />
            </div>
            <div className="ih-text">
              <div className="ic-co">
                <Brand slug={featured.slug} name={featured.company} size={22} plain />
                {featured.company}
                {!readIds[featured.id] && <span className="ih-pick">today’s pick</span>}
              </div>
              <h2>{featured.title}</h2>
              <p>{featured.hook}</p>
              <div className="ic-meta">
                <span>{featured.mins} min</span>
                {featured.concepts.map((c) => (
                  <span key={c} className="ic-c">
                    {c}
                  </span>
                ))}
                {readIds[featured.id] && <span className="ic-read">✓ read</span>}
              </div>
              <span className="ih-go">Read & run it →</span>
            </div>
          </button>
        )}

        {theme === 'all' && races.length > 0 && (
          <div className="races">
            <div className="races-h">
              <span className="mini-h">algorithm races</span>
              <span className="muted small">
                Same problem, different algorithms, raced live on bigger and bigger inputs. Opens
                instantly.
              </span>
            </div>
            <div className="race-row">
              {races.map((race, i) => (
                <button key={race.id} className="race-card" onClick={() => onRace(race)}>
                  <svg viewBox="0 0 120 54" className="race-art" aria-hidden="true">
                    {(race.growth.calls || []).map((call, k) => {
                      const curve = [
                        (x) => x * x * 0.9,
                        (x) => x * 1.6 + 2,
                        (x) => Math.log2(x + 1) * 6,
                      ][k % 3];
                      const pts = Array.from(
                        { length: 12 },
                        (_, j) =>
                          `${8 + j * 9.5},${50 - Math.min(44, curve(j * 0.6 + (i % 2)) * (k === 0 ? 1.2 : 1))}`,
                      ).join(' ');
                      return (
                        <polyline
                          key={k}
                          points={pts}
                          fill="none"
                          stroke={['#ff8a5b', '#4cc9a0', '#a78bfa'][k]}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>
                  <b>{race.title.split(':')[0]}</b>
                  <span>{race.title.split(':')[1]?.trim()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="idea-grid">
          {rest.map((i, index) => (
            <button
              key={i.id}
              className="idea-card"
              onClick={() => onRead(i)}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="ic-art">
                <IdeaArt kind={i.art} />
              </div>
              <div className="ic-co">
                <Brand slug={i.slug} name={i.company} size={18} plain />
                {i.company}
                {readIds[i.id] && <span className="ic-read">✓</span>}
              </div>
              <div className="ic-t">{i.title}</div>
              <div className="ic-h">{i.hook}</div>
              <div className="ic-meta">
                <span>{i.mins} min</span>
                <span className={`lang-dot ${i.lang}`} />
                {i.lang === 'python' ? 'Python' : 'JavaScript'}
                {instant[i.id] && !readIds[i.id] && (
                  <span
                    className="ic-instant"
                    title="Ships with Bento: opens instantly, no AI needed to read it"
                  >
                    opens instantly
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
