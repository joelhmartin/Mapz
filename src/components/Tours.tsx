import { useEffect, useState } from 'react';
import { TOURS, type Tour } from '../lib/tours';
import { formatYear } from '../lib/years';

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// The "Tours" button and its list of guided tours.
export function TourMenu({ onStart }: { onStart: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tour-menu">
      <button className="tour-button panel" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>❧&#xFE0E;</span> Tours
      </button>
      {open && (
        <ul className="tour-list panel">
          {TOURS.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  setOpen(false);
                  onStart(t.id);
                }}
              >
                <span className="tour-title">{t.title}</span>
                <span className="tour-summary">{t.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CardProps {
  tour: Tour;
  step: number;
  onStep: (step: number) => void;
  onExit: () => void;
}

// The narration card shown while a tour runs. PageUp/PageDown step through it, Escape leaves.
export function TourCard({ tour, step, onStep, onExit }: CardProps) {
  const s = tour.steps[step];
  const last = tour.steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'PageDown' && step < last) onStep(step + 1);
      else if (e.key === 'PageUp' && step > 0) onStep(step - 1);
      else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, onStep, onExit]);

  return (
    <aside className="tour-card panel" aria-label={`Tour: ${tour.title}`} aria-live="polite">
      <button className="close" onClick={onExit} aria-label="End tour">
        ×
      </button>
      <p className="tour-kicker">
        {tour.title} · {step + 1} of {tour.steps.length}
      </p>
      <h2>{s.title}</h2>
      <p className="span">{formatYear(s.year)}</p>
      <p className="tour-text">{s.text}</p>
      <a className="tour-more" href={wikiUrl(s.wikipedia)} target="_blank" rel="noreferrer">
        Read more on Wikipedia
      </a>
      <div className="tour-progress" aria-hidden>
        {tour.steps.map((_, i) => (
          <button key={i} className={i === step ? 'now' : i < step ? 'done' : ''} tabIndex={-1} onClick={() => onStep(i)} />
        ))}
      </div>
      <div className="jump-row tour-nav">
        <button onClick={() => onStep(step - 1)} disabled={step === 0}>
          ← Back
        </button>
        {step < last ? (
          <button className="primary" onClick={() => onStep(step + 1)}>
            Next →
          </button>
        ) : (
          <button className="primary" onClick={onExit}>
            Finish
          </button>
        )}
      </div>
    </aside>
  );
}
