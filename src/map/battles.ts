import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';

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

// Battles are filtered by the style's global `year`, so a year change only re-lays out the
// battles source in the worker and only the battles in the trail are ever drawn.
const year: ExpressionSpecification = ['global-state', 'year'];
const age: ExpressionSpecification = ['-', year, ['get', 'year']];
const inTrail: ExpressionSpecification = ['all', ['>=', age, 0], ['<', age, BATTLE_TRAIL_YEARS]];

export function isBattleVisible(battleYear: number, selectedYear: number): boolean {
  const a = selectedYear - battleYear;
  return a >= 0 && a < BATTLE_TRAIL_YEARS;
}

const opacity: ExpressionSpecification = ['interpolate', ['linear'], age, 0, 1, BATTLE_TRAIL_YEARS, 0.3];
const color: ExpressionSpecification = ['interpolate', ['linear'], ['max', age, 0], 0, FRESH, 6, OLD];
const fresh: ExpressionSpecification = ['==', age, 0];

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

export function addBattleLayers(map: MapLibreMap, data: string) {
  map.addImage(BATTLE_ICON, drawSwords(64), { sdf: true, pixelRatio: 2 });
  map.addSource(BATTLES_SOURCE, { type: 'geojson', data });

  // A ring that marks battles fought in exactly the selected year.
  map.addLayer({
    id: 'battles-fresh',
    type: 'circle',
    source: BATTLES_SOURCE,
    filter: fresh,
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
    filter: inTrail,
    layout: {
      'icon-image': BATTLE_ICON,
      'icon-size': ['interpolate', ['linear'], age, 0, 0.85, 4, 0.6, BATTLE_TRAIL_YEARS, 0.5],
      'icon-allow-overlap': ['step', ['zoom'], false, 4, true],
      'icon-padding': 0,
      // Newest battles win when icons collide.
      'symbol-sort-key': ['-', 0, ['get', 'year']],
    },
    paint: {
      'icon-color': color,
      'icon-halo-color': '#f4ead0',
      'icon-halo-width': 1.5,
      'icon-opacity': opacity,
    },
  });
}

export function setBattlesVisible(map: MapLibreMap, visible: boolean) {
  for (const id of ['battles', 'battles-fresh']) {
    if (!map.getLayer(id)) continue;
    const visibility = visible ? 'visible' : 'none';
    if (map.getLayoutProperty(id, 'visibility') !== visibility) map.setLayoutProperty(id, 'visibility', visibility);
  }
}
