import type { HoverInfo } from '../map/MapView';
import { displayName, type PolityIndex } from '../lib/polities';
import { formatSpan } from '../lib/years';

interface Props {
  hover: HoverInfo;
  index: PolityIndex | null;
}

export function HoverCard({ hover, index }: Props) {
  const { props, x, y } = hover;
  const info = index?.[props.key];
  const memberOf = info?.memberOf.map(displayName) ?? [];

  return (
    <div className="hover-card panel" style={{ left: x + 16, top: y + 16 }}>
      <div className="hover-title">
        <span className="swatch" style={{ background: props.color }} />
        {props.name}
      </div>
      {info && <div className="hover-line">{formatSpan(info.from, info.to)}</div>}
      <div className="hover-line muted">
        These borders: {formatSpan(props.from, props.to)} · {Math.round(props.area).toLocaleString()} km²
      </div>
      {memberOf.length > 0 && <div className="hover-line muted">Part of {memberOf.join(', ')}</div>}
      <div className="hover-hint">Click for more</div>
    </div>
  );
}
