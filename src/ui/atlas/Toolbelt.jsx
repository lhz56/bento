// The tools a project is built with, grouped by what they're for, with a card for each (what it does, when to
// pick it, what else does the same job). Also used for a website (Site.jsx).
import { useState, useEffect } from 'react';
import { CATS, BY_ID } from '../../atlas/catalog.js';
import Brand from '../Brand.jsx';
import Md from '../Md.jsx';
import { lc, findTool } from './toolModel.js';

// =====================================================================================================
// Toolbelt: logos first. Pick one to see what it does here, why it was chosen, and what else would work.
export function Toolbelt({ tools, stack, narration, narrating, onShowFiles }) {
  const [sel, setSel] = useState(null);
  const [alt, setAlt] = useState(null);
  useEffect(() => {
    const h = (e) => setSel(e.detail);
    addEventListener('atlas-tool', h);
    return () => removeEventListener('atlas-tool', h);
  }, []);
  const narrStack = narration?.stack || {};
  const shop = stack.filter((s) => s.workshop && !s.side);
  const side = stack.filter((s) => s.side);
  const groups = [];
  for (const s of tools) {
    const g = groups.find((x) => x.cat === s.cat);
    if (g) g.items.push(s);
    else groups.push({ cat: s.cat, items: [s] });
  }
  const tool = tools.find((t) => t.id === sel) || tools[0];
  const said =
    tool &&
    (narrStack[tool.id] ||
      Object.values(narrStack).find((x) => x.name?.toLowerCase() === tool.name.toLowerCase()));
  const alts = tool
    ? (said?.alts?.length
        ? said.alts.map((a) => ({ name: a.name, when: a.when, tool: findTool(a.name) }))
        : (tool.alt || [])
            .map((id) => BY_ID[id])
            .filter(Boolean)
            .map((t) => ({ name: t.name, when: t.when, tool: t }))
      ).slice(0, 4)
    : [];
  const shownAlt = alts.find((a) => a.name === alt) || null;
  useEffect(() => setAlt(null), [tool?.id]);
  return (
    <section className="asec" id="sec-stack">
      <div className="sec-head">
        <div>
          <div className="kicker">toolbelt</div>
          <h2>What it’s built with</h2>
        </div>
      </div>
      {tools.length === 0 && (
        <p className="muted">
          No outside tools: it’s built from scratch with the language’s own features.
        </p>
      )}
      {tools.length > 0 && (
        <div className="belt2">
          <div className="belt-tiles">
            {groups.map((group) => (
              <div key={group.cat} className="tg">
                <div className="tg-h">{CATS[group.cat]?.[0] || group.cat}</div>
                <div className="tg-row">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`tile ${tool?.id === item.id ? 'on' : ''}`}
                      onClick={() => setSel(item.id)}
                      onMouseEnter={() => setSel(item.id)}
                    >
                      <Brand slug={item.slug} name={item.name} color={item.color} size={46} />
                      <span className="tile-n">{item.name}</span>
                      {item.used?.length > 0 && (
                        <span className="tile-use" title={`used in ${item.used.length} files`}>
                          {Array.from(
                            { length: Math.min(6, Math.ceil(Math.log2(item.used.length + 1))) },
                            (_, i) => (
                              <i key={i} />
                            ),
                          )}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {tool && (
            <div className="tool-card" key={tool.id}>
              <div className="tc-top">
                <Brand slug={tool.slug} name={tool.name} color={tool.color} size={58} />
                <div>
                  <div className="tc-cat">{CATS[tool.cat]?.[0]}</div>
                  <div className="tc-name">{tool.name}</div>
                  {tool.used?.length > 0 && (
                    <button
                      className="tool-used"
                      onClick={() => onShowFiles([...tool.used, `s:${tool.id}`])}
                    >
                      show the {tool.used.length} file{tool.used.length > 1 ? 's' : ''} that use it
                      →
                    </button>
                  )}
                </div>
              </div>
              <div className="tc-what">{said?.role || tool.what}</div>
              {said?.why ? (
                <div className="tc-why">
                  <Md text={said.why} />
                </div>
              ) : narrating ? (
                <div className="shimmer" />
              ) : null}
              {alts.length > 0 && (
                <div className="tc-vs">
                  <div className="tc-vs-row">
                    <span className="vs-pick">
                      <Brand slug={tool.slug} name={tool.name} color={tool.color} size={30} />
                    </span>
                    <span className="vs">vs</span>
                    {alts.map((alt) => (
                      <button
                        key={alt.name}
                        className={`vs-alt ${shownAlt?.name === alt.name ? 'on' : ''}`}
                        onMouseEnter={() => setAlt(alt.name)}
                        onClick={() => setAlt(alt.name)}
                        title={alt.name}
                      >
                        <Brand
                          slug={alt.tool?.slug}
                          name={alt.name}
                          color={alt.tool?.color}
                          size={30}
                        />
                        <span>{alt.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="tc-when">
                    {shownAlt ? (
                      <>
                        <b>Pick {shownAlt.name}</b>{' '}
                        {/^(when|if)\b/i.test(shownAlt.when || '') ? '' : 'when '}
                        {lc((shownAlt.when || shownAlt.tool?.when || '').replace(/\.$/, ''))}.
                      </>
                    ) : (
                      <span className="muted">
                        Point at an alternative to see when you’d choose it instead.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {shop.length > 0 && (
        <div className="workshop">
          <span className="mini-h">also in the workshop</span>
          {shop.map((t) => (
            <span key={t.id} className="ws" title={`${t.name}: ${t.what}`}>
              <Brand slug={t.slug} name={t.name} color={t.color} size={20} plain />
              {t.name}
            </span>
          ))}
        </div>
      )}
      {side.length > 0 && (
        <div className="workshop">
          <span className="mini-h">only for its docs site and examples</span>
          {side.map((tool) => (
            <span
              key={tool.id}
              className="ws"
              title={`${tool.name}: ${tool.what}\nFound in ${tool.evidence.join(', ')}`}
            >
              <Brand slug={tool.slug} name={tool.name} color={tool.color} size={20} plain />
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
