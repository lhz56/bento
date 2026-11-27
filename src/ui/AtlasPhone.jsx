// A project taken apart, on a phone: the same reading as Atlas.jsx, as short chapters you scroll and tap into, with
// a bottom sheet for each part, tool, step or hot spot. The pieces live in src/ui/atlas/phone/.
import { useState, useMemo } from 'react';
import { BY_ID } from '../atlas/catalog.js';
import { fallbackFlow } from './BigPicture.jsx';
import City from './City.jsx';
import { Chapter, CityCard, CityViewer } from './atlas/phone/CityCard.jsx';
import { Code } from './atlas/phone/Files.jsx';
import { NodeSheet, StorySheet, FlowMap } from './atlas/phone/FlowMap.jsx';
import { Hero } from './atlas/phone/Hero.jsx';
import { Language } from './atlas/phone/Language.jsx';
import { Learn } from './atlas/phone/Learn.jsx';
import { PartSheet, Parts } from './atlas/phone/Parts.jsx';
import { HotSheet, Risks } from './atlas/phone/Risks.jsx';
import { sayOf, ToolSheet, Services } from './atlas/phone/Services.jsx';
import { Head, Group, I, Chev, SubHead } from './atlas/phone/kit.jsx';

export const PHONE_SECTIONS = [
  ['overview', 'Summary'],
  ['how', 'How it works'],
  ['parts', 'Parts'],
  ['services', 'Services'],
  ['anatomy', 'Code city'],
  ['hot', 'Hot spots'],
  ['files', 'Code'],
  ['study', 'Learn it'],
];

// ---------------------------------------------------------------- the page
export default function PhoneAtlas(props) {
  const {
    atlas,
    facts,
    narration,
    meta,
    tools,
    hot,
    langs,
    totalL,
    mainLang,
    narrating,
    role,
    pathIdx,
    onOpen,
    onAsk,
    onFeature,
    onMakePath,
    onBuild,
    tour,
    onTour,
    onMore,
    ago,
    altsOf,
    slots = {},
  } = props;
  const [sheet, setSheet] = useState(null); // { k: 'node' | 'part' | 'tool' | 'hot' | 'story', id }
  const [city, setCity] = useState(false);
  const flow = useMemo(
    () => narration?.flow || fallbackFlow(facts, tools),
    [narration?.flow, facts, tools],
  );
  const journeys = (narration?.journeys || []).filter((j) => j.steps?.length);
  const name = (meta.full || atlas.name).split('/').pop();
  const pick = (k, id) => setSheet({ k, id });
  const close = () => setSheet(null);
  // a file opens over everything (the city included); the sheet it came from steps aside
  const openFile = (p) => {
    setSheet(null);
    onOpen(p);
  };
  const showFiles = (ids) => {
    setSheet(null);
    setCity(true);
    setTimeout(() => window.dispatchEvent(new CustomEvent('atlas-focus', { detail: ids })), 480);
  };
  const showLayer = (k) => {
    setSheet(null);
    window.dispatchEvent(new CustomEvent('atlas-layer', { detail: k }));
  };
  const toolOf = (n) =>
    (n?.stack && (tools.find((t) => t.id === n.stack) || BY_ID[n.stack])) || null;

  let shown = null;
  if (sheet?.k === 'node') {
    const node = flow.nodes.find((x) => x.id === sheet.id);
    if (node)
      shown = (
        <NodeSheet
          node={node}
          flow={flow}
          tool={toolOf(node)}
          toolOf={toolOf}
          terms={narration?.terms || []}
          pathIdx={pathIdx}
          role={role}
          onPick={(id) => pick('node', id)}
          onClose={close}
          onOpenFile={openFile}
          onAsk={onAsk}
        />
      );
  }
  if (sheet?.k === 'part')
    shown = (
      <PartSheet
        k={sheet.id}
        facts={facts}
        narration={narration}
        tools={tools}
        role={role}
        onClose={close}
        onOpenFile={openFile}
        onTool={(id) => pick('tool', id)}
        onAll={() => showLayer(sheet.id)}
      />
    );
  if (sheet?.k === 'tool') {
    const tool = tools.find((x) => x.id === sheet.id);
    if (tool)
      shown = (
        <ToolSheet
          tool={tool}
          said={sayOf(narration, tool)}
          alts={altsOf(tool)}
          narrating={narrating}
          onClose={close}
          onShowFiles={showFiles}
        />
      );
  }
  if (sheet?.k === 'hot' && hot[sheet.id])
    shown = (
      <HotSheet
        h={hot[sheet.id]}
        facts={facts}
        pathIdx={pathIdx}
        role={role}
        onClose={close}
        onOpenFile={openFile}
        onAsk={onAsk}
      />
    );
  if (sheet?.k === 'story' && journeys[sheet.id])
    shown = (
      <StorySheet
        j={journeys[sheet.id]}
        tools={tools}
        pathIdx={pathIdx}
        onClose={close}
        onOpenFile={openFile}
        onAsk={onAsk}
      />
    );

  return (
    <>
      <Hero
        atlas={atlas}
        facts={facts}
        narration={narration}
        meta={meta}
        tools={tools}
        langs={langs}
        totalL={totalL}
        narrating={narrating}
        ago={ago}
        onMore={onMore}
      />
      <section className="asec" id="sec-how">
        <Head
          title="How it works"
          sub="From the person using it to everything behind the screen. Tap any box to see what it does."
        />
        <FlowMap flow={flow} toolOf={toolOf} onPick={(id) => pick('node', id)} />
        {flow.fallback && narrating && (
          <p className="ph-foot">
            <span className="lens-spin" /> Drawing the real picture…
          </p>
        )}
        {journeys.length > 0 && (
          <Group title="Follow one thing through it">
            {journeys.map((j, i) => (
              <button key={i} className="ph-cell" onClick={() => pick('story', i)}>
                <span className="ph-ic round" style={{ '--c': 'var(--accent)' }}>
                  <I n="play" s={15} />
                </span>
                <span className="ph-ct">
                  <b>{j.title}</b>
                  <span>{j.steps.length} steps</span>
                </span>
                <Chev />
              </button>
            ))}
          </Group>
        )}
        {narration?.terms?.length > 0 && (
          <>
            <SubHead title="Words you’ll meet" />
            <div
              className="ph-pager pw-row"
              role="group"
              tabIndex={0}
              aria-label="Words you’ll meet"
            >
              {narration.terms.map((t) => (
                <div key={t.term} className="pw">
                  <b>{t.term}</b>
                  <p>{t.plain}</p>
                  {t.like && <i>{t.like}</i>}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <Parts facts={facts} tools={tools} onPick={(k) => pick('part', k)} />
      <Services tools={tools} narration={narration} onPick={(id) => pick('tool', id)} />
      <Chapter />
      <CityCard
        facts={facts}
        narration={narration}
        tools={tools}
        pathIdx={pathIdx}
        role={role}
        hot={hot}
        onExplore={() => setCity(true)}
      />
      <Risks hot={hot} narrating={narrating} onPick={(i) => pick('hot', i)} />
      <Language
        langs={langs}
        totalL={totalL}
        main={mainLang}
        narration={narration}
        narrating={narrating}
      />
      {slots.grow}
      <Code facts={facts} role={role} onOpen={onOpen} name={name} />
      <Learn
        name={name}
        narration={narration}
        tour={tour}
        onTour={onTour}
        onAsk={onAsk}
        onFeature={onFeature}
        onMakePath={onMakePath}
        onBuild={onBuild}
        narrating={narrating}
        detective={slots.detective}
      />
      {slots.contribute}
      {shown}
      {city && (
        <CityViewer onClose={() => setCity(false)}>
          <City
            facts={facts}
            narration={narration}
            tools={tools}
            pathIdx={pathIdx}
            role={role}
            onOpen={onOpen}
            narrating={narrating}
            hot={hot}
            bare
          />
        </CityViewer>
      )}
    </>
  );
}
