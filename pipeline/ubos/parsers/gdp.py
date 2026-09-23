"""Gross Domestic Product: annual (AGDP, fiscal years) and quarterly (QGDP).

Annual workbook ("Annual Gross Domestic Product Publication Tables ... .xls"):
  Summary   GDP at current & constant 2016/17 prices, GDP per capita (UGX '000,
            US$), mid-year population, exchange rate, GDP in US$
  GDP CP    Table 2.1: value added by activity, current prices (billion UGX)
  GDP KP    Table 3.1: value added by activity, constant 2016/17 prices;
            Table 3.2: UBOS's own % growth (used to check ours)
  Formal /  formal and informal sector production, current prices
  Informal

Quarterly workbook ("Quarterly Gross Domestic Product Constant Prices Qn YYYY-YY"):
  Original_VA      value added by activity per quarter, constant prices
  Original_Growth  UBOS's year-on-year % growth per quarter (used to check ours)

Tables are located by their labels (e.g. "Table 3.2", "GDP at market prices"),
never by fixed row numbers.
"""

from __future__ import annotations

import re

import openpyxl
import xlrd

FY = re.compile(r"^\d{4}/\d{2}$")


def _norm(v) -> str:
    return " ".join(str(v).split()).strip().lower() if v is not None else ""


def _num(v):
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


# ---- annual ------------------------------------------------------------------

def _xls_rows(book, name) -> list[list]:
    sh = book.sheet_by_name(name)
    return [sh.row_values(i) for i in range(sh.nrows)]


def _fy_header(rows, start=0):
    """First row at/after `start` holding fiscal-year labels. Returns (row_idx, {col: 'YYYY/YY'})."""
    for i in range(start, len(rows)):
        cols = {j: str(v).strip() for j, v in enumerate(rows[i]) if FY.match(str(v).strip())}
        if len(cols) >= 3:
            return i, cols
    raise ValueError("no fiscal-year header row found")


def _block(rows, table_label: str | None = None):
    """Rows of one table: from its FY header to the next 'Table' label. Returns (years, {label: [values]}, isic)."""
    start = 0
    if table_label:
        start = next(i for i, r in enumerate(rows) if any(_norm(c) == table_label.lower() for c in r))
    h, cols = _fy_header(rows, start)
    years = list(cols.values())
    data: dict[str, list] = {}
    isic: dict[str, str] = {}
    for r in rows[h + 1 :]:
        if any(_norm(c).startswith("table ") for c in r):
            break
        label = next((str(c).strip() for c in r[:2] if str(c).strip()), "")
        vals = [_num(r[j]) for j in cols]
        if label and any(v is not None for v in vals):
            key = " ".join(label.split())
            data.setdefault(key, vals)
            code = str(r[2]).strip() if len(r) > 2 else ""
            if code and code.isalpha():
                isic[key] = code
    return years, data, isic


def _pick(data: dict, *starts: str):
    for s in starts:
        for k, v in data.items():
            if k.lower().startswith(s.lower()):
                return v
    raise ValueError(f"row starting with {starts} not found")


def parse_annual(path) -> dict:
    book = xlrd.open_workbook(path)
    years, summary, _ = _block(_xls_rows(book, "Summary"))
    cp_years, cp, isic = _block(_xls_rows(book, "GDP CP"), "Table 2.1")
    kp_years, kp, _ = _block(_xls_rows(book, "GDP KP"), "Table 3.1")
    _, kp_growth, _ = _block(_xls_rows(book, "GDP KP"), "Table 3.2")
    if not (years == cp_years == kp_years):
        raise ValueError("AGDP: year columns differ between sheets")

    gdp_cp = _pick(summary, "At current prices")
    gdp_kp = _pick(summary, "At constant")
    growth = [None] + [round((b / a - 1) * 100, 1) for a, b in zip(gdp_kp, gdp_kp[1:])]

    # Check 1: our growth equals UBOS's published growth (Table 3.2).
    published = _pick(kp_growth, "GDP at")
    for y, ours, theirs in zip(years[1:], growth[1:], published[1:]):
        if theirs is not None and abs(ours - theirs) > 0.15:
            raise ValueError(f"AGDP: derived growth {ours}% != UBOS {theirs}% for {y}")

    # Check 2: sectors + taxes add up to GDP (current prices).
    broad = {
        "Agriculture": _pick(cp, "Agriculture"),
        "Industry": _pick(cp, "Industry"),
        "Services": _pick(cp, "Services"),
        "Taxes on products": _pick(cp, "Taxes on products"),
    }
    for i, y in enumerate(years):
        s = sum(v[i] for v in broad.values())
        if abs(s - gdp_cp[i]) / gdp_cp[i] > 0.005:
            raise ValueError(f"AGDP: sectors sum {s:.0f} != GDP {gdp_cp[i]:.0f} in {y}")

    # Detailed activities (lettered ISIC codes), current and constant prices.
    activities = []
    for label, code in isic.items():
        if len(code) == 1 or len(code) == 2:
            kp_row = kp.get(label)
            activities.append({
                "name": label,
                "isic": code,
                "sector": "Agriculture" if code.startswith("A") else "Industry" if code in "BCDEF" else "Services",
                "current": cp[label],
                "growth": [None] + [round((b / a - 1) * 100, 1) if a and b else None for a, b in zip(kp_row, kp_row[1:])] if kp_row else None,
            })

    formal_years, formal, _ = _block(_xls_rows(book, "Formal"))
    _, informal, _ = _block(_xls_rows(book, "Informal"))
    formal_total = _pick(formal, "GDP at market")
    informal_total = _pick(informal, "Total Informal")

    return {
        "years": years,
        "gdp_current": gdp_cp,                 # billion UGX
        "gdp_constant": gdp_kp,                # billion UGX, 2016/17 prices
        "growth": growth,                      # % real growth
        "per_capita_ugx": [v * 1000 if v else None for v in _pick(summary, "GDP per capita (UGS")],
        "per_capita_usd": _pick(summary, "GDP per capita (US"),
        "population_000": _pick(summary, "Mid-Year Population"),
        "usd_rate": _pick(summary, "Exchange rate"),
        "gdp_usd_million": _pick(summary, "GDP - Million"),
        "broad_current": broad,
        "activities": activities,
        "informal_share": [round(100 * i / (i + f), 1) for i, f in zip(informal_total, formal_total)]
        if formal_years == years else None,
    }


# ---- quarterly ---------------------------------------------------------------

def _xlsx_rows(path, sheet):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    return [list(r) for r in wb[sheet].iter_rows(values_only=True)]


def _quarter_columns(rows):
    """Find the FY row and the Q-row below it; returns [(col, 'YYYY/YY Qn')]."""
    for i, r in enumerate(rows):
        if sum(1 for v in r if FY.match(str(v).strip() if v else "")) >= 3:
            q = rows[i + 1]
            out, fy = [], None
            for j, v in enumerate(r):
                if v and FY.match(str(v).strip()):
                    fy = str(v).strip()
                qv = str(q[j]).strip() if j < len(q) and q[j] else ""
                if fy and re.match(r"^Q[1-4]$", qv):
                    out.append((j, f"{fy} {qv}"))
            return i + 1, out
    raise ValueError("QGDP: quarter header not found")


def parse_quarterly(path) -> dict:
    va = _xlsx_rows(path, "Original_VA")
    hdr, cols = _quarter_columns(va)
    gdp_row = next(r for r in va[hdr + 1 :] if _norm(r[0]).startswith("gdp at market"))
    values = [_num(gdp_row[j]) for j, _ in cols]
    labels = [lab for _, lab in cols]
    while values and values[-1] is None:
        values.pop()
        labels.pop()
    yoy = [None] * 4 + [round((b / a - 1) * 100, 1) if a and b else None for a, b in zip(values, values[4:])]

    # Check against UBOS's own quarterly growth table.
    gr = _xlsx_rows(path, "Original_Growth")
    ghdr, gcols = _quarter_columns(gr)
    g_row = next(r for r in gr[ghdr + 1 :] if _norm(r[0]).startswith("gdp at market"))
    published = {lab: _num(g_row[j]) for j, lab in gcols}
    for lab, ours in zip(labels, yoy):
        theirs = published.get(lab)
        if ours is not None and theirs is not None and abs(ours - theirs) > 0.15:
            raise ValueError(f"QGDP: derived growth {ours}% != UBOS {theirs}% for {lab}")

    return {"quarters": labels, "gdp_constant": values, "yoy": yoy}
