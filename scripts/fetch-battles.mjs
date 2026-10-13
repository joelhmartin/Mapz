// Fetch every battle and siege with a date and coordinates from Wikidata
// → public/data/battles.geojson
//
// Wikidata data is CC0. Runs in GitHub Actions (see .github/workflows/update-battles.yml)
// or locally where query.wikidata.org is reachable.

import fs from 'node:fs';
import { articleTitle, isQid, parseYear, qid, sparql } from './lib/wikidata.mjs';

// battle, siege, naval battle, military engagement(s)
const TYPES = 'wd:Q178561 wd:Q188055 wd:Q1261499 wd:Q831663 wd:Q11512';

const MAIN_QUERY = `
SELECT ?b ?bLabel ?date ?coord ?war ?warLabel ?article WHERE {
  VALUES ?type { ${TYPES} }
  ?b wdt:P31 ?type ;
     wdt:P625 ?coord .
  OPTIONAL { ?b wdt:P585 ?pit . }
  OPTIONAL { ?b wdt:P580 ?start . }
  BIND(COALESCE(?pit, ?start) AS ?date)
  FILTER(BOUND(?date))
  OPTIONAL { ?b wdt:P361 ?war . }
  OPTIONAL { ?article schema:about ?b ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,pt,ru,zh,ar". }
}`;

const PARTICIPANT_QUERY = `
SELECT ?b ?pLabel WHERE {
  VALUES ?type { ${TYPES} }
  ?b wdt:P31 ?type ;
     wdt:P625 [] ;
     wdt:P710 ?p .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es". }
}`;

function parsePoint(wkt) {
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

console.log('Querying battles…');
const rows = await sparql(MAIN_QUERY);
console.log(`${rows.length} rows`);

console.log('Querying participants…');
let participantRows = [];
try {
  participantRows = await sparql(PARTICIPANT_QUERY);
} catch (e) {
  console.warn('Participants query failed; continuing without:', e.message);
}

const participants = new Map();
for (const r of participantRows) {
  const id = qid(r.b.value);
  const label = r.pLabel?.value;
  if (!label || isQid(label)) continue;
  if (!participants.has(id)) participants.set(id, new Set());
  participants.get(id).add(label);
}

const battles = new Map();
for (const r of rows) {
  const id = qid(r.b.value);
  const name = r.bLabel?.value;
  const year = parseYear(r.date.value);
  const coords = parsePoint(r.coord.value);
  if (!name || isQid(name) || year === null || !coords) continue;
  if (year > 2025) continue;

  let b = battles.get(id);
  if (!b) {
    b = {
      id,
      name,
      year,
      date: r.date.value.slice(0, r.date.value.indexOf('T')),
      coords,
      wars: new Set(),
      warIds: new Set(),
      article: r.article ? articleTitle(r.article.value) : null,
    };
    battles.set(id, b);
  }
  // Rows multiply across optional values; keep the earliest date.
  if (year < b.year) b.year = year;
  const war = r.warLabel?.value;
  if (war && !isQid(war)) b.wars.add(war);
  if (r.war) b.warIds.add(qid(r.war.value));
}

const features = [...battles.values()]
  .sort((a, b) => a.year - b.year)
  .map((b, i) => ({
    type: 'Feature',
    id: i + 1,
    geometry: { type: 'Point', coordinates: b.coords.map((c) => Math.round(c * 1e4) / 1e4) },
    properties: {
      qid: b.id,
      name: b.name,
      year: b.year,
      date: b.date,
      war: [...b.wars].slice(0, 2).join('; ') || undefined,
      // Wikidata ids of the wars or campaigns this battle is part of (see scripts/fetch-wars.mjs).
      warIds: [...b.warIds].slice(0, 3).join(';') || undefined,
      sides: [...(participants.get(b.id) ?? [])].slice(0, 6).join('; ') || undefined,
      article: b.article ?? undefined,
    },
  }));

fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/battles.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`Wrote ${features.length} battles to public/data/battles.geojson`);
