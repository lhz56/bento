import { ICONS as SI } from '../atlas/icons.js';

// Codex has no simple-icons mark: a terminal prompt (Codex is a command-line AI), in ink like the others
const ICONS = {
  ...SI,
  codexcli: ['111111', 'M3.3 6.7 4.7 5.3 11.4 12l-6.7 6.7-1.4-1.4L8.6 12zM12 16.5h8.5v2H12z'],
};

const lum = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

// A real brand mark (simple-icons, CC0) on a paper medallion. Near-black or near-white marks use
// the ink color so they stay visible in both light and dark mode. Unknown tools get a monogram.
export default function Brand({ slug, name = '', color, size = 34, plain, title }) {
  const guess = String(name)
    .replace(/\s*\(.*?\)\s*/g, '')
    .toLowerCase()
    .replace(/\./g, 'dot')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');
  const ic = (slug && ICONS[slug]) || ICONS[guess];
  const inner = size * 0.56;
  if (ic) {
    const luminance = lum(ic[0]);
    const fill = luminance < 0.16 || luminance > 0.9 ? 'var(--ink)' : `#${ic[0]}`;
    const svg = (
      <svg viewBox="0 0 24 24" width={inner} height={inner} aria-hidden="true">
        <path d={ic[1]} fill={fill} />
      </svg>
    );
    if (plain)
      return (
        <span className="brand-plain" title={title || name} style={{ width: size, height: size }}>
          {svg}
        </span>
      );
    return (
      <span
        className="brand-med"
        title={title || name}
        style={{ width: size, height: size, '--bc': fill }}
      >
        {svg}
      </span>
    );
  }
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const letters =
    name
      .replace(/[^A-Za-z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2) || '?';
  return (
    <span
      className={`brand-med mono-g ${plain ? 'plain' : ''}`}
      title={title || name}
      style={{
        width: size,
        height: size,
        '--bc': color || `hsl(${hue} 42% 52%)`,
        fontSize: size * 0.36,
      }}
    >
      {letters}
    </span>
  );
}
