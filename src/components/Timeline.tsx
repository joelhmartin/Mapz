import { useEffect, useRef, useState } from 'react';
import { MAX_YEAR, MIN_YEAR, clampYear, formatYear } from '../lib/years';

interface Props {
  year: number;
  activeCount: number | null;
  onChange: (year: number) => void;
}

const STEPS = [1, 10, 50, 100];
const TICKS = [-3000, -2000, -1000, 1, 1000, 2000];
const PLAY_INTERVAL_MS = 120;

export function Timeline({ year, activeCount, onChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(10);
  const yearRef = useRef(year);
  yearRef.current = year;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = clampYear(yearRef.current + step);
      onChange(next);
      if (next >= MAX_YEAR) setPlaying(false);
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, step, onChange]);

  // Keyboard: ←/→ step through time, space plays/pauses. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(clampYear(yearRef.current + (e.key === 'ArrowLeft' ? -step : step)));
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onChange]);

  const pct = (y: number) => ((y - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;

  return (
    <div className="timeline panel">
      <div className="timeline-head">
        <button
          className="icon-button"
          onClick={() => {
            if (!playing && year >= MAX_YEAR) onChange(MIN_YEAR);
            setPlaying(!playing);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (space)' : 'Play (space)'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="icon-button" onClick={() => onChange(clampYear(year - step))} aria-label="Step back">
          ‹
        </button>
        <div className="year-display">
          <span className="year">{formatYear(year)}</span>
          {activeCount !== null && <span className="year-sub">{activeCount} powers on the map</span>}
        </div>
        <button className="icon-button" onClick={() => onChange(clampYear(year + step))} aria-label="Step forward">
          ›
        </button>
        <label className="step-select">
          step
          <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {s} {s === 1 ? 'yr' : 'yrs'}
              </option>
            ))}
          </select>
        </label>
        <label className="year-input">
          go to
          <input
            type="number"
            min={MIN_YEAR}
            max={MAX_YEAR}
            placeholder="-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) onChange(clampYear(v));
              }
            }}
          />
        </label>
      </div>
      <div className="slider-wrap">
        <input
          className="slider"
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          value={year}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Year"
        />
        <div className="ticks" aria-hidden>
          {TICKS.map((t) => (
            <span key={t} style={{ left: `${pct(t)}%` }}>
              {t === 1 ? '1 CE' : formatYear(t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
