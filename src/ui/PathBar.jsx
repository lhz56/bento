import { t } from '../i18n.js';
// Where you are on a path, on whatever a stop opened (a lesson, a playground, Explore): the path's name, a dot per
// stop, and the stops either side, so following a path never leaves you stranded
export default function PathBar({ info, onPage, onStop }) {
  if (!info) return null;
  const { name, i, stops, done } = info; const prev = stops[i - 1], next = stops[i + 1];
  return (
    <div className="pathbar fade-in">
      <button className="pb-name" onClick={onPage} title={t('See the whole path')}>⤳ {t(name)}</button>
      <span className="pb-dots" aria-label={`${t('Stop')} ${i + 1} ${t('of')} ${stops.length}, ${done} ${t('started')}`}>{stops.map((x, k) => <i key={x.id} className={k === i ? 'now' : k < i ? 'past' : ''} title={x.t} />)}</span>
      <span className="pb-at">{t('Stop')} {i + 1}/{stops.length} · <b>{stops[i]?.t || ''}</b></span>
      <span className="pb-nav">
        {prev && <button className="ib" onClick={() => onStop(prev)} aria-label={`${t('Previous stop')}: ${prev.t}`} title={prev.t}>←</button>}
        {next ? <button className="btn tiny" onClick={() => onStop(next)} title={next.t}>{t('Next stop')} →</button> : <button className="btn tiny ghost" onClick={onPage}>{t('Finish line')} 🏁</button>}
      </span>
    </div>
  );
}
