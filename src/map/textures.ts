import type { Map as MapLibreMap } from 'maplibre-gl';

// Paper-and-ink textures drawn once on a canvas and registered as map images when the style
// first asks for them. They are static, so they cost nothing as the year changes.

export const WASH = 'watercolour-wash';
export const SEA_HATCH = 'sea-hatch';

// Small seeded generator so the textures look the same on every visit.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

// Draw a blob at (x, y) and its copies across the tile edges, so the pattern tiles seamlessly.
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      if (x + dx + r > 0 && x + dx - r < size && y + dy + r > 0 && y + dy - r < size) draw(x + dx, y + dy);
    }
  }
}

// Translucent mottling laid over the territory fills: pigment pooling darker in some places and
// thinning to paper in others, plus a fine granulation.
function wash(size = 512): ImageData {
  const [, ctx] = canvas(size);
  const rand = rng(7);
  for (let i = 0; i < 140; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 90;
    const dark = rand() < 0.5;
    const alpha = 0.05 + rand() * 0.09;
    wrapped(size, x, y, r, (cx, cy) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, dark ? `rgba(70, 45, 20, ${alpha})` : `rgba(255, 250, 235, ${alpha * 1.3})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(60, 40, 20, ${0.04 + rand() * 0.08})`;
    ctx.fillRect(rand() * size, rand() * size, 1, 1);
  }
  return ctx.getImageData(0, 0, size, size);
}

// The sea: the base colour with fine engraved strokes, broken and slightly wavering like a
// copper-plate chart's hatching.
function seaHatch(base: string, size = 256): ImageData {
  const [, ctx] = canvas(size);
  const rand = rng(11);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(70, 95, 90, 0.16)';
  ctx.lineWidth = 0.8;
  for (let y = 4; y < size; y += 8) {
    let x = 0;
    while (x < size) {
      const len = 20 + rand() * 70;
      if (rand() < 0.8) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        // Waver gently; the stroke ends where it began vertically so rows line up across tiles.
        const end = Math.min(size, x + len);
        for (let px = x; px <= end; px += 4) ctx.lineTo(px, y + Math.sin((px / size) * Math.PI * 6) * 0.8);
        ctx.stroke();
      }
      x += len + 4 + rand() * 14;
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

export function registerTextures(map: MapLibreMap, seaColour: string) {
  const make: Record<string, () => ImageData> = {
    [WASH]: () => wash(),
    [SEA_HATCH]: () => seaHatch(seaColour),
  };
  const add = (id: string) => {
    if (!map.hasImage(id)) map.addImage(id, make[id](), { pixelRatio: 2 });
  };
  // Added up front so no tile is laid out before its pattern exists, and again whenever a style
  // change drops them.
  for (const id of Object.keys(make)) add(id);
  map.on('styleimagemissing', (e) => {
    if (make[e.id]) add(e.id);
  });
}
