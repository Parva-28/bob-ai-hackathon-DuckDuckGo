"""
prepare.py — turn the PHM 2018 ion-mill etch streams into 10-minute windows.

    python src/models/ionmill/prepare.py

Input: data/<tool>_DC_score.csv (4-second sensor rows, already standardised by
the challenge) and data/<tool>_DC_groundtruth.csv (time-to-failure per fault
mode, row-aligned with the sensors). Both come from NASA DASHlink, 2018 PHM Data
Challenge, and are not committed.

Output: data/windows.pkl — one row per tool per 10-minute window: sensor
statistics, cooling-system trends over the previous 1 h and 6 h, and the time
to the next failure of any of the three Flowcool fault modes. Labels are made in
train.py, so the horizon can change without re-reading 2.6 GB of CSV.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).parent / "data"
TOOLS = ["01_M02", "02_M02", "03_M01", "04_M01", "06_M01"]
SENSORS = [
    "IONGAUGEPRESSURE", "ETCHBEAMVOLTAGE", "ETCHBEAMCURRENT", "ETCHSUPPRESSORVOLTAGE",
    "ETCHSUPPRESSORCURRENT", "FLOWCOOLFLOWRATE", "FLOWCOOLPRESSURE", "ETCHGASCHANNEL1READBACK",
    "ETCHPBNGASREADBACK", "FIXTURETILTANGLE", "ACTUALROTATIONANGLE", "FIXTURESHUTTERPOSITION",
    "ETCHSOURCEUSAGE", "ETCHAUXSOURCETIMER", "ETCHAUX2SOURCETIMER", "ACTUALSTEPDURATION",
]   # ROTATIONSPEED is constant in every tool: dropped
COOLING = ["FLOWCOOLPRESSURE", "FLOWCOOLFLOWRATE"]
WINDOW_S = 600


def tool_windows(tool: str) -> pd.DataFrame:
    s = pd.read_csv(DATA / f"{tool}_DC_score.csv", usecols=["time"] + SENSORS,
                    dtype={"time": np.int64, **{c: np.float32 for c in SENSORS}})
    g = pd.read_csv(DATA / f"{tool}_DC_groundtruth.csv", dtype=np.float64)
    assert len(s) == len(g) and (s.time.values[:1000] == g.time.values[:1000]).all(), tool
    ttf = g.iloc[:, 1:].min(axis=1, skipna=True)          # nearest failure of any mode (s)
    s["fail_at"] = g.time.values + ttf.values            # absolute time it points at
    s["win"] = (g.time.values // WINDOW_S).astype(np.int64)

    agg = s.groupby("win")[SENSORS].agg(["mean", "std", "min", "max"])
    agg.columns = [f"{c}_{st}" for c, st in agg.columns]
    w = agg.reset_index()
    w["rows"] = s.groupby("win").size().values
    w["t_end"] = s.groupby("win")["time"].max().values.astype(np.float64)
    # Time to the next failure from the window's end; NaN = none labelled after it.
    fail = s.groupby("win")["fail_at"].min().values
    w["ttf_s"] = fail - w["t_end"]
    w["data_end"] = float(g.time.max())

    # Cooling trends over the preceding hour and six hours (windows, not rows,
    # so idle gaps do not stretch them).
    for c in COOLING:
        m = w[f"{c}_mean"]
        for n, label in ((6, "1h"), (36, "6h")):
            w[f"{c}_mean_{label}"] = m.rolling(n, min_periods=1).mean()
            w[f"{c}_slope_{label}"] = m - m.shift(n - 1).fillna(m.iloc[0])
        w[f"{c}_min_6h"] = w[f"{c}_min"].rolling(36, min_periods=1).min()
    w.insert(0, "tool", tool)
    return w


def main():
    parts = []
    for t in TOOLS:
        w = tool_windows(t)
        print(f"{t}: {len(w):6d} windows, {np.isfinite(w.ttf_s).sum():6d} with a failure ahead")
        parts.append(w)
    out = pd.concat(parts, ignore_index=True)
    out.to_pickle(DATA / "windows.pkl")
    print("->", DATA / "windows.pkl", out.shape)


if __name__ == "__main__":
    main()
