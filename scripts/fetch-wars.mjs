// Fetch the wars and campaigns that battles belong to from Wikidata → data/wikidata/wars.json
//
// Reads the war ids recorded on each battle (public/data/battles.geojson, see fetch-battles.mjs)
// and queries their names, dates, parent war, participants and English Wikipedia article.
// Runs in GitHub Actions; scripts/build-wars.mjs turns the result into the map's wars layer.

import fs from 'node:fs';
import { articleTitle, isQid, parseYear, qid, sparql } from './lib/wikidata.mjs';

const BATCH = 250;

const battles = JSON.parse(fs.readFileSync('public/data/battles.geojson', 'utf8')).features;
const ids = [...new Set(battles.flatMap((f) => (f.properties.warIds ? f.properties.warIds.split(';') : [])))];
console.log(`${ids.length} wars and campaigns referenced by battles`);

const detailQuery = (values) => `
SELECT ?war ?warLabel ?start ?end ?pit ?parent ?parentLabel ?article WHERE {
  VALUES ?war { ${values} }
  OPTIONAL { ?war wdt:P580 ?start . }
  OPTIONAL { ?war wdt:P582 ?end . }
  OPTIONAL { ?war wdt:P585 ?pit . }
  OPTIONAL { ?war wdt:P361 ?parent . }
  OPTIONAL { ?article schema:about ?war ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,pt,ru,zh,ar". }
}`;

const participantQuery = (values) => `
SELECT ?war ?pLabel WHERE {
  VALUES ?war { ${values} }
  ?war wdt:P710 ?p .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es". }
}`;

const wars = {};
const minYear = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b));
const maxYear = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));

for (let i = 0; i < ids.length; i += BATCH) {
  const values = ids
    .slice(i, i + BATCH)
    .map((id) => `wd:${id}`)
    .join(' ');
  const rows = await sparql(detailQuery(values));
  for (const r of rows) {
    const id = qid(r.war.value);
    const name = r.warLabel?.value;
    if (!name || isQid(name)) continue;
    const w = (wars[id] ??= { name, start: null, end: null, parent: null, parentName: null, article: null, sides: [] });
    // Multiple values multiply rows: keep the widest span.
    const start = r.start ? parseYear(r.start.value) : r.pit ? parseYear(r.pit.value) : null;
    const end = r.end ? parseYear(r.end.value) : r.pit ? parseYear(r.pit.value) : null;
    w.start = minYear(w.start, start);
    w.end = maxYear(w.end, end);
    if (r.parent && !w.parent && r.parentLabel && !isQid(r.parentLabel.value)) {
      w.parent = qid(r.parent.value);
      w.parentName = r.parentLabel.value;
    }
    if (r.article && !w.article) w.article = articleTitle(r.article.value);
  }
  try {
    for (const r of await sparql(participantQuery(values))) {
      const w = wars[qid(r.war.value)];
      const label = r.pLabel?.value;
      if (w && label && !isQid(label) && !w.sides.includes(label) && w.sides.length < 12) w.sides.push(label);
    }
  } catch (e) {
    console.warn('Participants query failed for a batch; continuing without:', e.message);
  }
  console.log(`  ${Math.min(i + BATCH, ids.length)} / ${ids.length}`);
}

fs.mkdirSync('data/wikidata', { recursive: true });
fs.writeFileSync('data/wikidata/wars.json', JSON.stringify(wars, null, 1));
console.log(`Wrote ${Object.keys(wars).length} wars to data/wikidata/wars.json`);
