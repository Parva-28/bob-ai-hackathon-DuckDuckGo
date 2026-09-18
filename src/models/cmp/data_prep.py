"""
data_prep.py — PHM 2016 CMP Data Challenge ingestion.

Why this dataset: SECOM and WM-811K are unrelated, so every "lot" pairing them is
constructed. Here the process sensors and the outcome are measured on the SAME
wafers, so the causal link is real rather than asserted. The challenge was chaired
by Seagate and Siemens; the scoring rule is MSE 90% + physics-based modelling 10%.

Source: PHM Society, 2016 Data Challenge. The original download 404s; the archived
copies are used instead (see DOWNLOAD_URLS). Public data, no credentials.

Each raw CSV is one polishing run: a multi-row time series for a single
(WAFER_ID, STAGE). Removal rate is one value per (WAFER_ID, STAGE). So the unit of
prediction is a run, and the traces must be aggregated to per-run features first.

Outputs to data/:
    cmp_train.csv / cmp_val.csv / cmp_test.csv
    feature_names.json
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
DATA = HERE / "data"
RAW  = DATA / "raw"

DOWNLOAD_URLS = {
    "train": "https://web.archive.org/web/20180413091420id_/https://www.phmsociety.org/"
             "sites/phmsociety.org/files/2016%20PHM%20DATA%20CHALLENGE%20CMP%20DATA%20SET.zip",
    "val":   "https://web.archive.org/web/20180413091303id_/https://www.phmsociety.org/"
             "sites/phmsociety.org/files/2016%20PHM%20DATA%20CHALLENGE%20CMP%20VALIDATION%20DATA%20SET.zip",
}

# Columns that identify a run rather than describe the process.
ID_COLS = ["MACHINE_ID", "MACHINE_DATA", "TIMESTAMP", "WAFER_ID", "STAGE", "CHAMBER"]

# Consumable wear counters. These are constant within a run (they describe tool
# state going in), so aggregating them with mean/std would be noise -- take first.
USAGE_COLS = [
    "USAGE_OF_BACKING_FILM", "USAGE_OF_DRESSER", "USAGE_OF_POLISHING_TABLE",
    "USAGE_OF_DRESSER_TABLE", "USAGE_OF_MEMBRANE", "USAGE_OF_PRESSURIZED_SHEET",
]


def download(dest: Path = RAW) -> None:
    """Fetch and extract both archives. Skips anything already present."""
    import urllib.request
    dest.mkdir(parents=True, exist_ok=True)
    for name, url in DOWNLOAD_URLS.items():
        marker = dest / name
        if marker.exists():
            print(f"  {name}: already extracted")
            continue
        print(f"  {name}: downloading …")
        with urllib.request.urlopen(url, timeout=300) as r:
            blob = r.read()
        zipfile.ZipFile(io.BytesIO(blob)).extractall(marker)
        print(f"  {name}: {len(blob)/1e6:.1f} MB extracted")


def _aggregate_run(df: pd.DataFrame) -> dict:
    """
    Collapse one run's time series into a fixed-length feature vector.

    Process variables get mean/std/min/max plus a linear slope: CMP degradation is
    a trend within the polish, so the slope carries information the mean destroys.
    Usage counters get their first value -- they are tool state, not a signal.
    """
    feat: dict[str, float] = {}
    n = len(df)
    feat["n_samples"] = float(n)
    feat["duration"] = float(df["TIMESTAMP"].max() - df["TIMESTAMP"].min()) if n > 1 else 0.0

    for c in USAGE_COLS:
        if c in df.columns:
            feat[c] = float(df[c].iloc[0])

    proc = [c for c in df.columns if c not in ID_COLS + USAGE_COLS]
    x = np.arange(n, dtype=float)
    for c in proc:
        v = pd.to_numeric(df[c], errors="coerce").to_numpy(dtype=float)
        v = v[~np.isnan(v)]
        if v.size == 0:
            feat[f"{c}_mean"] = feat[f"{c}_std"] = 0.0
            feat[f"{c}_min"] = feat[f"{c}_max"] = feat[f"{c}_slope"] = 0.0
            continue
        feat[f"{c}_mean"] = float(v.mean())
        feat[f"{c}_std"]  = float(v.std())
        feat[f"{c}_min"]  = float(v.min())
        feat[f"{c}_max"]  = float(v.max())
        # slope is only meaningful with variation in both axes
        feat[f"{c}_slope"] = (float(np.polyfit(x[:v.size], v, 1)[0])
                              if v.size > 2 and v.std() > 0 else 0.0)
    return feat


def _load_split(trace_dir: Path, label_csv: Path) -> pd.DataFrame:
    """Aggregate every trace in trace_dir and join the removal-rate labels."""
    labels = pd.read_csv(label_csv)
    labels.columns = [c.strip().upper() for c in labels.columns]
    rate_col = next(c for c in labels.columns if "REMOVAL" in c)

    rows = []
    files = sorted(trace_dir.glob("*.csv"))
    for i, f in enumerate(files, 1):
        df = pd.read_csv(f)
        df.columns = [c.strip().upper() for c in df.columns]
        # one file can hold more than one (wafer, stage) run
        for (wid, stage), grp in df.groupby(["WAFER_ID", "STAGE"], sort=False):
            feat = _aggregate_run(grp)
            feat["WAFER_ID"], feat["STAGE"] = wid, stage
            rows.append(feat)
        if i % 100 == 0:
            print(f"    {i}/{len(files)} files")

    runs = pd.DataFrame(rows)
    merged = runs.merge(labels[["WAFER_ID", "STAGE", rate_col]],
                        on=["WAFER_ID", "STAGE"], how="inner")
    merged = merged.rename(columns={rate_col: "AVG_REMOVAL_RATE"})
    print(f"    {len(runs)} runs aggregated, {len(merged)} matched a label")
    return merged


def build() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    print("PHM 2016 CMP — download")
    download()

    tr_root = next((RAW / "train").glob("*CMP DATA SET"))
    va_root = next((RAW / "val").glob("*VALIDATION DATA SET"))

    splits = {
        "train": (tr_root / "CMP-data" / "training", tr_root / "CMP-training-removalrate.csv"),
        "test":  (tr_root / "CMP-data" / "test",     tr_root / "CMP-test-removalrate.csv"),
        "val":   (va_root / "validation",            va_root / "CMP-validation-removalrate.csv"),
    }

    for name, (tdir, lcsv) in splits.items():
        if not tdir.exists():
            print(f"  {name}: trace dir missing at {tdir} — skipped")
            continue
        print(f"\n  {name}: {tdir.name}")
        df = _load_split(tdir, lcsv)
        df.to_csv(DATA / f"cmp_{name}.csv", index=False)
        print(f"    -> cmp_{name}.csv  {df.shape}")

    tr = pd.read_csv(DATA / "cmp_train.csv")
    feats = [c for c in tr.columns if c not in ("WAFER_ID", "STAGE", "AVG_REMOVAL_RATE")]
    (DATA / "feature_names.json").write_text(json.dumps(feats, indent=1))
    print(f"\n{len(feats)} features -> feature_names.json")


if __name__ == "__main__":
    build()
