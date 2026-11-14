// A project's Atlas on a phone. It reads like an app's page in the App Store: what the app is and what it does, for
// anyone, first; then how it works, what it's made of and the services it leans on; then, as you scroll, the
// technical side (the code city, where it could break, the language); and the code itself at the bottom, a file at
// a time, with a question box always in reach. The parts below are the phone's own; the rest is the Mac's Atlas.
import { useEffect, useState } from 'react';
import Brand from './Brand.jsx';
import { CATS } from '../atlas/catalog.js';
import { LAYERS, fmtN } from '../atlas/analyze.js';
import { Md } from './Story.jsx';

export const PHONE_SECTIONS = [['overview', 'Summary'], ['how', 'How it works'], ['parts', 'Parts'], ['services', 'Services'], ['anatomy', 'Code city'], ['hot', 'Hot spots'], ['files', 'Code'], ['study', 'Learn it']];
// kinds of tool you sign up for (a company runs them), as opposed to code the app is built from
// (Backstage's grey is too light under a white picture: the system grey instead)
const tint = (k, c) => (k === 'support' ? '#8e8e93' : c);
const SERVICE = new Set(['auth', 'pay', 'mail', 'db', 'host', 'ai', 'files', 'search', 'watch', 'bot']);

// the five kinds of part, as small pictures (an iPhone settings-style tile each)
const PART_IC = {
  ui: <><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></>,
  server: <><path d="M4 12h11M11 8l4 4-4 4" /><path d="M19 4v16" /></>,
  logic: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  data: <><ellipse cx="12" cy="6" rx="7.5" ry="2.8" /><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  support: <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
};
const PartIcon = ({ k, c }) => (
  <span className="pp-ic" style={{ '--c': c }} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{PART_IC[k]}</svg>
  </span>
);

export function PhoneHead({ k, title, sub }) {
  return (
    <div className="ph-head">
      <div className="kicker">{k}</div>
      <h2>{title}</h2>
      {sub && <p className="ph-sub">{sub}</p>}
    </div>
  );
}

const UNIT = { year: 'yr', years: 'yrs', month: 'mo', months: 'mo', day: 'd', days: 'd', hour: 'h', hours: 'h', minute: 'min', minutes: 'min' };
const short = (s) => { const m = /^(\d+) (\w+)/.exec(s || ''); return m ? `${m[1]} ${UNIT[m[2]] || m[2]}` : s; };

// ---------------------------------------------------------------- the top: what it is, in a sentence, and what you can do with it
export function PhoneHero({ A, F, N, meta, tools, langs, totalL, narrating, ago }) {
  const gist = N?.gist;
  const full = meta.full || A.name;
  const name = full.split('/').pop();
  const owner = full.includes('/') ? full.split('/')[0] : '';
  const main = langs[0];
  const stats = [
    meta.stars > 0 && ['Stars', fmtN(meta.stars), 'on GitHub'],
    main && ['Language', main[0] === 'TypeScript' ? 'TS' : main[0] === 'JavaScript' ? 'JS' : main[0], `${Math.round((main[1] / totalL) * 100)}% of the code`],
    ['Size', fmtN(F.totals.code), 'code files'],
    ['Lines', fmtN(F.totals.lines), 'of code'],
    tools.length > 0 && ['Tools', String(tools.length), 'from outside'],
    meta.pushed && ['Updated', short(ago(meta.pushed)), /\d/.test(ago(meta.pushed)) ? 'ago' : ''],
  ].filter(Boolean);
  return (
    <section className="asec ph-hero" id="sec-overview">
      <div className="ph-id">
        {meta.avatar ? <img className="ph-av" src={meta.avatar} alt="" /> : <span className="ph-av ph-av-ph" aria-hidden="true">{name[0]?.toUpperCase()}</span>}
        <div className="ph-idt">
          <h1 className="ph-name">{name}</h1>
          <div className="ph-by">{A.src?.kind === 'local' ? 'your project' : owner || 'open source'}</div>
          {gist?.kind && <span className="ph-kind">{gist.kind}</span>}
        </div>
      </div>
      <div className="ph-stats" role="list">
        {stats.map(([k, v, s]) => <div key={k} className="ph-stat" role="listitem"><span>{k}</span><b>{v}</b><i>{s}</i></div>)}
      </div>
      {gist?.one ? <p className="ph-one">{gist.one}</p> : <p className="ph-one">{meta.description || F.sig?.pkgDesc || `What is ${name}?`}</p>}
      {gist?.analogy ? <p className="ph-like">{gist.analogy}</p> : narrating ? <div className="shimmer" style={{ width: '70%', height: 16, marginTop: 10 }} /> : null}
      {gist?.does?.length > 0 && (
        <div className="ph-card ph-does">
          <div className="ph-card-h">What you can do with it</div>
          <ul>{gist.does.map((d) => <li key={d}><span className="ph-tick" aria-hidden="true"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>{d}</li>)}</ul>
        </div>
      )}
      {gist?.users && <p className="ph-for"><b>Who it’s for</b>{gist.users}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- the five kinds of part, and how much of each
export function PhoneParts({ F, N, onShow }) {
  const [open, setOpen] = useState(null);
  const tot = {};
  for (const f of F.files) { const x = (tot[f.layer] ||= { n: 0, l: 0 }); x.n++; x.l += f.lines || 0; }
  const all = Object.values(tot).reduce((a, x) => a + x.l, 0) || 1;
  const parts = LAYERS.filter(([k]) => tot[k]?.n);
  return (
    <section className="asec" id="sec-parts">
      <PhoneHead k="what it’s made of" title="Its parts" sub="Every app has the same few kinds of parts. Here’s how much of this one each kind is." />
      <div className="pp-bar" aria-hidden="true">{parts.filter(([k]) => tot[k].l).map(([k, , , c]) => <i key={k} style={{ flexGrow: tot[k].l, background: tint(k, c) }} />)}</div>
      <div className="ph-list">
        {parts.map(([k, name, desc, c]) => (
          <div key={k} className={`pp-row ${open === k ? 'open' : ''}`}>
            <button className="pp-main" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <PartIcon k={k} c={tint(k, c)} />
              <span className="pp-t"><b>{name}</b><span>{desc}</span></span>
              <span className="pp-n">{Math.max(1, Math.round((tot[k].l / all) * 100))}%</span>
              <span className="ph-chev" aria-hidden="true" />
            </button>
            {open === k && (
              <div className="pp-more">
                {N?.layers?.[k] && <div className="pp-say"><Md text={N.layers[k]} /></div>}
                <button className="ph-link" onClick={() => onShow(k)}>See its {tot[k].n} file{tot[k].n === 1 ? '' : 's'}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the services it signs up for, and the code it's built from
export function PhoneServices({ tools, N, narrating, altsOf, onShowFiles }) {
  const [sel, setSel] = useState(null);
  const say = (t) => N?.stack?.[t.id] || Object.values(N?.stack || {}).find((x) => x.name?.toLowerCase() === t.name.toLowerCase());
  const svc = tools.filter((t) => SERVICE.has(t.cat));
  const libs = tools.filter((t) => !SERVICE.has(t.cat));
  const s = tools.find((t) => t.id === sel);
  return (
    <section className="asec" id="sec-services">
      <PhoneHead k="outside help" title="What it relies on" sub="The services it signs up for, then the ready-made code it’s built from. Tap one to see what it does here." />
      {svc.length > 0 ? (
        <div className="sv-grid">
          {svc.map((t) => (
            <button key={t.id} className="sv" onClick={() => setSel(t.id)}>
              <Brand slug={t.slug} name={t.name} color={t.color} size={40} />
              <b>{t.name}</b>
              <span className="sv-cat">{CATS[t.cat]?.[0] || t.cat}</span>
              <span className="sv-what">{say(t)?.role || t.what}</span>
            </button>
          ))}
        </div>
      ) : <p className="ph-note">It doesn’t sign up for any outside service: everything it needs is in its own code.</p>}
      {libs.length > 0 && (
        <>
          <div className="ph-sub-h">Built with</div>
          <div className="sv-row">
            {libs.map((t) => (
              <button key={t.id} className="sv-lib" onClick={() => setSel(t.id)}>
                <Brand slug={t.slug} name={t.name} color={t.color} size={36} />
                <b>{t.name}</b>
                <span>{CATS[t.cat]?.[0] || t.cat}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {s && <ToolSheet t={s} n={say(s)} alts={altsOf(s)} narrating={narrating} onClose={() => setSel(null)} onShowFiles={(ids) => { setSel(null); onShowFiles(ids); }} />}
    </section>
  );
}

// one tool, as a sheet from the bottom: what it does here, why this one, and what else would have worked
function ToolSheet({ t, n, alts, narrating, onClose, onShowFiles }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="drawer-veil" onClick={onClose} />
      <aside className="drawer tool-sheet" aria-label={t.name}>
        <div className="dr-top"><span className="dr-layer">{CATS[t.cat]?.[0] || t.cat}</span><button className="ib dr-x" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="ts-id">
          <Brand slug={t.slug} name={t.name} color={t.color} size={58} />
          <div><h3>{t.name}</h3><span>{CATS[t.cat]?.[1] || ''}</span></div>
        </div>
        <div className="ts-block"><div className="mini-h">what it does here</div><p>{n?.role || t.what}</p></div>
        {n?.why ? <div className="ts-block"><div className="mini-h">why this one</div><div className="ts-p"><Md text={n.why} /></div></div> : narrating ? <div className="ts-block"><div className="shimmer" /></div> : null}
        {alts.length > 0 && (
          <div className="ts-block">
            <div className="mini-h">it could have been</div>
            {alts.map((a) => <div key={a.name} className="ts-alt"><Brand slug={a.tool?.slug} name={a.name} color={a.tool?.color} size={30} /><div><b>{a.name}</b><span>{a.when || a.tool?.when || ''}</span></div></div>)}
          </div>
        )}
        {t.used?.length > 0 && <div className="ts-go"><button className="btn" onClick={() => onShowFiles([...t.used, `s:${t.id}`])}>Show the {t.used.length} file{t.used.length === 1 ? '' : 's'} that use it</button></div>}
      </aside>
    </>
  );
}

// where the plain-words part ends and the technical side begins
export function UnderHood() {
  return (
    <div className="ph-under" role="separator">
      <span className="ph-under-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" /></svg></span>
      <div><b>Under the hood</b><span>The technical side: the code itself, where it could break, and why it’s built this way.</span></div>
    </div>
  );
}
