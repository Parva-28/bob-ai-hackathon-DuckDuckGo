"""
eval_abstention.py — is the abstention real, or a random refusal generator?

Adding a gate is trivial. The only thing that makes it credible is reporting
**accuracy on the retained subset versus the abstained subset**. If error on the
runs it declined is much worse than on the runs it kept, the gate is finding
something. If the two are similar, it is refusing at random with good PR, and we
should say so.

Almost nobody publishes this split. That is exactly why publishing it lands --
and why the honest outcome here might be a negative result, as with the ViT.

Also evaluated: a NOVELTY HOLD-OUT. Naturally occurring novel inputs are rare in
a random split of one dataset, so GSI can look inert. Withholding a whole stage
from training and feeding it back is the direct test of whether GSI notices an
input regime it was never shown.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from abstain import AbstentionGate, TOLERABLE_ERROR

HERE = Path(__file__).parent
DATA = HERE / "data"
SEED = 42


def load():
    df = pd.read_csv(DATA / "cmp_train.csv")
    df = df[df["AVG_REMOVAL_RATE"] <= 1000.0].reset_index(drop=True)
    feats = json.loads((DATA / "feature_names.json").read_text())
    return df, feats


def err_stats(y: np.ndarray, p: np.ndarray) -> dict:
    if len(y) == 0:
        return {"n": 0}
    e = np.abs(y - p)
    return {"n": int(len(y)), "mae": float(e.mean()),
            "rmse": float(np.sqrt((e ** 2).mean())),
            "max_error": float(e.max()),
            "p90_error": float(np.percentile(e, 90))}


def report(name: str, y, p, gates) -> dict:
    ab = np.array([g.abstain for g in gates])
    ri_fail = np.array([not g.ri_pass for g in gates])
    gsi_fail = np.array([not g.gsi_pass for g in gates])

    retained, abstained = err_stats(y[~ab], p[~ab]), err_stats(y[ab], p[ab])
    out = {
        "split": name, "n": int(len(y)),
        "abstention_rate": float(ab.mean()),
        "ri_fail_rate": float(ri_fail.mean()),
        "gsi_fail_rate": float(gsi_fail.mean()),
        "both_fail_rate": float((ri_fail & gsi_fail).mean()),
        "retained": retained, "abstained": abstained,
    }
    if retained.get("n") and abstained.get("n"):
        out["mae_ratio_abstained_over_retained"] = round(
            abstained["mae"] / retained["mae"], 3)

    print(f"\n=== {name}  (n={len(y)}) ===")
    print(f"  abstention rate {ab.mean():6.1%}   "
          f"(RI fail {ri_fail.mean():.1%}, GSI fail {gsi_fail.mean():.1%})")
    print(f"  {'subset':<12}{'n':>6}{'MAE':>9}{'RMSE':>9}{'p90 err':>10}{'max err':>10}")
    for label, s in (("retained", retained), ("abstained", abstained)):
        if s.get("n"):
            print(f"  {label:<12}{s['n']:>6}{s['mae']:>9.2f}{s['rmse']:>9.2f}"
                  f"{s['p90_error']:>10.2f}{s['max_error']:>10.2f}")
        else:
            print(f"  {label:<12}{0:>6}{'-':>9}{'-':>9}{'-':>10}{'-':>10}")
    if "mae_ratio_abstained_over_retained" in out:
        r = out["mae_ratio_abstained_over_retained"]
        verdict = ("the gate is finding real failures" if r >= 1.5 else
                   "WEAK: abstained error is not much worse than retained" if r >= 1.0 else
                   "INVERTED: it is declining the runs it handles BEST")
        print(f"  MAE ratio abstained/retained = {r}  -> {verdict}")
    return out


def main() -> None:
    df, feats = load()
    X, y, g = df[feats], df["AVG_REMOVAL_RATE"].to_numpy(float), df["WAFER_ID"].to_numpy()

    tr, te = next(GroupShuffleSplit(1, test_size=0.25, random_state=SEED).split(X, y, g))
    gate = AbstentionGate(tolerable_error=TOLERABLE_ERROR).fit(X.iloc[tr], y[tr])
    print(f"tolerable error {TOLERABLE_ERROR:g}  ->  RI threshold {gate.ri_threshold:.4f}")
    print(f"GSI threshold {gate.gsi_threshold:.3f} "
          f"({gate.gsi_multiple:g}x max training GSI)")

    results = {"tolerable_error": TOLERABLE_ERROR,
               "ri_threshold": float(gate.ri_threshold),
               "gsi_threshold": float(gate.gsi_threshold),
               "gsi_multiple": gate.gsi_multiple, "splits": []}

    # 1. in-distribution held-out runs
    p_te = gate.model_a.predict(X.iloc[te])
    results["splits"].append(report("held-out (in-distribution)", y[te], p_te,
                                    gate.evaluate(X.iloc[te])))

    # 2. novelty hold-out: train without stage B, then score stage B
    stage = df["STAGE"].astype(str).str.upper().to_numpy()
    a_idx, b_idx = np.where(stage == "A")[0], np.where(stage == "B")[0]
    if len(a_idx) > 100 and len(b_idx) > 50:
        print(f"\nnovelty hold-out: fit on stage A ({len(a_idx)}), score stage B ({len(b_idx)})")
        gate_a = AbstentionGate(tolerable_error=TOLERABLE_ERROR).fit(X.iloc[a_idx], y[a_idx])
        p_b = gate_a.model_a.predict(X.iloc[b_idx])
        r = report("stage B, unseen during fit", y[b_idx], p_b, gate_a.evaluate(X.iloc[b_idx]))
        a_ho = np.random.default_rng(SEED).choice(a_idx, size=min(400, len(a_idx)), replace=False)
        r["control_same_stage"] = report("stage A control (in-distribution)",
                                         y[a_ho], gate_a.model_a.predict(X.iloc[a_ho]),
                                         gate_a.evaluate(X.iloc[a_ho]))
        results["splits"].append(r)

    (HERE / "abstention_results.json").write_text(json.dumps(results, indent=2))
    print(f"\nwrote {HERE / 'abstention_results.json'}")


if __name__ == "__main__":
    main()
