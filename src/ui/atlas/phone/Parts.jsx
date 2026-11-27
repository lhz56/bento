// A project's parts (screens, server, logic, data, support) and what each one is made of.
import { LAYERS, fmtN, LAYER } from '../../../atlas/analyze.js';
import Brand from '../../Brand.jsx';
import Md from '../../Md.jsx';
import { layerOfTool, sayOf } from './Services.jsx';
import { tint, PART_IC, Head, I, Chev, Sheet, Group, FileRow } from './kit.jsx';

// ---------------------------------------------------------------- what it's made of: the kinds of part, like iPhone Storage
export function Parts({ facts, tools, onPick }) {
  const tot = {};
  for (const f of facts.files) {
    const x = (tot[f.layer] ||= { n: 0, l: 0 });
    x.n++;
    x.l += f.lines || 0;
  }
  const all = Object.values(tot).reduce((a, x) => a + x.l, 0) || 1;
  const parts = LAYERS.filter(([k]) => tot[k]?.n);
  const pct = (k) => Math.max(1, Math.round((tot[k].l / all) * 100));
  const by = {};
  for (const t of tools) (by[layerOfTool(t, facts)] ||= []).push(t);
  return (
    <section className="asec" id="sec-parts">
      <Head
        title="What it’s made of"
        sub="Every app has the same few kinds of part. This is how much of this one each kind is."
      />
      <div className="pk-card">
        <div className="pk-top">
          <b>{fmtN(facts.totals.code)} files</b>
          <span>{fmtN(facts.totals.lines)} lines of code</span>
        </div>
        <div className="pk-bar" aria-hidden="true">
          {parts
            .filter(([k]) => tot[k].l)
            .map(([k]) => (
              <i key={k} style={{ flexGrow: tot[k].l, background: tint(k) }} />
            ))}
        </div>
        <div className="pk-key">
          {parts.map(([k, nm]) => (
            <span key={k}>
              <i style={{ background: tint(k) }} />
              {nm}
              <b>{pct(k)}%</b>
            </span>
          ))}
        </div>
      </div>
      <div className="ph-cells">
        {parts.map(([id, nm, desc]) => (
          <button key={id} className="ph-cell tall" onClick={() => onPick(id)}>
            <span className="ph-ic" style={{ '--c': tint(id) }}>
              <I n={PART_IC[id]} s={19} />
            </span>
            <span className="ph-ct">
              <b>{nm}</b>
              <span>{desc}</span>
            </span>
            {by[id]?.length > 0 && (
              <span className="pk-logos" aria-hidden="true">
                {by[id].slice(0, 3).map((t) => (
                  <Brand key={t.id} slug={t.slug} name={t.name} color={t.color} size={26} />
                ))}
              </span>
            )}
            <Chev />
          </button>
        ))}
      </div>
    </section>
  );
}

export function PartSheet({
  k,
  facts,
  narration,
  tools,
  role,
  onClose,
  onOpenFile,
  onTool,
  onAll,
}) {
  const [, nm, desc] = LAYER[k];
  const files = facts.files.filter((f) => f.layer === k);
  const lines = files.reduce((a, f) => a + (f.lines || 0), 0);
  const all = facts.files.reduce((a, f) => a + (f.lines || 0), 0) || 1;
  const big = [...files]
    .filter((f) => f.lines)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 5);
  const made = tools.filter((t) => layerOfTool(t, facts) === k);
  return (
    <Sheet label={nm} onClose={onClose}>
      <div className="ps-in">
        <div className="ps-id">
          <span className="ph-ic xl" style={{ '--c': tint(k) }}>
            <I n={PART_IC[k]} s={28} />
          </span>
          <div>
            <div className="ps-k" style={{ '--c': tint(k) }}>
              {Math.max(1, Math.round((lines / all) * 100))}% of the code
            </div>
            <h3 className="ps-title">{nm}</h3>
            <div className="ps-sub">{desc}</div>
          </div>
        </div>
        <div className="ps-nums">
          <div>
            <b>{fmtN(files.length)}</b>
            <span>files</span>
          </div>
          <div>
            <b>{fmtN(lines)}</b>
            <span>lines</span>
          </div>
          <div>
            <b>{made.length}</b>
            <span>tools</span>
          </div>
        </div>
        {narration?.layers?.[k] && (
          <p className="ps-p">
            <Md text={narration.layers[k]} />
          </p>
        )}
        {made.length > 0 && (
          <Group title="Made with">
            {made.map((t) => (
              <button key={t.id} className="ph-cell" onClick={() => onTool(t.id)}>
                <Brand slug={t.slug} name={t.name} color={t.color} size={32} />
                <span className="ph-ct">
                  <b>{t.name}</b>
                  <span>{sayOf(narration, t)?.role || t.what}</span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {big.length > 0 && (
          <Group title="Its biggest files">
            {big.map((f) => (
              <FileRow key={f.p} file={f} sub={role(f.p)} onOpen={onOpenFile} />
            ))}
          </Group>
        )}
        <div className="ps-acts">
          <button className="ps-btn" onClick={onAll}>
            See all {files.length} file{files.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
