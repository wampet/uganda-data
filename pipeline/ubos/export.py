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
from .parsers import cpi
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


def build(refresh: bool = False) -> None:
    records = catalog_mod.crawl(refresh=refresh)
    build_catalog(records)
    build_cpi(records)
    build_census()
