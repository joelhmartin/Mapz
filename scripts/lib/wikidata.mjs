// Shared helpers for querying the Wikidata Query Service (data is CC0).
// query.wikidata.org is not reachable from every dev environment; these scripts run in GitHub
// Actions (see .github/workflows/update-battles.yml).

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Mapz/0.1 (https://github.com/joelhmartin/Mapz) historical map';

export async function sparql(query, attempt = 1) {
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

export const qid = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
export const isQid = (s) => /^Q\d+$/.test(s); // unlabelled items fall back to their QID

export function parseYear(date) {
  // xsd:dateTime, e.g. "1879-01-22T00:00:00Z" or "-0490-09-12T00:00:00Z"
  const m = /^(-?)(\d+)-/.exec(date);
  if (!m) return null;
  const y = Number(m[2]);
  // The query service uses astronomical numbering for BCE: "-0489" is 490 BCE.
  return m[1] ? -(y + 1) : y;
}

export function articleTitle(uri) {
  return decodeURIComponent(uri.split('/wiki/')[1]).replace(/_/g, ' ');
}
