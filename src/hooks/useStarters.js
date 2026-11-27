// Lessons you start without typing a question: a clever idea (ready-made when it shipped with Bento), a scratch
// pad to write your own code in (or remix a lesson's), and today's bug to fix. altFor names your other AI, which
// writes the daily bug when the first one can't.
import { altOf, noAI } from '../ai.js';
import { emptyLesson, CHALLENGE } from '../lesson.js';
import { keys } from '../platform.js';
import { PRE, loadPrebuilt } from '../prebuilt.js';

export default function useStarters({
  askLesson,
  cancels,
  lessons,
  openLesson,
  progress,
  providers,
  setCurrentId,
  setLessons,
  setProgress,
  setStepSel,
  setViewRaw,
  settings,
}) {
  const readIdea = (idea) => {
    if (!PRE.ready) {
      loadPrebuilt().then(() => readIdea(idea));
      return null;
    }
    const pre = PRE.ideas[idea.id];
    const english = !settings.voice || settings.voice === 'English';
    if (pre && english && !lessons.some((l) => l.context?.ideaId === idea.id)) {
      openLesson({ ...pre, createdAt: Date.now() });
      return pre.id;
    } // shipped with the app: opens instantly
    const have = lessons.find(
      (l) =>
        l.context?.ideaId === idea.id &&
        (l.status === 'done' || (l.status === 'streaming' && cancels.current.has(l.id))),
    );
    if (have) {
      openLesson(have);
      return have.id;
    }
    return askLesson(idea.title, {
      mode: 'idea',
      lang: idea.lang,
      context: {
        ideaId: idea.id,
        title: idea.title,
        company: idea.company,
        brief: idea.brief,
        code: idea.code,
        vs: idea.vs,
        repo: idea.repo,
        file: idea.file,
        link: idea.link,
      },
    });
  };
  // a blank scratchpad, or a remix of the same lesson, that you never touched (no edits, no questions) is replaced by
  // the new one instead of piling up in Recent
  const untouchedTwin = (x, lesson) =>
    x.scratch && !x.work && !(x.chat || []).length && x.title === lesson.title;
  const newScratch = (lang = settings.lang, remix = null) => {
    const py = lang === 'python';
    if (lang === 'html' || lang === 'typescript') {
      const web = lang === 'html';
      const starter = web
        ? '<!doctype html>\n<html>\n<head>\n<style>\n  body { font-family: sans-serif; padding: 24px; }\n  button { font-size: 18px; padding: 8px 16px; }\n</style>\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button id="btn">Click me</button>\n  <p id="out"></p>\n  <script>\n    document.getElementById("btn").addEventListener("click", () => {\n      document.getElementById("out").textContent = "You clicked at " + new Date().toLocaleTimeString();\n    });\n  </script>\n</body>\n</html>'
        : `// Write anything here. Press ${keys('⌘↵')} to run it.\ninterface Pet { name: string; age: number }\nconst pets: Pet[] = [{ name: "Biscuit", age: 3 }, { name: "Mochi", age: 5 }];\nfor (const p of pets) {\n  console.log(\`\${p.name} is \${p.age}\`);\n}\nshow(pets.map((p) => p.age));`;
      const L2 = {
        ...emptyLesson('', { lang, model: settings.model }),
        title: remix ? `Remix of ${remix.title}` : 'Scratchpad',
        kicker: 'your own code',
        scratch: true,
        status: 'done',
        code: remix ? remix.code : starter,
        file: web ? 'index.html' : 'scratch.ts',
        pseudo: remix ? remix.pseudo : [],
        story: [
          {
            t: 'p',
            md: web
              ? 'A blank web page that explains itself. Change the code on the right and the page updates. **Save my page** keeps it as a real file.'
              : 'A blank page for TypeScript. Type errors appear on the right line as you type; **Run** shows the result.',
          },
          {
            t: 'try',
            items: web
              ? ['Change the button colour', 'Add a second button', 'Show a list of items']
              : ['Give a pet a wrong type', 'Add a new field', 'Step through the loop'],
          },
        ],
      };
      setLessons((ls) => [L2, ...ls.filter((x) => !untouchedTwin(x, L2))]);
      setCurrentId(L2.id);
      setViewRaw('lesson');
      setStepSel(null);
      return;
    }
    const code = py
      ? `# Write anything here. Press ${keys('⌘↵')} to run it.\nname = "world"\nfor i in range(3):\n    print("hello", name, i)\n\nshow([3, 1, 4, 1, 5, 9, 2, 6])`
      : `// Write anything here. Press ${keys('⌘↵')} to run it.\nconst name = "world";\nfor (let i = 0; i < 3; i++) {\n  console.log("hello", name, i);\n}\n\nshow([3, 1, 4, 1, 5, 9, 2, 6]);`;
    const pseudo = py
      ? [
          'A note to yourself (Python skips it)',
          'Make a box called name holding "world"',
          'Repeat the next line 3 times, counting with i',
          'Print a greeting with the count',
          '',
          'Draw these numbers as bars',
        ]
      : [
          'A note to yourself (JavaScript skips it)',
          'Make a box called name holding "world"',
          'Repeat 3 times, counting with i',
          'Print a greeting with the count',
          '',
          '',
          'Draw these numbers as bars',
        ];
    const lesson = {
      ...emptyLesson('', { lang, model: settings.model }),
      title: remix ? `Remix of ${remix.title}` : 'Scratchpad',
      kicker: 'your own code',
      scratch: true,
      status: 'done',
      code: remix ? remix.code : code,
      file: py ? 'scratch.py' : 'scratch.js',
      pseudo: remix ? remix.pseudo : pseudo,
      story: [
        {
          t: 'p',
          md: 'A blank page that explains itself. Type any code on the right: Bento turns each line into plain English as you go, **Run** shows the result, and **Step** walks through it line by line.',
        },
        {
          t: 'p',
          md: 'Hover any word for a quick explanation. Stuck? Ask below, like “why does range start at 0?”.',
        },
        {
          t: 'try',
          items: [
            'Change 3 to 10',
            'Step through the loop',
            py ? 'Print your own name' : 'Log your own name',
          ],
        },
      ],
    };
    setLessons((ls) => [lesson, ...ls.filter((x) => !untouchedTwin(x, lesson))]);
    setCurrentId(lesson.id);
    setViewRaw('lesson');
    setStepSel(null);
  };
  const altFor = (m) => altOf(m, providers);
  const altModel = altFor(settings.model);
  // a new bug every day (generated once, then kept), the built-in one when no AI is connected
  const openDaily = () => {
    if (!PRE.ready) return void loadPrebuilt().then(() => openDaily());
    const day = new Date().toISOString().slice(0, 10);
    const id = progress.daily?.[day];
    const have = id && lessons.find((l) => l.id === id && l.status !== 'error');
    if (have) return openLesson(have);
    const topics = [
      'arrays',
      'strings',
      'loops',
      'recursion',
      'dictionaries',
      'off-by-one errors',
      'sorting',
      'string formatting',
      'conditionals',
      'functions and return values',
      'nested lists',
      'counting things',
    ];
    const topic = topics[Math.floor(Date.now() / 86400000) % topics.length];
    const pre = PRE.bugs[topic];
    const english = !settings.voice || settings.voice === 'English';
    if (pre && settings.lang === 'python' && english && settings.level !== 'engineer') {
      const lesson = {
        ...pre,
        id: `bug-${day}`,
        status: 'done',
        thinking: null,
        chat: [],
        work: null,
        createdAt: Date.now(),
      };
      setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: lesson.id } }));
      return openLesson(lesson);
    }
    if (!providers || noAI(providers)) return openLesson(CHALLENGE);
    const nid = askLesson(topic, { mode: 'challenge', lang: settings.lang });
    setProgress((p) => ({ ...p, daily: { ...(p.daily || {}), [day]: nid } }));
  };
  return { altFor, altModel, newScratch, openDaily, readIdea };
}
