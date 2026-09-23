"""HTTP access to ubos.org.

The UBOS server sends an incomplete TLS chain and is slow/flaky, so we:
  * verify certificates against the OS trust store (truststore), which can
    complete the chain the way browsers do, instead of disabling verification;
  * retry with backoff;
  * cache every response on disk so re-runs never hammer their server.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import truststore

truststore.inject_into_ssl()

import requests  # noqa: E402  (must import after truststore injection)

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
USER_AGENT = "uganda-data/0.1 (open-data visualisation project)"

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT


def _cache_path(url: str, kind: str) -> Path:
    digest = hashlib.sha1(url.encode()).hexdigest()[:16]
    suffix = Path(url.split("?")[0]).suffix if kind == "files" else ".html"
    return CACHE / kind / f"{digest}{suffix}"


def get_bytes(url: str, *, kind: str = "pages", refresh: bool = False, retries: int = 4) -> bytes:
    """Fetch url, returning the cached copy unless refresh=True."""
    path = _cache_path(url, kind)
    if path.exists() and not refresh:
        return path.read_bytes()

    delay = 5.0
    for attempt in range(1, retries + 1):
        try:
            resp = _session.get(url, timeout=(20, 180))
            resp.raise_for_status()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(resp.content)
            return resp.content
        except requests.RequestException as exc:
            if attempt == retries:
                raise
            print(f"  retry {attempt}/{retries - 1} for {url}: {exc.__class__.__name__}")
            time.sleep(delay)
            delay *= 2
    raise AssertionError("unreachable")


def get_text(url: str, **kw) -> str:
    return get_bytes(url, **kw).decode("utf-8", errors="replace")


def get_file(url: str, **kw) -> Path:
    """Download a data file (xlsx/pdf/...) into the cache and return its path."""
    get_bytes(url, kind="files", **kw)
    return _cache_path(url, "files")
