"""Write the parsed data into the website's data folder (web/src/data).

The site reads these JSON files at build time; each page embeds only the slice
it needs, so file size here never becomes page weight.
"""

from __future__ import annotations

import json
from pathlib import Path

import openpyxl

from . import catalog as catalog_mod
from . import census, geo
from .http import get_file
from .parsers import cpi, gdp, population, tables, trade
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


def build_gdp(records: list[dict]) -> None:
    annual_src = max(
        (r for r in records if r["family"] == "agdp" and r["kind"] == "dataset" and r["format"] in ("xls", "xlsx")),
        key=lambda r: r["updated"] or "",
    )
    quarterly_src = max(
        (r for r in records if r["family"] == "qgdp" and r["kind"] == "dataset" and "constant" in r["title"].lower()),
        key=lambda r: r["updated"] or "",
    )
    print(f"  GDP sources: {annual_src['title']} | {quarterly_src['title']}")
    annual = gdp.parse_annual(get_file(annual_src["url"]))
    quarterly = gdp.parse_quarterly(get_file(quarterly_src["url"]))
    # Keep detailed activities only (drop the "Agriculture, forestry and fishing" total, ISIC "A").
    annual["activities"] = [a for a in annual["activities"] if a["isic"] != "A"]
    _write("gdp.json", {
        "sources": {"annual": _src(annual_src), "quarterly": _src(quarterly_src)},
        "annual": annual,
        "quarterly": quarterly,
    })


def _tidy_product(name: str) -> str:
    """'Fixed vegetable fats and oils, crude, refined...' -> 'Fixed vegetable fats and oils'."""
    special = {
        "gold, non-monetary": "Gold",
        "petroleum, petroleum products": "Fuel & petroleum products",
        "road vehicles": "Vehicles",
        "gold and gold compounds": "Gold",
        "other nes": "Other products",
    }
    low = name.lower()
    for k, v in special.items():
        if low.startswith(k):
            return v
    short = name.split(" (")[0].split(", ")[0].strip()
    return short[:1].upper() + short[1:]


def _tidy_country(name: str) -> str:
    special = {"D.R.CONGO": "DR Congo", "UNITED ARAB EMIRATES": "UAE", "UNITED KINGDOM": "UK",
               "UNITED STATES": "USA", "CONGO BR": "Congo (Brazzaville)", "HONG KONG": "Hong Kong"}
    return special.get(name.upper(), name.title())


REGION_NAMES = {
    "EAC": "East African Community", "REST OF AFRICA": "Rest of Africa", "EUROPEAN UNION": "European Union",
    "REST OF EUROPE": "Rest of Europe", "ASIA": "Asia", "MIDDLE EAST": "Middle East",
    "AMERICA": "The Americas", "REST OF THE WORLD": "Rest of the world",
}


def build_trade(records: list[dict]) -> None:
    def src(title_start):
        return _dataset(records, title_start)

    s_total, s_ecomp, s_icomp, s_edir, s_idir = (
        src("Total Monthly Merchandise trade"), src("Composition of Exports"), src("Composition of Imports"),
        src("Direction of Exports"), src("Direction of Imports"),
    )
    monthly = trade.parse_monthly(get_file(s_total["url"]))
    ecomp = trade.parse_composition(get_file(s_ecomp["url"]), "CY_Export Value Commodity")
    icomp = trade.parse_composition(get_file(s_icomp["url"]), "CY_Value SITC")
    edir = trade.parse_direction(get_file(s_edir["url"]), "CY Exports by Destination")
    idir = trade.parse_direction(get_file(s_idir["url"]), "CY_Imports by Origin")
    trade.cross_check(monthly, ecomp["total"], ecomp["years"], "exports", "exports")
    trade.cross_check(monthly, icomp["total"], icomp["years"], "imports", "imports")
    if ecomp["years"] != icomp["years"]:
        raise ValueError("trade: export and import year columns differ")

    years = ecomp["years"]
    m = lambda vals: [round(v / 1000, 1) for v in vals]  # US$ thousands -> millions

    def gold(items, pred):
        hit = [i for i in items if pred(i)]
        if len(hit) != 1:
            raise ValueError(f"trade: expected exactly one gold row, found {len(hit)}")
        return hit[0]["values"]

    gold_x = gold(ecomp["items"], lambda i: i["name"].lower().startswith("gold"))
    gold_m = gold(icomp["items"], lambda i: i["code"] == "97")

    def top(items, n, name_fn, key="values"):
        ranked = sorted(items, key=lambda i: -i[key][-1])
        return [{"name": name_fn(i["name"]), "values": m(i[key])} for i in ranked[:n] if i[key][-1] > 0]

    exports_products = [i for i in ecomp["items"] if not i["name"].lower().startswith("other")]

    _write("trade.json", {
        "sources": {k: _src(v) for k, v in
                    {"monthly": s_total, "export_products": s_ecomp, "import_products": s_icomp,
                     "destinations": s_edir, "origins": s_idir}.items()},
        "unit": "US$ million",
        "monthly": {"months": monthly["months"], "exports": m(monthly["exports"]), "imports": m(monthly["imports"])},
        "annual": {
            "years": years,
            "exports": m(ecomp["total"]),
            "imports": m(icomp["total"]),
            "exports_ex_gold": m([t - g for t, g in zip(ecomp["total"], gold_x)]),
            "imports_ex_gold": m([t - g for t, g in zip(icomp["total"], gold_m)]),
            "gold_exports": m(gold_x),
            "gold_imports": m(gold_m),
        },
        "export_products": top(exports_products, 15, _tidy_product),
        "import_products": top([i for i in icomp["items"]], 15, _tidy_product),
        "destinations": top(edir["countries"], 15, _tidy_country),
        "origins": top(idir["countries"], 15, _tidy_country),
        "export_regions": [{"name": REGION_NAMES[r["name"].upper()], "values": m(r["values"])} for r in edir["regions"]],
        "import_regions": [{"name": REGION_NAMES[r["name"].upper()], "values": m(r["values"])} for r in idir["regions"]],
        "notes": [
            f"UBOS's {REGION_NAMES[r['name'].upper()]} import subtotal differs slightly from the sum of its countries in "
            f"{', '.join(map(str, r['inconsistent_years']))}; country figures are used."
            for r in idir["regions"] if r["inconsistent_years"]
        ],
    })


def build_poverty(records: list[dict]) -> None:
    def read(title_start):
        r = _dataset(records, title_start)
        return r, tables.read_grouped(get_file(r["url"]))

    s_head, head = read("Poverty head count by residence and regions")
    s_long, long = read("Proportion of Poor persons 1999")
    s_abs, absn = read("Absolute numbers of persons living in poverty")
    s_dyn, dyn = read("Household Poverty Dynamics between the Survey Periods")
    s_shoes, shoes = read("Possession of at least one pair of shoes by household members")
    s_blanket, blanket = read("Possession of a Blanket by Background Characteristics")
    s_meals = _dataset(records, "Number of meals taken per day by place of residence")

    # National poverty rate: long series (1999/00-2019/20) + the newer table
    # (2012/13-2023/24). Where they overlap they must agree.
    long_years, long_vals = long["columns"], tables.pick(long, "proportion")
    new_years, new_vals = head["columns"], tables.pick(head, "Uganda")
    norm = lambda y: y.replace("/2000", "/00").replace("/2020", "/20")
    series = {norm(y): v for y, v in zip(long_years, long_vals)}
    for y, v in zip(new_years, new_vals):
        if y in series and abs(series[y] - v) > 0.05:
            raise ValueError(f"poverty: rate for {y} differs between tables ({series[y]} vs {v})")
        series[y] = v
    national = sorted(series.items())

    # Poor people (millions): same joining rule.
    poor = dict(zip(absn["columns"], tables.pick(absn, "National")))
    for y, v in zip(new_years, tables.pick(head, "Poor persons (millions)")):
        if y in poor and abs(poor[y] - v) > 0.05:
            raise ValueError(f"poverty: poor persons for {y} differ between tables ({poor[y]} vs {v})")
        poor[y] = v

    regions = [r for r in tables.group_rows(head, "Region") if r["label"] not in ("Uganda", "Poor persons (millions)")]

    # Meals: two header rows (survey, then age group), then "One meal"/"More than one".
    wb = openpyxl.load_workbook(get_file(s_meals["url"]), data_only=True, read_only=True)
    mrows = [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
    survey_row = next(r for r in mrows if any("2023/24" in str(c) for c in r if c))
    age_row = mrows[mrows.index(survey_row) + 1]
    kind_row = mrows[mrows.index(survey_row) + 2]
    start = next(j for j, c in enumerate(survey_row) if c and "2023/24" in str(c))
    one_meal_cols = {
        " ".join(str(age_row[j] or age_row[j - 1]).split()): j
        for j in range(start, len(kind_row))
        if kind_row[j] and str(kind_row[j]).strip().lower().startswith("one meal")
    }
    meals = []
    group = None
    for r in mrows[mrows.index(kind_row) + 1 :]:
        label = " ".join(str(r[0]).split()) if r[0] else ""
        if not label or label.lower().startswith("source"):
            continue
        if all(v is None for v in r[1:]):
            group = label
            continue
        if group == "Region" or label == "Uganda":
            meals.append({"label": label, **{age: r[j] for age, j in one_meal_cols.items()}})

    _write("poverty.json", {
        "sources": {k: _src(v) for k, v in {
            "headcount": s_head, "long": s_long, "absolute": s_abs, "dynamics": s_dyn,
            "shoes": s_shoes, "blanket": s_blanket, "meals": s_meals}.items()},
        "national": {"years": [y for y, _ in national], "rate": [v for _, v in national]},
        "poor_millions": {"years": sorted(poor), "values": [poor[y] for y in sorted(poor)]},
        "by_region": {"years": new_years, "rows": [{"name": r["label"], "values": r["values"]} for r in regions]},
        "by_residence": {"years": new_years, "rows": [{"name": r["label"], "values": r["values"]} for r in tables.group_rows(head, "Residence")]},
        "dynamics": {
            "columns": dyn["columns"][:4],
            "rows": [{"group": r["group"], "name": r["label"], "values": r["values"][:4]} for r in dyn["rows"]],
            "period": "2015/16 to 2019/20",
        },
        "shoes": {"years": shoes["columns"], "rows": [{"group": r["group"], "name": r["label"], "values": r["values"]} for r in shoes["rows"]]},
        "blanket": {"years": blanket["columns"], "rows": [{"group": r["group"], "name": r["label"], "values": r["values"]} for r in blanket["rows"]]},
        "one_meal_2023_24": meals,
    })


def build_road_safety(records: list[dict]) -> None:
    def read(title_start):
        r = _dataset(records, title_start)
        return r, tables.read_grouped(get_file(r["url"]))

    s_crash, crash = read("Reported road traffic crashes by outcome of crash")
    s_cas, cas = read("Number of Road Traffic Casualties by Outcome of Crash")
    s_veh, veh = read("Number of Road Accidents by Type of Vehicles")
    s_time, tod = read("Number of Crashes by Time of Occurrence")
    s_user, users = read("Number of Accident Victims by Road User Type")
    s_reg, reg = read("Accident distribution by region")

    years = [y for y in crash["columns"] if y.isdigit()]
    n = len(years)
    row = lambda t, label: tables.pick(t, label)[:n]

    def check_sum(name, parts: list[list], total: list, tol=0.01):
        for i, y in enumerate(years[: len(total)]):
            s = sum((p[i] or 0) for p in parts)
            if total[i] and abs(s - total[i]) / total[i] > tol:
                raise ValueError(f"road: {name} parts sum {s:,.0f} != total {total[i]:,.0f} in {y}")

    crash_rows = {k: row(crash, k) for k in ("Fatal", "Serious", "Minor")}
    crash_total = row(crash, "Total")
    check_sum("crash outcomes", list(crash_rows.values()), crash_total)

    if [c for c in cas["columns"] if c.isdigit()] != years:
        raise ValueError("road: casualty and crash tables cover different years")
    killed, serious, slight = row(cas, "Killed"), row(cas, "Seriously injured"), row(cas, "Slightly injured")
    cas_total = row(cas, "Total")
    check_sum("casualties", [killed, serious, slight], cas_total)
    severity = row(cas, "Accident Severity Index")

    # Victims by road user type must add up to the casualty total from the other table.
    user_rows = [r for r in users["rows"] if r["label"].lower() != "total"]
    check_sum("victims by road user (vs casualty table)", [r["values"][:n] for r in user_rows], cas_total)

    veh_rows = [r for r in veh["rows"] if r["label"].lower() != "total"]
    check_sum("vehicles", [r["values"][:n] for r in veh_rows], row(veh, "Total"))

    # 2023-only tables: regions and time of day, each checked against 2023 crashes.
    latest_crashes = crash_total[-1]
    reg_rows = [r for r in reg["rows"] if r["label"].lower() != "total"]
    reg_total = sum(r["values"][reg["columns"].index("Total")] or 0 for r in reg_rows)
    if abs(reg_total - latest_crashes) / latest_crashes > 0.02:
        raise ValueError(f"road: regions sum {reg_total:,.0f} != {years[-1]} crashes {latest_crashes:,.0f}")
    tod_total = sum(r["values"][0] or 0 for r in tod["rows"])
    if abs(tod_total - latest_crashes) / latest_crashes > 0.02:
        raise ValueError(f"road: time-of-day sum {tod_total:,.0f} != {years[-1]} crashes {latest_crashes:,.0f}")

    fi = reg["columns"].index("Fatal")
    ti = reg["columns"].index("Total")
    clean = lambda s: s.rstrip("*").strip()
    _write("road_safety.json", {
        "sources": {k: _src(v) for k, v in {
            "crashes": s_crash, "casualties": s_cas, "vehicles": s_veh, "time": s_time,
            "road_users": s_user, "regions": s_reg}.items()},
        "years": [int(y) for y in years],
        "crashes": {k.lower(): v for k, v in crash_rows.items()} | {"total": crash_total},
        "casualties": {"killed": killed, "seriously_injured": serious, "slightly_injured": slight, "total": cas_total},
        "severity_index": severity,
        "road_users": [{"name": clean(r["label"]), "values": r["values"][:n]} for r in user_rows],
        "vehicles": [{"name": r["label"], "values": r["values"][:n]} for r in veh_rows],
        # Police report 2am-4am etc.; store in clock order.
        "time_of_day": sorted(({"slot": r["label"], "crashes": r["values"][0]} for r in tod["rows"]), key=lambda x: x["slot"]),
        "regions": sorted(
            ({"name": r["label"], "fatal": r["values"][fi], "total": r["values"][ti]} for r in reg_rows),
            key=lambda x: -(x["total"] or 0),
        ),
        "notes": [
            "Figures are crashes and casualties reported to the Uganda Police Force; unreported crashes are not counted.",
            "“Victims by road user type” counts everyone killed or injured, not deaths only.",
        ],
    })


def build_education(records: list[dict]) -> None:
    def rows_of(r):
        wb = openpyxl.load_workbook(get_file(r["url"]), data_only=True, read_only=True)
        return [list(x) for x in wb.worksheets[0].iter_rows(values_only=True)]

    def read(title_start):
        r = _dataset(records, title_start)
        return r, tables.read_grouped(get_file(r["url"]))

    # Literacy: MALE / FEMALE / TOTAL blocks of year rows. UBOS's 2024 by-sex
    # cells are misaligned (the male block repeats the total, a stray value sits
    # on the FEMALE heading), so only the unambiguous 2024 total is used.
    s_lit = _dataset(records, "Literacy Rate for population aged 10 years and above by residence")
    blocks, cur = {}, None
    for r in rows_of(s_lit):
        lab = " ".join(str(r[0]).split()) if r[0] is not None else ""
        if lab.upper() in ("MALE", "FEMALE", "TOTAL"):
            cur = lab.title()
            blocks[cur] = []
            continue
        if cur and lab and not lab.lower().startswith("source") and isinstance(r[3], int | float):
            blocks[cur].append({"year": lab, "urban": r[1], "rural": r[2], "total": r[3]})
    for sex in ("Male", "Female"):
        blocks[sex] = [x for x in blocks[sex] if x["year"] != "2024"]
    if not blocks.get("Total") or blocks["Total"][-1]["year"] != "2024":
        raise ValueError("education: literacy total for 2024 not found where expected")

    s_ple, ple = read("Primary Leaving Examination indicators 2023")
    num = lambda label: tables.pick(ple, label)[ple["columns"].index("Numbers")]
    divisions = [{"name": d, "candidates": num(d)} for d in ("DIV I", "DIV II", "DIV III", "DIV IV", "DIV U")]
    sat = num("Pupils Who Sat for PLE")
    if abs(sum(d["candidates"] for d in divisions) - sat) / sat > 0.01:
        raise ValueError("education: PLE divisions don't add up to candidates who sat")

    s_uce, uce = read("UCE Registration over the Last Five Years")
    uce_rows = sorted(({"year": int(r["label"]), "registered": r["values"][0], "sat": r["values"][1]} for r in uce["rows"]),
                      key=lambda x: x["year"])

    # UACE: years sit on the row above "Number of candidates | percentage".
    s_uace = _dataset(records, "General UACE Performance in 2023")
    urows = rows_of(s_uace)
    hi = next(i for i, r in enumerate(urows) if r[0] and str(r[0]).strip().lower() == "pass level")
    year_cols = [(j, int(v)) for j, v in enumerate(urows[hi - 1]) if isinstance(v, int | float)]
    uace = {y: [] for _, y in year_cols}
    for r in urows[hi + 1 :]:
        lab = str(r[0]).strip() if r[0] else ""
        if not lab or lab.lower() in ("total",) or lab.lower().startswith("source"):
            continue
        for j, y in year_cols:
            uace[y].append({"grade": lab, "candidates": r[j], "pct": r[j + 1]})

    s_p7, p7 = read("P.7 completion and Transition rates")
    s_s4, s4 = read("S4 completion and Transition rates")
    s_nape, nape = read("NAPE Competence Scores for Primary by class")

    def grouped_total(t):
        return [{"name": r["group"].rstrip("*").strip(), "values": r["values"]} for r in t["rows"] if r["label"] == "Total"]

    _write("education.json", {
        "sources": {k: _src(v) for k, v in {
            "literacy": s_lit, "ple": s_ple, "uce": s_uce, "uace": s_uace, "p7": s_p7, "s4": s_s4, "nape": s_nape}.items()},
        "literacy": blocks,
        "ple_2023": {"registered": num("Pupils who registered"), "sat": sat, "passed": num("Pupils who passed PLE"),
                     "divisions": divisions, "pass_rate": tables.pick(ple, "Pass Rate (Percent)")[ple["columns"].index("Numbers")]},
        "uce": uce_rows,
        "uace": {str(y): v for y, v in uace.items()},
        "progression": {"years": p7["columns"], "rates": grouped_total(p7) + grouped_total(s4)},
        "nape": {"years": nape["columns"], "rows": [{"name": r["group"], "values": r["values"]} for r in nape["rows"] if r["label"] == "Total"]},
        "notes": [
            "UBOS’s files “Primary school enrolment by class and sex 2011–2017” and “Secondary school enrolment…” "
            "currently contain the NAPE test-score table instead of enrolment, so enrolment by class is not shown.",
            "UBOS’s “Key Primary Education Indicators, 2013–2017” file contains pre-primary (nursery) figures, so it is not used.",
            "The 2024 literacy figure comes from the census; earlier figures come from household surveys, so small changes between them may reflect method rather than a real change.",
            "UBOS’s 2024 literacy figures by sex are misaligned in the source table, so only the overall 2024 figure is shown.",
            "In the PLE 2023 table the percentage column is 100 for every row, so we use the candidate numbers.",
        ],
    })


def build_jobs(records: list[dict]) -> None:
    def read(title_start):
        r = _dataset(records, title_start)
        return r, tables.read_grouped(get_file(r["url"]))

    s_key, key = read("Key Labour Market Indicators of Working Population (14-64 years) by sex")
    s_youth, youth = read("Selected labour market indicators of the Youth Population (18-30 years)")
    s_epr, epr = read("Employment-to-Population Ratio (EPR) by selected background")
    s_ind, ind = read("Distribution of the employed Population by Industry")
    s_status, status = read("Percentage distribution of the population in employment by Status in Employment")
    s_earn, earn = read("Median monthly earnings for persons in paid employment on the main job by type")

    def surveys(t):
        """Survey labels in column order: 'UNHS 2016/17 · Male' -> 'UNHS 2016/17'."""
        out = []
        for c in t["columns"]:
            s = c.split(" · ")[0]
            if s not in out:
                out.append(s)
        return out

    def by_survey(t, label, sex, group=None):
        vals = tables.pick(t, label, group)
        return [vals[t["columns"].index(f"{s} · {sex}")] for s in surveys(t)]

    svy = surveys(youth)
    if surveys(key) != svy or surveys(epr) != svy:
        raise ValueError("jobs: labour tables cover different surveys")

    # Industry shares must add to ~100% in every survey column.
    ind_rows = [r for r in ind["rows"] if r["label"].lower() != "total"]
    for j, c in enumerate(ind["columns"]):
        s = sum(r["values"][j] or 0 for r in ind_rows)
        if abs(s - 100) > 1.5:
            raise ValueError(f"jobs: industry shares add to {s:.1f}% in {c}")

    earn_col = next(c for c in earn["columns"] if c.startswith("In-cash & In-kind") and c.endswith("Total"))
    ec = earn["columns"].index(earn_col)
    em = earn["columns"].index(earn_col.replace("Total", "Male"))
    ef = earn["columns"].index(earn_col.replace("Total", "Female"))
    earnings = [
        {"group": r["group"], "name": r["label"], "total": r["values"][ec], "male": r["values"][em], "female": r["values"][ef]}
        for r in earn["rows"]
    ]

    status_cols = [c for c in status["columns"] if c.split(" · ")[-1].lower() != "total"]
    _write("jobs.json", {
        "sources": {k: _src(v) for k, v in {
            "key": s_key, "youth": s_youth, "epr": s_epr, "industry": s_ind, "status": s_status, "earnings": s_earn}.items()},
        "surveys": svy,
        "working_age_millions": by_survey(key, "Working Age Population (million)", "Total"),
        "working_millions": by_survey(key, "Working Population (million)", "Total"),
        "subsistence_only_pct": {sex: by_survey(key, "Percentage in subsistence agriculture only", sex) for sex in ("Male", "Female", "Total")},
        "youth": {
            "unemployment": {sex: by_survey(youth, "Unemployment Rate", sex) for sex in ("Male", "Female", "Total")},
            "neet": {sex: by_survey(youth, "NEET", sex, "Activity status") for sex in ("Male", "Female", "Total")},
            # 2016/17 and 2019/20 list "subsistence agriculture only" separately; 2021 does not.
            "subsistence_only": by_survey(youth, "Subsistence agriculture only", "Total", "Activity status"),
        },
        "epr_by_age": [
            {"age": r["label"], "values": by_survey(epr, r["label"], "Total", "Age groups")}
            for r in tables.group_rows(epr, "Age groups") if r["label"].lower() != "total"
        ],
        "industry": {
            "surveys": surveys(ind),
            "rows": [{"name": r["label"], "values": [r["values"][ind["columns"].index(f"{s} · National")] for s in surveys(ind)]} for r in ind_rows],
        },
        "status_by_education": {
            "columns": status_cols,
            "rows": [{"name": r["label"], "values": r["values"][: len(status_cols)]} for r in tables.group_rows(status, "Education level attained")],
        },
        "earnings_2021_ugx_000": earnings,
        "notes": [
            "Earnings are medians for people in paid work, in thousands of shillings a month (cash and in-kind), from the 2021 National Labour Force Survey.",
            "Surveys differ (UNHS 2016/17 and 2019/20, NLFS 2021), so small changes between them should be read with care.",
        ],
    })


def build_health(records: list[dict]) -> None:
    def read(title_start, sheet=None):
        r = _dataset(records, title_start)
        path = get_file(r["url"])
        if sheet == "last":
            wb = openpyxl.load_workbook(path, read_only=True)
            sheet = wb.worksheets[-1].title
        return r, tables.read_grouped(path, sheet)

    def series(t, col=0):
        # "UDHS 2016" -> "2016", "2000-01" -> "2000-01"
        return [{"survey": r["label"].replace("UDHS", "").strip(), "value": r["values"][col]} for r in t["rows"]]

    # These four files open on an internal UBOS "indicator list" sheet; the real
    # table is on the last sheet.
    s_u5, u5 = read("Trends in under five Mortality rate", "last")
    s_imr, imr = read("Infant Mortality Rate", "last")
    s_tfr, tfr = read("Trends in Fertility Rate", "last")
    s_mat, mat = read("Trends in Maternal Health Care", "last")
    for name, t, want in (("under-5 mortality", u5, "Values"), ("infant mortality", imr, "Values"), ("fertility", tfr, "Values")):
        if not t["columns"] or not t["columns"][0].lower().startswith(want.lower()):
            raise ValueError(f"health: {name} table not where expected (columns {t['columns']})")

    s_stunt, stunt = read("Stuntedness Trends")
    s_vacc, vacc = read("Basic Vaccinations")
    s_teen, teen = read("Teenage Child Bearing")
    s_nets, nets = read("Ownership of treated Mosquitoes")
    s_hiv, hiv = read("Trends in HIV Testing")
    s_spend, spend = read("Per capita public health expenditure")
    s_fac, fac = read("Number of Functional Healthcare facilities")
    # Listed on ubos.org as "Countrywide TB detection rate", but the file is
    # "Government of Uganda health sector allocation as percentage of total budget".
    s_budget, budget = read("Countrywide TB detection rate")
    if "allocation" not in s_budget["url"].lower():
        raise ValueError("health: budget-share file no longer points at the allocation table; re-check its contents")

    _write("health.json", {
        "sources": {k: _src(v) for k, v in {
            "under5": s_u5, "infant": s_imr, "fertility": s_tfr, "maternal": s_mat, "stunting": s_stunt,
            "vaccination": s_vacc, "teen": s_teen, "nets": s_nets, "hiv": s_hiv, "spending": s_spend,
            "facilities": s_fac, "budget": s_budget}.items()},
        "under5_mortality": series(u5),
        "infant_mortality": series(imr),
        "fertility": series(tfr),
        "maternal": {"surveys": [c.replace("UDHS", "").strip() for c in mat["columns"]],
                     "rows": [{"name": r["label"], "values": r["values"]} for r in mat["rows"]]},
        "stunting": series(stunt),
        "vaccination": series(vacc),
        "teen_childbearing": series(teen),
        "mosquito_nets": series(nets),
        "hiv_testing": {"surveys": [r["label"].replace("UDHS", "").strip() for r in hiv["rows"]],
                        "male": [r["values"][0] for r in hiv["rows"]], "female": [r["values"][1] for r in hiv["rows"]]},
        "public_spending_per_person": [{"year": r["label"], "ugx": r["values"][0]} for r in spend["rows"]],
        "budget_share": [{"year": r["label"], "pct": r["values"][0]} for r in budget["rows"]],
        "facilities": {"columns": fac["columns"], "rows": [{"year": r["label"], "values": r["values"]} for r in fac["rows"]]},
        "notes": [
            "Child mortality, fertility, maternal care, stunting and vaccination come from the Uganda Demographic and Health "
            "Surveys; the latest in UBOS’s online tables is 2016.",
            "Four of these UBOS files open on an internal indicator list; the figures are on the last sheet of each file.",
            "UBOS lists the health budget table under the title “Countrywide TB detection rate”; the file is the health "
            "sector’s share of the government budget, and is shown as that.",
        ],
    })


def build(refresh: bool = False) -> None:
    records = catalog_mod.crawl(refresh=refresh)
    build_catalog(records)
    build_cpi(records)
    build_census()
    build_population(records)
    build_gdp(records)
    build_trade(records)
    build_poverty(records)
    build_road_safety(records)
    build_education(records)
    build_jobs(records)
    build_health(records)
