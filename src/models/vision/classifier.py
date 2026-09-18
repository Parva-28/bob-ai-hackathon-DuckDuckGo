"""
classifier.py — Contract-compliant wafer defect pattern classifier.

Public API (matches CONTRACTS.md exactly):

    classify_wafer_map(image_path: str) -> dict

Returns:
    {
      "predicted_class": str,   # one of the 9 WM-811K defect classes
      "confidence":      float  # 0.0–1.0  (softmax probability of top class)
    }

The model weights are loaded once at import time from:
    src/models/vision/checkpoints/best_model.pt

If the checkpoint does not exist (e.g. before training), the function raises
a clear FileNotFoundError rather than silently producing wrong results.

Input formats accepted:
    - Path to a PNG/JPEG image (standard PIL-loadable formats)
    - Path to a .npy file containing a 2-D uint8 wafer map array
      (values 0/1/2 — the raw LSWMD format)

Both paths are normalised and resized to 64×64 before inference.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from model import get_model, WaferCNN

# ── paths ─────────────────────────────────────────────────────────────────────
_VISION_DIR  = Path(__file__).parent
_CKPT_PATH   = _VISION_DIR / "checkpoints" / "best_model.pt"
_MAP_PATH    = _VISION_DIR / "data" / "class_map.json"
_IMG_SIZE    = 64
_DEVICE      = "cpu"   # inference is fast enough on CPU; keep it portable

# ── class map (populated at load time) ────────────────────────────────────────
_DEFECT_CLASSES = [
    "Center", "Donut", "Edge-Loc", "Edge-Ring",
    "Local", "Random", "Scratch", "Near-full", "None",
]

def _load_class_map() -> dict[int, str]:
    """Load idx→class mapping from the saved JSON, or fall back to the default."""
    if _MAP_PATH.exists():
        with open(_MAP_PATH) as f:
            data = json.load(f)
        return {int(k): v for k, v in data["idx_to_class"].items()}
    # fallback — matches the order in data_prep.py
    return {i: c for i, c in enumerate(_DEFECT_CLASSES)}

_IDX_TO_CLASS: dict[int, str] = _load_class_map()

# ── model singleton ───────────────────────────────────────────────────────────
_model: WaferCNN | None = None

def _get_model() -> WaferCNN:
    """Load and cache the model. Raises if checkpoint is missing."""
    global _model
    if _model is not None:
        return _model
    if not _CKPT_PATH.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found at {_CKPT_PATH}.\n"
            "Run data_prep.py then train.py first:\n"
            "  python src/models/vision/data_prep.py\n"
            "  python src/models/vision/train.py"
        )
    m = get_model(num_classes=len(_IDX_TO_CLASS)).to(_DEVICE)
    m.load_state_dict(torch.load(_CKPT_PATH, map_location=_DEVICE, weights_only=True))
    m.eval()
    _model = m
    return _model


# ── preprocessing ─────────────────────────────────────────────────────────────

def _load_as_array(image_path: str) -> np.ndarray:
    """
    Load a wafer map from disk.

    Accepts:
      .npy  — raw 2-D uint8 wafer map (values 0/1/2)
      image — PIL-readable format (PNG, JPEG, BMP, TIFF …)
    Returns a (64, 64) float32 array normalised to [0, 1].
    """
    p = Path(image_path)
    if not p.exists():
        raise FileNotFoundError(f"Input file not found: {p}")

    if p.suffix.lower() == ".npy":
        arr = np.load(str(p))
        if arr.ndim != 2:
            raise ValueError(f"Expected a 2-D wafer map array, got shape {arr.shape}")
        # resize to 64×64
        img = Image.fromarray(arr.astype(np.uint8), mode="L")
        img = img.resize((_IMG_SIZE, _IMG_SIZE), resample=Image.NEAREST)
        arr = np.array(img, dtype=np.float32) / 2.0   # 0→0.0, 1→0.5, 2→1.0
    else:
        img = Image.open(p).convert("L")
        img = img.resize((_IMG_SIZE, _IMG_SIZE), resample=Image.NEAREST)
        arr = np.array(img, dtype=np.float32) / 255.0  # standard image normalisation

    return arr  # shape (64, 64)


def _to_tensor(arr: np.ndarray) -> torch.Tensor:
    """Convert (64, 64) float32 ndarray to (1, 1, 64, 64) tensor."""
    return torch.from_numpy(arr).unsqueeze(0).unsqueeze(0)


def _predict(arr: np.ndarray, tta: bool = True) -> dict:
    """
    Single inference path shared by both public entry points.

    tta=True averages the softmax over the 8 dihedral transforms (4 rotations x
    optional mirror). Wafer defect patterns are dihedral-symmetric — a rotated
    Scratch is still a Scratch — which is why the same 8 transforms are used as
    training augmentation. Worth +0.0075 macro-F1 on the held-out split
    (0.9157 -> 0.9232) for no retraining; 8 forward passes through a 0.6 M-param
    model is still milliseconds.
    """
    model = _get_model()
    x = _to_tensor(arr).to(_DEVICE)

    views = [(k, m) for k in range(4) for m in (False, True)] if tta else [(0, False)]
    probs = torch.zeros(len(_IDX_TO_CLASS), device=_DEVICE)
    with torch.no_grad():
        for k, mirror in views:
            v = torch.rot90(x, k, dims=[-2, -1])
            if mirror:
                v = v.flip(-1)
            probs += F.softmax(model(v), dim=-1).squeeze(0)
    probs /= len(views)

    pred_idx = int(probs.argmax().item())
    return {
        "predicted_class": _IDX_TO_CLASS.get(pred_idx, "Unknown"),
        "confidence":      round(float(probs[pred_idx].item()), 4),
    }


# ── public contract function ──────────────────────────────────────────────────

def classify_wafer_map(image_path: str) -> dict:
    """
    Classify a wafer bin map and return the defect pattern class + confidence.

    Args:
        image_path: Path to a .npy wafer map array or a PIL-readable image file.

    Returns:
        {
          "predicted_class": str,   # one of the 9 WM-811K defect classes
          "confidence":      float  # 0.0–1.0
        }

    Raises:
        FileNotFoundError: if the checkpoint or input file is missing.
        ValueError:        if the input array has an unexpected shape.
    """
    return _predict(_load_as_array(image_path))


# ── convenience: classify from a raw numpy array ─────────────────────────────

def classify_wafer_array(wafer_map: np.ndarray) -> dict:
    """
    Same as classify_wafer_map but accepts a 2-D numpy array directly.
    Useful for unit tests and the MCP server integration (no temp-file needed).

    Args:
        wafer_map: 2-D uint8 array with values 0/1/2 (pass/fail/not-tested),
                   arbitrary resolution.

    Returns: same dict as classify_wafer_map.
    """
    if wafer_map.ndim != 2:
        raise ValueError(f"Expected 2-D array, got shape {wafer_map.shape}")

    img = Image.fromarray(wafer_map.astype(np.uint8), mode="L")
    img = img.resize((_IMG_SIZE, _IMG_SIZE), resample=Image.NEAREST)
    return _predict(np.array(img, dtype=np.float32) / 2.0)
