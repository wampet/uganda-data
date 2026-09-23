"""Reader for UBOS's one-off "wide" tables: one row per item, one column per year.

    <title>
    <label header> | 2019 | 2020 | 2021** | Estimates 2022 | ...   <- year header
    [optional unit row, e.g. "catch (MT)"]
    Group heading                                             <- no values
    Item A         |  1,234 | (143) | '72, 000' | - | n/a ...
    Source: ...                                               <- stops here

Handles what these files actually contain: labels in the first or second column,
numbers stored as text ("1,847", "72, 000", "(143)" = -143), missing-value marks
("-", "n/a", "na", "N/A"), and footnote stars on year labels ("2021**").
"""

from __future__ import annotations

import re
from pathlib import Path

import openpyxl
import xlrd

# A cell that is just a year: "2021", "2021**", "*2008", "2018/19*", "Estimates 2019".
# Must match the whole cell, so titles like "Arrivals, 2019 – 2023" are not years.
YEAR = re.compile(r"^(?:estimates?\s+)?\*?((?:19|20)\d{2}(?:/\d{2})?)\**$", re.IGNORECASE)
MISSING = {"", "-", "–", "n/a", "na", "n.a", "n.a.", "..", "…"}


def num(v) -> float | None:
    """Coerce a UBOS cell to a number, or None if it is empty/missing."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, int | float):
        return float(v)
    s = str(v).strip().lower()
    if s in MISSING:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").replace(" ", "").replace(" ", "")
    try:
        return -float(s) if neg else float(s)
    except ValueError:
        return None


def year_of(v) -> str | None:
    """'2021**' -> '2021', 'Estimates 2019' -> '2019', 2014.0 -> '2014', '2018/19*' -> '2018/19'."""
    if isinstance(v, int | float) and not isinstance(v, bool) and 1900 <= v <= 2100 and float(v).is_integer():
        return str(int(v))
    m = YEAR.search(str(v).strip()) if v is not None else None
    return m.group(1) if m else None


def _label(v) -> str:
    return " ".join(str(v).split()) if v is not None and not isinstance(v, int | float) else ""


def load(path, sheet: str | None = None) -> list[list]:
    if Path(path).suffix.lower() == ".xls":
        book = xlrd.open_workbook(path)
        sh = book.sheet_by_name(sheet) if sheet else book.sheet_by_index(0)
        return [sh.row_values(i) for i in range(sh.nrows)]
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    return [list(r) for r in ws.iter_rows(values_only=True)]


def read(path, sheet: str | None = None, header_contains: str | None = None) -> dict:
    """Parse a wide table. Returns {"years": [...], "rows": [{"group", "label", "values"}]}.

    `header_contains` picks a later table in the same sheet: the year header is
    searched for only after the first row whose text contains it.
    """
    rows = load(path, sheet)
    start = 0
    if header_contains:
        start = next(i for i, r in enumerate(rows) if any(header_contains.lower() in _label(c).lower() for c in r))

    for h in range(start, len(rows)):
        cols = [(j, year_of(c)) for j, c in enumerate(rows[h]) if year_of(c)]
        if len(cols) >= 3:
            break
    else:
        raise ValueError(f"{path}: no year header row")

    first_year_col = cols[0][0]
    out, group = [], None
    for r in rows[h + 1 :]:
        # The label is the last text cell before the first year column.
        label = next((_label(r[j]) for j in range(first_year_col - 1, -1, -1) if j < len(r) and _label(r[j])), "")
        if label.lower().startswith(("source", "note")):
            break
        if not label:
            continue
        vals = [num(r[j]) if j < len(r) else None for j, _ in cols]
        if all(v is None for v in vals):
            group = label
            continue
        out.append({"group": group, "label": label, "values": vals})
    if not out:
        raise ValueError(f"{path}: no data rows under the year header")
    return {"years": [y for _, y in cols], "rows": out}


def read_long(path, sheet: str | None = None) -> dict:
    """Parse a "long" table: one row per year, one column per measure.

        Period | Arrivals          |                    | Departures ...
               | Number (000s)     | Annual %age Change | Number (000s) ...
        2019   | 1040              | -                  | 1234
        2023   | 1,847             | 55                 | 1,954

    Column names join the header rows above the first year row, carrying merged
    (blank) header cells across, e.g. "Arrivals / Number (000s)".
    Returns {"years": [...], "columns": {name: [values]}}.
    """
    rows = load(path, sheet)
    first = next((i for i, r in enumerate(rows) if r and year_of(r[0])), None)
    if first is None:
        raise ValueError(f"{path}: no year rows")
    ncols = max(len(r) for r in rows[first : first + 3])
    # Header rows: the non-empty rows directly above the first year row (max 3).
    hdr = []
    i = first - 1
    while i >= 0 and len(hdr) < 3 and any(_label(c) for c in rows[i][1:]):
        hdr.insert(0, rows[i])
        i -= 1
    names = []
    for j in range(1, ncols):
        parts = []
        for h in hdr:
            k = j
            while k > 0 and (k >= len(h) or not _label(h[k])):  # carry merged cells from the left
                k -= 1
            text = _label(h[k]) if k > 0 else ""
            if text and (not parts or parts[-1] != text):
                parts.append(text)
        names.append(" / ".join(parts) or f"col{j}")

    years, cols = [], {n: [] for n in names}
    for r in rows[first:]:
        y = year_of(r[0]) if r else None
        if not y:
            break
        years.append(y)
        for j, n in enumerate(names, start=1):
            cols[n].append(num(r[j]) if j < len(r) else None)
    return {"years": years, "columns": cols}


def column(table: dict, contains: str) -> dict[str, float | None]:
    """A long-table column (first whose name contains `contains`, case-insensitive) as {year: value}."""
    name = next((n for n in table["columns"] if contains.lower() in n.lower()), None)
    if name is None:
        raise KeyError(f"column containing '{contains}' not found in {list(table['columns'])}")
    return dict(zip(table["years"], table["columns"][name]))


def row(table: dict, label: str, *, group: str | None = None, startswith: bool = False, nth: int = 0) -> list:
    """Values of a row by label (case-insensitive). `nth` picks among repeated labels."""
    want = label.lower()
    hits = [
        r for r in table["rows"]
        if (r["label"].lower().startswith(want) if startswith else r["label"].lower() == want)
        and (group is None or (r["group"] or "").lower() == group.lower())
    ]
    if len(hits) <= nth:
        raise KeyError(f"row '{label}' not found" + (f" in group '{group}'" if group else ""))
    return hits[nth]["values"]


def series(table: dict, label: str, **kw) -> dict[str, float | None]:
    """A row as {year: value}."""
    return dict(zip(table["years"], row(table, label, **kw)))


def splice(older: dict, newer: dict, *, tolerance: float = 0.01, what: str = "") -> dict:
    """Join two year->value series; where both have a year, they must agree within `tolerance`."""
    for y in older.keys() & newer.keys():
        a, b = older[y], newer[y]
        if a is not None and b is not None and abs(a - b) > tolerance * max(abs(a), abs(b), 1):
            raise ValueError(f"{what}: sources disagree for {y}: {a} vs {b}")
    merged = {**older, **{y: v for y, v in newer.items() if v is not None}}
    return dict(sorted(merged.items()))
