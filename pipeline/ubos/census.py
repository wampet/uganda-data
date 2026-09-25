"""National Population and Housing Census 2024: district profiles and boundaries.

Source: the JSON API behind UBOS's census portal (statistics.ubos.org/nphc).
  get_subregions.php                  -> 17 sub-regions
  get_districts.php?subregion_code=   -> districts and cities in each sub-region
  get_profile_data.php?level=1&location_code=<district>&format=detailed
                                      -> ~15 tables of counts per district
  get_geospatial_data.php?level=district
                                      -> GeoJSON boundaries (+ population)

We store raw counts per district and derive rates from them (e.g. % of
households on grid power) so districts of different sizes compare fairly. Where
UBOS publishes a rate with its own base (unemployment, NEET) we use theirs.
Rates for sub-regions and the nation are computed from summed counts, never by
averaging district rates.

Known source problems we guard against:
  * "Mobile Phone Ownership" returns the same numbers as "Internet Usage".
    We detect that and drop phone ownership rather than publish wrong data.
"""

from __future__ import annotations

import json
import time

from .http import get_text

API = "https://statistics.ubos.org/nphc/api/"

# Official NPHC 2024 final count, used to sanity-check the district sum.
NATIONAL_POPULATION_2024 = 45_905_417


def _get(path: str) -> dict | list:
    return json.loads(get_text(API + path))


def fetch_districts() -> list[dict]:
    out = []
    for sr in _get("get_subregions.php"):
        for d in _get(f"get_districts.php?subregion_code={sr['code']}"):
            out.append({"code": d["code"], "name": d["name"], "subregion_code": sr["code"], "subregion": sr["name"]})
    return out


def fetch_profile(code: str, level: int = 1) -> dict[str, dict]:
    """Flatten an area profile into {table_name: {column: value}}.
    level: 1 district, 2 county, 3 sub-county, 4 parish (the census portal's levels)."""
    raw = _get(f"get_profile_data.php?level={level}&location_code={code}&format=detailed")
    tables = {}
    for t in raw["data"].values():
        rec = t["records"][0] if t["records"] else {}
        tables[t["table_name"]] = {c: rec.get(c) for c in t["columns"]}
    return tables


# ---- indicators ------------------------------------------------------------
# Each indicator: numerator and denominator as (table, column), plus how to show
# it. Rates are "per 100" of the denominator, except unit "people" (a plain
# ratio). A denominator of ("rate", <count column>) means UBOS publishes the
# percentage itself; we use it as-is for districts, and for aggregates we
# recover UBOS's own base from count / rate so totals match their method.
# `better` says which direction is good; it only affects the wording of
# generated facts, never the colours.
INDICATORS = [
    # id, label, short question, group, numerator, denominator, unit, better
    ("population", "Population", "How many people live here?", "People",
     ("Population by Sex", "total"), None, "people", None),
    ("density", "People per km²", "How crowded is it?", "People",
     ("Population by Sex", "total"), "area_km2", "per km²", None),
    ("children", "Children (0–17)", "What share of people are children?", "People",
     ("Age Groups", "age_0_17"), ("Population by Sex", "total"), "%", None),
    ("hh_size", "Household size", "How many people per household?", "People",
     ("Household Size", "household_population"), ("Household Size", "households"), "people", None),
    ("out_of_school", "Children 6–12 out of school", "Are children in primary school?", "Education",
     ("Children Out of School", "out_of_school_6_12"), ("Children Out of School", "population_6_12"), "%", "lower"),
    ("out_of_school_teen", "Teens 13–17 out of school", "Are teenagers in school?", "Education",
     ("Children Out of School", "out_of_school_13_17"), ("Children Out of School", "population_13_17"), "%", "lower"),
    ("neet", "Youth 18–30 not in work, school or training", "Are young people busy?", "Jobs",
     ("Unemployment & NEET", "neet_18_30_percent"), ("rate", "neet_18_30_number"), "%", "lower"),
    ("unemployment", "Unemployment (14–64)", "How many can't find work?", "Jobs",
     ("Unemployment & NEET", "unemployment_14_64_percent"), ("rate", "unemployment_14_64_number"), "%", "lower"),
    ("subsistence", "Households in subsistence farming", "How many live off their own farming?", "Jobs",
     ("Subsistence & PDM", "households_subsistence_economy"), ("Subsistence & PDM", "total_households"), "%", "lower"),
    ("pdm", "Households that got PDM support", "Who has benefited from the Parish Development Model?", "Jobs",
     ("Subsistence & PDM", "households_benefited_pdm"), ("Subsistence & PDM", "total_households"), "%", "higher"),
    ("grid", "Households on grid electricity", "Who has power from the grid?", "Homes",
     ("Lighting", "grid_electricity"), ("Lighting", "total_households"), "%", "higher"),
    ("solar", "Households lighting with solar", "Who relies on solar?", "Homes",
     ("Lighting", "solar"), ("Lighting", "total_households"), "%", None),
    ("water", "Households with safe drinking water", "Who has an improved water source?", "Homes",
     ("Water & Sanitation", "improved_water_source"), ("Water & Sanitation", "total_households"), "%", "higher"),
    ("sanitation", "Households with improved toilets", "Who has improved sanitation?", "Homes",
     ("Water & Sanitation", "improved_sanitation"), ("Water & Sanitation", "total_households"), "%", "higher"),
    ("open_defecation", "Households with no toilet", "Who has no toilet at all?", "Homes",
     ("Water & Sanitation", "open_defecation"), ("Water & Sanitation", "total_households"), "%", "lower"),
    ("mosquito_net", "Households with a mosquito net", "Who sleeps under a net?", "Health",
     ("Health Indicators", "households_mosquito_net"), ("Household Size", "households"), "%", "higher"),
    ("insurance", "People with health insurance", "Who has health insurance?", "Health",
     ("Health Indicators", "persons_health_insurance"), ("Population by Sex", "total"), "%", "higher"),
    ("birth_cert", "People with a birth certificate", "Who has a birth certificate?", "Health",
     ("Birth Registration", "registered_with_certificate"), ("Birth Registration", "household_population"), "%", "higher"),
    ("internet", "Internet users (per 100 people)", "Who is online?", "Connected",
     ("Internet Usage", "total"), ("Population by Sex", "total"), "%", "higher"),
    ("radio", "Households with a radio", "Who owns a radio?", "Connected",
     ("ICT Devices", "radio"), ("Household Size", "households"), "%", None),
    ("tv", "Households with a TV", "Who owns a TV?", "Connected",
     ("ICT Devices", "television"), ("Household Size", "households"), "%", None),
]


def _val(profile: dict, ref) -> float | None:
    table, col = ref
    v = profile.get(table, {}).get(col)
    return float(v) if isinstance(v, int | float) else None


def indicator_values(counts_for, rate_for=None) -> dict[str, float | None]:
    """All INDICATORS for one area. `counts_for(ref)` returns a count (or "area" -> km²);
    `rate_for(pct_ref, count_col)` pools UBOS-published rates for aggregates."""
    out = {}
    for iid, _label, _q, _g, num, den, unit, _b in INDICATORS:
        n = counts_for(num) if not (isinstance(den, tuple) and den[0] == "rate") else None
        if den is None:
            v = n
        elif isinstance(den, tuple) and den[0] == "rate":
            v = rate_for(num, den[1]) if rate_for else counts_for(num)
        elif den == "area_km2":
            a = counts_for("area")
            v = n / a if n is not None and a else None
        else:
            d = counts_for(den)
            v = (n / d if unit == "people" else 100 * n / d) if n is not None and d else None
        out[iid] = None if v is None else round(v, 2 if unit == "people" and den else 1)
    return out


def profile_values(profile: dict, area_km2: float | None) -> dict[str, float | None]:
    """Indicators for a single area (district, sub-county, ...) from its profile tables."""
    return indicator_values(lambda ref: area_km2 if ref == "area" else _val(profile, ref))


def build(districts: list[dict], profiles: dict[str, dict], areas: dict[str, float]) -> dict:
    # ---- source checks
    total = sum(_val(profiles[d["code"]], ("Population by Sex", "total")) or 0 for d in districts)
    if abs(total - NATIONAL_POPULATION_2024) / NATIONAL_POPULATION_2024 > 0.01:
        raise ValueError(f"Census: district populations sum to {total:,.0f}, expected ~{NATIONAL_POPULATION_2024:,}")

    same = sum(
        1 for d in districts
        if profiles[d["code"]].get("Mobile Phone Ownership") == profiles[d["code"]].get("Internet Usage")
    )
    phone_table_broken = same > len(districts) * 0.5
    notes = []
    if phone_table_broken:
        notes.append("UBOS's mobile phone ownership table currently repeats the internet-use figures, so phone ownership is left out.")

    rows = []
    for d in districts:
        prof = profiles[d["code"]]
        vals = profile_values(prof, areas.get(d["code"]))
        rows.append({**d, "area_km2": round(areas.get(d["code"], 0), 1), "values": vals})

    # Aggregates from summed counts (unemployment: population-weighted by 14-64).
    def aggregate(members: list[dict]) -> dict:
        def summed(ref):
            if ref == "area":
                return sum(areas.get(m["code"], 0) for m in members)
            vals = [_val(profiles[m["code"]], ref) for m in members]
            return sum(v for v in vals if v is not None) if any(v is not None for v in vals) else None

        def pooled_rate(pct_ref, count_col):
            # UBOS gives count and % per district; the implied base is count / %.
            table = pct_ref[0]
            num = den = 0.0
            for m in members:
                p = profiles[m["code"]]
                n = _val(p, (table, count_col))
                r = _val(p, pct_ref)
                if n and r:
                    num += n
                    den += n / (r / 100)
            return 100 * num / den if den else None

        return indicator_values(summed, pooled_rate)

    subregions = {}
    for d in districts:
        subregions.setdefault(d["subregion_code"], {"code": d["subregion_code"], "name": d["subregion"], "members": []})
        subregions[d["subregion_code"]]["members"].append(d)
    sr_rows = [
        {"code": s["code"], "name": s["name"], "districts": [m["code"] for m in s["members"]], "values": aggregate(s["members"])}
        for s in subregions.values()
    ]

    return {
        "source": {
            "title": "National Population and Housing Census 2024",
            "url": "https://statistics.ubos.org/nphc/drilldown",
        },
        "notes": notes,
        "indicators": [
            {"id": i, "label": l, "question": q, "group": g, "unit": u, "better": b}
            for i, l, q, g, _n, _d, u, b in INDICATORS
        ],
        "national": aggregate(districts),
        "subregions": sorted(sr_rows, key=lambda r: r["name"]),
        "districts": sorted(rows, key=lambda r: r["name"]),
    }


def fetch_all() -> tuple[list[dict], dict[str, dict], dict]:
    districts = fetch_districts()
    print(f"  census: {len(districts)} districts/cities")
    profiles = {}
    for i, d in enumerate(districts, 1):
        profiles[d["code"]] = fetch_profile(d["code"])
        if i % 25 == 0:
            print(f"    profiles {i}/{len(districts)}")
        time.sleep(0.05)
    geo = _get("get_geospatial_data.php?level=district")["geojson"]
    return districts, profiles, geo
