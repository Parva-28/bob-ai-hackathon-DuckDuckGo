"""
data_prep.py — WM-811K dataset download, filtering, and preprocessing.

Dataset: LSWMD / WM-811K (Wafer Map Bin Dataset, 811,457 samples).
Only ~14.8% of wafers carry a real defect-pattern label; the rest are "none"
or unlabeled. This script:
  1. Loads the raw .pkl file from the Kaggle mirror.
  2. Filters to labeled samples (excludes 'none' class from per-class training
     while keeping a fraction of 'None' maps to give the model that class too).
  3. Resizes every wafer map to a fixed 64×64 single-channel image with
     nearest-neighbour interpolation (preserves binary pixel semantics).
  4. Produces balanced per-class train/val splits with stratification.
  5. Saves processed arrays to src/models/vision/data/ as .npy files.

Class labels (9 total from WM-811K taxonomy):
  Center, Donut, Edge-Loc, Edge-Ring, Local, Random, Scratch, Near-full, None
"""

import os
import pickle
import sys
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from PIL import Image
import warnings

warnings.filterwarnings("ignore")

# ── constants ────────────────────────────────────────────────────────────────
IMG_SIZE = 64           # all maps resized to IMG_SIZE × IMG_SIZE
DATA_DIR = Path(__file__).parent / "data"
RAW_PKL  = DATA_DIR / "LSWMD.pkl"          # place the downloaded file here

DEFECT_CLASSES = [
    "Center", "Donut", "Edge-Loc", "Edge-Ring",
    "Local", "Random", "Scratch", "Near-full", "None",
]
CLASS_TO_IDX = {c: i for i, c in enumerate(DEFECT_CLASSES)}
IDX_TO_CLASS = {i: c for c, i in CLASS_TO_IDX.items()}

NONE_CLASS_KEEP_FRACTION = 0.25   # keep 25% of 'None' maps so the model
                                   # learns that class without swamping others
VAL_FRACTION   = 0.15
RANDOM_STATE   = 42


# ── helpers ──────────────────────────────────────────────────────────────────

def resize_wafer_map(raw_map: np.ndarray) -> np.ndarray:
    """Resize an arbitrary-resolution wafer map to IMG_SIZE×IMG_SIZE uint8."""
    # raw_map values: 0 = not tested, 1 = pass, 2 = fail
    img = Image.fromarray(raw_map.astype(np.uint8), mode="L")
    img = img.resize((IMG_SIZE, IMG_SIZE), resample=Image.NEAREST)
    return np.array(img, dtype=np.uint8)


def normalise(arr: np.ndarray) -> np.ndarray:
    """Scale pixel values to [0, 1] float32. Values: 0→0.0, 1→0.5, 2→1.0"""
    return (arr.astype(np.float32) / 2.0)


def load_raw_dataframe(pkl_path: Path) -> pd.DataFrame:
    """
    Load the raw LSWMD pickle into a DataFrame.

    LSWMD.pkl was written with a pre-0.20 pandas under Python 2, so a modern
    interpreter needs two shims to read it:

      * `pandas.indexes` was renamed to `pandas.core.indexes` in pandas 0.20, and
        the pickle still references the old path -> ModuleNotFoundError.
      * The byte stream contains non-ASCII that Python 3's default 'ascii' string
        decoding rejects -> UnicodeDecodeError. latin1 round-trips arbitrary bytes.

    Both are properties of this published dataset, not of our data.
    """
    print(f"Loading raw dataset from {pkl_path} …")

    import pandas.core.indexes as _ci
    sys.modules.setdefault("pandas.indexes", _ci)
    sys.modules.setdefault("pandas.indexes.base", _ci.base)
    sys.modules.setdefault("pandas.indexes.numeric", getattr(_ci, "numeric", _ci.base))

    with open(pkl_path, "rb") as f:
        df = pickle.load(f, encoding="latin1")
    print(f"  Loaded {len(df)} total records")
    return df


def extract_label(row) -> str | None:
    """
    WM-811K stores labels in the 'failureType' column as a nested list.
    Typical shapes: [[]] (unlabeled) or [['Center']] (labeled).
    Returns the string label or None if unlabeled.
    """
    ft = row.get("failureType", [[]])
    if isinstance(ft, np.ndarray):
        ft = ft.tolist()
    if not ft or not ft[0]:
        return None
    label = ft[0][0] if isinstance(ft[0], list) else ft[0]
    # normalise capitalisation variants seen in the wild
    label = str(label).strip()
    mapping = {
        "none": "None", "center": "Center", "donut": "Donut",
        "edge-loc": "Edge-Loc", "edge-ring": "Edge-Ring",
        "loc": "Local", "local": "Local", "random": "Random",
        "scratch": "Scratch", "near-full": "Near-full",
        "nearfull": "Near-full",
    }
    return mapping.get(label.lower(), label)


# ── main pipeline ─────────────────────────────────────────────────────────────

def build_dataset(pkl_path: Path = RAW_PKL, output_dir: Path = DATA_DIR):
    output_dir.mkdir(parents=True, exist_ok=True)

    df = load_raw_dataframe(pkl_path)

    # --- 1. extract labels ---------------------------------------------------
    df["label"] = df.apply(extract_label, axis=1)
    labeled = df[df["label"].notna()].copy()
    print(f"  Labeled samples: {len(labeled)}")

    # --- 2. subsample 'None' class -------------------------------------------
    none_mask   = labeled["label"] == "None"
    defect_mask = ~none_mask

    defect_df = labeled[defect_mask].copy()
    none_df   = labeled[none_mask].sample(
        frac=NONE_CLASS_KEEP_FRACTION, random_state=RANDOM_STATE
    )
    df_use = pd.concat([defect_df, none_df], ignore_index=True)
    print(f"  After None-subsampling: {len(df_use)} samples")
    print("  Class distribution:")
    for cls, cnt in df_use["label"].value_counts().items():
        print(f"    {cls:12s}: {cnt:6d}")

    # --- 3. build image + label arrays ---------------------------------------
    print("Resizing wafer maps …")
    images, labels = [], []
    for _, row in df_use.iterrows():
        wm = row.get("waferMap")
        if wm is None or not isinstance(wm, np.ndarray) or wm.size == 0:
            continue
        images.append(normalise(resize_wafer_map(wm)))
        labels.append(CLASS_TO_IDX[row["label"]])

    X = np.stack(images)[:, np.newaxis, :, :]  # (N, 1, 64, 64) channel-first
    y = np.array(labels, dtype=np.int64)
    print(f"  Final array shape: {X.shape}")

    # --- 4. stratified train / val split ------------------------------------
    X_train, X_val, y_train, y_val = train_test_split(
        X, y,
        test_size=VAL_FRACTION,
        stratify=y,
        random_state=RANDOM_STATE,
    )
    print(f"  Train: {len(X_train)}, Val: {len(X_val)}")

    # --- 5. save ------------------------------------------------------------
    np.save(output_dir / "X_train.npy", X_train)
    np.save(output_dir / "y_train.npy", y_train)
    np.save(output_dir / "X_val.npy",   X_val)
    np.save(output_dir / "y_val.npy",   y_val)

    # also save class mapping for reproducibility
    import json
    with open(output_dir / "class_map.json", "w") as f:
        json.dump({"idx_to_class": IDX_TO_CLASS, "class_to_idx": CLASS_TO_IDX}, f, indent=2)

    print("Dataset saved to", output_dir)
    return X_train, X_val, y_train, y_val


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Prepare WM-811K dataset")
    parser.add_argument(
        "--pkl", type=str, default=str(RAW_PKL),
        help="Path to the LSWMD.pkl file (download from Kaggle: 'kaggle datasets download -d qingyi/wm811k-wafer-map')"
    )
    args = parser.parse_args()
    build_dataset(Path(args.pkl))
