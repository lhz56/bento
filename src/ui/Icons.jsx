// One small set of drawn icons (1.6px strokes, rounded) so the sidebar and buttons read as one family.
const P = {
  learn: <><path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" /><path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" /></>,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z" /></>,
  practice: <><path d="M9 4.5h4.2v2.1a1.7 1.7 0 103.4 0V4.5h2.9v4.3h-2.1a1.7 1.7 0 100 3.4h2.1v7.3H4.5v-7.3h2.1a1.7 1.7 0 100-3.4H4.5V4.5z" /></>,
  path: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h6.5a3.5 3.5 0 000-7h-5a3.5 3.5 0 010-7H16" /></>,
  you: <><circle cx="7" cy="8" r="1.6" /><circle cx="17" cy="6.5" r="1.6" /><circle cx="12.5" cy="13" r="1.6" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="18" cy="17" r="1.6" /><path d="M8.3 9l3.1 2.9M13.8 12l2.6-4.2M11.3 14.1l-3.6 2.4M13.9 13.8l2.8 2.4" /></>,
  search: <><circle cx="11" cy="11" r="6.2" /><path d="M15.6 15.6L20 20" /></>,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  down: <path d="M7 10l5 5 5-5" />,
  up: <path d="M7 14.5l5-5 5 5" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4L6 18M18 18l-1.6-1.6M7.6 7.6L6 6" /></>,
  folder: <path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17" /></>,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" /></>,
};

export default function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name] || null}
    </svg>
  );
}
