import { useState } from 'react';
import { t, tx } from '../i18n.js';
import { IDEAS, THEMES } from '../ideas.js';
import Brand from './Brand.jsx';
import { hexPath } from './Onboarding.jsx';

export default function Ideas({
  onRead,
  readIds = {},
  races = [],
  onRace,
  instant = {},
  extra = [],
}) {
  const [theme, setTheme] = useState('all');
  const list = [...IDEAS, ...extra].filter((i) => theme === 'all' || i.theme === theme);
  // today's pick: something you haven't read yet, changing each day
  const unread = list.filter((i) => !readIds[i.id]);
  const day = Math.floor(Date.now() / 864e5);
  const featured = (unread.length ? unread : list)[
    day % Math.max(1, (unread.length ? unread : list).length)
  ];
  const rest = list.filter((i) => i !== featured);
  return (
    <div className="ideas">
      <div className="ideas-inner">
        <div className="hello">{t('Clever ideas')}</div>
        <h1 className="home-h">{tx('The tricks behind *famous* software.')}</h1>
        <p className="ex-sub long">
          {t(
            `${IDEAS.length} real problems from Uber, Google, Amazon, Discord and more, each a short blog post with code you can run: the obvious way next to the clever way.`,
          )}
        </p>
        <p className="ex-sub short">
          {t(`${IDEAS.length} real tricks from Uber, Google, Discord and more, with code you run.`)}
        </p>
        <div className="shelves">
          {THEMES.map(([k, l]) => (
            <button
              key={k}
              className={`shelf ${theme === k ? 'on' : ''}`}
              onClick={() => setTheme(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {featured && (
          <button className="idea-hero" onClick={() => onRead(featured)}>
            <div className="ih-art">
              <IdeaArt kind={featured.art} big />
            </div>
            <div className="ih-text">
              <div className="ic-co">
                <Brand slug={featured.slug} name={featured.company} size={22} plain />
                {featured.company}
                {!readIds[featured.id] && <span className="ih-pick">today’s pick</span>}
              </div>
              <h2>{featured.title}</h2>
              <p>{featured.hook}</p>
              <div className="ic-meta">
                <span>{featured.mins} min</span>
                {featured.concepts.map((c) => (
                  <span key={c} className="ic-c">
                    {c}
                  </span>
                ))}
                {readIds[featured.id] && <span className="ic-read">✓ read</span>}
              </div>
              <span className="ih-go">Read & run it →</span>
            </div>
          </button>
        )}

        {theme === 'all' && races.length > 0 && (
          <div className="races">
            <div className="races-h">
              <span className="mini-h">algorithm races</span>
              <span className="muted small">
                Same problem, different algorithms, raced live on bigger and bigger inputs. Opens
                instantly.
              </span>
            </div>
            <div className="race-row">
              {races.map((r, i) => (
                <button key={r.id} className="race-card" onClick={() => onRace(r)}>
                  <svg viewBox="0 0 120 54" className="race-art" aria-hidden="true">
                    {(r.growth.calls || []).map((c, k) => {
                      const f = [
                        (x) => x * x * 0.9,
                        (x) => x * 1.6 + 2,
                        (x) => Math.log2(x + 1) * 6,
                      ][k % 3];
                      const pts = Array.from(
                        { length: 12 },
                        (_, j) =>
                          `${8 + j * 9.5},${50 - Math.min(44, f(j * 0.6 + (i % 2)) * (k === 0 ? 1.2 : 1))}`,
                      ).join(' ');
                      return (
                        <polyline
                          key={k}
                          points={pts}
                          fill="none"
                          stroke={['#ff8a5b', '#4cc9a0', '#a78bfa'][k]}
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>
                  <b>{r.title.split(':')[0]}</b>
                  <span>{r.title.split(':')[1]?.trim()}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="idea-grid">
          {rest.map((i, n) => (
            <button
              key={i.id}
              className="idea-card"
              onClick={() => onRead(i)}
              style={{ animationDelay: `${n * 40}ms` }}
            >
              <div className="ic-art">
                <IdeaArt kind={i.art} />
              </div>
              <div className="ic-co">
                <Brand slug={i.slug} name={i.company} size={18} plain />
                {i.company}
                {readIds[i.id] && <span className="ic-read">✓</span>}
              </div>
              <div className="ic-t">{i.title}</div>
              <div className="ic-h">{i.hook}</div>
              <div className="ic-meta">
                <span>{i.mins} min</span>
                <span className={`lang-dot ${i.lang}`} />
                {i.lang === 'python' ? 'Python' : 'JavaScript'}
                {instant[i.id] && !readIds[i.id] && (
                  <span
                    className="ic-instant"
                    title="Ships with Bento: opens instantly, no AI needed to read it"
                  >
                    opens instantly
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const O = '#ff8a5b',
  V = '#a78bfa',
  M = '#4cc9a0',
  S = '#5aa9ff',
  Y = '#f5b82e';
export function IdeaArt({ kind, big }) {
  const vb = '0 0 200 110';
  const wrap = (children) => (
    <svg
      viewBox={vb}
      className={`idea-art ${big ? 'big' : ''}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  switch (kind) {
    case 'hex': {
      const cells = [];
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 10; c++) {
          const x = 22 + c * 17.3 + (r % 2) * 8.65,
            y = 14 + r * 15;
          const d = Math.hypot(x - 100, y - 52);
          cells.push(
            <path
              key={`${r}-${c}`}
              d={hexPath(x, y, 9.6)}
              fill={d < 6 ? O : d < 22 ? '#ffc4ab' : d < 38 ? '#ffe6db' : 'none'}
              stroke="var(--line-2)"
              strokeWidth=".8"
            />,
          );
        }
      return wrap(
        <>
          {cells}
          {[
            [70, 30],
            [128, 70],
            [90, 82],
            [140, 28],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill={S} />
          ))}
        </>,
      );
    }
    case 'bits':
      return wrap(
        <>
          {Array.from({ length: 32 }, (_, i) => (
            <rect
              key={i}
              x={12 + (i % 16) * 11.2}
              y={i < 16 ? 38 : 52}
              width="9"
              height="11"
              rx="2"
              fill={[2, 5, 9, 13, 17, 22, 27, 30].includes(i) ? V : 'var(--bg-3)'}
            />
          ))}
          {[
            [40, 2],
            [70, 9],
            [110, 22],
          ].map(([x, b], i) => (
            <path
              key={i}
              d={`M${x} 12 Q ${x} 26 ${12 + (b % 16) * 11.2 + 4.5} ${b < 16 ? 38 : 52}`}
              stroke={O}
              fill="none"
              strokeWidth="1.2"
            />
          ))}
          <text
            x="100"
            y="88"
            textAnchor="middle"
            fontSize="10"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
          >
            “definitely not” · “maybe”
          </text>
        </>,
      );
    case 'ring':
      return wrap(
        <>
          <circle cx="100" cy="55" r="38" fill="none" stroke="var(--line-2)" strokeWidth="5" />
          {[0, 1, 2, 3, 4].map((k) => {
            const a = k * 1.3 + 0.3;
            return (
              <circle
                key={k}
                cx={100 + 38 * Math.cos(a)}
                cy={55 + 38 * Math.sin(a)}
                r="7"
                fill={[O, V, M, S, Y][k]}
              />
            );
          })}
          {Array.from({ length: 14 }, (_, k) => {
            const a = k * 0.45;
            return (
              <circle
                key={k}
                cx={100 + 38 * Math.cos(a)}
                cy={55 + 38 * Math.sin(a)}
                r="1.8"
                fill="var(--ink-3)"
              />
            );
          })}
        </>,
      );
    case 'graph': {
      const n = [
        [40, 30, 6],
        [90, 22, 9],
        [150, 35, 5],
        [60, 80, 5],
        [110, 70, 15],
        [165, 85, 7],
        [30, 60, 4],
      ];
      const e = [
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [6, 0],
        [5, 2],
        [4, 5],
        [1, 2],
        [3, 6],
      ];
      return wrap(
        <>
          {e.map(([a, b], i) => (
            <line
              key={i}
              x1={n[a][0]}
              y1={n[a][1]}
              x2={n[b][0]}
              y2={n[b][1]}
              stroke="var(--line-2)"
              strokeWidth="1.4"
            />
          ))}
          {n.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={i === 4 ? O : V} />
          ))}
        </>,
      );
    }
    case 'idbits':
      return wrap(
        <>
          {
            [
              [1, 'var(--bg-3)'],
              [41, S],
              [10, O],
              [12, M],
            ].reduce(
              (acc, [w, c], i) => {
                const x = acc.x;
                acc.el.push(
                  <rect key={i} x={x} y="40" width={w * 2.6} height="20" rx="3" fill={c} />,
                );
                acc.x += w * 2.6 + 2;
                return acc;
              },
              { x: 16, el: [] },
            ).el
          }
          <text
            x="70"
            y="78"
            fontSize="9"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
            textAnchor="middle"
          >
            time
          </text>
          <text
            x="136"
            y="78"
            fontSize="9"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
            textAnchor="middle"
          >
            machine
          </text>
          <text
            x="168"
            y="78"
            fontSize="9"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
            textAnchor="middle"
          >
            seq
          </text>
        </>,
      );
    case 'bucket':
      return wrap(
        <>
          <path
            d="M70 30 L80 92 H120 L130 30"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {Array.from({ length: 7 }, (_, i) => (
            <circle
              key={i}
              cx={88 + (i % 3) * 12}
              cy={84 - Math.floor(i / 3) * 11}
              r="5"
              fill={Y}
            />
          ))}
          <circle cx="100" cy="14" r="5" fill={Y} opacity=".6" />
          <path d="M140 60 H180" stroke={M} strokeWidth="2" markerEnd="" />
          <path d="M20 60 H60" stroke={O} strokeWidth="2" strokeDasharray="3 3" />
        </>,
      );
    case 'zeros':
      return wrap(
        <>
          {['0001', '01', '00001', '1', '001', '0000001'].map((b, i) => (
            <g key={i}>
              {[...b].map((c, j) => (
                <rect
                  key={j}
                  x={20 + j * 13}
                  y={10 + i * 15}
                  width="11"
                  height="11"
                  rx="2"
                  fill={c === '0' ? (b.length > 5 ? O : 'var(--bg-3)') : M}
                />
              ))}
            </g>
          ))}
          <text x="150" y="58" fontSize="22" fill={O} fontFamily="ui-serif" textAnchor="middle">
            ≈ n
          </text>
        </>,
      );
    case 'tree':
      return wrap(
        <>
          {[
            [100, 18],
            [60, 52],
            [140, 52],
            [40, 88],
            [80, 88],
            [120, 88],
            [160, 88],
          ].map(([x, y], i) => (
            <g key={i}>
              {i > 0 && (
                <line
                  x1={x}
                  y1={y}
                  x2={[100, 60, 140][Math.floor((i - 1) / 2)]}
                  y2={[18, 52, 52][Math.floor((i - 1) / 2)]}
                  stroke="var(--line-2)"
                  strokeWidth="1.4"
                />
              )}
              <rect
                x={x - 14}
                y={y - 8}
                width="28"
                height="16"
                rx="4"
                fill={[0, 2, 5].includes(i) ? O : 'var(--bg-3)'}
              />
            </g>
          ))}
        </>,
      );
    case 'path': {
      const w = [
        [3, 1],
        [3, 2],
        [3, 3],
        [7, 3],
        [7, 4],
        [7, 5],
        [11, 1],
        [11, 2],
      ];
      return wrap(
        <>
          {Array.from({ length: 70 }, (_, i) => {
            const c = i % 14,
              r = Math.floor(i / 14);
            const isW = w.some(([a, b]) => a === c && b === r);
            const vis = Math.abs(c - 6) + Math.abs(r - 2) < 6;
            return (
              <rect
                key={i}
                x={16 + c * 12.4}
                y={14 + r * 17}
                width="10.4"
                height="15"
                rx="2"
                fill={isW ? 'var(--ink-3)' : vis ? '#efe6ff' : 'var(--bg-3)'}
              />
            );
          })}
          <path
            d="M22 56 H70 V38 H118 V73 H178"
            stroke={V}
            strokeWidth="3"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>,
      );
    }
    case 'cursors':
      return wrap(
        <>
          <rect
            x="66"
            y="34"
            width="68"
            height="42"
            rx="6"
            fill="#ffe3d6"
            stroke={O}
            strokeWidth="1.5"
          />
          {[
            [56, 26, V, 'Ana'],
            [138, 80, M, 'Ben'],
          ].map(([x, y, c, n], i) => (
            <g key={i}>
              <path d={`M${x} ${y} l9 22 l3 -9 l9 -3 Z`} fill={c} />
              <rect x={x + 10} y={y + 20} width="26" height="12" rx="6" fill={c} />
              <text
                x={x + 23}
                y={y + 29}
                fontSize="7.5"
                fill="#fff"
                textAnchor="middle"
                fontFamily="ui-rounded"
              >
                {n}
              </text>
            </g>
          ))}
        </>,
      );
    case 'matrix':
      return wrap(
        <>
          {Array.from({ length: 6 * 9 }, (_, i) => {
            const r = Math.floor(i / 9),
              c = i % 9;
            const v = (r * 7 + c * 3) % 6;
            return (
              <rect
                key={i}
                x={30 + c * 16}
                y={10 + r * 15}
                width="13"
                height="12"
                rx="3"
                fill={v === 0 ? 'var(--bg-3)' : `color-mix(in srgb, ${O} ${v * 18}%, var(--panel))`}
              />
            );
          })}
          <rect
            x="27"
            y="52"
            width="147"
            height="17"
            rx="4"
            fill="none"
            stroke={V}
            strokeWidth="1.5"
          />
        </>,
      );
    case 'keys':
      return wrap(
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={24 + i * 54}
                y="40"
                width="44"
                height="28"
                rx="6"
                fill="var(--panel)"
                stroke="var(--line-2)"
              />
              <text
                x={46 + i * 54}
                y="58"
                fontSize="10"
                textAnchor="middle"
                fill="var(--ink-2)"
                fontFamily="ui-monospace"
              >
                $20
              </text>
            </g>
          ))}
          <path d="M68 54 h10 M122 54 h10" stroke={O} strokeDasharray="2 2" />
          <text x="100" y="92" fontSize="9.5" textAnchor="middle" fill={M} fontFamily="ui-rounded">
            key 7f3a → charged once ✓
          </text>
        </>,
      );
    case 'diff':
      return wrap(
        <>
          {['', '+', '', '-', '', '~', ''].map((m, i) => (
            <g key={i}>
              <rect
                x="30"
                y={8 + i * 13.5}
                width="140"
                height="11"
                rx="2"
                fill={
                  m === '+'
                    ? '#d9f5ea'
                    : m === '-'
                      ? '#fde0df'
                      : m === '~'
                        ? '#fff1cc'
                        : 'var(--bg-2)'
                }
              />
              <text
                x="36"
                y={17 + i * 13.5}
                fontSize="9"
                fill={m === '+' ? M : m === '-' ? '#e5484d' : 'var(--ink-3)'}
                fontFamily="ui-monospace"
              >
                {m || ' '}
              </text>
              <rect
                x="48"
                y={11.5 + i * 13.5}
                width={40 + ((i * 29) % 70)}
                height="4"
                rx="2"
                fill="var(--line-2)"
              />
            </g>
          ))}
        </>,
      );
    case 'wave':
      return wrap(
        <>
          <path
            d={Array.from(
              { length: 90 },
              (_, i) =>
                `${i ? 'L' : 'M'}${10 + i * 2},${55 + Math.sin(i * 0.5) * 12 * Math.sin(i * 0.11) + Math.sin(i * 1.7) * 5}`,
            ).join(' ')}
            stroke="var(--line-2)"
            fill="none"
            strokeWidth="1.4"
          />
          {[
            [34, 30],
            [62, 74],
            [88, 26],
            [120, 70],
            [150, 34],
            [170, 64],
          ].map(([x, y], i, a) => (
            <g key={i}>
              {i < a.length - 1 && i % 2 === 0 && (
                <line
                  x1={x}
                  y1={y}
                  x2={a[i + 1][0]}
                  y2={a[i + 1][1]}
                  stroke={O}
                  strokeWidth="1.3"
                  strokeDasharray="3 2"
                />
              )}
              <circle cx={x} cy={y} r="4" fill={O} />
            </g>
          ))}
        </>,
      );
    case 'shuffle': {
      const cs = [O, V, M, S];
      const r = [0, 0, 0, 1, 2, 2, 3, 1, 1, 0];
      const g = [0, 1, 2, 0, 3, 1, 0, 2, 1, 0];
      return wrap(
        <>
          {r.map((c, i) => (
            <rect
              key={`a${i}`}
              x={14 + i * 17.5}
              y="26"
              width="14"
              height="14"
              rx="4"
              fill={cs[c]}
            />
          ))}
          {g.map((c, i) => (
            <rect
              key={`b${i}`}
              x={14 + i * 17.5}
              y="66"
              width="14"
              height="14"
              rx="4"
              fill={cs[c]}
            />
          ))}
          <text x="14" y="20" fontSize="8.5" fill="var(--ink-4)" fontFamily="ui-rounded">
            truly random
          </text>
          <text x="14" y="60" fontSize="8.5" fill="var(--ink-4)" fontFamily="ui-rounded">
            spread out
          </text>
        </>,
      );
    }
    case 'mr':
      return wrap(
        <>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="18" y={10 + i * 23} width="40" height="16" rx="4" fill="var(--bg-3)" />
              <path
                d={`M60 ${18 + i * 23} C 85 ${18 + i * 23}, 85 ${[38, 72][i % 2]}, 110 ${[38, 72][i % 2]}`}
                stroke={V}
                fill="none"
                strokeWidth="1.3"
              />
            </g>
          ))}
          {[38, 72].map((y, i) => (
            <rect key={i} x="110" y={y - 10} width="36" height="20" rx="5" fill={[O, M][i]} />
          ))}
          <path d="M148 38 L170 55 M148 72 L170 55" stroke="var(--ink-3)" strokeWidth="1.3" />
          <circle cx="176" cy="55" r="7" fill={Y} />
        </>,
      );
    case 'lru':
      return wrap(
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <rect
              key={i}
              x={30 + i * 24}
              y="44"
              width="20"
              height="24"
              rx="5"
              fill={i === 0 ? '#fde0df' : `color-mix(in srgb, ${S} ${25 + i * 12}%, var(--panel))`}
              stroke={i === 0 ? '#e5484d' : 'none'}
              strokeDasharray="3 2"
            />
          ))}
          <path d="M40 40 C 40 20, 20 20, 14 30" stroke="#e5484d" fill="none" strokeWidth="1.3" />
          <text
            x="100"
            y="88"
            fontSize="9"
            fill="var(--ink-3)"
            textAnchor="middle"
            fontFamily="ui-rounded"
          >
            oldest ← · → newest
          </text>
          <path d="M178 56 h12" stroke={M} strokeWidth="2" />
        </>,
      );
    case 'lock':
      return wrap(
        <>
          <circle cx="44" cy="52" r="16" fill={O} opacity=".9" />
          <circle cx="156" cy="52" r="16" fill={V} opacity=".9" />
          <text x="44" y="56" fontSize="10" fill="#fff" textAnchor="middle" fontFamily="ui-rounded">
            A
          </text>
          <text
            x="156"
            y="56"
            fontSize="10"
            fill="#fff"
            textAnchor="middle"
            fontFamily="ui-rounded"
          >
            B
          </text>
          <path
            d="M62 46 H138 M138 58 H62"
            stroke="var(--line-2)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <rect x="88" y="70" width="24" height="20" rx="4" fill={M} />
          <path d="M93 70 v-6 a7 7 0 0 1 14 0 v6" stroke={M} strokeWidth="2.4" fill="none" />
        </>,
      );
    case 'monkey':
      return wrap(
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect
                x={44 + i * 40}
                y="34"
                width="30"
                height="40"
                rx="5"
                fill={i === 1 ? '#fde0df' : 'var(--bg-3)'}
                stroke={i === 1 ? '#e5484d' : 'none'}
                strokeDasharray="3 2"
              />
              {[0, 1, 2].map((j) => (
                <rect
                  key={j}
                  x={49 + i * 40}
                  y={40 + j * 11}
                  width="20"
                  height="5"
                  rx="2"
                  fill={i === 1 ? '#f4a5a6' : M}
                  opacity=".8"
                />
              ))}
            </g>
          ))}
          <text x="98" y="26" fontSize="18" textAnchor="middle">
            🐒
          </text>
          <path d="M20 54 H40 M164 54 H184" stroke={V} strokeWidth="2" />
          <text
            x="100"
            y="92"
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
          >
            2 of 3 still answering
          </text>
        </>,
      );
    case 'chain':
      return wrap(
        <>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect
                x={14 + i * 46}
                y="36"
                width="36"
                height="34"
                rx="6"
                fill={i === 2 ? '#fde0df' : 'var(--panel)'}
                stroke={i >= 2 ? '#e5484d' : 'var(--line-2)'}
              />
              <text
                x={32 + i * 46}
                y="51"
                fontSize="8"
                textAnchor="middle"
                fill="var(--ink-3)"
                fontFamily="ui-monospace"
              >
                000{(i * 7) % 9}
              </text>
              <text
                x={32 + i * 46}
                y="62"
                fontSize="7"
                textAnchor="middle"
                fill="var(--ink-4)"
                fontFamily="ui-monospace"
              >
                #{i}
              </text>
              {i < 3 && (
                <path
                  d={`M${50 + i * 46} 53 h10`}
                  stroke={i >= 1 ? '#e5484d' : Y}
                  strokeWidth="2"
                  strokeDasharray={i >= 1 ? '3 2' : ''}
                />
              )}
            </g>
          ))}
          <text
            x="100"
            y="92"
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
          >
            change one block → every later link breaks
          </text>
        </>,
      );
    case 'hedge':
      return wrap(
        <>
          {Array.from({ length: 24 }, (_, i) => {
            const slow = i === 9 || i === 17;
            return (
              <rect
                key={i}
                x={14 + i * 7.4}
                y={slow ? 18 : 62}
                width="5"
                height={slow ? 64 : 20}
                rx="2"
                fill={slow ? '#e5484d' : M}
                opacity={slow ? 0.85 : 0.7}
              />
            );
          })}
          <path d="M20 50 H186" stroke={V} strokeDasharray="4 3" />
          <text x="186" y="46" fontSize="8" textAnchor="end" fill={V} fontFamily="ui-rounded">
            ask a backup here
          </text>
        </>,
      );
    case 'lsm':
      return wrap(
        <>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={20 + i * 9}
              y={20 + (i % 3) * 7}
              width="7"
              height="7"
              rx="2"
              fill={Y}
            />
          ))}
          <path d="M80 34 H96" stroke="var(--ink-3)" strokeWidth="1.5" />
          <rect x="100" y="22" width="34" height="10" rx="3" fill={S} />
          <rect x="100" y="36" width="34" height="10" rx="3" fill={S} />
          <path d="M138 34 H150" stroke="var(--ink-3)" strokeWidth="1.5" />
          <rect x="154" y="22" width="30" height="24" rx="4" fill={V} />
          <text
            x="100"
            y="80"
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
          >
            pile → sorted runs → merged
          </text>
        </>,
      );
    case 'fanout':
      return wrap(
        <>
          <circle cx="36" cy="55" r="12" fill={O} />
          {Array.from({ length: 7 }, (_, i) => {
            const y = 16 + i * 13;
            return (
              <g key={i}>
                <path
                  d={`M48 55 C 90 55, 110 ${y}, 150 ${y}`}
                  stroke="var(--line-2)"
                  fill="none"
                  strokeWidth="1.2"
                />
                <rect x="152" y={y - 4} width="26" height="8" rx="3" fill={M} opacity=".8" />
              </g>
            );
          })}
        </>,
      );
    case 'blocks':
      return wrap(
        <>
          {Array.from({ length: 24 }, (_, i) => (
            <rect
              key={i}
              x={16 + (i % 12) * 14.4}
              y={i < 12 ? 30 : 46}
              width="12"
              height="12"
              rx="2.5"
              fill={i === 7 || i === 16 ? O : 'var(--bg-3)'}
            />
          ))}
          <path d="M100 66 V84" stroke={O} strokeWidth="2" strokeDasharray="3 3" />
          <path d="M94 80 L100 88 L106 80" fill="none" stroke={O} strokeWidth="2" />
          <rect
            x="70"
            y="90"
            width="60"
            height="12"
            rx="6"
            fill="var(--panel)"
            stroke="var(--line-2)"
          />
          <text x="100" y="99" fontSize="8" textAnchor="middle" fill="var(--ink-3)">
            2 blocks sent
          </text>
        </>,
      );
    case 'vclock':
      return wrap(
        <>
          {[
            ['A', 40, S, '[2,1]'],
            ['B', 160, V, '[1,2]'],
          ].map(([n, x, c, v]) => (
            <g key={n}>
              <circle cx={x} cy="40" r="14" fill={c} />
              <text x={x} y="44" fontSize="11" textAnchor="middle" fill="#fff" fontWeight="700">
                {n}
              </text>
              <text
                x={x}
                y="70"
                fontSize="10"
                textAnchor="middle"
                fill="var(--ink-3)"
                fontFamily="monospace"
              >
                {v}
              </text>
            </g>
          ))}
          <path d="M56 40 H144" stroke="var(--line-2)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M58 76 Q100 104 142 76" fill="none" stroke={M} strokeWidth="2" />
          <text x="100" y="96" fontSize="9" textAnchor="middle" fill={M} fontWeight="700">
            merge
          </text>
        </>,
      );
    case 'log':
      return wrap(
        <>
          {Array.from({ length: 11 }, (_, i) => (
            <rect
              key={i}
              x={14 + i * 15.5}
              y="44"
              width="13"
              height="20"
              rx="3"
              fill={i === 10 ? O : 'var(--bg-3)'}
            />
          ))}
          {[
            [36, S, 'email'],
            [98, V, 'stats'],
            [20, M, 'new'],
          ].map(([x, c, t], i) => (
            <g key={i}>
              <path
                d={`M${x + 6} ${i === 1 ? 30 : i === 2 ? 86 : 30} V${i === 2 ? 68 : 40}`}
                stroke={c}
                strokeWidth="2"
              />
              <circle cx={x + 6} cy={i === 2 ? 88 : 26} r="4" fill={c} />
              <text x={x + 14} y={i === 2 ? 92 : 29} fontSize="8.5" fill="var(--ink-3)">
                {t}
              </text>
            </g>
          ))}
          <text x="178" y="58" fontSize="12" fill={O}>
            +
          </text>
        </>,
      );
    case 'clock':
      return wrap(
        <>
          {[
            [50, -18],
            [100, 6],
            [150, -6],
          ].map(([x, a], i) => (
            <g key={i}>
              <circle
                cx={x}
                cy="44"
                r="20"
                fill="var(--panel)"
                stroke="var(--line-2)"
                strokeWidth="2"
              />
              <path
                d={`M${x} 44 L${x + 13 * Math.sin((a * Math.PI) / 180 + 1.1)} ${44 - 13 * Math.cos((a * Math.PI) / 180 + 1.1)}`}
                stroke={[S, V, M][i]}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={x} cy="44" r="2.5" fill="var(--ink-2)" />
            </g>
          ))}
          <rect x="40" y="80" width="120" height="10" rx="5" fill="var(--bg-3)" />
          <rect x="84" y="80" width="34" height="10" rx="5" fill={O} opacity=".75" />
          <text x="100" y="104" fontSize="8.5" textAnchor="middle" fill="var(--ink-3)">
            wait out the uncertainty
          </text>
        </>,
      );
    case 'herd':
      return wrap(
        <>
          {Array.from({ length: 18 }, (_, i) => (
            <circle
              key={i}
              cx={22 + (i % 6) * 13}
              cy={30 + Math.floor(i / 6) * 22}
              r="5"
              fill={i === 7 ? O : S}
              opacity={i === 7 ? 1 : 0.55}
            />
          ))}
          <path d="M100 52 H128" stroke={O} strokeWidth="2.4" />
          <path d="M123 46 L130 52 L123 58" fill="none" stroke={O} strokeWidth="2.4" />
          <rect
            x="136"
            y="34"
            width="44"
            height="36"
            rx="7"
            fill="var(--panel)"
            stroke="var(--line-2)"
            strokeWidth="2"
          />
          <path d="M146 46 h24 M146 54 h24 M146 62 h16" stroke="var(--ink-3)" strokeWidth="2" />
          <text x="44" y="102" fontSize="9" fill="var(--ink-3)">
            one asks, the rest wait
          </text>
        </>,
      );
    case 'jitter':
      return wrap(
        <>
          <path d="M12 92 H188" stroke="var(--line-2)" />
          {[18, 18, 18, 18, 60, 60, 60, 60, 132, 132, 132].map((x, i) => (
            <rect
              key={i}
              x={x + (i % 4) * 2}
              y={30 + (i % 4) * 9}
              width="7"
              height="7"
              rx="2"
              fill={O}
              opacity=".8"
            />
          ))}
          {Array.from({ length: 11 }, (_, i) => (
            <rect
              key={`j${i}`}
              x={16 + i * 15.5}
              y={70 - ((i * 37) % 17)}
              width="7"
              height="7"
              rx="2"
              fill={M}
            />
          ))}
          <text x="16" y="104" fontSize="8.5" fill="var(--ink-3)">
            in step
          </text>
          <text x="150" y="104" fontSize="8.5" fill={M}>
            spread out
          </text>
        </>,
      );
    case 'raft':
      return wrap(
        <>
          {[0, 1, 2, 3, 4].map((k) => {
            const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
            const x = 100 + 38 * Math.cos(a),
              y = 56 + 38 * Math.sin(a);
            return (
              <g key={k}>
                {k !== 0 && (
                  <line
                    x1={100}
                    y1={18}
                    x2={x}
                    y2={y}
                    stroke="var(--line-2)"
                    strokeDasharray="3 3"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={k === 0 ? 11 : 8}
                  fill={k === 0 ? Y : 'var(--panel)'}
                  stroke={k === 0 ? Y : S}
                  strokeWidth="2.2"
                />
                {k === 0 && (
                  <text x={x} y={y + 4} fontSize="10" textAnchor="middle">
                    ★
                  </text>
                )}
              </g>
            );
          })}
        </>,
      );
    case 'noise':
      return wrap(
        <>
          {Array.from({ length: 40 }, (_, i) => {
            const yes = (i * 7) % 10 < 4;
            return (
              <rect
                key={i}
                x={14 + (i % 20) * 8.6}
                y={i < 20 ? 26 : 38}
                width="6.5"
                height="9"
                rx="1.5"
                fill={yes ? O : 'var(--bg-3)'}
              />
            );
          })}
          <path d="M100 54 V66" stroke="var(--ink-3)" strokeWidth="1.6" />
          <rect x="40" y="72" width="120" height="12" rx="6" fill="var(--bg-3)" />
          <rect x="40" y="72" width="36" height="12" rx="6" fill={M} />
          <text x="100" y="102" fontSize="8.5" textAnchor="middle" fill="var(--ink-3)">
            noisy answers, true total
          </text>
        </>,
      );
    case 'ot':
      return wrap(
        <>
          <text
            x="100"
            y="34"
            fontSize="16"
            textAnchor="middle"
            fill="var(--ink)"
            fontFamily="ui-monospace"
          >
            the <tspan fill={O}>big</tspan> cat sat
          </text>
          <path d="M56 44 L56 60" stroke={V} strokeWidth="2" />
          <path d="M100 44 L100 60" stroke={M} strokeWidth="2" />
          <text x="56" y="74" fontSize="9" textAnchor="middle" fill={V} fontFamily="ui-rounded">
            Ana
          </text>
          <text x="100" y="74" fontSize="9" textAnchor="middle" fill={M} fontFamily="ui-rounded">
            Ben
          </text>
          <text
            x="100"
            y="96"
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-3)"
            fontFamily="ui-rounded"
          >
            same text on both screens
          </text>
        </>,
      );
    default:
      return wrap(null);
  }
}
