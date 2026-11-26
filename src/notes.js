// A version's part of CHANGELOG.md, for "What's new" (ui/WhatsNew.jsx): its opening line and its bullet points.
export function notesFor(version, text) {
  const esc = String(version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^## v?${esc}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  if (!m) return null;
  const items = [];
  let intro = '';
  for (const line of m[1].split('\n')) {
    const l = line.trim();
    if (!l) continue;
    if (/^[-*] /.test(l)) items.push(l.slice(2));
    else if (!items.length) intro += (intro ? ' ' : '') + l;
    else items[items.length - 1] += ` ${l}`;
  }
  return { intro, items };
}
