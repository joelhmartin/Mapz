// Decorations in the manner of an old printed chart: the title cartouche and a compass rose.
// Both are inline SVG drawn in the parchment palette; neither touches the map's rendering.

const INK = '#3b2a1a';
const INK_SOFT = '#6b5640';
const PAPER = '#f4ead0';
const ACCENT = '#8c2f1b';

export function Cartouche() {
  return (
    <header className="title cartouche" aria-label="Mapz — powers of the world through time">
      <svg className="cartouche-frame" viewBox="0 0 260 92" aria-hidden>
        {/* Frame with notched corners, a double rule inside */}
        <path
          d="M22 6 H238 Q238 14 246 14 V78 Q238 78 238 86 H22 Q22 78 14 78 V14 Q22 14 22 6 Z"
          fill={PAPER}
          stroke={INK}
          strokeWidth="1.6"
        />
        <path
          d="M27 11 H233 Q233 18 241 18 V74 Q233 74 233 81 H27 Q27 74 19 74 V18 Q27 18 27 11 Z"
          fill="none"
          stroke={INK_SOFT}
          strokeWidth="0.7"
        />
        {/* Scrolled ends */}
        {[1, -1].map((side) => (
          <g key={side} transform={side === 1 ? undefined : 'translate(260 0) scale(-1 1)'}>
            <path
              d="M14 32 C3 32 2 46 8 49 C13 52 18 46 14 42 C11 39 8 43 10 45"
              fill="none"
              stroke={INK}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            <path
              d="M14 60 C3 60 2 46 8 43"
              fill="none"
              stroke={INK}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </g>
        ))}
        {/* Fleurons above and below */}
        {[
          [130, 6, 1],
          [130, 86, -1],
        ].map(([x, y, s]) => (
          <g key={y} transform={`translate(${x} ${y}) scale(1 ${s})`}>
            <path d="M-14 0 C-8 -6 -3 -6 0 -2 C3 -6 8 -6 14 0" fill="none" stroke={INK} strokeWidth="1.1" />
            <circle cx="0" cy="-5" r="1.8" fill={ACCENT} />
          </g>
        ))}
      </svg>
      <h1>Mapz</h1>
      <p>Powers of the world through time</p>
    </header>
  );
}

// A sixteen-point compass rose. Map rotation is turned off, so north is always up.
export function CompassRose() {
  const points = (n: number, outer: number, inner: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i * 360) / n + offset) * (Math.PI / 180);
      const b = a + Math.PI / n;
      return `M0 0 L${(Math.sin(a - Math.PI / n) * inner).toFixed(2)} ${(-Math.cos(a - Math.PI / n) * inner).toFixed(2)} L${(Math.sin(a) * outer).toFixed(2)} ${(-Math.cos(a) * outer).toFixed(2)} L${(Math.sin(b) * inner).toFixed(2)} ${(-Math.cos(b) * inner).toFixed(2)} Z`;
    }).join(' ');
  return (
    <svg className="compass-rose" viewBox="-60 -66 120 126" aria-hidden>
      <circle r="44" fill="none" stroke={INK_SOFT} strokeWidth="0.6" />
      <circle r="40" fill="none" stroke={INK_SOFT} strokeWidth="0.4" strokeDasharray="1 2.2" />
      <path d={points(16, 30, 4, 11.25)} fill={PAPER} stroke={INK_SOFT} strokeWidth="0.5" />
      <path d={points(8, 38, 6, 22.5)} fill="#e3d3ad" stroke={INK} strokeWidth="0.6" />
      <path d={points(4, 50, 8)} fill={PAPER} stroke={INK} strokeWidth="0.8" />
      {/* Shade one half of each cardinal point, as engravers did */}
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d="M0 0 L0 -50 L8 -8 Z" transform={`rotate(${a})`} fill={a === 0 ? ACCENT : INK} opacity={a === 0 ? 0.85 : 0.75} />
      ))}
      <circle r="3" fill={PAPER} stroke={INK} strokeWidth="0.8" />
      <text y="-54" textAnchor="middle" fontFamily="'IM Fell English SC', Georgia, serif" fontSize="12" fill={INK}>
        N
      </text>
    </svg>
  );
}
