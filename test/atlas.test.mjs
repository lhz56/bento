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
const put = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
put('package.json', JSON.stringify({ name: 'demo', dependencies: { next: '14', react: '18', stripe: '14', '@prisma/client': '5' }, devDependencies: { vitest: '1' } }));
put('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));
put('src/app/page.tsx', "import { Button } from '@/components/button';\nimport { getPosts } from '../lib/db';\nexport default function Page() { return <Button /> }\n");
put('src/components/button.tsx', "import { cn } from '@/lib/utils';\nexport function Button() { return <button className={cn('a')} /> }\n");
put('src/lib/utils.ts', 'export const cn = (...a) => a.join(" ");\n');
put('src/lib/db.ts', "import { PrismaClient } from '@prisma/client';\nexport const getPosts = () => new PrismaClient();\n");
put('src/app/api/pay/route.ts', "import Stripe from 'stripe';\nimport { cn } from '@/lib/utils';\nexport async function POST() { return new Stripe(process.env.STRIPE_SECRET_KEY) }\n");
put('prisma/schema.prisma', 'datasource db { provider = "postgresql" }\n');
put('tools/report.py', 'from helpers import fmt\nimport requests\nprint(fmt(1))\n');
put('tools/helpers.py', 'def fmt(x):\n    return str(x)\n');
put('src/lib/utils.test.ts', "import { cn } from './utils';\n");
put('website/package.json', JSON.stringify({ name: 'docs', devDependencies: { '@docusaurus/core': '3', 'styled-components': '6' } }));
put('website/src/pages/index.js', "import styled from 'styled-components';\nexport default () => null;\n");
put('LICENSE', 'MIT');
put('README.md', '# demo');

const F = analyze(root, { name: 'demo' });
const by = Object.fromEntries(F.files.map((f) => [f.p, f]));
const idx = new Map(F.files.map((f, i) => [f.p, i]));
const imports = (p) => by[p].imp.map((i) => F.files[i].p).sort();
let fail = 0;
const check = (name, ok, got) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(got)}`}`); };

check('page is UI', by['src/app/page.tsx'].layer === 'ui', by['src/app/page.tsx'].layer);
check('api route is a door to the outside', by['src/app/api/pay/route.ts'].layer === 'server', by['src/app/api/pay/route.ts'].layer);
check('db helper is memory', by['src/lib/db.ts'].layer === 'data', by['src/lib/db.ts'].layer);
check('test file is backstage', by['src/lib/utils.test.ts'].layer === 'support', by['src/lib/utils.test.ts'].layer);
check('LICENSE is backstage', by['LICENSE'].layer === 'support', by['LICENSE'].layer);
check('alias @/ resolves', imports('src/app/page.tsx').includes('src/components/button.tsx'), imports('src/app/page.tsx'));
check('relative import resolves', imports('src/app/page.tsx').includes('src/lib/db.ts'), imports('src/app/page.tsx'));
check('utils used by 3 files', by['src/lib/utils.ts'].used === 3, by['src/lib/utils.ts'].used);
check('python sibling import resolves', imports('tools/report.py').includes('tools/helpers.py'), imports('tools/report.py'));
check('outside packages recorded', by['src/app/api/pay/route.ts'].ext.includes('stripe') && by['tools/report.py'].ext.includes('requests'), [by['src/app/api/pay/route.ts'].ext, by['tools/report.py'].ext]);
check('entry point found', by['src/app/page.tsx'].entry === true, by['src/app/page.tsx'].entry);
check('env key found', F.sig.env.includes('STRIPE_SECRET_KEY'), F.sig.env);
const stack = detectStack(F).map((s) => s.id);
for (const id of ['next', 'react', 'stripe', 'prisma', 'postgres', 'vitest']) check(`detects ${id}`, stack.includes(id), stack);
const stripe = detectStack(F).find((s) => s.id === 'stripe');
check('stripe linked to the file that uses it', stripe.used.includes(idx.get('src/app/api/pay/route.ts')), stripe.used);

fs.rmSync(root, { recursive: true, force: true });
{ const st = detectStack(F); const sc = st.find((x) => x.id === 'styled'); check('docs-site-only tool is set aside', sc?.side && sc.workshop, sc && { side: sc.side, ev: sc.evidence }); check('real tools are not set aside', !st.find((x) => x.id === 'stripe')?.side); }
process.exit(fail ? 1 : 0);
