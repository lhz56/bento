// On a phone or iPad (see remote.js): pair with Bento on your Mac once, then it's Bento, with the Mac doing the work.
import { useEffect, useState } from 'react';
import { deviceName } from '../remote.js';
import { STANDALONE, IN_APP, native } from './touch.js';

const remote = () => window.bentoRemote;

function useRemote() {
  const [st, setSt] = useState(() => ({ state: remote().state, host: remote().host }));
  // (read it again once listening: the state can change between the first render and this effect)
  useEffect(() => {
    const off = remote().on((state, host) => setSt({ state, host }));
    setSt({ state: remote().state, host: remote().host });
    return off;
  }, []);
  return st;
}

// the QR code on the Mac opens .../#pair=CODE: pair straight away, and take the code out of the address
const codeInLink = () => {
  const m = /#pair=([0-9A-Za-z-]{4,20})/.exec(location.hash);
  return m ? m[1] : '';
};

function Pair() {
  // (or the code a link brought while this device still had a key, which turned out to be stale: remote.js)
  const [spare] = useState(() => (codeInLink() ? '' : remote().takeSpareCode?.() || ''));
  const [fromLink] = useState(() => codeInLink() || spare);
  const [code, setCode] = useState(fromLink);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (c = code) => {
    if (!c.trim() || busy) return;
    setBusy(true);
    setErr('');
    // the code leaves the address at once (Bento may be on screen before pairing has quite finished; and this keeps the page's history)
    if (/^#pair=/.test(location.hash))
      history.replaceState(history.state, '', location.pathname + location.search);
    try {
      await remote().pair(c, deviceName());
    } catch (e) {
      // in Bento Code, the app connects again its own way (Allow on the Mac), never with this page's form
      if (IN_APP) {
        native('unpaired', { why: e.message });
        return;
      }
      setBusy(false);
      if (c === spare) setCode('');
      else setErr(e.message); // an old Home Screen code: just the pairing screen, no error
    }
  };
  useEffect(() => {
    if (fromLink) go(fromLink);
    else if (IN_APP) native('unpaired');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- pairs once, with the code the link brought
  // the pairing screen is already open and the QR code is scanned: Safari may only change the address's #pair=…
  useEffect(() => {
    const h = () => {
      const c = codeInLink();
      if (c) {
        setCode(c);
        go(c);
      }
    };
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  });
  const shown = code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
  return (
    <div className="pair">
      <div className="pair-art" aria-hidden="true">
        <div className="pair-dev phone">
          <div className="onb-logo mini">
            <span className="b1" />
            <span className="b2" />
            <span className="b3" />
          </div>
        </div>
        <div className="pair-wire">
          <i />
          <i />
          <i />
        </div>
        <div className="pair-dev mac">
          <span className="pair-ai">✳</span>
          <span className="pair-ai c">c</span>
        </div>
      </div>
      <h1>
        Bento, on this{' '}
        {deviceName() === 'iPad' ? 'iPad' : deviceName() === 'iPhone' ? 'iPhone' : 'device'}
      </h1>
      <p className="pair-sub">Your Mac does the work, with the AI you already have.</p>
      {(fromLink && busy) || IN_APP ? (
        <p className="pair-wait" role="status">
          <span className="spin" /> Connecting to your Mac…
        </p>
      ) : (
        <form
          className="pair-form"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <ol className="pair-steps">
            <li>
              On your Mac, open Bento → <b>Settings</b> → <b>Your phone and iPad</b>
            </li>
            <li>
              Scan the code with this {deviceName() === 'iPad' ? 'iPad' : 'phone'}’s camera, or type
              it here
            </li>
          </ol>
          <input
            className="pair-code"
            value={shown.length > 4 ? `${shown.slice(0, 4)}-${shown.slice(4)}` : shown}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-label="Pairing code from your Mac"
            maxLength={9}
          />
          <button className="btn pair-go" disabled={shown.length < 8 || busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}
      {err && (
        <p className="pair-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

// a quiet line at the top while the Mac can't be reached; everything already on screen stays usable
function Offline() {
  return (
    <div className="host-off" role="status">
      <span className="host-dot" aria-hidden="true" />
      <span>Can’t reach your Mac. Is Bento open on it?</span>
      <button
        onClick={() =>
          remote()
            .connect()
            .catch(() => {})
        }
      >
        Try again
      </button>
    </div>
  );
}

// In Safari on an iPhone or iPad: Bento can live on the Home Screen and open like an app. That copy has storage of its
// own, so this arms a one-time code in the link it will start from (remote.js), and it opens already connected.
const APPLE_TOUCH =
  /iPhone|iPad/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function HomeScreenTip() {
  const [show, setShow] = useState(
    () => APPLE_TOUCH && !STANDALONE && !localStorage.getItem('bentoHost.homeTip'),
  );
  useEffect(() => {
    if (show)
      remote()
        .armHomeScreen()
        .catch(() => {});
  }, [show]);
  if (!show) return null;
  const done = () => {
    localStorage.setItem('bentoHost.homeTip', '1');
    setShow(false);
  };
  return (
    <div className="hs-tip" role="note">
      <span className="hs-ico" aria-hidden="true">
        <svg width="20" height="24" viewBox="0 0 20 24">
          <path
            d="M10 15V2m0 0L5.5 6.5M10 2l4.5 4.5M6 10H3.5A1.5 1.5 0 0 0 2 11.5v9A1.5 1.5 0 0 0 3.5 22h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 16.5 10H14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div>
        <b>Put Bento on your Home Screen</b>
        <span>Tap Share, then “Add to Home Screen”: it opens like an app.</span>
      </div>
      <button className="ib" aria-label="Not now" onClick={done}>
        ✕
      </button>
    </div>
  );
}

export default function Hosted({ children }) {
  const { state } = useRemote();
  if (state === 'unpaired') return <Pair />;
  return (
    <>
      {state === 'offline' && <Offline />}
      {children}
      {state === 'online' && <HomeScreenTip />}
    </>
  );
}
