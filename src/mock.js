// Browser-only stand-in for the Electron bridge (used when you open the Vite page in a browser).
import { SAMPLES } from './lesson.js';
import { WEB, webBridge } from './web.js';

function toNdjson(L) {
  const out = [
    { t: 'title', title: L.title, kicker: L.kicker, lang: L.lang, concepts: L.concepts },
    L.story[0],
    { t: 'code', file: L.file, code: L.code },
    { t: 'pseudo', lines: L.pseudo },
    { t: 'notes', items: L.notes },
    ...L.story.slice(1),
  ];
  if (L.growth) out.splice(5, 0, { t: 'growth', ...L.growth });
  return out.map((b) => JSON.stringify(b)).join('\n') + '\n';
}

export const mockBridge = {
  providers: async () => ({ claude: true, codex: true, gh: false, mock: true }),
  ask(_model, prompt, { chunk, done }) {
    const L = /closure/i.test(prompt)
      ? SAMPLES[3]
      : /art|draw|spiral/i.test(prompt)
        ? SAMPLES[2]
        : /big-?o|complex/i.test(prompt)
          ? SAMPLES[1]
          : SAMPLES[0];
    const text = toNdjson(L);
    let i = 0;
    let stop = false;
    const tick = () => {
      if (stop) return;
      if (i >= text.length) return done();
      chunk(text.slice(i, i + 90));
      i += 90;
      setTimeout(tick, 18);
    };
    setTimeout(tick, 500);
    return () => {
      stop = true;
    };
  },
  quick: async (_m, prompt) => {
    await new Promise((r) => setTimeout(r, 450));
    if (/pseudocode/i.test(prompt)) {
      const n = +(/exactly (\d+) entries/.exec(prompt)?.[1] || 1);
      return JSON.stringify({ lines: Array.from({ length: n }, () => 'a step in plain English') });
    }
    if (/Translate/i.test(prompt))
      return JSON.stringify({ code: '// translation needs the desktop app', map: [] });
    if (/fails with/i.test(prompt))
      return JSON.stringify({
        plain: 'Something on that line does not exist yet.',
        fix: 'Check the spelling of the name.',
        line: null,
      });
    const w = /"title":"([^"]+)"/.exec(prompt)?.[1] || 'it';
    return JSON.stringify({
      title: w,
      what: `${w} is part of this program (preview mode answer).`,
      plain: 'used here',
      example: '',
    });
  },
  openFolder: async () => null,
  readFile: async () => '',
  ghMe: async () => null,
  ghRepos: async () => [],
  ghTree: async () => null,
  ghFile: async () => '',
  openExternal: async () => {},
};

// takeitapart.app/try: no AI behind the page, so anything that needs one asks for the Mac app (web.js)
if (WEB) Object.assign(mockBridge, webBridge);
