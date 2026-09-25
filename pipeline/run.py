"""Pipeline entry point.

    python run.py catalog [--refresh]   # index every file on ubos.org
    python run.py build   [--refresh]   # catalog + parse + write web/src/data
    python run.py production            # Production section only (energy, industry, ...)
    python run.py indices               # house prices, construction costs, producer prices
    python run.py livestock             # Livestock Census by district (needs census.json)
    python run.py subcounties           # census 2024 for every sub-county (~6 min, needs census.json)
"""

import sys
from collections import Counter

from ubos import catalog, export, livestock, price_indices, production, regions_geo, subcounties


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else "build"
    refresh = "--refresh" in argv

    if cmd == "catalog":
        records = catalog.crawl(refresh=refresh)
        print(f"\n{len(records)} unique files")
        print("by format:", dict(Counter(r["format"] for r in records).most_common()))
        print("by kind:  ", dict(Counter(r["kind"] for r in records)))
        print("families: ", dict(Counter(r["family"] for r in records if r["family"]).most_common()))
        print("datasets by topic:", dict(Counter(r["topic"] for r in records if r["kind"] == "dataset").most_common()))
        print("publications by topic:", dict(Counter(r["topic"] for r in records if r["kind"] == "publication").most_common()))
    elif cmd == "build":
        export.build(refresh=refresh)
        production.build()
        price_indices.build()
        livestock.build()  # after export: uses the census districts it writes
        regions_geo.build()  # after export: dissolves its district shapes
        subcounties.build()
    elif cmd == "production":
        production.build()
    elif cmd == "indices":
        price_indices.build()
    elif cmd == "livestock":
        livestock.build()
    elif cmd == "subcounties":
        subcounties.build()
    else:
        sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main(sys.argv[1:])
