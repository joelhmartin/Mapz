# Mapz

An interactive world map of who controlled what, from 3400 BCE to today. Drag the timeline to watch empires, kingdoms and chiefdoms rise and fall; hover a territory for a summary, click it for the full story.

## Running locally

```sh
npm install
npm run dev
```

The built map data (`public/data/world.pmtiles`, `public/data/polities.json`) is committed, so the app runs without the data pipeline.

## Rebuilding the data

Requires [tippecanoe](https://github.com/felt/tippecanoe) (`brew install tippecanoe` / `apt install tippecanoe`) and Python with shapely (`pip install shapely`).

```sh
npm run data        # fetch sources, merge supplements, build public/data/*
```

`scripts/supplement.py` fills gaps in Cliopatria. Supplementary polygons are clipped against whatever is already mapped for their time range, with precedence Cliopatria > curated > historical-basemaps:

- **historical-basemaps** snapshots for sub-Saharan Africa, the Americas and Aotearoa, each valid until the next snapshot year. Names, Wikipedia links and short notes are configured in `data/curated/africa.json`.
- **Curated Polynesia** (`data/curated/polynesia.json`): real island coastlines with a sea halo, and settlement and dynasty dates from the archaeological and historical record.
- **Curated Africa**: rough heartlands for states neither dataset maps (Mapungubwe, Butua, Mthethwa, Ndwandwe, Ngwane, Ife).
- **Curated Americas** (`data/curated/americas.json`): Mississippian centres, Southwest cultures, eastern confederacies, Mesoamerican and Andean states and island chiefdoms. Native nations after 1783 are marked `contested`, which draws them over the colonial claims to their land instead of clipping them away.

Each `data/curated/*.json` file can also configure which historical-basemaps features to take for its region (names, Wikipedia titles, which entries are peoples).

Borders that are approximations are drawn dashed and flagged in the hover card. Peoples and cultures, as opposed to states, get a lighter wash and italic labels.

`scripts/build-data.mjs` turns the Cliopatria polygons into a single PMTiles file. Each feature carries `from`/`to` years, so the map shows a given year by filtering client-side — moving the slider never refetches tiles. Small polities are only included from higher zoom levels to keep world-view tiles light.

## Stack

- Vite + React + TypeScript
- MapLibre GL JS with a custom old-map style and IM Fell English labels (`font-faces`)
- PMTiles vector tiles built with tippecanoe, served as a static file
- Deployed to GitHub Pages by `.github/workflows/deploy.yml`

## Roadmap

1. ~~Data pipeline: Cliopatria → PMTiles~~
2. ~~Map with timeline slider~~
3. ~~Battles from Wikidata as icons that pop in on the timeline~~ (11k battles; wars as their own layer still to do)
4. Richer detail panel: rulers, conquests, wars
5. Full hand-drawn styling (wobbly inked borders, watercolour fills)
6. ~~Polynesia rise and fall~~ and ~~sub-Saharan Africa gap-filling~~; next: the Mfecane and other migrations as animated arrows
7. Worldwide gap-filling: the Americas, Central Asia, stateless societies

## Data & credits

- Polity borders: [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria), Seshat Global History Databank — CC BY 4.0. Bracketed composite entities (colonial empires, alliances) are drawn as dashed outlines; colours are generated.
- Battles: [Wikidata](https://www.wikidata.org) — CC0. Fetched by `.github/workflows/update-battles.yml` (monthly, or when `scripts/fetch-battles.mjs` changes) and committed to `public/data/battles.geojson`.
- Gap-filling borders: [historical-basemaps](https://github.com/aourednik/historical-basemaps) by André Ourednik — GPL-3.0.
- Physical geography: [Natural Earth](https://www.naturalearthdata.com) — public domain.
- Summaries: Wikipedia REST API, fetched live.
- Fonts: IM FELL English by Igino Marini — SIL Open Font License (`public/fonts/OFL.txt`).
