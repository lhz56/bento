import { useEffect, useMemo, useRef, useState } from 'react';
import { WEB, playDoc } from '../web.js';

const PAL = ['#ff8a5b', '#a78bfa', '#4cc9a0', '#5aa9ff', '#ffc94d', '#ff6f91'];

// Several same-shaped pictures in a row (a simulation's ticks) become one flipbook you can play.
const shapeOf = (v) =>
  v.type === 'grid'
    ? `g${v.data.length}x${v.data[0]?.length}`
    : v.type === 'bars'
      ? `b${v.data.length}`
      : v.type === 'tree'
        ? 't'
        : null;
export function groupVisuals(vs) {
  const out = [];
  for (const v of vs) {
    const last = out[out.length - 1];
    const sh = shapeOf(v);
    if (sh && last && last.shape === sh) last.frames.push(v);
    else out.push({ shape: sh, frames: [v] });
  }
  return out
    .map((g) => (g.frames.length >= 3 ? { type: 'flip', frames: g.frames } : g.frames))
    .flat();
}
export function Visuals({ list }) {
  return groupVisuals(list || []).map((v, i) =>
    v.type === 'flip' ? <Flipbook key={i} frames={v.frames} /> : <Visual key={i} v={v} />,
  );
}
function Flipbook({ frames }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    setI(0);
    setPlaying(true);
  }, [frames]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(
      () => {
        if (i < frames.length - 1) setI(i + 1);
        else setPlaying(false);
      },
      Math.max(140, Math.min(700, 3500 / frames.length)),
    );
    return () => clearTimeout(t);
  }, [playing, i, frames.length]);
  const f = frames[i];
  const palette = useMemo(
    () =>
      frames[0].type === 'grid'
        ? [...new Set(frames.flatMap((x) => x.data.flat().map(String)))]
        : null,
    [frames],
  );
  return (
    <div className="flip">
      <Visual v={{ ...f, palette, label: f.label || `step ${i + 1}` }} />
      <div className="flip-ctl">
        <button
          className="ib"
          onClick={() => {
            if (!playing && i >= frames.length - 1) setI(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min="0"
          max={frames.length - 1}
          value={i}
          onChange={(e) => {
            setPlaying(false);
            setI(+e.target.value);
          }}
        />
        <span className="flip-n">
          {i + 1}/{frames.length}
        </span>
      </div>
    </div>
  );
}

export function Visual({ v }) {
  if (!v) return null;
  if (v.type === 'web') return <WebViz id={v.id} v={v.v} />;
  const body =
    v.type === 'canvas' ? (
      <CanvasViz v={v} />
    ) : v.type === 'tree' ? (
      <TreeViz root={v.root} />
    ) : v.type === 'bars' ? (
      <BarsViz data={v.data} names={v.names || namesFrom(v.label, v.data.length)} />
    ) : v.type === 'records' ? (
      <RecordsViz cols={v.cols} rows={v.rows} />
    ) : v.type === 'table' ? (
      <TableViz rows={v.rows} />
    ) : v.type === 'grid' ? (
      <GridViz data={v.data} palette={v.palette} />
    ) : (
      <pre className="viz-text">{v.text}</pre>
    );
  return (
    <figure className={`viz viz-${v.type}`}>
      {body}
      {v.label && <figcaption>{v.label}</figcaption>}
    </figure>
  );
}

// A lesson's web page, on its own sandboxed origin, with its console shown underneath.
function WebViz({ id, v }) {
  const [logs, setLogs] = useState([]);
  const frame = useRef(null);
  useEffect(() => {
    setLogs([]);
    const h = (e) => {
      if (e.source === frame.current?.contentWindow && e.data?.bentoPlay && e.data.k !== 'hover')
        setLogs((l) => [...l.slice(-60), { k: e.data.k, s: String(e.data.s).slice(0, 400) }]);
    };
    addEventListener('message', h);
    return () => removeEventListener('message', h);
  }, [id, v]);
  return (
    <div className="webviz">
      <div className="wv-bar">
        <span />
        <span />
        <span />
        <i>your page · point at anything to find its code</i>
      </div>
      {WEB && !window.bento ? (
        <iframe
          key={`${id}-${v}`}
          ref={frame}
          title="Your page"
          src="web-play.html"
          sandbox="allow-scripts allow-modals allow-forms"
          onLoad={(e) => e.currentTarget.contentWindow?.postMessage({ bentoDoc: playDoc(id) }, '*')}
        />
      ) : (
        <iframe
          ref={frame}
          title="Your page"
          src={window.bento?.playUrl ? window.bento.playUrl(id, v) : `play://${id}/?v=${v || 0}`}
          sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
        />
      )}
      {logs.length > 0 && (
        <div className="console small">
          {logs.map((l, i) => (
            <div
              key={i}
              className={`log ${l.k === 'error' ? 'err' : l.k === 'warn' ? 'warn' : ''}`}
            >
              {l.s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasViz({ v }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = v.w * dpr;
    c.height = v.h * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, v.w, v.h);
    for (const cmd of v.cmds) {
      const [k] = cmd;
      if (k === 'bg') {
        x.fillStyle = cmd[1];
        x.fillRect(0, 0, v.w, v.h);
      } else if (k === 'circle') {
        x.fillStyle = cmd[4] || '#222';
        x.beginPath();
        x.arc(cmd[1], cmd[2], Math.max(0, cmd[3]), 0, Math.PI * 2);
        x.fill();
      } else if (k === 'rect') {
        x.fillStyle = cmd[5] || '#222';
        x.fillRect(cmd[1], cmd[2], cmd[3], cmd[4]);
      } else if (k === 'line') {
        x.strokeStyle = cmd[5] || '#222';
        x.lineWidth = cmd[6] || 1;
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(cmd[1], cmd[2]);
        x.lineTo(cmd[3], cmd[4]);
        x.stroke();
      } else if (k === 'text') {
        x.fillStyle = cmd[4] || '#222';
        x.font = '14px -apple-system, sans-serif';
        x.fillText(cmd[1], cmd[2], cmd[3]);
      }
    }
  }, [v]);
  return (
    <canvas ref={ref} style={{ width: '100%', maxWidth: v.w, aspectRatio: `${v.w} / ${v.h}` }} />
  );
}

function layoutTree(root) {
  const nodes = [],
    edges = [];
  let leaf = 0;
  let maxD = 0;
  (function walk(n, d, path) {
    if (!n) return null;
    maxD = Math.max(maxD, d);
    const kids = n.kids || [];
    let xs = [];
    if (n.binary) {
      // in-order layout: every node gets its own column, so left/right is always visible
      const [l, r] = kids;
      if (l) walk(l, d + 1, path + 'L');
      const me = { v: n.v, d, path, x: leaf++ };
      if (r) walk(r, d + 1, path + 'R');
      nodes.push(me);
      if (l) edges.push([path, path + 'L']);
      if (r) edges.push([path, path + 'R']);
      return me.x;
    }
    kids.forEach((k, i) => {
      const x = walk(k, d + 1, path + i);
      if (x != null) {
        xs.push(x);
        edges.push([path, path + i]);
      }
    });
    const me = { v: n.v, d, path, x: xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : leaf++ };
    nodes.push(me);
    return me.x;
  })(root, 0, 'r');
  return { nodes, edges, width: Math.max(leaf, 1), depth: maxD };
}

function TreeViz({ root }) {
  const layout = useMemo(() => layoutTree(root), [root]);
  const prev = useRef(new Set());
  const fresh = new Set(layout.nodes.map((n) => n.path + ':' + n.v));
  const isNew = (n) => prev.current.size > 0 && !prev.current.has(n.path + ':' + n.v);
  useEffect(() => {
    prev.current = fresh;
  });
  const sx = 46,
    sy = 58,
    pad = 26;
  const width = Math.max(layout.width * sx, 120) + pad * 2 - sx + 40,
    height = (layout.depth + 1) * sy + pad;
  const pos = Object.fromEntries(
    layout.nodes.map((n) => [n.path, [pad + 20 + n.x * sx, pad + n.d * sy]]),
  );
  return (
    <svg
      className="tree"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`A tree with ${layout.nodes.length} nodes, ${layout.depth + 1} levels deep: ${layout.nodes
        .slice(0, 30)
        .map((n) => n.v)
        .join(', ')}`}
      style={{ width: '100%', maxWidth: width * 1.2, maxHeight: 340 }}
    >
      {layout.edges.map(
        ([a, b]) =>
          pos[a] &&
          pos[b] && (
            <line
              key={a + b}
              x1={pos[a][0]}
              y1={pos[a][1]}
              x2={pos[b][0]}
              y2={pos[b][1]}
              className="tree-edge"
            />
          ),
      )}
      {layout.nodes.map((n) => (
        <g
          key={n.path}
          className={`tree-node ${isNew(n) ? 'new' : ''}`}
          transform={`translate(${pos[n.path][0]},${pos[n.path][1]})`}
        >
          <circle r="17" fill={PAL[n.d % PAL.length]} />
          <text dy="5" textAnchor="middle">
            {String(n.v).slice(0, 4)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// "median ms: plain vs hedged" with 2 bars → name the bars "plain" and "hedged".
export const namesFrom = (label, n) => {
  if (!label || n < 2 || n > 6) return null;
  const tail = String(label)
    .split(/[:—–(]/)
    .pop()
    .replace(/\)\s*$/, '');
  const parts = tail
    .split(/\s+(?:vs\.?|versus)\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length === n && parts.every((x) => x.length <= 22) ? parts : null;
};
function BarsViz({ data, names }) {
  const max = Math.max(...data.map(Math.abs), 1);
  const showNums = data.length <= 24;
  return (
    <div className="bars" style={{ gap: names ? 26 : data.length > 60 ? 1 : 4 }}>
      {data.map((d, i) => (
        <div key={i} className="bar-col">
          {showNums && <span className="bar-n">{Number.isInteger(d) ? d : d.toFixed(2)}</span>}
          <div
            className="bar"
            style={{
              height: `${Math.max(3, (Math.abs(d) / max) * 100)}%`,
              background: d < 0 ? 'var(--rose)' : PAL[i % PAL.length],
            }}
          />
          {names && <span className="bar-name">{names[i]}</span>}
        </div>
      ))}
    </div>
  );
}
const unq = (v) => String(v).replace(/^(['"])(.*)\1$/, '$2');
function RecordsViz({ cols, rows }) {
  return (
    <table className="tbl rec">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j}>{unq(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function TableViz({ rows }) {
  return (
    <table className="tbl">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td className="k">{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
// A grid of a few distinct values (a forest, a maze, a game board) reads better as coloured squares.
const CELL_PAL = [
  'var(--bg-3)',
  '#4cc9a0',
  '#ff8a5b',
  '#5d5865',
  '#5aa9ff',
  '#a78bfa',
  '#ffc94d',
  '#ff6f91',
];
function GridViz({ data, palette }) {
  const cols = Math.max(...data.map((r) => r.length));
  const flat = data.flat().map(String);
  const vals = palette && palette.length <= 8 ? [...palette] : [...new Set(flat)];
  const asColor =
    vals.length <= 8 &&
    flat.length >= 9 &&
    vals.every((v) => v.length <= 3) &&
    !(vals.length === flat.length && !palette);
  if (asColor) {
    const order = vals.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const color = Object.fromEntries(order.map((v, i) => [v, CELL_PAL[i % CELL_PAL.length]]));
    const size = Math.max(8, Math.min(26, Math.floor(420 / cols)));
    return (
      <div className="cgrid-wrap">
        <div
          className="cgrid"
          style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px` }}
        >
          {data.flatMap((r, i) =>
            r.map((c, j) => (
              <i
                key={i + '-' + j}
                title={`row ${i}, col ${j}: ${c}`}
                style={{ background: color[String(c)] }}
              />
            )),
          )}
        </div>
        <div className="cgrid-key">
          {order.map((v) => (
            <span key={v}>
              <i style={{ background: color[v] }} />
              {unq(v)}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(24px, auto))` }}>
      {data.flatMap((r, i) =>
        r.map((c, j) => (
          <div key={i + '-' + j} className="cell">
            {c}
          </div>
        )),
      )}
    </div>
  );
}
