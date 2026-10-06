import { displayName, type PolityIndex } from '../lib/polities';
import { formatSpan } from '../lib/years';
import { WikiSummary } from './WikiSummary';

interface Props {
  polityKey: string;
  index: PolityIndex | null;
  onClose: () => void;
  onJumpToYear: (year: number) => void;
  onSelectKey: (key: string) => void;
}

export function InfoPanel({ polityKey, index, onClose, onJumpToYear, onSelectKey }: Props) {
  const info = index?.[polityKey];
  const name = info?.name ?? displayName(polityKey);
  const related = [
    ...(info?.memberOf ?? []).map((k) => ({ key: k, label: 'Part of' })),
    ...(info?.components ?? []).map((k) => ({ key: k, label: 'Includes' })),
  ].filter((r) => index?.[r.key]);

  return (
    <aside className="info-panel panel" aria-label={`About ${name}`}>
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <header>
        {info && <span className="swatch large" style={{ background: info.color }} />}
        <h2>{name}</h2>
      </header>
      {info && (
        <p className="span">
          {formatSpan(info.from, info.to)}
          {info.kind !== 'polity' && <span className="kind"> · {info.kind === 'empire' ? 'colonial empire' : 'alliance / relation'}</span>}
        </p>
      )}
      {info && (
        <div className="jump-row">
          <button onClick={() => onJumpToYear(info.from)}>⇤ Rise</button>
          <button onClick={() => onJumpToYear(info.to)}>Fall ⇥</button>
        </div>
      )}

      <WikiSummary title={info?.wikipedia} />

      {related.length > 0 && (
        <section>
          <h3>Related</h3>
          <ul className="related">
            {related.map((r) => (
              <li key={r.label + r.key}>
                <span className="muted">{r.label}</span>{' '}
                <button className="link" onClick={() => onSelectKey(r.key)}>
                  {displayName(r.key)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="links">
        {info?.wikidata && (
          <a href={`https://www.wikidata.org/wiki/${info.wikidata}`} target="_blank" rel="noreferrer">
            Wikidata
          </a>
        )}
      </section>
      <p className="muted small">Borders from Cliopatria (Seshat Global History Databank). Summary from Wikipedia.</p>
    </aside>
  );
}
