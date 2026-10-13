import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { PEOPLE_FONT } from './style';

export const WARS_SOURCE = 'wars';
export const WAR_LAYERS = ['wars-fill', 'wars-outline', 'wars-label'];
// Only the outline and label are hit-tested: a theatre's fill covers whole regions, and hovering
// it would hide the territories underneath.
export const WAR_HIT_LAYERS = ['wars-outline', 'wars-label'];

const WAR_RED = '#8c2f1b';

// Properties on theatre polygons and label points (see scripts/build-wars.mjs).
export interface WarFeatureProps {
  id: string;
  name: string;
  from: number;
  to: number;
  n: number;
  label?: boolean;
}

// [qid, name, year, date, lon, lat]
export type WarBattle = [string, string, number, string, number, number];

export interface WarInfo {
  name: string;
  from: number;
  to: number;
  parent: string | null;
  parentName: string | null;
  article: string | null;
  sides: string[];
  battles: WarBattle[];
}

export type WarIndex = Record<string, WarInfo>;

let warIndex: Promise<WarIndex> | null = null;

// The index lists every battle of every war, so it is only fetched once a war panel opens.
export function loadWarIndex(): Promise<WarIndex> {
  warIndex ??= fetch(`${import.meta.env.BASE_URL}data/wars.json`).then((r) => {
    if (!r.ok) throw new Error(`Failed to load wars: ${r.status}`);
    return r.json();
  });
  return warIndex;
}

const year: ExpressionSpecification = ['global-state', 'year'];
const active: ExpressionSpecification = ['all', ['<=', ['get', 'from'], year], ['>=', ['get', 'to'], year]];

export function isWarActive(p: WarFeatureProps, selectedYear: number): boolean {
  return p.from <= selectedYear && selectedYear <= p.to;
}

export function addWarLayers(map: MapLibreMap, data: string, beforeId?: string) {
  map.addSource(WARS_SOURCE, {
    type: 'geojson',
    data,
    attribution: 'Wars: <a href="https://www.wikidata.org">Wikidata</a> (CC0)',
  });
  const polygons = ['all', ['==', ['geometry-type'], 'Polygon'], active] as FilterSpecification;

  map.addLayer(
    {
      id: 'wars-fill',
      type: 'fill',
      source: WARS_SOURCE,
      filter: polygons,
      paint: { 'fill-color': WAR_RED, 'fill-opacity': 0.07 },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'wars-outline',
      type: 'line',
      source: WARS_SOURCE,
      filter: polygons,
      paint: {
        'line-color': WAR_RED,
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 5, 2],
        'line-dasharray': [4, 2, 1, 2],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: 'wars-label',
      type: 'symbol',
      source: WARS_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'Point'], active] as FilterSpecification,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [PEOPLE_FONT],
        'text-size': ['interpolate', ['linear'], ['get', 'n'], 2, 11, 50, 14, 300, 17],
        'text-max-width': 10,
        'text-padding': 6,
        // Bigger wars win where labels collide.
        'symbol-sort-key': ['-', 0, ['get', 'n']],
      },
      paint: {
        'text-color': WAR_RED,
        'text-halo-color': '#f4ead0',
        'text-halo-width': 1.6,
        'text-opacity': 0.9,
      },
    },
    beforeId,
  );
}
