import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapView, type HoverInfo, type MapFocus, type MapTarget } from './map/MapView';
import type { BattleProps } from './map/battles';
import { loadMovementIndex, type MovementIndex } from './map/movements';
import { Timeline } from './components/Timeline';
import { HoverCard } from './components/HoverCard';
import { InfoPanel } from './components/InfoPanel';
import { BattlePanel } from './components/BattlePanel';
import { MovementPanel } from './components/MovementPanel';
import { WarPanel } from './components/WarPanel';
import { Cartouche, CompassRose } from './components/Ornaments';
import { Search } from './components/Search';
import { TourCard, TourMenu } from './components/Tours';
import type { SearchItem } from './lib/search';
import { TOURS, tourFromUrl, writeTourToUrl, type TourState } from './lib/tours';
import { activeCount, loadPolityIndex, type PolityIndex } from './lib/polities';
import { clampYear, writeYearToUrl, yearFromUrl } from './lib/years';

type Selection =
  | { type: 'polity'; key: string }
  | { type: 'battle'; props: BattleProps }
  | { type: 'movement'; id: string }
  | { type: 'war'; id: string }
  | null;

export function App() {
  const [year, setYear] = useState(yearFromUrl);
  const [index, setIndex] = useState<PolityIndex | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [showBattles, setShowBattles] = useState(true);
  const [showMovements, setShowMovements] = useState(true);
  const [showWars, setShowWars] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [movements, setMovements] = useState<MovementIndex | null>(null);
  const [tour, setTour] = useState<TourState | null>(tourFromUrl);

  useEffect(() => {
    loadPolityIndex().then(setIndex).catch(console.error);
    loadMovementIndex().then(setMovements).catch(console.error);
  }, []);

  useEffect(() => {
    // Debounced so playing the timeline doesn't spam the history API.
    const t = window.setTimeout(() => writeYearToUrl(year), 300);
    return () => window.clearTimeout(t);
  }, [year]);

  // Each tour step sets the year, flies to its view and outlines its state.
  const activeTour = tour ? TOURS.find((t) => t.id === tour.id) : undefined;
  const tourStep = activeTour?.steps[tour!.step];
  useEffect(() => {
    writeTourToUrl(tour);
    if (!tourStep) return;
    setYear(tourStep.year);
    // The narration card covers the left of the map on wide screens and the bottom on phones.
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    setFocus({
      center: [tourStep.at[0], tourStep.at[1]],
      zoom: tourStep.at[2] - (narrow ? 0.8 : 0),
      padding: narrow ? { bottom: 260 } : { left: 360 },
      key: Date.now(),
    });
  }, [tour, tourStep]);
  const startTour = useCallback((id: string) => {
    setSelection(null);
    setTour({ id, step: 0 });
  }, []);
  const stepTour = useCallback((step: number) => setTour((t) => (t ? { ...t, step } : t)), []);
  const exitTour = useCallback(() => {
    setTour(null);
    setFocus(null);
  }, []);

  // A search result moves the timeline into its span and flies to it.
  const onSearchPick = useCallback(
    (it: SearchItem) => {
      setTour(null);
      const info = it.key ? index?.[it.key] : undefined;
      if (it.kind === 'polity' && it.key) {
        // Stay in the current year if the state existed then; otherwise go to its largest extent.
        setYear((y) => (y >= it.from && y <= it.to ? y : clampYear(info?.peak ?? it.from)));
        setSelection({ type: 'polity', key: it.key });
      } else if (it.kind === 'ruler' && it.key) {
        setYear(clampYear(it.from));
        setSelection({ type: 'polity', key: it.key });
      } else if (it.kind === 'battle' && it.battle) {
        setYear(clampYear(it.from));
        setSelection({ type: 'battle', props: it.battle });
      } else if (it.kind === 'war' && it.key) {
        setYear(clampYear(it.from));
        setSelection({ type: 'war', id: it.key });
      } else if (it.kind === 'movement' && it.key) {
        setYear(clampYear(it.from));
        setSelection({ type: 'movement', id: it.key });
      }
      if (it.center) {
        // Zoom to suit the thing found: a battlefield closely, a state to fit its size.
        const area = info?.maxArea ?? 0;
        const zoom =
          it.kind === 'battle' ? 6 : it.kind === 'movement' ? 3.5 : area > 0 ? Math.min(6.5, Math.max(2.2, 8 - 0.85 * Math.log10(area))) : 4.5;
        setFocus({ center: it.center, zoom, key: Date.now() });
      }
    },
    [index],
  );

  const count = useMemo(() => (index ? activeCount(index, year) : null), [index, year]);

  const onSelect = useCallback((target: MapTarget | null) => {
    if (!target) setSelection(null);
    else if (target.type === 'polity') setSelection({ type: 'polity', key: target.props.key });
    else if (target.type === 'battle') setSelection({ type: 'battle', props: target.props });
    else if (target.type === 'war') setSelection({ type: 'war', id: target.props.id });
    else setSelection({ type: 'movement', id: target.props.id });
  }, []);

  const selectedKey = selection?.type === 'polity' ? selection.key : (tourStep?.highlight ?? null);
  const hoverIsSelected =
    hover &&
    ((hover.target.type === 'polity' && hover.target.props.key === selectedKey) ||
      (hover.target.type === 'battle' && selection?.type === 'battle' && hover.target.props.qid === selection.props.qid) ||
      (hover.target.type === 'movement' && selection?.type === 'movement' && hover.target.props.id === selection.id) ||
      (hover.target.type === 'war' && selection?.type === 'war' && hover.target.props.id === selection.id));
  const openWar = useCallback((id: string) => setSelection({ type: 'war', id }), []);
  const selectedMovement = selection?.type === 'movement' ? movements?.[selection.id] : undefined;

  return (
    <div className="app">
      <MapView
        year={year}
        selectedKey={selectedKey}
        showBattles={showBattles}
        showMovements={showMovements}
        showWars={showWars}
        focus={focus}
        onHover={setHover}
        onSelect={onSelect}
      />
      <div className="vignette" aria-hidden />
      <Cartouche />
      <CompassRose />
      <div className="finder">
        <Search index={index} movements={movements} onPick={onSearchPick} />
        <TourMenu onStart={startTour} />
      </div>
      {activeTour && tour && <TourCard tour={activeTour} step={tour.step} onStep={stepTour} onExit={exitTour} />}
      {hover && !hoverIsSelected && <HoverCard hover={hover} index={index} movements={movements} />}
      {selection?.type === 'polity' && (
        <InfoPanel
          polityKey={selection.key}
          index={index}
          year={year}
          onClose={() => setSelection(null)}
          onJumpToYear={setYear}
          onSelectKey={(key) => setSelection({ type: 'polity', key })}
        />
      )}
      {selection?.type === 'battle' && (
        <BattlePanel battle={selection.props} onClose={() => setSelection(null)} onOpenWar={openWar} />
      )}
      {selection?.type === 'war' && (
        <WarPanel
          warId={selection.id}
          year={year}
          onClose={() => setSelection(null)}
          onOpenWar={openWar}
          onGoToBattle={(y, center) => {
            setYear(y);
            setFocus({ center, key: Date.now() });
          }}
        />
      )}
      {selectedMovement && (
        <MovementPanel
          movement={selectedMovement}
          year={year}
          onClose={() => setSelection(null)}
          onJumpToYear={setYear}
        />
      )}
      <Timeline
        year={year}
        activeCount={count}
        showBattles={showBattles}
        onToggleBattles={setShowBattles}
        showMovements={showMovements}
        onToggleMovements={setShowMovements}
        showWars={showWars}
        onToggleWars={setShowWars}
        onChange={setYear}
      />
    </div>
  );
}
