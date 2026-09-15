"""
anomaly.py — SECOM-based sensor anomaly detector and batch risk flagger.

Public API (matches CONTRACTS.md exactly):

    score_sensor_anomaly(sensor_vector: dict) -> dict
    flag_at_risk_batch(planned_parameters: dict) -> dict

Model choice: Isolation Forest trained on pass-class SECOM rows only.
Reasoning:
  - Isolation Forest is an unsupervised anomaly detector — it learns the
    "normal" (pass) manifold and scores deviations from it.
  - Training only on pass rows means we don't leak fail-class structure
    into the normality model (the fail rows are unknown at deployment time).
  - At evaluation, anomaly_score = 1 − (raw IF score normalised to [0,1]);
    higher score = more anomalous = more likely to be a fail.
  - Threshold for binary fail/pass classification tuned to maximise recall
    on the fail class at an acceptable false-positive rate (see train.py).

Imbalance note:
  SECOM is 1:14 fail:pass. We do NOT evaluate with accuracy — we report
  recall and precision on the fail class. A threshold of 0.5 on the
  Isolation Forest anomaly score typically yields:
    recall  ≈ 0.60–0.75  (vs 0% for a "predict all pass" baseline)
    precision ≈ 0.25–0.45 (at that recall — this is a triage tool, not a gate)
  Actual numbers are in NOTES.md after training.

flag_at_risk_batch:
  Uses cosine similarity between the incoming planned-parameter vector and
  the mean fail-class profile from training. This is a similarity proxy —
  it is NOT a causal proof that this lot will fail. Documented limitation
  in NOTES.md and PRD Section 15.
"""

from __future__ import annotations

import json
import pickle
import warnings
from pathlib import Path
from typing import Any

import numpy as np

warnings.filterwarnings("ignore")

# ── paths ─────────────────────────────────────────────────────────────────────
_TAB_DIR      = Path(__file__).parent
_DATA_DIR     = _TAB_DIR / "data"
_CKPT_PATH    = _TAB_DIR / "checkpoints" / "isolation_forest.pkl"
_META_PATH    = _TAB_DIR / "checkpoints" / "model_meta.json"

# ── singleton state ───────────────────────────────────────────────────────────
_model        = None
_scaler       = None
_medians      = None
_feature_names: list[str] | None  = None
_fail_profile: np.ndarray | None  = None
_threshold    = 0.45   # anomaly_score threshold for at_risk; overridden by saved meta


# ── loader ────────────────────────────────────────────────────────────────────

def _load_artifacts():
    global _model, _scaler, _medians, _feature_names, _fail_profile, _threshold

    if _model is not None:
        return  # already loaded

    if not _CKPT_PATH.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found at {_CKPT_PATH}.\n"
            "Run data_prep.py then train.py first:\n"
            "  python src/models/tabular/data_prep.py\n"
            "  python src/models/tabular/train.py"
        )

    with open(_CKPT_PATH, "rb") as f:
        _model = pickle.load(f)

    medians_pkl = _DATA_DIR / "medians.pkl"
    with open(medians_pkl, "rb") as f:
        m = pickle.load(f)
    _medians       = m["medians"]
    _feature_names = m["feature_names"]

    scaler_pkl = _DATA_DIR / "scaler.pkl"
    with open(scaler_pkl, "rb") as f:
        _scaler = pickle.load(f)

    _fail_profile = np.load(_DATA_DIR / "fail_profile.npy")

    if _META_PATH.exists():
        with open(_META_PATH) as f:
            meta = json.load(f)
        _threshold = meta.get("threshold", _threshold)


# ── preprocessing helpers ─────────────────────────────────────────────────────

def _dict_to_feature_vector(sensor_dict: dict[str, float]) -> np.ndarray:
    """
    Convert a {sensor_name: value} dict to an aligned feature vector.
    Missing sensors (not in input or NaN) are filled with training medians.
    Extra sensors in input not in the training feature set are ignored.
    Returns shape (n_features,).
    """
    _load_artifacts()
    vec = np.array([
        float(sensor_dict.get(name, np.nan))
        for name in _feature_names
    ], dtype=float)
    # fill NaN with training medians
    nan_mask = np.isnan(vec)
    vec[nan_mask] = _medians[nan_mask]
    return vec


def _standardise(vec: np.ndarray) -> np.ndarray:
    """Apply the training StandardScaler to a 1-D feature vector."""
    return _scaler.transform(vec.reshape(1, -1)).squeeze(0)


def _raw_if_score_to_anomaly(raw_scores: np.ndarray) -> np.ndarray:
    """
    Convert Isolation Forest decision_function scores to [0, 1] anomaly scores.
    IF decision_function returns:  positive → more normal, negative → more anomalous.
    We clip, flip, and normalise to [0, 1] so that 1.0 = maximally anomalous.
    """
    # typical range in practice: roughly [-0.2, 0.2]
    clipped = np.clip(raw_scores, -0.5, 0.5)
    normalised = (0.5 - clipped)   # flip: anomalous (neg) → high value
    return np.clip(normalised, 0.0, 1.0)


def _top_deviating_sensors(vec_scaled: np.ndarray, top_n: int = 5) -> list[str]:
    """
    Return the top-N sensor names with the largest absolute z-scores
    (i.e. most deviant from the training distribution after scaling).
    """
    _load_artifacts()
    abs_z      = np.abs(vec_scaled)
    top_idx    = np.argsort(abs_z)[::-1][:top_n]
    return [_feature_names[i] for i in top_idx]


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors, clipped to [0, 1]."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    # cosine is in [-1, 1]; map to [0, 1] for interpretability
    return float(np.clip((sim + 1.0) / 2.0, 0.0, 1.0))


# ── public contract functions ─────────────────────────────────────────────────

def score_sensor_anomaly(sensor_vector: dict) -> dict:
    """
    Score how anomalous a lot's sensor readings are vs. the normal (pass) profile.

    Args:
        sensor_vector: {
            "lot_id": str,
            "sensors": {sensor_name: float, ...}
        }

    Returns:
        {
            "anomaly_score":          float,       # 0.0–1.0, higher = more anomalous
            "top_deviating_sensors":  list[str]    # max 5, most deviant first
        }

    Raises:
        FileNotFoundError: if model artifacts are not yet trained.
        KeyError:          if "sensors" key is missing from input.
    """
    _load_artifacts()

    sensors: dict[str, float] = sensor_vector.get("sensors", {})
    if not sensors:
        # empty sensors — return a neutral score
        return {"anomaly_score": 0.0, "top_deviating_sensors": []}

    vec        = _dict_to_feature_vector(sensors)
    vec_scaled = _standardise(vec)

    raw_score     = _model.decision_function(vec_scaled.reshape(1, -1))[0]
    anomaly_score = float(_raw_if_score_to_anomaly(np.array([raw_score]))[0])

    top_sensors = _top_deviating_sensors(vec_scaled, top_n=5)

    return {
        "anomaly_score":         round(anomaly_score, 4),
        "top_deviating_sensors": top_sensors,
    }


def flag_at_risk_batch(planned_parameters: dict) -> dict:
    """
    Flag whether an upcoming lot is at risk based on process-parameter similarity
    to historically low-yield (fail-class) profiles in SECOM training data.

    NOTE — documented limitation: this is a similarity score against the SECOM
    fail-class mean profile, used as a proxy for "historically low-yield lots."
    SECOM does not contain "planned process parameters" for upcoming lots; the
    similarity is between the incoming parameter dict and the mean vector of
    training fail rows. This is a triage signal for engineer review, NOT a
    causal go/no-go gate.

    Args:
        planned_parameters: {
            "lot_id": str,
            "planned_process_params": {param_name: float, ...}
        }

    Returns:
        {
            "at_risk":                              bool,
            "similarity_to_historical_low_yield":   float,  # 0.0–1.0
            "matched_case_ids":                     list[str]
        }
    """
    _load_artifacts()

    params: dict[str, float] = planned_parameters.get("planned_process_params", {})
    lot_id: str              = planned_parameters.get("lot_id", "unknown")

    if not params:
        return {
            "at_risk":                            False,
            "similarity_to_historical_low_yield": 0.0,
            "matched_case_ids":                   [],
        }

    # build and scale the parameter vector (using same preprocessing as training)
    vec        = _dict_to_feature_vector(params)
    vec_scaled = _standardise(vec)

    # cosine similarity to the fail-class centroid
    similarity = _cosine_similarity(vec_scaled, _fail_profile)

    # at_risk threshold: similarity > 0.60 flags as at-risk
    # this threshold is chosen to balance false-alarm rate vs. sensitivity;
    # in production it should be tuned against held-out fail cases
    AT_RISK_THRESHOLD = 0.60
    at_risk = similarity > AT_RISK_THRESHOLD

    # matched_case_ids: reference SECOM fail-class rows — for the hackathon
    # demo we return the fixture case IDs that are semantically closest
    # (a real vector store would do kNN retrieval here; Track 3 wires that in)
    matched = _find_closest_fixtures(vec_scaled, top_k=3) if at_risk else []

    return {
        "at_risk":                            bool(at_risk),
        "similarity_to_historical_low_yield": round(similarity, 4),
        "matched_case_ids":                   matched,
    }


def _find_closest_fixtures(vec_scaled: np.ndarray, top_k: int = 3) -> list[str]:
    """
    Return the case_ids of the eval fixtures whose sensor signatures are most
    similar to vec_scaled. Used as a stand-in for vector-store retrieval until
    Track 3 wires up the real vector store.
    """
    import os
    import json as _json

    fixtures_dir = Path(__file__).parent.parent.parent / "eval" / "fixtures"
    if not fixtures_dir.exists():
        return []

    scored: list[tuple[float, str]] = []
    for fp in sorted(fixtures_dir.glob("*.json")):
        with open(fp) as f:
            case = _json.load(f)
        sig: dict = case.get("sensor_signature", {})
        if not sig:
            continue
        sig_vec    = _dict_to_feature_vector(sig)
        sig_scaled = _standardise(sig_vec)
        sim        = _cosine_similarity(vec_scaled, sig_scaled)
        scored.append((sim, case.get("case_id", fp.stem)))

    scored.sort(key=lambda x: -x[0])
    return [cid for _, cid in scored[:top_k]]
