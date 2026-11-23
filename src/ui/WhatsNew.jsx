import { useDialog } from './a11y.js';
import CHANGELOG from '../../CHANGELOG.md?raw';
import { t } from '../i18n.js';
import { notesFor as notesIn } from '../notes.js';
const notesFor = (v) => notesIn(v, CHANGELOG);

// "What's new in 0.3.2", inside Bento: that version's part of CHANGELOG.md (shipped with the app, so it works offline),
// with the full notes on GitHub one click away.
// **bold** and `code`, as elements (never as HTML)
const Rich = ({ s }) => String(s).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => (/^\*\*/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : /^`/.test(p) ? <code key={i}>{p.slice(1, -1)}</code> : p));

export default function WhatsNew({ version, onClose }) {
  const box = useDialog(onClose);
  const n = notesFor(version);
  const url = `https://github.com/lhz56/bento-releases/releases/tag/v${version}`;
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div className="keys whatsnew" ref={box} role="dialog" aria-modal="true" aria-labelledby="wn-title" onMouseDown={(e) => e.stopPropagation()}>
        <p className="wn-kick">{t('Bento updated itself')}</p>
        <h2 id="wn-title">{t('What’s new in')} {version}</h2>
        {n?.intro && <p className="wn-intro"><Rich s={n.intro} /></p>}
        {n?.items?.length ? <ul className="wn-list">{n.items.slice(0, 8).map((it, i) => <li key={i}><Rich s={it} /></li>)}</ul> : <p className="wn-intro">{t('Fixes and polish.')}</p>}
        <div className="wn-end">
          <button className="link small" onClick={() => window.bento?.openExternal?.(url)}>{t('Full notes on GitHub')} ↗</button>
          <button className="btn" onClick={onClose} autoFocus>{t('Got it')}</button>
        </div>
      </div>
    </div>
  );
}
