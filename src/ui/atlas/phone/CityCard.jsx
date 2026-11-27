// The code city on a phone: a card that opens the full city.
import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import City from '../../City.jsx';
import { I, Head, onTop } from './kit.jsx';

// ---------------------------------------------------------------- where the plain-words part ends and the technical side begins
export function Chapter() {
  return (
    <div className="ph-chapter" role="separator">
      <span className="pc-ic" aria-hidden="true">
        <I n="code" s={22} w={2.2} />
      </span>
      <h2>Under the hood</h2>
      <p>The technical side: the code itself, where it could break, and how to read it.</p>
    </div>
  );
}

// ---------------------------------------------------------------- the code city: a picture of it here, the city itself full screen
const CITY_W = 760; // the size the city is laid out at on a phone (City.jsx)

export function CityCard({ facts, narration, tools, pathIdx, role, hot, onExplore }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState({ s: 0.45, h: 260 });
  useLayoutEffect(() => {
    const el = box.current,
      scroller = inner.current;
    if (!el || !scroller) return undefined;
    const up = () => {
      const s = el.clientWidth / CITY_W;
      setFit({ s, h: Math.round(Math.min(340, Math.max(180, scroller.offsetHeight * s))) });
    };
    const ro = new ResizeObserver(up);
    ro.observe(el);
    ro.observe(scroller);
    up();
    return () => ro.disconnect();
  }, []);
  return (
    <section className="asec" id="sec-anatomy">
      <Head
        title="Code city"
        sub="Every file is a building: taller means more code. Districts are the kinds of part."
      />
      <div className="cc-card" ref={box} style={{ height: fit.h }}>
        <div
          className="cc-city"
          ref={inner}
          style={{ transform: `scale(${fit.s})` }}
          aria-hidden="true"
          inert
        >
          <City
            facts={facts}
            narration={narration}
            tools={tools}
            pathIdx={pathIdx}
            role={role}
            onOpen={() => {}}
            narrating={false}
            hot={hot}
            bare
          />
        </div>
        <button className="cc-hit" onClick={onExplore} aria-label="Open the code city">
          <span className="cc-go">
            <I n="expand" s={16} w={2.2} />
            Explore the city
          </span>
        </button>
      </div>
    </section>
  );
}

export function CityViewer({ onClose, children }) {
  const shut = useRef(onClose);
  shut.current = onClose;
  // (a file opened from the city closes on its own Esc: the city stays)
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.drawer')) shut.current();
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);
  return onTop(
    <div className="cv-full" role="dialog" aria-label="Code city">
      <div className="cv-bar">
        <b>Code city</b>
        <button className="cv-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="cv-body">{children}</div>
    </div>,
  );
}
