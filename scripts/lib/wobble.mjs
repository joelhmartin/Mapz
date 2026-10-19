// The hand-drawn wobble: every coordinate on the map (borders, coasts, lakes, rivers) is moved by
// the same smooth noise field, so shared borders and coastlines wobble together and never open
// gaps. Long straight edges are densified first so they wobble too.
//
// The field is periodic in longitude (no seam at the antimeridian) and fades out at the poles
// and along ±180°, so features that end there stay closed. Displacements are at most ~0.1°,
// a few pixels at the closest zoom, so nothing moves meaningfully.

const OCTAVES = [
  { cell: 1.2, amp: 0.055 }, // slow drift, like a hand following a guide line
  { cell: 0.4, amp: 0.035 },
  { cell: 0.15, amp: 0.016 }, // the nib's tremor
];
const MAX_SEGMENT_DEG = 0.15;

function lattice(i, j, seed) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Value noise in [-1, 1], wrapping every 360° of longitude.
function noise(x, y, cell, seed) {
  const period = Math.round(360 / cell);
  const fx = (x + 180) / cell;
  const fy = (y + 90) / cell;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = smooth(fx - i0);
  const ty = smooth(fy - j0);
  const wrap = (i) => ((i % period) + period) % period;
  const a = lattice(wrap(i0), j0, seed);
  const b = lattice(wrap(i0 + 1), j0, seed);
  const c = lattice(wrap(i0), j0 + 1, seed);
  const d = lattice(wrap(i0 + 1), j0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export function wobblePoint([x, y]) {
  let dx = 0;
  let dy = 0;
  OCTAVES.forEach(({ cell, amp }, k) => {
    dx += amp * noise(x, y, cell, 2 * k + 1);
    dy += amp * noise(x, y, cell, 2 * k + 2);
  });
  // Web Mercator stretches latitude away from the equator; shrink dy to keep the wobble round.
  dy *= Math.cos((y * Math.PI) / 180);
  // Fade out at the antimeridian and the poles.
  dx *= Math.max(0, Math.min(1, (180 - Math.abs(x)) / 0.5));
  dy *= Math.max(0, Math.min(1, 89 - Math.abs(y)));
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return [r(Math.max(-180, Math.min(180, x + dx))), r(Math.max(-89.9, Math.min(89.9, y + dy)))];
}

// Splits long segments at evenly spaced points. Both polygons sharing an edge split it at the
// same points (in reverse order), so the shared border stays shared.
function densify(line) {
  const out = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    out.push(p);
    const q = line[i + 1];
    if (!q) break;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // Segments crossing the antimeridian (dateline-split rings) are left alone.
    if (len <= MAX_SEGMENT_DEG || Math.abs(q[0] - p[0]) > 180) continue;
    const n = Math.ceil(len / MAX_SEGMENT_DEG);
    for (let k = 1; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

const line = (l) => densify(l).map(wobblePoint);

export function wobbleGeometry(g) {
  if (!g) return g;
  switch (g.type) {
    case 'LineString':
      return { ...g, coordinates: line(g.coordinates) };
    case 'MultiLineString':
    case 'Polygon':
      return { ...g, coordinates: g.coordinates.map(line) };
    case 'MultiPolygon':
      return { ...g, coordinates: g.coordinates.map((p) => p.map(line)) };
    case 'GeometryCollection':
      return { ...g, geometries: g.geometries.map(wobbleGeometry) };
    default:
      return g;
  }
}

export function wobbleCollection(fc) {
  return { ...fc, features: fc.features.map((f) => ({ ...f, geometry: wobbleGeometry(f.geometry) })) };
}
