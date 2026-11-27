// House rules the code keeps (CONTRIBUTING.md): every source file opens with a comment that says what it's for, so
// the top of any file is enough to know whether it's the one you want.
// node test/conventions.test.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files', 'src', 'electron', 'scripts', 'test'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((p) => /\.(js|jsx|mjs|cjs)$/.test(p) && !/^test\/fixtures\//.test(p));

const bare = tracked.filter((p) => {
  const first = fs.readFileSync(path.join(root, p), 'utf8').split('\n')[0];
  return !/^(\/\/|\/\*|#!|'use strict')/.test(first);
});
console.log(
  bare.length
    ? `✗ ${bare.length} files don't say what they're for on their first line:\n  ${bare.join('\n  ')}`
    : `✓ all ${tracked.length} source files open with what they're for`,
);
process.exit(bare.length ? 1 : 0);
