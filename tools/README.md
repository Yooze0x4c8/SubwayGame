# tools/ — offline data build (Python)

`build.py` is the **offline-only** data pipeline. It is NOT part of the runtime.
The Node server never runs it; it only reads the committed CSVs in `../data/`.

## What it does

```
raw/*.xlsx  (public-data source workbook, immutable)
override/*.csv  (line_meta, homonym, line_split, station_patch)
        │
        ▼  python build.py
out/  →  stations.csv · lines.csv · station_lines.csv · meta.json
```

On any validation failure it exits with code 1 (never ships broken data).

## Canonical artifacts

The **frozen artifact of record** is `../data/*.csv` + `../data/meta.json`
(937 stations · 35 lines · 1090 mappings · 5 regions, base date 2026-06-18).
Do NOT regenerate these to "fix" a runtime issue — patch via `override/*.csv`
and re-run the build offline, then copy the output into `../data/`.

## Running the build (offline, quarterly refresh only)

1. Place the source workbook in `raw/` (e.g. `raw/전체_도시철도역사정보_YYYYMMDD.xlsx`).
   The workbook is **not committed** and is required to run the build.
2. `python build.py` — writes to `out/`.
3. Copy `out/{stations,lines,station_lines}.csv` and `out/meta.json` into `../data/`.

`raw/` and `out/` ship with a `.gitkeep` only; `out/` contents are gitignored.

> Note: the source `raw/*.xlsx` is not present in this repo checkout — `build.py`
> and the `override/*.csv` inputs are preserved here purely for reproducibility.
