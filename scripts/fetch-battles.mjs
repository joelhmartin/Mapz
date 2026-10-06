// Fetch every battle and siege with a date and coordinates from Wikidata
// → public/data/battles.geojson
//
// Wikidata data is CC0. Runs in GitHub Actions (see .github/workflows/update-battles.yml)
// or locally where query.wikidata.org is reachable.

import fs from 'node:fs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Mapz/0.1 (https://github.com/joelhmartin/Mapz) historical map';

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

async function sparql(query, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) {
    if (attempt < 4) {
      console.warn(`SPARQL ${res.status}, retrying…`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      return sparql(query, attempt + 1);
    }
    throw new Error(`SPARQL failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }
  return (await res.json()).results.bindings;
}

const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
const isQid = (s) => /^Q\d+$/.test(s); // unlabelled items fall back to their QID

function parseYear(date) {
  // xsd:dateTime, e.g. "1879-01-22T00:00:00Z" or "-0490-09-12T00:00:00Z"
  const m = /^(-?)(\d+)-/.exec(date);
  if (!m) return null;
  const y = Number(m[2]);
  // The query service uses astronomical numbering for BCE: "-0489" is 490 BCE.
  return m[1] ? -(y + 1) : y;
}

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
      article: r.article ? decodeURIComponent(r.article.value.split('/wiki/')[1]).replace(/_/g, ' ') : null,
    };
    battles.set(id, b);
  }
  // Rows multiply across optional values; keep the earliest date.
  if (year < b.year) b.year = year;
  const war = r.warLabel?.value;
  if (war && !isQid(war)) b.wars.add(war);
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
      sides: [...(participants.get(b.id) ?? [])].slice(0, 6).join('; ') || undefined,
      article: b.article ?? undefined,
    },
  }));

fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/battles.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`Wrote ${features.length} battles to public/data/battles.geojson`);
