// ⌘/ : every shortcut on one card
import { useDialog } from './a11y.js';
import { keys } from '../platform.js';

const KEYS = [
  ['⌘K', 'Search everything, ask, or paste a repo'],
  ['⌘N', 'New question'],
  ['⌘[ / ⌘]', 'Back / forward'],
  ['⌘F', 'Find on this page'],
  ['⌘\\', 'Show or hide the sidebar'],
  ['⌘,', 'Settings'],
  ['⌘/', 'This list'],
  ['⌘L', 'Jump to the ask box'],
  ['⌘↵', 'Run the code'],
  ['⌘⇧↵', 'Step through it'],
  ['↵ / ⌘↵', 'In a lesson: quick answer / full lesson'],
  ['⌥ drag', 'Scrub any number in the code'],
  ['select text', 'Explain anything you highlight'],
  ['Esc', 'Close panels'],
  ['?', 'This sheet'],
];
export default function KeySheet({ onClose }) {
  const box = useDialog(onClose);
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div
        className="keys"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="keys-title">Keyboard</h2>
        <dl>
          {KEYS.map(([combo, d]) => (
            <div key={combo} className="key-row">
              <dt>
                <kbd>{keys(combo)}</kbd>
              </dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
