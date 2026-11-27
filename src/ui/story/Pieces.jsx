// Smaller pieces of a lesson's story: its first picture, its code inside the text (article view), a word with its
// meaning, and the box for a follow-up question.
import { useState } from 'react';
import { K, keys, mod } from '../../platform.js';
import Editor from '../Editor.jsx';
import { Visuals } from '../Viz.jsx';

// The lesson's picture first: the first thing its code draws, above the words
export function HeroPicture({ lesson, run }) {
  if (lesson.lang === 'html' || !run?.r?.visuals?.length) return null;
  const visual = run.r.visuals.find((x) => x.type !== 'text' && x.type !== 'web');
  if (!visual) return null;
  return (
    <div className="hero-pic fade-in">
      <Visuals list={[visual]} />
    </div>
  );
}

export function ArticleCode({ lesson, run }) {
  const code = run?.src ?? lesson.work ?? lesson.code;
  const lineCount = code.split('\n').length;
  const result = run?.r;
  return (
    <figure className="art-fig">
      <div className="art-code" style={{ height: Math.min(560, lineCount * 23.5 + 24) }}>
        <Editor
          value={code}
          lang={lesson.lang === 'typescript' ? 'typescript' : lesson.lang}
          readOnly
          lens="code"
        />
      </div>
      {result?.visuals?.length > 0 && (
        <div className="art-viz">
          <Visuals list={result.visuals} />
        </div>
      )}
      {result?.logs?.length > 0 && (
        <pre className="console small art-out">
          {result.logs
            .slice(0, 30)
            .map((l) => l.s)
            .join('\n')}
        </pre>
      )}
      {!result && <figcaption className="muted small">Running the code…</figcaption>}
    </figure>
  );
}

export function Term({ b, known, lessonId }) {
  const [open, setOpen] = useState(false);
  const seenElsewhere = known && known.from !== lessonId;
  return (
    <div className={`term-card fade-in ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
      <span className="tc-k">{seenElsewhere ? 'word you know' : 'new word'}</span>
      <span className="tc-term">{b.term}</span>
      <span className="tc-plain">{b.plain}</span>
      {b.like && <span className="tc-like">≈ {b.like}</span>}
    </div>
  );
}

export function FollowUp({ onAsk, onLesson, placeholder }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="fu"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onAsk(value.trim());
          setValue('');
        }
      }}
    >
      <input
        id="followup"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && mod(e) && value.trim()) {
            e.preventDefault();
            onLesson(value.trim());
            setValue('');
          }
        }}
      />
      <span className="fu-hint">
        <kbd>{K.enter}</kbd> answer · <kbd>{keys('⌘↵')}</kbd> lesson
      </span>
    </form>
  );
}
