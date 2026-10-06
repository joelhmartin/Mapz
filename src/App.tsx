import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapView, type HoverInfo, type MapTarget } from './map/MapView';
import type { BattleProps } from './map/battles';
import { Timeline } from './components/Timeline';
import { HoverCard } from './components/HoverCard';
import { InfoPanel } from './components/InfoPanel';
import { BattlePanel } from './components/BattlePanel';
import { activeCount, loadPolityIndex, type PolityIndex } from './lib/polities';
import { writeYearToUrl, yearFromUrl } from './lib/years';

type Selection = { type: 'polity'; key: string } | { type: 'battle'; props: BattleProps } | null;

export function App() {
  const [year, setYear] = useState(yearFromUrl);
  const [index, setIndex] = useState<PolityIndex | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [showBattles, setShowBattles] = useState(true);

  useEffect(() => {
    loadPolityIndex().then(setIndex).catch(console.error);
  }, []);

  useEffect(() => {
    // Debounced so playing the timeline doesn't spam the history API.
    const t = window.setTimeout(() => writeYearToUrl(year), 300);
    return () => window.clearTimeout(t);
  }, [year]);

  const count = useMemo(() => (index ? activeCount(index, year) : null), [index, year]);

  const onSelect = useCallback((target: MapTarget | null) => {
    if (!target) setSelection(null);
    else if (target.type === 'polity') setSelection({ type: 'polity', key: target.props.key });
    else setSelection({ type: 'battle', props: target.props });
  }, []);

  const selectedKey = selection?.type === 'polity' ? selection.key : null;
  const hoverIsSelected =
    hover &&
    ((hover.target.type === 'polity' && hover.target.props.key === selectedKey) ||
      (hover.target.type === 'battle' && selection?.type === 'battle' && hover.target.props.qid === selection.props.qid));

  return (
    <div className="app">
      <MapView
        year={year}
        selectedKey={selectedKey}
        showBattles={showBattles}
        onHover={setHover}
        onSelect={onSelect}
      />
      <div className="vignette" aria-hidden />
      <header className="title panel">
        <h1>Mapz</h1>
        <p>Powers of the world through time</p>
      </header>
      {hover && !hoverIsSelected && <HoverCard hover={hover} index={index} />}
      {selection?.type === 'polity' && (
        <InfoPanel
          polityKey={selection.key}
          index={index}
          onClose={() => setSelection(null)}
          onJumpToYear={setYear}
          onSelectKey={(key) => setSelection({ type: 'polity', key })}
        />
      )}
      {selection?.type === 'battle' && <BattlePanel battle={selection.props} onClose={() => setSelection(null)} />}
      <Timeline
        year={year}
        activeCount={count}
        showBattles={showBattles}
        onToggleBattles={setShowBattles}
        onChange={setYear}
      />
    </div>
  );
}
