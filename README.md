# Uganda in Data

Uganda's official statistics (UBOS), made easy to read: interactive charts,
plain-language facts, and every source file one click away.

```
ubos.org ──► pipeline/ (Python) ──► web/src/data/*.json ──► web/ (Astro) ──► static site
             crawl · parse · check                          build-time pages, lazy charts
```

## Pipeline (`pipeline/`)

```bash
py -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
cd pipeline
../.venv/Scripts/python run.py build            # uses cached downloads
../.venv/Scripts/python run.py build --refresh  # re-fetch from ubos.org
```

- `ubos/catalog.py` crawls every UBOS category page and indexes each file
  (datasets and publications), grouping recurring releases into *families*.
- `ubos/taxonomy.py` maps our reader-facing sections/topics onto UBOS categories.
- `ubos/parsers/` has one parser per release family. Each parser finds blocks by
  their labels rather than row numbers, and **checks its derived numbers
  against the rates UBOS itself printed** (for example the headline CPI
  inflation rate), so a layout change fails the build instead of shipping
  wrong numbers.
- `ubos/export.py` writes the site's data into `web/src/data/`.

The UBOS server sends an incomplete TLS chain. We verify against the OS trust
store (`truststore`) instead of disabling verification, and cache every
download in `pipeline/cache/`.

## Website (`web/`)

```bash
cd web
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in web/dist
```

- **Astro**: every page is pre-rendered HTML, which makes it fast and readable
  by search engines.
- **Charts** (`src/components/Chart.astro` and `src/scripts/charts.ts`):
  ECharts, imported module by module and loaded only when a chart scrolls into
  view. Every chart has focus mode, a table view, time-range presets,
  crosshair tooltips, and optional click-to-compare linking between charts.
- **Facts** (`src/lib/cpi.ts`): each plain-language sentence is computed from
  the data. Outlier item moves (>150% a year) are excluded from headlines.

## Architecture & security

- **No runtime dependency on UBOS.** The pipeline reads ubos.org and the census
  portal's (undocumented) API only when it runs. The site serves committed
  snapshots, so if UBOS is down or changes, the live site is unaffected and the
  pipeline fails loudly.
- **Static site, no server.** There is no database, no login and no user data.
- **Content-Security-Policy.** Astro emits a CSP `<meta>` tag per page with a
  hash for every inline script, so injected scripts cannot run.
  `web/public/_headers` adds HSTS, `frame-ancestors 'none'`, `nosniff`, a
  referrer policy, a permissions policy and cache rules.
- **Untrusted data.** UBOS data embedded in `<script type="application/json">`
  goes through `safeJson()` (escapes `<`, `>`, `&`, U+2028/9). Links are
  restricted to http(s). Tooltips escape labels. `.xlsx` parsing requires
  `defusedxml`, and the pipeline refuses to run without it. TLS verification
  is always on.
- **Dependencies.** Dependabot opens weekly grouped PRs for npm, pip and
  Actions.

## Status

| Topic | Interactive pages | Source files indexed |
|---|---|---|
| Prices & Inflation | ✅ CPI (headline, core, 13 categories, 10 towns, ~340 items) | ✅ |
| Places / Census 2024 | ✅ District map explorer (21 indicators) + 146 district profile pages | ✅ |
| Every other topic | planned: GDP, trade, population pyramid, poverty, road safety next | ✅ |

### Census 2024 (`ubos/census.py`, `ubos/geo.py`)

- Data comes from the census portal's JSON API: 146 district profiles and the
  district boundaries.
- Checks: district populations must sum to within 1% of the official
  45,905,417.
- Known source bug: the API's "Mobile Phone Ownership" table repeats the
  "Internet Usage" numbers. It is detected and excluded, with a note on the
  site.
- Rates are derived from counts. Where UBOS publishes its own rate
  (unemployment, NEET), we use theirs, and aggregate it using UBOS's implied
  base.
- Boundaries are simplified with shared-border awareness (1.2 MB down to
  154 KB) and served from `web/public/geo/districts.json`.
- Map colour classes use natural breaks (Jenks) so outlier regions stand out.
  The ramp is validated against the page surface in both themes.
