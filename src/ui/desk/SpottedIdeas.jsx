// New in your code: ideas that appeared as you edited (a loop, a dictionary, recursion...), each with a one-line
// meaning you can save as a word to learn.

export default function SpottedIdeas({
  onWord,
  setHoverLine,
  setSpotOpen,
  setSpotSeen,
  spotOpen,
  spotted,
}) {
  return (
    <div className="spot">
      <span className="spot-h">✨ new in your code</span>
      {spotted.map((x) => (
        <button
          key={x.id}
          className={`spot-chip ${spotOpen === x.id ? 'on' : ''}`}
          onClick={() => setSpotOpen(spotOpen === x.id ? null : x.id)}
        >
          {x.name}
        </button>
      ))}
      {spotted
        .filter((x) => x.id === spotOpen)
        .map((x) => (
          <div key={x.id} className="spot-card">
            <b>{x.name}</b>{' '}
            <span
              className="spot-line"
              onMouseEnter={() => setHoverLine?.(x.line)}
              onMouseLeave={() => setHoverLine?.(null)}
            >
              line {x.line}
            </span>
            <p>{x.plain}</p>
            <p className="spot-like">≈ {x.like}</p>
            <div className="spot-act">
              {onWord && (
                <button
                  className="btn tiny"
                  onClick={() => {
                    onWord({ term: x.name, plain: x.plain, like: x.like });
                    setSpotSeen((s0) => new Set([...s0, x.id]));
                    setSpotOpen(null);
                  }}
                >
                  + Add to my words
                </button>
              )}
              <button
                className="link"
                onClick={() => {
                  setSpotSeen((s0) => new Set([...s0, x.id]));
                  setSpotOpen(null);
                }}
              >
                Got it
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
