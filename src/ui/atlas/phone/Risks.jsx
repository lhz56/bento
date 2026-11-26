import { Md } from '../../Story.jsx';
import { Head, I, Chev, Sheet, Group, FileRow } from './kit.jsx';

// Where a project could hurt, on a phone: its hot spots and a sheet for each.

// ---------------------------------------------------------------- where it could break
const HOT = {
  bottleneck: ['speed', 'Slow spots', 'var(--butter)'],
  fragile: ['warn', 'Fragile', 'var(--rose)'],
  complex: ['tangle', 'Hard to read', 'var(--violet)'],
  security: ['shield', 'Security', 'var(--accent)'],
  scale: ['up', 'Scale', 'var(--sky)'],
};

const hotOf = (h) => HOT[h.kind] || HOT.fragile;

export function Risks({ hot, narrating, onPick }) {
  const kinds = Object.entries(
    hot.reduce((m, h) => {
      const k = HOT[h.kind] ? h.kind : 'fragile';
      m[k] = (m[k] || 0) + 1;
      return m;
    }, {}),
  );
  return (
    <section className="asec" id="sec-hot">
      <Head
        title="Where it could break"
        sub="Fragile spots, security gaps and things that get hard as it grows. Some are measured, some come from reading the code."
      />
      {kinds.length > 0 && (
        <div className="hs-tiles" role="group" tabIndex={0} aria-label="How many of each kind">
          {kinds.map(([kind, n]) => (
            <div key={kind} className="hs-t" style={{ '--c': HOT[kind][2] }}>
              <span className="ph-ic round sm">
                <I n={HOT[kind][0]} s={14} w={2.2} />
              </span>
              <b>{n}</b>
              <span>{HOT[kind][1]}</span>
            </div>
          ))}
        </div>
      )}
      {hot.length > 0 && (
        <div className="ph-cells">
          {hot.map((h, i) => (
            <button key={i} className="ph-cell tall" onClick={() => onPick(i)}>
              <span className="ph-ic" style={{ '--c': hotOf(h)[2] }}>
                <I n={hotOf(h)[0]} s={18} w={2} />
              </span>
              <span className="ph-ct">
                <b>
                  <Md text={h.title} />
                </b>
                <span className={h.p ? 'ph-mono' : ''}>{h.p || 'The whole project'}</span>
              </span>
              <Chev />
            </button>
          ))}
          {narrating && (
            <div className="ph-cell tall">
              <span className="lens-spin" />
              <span className="ph-ct">
                <b className="reg">Still looking…</b>
              </span>
            </div>
          )}
        </div>
      )}
      {hot.length === 0 &&
        (narrating ? (
          <div className="ph-cells">
            <div className="ph-cell">
              <span className="lens-spin" />
              <span className="ph-ct">
                <b className="reg">Looking for weak spots…</b>
              </span>
            </div>
          </div>
        ) : (
          <div className="ph-cells">
            <div className="ph-cell">
              <span className="ph-ic round" style={{ '--c': 'var(--mint)' }}>
                <I n="check" s={15} w={2.6} />
              </span>
              <span className="ph-ct">
                <b className="reg">Nothing stands out. A clean little codebase.</b>
              </span>
            </div>
          </div>
        ))}
    </section>
  );
}

export function HotSheet({ h, facts, pathIdx, role, onClose, onOpenFile, onAsk }) {
  const [ic, label, c] = hotOf(h);
  const file = h.p && pathIdx.has(h.p) ? facts.files[pathIdx.get(h.p)] : null;
  return (
    <Sheet label={h.title} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-id">
          <span className="ph-ic xl" style={{ '--c': c }}>
            <I n={ic} s={28} w={2} />
          </span>
          <div>
            <div className="ps-k" style={{ '--c': c }}>
              {label} · {h.measured ? 'measured' : 'from reading the code'}
            </div>
            <h3 className="ps-title">
              <Md text={h.title} />
            </h3>
          </div>
        </div>
        <p className="ps-p">
          <Md text={h.md} />
        </p>
        {file && (
          <Group title="Where">
            <FileRow
              f={file}
              sub={`${role(file.p) || ''}${role(file.p) ? ' · ' : ''}${file.lines} lines${file.used ? ` · ${file.used} files use it` : ''}`}
              onOpen={onOpenFile}
            />
          </Group>
        )}
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`How would you fix this: ${h.title}?`, h.p || undefined);
            }}
          >
            <I n="spark" s={18} />
            How would I fix it?
          </button>
        </div>
      </div>
    </Sheet>
  );
}
