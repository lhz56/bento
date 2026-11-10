// Two slow rows of ideas drifting across Home, each with a tiny moving picture of what you'll see.
// Everything here opens instantly (built-in lessons and pre-written simulations), so nothing waits on the AI.
import { t } from '../i18n.js';

const V = { w: 120, h: 70 };
const Box = ({ children }) => <svg viewBox={`0 0 ${V.w} ${V.h}`} className="if-art" aria-hidden="true">{children}</svg>;

// bars that keep sorting themselves
const Bars = () => <Box>{[5, 2, 8, 3, 6, 1, 7, 4].map((h, i) => <rect key={i} className="ia-bar" x={14 + i * 12} y={62 - h * 6} width="8" height={h * 6} rx="2" fill={['#ff8a5b', '#a58bff', '#3fd1a3', '#5aa9ff'][i % 4]} style={{ animationDelay: `${i * 0.18}s` }} />)}</Box>;
// a search tree that grows node by node
const Tree = () => <Box><g stroke="var(--line-2)" strokeWidth="2">{[[60, 12, 34, 34], [60, 12, 86, 34], [34, 34, 20, 56], [34, 34, 48, 56], [86, 34, 100, 56]].map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} className="ia-grow" style={{ animationDelay: `${i * 0.35}s` }} />)}</g>{[[60, 12, '#ff8a5b'], [34, 34, '#a58bff'], [86, 34, '#a58bff'], [20, 56, '#3fd1a3'], [48, 56, '#3fd1a3'], [100, 56, '#3fd1a3']].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="7" fill={c} className="ia-pop" style={{ animationDelay: `${i * 0.35}s` }} />)}</Box>;
// two growth curves drawing themselves: n and n²
const Curves = () => <Box><path d="M10 62 Q 70 60 110 8" stroke="#ff8a5b" strokeWidth="3" fill="none" strokeLinecap="round" className="ia-draw" /><path d="M10 62 L110 46" stroke="#3fd1a3" strokeWidth="3" fill="none" strokeLinecap="round" className="ia-draw" style={{ animationDelay: '.4s' }} /></Box>;
// a slowly turning sunflower spiral
const Spiral = () => <Box><g className="ia-spin">{Array.from({ length: 70 }, (_, i) => { const a = i * 0.5, r = i * 0.42; return <circle key={i} cx={60 + Math.cos(a) * r} cy={35 + Math.sin(a) * r} r={1.3 + i * 0.02} fill={['#ff8a5b', '#ff5d8f', '#a78bfa', '#5aa9ff'][i % 4]} />; })}</g></Box>;
// a box that remembers a number (closures)
const Counter = () => <Box><rect x="16" y="14" width="56" height="42" rx="10" fill="none" stroke="#a58bff" strokeDasharray="4 3" strokeWidth="2" /><text x="26" y="31" fontSize="9" fill="#a58bff" fontFamily="ui-monospace">count</text><text x="34" y="48" fontSize="15" fontWeight="700" fill="var(--ink)" className="ia-tick" fontFamily="ui-monospace">1</text><text x="34" y="48" fontSize="15" fontWeight="700" fill="var(--ink)" className="ia-tick b" fontFamily="ui-monospace">2</text><text x="34" y="48" fontSize="15" fontWeight="700" fill="var(--ink)" className="ia-tick c" fontFamily="ui-monospace">3</text><path d="M74 35 L92 35" stroke="var(--ink-3)" strokeWidth="2" /><circle cx="100" cy="35" r="8" fill="#ff8a5b" className="ia-pulse" /></Box>;
// a blank page with a blinking cursor
const Blank = () => <Box>{[0, 1, 2].map((i) => <rect key={i} x="18" y={16 + i * 14} width={[46, 66, 30][i]} height="5" rx="2.5" fill={['#ff8a5b', '#a58bff', '#3fd1a3'][i]} opacity=".6" className="ia-type" style={{ animationDelay: `${i * 0.6}s` }} />)}<rect x="52" y="44" width="2" height="12" fill="var(--accent)" className="ia-blink" /></Box>;
// cars on a ring road, bunching into a jam
const ROAD = 'M16,35 a44,20 0 1,0 88,0 a44,20 0 1,0 -88,0';
const Traffic = () => <Box><ellipse cx="60" cy="35" rx="44" ry="20" fill="none" stroke="var(--line-2)" strokeWidth="9" />{[0, 0.07, 0.11, 0.15, 0.19, 0.45, 0.62, 0.8].map((f, k) => <rect key={k} x="-4" y="-3" width="8" height="6" rx="2" fill={k > 0 && k < 5 ? '#ef476f' : '#3fd1a3'}><animateMotion dur="9s" repeatCount="indefinite" rotate="auto" path={ROAD} begin={`-${(f * 9).toFixed(2)}s`} /></rect>)}</Box>;
// people turning sick and getting better
const Herd = () => <Box>{Array.from({ length: 36 }, (_, k) => <circle key={k} cx={18 + (k % 9) * 10.5} cy={14 + Math.floor(k / 9) * 13} r="3.6" className={`ia-herd ${(k * 7) % 5 === 0 ? 'sus' : 'imm'}`} style={{ animationDelay: `${((k * 37) % 23) / 10}s` }} />)}</Box>;
// a small network passing a signal along
const Net = () => <Box>{[[20, 18], [20, 52], [60, 12], [60, 35], [60, 58], [100, 35]].map(([x, y], i, all) => i < 2 ? [2, 3, 4].map((j) => <line key={`${i}${j}`} x1={x} y1={y} x2={all[j][0]} y2={all[j][1]} stroke="var(--line-2)" strokeWidth="1.5" />) : i < 5 ? <line key={`o${i}`} x1={x} y1={y} x2="100" y2="35" stroke="var(--line-2)" strokeWidth="1.5" /> : null)}{[[20, 18], [20, 52], [60, 12], [60, 35], [60, 58], [100, 35]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6" fill="#a58bff" className="ia-fire" style={{ animationDelay: `${(x - 20) / 50}s` }} />)}</Box>;
// money that snowballs
const Compound = () => <Box>{[2, 3, 4, 5.5, 7.5, 10, 13.5].map((h, i) => <rect key={i} x={16 + i * 13} y={62 - h * 4} width="9" height={h * 4} rx="2" fill="#ffcf5c" className="ia-rise" style={{ animationDelay: `${i * 0.2}s` }} />)}</Box>;
// a fire spreading through a forest
const Fire = () => <Box>{Array.from({ length: 40 }, (_, k) => { const x = k % 10, y = Math.floor(k / 10); return <rect key={k} x={12 + x * 10} y={12 + y * 12} width="8" height="9" rx="2" className="ia-burn" style={{ animationDelay: `${(x + y) * 0.22}s` }} />; })}</Box>;

const ROWS = [
  [['sample-bst', 'How does a search tree stay fast?', Tree], ['sample-bigo', 'Why is one algorithm 1000× faster?', Curves], ['sample-spiral', 'Draw a sunflower with math', Spiral], ['sample-closure', 'How can a function remember?', Counter], ['scratch', 'Write your own code', Blank], ['sort', 'How does sorting work?', Bars]],
  [['Why do traffic jams appear from nowhere?', 'Why do traffic jams appear?', Traffic], ['How does herd immunity stop an outbreak?', 'How does herd immunity work?', Herd], ['How does a neural network learn?', 'How does a neural network learn?', Net], ['How does compound interest snowball?', 'How does money snowball?', Compound], ['How do forest fires spread?', 'How do forest fires spread?', Fire]],
];

export default function IdeaFlow({ samples = [], onOpen, onSim, onScratch, onAsk }) {
  const go = (key, label) => {
    const s = samples.find((x) => x.id === key);
    if (s) return onOpen(s);
    if (key === 'scratch') return onScratch?.();
    if (key === 'sort') return onAsk?.('How does sorting work? Show the bars moving.', { mode: 'explain' });
    return onSim ? onSim(key) : onAsk?.(`${key} Teach it by simulating it with a small program and a picture.`, { mode: 'explain' });
  };
  return (
    <section className="ideaflow" aria-label={t('Ideas to explore')}>
      <div className="if-h">{t('need an idea?')}</div>
      {ROWS.map((row, r) => (
        <div key={r} className={`if-row ${r ? 'rev' : ''}`}>
          <div className="if-track">
            {[...row, ...row].map(([key, label, Art], i) => (
              <button key={`${key}-${i}`} className="if-card" onClick={() => go(key, label)} tabIndex={i >= row.length ? -1 : 0} aria-hidden={i >= row.length || undefined}>
                <Art /><span>{t(label)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
