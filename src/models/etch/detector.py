"""
detector.py — score a LAM 9600 etch wafer with the detector build.py fitted.

    score_etch_wafer("l2917.txm") -> {anomaly_score, top_deviating_sensors, ...}

Same contract as the SECOM score_sensor_anomaly, so nothing downstream changes,
with the sensors named as the tool names them ("RF Pwr", "Pressure", …) instead
of SECOM's anonymised sensor_NN. Reads checkpoints/etch_detector.json only.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np

_ART = Path(__file__).parent / "checkpoints" / "etch_detector.json"
_SCORE_AT_LIMIT = 0.6


@lru_cache(maxsize=1)
def _artifact() -> dict:
    if not _ART.exists():
        raise FileNotFoundError(f"{_ART} missing. Run: python src/models/etch/build.py")
    return json.loads(_ART.read_text())


def known_wafers() -> list[str]:
    return sorted(_artifact()["wafers"])


def score_etch_wafer(wafer_id: str) -> dict:
    a = _artifact()
    w = a["wafers"].get(wafer_id)
    if w is None:
        raise KeyError(f"unknown LAM 9600 wafer '{wafer_id}'")
    z = (np.array(w["x"]) - np.array(a["baseline_mean"][w["experiment"]])) / np.array(a["baseline_sd"])
    peak = float(np.abs(z).max())
    lim, typ = a["alarm_limit_sigma"], a["typical_normal_sigma"]
    score = float(np.clip(_SCORE_AT_LIMIT * (peak - typ) / (lim - typ), 0.0, 1.0))

    # One entry per tool variable: its most deviant feature, signed.
    by_var: dict[str, tuple[float, str]] = {}
    for name, v in zip(a["features"], z):
        var = name.split(" | ")[0]
        if var not in by_var or abs(v) > abs(by_var[var][0]):
            by_var[var] = (float(v), name)
    ranked = sorted(by_var.items(), key=lambda kv: -abs(kv[1][0]))

    return {
        "anomaly_score": round(score, 4),
        # Only variables well outside normal variation. A normal wafer's single most
        # deviant feature is typically ~2.9σ (the max of 68), so 3σ would flag noise.
        "top_deviating_sensors": [var for var, (v, _) in ranked[:5] if abs(v) >= 4.0],
        "alarm": peak > lim,
        "_named_deviations": {var: round(v, 2) for var, (v, _) in ranked[:5]},
        "_peak_feature": {"feature": ranked[0][1][1], "sigma": round(ranked[0][1][0], 2)},
        "_alarm_limit_sigma": lim,
        "_scored_on": (f"LAM 9600 etch trace {wafer_id} (real tool data), against the normal "
                       f"wafers of its own experiment ({w['experiment']})"),
        "_detector": "max |z| over 68 per-step features; 21/21 faults at 1.3% false alarms (10x5-fold CV)",
    }
