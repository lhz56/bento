import { useEffect, useLayoutEffect, useState } from 'react';

// First-time hints: a small bubble pointing at one control at a time. Shown once per screen, ever.
export const TIPS = {
  lesson: [
    ['.lenses', 'Switch how you read the code: just code, side by side with plain words, or plain words first.'],
    ['.cm-content', 'Point at any word in the code for a quick explanation. Hold ⌥ and drag a number to change it live.'],
    ['.act.run', 'Run the code, or use Step to watch it one line at a time.'],
    ['#followup', 'Ask anything about this lesson. Enter gives a short answer here; ⌘↵ makes a whole new lesson.'],
  ],
  atlas: [
    ['.bigpic', 'This is the whole app as one picture. Click any part to see what it does and the real word for it.'],
    ['.ab-nav', 'Each tab is a different way to look at the same code: a city, its tools, its risks, every file.'],
    ['#atlas-ask', 'Ask anything about this project. Answers point at the real files.'],
  ],
};

export default function Coach({ screen, ready }) {
  const [i, setI] = useState(() => (localStorage.getItem(`bento.coach.${screen}`) ? -1 : 0));
  const [box, setBox] = useState(null);
  const steps = TIPS[screen] || [];
  const step = i >= 0 ? steps[i] : null;
  useLayoutEffect(() => {
    if (!step || !ready) return;
    let raf; let tries = 0;
    const find = () => { const el = document.querySelector(step[0]); if (el) { const r = el.getBoundingClientRect(); setBox({ x: r.left, y: r.top, w: r.width, h: r.height }); } else if (tries++ < 40) raf = setTimeout(find, 150); };
    find();
    const re = () => find(); addEventListener('resize', re);
    return () => { clearTimeout(raf); removeEventListener('resize', re); };
  }, [i, ready]);
  const done = () => { localStorage.setItem(`bento.coach.${screen}`, '1'); setI(-1); };
  useEffect(() => { if (!step) return; const h = (e) => e.key === 'Escape' && done(); addEventListener('keydown', h); return () => removeEventListener('keydown', h); }, [step]);
  if (!step || !box || !ready) return null;
  const below = box.y + box.h + 150 < innerHeight;
  const left = Math.max(12, Math.min(innerWidth - 332, box.x + box.w / 2 - 160));
  return (
    <>
      <div className="coach-ring" style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12 }} />
      <div className={`coach-tip ${below ? 'below' : 'above'}`} style={{ left, top: below ? box.y + box.h + 14 : undefined, bottom: below ? undefined : innerHeight - box.y + 14 }}>
        <div className="ct-text">{step[1]}</div>
        <div className="ct-foot">
          <span className="ct-dots">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
          <button className="link" style={{ marginLeft: 'auto' }} onClick={done}>Skip</button>
          <button className="btn tiny" onClick={() => (i < steps.length - 1 ? setI(i + 1) : done())}>{i < steps.length - 1 ? 'Next' : 'Got it'}</button>
        </div>
      </div>
    </>
  );
}
