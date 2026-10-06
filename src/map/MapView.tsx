import { useEffect, useRef } from 'react';
import { Map as MapLibreMap, NavigationControl, AttributionControl, addProtocol, setWorkerUrl } from 'maplibre-gl';
import type { MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre locates its worker next to its own module by default, which breaks once bundled.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { SOURCE, TIME_LAYERS, buildStyle, fillOpacity, kindFilter, selectedFilter } from './style';
import type { PolityFeatureProps } from '../lib/polities';

setWorkerUrl(workerUrl);
addProtocol('pmtiles', new Protocol().tile);

export interface HoverInfo {
  props: PolityFeatureProps;
  x: number;
  y: number;
}

interface Props {
  year: number;
  selectedKey: string | null;
  onHover: (info: HoverInfo | null) => void;
  onSelect: (props: PolityFeatureProps | null) => void;
}

// Where polities overlap (rival claims, vassals), prefer the smallest: it is the most specific.
function pickFeature(features: MapGeoJSONFeature[]): MapGeoJSONFeature | undefined {
  let best: MapGeoJSONFeature | undefined;
  for (const f of features) {
    if (!best || (f.properties.area as number) < (best.properties.area as number)) best = f;
  }
  return best;
}

export function MapView({ year, selectedKey, onHover, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverId = useRef<number | null>(null);
  const yearRef = useRef(year);
  const selectedRef = useRef(selectedKey);
  const callbacks = useRef({ onHover, onSelect });
  callbacks.current = { onHover, onSelect };

  useEffect(() => {
    const map = new MapLibreMap({
      container: container.current!,
      style: buildStyle(yearRef.current, selectedRef.current),
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

    const setHover = (id: number | null) => {
      if (hoverId.current === id) return;
      if (hoverId.current !== null) {
        map.setFeatureState({ source: SOURCE, sourceLayer: 'polities', id: hoverId.current }, { hover: false });
      }
      hoverId.current = id;
      if (id !== null) map.setFeatureState({ source: SOURCE, sourceLayer: 'polities', id }, { hover: true });
    };

    const onMove = (e: MapMouseEvent) => {
      const f = pickFeature(map.queryRenderedFeatures(e.point, { layers: ['polities-fill'] }));
      if (!f) {
        setHover(null);
        map.getCanvas().style.cursor = '';
        callbacks.current.onHover(null);
        return;
      }
      setHover(f.id as number);
      map.getCanvas().style.cursor = 'pointer';
      callbacks.current.onHover({ props: f.properties as PolityFeatureProps, x: e.point.x, y: e.point.y });
    };

    const onClick = (e: MapMouseEvent) => {
      const f = pickFeature(map.queryRenderedFeatures(e.point, { layers: ['polities-fill'] }));
      callbacks.current.onSelect(f ? (f.properties as PolityFeatureProps) : null);
    };

    map.on('mousemove', onMove);
    map.on('click', onClick);
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
    yearRef.current = year;
    selectedRef.current = selectedKey;
    const map = mapRef.current;
    if (!map) return;
    for (const [layer, kinds] of Object.entries(TIME_LAYERS)) {
      if (map.getLayer(layer)) map.setFilter(layer, kindFilter(year, kinds));
    }
    if (map.getLayer('polities-selected')) {
      map.setFilter('polities-selected', selectedFilter(year, selectedKey));
      map.setPaintProperty('polities-fill', 'fill-opacity', fillOpacity(selectedKey));
    }
  }, [year, selectedKey]);

  return <div ref={container} className="map" />;
}
