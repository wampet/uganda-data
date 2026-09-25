"""Census 2024 below the district: every sub-county (divisions, in cities).

For each district in census.json: counties -> sub-counties, each sub-county's
profile (same 15 tables as districts; indicators computed with the same
census.profile_values), and sub-county boundaries.

Writes
  web/src/data/subcounties.json           {district_code: [sub-county rows]}
  web/public/geo/subcounties/<code>.json  simplified boundaries, one file per
                                          district, fetched only by that page

Check: each district's sub-county populations must add up to the district's;
mismatches are recorded in `notes` (and fail the build if large).
"""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from pathlib import Path

import topojson
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from . import census

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data" / "subcounties.json"
GEO_DIR = ROOT / "web" / "public" / "geo" / "subcounties"
CENSUS_JSON = ROOT / "web" / "src" / "data" / "census.json"
KM_PER_DEG = 111.32


def _area_km2(g) -> float:
    return g.area * KM_PER_DEG * KM_PER_DEG * math.cos(math.radians(g.centroid.y))


def _round(coords, nd=4):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [_round(c, nd) for c in coords]


def _shapes(district_code: str) -> tuple[dict, dict[str, float]]:
    """Simplified sub-county GeoJSON for one district (feature name = sub-county code) and areas."""
    gj = census._get(f"get_geospatial_data.php?level=subcounty&district_code={district_code}")["geojson"]
    parts: dict[str, list] = defaultdict(list)
    for f in gj["features"]:
        pr = f["properties"]
        code = (pr.get("population_data") or {}).get("code") or f"{pr['DCode']}{pr['CCode']}{str(pr['SCode']).zfill(2)}"
        parts[str(code)].append(shape(f["geometry"]).buffer(0))
    merged = {c: unary_union(g) for c, g in parts.items()}
    areas = {c: _area_km2(g) for c, g in merged.items()}
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"code": c}, "geometry": mapping(g)} for c, g in merged.items()
    ]}
    topo = topojson.Topology(fc, prequantize=False, toposimplify=0.0015, prevent_oversimplify=True)
    simple = topo.to_geojson(validate=False, winding_order="CW_CCW")
    if isinstance(simple, str):
        simple = json.loads(simple)
    out = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": str(f["properties"]["code"])},
         "geometry": {"type": f["geometry"]["type"], "coordinates": _round(f["geometry"]["coordinates"])}}
        for f in simple["features"]
    ]}
    return out, areas


def build(limit: int | None = None) -> dict:
    districts = json.loads(CENSUS_JSON.read_text(encoding="utf-8"))["districts"]
    if limit:
        districts = districts[:limit]
    GEO_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, list] = {}
    notes: list[str] = []
    total_sc = 0
    t0 = time.time()
    for n, d in enumerate(districts, 1):
        code = d["code"]
        rows = []
        for county in census._get(f"get_counties.php?district_code={code}"):
            for sc in census._get(f"get_subcounties.php?county_code={county['code']}"):
                prof = census.fetch_profile(sc["code"], level=3)
                rows.append({"code": sc["code"], "name": census_title(sc["name"]), "county": census_title(county["name"]), "profile": prof})
                time.sleep(0.03)
        try:
            shapes, areas = _shapes(code)
            (GEO_DIR / f"{code}.json").write_text(json.dumps(shapes, separators=(",", ":")), encoding="utf-8")
        except Exception as e:  # boundaries are optional; the table still works without a map
            areas = {}
            notes.append(f"No sub-county map for {census_title(d['name'])} ({type(e).__name__}).")
        out_rows = []
        for r in rows:
            vals = census.profile_values(r["profile"], areas.get(r["code"]))
            out_rows.append({"code": r["code"], "name": r["name"], "county": r["county"], "area_km2": round(areas.get(r["code"], 0), 1), "values": vals})
        # Check: sub-counties add up to the district. Where UBOS's portal has no
        # figures for some sub-counties (it shows "#N/A"), say so instead.
        blank = [r["name"] for r in out_rows if r["values"].get("population") is None]
        sc_pop = sum(r["values"].get("population") or 0 for r in out_rows)
        dist_pop = d["values"].get("population") or 0
        if blank:
            notes.append(
                f"{census_title(d['name'])}: UBOS’s census portal has no figures for {len(blank)} sub-count{'y' if len(blank) == 1 else 'ies'} "
                f"({', '.join(blank)}), so they are blank here."
            )
        elif dist_pop and abs(sc_pop - dist_pop) / dist_pop > 0.005:
            gap = abs(sc_pop - dist_pop) / dist_pop
            msg = f"{census_title(d['name'])}: sub-counties add up to {sc_pop:,.0f} people, the district total is {dist_pop:,.0f}."
            if gap > 0.05:
                raise ValueError(f"subcounties: {msg}")
            notes.append(msg)
        result[code] = sorted(out_rows, key=lambda r: r["name"])
        total_sc += len(out_rows)
        if n % 10 == 0 or n == len(districts):
            print(f"    {n}/{len(districts)} districts, {total_sc} sub-counties ({time.time() - t0:.0f}s)", flush=True)

    data = {
        "source": {"title": "National Population and Housing Census 2024 (sub-county profiles)", "url": "https://statistics.ubos.org/nphc/drilldown"},
        "notes": notes,
        "districts": result,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB), {total_sc} sub-counties, {len(notes)} notes")
    return data


def census_title(s: str) -> str:
    """'KAMPALA CENTRAL DIVISION' -> 'Kampala Central Division'."""
    return " ".join(w.capitalize() if not w.isdigit() else w for w in str(s).split())
