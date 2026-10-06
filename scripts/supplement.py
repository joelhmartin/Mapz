"""Fill gaps in Cliopatria with historical-basemaps snapshots and curated polities.

Writes data/build/supplement.ndjson: Cliopatria-shaped features that scripts/build-data.mjs
merges into the tiles. Each supplementary polygon is clipped against whatever is already
mapped for its time range, so nothing is drawn twice. Precedence:
Cliopatria > curated (data/curated/*.json) > historical-basemaps.

Requires shapely (pip install shapely). Run `npm run data:fetch` first.
"""

import glob
import json
import math
import os
import re
import zlib

from shapely import force_2d
from shapely.geometry import box, mapping, shape, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

RAW = "data/raw"
CURATED = "data/curated"
OUT = "data/build/supplement.ndjson"
MIN_YEAR, MAX_YEAR = -3400, 2024
WORLD = box(-180, -90, 180, 90)
SLIVER_DEG2 = 0.01  # parts smaller than ~100 km² left over after clipping are dropped

# Pacific features taken from historical-basemaps (everything else there comes from the curated file).
PACIFIC_HB = {"Maori": "Māori iwi", "Maoris": "Māori iwi", "M?ori": "Māori iwi", "Māori": "Māori iwi"}
PACIFIC_NOTES = {
    "Māori iwi": (
        "Māori people",
        "Polynesian voyagers settled Aotearoa around 1280 and formed iwi (tribes) and hapū led by rangatira. "
        "Inter-iwi warfare intensified with muskets in the Musket Wars (1807–1842).",
    )
}


def area_km2(geom):
    if geom.is_empty:
        return 0.0
    lat = geom.centroid.y
    return geom.area * 111.32**2 * math.cos(math.radians(lat))


def clean(geom):
    if geom.is_empty:
        return geom
    geom = make_valid(geom)
    polys = []
    for g in getattr(geom, "geoms", [geom]):
        if isinstance(g, Polygon):
            polys.append(g)
        elif isinstance(g, MultiPolygon):
            polys.extend(g.geoms)
        elif hasattr(g, "geoms"):
            polys.extend(p for p in g.geoms if isinstance(p, Polygon))
    polys = [p for p in polys if p.area >= SLIVER_DEG2]
    if not polys:
        return Polygon()
    return MultiPolygon(polys) if len(polys) > 1 else polys[0]


class Coverage:
    """Spatial index of already-mapped polities, queryable by year."""

    def __init__(self):
        self.items = []  # (from, to, geom)

    def add(self, start, end, geom):
        self.items.append((start, end, geom))

    def build(self):
        self.tree = STRtree([g for _, _, g in self.items])

    def at(self, geom, year):
        hits = [self.items[i] for i in self.tree.query(geom)]
        return [g for s, e, g in hits if s <= year <= e]


def subtract(geom, start, end, coverages):
    """Remove the parts of geom already mapped at the middle of its time range."""
    mid = (start + end) // 2
    covered = [g for c in coverages for g in c.at(geom, mid)]
    if covered:
        geom = geom.difference(unary_union(covered))
    return clean(geom)


def feature(name, start, end, geom, **extra):
    props = {
        "Name": name,
        "FromYear": int(start),
        "ToYear": int(end),
        "Area": area_km2(geom),
        "Type": "POLITY",
        "Wikipedia": extra.pop("wikipedia", None) or name,
        "Wikidata": "",
        "SeshatID": "",
        "Components": "",
        "MemberOf": "",
    }
    props.update({k: v for k, v in extra.items() if v is not None})
    return {"type": "Feature", "properties": props, "geometry": mapping(force_2d(geom))}


# --- Cliopatria coverage -------------------------------------------------------------------

print("Indexing Cliopatria…")
clio_file = glob.glob(f"{RAW}/cliopatria/unzipped/*.geojson")[0]
clio = Coverage()
for f in json.load(open(clio_file))["features"]:
    p = f["properties"]
    if p["Type"] != "POLITY" or p["Name"].startswith("("):
        continue
    clio.add(p["FromYear"], p["ToYear"], make_valid(shape(f["geometry"])))
clio.build()

# --- Natural Earth islands -----------------------------------------------------------------

land = []
for name in ("ne_10m_land", "ne_10m_minor_islands"):
    land += [make_valid(shape(f["geometry"])) for f in json.load(open(f"{RAW}/{name}.geojson"))["features"]]
land_tree = STRtree(land)


def islands(boxes, halo):
    parts = []
    for b in boxes:
        bb = box(*b)
        parts += [land[i].intersection(bb) for i in land_tree.query(bb) if land[i].intersects(bb)]
    if not parts:
        raise ValueError(f"No land found in {boxes}")
    core = unary_union(parts)
    domain = core.buffer(halo, resolution=8).simplify(0.02).intersection(WORLD)
    return domain, area_km2(core)


def blob(lon, lat, radius, seed):
    """An irregular rounded shape marking an approximate heartland."""
    h = zlib.crc32(seed.encode())
    p1, p2 = (h % 628) / 100, ((h >> 10) % 628) / 100
    pts = []
    for i in range(72):
        t = i / 72 * 2 * math.pi
        r = radius * (1 + 0.1 * math.sin(3 * t + p1) + 0.06 * math.sin(5 * t + p2))
        pts.append((lon + r * math.cos(t) / math.cos(math.radians(lat)), lat + r * math.sin(t)))
    return Polygon(pts)


# --- historical-basemaps snapshots ---------------------------------------------------------


def snapshot_year(path):
    s = os.path.basename(path)[len("world_") : -len(".geojson")]
    return -int(s[2:]) if s.startswith("bc") else int(s)


snapshots = sorted(glob.glob(f"{RAW}/historical-basemaps/geojson/world_*.geojson"), key=snapshot_year)
years = [snapshot_year(p) for p in snapshots]
hb_geoms = {}  # (name, year) -> geometry, for backfill


def in_africa(c, region):
    if not (region["minLon"] < c.x < region["maxLon"] and c.y < region["maxLat"]):
        return False
    # Arabia sits inside the bounding box.
    return not (region["excludeArabia"] and c.x > 42 and c.y > 11)


def in_pacific(c):
    return (c.x > 155 or c.x < -125) and -50 < c.y < 30


africa_cfg = json.load(open(f"{CURATED}/africa.json"))
hb_cfg = africa_cfg["historicalBasemaps"]
exclude = set(hb_cfg["exclude"])
peoples = set(hb_cfg["peoples"])

hb_rows = []
for i, path in enumerate(snapshots):
    start = years[i]
    end = years[i + 1] - 1 if i + 1 < len(years) else MAX_YEAR
    if end < MIN_YEAR:
        continue
    start = max(start, MIN_YEAR)
    for f in json.load(open(path))["features"]:
        raw = (f["properties"].get("NAME") or "").strip()
        if not f.get("geometry") or raw in exclude:
            continue
        geom = make_valid(shape(f["geometry"]))
        hb_geoms[(raw, years[i])] = geom
        c = geom.representative_point()
        if in_pacific(c):
            if raw not in PACIFIC_HB:
                continue
            name = PACIFIC_HB[raw]
            wiki, note = PACIFIC_NOTES[name]
            kind = None
        elif in_africa(c, hb_cfg["region"]):
            name = hb_cfg["rename"].get(raw, raw)
            wiki = hb_cfg["wikipedia"].get(name) or f["properties"].get("wikipedia") or name
            note = hb_cfg["notes"].get(name)
            kind = "people" if name in peoples else None
        else:
            continue
        precision = f["properties"].get("BORDERPRECISION") or 1
        hb_rows.append(
            dict(
                name=name, start=start, end=end, geom=geom, wikipedia=wiki, description=note, kind=kind,
                certainty={1: "approximate", 2: "moderate", 3: "precise"}.get(precision, "approximate"),
            )
        )

# --- curated polities ----------------------------------------------------------------------

curated = Coverage()
out = []

poly_cfg = json.load(open(f"{CURATED}/polynesia.json"))
for p in poly_cfg["polities"]:
    geom, land_area = islands([poly_cfg["boxes"][b] for b in p["islands"]], p.get("halo", 0.6))
    composite = p["name"].startswith("(")
    if not composite:
        geom = subtract(geom, p["from"], p["to"], [clio])
        curated.add(p["from"], p["to"], geom)
    if geom.is_empty:
        continue
    out.append(
        feature(
            p["name"], p["from"], p["to"], geom,
            wikipedia=p.get("wikipedia"), Description=p.get("description"),
            Certainty=p.get("certainty", "approximate"), Source="curated", LandArea=land_area,
        )
    )

for p in africa_cfg["polities"]:
    lon, lat, r = p["blob"]
    geom = subtract(blob(lon, lat, r, p["name"]), p["from"], p["to"], [clio])
    if geom.is_empty:
        continue
    curated.add(p["from"], p["to"], geom)
    out.append(
        feature(
            p["name"], p["from"], p["to"], geom,
            wikipedia=p.get("wikipedia"), Description=p.get("description"),
            Certainty=p.get("certainty", "approximate"), Source="curated",
        )
    )

for p in africa_cfg["backfill"]:
    src_name, src_year = p["fromHistoricalBasemaps"]
    geom = subtract(hb_geoms[(src_name, src_year)], p["from"], p["to"], [clio])
    curated.add(p["from"], p["to"], geom)
    out.append(
        feature(
            p["name"], p["from"], p["to"], geom,
            wikipedia=p.get("wikipedia"), Description=p.get("description"),
            Certainty=p.get("certainty", "approximate"), Source="historical-basemaps",
        )
    )

curated.build()

# --- historical-basemaps rows, clipped against everything above ----------------------------

kept = 0
for r in hb_rows:
    geom = subtract(r["geom"], r["start"], r["end"], [clio, curated])
    if geom.is_empty or geom.area < 0.3 * r["geom"].area:
        continue  # mostly mapped already
    kept += 1
    out.append(
        feature(
            r["name"], r["start"], r["end"], geom,
            wikipedia=r["wikipedia"], Description=r["description"], Certainty=r["certainty"],
            Source="historical-basemaps", Kind=r["kind"],
        )
    )

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as fh:
    for f in out:
        fh.write(json.dumps(f, ensure_ascii=False) + "\n")
print(f"{len(out)} supplementary features ({kept} of {len(hb_rows)} historical-basemaps rows kept) → {OUT}")
