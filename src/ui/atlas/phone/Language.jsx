import { langColor } from '../../../atlas/analyze.js';
import { LANGS } from '../../../atlas/catalog.js';
import Brand from '../../Brand.jsx';
import { Md } from '../../Story.jsx';
import { Head, Group } from './kit.jsx';

// The languages a project is written in, on a phone.

// ---------------------------------------------------------------- the language
export function Language({ langs, totalL, main, narration, narrating }) {
  const langInfo = LANGS[main] || {};
  const why = narration?.lang?.why || langInfo.why;
  const alts = (
    narration?.lang?.alts?.length
      ? narration.lang.alts
      : (langInfo.alt || []).map((a) => ({ name: a, when: LANGS[a]?.why }))
  ).slice(0, 3);
  if (!main) return null;
  return (
    <section className="asec" id="sec-language">
      <Head title={`Written in ${main}`} />
      <div className="lg-card">
        <div className="lg-top">
          <Brand slug={langInfo.slug} name={main} color={langInfo.color} size={48} />
          <p>
            {why ? (
              <Md text={why} />
            ) : narrating ? (
              <span className="shimmer" />
            ) : (
              'The authors’ choice.'
            )}
          </p>
        </div>
        <div className="pk-bar" aria-hidden="true">
          {langs.slice(0, 6).map(([l, n]) => (
            <i key={l} style={{ flexGrow: n, background: langColor(l) }} />
          ))}
        </div>
        <div className="pk-key">
          {langs.slice(0, 6).map(([l, n]) => (
            <span key={l}>
              <i style={{ background: langColor(l) }} />
              {l}
              <b>{Math.max(1, Math.round((n / totalL) * 100))}%</b>
            </span>
          ))}
        </div>
      </div>
      {alts.length > 0 && (
        <Group title="It could have been">
          {alts.map((alt) => (
            <div key={alt.name} className="ph-cell">
              <Brand
                slug={LANGS[alt.name]?.slug}
                name={alt.name}
                color={LANGS[alt.name]?.color}
                size={32}
              />
              <span className="ph-ct">
                <b>{alt.name}</b>
                <span>
                  <Md text={alt.when || ''} />
                </span>
              </span>
            </div>
          ))}
        </Group>
      )}
    </section>
  );
}
