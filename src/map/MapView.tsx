import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, AttributionControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module by default, which breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { POLITIES, buildStyle } from './style';
import { addBattleLayers, isBattleVisible, setBattlesVisible, type BattleProps } from './battles';
import type { PolityFeatureProps } from '../lib/polities';
import { viewFromUrl, writeViewToUrl } from '../lib/years';

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
// Features outside the year are still rendered (transparently), so they are skipped here.
function pickPolity(features: MapGeoJSONFeature[], year: number): MapGeoJSONFeature | undefined {
  let best: MapGeoJSONFeature | undefined;
  for (const f of features) {
    const p = f.properties as PolityFeatureProps;
    if (p.from > year || p.to < year) continue;
    if (!best || p.area < (best.properties.area as number)) best = f;
  }
  return best;
}

// Battles sit on top of territories, so they take priority under the cursor.
function targetAt(
  map: MapLibreMap,
  e: MapMouseEvent,
  year: number,
  showBattles: boolean,
): { target: MapTarget; polityId?: number } | null {
  if (showBattles && map.getLayer('battles')) {
    const box: [[number, number], [number, number]] = [
      [e.point.x - 6, e.point.y - 6],
      [e.point.x + 6, e.point.y + 6],
    ];
    const battles = map
      .queryRenderedFeatures(box, { layers: ['battles'] })
      .filter((f) => isBattleVisible(f.properties.year, year));
    if (battles.length) {
      const newest = battles.reduce((a, b) => (b.properties.year > a.properties.year ? b : a));
      return { target: { type: 'battle', props: newest.properties as BattleProps } };
    }
  }
  const f = pickPolity(map.queryRenderedFeatures(e.point, { layers: ['polities-fill'] }), year);
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
    const view = viewFromUrl();
    const map = new MapLibreMap({
      container: container.current!,
      style: buildStyle(state.current.year, state.current.selectedKey),
      center: view?.center ?? [15, 8],
      zoom: view?.zoom ?? 2,
      minZoom: 1,
      maxZoom: 9,
      renderWorldCopies: false,
      attributionControl: false,
      // Label fade-in keeps the map repainting after every year change; snap instead.
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.on('error', (e) => console.error('Map error:', e.error));
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', async () => {
      const url = `${import.meta.env.BASE_URL}data/battles.geojson`;
      const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (!res?.ok || !mapRef.current) return;
      addBattleLayers(map, new URL(url, window.location.href).href);
      setBattlesVisible(map, state.current.showBattles);
    });
    // Catch up on any change made while the style was loading.
    map.once('load', () => {
      ready.current = true;
      sync.current();
    });

    const setHover = (id: number | null) => {
      if (hoverId.current === id) return;
      if (hoverId.current !== null) {
        map.setFeatureState({ source: POLITIES, sourceLayer: 'polities', id: hoverId.current }, { hover: false });
      }
      hoverId.current = id;
      if (id !== null) map.setFeatureState({ source: POLITIES, sourceLayer: 'polities', id }, { hover: true });
    };

    const at = (e: MapMouseEvent) => targetAt(map, e, state.current.year, state.current.showBattles);
    // Hit-testing polygons is costly, so do it at most once per frame for the latest position.
    let pendingMove: MapMouseEvent | null = null;
    const onMove = (e: MapMouseEvent) => {
      if (pendingMove === null) {
        requestAnimationFrame(() => {
          const ev = pendingMove!;
          pendingMove = null;
          if (!mapRef.current) return;
          const hit = at(ev);
          setHover(hit?.polityId ?? null);
          map.getCanvas().style.cursor = hit ? 'pointer' : '';
          callbacks.current.onHover(hit ? { target: hit.target, x: ev.point.x, y: ev.point.y } : null);
        });
      }
      pendingMove = e;
    };

    map.on('moveend', () => {
      const c = map.getCenter();
      writeViewToUrl({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    map.on('mousemove', onMove);
    map.on('click', (e) => callbacks.current.onSelect(at(e)?.target ?? null));
    map.getCanvas().addEventListener('mouseleave', () => {
      setHover(null);
      callbacks.current.onHover(null);
    });

    return () => {
      ready.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push the year and selection into the map at most once per frame, however fast the slider
  // moves.
  const frame = useRef<number | null>(null);
  const ready = useRef(false);
  const applied = useRef({ year: NaN, selectedKey: null as string | null });
  const sync = useRef(() => {});
  sync.current = () => {
    frame.current = null;
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const { year, selectedKey, showBattles } = state.current;
    if (applied.current.year !== year) map.setGlobalStateProperty('year', year);
    if (applied.current.selectedKey !== selectedKey) map.setGlobalStateProperty('selected', selectedKey ?? '');
    setBattlesVisible(map, showBattles);
    applied.current = { year, selectedKey };
  };

  useEffect(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(() => sync.current());
  }, [year, selectedKey, showBattles]);

  return <div ref={container} className="map" />;
}
