// Settings → Your phone and iPad (on the Mac): let your other devices use Bento, with this Mac doing the work.
import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { t } from '../i18n.js';

// a QR code as crisp SVG squares (the camera app on a phone opens the link)
export function QR({ text, size = 176 }) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
  return <svg className="qr" width={size} height={size} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="QR code to pair a device" shapeRendering="crispEdges"><rect width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#111" /></svg>;
}

const ago = (t0) => { const s = (Date.now() - t0) / 1000; return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
const kindIcon = (name) => (/iPad/.test(name) ? '▭' : /iPhone|Android/.test(name) ? '▯' : '▢');

export default function DevicesRow() {
  const H = window.bento?.host;
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { if (!H) return undefined; H.get().then(setSt).catch(() => {}); return H.on(setSt); }, []);
  // the code's countdown
  useEffect(() => { if (!st?.pairing) return undefined; const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, [st?.pairing?.code]);
  if (!H || !st) return null;
  const act = async (fn) => { setBusy(true); setErr(''); try { setSt(await fn()); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const left = st.pairing ? Math.max(0, Math.round((st.pairing.exp - Date.now()) / 1000)) : 0;
  const ts = st.urls.find((u) => u.kind === 'tailscale'), wifi = st.urls.find((u) => u.kind === 'wifi');
  const code = st.pairing?.code ? `${st.pairing.code.slice(0, 4)}-${st.pairing.code.slice(4)}` : '';
  return (
    <div className="set-row col dev-row">
      <div className="dev-top">
        <div className="dev-art" aria-hidden="true"><span className="d-phone" /><span className="d-wire"><i /><i /><i /></span><span className="d-mac" /></div>
        <div><b>{t('Your phone and iPad')}</b><span>{t('Use Bento on them, with this Mac doing the work on your own AI plan. Only devices you pair can connect.')}</span></div>
        <button className={`switch ${st.on ? 'on' : ''}`} role="switch" aria-checked={st.on} aria-label={t('Use Bento on your phone and iPad')} disabled={busy} onClick={() => act(() => H.set({ on: !st.on, wifi: st.wifi }))}><i /></button>
      </div>
      {st.on && (
        <div className="dev-body">
          <div className="dev-ways">
            <span className={`dev-way ${ts ? 'ok' : ''}`}><i />{ts ? <>Tailscale <code>{ts.url.replace(/^http:\/\//, '')}</code></> : t('Tailscale isn’t on (it’s free: install it on this Mac and your phone to use Bento anywhere)')}</span>
            <label className={`dev-way ${wifi ? 'ok' : ''}`}><i /><span>{wifi ? <>Wi-Fi <code>{wifi.url.replace(/^http:\/\//, '')}</code></> : t('Also on this Wi-Fi')}</span>
              <button className={`switch small ${st.wifi ? 'on' : ''}`} role="switch" aria-checked={st.wifi} aria-label={t('Also on this Wi-Fi')} disabled={busy} onClick={() => act(() => H.set({ on: true, wifi: !st.wifi }))}><i /></button></label>
          </div>
          {st.error && <p className="dev-err" role="alert">{st.error}</p>}
          {st.pairing && st.pairUrl ? (
            <div className="dev-pair" aria-live="polite">
              <QR text={st.pairUrl} />
              <div>
                <b>{t('Scan this with your phone’s camera')}</b>
                <span>{t('Or open')} <code>{st.urls[0]?.url.replace(/^http:\/\//, '')}</code> {t('and type')}</span>
                <span className="dev-code">{code}</span>
                <span className="muted small">{left > 0 ? `${t('Works once, for')} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : t('Expired')}</span>
              </div>
            </div>
          ) : (
            <button className="btn" disabled={busy || !st.urls.length} onClick={() => act(() => H.pair())}>{st.devices.length ? t('Add another device') : t('Add a device')}</button>
          )}
          {!st.urls.length && <p className="muted small">{t('Turn on Tailscale or “Also on this Wi-Fi” so your devices can reach this Mac.')}</p>}
          {st.devices.length > 0 && (
            <ul className="dev-list" aria-label={t('Paired devices')}>
              {st.devices.map((d) => (
                <li key={d.id}>
                  <span className="dev-ico" aria-hidden="true">{kindIcon(d.name)}</span>
                  <b>{d.name}</b>
                  <span className={`dev-seen ${d.online ? 'on' : ''}`}>{d.online ? t('connected') : `${t('last seen')} ${ago(d.seen || d.added)}`}</span>
                  <button className="link" disabled={busy} onClick={() => { if (confirm(`${t('Remove')} ${d.name}? ${t('It will need a new code to use Bento again.')}`)) act(() => H.forget(d.id)); }}>{t('Remove')}</button>
                </li>
              ))}
            </ul>
          )}
          {err && <p className="dev-err" role="alert">{err}</p>}
        </div>
      )}
    </div>
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
        <button className="btn ghost" onClick={() => { if (confirm(t('Disconnect this device? You can pair it again with a new code from the Mac.'))) R.disconnect(); }}>{t('Disconnect')}</button>
      </div>
    </div>
  );
}
