// Prints this version's section of CHANGELOG.md: the text of its GitHub release.
//   node scripts/release-notes.mjs            the version in package.json
//   node scripts/release-notes.mjs 0.3.0      another version
// Exits with an error if there's no section for it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
export function notesFor(md, v) {
  const lines = md.split('\n'); const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${v.replace(/\./g, '\\.')}(?=\\s|$)`).test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim() || null;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { // run directly, not imported
  const notes = notesFor(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (!notes) { console.error(`CHANGELOG.md has no "## ${version}" section.`); process.exit(1); }
  console.log(notes);
}
