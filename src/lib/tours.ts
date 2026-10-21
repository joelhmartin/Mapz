// Guided tours (data/curated/tours.json): each step sets the year, flies the map and narrates.
import data from '../../data/curated/tours.json';

export interface TourStep {
  year: number;
  at: [number, number, number];
  title: string;
  text: string;
  wikipedia: string;
  // A polity key to outline while the step is shown.
  highlight?: string;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

export const TOURS = data.tours as Tour[];

export interface TourState {
  id: string;
  step: number;
}

// ?tour=zulu&step=3 opens a tour at a step (1-based in the URL).
export function tourFromUrl(): TourState | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('tour');
  const tour = TOURS.find((t) => t.id === id);
  if (!tour) return null;
  const step = Math.min(Math.max(Number(params.get('step') ?? 1) - 1, 0), tour.steps.length - 1);
  return { id: tour.id, step: Number.isFinite(step) ? step : 0 };
}

export function writeTourToUrl(state: TourState | null): void {
  const url = new URL(window.location.href);
  if (state) {
    url.searchParams.set('tour', state.id);
    url.searchParams.set('step', String(state.step + 1));
  } else {
    url.searchParams.delete('tour');
    url.searchParams.delete('step');
  }
  window.history.replaceState(null, '', url);
}
