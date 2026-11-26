import { useMemo } from 'react';
import { detectSite } from '../atlas/site.js';
import { mergeTools, Toolbelt } from './Atlas.jsx';
import BigPicture from './BigPicture.jsx';
import { Md } from './Story.jsx';

// Take apart a website: what it is, how it reached your screen, and what it's built with.
const fallback = (facts, tools) => {
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

export default function Site({ site, onAsk, onRetry, onOpenUrl, onOpenRepo }) {
  const facts = site.facts;
  const narration = site.narr || {};
  const found = useMemo(() => (facts ? detectSite(facts) : []), [facts]);
  const tools = useMemo(() => mergeTools(found, narration.stack), [found, narration.stack]);
  const narrating = site.status === 'narrating';
  if (!facts)
    return (
      <div className="atlas-loading">
        <div className="al-name">{site.host}</div>
        {site.status === 'error' ? (
          <div className="story-err">
            <b>Couldn’t open it.</b> {site.error}
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
  const gist = narration.gist;
  const kb = Math.round(facts.bytes / 1024);
  const j = narration.journeys?.[0];
  return (
    <div className="atlas">
      <div className="atlas-bar">
        <div className="ab-id">
          <span className="ab-folder">◎</span>
          <span className="ab-name">{facts.host}</span>
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
          {site.status === 'narr-error' && (
            <button className="chip warnchip" onClick={onRetry}>
              Explanations failed · retry
            </button>
          )}
          <button className="chip" onClick={() => onOpenUrl(facts.final)}>
            Visit ↗
          </button>
        </div>
      </div>
      <section className="asec a-over">
        <div className="over-top">
          <div className="over-text">
            <div className="kicker">{gist?.kind || 'website'}</div>
            <h1 className={gist ? '' : 'pending'}>{gist?.one || facts.title || facts.host}</h1>
            {gist?.analogy ? (
              <p className="analogy">{gist.analogy}</p>
            ) : narrating ? (
              <div className="shimmer" style={{ width: '62%', height: 16 }} />
            ) : null}
          </div>
          <div className="vitals site-vitals">
            <div className="vt-rows">
              <div>
                <b>{facts.ms < 1000 ? `${facts.ms} ms` : `${(facts.ms / 1000).toFixed(1)} s`}</b>
                <span>to answer</span>
              </div>
              <div>
                <b>{kb} KB</b>
                <span>of HTML</span>
              </div>
              <div>
                <b>{facts.counts.scripts}</b>
                <span>scripts</span>
              </div>
              <div>
                <b>{found.length}</b>
                <span>tools spotted</span>
              </div>
            </div>
            {gist?.users && (
              <div className="vt-who">
                <span className="k">for</span>
                {gist.users}
              </div>
            )}
          </div>
        </div>
        <BigPicture
          flow={narration.flow || fallback(facts, found)}
          terms={narration.terms || []}
          tools={tools}
          pathIdx={new Map()}
          onOpen={() => {}}
          onAsk={(q) => onAsk(q)}
          narrating={narrating}
          role={() => ''}
        />
        {facts.repos?.length > 0 && onOpenRepo && (
          <div className="site-repos">
            <span className="mini-h">this site links to code on GitHub</span>
            {facts.repos.map((r) => (
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
              {j.steps.map((step, i) => (
                <li key={i}>
                  <span className="tour-n">{i + 1}</span>
                  <span>
                    <Md text={step.md} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      <Toolbelt
        tools={tools}
        stack={found}
        narration={narration}
        narrating={narrating}
        onShowFiles={() => {}}
      />
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
            {Object.entries(facts.headers).map(([k, v]) => (
              <div key={k} className="clue">
                <b>{k}</b>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mini-h">scripts</div>
            {facts.scripts.slice(0, 12).map((s) => (
              <div key={s} className="clue">
                <span>{s}</span>
              </div>
            ))}
            {facts.scripts.length === 0 && <div className="muted small">No external scripts.</div>}
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
          {(narration.learn?.length
            ? narration.learn
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
