// The tools a project uses, from what the static analysis found and what the reading added, each matched to
// its entry in the catalog (src/atlas/catalog.js).
import { CATALOG, BY_ID } from '../../atlas/catalog.js';

export const lc = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

const byName = Object.fromEntries(CATALOG.map((e) => [e.name.toLowerCase(), e]));

export const findTool = (name) => {
  const norm = String(name).toLowerCase().trim();
  return (
    byName[norm] ||
    BY_ID[norm] ||
    CATALOG.find((e) => e.name.toLowerCase() === norm.split(/\s*[(/]/)[0].trim())
  );
};

export function mergeTools(stack, narrStack = {}) {
  const main = stack.filter((s) => !s.workshop);
  const extra = Object.values(narrStack)
    .filter(
      (x) =>
        x.name &&
        !stack.some((s) => s.id === x.id || s.name.toLowerCase() === x.name.toLowerCase()),
    )
    .map((x) => {
      const tool = findTool(x.name);
      return {
        ...(tool || {}),
        id: x.id || x.name,
        name: x.name,
        cat: x.cat || tool?.cat || 'frame',
        slug: tool?.slug,
        what: tool?.what || x.role,
        alt: tool?.alt || [],
        used: [],
        evidence: ['spotted by reading the code'],
        added: true,
      };
    });
  return [...main, ...extra];
}
