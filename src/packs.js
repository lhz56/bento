// Content packs: anyone can write puzzles, paths and clever ideas as one JSON file and share it.
// Bento checks a pack's shape before adding it; scripts/check-puzzles.mjs --pack runs its puzzles in real Python.
// Format: docs/PACKS.md (with docs/example-pack.json).
import { STATIONS, setPackPuzzles } from './puzzles.js';

const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const KEY = 'bento.packs';
const isStr = (x, max = 20000) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function validatePack(j) {
  const errors = [];
  if (!j || typeof j !== 'object' || j.bento !== 'pack') return { errors: ['This isn’t a Bento pack (it needs "bento": "pack").'] };
  if (!isStr(j.name, 80)) errors.push('The pack needs a "name".');
  const id = slug(j.id || j.name || 'pack');
  const puzzles = []; const ideas = []; const paths = [];
  (Array.isArray(j.puzzles) ? j.puzzles : []).forEach((p, i) => {
    const where = `puzzle ${i + 1}${p?.title ? ` (“${p.title}”)` : ''}`;
    const miss = ['id', 'title', 'md', 'fn', 'start', 'fast', 'setup', 'call', 'target'].filter((k) => !isStr(p?.[k]));
    if (miss.length) return errors.push(`${where} is missing ${miss.join(', ')}.`);
    if (!Array.isArray(p.tests) || p.tests.length < 2 || !p.tests.every((c) => Array.isArray(c) && Array.isArray(c[0]))) return errors.push(`${where} needs at least two tests, each [args, expected].`);
    if (!Array.isArray(p.gremlins) || !p.gremlins.every((c) => Array.isArray(c) && isStr(c[0], 200) && Array.isArray(c[1]))) return errors.push(`${where}: gremlins are [label, args, expected].`);
    if (!/make_input/.test(p.setup)) return errors.push(`${where}: setup must define make_input(n).`);
    puzzles.push({ ...p, id: `${id}--${slug(p.id)}`, st: STATION_IDS.has(p.st) ? p.st : 'community', tier: ['warm', 'classic', 'boss'].includes(p.tier) ? p.tier : 'classic', lc: Array.isArray(p.lc) ? p.lc : null, hook: p.hook || p.title, hints: Array.isArray(p.hints) ? p.hints.slice(0, 5) : [], startWorks: !!p.startWorks, scale: p.scale && typeof p.scale === 'object' ? { text: String(p.scale.text || '') } : null, big: +p.big || 10000, pack: j.name });
  });
  (Array.isArray(j.ideas) ? j.ideas : []).forEach((x, i) => {
    const miss = ['id', 'title', 'company', 'hook', 'brief'].filter((k) => !isStr(x?.[k]));
    if (miss.length) return errors.push(`idea ${i + 1} is missing ${miss.join(', ')}.`);
    ideas.push({ id: `${id}--${slug(x.id)}`, title: x.title, company: x.company, slug: x.slug || '', theme: x.theme || 'all', mins: +x.mins || 6, art: x.art || 'hex', hook: x.hook, concepts: Array.isArray(x.concepts) ? x.concepts.slice(0, 4) : [], vs: x.vs || '', lang: x.lang === 'javascript' ? 'javascript' : 'python', repo: x.repo || null, link: x.link || null, brief: x.brief, pack: j.name });
  });
  (Array.isArray(j.paths) ? j.paths : []).forEach((x, i) => {
    if (!isStr(x?.title, 120) || !Array.isArray(x.stops) || x.stops.length < 2) return errors.push(`path ${i + 1} needs a title and at least two stops.`);
    const pid = `${id}--${slug(x.id || x.title)}`;
    paths.push({ id: pid, title: x.title, d: x.d || '', pack: j.name, stops: x.stops.filter((s) => isStr(s?.t, 120) && isStr(s?.q, 600)).map((s, k) => ({ id: `${pid}-${k}`, t: s.t, d: s.d || '', q: s.q, lang: s.lang, words: Array.isArray(s.words) ? s.words.slice(0, 4) : [] })) });
  });
  if (!puzzles.length && !ideas.length && !paths.length && !errors.length) errors.push('The pack is empty: add puzzles, ideas or paths.');
  return { errors, pack: { id, name: j.name, author: j.author || '', url: j.url || '', puzzles, ideas, paths, at: Date.now() } };
}

export const loadPacks = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export const savePacks = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
// make installed packs' puzzles visible everywhere puzzles are looked up
export function applyPacks(list) { setPackPuzzles(list.flatMap((p) => p.puzzles || [])); return { ideas: list.flatMap((p) => p.ideas || []), paths: list.flatMap((p) => p.paths || []) }; }
