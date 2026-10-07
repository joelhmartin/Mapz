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


# --- region configs ------------------------------------------------------------------------
#
# Every data/curated/*.json file may carry:
#   historicalBasemaps: which snapshot features to take for a region, and how to name them
#   boxes:              named lon/lat boxes for island polities
#   polities:           curated polities, as "islands" (box names) or a "blob" [lon, lat, radius°];
#                       "contested": true draws one over Cliopatria's colonial claims instead of
#                       clipping it by them
#   backfill:           historical-basemaps geometry reused for years before it first appears
# Curated entries earlier in a file take precedence over later ones where they overlap.

configs = [(path, json.load(open(path))) for path in sorted(glob.glob(f"{CURATED}/*.json"))]

# --- historical-basemaps snapshots ---------------------------------------------------------


def snapshot_year(path):
    s = os.path.basename(path)[len("world_") : -len(".geojson")]
    return -int(s[2:]) if s.startswith("bc") else int(s)


snapshots = sorted(glob.glob(f"{RAW}/historical-basemaps/geojson/world_*.geojson"), key=snapshot_year)
years = [snapshot_year(p) for p in snapshots]
hb_geoms = {}  # (name, year) -> geometry, for backfill


def in_boxes(c, boxes):
    return any(b[0] <= c.x <= b[2] and b[1] <= c.y <= b[3] for b in boxes)


class Region:
    def __init__(self, cfg):
        self.boxes = cfg["region"]["boxes"]
        self.exclude_boxes = cfg["region"].get("excludeBoxes", [])
        self.include = set(cfg["include"]) if "include" in cfg else None
        self.exclude = set(cfg.get("exclude", []))
        self.drop_if_only_in = set(cfg.get("dropIfOnlyIn", []))
        self.rename = cfg.get("rename", {})
        self.wikipedia = cfg.get("wikipedia", {})
        self.peoples = set(cfg.get("peoples", []))
        self.people_keywords = [k.lower() for k in cfg.get("peopleKeywords", [])]
        self.notes = cfg.get("notes", {})

    def contains(self, c):
        return in_boxes(c, self.boxes) and not in_boxes(c, self.exclude_boxes)

    def accepts(self, raw, seen_years):
        if raw in self.exclude or (self.include is not None and raw not in self.include):
            return False
        # Single-snapshot layers (e.g. the 1492 map of ~1,000 contemporary nations) are left out.
        return not (self.drop_if_only_in and seen_years <= self.drop_if_only_in)

    def kind(self, name):
        lowered = name.lower()
        if name in self.peoples or any(k in lowered for k in self.people_keywords):
            return "people"
        return None


regions = [Region(cfg["historicalBasemaps"]) for _, cfg in configs if "historicalBasemaps" in cfg]

features_by_snapshot = []
seen = {}  # raw name -> snapshot years it appears in
for path in snapshots:
    feats = [f for f in json.load(open(path))["features"] if f.get("geometry")]
    features_by_snapshot.append(feats)
    for f in feats:
        seen.setdefault((f["properties"].get("NAME") or "").strip(), set()).add(snapshot_year(path))

hb_rows = []
for i, feats in enumerate(features_by_snapshot):
    start = years[i]
    end = years[i + 1] - 1 if i + 1 < len(years) else MAX_YEAR
    if end < MIN_YEAR:
        continue
    start = max(start, MIN_YEAR)
    for f in feats:
        raw = (f["properties"].get("NAME") or "").strip()
        if not raw:
            continue
        geom = make_valid(shape(f["geometry"]))
        hb_geoms[(raw, years[i])] = geom
        c = geom.representative_point()
        region = next((r for r in regions if r.contains(c)), None)
        if region is None or not region.accepts(raw, seen[raw]):
            continue
        name = region.rename.get(raw, raw)
        precision = f["properties"].get("BORDERPRECISION") or 1
        hb_rows.append(
            dict(
                name=name, start=start, end=end, geom=geom,
                wikipedia=region.wikipedia.get(name) or f["properties"].get("wikipedia") or name,
                description=region.notes.get(name), kind=region.kind(name),
                certainty={1: "approximate", 2: "moderate", 3: "precise"}.get(precision, "approximate"),
            )
        )

# --- curated polities ----------------------------------------------------------------------

curated = Coverage()
out = []


def overlaps_curated(geom, start, end):
    """Curated polities already placed that overlap geom in space and time."""
    return [g for s, e, g in curated.items if s <= end and start <= e and g.intersects(geom)]


def add_curated(p, geom, source="curated", **extra):
    composite = p["name"].startswith("(")
    if not composite:
        # A contested polity is drawn over colonial claims to its land rather than clipped by them.
        if not p.get("contested"):
            geom = subtract(geom, p["from"], p["to"], [clio])
        earlier = overlaps_curated(geom, p["from"], p["to"])
        if earlier:
            geom = clean(geom.difference(unary_union(earlier)))
        if geom.is_empty:
            return
        curated.add(p["from"], p["to"], geom)
    out.append(
        feature(
            p["name"], p["from"], p["to"], geom,
            wikipedia=p.get("wikipedia"), Description=p.get("description"),
            Certainty=p.get("certainty", "approximate"), Source=source, Kind=p.get("kind"), **extra,
        )
    )


for path, cfg in configs:
    for p in cfg.get("polities", []):
        if "islands" in p:
            geom, land_area = islands([cfg["boxes"][b] for b in p["islands"]], p.get("halo", 0.6))
            add_curated(p, geom, LandArea=land_area)
        elif "blob" in p:
            lon, lat, r = p["blob"]
            add_curated(p, blob(lon, lat, r, p["name"]))
        else:
            raise ValueError(f"{path}: {p['name']} has neither islands nor blob")
    for p in cfg.get("backfill", []):
        src_name, src_year = p["fromHistoricalBasemaps"]
        add_curated(p, hb_geoms[(src_name, src_year)], source="historical-basemaps")

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
