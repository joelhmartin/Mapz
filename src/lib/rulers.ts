// Heads of state per polity, from Wikidata (CC0). Written by scripts/build-rulers.mjs as small
// shards so opening a panel only fetches the shard that holds that polity.

export interface Reign {
  name: string;
  from: number;
  to: number;
  // False when Wikidata has no end date and the next ruler's accession stands in for it.
  endKnown: boolean;
  article: string | null;
  dynasty: string | null;
}

// Must match scripts/build-rulers.mjs.
const SHARDS = 32;
function shardOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0) % SHARDS;
}

type Row = [string, number, number, 0 | 1, (string | 0 | null)?, string?];
const shards = new Map<number, Promise<Record<string, Row[]>>>();

function loadShard(n: number) {
  let s = shards.get(n);
  if (!s) {
    s = fetch(`${import.meta.env.BASE_URL}data/rulers/${n}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    shards.set(n, s);
  }
  return s;
}

export async function loadReigns(key: string): Promise<Reign[]> {
  return toReigns((await loadShard(shardOf(key)))[key] ?? []);
}

// Every polity's reigns, for search.
export async function loadAllReigns(): Promise<Record<string, Reign[]>> {
  const all = await Promise.all(Array.from({ length: SHARDS }, (_, i) => loadShard(i)));
  const out: Record<string, Reign[]> = {};
  for (const shard of all) for (const [key, rows] of Object.entries(shard)) out[key] = toReigns(rows);
  return out;
}

function toReigns(rows: Row[]): Reign[] {
  return rows.map(([name, from, to, endKnown, article, dynasty]) => ({
    name,
    from,
    to,
    endKnown: endKnown === 1,
    article: article === 0 || article === undefined ? name : article,
    dynasty: dynasty ?? null,
  }));
}

// Spans spread over as few rows as possible, so co-rulers and overlaps don't hide each other.
export function lanes<T extends { from: number; to: number }>(spans: T[]): T[][] {
  const rows: T[][] = [];
  for (const r of spans) {
    const row = rows.find((l) => l[l.length - 1].to <= r.from);
    if (row) row.push(r);
    else rows.push([r]);
  }
  return rows;
}

// "House of Aisin Gioro", "Aisin Gioro" and "Aisin Gioro dynasty" are one family.
const familyKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(the )?(house|dynasty) of /, '')
    .replace(/ (dynasty|family|clan|house)$/, '');

// Consecutive reigns of the same dynasty, merged into one band.
export function dynasties(reigns: Reign[]): { name: string; from: number; to: number }[] {
  const bands: { name: string; key: string; from: number; to: number }[] = [];
  for (const r of reigns) {
    if (!r.dynasty) continue;
    const key = familyKey(r.dynasty);
    const last = [...bands].reverse().find((b) => b.key === key);
    if (last && r.from <= last.to + 5) last.to = Math.max(last.to, r.to);
    else bands.push({ name: r.dynasty, key, from: r.from, to: r.to });
  }
  return bands.map(({ name, from, to }) => ({ name, from, to }));
}
