// Keeping your devices in step (the Mac, your phone, your iPad): see electron/host.cjs and remote.js.

// Your lessons as another device saved them, merged with this screen's: theirs win, except a lesson this screen is
// writing right now (its newest words are here) and one made here in the last two minutes that they haven't seen yet.
export const mergeLessons = (mine, theirs, writingHere = new Map(), now = Date.now()) => {
  const byId = new Map(mine.map((l) => [l.id, l]));
  const out = theirs
    .filter((l) => l && typeof l === 'object' && l.id)
    .map((l) =>
      writingHere.has(l.id) && byId.get(l.id)?.status === 'streaming' ? byId.get(l.id) : l,
    );
  const there = new Set(out.map((l) => l.id));
  const fresh = mine.filter(
    (l) => !there.has(l.id) && (writingHere.has(l.id) || now - (l.createdAt || 0) < 120_000),
  );
  return fresh.length ? [...fresh, ...out] : out;
};
