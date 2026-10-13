// Build the wars layer: battles + Wikidata wars → public/data/wars.{geojson,json}
//
// Campaigns and fronts roll up into their top-level war (e.g. "Western Front" into World War I),
// so each war collects every battle beneath it. A war's theatres are rounded hulls around
// regional clusters of its battles, so a world war gets several theatres instead of one hull
// spanning the globe. Wars with fewer than two located battles get no theatre.

import fs from 'node:fs';

const CLUSTER_DEG = 12; // battles closer than this (in degrees, longitude scaled) share a theatre
const PAD_DEG = 0.9; // how far the hull extends beyond its outermost battles

const battles = JSON.parse(fs.readFileSync('public/data/battles.geojson', 'utf8')).features;
const wars = JSON.parse(fs.readFileSync('data/wikidata/wars.json', 'utf8'));

// The top-level war for a war id, following "part of" links that stay inside the dataset.
function topWar(id) {
  const seen = new Set();
  while (wars[id]?.parent && wars[wars[id].parent] && !seen.has(id)) {
    seen.add(id);
    id = wars[id].parent;
  }
  return id;
}

// Battles per war: directly linked ones, and everything under it via campaigns and fronts.
const direct = new Map();
const rolled = new Map();
const push = (map, id, b) => (map.get(id) ?? map.set(id, []).get(id)).push(b);
for (const f of battles) {
  const p = f.properties;
  if (!p.warIds) continue;
  const b = { qid: p.qid, name: p.name, year: p.year, date: p.date, at: f.geometry.coordinates };
  for (const id of p.warIds.split(';')) {
    if (!wars[id]) continue;
    push(direct, id, b);
    // Also credit every ancestor, so a mid-level campaign lists its own sub-campaigns' battles.
    for (let a = wars[id].parent, guard = 0; a && wars[a] && guard < 10; a = wars[a].parent, guard++) push(rolled, a, b);
  }
}

const battlesOf = (id) => {
  const all = [...(direct.get(id) ?? []), ...(rolled.get(id) ?? [])];
  const unique = [...new Map(all.map((b) => [b.qid, b])).values()];
  return unique.sort((a, b) => a.year - b.year || (a.date < b.date ? -1 : 1));
};

// --- geometry -------------------------------------------------------------------------------

const dist = ([x0, y0], [x1, y1]) => {
  let dx = Math.abs(x0 - x1);
  if (dx > 180) dx = 360 - dx;
  return Math.hypot(dx * Math.cos((((y0 + y1) / 2) * Math.PI) / 180), y0 - y1);
};

// Single-linkage clustering: battles join a cluster if they are near any battle already in it.
function clusters(points) {
  const parent = points.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (dist(points[i], points[j]) < CLUSTER_DEG) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  points.forEach((p, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))).push(p));
  return [...groups.values()];
}

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// A rounded hull: the convex hull of small circles around every battle.
function theatre(points) {
  // Keep a cluster that straddles the antimeridian on one side of it.
  if (Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])) > 180) {
    points = points.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
  }
  const ring = [];
  for (const [x, y] of points) {
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * 2 * Math.PI;
      ring.push([x + (PAD_DEG * Math.cos(t)) / Math.cos((y * Math.PI) / 180), y + PAD_DEG * Math.sin(t)]);
    }
  }
  const hull = convexHull(ring).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  hull.push(hull[0]);
  return hull;
}

const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

// --- output ---------------------------------------------------------------------------------

const features = [];
const index = {};
let drawn = 0;

for (const [id, w] of Object.entries(wars)) {
  const list = battlesOf(id);
  if (!list.length) continue;
  const years = list.map((b) => b.year);
  const from = Math.min(w.start ?? Infinity, ...years);
  const to = Math.max(w.end ?? -Infinity, ...years);
  const top = topWar(id) === id;

  index[id] = {
    name: w.name,
    from,
    to,
    parent: w.parent && wars[w.parent] ? w.parent : null,
    parentName: w.parentName,
    article: w.article,
    sides: w.sides,
    battles: list.map((b) => [b.qid, b.name, b.year, b.date, b.at[0], b.at[1]]),
  };

  // Only top-level wars get theatres, so a war and its own campaigns are not drawn twice.
  if (!top || list.length < 2) continue;
  drawn++;
  const groups = clusters(list.map((b) => b.at));
  groups.sort((a, b) => b.length - a.length);
  for (const g of groups) {
    if (g.length < 2 && groups.length > 1) continue; // stray single battles stay as icons only
    features.push({
      type: 'Feature',
      properties: { id, name: w.name, from, to, n: list.length },
      geometry: { type: 'Polygon', coordinates: [theatre(g)] },
    });
  }
  // One label per war, at the centre of its largest theatre.
  features.push({
    type: 'Feature',
    properties: { id, name: w.name, from, to, n: list.length, label: true },
    geometry: { type: 'Point', coordinates: centroid(groups[0]).map((c) => Math.round(c * 100) / 100) },
  });
}

fs.writeFileSync('public/data/wars.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
fs.writeFileSync('public/data/wars.json', JSON.stringify(index));
console.log(`${Object.keys(index).length} wars indexed, ${drawn} with theatres (${features.length} features)`);
