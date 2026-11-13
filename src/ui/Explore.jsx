import { useEffect, useRef, useState } from 'react';
import { t, tx } from '../i18n.js';
import { sizeWord, fmtN, langColor } from '../atlas/analyze.js';
import FEATURED from '../atlas-featured.json';

// Shelves are searches, not hand-picked repos, so they're always fresh and always real.
const monthAgo = () => { const d = new Date(Date.now() - 30 * 864e5); return d.toISOString().slice(0, 10); };
const SHELVES = [
  ['New this month', () => `created:>${monthAgo()}`, '🆕', null, { stars: '>100' }],
  ['Tiny games', 'topic:game', '🎮', 'javascript', { stars: '>50' }], ['To-do apps', 'todo app react', '✓'], ['Discord bots', 'discord bot', '🤖', 'python'],
  ['Chrome extensions', 'chrome extension', '🧩', 'javascript'], ['Portfolio sites', 'portfolio nextjs', '✦'], ['AI chat apps', 'ai chatbot nextjs', '✳'],
  ['Chat apps', 'realtime chat socket.io', '💬'], ['Markdown editors', 'markdown editor', '✎'], ['CLI tools', 'command line tool', '⌘', 'python'], ['Weather apps', 'weather app', '☀'],
];
const PH = ['a todo app in React', 'github.com/pallets/flask', 'any website, like stripe.com', 'discord bot', 'a pomodoro timer', 'owner/repo', 'a snake game'];
export const parseSite = (s) => { const t = String(s || '').trim(); if (/github\.com/i.test(t) || /\s/.test(t)) return null; const m = /^(https?:\/\/)?((?:[\w-]+\.)+[a-z]{2,})(\/\S*)?$/i.exec(t); return m ? (m[1] ? t : `https://${t}`) : null; };
export const parseBlob = (s) => { const m = /github\.com\/([\w.-]+\/[\w.-]+)\/(?:blob|tree)\/[^/]+\/(.+?)(?:[?#].*)?$/.exec(String(s || '').trim()); return m ? { full: m[1], path: decodeURIComponent(m[2]) } : null; };
export const parseRepo = (s) => {
  const t = String(s || '').trim().replace(/\.git$/, '').replace(/\/$/, '');
  const m = /(?:github\.com[/:])([\w.-]+)\/([\w.-]+)/.exec(t) || /^([\w-]+)\/([\w.-]+)$/.exec(t);
  return m ? `${m[1]}/${m[2]}` : null;
};

export default function Explore({ top, api, onOpenAt, onCompare, onOpenSite, onOpenRepo, onOpenFolder, projects, onOpenProject, repos, loadRepos, user }) {
  const [q, setQ] = useState('');
  const [shelf, setShelf] = useState(1);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ph, setPh] = useState(0);
  const inp = useRef(null);
  const reqId = useRef(0);
  useEffect(() => { loadRepos?.(); const t = setInterval(() => setPh((p) => p + 1), 3000); inp.current?.focus(); return () => clearInterval(t); }, []);
  const search = async (query, opts = {}) => {
    const id = ++reqId.current; setBusy(true); setErr(null);
    try { const r = await api.ghSearch(query, { limit: 18, ...opts }); if (id === reqId.current) setRes({ q: query, items: r }); }
    catch (e) { if (id === reqId.current) setErr(e.message); }
    finally { if (id === reqId.current) setBusy(false); }
  };
  useEffect(() => { if (shelf == null) return; const [, q, , language, extra] = SHELVES[shelf]; search(typeof q === 'function' ? q() : q, { stars: '>20', size: '<40000', language, ...(extra || {}) }); }, [shelf]);
  const repo = parseRepo(q); const site = !repo && parseSite(q);
  const submit = (e) => { e.preventDefault(); const blob = parseBlob(q); if (blob && onOpenAt) return onOpenAt(blob.full, blob.path); if (repo) return onOpenRepo(repo); if (site) return onOpenSite(site); if (q.trim()) { setShelf(null); search(q.trim()); } };

  return (
    <div className="explore">
      <div className="ex-inner">
        {top}
        <div className="hello">{t('Explore')}</div>
        <h1 className="home-h">{tx('Take apart *any* app.')}</h1>
        <p className="ex-sub">{t('Search open source, paste a GitHub link, or paste any website. Bento shows what every part does, how the parts connect, which outside tools it leans on, and why it was built that way.')}</p>

        <form className={`ex-search ${repo || site ? 'is-repo' : ''}`} onSubmit={submit}>
          <span className="ex-ic">{repo ? '⌥' : site ? '◎' : '⌕'}</span>
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Try “${PH[ph % PH.length]}”`} />
          <button className="send" disabled={!q.trim()}>{repo ? <>Take apart <b>{repo.split('/')[1]}</b></> : site ? <>Take apart <b>{new URL(site).hostname.replace(/^www\./, '')}</b></> : 'Search'}<kbd>↵</kbd></button>
        </form>

        <div className="site-try"><span>or take apart a website you use:</span>{['stripe.com', 'airbnb.com', 'wikipedia.org', 'nytimes.com', 'linear.app'].map((d) => <button key={d} onClick={() => onOpenSite(`https://${d}`)}>{d}</button>)}</div>
        <div className="shelves">
          {SHELVES.map(([l, , ic], i) => <button key={l} className={`shelf ${shelf === i ? 'on' : ''}`} onClick={() => { setShelf(i); setQ(''); }}><span>{ic}</span>{l}</button>)}
        </div>

        <div className="ex-cols">
          <div className="ex-results">
            <div className="mini-h">{shelf != null ? `${SHELVES[shelf][0].toLowerCase()} · small enough to read` : `results for “${res?.q || q}”`}{busy && <span className="lens-spin" style={{ display: 'inline-block', marginLeft: 8 }} />}</div>
            {err && <div className="story-err">{err}</div>}
            {!res && !err && Array.from({ length: 5 }, (_, i) => <div key={i} className="spec ghost"><span className="spec-av" /><div className="spec-main"><div className="shimmer" style={{ width: '40%' }} /><div className="shimmer short" /></div></div>)}
            {res?.items.length === 0 && <div className="muted pad">Nothing found. Try fewer words.</div>}
            <div className={busy ? 'faded' : ''}>
              {res?.items.map((r) => (
                <button key={r.full} className="spec" onClick={() => onOpenRepo(r.full)}>
                  <img className="spec-av" src={`https://avatars.githubusercontent.com/${r.owner}?s=72`} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <div className="spec-main">
                    <div className="spec-name"><span className="muted">{r.owner}/</span>{r.full.split('/')[1]}</div>
                    {r.description && <div className="spec-desc">{r.description}</div>}
                    <div className="spec-meta">
                      {r.language && <span><span className="ldot" style={{ background: langColor(r.language) }} />{r.language}</span>}
                      <span>★ {fmtN(r.stars)}</span>
                      {r.size != null && <span className={`sz sz-${r.size < 600 ? 0 : r.size < 6000 ? 1 : r.size < 60000 ? 2 : 3}`}>{sizeWord(r.size)}</span>}
                    </div>
                  </div>
                  <span className="spec-go">{projects.some((x) => x.full === r.full) ? <>Open again <span>→</span></> : <>Take apart <span>→</span></>}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="ex-side" aria-label="Your projects">
            {Object.keys(FEATURED).length > 0 && (
              <div className="ex-box feat">
                <div className="mini-h">ready instantly</div>
                {Object.entries(FEATURED).map(([k, f]) => (
                  <button key={k} className="feat-i" onClick={() => onOpenRepo(k)}>
                    <img src={f.meta?.avatar} alt="" />
                    <span><b>{k.split('/')[1]}</b><i>{f.narr?.gist?.kind || ''}</i></span>
                    <em>→</em>
                  </button>
                ))}
              </div>
            )}
            {projects.length > 1 && <button className="cmp-cta" onClick={onCompare}><span>⇄</span><b>Compare two apps</b><i>Same job, different choices</i></button>}
            {projects.length > 0 && (
              <div className="ex-box">
                <div className="mini-h">taken apart before</div>
                {projects.slice(0, 6).map((p) => <button key={p.key} className="ex-proj" onClick={() => onOpenProject(p)}><span className="ldot" style={{ background: langColor(p.lang) }} />{p.name}</button>)}
              </div>
            )}
            <div className="ex-box">
              <div className="mini-h">your own code</div>
              {!api?.remote && <button className="ex-proj strong" onClick={onOpenFolder}><span className="ex-pi">▢</span>Open a folder on this Mac…</button>}
              {user && !repos && <div className="muted small pad">Loading your repos…</div>}
              {!user && <div className="muted small" style={{ padding: '4px 2px' }}>Sign in with <code>gh auth login</code> to see your GitHub repos here.</div>}
              {(repos || []).slice(0, 12).map((r) => <button key={r.nameWithOwner} className="ex-proj" onClick={() => onOpenRepo(r.nameWithOwner)}><span className="ldot" style={{ background: langColor(r.primaryLanguage?.name) }} />{r.name}{r.isPrivate && <span className="priv">private</span>}</button>)}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
