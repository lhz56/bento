// Two apps that do similar jobs, side by side: their pictures, their tools, and how each one solves the same problem.
import { useEffect, useMemo, useState } from 'react';
import { t, tx } from '../i18n.js';
import { CATS } from '../atlas/catalog.js';
import { detectStack, langColor, fmtN } from '../atlas/analyze.js';
import BigPicture, { fallbackFlow } from './BigPicture.jsx';
import Brand from './Brand.jsx';
import FEATURED from '../atlas-featured.json';

const QUESTIONS = [
  'How does each one start up?',
  'How does each one store its data?',
  'How does each one talk to outside services?',
  'How does each one handle errors?',
  'Which one is easier to read, and why?',
];

export default function Compare({
  projects,
  atlases,
  ensure,
  pair,
  setPair,
  onCompareAsk,
  onOpenProject,
}) {
  const [q, setQ] = useState('');
  const [keyA, keyB] = pair;
  useEffect(() => {
    [keyA, keyB].forEach((k) => k && ensure(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensure (open a project) is new each render; only a new pair should open anything
  }, [keyA, keyB]);
  const atlasA = atlases[pair[0]],
    atlasB = atlases[pair[1]];
  const tools = (facts) => (facts ? detectStack(facts).filter((s) => !s.workshop) : []);
  const factsA = atlasA?.facts;
  const factsB = atlasB?.facts;
  const ta = useMemo(() => tools(factsA), [factsA]);
  const tb = useMemo(() => tools(factsB), [factsB]);
  const both = ta.filter((t) => tb.some((u) => u.id === t.id));
  const onlyA = ta.filter((t) => !tb.some((u) => u.id === t.id));
  const onlyB = tb.filter((t) => !ta.some((u) => u.id === t.id));
  const ready = atlasA?.facts && atlasB?.facts;
  const Pick = ({ i }) => (
    <select
      className="cmp-pick"
      value={pair[i] || ''}
      onChange={(e) => setPair(i === 0 ? [e.target.value, pair[1]] : [pair[0], e.target.value])}
    >
      <option value="">Choose a project…</option>
      {projects.length > 0 && (
        <optgroup label="Taken apart">
          {projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {Object.keys(FEATURED).some((k) => !projects.some((p) => p.key === k)) && (
        <optgroup label="Ready instantly">
          {Object.keys(FEATURED)
            .filter((k) => !projects.some((p) => p.key === k))
            .map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );
  const Side = ({ site, k }) => {
    if (!k)
      return (
        <div className="cmp-empty">
          Pick a second app. <b>{Object.keys(FEATURED).length} are ready instantly</b>, or take
          apart any GitHub project first.
        </div>
      );
    if (!site?.facts)
      return (
        <div className="cmp-empty">
          <span className="lens-spin" /> bringing it in…
        </div>
      );
    const langs = Object.entries(site.facts.langs).sort((a, b) => b[1] - a[1]);
    const tot = langs.reduce((s, [, n]) => s + n, 0) || 1;
    return (
      <div className="cmp-side">
        <div className="cmp-kind">{site.narr?.gist?.kind || ''}</div>
        <div className="cmp-one">{site.narr?.gist?.one || site.meta?.description || site.name}</div>
        <div className="cmp-stats">
          <span>
            <b>{site.facts.totals.code}</b> files
          </span>
          <span>
            <b>{fmtN(site.facts.totals.lines)}</b> lines
          </span>
          {langs.slice(0, 2).map(([l, n]) => (
            <span key={l}>
              <i className="ldot" style={{ background: langColor(l) }} />
              {l} {Math.round((n / tot) * 100)}%
            </span>
          ))}
        </div>
        <div className="cmp-flow">
          <BigPicture
            flow={site.narr?.flow || fallbackFlow(site.facts, tools(site.facts))}
            terms={[]}
            tools={tools(site.facts)}
            pathIdx={new Map(site.facts.files.map((f, i) => [f.p, i]))}
            onOpen={() => onOpenProject(k)}
            onAsk={() => {}}
            narrating={false}
            role={() => ''}
          />
        </div>
      </div>
    );
  };
  return (
    <div className="explore">
      <div className="ex-inner wide">
        <div className="hello">{t('Compare')}</div>
        <h1 className="home-h">{tx('Same job, *different* choices.')}</h1>
        <p className="ex-sub">
          {t(
            'Put two apps side by side. See how each is shaped, which tools they share, and ask how each one solves the same problem, with the real code from both.',
          )}
        </p>
        <div className="cmp-cols">
          <div>
            <Pick i={0} />
            <Side site={atlasA} k={pair[0]} />
          </div>
          <div className="cmp-vs">vs</div>
          <div>
            <Pick i={1} />
            <Side site={atlasB} k={pair[1]} />
          </div>
        </div>
        {pair[0] && pair[0] === pair[1] && (
          <p className="cmp-note">Pick two different apps to compare.</p>
        )}
        {ready && pair[0] !== pair[1] && (
          <>
            <div className="venn">
              <div className="vn a">
                <div className="mini-h">only {atlasA.name.split('/').pop()}</div>
                <div className="vn-ic">
                  {onlyA.map((t) => (
                    <span key={t.id} title={`${t.name}: ${t.what}`}>
                      <Brand slug={t.slug} name={t.name} color={t.color} size={34} />
                      <i>{t.name}</i>
                    </span>
                  ))}
                  {!onlyA.length && <em>nothing extra</em>}
                </div>
              </div>
              <div className="vn both">
                <div className="mini-h">both use</div>
                <div className="vn-ic">
                  {both.map((t) => (
                    <span key={t.id} title={`${t.name}: ${t.what}`}>
                      <Brand slug={t.slug} name={t.name} color={t.color} size={34} />
                      <i>{t.name}</i>
                    </span>
                  ))}
                  {!both.length && <em>no tools in common</em>}
                </div>
              </div>
              <div className="vn b">
                <div className="mini-h">only {atlasB.name.split('/').pop()}</div>
                <div className="vn-ic">
                  {onlyB.map((t) => (
                    <span key={t.id} title={`${t.name}: ${t.what}`}>
                      <Brand slug={t.slug} name={t.name} color={t.color} size={34} />
                      <i>{t.name}</i>
                    </span>
                  ))}
                  {!onlyB.length && <em>nothing extra</em>}
                </div>
              </div>
            </div>
            {onlyA.length > 0 && onlyB.length > 0 && (
              <p className="cmp-note">{pairs(onlyA, onlyB)}</p>
            )}
            <div className="cmp-ask">
              <div className="mini-h">ask how each one does it</div>
              <div className="nexts">
                {QUESTIONS.map((x) => (
                  <button key={x} className="next" onClick={() => onCompareAsk(atlasA, atlasB, x)}>
                    {x}
                    <span>→</span>
                  </button>
                ))}
              </div>
              <form
                className="cv-feature"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (q.trim()) onCompareAsk(atlasA, atlasB, q.trim());
                }}
              >
                <span className="cv-fi">⇄</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Your own question: “how does each one handle logins?”"
                />
                <button className="btn" disabled={!q.trim()}>
                  Compare
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// "One uses Postgres where the other uses MongoDB": pair up tools that do the same job.
function pairs(a, b) {
  const out = [];
  for (const x of a) {
    const y = b.find((t) => t.cat === x.cat);
    if (y)
      out.push(
        `${x.name} where the other uses ${y.name} (${(CATS[x.cat]?.[0] || x.cat).toLowerCase()})`,
      );
  }
  return out.length ? `Same jobs, different tools: one picks ${out.slice(0, 3).join('; ')}.` : '';
}
