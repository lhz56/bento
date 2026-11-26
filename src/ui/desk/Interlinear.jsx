// The code with its plain English under each line (the "both" lens), for reading a program line by line.

export function Interlinear({ code, english, hoverLine, setHoverLine, onPick, step, notes }) {
  const lines = code.split('\n');
  const noteAt = new Map((notes || []).map((n) => [n.from, n]));
  return (
    <div className="interlinear">
      {lines.map((line, i) => {
        const e = english[i];
        const blank = !line.trim();
        if (blank) return <div key={i} className="il-gap" />;
        const indent = line.match(/^\s*/)[0].length;
        const note = noteAt.get(i + 1);
        return (
          <div
            key={i}
            className={`il ${hoverLine === i + 1 ? 'hot' : ''} ${step === i + 1 ? 'step' : ''}`}
            onMouseEnter={() => setHoverLine(i + 1)}
            onMouseLeave={() => setHoverLine(null)}
            onClick={() => onPick(i + 1)}
          >
            <span className="il-n">{i + 1}</span>
            <div className="il-body" style={{ paddingLeft: Math.min(indent, 16) * 7 }}>
              <div className={`il-en ${e === null ? 'pending' : ''}`}>
                {e === null ? (
                  <span className="en-shimmer" />
                ) : (
                  e || <span className="il-dim">—</span>
                )}
              </div>
              <code className="il-code">{line.trim()}</code>
              {note && (
                <div className="il-note">
                  <b>{note.label}</b> {note.text}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
