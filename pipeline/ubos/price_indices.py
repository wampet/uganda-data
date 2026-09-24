"""House prices (RPPI), construction input prices (CIPI) and producer prices (PPI).

Takes the newest release of each family from the catalog (each carries the full
history), parses and checks it (see parsers/indices.py), and writes
web/src/data/indices.json. Recurring: these update monthly/quarterly, so a
pipeline re-run picks up new releases automatically.
"""

from __future__ import annotations

import json
from pathlib import Path

from .http import get_file
from .parsers import indices

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data" / "indices.json"
CATALOG = ROOT / "pipeline" / "data" / "catalog.json"

# Plain names for UBOS's ISIC division labels in the PPI.
PPI_NAMES = {
    "MANUFACTURING & UTILITIES": "All factories & utilities",
    "MANUFACTURING": "Manufacturing",
    "UTILITIES": "Utilities (power, water, waste)",
    "MANUFACTURE OF FOOD PRODUCTS": "Food products",
    "Manufacture of beverages": "Drinks",
    "Manufacture of tobacco products": "Tobacco",
    "MANUFACTURE OF TEXTILES": "Textiles",
    "MANUFACTURE OF WEARING APPAREL": "Clothing",
    "MANUFACTURE OF LEATHER & RELATED PRODUCTS": "Leather & shoes",
    "MANUFACTURE OF WOOD AND PRODUCTS OF WOOD, CORK, EXCEPT FURNITURE": "Wood products",
    "Manufacture of paper and paper products": "Paper",
    "PRINTING AND REPRODUCTION OF RECORDED MEDIA": "Printing",
    "Manufacture of chemicals and chemical products": "Chemicals, soap & paint",
    "Manufacture of pharmaceuticals, medicinal chemical and botanical products": "Medicines",
    "Manufacture of rubber and plastics products": "Rubber & plastics",
    "MANUFACTURE OF OTHER NON-METALLIC MINERAL PRODUCTS": "Cement, glass & bricks",
    "Manufacture of basic metals": "Steel & basic metals",
    "Manufacture of other fabricated metal products; metalworking service activities": "Metal products",
    "Manufacture of electrical equipment": "Electrical equipment",
    "Manufacture of furniture": "Furniture",
    "ELECTRICITY GENERATION": "Electricity",
    "WATER SUPPLY; SEWERAGE, WASTE MANAGEMENT AND REMEDIATION ACTIVITIES": "Water & waste",
    "Sewerage": "Sewerage",
    "Waste collection, treatment and disposal activities; materials recovery": "Waste collection",
}

CIPI_NAMES = {
    "Aggregate, hardcore, crushed or broken stone": "Aggregate & hardcore",
    "Nails, bolts, screws and similar of iron, steel, copper or aluminium": "Nails, bolts & screws",
    "Timber, coniferous, greater than 6mm thick": "Timber",
    "Sheet steel, roofing sheets and similar": "Roofing sheets & sheet steel",
    "High tensile steel bars": "Steel bars",
}


def _latest(family: str) -> dict:
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    rs = [r for r in cat if r["family"] == family and r["kind"] == "dataset" and r["format"] == "xlsx"]
    if not rs:
        raise ValueError(f"no {family} releases in the catalog")
    return max(rs, key=lambda r: r["updated"] or "")


def _src(r):
    return {"title": r["title"], "url": r["url"], "updated": r["updated"]}


def build() -> dict:
    r_src, c_src, p_src = _latest("rppi"), _latest("cipi"), _latest("ppi")
    rppi = indices.parse_rppi(get_file(r_src["url"]))
    cipi = indices.parse_cipi(get_file(c_src["url"]))
    ppi = indices.parse_ppi(get_file(p_src["url"]))

    # CIPI: keep the four overall indices and the product lines of "All construction".
    allc = cipi["kinds"]["All construction"]["items"]
    products = {
        CIPI_NAMES.get(name, name): {"weight": it["weight"], "index": it["index"], "yoy": it["yoy"]}
        for name, it in allc.items()
    }
    cipi_out = {
        "months": cipi["months"],
        "base": cipi["base"],
        "overall": {k: {"index": v["overall"], "yoy": v["overall_yoy"]} for k, v in cipi["kinds"].items()},
        "products": products,
    }

    ppi_out = {
        "months": ppi["months"],
        "base": ppi["base"],
        "series": {
            PPI_NAMES.get(name.strip(), name.strip()): {**s, "official": name.strip()}
            for name, s in ppi["series"].items()
        },
        "headline": PPI_NAMES.get(ppi["headline"].strip(), ppi["headline"].strip()),
    }

    data = {
        "rppi": {**rppi, "source": _src(r_src)},
        "cipi": {**cipi_out, "source": _src(c_src)},
        "ppi": {**ppi_out, "source": _src(p_src)},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    return data
