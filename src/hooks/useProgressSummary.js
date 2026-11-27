// What you've learned, summed up for the screens that show it: how well you know each skill (mastery, and the
// dots on the sky), Home's "Today" (one next step from each part of Bento), the ideas you've read, and builtins:
// everything Bento can open by name, for search and for routing.
import { useMemo } from 'react';
import { t } from '../i18n.js';
import { IDEAS } from '../ideas.js';
import { SAMPLES } from '../lesson.js';
import { tracksWith, ALL_STOPS } from '../paths.js';
import { PRE } from '../prebuilt.js';
import { PUZZLES } from '../puzzles.js';
import { masteryOf, SKILLS, isFading, REGIONS } from '../skills.js';
import { RACE_LESSONS } from './useLessons.js';

export default function useProgressSummary({
  goStop,
  lessons,
  openDaily,
  openLesson,
  openPuzzle,
  openSim,
  packStuff,
  progress,
  readIdea,
  setViewRaw,
  startStop,
}) {
  // the clever ideas you've read: a finished lesson that came from one
  const readIds = useMemo(
    () =>
      Object.fromEntries(
        lessons
          .filter((l) => l.context?.ideaId && l.status === 'done' && (!l.builtin || l.touched))
          .map((l) => [l.context.ideaId, true]),
      ),
    [lessons],
  );
  const mastery = useMemo(
    () =>
      masteryOf({
        progress,
        lessons,
        puzzles: PUZZLES,
        stops: ALL_STOPS,
        ideas: IDEAS,
        readIds,
      }),
    [progress, lessons, readIds],
  );
  // Home's "Today": one next step from each part of Bento
  const today = useMemo(() => {
    const out = [];
    // the next stop on the path you picked (or the first one you haven't finished)
    const paths = tracksWith([...(progress.tracks || []), ...packStuff.paths]);
    const picked = paths.find((x) => x.k === localStorage.getItem('bento.track'));
    const track = [picked, ...paths].find((x) => x && x.stops.some((s) => !progress.path?.[s.id]));
    const si = track ? track.stops.findIndex((s) => !progress.path?.[s.id]) : -1;
    const stop = track?.stops[si];
    if (stop)
      out.push({
        k: 'path',
        icon: '⤳',
        label: stop.t,
        sub: t('next on the path'),
        track: track.own ? track.title : t(track.title),
        step: { i: si + 1, n: track.stops.length },
        go: () => goStop(stop),
      });
    const pz = PUZZLES.find((p) => (progress.puzzles?.[p.id]?.s || []).filter(Boolean).length < 3);
    if (pz)
      out.push({
        k: 'puzzle',
        icon: '◇',
        label: pz.title,
        sub: t('next puzzle'),
        go: () => openPuzzle(pz),
      });
    const fading = SKILLS.filter(([id]) => isFading(mastery[id] || {})).length;
    const due = Object.values(progress.words || {}).filter(
      (w) => w.next && w.next <= Date.now(),
    ).length;
    if (fading || due)
      out.push({
        k: 'review',
        icon: '✺',
        label: fading ? `${fading} ${t('topics fading')}` : `${due} ${t('words to review')}`,
        sub: t('a two-minute review'),
        go: () => setViewRaw(fading ? 'map' : 'words'),
      });
    const unread = IDEAS.filter((i) => !readIds[i.id]);
    const idea = unread[Math.floor(Date.now() / 864e5) % Math.max(1, unread.length)];
    if (idea)
      out.push({
        k: 'idea',
        icon: '⬡',
        label: idea.title,
        sub: `${t('clever idea')} · ${idea.company}`,
        go: () => readIdea(idea),
      });
    out.push({
      k: 'bug',
      icon: '⚑',
      label: t('Daily bug'),
      sub: t('a two-minute challenge'),
      go: openDaily,
    });
    // a plan for today: how long each takes, and whether it's already done today
    const isToday = (at) => !!at && new Date(at).toDateString() === new Date().toDateString();
    const awarded = new Set(progress.awarded || []);
    const day = new Date().toISOString().slice(0, 10);
    const bugId = progress.daily?.[day];
    const doneToday = {
      puzzle: Object.values(progress.puzzles || {}).some(
        (r) => isToday(r.at) && (r.s || []).some(Boolean),
      ),
      bug: !!bugId && awarded.has(`${bugId}:challenge`),
      idea: lessons.some((l) => l.context?.ideaId && l.status === 'done' && isToday(l.createdAt)),
      review: Object.values(progress.reviewed || {}).some(isToday),
    };
    const mins = { path: 12, puzzle: 8, idea: 6, bug: 2, review: 2 };
    return out.slice(0, 5).map((x) => ({ ...x, mins: mins[x.k], done: !!doneToday[x.k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Today changes with what you learned; its actions are read as they are then
  }, [progress, mastery, lessons, packStuff, readIds]);
  // lessons that ship with Bento, findable from ⌘K and the Home ask box (they open instantly, without your AI)
  const builtins = [
    ...SAMPLES.map((l) => ({
      label: l.title,
      alt: l.q,
      find: `${l.title} ${l.q} ${(l.concepts || []).join(' ')}`,
      hint: l.kicker,
      run: () => openLesson(lessons.find((x) => x.id === l.id) || l),
    })),
    ...Object.entries(PRE.sims).map(([k, l]) => ({
      label: l.title,
      alt: k,
      find: `${l.title} ${k}`,
      hint: 'simulation',
      run: () => openSim(k),
    })),
    ...RACE_LESSONS.map((l) => ({
      label: l.title,
      find: `${l.title} ${l.q} race`,
      hint: 'algorithm race',
      run: () => openLesson(l),
    })),
    ...tracksWith().flatMap((track) =>
      track.stops
        .filter((st) => PRE.path[st.id])
        .map((st) => ({
          label: st.t,
          alt: PRE.path[st.id].title,
          find: `${st.t} ${PRE.path[st.id].title} ${st.q} ${st.d}`,
          hint: track.title,
          run: () => startStop(st),
        })),
    ),
  ];
  const skyDots = useMemo(
    () =>
      SKILLS.map(([id, region, name]) => ({
        id,
        r: region,
        name,
        lv: mastery[id]?.level || 0,
        c: (REGIONS.find((r) => r.id === region) || {}).color,
      })),
    [mastery],
  );
  return { builtins, mastery, readIds, skyDots, today };
}
