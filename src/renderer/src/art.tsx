/* The big line drawing behind each game's name. Everything is drawn in currentColor (the game's accent),
   with enemies in --e, so it takes on whichever game is selected. */
import type { JSX } from 'react'

const GLOW = (
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.4" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    {/* a slight pen wobble for the hand-drawn game */}
    <filter id="sketch" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
      <feDisplacementMap in="SourceGraphic" scale="3.2" />
      <feGaussianBlur stdDeviation="1.6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
)

/* Hullbreak: a block-built warship seen from above, its radar sweeping, a hostile locked on */
const HULL = [
  '.......BBBB.........',
  '....BBBBTBBBBBB.....',
  '..EBBBBBBBBBBBBBB...',
  'EEBBBRBBBBBTBBBBBBB.',
  'EEBBBBBBCBBBBBBBBBBB',
  'EEBBBRBBBBBTBBBBBBB.',
  '..EBBBBBBBBBBBBBB...',
  '....BBBBTBBBBBB.....',
  '.......BBBB.........'
]
const S = 18

function Hullbreak(): JSX.Element {
  const w = HULL[0].length * S
  const h = HULL.length * S
  const ox = 340
  const oy = 150 - h / 2
  const cx = ox + w / 2
  const cy = oy + h / 2
  const parts: JSX.Element[] = []
  HULL.forEach((row, r) =>
    [...row].forEach((c, k) => {
      if (c === '.') return
      const x = ox + k * S
      const y = oy + r * S
      const key = `${r}-${k}`
      parts.push(<rect key={key} x={x + 1.5} y={y + 1.5} width={S - 3} height={S - 3} opacity={c === 'B' ? 0.55 : 1} />)
      if (c === 'T')
        parts.push(
          <g key={key + 't'}>
            <circle cx={x + S / 2} cy={y + S / 2} r={5} />
            <line x1={x + S / 2 + 5} y1={y + S / 2} x2={x + S / 2 + 20} y2={y + S / 2} />
          </g>
        )
      if (c === 'R')
        parts.push(
          <g key={key + 'r'}>
            <line x1={x + 5} y1={y + 5} x2={x + S - 5} y2={y + S - 5} />
            <line x1={x + S - 5} y1={y + 5} x2={x + 5} y2={y + S - 5} />
          </g>
        )
      if (c === 'C') parts.push(<circle key={key + 'c'} cx={x + S / 2} cy={y + S / 2} r={4} fill="currentColor" />)
      if (c === 'E' && (k === 0 || row[k - 1] === '.'))
        parts.push(
          <g key={key + 'e'} className="flame">
            <line x1={x - 4} y1={y + 6} x2={x - 24} y2={y + 6} />
            <line x1={x - 4} y1={y + S - 6} x2={x - 16} y2={y + S - 6} />
          </g>
        )
    })
  )
  const ex = 770
  const ey = 92
  return (
    <svg viewBox="0 0 860 380" preserveAspectRatio="xMidYMid slice" className="art" aria-hidden>
      {GLOW}
      <defs>
        <radialGradient id="sweep" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${cx} ${cy}) scale(330)`}>
          <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth={1}>
        {[90, 170, 250, 330].map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} opacity={0.14} strokeDasharray={r > 200 ? '2 6' : undefined} />
        ))}
        <line x1={cx - 340} y1={cy} x2={cx + 340} y2={cy} opacity={0.08} />
        <line x1={cx} y1={cy - 340} x2={cx} y2={cy + 340} opacity={0.08} />
      </g>
      <g className="sweep" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M${cx},${cy} L${cx + 330},${cy} A330,330 0 0,0 ${cx + 330 * Math.cos(-0.5)},${cy + 330 * Math.sin(-0.5)} Z`} fill="url(#sweep)" />
        <line x1={cx} y1={cy} x2={cx + 330} y2={cy} stroke="currentColor" strokeWidth={1.2} opacity={0.5} />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={1.6} filter="url(#glow)">
        {parts}
      </g>
      {/* the hostile, locked */}
      <g fill="none" stroke="var(--e)" strokeWidth={1.6} filter="url(#glow)">
        <rect x={ex - 11} y={ey - 22} width={18} height={18} />
        <rect x={ex - 11} y={ey - 2} width={18} height={18} />
        <rect x={ex + 9} y={ey - 12} width={18} height={18} />
        <rect x={ex - 31} y={ey - 12} width={18} height={18} />
        <g className="lock">
          <path d={`M${ex - 48},${ey - 38} h12 M${ex - 48},${ey - 38} v12 M${ex + 46},${ey - 38} h-12 M${ex + 46},${ey - 38} v12 M${ex - 48},${ey + 34} h12 M${ex - 48},${ey + 34} v-12 M${ex + 46},${ey + 34} h-12 M${ex + 46},${ey + 34} v-12`} />
        </g>
      </g>
      <g stroke="currentColor" strokeWidth={1.4} filter="url(#glow)" className="tracer">
        <line x1={ox + 11 * S + 30} y1={oy + 3 * S + 9} x2={ex - 60} y2={ey + 4} strokeDasharray="10 14" />
      </g>
    </svg>
  )
}

/* Enemy Skies: a fighter climbing through drifting cloud, two enemies diving at it */
const PLANE =
  'M0,-70 C7,-67 10,-52 10,-32 L9,38 C8,54 4,62 0,64 C-4,62 -8,54 -9,38 L-10,-32 C-10,-52 -7,-67 0,-70 Z ' +
  'M-10,-20 L-90,-6 C-96,-4 -96,6 -90,8 L-10,14 M10,-20 L90,-6 C96,-4 96,6 90,8 L10,14 ' +
  'M-8,44 L-34,52 C-37,54 -37,60 -34,61 L-6,59 M8,44 L34,52 C37,54 37,60 34,61 L6,59'
const COCKPIT = 'M0,-40 C5,-38 6,-26 5,-16 C3,-12 -3,-12 -5,-16 C-6,-26 -5,-38 0,-40 Z'
const CLOUD = 'M0,0 C2,-16 22,-20 30,-8 C36,-24 66,-22 70,-4 C84,-8 96,6 86,14 L-2,14 C-14,12 -12,0 0,0 Z'

function Plane({ x, y, s, flip, enemy }: { x: number; y: number; s: number; flip?: boolean; enemy?: boolean }): JSX.Element {
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${flip ? 180 : 0})`} stroke={enemy ? 'var(--e)' : 'currentColor'}>
      <path d={PLANE} />
      <path d={COCKPIT} />
      <line x1={-20} y1={-73} x2={20} y2={-73} className={enemy ? undefined : 'prop'} />
      <circle cx={0} cy={-71} r={3} />
      {/* panel lines */}
      <path d="M-50,-12 L-52,10 M50,-12 L52,10 M-4,20 L4,20 M-4,30 L4,30" opacity={0.5} />
    </g>
  )
}

function Skies(): JSX.Element {
  const clouds = [
    [60, 40, 1.4],
    [520, 10, 1.1],
    [700, 200, 1.6],
    [250, 260, 1.2],
    [40, 300, 0.9],
    [430, 150, 0.8]
  ]
  return (
    <svg viewBox="0 0 860 380" preserveAspectRatio="xMidYMid slice" className="art" aria-hidden>
      {GLOW}
      <g fill="none" stroke="currentColor" strokeWidth={1.3} filter="url(#sketch)" opacity={0.42}>
        <g className="drift">
          {clouds.map(([x, y, s], i) => (
            <path key={i} d={CLOUD} transform={`translate(${x} ${y}) scale(${s})`} />
          ))}
          {clouds.map(([x, y, s], i) => (
            <path key={'b' + i} d={CLOUD} transform={`translate(${x} ${y - 380}) scale(${s})`} />
          ))}
        </g>
      </g>
      {/* speed lines */}
      <g stroke="currentColor" strokeWidth={1} opacity={0.3} className="speed">
        {[360, 420, 470, 680, 720, 640].map((x, i) => (
          <line key={x} x1={x} y1={40 + i * 50} x2={x} y2={90 + i * 50} />
        ))}
      </g>
      <g fill="none" strokeWidth={1.8} strokeLinejoin="round" filter="url(#sketch)">
        <Plane x={560} y={250} s={1.05} />
        <Plane x={705} y={92} s={0.55} flip enemy />
        <Plane x={790} y={160} s={0.45} flip enemy />
      </g>
      <g stroke="currentColor" strokeWidth={2} filter="url(#glow)" className="shots">
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line x1={546} y1={150 - i * 40} x2={546} y2={136 - i * 40} />
            <line x1={574} y1={150 - i * 40} x2={574} y2={136 - i * 40} />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function Art({ art }: { art?: string }): JSX.Element {
  if (art && /^https?:\/\//.test(art)) return <img className="art" src={art} alt="" />
  if (art === 'skies') return <Skies />
  return <Hullbreak />
}
