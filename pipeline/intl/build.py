"""Build web/src/data/world.json from the World Bank, IMF and WHO.

Checks: Uganda must have data for every indicator, and each indicator must
cover most places; figures are sanity-checked against simple bounds so a
changed API or unit fails the build instead of reaching a page.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from .config import AGG_LABEL_OVERRIDE, AGGREGATES, GROUPS, INDICATORS, PLACES, SOURCES, TOPICS
from .africa import build_geo, latest_all
from .fetch import FETCH

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data" / "world.json"

# Loose bounds per unit: a value outside means a unit or parsing change.
# Inflation gets its own range: DR Congo's 1990s hyperinflation passed 20,000%.
BOUNDS_BY_ID = {"inflation": (-60, 50000)}
BOUNDS = {"%": (-60, 1000), "% of GDP": (-100, 400), "% of people": (0, 100.5), "% of jobs": (0, 100.5), "% of land": (0, 100.5)}


def build(refresh: bool = False) -> dict:
    this_year = dt.date.today().year
    africa_names = build_geo()
    isos = set(africa_names)
    indicators = []
    for iid, source, code, label, unit, digits, topic, better, note in INDICATORS:
        series = FETCH[source](code, refresh=refresh)
        if "UGA" not in series:
            raise ValueError(f"world: no Uganda data for {iid} ({source} {code})")
        covered = [p for p in PLACES if p in series]
        if len(covered) < 0.6 * len(PLACES):
            raise ValueError(f"world: {iid} covers only {len(covered)} of {len(PLACES)} places")
        lo, hi = BOUNDS_BY_ID.get(iid) or BOUNDS.get(unit, (-1e15, 1e15))
        for p, ys in series.items():
            for y, v in ys.items():
                if not lo <= v <= hi:
                    raise ValueError(f"world: {iid} {p} {y} = {v} outside {lo}..{hi} ({unit})")
        years = sorted({y for ys in series.values() for y in ys})
        # IMF figures for the current year onwards are projections.
        proj_from = this_year if source == "imf" else None
        names = {**PLACES, **{k: v for k, v in AGG_LABEL_OVERRIDE.get(source, {}).items()}}
        latest = {p: max(ys) for p, ys in series.items()}
        indicators.append({
            "id": iid, "source": source, "code": code, "label": label, "unit": unit, "digits": digits,
            "topic": topic, "better": better, "note": note, "projFrom": proj_from,
            "names": {p: names[p] for p in series},
            "years": years,
            "values": {p: [round(series[p][y], 4) if y in series[p] else None for y in years] for p in PLACES if p in series},
            "latestYear": latest,
            # Every African country's newest actual value, for the Map tab.
            "africa": latest_all(source, code, isos, proj_from, refresh=refresh),
        })
        if "UGA" not in indicators[-1]["africa"]:
            raise ValueError(f"world: Africa map values for {iid} have no Uganda")
        print(f"    {iid:20} {source:3} {len(covered):2} places, {years[0]}–{years[-1]}")

    data = {
        "generated": dt.date.today().isoformat(),
        "sources": SOURCES,
        "places": [{"code": c, "name": n, "aggregate": c in AGGREGATES} for c, n in PLACES.items()],
        "groups": GROUPS,
        "topics": TOPICS,
        "indicators": indicators,
        "africaNames": africa_names,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB), {len(indicators)} indicators")
    return data
