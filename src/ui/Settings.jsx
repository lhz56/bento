import { useEffect, useState } from 'react';
import { Seg } from './Home.jsx';
import { MODELS } from './Side.jsx';

// ⌘, : everything you can change, in one calm sheet.
const VOICES = ['English', 'Español', 'Português', 'Français', 'Deutsch', 'Italiano', 'Nederlands', 'Polski', 'Türkçe', 'Русский', 'Українська', 'العربية', 'हिन्दी', 'বাংলা', 'Bahasa Indonesia', 'Tiếng Việt', 'ไทย', 'Filipino', '中文', '日本語', '한국어', 'Kiswahili'];
const INTERESTS = [['games', 'Games'], ['web', 'Websites'], ['ai', 'AI'], ['data', 'Data'], ['bots', 'Bots'], ['apps', 'Phone apps'], ['art', 'Art & visuals'], ['systems', 'How big apps scale']];

export default function Settings({ settings, setSettings, providers, onClose, onSetup, onOpenData, onReplayOnboarding, wordsCount, lessonsCount }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, []);
  const avail = MODELS.filter((m) => !providers || providers[m[2]]);
  const ints = settings.interests || [];
  const [usage, setUsage] = useState(null);
  useEffect(() => { window.bento?.reposUsage?.().then(setUsage); }, []);
  return (
    <div className="pal-veil" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="set-h"><b>Settings</b><button className="ib" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="set-row"><div><b>Explain things as if I’m…</b><span>Changes how every lesson and Atlas is written.</span></div><Seg value={settings.level} options={[['kid', 'new to code'], ['student', 'learning'], ['engineer', 'an engineer']]} onChange={(v) => setSettings({ level: v })} /></div>
        <div className="set-row"><div><b>Explain things in</b><span>Lessons, answers and pictures in your language. Code stays in English.</span></div>
          <select className="set-sel" value={settings.voice || 'English'} onChange={(e) => setSettings({ voice: e.target.value })}>{VOICES.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
        <div className="set-row"><div><b>Programming language</b><span>You can switch any lesson with ⇄ later.</span></div><Seg value={settings.lang} options={[['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['html', 'Web page']]} onChange={(v) => setSettings({ lang: v })} /></div>
        <div className="set-row col"><div><b>Model</b><span>Runs on your own subscription. Sonnet: the best balance. Opus: deepest explanations, slower. Haiku: fastest. Codex: your ChatGPT plan. Quick answers always use a fast model from the same plan. If one hits its limit, Bento switches to the other for you.</span></div>
          <div className="set-models">{avail.map(([k, l, p]) => <button key={k} className={settings.model === k ? 'on' : ''} onClick={() => setSettings({ model: k })}><span className={`mdot ${p}`} />{l}</button>)}{avail.length === 0 && <span className="muted">No AI found yet.</span>}</div>
        </div>
        <div className="set-row col"><div><b>Curious about</b><span>Picks the idea of the day and suggestions.</span></div>
          <div className="interests">{INTERESTS.map(([k, l]) => <button key={k} className={`int ${ints.includes(k) ? 'on' : ''}`} onClick={() => setSettings({ interests: ints.includes(k) ? ints.filter((x) => x !== k) : [...ints, k] })}>{l}</button>)}</div>
        </div>
        <div className="set-row"><div><b>Connections</b><span>Claude Code, Codex and GitHub on this Mac.</span></div><button className="btn ghost" onClick={onSetup}>Check again</button></div>
        <div className="set-row"><div><b>Your data</b><span>{lessonsCount} lessons and {wordsCount} words, stored only on this Mac.</span></div><button className="btn ghost" onClick={onOpenData}>Show in Finder</button></div>
        {usage?.count > 0 && <div className="set-row"><div><b>Downloaded code</b><span>{usage.count} project{usage.count > 1 ? 's' : ''} · {(usage.bytes / 1048576).toFixed(0)} MB. Bento downloads them again if you reopen one.</span></div><button className="btn ghost" onClick={async () => { if (confirm('Delete the downloaded code for all projects? Your notes and lessons stay.')) { await window.bento.reposClear(); setUsage({ bytes: 0, count: 0 }); } }}>Free up space</button></div>}
        <div className="set-foot"><button className="link" style={{ marginLeft: 0 }} onClick={onReplayOnboarding}>Replay the welcome</button><span className="muted small">Bento · open source · MIT</span></div>
      </div>
    </div>
  );
}
