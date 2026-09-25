"""National Livestock Census 2021: district indicators for the district map.

Reads the district tables ("Tab x.x.2") of the census chapters, matches the
districts to the 2024 population census codes by name, and writes
web/src/data/livestock.json with per-district, sub-region and national values.
Rates are computed from summed counts (never averaged), and animals are shown
per 100 people using the 2024 census population, so districts compare fairly.

Checks: most districts must match the 2024 census; every unmatched name is
reported in the output notes rather than silently dropped.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import openpyxl

from .http import get_file
from .parsers.wide import num

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data" / "livestock.json"
CATALOG = ROOT / "pipeline" / "data" / "catalog.json"
CENSUS = ROOT / "web" / "src" / "data" / "census.json"

CHAPTERS = {
    "households": ("8d4b1b09372f", "Tab 2.1.2"),
    "cattle": ("b785efeecbe1", "Tab 3.2.2"),
    "goats": ("10a2383867a6", "Tab 4.2.2"),
    "pigs": ("5852f582affc", "Tab 6.2.2"),
    "chickens": ("5103de79ea14", "Tab 7.2.2"),
    "honey": ("d4638ef12ac8", "Tab 10.2.2"),
}


# 2021 livestock-census spellings that differ from the 2024 population census.
ALIASES = {"LUWERO": "LUWEERO"}

# The 2021 livestock census has no rows for cities (or Terego): their animals are
# counted in the parent district (its 135 district rows sum exactly to its
# national totals). Per-person rates for a parent therefore use the combined
# population of the parent and these areas.
INCLUDED_IN = {
    "ARUA": ["ARUA CITY", "TEREGO"],
    "GULU": ["GULU CITY"],
    "KABAROLE": ["FORT PORTAL CITY"],
    "HOIMA": ["HOIMA CITY"],
    "JINJA": ["JINJA CITY"],
    "LIRA": ["LIRA CITY"],
    "MASAKA": ["MASAKA CITY"],
    "MBALE": ["MBALE CITY"],
    "MBARARA": ["MBARARA CITY"],
    "SOROTI": ["SOROTI CITY"],
}


def _norm(name: str) -> str:
    """'Madi-Okollo' / 'MADI OKOLLO ' -> 'MADI OKOLLO'; applies ALIASES."""
    s = re.sub(r"[^A-Z ]", " ", str(name).upper())
    s = re.sub(r"\s+", " ", s).strip().replace(" DISTRICT", "")
    return ALIASES.get(s, s)


def district_table(path, sheet: str) -> tuple[list[str], dict[str, list]]:
    """Return (column names, {district: row values}) for a Livestock Census district table.

    Column names join the two header rows above the data (merged cells carried
    across), e.g. "Total Number of Cattle" or "Indigenous cattle / Indigenous, Number".
    """
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    rows = [list(r) for r in wb[sheet].iter_rows(values_only=True)]
    hdr = next(i for i, r in enumerate(rows) if any(str(c).strip().lower() == "district" for c in r if c))
    dcol = next(j for j, c in enumerate(rows[hdr]) if c and str(c).strip().lower() == "district")
    top = rows[hdr - 1] if any(c for c in rows[hdr - 1][dcol + 1:]) else [None] * len(rows[hdr])
    # The header row with "District" may be the upper or the lower of the two.
    below = rows[hdr + 1] if hdr + 1 < len(rows) and not any(num(c) is not None for c in rows[hdr + 1][dcol + 1:]) else None
    pairs = [(top, rows[hdr])] if below is None else [(rows[hdr], below)]
    upper, lower = pairs[0]
    names, carry = [], ""
    for j in range(len(rows[hdr])):
        u = " ".join(str(upper[j]).split()) if j < len(upper) and upper[j] else ""
        carry = u or carry
        lo = " ".join(str(lower[j]).split()) if j < len(lower) and lower[j] else ""
        names.append(" / ".join(x for x in (carry if not lo or carry != lo else "", lo) if x) or carry)
    start = hdr + (2 if below is not None else 1)
    out = {}
    for r in rows[start:]:
        d = r[dcol] if dcol < len(r) else None
        if d and str(d).strip() and any(num(c) is not None for c in r[dcol + 1:]):
            out[_norm(d)] = r
    return names, out


# Sub-region tables whose "UGANDA" row is used to settle a disagreement between a
# district table's own national row and the sum of its districts.
SUBREGION_TOTALS = {"pigs": ("5852f582affc", "Tab 6.2.1")}


def _subregion_national(path, sheet: str) -> float | None:
    """The 'UGANDA' row's first number in a sub-region table."""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    for r in wb[sheet].iter_rows(values_only=True):
        if r and r[0] and str(r[0]).strip().upper() == "UGANDA":
            return next((num(c) for c in r[1:] if num(c) is not None), None)
    return None


def _col(names: list[str], *needles: str) -> int:
    for j, n in enumerate(names):
        if all(x.lower() in n.lower() for x in needles):
            return j
    raise KeyError(f"no column containing {needles} in {names}")


def build() -> dict:
    catalog = {r["id"]: r for r in json.loads(CATALOG.read_text(encoding="utf-8"))}
    census = json.loads(CENSUS.read_text(encoding="utf-8"))
    by_name = {_norm(d["name"]): d for d in census["districts"]}
    sources = []

    def table(key):
        cid, sheet = CHAPTERS[key]
        r = catalog[cid]
        src = {"title": r["title"], "url": r["url"], "updated": r["updated"]}
        if src not in sources:
            sources.append(src)
        return district_table(get_file(r["url"]), sheet)

    counts: dict[str, dict[str, float]] = {}  # district code -> raw counts
    unmatched: set[str] = set()
    national_rows: dict[str, float] = {}

    def put(name, field, value):
        if name == "UGANDA":  # national total row: used as a check below, not a district
            national_rows.setdefault(field, value)
            return
        d = by_name.get(name)
        if d is None:
            unmatched.add(name)
            return
        if value is not None:
            counts.setdefault(d["code"], {})[field] = value

    names, rows = table("households")
    c_hh, c_lhh = _col(names, "HHs"), _col(names, "Livestock keeping", "Number")
    for n, r in rows.items():
        put(n, "households", num(r[c_hh]))
        put(n, "livestock_households", num(r[c_lhh]))

    names, rows = table("cattle")
    c_tot, c_exo = _col(names, "Total Number of Cattle"), _col(names, "Exotic or cross, Number")
    for n, r in rows.items():
        put(n, "cattle", num(r[c_tot]))
        put(n, "exotic_cattle", num(r[c_exo]))

    names, rows = table("goats")
    c_ind, c_exo = _col(names, "Indigenous,  Number") if any("Indigenous,  Number" in x for x in names) else _col(names, "Indigenous", "Number"), _col(names, "Exotic or cross", "Number")
    for n, r in rows.items():
        put(n, "goats", (num(r[c_ind]) or 0) + (num(r[c_exo]) or 0))

    names, rows = table("pigs")
    c_num = _col(names, "Number")
    for n, r in rows.items():
        put(n, "pigs", num(r[c_num]))

    names, rows = table("chickens")
    c_ind, c_exo = _col(names, "Indigenous", "Number"), _col(names, "Exotic", "Number")
    for n, r in rows.items():
        put(n, "chickens", (num(r[c_ind]) or 0) + (num(r[c_exo]) or 0))

    names, rows = table("honey")
    c_kg = _col(names, "Total production")
    for n, r in rows.items():
        put(n, "honey_kg", num(r[c_kg]))

    # Check: districts add up to the livestock census's own national totals. If a
    # district table's "UGANDA" row disagrees, the sub-region table's total decides:
    # agreeing with the districts means the district table's national row is a typo.
    source_notes = []
    for field, nat in national_rows.items():
        total = sum(c.get(field) or 0 for c in counts.values())
        if not nat or abs(total - nat) / nat <= 0.005:
            continue
        alt = SUBREGION_TOTALS.get(field)
        alt_total = _subregion_national(get_file(catalog[alt[0]]["url"]), alt[1]) if alt else None
        if alt_total and abs(total - alt_total) / alt_total <= 0.005:
            source_notes.append(
                f"UBOS’s district table for {field} shows {nat:,.0f} in its Uganda row, but its districts and its "
                f"sub-region table both give {alt_total:,.0f}; we use the latter."
            )
            continue
        raise ValueError(f"livestock: districts sum to {total:,.0f} {field}, national row says {nat:,.0f}")

    pop = {d["code"]: d["values"].get("population") for d in census["districts"]}
    code_of = {_norm(d["name"]): d["code"] for d in census["districts"]}
    included_note = []
    for parent, children in INCLUDED_IN.items():
        pc = code_of.get(parent)
        kids = [code_of[k] for k in children if k in code_of]
        if pc and kids:
            pop[pc] = (pop.get(pc) or 0) + sum(pop.get(k) or 0 for k in kids)
            included_note.append(f"{parent.title()} includes {', '.join(k.title() for k in children if k in code_of)}")
    matched = len(counts)
    if matched < 0.8 * len(census["districts"]):
        raise ValueError(f"livestock: only {matched} of {len(census['districts'])} districts matched")

    INDICATORS = [
        # id, label, question, unit, numerator, denominator(or 'pop'), scale
        ("livestock_hh", "Households keeping livestock", "Who keeps animals?", "%", "livestock_households", "households", 100),
        ("cattle_per_100", "Cattle per 100 people", "Where are the cattle?", "per 100 people", "cattle", "pop", 100),
        ("goats_per_100", "Goats per 100 people", "Where are the goats?", "per 100 people", "goats", "pop", 100),
        ("chickens_per_100", "Chickens per 100 people", "Where are the chickens?", "per 100 people", "chickens", "pop", 100),
        ("pigs_per_100", "Pigs per 100 people", "Where are the pigs?", "per 100 people", "pigs", "pop", 100),
        ("exotic_cattle", "Cattle that are exotic or cross-bred", "Where are the dairy and improved breeds?", "%", "exotic_cattle", "cattle", 100),
        ("honey_kg", "Honey harvested (kg, 6 months)", "Where does honey come from?", "kg", "honey_kg", None, 1),
    ]

    def value(sumfn, num_field, den_field, scale):
        n = sumfn(num_field)
        if den_field is None:
            return n
        d = sumfn("__pop__") if den_field == "pop" else sumfn(den_field)
        return scale * n / d if n is not None and d else None

    def summer(codes):
        def f(field):
            vals = [pop.get(c) if field == "__pop__" else counts.get(c, {}).get(field) for c in codes if c in counts]
            vals = [v for v in vals if v is not None]
            return sum(vals) if vals else None
        return f

    def values_for(codes):
        f = summer(codes)
        return {iid: (round(v, 1) if (v := value(f, n, d, s)) is not None else None) for iid, _l, _q, _u, n, d, s in INDICATORS}

    districts = {code: values_for([code]) for code in counts}
    subregions = {sr["code"]: values_for(sr["districts"]) for sr in census["subregions"]}
    national = values_for(list(counts))

    notes = [
        "From the National Livestock Census 2021. Animals per 100 people use the 2024 population census, three years "
        "later, so they slightly understate animals per person where populations grew fast."
    ]
    notes.append(
        "The 2021 livestock census counts cities (and Terego) inside their parent districts, so those areas are blank "
        "on the map and the parent’s figures use the combined population: " + "; ".join(included_note) + "."
    )
    covered = {code_of[k] for kids in INCLUDED_IN.values() for k in kids if k in code_of}
    missing = [d["name"] for d in census["districts"] if d["code"] not in counts and d["code"] not in covered]
    if missing:
        notes.append(f"No livestock-census figure for: {', '.join(sorted(n.title() for n in missing))}.")

    data = {
        "sources": sources,
        "indicators": [
            {"id": i, "label": l, "question": q, "group": "Farming", "unit": u, "better": None}
            for i, l, q, u, _n, _d, _s in INDICATORS
        ],
        "districts": districts,
        "subregions": subregions,
        "national": national,
        "notes": notes + source_notes,
        "unmatched_livestock_names": sorted(unmatched),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB); {matched} districts matched, "
          f"{len(missing)} census districts without livestock data, {len(unmatched)} livestock names unmatched")
    return data
