// Browsing a project's files: a treemap (each file's area is its size) or a list grouped by folder.
import { useRef, useState, useEffect } from 'react';
import { LAYERS, LAYER } from '../../atlas/analyze.js';

// Squarified treemap: folders are blocks, files are tiles sized by lines of code, coloured by layer.
function squarify(items, x, y, w, h) {
  const out = [];
  let rest = items.filter((it) => it.v > 0).sort((a, b) => b.v - a.v);
  const total = rest.reduce((s, it) => s + it.v, 0);
  if (!total) return out;
  const scale = (w * h) / total;
  rest = rest.map((it) => ({ ...it, a: it.v * scale }));
  const worst = (row, side) => {
    const sum = row.reduce((s, r) => s + r.a, 0);
    const mx = Math.max(...row.map((r) => r.a)),
      mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) {
      row.push(rest[i]);
      i++;
    }
    rest = rest.slice(i);
    const sum = row.reduce((s, r) => s + r.a, 0);
    if (w >= h) {
      const rw = sum / h;
      let yy = y;
      for (const r of row) {
        const rh = r.a / rw;
        out.push({ ...r, x, y: yy, w: rw, h: rh });
        yy += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = sum / w;
      let xx = x;
      for (const r of row) {
        const rw = r.a / rh;
        out.push({ ...r, x: xx, y, w: rw, h: rh });
        xx += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}

function FileMap({ files, role, onOpen }) {
  const box = useRef(null);
  const [width, setW] = useState(900);
  const [hov, setHov] = useState(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const height = Math.round(Math.min(560, Math.max(320, width * 0.48)));
  const code = files.filter((f) => f.lines > 0);
  const groups = new Map();
  for (const file of code) {
    const dir = file.p.includes('/')
      ? file.p
          .split('/')
          .slice(0, file.p.split('/').length > 2 ? 2 : 1)
          .join('/')
      : '·';
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(file);
  }
  const blocks = squarify(
    [...groups].map(([d, fs]) => ({ d, fs, v: fs.reduce((s, f) => s + f.lines, 0) })),
    0,
    0,
    width,
    height,
  );
  return (
    <div className="fmap" ref={box} style={{ height }}>
      {blocks.map((block) => {
        const pad = 3,
          head = block.h > 46 && block.w > 70 ? 18 : 0;
        const tiles = squarify(
          block.fs.map((f) => ({ f, v: f.lines })),
          block.x + pad,
          block.y + pad + head,
          Math.max(0, block.w - pad * 2),
          Math.max(0, block.h - pad * 2 - head),
        );
        return (
          <div
            key={block.d}
            className="fm-block"
            style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
          >
            {head > 0 && <span className="fm-dir">{block.d === '·' ? 'top level' : block.d}/</span>}
            {tiles.map((tile) => (
              <button
                key={tile.f.p}
                data-p={tile.f.p}
                className={`fm-tile ${hov === tile.f.p ? 'on' : ''}`}
                style={{
                  left: tile.x - block.x,
                  top: tile.y - block.y,
                  width: Math.max(0, tile.w - 2),
                  height: Math.max(0, tile.h - 2),
                  '--c': LAYER[tile.f.layer][3],
                }}
                onMouseEnter={() => setHov(tile.f.p)}
                onMouseLeave={() => setHov(null)}
                onClick={() => onOpen(tile.f.p)}
                title={`${tile.f.p}\n${role(tile.f.p)}\n${tile.f.lines} lines`}
              >
                {tile.w > 64 && tile.h > 22 && (
                  <span className="fm-n">{tile.f.p.split('/').pop()}</span>
                )}
                {tile.w > 110 && tile.h > 44 && <span className="fm-r">{role(tile.f.p)}</span>}
              </button>
            ))}
          </div>
        );
      })}
      <div className="fm-legend">
        {LAYERS.map(([k, n, , c]) => (
          <span key={k}>
            <i style={{ background: c }} />
            {n}
          </span>
        ))}
        <span className="muted">· bigger = more code</span>
      </div>
    </div>
  );
}

// =====================================================================================================
export function FileList({ facts, role, onOpen }) {
  const [query, setQuery] = useState('');
  const [layer, setLayer] = useState('all');
  const [open, setOpen] = useState({});
  const [mode, setMode] = useState('map');
  useEffect(() => {
    const h = (e) => {
      setLayer(e.detail);
      setMode('map');
      setQuery('');
    };
    addEventListener('atlas-layer', h);
    return () => removeEventListener('atlas-layer', h);
  }, []);
  const files = facts.files.filter(
    (f) =>
      (layer === 'all' || f.layer === layer) &&
      (!query ||
        f.p.toLowerCase().includes(query.toLowerCase()) ||
        role(f.p).toLowerCase().includes(query.toLowerCase())),
  );
  const dirs = new Map();
  for (const f of files) {
    const d = f.p.includes('/') ? f.p.slice(0, f.p.lastIndexOf('/')) : '';
    if (!dirs.has(d)) dirs.set(d, []);
    dirs.get(d).push(f);
  }
  const sorted = [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const many = sorted.length > 14 && !query;
  return (
    <section className="asec" id="sec-files">
      <div className="sec-head">
        <div>
          <div className="kicker">files</div>
          <h2>Every file, in plain words</h2>
        </div>
        <div className="sec-tools">
          <div className="seg small">
            <button className={mode === 'map' ? 'on' : ''} onClick={() => setMode('map')}>
              Map
            </button>
            <button className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
              List
            </button>
          </div>
          <input
            className="fl-q"
            placeholder="Find a file or a job…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="fl-layers">
        {[['all', 'All'], ...LAYERS.map((l) => [l[0], l[1]])].map(([k, l]) => (
          <button key={k} className={`chip ${layer === k ? 'on' : ''}`} onClick={() => setLayer(k)}>
            {k !== 'all' && <span className="ldot" style={{ background: LAYER[k][3] }} />}
            {l}
          </button>
        ))}
      </div>
      {mode === 'map' ? (
        <FileMap files={files} role={role} onOpen={onOpen} />
      ) : (
        <div className="fl">
          {sorted.map(([group, fs]) => {
            const isOpen = !many || open[group] || fs.length <= 3;
            return (
              <div key={group} className="fl-dir">
                <button
                  className="fl-dname"
                  aria-expanded={isOpen}
                  onClick={() => setOpen({ ...open, [group]: !isOpen })}
                >
                  <span className="caret2">{isOpen ? '▾' : '▸'}</span>
                  <span className="fl-dn">{group || 'top level'}/</span>
                  <span className="muted"> {fs.length}</span>
                </button>
                {isOpen &&
                  fs.map((file) => (
                    <button key={file.p} className="fl-f" onClick={() => onOpen(file.p)}>
                      <span className="ldot" style={{ background: LAYER[file.layer][3] }} />
                      <span className="fl-n">{file.p.split('/').pop()}</span>
                      <span className="fl-r">{role(file.p)}</span>
                      <span className="fl-l">{file.lines ? file.lines.toLocaleString() : ''}</span>
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
