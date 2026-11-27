// Static analysis checks on a tiny fake project: layers, import resolution, entry points, manifests.
// node test/atlas.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { analyze } = require('../electron/atlas.cjs');
const { detectStack } = await import('../src/atlas/analyze.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bento-atlas-'));
const put = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), s);
};
put(
  'package.json',
  JSON.stringify({
    name: 'demo',
    dependencies: { next: '14', react: '18', stripe: '14', '@prisma/client': '5' },
    devDependencies: { vitest: '1' },
  }),
);
put('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));
put(
  'src/app/page.tsx',
  "import { Button } from '@/components/button';\nimport { getPosts } from '../lib/db';\nexport default function Page() { return <Button /> }\n",
);
put(
  'src/components/button.tsx',
  "import { cn } from '@/lib/utils';\nexport function Button() { return <button className={cn('a')} /> }\n",
);
put('src/lib/utils.ts', 'export const cn = (...a) => a.join(" ");\n');
put(
  'src/lib/db.ts',
  "import { PrismaClient } from '@prisma/client';\nexport const getPosts = () => new PrismaClient();\n",
);
put(
  'src/app/api/pay/route.ts',
  "import Stripe from 'stripe';\nimport { cn } from '@/lib/utils';\nexport async function POST() { return new Stripe(process.env.STRIPE_SECRET_KEY) }\n",
);
put('prisma/schema.prisma', 'datasource db { provider = "postgresql" }\n');
put('tools/report.py', 'from helpers import fmt\nimport requests\nprint(fmt(1))\n');
put('tools/helpers.py', 'def fmt(x):\n    return str(x)\n');
put('src/lib/utils.test.ts', "import { cn } from './utils';\n");
put(
  'website/package.json',
  JSON.stringify({
    name: 'docs',
    devDependencies: { '@docusaurus/core': '3', 'styled-components': '6' },
  }),
);
put(
  'website/src/pages/index.js',
  "import styled from 'styled-components';\nexport default () => null;\n",
);
// a test whose sample code mentions a tool the project doesn't use (as Bento's own analyzer test does)
put(
  'test/samples.test.mjs',
  'const sample = "import { createClient } from \'@supabase/supabase-js\';\\nconst url = process.env.SUPABASE_URL;";\n',
);
put('LICENSE', 'MIT');
put('README.md', '# demo');

const F = analyze(root, { name: 'demo' });
const by = Object.fromEntries(F.files.map((f) => [f.p, f]));
const idx = new Map(F.files.map((f, i) => [f.p, i]));
const imports = (p) => by[p].imp.map((i) => F.files[i].p).sort();
let fail = 0;
const check = (name, ok, got) => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(got)}`}`);
};

check('page is UI', by['src/app/page.tsx'].layer === 'ui', by['src/app/page.tsx'].layer);
check(
  'api route is a door to the outside',
  by['src/app/api/pay/route.ts'].layer === 'server',
  by['src/app/api/pay/route.ts'].layer,
);
check('db helper is memory', by['src/lib/db.ts'].layer === 'data', by['src/lib/db.ts'].layer);
check(
  'test file is backstage',
  by['src/lib/utils.test.ts'].layer === 'support',
  by['src/lib/utils.test.ts'].layer,
);
check('LICENSE is backstage', by['LICENSE'].layer === 'support', by['LICENSE'].layer);
check(
  'alias @/ resolves',
  imports('src/app/page.tsx').includes('src/components/button.tsx'),
  imports('src/app/page.tsx'),
);
check(
  'relative import resolves',
  imports('src/app/page.tsx').includes('src/lib/db.ts'),
  imports('src/app/page.tsx'),
);
check('utils used by 3 files', by['src/lib/utils.ts'].used === 3, by['src/lib/utils.ts'].used);
check(
  'python sibling import resolves',
  imports('tools/report.py').includes('tools/helpers.py'),
  imports('tools/report.py'),
);
check(
  'outside packages recorded',
  by['src/app/api/pay/route.ts'].ext.includes('stripe') &&
    by['tools/report.py'].ext.includes('requests'),
  [by['src/app/api/pay/route.ts'].ext, by['tools/report.py'].ext],
);
check('entry point found', by['src/app/page.tsx'].entry === true, by['src/app/page.tsx'].entry);
check('env key found', F.sig.env.includes('STRIPE_SECRET_KEY'), F.sig.env);
const stack = detectStack(F).map((s) => s.id);
for (const id of ['next', 'react', 'stripe', 'prisma', 'postgres', 'vitest'])
  check(`detects ${id}`, stack.includes(id), stack);
check(
  'a tool only in a test’s sample code is not the project’s',
  !stack.includes('supabase'),
  stack,
);
check('env keys in tests are not the project’s', !F.sig.env.includes('SUPABASE_URL'), F.sig.env);
const stripe = detectStack(F).find((s) => s.id === 'stripe');
check(
  'stripe linked to the file that uses it',
  stripe.used.includes(idx.get('src/app/api/pay/route.ts')),
  stripe.used,
);

fs.rmSync(root, { recursive: true, force: true });
{
  const st = detectStack(F);
  const sc = st.find((x) => x.id === 'styled');
  check(
    'docs-site-only tool is set aside',
    sc?.side && sc.workshop,
    sc && { side: sc.side, ev: sc.evidence },
  );
  check('real tools are not set aside', !st.find((x) => x.id === 'stripe')?.side);
}
// asking about a project: which files get read, and what the tutor is shown
{
  const { pickFiles, excerpt, lessonLanguage, buildLanguage, answerAboutProject, definedNames } =
    await import('../src/atlas/questions.js');
  const picked = pickFiles([
    { p: 'src/a/one.js', score: 5, words: ['claude'] },
    { p: 'src/a/two.js', score: 4.9, words: ['claude'] },
    { p: 'src/a/three.js', score: 4.8, words: ['claude'] },
    { p: 'src/b/codex.js', score: 2, words: ['codex'] },
  ]).map((x) => x.p);
  check(
    'a question naming two things reads a file for each, and at most 2 from one folder',
    picked.join() === 'src/a/one.js,src/b/codex.js,src/a/two.js',
    picked.join(),
  );
  const long = 'some line\n'.repeat(400) + 'THE MATCH\n' + 'more\n'.repeat(10);
  check(
    'a file excerpt starts near where the words were found',
    /from character/.test(excerpt('f.js', long, 4000)) &&
      excerpt('f.js', long, 4000).includes('THE MATCH'),
  );
  check(
    'lessons about a project pick its language',
    lessonLanguage({ langs: { Python: 9 }, files: [] }) === 'python' &&
      lessonLanguage({ langs: { Python: 9, TypeScript: 1 }, files: [] }) === 'javascript' &&
      buildLanguage({ langs: { TypeScript: 9 }, files: [] }) === 'typescript',
  );
  check(
    'the telling names in a file leave out ones every project has',
    definedNames('a.py', 'def main():\n  pass\ndef parse_rows(x):\n  pass').join() === 'parse_rows',
  );
  const atlas = {
    key: 'me/demo',
    name: 'me/demo',
    src: { root: '/tmp/demo' },
    facts: { files: [{ p: 'src/pay.js', lang: 'JavaScript' }], langs: { JavaScript: 1 } },
  };
  let prompt = '';
  const answer = await answerAboutProject({
    quick: async (_model, p) => ((prompt = p), JSON.stringify({ answer: 'It charges cards.' })),
    model: 'm',
    level: 'student',
    atlas,
    question: 'how does paying work?',
    readFile: async () => 'export function charge() {}',
    search: async () => [{ p: 'src/pay.js', score: 3, words: ['paying'], at: 0 }],
    noAnswer: 'none',
  });
  check(
    'a project question is answered from the files that matched, shown to the tutor',
    answer.a === 'It charges cards.' &&
      answer.files.join() === 'src/pay.js' &&
      prompt.includes('--- src/pay.js ---\nexport function charge() {}'),
    JSON.stringify(answer),
  );
}
process.exit(fail ? 1 : 0);
