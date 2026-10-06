import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

// One source per tile file, so changing one never makes the map re-process the others.
export const BASE = 'base';
export const POLITIES = 'polities';
export const LABELS = 'labels';

// Old-map palette.
export const INK = '#3b2a1a';
export const PAPER = '#f1e6c8';
const SEA = '#c9d3c4';
const COAST = '#8a7357';
const RIVER = '#9fb3ad';

export const LABEL_FONT = 'IM Fell English SC';
export const PEOPLE_FONT = 'IM Fell English Italic';

// The selected year and polity live in the style's global state. Changing the year re-filters
// only the polity and label sources (the basemap is separate and never reloads), and the worker
// only builds geometry for the few polities alive in that year, so re-filtering is cheap.
// Selection and hover are paint-only and cost nothing to change.
const year: ExpressionSpecification = ['global-state', 'year'];
const selected: ExpressionSpecification = ['global-state', 'selected'];
const hovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];

const activeInYear: ExpressionSpecification = ['all', ['<=', ['get', 'from'], year], ['>=', ['get', 'to'], year]];
const isSelected: ExpressionSpecification = ['==', ['get', 'key'], selected];
const kinds = (...k: string[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', k]];
// Borders from the supplementary sources that are rough approximations.
const approximate: ExpressionSpecification = ['in', ['get', 'certainty'], ['literal', ['approximate', 'uncertain']]];

const inYear = (...k: string[]): ExpressionSpecification => ['all', kinds(...k), activeInYear];

export function buildStyle(initialYear: number, selectedKey: string | null): StyleSpecification {
  const abs = (p: string) => new URL(p, window.location.origin + import.meta.env.BASE_URL).href;
  const pmtiles = (file: string) => ({ type: 'vector' as const, url: `pmtiles://${abs(`data/${file}`)}` });

  return {
    version: 8,
    state: {
      year: { default: initialYear },
      selected: { default: selectedKey ?? '' },
    },
    'font-faces': {
      [LABEL_FONT]: abs('fonts/IMFeENsc28P.ttf'),
      [PEOPLE_FONT]: abs('fonts/IMFeENit28P.ttf'),
    },
    sources: {
      [BASE]: pmtiles('basemap.pmtiles'),
      [POLITIES]: pmtiles('polities.pmtiles'),
      [LABELS]: pmtiles('labels.pmtiles'),
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': SEA } },
      {
        id: 'land',
        type: 'fill',
        source: BASE,
        'source-layer': 'land',
        paint: { 'fill-color': PAPER },
      },
      {
        id: 'polities-fill',
        type: 'fill',
        source: POLITIES,
        'source-layer': 'polities',
        filter: inYear('polity', 'people'),
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            isSelected, 0.8,
            hovered, 0.72,
            // Peoples and cultures, as opposed to states, are washed in more lightly.
            ['==', ['get', 'kind'], 'people'], 0.28,
            0.5,
          ],
        },
      },
      {
        id: 'lakes',
        type: 'fill',
        source: BASE,
        'source-layer': 'lakes',
        paint: { 'fill-color': SEA },
      },
      {
        id: 'rivers',
        type: 'line',
        source: BASE,
        'source-layer': 'rivers',
        minzoom: 2,
        paint: {
          'line-color': RIVER,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 6, 1.2],
        },
      },
      {
        id: 'coast',
        type: 'line',
        source: BASE,
        'source-layer': 'land',
        paint: {
          'line-color': COAST,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 6, 1.4],
          'line-opacity': 0.8,
        },
      },
      {
        id: 'polities-border',
        type: 'line',
        source: POLITIES,
        'source-layer': 'polities',
        filter: ['all', inYear('polity', 'people'), ['!', approximate]],
        paint: {
          'line-color': INK,
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1.2],
        },
      },
      {
        // Uncertain borders are drawn as a broken line, like a surveyor's guess on an old chart.
        id: 'polities-border-approx',
        type: 'line',
        source: POLITIES,
        'source-layer': 'polities',
        filter: ['all', inYear('polity', 'people'), approximate],
        paint: {
          'line-color': INK,
          'line-opacity': 0.45,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1.2],
          'line-dasharray': [3, 2],
        },
      },
      {
        // Colonial empires and alliances: dashed outline in the empire's colour, drawn over members.
        id: 'composites-outline',
        type: 'line',
        source: POLITIES,
        'source-layer': 'polities',
        filter: inYear('empire', 'relation'),
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.2, 6, 3],
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.9,
        },
      },
      {
        id: 'polities-highlight',
        type: 'line',
        source: POLITIES,
        'source-layer': 'polities',
        filter: inYear('polity', 'people'),
        paint: {
          'line-color': INK,
          'line-opacity': ['case', ['any', isSelected, hovered], 1, 0],
          'line-width': ['case', isSelected, 2.8, 2],
        },
      },
      {
        id: 'polities-label',
        type: 'symbol',
        source: LABELS,
        'source-layer': 'labels',
        filter: inYear('polity', 'people'),
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['match', ['get', 'kind'], 'people', ['literal', [PEOPLE_FONT]], ['literal', [LABEL_FONT]]],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            1, ['interpolate', ['linear'], ['get', 'area'], 1e5, 9, 1e6, 11, 1e7, 15],
            6, ['interpolate', ['linear'], ['get', 'area'], 1e4, 12, 1e6, 18, 1e7, 24],
          ],
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
          'symbol-sort-key': ['-', 0, ['get', 'area']],
          'text-padding': 4,
        },
        paint: {
          'text-color': INK,
          'text-halo-color': PAPER,
          'text-halo-width': 1.4,
          'text-halo-blur': 0.5,
        },
      },
    ],
  };
}
