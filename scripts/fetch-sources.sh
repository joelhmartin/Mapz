#!/bin/sh
# Download raw source datasets into data/raw (gitignored).
set -eu

RAW="data/raw"
mkdir -p "$RAW"

# Cliopatria (Seshat Global History Databank) — polity borders 3400 BCE–2024 CE, CC-BY 4.0.
if [ ! -d "$RAW/cliopatria" ]; then
  git clone --depth 1 https://github.com/Seshat-Global-History-Databank/cliopatria "$RAW/cliopatria"
fi
unzip -o -q "$RAW/cliopatria/cliopatria.geojson.zip" -d "$RAW/cliopatria/unzipped"

# historical-basemaps (aourednik) — world border snapshots, GPL-3.0. Fills gaps in Cliopatria.
if [ ! -d "$RAW/historical-basemaps" ]; then
  git clone --depth 1 https://github.com/aourednik/historical-basemaps "$RAW/historical-basemaps"
fi

# Natural Earth physical geography (public domain) for the basemap and Pacific islands.
NE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
for f in ne_10m_land ne_10m_minor_islands ne_50m_lakes ne_50m_rivers_lake_centerlines; do
  if [ ! -f "$RAW/$f.geojson" ]; then
    curl -fsSL "$NE/$f.geojson" -o "$RAW/$f.geojson"
  fi
done

echo "Sources ready in $RAW"
