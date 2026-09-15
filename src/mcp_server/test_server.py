"""
test_server.py — standalone self-test for the YieldGuard MCP server.

Runs the full post-mortem chain and the pre-run chain over all 18 case fixtures,
exactly as Bob would drive them, and asserts the contract rules hold.

No MCP client, no network, no other track's code required.
    python src/mcp_server/test_server.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import adapters
import server as S

# MCPServer wraps each function in a FunctionTool; .fn is the original callable.
def _fn(t):
    return getattr(t, "fn", t)

classify   = _fn(S.classify_wafer_map)
anomaly_of = _fn(S.score_sensor_anomaly)
retrieve   = _fn(S.retrieve_similar_cases)
telem      = _fn(S.query_telemetry)
rank       = _fn(S.rank_root_causes)
playbook   = _fn(S.get_corrective_action_playbook)
atrisk     = _fn(S.flag_at_risk_batch)
feedback   = _fn(S.submit_feedback)
status     = _fn(S.pipeline_status)

CLASSES = set(S.DEFECT_CLASSES)
DIRECTIONS = {"increasing", "decreasing", "stable", "oscillating", None}


def main() -> int:
    fails: list[str] = []
    def check(cond, msg):
        if not cond:
            fails.append(msg)
        return cond

    st = status()
    print(f"pipeline: {st['real_count']} real / {st['stub_count']} stub"
          f"  |  {st['historical_cases']} cases, {st['fixtures_loaded']} fixtures")
    for name, mode in st["tools"].items():
        print(f"    {'REAL' if mode == 'real' else 'stub'}  {name}")
    print()

    # ---- contract-level checks that do not depend on a fixture ----
    t = telem(["CMP-03", "NOPE-99"])
    check(any(r.get("error") for r in t["telemetry"]),
          "query_telemetry must report an unknown equipment_id explicitly")
    check(all(r.get("direction") in DIRECTIONS for r in t["telemetry"]),
          "query_telemetry direction must be a known enum value")

    bad = feedback("H-x", "maybe")
    check(bad["status"] == "error", "submit_feedback must reject an invalid verdict")

    uncited = rank(cases={"cases": []}, telemetry={"telemetry": []})
    check(uncited.get("warning") is not None,
          "rank_root_causes must warn rather than invent when there is no evidence")

    print(f"{'case':<9} {'class':<10} {'anom':>5}  {'top hypothesis':<52} {'conf':>5}  {'cat':<12} risk")
    print("-" * 108)

    for fx in adapters.FIXTURES:
        cid = fx["case_id"]
        sig = fx["sensor_signature"]

        # --- post-mortem chain, in the order Bob is instructed to call it ---
        cls = classify(f"{cid}.png")
        an = anomaly_of(cid, sig)
        rc = retrieve(cls["predicted_class"], sig, 5)
        eq = sorted({c["equipment_id"] for c in rc["cases"] if c.get("equipment_id")})
        tl = telem(eq or ["CMP-03"])
        rk = rank(cls, an, rc, tl)

        hyps = rk["hypotheses"]
        check(hyps, f"{cid}: rank_root_causes returned no hypotheses")
        if not hyps:
            continue
        top = hyps[0]

        # --- contract rules ---
        check(cls["predicted_class"] in CLASSES, f"{cid}: predicted_class not a WM-811K class")
        check(0.0 <= cls["confidence"] <= 1.0, f"{cid}: confidence out of range")
        check(0.0 <= an["anomaly_score"] <= 1.0, f"{cid}: anomaly_score out of range")
        check(len(an["top_deviating_sensors"]) <= 5, f"{cid}: more than 5 deviating sensors")
        check(all(h.get("hypothesis_id") for h in hyps), f"{cid}: hypothesis missing hypothesis_id")
        check(all(str(h.get("evidence_summary") or "").strip() for h in hyps),
              f"{cid}: hypothesis has no cited evidence")
        check([h["rank"] for h in hyps] == sorted(h["rank"] for h in hyps),
              f"{cid}: hypotheses not rank-ordered")

        # --- fixture expectations ---
        cats = [h.get("category") for h in hyps]
        k = fx.get("expected_in_top_k", 1)
        if fx.get("expected_category"):
            check(fx["expected_category"] in cats[:k],
                  f"{cid}: expected category '{fx['expected_category']}' not in top {k} (got {cats[:k]})")
        if fx.get("max_confidence_ceiling") is not None:
            check(top["confidence"] <= fx["max_confidence_ceiling"],
                  f"{cid}: overconfident - {top['confidence']} > ceiling "
                  f"{fx['max_confidence_ceiling']} (honest-uncertainty case)")

        # --- corrective actions ---
        pb = playbook(top)
        check(pb["actions"], f"{cid}: no corrective actions returned")
        check(all(a["priority"] in ("high", "medium", "low") for a in pb["actions"]),
              f"{cid}: invalid action priority")

        # --- pre-run path ---
        ar = atrisk(cid, fx["planned_process_params"])
        check(isinstance(ar["at_risk"], bool), f"{cid}: at_risk not a bool")
        if fx.get("expected_at_risk"):
            check(ar["at_risk"], f"{cid}: expected pre-run at_risk=True, got False")

        # --- feedback loop ---
        fb = feedback(top["hypothesis_id"], "confirmed", f"self-test {cid}")
        check(fb["status"] == "ok", f"{cid}: submit_feedback failed")

        print(f"{cid:<9} {cls['predicted_class']:<10} {an['anomaly_score']:>5.2f}  "
              f"{top['description'][:52]:<52} {top['confidence']:>5.2f}  "
              f"{str(top.get('category')):<12} {'YES' if ar['at_risk'] else '-'}")

    print("-" * 108)
    if fails:
        print(f"\nFAILED ({len(fails)}):")
        for f in fails:
            print(f"  - {f}")
        return 1
    print(f"\nPASS - {len(adapters.FIXTURES)} fixtures through the full chain, "
          f"all contract rules held.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
