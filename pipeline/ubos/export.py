"""Write the parsed data into the website's data folder (web/src/data).

The site reads these JSON files at build time; each page embeds only the slice
it needs, so file size here never becomes page weight.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import catalog as catalog_mod
from . import census, geo
from .http import get_file
from .parsers import cpi, population
from .taxonomy import SECTIONS

ROOT = Path(__file__).resolve().parents[2]
WEB_DATA = ROOT / "web" / "src" / "data"

# Price moves bigger than this are almost always a data quirk (e.g. an item
# reintroduced after a gap), not news. Keep them in the data, never in headlines.
OUTLIER_PCT = 150


def _write(name: str, obj) -> None:
    path = WEB_DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def build_catalog(records: list[dict]) -> None:
    slim = [
        {k: r[k] for k in ("id", "title", "url", "format", "kind", "updated", "topic", "family")}
        for r in records
    ]
    _write("catalog.json", slim)
    _write("taxonomy.json", SECTIONS)


def build_cpi(records: list[dict]) -> None:
    releases = [r for r in records if r["family"] == "cpi" and r["kind"] == "dataset" and r["format"] == "xlsx"]
    latest = max(releases, key=lambda r: r["updated"] or "")
    print(f"  CPI source: {latest['title']} ({latest['updated']})")
    data = cpi.parse(get_file(latest["url"]))
    data["source"] = {"title": latest["title"], "url": latest["url"], "updated": latest["updated"]}

    for s in data["series"].values():
        latest_yoy = s["yoy"][-1]
        s["outlier"] = latest_yoy is not None and abs(latest_yoy) > OUTLIER_PCT
        s.pop("mom", None)  # the site shows annual rates; monthly adds weight, not insight
    _write("indicators/cpi.json", data)


def build_census() -> None:
    districts, profiles, geojson = census.fetch_all()
    shapes, areas = geo.prepare(geojson)
    _write("census.json", census.build(districts, profiles, areas))
    # Boundaries are served as a static file and fetched only when a map renders.
    path = ROOT / "web" / "public" / "geo" / "districts.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(shapes, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


def _dataset(records: list[dict], title_start: str) -> dict:
    """Most recent dataset whose title starts with `title_start` (case-insensitive)."""
    hits = [r for r in records if r["kind"] == "dataset" and r["title"].lower().startswith(title_start.lower())]
    if not hits:
        raise ValueError(f"no UBOS dataset titled '{title_start}...'")
    return max(hits, key=lambda r: r["updated"] or "")


def _src(r: dict) -> dict:
    return {"title": r["title"], "url": r["url"], "updated": r["updated"]}


def build_population(records: list[dict]) -> None:
    proj_src = _dataset(records, "National Mid Year Population Projections by Single Age")
    hist_src = _dataset(records, "Population Inter-censal growth rates")
    life_src = _dataset(records, "Life Expectancy at Birth by Census Year")
    sa = population.parse_single_age(get_file(proj_src["url"]))

    # 5-year bands for the pyramid: 0-4 ... 75-79, 80+
    bands = [f"{a}–{a + 4}" for a in range(0, 80, 5)] + ["80+"]
    def banded(block):
        out = [[0] * len(sa["years"]) for _ in bands]
        for ai, row in enumerate(block):
            b = min(ai // 5, len(bands) - 1)
            for y, v in enumerate(row):
                out[b][y] += v
        return out

    # Per-year summary statistics from single ages.
    stats = []
    for y, year in enumerate(sa["years"]):
        by_age = [m[y] + f[y] for m, f in zip(sa["male"], sa["female"])]  # index = age (80 = 80+)
        total = sum(by_age)
        half, run, median = total / 2, 0, None
        for age, n in enumerate(by_age):
            if run + n >= half:
                median = age + (half - run) / n  # interpolate within the single year
                break
            run += n
        under15 = sum(by_age[:15])
        under18 = sum(by_age[:18])
        over65 = sum(by_age[65:])
        working = total - under15 - over65
        stats.append({
            "year": year,
            "total": total,
            "male": sum(m[y] for m in sa["male"]),
            "female": sum(f[y] for f in sa["female"]),
            "median_age": round(median, 1),
            "under15_pct": round(100 * under15 / total, 1),
            "under18_pct": round(100 * under18 / total, 1),
            "over65_pct": round(100 * over65 / total, 1),
            "youth_18_30_pct": round(100 * sum(by_age[18:31]) / total, 1),
            "dependency_ratio": round(100 * (under15 + over65) / working, 1),
        })

    history = population.parse_census_history(get_file(hist_src["url"]))
    census_2024 = next(h for h in history if h["year"] == 2024)
    projected_2024 = next(s for s in stats if s["year"] == 2024)

    _write("population.json", {
        "sources": {"projections": _src(proj_src), "history": _src(hist_src), "life": _src(life_src)},
        "pyramid": {"years": sa["years"], "bands": bands, "male": banded(sa["male"]), "female": banded(sa["female"])},
        "stats": stats,
        "history": history,
        "life": population.parse_life_expectancy(get_file(life_src["url"])),
        "projection_check": {
            "year": 2024,
            "projected": projected_2024["total"],
            "census": census_2024["total"],
            "diff_pct": round(100 * (projected_2024["total"] - census_2024["total"]) / census_2024["total"], 1),
        },
    })


def build(refresh: bool = False) -> None:
    records = catalog_mod.crawl(refresh=refresh)
    build_catalog(records)
    build_cpi(records)
    build_census()
    build_population(records)
