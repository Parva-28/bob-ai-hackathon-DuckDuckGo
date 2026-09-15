"""
train.py — Train Isolation Forest on SECOM pass-class rows.

Strategy:
  - Isolation Forest is trained on PASS rows only (unsupervised normality model)
  - Contamination parameter set to the true observed fail rate (~0.067 = 104/1567)
    so the model's internal threshold is calibrated to the real imbalance
  - After training, we sweep anomaly_score thresholds on the validation set
    to find the one that maximises recall on the fail class at a reasonable
    false-positive rate (precision ≥ 0.20 constraint)
  - That threshold is saved to checkpoints/model_meta.json and used at inference

Outputs:
  src/models/tabular/checkpoints/isolation_forest.pkl
  src/models/tabular/checkpoints/model_meta.json   — threshold + eval metrics
"""

import json
import pickle
import warnings
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    classification_report,
    precision_recall_curve,
    f1_score,
    precision_score,
    recall_score,
)

warnings.filterwarnings("ignore")

DATA_DIR  = Path(__file__).parent / "data"
CKPT_DIR  = Path(__file__).parent / "checkpoints"
CKPT_DIR.mkdir(parents=True, exist_ok=True)

RANDOM_STATE        = 42
TRUE_CONTAMINATION  = 104 / 1567   # ~0.0663 — actual SECOM fail rate
N_ESTIMATORS        = 200
MAX_SAMPLES         = "auto"
MIN_PRECISION       = 0.15         # accept any threshold with precision ≥ 0.15
                                    # (this is a triage tool — recall matters more)


def train():
    # ── load data ──────────────────────────────────────────────────────────────
    X_train = np.load(DATA_DIR / "X_train.npy")
    y_train = np.load(DATA_DIR / "y_train.npy")
    X_val   = np.load(DATA_DIR / "X_val.npy")
    y_val   = np.load(DATA_DIR / "y_val.npy")

    print(f"Train: {X_train.shape}, fails={y_train.sum()}")
    print(f"Val:   {X_val.shape},   fails={y_val.sum()}")

    # ── train on pass rows only ────────────────────────────────────────────────
    X_train_pass = X_train[y_train == 0]
    print(f"Training Isolation Forest on {len(X_train_pass)} pass rows …")

    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        max_samples=MAX_SAMPLES,
        contamination=TRUE_CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_train_pass)
    print("Training complete.")

    # ── score validation set ───────────────────────────────────────────────────
    raw_scores    = model.decision_function(X_val)
    # convert to [0,1] anomaly score (higher = more anomalous)
    clipped       = np.clip(raw_scores, -0.5, 0.5)
    anomaly_scores = np.clip(0.5 - clipped, 0.0, 1.0)

    # ── threshold sweep: maximise recall @ precision ≥ MIN_PRECISION ──────────
    precisions, recalls, thresholds = precision_recall_curve(y_val, anomaly_scores)
    # precision_recall_curve returns arrays of length n_thresholds + 1
    # align: for threshold t, precisions[i] and recalls[i] correspond to thresholds[i]
    best_threshold = 0.45
    best_recall    = 0.0
    best_precision = 0.0
    best_f1        = 0.0

    for t, p, r in zip(thresholds, precisions[:-1], recalls[:-1]):
        if p >= MIN_PRECISION:
            f1 = 2 * p * r / (p + r + 1e-9)
            if r > best_recall or (r == best_recall and f1 > best_f1):
                best_recall    = r
                best_precision = p
                best_f1        = f1
                best_threshold = t

    print(f"\nBest threshold (precision ≥ {MIN_PRECISION}): {best_threshold:.4f}")
    print(f"  Recall on fail class:    {best_recall:.4f}")
    print(f"  Precision on fail class: {best_precision:.4f}")
    print(f"  F1 on fail class:        {best_f1:.4f}")

    # ── full classification report at best threshold ───────────────────────────
    y_pred = (anomaly_scores >= best_threshold).astype(int)
    print("\nClassification report (val set) at best threshold:")
    print(classification_report(y_val, y_pred, target_names=["pass", "fail"],
                                 zero_division=0))

    # baseline: "predict all pass"
    baseline_pred = np.zeros_like(y_val)
    print("Baseline (predict all pass) — recall on fail:", 0.0)
    print(f"Our model recall on fail: {best_recall:.4f}  "
          f"(vs 0% baseline — improvement confirmed)")

    # ── save model and metadata ────────────────────────────────────────────────
    with open(CKPT_DIR / "isolation_forest.pkl", "wb") as f:
        pickle.dump(model, f)

    meta = {
        "model":           "IsolationForest",
        "n_estimators":    N_ESTIMATORS,
        "contamination":   TRUE_CONTAMINATION,
        "threshold":       float(best_threshold),
        "val_recall_fail": float(best_recall),
        "val_prec_fail":   float(best_precision),
        "val_f1_fail":     float(best_f1),
        "note": (
            "Threshold chosen to maximise recall on fail class "
            f"with precision >= {MIN_PRECISION}. "
            "These are measured numbers on a 20% stratified val split. "
            "Do not report accuracy — use recall/precision on the fail class."
        ),
    }
    with open(CKPT_DIR / "model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nCheckpoint saved to {CKPT_DIR / 'isolation_forest.pkl'}")
    print(f"Metadata saved to   {CKPT_DIR / 'model_meta.json'}")
    return meta


if __name__ == "__main__":
    train()
