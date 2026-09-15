"""
holdout_eval.py — measure model performance on UNSEEN data.

Track 2's anomaly detector is scored on the held-out SECOM validation split
(314 lots, 21 fails) that `data_prep.py` set aside and `train.py` never saw.

Reports recall and precision **on the fail class**, never accuracy: SECOM is
~6.6% fails, so "predict every lot passes" scores ~93% accuracy while catching
nothing. That baseline is printed alongside every run so the number cannot be
read generously.

    python src/eval/holdout_eval.py
    python src/eval/holdout_eval.py --sweep     # threshold sensitivity
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
DATA = ROOT / "src" / "models" / "tabular" / "data"


def _prf(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    rec = tp / (tp + fn) if tp + fn else 0.0
    prec = tp / (tp + fp) if tp + fp else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "recall": rec, "precision": prec, "f1": f1,
            "accuracy": (tp + tn) / len(y_true)}


def _roc_auc(y: np.ndarray, s: np.ndarray) -> float:
    """Rank-based AUC (Mann-Whitney), ties averaged. No sklearn dependency needed."""
    pos, neg = s[y == 1], s[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]))
    ranks = np.empty(len(order), float)
    ranks[order] = np.arange(1, len(order) + 1)
    # average ties
    allv = np.concatenate([pos, neg])
    for v in np.unique(allv):
        m = allv == v
        if m.sum() > 1:
            ranks[m] = ranks[m].mean()
    return (ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", action="store_true", help="threshold sensitivity table")
    args = ap.parse_args()

    from src.models.tabular import anomaly as A
    A._load_artifacts()

    X = np.load(DATA / "X_val.npy")
    y = np.load(DATA / "y_val.npy").astype(int)

    Xt = X
    if A._var_filter is not None:
        Xt = A._var_filter.transform(Xt)
    if A._pca_model is not None:
        Xt = A._pca_model.transform(Xt)
    # model_meta.json is explicit: the calibration bounds are fit on score_samples(),
    # not decision_function(). The two differ by the forest's offset_, so feeding
    # decision_function() into the calibration clamps every lot to 0.0 and produces a
    # spurious ROC-AUC of exactly 0.500.
    scores = A._raw_if_score_to_anomaly(A._model.score_samples(Xt))

    thr = A._threshold
    print(f"\nSECOM held-out validation — {len(y)} lots, {int(y.sum())} fails "
          f"({y.mean() * 100:.1f}%)")
    print(f"model: Isolation Forest (trained on pass-class rows only) · "
          f"threshold {thr:.4f}\n")

    m = _prf(y, (scores >= thr).astype(int))
    base = _prf(y, np.zeros_like(y))

    print(f"{'':<26}{'recall':>8}{'precision':>11}{'F1':>8}{'accuracy':>10}")
    print("-" * 63)
    print(f"{'Isolation Forest':<26}{m['recall']:>8.3f}{m['precision']:>11.3f}"
          f"{m['f1']:>8.3f}{m['accuracy']:>10.3f}")
    print(f"{'baseline: all-pass':<26}{base['recall']:>8.3f}{base['precision']:>11.3f}"
          f"{base['f1']:>8.3f}{base['accuracy']:>10.3f}")
    print("-" * 63)
    print(f"\nconfusion: TP={m['tp']}  FP={m['fp']}  FN={m['fn']}  TN={m['tn']}")
    print(f"ROC-AUC: {_roc_auc(y, scores):.3f}   (0.5 = random)")

    caught, missed = m["tp"], m["fn"]
    print(f"\nOf {int(y.sum())} genuinely failing lots, it catches {caught} and misses "
          f"{missed}.")
    if m["tp"] + m["fp"]:
        print(f"Of {m['tp'] + m['fp']} lots it flags, {m['fp']} are false alarms "
              f"({m['fp'] / (m['tp'] + m['fp']) * 100:.0f}%) — an engineer reviews "
              f"{m['tp'] + m['fp']} lots to find {caught}.")
    print("\nAccuracy is reported only to show why it is useless here: the all-pass "
          f"baseline scores {base['accuracy']:.3f} and catches nothing.")

    if args.sweep:
        print("\nthreshold sensitivity")
        print(f"{'thr':>7}{'recall':>9}{'precision':>11}{'F1':>8}{'flagged':>9}")
        print("-" * 44)
        for t in np.quantile(scores, np.linspace(0.50, 0.99, 12)):
            s = _prf(y, (scores >= t).astype(int))
            print(f"{t:>7.3f}{s['recall']:>9.3f}{s['precision']:>11.3f}"
                  f"{s['f1']:>8.3f}{s['tp'] + s['fp']:>9d}")

    out = {"dataset": "SECOM held-out validation", "n": int(len(y)),
           "fails": int(y.sum()), "threshold": float(thr),
           "fail_class": {k: (float(v) if isinstance(v, float) else v)
                          for k, v in m.items()},
           "roc_auc": float(_roc_auc(y, scores)),
           "baseline_all_pass_accuracy": float(base["accuracy"])}
    (Path(__file__).parent / "holdout_results.json").write_text(json.dumps(out, indent=2))
    print(f"\nwrote {Path(__file__).parent / 'holdout_results.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
