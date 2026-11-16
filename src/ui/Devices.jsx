// Settings → Your phone and iPad (on the Mac): let your other devices use Bento, with this Mac doing the work.
import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { t } from '../i18n.js';
import { IN_APP, native } from './touch.js';

// a QR code as crisp SVG squares (the camera app on a phone opens the link)
export function QR({ text, size = 176 }) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
  return <svg className="qr" width={size} height={size} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="QR code to pair a device" shapeRendering="crispEdges"><rect width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#111" /></svg>;
}

const ago = (t0) => { const s = (Date.now() - t0) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const kindOf = (name) => (/iPad/.test(name) ? 'tablet' : /iPhone|Android/.test(name) ? 'phone' : 'computer');
const bare = (u) => String(u || '').replace(/^http:\/\//, '');
const ICON = {
  phone: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" /><path d="M10.5 18.5h3" /></svg>,
  tablet: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2.4" /><path d="M10.5 18.5h3" /></svg>,
  computer: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.8" /><path d="M9 20h6M12 16v4" /></svg>,
  globe: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.6 5.6 3.6 9s-1 6.4-3.6 9c-2.6-2.6-3.6-5.6-3.6-9s1-6.4 3.6-9z" /></svg>,
  wifi: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.5a9.4 9.4 0 0 1 12.4 0M9.1 16a4.6 4.6 0 0 1 5.8 0" /><circle cx="12" cy="19.2" r="1.2" fill="currentColor" stroke="none" /></svg>,
  moon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
};

// Settings → Your phone and iPad, on the Mac: turn it on, then connect a phone (tap this Mac in the Bento Code app and
// click Allow, or scan the code), see where your phone can reach this Mac, keep it awake, and see your devices.
export default function DevicesRow() {
  const H = window.bento?.host;
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [joined, setJoined] = useState(null); // a device that just connected, for a moment
  const [, tick] = useState(0);
  const known = useRef(null);
  const auto = useRef(false);
  useEffect(() => { if (!H) return undefined; H.get().then(setSt).catch(() => {}); return H.on(setSt); }, []);
  // the code's countdown
  useEffect(() => { if (!st?.pairing) return undefined; const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, [st?.pairing?.code]);
  // a new device appears while Settings is open: say so
  useEffect(() => {
    if (!st) return undefined;
    const ids = st.devices.map((d) => d.id);
    const fresh = known.current && st.devices.find((d) => !known.current.includes(d.id));
    known.current = ids;
    if (!fresh) return undefined;
    setJoined(fresh.name); const t = setTimeout(() => setJoined(null), 6000); return () => clearTimeout(t);
  }, [st?.devices?.length]);
  const act = async (fn) => { setBusy(true); setErr(''); try { setSt(await fn()); } catch (e) { setErr(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } finally { setBusy(false); } };
  const left = st?.pairing ? Math.max(0, Math.round((st.pairing.exp - Date.now()) / 1000)) : 0;
  // with nothing paired yet, the code is ready to scan; it renews itself while it's on screen
  useEffect(() => {
    if (!st?.on || !st.urls.length || busy) return;
    if ((!st.pairing && !st.devices.length && !auto.current) || (auto.current && st.pairing && left <= 0)) { auto.current = true; act(() => H.pair()); }
  }, [st?.on, st?.urls?.length, st?.devices?.length, !!st?.pairing, left <= 0]);
  if (!H || !st) return null;
  const set = (p) => act(() => H.set({ on: st.on, wifi: st.wifi, awake: st.awake, ...p }));
  const ts = st.urls.find((u) => u.kind === 'tailscale'), wifi = st.urls.find((u) => u.kind === 'wifi');
  const code = st.pairing?.code ? `${st.pairing.code.slice(0, 4)}-${st.pairing.code.slice(4)}` : '';
  const mac = st.name || t('this Mac');
  const short = ts ? bare(ts.url).split('.')[0] : '';
  return (
    <section className={`set-row col dv ${st.on ? 'is-on' : ''}`} aria-labelledby="dv-title">
      <div className="dv-head">
        <div className="dv-art" aria-hidden="true"><span className="dv-phone">{ICON.phone}</span><span className={`dv-wire ${st.on ? 'live' : ''}`}><i /><i /><i /></span><span className="dv-mac">{ICON.computer}</span></div>
        <div className="dv-words"><b id="dv-title">{t('Your phone and iPad')}</b><span>{t('Use Bento on your phone, anywhere. This Mac does the work, with your own AI plan. Only devices you allow can connect.')}</span></div>
        <button className={`switch ${st.on ? 'on' : ''}`} role="switch" aria-checked={st.on} aria-label={t('Use Bento on your phone and iPad')} disabled={busy} onClick={() => { auto.current = false; set({ on: !st.on }); }}><i /></button>
      </div>

      {!st.on && (
        <ol className="dv-steps off" aria-label={t('How it works')}>
          <li><em>1</em><span>{t('Turn this on')}</span></li>
          <li><em>2</em><span>{t('Open the Bento Code app on your iPhone')}</span></li>
          <li><em>3</em><span>{t('Tap this Mac there, then click Allow here')}</span></li>
        </ol>
      )}

      {st.on && (
        <div className="dv-body">
          {st.error && <p className="dv-err" role="alert">{st.error}</p>}
          {st.ask && (
            <div className="dv-asking" role="status">
              <span className="dv-ico">{ICON[st.ask.kind === 'tablet' ? 'tablet' : 'phone']}</span>
              <span><b>{st.ask.name} {t('is asking to connect')}</b>{t('Check that it shows')} <span className="dv-num">{st.ask.code}</span>{t(', then click Allow in the box on screen.')}</span>
            </div>
          )}
          {joined && !st.ask && <div className="dv-joined" role="status"><span className="dv-ico">{ICON.check}</span><b>{joined} {t('is connected')}</b></div>}

          <div className="dv-connect">
            <div className="dv-how">
              <b>{t('Connect your iPhone')}</b>
              <ol className="dv-steps">
                <li><em>1</em><span>{t('Open the')} <strong>Bento Code</strong> {t('app on your iPhone or iPad.')}</span></li>
                <li><em>2</em><span>{t('Tap')} <strong>{mac}</strong>{t(', then click')} <strong>{t('Allow')}</strong> {t('here.')}</span></li>
                <li><em>3</em><span>{ts ? <>{t('Away from home, type')} <code>{short}</code> {t('in the app instead.')}</> : t('That’s it. It remembers this Mac.')}</span></li>
              </ol>
              {st.nearby && <span className="dv-near"><i />{t('Showing up for iPhones on this Wi-Fi')}</span>}
            </div>
            <div className="dv-qr" aria-live="polite">
              {st.pairing && st.pairUrl ? (
                <>
                  <QR text={st.pairUrl} size={128} />
                  <span className="dv-or">{t('Or scan this with the app, or with the Camera to use Safari')}</span>
                  <span className="dv-code" aria-label={`${t('Code')} ${code}`}>{code}</span>
                  <span className="dv-left">{left > 0 ? `${bare(st.urls[0]?.url)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : t('Making a new code…')}</span>
                </>
              ) : (
                <button className="btn ghost" disabled={busy || !st.urls.length} onClick={() => { auto.current = true; act(() => H.pair()); }}>{t('Show a code to scan')}</button>
              )}
            </div>
          </div>
          {!st.urls.length && <p className="dv-err">{t('Your phone can’t reach this Mac yet: turn on Tailscale or “At home, on this Wi-Fi” below.')}</p>}

          <div className="dv-group" role="group" aria-label={t('Where your phone can reach this Mac')}>
            <h3>{t('Where your phone can reach this Mac')}</h3>
            <div className="dv-line">
              <span className={`dv-tile ${ts ? 'ok' : ''}`}>{ICON.globe}</span>
              <span className="dv-what"><b>{t('Anywhere, with Tailscale')}</b>
                {ts ? <span><code>{bare(ts.url)}</code></span> : <span>{t('Free. Install Tailscale on this Mac and your iPhone, and sign in to the same account. Bento finds it by itself.')}</span>}</span>
              {ts ? <span className="dv-state on">{t('On')}</span> : <button className="btn ghost" onClick={() => window.bento?.openExternal?.('https://tailscale.com/download')}>{t('Get Tailscale')} ↗</button>}
            </div>
            <div className="dv-line">
              <span className={`dv-tile ${wifi ? 'ok' : ''}`}>{ICON.wifi}</span>
              <span className="dv-what"><b>{t('At home, on this Wi-Fi')}</b><span>{wifi ? <code>{bare(wifi.url)}</code> : t('Lets your phone connect without Tailscale when it’s on the same Wi-Fi.')}</span></span>
              <button className={`switch ${st.wifi ? 'on' : ''}`} role="switch" aria-checked={st.wifi} aria-label={t('At home, on this Wi-Fi')} disabled={busy} onClick={() => set({ wifi: !st.wifi })}><i /></button>
            </div>
            <div className="dv-line">
              <span className={`dv-tile ${st.awakeNow ? 'ok' : ''}`}>{ICON.moon}</span>
              <span className="dv-what"><b>{t('Keep this Mac awake')}</b><span>{st.battery && st.awake ? t('On battery right now, so it sleeps as usual. Plug it in and it stays awake for your phone.') : t('While it’s plugged in, so your phone can reach it when you’re out. The screen still turns off.')}</span></span>
              <button className={`switch ${st.awake ? 'on' : ''}`} role="switch" aria-checked={st.awake} aria-label={t('Keep this Mac awake')} disabled={busy} onClick={() => set({ awake: !st.awake })}><i /></button>
            </div>
          </div>

          {st.devices.length > 0 && (
            <div className="dv-group">
              <h3 id="dv-devs">{t('Your devices')}</h3>
              <ul className="dv-list" aria-labelledby="dv-devs">
                {st.devices.map((d) => (
                  <li key={d.id} className="dv-line">
                    <span className={`dv-tile ${d.online ? 'ok' : ''}`}>{ICON[kindOf(d.name)]}</span>
                    <span className="dv-what"><b>{d.name}</b><span className={d.online ? 'dv-live' : ''}>{d.online ? t('Connected now') : `${t('Last seen')} ${ago(d.seen || d.added)}`}</span></span>
                    <button className="link" disabled={busy} onClick={() => { if (confirm(`${t('Remove')} ${d.name}? ${t('It will need to connect again to use Bento.')}`)) act(() => H.forget(d.id)); }}>{t('Remove')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {err && <p className="dv-err" role="alert">{err}</p>}
        </div>
      )}
    </section>
  );
}

// Settings on a phone or iPad: which Mac this device uses, and a way to stop
export function ThisDeviceRow() {
  const R = window.bentoRemote;
  const [st, setSt] = useState(() => ({ state: R?.state, host: R?.host }));
  useEffect(() => R?.on((state, host) => setSt({ state, host })), []);
  if (!R) return null;
  const me = /iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'device';
  return (
    <div className="set-row dev-row">
      <div className="dev-top">
        <div className="dev-art" aria-hidden="true"><span className="d-phone" /><span className="d-wire"><i /><i /><i /></span><span className="d-mac" /></div>
        <div><b>{t(`This ${me} uses Bento on`)} {st.host?.name || t('your Mac')}</b>
          <span className={`dev-seen ${st.state === 'online' ? 'on' : ''}`}>{st.state === 'online' ? t('connected · the Mac does the work, with your AI') : t('can’t reach the Mac right now')}</span></div>
        {IN_APP
          ? <button className="btn ghost" onClick={() => native('macs')}>{t('Your Macs')}</button>
          : <button className="btn ghost" onClick={() => { if (confirm(t('Disconnect this device? You can pair it again with a new code from the Mac.'))) R.disconnect(); }}>{t('Disconnect')}</button>}
      </div>
    </div>
  );
}
