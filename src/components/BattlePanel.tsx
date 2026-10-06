import type { BattleProps } from '../map/battles';
import { formatBattleDate } from '../lib/years';
import { WikiSummary } from './WikiSummary';

interface Props {
  battle: BattleProps;
  onClose: () => void;
}

export function BattlePanel({ battle, onClose }: Props) {
  return (
    <aside className="info-panel panel" aria-label={`About ${battle.name}`}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <header>
        <span className="battle-glyph large">⚔</span>
        <h2>{battle.name}</h2>
      </header>
      <p className="span">{formatBattleDate(battle.date, battle.year)}</p>
      {battle.war && (
        <p>
          <span className="muted">Part of</span> {battle.war}
        </p>
      )}
      {battle.sides && (
        <section>
          <h3>Combatants</h3>
          <ul className="related">
            {battle.sides.split('; ').map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      <WikiSummary title={battle.article} />
      <section className="links">
        <a href={`https://www.wikidata.org/wiki/${battle.qid}`} target="_blank" rel="noreferrer">
          Wikidata
        </a>
      </section>
      <p className="muted small">Battle data from Wikidata (CC0). Summary from Wikipedia.</p>
    </aside>
  );
}
