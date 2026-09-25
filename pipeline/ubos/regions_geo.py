"""Region boundaries (Central, Eastern, Northern, Western, plus Kampala on its own),
dissolved from the district shapes, for maps of UBOS survey figures that are
published by region (e.g. poverty).

A district's census code starts with its region: 1 Central, 2 Eastern,
3 Northern, 4 Western. Kampala is split out because UBOS's surveys report it
separately from the rest of Central.

Writes web/public/geo/regions.json (features named by region).
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import topojson
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
DISTRICTS = ROOT / "web" / "public" / "geo" / "districts.json"
CENSUS = ROOT / "web" / "src" / "data" / "census.json"
OUT = ROOT / "web" / "public" / "geo" / "regions.json"

REGION = {"1": "Central", "2": "Eastern", "3": "Northern", "4": "Western"}


def _round(coords, nd=3):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [_round(c, nd) for c in coords]


def build() -> None:
    districts = json.loads(DISTRICTS.read_text(encoding="utf-8"))
    names = {d["code"]: d["name"] for d in json.loads(CENSUS.read_text(encoding="utf-8"))["districts"]}
    parts = defaultdict(list)
    for f in districts["features"]:
        code = str(f["properties"]["name"])
        region = "Kampala" if names.get(code, "").upper() == "KAMPALA" else REGION.get(code[:1])
        if region is None:
            raise ValueError(f"regions_geo: district code {code} has no region")
        # A tiny buffer closes the hairline gaps left by simplified district borders.
        parts[region].append(shape(f["geometry"]).buffer(0.002))
    if set(parts) != {*REGION.values(), "Kampala"}:
        raise ValueError(f"regions_geo: unexpected regions {sorted(parts)}")
    merged = {r: unary_union(g).buffer(-0.002) for r, g in parts.items()}
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": r}, "geometry": mapping(g)} for r, g in merged.items()
    ]}
    topo = topojson.Topology(fc, prequantize=False, toposimplify=0.004, prevent_oversimplify=True)
    simple = topo.to_geojson(validate=False, winding_order="CW_CCW")
    if isinstance(simple, str):
        simple = json.loads(simple)
    out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": f["properties"]["name"]},
         "geometry": {"type": f["geometry"]["type"], "coordinates": _round(f["geometry"]["coordinates"])}}
        for f in simple["features"]
    ]}
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB), {len(out['features'])} regions")
