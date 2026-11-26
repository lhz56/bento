// Lessons that ship already written (clever ideas, path stops, simulations, the daily bug): about 660 KB, so they're
// kept out of the code the first screen waits for. They start loading as Bento starts, in their own files, and are
// ready a few milliseconds after the first screen. Until then these lists are empty and PRE.ready is false: anything
// that opens one of these lessons waits for loadPrebuilt() first (never falls back to asking your AI).
export const PRE = { ideas: {}, path: {}, sims: {}, bugs: {}, ready: false };
const shape = (raw, id) =>
  Object.fromEntries(
    Object.entries(raw).map(([key, lesson], i) => [
      key,
      {
        ...lesson,
        id: id(key, i),
        builtin: true,
        status: 'done',
        thinking: null,
        chat: [],
        work: null,
        createdAt: 0,
      },
    ]),
  );
let loading = null;
export function loadPrebuilt() {
  loading ??= Promise.all([
    import('./ideas-prebuilt.json'),
    import('./path-prebuilt.json'),
    import('./sims-prebuilt.json'),
    import('./bugs-prebuilt.json'),
  ]).then(([ideas, path, sims, bugs]) =>
    Object.assign(PRE, {
      ideas: shape(ideas.default, (k) => `idea-${k}`),
      path: shape(path.default, (k) => `path-${k}`),
      sims: shape(sims.default, (_k, i) => `sim-${i}`),
      bugs: bugs.default,
      ready: true,
    }),
  );
  return loading;
}
loadPrebuilt().catch(() => {
  loading = null;
});
