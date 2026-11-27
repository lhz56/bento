// Your first real contribution: find a beginner-friendly issue, understand it in plain words,
// see which files it touches, and get the real steps (fork → branch → fix → pull request).
import { useState } from 'react';
import { t } from '../i18n.js';

const ago = (iso) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days < 1
    ? 'today'
    : days < 30
      ? `${days}d ago`
      : days < 365
        ? `${Math.floor(days / 30)}mo ago`
        : `${Math.floor(days / 365)}y ago`;
};

export default function Contribute({ full, onPlan, onOpen, onOpenUrl, pathIdx }) {
  const [st, setSt] = useState(null); // null | 'loading' | { err } | { issues }
  const [sel, setSel] = useState(null);
  const [plan, setPlan] = useState(null);
  if (!window.bento?.ghIssues || !full) return null;
  const find = async () => {
    setSt('loading');
    try {
      setSt({ issues: await window.bento.ghIssues(full) });
    } catch (e) {
      setSt({
        err: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''),
      });
    }
  };
  const pick = async (iss) => {
    setSel(iss);
    setPlan(onPlan ? 'loading' : null);
    if (onPlan) {
      try {
        setPlan(await onPlan(iss));
      } catch (e) {
        setPlan({ err: e.message });
      }
    }
  };
  const [, name] = full.split('/');
  const cmds = sel
    ? [
        ['Make your own copy on GitHub (a fork)', `gh repo fork ${full} --clone`],
        ['Go into it', `cd ${name}`],
        ['Start a branch for this fix', `git switch -c fix-${sel.n}`],
        [
          '…change the files, then save a snapshot',
          `git add . && git commit -m "Fix #${sel.n}: ${sel.title.replace(/"/g, "'").slice(0, 50)}"`,
        ],
        ['Send it to your copy', `git push -u origin fix-${sel.n}`],
        ['Ask the project to take it (a pull request)', `gh pr create --repo ${full} --fill`],
      ]
    : [];
  return (
    <section className="asec" id="sec-help">
      <div className="sec-head">
        <div>
          <div className="kicker">{t('help out')}</div>
          <h2>{t('Your first real contribution')}</h2>
          <p className="sec-sub">
            {t(
              'Real projects label small, friendly tasks for newcomers. Pick one, understand it, and Bento walks you to a pull request.',
            )}
          </p>
        </div>
      </div>
      {!st && (
        <button className="btn" onClick={find}>
          🔍 {t('Find a first issue in')} {name}
        </button>
      )}
      {st === 'loading' && (
        <div className="grow-load">
          <span className="lens-spin" /> {t('Looking for good first issues…')}
        </div>
      )}
      {st?.err && (
        <div className="err-card">
          <span className="err-msg">{st.err}</span>
        </div>
      )}
      {st?.issues && !st.issues.length && (
        <div className="muted">
          {t('No open issues are labelled for newcomers right now. Try another project, like')}{' '}
          <code>pallets/flask</code> {t('or')} <code>excalidraw/excalidraw</code>.
        </div>
      )}
      {st?.issues?.length > 0 && (
        <div className={`contrib ${sel ? 'has-sel' : ''}`}>
          <div className="iss-list">
            {st.issues.map((x) => (
              <button
                key={x.n}
                className={`iss ${sel?.n === x.n ? 'on' : ''}`}
                onClick={() => pick(x)}
              >
                <span className="iss-n">#{x.n}</span>
                <b>{x.title}</b>
                <span className="iss-meta">
                  {x.labels.slice(0, 3).map((l) => (
                    <i key={l}>{l}</i>
                  ))}
                  <em>
                    {ago(x.at)} · 💬 {x.comments}
                    {x.assigned ? ` · ${t('someone is on it')}` : ''}
                  </em>
                </span>
              </button>
            ))}
          </div>
          {sel && (
            <div className="iss-plan fade-in">
              <div className="ip-h">
                <b>
                  #{sel.n} {sel.title}
                </b>
                <button className="link" onClick={() => onOpenUrl(sel.url)}>
                  {t('Open on GitHub')} ↗
                </button>
              </div>
              {plan === 'loading' && (
                <div className="grow-load">
                  <span className="lens-spin" /> {t('Reading the issue and the code…')}
                </div>
              )}
              {plan?.err && <div className="muted small">{plan.err}</div>}
              {plan?.plain && (
                <>
                  <p className="ip-plain">{plan.plain}</p>
                  {plan.files?.length > 0 && (
                    <div className="ip-files">
                      <span className="mini-h">{t('start with these files')}</span>
                      {plan.files.map((file) => (
                        <button
                          key={file}
                          className={`chip ${pathIdx?.has(file) ? '' : 'dim'}`}
                          onClick={() => pathIdx?.has(file) && onOpen(file)}
                        >
                          {file}
                        </button>
                      ))}
                    </div>
                  )}
                  {plan.steps?.length > 0 && (
                    <ol className="ip-steps">
                      {plan.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {plan.skills?.length > 0 && (
                    <div className="ip-skills">
                      {t('You’ll practise')}: {plan.skills.join(' · ')}
                    </div>
                  )}
                </>
              )}
              <div className="mini-h" style={{ marginTop: 10 }}>
                {t('the real steps, in your terminal')}
              </div>
              <div className="ip-cmds">
                {cmds.map(([what, cmd]) => (
                  <div key={cmd} className="ip-cmd">
                    <span>{t(what)}</span>
                    <code>{cmd}</code>
                    <button className="link" onClick={() => navigator.clipboard?.writeText(cmd)}>
                      {t('copy')}
                    </button>
                  </div>
                ))}
              </div>
              <div className="muted small">
                {t(
                  'New to these commands? Practise them safely in Playgrounds → Terminal & Git first.',
                )}{' '}
                {t('Say hi on the issue before you start, so nobody does the same work twice.')}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
