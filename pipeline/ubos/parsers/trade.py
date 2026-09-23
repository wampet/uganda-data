"""Merchandise trade (US$ thousands), formal + informal, 1996 to date.

Five UBOS workbooks, released together:
  Total Monthly Merchandise trade     sheet "Summary Trade": month, exports, imports
  Composition of Exports              sheet "CY_Export Value Commodity.": ~40 products x calendar years
  Composition of Imports              sheet "CY_Value SITC": SITC divisions x calendar years
  Direction of Exports / Imports      sheets "CY Exports by Destination" / "CY_Imports by Origin":
                                      countries grouped under regional subtotal rows

Notes:
  * The Direction workbooks also contain a helper sheet full of #REF! errors;
    we only ever read the named calendar-year sheets.
  * Regional subtotal rows (EAC, MIDDLE EAST, ...) are named in REGIONS and each
    must match the countries beneath it (see parse_direction for tolerances).
  * Checks: products and countries each add up to the published total, and the
    monthly file's calendar-year sums match the annual tables.
"""

from __future__ import annotations

from datetime import date, datetime

import openpyxl


def _rows(path, sheet_prefix: str):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = next(w for w in wb.worksheets if w.title.strip().lower().startswith(sheet_prefix.lower()))
    return [list(r) for r in ws.iter_rows(values_only=True)]


def _num(v) -> float | None:
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


# ---- monthly totals -----------------------------------------------------------

def parse_monthly(path) -> dict:
    rows = _rows(path, "Summary Trade")
    hdr = next(i for i, r in enumerate(rows) if str(r[0]).strip().lower() == "period")
    months, exports, imports = [], [], []
    for r in rows[hdr + 1 :]:
        p, e, m = r[0], _num(r[1]), _num(r[2])
        if e is None or m is None:
            continue
        if isinstance(p, datetime | date):
            ym = f"{p.year:04d}-{p.month:02d}"
        else:  # later rows are text like "Mar-26"
            d = datetime.strptime(str(p).strip(), "%b-%y")
            ym = f"{d.year:04d}-{d.month:02d}"
        months.append(ym)
        exports.append(e)
        imports.append(m)
    # Months must be consecutive; a gap means the layout changed.
    for a, b in zip(months, months[1:]):
        ya, ma = map(int, a.split("-"))
        yb, mb = map(int, b.split("-"))
        if (yb * 12 + mb) - (ya * 12 + ma) != 1:
            raise ValueError(f"trade monthly: gap between {a} and {b}")
    return {"months": months, "exports": exports, "imports": imports}


# ---- calendar-year tables ------------------------------------------------------

def _year_table(rows, label_col: int):
    """Find the header row with years; return (years, [(code, label, values)], total_values)."""
    for h, r in enumerate(rows):
        years = [(j, int(v)) for j, v in enumerate(r) if isinstance(v, int | float) and 1990 <= v <= 2100]
        if len(years) >= 10:
            break
    else:
        raise ValueError("trade: no year header row")
    items, total = [], None
    for r in rows[h + 1 :]:
        label = r[label_col]
        vals = [_num(r[j]) or 0.0 for j, _ in years]
        if not any(isinstance(r[j], int | float) for j, _ in years):
            continue
        code = str(r[0]).strip() if label_col == 1 and r[0] is not None else ""
        text = " ".join(str(label).split()) if label is not None else ""
        # The total row is marked in either the label or the code column.
        if text.lower() in ("total", "grand total") or code.lower() == "total":
            total = vals
            continue
        if not text:
            continue
        items.append((code, text, vals))
    if total is None:
        raise ValueError("trade: no Total row")
    return [y for _, y in years], items, total


def _check_sum(name, items, total, years):
    for i, y in enumerate(years):
        s = sum(v[i] for _, _, v in items)
        if total[i] and abs(s - total[i]) / total[i] > 0.005:
            raise ValueError(f"trade {name}: parts sum {s:,.0f} != total {total[i]:,.0f} in {y}")


def parse_composition(path, sheet_prefix: str, label_col: int = 1) -> dict:
    rows = _rows(path, sheet_prefix)
    # Imports put the label in column 1 but the TOTAL marker in column 0.
    years, items, total = _year_table(rows, label_col)
    _check_sum(sheet_prefix, items, total, years)
    return {"years": years, "items": [{"code": c, "name": n, "values": v} for c, n, v in items], "total": total}


REGIONS = {
    "EAC", "REST OF AFRICA", "EUROPEAN UNION", "REST OF EUROPE", "ASIA",
    "MIDDLE EAST", "AMERICA", "REST OF THE WORLD",
}


def parse_direction(path, sheet_prefix: str) -> dict:
    rows = _rows(path, sheet_prefix)
    years, items, total = _year_table(rows, 0)

    # UBOS lists countries in blocks, each headed by a regional subtotal row.
    # Subtotals are not perfectly consistent over time (e.g. US$98m moved between
    # "European Union" and "Rest of Europe" in 2023 imports), so each block must
    # match its countries in >=90% of years; mismatched years are recorded.
    # The grand-total check below stays strict: an unknown new region label
    # would be double-counted as a country and fail it.
    def close(a: float, v: float) -> bool:
        return abs(a - v) <= max(100.0, 0.01 * abs(v))

    starts = [k for k, (_, n, _) in enumerate(items) if n.upper() in REGIONS]
    if len(starts) < 5:
        raise ValueError(f"trade {sheet_prefix}: expected UBOS region rows, found {len(starts)}")

    regions, countries = [], []
    for k in range(starts[0]):  # rows before the first block (none expected)
        countries.append({"name": items[k][1], "values": items[k][2], "region": None})
    for a, b in zip(starts, starts[1:] + [len(items)]):
        name, vals = items[a][1], items[a][2]
        members = items[a + 1 : b]
        sums = [sum(m[2][y] for m in members) for y in range(len(years))]
        off = [years[y] for y in range(len(years)) if not close(sums[y], vals[y])]
        if len(off) > 0.1 * len(years):
            raise ValueError(f"trade {sheet_prefix}: region {name} doesn't match its countries in {off}")
        regions.append({"name": name, "values": vals, "members": [m[1] for m in members], "inconsistent_years": off})
        countries.extend({"name": m[1], "values": m[2], "region": name} for m in members)

    for y in range(len(years)):
        s = sum(c["values"][y] for c in countries)
        if total[y] and abs(s - total[y]) / total[y] > 0.005:
            raise ValueError(f"trade {sheet_prefix}: countries sum {s:,.0f} != total {total[y]:,.0f} in {years[y]}")
    return {"years": years, "regions": regions, "countries": countries, "total": total}


def cross_check(monthly: dict, annual_total: list[float], years: list[int], label: str, key: str) -> None:
    """Calendar-year sums of the monthly series must match the annual table (full years only)."""
    by_year: dict[int, list[float]] = {}
    for ym, v in zip(monthly["months"], monthly[key]):
        by_year.setdefault(int(ym[:4]), []).append(v)
    for y, t in zip(years, annual_total):
        vals = by_year.get(y, [])
        if len(vals) == 12 and t and abs(sum(vals) - t) / t > 0.01:
            raise ValueError(f"trade {label}: monthly sum {sum(vals):,.0f} != annual {t:,.0f} in {y}")
