// What shows while your AI is still planning a lesson: its own words as they arrive, and how long it usually takes.
import { useState, useEffect } from 'react';
import { t } from '../../i18n.js';

// A faint ticker of the tutor's planning, so a quiet wait still feels alive.
const STAGES = {
  idea: [
    'Reading the facts it must stick to',
    'Picturing the real problem',
    'Finding an everyday analogy',
    'Designing code that shows the obvious way and the clever way',
    'Checking the code would really run',
    'Deciding what you should notice',
  ],
  default: [
    'Reading your question',
    'Picking the right example',
    'Finding an everyday analogy',
    'Writing code you can run',
    'Deciding what to point at in the code',
    'Thinking of a good quick check',
  ],
};

const stageIcon = (x) =>
  /question|facts/i.test(x)
    ? '👀'
    : /example|picturing|problem/i.test(x)
      ? '🎯'
      : /analogy/i.test(x)
        ? '☕️'
        : /point|notice|decid/i.test(x)
          ? '👉'
          : /check/i.test(x)
            ? '🧩'
            : /code|design/i.test(x)
              ? '⌨️'
              : '•';

const EXPECT = { idea: 55, compare: 30, build: 30, code: 12, feature: 30, challenge: 15 }; // typical seconds of planning

export function Thought({ text, mode, since, slow }) {
  const th = typeof text === 'string' ? { text, n: 0 } : text || {}; // not `t`: that's the translator
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, []);
  const secs = (Date.now() - (since || Date.now())) / 1000;
  const exp = (EXPECT[mode] || 14) * (slow ? 2.2 : 1);
  const words = String(th.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (words.length > 30) {
    const last = words
      .split(/(?<=[.!?])\s/)
      .filter((x) => x.length > 12)
      .slice(-2)
      .join(' ')
      .slice(-170);
    return (
      <div className="thought" key={last.slice(0, 20)}>
        “{last}”
      </div>
    );
  }
  const st = STAGES[mode] || STAGES.default;
  const frac = 1 - Math.exp(-secs / exp); // eases toward the end, never claims to be done
  const i = Math.min(st.length - 1, Math.floor(frac * st.length));
  // a picture of the plan: one small mark per stage, ticked as it passes, and only the current stage in words
  return (
    <div className="wr" role="status" aria-label={`${t(st[i])}…`}>
      <div className="wr-track" aria-hidden="true">
        <i
          className="wr-fill"
          style={{
            width: `calc(${(i / (st.length - 1)) * 100}% - ${(i / (st.length - 1)) * 30}px)`,
          }}
        />
        {st.map((x, k) => (
          <span key={k} className={`wr-node ${k < i ? 'done' : k === i ? 'now' : ''}`} title={t(x)}>
            {k < i ? '✓' : stageIcon(x)}
          </span>
        ))}
      </div>
      <div className="wr-now" key={i}>
        {t(st[i])}…
      </div>
    </div>
  );
}
