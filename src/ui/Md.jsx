// Bento's small Markdown: **bold**, *italic*, `a term` (click for its meaning) and [[3-5|a link]] to lines of the
// lesson's code (hover lights them, click jumps there). Used for every short piece of AI-written text.
const RX = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[\d+(?:-\d+)?\|[^\]]+\]\])/g;

/**
 * @param {{ text: string, onLink?: (range: [number, number] | null) => void,
 *   onLinkClick?: (range: [number, number]) => void, onTerm?: (word: string, el: HTMLElement) => void }} props
 */
export default function Md({ text, onLink, onLinkClick, onTerm }) {
  const parts = String(text || '').split(RX);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('[[')) {
      const match = /^\[\[(\d+)(?:-(\d+))?\|([^\]]+)\]\]$/.exec(part);
      /** @type {[number, number]} */
      const range = [+match[1], +(match[2] || match[1])];
      const label = match[3].replace(/`/g, '');
      const named = (label.match(/\d+/g) || []).map(Number);
      const says = named.includes(range[0]) && named.includes(range[1]);
      return (
        <span
          key={i}
          className="lnk"
          onMouseEnter={() => onLink?.(range)}
          onMouseLeave={() => onLink?.(null)}
          onClick={() => onLinkClick?.(range)}
        >
          {label}
          {!says && <sup>{range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}</sup>}
        </span>
      );
    }
    if (part.startsWith('`')) {
      const w = part.slice(1, -1);
      return (
        <code key={i} className="term" onClick={(e) => onTerm?.(w, e.currentTarget)}>
          {w}
        </code>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <i key={i}>{part.slice(1, -1)}</i>;
    return <span key={i}>{part}</span>;
  });
}
