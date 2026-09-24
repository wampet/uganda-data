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


def _health_extra(records: list[dict]) -> dict:
    """Health system tables: under-5 causes of death, cancer, health workers, birth registration."""
    from .parsers import wide

    def rows_of(title_start):
        src = _dataset(records, title_start)
        return src, [r for r in wide.load(get_file(src["url"])) if any(v not in (None, "") for v in r)]

    # Leading causes of under-5 deaths in hospital (% of deaths), by financial year.
    s_u5c, rows = rows_of("Top four Leading causes of under 5")
    causes = [str(c).strip().capitalize() for c in rows[1][1:5]]
    u5c = [{"year": str(r[0]).strip(), "values": [wide.num(v) for v in r[1:5]]} for r in rows[2:] if wide.year_of(r[0])]
    # The latest year is much lower for every cause at once; keep it, but say so.
    last, prev = u5c[-1], u5c[-2]
    all_lower = all(a < b for a, b in zip(last["values"], prev["values"]))

    # "Cancer burden": four yearly totals, no definition given.
    s_can, rows = rows_of("Trends in cancer Burden")
    cancer = [{"year": wide.year_of(y), "cases": wide.num(v)} for y, v in zip(rows[1], rows[2]) if wide.year_of(y)]

    # Health workers: approved vs filled posts by facility level.
    s_hr, rows = rows_of("Human Resources for Health posts approved, filled by year and public health facility")
    years = [wide.year_of(c) for c in rows[1] if wide.year_of(c)]
    cols = [j for j, c in enumerate(rows[1]) if wide.year_of(c)]
    hr = {}
    for r in rows[3:]:
        name = " ".join(str(r[0]).split()) if r[0] else ""
        if not name or name.lower().startswith("source"):
            continue
        vals = [(wide.num(r[j]), wide.num(r[j + 1])) for j in cols]
        if all(a is None for a, _ in vals):
            continue
        hr[name] = [{"approved": a, "filled": f} for a, f in vals]
    total = hr["Grand Total"]
    levels = ["Subtotal - National level", "Subtotal – District level"]
    for i, y in enumerate(years):
        parts = [hr[k][i] for k in hr if k.lower().startswith("subtotal")]
        if abs(sum(p["approved"] for p in parts) - total[i]["approved"]) > 2:
            raise ValueError(f"health: health-worker subtotals don't add up to the grand total in {y}")
    keep = ["Health Centre II", "Health Centre III", "Health Centre IV", "General Hospitals", "Regional Referral Hospitals",
            "Mulago National Referral Hospital"]
    staffing = {"years": years, "total": total, "levels": {k: hr[k] for k in keep if k in hr}}
    if len(staffing["levels"]) != len(keep):
        raise ValueError("health: some health-worker facility levels are missing")

    # Births notified vs registered.
    s_birth, rows = rows_of("Birth Notification and Registration")
    byears = [wide.year_of(c) for c in rows[1][1:] if wide.year_of(c)]
    notified = [wide.num(v) for v in rows[2][1:1 + len(byears)]]
    registered = [wide.num(v) for v in rows[3][1:1 + len(byears)]]

    return {
        "sources": {"under5_causes": _src(s_u5c), "cancer": _src(s_can), "staffing": _src(s_hr), "births": _src(s_birth)},
        "data": {
            "under5_causes": {"causes": causes, "years": u5c},
            "cancer": cancer,
            "staffing": staffing,
            "births": {"years": byears, "notified": notified, "registered": registered},
        },
        "notes": [
            "Causes of death for children under 5 are shares of deaths in hospital."
            + (f" In {last['year']} every cause is much lower than in {prev['year']}, which may reflect a change in how the "
               "figures were measured rather than fewer deaths." if all_lower else ""),
            "UBOS gives only yearly totals for “cancer burden”, without saying how cases are counted; the fall in 2017/18 "
            "may reflect reporting rather than fewer cancers.",
            "Health-worker figures are posts in public health facilities; “filled” can exceed “approved” where extra staff are "
            "posted.",
            "Birth notification means a health facility or local leader recorded the birth; registration means it was "
            "entered in the civil register and a certificate can be issued.",
        ],
    }


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

    extra = _health_extra(records)
    _write("health.json", {
        "sources": {k: _src(v) for k, v in {
            "under5": s_u5, "infant": s_imr, "fertility": s_tfr, "maternal": s_mat, "stunting": s_stunt,
            "vaccination": s_vacc, "teen": s_teen, "nets": s_nets, "hiv": s_hiv, "spending": s_spend,
            "facilities": s_fac, "budget": s_budget}.items()} | extra["sources"],
        **extra["data"],
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
            *extra["notes"],
        ],
    })


def build_government(records: list[dict]) -> None:
    def rows_of(r):
        wb = openpyxl.load_workbook(get_file(r["url"]), data_only=True, read_only=True)
        return [list(x) for x in wb.worksheets[0].iter_rows(values_only=True) if any(v is not None for v in x)]

    def fy_columns(header):
        return [(j, str(v).strip()) for j, v in enumerate(header) if v and "/" in str(v) and str(v).strip()[:2] == "20"]

    def label(v):
        return " ".join(str(v).split()) if v is not None else ""

    # Spending by function (general government), million UGX.
    s_fn = _dataset(records, "Functional classification of General Government expenditure for FY 2022-23")
    rows = rows_of(s_fn)
    h = next(i for i, r in enumerate(rows) if label(r[0]).lower() == "function")
    years = fy_columns(rows[h])
    functions, total = [], None
    for r in rows[h + 1 :]:
        name = label(r[0])
        if not name or name.lower().startswith(("source", "note")):
            continue
        vals = [r[j] for j, _ in years]
        if name.lower() == "total":
            total = vals
        else:
            functions.append({"name": name, "values": vals})
    for i, (_, y) in enumerate(years):
        s = sum(f["values"][i] or 0 for f in functions)
        if abs(s - total[i]) / total[i] > 0.005:
            raise ValueError(f"government: functions sum {s:,.0f} != total {total[i]:,.0f} in {y}")

    # Central vs local spending.
    s_exp = _dataset(records, "General Government Expenditure for FYs 2022/23")
    erows = rows_of(s_exp)
    eh = next(i for i, r in enumerate(erows) if label(r[0]).lower() == "sector")
    ey = fy_columns(erows[eh])
    split = {label(r[0]).split(" expenditure")[0]: [r[j] for j, _ in ey] for r in erows[eh + 1 :] if "expenditure" in label(r[0]).lower()}
    grand = next([r[j] for j, _ in ey] for r in erows if label(r[0]).lower() == "grand total")
    if [y for _, y in ey] != [y for _, y in years] or grand != total:
        raise ValueError("government: expenditure totals differ between the functional and sector tables")

    # Revenue: UBOS put the 2023/24 local-government figure one row below its label.
    s_rev = _dataset(records, "General Government Revenue for FYs 2022-23")
    rrows = rows_of(s_rev)
    rh = next(i for i, r in enumerate(rrows) if label(r[0]).lower() == "sector")
    ry = fy_columns(rrows[rh])
    revenue = {}
    for k, r in enumerate(rrows[rh + 1 :], start=rh + 1):
        name = label(r[0])
        if not name or name.lower().startswith(("source", "note")):
            continue
        vals = []
        for j, _ in ry:
            v = r[j]
            if v is None and k + 1 < len(rrows) and not label(rrows[k + 1][0]) and isinstance(rrows[k + 1][j], int | float):
                v = rrows[k + 1][j]  # value sits on the unlabelled row below
            vals.append(v)
        revenue[name] = vals
    rev_total = revenue.pop("Grand Total")
    for i, (_, y) in enumerate(ry):
        s = sum(v[i] or 0 for v in revenue.values())
        if abs(s - rev_total[i]) / rev_total[i] > 0.005:
            raise ValueError(f"government: revenue parts {s:,.0f} != total {rev_total[i]:,.0f} in {y}")

    # Taxpayer registrations (TINs issued to individuals).
    s_tin = _dataset(records, "Number of Tins issued to Individuals")
    trows = rows_of(s_tin)
    tins = [{"year": label(r[0]), "issued": r[1]} for r in trows if label(r[0])[:2] == "20" and "/" in label(r[0])]

    _write("government.json", {
        "sources": {k: _src(v) for k, v in {"functions": s_fn, "spending": s_exp, "revenue": s_rev, "tins": s_tin}.items()},
        "unit": "million UGX",
        "years": [y for _, y in years],
        "functions": functions,
        "total_spending": total,
        "spending_split": split,
        "revenue": revenue,
        "total_revenue": rev_total,
        "tins_individuals": tins,
        "notes": [
            "Figures are for general government (central and local), in current shillings. Local government figures for the latest year may be revised.",
            "“General public services” is the international (COFOG) heading for running government itself, including interest on public debt.",
            "Between 2022/23 and 2023/24 most development spending moved from “Defence” to “Public order and safety”, which looks like a change of classification rather than a real shift.",
            "In UBOS’s revenue table the 2023/24 local government figure sits one row below its label; we read it from there.",
        ],
    })


def build_environment(records: list[dict]) -> None:
    from .parsers import wide  # shared wide-table reader (labels in col 1, text numbers)

    def rows_of(r):
        wb = openpyxl.load_workbook(get_file(r["url"]), data_only=True, read_only=True)
        return [list(x) for x in wb.worksheets[0].iter_rows(values_only=True) if any(v is not None for v in x)]

    # Land cover (km²). The 2019 column uses a different classification (bush
    # land falls 84% in a single step), so the trend stops at 2017.
    s_land = _dataset(records, "National Land Cover statistics")
    land = wide.read(get_file(s_land["url"]))
    years = land["years"]
    cut = years.index("2017") + 1 if "2017" in years else len(years)
    # The table has a summary block and a detailed block, each ending in a total row.
    blocks, cur = [], []
    for r in land["rows"]:
        if r["label"].lower().startswith("total"):
            blocks.append((cur, r["values"][:cut]))
            cur = []
        else:
            cur.append({"name": " ".join(r["label"].split()), "values": r["values"][:cut]})
    if len(blocks) != 2:
        raise ValueError(f"environment: expected summary and detailed land cover blocks, got {len(blocks)}")
    for rows, total in blocks:
        for i, t in enumerate(total):
            if abs(sum(x["values"][i] for x in rows) - t) > 0.005 * t:
                raise ValueError(f"environment: land cover {years[i]} does not add up to the total area")
    land_summary, land_detail = blocks[0][0], blocks[1][0]
    land_total = blocks[0][1][0]

    # Forest reserves by region (hectares), 2015.
    s_res = _dataset(records, "Share of total area under forest reserves by region")
    rrows = rows_of(s_res)
    reserves = []
    for r in rrows:
        name = " ".join(str(r[0]).split()) if r[0] else ""
        if name and isinstance(r[1], int | float) and isinstance(r[5], int | float):
            reserves.append({"region": name, "central_ha": r[1], "local_ha": r[3], "total_ha": r[5]})
    ug = next(x for x in reserves if x["region"] == "Uganda")
    regions = [x for x in reserves if x["region"] != "Uganda"]
    if abs(sum(x["total_ha"] for x in regions) - ug["total_ha"]) > 5:
        raise ValueError("environment: forest reserve regions don't add up to the Uganda total")

    # Temperature: per station, long-term and 2017-2021 monthly max/min.
    s_temp = _dataset(records, "Temperature (Degrees Celsius) for selected centres")
    trows = rows_of(s_temp)
    station, temps, monthly = None, {}, {}
    for r in trows:
        lab = " ".join(str(r[1]).split()) if len(r) > 1 and r[1] else ""
        months = [wide.num(v) for v in r[2:14]]
        if lab and all(v is None for v in months) and lab.isupper():
            station = lab.title()
            temps[station], monthly[station] = {}, {}
            continue
        if station and lab and any(v is not None for v in months):
            vals = [v for v in months if v is not None]
            if len(vals) >= 10:  # need most of the year for a fair annual mean
                temps[station][lab] = round(sum(vals) / len(vals), 2)
                monthly[station][lab] = months
    # LT.Max/LT.Min are monthly long-term averages (they match the 2017-2021
    # average, so they show the climate of each place, not a trend).
    stations = []
    for name, d in temps.items():
        if "LT.Max" in d and "LT.Min" in d:
            stations.append({"station": name, "max": d["LT.Max"], "min": d["LT.Min"], "monthly_max": monthly[name]["LT.Max"],
                             "monthly_min": monthly[name]["LT.Min"]})
    if len(stations) < 5:
        raise ValueError(f"environment: expected temperature for several stations, got {len(stations)}")

    # Water produced and supplied by NWSC, national (million m³).
    s_water = _dataset(records, "Water produced and supplied (million m3) by NWSC")
    wrows = rows_of(s_water)
    water = []
    for r in wrows:
        cells = [c for c in r if c is not None]
        if len(cells) >= 3 and str(cells[0]).strip()[:2] == "20" and "/" in str(cells[0]):
            water.append({"year": str(cells[0]).strip(), "produced": cells[1], "supplied": cells[2]})

    _write("environment.json", {
        "sources": {k: _src(v) for k, v in {"land": s_land, "reserves": s_res, "temperature": s_temp, "water": s_water}.items()},
        "land": {"years": years[:cut], "summary": land_summary, "detail": land_detail, "total": land_total, "unit": "km²"},
        "forest_reserves_2015": regions,
        "temperature": stations,
        "water": water,
        "notes": [
            "UBOS’s land cover table also has a 2019 column, but it appears to use a different classification (bush land "
            "falls by 84% in one step), so the trend shown stops at 2017.",
            "Temperatures are UBOS’s long-term monthly averages for each weather station: typical daytime highs and night-time lows.",
            "Rainfall is not shown: in UBOS’s 2014–2020 rainfall table, Gulu and Arua have identical figures, and the period covered is unclear.",
            "Water figures are for National Water and Sewerage Corporation towns only. Some town-level water tables contain "
            "impossible values (more water supplied than produced), so only national totals are used.",
        ],
    })


def _labelled(path, sheet: str | None = None) -> dict:
    """Small wide table whose header holds years or June dates; returns {"years", "rows": [(group, label, values)]}.

    Rows with no numbers become the group for the rows below (e.g. "a) Shillings")."""
    import datetime as dt

    from .parsers import wide

    rows = wide.load(path, sheet)
    def yr(v):
        return str(v.year) if isinstance(v, dt.datetime) else wide.year_of(v)
    h = next(i for i, r in enumerate(rows) if sum(1 for c in r if yr(c)) >= 3)
    cols = [j for j, c in enumerate(rows[h]) if yr(c)]
    out, group = [], None
    for r in rows[h + 1:]:
        label = " ".join(str(r[0]).split()) if r and r[0] is not None else ""
        if not label or label.lower().startswith(("source", "note")):
            continue
        vals = [wide.num(r[j]) if j < len(r) else None for j in cols]
        if all(v is None for v in vals):
            group = label
            continue
        out.append((group, label, vals))
    return {"years": [yr(rows[h][j]) for j in cols], "rows": out}


def build_banking(records: list[dict]) -> None:
    def row(t, label, group=None):
        hits = [v for g, lab, v in t["rows"] if lab.lower() == label.lower() and (group is None or (g or "").lower().startswith(group.lower()))]
        if not hits:
            raise ValueError(f"banking: no row '{label}' (group {group})")
        return hits[0]

    def splice(old, new, label, tol=0.01):
        """Join an older and a newer table on their shared year; the newer vintage wins."""
        a, b = row(old, label), row(new, label)
        shared = [y for y in old["years"] if y in new["years"]]
        for y in shared:
            va, vb = a[old["years"].index(y)], b[new["years"].index(y)]
            if abs(va - vb) > tol * abs(vb):
                raise ValueError(f"banking: '{label}' {y} differs between table vintages ({va} vs {vb})")
        years = [y for y in old["years"] if y not in shared] + new["years"]
        vals = [a[old["years"].index(y)] for y in old["years"] if y not in shared] + b
        return years, vals

    # Exchange rates: 2014-2019 (UBOS files it under "Volumes of ... transactions") + 2019-2023.
    s_fx_old = _dataset(records, "Volumes of Inter-bank and Bureaux Foreign Exchange")
    s_fx = _dataset(records, "Annual Foreign Exchange Rates (Uganda shillings per US$), 2019")
    fx_old = _labelled(get_file(s_fx_old["url"]), "Sheet8")
    fx_new = _labelled(get_file(s_fx["url"]))
    fx_old["rows"] = [(g, "Inter-bank mid-rate" if lab.lower().startswith("inter-bank mid") else lab, v) for g, lab, v in fx_old["rows"]]
    fx_years, fx = splice(fx_old, fx_new, "Inter-bank mid-rate")
    volumes = _labelled(get_file(s_fx_old["url"]), "Sheet9")

    # Interest rates, June 2014-2019.
    s_int = _dataset(records, "Structure of Interest Rates")
    it = _labelled(get_file(s_int["url"]))
    rates = {
        "Central Bank Rate": row(it, "Central Bank Rate (CBR)"),
        "Bank lending (shillings)": row(it, "Lending Rates", "a) Shillings"),
        "Savings deposits (shillings)": row(it, "Savings deposits", "a) Shillings"),
        "91-day Treasury bill": row(it, "91 Days"),
    }

    # Banks and money: depository corporations survey, June 2014-2019 + 2019-2023.
    s_dc_old = _dataset(records, "Depository Corporation Survey (Billion Shillings), June 2014")
    s_dc = _dataset(records, "Depository Corporation Survey (Billion Shillings), June 2019")
    dc_old, dc_new = _labelled(get_file(s_dc_old["url"])), _labelled(get_file(s_dc["url"]))
    money = {}
    for key, label in [("private_loans", "Of which: Loans"), ("government_net", "Claims on Central Government(net)"),
                       ("m3", "Broad Money-M3"), ("currency", "Currency Outside Depository Corporations"),
                       ("fx_deposits", "Foreign Currency Deposits")]:
        dc_years, money[key] = splice(dc_old, dc_new, label, tol=0.01)
    # Check the newest table's broad money adds up: M3 = M2 + foreign currency deposits.
    m3, m2, fcd = row(dc_new, "Broad Money-M3"), row(dc_new, "Broad Money-M2"), row(dc_new, "Foreign Currency Deposits")
    if any(abs(a - (b + c)) > 1 for a, b, c in zip(m3, m2, fcd)):
        raise ValueError("banking: M3 != M2 + foreign currency deposits")

    # Insurance premiums (million UGX), 2012-2018.
    s_life = _dataset(records, "Life Insurance Net premium income")
    s_nonlife = _dataset(records, "Non-Life Insurance Net Premium Income")
    insurance = {}
    for key, s in [("life", s_life), ("non_life", s_nonlife)]:
        t = _labelled(get_file(s["url"]))
        parts = [(lab, v) for _, lab, v in t["rows"] if not lab.lower().startswith("total")]
        total = row(t, "Total Income")
        for i, tv in enumerate(total):
            if abs(sum(v[i] or 0 for _, v in parts) - tv) > 2:
                raise ValueError(f"banking: {key} insurance classes don't add up in {t['years'][i]}")
        insurance[key] = {"years": t["years"], "total": total, "classes": [{"name": lab, "values": v} for lab, v in parts]}

    # Remittances table: only capital transfers, so it is reported in a note, not charted.
    s_rem = _dataset(records, "Ratio of diaspora Remittances to GDP")
    rem = _labelled(get_file(s_rem["url"]))
    rem_last = row(rem, "Capital transfers (Remittances)")[-1]

    _write("banking.json", {
        "sources": {k: _src(v) for k, v in {"fx": s_fx, "fx_old": s_fx_old, "interest": s_int, "money_old": s_dc_old,
                                               "money": s_dc, "life": s_life, "non_life": s_nonlife}.items()},
        "fx": {"years": fx_years, "rate": fx},
        "fx_volumes": {"years": volumes["years"], "purchases": row(volumes, "Total", "Purchases"), "sales": row(volumes, "Total", "Sales")},
        "interest": {"years": it["years"], "rates": rates},
        "money": {"years": dc_years, **money},
        "insurance": insurance,
        "notes": [
            "Exchange rates are Bank of Uganda annual averages of the inter-bank mid-rate. The 2014–2019 rates come from a "
            "UBOS file titled “Volumes of Inter-bank and Bureaux Foreign Exchange Transactions”.",
            "Interest rates are for June of each year; UBOS has not published a newer table.",
            "Bank figures are for June of each year. Where the older and newer UBOS tables overlap (2019), the newer one is used.",
            "UBOS’s “Ratio of diaspora remittances to GDP” table covers only capital transfers (about US$176 million in 2022/23), "
            "not all the money Ugandans abroad send home, so it is not shown.".replace(
                "about US$176 million in 2022/23", f"about US${round(rem_last)} million in {rem['years'][-1]}"),
            "Insurance figures are premium income reported by the Insurance Regulatory Authority, 2012–2018.",
        ],
    })


def build_crime(records: list[dict]) -> None:
    from .parsers import wide

    def raw(s):
        return [r for r in wide.load(get_file(s["url"])) if any(v is not None for v in r)]

    def lab(v):
        return " ".join(str(v).split()) if v is not None else ""

    def data_rows(rows):
        """(label, cells) for rows below the headers, up to the source line."""
        out = []
        for r in rows[3:]:
            name = lab(r[0])
            if name.lower().startswith(("source", "*")):
                break
            if name:
                out.append((name, r))
        return out

    # Crimes reported and prosecuted by category, 2020-2023. The 2020 block has an
    # empty column between "Reported" and "Prosecuted", so columns are fixed here.
    s_cat = _dataset(records, "Number of Crimes by Category")
    rows = raw(s_cat)
    years = ["2020", "2021", "2022", "2023"]
    if [wide.year_of(rows[1][j]) for j in (1, 4, 6, 8)] != years:
        raise ValueError("crime: unexpected year columns in crimes by category")
    cols = {"2020": (1, 3), "2021": (4, 5), "2022": (6, 7), "2023": (8, 9)}
    cats = []
    for name, r in data_rows(rows):
        cats.append({"name": name.rstrip("*"), "reported": [wide.num(r[cols[y][0]]) for y in years],
                     "prosecuted": [wide.num(r[cols[y][1]]) for y in years]})
    total = next(c for c in cats if c["name"] == "Total")
    cats = [c for c in cats if c["name"] != "Total"]
    for i, y in enumerate(years):
        for k in ("reported", "prosecuted"):
            if abs(sum(c[k][i] or 0 for c in cats) - total[k][i]) > 5:
                raise ValueError(f"crime: {k} {y} categories don't add up to the total")

    # Reported cases by detailed category, 2019-2023 (includes domestic violence).
    s_rep = _dataset(records, "Number of Crimes reported by category")
    rep = _labelled(get_file(s_rep["url"]))
    reported_detail = [{"name": n.strip(), "values": v} for _, n, v in rep["rows"]]

    # Serious crimes: selected rows, reported, 2019-2023.
    s_ser = _dataset(records, "Serious Crimes Reported by Type")
    serious = {}
    for name, r in data_rows(raw(s_ser)):
        serious[name] = [wide.num(r[j]) for j in (1, 3, 5, 7, 9)]
    mob = serious["Death (by mob action)"]
    defilement = serious["Defilement"]

    # Victims by sex and age, 2023.
    s_vic = _dataset(records, "Number of Victims of Reported Crime by Case")
    victims = []
    for name, r in data_rows(raw(s_vic)):
        v = {"name": name.rstrip("*"), "male_adult": wide.num(r[1]) or 0, "male_child": wide.num(r[2]) or 0,
             "female_adult": wide.num(r[4]) or 0, "female_child": wide.num(r[5]) or 0, "total": wide.num(r[7])}
        if abs(v["male_adult"] + v["male_child"] + v["female_adult"] + v["female_child"] - v["total"]) > 2:
            raise ValueError(f"crime: victims of {name} don't add up")
        victims.append(v)

    # Offenders by sex, 2023.
    s_off = _dataset(records, "Number of Offenders Perpetrators of crime")
    off_total = next(r for n, r in data_rows(raw(s_off)) if n == "Total")
    offenders = {"male": wide.num(off_total[5]), "female": wide.num(off_total[6]), "total": wide.num(off_total[7]),
                 "juvenile": wide.num(off_total[3]) + wide.num(off_total[4])}
    if offenders["male"] + offenders["female"] != offenders["total"]:
        raise ValueError("crime: offenders by sex don't add up")

    # Prison population, remand vs convicted, deaths, babies.
    s_pop = _dataset(records, "Prison Population by Category")
    pop = _labelled(get_file(s_pop["url"]))
    def prow(label):
        return next(v for _, n, v in pop["rows"] if n.lower().startswith(label.lower()))
    prison = {"years": pop["years"], "remand": prow("Remand"), "convicted": prow("Convicted"), "debtors": prow("Debtors"),
              "total": prow("Total prison population"), "deaths": prow("Deaths in Prison"),
              "babies": prow("Babies staying")}
    for i in range(len(prison["years"])):
        if prison["remand"][i] + prison["convicted"][i] + prison["debtors"][i] != prison["total"][i]:
            raise ValueError(f"crime: prison population doesn't add up in {prison['years'][i]}")

    # Capacity and occupancy by region (capacity in cols 1-5, occupancy % in cols 6-10).
    s_cap = _dataset(records, "Prison Capacity and Occupancy Rate by region")
    cap_rows = data_rows(raw(s_cap))
    capacity = [{"region": n.rstrip("*"), "capacity": [wide.num(r[j]) for j in range(1, 6)],
                 "occupancy": [wide.num(r[j]) for j in range(6, 11)]} for n, r in cap_rows]
    nat = next(c for c in capacity if c["region"] == "National")
    for i, y in enumerate(prison["years"]):
        implied = 100 * prison["total"][i] / nat["capacity"][i]
        if abs(implied - nat["occupancy"][i]) > 3:
            raise ValueError(f"crime: occupancy {y} ({nat['occupancy'][i]}) doesn't match population/capacity ({implied:.1f})")

    # Prisoners by offence, 2023.
    s_offence = _dataset(records, "Number of prisoners by Offence Committed")
    offences = [{"name": n, "convicts": wide.num(r[3]), "remand": wide.num(r[6]), "total": wide.num(r[7])}
                for n, r in data_rows(raw(s_offence))]
    grand = next(o for o in offences if o["name"].lower() == "grand total")
    offences = [o for o in offences if o is not grand]
    if abs(sum(o["total"] for o in offences) - grand["total"]) > 2:
        raise ValueError("crime: prisoners by offence don't add up")

    # Re-offending.
    s_rec = _dataset(records, "Recidivism rate by offences")
    rec_total = next(r for n, r in data_rows(raw(s_rec)) if n == "TOTAL")

    _write("crime.json", {
        "sources": {k: _src(v) for k, v in {"categories": s_cat, "reported": s_rep, "serious": s_ser, "victims": s_vic,
                                               "offenders": s_off, "prison": s_pop, "capacity": s_cap,
                                               "offences": s_offence, "recidivism": s_rec}.items()},
        "years": years,
        "categories": cats,
        "total": total,
        "reported_detail": {"years": rep["years"], "rows": reported_detail},
        "serious": {"years": ["2019", "2020", "2021", "2022", "2023"], "mob": mob, "defilement": defilement},
        "victims_2023": victims,
        "offenders_2023": offenders,
        "prison": prison,
        "capacity": capacity,
        "offences_2023": offences,
        "recidivism": {"year": "2022/23", "rate": wide.num(rec_total[6]), "admissions": wide.num(rec_total[4])},
        "notes": [
            "Crimes are cases reported to the Uganda Police Force; many crimes are never reported. “Prosecuted” means "
            "taken to court in that year, not necessarily cases reported in the same year.",
            "The police use two groupings: the headline categories (from “Number of Crimes by Category”) and a more "
            "detailed list that separates domestic violence. They overlap, so they are not added together.",
            "Prison figures are from the Uganda Prisons Service. Occupancy is the number of prisoners as a share of the "
            "space prisons were built for: 300% means three people for every place.",
            "Remand prisoners are held while awaiting trial and have not been convicted.",
        ],
    })


def build_wellbeing(records: list[dict]) -> None:
    """UBOS's National Standard Indicators (NSI): the scorecard for graduating to lower-middle-income status."""
    import re

    from .parsers import wide

    def clean(v):
        return " ".join(str(v).replace("\xa0", " ").split()) if v is not None else ""

    # ---- Level 1: three "graduation criteria", 2014/15-2021/22 --------------------
    s1 = _dataset(records, "The National Standard Indicators (NSI) Framework - Level 1")
    rows = [r for r in wide.load(get_file(s1["url"])) if any(v is not None for v in r)]
    h = next(i for i, r in enumerate(rows) if sum(1 for c in r if wide.year_of(c)) >= 5)
    years = [wide.year_of(c) for c in rows[h][4:12]]
    if years[0] != "2014/15" or None in years:
        raise ValueError(f"wellbeing: unexpected NSI Level 1 years {years}")
    level1 = {}
    for r in rows[h + 1:]:
        label = clean(r[0])
        if label and len(r) > 11:
            level1[label] = {"unit": clean(r[1]), "periodicity": clean(r[3]), "values": [wide.num(v) for v in r[4:12]]}

    # (criterion, label prefix in the sheet, plain name, unit shown, better when)
    WANT = [
        ("income", "1.1.1:", "GDP per person", "US$", "higher"),
        ("income", "1.1.2:", "Economic growth", "%", None),  # swings yearly: no verdict
        ("income", "1.1.4:", "People below the national poverty line", "%", "lower"),
        ("income", "1.1.5:", "Income inequality (Gini, 0 = equal)", "", "lower"),
        ("income", "a) Agriculture", "Agriculture’s share of GDP", "%", None),
        ("income", "b) Manufacturing", "Manufacturing’s share of GDP", "%", None),
        ("assets", "2.1.1:", "Literacy, age 10+", "%", "higher"),
        ("assets", "2.1.2", "Average years of schooling", "years", "higher"),
        ("assets", "b) :Secondary", "Secondary school enrolment (gross)", "%", "higher"),
        ("assets", "4.1.2:", "Stunted children under 5", "%", "lower"),
        ("assets", "5.1.3:", "Children per woman", "", None),
        ("assets", "6.1.1:", "Child deaths before age 5 (per 1,000 births)", "", "lower"),
        ("assets", "5.1.5:", "Mothers’ deaths (per 100,000 births)", "", "lower"),
        ("assets", "5.1.8:", "Workers in farming, forestry and fishing", "%", None),
        ("vulnerability", "9.1.2:", "Exports as a share of GDP", "%", None),  # swings yearly
        ("vulnerability", "11.1.1:", "Paved national roads", "km", "higher"),
        ("vulnerability", "11.1.2:", "Share of national roads that are paved", "%", "higher"),
        ("vulnerability", "11.1.5:", "Households with electricity for lighting", "%", "higher"),
        ("vulnerability", "11.1.7: Safe water coverage :a) Urban", "Safe water coverage, towns", "%", "higher"),
        ("vulnerability", "11.1.7: Safe water coverage; b) Rural", "Safe water coverage, rural", "%", "higher"),
    ]
    indicators = []
    for crit, prefix, name, unit, better in WANT:
        hits = [(k, v) for k, v in level1.items() if k.startswith(prefix)]
        if len(hits) != 1:
            raise ValueError(f"wellbeing: expected one NSI row starting '{prefix}', found {len(hits)}")
        label, row = hits[0]
        vals = row["values"]
        # Survey-based rows repeat the last survey's value until the next one;
        # keep only the years a new value appears, so no false flat trend is drawn.
        survey = not row["periodicity"].lower().startswith("annual")
        points = []
        for y, v in zip(years, vals):
            if v is None or (survey and points and points[-1][1] == v):
                continue
            points.append((y, v))
        if not points:
            raise ValueError(f"wellbeing: no values for '{prefix}'")
        indicators.append({"criterion": crit, "name": name, "official": label, "unit": unit, "better": better,
                           "periodicity": row["periodicity"], "points": points})

    gdp_pc = next(i for i in indicators if i["name"] == "GDP per person")
    roads = next(i for i in indicators if i["name"] == "Paved national roads")

    # ---- Level 2: a few checkable extras ------------------------------------------
    s2 = _dataset(records, "The National Standard Indicators (NSI) Framework - Level 2")
    rows2 = [r for r in wide.load(get_file(s2["url"])) if any(v is not None for v in r)]
    def block(start: str) -> dict:
        """Rows of one Level 2 indicator: {disaggregation: [2019/20, 2020/21, 2021/22]}."""
        i = next(i for i, r in enumerate(rows2) if clean(r[2]).lower().startswith(start.lower()))
        out = {clean(rows2[i][3]) or "National": [wide.num(v) for v in rows2[i][8:11]]}
        for r in rows2[i + 1:]:
            if clean(r[2]) or not clean(r[3]):
                break
            out[clean(r[3])] = [wide.num(v) for v in r[8:11]]
        return out

    mpi = block("Proportion of men, women and children of all ages living in poverty")
    mpi_regions = {k: round(100 * v[0], 1) for k, v in mpi.items() if k in ("Central", "Eastern", "Northern", "Western")}
    if len(mpi_regions) != 4:
        raise ValueError("wellbeing: multidimensional poverty regions missing")
    mpi_national = round(100 * mpi["National"][0], 1)

    elec = block("Households with access to electricity")
    parts = {k: v[-1] for k, v in elec.items() if k != "Total electricity"}
    if abs(sum(parts.values()) - elec["Total electricity"][-1]) > 0.5:
        raise ValueError("wellbeing: electricity sources don't add up to the total")

    parliament = block("Proportion of seats held by women")["National"]
    tax = block("Tax Revenue to GDP ratio")["National"]
    health_ins = block("Health insurance coverage")["National"]

    _write("wellbeing.json", {
        "sources": {"level1": _src(s1), "level2": _src(s2)},
        "years": years,
        "indicators": indicators,
        "gdp_per_person": {"years": years, "values": [dict(gdp_pc["points"]).get(y) for y in years]},
        "paved_roads": {"years": years, "values": [dict(roads["points"]).get(y) for y in years]},
        "level2_years": ["2019/20", "2020/21", "2021/22"],
        "multidimensional_poverty": {"year": "2019/20", "national": mpi_national, "regions": mpi_regions},
        "electricity": {
            # Values repeat across years; label them with the year they first appear.
            "year": ["2019/20", "2020/21", "2021/22"][max(next(i for i, x in enumerate(v) if x == v[-1]) for v in elec.values())],
            "sources": {k.strip(): v for k, v in parts.items()},
            "total": elec["Total electricity"][-1],
        },
        "women_in_parliament": parliament,
        "tax_to_gdp": tax,
        "health_insurance": health_ins,
        "notes": [
            "The National Standard Indicators are the numbers Uganda uses to track its goal of becoming a lower-middle-income "
            "country. UBOS groups them into three tests: income, human assets (health and education) and economic vulnerability.",
            "Many indicators come from surveys held every few years. UBOS repeats the last survey’s value in the years between; "
            "this page shows each value only for the year it first appears.",
            "The scorecard ends in 2021/22. Newer figures for some indicators (GDP, population, poverty) are on the story pages.",
            "“Poverty in all its forms” (multidimensional poverty) counts people lacking several basics such as schooling, "
            "health, housing and services, not just income.",
            "UBOS’s Level 2 table has visible errors (some rates written as fractions, others as percentages), so only a few "
            "of its figures are used here.",
        ],
    })


def build_mining(records: list[dict]) -> None:
    from .parsers import wide

    def table(title_start):
        s = _dataset(records, title_start)
        rows = [r for r in wide.load(get_file(s["url"])) if any(v not in (None, "") for v in r)]
        years = [wide.year_of(c) for c in rows[1][1:6]]
        if None in years:
            raise ValueError(f"mining: unexpected year header in '{title_start}'")
        group, out, total = None, [], None
        for r in rows[2:]:
            name = " ".join(str(r[0]).split()) if r[0] is not None else ""
            if not name or name.lower().startswith("source"):
                continue
            vals = [wide.num(v) for v in r[1:6]]
            if all(v is None for v in vals):
                group = name.rstrip()
                continue
            if name.lower().startswith("grand total"):
                total = vals
                continue
            out.append({"group": group, "name": name, "values": vals})
        for i, y in enumerate(years):  # every year's minerals must add up to UBOS's grand total
            if abs(sum(m["values"][i] or 0 for m in out) - total[i]) > max(1.0, 1e-4 * total[i]):
                raise ValueError(f"mining: '{title_start}' {y} rows don't add up to the grand total")
        return s, years, out, total

    s_val, years, value, value_total = table("Annual value of Mineral Production Value")
    s_qty, qyears, qty, qty_total = table("Annual mineral Production by Quantity")
    if years != qyears:
        raise ValueError("mining: value and quantity tables cover different years")
    # Value is in UGX '000; convert to UGX billion.
    for m in value:
        m["values"] = [None if v is None else round(v / 1e6, 3) for v in m["values"]]
    _write("mining.json", {
        "sources": {"value": _src(s_val), "quantity": _src(s_qty)},
        "years": years,
        "value_ugx_bn": value,
        "value_total_ugx_bn": [round(v / 1e6, 3) for v in value_total],
        "quantity_tonnes": qty,
        "quantity_total_tonnes": qty_total,
        "notes": [
            "Mineral production is what the Ministry of Energy and Mineral Development recorded; small-scale (artisanal) "
            "mining is often not recorded.",
            "Values are in current shillings, so part of any change is price change.",
            "Some minerals appear in only a few years (for example marble, lithium and iron ore); a blank means no "
            "production was recorded.",
            "Fuel prices, sales and imports are on the Power and fuel page.",
        ],
    })


def build_governance(records: list[dict]) -> None:
    """Three small UBOS survey tables (CSV): election irregularities, where grievances go, justice satisfaction."""
    import csv
    import io

    from .parsers import wide

    def rows_of(title_start):
        s = _dataset(records, title_start)
        text = open(get_file(s["url"]), "rb").read().decode("utf-8-sig", errors="replace")
        return s, [r for r in csv.reader(io.StringIO(text))]

    # Irregularities: labels are split over several lines ("Alteration of" / "voters register").
    s_irr, rows = rows_of("Types of Irregularities witnessed")
    cols = [c.strip() for c in rows[1][1:11]]
    if cols[-1] != "National":
        raise ValueError("governance: unexpected irregularities columns")
    parts, irregularities, total = [], [], None
    for r in rows[2:]:
        label = r[0].strip()
        vals = [wide.num(v) for v in r[1:11]]
        if all(v is None for v in vals):
            if label:
                parts.append(label)
            continue
        name = " ".join(parts + [label]).replace("/ ", "/").strip()
        parts = []
        if name.lower() == "total":
            total = vals
            continue
        irregularities.append({"name": name[:1].upper() + name[1:], "values": vals})
    for i, c in enumerate(cols):
        if abs(sum(x["values"][i] for x in irregularities) - 100) > 0.6 or total[i] != 100:
            raise ValueError(f"governance: irregularity shares for {c} don't add up to 100")

    # Grievances: % of people with a grievance who took it to each place (several answers allowed).
    s_gr, rows = rows_of("Population that referred thier grievances")
    places = [c.strip() for c in rows[0][1:7]]
    grievances, group = [], None
    for r in rows[1:]:
        label = r[0].strip()
        vals = [wide.num(v) for v in r[1:7]]
        if not label:
            continue
        if all(v is None for v in vals):
            group = label
            continue
        grievances.append({"group": "Total" if label == "Total" else group, "name": label, "values": vals})
    places = ["Uganda Human Rights Commission" if p == "Uganda Human Commission" else p for p in places]

    # Satisfaction with the justice process: four aspects, satisfied vs dissatisfied.
    s_sat, rows = rows_of("Levels of Respondents")
    aspects = [c.strip() for c in rows[0][1:9:2]]
    satisfaction, group = [], None
    for r in rows[2:]:
        label = r[0].strip()
        vals = [wide.num(v) for v in r[1:9]]
        if not label:
            continue
        if all(v is None for v in vals):
            group = label
            continue
        sat = vals[0::2]
        for a, b in zip(sat, vals[1::2]):
            if a is not None and b is not None and abs(a + b - 100) > 0.6:
                raise ValueError(f"governance: satisfaction for {label} doesn't add up to 100")
        satisfaction.append({"group": "National" if label == "National" else group, "name": label, "satisfied": sat})

    _write("governance.json", {
        "sources": {"irregularities": _src(s_irr), "grievances": _src(s_gr), "satisfaction": _src(s_sat)},
        "published": s_irr["updated"],
        "irregularities": {"columns": cols, "rows": irregularities},
        "grievances": {"places": places, "rows": grievances},
        "satisfaction": {"aspects": aspects, "rows": satisfaction},
        "notes": [
            "These are survey answers: what people said they saw or experienced. They are not official findings.",
            "The election table covers only people who said they saw an irregularity during the presidential election "
            "before the survey. It shows how those reports split by type, not how many people saw irregularities.",
            "People could name more than one place where they took a grievance, so those figures add up to more than 100%.",
            "UBOS published these tables in 2018 and has not updated them since.",
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
    build_government(records)
    build_environment(records)
    build_banking(records)
    build_crime(records)
    build_wellbeing(records)
    build_mining(records)
    build_governance(records)
