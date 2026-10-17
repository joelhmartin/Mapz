// Build the rulers data the info panel reads: data/wikidata/rulers.json → public/data/rulers/NN.json
//
// For each polity, keeps the terms that overlap its span on the map, fills in missing end years
// from the next ruler's start (flagged, so the panel can draw them as uncertain), and drops
// implausible ones. The output is split into small shards by a hash of the polity key, so opening
// a panel loads one shard instead of every ruler in the world. src/lib/rulers.ts reads them.

import fs from 'node:fs';
import path from 'node:path';

export const SHARDS = 32;
const MAX_REIGN_YEARS = 80; // longer "reigns" are almost always bad data
const OUT = 'public/data/rulers';

// FNV-1a over UTF-16 code units; src/lib/rulers.ts uses the same function.
export function shardOf(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0) % SHARDS;
}

const index = JSON.parse(fs.readFileSync('public/data/polities.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('data/wikidata/rulers.json', 'utf8'));

const shards = Array.from({ length: SHARDS }, () => ({}));
let polities = 0;
let kept = 0;
for (const [key, { terms }] of Object.entries(raw)) {
  const p = index[key];
  if (!p) continue;
  const sorted = [...terms].sort((a, b) => a.from - b.from);
  const rows = [];
  sorted.forEach((t, i) => {
    // The next term by someone else bounds a term with no recorded end.
    const next = sorted.slice(i + 1).find((u) => u.from > t.from && u.q !== t.q);
    const endKnown = t.to !== null && t.to >= t.from;
    const to = endKnown ? t.to : next ? Math.max(t.from, next.from) : t.from;
    if (to - t.from > MAX_REIGN_YEARS) return;
    if (to < p.from || t.from > p.to) return;
    // [name, from, to, end known (1/0), article (0 when it equals the name, null if none), dynasty]
    const row = [t.name, t.from, to, endKnown ? 1 : 0];
    if (t.article !== t.name || t.dynasty) row.push(t.article === t.name ? 0 : t.article);
    if (t.dynasty) row.push(t.dynasty);
    rows.push(row);
  });
  if (!rows.length) continue;
  shards[shardOf(key)][key] = rows;
  polities++;
  kept += rows.length;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
shards.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${i}.json`), JSON.stringify(s)));
const bytes = shards.reduce((n, s) => n + JSON.stringify(s).length, 0);
console.log(`${kept} reigns for ${polities} polities in ${SHARDS} shards (${(bytes / 1e6).toFixed(2)} MB total)`);
