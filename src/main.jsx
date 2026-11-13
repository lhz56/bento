// startup timings (scripts/measure-startup.mjs reads them): the page's code has loaded and starts running
performance.mark('bento:js');
import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { IS_MAC } from './platform.js';
import { startStill } from './still.js';
// macOS draws its window buttons over the top-left corner: pages leave room for them when the sidebar is closed
if (IS_MAC) document.body.classList.add('mac');

if (!window.bento) document.body.classList.add('browser');
// pause decorative motion while you're not looking (battery); see still.js
startStill();
// hold ⌥ to reveal draggable numbers
addEventListener('keydown', (e) => { if (e.key === 'Alt') document.body.classList.add('alt'); });
addEventListener('keyup', (e) => { if (e.key === 'Alt') document.body.classList.remove('alt'); });
addEventListener('blur', () => document.body.classList.remove('alt'));

// If something breaks while drawing the screen, say so kindly and offer a way back, instead of a white window.
class Safety extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('Bento crashed while drawing:', err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="crash">
        <div className="onb-logo mini"><span className="b1" /><span className="b2" /><span className="b3" /></div>
        <h2>Something went wrong drawing this screen.</h2>
        <p>Your lessons, words and progress are safe on this Mac.</p>
        <pre>{String(this.state.err?.message || this.state.err).slice(0, 300)}</pre>
        <div className="crash-acts">
          <button className="btn" onClick={() => { localStorage.setItem('bento.view', 'home'); location.reload(); }}>Back to Home</button>
          <button className="btn ghost" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(<Safety><App /></Safety>);
