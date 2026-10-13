import { useEffect, useMemo, useRef, useState } from 'react';
import { loadWarIndex, type WarIndex } from '../map/wars';
import { formatBattleDate, formatSpan } from '../lib/years';
import { WikiSummary } from './WikiSummary';

interface Props {
  warId: string;
  year: number;
  onClose: () => void;
  onOpenWar: (id: string) => void;
  // Step the timeline to a battle's year and fly the map to it.
  onGoToBattle: (year: number, center: [number, number]) => void;
}

export function WarPanel({ warId, year, onClose, onOpenWar, onGoToBattle }: Props) {
  const [index, setIndex] = useState<WarIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    loadWarIndex().then(setIndex, () => setFailed(true));
  }, []);
  useEffect(() => setCurrent(null), [warId]);

  const war = index?.[warId];
  const battles = war?.battles ?? [];

  // Without an explicit step, the "current" battle is the latest one fought by the selected year.
  const shown = useMemo(() => {
    if (current !== null) return current;
    let i = -1;
    battles.forEach((b, k) => {
      if (b[2] <= year) i = k;
    });
    return i;
  }, [current, battles, year]);

  const go = (i: number) => {
    const b = battles[i];
    if (!b) return;
    setCurrent(i);
    onGoToBattle(b[2], [b[4], b[5]]);
  };

  useEffect(() => {
    listRef.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, [shown]);

  return (
    <aside className="info-panel panel" aria-label={war ? `About ${war.name}` : 'War'}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {!war && <p className="muted">{failed ? 'Could not load the wars data.' : 'Consulting the archives…'}</p>}
      {war && (
        <>
          <header>
            <span className="battle-glyph large">⚔&#xFE0E;</span>
            <h2>{war.name}</h2>
          </header>
          <p className="span">
            {formatSpan(war.from, war.to)} · {battles.length} {battles.length === 1 ? 'battle' : 'battles'} mapped
          </p>
          {war.parent && index?.[war.parent] && (
            <p>
              <span className="muted">Part of</span>{' '}
              <button className="link" onClick={() => onOpenWar(war.parent!)}>
                {war.parentName}
              </button>
            </p>
          )}
          {war.sides.length > 0 && (
            <section>
              <h3>Combatants</h3>
              <p className="sides">{war.sides.join(' · ')}</p>
            </section>
          )}

          <section>
            <h3>Battles</h3>
            <div className="jump-row">
              <button onClick={() => go(Math.max(0, shown - 1))} disabled={shown <= 0}>
                ‹ Previous
              </button>
              <button onClick={() => go(shown + 1)} disabled={shown >= battles.length - 1}>
                Next ›
              </button>
            </div>
            <ol className="itinerary war-battles" ref={listRef}>
              {battles.map((b, i) => (
                <li
                  key={b[0]}
                  className={[b[2] <= year ? 'reached' : '', i === shown ? 'current' : ''].join(' ').trim() || undefined}
                >
                  <button className="link" onClick={() => go(i)}>
                    {formatBattleDate(b[3], b[2])}
                  </button>{' '}
                  {b[1]}
                </li>
              ))}
            </ol>
          </section>

          <WikiSummary title={war.article} />
          <p className="muted small">
            War, dates and combatants from Wikidata (CC0); theatres drawn around the war's mapped battles. Summary from
            Wikipedia.
          </p>
        </>
      )}
    </aside>
  );
}
