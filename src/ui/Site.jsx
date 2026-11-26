import { useMemo } from 'react';
import { detectSite } from '../atlas/site.js';
import { mergeTools, Toolbelt } from './Atlas.jsx';
import BigPicture from './BigPicture.jsx';
import { Md } from './Story.jsx';

// Take apart a website: what it is, how it reached your screen, and what it's built with.
const fallback = (F, tools) => {
  const edge = tools.find((t) =>
    ['cloudflare', 'fastly', 'akamai', 'cloudfront', 'vercel', 'netlify'].includes(t.id),
  );
  const plat = tools.find((t) => t.cat === 'frame');
  const nodes = [
    { id: 'you', label: 'You', kind: 'person', does: 'Type the address', term: 'browser' },
    {
      id: 'dns',
      label: 'Address book',
      kind: 'outside',
      does: 'Turns the name into a number',
      term: 'DNS',
    },
  ];
  if (edge)
    nodes.push({
      id: 'edge',
      label: edge.name,
      kind: 'outside',
      stack: edge.id,
      does: 'Hands out copies nearby',
      term: 'CDN',
    });
  nodes.push({
    id: 'site',
    label: plat ? plat.name : 'The site',
    kind: 'part',
    stack: plat?.id || '',
    does: 'Builds the page',
    term: 'web server',
  });
  nodes.push({
    id: 'page',
    label: 'Your screen',
    kind: 'person',
    does: 'Draws the page and runs scripts',
    term: 'HTML + JavaScript',
  });
  return {
    nodes,
    edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })),
    fallback: true,
  };
};

export default function Site({ site: X, onAsk, onRetry, onOpenUrl, onOpenRepo, modelLabel }) {
  const F = X.facts;
  const N = X.narr || {};
  const found = useMemo(() => (F ? detectSite(F) : []), [F]);
  const tools = useMemo(() => mergeTools(found, N.stack), [found, N.stack]);
  const narrating = X.status === 'narrating';
  if (!F)
    return (
      <div className="atlas-loading">
        <div className="al-name">{X.host}</div>
        {X.status === 'error' ? (
          <div className="story-err">
            <b>Couldn’t open it.</b> {X.error}
            <div>
              <button className="btn tiny" onClick={onRetry}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="al-steps">
            <div className="al-step now">
              <span className="al-dot" />
              Visiting the page like a browser would
            </div>
            <div className="al-step">
              <span className="al-dot" />
              Looking for clues about how it’s built
            </div>
          </div>
        )}
      </div>
    );
  const g = N.gist;
  const kb = Math.round(F.bytes / 1024);
  const j = N.journeys?.[0];
  return (
    <div className="atlas">
      <div className="atlas-bar">
        <div className="ab-id">
          <span className="ab-folder">◎</span>
          <span className="ab-name">{F.host}</span>
        </div>
        <div className="ab-act" style={{ marginLeft: 'auto' }}>
          {narrating && (
            <span className="ab-live">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              reading
            </span>
          )}
          {X.status === 'narr-error' && (
            <button className="chip warnchip" onClick={onRetry}>
              Explanations failed · retry
            </button>
          )}
          <button className="chip" onClick={() => onOpenUrl(F.final)}>
            Visit ↗
          </button>
        </div>
      </div>
      <section className="asec a-over">
        <div className="over-top">
          <div className="over-text">
            <div className="kicker">{g?.kind || 'website'}</div>
            <h1 className={g ? '' : 'pending'}>{g?.one || F.title || F.host}</h1>
            {g?.analogy ? (
              <p className="analogy">{g.analogy}</p>
            ) : narrating ? (
              <div className="shimmer" style={{ width: '62%', height: 16 }} />
            ) : null}
          </div>
          <div className="vitals site-vitals">
            <div className="vt-rows">
              <div>
                <b>{F.ms < 1000 ? `${F.ms} ms` : `${(F.ms / 1000).toFixed(1)} s`}</b>
                <span>to answer</span>
              </div>
              <div>
                <b>{kb} KB</b>
                <span>of HTML</span>
              </div>
              <div>
                <b>{F.counts.scripts}</b>
                <span>scripts</span>
              </div>
              <div>
                <b>{found.length}</b>
                <span>tools spotted</span>
              </div>
            </div>
            {g?.users && (
              <div className="vt-who">
                <span className="k">for</span>
                {g.users}
              </div>
            )}
          </div>
        </div>
        <BigPicture
          flow={N.flow || fallback(F, found)}
          terms={N.terms || []}
          tools={tools}
          pathIdx={new Map()}
          onOpen={() => {}}
          onAsk={(q) => onAsk(q)}
          narrating={narrating}
          role={() => ''}
        />
        {F.repos?.length > 0 && onOpenRepo && (
          <div className="site-repos">
            <span className="mini-h">this site links to code on GitHub</span>
            {F.repos.map((r) => (
              <button key={r} className="file-chip" onClick={() => onOpenRepo(r)}>
                ◈ {r}
                <span>take apart the code</span>
              </button>
            ))}
          </div>
        )}
        {j && (
          <div className="site-journey">
            <span className="mini-h">{j.title}</span>
            <ol>
              {j.steps.map((s, i) => (
                <li key={i}>
                  <span className="tour-n">{i + 1}</span>
                  <span>
                    <Md text={s.md} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      <Toolbelt tools={tools} stack={found} N={N} narrating={narrating} onShowFiles={() => {}} />
      <section className="asec">
        <div className="sec-head">
          <div>
            <div className="kicker">clues</div>
            <h2>What the browser saw</h2>
            <p className="sec-sub">
              The evidence Bento used: the server’s headers and the first scripts the page loads.
            </p>
          </div>
        </div>
        <div className="clues">
          <div>
            <div className="mini-h">headers</div>
            {Object.entries(F.headers).map(([k, v]) => (
              <div key={k} className="clue">
                <b>{k}</b>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mini-h">scripts</div>
            {F.scripts.slice(0, 12).map((s) => (
              <div key={s} className="clue">
                <span>{s}</span>
              </div>
            ))}
            {F.scripts.length === 0 && <div className="muted small">No external scripts.</div>}
          </div>
        </div>
      </section>
      <section className="asec">
        <div className="sec-head">
          <div>
            <div className="kicker">study it</div>
            <h2>Go deeper</h2>
          </div>
        </div>
        <div className="nexts" style={{ maxWidth: 640 }}>
          {(N.learn?.length
            ? N.learn
            : [
                'What happens when I type a web address?',
                'What is a CDN?',
                'How do websites remember I’m logged in?',
              ]
          ).map((q) => (
            <button key={q} className="next" onClick={() => onAsk(q)}>
              {q}
              <span>→</span>
            </button>
          ))}
        </div>
      </section>
      <div style={{ height: 60 }} />
    </div>
  );
}
