import { useEffect, useRef } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  GlobeControl,
  addProtocol,
  setWorkerUrl,
} from 'maplibre-gl';
import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module by default, which breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { POLITY_FILL_LAYERS, SEA, buildStyle, eraOf, eraSource, eraYear } from './style';
import { registerTextures } from './textures';
import { addBattleLayers, isBattleVisible, setBattlesVisible, type BattleProps } from './battles';
import {
  MOVEMENT_LAYERS,
  addMovementLayers,
  isMovementVisible,
  type MovementSegmentProps,
} from './movements';
import { WAR_HIT_LAYERS, WAR_LAYERS, addWarLayers, isWarActive, type WarFeatureProps } from './wars';
import type { PolityFeatureProps } from '../lib/polities';
import { globeFromUrl, viewFromUrl, writeGlobeToUrl, writeViewToUrl } from '../lib/years';

setWorkerUrl(workerUrl);
addProtocol('pmtiles', new Protocol().tile);

export type MapTarget =
  | { type: 'polity'; props: PolityFeatureProps }
  | { type: 'battle'; props: BattleProps }
  | { type: 'movement'; props: MovementSegmentProps }
  | { type: 'war'; props: WarFeatureProps };

// A place for the map to fly to; `key` makes repeat requests for the same spot still fire.
export interface MapFocus {
  center: [number, number];
  // Leave out to keep the current zoom (but at least close enough to see the place).
  zoom?: number;
  // Screen space covered by a panel, so the place is centred in what remains visible.
  padding?: { left?: number; bottom?: number };
  key: number;
}

export interface HoverInfo {
  target: MapTarget;
  x: number;
  y: number;
}

interface Props {
  year: number;
  selectedKey: string | null;
  showBattles: boolean;
  showMovements: boolean;
  showWars: boolean;
  focus: MapFocus | null;
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

function setLayersVisible(map: MapLibreMap, ids: string[], visible: boolean) {
  const visibility = visible ? 'visible' : 'none';
  for (const id of ids) {
    if (map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== visibility) {
      map.setLayoutProperty(id, 'visibility', visibility);
    }
  }
}

// Battles, then movement routes, sit on top of territories, so they take priority under the cursor.
function targetAt(
  map: MapLibreMap,
  e: MapMouseEvent,
  {
    year,
    showBattles,
    showMovements,
    showWars,
  }: { year: number; showBattles: boolean; showMovements: boolean; showWars: boolean },
): { target: MapTarget; polityId?: number } | null {
  const box: [[number, number], [number, number]] = [
    [e.point.x - 6, e.point.y - 6],
    [e.point.x + 6, e.point.y + 6],
  ];
  if (showBattles && map.getLayer('battles')) {
    const battles = map
      .queryRenderedFeatures(box, { layers: ['battles'] })
      .filter((f) => isBattleVisible(f.properties.year, year));
    if (battles.length) {
      const newest = battles.reduce((a, b) => (b.properties.year > a.properties.year ? b : a));
      return { target: { type: 'battle', props: newest.properties as BattleProps } };
    }
  }
  if (showMovements && map.getLayer('movements-head')) {
    const routes = map
      .queryRenderedFeatures(box, { layers: MOVEMENT_LAYERS })
      .filter((f) => isMovementVisible(f.properties as MovementSegmentProps, year));
    if (routes.length) return { target: { type: 'movement', props: routes[0].properties as MovementSegmentProps } };
  }
  if (showWars && map.getLayer('wars-label')) {
    const wars = map
      .queryRenderedFeatures(box, { layers: WAR_HIT_LAYERS })
      .filter((f) => isWarActive(f.properties as WarFeatureProps, year));
    if (wars.length) return { target: { type: 'war', props: wars[0].properties as WarFeatureProps } };
  }
  const f = pickPolity(map.queryRenderedFeatures(e.point, { layers: POLITY_FILL_LAYERS }), year);
  if (!f) return null;
  return { target: { type: 'polity', props: f.properties as PolityFeatureProps }, polityId: f.id as number };
}

export function MapView({ year, selectedKey, showBattles, showMovements, showWars, focus, onHover, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverId = useRef<number | null>(null);
  const state = useRef({ year, selectedKey, showBattles, showMovements, showWars });
  state.current = { year, selectedKey, showBattles, showMovements, showWars };
  const callbacks = useRef({ onHover, onSelect });
  callbacks.current = { onHover, onSelect };

  useEffect(() => {
    const view = viewFromUrl();
    const map = new MapLibreMap({
      container: container.current!,
      style: buildStyle(state.current.year, state.current.selectedKey, globeFromUrl()),
      center: view?.center ?? [15, 8],
      zoom: view?.zoom ?? 2,
      minZoom: 1,
      maxZoom: 9,
      // Endless east–west scrolling: the world repeats sideways. (It cannot repeat north–south;
      // the globe view is the seamless way to roll over the poles.)
      renderWorldCopies: true,
      attributionControl: false,
      // Label fade-in keeps the map repainting after every year change; snap instead.
      fadeDuration: 0,
      // North stays up, as the compass rose says.
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    registerTextures(map, SEA);
    map.on('error', (e) => console.error('Map error:', e.error));
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new GlobeControl(), 'top-right');
    map.on('projectiontransition', (e) => writeGlobeToUrl(e.newProjection !== 'mercator'));
    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    // Overlays load after the style: war theatres, then routes, then battles on top.
    map.on('load', async () => {
      const dataUrl = async (file: string) => {
        const url = `${import.meta.env.BASE_URL}data/${file}`;
        const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
        return res?.ok && mapRef.current ? new URL(url, window.location.href).href : null;
      };
      const wars = await dataUrl('wars.geojson');
      if (wars) {
        addWarLayers(map, wars);
        setLayersVisible(map, WAR_LAYERS, state.current.showWars);
      }
      const movements = await dataUrl('migrations.geojson');
      if (movements) {
        addMovementLayers(map, movements);
        setLayersVisible(map, MOVEMENT_LAYERS, state.current.showMovements);
      }
      const battles = await dataUrl('battles.geojson');
      if (battles) {
        addBattleLayers(map, battles);
        setBattlesVisible(map, state.current.showBattles);
      }
      // The compact credits control opens expanded; on a phone that covers the map. Collapse it
      // to its ⓘ button once every source's credit is in (tapping it shows them).
      if (window.matchMedia('(max-width: 640px)').matches) {
        map.once('idle', () =>
          map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'),
        );
      }
    });
    // Catch up on any change made while the style was loading.
    map.once('load', () => {
      ready.current = true;
      sync.current();
    });

    // Hover state lives on the era slice shown at the time, which may differ from the next one.
    let hoverSource = '';
    const setHover = (id: number | null) => {
      const source = eraSource(eraOf(state.current.year));
      if (hoverId.current === id && hoverSource === source) return;
      if (hoverId.current !== null) {
        map.setFeatureState({ source: hoverSource, sourceLayer: 'polities', id: hoverId.current }, { hover: false });
      }
      hoverId.current = id;
      hoverSource = source;
      if (id !== null) map.setFeatureState({ source, sourceLayer: 'polities', id }, { hover: true });
    };

    const at = (e: MapMouseEvent) => targetAt(map, e, state.current);
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
      // Wrap so a long scroll east or west keeps the URL in -180…180.
      const w = c.wrap();
      writeViewToUrl({ center: [w.lng, w.lat], zoom: map.getZoom() });
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
    const { year, selectedKey, showBattles, showMovements, showWars } = state.current;
    if (applied.current.year !== year) {
      // Only the active era's slice reloads: set its year first, then switch to it if needed.
      const era = eraOf(year);
      map.setGlobalStateProperty(eraYear(era), year);
      map.setGlobalStateProperty('era', era);
      map.setGlobalStateProperty('year', year);
    }
    if (applied.current.selectedKey !== selectedKey) map.setGlobalStateProperty('selected', selectedKey ?? '');
    setBattlesVisible(map, showBattles);
    setLayersVisible(map, MOVEMENT_LAYERS, showMovements);
    setLayersVisible(map, WAR_LAYERS, showWars);
    applied.current = { year, selectedKey };
  };

  useEffect(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(() => sync.current());
  }, [year, selectedKey, showBattles, showMovements, showWars]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // No focus (a tour just ended): drop any padding it left on the camera.
    if (!focus) return void map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    map.flyTo({
      center: focus.center,
      zoom: focus.zoom ?? Math.max(map.getZoom(), 4.5),
      padding: { top: 0, right: 0, left: focus.padding?.left ?? 0, bottom: focus.padding?.bottom ?? 0 },
      duration: 1600,
      essential: true,
    });
  }, [focus]);

  return <div ref={container} className="map" />;
}
