import { useState, useRef, useEffect } from 'react';
import { LAYERS, fmtN } from '../../../atlas/analyze.js';
import { tint, base, Head, I, Chev, FileIcon } from './kit.jsx';

// Browsing a project's files on a phone: folders you go into, and the files in each.

// ---------------------------------------------------------------- the code, as a code app's file browser: folders you open, a file a sheet
export function Code({ facts, role, onOpen, name }) {
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('all');
  const [dir, setDir] = useState('');
  const [way, setWay] = useState('in');
  const [more, setMore] = useState(false);
  const top = useRef(null);
  useEffect(() => {
    const h = (e) => {
      setLayer(e.detail);
      setQ('');
      setDir('');
    };
    addEventListener('atlas-layer', h);
    return () => removeEventListener('atlas-layer', h);
  }, []);
  const go = (d, w) => {
    setWay(w);
    setDir(d);
    setMore(false);
    // a long folder you were deep in: the new one starts at its top
    requestAnimationFrame(() => {
      const el = top.current;
      if (el && el.getBoundingClientRect().top < 60)
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  const flat = !!q.trim() || layer !== 'all';
  const ql = q.trim().toLowerCase();
  let rows;
  if (flat) {
    rows = facts.files
      .filter(
        (f) =>
          (layer === 'all' || f.layer === layer) &&
          (!ql || f.p.toLowerCase().includes(ql) || role(f.p).toLowerCase().includes(ql)),
      )
      .sort((a, b) => a.p.localeCompare(b.p))
      .map((f) => ({ f }));
  } else {
    const pre = dir ? `${dir}/` : '';
    const sub = new Map();
    const fs = [];
    for (const f of facts.files) {
      if (!f.p.startsWith(pre)) continue;
      const rest = f.p.slice(pre.length);
      const i = rest.indexOf('/');
      if (i < 0) fs.push(f);
      else sub.set(rest.slice(0, i), (sub.get(rest.slice(0, i)) || 0) + 1);
    }
    rows = [
      ...[...sub].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ d, n })),
      ...fs.sort((a, b) => a.p.localeCompare(b.p)).map((f) => ({ f })),
    ];
  }
  const LIMIT = 80;
  const cut = !more && rows.length > LIMIT;
  const crumbs = dir ? dir.split('/') : [];
  return (
    <section className="asec" id="sec-files" ref={top}>
      <Head
        title="The code"
        sub="Every file, with what it does in plain words. Open one to read it, or to ask about it."
      />
      <label className="ph-search">
        <I n="search" s={17} w={2.2} />
        <input
          type="search"
          placeholder={`Search ${name}’s files`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          aria-label="Search the files"
        />
        {q && (
          <button className="ph-clear" aria-label="Clear" onClick={() => setQ('')}>
            <I n="x" s={11} w={3} />
          </button>
        )}
      </label>
      <div className="ph-scope" role="tablist" aria-label="Kind of part">
        {[['all', 'All'], ...LAYERS.map((l) => [l[0], l[1]])].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={layer === k}
            className={layer === k ? 'on' : ''}
            onClick={() => setLayer(k)}
          >
            {k !== 'all' && <i style={{ background: tint(k) }} />}
            {l}
          </button>
        ))}
      </div>
      {!flat && (
        <nav className="ph-crumbs" aria-label="Folder">
          <button className={crumbs.length ? '' : 'on'} onClick={() => go('', 'out')}>
            <I n="folder" s={15} />
            {name}
          </button>
          {crumbs.map((crumb, i) => (
            <span key={i}>
              <Chev />
              <button
                className={i === crumbs.length - 1 ? 'on' : ''}
                onClick={() => go(crumbs.slice(0, i + 1).join('/'), 'out')}
              >
                {crumb}
              </button>
            </span>
          ))}
        </nav>
      )}
      <div className={`ph-cells fl2 ${way}`} key={flat ? `q:${layer}` : `d:${dir}`}>
        {(cut ? rows.slice(0, LIMIT) : rows).map((row) =>
          row.d != null ? (
            <button
              key={`d:${row.d}`}
              className="ph-cell"
              onClick={() => go(dir ? `${dir}/${row.d}` : row.d, 'in')}
            >
              <span className="ph-folder">
                <I n="folder" s={28} />
              </span>
              <span className="ph-ct">
                <b>{row.d}</b>
              </span>
              <span className="ph-val">{row.n}</span>
              <Chev />
            </button>
          ) : (
            <button
              key={row.f.p}
              className="ph-cell tall"
              data-p={row.f.p}
              onClick={() => onOpen(row.f.p)}
            >
              <FileIcon f={row.f} />
              <span className="ph-ct">
                <b className="ph-mono">{base(row.f.p)}</b>
                <span>{role(row.f.p) || (row.f.lang ? `${row.f.lang} file` : 'A file')}</span>
                {flat && row.f.p.includes('/') && (
                  <span className="ph-path">{row.f.p.slice(0, row.f.p.lastIndexOf('/'))}/</span>
                )}
              </span>
              <span className="ph-val">{row.f.lines ? fmtN(row.f.lines) : ''}</span>
            </button>
          ),
        )}
        {cut && (
          <button className="ph-cell more" onClick={() => setMore(true)}>
            Show all {rows.length} files
          </button>
        )}
        {rows.length === 0 && (
          <div className="ph-cell">
            <span className="ph-ct">
              <b className="reg">No file matches “{q}”.</b>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
