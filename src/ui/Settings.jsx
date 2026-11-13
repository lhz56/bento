import { useEffect, useState } from 'react';
import { t, tx } from '../i18n.js';
import { Seg } from './Home.jsx';
import { MODELS } from './Side.jsx';
import { PlanList, usePlans, AIMark } from './Plans.jsx';
import { useDialog } from './a11y.js';
import DevicesRow, { ThisDeviceRow } from './Devices.jsx';

// ⌘, : everything you can change, in one calm sheet.
// (on a phone or iPad, what only the Mac can do stays in the Mac's own Settings)
const REMOTE = !!window.bentoRemote;
const VOICES = ['English', 'Español', 'Português', 'Français', 'Deutsch', 'Italiano', 'Nederlands', 'Polski', 'Türkçe', 'Русский', 'Українська', 'العربية', 'हिन्दी', 'বাংলা', 'Bahasa Indonesia', 'Tiếng Việt', 'ไทย', 'Filipino', '中文', '日本語', '한국어', 'Kiswahili'];
const INTERESTS = [['games', 'Games'], ['web', 'Websites'], ['ai', 'AI'], ['data', 'Data'], ['bots', 'Bots'], ['apps', 'Phone apps'], ['art', 'Art & visuals'], ['systems', 'How big apps scale']];

export default function Settings({ packs = [], onAddPack, onRemovePack, onBackup, onRestore,  settings, setSettings, providers, onClose, onSetup, onOpenData, onReplayOnboarding, wordsCount, lessonsCount }) {
  const box = useDialog(onClose);
  const avail = MODELS.filter((m) => !providers || providers[m[2]]);
  const ints = settings.interests || [];
  const [usage, setUsage] = useState(null);
  const [note, setNote] = useState(null);
  useEffect(() => { window.bento?.reposUsage?.().then(setUsage); }, []);
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div className="settings" ref={box} role="dialog" aria-modal="true" aria-labelledby="set-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="set-h"><h2 id="set-title">{t('Settings')}</h2><button className="ib" aria-label={t('Close')} onClick={onClose}>✕</button></div>
        <div className="set-row"><div><b>{t('Explain things as if I’m…')}</b><span>Changes how every lesson and Atlas is written.</span></div><Seg value={settings.level} options={[['kid', 'new to code'], ['student', 'learning'], ['engineer', 'an engineer']]} onChange={(v) => setSettings({ level: v })} /></div>
        <div className="set-row"><div><b>{t('Explain things in')}</b><span>Lessons, answers and pictures in your language. Code stays in English.</span></div>
          <select className="set-sel" aria-label={t('Explain things in')} value={settings.voice || 'English'} onChange={(e) => setSettings({ voice: e.target.value })}>{VOICES.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
        <div className="set-row"><div><b>{t('Programming language')}</b><span>You can switch any lesson with ⇄ later.</span></div><Seg value={settings.lang} options={[['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['html', 'Web page']]} onChange={(v) => setSettings({ lang: v })} /></div>
        <div className="set-row col"><div><b>{t('Model')}</b><span>{t('Runs on your own plan. Quick answers use a fast model from the same AI, and if one runs out, Bento asks the next one you have.')}</span></div>
          <div className="set-models">{avail.map(([k, l, p]) => <button key={k} className={settings.model === k ? 'on' : ''} aria-pressed={settings.model === k} onClick={() => setSettings({ model: k })}><AIMark id={p} size={15} />{l}</button>)}{avail.length === 0 && <span className="muted">{t('No AI found yet.')}</span>}</div>
        </div>
        <div className="set-row col"><div><b>{t('Curious about')}</b><span>Picks the idea of the day and suggestions.</span></div>
          <div className="interests">{INTERESTS.map(([k, l]) => <button key={k} className={`int ${ints.includes(k) ? 'on' : ''}`} onClick={() => setSettings({ interests: ints.includes(k) ? ints.filter((x) => x !== k) : [...ints, k] })}>{l}</button>)}</div>
        </div>
        <DevicesRow />
        {REMOTE && <ThisDeviceRow />}
        {!REMOTE && <div className="set-row"><div><b>{t('Connections')}</b><span>{t('Claude, ChatGPT, Gemini, Copilot and GitHub on this Mac.')}</span></div><button className="btn ghost" onClick={onSetup}>{t('Check again')}</button></div>}
        {REMOTE ? <div className="set-row"><div><b>{t('Your data')}</b><span>{lessonsCount} {lessonsCount === 1 ? 'lesson' : 'lessons'} and {wordsCount} {wordsCount === 1 ? 'word' : 'words'}, saved on your Mac (with a copy every day for a week). Every device you pair sees the same ones.</span></div></div> : <><div className="set-row"><div><b>{t('Your data')}</b><span>{lessonsCount} {lessonsCount === 1 ? 'lesson' : 'lessons'} and {wordsCount} {wordsCount === 1 ? 'word' : 'words'}, stored only on this Mac. A copy is kept every day for a week: Restore… opens them.</span></div><div className="set-btns"><button className="btn ghost" onClick={onOpenData}>{t('Show in Finder')}</button>{onBackup && <button className="btn ghost" onClick={async () => { const f = await onBackup(); if (f) setNote(`${t('Saved')} ${f.split('/').pop()}`); }}>{t('Back up…')}</button>}{onRestore && <button className="btn ghost" onClick={async () => { try { const n = await onRestore(); if (n != null) setNote(t('Restored. Everything from the backup is merged in.')); } catch (e) { setNote(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } }}>{t('Restore…')}</button>}</div></div></>}
        {note && <div className="set-note">{note}</div>}
        {window.bento?.usage && <UsageRow providers={providers} />}
        <CheckRow />
        {onAddPack && <PackRow packs={packs} onAddPack={onAddPack} onRemovePack={onRemovePack} />}
        {!REMOTE && <div className="set-row"><div><b>{t('Open in Bento from your browser')}</b><span>{t('Drag this button to your bookmarks bar. On any GitHub page or website, click it to take it apart in Bento.')}</span></div><a className="btn ghost bookmarklet" href={"javascript:location.href='bento://open?u='+encodeURIComponent(location.href)"} onClick={(e) => e.preventDefault()} draggable title={t('Drag me to your bookmarks bar')}>⤓ {t('Open in Bento')}</a></div>}
        {!REMOTE && usage?.count > 0 && <div className="set-row"><div><b>Downloaded code</b><span>{usage.count} project{usage.count > 1 ? 's' : ''} · {(usage.bytes / 1048576).toFixed(0)} MB. Bento downloads them again if you reopen one.</span></div><button className="btn ghost" onClick={async () => { if (confirm('Delete the downloaded code for all projects? Your notes and lessons stay.')) { await window.bento.reposClear(); setUsage({ bytes: 0, count: 0 }); } }}>Free up space</button></div>}
        {!REMOTE && window.bento?.update && <UpdatesRow />}
        <div className="set-foot">{!REMOTE && <button className="link" style={{ marginLeft: 0 }} onClick={onReplayOnboarding}>{t('Replay the welcome')}</button>}<span className="muted small">Bento · open source · MIT</span></div>
      </div>
    </div>
  );
}

// Content packs: puzzles, paths and ideas other people wrote, from a file or a link
function PackRow({ packs, onAddPack, onRemovePack }) {
  const [url, setUrl] = useState(''); const [msg, setMsg] = useState(null);
  const add = (json) => { const r = onAddPack(json); setMsg(r.errors ? { bad: r.errors.slice(0, 3).join(' ') } : { ok: `${t('Added')} “${r.pack.name}”: ${r.pack.puzzles.length} ${t('puzzles')}, ${r.pack.paths.length} ${t('paths')}, ${r.pack.ideas.length} ${t('ideas')}.` }); };
  return (
    <div className="set-row col">
      <div><b>{t('Content packs')}</b><span>{t('Puzzles, paths and ideas other people wrote. Add one from a file or a link (see docs/PACKS.md to make your own).')}</span></div>
      {packs.length > 0 && <div className="pack-list">{packs.map((p) => <span key={p.id} className="pack-chip"><b>{p.name}</b>{p.author ? ` · ${p.author}` : ''} · {p.puzzles.length}🧩 {p.paths.length}⤳ {p.ideas.length}⬡<button className="link" onClick={() => onRemovePack(p.id)}>{t('remove')}</button></span>)}</div>}
      <div className="pack-add">
        <label className="btn ghost">{t('From a file…')}<input type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { add(JSON.parse(await f.text())); } catch { setMsg({ bad: t('That file isn’t valid JSON.') }); } e.target.value = ''; }} /></label>
        <input className="set-input" placeholder={t('or paste a link to a pack (raw JSON)')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn ghost" disabled={!/^https:\/\//.test(url)} onClick={async () => { try { const raw = url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/$2/'); add(await (await fetch(raw)).json()); setUrl(''); } catch { setMsg({ bad: t('Couldn’t load a pack from that link.') }); } }}>{t('Add')}</button>
      </div>
      {msg && <div className={msg.ok ? 'set-note' : 'set-note bad'}>{msg.ok || msg.bad}</div>}
    </div>
  );
}

// Double-check new lessons against their code's real output (one small call to your fast model per lesson)
function CheckRow() {
  const [on, setOn] = useState(() => localStorage.getItem('bento.check') !== 'off');
  return (
    <div className="set-row"><div><b>{t('Double-check new lessons')}</b><span>{t('After a lesson’s code runs, your fast model checks its quiz answers and claims against what the code really printed, and Bento fixes what it can prove. One small request per lesson.')}</span></div>
      <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={t('Double-check new lessons')} onClick={() => { localStorage.setItem('bento.check', on ? 'off' : 'on'); setOn(!on); }}><i /></button></div>
  );
}

// The last 7 days of AI use, and the saved answers that made repeats free
function UsageRow({ providers }) {
  const [u, setU] = useState(null); const [cleared, setCleared] = useState(false);
  const { limits, refresh } = usePlans();
  useEffect(() => { window.bento.usage().then(setU).catch(() => {}); }, [cleared]);
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!u) return null;
  const tot = (d) => d.lessons + d.quick + d.other; const max = Math.max(1, ...u.days.map((d) => tot(d) + d.saved));
  const week = u.days.reduce((s, d) => ({ n: s.n + tot(d), saved: s.saved + d.saved, tokens: s.tokens + d.tokens }), { n: 0, saved: 0, tokens: 0 });
  return (
    <div className="set-row col">
      <div><b>{t('Your plans')}</b><span>{t('How full each plan is, as the AI itself counts it. Looking never uses your plan.')}</span></div>
      <PlanList providers={providers} limits={limits} usage={u} />
      <div className="set-sub"><b>{t('What Bento used')}</b><span>{week.n} {week.n === 1 ? t('request to your AI this week') : t('requests to your AI this week')}, {t('about')} {Math.round(week.tokens / 1000).toLocaleString()}k {t('tokens')}. {week.saved} {week.saved === 1 ? t('more was answered from a saved copy, for free.') : t('more were answered from saved copies, for free.')}</span></div>
      <div className="uchart" role="img" aria-label={u.days.map((d) => `${d.d}: ${d.lessons} lessons, ${d.quick} quick, ${d.other} readings, ${d.saved} saved`).join('; ')}>
        {u.days.map((d) => (
          <div key={d.d} className="uc-day">
            <div className="uc-stack" style={{ height: 70 }}>
              <i className="uc-saved" style={{ height: `${(d.saved / max) * 100}%` }} /><i className="uc-other" style={{ height: `${(d.other / max) * 100}%` }} /><i className="uc-quick" style={{ height: `${(d.quick / max) * 100}%` }} /><i className="uc-lessons" style={{ height: `${(d.lessons / max) * 100}%` }} />
            </div>
            <span>{new Date(d.d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
          </div>
        ))}
        <div className="uc-key"><span><i className="uc-lessons" />{t('lessons')}</span><span><i className="uc-quick" />{t('quick answers')}</span><span><i className="uc-other" />{t('readings')}</span><span><i className="uc-saved" />{t('saved copies')}</span></div>
      </div>
      <div className="set-btns" style={{ justifyContent: 'flex-start' }}><button className="btn ghost" disabled={!u.savedAnswers} onClick={async () => { await window.bento.clearSavedAnswers(); setCleared((x) => !x); }}>{t('Forget saved answers')} ({u.savedAnswers})</button></div>
    </div>
  );
}

// Which Bento this is, and whether a newer one is on its way
function UpdatesRow() {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { const u = window.bento.update; u.get().then(setSt).catch(() => {}); return u.on((x) => setSt((o) => ({ ...o, ...x }))); }, []);
  if (!st) return null;
  const say = { off: st.reason ? `${t('Updates are off')}: ${st.reason}.` : t('Updates are off.'), checking: t('Checking for a newer version…'), current: t('You’re on the newest version.'), downloading: `${t('Downloading')} ${st.version || t('a new version')}${st.percent ? ` · ${st.percent}%` : ''}…`, ready: `${st.version || t('A new version')} ${t('is ready. Restart to finish.')}`, error: `${t('Couldn’t check')}: ${st.reason || ''}` }[st.status] || '';
  return (
    <div className="set-row">
      <div><b>Bento {st.current}</b><span aria-live="polite">{say}</span></div>
      <div className="set-btns">
        {st.status !== 'off' && <label className="upd-auto"><button className={`switch ${st.auto !== false ? 'on' : ''}`} role="switch" aria-checked={st.auto !== false} aria-label={t('Update automatically')} onClick={async () => setSt({ ...st, auto: await window.bento.update.setAuto(st.auto === false) })}><i /></button><span>{t('Automatically')}</span></label>}
        {st.status === 'ready'
          ? <button className="btn" onClick={() => window.bento.update.install()}>{t('Restart')}</button>
          : <button className="btn ghost" disabled={busy || st.status === 'off' || st.status === 'checking' || st.status === 'downloading'} onClick={async () => { setBusy(true); try { setSt(await window.bento.update.check()); } finally { setBusy(false); } }}>{busy ? t('Checking…') : t('Check now')}</button>}
      </div>
    </div>
  );
}
