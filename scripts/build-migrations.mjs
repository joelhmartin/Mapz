// Build the movements layer: data/curated/migrations.json → public/data/migrations.{geojson,json}
//
// Each route is cut into short segments that carry the years they span, so the map can draw
// exactly the part of a route travelled by the selected year. Each segment also gets a point at
// its far end, rotated along the route, which carries the arrowhead while that segment is the front.

import fs from 'node:fs';

const SRC = 'data/curated/migrations.json';
const OUT = 'public/data';
const STEP_DEG = 1.5; // segment length; short enough that the route grows smoothly

const { movements } = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const features = [];
const meta = {};

// Clockwise rotation from east, in Mercator screen space, for an arrowhead pointing along a segment.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const bearing = ([lon0, lat0], [lon1, lat1]) =>
  Math.round((-Math.atan2(mercY(lat1) - mercY(lat0), ((lon1 - lon0) * Math.PI) / 180) * 180) / Math.PI);
const round = (c) => Math.round(c * 1e3) / 1e3;

for (const m of movements) {
  const wps = m.waypoints;
  if (wps.length < 2) throw new Error(`${m.id}: needs at least two waypoints`);
  for (let i = 1; i < wps.length; i++) {
    if (wps[i][2] < wps[i - 1][2]) throw new Error(`${m.id}: waypoint years must not decrease`);
  }
  const from = wps[0][2];
  const to = wps.at(-1)[2];

  const legs = wps.length - 1;
  wps.slice(1).forEach(([lon1, lat1, y1], leg) => {
    const [lon0, lat0, y0] = wps[leg];
    const n = Math.max(1, Math.ceil(Math.hypot(lon1 - lon0, lat1 - lat0) / STEP_DEG));
    for (let k = 0; k < n; k++) {
      const a = k / n;
      const b = (k + 1) / n;
      const lerp = (p, q, t) => p + (q - p) * t;
      const start = [lerp(lon0, lon1, a), lerp(lat0, lat1, a)];
      const end = [lerp(lon0, lon1, b), lerp(lat0, lat1, b)];
      const properties = {
        id: m.id,
        name: m.name,
        kind: m.kind,
        y0: lerp(y0, y1, a),
        y1: lerp(y0, y1, b),
        to,
        last: leg === legs - 1 && k === n - 1,
      };
      features.push({
        type: 'Feature',
        properties,
        geometry: { type: 'LineString', coordinates: [start.map(round), end.map(round)] },
      });
      // A point at the segment's end carries the arrowhead while this segment is the front.
      features.push({
        type: 'Feature',
        properties: { ...properties, head: true, rotate: bearing(start, end) },
        geometry: { type: 'Point', coordinates: end.map(round) },
      });
    }
  });

  meta[m.id] = {
    name: m.name,
    kind: m.kind,
    from,
    to,
    certainty: m.certainty ?? 'documented',
    wikipedia: m.wikipedia ?? null,
    description: m.description,
    itinerary: wps.map(([, , year, place]) => ({ year, place })),
  };
}

fs.writeFileSync(`${OUT}/migrations.geojson`, JSON.stringify({ type: 'FeatureCollection', features }));
fs.writeFileSync(`${OUT}/migrations.json`, JSON.stringify(meta));
console.log(`${movements.length} movements, ${features.length / 2} segments → ${OUT}/migrations.{geojson,json}`);
