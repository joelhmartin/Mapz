// Per-polity summary written by scripts/build-data.mjs, keyed by the Cliopatria name.
export type PolityKind = 'polity' | 'empire' | 'relation';

export interface PolityInfo {
  name: string;
  kind: PolityKind;
  from: number;
  to: number;
  wikipedia: string | null;
  wikidata: string | null;
  seshat: string[];
  memberOf: string[];
  components: string[];
  color: string;
  maxArea: number;
}

export type PolityIndex = Record<string, PolityInfo>;

// Properties carried by each feature in the `polities` and `labels` tile layers.
export interface PolityFeatureProps {
  key: string;
  name: string;
  from: number;
  to: number;
  kind: PolityKind;
  area: number;
  color: string;
}

export async function loadPolityIndex(): Promise<PolityIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/polities.json`);
  if (!res.ok) throw new Error(`Failed to load polity index: ${res.status}`);
  return res.json();
}

export function displayName(key: string): string {
  return key.replace(/^\(|\)$/g, '');
}

export function activeCount(index: PolityIndex, year: number): number {
  let n = 0;
  for (const p of Object.values(index)) if (p.kind === 'polity' && p.from <= year && year <= p.to) n++;
  return n;
}

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop: { page: string } };
}

const summaryCache = new Map<string, Promise<WikiSummary | null>>();

export function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  let cached = summaryCache.get(title);
  if (!cached) {
    const slug = encodeURIComponent(title.replace(/ /g, '_'));
    cached = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<WikiSummary>) : null))
      .catch(() => null);
    summaryCache.set(title, cached);
  }
  return cached;
}
