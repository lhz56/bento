// The outside services and tools a project relies on, and a sheet for each.
import { CATS } from '../../../atlas/catalog.js';
import Brand from '../../Brand.jsx';
import Md from '../../Md.jsx';
import { Head, I, SubHead, Sheet, Group } from './kit.jsx';

// the kinds of tool a company runs for you (you sign up for them), as opposed to code the app is built from
const SERVICE = new Set([
  'auth',
  'pay',
  'mail',
  'db',
  'host',
  'ai',
  'files',
  'search',
  'watch',
  'bot',
]);

// where a tool sits, when no file says so
const CAT_LAYER = {
  frame: 'ui',
  ui: 'ui',
  style: 'ui',
  state: 'ui',
  viz: 'ui',
  content: 'data',
  api: 'server',
  db: 'data',
  orm: 'data',
  auth: 'logic',
  pay: 'logic',
  ai: 'logic',
  mail: 'logic',
  files: 'data',
  search: 'data',
  check: 'server',
  sci: 'logic',
  bot: 'server',
  host: 'support',
  ci: 'support',
  test: 'support',
  build: 'support',
  tidy: 'support',
  watch: 'support',
};

export const layerOfTool = (t, facts) => {
  const n = {};
  (t.used || []).forEach((i) => {
    const l = facts.files[i]?.layer;
    if (l) n[l] = (n[l] || 0) + 1;
  });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || CAT_LAYER[t.cat] || 'support';
};

export const sayOf = (narration, t) =>
  narration?.stack?.[t.id] ||
  Object.values(narration?.stack || {}).find((x) => x.name?.toLowerCase() === t.name.toLowerCase());

// ---------------------------------------------------------------- the services it signs up for, and the code it's built from
export function Services({ tools, narration, onPick }) {
  const svc = tools.filter((t) => SERVICE.has(t.cat));
  const libs = tools.filter((t) => !SERVICE.has(t.cat));
  return (
    <section className="asec" id="sec-services">
      <Head
        title="Services it uses"
        sub="Companies and big pieces it plugs in, so it doesn’t have to build them itself. Tap one to see why."
      />
      {svc.length > 0 ? (
        <div className="sv-grid">
          {svc.map((t) => (
            <button key={t.id} className="sv" onClick={() => onPick(t.id)}>
              <Brand slug={t.slug} name={t.name} color={t.color} size={44} />
              <span className="sv-cat">{CATS[t.cat]?.[0] || t.cat}</span>
              <b>{t.name}</b>
              <span className="sv-what">{sayOf(narration, t)?.role || t.what}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="ph-cells">
          <div className="ph-cell">
            <span className="ph-ic round" style={{ '--c': 'var(--mint)' }}>
              <I n="check" s={15} w={2.6} />
            </span>
            <span className="ph-ct">
              <b className="reg">
                It doesn’t sign up for any outside service: everything it needs is in its own code.
              </b>
            </span>
          </div>
        </div>
      )}
      {libs.length > 0 && (
        <>
          <SubHead
            title="Built with"
            note={`${libs.length} ${libs.length === 1 ? 'library' : 'libraries'}`}
          />
          <div className="ph-pager lib-pager">
            {libs.map((lib) => (
              <button key={lib.id} className="lib" onClick={() => onPick(lib.id)}>
                <Brand slug={lib.slug} name={lib.name} color={lib.color} size={44} />
                <span className="ph-ct">
                  <b>{lib.name}</b>
                  <span>{sayOf(narration, lib)?.role || lib.what}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ToolSheet({ tool, said, alts, narrating, onClose, onShowFiles }) {
  return (
    <Sheet label={tool.name} onClose={onClose} className="tool-sheet">
      <div className="ps-in">
        <div className="ps-id">
          <Brand slug={tool.slug} name={tool.name} color={tool.color} size={60} />
          <div>
            <div className="ps-k" style={{ '--c': 'var(--accent)' }}>
              {CATS[tool.cat]?.[0] || tool.cat}
            </div>
            <h3 className="ps-title">{tool.name}</h3>
            <div className="ps-sub">{CATS[tool.cat]?.[1] || ''}</div>
          </div>
        </div>
        <Group title="What it does here">
          <div className="ph-cell text">
            <p>
              <Md text={said?.role || tool.what} />
            </p>
          </div>
        </Group>
        {said?.why ? (
          <Group title="Why this one">
            <div className="ph-cell text">
              <p>
                <Md text={said.why} />
              </p>
            </div>
          </Group>
        ) : narrating ? (
          <div className="shimmer" style={{ margin: '18px 4px' }} />
        ) : null}
        {alts.length > 0 && (
          <Group title="It could have been">
            {alts.map((alt) => (
              <div key={alt.name} className="ph-cell">
                <Brand slug={alt.tool?.slug} name={alt.name} color={alt.tool?.color} size={32} />
                <span className="ph-ct">
                  <b>{alt.name}</b>
                  <span>{alt.when || alt.tool?.when || ''}</span>
                </span>
              </div>
            ))}
          </Group>
        )}
        {tool.used?.length > 0 && (
          <div className="ps-acts">
            <button className="ps-btn" onClick={() => onShowFiles([...tool.used, `s:${tool.id}`])}>
              <I n="city" s={18} />
              Show the {tool.used.length} file{tool.used.length === 1 ? '' : 's'} that use it
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
