"""Pipeline entry point.

    python run.py catalog [--refresh]   # index every file on ubos.org
    python run.py build   [--refresh]   # catalog + parse + write web/src/data
    python run.py production            # Production section only (energy, industry, ...)
"""

import sys
from collections import Counter

from ubos import catalog, export, production


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
    elif cmd == "production":
        production.build()
    else:
        sys.exit(f"unknown command: {cmd}")


if __name__ == "__main__":
    main(sys.argv[1:])
