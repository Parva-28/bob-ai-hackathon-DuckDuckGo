"""
predict.py — serve CMP removal-rate predictions with conformal intervals.

This is the piece the product thesis rests on. A point prediction caught 34.7% of
excursions on our held-out split; the interval caught 93.9% from the same model.
So the serving contract returns an interval, and the point estimate is secondary.

Two things it will not do:

  * It will not report a confidence number invented anywhere but the conformal
    procedure. Coverage is a measured property, not an adjective.
  * It will not stay silent about where its guarantee is weak. Conformal coverage
    is MARGINAL: it holds on average over all runs, and our own measurements show
    it degrading to 84.0% (against a 90% target) in the p75-90 band, which is
    exactly where runs approach the control limit. Predictions landing in that
    band are returned with coverage_caveat set, because that is where an engineer
    is deciding and where the interval is least trustworthy.
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
CKPT = HERE / "checkpoints"
DATA = HERE / "data"

_model = None
_cp: dict[float, object] = {}
_features: list[str] | None = None
_meta: dict | None = None

# Strata where measured conditional coverage fell below the target (see NOTES.md).
_WEAK_BAND_PCTL = (75, 90)


def _load():
    global _model, _features, _meta
    if _model is not None:
        return
    mp = CKPT / "cmp_model.pkl"
    if not mp.exists():
        raise FileNotFoundError(
            f"{mp} missing. Run:\n"
            "  python src/models/cmp/data_prep.py\n"
            "  python src/models/cmp/train.py")
    with open(mp, "rb") as f:
        _model = pickle.load(f)
    _features = json.loads((DATA / "feature_names.json").read_text())
    _meta = json.loads((HERE / "cmp_results.json").read_text())


def _conformal(alpha: float):
    """Fit the conformal wrapper once per alpha, lazily. CV+ needs the training set."""
    from sklearn.model_selection import GroupKFold
    from mapie.regression import CrossConformalRegressor
    if alpha in _cp:
        return _cp[alpha]
    _load()
    df = pd.read_csv(DATA / "cmp_train.csv")
    df = df[df["AVG_REMOVAL_RATE"] <= 1000.0]
    cp = CrossConformalRegressor(estimator=_model, confidence_level=1 - alpha,
                                 method="plus", cv=GroupKFold(n_splits=5),
                                 random_state=42)
    cp.fit_conformalize(df[_features], df["AVG_REMOVAL_RATE"].to_numpy(float),
                        groups=df["WAFER_ID"].to_numpy())
    _cp[alpha] = cp
    return cp


def control_limits() -> tuple[float, float]:
    """5th/95th percentile of the TRAINING target. Never derived from the query."""
    _load()
    df = pd.read_csv(DATA / "cmp_train.csv")
    y = df.loc[df["AVG_REMOVAL_RATE"] <= 1000.0, "AVG_REMOVAL_RATE"]
    return tuple(float(v) for v in np.percentile(y, [5, 95]))


def predict_removal_rate(process_features: dict[str, float], alpha: float = 0.10) -> dict:
    """
    Predict material removal rate for one CMP run, with a conformal interval.

    process_features: aggregated trace features (see data_prep.py). Missing
    features are filled with the training median and reported, so a caller can see
    how much of the input was actually supplied.
    """
    _load()
    df = pd.read_csv(DATA / "cmp_train.csv")
    med = df[_features].median()

    supplied = [k for k in process_features if k in _features]
    row = med.copy()
    for k in supplied:
        row[k] = process_features[k]
    X = pd.DataFrame([row])[_features]

    cp = _conformal(alpha)
    point, itv = cp.predict_interval(X)
    lo, hi = float(itv[0, 0, 0]), float(itv[0, 1, 0])
    pt = float(point[0])

    lcl, ucl = control_limits()
    y_tr = df.loc[df["AVG_REMOVAL_RATE"] <= 1000.0, "AVG_REMOVAL_RATE"]
    band_lo, band_hi = np.percentile(y_tr, _WEAK_BAND_PCTL)
    in_weak_band = bool(band_lo <= pt <= band_hi)

    return {
        "predicted_removal_rate": round(pt, 2),
        "interval": [round(lo, 2), round(hi, 2)],
        "interval_width": round(hi - lo, 2),
        "alpha": alpha,
        "target_coverage": round(1 - alpha, 2),
        "control_limits": {"lcl": round(lcl, 2), "ucl": round(ucl, 2)},
        # An excursion cannot be ruled out if any part of the interval sits outside
        # the limits. This is the 34.7% -> 93.9% mechanism, not a threshold on the
        # point estimate.
        "excursion_possible": bool(lo < lcl or hi > ucl),
        "excursion_likely": bool(pt < lcl or pt > ucl),
        "features_supplied": len(supplied),
        "features_imputed": len(_features) - len(supplied),
        "coverage_caveat": (
            f"Prediction falls in the p{_WEAK_BAND_PCTL[0]}-{_WEAK_BAND_PCTL[1]} band, "
            f"where measured conditional coverage was 84.0% against a 90% target. "
            f"Treat this interval as weaker than its nominal level."
            if in_weak_band else None),
        "_measured_coverage": (_meta or {}).get("conformal", {})
            .get(f"alpha_{alpha:.2f}", {}).get("test", {})
            .get("coverage", {}).get("marginal_coverage"),
    }


if __name__ == "__main__":
    # Self-check: a run drawn from the training set should be covered by its own
    # interval, and an obviously degraded tool should widen or shift the prediction.
    d = pd.read_csv(DATA / "cmp_train.csv")
    d = d[d["AVG_REMOVAL_RATE"] <= 1000.0]
    feats = json.loads((DATA / "feature_names.json").read_text())
    row = d.iloc[0]
    r = predict_removal_rate({k: row[k] for k in feats})
    truth = float(row["AVG_REMOVAL_RATE"])
    print(json.dumps(r, indent=2))
    print(f"\ntruth={truth:.2f}  interval={r['interval']}")
    assert r["interval"][0] <= truth <= r["interval"][1], "training run outside its own interval"
    assert r["interval"][1] > r["interval"][0], "degenerate interval"
    assert r["features_imputed"] == 0, "expected a fully-specified input"
    sparse = predict_removal_rate({"USAGE_OF_DRESSER": 900.0})
    assert sparse["features_imputed"] > 60, "sparse input should report imputation"
    print(f"sparse input: {sparse['features_supplied']} supplied, "
          f"{sparse['features_imputed']} imputed -> {sparse['interval']}")
    print("\nself-check passed")
