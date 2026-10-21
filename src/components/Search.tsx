import { useEffect, useRef, useState } from 'react';
import type { MovementIndex } from '../map/movements';
import type { PolityIndex } from '../lib/polities';
import { buildSearchIndex, search, type SearchItem, type SearchKind } from '../lib/search';
import { formatSpan, formatYear } from '../lib/years';

interface Props {
  index: PolityIndex | null;
  movements: MovementIndex | null;
  onPick: (item: SearchItem) => void;
}

const KIND_LABELS: Record<SearchKind, string> = {
  polity: 'state',
  ruler: 'ruler',
  battle: 'battle',
  war: 'war',
  movement: 'movement',
};
const KIND_GLYPHS: Record<SearchKind, string> = {
  polity: '◆',
  ruler: '♔',
  battle: '⚔',
  war: '◌',
  movement: '➶',
};

// A search box for states, rulers, battles, wars and movements. "/" focuses it from anywhere.
export function Search({ index, movements, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Build the index the first time the box is used, not on page load.
  const prepare = () => {
    if (index && !items) buildSearchIndex(index, movements).then(setItems);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && t.tagName !== 'INPUT' && t.tagName !== 'SELECT' && t.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = items ? search(items, query) : [];
  useEffect(() => setActive(0), [query]);

  const pick = (it: SearchItem) => {
    onPick(it);
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search panel" role="search">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="search-icon">
        <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        ref={input}
        type="search"
        placeholder="Search states, rulers, battles…"
        aria-label="Search the map"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        value={query}
        onFocus={() => {
          prepare();
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          // Keep the timeline's arrow-key stepping out of the search box.
          e.stopPropagation();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            pick(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          }
        }}
      />
      {open && query.trim() && (
        <ul className="search-results" id="search-results" role="listbox">
          {!items && <li className="muted">Loading…</li>}
          {items && results.length === 0 && <li className="muted">Nothing found</li>}
          {results.map((it, i) => (
            <li
              key={it.kind + (it.key ?? it.battle?.qid ?? '') + it.name + it.from}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
            >
              <span className={`search-glyph ${it.kind}`} aria-hidden>
                {KIND_GLYPHS[it.kind]}&#xFE0E;
              </span>
              <span className="search-name">{it.name}</span>
              <span className="search-meta">
                {KIND_LABELS[it.kind]}
                {it.kind === 'ruler' && it.key ? ` of ${it.key.replace(/^\(|\)$/g, '')}` : ''} ·{' '}
                {it.from === it.to ? formatYear(it.from) : formatSpan(it.from, it.to)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
