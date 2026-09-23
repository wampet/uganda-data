"""Readers for UBOS's small one-off tables.

Most single-table workbooks on ubos.org share one layout:

    <title row>
    <header row>        e.g. "Background characteristics | 2012/13 | 2016/17 | ..."
    Residence           <- group label (no values)
    Rural    22.8 ...
    Urban     9.3 ...
    Region
    Kampala   0.7 ...
    Uganda   19.7 ...   <- ungrouped rows are allowed too
    Source: ...         <- footer, ignored

`read_grouped` returns the columns plus every row, tagged with its group, so a
page can pick "Region" rows or the "Uganda" row by name. Each table stays a
one-line description in export.py rather than a bespoke parser.
"""

from __future__ import annotations

import openpyxl


def _label(v) -> str:
    return " ".join(str(v).split()) if v is not None else ""


def _num(v):
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def read_grouped(path, sheet: str | None = None) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]

    def is_data(r):
        return bool(_label(r[0])) and any(_num(c) is not None for c in r[1:])

    def is_group(r):
        return bool(_label(r[0])) and all(c is None or not _label(c) for c in r[1:])

    # The header is the row above the first data row, skipping group labels.
    d = next((i for i, r in enumerate(rows) if is_data(r)), None)
    if d is None:
        raise ValueError(f"{path}: no data rows")
    h = d - 1
    while h > 0 and is_group(rows[h]):
        h -= 1
    header = rows[h]
    cols = [(j, _label(c)) for j, c in enumerate(header) if j > 0 and c is not None and _label(c)]
    group = None
    out = []
    for r in rows[h + 1 :]:
        label = _label(r[0])
        vals = [_num(r[j]) for j, _ in cols]
        if not label:
            continue
        if label.lower().startswith("source"):
            break
        if all(v is None for v in vals):
            group = label  # a section heading such as "Residence" or "Region"
            continue
        out.append({"group": group, "label": label, "values": vals})
    if not out:
        raise ValueError(f"{path}: table has no data rows")
    return {"columns": [c for _, c in cols], "rows": out}


def pick(table: dict, label: str, group: str | None = None) -> list:
    """Values of the row named `label` (optionally within `group`), case-insensitive."""
    for r in table["rows"]:
        if r["label"].lower() == label.lower() and (group is None or (r["group"] or "").lower() == group.lower()):
            return r["values"]
    raise KeyError(f"row '{label}' not found" + (f" in group '{group}'" if group else ""))


def group_rows(table: dict, group: str) -> list[dict]:
    return [r for r in table["rows"] if (r["group"] or "").lower() == group.lower()]
