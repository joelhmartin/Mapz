import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dynasties, lanes, loadReigns, type Reign } from '../lib/rulers';
import { formatSpan, formatYear } from '../lib/years';

interface Props {
  polityKey: string;
  year: number;
  color: string;
  onJumpToYear: (year: number) => void;
}

const LANE_PX = 22;
const BAND_PX = 18;
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// Who ruled the selected polity in the selected year, and a scrollable timeline of every reign,
// with the ruling dynasties as a band above it. Clicking a reign moves the map to its first year.
export function Rulers({ polityKey, year, color, onJumpToYear }: Props) {
  const [reigns, setReigns] = useState<Reign[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setReigns(null);
    loadReigns(polityKey).then((r) => live && setReigns(r));
    return () => {
      live = false;
    };
  }, [polityKey]);

  const layout = useMemo(() => {
    if (!reigns?.length) return null;
    const start = Math.min(...reigns.map((r) => r.from));
    const end = Math.max(...reigns.map((r) => r.to)) + 1;
    // Scale so a typical reign is wide enough to label.
    const lengths = reigns.map((r) => r.to - r.from + 1).sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    const pxPerYear = Math.min(16, Math.max(0.6, 64 / median));
    const step = TICK_STEPS.find((s) => s * pxPerYear >= 70) ?? 1000;
    const ticks = [];
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t);
    const bands = lanes(dynasties(reigns));
    return { start, end, pxPerYear, ticks, rows: lanes(reigns), bands };
  }, [reigns]);

  const x = (y: number) => (layout ? (y - layout.start) * layout.pxPerYear : 0);

  // Keep the selected year in view as the timeline moves.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !layout) return;
    el.scrollLeft = x(Math.min(Math.max(year, layout.start), layout.end)) - el.clientWidth / 2;
  }, [year, layout]);

  if (!reigns?.length || !layout) return null;

  const current = reigns.filter((r) => r.from <= year && year <= r.to);
  const before = [...reigns].reverse().find((r) => r.to < year);
  const after = reigns.find((r) => r.from > year);
  const bandHeight = layout.bands.length * BAND_PX;
  const height = bandHeight + layout.rows.length * LANE_PX + 18;

  return (
    <section className="rulers">
      <h3>Rulers</h3>
      {current.length > 0 ? (
        <ul className="ruling">
          <li className="muted">In {formatYear(year)}:</li>
          {current.map((r) => (
            <li key={r.name + r.from}>
              {r.article ? (
                <a href={wikiUrl(r.article)} target="_blank" rel="noreferrer">
                  {r.name}
                </a>
              ) : (
                r.name
              )}{' '}
              <span className="muted">
                (r. {formatSpan(r.from, r.to)}
                {r.endKnown ? '' : '?'}){r.dynasty ? ` · ${r.dynasty}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ruling muted">
          No ruler recorded for {formatYear(year)}.{' '}
          {before && (
            <button className="link" onClick={() => onJumpToYear(before.from)}>
              ← {before.name}
            </button>
          )}
          {before && after && ' · '}
          {after && (
            <button className="link" onClick={() => onJumpToYear(after.from)}>
              {after.name} →
            </button>
          )}
        </p>
      )}

      <div className="reign-scroll" ref={scroller}>
        <div className="reign-track" style={{ width: x(layout.end) + 8, height }}>
          {layout.bands.map((lane, i) =>
            lane.map((d) => (
              <div
                key={d.name + d.from}
                className="dynasty"
                style={{ left: x(d.from), width: Math.max(2, x(d.to + 1) - x(d.from)), top: i * BAND_PX }}
                title={`${d.name}, ${formatSpan(d.from, d.to)}`}
              >
                <span>{d.name}</span>
              </div>
            )),
          )}
          {layout.rows.map((lane, i) =>
            lane.map((r) => {
              const width = Math.max(3, x(r.to + 1) - x(r.from));
              const now = r.from <= year && year <= r.to;
              return (
                <button
                  key={r.name + r.from}
                  className={`reign${now ? ' now' : ''}${r.endKnown ? '' : ' open'}`}
                  style={{ left: x(r.from), width, top: bandHeight + i * LANE_PX, ['--c' as string]: color }}
                  title={`${r.name}, ${formatSpan(r.from, r.to)}${r.endKnown ? '' : ' (end inferred)'}${r.dynasty ? ` · ${r.dynasty}` : ''}`}
                  aria-label={`${r.name}, ${formatSpan(r.from, r.to)}: go to ${formatYear(r.from)}`}
                  onClick={() => onJumpToYear(r.from)}
                >
                  {width > 36 ? r.name : ''}
                </button>
              );
            }),
          )}
          {layout.ticks.map((t) => (
            <span key={t} className="reign-tick" style={{ left: x(t) }}>
              {formatYear(t)}
            </span>
          ))}
          {year >= layout.start && year <= layout.end && <div className="reign-now" style={{ left: x(year + 0.5) }} />}
        </div>
      </div>
      <p className="muted small">
        {reigns.length} {reigns.length === 1 ? 'reign' : 'reigns'} from Wikidata (CC0); a "?" or a dashed end means the
        end was inferred from the next accession. Click a reign to go to it.
      </p>
    </section>
  );
}
