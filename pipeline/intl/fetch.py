"""Fetch one indicator from the World Bank, IMF or WHO as {place: {year: value}}.

All requests go through ubos.http, so they are cached on disk (use
refresh=True to pull new releases) and retried politely.
"""

from __future__ import annotations

import json

from ubos.http import get_text

from .config import AGG_CODES, FIRST_YEAR, PLACES

Series = dict[str, dict[int, float]]


def _codes(source: str) -> dict[str, str]:
    """Our place code -> the source's code (aggregates differ per source)."""
    agg = AGG_CODES[source]
    return {p: agg.get(p, p) for p in PLACES if p in agg or len(p) == 3 and p not in ("SSA", "LIC", "WLD")}


def world_bank(code: str, refresh: bool = False) -> Series:
    codes = _codes("wb")
    url = (
        f"https://api.worldbank.org/v2/country/{';'.join(codes.values())}/indicator/{code}"
        f"?format=json&per_page=20000&date={FIRST_YEAR}:2030"
    )
    meta, rows = json.loads(get_text(url, refresh=refresh))[:2]
    if meta.get("pages", 1) > 1:
        raise ValueError(f"World Bank {code}: more than one page of results")
    back = {v: k for k, v in codes.items()}
    back["XM"] = "LIC"  # the low-income aggregate has no ISO3 code, only the id "XM"
    out: Series = {}
    for r in rows or []:
        place = back.get(r["countryiso3code"] or r["country"]["id"])
        if place and r["value"] is not None:
            out.setdefault(place, {})[int(r["date"])] = float(r["value"])
    return out


def imf(code: str, refresh: bool = False) -> Series:
    codes = _codes("imf")
    data = json.loads(get_text(f"https://www.imf.org/external/datamapper/api/v1/{code}", refresh=refresh))
    values = data.get("values", {}).get(code, {})
    out: Series = {}
    for place, src in codes.items():
        for year, v in (values.get(src) or {}).items():
            if v is not None and int(year) >= FIRST_YEAR:
                out.setdefault(place, {})[int(year)] = float(v)
    return out


def who(code: str, refresh: bool = False) -> Series:
    codes = _codes("who")
    # The API rejects long filters, so fetch the whole indicator (cached) and filter here.
    rows = json.loads(get_text(f"https://ghoapi.azureedge.net/api/{code}", refresh=refresh))["value"]
    back = {v: k for k, v in codes.items()}
    out: Series = {}
    for r in rows:
        # Both sexes where the indicator is split by sex; skip other breakdowns.
        if r.get("Dim1") not in (None, "", "SEX_BTSX") or r.get("Dim2") not in (None, ""):
            continue
        place = back.get(r["SpatialDim"])
        v = r.get("NumericValue")
        if place and v is not None and int(r["TimeDim"]) >= FIRST_YEAR:
            out.setdefault(place, {})[int(r["TimeDim"])] = float(v)
    return out


FETCH = {"wb": world_bank, "imf": imf, "who": who}
