import type { HoverInfo } from '../map/MapView';
import { displayName, type PolityIndex } from '../lib/polities';
import { formatBattleDate, formatSpan } from '../lib/years';

interface Props {
  hover: HoverInfo;
  index: PolityIndex | null;
}

export function HoverCard({ hover, index }: Props) {
  const { target, x, y } = hover;
  // Keep the card on screen near the right and bottom edges.
  const left = x + 300 > window.innerWidth ? x - 296 : x + 16;
  const top = y + 160 > window.innerHeight ? y - 140 : y + 16;

  if (target.type === 'battle') {
    const b = target.props;
    return (
      <div className="hover-card panel" style={{ left, top }}>
        <div className="hover-title">
          <span className="battle-glyph">⚔</span>
          {b.name}
        </div>
        <div className="hover-line">{formatBattleDate(b.date, b.year)}</div>
        {b.war && <div className="hover-line muted">Part of {b.war}</div>}
        {b.sides && <div className="hover-line muted">{b.sides.split('; ').join(' · ')}</div>}
        <div className="hover-hint">Click for more</div>
      </div>
    );
  }

  const props = target.props;
  const info = index?.[props.key];
  const memberOf = info?.memberOf.map(displayName) ?? [];
  return (
    <div className="hover-card panel" style={{ left, top }}>
      <div className="hover-title">
        <span className="swatch" style={{ background: props.color }} />
        {displayName(props.key)}
      </div>
      {info && <div className="hover-line">{formatSpan(info.from, info.to)}</div>}
      <div className="hover-line muted">
        These borders: {formatSpan(props.from, props.to)} · {Math.round(props.land ?? props.area).toLocaleString()} km²
        {props.land ? ' of land' : ''}
      </div>
      {(props.certainty === 'approximate' || props.certainty === 'uncertain') && (
        <div className="hover-line muted small">
          <em>Borders {props.certainty === 'uncertain' ? 'uncertain' : 'approximate'}</em>
        </div>
      )}
      {memberOf.length > 0 && <div className="hover-line muted">Part of {memberOf.join(', ')}</div>}
      <div className="hover-hint">Click for more</div>
    </div>
  );
}
