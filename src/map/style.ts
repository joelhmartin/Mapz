import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from 'maplibre-gl';

export const SOURCE = 'world';

// Old-map palette.
export const INK = '#3b2a1a';
export const PAPER = '#f1e6c8';
const SEA = '#c9d3c4';
const COAST = '#8a7357';
const RIVER = '#9fb3ad';

export const LABEL_FONT = 'IM Fell English SC';

export function timeFilter(year: number): ExpressionSpecification {
  return ['all', ['<=', ['get', 'from'], year], ['>=', ['get', 'to'], year]];
}

export function kindFilter(year: number, kinds: string[]): FilterSpecification {
  return ['all', ['in', ['get', 'kind'], ['literal', kinds]], timeFilter(year)];
}

// Layers whose filter depends on the selected year, and which feature kinds each shows.
export const TIME_LAYERS: Record<string, string[]> = {
  'polities-fill': ['polity'],
  'polities-border': ['polity'],
  'polities-hover': ['polity'],
  'composites-outline': ['empire', 'relation'],
  'polities-label': ['polity'],
};

// Selection is by polity name rather than feature id, so it follows the polity as its
// borders change from one year range to the next.
export function selectedFilter(year: number, key: string | null): FilterSpecification {
  return ['all', ['==', ['get', 'key'], key ?? ''], timeFilter(year)];
}

export function fillOpacity(key: string | null): ExpressionSpecification {
  return ['case', ['==', ['get', 'key'], key ?? ''], 0.8, hovered, 0.72, 0.5];
}

const hovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];

export function buildStyle(year: number, selectedKey: string | null): StyleSpecification {
  const abs = (p: string) => new URL(p, window.location.origin + import.meta.env.BASE_URL).href;

  return {
    version: 8,
    'font-faces': {
      [LABEL_FONT]: abs('fonts/IMFeENsc28P.ttf'),
    },
    sources: {
      [SOURCE]: {
        type: 'vector',
        url: `pmtiles://${abs('data/world.pmtiles')}`,
      },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': SEA } },
      {
        id: 'land',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'land',
        paint: { 'fill-color': PAPER },
      },
      {
        id: 'polities-fill',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'polities',
        filter: kindFilter(year, TIME_LAYERS['polities-fill']),
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': fillOpacity(selectedKey),
        },
      },
      {
        id: 'lakes',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'lakes',
        paint: { 'fill-color': SEA },
      },
      {
        id: 'rivers',
        type: 'line',
        source: SOURCE,
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
        source: SOURCE,
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
        source: SOURCE,
        'source-layer': 'polities',
        filter: kindFilter(year, TIME_LAYERS['polities-border']),
        paint: {
          'line-color': INK,
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1.2],
        },
      },
      {
        // Colonial empires and alliances: dashed outline in the empire's colour, drawn over members.
        id: 'composites-outline',
        type: 'line',
        source: SOURCE,
        'source-layer': 'polities',
        filter: kindFilter(year, TIME_LAYERS['composites-outline']),
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.2, 6, 3],
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.9,
        },
      },
      {
        id: 'polities-hover',
        type: 'line',
        source: SOURCE,
        'source-layer': 'polities',
        filter: kindFilter(year, TIME_LAYERS['polities-hover']),
        paint: {
          'line-color': INK,
          'line-width': ['case', hovered, 2, 0],
        },
      },
      {
        id: 'polities-selected',
        type: 'line',
        source: SOURCE,
        'source-layer': 'polities',
        filter: selectedFilter(year, selectedKey),
        paint: {
          'line-color': INK,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 1.8, 6, 3.2],
        },
      },
      {
        id: 'polities-label',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'labels',
        filter: kindFilter(year, TIME_LAYERS['polities-label']),
        layout: {
          'text-field': ['get', 'name'],
          'text-font': [LABEL_FONT],
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
