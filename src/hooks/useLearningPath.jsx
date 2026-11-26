import { useState, useEffect } from 'react';
import { noAI } from '../ai.js';
import { api } from '../bridge.js';
import { ideaById } from '../ideas.js';
import { parseJSONLoose } from '../lesson.js';
import { tracksWith, stopSkills } from '../paths.js';
import { PRE, loadPrebuilt } from '../prebuilt.js';
import { skillsFor } from '../skills.js';
import PathBar from '../ui/PathBar.jsx';

// Paths: a series of stops toward a goal. Designing a custom path with your AI, opening a stop (a lesson that
// continues the code of the stop before, or a playground, an idea or Explore), and finding which path the lesson
// you're reading belongs to. trailBar is the strip that shows where you are on the path in a playground.
export default function useLearningPath({
  askLesson,
  lessons,
  openLesson,
  openSite,
  packStuff,
  progress,
  providers,
  readIdea,
  setPlayTab,
  setProgress,
  setViewRaw,
  settings,
  view,
}) {
  // design a custom learning path for any goal (used by The path and by an Atlas's "what it takes" card)
  const makePath = async (goal) => {
    if (noAI(providers))
      throw new Error('Connect an AI first (bottom-left), then Bento can design a path for you.');
    const j = parseJSONLoose(
      await api.quick(
        settings.model,
        `Design a learning path for a ${settings.level} learner whose goal is: "${goal}".\nThe whole path builds ONE small project, chosen to fit the goal. 6–9 short stops: the first starts from nothing, each later stop extends the program from the stop before (same names, same data), and the last stop puts it all together into a working result the learner can show someone. Each stop is ONE lesson taught with a small runnable program (Python or JavaScript; use "html" for web pages; for SQL use Python's sqlite3 in memory). No network, files or installs. Introduce at most 3 new ideas per stop, in an order where nothing is used before it's taught.\nReply JSON: {"title":"≤ 4 words","d":"one sentence, ≤ 14 words","project":"the project's name and one line about it, ≤ 12 words","end":"what the learner will have at the end, concrete, ≤ 14 words","stops":[{"t":"stop title ≤ 6 words","d":"≤ 14 words, plain","make":"what this stop's program adds to the project, ≤ 10 words","mins":5-15,"q":"the exact question to ask for this lesson, ≤ 25 words","lang":"python|javascript|html","words":["2-3 technical words this stop introduces"]}]}`,
      ),
    );
    if (!j?.stops?.length)
      throw new Error('Couldn’t design that path. Try wording the goal differently.');
    const id = `c${Date.now().toString(36)}`;
    const track = {
      id,
      goal,
      title: j.title || goal.slice(0, 24),
      d: j.d || goal,
      project: j.project || '',
      end: j.end || '',
      stops: j.stops.slice(0, 10).map((x, i) => ({
        id: `${id}-${i}`,
        t: x.t,
        d: x.d,
        make: x.make || '',
        mins: Math.max(3, Math.min(20, +x.mins || 8)),
        q: x.q,
        lang: ['python', 'javascript', 'html', 'typescript'].includes(x.lang) ? x.lang : undefined,
        words: (x.words || []).slice(0, 3),
      })),
    };
    setProgress((p) => ({ ...p, tracks: [...(p.tracks || []), track] }));
    return id;
  };
  // a stop in a custom path knows the whole path, and continues from the code of the stop before it
  const pathContext = (st) => {
    const track = (progress.tracks || []).find((t) => t.stops.some((s) => s.id === st.id));
    if (!track) return {};
    const i = track.stops.findIndex((s) => s.id === st.id),
      last = i === track.stops.length - 1;
    const before = track.stops[i - 1];
    const prevL =
      before && lessons.find((l) => l.id === progress.path?.[before.id] && l.status === 'done');
    const path =
      `stop ${i + 1} of ${track.stops.length} in "${track.title}" (the learner's goal: "${track.goal || track.d}")${track.project ? `. The whole path builds one project: ${track.project}` : ''}.\nStops: ${track.stops.map((s, k) => `${k + 1}. ${s.t}${k === i ? ' ← THIS ONE' : ''}`).join('; ')}.\n` +
      (i === 0
        ? 'Start the project from nothing.'
        : prevL
          ? 'Continue the program from the previous stop (below): keep its names and data, and add only this stop’s piece.'
          : `Assume the learner built stops 1–${i} already; begin with a short version of that program, then add this stop’s piece.`) +
      (st.make ? ` This stop adds: ${st.make}.` : '') +
      (last && track.end ? ` This is the final stop: finish with ${track.end}` : '') +
      ' Don’t re-teach ideas from earlier stops; name them briefly and move on.';
    return { path, ...(prevL ? { prev: prevL } : {}) };
  };
  const startStop = (st) => {
    if (!PRE.ready) return void loadPrebuilt().then(() => startStop(st));
    const id = progress.path?.[st.id];
    const l = id && lessons.find((x) => x.id === id);
    if (l) return openLesson(l);
    const pre = PRE.path[st.id];
    if (pre && (!settings.voice || settings.voice === 'English') && settings.level !== 'engineer') {
      openLesson({ ...pre, createdAt: Date.now() });
      setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: pre.id } }));
      return;
    }
    const nid = askLesson(st.q, {
      ...(st.lang ? { lang: st.lang } : {}),
      ...(st.mode ? { mode: st.mode } : {}),
      ...pathContext(st),
    });
    setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: nid } }));
  };
  // a stop that opens another part of Bento counts as done once it's opened
  const markStop = (st) =>
    setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: 'x' } }));
  // (a playground or Explore shows where you are on the path, so you can go on to the next stop)
  const [trail, setTrail] = useState(null);
  useEffect(() => {
    if (trail && view !== trail.view) setTrail(null);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // a stop on a path that teaches this map skill and opens instantly (the next one you haven't done, or the first)
  const readyFor = (sid) => {
    const all = tracksWith().flatMap((track) =>
      track.stops
        .filter(
          (x) => (PRE.path[x.id] || x.idea || x.play) && stopSkills(x, skillsFor).includes(sid),
        )
        .map((st) => ({ T: track, st })),
    );
    const c = all.find((x) => !progress.path?.[x.st.id]) || all[0];
    return c ? { icon: c.T.icon, label: c.st.t, path: c.T.title, go: () => goStop(c.st) } : null;
  };
  const trailBar = () =>
    trail && view === trail.view ? (
      <PathBar
        info={pathFind((x) => x.id === trail.id)}
        onPage={() => setViewRaw('path')}
        onStop={goStop}
      />
    ) : null;
  const goStop = (st) => {
    setTrail(
      st.explore ? { id: st.id, view: 'explore' } : st.play ? { id: st.id, view: 'play' } : null,
    );
    if (st.explore) {
      markStop(st);
      return setViewRaw('explore');
    }
    if (st.site) {
      markStop(st);
      return openSite('https://wikipedia.org');
    }
    if (st.play) {
      markStop(st);
      setPlayTab(st.play);
      return setViewRaw('play');
    }
    if (st.idea && ideaById[st.idea]) {
      const id = readIdea(ideaById[st.idea]);
      return setProgress((p) => ({ ...p, path: { ...(p.path || {}), [st.id]: id || 'x' } }));
    }
    return startStop(st);
  };
  // which path (and which stop) the open lesson belongs to, so it never feels like it came from nowhere
  const pathFind = (match) => {
    for (const { title: name, stops } of tracksWith([
      ...(progress.tracks || []),
      ...packStuff.paths,
    ])) {
      const i = stops.findIndex(match);
      if (i >= 0)
        return { name, i, stops, done: stops.filter((x) => progress.path?.[x.id]).length };
    }
    return null;
  };
  const pathOf = (lesson) => (lesson ? pathFind((x) => progress.path?.[x.id] === lesson.id) : null);
  return { goStop, makePath, pathOf, readyFor, startStop, trailBar };
}
