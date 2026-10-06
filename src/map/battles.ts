import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';

export const BATTLES_SOURCE = 'battles';
export const BATTLE_ICON = 'crossed-swords';

// How long a battle stays on the map after it happens, fading as it ages.
export const BATTLE_TRAIL_YEARS = 20;

const FRESH = '#8c2f1b';
const OLD = '#3b2a1a';

export interface BattleProps {
  qid: string;
  name: string;
  year: number;
  date: string;
  war?: string;
  sides?: string;
  article?: string;
}

export function battleFilter(year: number): FilterSpecification {
  return ['all', ['<=', ['get', 'year'], year], ['>', ['get', 'year'], year - BATTLE_TRAIL_YEARS]];
}

export function freshFilter(year: number): FilterSpecification {
  return ['==', ['get', 'year'], year];
}

const age = (year: number): ExpressionSpecification => ['-', year, ['get', 'year']];

export function battleOpacity(year: number): ExpressionSpecification {
  return ['interpolate', ['linear'], age(year), 0, 1, BATTLE_TRAIL_YEARS, 0.3];
}

export function battleColor(year: number): ExpressionSpecification {
  return ['interpolate', ['linear'], age(year), 0, FRESH, 6, OLD];
}

export function battleSize(year: number): ExpressionSpecification {
  return ['interpolate', ['linear'], age(year), 0, 0.85, 4, 0.6, BATTLE_TRAIL_YEARS, 0.5];
}

// Crossed swords, drawn once onto a canvas and registered as an SDF icon so it can be tinted.
function drawSwords(size: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';

  const sword = (flip: boolean) => {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
    const s = size / 32;
    // blade
    ctx.beginPath();
    ctx.moveTo(0, -13 * s);
    ctx.lineTo(1.6 * s, -10.5 * s);
    ctx.lineTo(1.6 * s, 6 * s);
    ctx.lineTo(-1.6 * s, 6 * s);
    ctx.lineTo(-1.6 * s, -10.5 * s);
    ctx.closePath();
    ctx.fill();
    // guard
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(-5.5 * s, 6.5 * s);
    ctx.lineTo(5.5 * s, 6.5 * s);
    ctx.stroke();
    // grip and pommel
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, 7 * s);
    ctx.lineTo(0, 11.5 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 12.8 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  sword(false);
  sword(true);
  return ctx.getImageData(0, 0, size, size);
}

export function addBattleLayers(map: MapLibreMap, year: number, data: string) {
  map.addImage(BATTLE_ICON, drawSwords(64), { sdf: true, pixelRatio: 2 });
  map.addSource(BATTLES_SOURCE, { type: 'geojson', data });

  // A ring that marks battles fought in exactly the selected year.
  map.addLayer({
    id: 'battles-fresh',
    type: 'circle',
    source: BATTLES_SOURCE,
    filter: freshFilter(year),
    paint: {
      'circle-radius': 15,
      'circle-color': FRESH,
      'circle-opacity': 0.15,
      'circle-stroke-color': FRESH,
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0.7,
    },
  });

  map.addLayer({
    id: 'battles',
    type: 'symbol',
    source: BATTLES_SOURCE,
    filter: battleFilter(year),
    layout: {
      'icon-image': BATTLE_ICON,
      'icon-size': battleSize(year),
      'icon-allow-overlap': ['step', ['zoom'], false, 4, true],
      'icon-padding': 0,
      // Newest battles win when icons collide.
      'symbol-sort-key': ['-', 0, ['get', 'year']],
    },
    paint: {
      'icon-color': battleColor(year),
      'icon-halo-color': '#f4ead0',
      'icon-halo-width': 1.5,
      'icon-opacity': battleOpacity(year),
    },
  });
}

export function updateBattleLayers(map: MapLibreMap, year: number, visible: boolean) {
  if (!map.getLayer('battles')) return;
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty('battles', 'visibility', visibility);
  map.setLayoutProperty('battles-fresh', 'visibility', visibility);
  map.setFilter('battles', battleFilter(year));
  map.setFilter('battles-fresh', freshFilter(year));
  map.setLayoutProperty('battles', 'icon-size', battleSize(year));
  map.setPaintProperty('battles', 'icon-color', battleColor(year));
  map.setPaintProperty('battles', 'icon-opacity', battleOpacity(year));
}
