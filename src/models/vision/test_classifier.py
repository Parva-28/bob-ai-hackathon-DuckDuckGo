"""
test_classifier.py — Standalone self-test for classify_wafer_map.

Runs the contract function against synthetic wafer maps that faithfully
reproduce the 6 case study defect pattern types required by AGENT_1:
    Center, Edge-Ring, Scratch, Donut, Random, Near-full

Also includes one intentionally ambiguous case (mixed Center+Donut geometry)
to satisfy the agent spec's requirement for "at least one ambiguous case."

Usage (no MCP server or other tracks required):
    python src/models/vision/test_classifier.py

Definition of done: at least 5 of the 6 canonical patterns are predicted
correctly (exact match) and every prediction carries a visible confidence.

NOTE: These synthetic maps are geometric approximations of the WM-811K
pattern taxonomy, constructed from the published taxonomy descriptions.
They are not real wafer images — they exercise the model's generalisation,
not its training-set memorisation.
"""

import sys
import os
from pathlib import Path
import tempfile

import numpy as np

# ensure we can import from this directory when run directly
sys.path.insert(0, str(Path(__file__).parent))

from classifier import classify_wafer_array  # type: ignore


# ── synthetic wafer map generators ────────────────────────────────────────────
# Maps are 64×64, values: 0=not tested, 1=pass (good die), 2=fail (defective)
# These are canonical geometric constructions of each WM-811K defect type.

def _make_center(size: int = 64) -> np.ndarray:
    """Cluster of failures in the wafer centre."""
    m = np.ones((size, size), dtype=np.uint8)
    cx, cy, r = size // 2, size // 2, size // 8
    for y in range(size):
        for x in range(size):
            if (x - cx) ** 2 + (y - cy) ** 2 < r ** 2:
                m[y, x] = 2
    return m


def _make_edge_ring(size: int = 64) -> np.ndarray:
    """Ring of failures near the wafer edge."""
    m = np.ones((size, size), dtype=np.uint8)
    cx, cy = size // 2, size // 2
    r_inner, r_outer = int(size * 0.38), int(size * 0.48)
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if r_inner <= d <= r_outer:
                m[y, x] = 2
    return m


def _make_scratch(size: int = 64) -> np.ndarray:
    """Thin diagonal line of failures (scratch pattern)."""
    m = np.ones((size, size), dtype=np.uint8)
    width = 2
    for i in range(size):
        for w in range(-width, width + 1):
            j = i + w
            if 0 <= j < size:
                m[i, j] = 2
    return m


def _make_donut(size: int = 64) -> np.ndarray:
    """Ring (annulus) of failures in the central region — donut pattern."""
    m = np.ones((size, size), dtype=np.uint8)
    cx, cy = size // 2, size // 2
    r_inner, r_outer = int(size * 0.14), int(size * 0.28)
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if r_inner <= d <= r_outer:
                m[y, x] = 2
    return m


def _make_random(size: int = 64, fail_frac: float = 0.12) -> np.ndarray:
    """Randomly scattered failures — random pattern."""
    rng = np.random.default_rng(seed=42)
    m   = np.ones((size, size), dtype=np.uint8)
    n_fail = int(size * size * fail_frac)
    idx    = rng.choice(size * size, size=n_fail, replace=False)
    m.flat[idx] = 2
    return m


def _make_near_full(size: int = 64, pass_frac: float = 0.05) -> np.ndarray:
    """Nearly all dies failed — near-full pattern."""
    m = np.full((size, size), 2, dtype=np.uint8)
    # leave a small cluster of passing dies in the centre
    cx, cy, r = size // 2, size // 2, int(size * 0.10)
    for y in range(size):
        for x in range(size):
            if (x - cx) ** 2 + (y - cy) ** 2 < r ** 2:
                m[y, x] = 1
    return m


def _make_mixed_center_donut(size: int = 64) -> np.ndarray:
    """
    Ambiguous case: overlapping Center and Donut geometry.
    Central cluster + surrounding ring at intermediate radius.
    Expected: model should be uncertain (confidence < 0.70).
    """
    m  = _make_center(size).copy()
    cx, cy = size // 2, size // 2
    r_inner, r_outer = int(size * 0.18), int(size * 0.30)
    for y in range(size):
        for x in range(size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if r_inner <= d <= r_outer:
                m[y, x] = 2
    return m


# ── test cases ────────────────────────────────────────────────────────────────

TEST_CASES = [
    # name,              generator,          expected_class,   ambiguous
    ("Center",           _make_center,        "Center",         False),
    ("Edge-Ring",        _make_edge_ring,     "Edge-Ring",      False),
    ("Scratch",          _make_scratch,       "Scratch",        False),
    ("Donut",            _make_donut,         "Donut",          False),
    ("Random",           _make_random,        "Random",         False),
    ("Near-full",        _make_near_full,     "Near-full",      False),
    ("Ambiguous(C+D)",   _make_mixed_center_donut, None,        True),  # no hard expectation
]


# ── runner ────────────────────────────────────────────────────────────────────

def run_tests() -> bool:
    """Run all test cases and report results. Returns True if ≥5/6 canonical pass."""
    print("=" * 65)
    print("YieldGuard Vision Classifier — Standalone Self-Test")
    print("=" * 65)

    canonical_correct = 0
    canonical_total   = 0
    results           = []

    with tempfile.TemporaryDirectory() as tmpdir:
        for name, generator, expected, ambiguous in TEST_CASES:
            wafer_map = generator()
            npy_path  = os.path.join(tmpdir, f"{name.replace('/', '_')}.npy")
            np.save(npy_path, wafer_map)

            result = classify_wafer_array(wafer_map)
            pred   = result["predicted_class"]
            conf   = result["confidence"]

            if ambiguous:
                status = "AMBIG" if conf < 0.70 else "AMBIG(high-conf)"
                match  = "—"
            else:
                canonical_total += 1
                correct = pred == expected
                if correct:
                    canonical_correct += 1
                status = "PASS" if correct else "FAIL"
                match  = f"expected={expected}"

            print(f"  {name:20s}  pred={pred:12s}  conf={conf:.4f}  "
                  f"[{status}]  {match}")
            results.append({
                "name": name, "predicted": pred, "confidence": conf,
                "expected": expected, "status": status
            })

    print()
    print(f"Canonical patterns correct: {canonical_correct}/{canonical_total}")

    if canonical_correct >= 5:
        print("✓ DEFINITION OF DONE MET (≥5/6 canonical patterns correct)")
        passed = True
    else:
        print(f"✗ Only {canonical_correct}/6 correct — training or preprocessing may need review")
        passed = False

    # check ambiguous case has low confidence (expected behaviour)
    ambig_results = [r for r in results if r["name"].startswith("Ambiguous")]
    for r in ambig_results:
        if r["confidence"] < 0.70:
            print(f"✓ Ambiguous case '{r['name']}' correctly shows low confidence "
                  f"({r['confidence']:.4f} < 0.70)")
        else:
            print(f"⚠  Ambiguous case '{r['name']}' has high confidence "
                  f"({r['confidence']:.4f}) — model may be overconfident on this geometry")

    print("=" * 65)
    return passed


if __name__ == "__main__":
    try:
        success = run_tests()
        sys.exit(0 if success else 1)
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        sys.exit(2)
