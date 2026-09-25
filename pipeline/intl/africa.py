"""Africa map and latest values for every African country.

- Boundaries: Natural Earth 1:110m admin-0 countries (public domain),
  simplified, features named by ISO3 -> web/public/geo/africa.json
- Latest actual value per African country for each measure, for the
  compare explorer's Map tab.
"""

from __future__ import annotations

import json
from pathlib import Path

import topojson
from shapely.geometry import mapping, shape

from ubos.http import get_text

ROOT = Path(__file__).resolve().parents[2]
GEO_OUT = ROOT / "web" / "public" / "geo" / "africa.json"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"


def _round(coords, nd=2):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [_round(c, nd) for c in coords]


def build_geo() -> dict[str, str]:
    """Write the Africa map; return {ISO3: country name}."""
    world = json.loads(get_text(NE))
    feats, names = [], {}
    for f in world["features"]:
        p = f["properties"]
        if p["CONTINENT"] != "Africa":
            continue
        iso = p["ISO_A3"] if p["ISO_A3"] not in ("-99", None) else p["ADM0_A3"]
        names[iso] = p["NAME"]
        feats.append({"type": "Feature", "properties": {"name": iso}, "geometry": mapping(shape(f["geometry"]).buffer(0))})
    if len(feats) < 45:
        raise ValueError(f"africa: only {len(feats)} African countries in Natural Earth")
    topo = topojson.Topology({"type": "FeatureCollection", "features": feats}, prequantize=False, toposimplify=0.05, prevent_oversimplify=True)
    simple = topo.to_geojson(validate=False, winding_order="CW_CCW")
    if isinstance(simple, str):
        simple = json.loads(simple)
    out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": f["properties"]["name"]},
         "geometry": {"type": f["geometry"]["type"], "coordinates": _round(f["geometry"]["coordinates"])}}
        for f in simple["features"]
    ]}
    GEO_OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {GEO_OUT.relative_to(ROOT)} ({GEO_OUT.stat().st_size / 1024:.0f} KB), {len(feats)} countries")
    return names


def latest_all(source: str, code: str, isos: set[str], proj_from: int | None, refresh: bool = False) -> dict[str, list]:
    """{ISO3: [year, value]}: each African country's newest actual value."""
    out: dict[str, list] = {}
    if source == "wb":
        meta, rows = json.loads(get_text(
            f"https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&mrnev=1&per_page=500", refresh=refresh))[:2]
        for r in rows or []:
            if r["countryiso3code"] in isos and r["value"] is not None:
                out[r["countryiso3code"]] = [int(r["date"]), float(r["value"])]
    elif source == "imf":
        values = json.loads(get_text(f"https://www.imf.org/external/datamapper/api/v1/{code}", refresh=refresh))["values"][code]
        for iso in isos:
            ys = {int(y): v for y, v in (values.get(iso) or {}).items() if v is not None and (proj_from is None or int(y) < proj_from)}
            if ys:
                y = max(ys)
                out[iso] = [y, float(ys[y])]
    elif source == "who":
        rows = json.loads(get_text(f"https://ghoapi.azureedge.net/api/{code}", refresh=refresh))["value"]
        for r in rows:
            if r.get("Dim1") not in (None, "", "SEX_BTSX") or r.get("Dim2") not in (None, ""):
                continue
            iso, v = r["SpatialDim"], r.get("NumericValue")
            if iso in isos and v is not None and (iso not in out or int(r["TimeDim"]) > out[iso][0]):
                out[iso] = [int(r["TimeDim"]), float(v)]
    return out
