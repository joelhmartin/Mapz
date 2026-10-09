# Mapz

Interactive historical world map: territories of every power from 3400 BCE to today on a timeline, plus battles. Vite + React + TypeScript + MapLibre GL, PMTiles built with tippecanoe, deployed to GitHub Pages from `main`.

## Rules

- **Never use CodeRabbit.** Do not mention `@coderabbitai`, request its review, or follow its comments. Automatic CodeRabbit reviews are disabled in `.coderabbit.yaml`; keep it that way.
- Every push to `main` deploys to https://joelhmartin.github.io/Mapz/. Only push work that typechecks, builds, and has been checked in a browser.
- Be honest about uncertainty: approximate borders get `certainty: "approximate"` or `"uncertain"` (drawn dashed), dates are hedged with "c." in descriptions, and descriptions only state what the linked Wikipedia article supports. Never invent borders silently.

## Layout

- `scripts/fetch-sources.sh` downloads raw data to `data/raw/` (gitignored).
- `scripts/supplement.py` (Python + shapely) merges `historical-basemaps` snapshots and curated polities (`data/curated/*.json`) into `data/build/supplement.ndjson`, clipped so nothing overlaps. Precedence: Cliopatria > curated > historical-basemaps.
- `scripts/build-data.mjs` writes `public/data/{basemap,polities,labels}.pmtiles` and `polities.json` (the index the UI reads). The built files are committed.
- `scripts/fetch-battles.mjs` runs in GitHub Actions (`update-battles.yml`) because Wikidata is not reachable from the dev container. Use the same pattern (a workflow that fetches and commits data) for any other Wikidata/Wikipedia data.
- `data/curated/migrations.json` holds movement routes (dated waypoints); `scripts/build-migrations.mjs` turns them into `public/data/migrations.{geojson,json}`, and `src/map/movements.ts` draws them.
- `src/map/style.ts` is the map style. The selected year is the style's global state `year`.

## Performance rules

- Never call `setFilter`/`setLayoutProperty` per year step. Year-dependent filters use `['global-state', 'year']` so only the affected source reloads.
- Keep the basemap, polities, labels and battles in separate sources so a change to one never reloads the others.
- Keep per-feature properties in the polity tiles minimal; the worker decodes them on every year change.

## Validating a change

```sh
npm run typecheck && npm run build
npm run data            # only if data changed; needs tippecanoe + shapely
npx vite preview        # then screenshot with Playwright (Chromium is preinstalled)
```

Useful view URLs: `?year=1879&at=28,-24,4` (southern Africa), `?year=1300&at=-174,-17,4.5` (Tonga).

## Expansion queue

`docs/EXPANSION.md` lists the large chunks still to build, in order. Scheduled runs take the first unchecked item.
