// Cliopatria covers 3400 BCE – 2024 CE. Years are integers: negative for BCE, positive for CE.
export const MIN_YEAR = -3400;
export const MAX_YEAR = 2024;
export const DEFAULT_YEAR = 1500;

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : `${year} CE`;
}

export function formatSpan(from: number, to: number): string {
  if (from === to) return formatYear(from);
  // "1230–1670 CE" rather than "1230 CE–1670 CE" when both ends share an era.
  if (from >= 0) return `${from}–${to} CE`;
  if (to < 0) return `${-from}–${-to} BCE`;
  return `${formatYear(from)} – ${formatYear(to)}`;
}

export function clampYear(year: number): number {
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year)));
}

export function yearFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get('year');
  const year = raw === null ? NaN : Number(raw);
  return Number.isFinite(year) ? clampYear(year) : DEFAULT_YEAR;
}

export function writeYearToUrl(year: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('year', String(year));
  window.history.replaceState(null, '', url);
}
