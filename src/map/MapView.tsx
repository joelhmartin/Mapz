import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, AttributionControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module by default, which breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { SOURCE, TIME_LAYERS, buildStyle, fillOpacity, kindFilter, selectedFilter } from './style';
import { addBattleLayers, updateBattleLayers, type BattleProps } from './battles';
import type { PolityFeatureProps } from '../lib/polities';

setWorkerUrl(workerUrl);
addProtocol('pmtiles', new Protocol().tile);

export type MapTarget = { type: 'polity'; props: PolityFeatureProps } | { type: 'battle'; props: BattleProps };

export interface HoverInfo {
  target: MapTarget;
  x: number;
  y: number;
}

interface Props {
  year: number;
  selectedKey: string | null;
  showBattles: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (target: MapTarget | null) => void;
}

// Where polities overlap (rival claims, vassals), prefer the smallest: it is the most specific.
function pickPolity(features: MapGeoJSONFeature[]): MapGeoJSONFeature | undefined {
  let best: MapGeoJSONFeature | undefined;
  for (const f of features) {
    if (!best || (f.properties.area as number) < (best.properties.area as number)) best = f;
  }
  return best;
}

// Battles sit on top of territories, so they take priority under the cursor.
function targetAt(map: MapLibreMap, e: MapMouseEvent): { target: MapTarget; polityId?: number } | null {
  if (map.getLayer('battles')) {
    const box: [[number, number], [number, number]] = [
      [e.point.x - 6, e.point.y - 6],
      [e.point.x + 6, e.point.y + 6],
    ];
    const battles = map.queryRenderedFeatures(box, { layers: ['battles'] });
    if (battles.length) {
      const newest = battles.reduce((a, b) => (b.properties.year > a.properties.year ? b : a));
      return { target: { type: 'battle', props: newest.properties as BattleProps } };
    }
  }
  const f = pickPolity(map.queryRenderedFeatures(e.point, { layers: ['polities-fill'] }));
  if (!f) return null;
  return { target: { type: 'polity', props: f.properties as PolityFeatureProps }, polityId: f.id as number };
}

export function MapView({ year, selectedKey, showBattles, onHover, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverId = useRef<number | null>(null);
  const state = useRef({ year, selectedKey, showBattles });
  state.current = { year, selectedKey, showBattles };
  const callbacks = useRef({ onHover, onSelect });
  callbacks.current = { onHover, onSelect };

  useEffect(() => {
    const map = new MapLibreMap({
      container: container.current!,
      style: buildStyle(state.current.year, state.current.selectedKey),
      center: [15, 8],
      zoom: 2,
      minZoom: 1,
      maxZoom: 9,
      renderWorldCopies: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('error', (e) => console.error('Map error:', e.error));
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', async () => {
      const url = `${import.meta.env.BASE_URL}data/battles.geojson`;
      const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (!res?.ok || !mapRef.current) return;
      addBattleLayers(map, state.current.year, new URL(url, window.location.href).href);
      updateBattleLayers(map, state.current.year, state.current.showBattles);
    });

    const setHover = (id: number | null) => {
      if (hoverId.current === id) return;
      if (hoverId.current !== null) {
        map.setFeatureState({ source: SOURCE, sourceLayer: 'polities', id: hoverId.current }, { hover: false });
      }
      hoverId.current = id;
      if (id !== null) map.setFeatureState({ source: SOURCE, sourceLayer: 'polities', id }, { hover: true });
    };

    const onMove = (e: MapMouseEvent) => {
      const hit = targetAt(map, e);
      setHover(hit?.polityId ?? null);
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
      callbacks.current.onHover(hit ? { target: hit.target, x: e.point.x, y: e.point.y } : null);
    };

    map.on('mousemove', onMove);
    map.on('click', (e) => callbacks.current.onSelect(targetAt(map, e)?.target ?? null));
    map.getCanvas().addEventListener('mouseleave', () => {
      setHover(null);
      callbacks.current.onHover(null);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-filter every time-dependent layer when the year or selection changes; no tiles are re-fetched.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [layer, kinds] of Object.entries(TIME_LAYERS)) {
      if (map.getLayer(layer)) map.setFilter(layer, kindFilter(year, kinds));
    }
    if (map.getLayer('polities-selected')) {
      map.setFilter('polities-selected', selectedFilter(year, selectedKey));
      map.setPaintProperty('polities-fill', 'fill-opacity', fillOpacity(selectedKey));
    }
    updateBattleLayers(map, year, showBattles);
  }, [year, selectedKey, showBattles]);

  return <div ref={container} className="map" />;
}
