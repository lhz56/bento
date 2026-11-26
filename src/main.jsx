// startup timings (scripts/measure-startup.mjs reads them): the page's code has loaded and starts running
performance.mark('bento:js');
// first of all: on a phone or iPad, window.bento is Bento on your Mac, reached over the network (remote.js)
import './remote.js';
import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './mobile.css';
import { IS_MAC } from './platform.js';
import { startStill } from './still.js';
import Hosted from './ui/Hosted.jsx';
import { winWords } from './winwords.js';
import { WEB, count } from './web.js';
import WebBar from './ui/WebBar.jsx';
// macOS draws its window buttons over the top-left corner: pages leave room for them when the sidebar is closed
if (IS_MAC) document.body.classList.add('mac');
// Windows: Bento's own screens say "PC" where they'd say "Mac" (winwords.js)
if (window.bento && !window.bentoRemote && /Win/.test(navigator.platform || '')) winWords();

if (!window.bento) document.body.classList.add('browser');
// takeitapart.app/try: the app in any browser, with what ships already written (web.js)
if (WEB) {
  document.body.classList.add('web');
  count('try_open');
}
// a phone or iPad using Bento on a Mac; and anything driven by touch gets bigger targets and no hover-only details
if (window.bentoRemote) document.body.classList.add('remote');
const coarse = matchMedia('(pointer: coarse)');
const touch = () => document.body.classList.toggle('touch', coarse.matches);
touch();
coarse.addEventListener?.('change', touch);
// Anything the Content-Security-Policy (index.html) blocks is a feature that's broken: it's noted where the tests look
// (a "bento:csp" mark, and the console), and they fail on it.
addEventListener('securitypolicyviolation', (e) => {
  const what = `${e.effectiveDirective} ${String(e.blockedURI || '').slice(0, 80)}`;
  performance.mark(`bento:csp ${what}`);
  console.error(`Blocked by the Content-Security-Policy: ${what}`);
});
// pause decorative motion while you're not looking (battery); see still.js
startStill();
// hold ⌥ to reveal draggable numbers
addEventListener('keydown', (e) => {
  if (e.key === 'Alt') document.body.classList.add('alt');
});
addEventListener('keyup', (e) => {
  if (e.key === 'Alt') document.body.classList.remove('alt');
});
addEventListener('blur', () => document.body.classList.remove('alt'));

// If something breaks while drawing the screen, say so kindly and offer a way back, instead of a white window.
class Safety extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('Bento crashed while drawing:', err, info?.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="crash">
        <div className="onb-logo mini">
          <span className="b1" />
          <span className="b2" />
          <span className="b3" />
        </div>
        <h2>Something went wrong drawing this screen.</h2>
        <p>Your lessons, words and progress are safe on this Mac.</p>
        <pre>{String(this.state.err?.message || this.state.err).slice(0, 300)}</pre>
        <div className="crash-acts">
          <button
            className="btn"
            onClick={() => {
              localStorage.setItem('bento.view', 'home');
              location.reload();
            }}
          >
            Back to Home
          </button>
          <button className="btn ghost" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <Safety>
    {window.bentoRemote ? (
      <Hosted>
        <App />
      </Hosted>
    ) : (
      <App />
    )}
    {WEB && <WebBar />}
  </Safety>,
);
