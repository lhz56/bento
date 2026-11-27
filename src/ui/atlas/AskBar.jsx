// Asking about a project: the conversation box (kept per project between visits) and the banner for a question
// that brought you here from elsewhere.
import { useState, useEffect, useRef } from 'react';
import { fmtN } from '../../atlas/analyze.js';
import { t } from '../../i18n.js';
import { keys, mod } from '../../platform.js';
import { save } from '../../store.js';
import Md from '../Md.jsx';

// Why you're here: you asked about a real project, and this is its real code (found on your Mac or on GitHub)
const asIcon = (asked, atlas) =>
  asked.d?.pick?.app?.icon ||
  atlas.meta?.avatar ||
  (asked.d?.pick?.full
    ? `https://avatars.githubusercontent.com/${asked.d.pick.full.split('/')[0]}?size=96`
    : null);

export function AskedBanner({ asked, atlas, onIdeaInstead, onClose, waiting }) {
  const pick = asked.d?.pick || {};
  const icon = asIcon(asked, atlas);
  const home = (p) => String(p || '').replace(/^\/Users\/[^/]+/, '~');
  return (
    <div className={`asked fade-in ${waiting ? 'waiting' : ''}`} role="status">
      {icon ? (
        <img className="asked-ic" src={icon} alt="" />
      ) : (
        <span className="asked-ic ph" aria-hidden="true">
          ?
        </span>
      )}
      <div className="asked-t">
        <b>“{asked.q.length > 90 ? asked.q.slice(0, 90) + '…' : asked.q}”</b>
        <span className="asked-why">
          {pick.app && (
            <span className="aw-chip mac">
              ✓ {pick.app.app}
              {pick.app.version ? ` ${pick.app.version}` : ''} {t('is on this Mac')}
            </span>
          )}
          {pick.local && (
            <span className="aw-chip mac">
              ✓ {t('your copy')} · {home(pick.local.root)}
            </span>
          )}
          {asked.d?.why === 'recent' && (
            <span className="aw-chip mac">↩ {t('you were just reading it')}</span>
          )}
          {asked.d?.why === 'named' && (
            <span className="aw-chip mac">↩ {t('you opened it before')}</span>
          )}
          {pick.full && (
            <span className="aw-chip">
              {pick.full}
              {pick.stars ? ` · ★ ${fmtN(pick.stars)}` : ''}
            </span>
          )}
          <span className="aw-say">
            {waiting
              ? t('Answering from its real code as soon as it’s in…')
              : t('Here’s its real code. Your answer is in the box below; ask follow-ups there.')}
          </span>
        </span>
      </div>
      <button className="link" onClick={() => onIdeaInstead?.(asked.q)}>
        {t('Just the idea instead')}
      </button>
      {onClose && (
        <button className="ib" aria-label={t('Close')} onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}

// Ask about the repo and keep talking: quick answers from the real files (a few seconds), each one remembered,
// so follow-ups make sense. File names are buttons. ⌘↵ turns any question into a full lesson.
const askedOnce = new Set();

const okPath = (f) =>
  typeof f === 'string' && /^[\w@.\-+/ ]+$/.test(f) && !f.includes('..') && /\.[a-z0-9]+$/i.test(f);

const DO =
  /^(?:(?:can|could) you |please |let'?s |lets |i want to |help me )?(?:build|make|add|create|write|implement|change|modify|refactor|extend|port|clone|recreate|rebuild|fix)\b/i;

// each project's conversation is kept (last 8 questions), so it's still there when you come back
const THREADS = 'bento.atlasThreads';

const loadThread = (k) => {
  try {
    return (JSON.parse(localStorage.getItem(THREADS) || '{}')[k] || []).filter((x) => !x.loading);
  } catch {
    return [];
  }
};

const saveThread = (k, th) => {
  try {
    const all = JSON.parse(localStorage.getItem(THREADS) || '{}');
    const keep = th.filter((x) => !x.loading).slice(-8);
    if (!keep.length && !all[k]) return;
    all[k] = keep;
    const keys = Object.keys(all);
    if (keys.length > 30) delete all[keys[0]];
    save(THREADS, all);
  } catch {}
}; // also mirrored to disk

export function AskBar({ name, threadKey, onAsk, onQuick, onOpen, initial, onFeature }) {
  const [v, setV] = useState('');
  const [thread, setThread] = useState(() => loadThread(threadKey)); // [{ id, q, loading, a, files }]
  useEffect(() => {
    saveThread(threadKey, thread);
  }, [thread, threadKey]);
  // browser storage can lose the last writes if the app is closed abruptly; the copy on disk fills in
  useEffect(() => {
    if (thread.length) return;
    window.bento
      ?.storeGet?.()
      .then((d) => {
        const th = (d?.[THREADS]?.[threadKey] || []).filter((x) => !x.loading);
        if (th.length) setThread((cur) => (cur.length ? cur : th));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the saved conversation loads when you open another project, unless one is already showing
  }, [threadKey]);
  const [opened, setOpened] = useState(null); // an earlier answer you reopened (the latest one is always open)
  const list = useRef(null);
  const inp = useRef(null);
  const ask = async (question, full) => {
    question = String(question || '').trim();
    if (!question) return;
    if (full || !onQuick) return onAsk(question);
    const id = Date.now() + Math.random();
    const history = thread.filter((x) => !x.loading && x.a).map(({ q: hq, a }) => ({ q: hq, a }));
    setThread((th) => [...th.slice(-7), { id, q: question, loading: true }]);
    let r;
    try {
      r = await onQuick(question, history);
    } catch {
      r = {
        a: `That didn’t work. Try again, or press ${keys('⌘↵')} for a full lesson.`,
        files: [],
      };
    }
    setThread((th) => th.map((x) => (x.id === id ? { ...x, loading: false, ...r } : x)));
  };
  const submit = (full) => {
    const q = v.trim();
    if (!q) return;
    setV('');
    ask(q, full);
  };
  // the question you came with is asked for you, once, as soon as the code is here
  useEffect(() => {
    if (initial?.q && !askedOnce.has(initial.at)) {
      askedOnce.add(initial.at);
      ask(initial.q, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a question that brought you here is asked once, when it arrives
  }, [initial?.at]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [thread]);
  const busy = thread.some((x) => x.loading);
  const [min, setMin] = useState(false);
  useEffect(() => {
    if (busy) setMin(false);
  }, [busy]);
  const form = (
    <form
      className="fu"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <span className="ask-ic" aria-hidden="true">
        ?
      </span>
      <svg className="ask-spark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"
          fill="currentColor"
        />
      </svg>
      <input
        id="atlas-ask"
        ref={inp}
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-busy={busy || undefined}
        placeholder={thread.length ? t('Ask a follow-up…') : `Ask anything about ${name}…`}
        aria-label={thread.length ? t('Ask a follow-up') : `Ask anything about ${name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mod(e)) {
            e.preventDefault();
            submit(true);
          }
        }}
      />
      <kbd aria-hidden="true">↵</kbd>
      <button className="ask-go" aria-label={t('Ask')} disabled={!v.trim()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 19V5M6 11l6-6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
  // a conversation sits beside the code (the page makes room), so you can read and ask at the same time
  if (thread.length && min)
    return (
      <div className="atlas-ask">
        <button
          className="aq-pill"
          onClick={() => {
            setMin(false);
            setTimeout(() => inp.current?.focus(), 50);
          }}
        >
          💬 {t('Your conversation')} · {thread.length}
        </button>
      </div>
    );
  if (!thread.length) return <div className="atlas-ask">{form}</div>;
  return (
    <div className="atlas-ask docked">
      <aside className="aq-dock" aria-label={`${t('Conversation about')} ${name}`}>
        <div className="aq-dock-h">
          <span className="mini-h">
            {t('asking about')} <b>{name}</b>
          </span>
          <button
            className="ib"
            aria-label={t('Make it small')}
            title={t('Make it small')}
            onClick={() => setMin(true)}
          >
            –
          </button>
          <button
            className="ib"
            aria-label={t('Close the conversation')}
            title={t('Clear the conversation')}
            onClick={() => setThread([])}
          >
            ✕
          </button>
        </div>
        <div className="aq-thread" ref={list} aria-live="polite">
          {thread.map((x, i) =>
            i < thread.length - 1 && opened !== x.id ? (
              <button
                key={x.id}
                className="aq-turn aq-folded"
                onClick={() => setOpened(x.id)}
                aria-expanded="false"
              >
                <span className="aq-q">{x.q}</span>
                <span aria-hidden="true">▸</span>
              </button>
            ) : (
              <div key={x.id} className="aq-turn">
                <div className="aq-q">
                  {x.q}
                  {i < thread.length - 1 && (
                    <button className="link" onClick={() => setOpened(null)}>
                      {t('fold')}
                    </button>
                  )}
                </div>
                {x.loading ? (
                  <div className="writing">
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                    {t('Reading the code…')}
                  </div>
                ) : (
                  <>
                    <div className="aq-a">
                      <Md text={x.a} />
                    </div>
                    {x.files?.filter(okPath).length > 0 && (
                      <div className="aq-files">
                        {x.files.filter(okPath).map((f) => (
                          <button
                            key={f}
                            className="file-chip"
                            title={f}
                            aria-label={`Open ${f}`}
                            onClick={() => onOpen(f)}
                          >
                            {f.split('/').length > 2 ? `…/${f.split('/').slice(-2).join('/')}` : f}
                          </button>
                        ))}
                      </div>
                    )}
                    {onFeature && DO.test(x.q) ? (
                      <button className="btn tiny aq-do" onClick={() => onFeature(x.q)}>
                        ✦ {t('Build it with me, step by step')} →
                      </button>
                    ) : null}
                    <button className="qa-more" onClick={() => onAsk(x.q)}>
                      {t('Turn this into a full lesson with the code')} →
                    </button>
                  </>
                )}
              </div>
            ),
          )}
        </div>
        {form}
      </aside>
    </div>
  );
}
