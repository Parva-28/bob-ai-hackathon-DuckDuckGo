"""
train.py — CMP removal-rate model with conformal prediction intervals.

The point of this file is not the point model. It is the interval.

Merck/Versum, five years of high-volume manufacturing data (~1,200 batches):
detecting out-of-control batches, a point prediction reached 1.9% sensitivity
while conformal prediction at alpha=0.1 exceeded 80% -- a 40x difference from the
SAME underlying model. That is the single highest-value change available to us,
and section 4 of docs/v2/00-PLAN.md makes reporting that pair a deliverable.

Calibrate expectations on the point model: R^2 around 0.70 is a good result on
real production data (Samsung Austin CVD virtual metrology, 715 features), and
graph attention beat a plain MLP by +0.012 R^2 on Intel Foundry deposition data.
Anyone promising a large architectural lift on fab sensor data is not calibrated.

Outputs:
    checkpoints/cmp_model.pkl
    cmp_results.json
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from mapie.regression import CrossConformalRegressor

HERE  = Path(__file__).parent
DATA  = HERE / "data"
CKPT  = HERE / "checkpoints"
SEED  = 42
ALPHAS = (0.05, 0.10, 0.20)      # 95% / 90% / 80% target coverage


OUTLIER_LIMIT = 1000.0   # see load_labelled()


def load_labelled():
    """
    The only labelled split.

    The competition's own validation and test sets ship with AVG_REMOVAL_RATE as
    "?" -- they were the blind sets and the ground truth was never released. So we
    cannot score against the PHM leaderboard, and we make our own split from the
    2,006 labelled training runs instead. Said plainly rather than quietly
    evaluating on training data.

    Two data decisions:

    * Four runs have a removal rate above 4,100 where the next highest is 162.6.
      They are measurement errors, and the published work on this dataset removes
      the same four.
    * 2,006 runs come from 1,699 wafers -- 282 wafers were polished at both
      stages. Splitting by row would put the same wafer either side of the split,
      so every split here is grouped by WAFER_ID.
    """
    df = pd.read_csv(DATA / "cmp_train.csv")
    feats = json.loads((DATA / "feature_names.json").read_text())
    n0 = len(df)
    df = df[df["AVG_REMOVAL_RATE"] <= OUTLIER_LIMIT].reset_index(drop=True)
    print(f"dropped {n0 - len(df)} outlier run(s) above {OUTLIER_LIMIT:g}")
    return (df[feats], df["AVG_REMOVAL_RATE"].to_numpy(dtype=float),
            df["WAFER_ID"].to_numpy())


def point_metrics(y: np.ndarray, p: np.ndarray) -> dict:
    """PHM 2016 scored on MSE. Max error matters separately: one bad prediction
    feeding a run-to-run controller is the failure mode, and a mean hides it."""
    return {
        "mse": float(mean_squared_error(y, p)),
        "rmse": float(np.sqrt(mean_squared_error(y, p))),
        "mae": float(mean_absolute_error(y, p)),
        "max_error": float(np.max(np.abs(y - p))),
        "r2": float(r2_score(y, p)),
        "mape_pct": float(np.mean(np.abs((y - p) / np.where(y == 0, np.nan, y))) * 100),
    }


def coverage_report(y: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> dict:
    """
    Marginal coverage, plus coverage conditioned on where in the target range the
    true value sits. Marginal coverage can look perfect while the model
    systematically fails at the extremes -- which is exactly where excursions are,
    so the stratified table is the one that matters.
    """
    inside = (y >= lo) & (y <= hi)
    width = hi - lo
    out = {
        "marginal_coverage": float(inside.mean()),
        "mean_width": float(width.mean()),
        "median_width": float(np.median(width)),
        "width_over_target_range": float(width.mean() / (y.max() - y.min())),
        "conditional": [],
    }
    edges = np.percentile(y, [0, 10, 25, 75, 90, 100])
    names = ["p0-10 (low tail)", "p10-25", "p25-75 (bulk)", "p75-90", "p90-100 (high tail)"]
    for name, lo_e, hi_e in zip(names, edges[:-1], edges[1:]):
        m = (y >= lo_e) & (y <= hi_e)
        if m.sum():
            out["conditional"].append({
                "stratum": name, "n": int(m.sum()),
                "coverage": float(inside[m].mean()),
                "mean_width": float(width[m].mean()),
            })
    return out


def excursion_sensitivity(y, p, lo, hi, limits) -> dict:
    """
    The point-vs-interval pair, the most persuasive number available.

    An excursion is a run whose TRUE removal rate falls outside the control limits.
    A point model flags one only if its own prediction lands outside -- and
    regression-to-the-mean means it rarely does. The interval flags whenever it
    CANNOT RULE OUT an excursion, which is the question an engineer actually asks.
    """
    lcl, ucl = limits
    truly_out = (y < lcl) | (y > ucl)
    point_flag = (p < lcl) | (p > ucl)
    interval_flag = (lo < lcl) | (hi > ucl)

    def stats(flag):
        tp = int((flag & truly_out).sum()); fn = int((~flag & truly_out).sum())
        fp = int((flag & ~truly_out).sum()); tn = int((~flag & ~truly_out).sum())
        return {"sensitivity": tp / (tp + fn) if tp + fn else None,
                "specificity": tn / (tn + fp) if tn + fp else None,
                "precision": tp / (tp + fp) if tp + fp else None,
                "flagged": int(flag.sum()), "tp": tp, "fn": fn, "fp": fp, "tn": tn}

    return {"control_limits": {"lcl": float(lcl), "ucl": float(ucl)},
            "n_excursions": int(truly_out.sum()), "n": int(len(y)),
            "point_prediction": stats(point_flag),
            "conformal_interval": stats(interval_flag)}


def main() -> None:
    CKPT.mkdir(parents=True, exist_ok=True)
    X, y, groups = load_labelled()

    tr_i, te_i = next(GroupShuffleSplit(n_splits=1, test_size=0.25,
                                        random_state=SEED).split(X, y, groups))
    X_tr, y_tr, g_tr = X.iloc[tr_i], y[tr_i], groups[tr_i]
    X_te, y_te = X.iloc[te_i], y[te_i]
    assert not (set(g_tr) & set(groups[te_i])), "wafer leaked across the split"
    print(f"train {X_tr.shape} ({len(set(g_tr))} wafers)  "
          f"test {X_te.shape} ({len(set(groups[te_i]))} wafers)")
    print(f"target: mean {y_tr.mean():.1f}  std {y_tr.std():.1f}  "
          f"range [{y_tr.min():.1f}, {y_tr.max():.1f}]")

    base = HistGradientBoostingRegressor(
        max_iter=400, learning_rate=0.06, max_depth=None,
        min_samples_leaf=15, l2_regularization=1.0, random_state=SEED)

    results = {"dataset": "PHM 2016 CMP Data Challenge",
               "split": "grouped by WAFER_ID, 75/25, random_state=42",
               "n_train": int(len(y_tr)), "n_test": int(len(y_te)),
               "n_features": int(X_tr.shape[1]), "model": "HistGradientBoostingRegressor",
               "outliers_removed": 4, "point": {}, "conformal": {},
               "caveat": ("The competition's val/test labels are masked as '?' and were "
                          "never released, so these figures are on our own grouped split "
                          "and are NOT comparable to the PHM 2016 leaderboard.")}

    # ── point model ──
    base.fit(X_tr, y_tr)
    m = point_metrics(y_te, base.predict(X_te))
    results["point"]["test"] = m
    print(f"\n[point/test]  R2={m['r2']:.4f}  RMSE={m['rmse']:.2f}  "
          f"MAE={m['mae']:.2f}  max_err={m['max_error']:.2f}  MSE={m['mse']:.1f}")

    # ── conformal (CV+ across 5 folds) ──
    # Control limits come from the TRAINING distribution only. Using test data to
    # set the limits would leak the thing we are trying to detect.
    lcl, ucl = np.percentile(y_tr, [5, 95])
    print(f"\ncontrol limits from training distribution: [{lcl:.1f}, {ucl:.1f}]")

    for alpha in ALPHAS:
        # GroupKFold so a wafer cannot sit in both a fit fold and its calibration
        # fold -- otherwise the conformity scores are optimistic and coverage is
        # overstated, which is the one thing this whole exercise must not do.
        cp = CrossConformalRegressor(estimator=base, confidence_level=1 - alpha,
                                     method="plus", cv=GroupKFold(n_splits=5),
                                     random_state=SEED)
        cp.fit_conformalize(X_tr, y_tr, groups=g_tr)
        key = f"alpha_{alpha:.2f}"
        results["conformal"][key] = {}
        for name, X_s, y_s in (("test", X_te, y_te),):
            p, itv = cp.predict_interval(X_s)
            lo, hi = itv[:, 0, 0], itv[:, 1, 0]
            cov = coverage_report(y_s, lo, hi)
            exc = excursion_sensitivity(y_s, p, lo, hi, (lcl, ucl))
            results["conformal"][key][name] = {"coverage": cov, "excursion": exc}
            if True:
                print(f"\n[conformal alpha={alpha:.2f} / test]")
                print(f"  target coverage {1-alpha:.0%}  ->  empirical "
                      f"{cov['marginal_coverage']:.1%}   mean width {cov['mean_width']:.1f}")
                for s in cov["conditional"]:
                    print(f"    {s['stratum']:<22} n={s['n']:<4} coverage {s['coverage']:.1%}")
                pt, ci = exc["point_prediction"], exc["conformal_interval"]
                print(f"  excursions in test: {exc['n_excursions']}/{exc['n']}")
                print(f"    point prediction   sensitivity "
                      f"{(pt['sensitivity'] or 0):.1%}  (flagged {pt['flagged']})")
                print(f"    conformal interval sensitivity "
                      f"{(ci['sensitivity'] or 0):.1%}  (flagged {ci['flagged']})")

    with open(CKPT / "cmp_model.pkl", "wb") as f:
        pickle.dump(base, f)
    (HERE / "cmp_results.json").write_text(json.dumps(results, indent=2))
    print(f"\nwrote {HERE / 'cmp_results.json'}")


if __name__ == "__main__":
    main()
