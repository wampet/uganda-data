"""Production section: energy, industry, transport, tourism, mobile money, farming.

Every chart series is described here as "which UBOS table, which row", joined
across overlapping releases where the years overlap (and checked to agree), and
sanity-checked (e.g. production + imports - exports = domestic supply). Problems
in the source are kept out of the charts and recorded as `notes` shown on the page.

Output: web/src/data/production.json
"""

from __future__ import annotations

import json
from pathlib import Path

from .http import get_file
from .parsers import wide

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "src" / "data" / "production.json"
CATALOG = ROOT / "pipeline" / "data" / "catalog.json"


class Sources:
    """Looks up UBOS files by catalog id and remembers which ones a section used."""

    def __init__(self):
        self.by_id = {r["id"]: r for r in json.loads(CATALOG.read_text(encoding="utf-8"))}
        self.used: dict[str, list[dict]] = {}

    def path(self, section: str, cid: str):
        r = self.by_id.get(cid)
        if r is None:
            raise KeyError(f"catalog id {cid} not found; did UBOS rename or remove the file?")
        entry = {"title": r["title"], "url": r["url"], "updated": r["updated"]}
        if entry not in self.used.setdefault(section, []):
            self.used[section].append(entry)
        return get_file(r["url"])


def _years(*series: dict) -> list[str]:
    return sorted(set().union(*[s.keys() for s in series]))


def _pack(years: list[str], **named: dict) -> dict:
    """{"years": [...], "series": {name: [values aligned to years]}}."""
    return {"years": years, "series": {k: [v.get(y) for y in years] for k, v in named.items()}}


def _check_close(a, b, what: str, tol: float = 0.02):
    if a is None or b is None:
        return
    if abs(a - b) > tol * max(abs(a), abs(b), 1):
        raise ValueError(f"production check failed: {what}: {a} vs {b}")


def _soft_check(a, b, notes: list, message: str, *, tol: float = 0.01, hard: float = 0.05):
    """Small mismatches inside a UBOS table become a visible note; large ones stop the build."""
    if a is None or b is None:
        return
    gap = abs(a - b) / max(abs(a), abs(b), 1)
    if gap > hard:
        raise ValueError(f"production check failed: {message}")
    if gap > tol:
        notes.append(message)


# ---- energy -------------------------------------------------------------------

def energy(src: Sources) -> dict:
    s = "energy"
    cap = wide.read(src.path(s, "9e1c46572de0"))
    hydro, bagasse, solar, thermal = (wide.series(cap, n) for n in ("Hydro Electricity", "*Bagasse Electricity", "Solar PV", "Thermal Electricity"))
    biomass = wide.series(cap, "Biomass")
    renew = wide.series(cap, "Renewable Sources")
    total = wide.series(cap, "Installed Capacity")
    notes: list[str] = []
    for y in cap["years"]:
        parts = sum(v[y] or 0 for v in (hydro, bagasse, solar, biomass))
        _soft_check(
            parts, renew[y], notes,
            f"In UBOS’s {y} table the renewable sources add up to {parts:,.0f} MW, but its renewables total says "
            f"{renew[y]:,.0f} MW. The chart shows the individual sources.",
        )
        _check_close((renew[y] or 0) + (thermal[y] or 0), total[y], f"installed total {y}", 0.01)

    cust = wide.read(src.path(s, "ff75002f8e0b"))
    customers = {y: sum(v for v in col if v is not None) for y, col in zip(cust["years"], zip(*[r["values"] for r in cust["rows"]]))}
    umeme = wide.series(cust, "Umeme")

    # Fuel prices: 2013-2021 release joined to the 2019-2023 release (overlap must agree).
    old_p = wide.read(src.path(s, "0763be101432"), sheet="Annual Average")
    new_p = wide.read(src.path(s, "98252641b83f"))
    prices = {
        fuel: wide.splice(wide.series(old_p, fuel), wide.series(new_p, fuel), what=f"{fuel} price")
        for fuel in ("Petrol", "Diesel", "Kerosene")
    }

    # Fuel sales: 2014-2021 in litres joined to 2019-2023 in cubic metres (1 m3 = 1,000 L).
    old_s = wide.read(src.path(s, "bafcb1f3927a"))
    new_s = wide.read(src.path(s, "2ab2f91ddce7"))
    to_m3 = lambda d: {y: (v / 1000 if v is not None else None) for y, v in d.items()}
    sales = {
        "Petrol": wide.splice(to_m3(wide.series(old_s, "Petrol")), wide.series(new_s, "Petrol (PMS)"), what="petrol sales"),
        "Diesel": wide.splice(to_m3(wide.series(old_s, "Diesel")), wide.series(new_s, "Diesel (AGO)"), what="diesel sales"),
        "Kerosene": wide.splice(to_m3(wide.series(old_s, "Kerosene")), wide.series(new_s, "Kerosene (BIK)"), what="kerosene sales"),
        "Jet fuel": wide.splice(to_m3(wide.series(old_s, "Jet Fuel")), wide.series(new_s, "Jet fuel"), what="jet fuel sales"),
    }

    return {
        "capacity": _pack(cap["years"], Hydro=hydro, **{"Bagasse (sugar-cane waste)": bagasse, "Solar": solar, "Thermal (oil)": thermal}),
        "customers": _pack(cust["years"], **{"All electricity customers": customers, "Umeme": umeme}),
        "fuel_prices": _pack(_years(*prices.values()), **prices),
        "fuel_sales": _pack(_years(*sales.values()), **sales),
        "notes": notes,
    }


# ---- industry -----------------------------------------------------------------

PRODUCTS = {
    "Cement": ("1c9436a89993", "thousand tonnes"),
    "Beer": ("ea248bc8f26b", "million litres"),
    "Soft drinks": ("ecde2b1bb3fd", "million litres"),
    "Sugar": ("8973d5aa1302", "thousand tonnes"),
    "Cooking oil": ("2b7d4b001b32", "million litres"),
    "Spirits": ("7d5fb01c3a8e", "million litres"),
}


def industry(src: Sources) -> dict:
    s = "industry"
    products = []
    for name, (cid, unit) in PRODUCTS.items():
        t = wide.read(src.path(s, cid))
        scale = 1 / 1000 if unit == "million litres" else 1  # tables are in '000 litres
        p, i, e, nds = (
            {y: (v * scale if v is not None else None) for y, v in wide.series(t, lab, startswith=True).items()}
            for lab in ("Production", "Imports", "Exports", "Net Domestic Supply")
        )
        for y in t["years"]:
            _check_close((p[y] or 0) + (i[y] or 0) - (e[y] or 0), nds[y], f"{name} supply balance {y}", 0.03)
        y = t["years"][-1]
        home_made = (p[y] - e[y]) / nds[y] * 100 if nds[y] else None
        products.append({
            "name": name,
            "unit": unit,
            "latest_year": y,
            "local_share": round(home_made, 1) if home_made is not None else None,
            **_pack(t["years"], Production=p, Imports=i, Exports=e, **{"Used in Uganda": nds}),
        })

    idx = wide.read(src.path(s, "83715792c2db"))
    growth = wide.read(src.path(s, "d6f5948c33c2"))
    sectors = [r["label"] for r in idx["rows"] if r["label"].lower() != "total manufacturing"]
    return {
        "products": products,
        "index": _pack(idx["years"], **{"All manufacturing": wide.series(idx, "Total Manufacturing")}),
        "sector_growth": {
            "year": growth["years"][-1],
            "sectors": [
                {"name": r["label"].strip(), "growth": r["values"][-1]}
                for r in growth["rows"] if r["label"].lower() != "total manufacturing"
            ],
            "total": wide.row(growth, "Total Manufacturing")[-1],
        },
        "sector_names": sectors,
    }


# ---- transport ----------------------------------------------------------------

def transport(src: Sources) -> dict:
    s = "transport"
    roads = wide.read(src.path(s, "1eb504cbb90f"))
    reg = wide.read(src.path(s, "11083ca57ddc"))

    # International passengers: 2012-2024 (arrivals + departures) joined to 2019-2023 totals.
    old = wide.read(src.path(s, "52879aefbe85"))
    dep = wide.series(old, "International Passengers Dep", startswith=True)
    enp = wide.series(old, "International Passengers enp", startswith=True)
    old_intl = {y: (dep[y] or 0) + (enp[y] or 0) if dep[y] is not None and enp[y] is not None else None for y in old["years"]}
    new = wide.read(src.path(s, "9a4020fdb184"))
    intl = wide.splice(old_intl, wide.series(new, "International"), what="Entebbe international passengers")

    ferry = wide.read(src.path(s, "2720b5741009"))
    return {
        "roads": _pack(roads["years"], Paved=wide.series(roads, "Total Paved"), Unpaved=wide.series(roads, "Total unpaved")),
        "registrations": _pack(
            reg["years"],
            Motorcycles=wide.series(reg, "Newly Registered M/Cycles"),
            Cars=wide.series(reg, "Newly Registered Cars"),
        ),
        "entebbe": _pack(sorted(intl), **{"International passengers": intl}),
        "ferries": _pack(ferry["years"], **{"Ferry passengers": wide.series(ferry, "Total")}),
    }


# ---- tourism ------------------------------------------------------------------

PARK_NAMES = {"Nattional": "National", "Montains": "Mountains"}


def tourism(src: Sources) -> dict:
    s = "tourism"
    new = wide.read_long(src.path(s, "57839b33dff6"))           # 2019-2023, thousands
    old = wide.read_long(src.path(s, "157c71424fc8"))           # 2017, 2019-2022, persons
    older = wide.column(old, "Total")
    arrivals = wide.splice(
        older,
        {y: v * 1000 for y, v in wide.column(new, "Arrivals / Number").items() if v is not None},
        tolerance=0.002,
        what="total arrivals",
    )
    # 2018 was never published, and the series nearly halves across that gap
    # (1.93m in 2017 -> 1.04m in 2019), which looks like a change in counting,
    # not travel. Chart 2019 onwards; mention 2017 in the note.
    y2017 = arrivals.pop("2017", None)
    visitors = {y: v * 1000 for y, v in wide.column(wide.read_long(src.path(s, "244988314ff9")), "Visitor Arrivals").items() if v is not None}

    parks = wide.read(src.path(s, "632d75bfb703"))
    park_rows = []
    for r in parks["rows"]:
        name = r["label"]
        for bad, good in PARK_NAMES.items():
            name = name.replace(bad, good)
        if name.lower().startswith("total"):
            continue
        park_rows.append({"name": name, "values": r["values"][: len(parks["years"])]})
    return {
        "arrivals": _pack(sorted(arrivals), **{"All arrivals": arrivals}),
        "visitors": _pack(sorted(visitors), **{"Visitor (tourist) arrivals": visitors}),
        "parks": {"years": parks["years"], "rows": park_rows},
        "notes": [
            f"UBOS reports {y2017 / 1e6:.2f} million arrivals for 2017 and published no 2018 figure. The series nearly "
            "halves across that gap, which suggests a change in how arrivals were counted, so the chart starts in 2019."
        ] if y2017 else [],
    }


# ---- mobile money -------------------------------------------------------------

def communication(src: Sources) -> dict:
    """Mobile money (Bank of Uganda data, published by UBOS).

    The table mixes units across years (transactions and active customers switch
    units around 2021), and 2020 covers January-September only. We chart only the
    rows that stay consistent, and drop points that are partial or implausible.
    """
    s = "communication"
    t = wide.read(src.path(s, "cc4c449c89ff"))
    notes = []
    value = {y: (v / 1e6 if v is not None else None) for y, v in wide.series(t, "Value of Transactions", startswith=True).items()}  # million UGX -> trillion
    customers = {y: (v / 1e3 if v is not None else None) for y, v in wide.series(t, "No. of Registered Customers", startswith=True).items()}  # thousands -> millions
    agents = wide.series(t, "No. of Agents", startswith=True)

    # 2020 is a partial year (UBOS footnote "2020* Data available only up to September").
    if "2020" in value:
        value["2020"] = None
        notes.append("UBOS’s 2020 mobile-money figures cover January to September only, so 2020 is left out of the value chart.")
    # Guard: a value more than triple the previous year's is treated as a data break, not growth.
    years = [y for y in t["years"] if value.get(y) is not None]
    for prev, y in zip(years, years[1:]):
        if int(y) >= 2016 and value[y] > 3 * value[prev]:
            notes.append(
                f"UBOS reports UGX {value[y]:,.1f} trillion for {y}, {value[y] / value[prev]:.1f}× the {prev} figure, "
                "with no explanation, so we leave it out until it is confirmed."
            )
            value[y] = None
    notes.append("The number of transactions and of active customers change units part-way through UBOS’s table, so we don’t chart them.")
    return {"mobile_money": _pack(t["years"], value=value, customers=customers, agents=agents), "notes": notes}


# ---- agriculture --------------------------------------------------------------

LAKES = {
    "Lake Victoria": "Victoria", "Lake Albert": "Albert", "Lake Kyoga": "Kyoga",
    "Lake Edward, George,& Kazinga Channel": "Edward, George & Kazinga", "Albert Nile": "Albert Nile",
    "Lake Wamala": "Wamala", "Other Waters": "Other waters",
}


def agriculture(src: Sources) -> dict:
    s = "agriculture"
    notes = []

    stock = wide.read(src.path(s, "b6cb48a59a3d"))
    livestock = {r["label"]: dict(zip(stock["years"], r["values"])) for r in stock["rows"]}  # thousand animals

    # Fish: 2014-2018 (the 'Sheet2' table; 'Sheet1' of that file is mislabelled prison data)
    # joined to 2019-2023 estimates. Lake names differ between releases.
    old = wide.read(src.path(s, "2edbfd22a7a8"), sheet="Sheet2")
    new = wide.read(src.path(s, "20b9898039d8"))
    new_by = {r["label"].split(" cha")[0].strip(): dict(zip(new["years"], r["values"])) for r in new["rows"]}
    alias = {"Edward, George & Kazinga": "Edward, George & Kazinga", "Other waters": "Others"}
    fish = {}
    copied = []
    for r in old["rows"]:
        if r["label"].lower() == "total":
            continue
        name = LAKES.get(r["label"], r["label"])
        older = dict(zip(old["years"], r["values"]))
        newer = dict(new_by.get(alias.get(name, name), {}))
        # UBOS's 2019 estimate repeats 2018 exactly for some lakes: not a real measurement.
        if newer.get("2019") is not None and newer.get("2019") == older.get("2018"):
            newer["2019"] = None
            copied.append(name)
        fish[name] = {**older, **{y: v for y, v in newer.items() if v is not None}}
    if copied:
        which = "every lake" if len(copied) == len(fish) else ", ".join(copied)
        notes.append(
            f"UBOS’s 2019 fish-catch estimates are identical to 2018, to the tonne, for {which}. They look carried over "
            "rather than measured, so 2019 is left blank."
        )
    fish_years = _years(*fish.values())

    milk = wide.read_long(src.path(s, "dc41d1f1c935"))
    milk_total = {y: (v / 1000 if v is not None else None) for y, v in wide.column(milk, "Total Milk").items()}  # million -> billion litres

    # Honey (Livestock Census 2021, last six months): a "Uganda" row, then a block of
    # 5 regions, then a "Sub-Region" heading and 14 sub-regions. Both blocks must sum
    # to the national total; the chart uses the finer sub-regions.
    honey_total, blocks, current = None, {"region": [], "sub-region": []}, "region"
    for r in wide.load(src.path(s, "8a4a9e967c09")):
        label = str(r[0]).strip() if r and r[0] else ""
        v = wide.num(r[1]) if len(r) > 1 else None
        if label.lower() == "uganda":
            honey_total = v
        elif label.lower() == "sub-region":
            current = "sub-region"
        elif label and v is not None:
            blocks[current].append({"region": label, "kg": v})
    for name, rows in blocks.items():
        _check_close(sum(h["kg"] for h in rows), honey_total, f"honey {name} sum", 0.01)
    honey = blocks["sub-region"]

    return {
        "livestock": _pack(stock["years"], **livestock),
        "fish": _pack(fish_years, **fish),
        "milk": _pack(sorted(milk_total), **{"Milk produced": milk_total}),
        "honey": {"total_kg": honey_total, "regions": sorted(honey, key=lambda h: -h["kg"])},
        "notes": notes,
    }


# ---- build --------------------------------------------------------------------

def build() -> dict:
    src = Sources()
    data = {
        "energy": energy(src),
        "industry": industry(src),
        "transport": transport(src),
        "tourism": tourism(src),
        "communication": communication(src),
        "agriculture": agriculture(src),
    }
    data["sources"] = src.used
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")
    return data
