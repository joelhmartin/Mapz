// Build the map data: Cliopatria polities + supplementary polities + Natural Earth basemap
// → public/data/world.pmtiles
//
// Requires tippecanoe (https://github.com/felt/tippecanoe) on PATH.
// Run `npm run data:fetch` and `npm run data:supplement` first.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import polylabel from 'polylabel';

const RAW = 'data/raw';
const BUILD = 'data/build';
const OUT = 'public/data';

fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const clioDir = path.join(RAW, 'cliopatria/unzipped');
const clioFile = fs.readdirSync(clioDir).find((f) => f.endsWith('.geojson'));
if (!clioFile) throw new Error(`No Cliopatria GeoJSON in ${clioDir}; run npm run data:fetch`);
console.log(`Reading ${clioFile}…`);
const clio = JSON.parse(fs.readFileSync(path.join(clioDir, clioFile), 'utf8'));

// Gap-filling polities from historical-basemaps and data/curated (see scripts/supplement.py).
const supplementFile = path.join(BUILD, 'supplement.ndjson');
if (fs.existsSync(supplementFile)) {
  const lines = fs.readFileSync(supplementFile, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) clio.features.push(JSON.parse(line));
  console.log(`Added ${lines.length} supplementary features`);
} else {
  console.warn(`No ${supplementFile}; building from Cliopatria only`);
}

// Stable, muted colour per polity name so an empire keeps its colour through time.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function colourFor(name) {
  const h = hash(name);
  return hslToHex(h % 360, 38 + ((h >>> 9) % 18), 52 + ((h >>> 17) % 14));
}

function largestPolygon(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = polys[0];
  let bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
    }
    a = Math.abs(a);
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best;
}

// Small polities are invisible on a zoomed-out world map, so they only enter the tiles at
// higher zooms. This keeps the world-view tiles small even though they hold all of history.
const ZOOM_CLASSES = [
  { minzoom: 0, minArea: 400_000 },
  { minzoom: 1, minArea: 100_000 },
  { minzoom: 2, minArea: 20_000 },
  { minzoom: 3, minArea: 0 },
];
const zoomClass = (area) => ZOOM_CLASSES.findIndex((c) => area >= c.minArea);

const polyLines = ZOOM_CLASSES.map(() => []);
const labelLines = ZOOM_CLASSES.map(() => []);
const index = {};

clio.features.forEach((f, i) => {
  const p = f.properties;
  if (!f.geometry) return;
  // Bracketed names are composites drawn over their member polities: relations such as
  // "(Alliance between Elam and Babylonia)" and colonial empires such as "(British Empire)".
  // They are outlined rather than filled so the members underneath stay readable.
  const isComposite = p.Name.startsWith('(');
  const kind = p.Type === 'RELATION' ? 'relation' : isComposite ? 'empire' : (p.Kind ?? 'polity');
  const name = isComposite ? p.Name.replace(/^\(|\)$/g, '') : p.Name;
  const props = {
    id: i + 1,
    key: p.Name,
    name,
    from: p.FromYear,
    to: p.ToYear,
    kind,
    area: Math.round(p.Area),
    // A composite shares its colour with the polity of the same name, e.g. (Portuguese Empire).
    color: colourFor(name),
  };
  // Supplementary borders are less certain than Cliopatria's; the style draws them softer.
  if (p.Certainty) props.certainty = p.Certainty;
  if (p.LandArea) props.land = Math.round(p.LandArea);
  const zc = zoomClass(props.area);
  polyLines[zc].push(JSON.stringify({ type: 'Feature', id: i + 1, properties: props, geometry: f.geometry }));

  if (!isComposite) {
    const [x, y] = polylabel(largestPolygon(f.geometry), 0.05);
    labelLines[zc].push(
      JSON.stringify({ type: 'Feature', id: i + 1, properties: props, geometry: { type: 'Point', coordinates: [x, y] } }),
    );
  }

  const entry = (index[p.Name] ??= {
    name,
    kind,
    from: p.FromYear,
    to: p.ToYear,
    wikipedia: p.Wikipedia || null,
    wikidata: p.Wikidata || null,
    seshat: new Set(),
    memberOf: new Set(),
    components: new Set(),
    color: props.color,
    maxArea: 0,
    description: null,
    sources: new Set(),
  });
  entry.sources.add(p.Source ?? 'cliopatria');
  entry.description ??= p.Description ?? null;
  if (!entry.wikipedia && p.Wikipedia) entry.wikipedia = p.Wikipedia;
  entry.from = Math.min(entry.from, p.FromYear);
  entry.to = Math.max(entry.to, p.ToYear);
  entry.maxArea = Math.max(entry.maxArea, props.area);
  for (const [field, set] of [
    ['SeshatID', entry.seshat],
    ['MemberOf', entry.memberOf],
    ['Components', entry.components],
  ]) {
    for (const v of (p[field] || '').split(';')) if (v) set.add(v);
  }
});

const jsonIndex = Object.fromEntries(
  Object.entries(index).map(([k, e]) => [
    k,
    {
      ...e,
      seshat: [...e.seshat],
      memberOf: [...e.memberOf],
      components: [...e.components],
      sources: [...e.sources],
    },
  ]),
);

fs.writeFileSync(path.join(OUT, 'polities.json'), JSON.stringify(jsonIndex));
console.log(`${clio.features.length} polygons, ${Object.keys(index).length} polities`);

function tippecanoe(out, minzoom, layers) {
  const args = ['-q', '-o', out, '--force', `-Z${minzoom}`, '-z6'];
  args.push('--no-feature-limit', '--no-tile-size-limit', '--drop-rate=1');
  args.push('--low-detail=10', '--simplification=8', '--use-attribute-for-id=id');
  for (const [name, file] of layers) args.push('-L', `${name}:${file}`);
  execFileSync('tippecanoe', args, { stdio: 'inherit' });
}

// One tileset per zoom class (tippecanoe's per-feature "minzoom" is unreliable in some builds),
// plus the physical basemap, then merged into a single PMTiles file.
console.log('Running tippecanoe…');
const parts = [];
ZOOM_CLASSES.forEach((c, i) => {
  const poly = path.join(BUILD, `polities-z${c.minzoom}.ndjson`);
  const labels = path.join(BUILD, `labels-z${c.minzoom}.ndjson`);
  fs.writeFileSync(poly, polyLines[i].join('\n'));
  fs.writeFileSync(labels, labelLines[i].join('\n'));
  const out = path.join(BUILD, `polities-z${c.minzoom}.pmtiles`);
  tippecanoe(out, c.minzoom, [['polities', poly], ['labels', labels]]);
  parts.push(out);
});

const basemap = path.join(BUILD, 'basemap.pmtiles');
tippecanoe(basemap, 0, [
  ['land', path.join(RAW, 'ne_10m_land.geojson')],
  ['land', path.join(RAW, 'ne_10m_minor_islands.geojson')],
  ['lakes', path.join(RAW, 'ne_50m_lakes.geojson')],
  ['rivers', path.join(RAW, 'ne_50m_rivers_lake_centerlines.geojson')],
]);
parts.push(basemap);

const pmtiles = path.join(OUT, 'world.pmtiles');
execFileSync(
  'tile-join',
  [
    '-q', '-o', pmtiles, '--force', '--no-tile-size-limit',
    '--attribution=<a href="https://github.com/Seshat-Global-History-Databank/cliopatria">Cliopatria</a> (Seshat, CC-BY 4.0) · <a href="https://www.naturalearthdata.com">Natural Earth</a>',
    ...parts,
  ],
  { stdio: 'inherit' },
);
console.log(`Wrote ${pmtiles} (${(fs.statSync(pmtiles).size / 1e6).toFixed(1)} MB)`);
