import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapView, type HoverInfo } from './map/MapView';
import { Timeline } from './components/Timeline';
import { HoverCard } from './components/HoverCard';
import { InfoPanel } from './components/InfoPanel';
import { activeCount, loadPolityIndex, type PolityIndex } from './lib/polities';
import { writeYearToUrl, yearFromUrl } from './lib/years';

export function App() {
  const [year, setYear] = useState(yearFromUrl);
  const [index, setIndex] = useState<PolityIndex | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    loadPolityIndex().then(setIndex).catch(console.error);
  }, []);

  useEffect(() => {
    // Debounced so playing the timeline doesn't spam the history API.
    const t = window.setTimeout(() => writeYearToUrl(year), 300);
    return () => window.clearTimeout(t);
  }, [year]);

  const count = useMemo(() => (index ? activeCount(index, year) : null), [index, year]);

  const onSelect = useCallback((props: { key: string } | null) => setSelectedKey(props?.key ?? null), []);

  return (
    <div className="app">
      <MapView year={year} selectedKey={selectedKey} onHover={setHover} onSelect={onSelect} />
      <div className="vignette" aria-hidden />
      <header className="title panel">
        <h1>Mapz</h1>
        <p>Powers of the world through time</p>
      </header>
      {hover && hover.props.key !== selectedKey && <HoverCard hover={hover} index={index} />}
      {selectedKey && (
        <InfoPanel
          polityKey={selectedKey}
          index={index}
          onClose={() => setSelectedKey(null)}
          onJumpToYear={setYear}
          onSelectKey={setSelectedKey}
        />
      )}
      <Timeline year={year} activeCount={count} onChange={setYear} />
    </div>
  );
}
