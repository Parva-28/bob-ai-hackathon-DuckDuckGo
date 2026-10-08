"""
export_stream_data.py — compact replay files for the live fab feed (/live).

    python src/api/export_stream_data.py

The raw datasets are gitignored (they belong to their publishers and are large),
so the feed replays small extracts committed under src/api/data/stream/:

  etch_traces.json   every LAM 9600 wafer the detector scores, in real run order
                     (wafer numbers l2901..l3343), with its recorded fault label and
                     the main-etch (steps 4-5) series of six headline variables.
  ionmill_slices.json  for each of the five PHM 2018 ion-mill tools, a 7-day slice of
                     10-minute windows of Flowcool pressure and flow, plus the faults
                     the tool itself logged in that slice (mode and time).

Nothing is synthesised: values are rounded copies of the recorded data.
Sources: src/models/etch/data/MACHINE_Data.mat (fetched by src/models/etch/build.py),
src/models/ionmill/data/ (fetched as in src/models/ionmill/NOTES.md).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.io import loadmat

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).parent / "data" / "stream"
ETCH_MAT = ROOT / "models" / "etch" / "data" / "MACHINE_Data.mat"
ETCH_ART = ROOT / "models" / "etch" / "checkpoints" / "etch_detector.json"
MILL = ROOT / "models" / "ionmill" / "data"

ETCH_VARS = ["RF Pwr", "RF Load", "Pressure", "TCP Top Pwr", "BCl3 Flow", "Cl2 Flow"]
TOOLS = ["01_M02", "02_M02", "03_M01", "04_M01", "06_M01"]
SLICE_S = 7 * 24 * 3600


def etch() -> dict:
    L = loadmat(ETCH_MAT, squeeze_me=True, struct_as_record=False)["LAMDATA"]
    names = [v.strip() for v in L.variables]
    cols = [names.index(v) for v in ETCH_VARS]
    step = names.index("Step Number")
    scored = json.loads(ETCH_ART.read_text())["wafers"]     # the wafers the detector knows
    rows = []
    for X, n, f in list(zip(L.calibration, L.calib_names, [None] * len(L.calib_names))) + \
            list(zip(L.test, L.test_names, L.fault_names)):
        wid = n.strip()
        if wid not in scored or X.ndim != 2:
            continue
        keep = np.isin(X[:, step], (4, 5))
        S = X[keep]
        rows.append({
            "id": wid, "experiment": wid[1:3], "fault": f.strip() if f is not None else None,
            "step": S[:, step].astype(int).tolist(),
            "series": {v: np.round(S[:, c], 1).tolist() for v, c in zip(ETCH_VARS, cols)},
        })
    rows.sort(key=lambda r: r["id"])                       # real run order
    return {"tool": "ETCH-07", "source": "LAM 9600 metal etcher, Eigenvector Research (Wise et al. 1999)",
            "sample_s": 1.0, "variables": ETCH_VARS, "wafers": rows}


def mill_events(tool: str) -> list[dict]:
    """Faults the tool logged: each fault mode's time-to-failure counts down to an event."""
    g = pd.read_csv(MILL / f"{tool}_DC_groundtruth.csv")
    out = []
    for col in g.columns[1:]:
        v = g[col].to_numpy(dtype=float)
        ok = np.isfinite(v)
        if not ok.any():
            continue
        at = np.unique(np.round((g["time"].to_numpy()[ok] + v[ok]) / 600) * 600)
        merged = [at[0]] + [b for a, b in zip(at[:-1], at[1:]) if b - a > 7200]
        out += [{"t": float(t), "mode": col.replace("TTF_", "")} for t in merged]
    return sorted(out, key=lambda e: e["t"])


def mill() -> dict:
    w = pd.read_pickle(MILL / "windows.pkl")
    tools = []
    for tool in TOOLS:
        d = w[w.tool == tool].sort_values("t_end")
        events = mill_events(tool)
        t = d.t_end.to_numpy()
        # the 7-day window holding the most logged faults (any window for a healthy tool)
        starts = t[:: max(1, len(t) // 400)]
        best = max(starts, key=lambda s0: sum(s0 <= e["t"] < s0 + SLICE_S for e in events))
        s = d[(d.t_end >= best) & (d.t_end < best + SLICE_S)]
        tools.append({
            "tool": tool,
            "t0": float(best),
            "windows": [[round(float(a - best)), round(float(p), 3), round(float(f), 3)]
                        for a, p, f in zip(s.t_end, s.FLOWCOOLPRESSURE_mean, s.FLOWCOOLFLOWRATE_mean)],
            "faults": [{"t": round(e["t"] - best), "mode": e["mode"]} for e in events
                       if best <= e["t"] < best + SLICE_S],
        })
    return {"source": "PHM Society 2018 Data Challenge, ion mill etch (NASA DASHlink)",
            "window_s": 600, "fields": ["t_offset_s", "flowcool_pressure", "flowcool_flow"],
            "note": "Values are the challenge's standardised units. Faults are the tool's own records; "
                    "YieldGuard does not predict them (see src/models/ionmill/NOTES.md).",
            "tools": tools}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    e, m = etch(), mill()
    (OUT / "etch_traces.json").write_text(json.dumps(e, separators=(",", ":")))
    (OUT / "ionmill_slices.json").write_text(json.dumps(m, separators=(",", ":")))
    print(f"etch: {len(e['wafers'])} wafers, {sum(len(w['step']) for w in e['wafers'])} samples, "
          f"{sum(1 for w in e['wafers'] if w['fault'])} faults -> {(OUT / 'etch_traces.json').stat().st_size // 1024} KB")
    for t in m["tools"]:
        print(f"mill {t['tool']}: {len(t['windows'])} windows, {len(t['faults'])} logged faults")
    print(f"-> {(OUT / 'ionmill_slices.json').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
