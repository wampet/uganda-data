"""Crawl every UBOS category page and index every file it links to.

Output: data/catalog.json, one record per file:
  {id, title, url, format, kind, updated, ubos_category, topic, family}

`family` groups recurring releases (e.g. every monthly CPI workbook) so a single
parser can handle the whole family.
"""

from __future__ import annotations

import codecs
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup

from .http import get_bytes
from .taxonomy import all_ubos_ids

BASE = "https://www.ubos.org/explore-statistics/{}/"
OUT = Path(__file__).resolve().parents[1] / "data" / "catalog.json"


# UBOS pages are UTF-8 but some file names carry raw Windows-1252 bytes
# (e.g. 0x96 en-dash). Decode those bytes as cp1252 instead of losing them.
def _cp1252_fallback(err: UnicodeDecodeError):
    bad = err.object[err.start : err.end]
    return bad.decode("cp1252", errors="replace"), err.end


codecs.register_error("cp1252_fallback", _cp1252_fallback)


def _decode(raw: bytes) -> str:
    return raw.decode("utf-8", errors="cp1252_fallback")


def _encode_url(url: str) -> str:
    """Percent-encode a URL so that non-ASCII characters survive (bytes as cp1252)."""
    out = []
    for ch in url:
        if ord(ch) < 128:
            out.append(ch)
        else:
            try:
                out.append(quote(ch.encode("utf-8")))
            except UnicodeEncodeError:
                out.append(quote(ch.encode("cp1252")))
    return "".join(out)


_DATE = re.compile(r"Last Updated on\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})")

# Recurring release families, matched against the title. Order matters.
FAMILIES = [
    ("cpi", r"^CPI\b|Consumer Price Ind"),
    ("ppi", r"^PPI\b|Producer Price Ind"),
    ("cipi", r"^CIPI\b|Construction Input Price"),
    ("rppi", r"Residential Property Price"),
    ("iip", r"Index of Industrial Production"),
    ("qgdp", r"^(Quarterly Gross Domestic Product|QGDP)"),
    ("agdp", r"^(Annual Gross Domestic Product|AGDP|Revised AGDP|Annual GDP)"),
    ("trade", r"^(Composition|Direction) of (Exports|Imports)|Total Monthly Merchandise"),
    ("census-2024", r"National Population And Housing Census 2024"),
    ("livestock-census", r"National Livestock Census"),
]


def _family(title: str) -> str | None:
    for name, pattern in FAMILIES:
        if re.search(pattern, title, re.I):
            return name
    return None


# Publications are listed site-wide (the same list on every category page), so
# we assign their topic from the title instead of from the page they sit on.
PUBLICATION_TOPICS = [
    ("prices", r"\b(CPI|PPI|CIPI|RPPI|price|inflation)"),
    ("gdp", r"\b(GDP|gross domestic|national accounts)"),
    ("industry", r"industrial production|\bIIP\b|business|establishment"),
    ("trade", r"\b(trade|export|import)"),
    ("government-finance", r"government finance|\bGFS\b"),
    ("key-indicators", r"key economic indicators|\bKEI\b"),
    ("population", r"census|population|\bNPHC\b|monograph"),
    ("education", r"educat|school"),
    ("health", r"health|\bDHS\b|disabilit"),
    ("jobs", r"labour|labor|employ"),
    ("poverty", r"poverty|household survey|\bUNHS\b|\bUHIS\b|\bMPI\b"),
    ("crime", r"crime|justice|road safety"),
    ("gender", r"gender|women"),
    ("agriculture", r"agricult|livestock|fish|crop"),
    ("communication", r"\bICT\b|communication|internet"),
    ("transport", r"transport"),
    ("tourism", r"tourism|migration"),
    ("environment", r"environment|climate|water|land\b"),
]


def _publication_topic(title: str) -> str:
    for topic, pattern in PUBLICATION_TOPICS:
        if re.search(pattern, title, re.I):
            return topic
    return "general"


def _parse_date(text: str) -> str | None:
    m = _DATE.search(text)
    if not m:
        return None
    try:
        return datetime.strptime(" ".join(m.groups()), "%d %B %Y").date().isoformat()
    except ValueError:
        return None


def _entries(block, kind: str, ubos_id: int, topic: str, page_url: str):
    for div in block.select("div.shortcodeicon3"):
        a = div.find("a", href=True)
        if not a:
            continue
        url = _encode_url(urljoin(page_url, a["href"].strip()))
        title = " ".join(a.get_text(" ", strip=True).split())
        fmt = Path(url.split("?")[0]).suffix.lower().lstrip(".") or "html"
        yield {
            "id": hashlib.sha1(url.encode()).hexdigest()[:12],
            "title": title,
            "url": url,
            "format": fmt,
            "kind": kind,
            "updated": _parse_date(div.get_text(" ", strip=True)),
            "ubos_category": ubos_id if kind == "dataset" else None,
            "topic": topic if kind == "dataset" else _publication_topic(title),
            "family": _family(title),
        }


def crawl(refresh: bool = False) -> list[dict]:
    records: dict[str, dict] = {}
    for ubos_id, topic in all_ubos_ids().items():
        url = BASE.format(ubos_id)
        html = _decode(get_bytes(url, refresh=refresh))
        soup = BeautifulSoup(html, "html.parser")
        heading = soup.select_one(".shortcodestatsholder h1")
        name = heading.get_text(strip=True) if heading else "?"

        counts = {}
        for block_id, kind in (("regiona", "dataset"), ("regionb", "publication")):
            block = soup.find(id=block_id)
            if block is None:
                continue
            counts[kind] = 0
            for rec in _entries(block, kind, ubos_id, topic, url):
                # The same file can sit in several categories; keep the first.
                records.setdefault(rec["id"], rec)
                counts[kind] += 1
        print(f"  [{ubos_id:>3}] {name:<40} {counts.get('dataset', 0):>4} datasets -> {topic}")

    out = sorted(records.values(), key=lambda r: (r["updated"] or "", r["title"]), reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    return out
