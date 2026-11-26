import { useRef, useState, useLayoutEffect, useMemo } from 'react';
import { BY_ID } from '../../../atlas/catalog.js';
import Brand from '../../Brand.jsx';
import { Md } from '../../Story.jsx';
import { tint, I, Chev, Sheet, Group, FileRow, base, lc } from './kit.jsx';

// How a project works, as a tree of steps you tap through (laid out by treeLayout), with a sheet for each step.

// the boxes in "how it works": who uses it, the app's own parts, where it keeps things, and the services outside it
const KIND = {
  person: ['var(--accent)', 'Who uses it'],
  part: ['var(--violet)', 'Part of the app'],
  store: ['var(--mint)', 'Keeps things'],
  outside: ['var(--sky)', 'Outside service'],
};

const kindOf = (n) => KIND[n.kind] || KIND.part;

const colorOf = (n) =>
  n.layer && n.kind !== 'person' && n.kind !== 'outside' ? tint(n.layer) : kindOf(n)[0];

// a picture for a box, from what it is and what it's called
function glyphOf(n) {
  const s = `${n.label} ${n.term || ''} ${n.does || ''}`.toLowerCase();
  if (n.kind === 'person') return 'person';
  if (n.kind === 'outside') return /chat|telegram|discord|slack|message/.test(s) ? 'chat' : 'globe';
  if (n.kind === 'store')
    return /file|doc|content|blog|markdown|mdx|article|config|setting/.test(s) ? 'doc' : 'data';
  if (/log ?in|sign|auth|session|password|account/.test(s)) return 'lock';
  if (/door|api|handler|endpoint|webhook|request|route handler|server/.test(s)) return 'door';
  if (/block|component|piece|button|widget/.test(s)) return 'blocks';
  if (/page|screen|view|front|interface|browser|display/.test(s)) return 'screen';
  if (/bot|chat|message|socket/.test(s)) return 'chat';
  if (/config|setting/.test(s)) return 'sliders';
  if (n.layer === 'logic' || /rule|logic|brain|engine|game|helper/.test(s)) return 'cog';
  return 'code';
}

// ---------------------------------------------------------------- how it works: one picture of the whole thing
// Rows from the top (who starts things) down to the bottom (where things end up); a box sits under what leads to it.
// Lines show which box talks to which, a dot travelling along each in the direction it talks.
function treeLayout(flow, width) {
  const nodes = (flow?.nodes || []).slice(0, 10);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (flow?.edges || []).filter(
    (e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to,
  );
  // a line that goes back up (Stripe → the doors: "payment confirmed") is drawn beside the one going down
  const out = {};
  edges.forEach((e) => (out[e.from] ||= []).push(e));
  const into = {};
  edges.forEach((e) => {
    into[e.to] = (into[e.to] || 0) + 1;
  });
  const st = {};
  const back = new Set();
  const dfs = (id) => {
    st[id] = 1;
    for (const e of out[id] || []) {
      if (st[e.to] === 1) back.add(e);
      else if (!st[e.to]) dfs(e.to);
    }
    st[id] = 2;
  };
  nodes
    .filter((n) => !into[n.id])
    .forEach((n) => {
      if (!st[n.id]) dfs(n.id);
    });
  nodes.forEach((n) => {
    if (!st[n.id]) dfs(n.id);
  });
  const fwd = edges.filter((e) => !back.has(e));
  const depth = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++)
    for (const e of fwd) if (depth[e.to] < depth[e.from] + 1) depth[e.to] = depth[e.from] + 1;
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const deepest = Math.max(0, ...nodes.filter((n) => linked.has(n.id)).map((n) => depth[n.id]));
  nodes.forEach((n) => {
    if (!linked.has(n.id) && nodes.length > 1) depth[n.id] = deepest + 1;
  });
  const levels = [];
  nodes.forEach((n) => (levels[depth[n.id]] ||= []).push(n));

  const GAP = 8,
    VG = 34,
    pos = {};
  let y = 2;
  for (const lv of levels.filter(Boolean)) {
    // each box under the middle of what leads to it, so the lines don't cross
    const under = (n) => {
      const ps = fwd
        .filter((e) => e.to === n.id && pos[e.from])
        .map((e) => pos[e.from].x + pos[e.from].w / 2);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : width / 2;
    };
    lv.sort((a, b) => under(a) - under(b));
    const rows =
      lv.length <= 3
        ? [lv]
        : lv.length === 4
          ? [lv.slice(0, 2), lv.slice(2)]
          : Array.from({ length: Math.ceil(lv.length / 3) }, (_, i) => lv.slice(i * 3, i * 3 + 3));
    for (const row of rows) {
      const wide = row.length === 1;
      const h = wide ? 68 : 104;
      const w = wide
        ? Math.min(width, Math.max(240, width * 0.8))
        : (width - GAP * (row.length - 1)) / row.length;
      row.forEach((n, i) => {
        pos[n.id] = { x: wide ? (width - w) / 2 : i * (w + GAP), y, w, h, wide };
      });
      y += h + VG;
    }
  }
  const height = Math.max(80, y - VG + 4);
  const twin = (e) => edges.some((x) => x !== e && x.from === e.to && x.to === e.from);
  const links = edges
    .map((e) => {
      const a = pos[e.from],
        b = pos[e.to];
      const up = back.has(e);
      const off = twin(e) ? (up ? 7 : -7) : 0;
      const [s, t] = up ? [b, a] : [a, b]; // a line always runs from the box above to the box below
      const x1 = s.x + s.w / 2 + off,
        y1 = s.y + s.h,
        x2 = t.x + t.w / 2 + off,
        y2 = t.y;
      if (y2 <= y1) return null;
      const dy = Math.max(14, (y2 - y1) * 0.55);
      const d = `M${x1.toFixed(1)},${y1} C${x1.toFixed(1)},${y1 + dy} ${x2.toFixed(1)},${y2 - dy} ${x2.toFixed(1)},${y2}`;
      return { d, up, key: `${e.from}>${e.to}` };
    })
    .filter(Boolean);
  return { nodes: nodes.filter((n) => pos[n.id]), pos, links, H: height };
}

function NodeIcon({ n, tool, size = 40 }) {
  const color = colorOf(n);
  if (n.kind === 'outside' && tool)
    return (
      <span className="fx-ic brand" style={{ '--c': color, width: size, height: size }}>
        <Brand slug={tool.slug} name={tool.name} color={tool.color} size={size} />
      </span>
    );
  return (
    <span className="fx-ic" style={{ '--c': color, width: size, height: size }}>
      <span className="fx-g">
        <I n={glyphOf(n)} s={Math.round(size * 0.5)} w={2} />
      </span>
      {tool && (
        <span className="fx-badge">
          <Brand
            slug={tool.slug}
            name={tool.name}
            color={tool.color}
            size={Math.round(size * 0.5)}
          />
        </span>
      )}
    </span>
  );
}

export function FlowMap({ flow, toolOf, onPick }) {
  const box = useRef(null);
  const [width, setW] = useState(340);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => treeLayout(flow, width), [flow, width]);
  const calm =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kinds = Object.keys(KIND).filter((k) => layout.nodes.some((n) => (n.kind || 'part') === k));
  return (
    <>
      <div className="fx" ref={box} style={{ height: layout.H }}>
        <svg className="fx-svg" width={width} height={layout.H} aria-hidden="true">
          {layout.links.map((link, i) => (
            <g key={link.key} className={`fx-l ${link.up ? 'up' : ''}`}>
              <path d={link.d} />
              {!calm && (
                <circle r="2.8">
                  <animateMotion
                    dur={`${2.6 + (i % 3) * 0.5}s`}
                    repeatCount="indefinite"
                    begin={`${(i * 0.55) % 2.6}s`}
                    path={link.d}
                    keyPoints={link.up ? '1;0' : '0;1'}
                    keyTimes="0;1"
                    calcMode="linear"
                  />
                </circle>
              )}
            </g>
          ))}
        </svg>
        {layout.nodes.map((node, i) => {
          const q = layout.pos[node.id];
          const tool = toolOf(node);
          return (
            <button
              key={node.id}
              className={`fx-n k-${node.kind || 'part'} ${q.wide ? 'wide' : ''}`}
              style={{
                left: q.x,
                top: q.y,
                width: q.w,
                height: q.h,
                '--c': colorOf(node),
                animationDelay: `${i * 55}ms`,
              }}
              onClick={() => onPick(node.id)}
              aria-label={`${node.label}: ${node.does || kindOf(node)[1]}`}
            >
              <NodeIcon n={node} tool={tool} size={q.wide ? 40 : 38} />
              <span className="fx-t">
                <b>{node.label}</b>
                {q.wide && node.does && <span>{node.does}</span>}
              </span>
              {q.wide && <Chev />}
            </button>
          );
        })}
      </div>
      <div className="fx-key" aria-hidden="true">
        {kinds.map((k) => (
          <span key={k} className={`k-${k}`}>
            <i style={{ '--c': KIND[k][0] }} />
            {KIND[k][1]}
          </span>
        ))}
      </div>
    </>
  );
}

export function NodeSheet({
  n,
  flow,
  tool,
  toolOf,
  terms,
  pathIdx,
  role,
  onPick,
  onClose,
  onOpenFile,
  onAsk,
}) {
  const termOf = (t) => {
    const key = String(t || '').toLowerCase();
    if (!key) return null;
    return (
      terms.find((x) => String(x.term).toLowerCase() === key) ||
      terms.find((x) => {
        const y = String(x.term).toLowerCase();
        return y.length > 2 && (key.includes(y) || y.includes(key));
      })
    );
  };
  const term = termOf(n.term);
  const nodeOf = (id) => flow.nodes.find((x) => x.id === id);
  const talks = [
    ...flow.edges.filter((e) => e.from === n.id).map((e) => ['to', e, nodeOf(e.to)]),
    ...flow.edges.filter((e) => e.to === n.id).map((e) => ['from', e, nodeOf(e.from)]),
  ].filter((x) => x[2]);
  const files = (n.files || []).filter((f) => pathIdx.has(f));
  return (
    <Sheet label={n.label} onClose={onClose}>
      <div className="ps-in" key={n.id}>
        <div className="ps-id">
          <NodeIcon n={n} tool={tool} size={56} />
          <div>
            <div className="ps-k" style={{ '--c': colorOf(n) }}>
              {kindOf(n)[1]}
            </div>
            <h3 className="ps-title">{n.label}</h3>
            {n.does && <div className="ps-sub">{n.does}</div>}
          </div>
        </div>
        {n.more && (
          <p className="ps-p">
            <Md text={n.more} />
          </p>
        )}
        {n.term && (
          <div className="ps-term">
            <span className="ps-term-k">The real word for it</span>
            <b>{n.term}</b>
            {term?.plain && <p>{term.plain}</p>}
            {term?.like && <i>{term.like}</i>}
          </div>
        )}
        {talks.length > 0 && (
          <Group title="Talks to">
            {talks.map(([dir, e, m]) => (
              <button key={`${dir}${m.id}`} className="ph-cell" onClick={() => onPick(m.id)}>
                <NodeIcon n={m} tool={toolOf(m)} size={32} />
                <span className="ph-ct">
                  <b>{m.label}</b>
                  <span className="ps-dir">
                    <I n={dir} s={13} w={2.4} />
                    {e.label || (dir === 'to' ? 'it sends to it' : 'sends to it')}
                  </span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {files.length > 0 && (
          <Group title="Where it lives in the code">
            {files.map((p) => (
              <FileRow key={p} f={{ p, lang: null }} sub={role(p)} onOpen={onOpenFile} />
            ))}
          </Group>
        )}
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`How does “${n.label}” (${n.term || n.kind}) work in this project?`, files[0]);
            }}
          >
            <I n="spark" s={18} />
            Show me in the code
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function StorySheet({ j, tools, pathIdx, onClose, onOpenFile, onAsk }) {
  return (
    <Sheet label={j.title} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-k" style={{ '--c': 'var(--accent)' }}>
          Follow along · {j.steps.length} steps
        </div>
        <h3 className="ps-title big">{j.title}</h3>
        <ol className="stp">
          {j.steps.map((step, i) => {
            const id = String(step.p || '').startsWith('stack:') ? step.p.slice(6) : null;
            const t = id && (tools.find((x) => x.id === id) || BY_ID[id]);
            return (
              <li key={i} style={{ animationDelay: `${80 + i * 70}ms` }}>
                <span className="stp-n">{i + 1}</span>
                <div className="stp-b">
                  <p>
                    <Md text={step.md} />
                  </p>
                  {t ? (
                    <span className="stp-chip">
                      <Brand slug={t.slug} name={t.name} color={t.color} size={20} />
                      {t.name}
                    </span>
                  ) : step.p && pathIdx.has(step.p) ? (
                    <button className="stp-chip" onClick={() => onOpenFile(step.p)}>
                      <span className="ph-mono">{base(step.p)}</span>
                      <Chev />
                    </button>
                  ) : step.p ? (
                    <span className="stp-chip ph-mono">{base(step.p)}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="ps-acts">
          <button
            className="ps-btn"
            onClick={() => {
              onClose();
              onAsk(`Walk me through what happens ${lc(j.title)}, file by file.`);
            }}
          >
            <I n="book" s={18} />
            Make it a lesson
          </button>
        </div>
      </div>
    </Sheet>
  );
}
