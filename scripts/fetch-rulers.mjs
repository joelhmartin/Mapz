// Fetch heads of state from Wikidata for every polity on the map → data/wikidata/rulers.json
//
// Each polity is matched to a Wikidata item: Cliopatria supplies ids, and the rest are found
// through their English Wikipedia article. Rulers come from three places:
//   1. the polity's "head of state" statements (P35), with start/end qualifiers;
//   2. holders of the office the polity names as its head of state (P1906), e.g. "King of France";
//   3. holders of head-of-state offices whose jurisdiction (P1001) is the polity, e.g. "Mansa of Mali".
// Only terms with a start date are kept. scripts/build-rulers.mjs filters them to each polity's
// span and writes the files the map reads. Runs in GitHub Actions (update-rulers.yml).

import fs from 'node:fs';
import { articleTitle, isQid, parseYear, qid, sparql } from './lib/wikidata.mjs';

const index = JSON.parse(fs.readFileSync('public/data/polities.json', 'utf8'));
const LABEL_LANGS = 'en,fr,de,es,it,pt,ru,zh,ar,ja,fa,tr';
// Offices held by more people than this are generic classes ("monarch", "king"), not one
// polity's office; they are skipped.
const MAX_HOLDERS = 2500;

const values = (ids) => ids.map((id) => `wd:${id}`).join(' ');
const literal = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`;

async function batched(items, size, label, fn) {
  const t0 = Date.now();
  for (let i = 0; i < items.length; i += size) {
    try {
      await fn(items.slice(i, i + size));
    } catch (e) {
      console.warn(`${label}: batch at ${i} failed (${e.message.slice(0, 200)}); continuing`);
    }
    if ((i / size) % 10 === 0) console.log(`  ${label}: ${Math.min(i + size, items.length)} / ${items.length}`);
  }
  console.log(`  ${label}: done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

// --- 1. polity → Wikidata item ------------------------------------------------------------------

const itemOf = {}; // polity key → QID
const byTitle = {};
for (const [key, p] of Object.entries(index)) {
  if (p.kind === 'relation' || p.kind === 'people') continue;
  const id = (p.wikidata || '').split(/[;,\s]/).find(isQid);
  if (id) itemOf[key] = id;
  else if (p.wikipedia) (byTitle[p.wikipedia] ??= []).push(key);
}
console.log(`${Object.keys(itemOf).length} polities with Wikidata ids; resolving ${Object.keys(byTitle).length} articles`);

await batched(Object.keys(byTitle), 150, 'articles', async (titles) => {
  const rows = await sparql(`
SELECT ?title ?item WHERE {
  VALUES ?title { ${titles.map(literal).join(' ')} }
  ?article schema:name ?title ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?item .
}`);
  for (const r of rows) for (const key of byTitle[r.title.value] ?? []) itemOf[key] ??= qid(r.item.value);
});

const items = [...new Set(Object.values(itemOf))];
console.log(`${items.length} distinct items`);

// --- 2. terms ------------------------------------------------------------------------------------

const terms = {}; // item → [{q, name, from, to, article, dynasty}]
function addTerm(item, r) {
  const name = r.personLabel?.value;
  const from = r.start ? parseYear(r.start.value) : null;
  if (!name || isQid(name) || from === null) return;
  const list = (terms[item] ??= []);
  const q = qid(r.person.value);
  const to = r.end ? parseYear(r.end.value) : null;
  const dynasty = r.familyLabel && !isQid(r.familyLabel.value) ? r.familyLabel.value : null;
  const t = list.find((x) => x.q === q && x.from === from);
  if (t) {
    if (to !== null && (t.to === null || to > t.to)) t.to = to;
    t.dynasty ??= dynasty;
    t.article ??= r.article ? articleTitle(r.article.value) : null;
    return;
  }
  list.push({ q, name, from, to, article: r.article ? articleTitle(r.article.value) : null, dynasty });
}

const personFields = `
  OPTIONAL { ?person wdt:P53 ?family . }
  OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LABEL_LANGS}". }`;

// 2a. direct head-of-state statements
await batched(items, 80, 'P35', async (batch) => {
  const rows = await sparql(`
SELECT ?polity ?person ?personLabel ?start ?end ?familyLabel ?article WHERE {
  VALUES ?polity { ${values(batch)} }
  ?polity p:P35 ?st . ?st ps:P35 ?person .
  OPTIONAL { ?st pq:P580 ?start . }
  OPTIONAL { ?st pq:P582 ?end . }
  ${personFields}
}`);
  for (const r of rows) addTerm(qid(r.polity.value), r);
});

// 2b. the polity's head-of-state offices, named by the polity or pointing at it
const officesOf = {}; // office → Set(items)
const jurisdiction = {}; // office → Set(items it applies to)
const link = (office, item) => (officesOf[office] ??= new Set()).add(item);
await batched(items, 150, 'offices (P1906)', async (batch) => {
  const rows = await sparql(`
SELECT ?polity ?office WHERE { VALUES ?polity { ${values(batch)} } ?polity wdt:P1906 ?office . }`);
  for (const r of rows) link(qid(r.office.value), qid(r.polity.value));
});
// Every kind of head-of-state office ("King of France" ⊂ king ⊂ monarch ⊂ head of state), fetched
// once so the per-polity lookups below stay cheap.
const headOfState = new Set();
try {
  const rows = await sparql(`SELECT ?c WHERE { ?c wdt:P279* wd:Q48352 . }`);
  for (const r of rows) headOfState.add(qid(r.c.value));
} catch (e) {
  console.warn(`Head-of-state classes query failed (${e.message.slice(0, 200)}); skipping jurisdiction lookups`);
}
console.log(`${headOfState.size} head-of-state office classes`);
if (headOfState.size) {
  await batched(items, 100, 'offices (P1001)', async (batch) => {
    const rows = await sparql(`
SELECT ?polity ?office WHERE { VALUES ?polity { ${values(batch)} } ?office wdt:P1001 ?polity . }`);
    for (const r of rows) {
      const office = qid(r.office.value);
      if (!headOfState.has(office)) continue;
      link(office, qid(r.polity.value));
      (jurisdiction[office] ??= new Set()).add(qid(r.polity.value));
    }
  });
}
const offices = Object.keys(officesOf);
console.log(`${offices.length} head-of-state offices`);

await batched(offices, 150, 'office jurisdictions', async (batch) => {
  const rows = await sparql(`
SELECT ?office ?jur WHERE { VALUES ?office { ${values(batch)} } ?office wdt:P1001 ?jur . }`);
  for (const r of rows) (jurisdiction[qid(r.office.value)] ??= new Set()).add(qid(r.jur.value));
});

const holders = {};
await batched(offices, 150, 'holder counts', async (batch) => {
  const rows = await sparql(`
SELECT ?office (COUNT(?st) AS ?n) WHERE {
  VALUES ?office { ${values(batch)} }
  ?person p:P39 ?st . ?st ps:P39 ?office .
} GROUP BY ?office`);
  for (const r of rows) if (r.office) holders[qid(r.office.value)] = Number(r.n.value);
});
if (!Object.keys(holders).length) console.warn(`No holders counted; sample offices: ${offices.slice(0, 8).join(' ')}`);
const usable = offices.filter((o) => holders[o] > 0 && holders[o] <= MAX_HOLDERS);
console.log(`${usable.length} offices with holders (${offices.filter((o) => holders[o] > MAX_HOLDERS).length} generic ones skipped)`);

// An office without a jurisdiction of its own ("sultan", "khagan") is shared by many states, so
// its holders only count for a polity when the term itself names that polity.
await batched(usable, 25, 'holders', async (batch) => {
  const rows = await sparql(`
SELECT ?office ?person ?personLabel ?start ?end ?of ?familyLabel ?article WHERE {
  VALUES ?office { ${values(batch)} }
  ?person p:P39 ?st . ?st ps:P39 ?office .
  OPTIONAL { ?st pq:P580 ?start . }
  OPTIONAL { ?st pq:P582 ?end . }
  OPTIONAL { ?st pq:P642|pq:P1001 ?of . }
  ${personFields}
}`);
  for (const r of rows) {
    const office = qid(r.office.value);
    const of = r.of ? qid(r.of.value) : null;
    const scoped = jurisdiction[office]?.size > 0 || officesOf[office].size === 1;
    for (const item of officesOf[office]) {
      // A term naming one of this office's polities counts for that polity only.
      if (of && officesOf[office].has(of) ? of === item : scoped) addTerm(item, r);
    }
  }
});

// --- 3. write, keyed by polity ---------------------------------------------------------------------

const out = {};
let n = 0;
for (const [key, item] of Object.entries(itemOf)) {
  if (!terms[item]?.length) continue;
  out[key] = { item, terms: terms[item].sort((a, b) => a.from - b.from) };
  n += terms[item].length;
}
fs.mkdirSync('data/wikidata', { recursive: true });
fs.writeFileSync('data/wikidata/rulers.json', JSON.stringify(out, null, 1));
console.log(`Wrote ${n} terms for ${Object.keys(out).length} polities to data/wikidata/rulers.json`);
