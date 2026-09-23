"""District boundaries for the web map.

The census API ships ~1.2 MB of GeoJSON. For the site we:
  * merge features that share a district code (some come in several pieces);
  * compute each district's area (km², used for population density);
  * simplify with shared-border awareness (topojson) so neighbours still meet;
  * round coordinates, since 3 decimals (~100 m) is plenty for a national map.
"""

from __future__ import annotations

import math
from collections import defaultdict

import topojson
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

KM_PER_DEG = 111.32


def _area_km2(geom) -> float:
    # Uganda straddles the equator, so a local equirectangular scale is accurate
    # to well under 1% for district-sized shapes.
    lat = geom.centroid.y
    return geom.area * KM_PER_DEG * KM_PER_DEG * math.cos(math.radians(lat))


def _round(coords, nd=3):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [_round(c, nd) for c in coords]


def prepare(geojson: dict, tolerance: float = 0.004) -> tuple[dict, dict[str, float]]:
    parts: dict[str, list] = defaultdict(list)
    names: dict[str, str] = {}
    for f in geojson["features"]:
        code = str(f["properties"]["DCode"])
        parts[code].append(shape(f["geometry"]).buffer(0))
        names[code] = f["properties"].get("District", code)

    merged = {code: unary_union(geoms) for code, geoms in parts.items()}
    areas = {code: _area_km2(g) for code, g in merged.items()}

    fc = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"code": code}, "geometry": mapping(g)}
            for code, g in merged.items()
        ],
    }
    topo = topojson.Topology(fc, prequantize=False, toposimplify=tolerance, prevent_oversimplify=True)
    simple = topo.to_geojson(validate=False, winding_order="CW_CCW")
    if isinstance(simple, str):
        import json

        simple = json.loads(simple)

    out = {"type": "FeatureCollection", "features": []}
    for f in simple["features"]:
        code = str(f["properties"]["code"])
        geom = f["geometry"]
        out["features"].append(
            {"type": "Feature", "properties": {"name": code}, "geometry": {"type": geom["type"], "coordinates": _round(geom["coordinates"])}}
        )
    return out, areas
