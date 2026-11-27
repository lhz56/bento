// "What's new in 0.3.2", inside Bento: that version's part of CHANGELOG.md (shipped with the app, so it works offline),
// with the full notes on GitHub one click away.
import { useDialog } from './a11y.js';
import CHANGELOG from '../../CHANGELOG.md?raw';
import { t } from '../i18n.js';
import { notesFor as notesIn } from '../notes.js';
const notesFor = (v) => notesIn(v, CHANGELOG);

// **bold** and `code`, as elements (never as HTML)
const Rich = ({ text }) =>
  String(text)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      /^\*\*/.test(part) ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : /^`/.test(part) ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );

export default function WhatsNew({ version, onClose }) {
  const box = useDialog(onClose);
  const notes = notesFor(version);
  const url = `https://github.com/lhz56/bento-releases/releases/tag/v${version}`;
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div
        className="keys whatsnew"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wn-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="wn-kick">{t('Bento updated itself')}</p>
        <h2 id="wn-title">
          {t('What’s new in')} {version}
        </h2>
        {notes?.intro && (
          <p className="wn-intro">
            <Rich text={notes.intro} />
          </p>
        )}
        {notes?.items?.length ? (
          <ul className="wn-list">
            {notes.items.slice(0, 8).map((it, i) => (
              <li key={i}>
                <Rich text={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="wn-intro">{t('Fixes and polish.')}</p>
        )}
        <div className="wn-end">
          <button className="link small" onClick={() => window.bento?.openExternal?.(url)}>
            {t('Full notes on GitHub')} ↗
          </button>
          <button className="btn" onClick={onClose} autoFocus>
            {t('Got it')}
          </button>
        </div>
      </div>
    </div>
  );
}
