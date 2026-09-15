"""
lot_sensors.py — build a full, realistic SECOM sensor vector for a lot.

Why a sparse signature cannot be scored
---------------------------------------
The anomaly detector is an Isolation Forest over 582 SECOM features. A case-study
signature names three or four sensors; the other ~579 impute to the training
median. A vector sitting almost entirely at the median is maximally *typical* to
an Isolation Forest — it isolates nothing — so the score pins to 0.0 no matter
what the named sensors say. Measured: real SECOM rows score 0.038–0.687 (fail
mean 0.297, pass mean 0.242), while any sparse signature collapses to 0.0.

So the sparse dict is fine as a human-readable *summary* of what deviated, and
useless as model input. This module builds the model input instead: a real SECOM
observation of the appropriate class, with the case's named deviations overlaid
in sigma.

Honesty note: like every other pairing in this project, this is constructed. The
base row is a genuine SECOM observation and the overlay is the case study's
stated deviation — it is not a real lot's real sensor trace, and the case fixtures
already say so.

The full vector never leaves the server. Bob sees only the sparse signature, which
keeps 582 raw floats out of the reasoning context (docs/solution-overview.md, context engineering).
"""

from __future__ import annotations

import json
from pathlib import Path

_DATA = Path(__file__).resolve().parents[1] / "models" / "tabular" / "data"

_cache: dict | None = None


def _load() -> dict | None:
    """
    Load Track 2's prepared training split, which is already imputed and scaled.

    Deliberately not parsing raw secom.data: that file is ragged (rows carry 589-590
    fields against a 586-column header because of how NaNs are written), so numpy
    rejects it. X_train.npy is the same data after Track 2's own imputation, and
    working from it guarantees we build vectors in exactly the space the model was
    fitted on.

    Scaled space is convenient here because a scaled value *is* a z-score, so
    overlaying "sensor_12 at -2.4 sigma" is a direct assignment. The scaler is then
    inverted exactly (raw = z * scale + mean) because score_sensor_anomaly
    standardises its input itself.
    """
    global _cache
    if _cache is not None:
        return _cache or None
    try:
        import numpy as np
        names = json.loads((_DATA / "feature_names.json").read_text())
        Xz = np.load(_DATA / "X_train.npy")          # already scaled
        y = np.load(_DATA / "y_train.npy").astype(int)
        import pickle
        with (_DATA / "scaler.pkl").open("rb") as f:
            scaler = pickle.load(f)
        _cache = {"Xz": Xz, "y": y, "names": names,
                  "mean": scaler.mean_, "scale": scaler.scale_}
        return _cache
    except Exception:
        _cache = {}
        return None


def build_vector(signature: dict[str, float], profile: str, seed: int = 0) -> dict | None:
    """
    Return a full {sensor_name: raw_value} vector, or None if Track 2 data is absent.

    `profile` picks the base observation's class — "fail" for a lot that genuinely
    excursioned, "pass" for one whose sensors really were quiet (Case Study 3's whole
    premise). The named sensors are overlaid at their stated sigma, then the whole
    vector is returned in raw units because the model standardises internally.
    """
    d = _load()
    if not d:
        return None
    import numpy as np

    Xz, y, names = d["Xz"], d["y"], d["names"]
    pool = np.where(y == (1 if profile == "fail" else 0))[0]
    if len(pool) == 0:
        return None

    # Representative row, not an arbitrary index: the member of the class closest to
    # its own centroid. Picking by index makes the score depend on an accident of
    # ordering; picking by score would be choosing the answer we want. SECOM's classes
    # overlap heavily (ROC-AUC 0.583), so a "fail" base row can still score lower than
    # a "pass" one — that is the model's real separability showing through, and it is
    # left visible rather than engineered away.
    centroid = Xz[pool].mean(axis=0)
    medoid = pool[int(np.argmin(((Xz[pool] - centroid) ** 2).sum(axis=1)))]
    z = Xz[medoid].astype(float).copy()                   # scaled == sigma
    pos = {n: i for i, n in enumerate(names)}
    for name, sigma in (signature or {}).items():
        i = pos.get(name)
        if i is not None:
            z[i] = float(sigma)

    raw = z * d["scale"] + d["mean"]                       # invert the scaler exactly
    return {n: float(raw[i]) for n, i in pos.items()}
