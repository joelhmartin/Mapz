import { MOVEMENT_COLORS, MOVEMENT_KIND_LABELS, type MovementInfo } from '../map/movements';
import { formatSpan, formatYear } from '../lib/years';
import { WikiSummary } from './WikiSummary';

interface Props {
  movement: MovementInfo;
  year: number;
  onClose: () => void;
  onJumpToYear: (year: number) => void;
}

export function MovementPanel({ movement, year, onClose, onJumpToYear }: Props) {
  return (
    <aside className="info-panel panel" aria-label={`About ${movement.name}`}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <header>
        <span className="swatch large" style={{ background: MOVEMENT_COLORS[movement.kind] }} />
        <h2>{movement.name}</h2>
      </header>
      <p className="span">
        {formatSpan(movement.from, movement.to)}
        <span className="kind"> · {MOVEMENT_KIND_LABELS[movement.kind]}</span>
      </p>
      <div className="jump-row">
        <button onClick={() => onJumpToYear(movement.from)}>⇤ Start</button>
        <button onClick={() => onJumpToYear(movement.to)}>End ⇥</button>
      </div>
      <p className="description">{movement.description}</p>
      {movement.certainty === 'uncertain' && (
        <p className="muted small">
          <em>The route is a schematic reconstruction; dates are approximate.</em>
        </p>
      )}

      <section>
        <h3>Route</h3>
        <ol className="itinerary">
          {movement.itinerary.map((stop, i) => (
            <li key={i} className={stop.year <= year ? 'reached' : undefined}>
              <button className="link" onClick={() => onJumpToYear(stop.year)}>
                {formatYear(stop.year)}
              </button>{' '}
              {stop.place}
            </li>
          ))}
        </ol>
      </section>

      <WikiSummary title={movement.wikipedia} />
      <p className="muted small">Route curated by Mapz from the linked sources. Summary from Wikipedia.</p>
    </aside>
  );
}
