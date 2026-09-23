"""Population: age structure projections, census counts since 1911, life expectancy.

Sources (all UBOS xlsx):
  * "National Mid Year Population Projections by Single Age (2015-2050)"
      sheet "single year": Male / Female / Total blocks, ages 0..79 and "80+",
      one column per year 2014..2050, each block ending in a "Total" row.
      These projections were made from the 2014 census, before the 2024 count.
  * "Population Inter-censal growth rates, 1911 to 2024"   (census totals by sex)
  * "Life Expectancy at Birth by Census Year 1969 to 2024"

Checks: every age column must sum to its block's "Total" row, and Male +
Female must equal Total, or the parse fails.
"""

from __future__ import annotations

import openpyxl


def _rows(path, sheet=None):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb[sheet] if sheet else wb.worksheets[0]
    return [list(r) for r in ws.iter_rows(values_only=True)]


def _label(v) -> str:
    return " ".join(str(v).split()).lower() if v is not None else ""


def parse_single_age(path) -> dict:
    rows = _rows(path, "single year")
    blocks: dict[str, dict] = {}
    i = 0
    while i < len(rows):
        name = _label(rows[i][0])
        if name in ("male", "female", "total") and name not in blocks and rows[i + 1][0] is None:
            header = rows[i + 1]
            years = [int(v) for v in header[1:] if isinstance(v, int | float)]
            ages: list[str] = []
            data: list[list[int]] = []
            total = None
            j = i + 2
            while j < len(rows):
                a = rows[j][0]
                vals = [int(v) for v in rows[j][1 : 1 + len(years)]]
                if _label(a) == "total":
                    total = vals
                    break
                ages.append(str(a).strip())
                data.append(vals)
                j += 1
            if total is None:
                raise ValueError(f"population: no Total row in {name} block")
            for y in range(len(years)):
                s = sum(r[y] for r in data)
                if abs(s - total[y]) > 1000:  # UBOS rounds to the nearest 100
                    raise ValueError(f"population: {name} {years[y]} ages sum {s} != Total {total[y]}")
            blocks[name] = {"years": years, "ages": ages, "data": data, "total": total}
            i = j
        i += 1

    male, female, both = blocks["male"], blocks["female"], blocks["total"]
    if male["ages"] != female["ages"] or male["years"] != female["years"]:
        raise ValueError("population: male and female blocks do not line up")
    for y in range(len(male["years"])):
        if abs(male["total"][y] + female["total"][y] - both["total"][y]) > 1000:
            raise ValueError(f"population: male + female != total in {male['years'][y]}")

    return {
        "years": male["years"],
        "ages": male["ages"],          # "0".."79", "80+"
        "male": male["data"],          # [age][year]
        "female": female["data"],
        "total": both["total"],        # [year]
    }


def _find_table(rows, first_header: str):
    """Locate a header row whose first non-empty cell starts with `first_header`."""
    for i, r in enumerate(rows):
        cells = [c for c in r if c is not None]
        if cells and _label(cells[0]).startswith(first_header):
            offset = next(k for k, c in enumerate(r) if c is not None)
            return i, offset
    raise ValueError(f"table header '{first_header}' not found")


def parse_census_history(path) -> list[dict]:
    rows = _rows(path)
    h, o = _find_table(rows, "census year")
    out = []
    for r in rows[h + 1 :]:
        year = r[o]
        if not isinstance(year, int | float):
            break
        out.append({"year": int(year), "male": int(r[o + 1]), "female": int(r[o + 2]), "total": int(r[o + 3]),
                    "growth": r[o + 6] if isinstance(r[o + 6], int | float) else None})
    if len(out) < 8:
        raise ValueError("census history: too few rows")
    return out


def parse_life_expectancy(path) -> list[dict]:
    rows = _rows(path)
    h, o = _find_table(rows, "census year")
    out = []
    for r in rows[h + 1 :]:
        year = r[o]
        if not isinstance(year, int | float):
            break
        out.append({"year": int(year), "male": float(r[o + 1]), "female": float(r[o + 2]), "total": float(r[o + 3])})
    return out
