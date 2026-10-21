// Search across everything on the map: states, rulers, battles, wars and movements. The index is
// built on first use from data the app already loads (or that the browser has cached), so search
// adds no files of its own.

import type { BattleProps } from '../map/battles';
import { loadWarIndex } from '../map/wars';
import type { MovementIndex } from '../map/movements';
import { displayName, type PolityIndex } from './polities';
import { loadAllReigns } from './rulers';

export type SearchKind = 'polity' | 'ruler' | 'battle' | 'war' | 'movement';

export interface SearchItem {
  kind: SearchKind;
  name: string;
  from: number;
  to: number;
  center: [number, number] | null;
  // What to open: a polity key, a war or movement id, or the battle itself.
  key?: string;
  battle?: BattleProps;
  // For ranking among equally good matches: bigger states and wars first.
  weight: number;
  norm: string;
}

const BASE = import.meta.env.BASE_URL;

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ʻ' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const item = (i: Omit<SearchItem, 'norm'>): SearchItem => ({ ...i, norm: normalize(i.name) });

async function json<T>(file: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}data/${file}`);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

let built: Promise<SearchItem[]> | null = null;

export function buildSearchIndex(polities: PolityIndex, movements: MovementIndex | null): Promise<SearchItem[]> {
  built ??= (async () => {
    const items: SearchItem[] = [];
    for (const [key, p] of Object.entries(polities)) {
      if (p.kind === 'relation') continue;
      items.push(
        item({ kind: 'polity', name: displayName(key), from: p.from, to: p.to, center: p.at, key, weight: p.maxArea }),
      );
    }

    const [battles, wars, routes, reigns] = await Promise.all([
      json<{ features: { properties: BattleProps; geometry: { coordinates: [number, number] } }[] }>('battles.geojson'),
      loadWarIndex().catch(() => null),
      json<{ features: { properties: { id?: string }; geometry: { type: string; coordinates: number[][] } }[] }>(
        'migrations.geojson',
      ),
      loadAllReigns(),
    ]);

    for (const f of battles?.features ?? []) {
      const b = f.properties;
      items.push(item({ kind: 'battle', name: b.name, from: b.year, to: b.year, center: f.geometry.coordinates, battle: b, weight: 0 }));
    }
    for (const [id, w] of Object.entries(wars ?? {})) {
      const first = w.battles[0];
      items.push(
        item({
          kind: 'war',
          name: w.name,
          from: w.from,
          to: w.to,
          center: first ? [first[4], first[5]] : null,
          key: id,
          weight: w.battles.length,
        }),
      );
    }
    const routeStart: Record<string, [number, number]> = {};
    for (const f of routes?.features ?? []) {
      const id = f.properties.id;
      if (id && f.geometry.type === 'LineString' && !routeStart[id]) routeStart[id] = f.geometry.coordinates[0] as [number, number];
    }
    for (const [id, m] of Object.entries(movements ?? {})) {
      items.push(item({ kind: 'movement', name: m.name, from: m.from, to: m.to, center: routeStart[id] ?? null, key: id, weight: 0 }));
    }
    for (const [key, list] of Object.entries(reigns)) {
      const at = polities[key]?.at ?? null;
      for (const r of list) items.push(item({ kind: 'ruler', name: r.name, from: r.from, to: r.to, center: at, key, weight: 0 }));
    }
    return items;
  })();
  return built;
}

const KIND_ORDER: Record<SearchKind, number> = { polity: 0, war: 1, ruler: 2, movement: 3, battle: 4 };

// Every word of the query must appear; names that start with it, or have a word starting with
// it, rank above names that merely contain it.
export function search(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored: [number, SearchItem][] = [];
  for (const it of items) {
    if (!words.every((w) => it.norm.includes(w))) continue;
    const score =
      it.norm === q ? 0 : it.norm.startsWith(q) ? 1 : words.every((w) => (' ' + it.norm).includes(' ' + w)) ? 2 : 3;
    scored.push([score, it]);
  }
  scored.sort(
    ([a, x], [b, y]) => a - b || KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || y.weight - x.weight || x.from - y.from,
  );
  return scored.slice(0, limit).map(([, it]) => it);
}
