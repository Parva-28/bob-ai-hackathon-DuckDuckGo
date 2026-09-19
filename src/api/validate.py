"""
validate.py — refuse to classify inputs we cannot vouch for.

A softmax always sums to one, so a classifier ALWAYS returns a class, and on
inputs outside its training distribution it returns one confidently. Measured on
the shipped WaferCNN:

    all zeros (no dies at all)  -> Scratch    confidence 1.0
    float garbage               -> Scratch    confidence 1.0
    4x4 array                   -> Edge-Loc   confidence 0.9999
    uniform random {0,1,2}      -> Edge-Ring  confidence 0.5658

Those are not near-misses, they are confident answers about nothing. Confidence
cannot be the guard here because confidence is the thing that fails; the guard
has to be on the INPUT, before the model ever sees it.

So this module validates shape and domain first and REFUSES on failure rather
than returning a low-confidence answer — a wrong answer with a caveat is still a
wrong answer, and the caveat is the first thing dropped when someone screenshots
the result.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

# Below 16x16 there is no spatial structure left to classify; above 512 it is not
# a wafer bin map, it is an image. WM-811K's own maps span roughly 6x21 to
# 300x202 before resizing, so 16 is permissive rather than strict.
MIN_DIM, MAX_DIM = 16, 512

# A wafer is round inside a square array, so the tested region covers about pi/4
# (79%) of the bounding box. Much more means the array is not wafer-shaped; much
# less means it is mostly empty.
MIN_TESTED_FRAC, MAX_TESTED_FRAC = 0.20, 0.95

# SECOM's most extreme real training row peaks at 21.8 sigma, so 25 is generous.
MAX_ABS_Z = 25.0


def validate_wafer_map(arr: np.ndarray) -> tuple[bool, list[str], dict]:
    """(ok, problems, stats). ok=False means: do not classify this."""
    problems: list[str] = []

    if arr.ndim != 2:
        return False, [f"expected a 2-D wafer map, got shape {arr.shape}"], {}

    h, w = arr.shape
    if not (MIN_DIM <= h <= MAX_DIM and MIN_DIM <= w <= MAX_DIM):
        problems.append(
            f"dimensions {h}x{w} outside {MIN_DIM}-{MAX_DIM}; too small to carry a "
            f"spatial pattern or too large to be a die map")

    finite = np.isfinite(arr)
    if not finite.all():
        problems.append(f"{int((~finite).sum())} non-finite values (NaN or inf)")
        arr = np.nan_to_num(arr)

    # Values must mean something: 0 not-tested, 1 pass, 2 fail. Anything else is
    # a different kind of array being read as a wafer map.
    vals = np.unique(arr)
    off_grid = [float(v) for v in vals if not math.isclose(float(v), round(float(v)))]
    out_of_range = [float(v) for v in vals if round(float(v)) not in (0, 1, 2)]
    if off_grid:
        problems.append(
            f"non-integer values present ({off_grid[:4]}); expected 0=not-tested, "
            f"1=pass, 2=fail")
    if out_of_range:
        problems.append(f"values outside 0/1/2: {out_of_range[:6]}")

    a = np.rint(np.clip(arr, 0, 2)).astype(int)
    tested = int((a > 0).sum())
    fail = int((a == 2).sum())
    total = a.size
    frac_tested = tested / total if total else 0.0

    if tested == 0:
        problems.append("no tested dies — every cell is 0")
    elif frac_tested < MIN_TESTED_FRAC:
        problems.append(
            f"only {frac_tested:.1%} of cells are tested dies; a wafer map covers "
            f"~79% of its bounding box")
    elif frac_tested > MAX_TESTED_FRAC:
        problems.append(
            f"{frac_tested:.1%} of cells are tested dies; a round wafer cannot fill "
            f"a square array, so this is probably not a wafer map")

    if tested and fail == tested:
        problems.append("every tested die failed — degenerate, not a defect pattern")

    # A wafer is a DISC inside a rectangular array: the corners fall outside it and
    # are untested, the centre is tested. Uniform noise has the right values, the
    # right size and a plausible tested fraction, so every check above passes — but
    # it has no disc. Comparing corner coverage against centre coverage separates
    # them for the cost of two slices, and without it random noise classified as
    # Edge-Ring at 0.57.
    corner_frac = centre_frac = None
    if tested and h >= MIN_DIM and w >= MIN_DIM:
        ch, cw = max(1, h // 8), max(1, w // 8)
        corners = np.concatenate([
            a[:ch, :cw].ravel(), a[:ch, -cw:].ravel(),
            a[-ch:, :cw].ravel(), a[-ch:, -cw:].ravel()])
        mh, mw = h // 4, w // 4
        centre = a[mh:h - mh, mw:w - mw]
        corner_frac = float((corners > 0).mean())
        centre_frac = float((centre > 0).mean()) if centre.size else 0.0
        if corner_frac > 0.5 and centre_frac > 0.5 and corner_frac / max(centre_frac, 1e-9) > 0.8:
            problems.append(
                f"no wafer geometry: corners are {corner_frac:.0%} tested against "
                f"{centre_frac:.0%} at the centre. A round wafer leaves its corners "
                f"untested, so this array has valid values but is not a wafer map")

    stats = {
        "shape": [h, w],
        "dies_tested": tested,
        "dies_failed": fail,
        "fail_rate": round(fail / tested, 4) if tested else None,
        "tested_fraction": round(frac_tested, 4),
        "distinct_values": [float(v) for v in vals[:8]],
        "corner_tested_fraction": round(corner_frac, 4) if corner_frac is not None else None,
        "centre_tested_fraction": round(centre_frac, 4) if centre_frac is not None else None,
    }
    return (not problems), problems, stats


def validate_sensors(sig: dict, feature_names: list[str] | None = None
                     ) -> tuple[bool, list[str], dict]:
    """(ok, problems, stats). Unknown channel names are rejected, not ignored."""
    problems: list[str] = []
    if not isinstance(sig, dict):
        return False, ["sensors must be a JSON object of {channel: z_score}"], {}

    bad_type = [k for k, v in sig.items() if not isinstance(v, (int, float))
                or isinstance(v, bool)]
    if bad_type:
        problems.append(f"non-numeric values for: {bad_type[:5]}")

    nums = {k: float(v) for k, v in sig.items() if isinstance(v, (int, float))
            and not isinstance(v, bool)}
    non_finite = [k for k, v in nums.items() if not math.isfinite(v)]
    if non_finite:
        problems.append(f"non-finite values for: {non_finite[:5]}")

    extreme = {k: v for k, v in nums.items() if math.isfinite(v) and abs(v) > MAX_ABS_Z}
    if extreme:
        problems.append(
            f"|z| above {MAX_ABS_Z:g} for {list(extreme)[:5]}; SECOM's most extreme "
            f"real row peaks at 21.8 sigma, so these are probably raw instrument "
            f"units rather than z-scores")

    unknown = []
    if feature_names:
        known = set(feature_names)
        unknown = [k for k in nums if k not in known]
        if unknown:
            problems.append(
                f"unknown channel(s): {unknown[:5]}"
                + (f" and {len(unknown)-5} more" if len(unknown) > 5 else "")
                + ". Imputing them to the median would silently change the score, so "
                  "they are rejected instead.")

    stats = {
        "n_supplied": len(sig),
        "n_valid": len(nums) - len(non_finite),
        "n_unknown": len(unknown),
        "peak_abs_z": round(max((abs(v) for v in nums.values()
                                 if math.isfinite(v)), default=0.0), 3),
    }
    return (not problems), problems, stats


def secom_feature_names() -> list[str] | None:
    p = (Path(__file__).resolve().parents[1] / "models" / "tabular" / "data"
         / "feature_names.json")
    try:
        return json.loads(p.read_text())
    except Exception:
        return None
