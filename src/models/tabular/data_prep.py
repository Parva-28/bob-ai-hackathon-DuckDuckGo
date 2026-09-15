"""
data_prep.py — SECOM dataset download, imputation, and preprocessing.

Dataset: SECOM (UCI ML Repository, ID 179)
  - 1,567 observations × 590 sensor features
  - 104 labeled fails (class -1), 1,463 labeled pass (class +1)
  - Real class imbalance: ~1:14 (fail:pass)
  - ~4.5% missing values spread across ~28 sensors (NOT uniform dropout —
    some sensors are almost entirely missing)

Imputation strategy (documented here and in NOTES.md):
  Median imputation per feature, fit on training data only, applied to both
  train and val. Reasons:
    - Mean is sensitive to outliers from sensor spikes (common in fab data)
    - KNN imputation would be more accurate but adds a dependency and is
      slow on 590 features; median is a defensible, simple baseline
    - Sensors with >80% missing values are dropped entirely (they carry
      no useful signal and would be pure imputed noise)

  We do NOT drop rows with missing values — SECOM's fail class is rare
  (104 rows). Dropping any row that has a NaN would discard ~60–70% of all
  rows and likely most of the fail cases, which defeats the entire exercise.

Outputs (saved to src/models/tabular/data/):
  X_train.npy, y_train.npy  — training arrays
  X_val.npy,   y_val.npy    — validation arrays
  feature_names.json         — ordered list of retained sensor names
  scaler_params.pkl          — StandardScaler fit on training data
  fail_profile.npy           — mean sensor vector of fail-class training rows
                               (used by flag_at_risk_batch for similarity scoring)
"""

import json
import pickle
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

DATA_DIR     = Path(__file__).parent / "data"
MISSING_DROP_THRESHOLD = 0.80   # drop sensors that are >80% NaN
VAL_FRACTION  = 0.20
RANDOM_STATE  = 42

PASS_LABEL = -1  # SECOM UCI convention: -1 = pass (1463 rows)
FAIL_LABEL = 1   # SECOM UCI convention: +1 = fail (104 rows)


# ── download ──────────────────────────────────────────────────────────────────

def download_secom() -> tuple[pd.DataFrame, pd.Series]:
    """
    Download SECOM via the ucimlrepo package (no manual CSV needed).
    Returns (X_df, y_series) with standardized sensor_0 ... sensor_589 column names.
    Falls back to local CSV if ucimlrepo fails.
    """
    local_x = DATA_DIR / "secom.data"
    local_y = DATA_DIR / "secom_labels.data"
    if local_x.exists() and local_y.exists():
        print("Loading SECOM from local cache …")
        X = pd.read_csv(local_x, sep=" ", header=None)
        X.columns = [f"sensor_{i}" for i in range(X.shape[1])]
        y = pd.read_csv(local_y, sep=" ", header=None)[0]
        return X, y

    try:
        from ucimlrepo import fetch_ucirepo
        print("Fetching SECOM from UCI ML Repo …")
        secom = fetch_ucirepo(id=179)
        if secom.data.features is not None:
            X = secom.data.features.copy()
            y = secom.data.targets.squeeze()
        elif secom.data.original is not None:
            df = secom.data.original
            y = df["class"] if "class" in df.columns else df.iloc[:, 0]
            feature_cols = [c for c in df.columns if c not in ("class", "timestamp")]
            X = df[feature_cols].copy()
        else:
            raise ValueError("ucimlrepo returned empty dataset")
        X.columns = [f"sensor_{i}" for i in range(X.shape[1])]
        print(f"  Downloaded: {X.shape[0]} rows × {X.shape[1]} features")

        # Save to local cache for fast offline reproducibility
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        X.to_csv(local_x, sep=" ", header=False, index=False)
        pd.DataFrame(y).to_csv(local_y, sep=" ", header=False, index=False)
        return X, y
    except Exception as e:
        print(f"  ucimlrepo failed ({e}); trying local CSV fallback …")
        if local_x.exists() and local_y.exists():
            X = pd.read_csv(local_x, sep=" ", header=None)
            X.columns = [f"sensor_{i}" for i in range(X.shape[1])]
            y = pd.read_csv(local_y, sep=" ", header=None)[0]
            return X, y
        raise FileNotFoundError(
            f"SECOM data not found ({e}). Either install ucimlrepo or place "
            "secom.data and secom_labels.data in src/models/tabular/data/"
        )


# ── preprocessing ─────────────────────────────────────────────────────────────

def drop_high_missing(X: pd.DataFrame, threshold: float) -> tuple[pd.DataFrame, list[str]]:
    """Drop columns with more than `threshold` fraction of NaN."""
    missing_frac = X.isna().mean()
    keep_cols    = missing_frac[missing_frac <= threshold].index.tolist()
    dropped      = missing_frac[missing_frac > threshold].index.tolist()
    if dropped:
        print(f"  Dropping {len(dropped)} sensors with >{threshold*100:.0f}% missing: "
              f"{dropped[:5]}{'…' if len(dropped) > 5 else ''}")
    return X[keep_cols], keep_cols


def median_impute(X_train: np.ndarray, X_val: np.ndarray
                  ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Fit median on train, apply to train and val. Returns (X_train, X_val, medians)."""
    medians = np.nanmedian(X_train, axis=0)
    # replace remaining NaN in medians (all-NaN columns should have been dropped already)
    medians = np.where(np.isnan(medians), 0.0, medians)

    def _fill(X: np.ndarray, m: np.ndarray) -> np.ndarray:
        X = X.copy().astype(float)
        nan_mask = np.isnan(X)
        X[nan_mask] = np.take(m, np.where(nan_mask)[1])
        return X

    return _fill(X_train, medians), _fill(X_val, medians), medians


# ── main pipeline ─────────────────────────────────────────────────────────────

def build_dataset():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    X_df, y_raw = download_secom()

    # normalise labels: SECOM uses +1/−1; convert to 0=pass, 1=fail for sklearn
    y = (y_raw == FAIL_LABEL).astype(int)
    print(f"  Fail: {y.sum()}, Pass: {(y == 0).sum()}, Imbalance ratio: 1:{(y==0).sum()//max(y.sum(),1)}")

    # drop sensors with too many missing values
    X_df, kept_cols = drop_high_missing(X_df, MISSING_DROP_THRESHOLD)
    print(f"  Retained sensors after high-missing drop: {len(kept_cols)}")

    # stratified split — critical: stratify=y ensures fails appear in both sets
    X_tr_df, X_val_df, y_tr, y_val = train_test_split(
        X_df, y,
        test_size=VAL_FRACTION,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    print(f"  Train: {len(y_tr)} (fails={y_tr.sum()}), "
          f"Val: {len(y_val)} (fails={y_val.sum()})")

    X_tr_raw  = X_tr_df.values.astype(float)
    X_val_raw = X_val_df.values.astype(float)

    # median imputation (fit on train only)
    X_tr_imp, X_val_imp, medians = median_impute(X_tr_raw, X_val_raw)

    # standard scaling (fit on train only)
    scaler  = StandardScaler()
    X_train = scaler.fit_transform(X_tr_imp)
    X_val   = scaler.transform(X_val_imp)

    y_train = y_tr.values
    y_val_a = y_val.values

    # fail-class profile: mean of standardised fail rows in training set
    fail_mask    = y_train == 1
    fail_profile = X_train[fail_mask].mean(axis=0)

    # save
    np.save(DATA_DIR / "X_train.npy",     X_train)
    np.save(DATA_DIR / "y_train.npy",     y_train)
    np.save(DATA_DIR / "X_val.npy",       X_val)
    np.save(DATA_DIR / "y_val.npy",       y_val_a)
    np.save(DATA_DIR / "medians.npy",     medians)
    np.save(DATA_DIR / "fail_profile.npy", fail_profile)

    with open(DATA_DIR / "feature_names.json", "w") as f:
        json.dump(kept_cols, f, indent=2)

    scaler_path = DATA_DIR / "scaler.pkl"
    with open(scaler_path, "wb") as f:
        pickle.dump(scaler, f)

    medians_path = DATA_DIR / "medians.pkl"
    with open(medians_path, "wb") as f:
        pickle.dump({"medians": medians, "feature_names": kept_cols}, f)

    print(f"\nDataset saved to {DATA_DIR}")
    print(f"  X_train shape: {X_train.shape}")
    print(f"  X_val shape:   {X_val.shape}")
    print(f"  Fail profile shape: {fail_profile.shape}")
    return X_train, X_val, y_train, y_val_a


if __name__ == "__main__":
    build_dataset()
