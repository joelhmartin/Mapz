import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { LABEL_FONT } from './style';

export const MOVEMENTS_SOURCE = 'movements';
export const MOVEMENT_LAYERS = ['movements-land', 'movements-sea', 'movements-head'];
const ARROW_ICON = 'movement-arrow';

// How long a finished route stays on the map, fading, after it ends.
export const MOVEMENT_TRAIL_YEARS = 40;

export type MovementKind = 'migration' | 'voyage' | 'campaign' | 'removal';

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  migration: 'migration',
  voyage: 'voyage',
  campaign: 'military campaign',
  removal: 'forced removal',
};

export const MOVEMENT_COLORS: Record<MovementKind, string> = {
  migration: '#2f6f62',
  voyage: '#2d5d8a',
  campaign: '#8c2f1b',
  removal: '#5a3d7a',
};

// Properties on each route segment (see scripts/build-migrations.mjs).
export interface MovementSegmentProps {
  id: string;
  name: string;
  kind: MovementKind;
  y0: number;
  y1: number;
  to: number;
  last: boolean;
  head?: boolean;
  rotate?: number;
}

export interface MovementInfo {
  name: string;
  kind: MovementKind;
  from: number;
  to: number;
  certainty: string;
  wikipedia: string | null;
  description: string;
  itinerary: { year: number; place: string }[];
}

export type MovementIndex = Record<string, MovementInfo>;

export async function loadMovementIndex(): Promise<MovementIndex> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/migrations.json`);
  if (!res.ok) throw new Error(`Failed to load movements: ${res.status}`);
  return res.json();
}

// Segments are filtered by the style's global `year`: a route shows the part travelled so far,
// and lingers for a while after it ends.
const year: ExpressionSpecification = ['global-state', 'year'];
const travelled: ExpressionSpecification = [
  'all',
  ['<=', ['get', 'y0'], year],
  ['<=', year, ['+', ['get', 'to'], MOVEMENT_TRAIL_YEARS]],
];
const kindIs = (...k: MovementKind[]): ExpressionSpecification => ['in', ['get', 'kind'], ['literal', k]];
// The arrowhead sits on the segment being travelled now, or on the final one once the route ends.
const front: ExpressionSpecification = [
  'any',
  ['all', ['<=', ['get', 'y0'], year], ['<', year, ['get', 'y1']]],
  ['all', ['get', 'last'], ['>=', year, ['get', 'to']], ['<=', year, ['+', ['get', 'to'], MOVEMENT_TRAIL_YEARS]]],
];

export function isMovementVisible(p: MovementSegmentProps, selectedYear: number): boolean {
  return p.y0 <= selectedYear && selectedYear <= p.to + MOVEMENT_TRAIL_YEARS;
}

const color: ExpressionSpecification = [
  'match',
  ['get', 'kind'],
  'voyage', MOVEMENT_COLORS.voyage,
  'campaign', MOVEMENT_COLORS.campaign,
  'removal', MOVEMENT_COLORS.removal,
  MOVEMENT_COLORS.migration,
];

// Full strength while under way, then fading after it ends.
const opacity: ExpressionSpecification = [
  'interpolate', ['linear'], ['-', year, ['get', 'to']],
  0, 0.9,
  MOVEMENT_TRAIL_YEARS, 0.25,
];

const width: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 1, 1.6, 5, 3.5];

// A filled arrowhead pointing along +x, registered as an SDF icon so it can be tinted per kind.
function drawArrow(size: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(size * 0.92, size / 2);
  ctx.lineTo(size * 0.12, size * 0.14);
  ctx.lineTo(size * 0.32, size / 2);
  ctx.lineTo(size * 0.12, size * 0.86);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

export function addMovementLayers(map: MapLibreMap, data: string, beforeId?: string) {
  map.addImage(ARROW_ICON, drawArrow(48), { sdf: true, pixelRatio: 2 });
  map.addSource(MOVEMENTS_SOURCE, { type: 'geojson', data });

  const line = (id: string, kinds: MovementKind[], dashed: boolean) =>
    map.addLayer(
      {
        id,
        type: 'line',
        source: MOVEMENTS_SOURCE,
        filter: ['all', ['==', ['geometry-type'], 'LineString'], kindIs(...kinds), travelled] as FilterSpecification,
        // Butt caps: segments meet end to end, and overlapping round caps would show as beads
        // once the route fades.
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': color,
          'line-width': width,
          'line-opacity': opacity,
          // Sea crossings are drawn as a dotted course, like a sailing track on an old chart.
          ...(dashed ? { 'line-dasharray': [2, 1.6] } : {}),
        },
      },
      beforeId,
    );
  line('movements-land', ['migration', 'campaign', 'removal'], false);
  line('movements-sea', ['voyage'], true);

  map.addLayer(
    {
      id: 'movements-head',
      type: 'symbol',
      source: MOVEMENTS_SOURCE,
      filter: ['all', ['==', ['geometry-type'], 'Point'], front] as FilterSpecification,
      layout: {
        'icon-image': ARROW_ICON,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 5, 0.9],
        'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'name'],
        'text-font': [LABEL_FONT],
        'text-size': 11,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
        'text-max-width': 10,
        'text-optional': true,
      },
      paint: {
        'icon-color': color,
        'icon-opacity': opacity,
        'icon-halo-color': '#f4ead0',
        'icon-halo-width': 1,
        'text-color': color,
        'text-halo-color': '#f4ead0',
        'text-halo-width': 1.4,
        'text-opacity': opacity,
      },
    },
    beforeId,
  );
}
