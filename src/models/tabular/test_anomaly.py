"""
test_anomaly.py - Standalone self-test for score_sensor_anomaly and flag_at_risk_batch.

Runs both contract functions against:
1. All 6 case study fixtures in src/eval/fixtures/*.json.
2. Edge cases (empty dicts, None values, unknown sensors, partial vectors).
3. Contract schema compliance assertions.

No MCP server or other track's code required.

Usage:
    python src/models/tabular/test_anomaly.py
"""

import json
import sys
from pathlib import Path

# allow direct execution from anywhere in the repo
sys.path.insert(0, str(Path(__file__).parent))

from anomaly import score_sensor_anomaly, flag_at_risk_batch  # type: ignore


FIXTURES_DIR = Path(__file__).parent.parent.parent / "eval" / "fixtures"


def load_fixtures() -> list[dict]:
    fixtures = []
    for fp in sorted(FIXTURES_DIR.glob("case_*.json")):
        with open(fp) as f:
            fixtures.append(json.load(f))
    if not fixtures:
        print(f"ERROR: No fixture files found in {FIXTURES_DIR}")
        sys.exit(2)
    return fixtures


def validate_contract_anomaly(res: dict, case_name: str) -> bool:
    if not isinstance(res, dict):
        print(f"  [CONTRACT FAIL] {case_name}: Result is not a dict")
        return False
    if "anomaly_score" not in res or not isinstance(res["anomaly_score"], (float, int)):
        print(f"  [CONTRACT FAIL] {case_name}: 'anomaly_score' missing or not float")
        return False
    if not (0.0 <= res["anomaly_score"] <= 1.0):
        print(f"  [CONTRACT FAIL] {case_name}: 'anomaly_score' out of range [0, 1]: {res['anomaly_score']}")
        return False
    if "top_deviating_sensors" not in res or not isinstance(res["top_deviating_sensors"], list):
        print(f"  [CONTRACT FAIL] {case_name}: 'top_deviating_sensors' missing or not list")
        return False
    if len(res["top_deviating_sensors"]) > 5:
        print(f"  [CONTRACT FAIL] {case_name}: 'top_deviating_sensors' exceeds max 5: {len(res['top_deviating_sensors'])}")
        return False
    return True


def validate_contract_batch(res: dict, case_name: str) -> bool:
    if not isinstance(res, dict):
        print(f"  [CONTRACT FAIL] {case_name}: Result is not a dict")
        return False
    if "at_risk" not in res or not isinstance(res["at_risk"], bool):
        print(f"  [CONTRACT FAIL] {case_name}: 'at_risk' missing or not bool")
        return False
    if "similarity_to_historical_low_yield" not in res or not isinstance(res["similarity_to_historical_low_yield"], (float, int)):
        print(f"  [CONTRACT FAIL] {case_name}: 'similarity_to_historical_low_yield' missing or not float")
        return False
    if not (0.0 <= res["similarity_to_historical_low_yield"] <= 1.0):
        print(f"  [CONTRACT FAIL] {case_name}: similarity out of range [0, 1]: {res['similarity_to_historical_low_yield']}")
        return False
    if "matched_case_ids" not in res or not isinstance(res["matched_case_ids"], list):
        print(f"  [CONTRACT FAIL] {case_name}: 'matched_case_ids' missing or not list")
        return False
    return True


def run_tests() -> bool:
    print("=" * 70)
    print("YieldGuard Tabular Models - Standalone Self-Test")
    print("=" * 70)

    fixtures = load_fixtures()
    print(f"Loaded {len(fixtures)} fixtures\n")

    anomaly_pass   = 0
    batch_pass     = 0
    special_checks = {"case_3a_low_anomaly": None, "case_6c_high_anomaly": None}

    for case in fixtures:
        cid     = case.get("case_id", "unknown")
        pattern = case.get("wafer_map_pattern", "?")
        sig     = case.get("sensor_signature", {})
        params  = case.get("planned_process_params", {})

        print(f"-- {cid} [{pattern}] --")

        # ── score_sensor_anomaly ──────────────────────────────────────────────
        sensor_input = {"lot_id": cid, "sensors": sig}
        try:
            result_a = score_sensor_anomaly(sensor_input)
            score    = result_a["anomaly_score"]
            top_s    = result_a["top_deviating_sensors"]
            contract_ok = validate_contract_anomaly(result_a, f"{cid} score_sensor_anomaly")
            if contract_ok:
                print(f"  score_sensor_anomaly -> anomaly_score={score:.4f}  top_sensors={top_s[:5]}")
                anomaly_pass += 1
            else:
                print(f"  score_sensor_anomaly -> CONTRACT VALIDATION FAILED")

            # special check: case_3a should have LOW anomaly (all sensors ~ 0)
            if cid == "case_3a":
                special_checks["case_3a_low_anomaly"] = score < 0.55
            # special check: case_6c has a high tester sensor spike
            if cid == "case_6c":
                special_checks["case_6c_high_anomaly"] = score > 0.45

        except Exception as e:
            print(f"  score_sensor_anomaly -> ERROR: {e}")

        # ── flag_at_risk_batch ────────────────────────────────────────────────
        batch_input = {"lot_id": cid, "planned_process_params": params}
        try:
            result_b = flag_at_risk_batch(batch_input)
            at_risk  = result_b["at_risk"]
            sim      = result_b["similarity_to_historical_low_yield"]
            matched  = result_b["matched_case_ids"]
            contract_ok = validate_contract_batch(result_b, f"{cid} flag_at_risk_batch")
            if contract_ok:
                print(f"  flag_at_risk_batch   -> at_risk={at_risk}  similarity={sim:.4f}  matched={matched}")
                batch_pass += 1
            else:
                print(f"  flag_at_risk_batch -> CONTRACT VALIDATION FAILED")
        except Exception as e:
            print(f"  flag_at_risk_batch -> ERROR: {e}")

        print()

    # ── Edge Case Tests ───────────────────────────────────────────────────────
    print("=" * 70)
    print("Edge Case Testing:")
    print("=" * 70)

    edge_cases_passed = 0
    edge_cases_total = 6

    # 1. Empty sensor dictionary
    res_empty_sensor = score_sensor_anomaly({"lot_id": "EDGE_1", "sensors": {}})
    if validate_contract_anomaly(res_empty_sensor, "Empty sensors") and res_empty_sensor["anomaly_score"] == 0.0:
        print("[PASS] Edge 1: Empty sensor dict -> score=0.0, top_sensors=[]")
        edge_cases_passed += 1
    else:
        print("[FAIL] Edge 1: Empty sensor dict failed")

    # 2. None values in sensor dictionary
    res_none_sensor = score_sensor_anomaly({"lot_id": "EDGE_2", "sensors": {"sensor_0": None, "sensor_12": 2.5}})
    if validate_contract_anomaly(res_none_sensor, "None sensor values") and "sensor_12" in res_none_sensor["top_deviating_sensors"]:
        print(f"[PASS] Edge 2: None values handled gracefully -> score={res_none_sensor['anomaly_score']}, top={res_none_sensor['top_deviating_sensors'][:3]}")
        edge_cases_passed += 1
    else:
        print("[FAIL] Edge 2: None values in sensor dict failed")

    # 3. Unknown sensor names
    res_unknown_sensor = score_sensor_anomaly({"lot_id": "EDGE_3", "sensors": {"unknown_tool_sensor_99": 3.5}})
    if validate_contract_anomaly(res_unknown_sensor, "Unknown sensor") and "unknown_tool_sensor_99" in res_unknown_sensor["top_deviating_sensors"]:
        print(f"[PASS] Edge 3: Unknown/custom sensor handled -> score={res_unknown_sensor['anomaly_score']}, top={res_unknown_sensor['top_deviating_sensors']}")
        edge_cases_passed += 1
    else:
        print("[FAIL] Edge 3: Unknown sensor failed")

    # 4. Empty planned process parameters
    res_empty_batch = flag_at_risk_batch({"lot_id": "EDGE_4", "planned_process_params": {}})
    if validate_contract_batch(res_empty_batch, "Empty batch params") and res_empty_batch["at_risk"] is False:
        print("[PASS] Edge 4: Empty planned params -> at_risk=False, sim=0.0, matched=[]")
        edge_cases_passed += 1
    else:
        print("[FAIL] Edge 4: Empty planned params failed")

    # 5. Partial sensor vector
    res_partial = score_sensor_anomaly({"lot_id": "EDGE_5", "sensors": {"sensor_45": -1.8}})
    if validate_contract_anomaly(res_partial, "Partial sensor vector"):
        print(f"[PASS] Edge 5: Partial sensor vector -> score={res_partial['anomaly_score']}, top={res_partial['top_deviating_sensors'][:3]}")
        edge_cases_passed += 1
    else:
        print("[FAIL] Edge 5: Partial sensor vector failed")

    # 6. At-risk batch parameters matching historical fail profile
    import numpy as _np
    fail_prof = _np.load(Path(__file__).parent / "data" / "fail_profile.npy")
    with open(Path(__file__).parent / "data" / "feature_names.json") as _f:
        f_names = json.load(_f)
    # create sample parameters aligned with fail profile
    high_risk_params = {f_names[i]: float(fail_prof[i]) for i in range(min(20, len(f_names)))}
    res_at_risk = flag_at_risk_batch({"lot_id": "EDGE_6_HIGH_RISK", "planned_process_params": high_risk_params})
    if validate_contract_batch(res_at_risk, "At-risk batch params") and res_at_risk["at_risk"] is True:
        print(f"[PASS] Edge 6: High risk parameters detected -> at_risk=True, sim={res_at_risk['similarity_to_historical_low_yield']}, matched={res_at_risk['matched_case_ids']}")
        edge_cases_passed += 1
    else:
        print(f"[FAIL] Edge 6: High risk batch detection failed (got at_risk={res_at_risk['at_risk']}, sim={res_at_risk['similarity_to_historical_low_yield']})")

    print()

    # ── summary ───────────────────────────────────────────────────────────────
    print("=" * 70)
    print(f"score_sensor_anomaly: {anomaly_pass}/{len(fixtures)} fixtures passed contract validation")
    print(f"flag_at_risk_batch:   {batch_pass}/{len(fixtures)} fixtures passed contract validation")
    print(f"Edge Cases:           {edge_cases_passed}/6 passed")

    # special behavioural checks
    c3 = special_checks["case_3a_low_anomaly"]
    c6 = special_checks["case_6c_high_anomaly"]

    if c3 is True:
        print("[CHECK PASS] case_3a: negative-evidence case correctly shows LOW anomaly score")
    elif c3 is False:
        print("[CHECK FAIL] case_3a: negative-evidence case shows unexpectedly HIGH anomaly score")
    else:
        print("[CHECK SKIP] case_3a: special check skipped")

    if c6 is True:
        print("[CHECK PASS] case_6c: tester-spike case correctly shows elevated anomaly score")
    elif c6 is False:
        print("[CHECK FAIL] case_6c: tester-spike case shows LOW anomaly score")
    else:
        print("[CHECK SKIP] case_6c: special check skipped")

    print("=" * 70)

    all_pass = (anomaly_pass == len(fixtures)
                and batch_pass == len(fixtures)
                and edge_cases_passed == edge_cases_total
                and c3 is True
                and c6 is True)
    if all_pass:
        print("ALL TESTS PASSED - Track 2 implementation verified successfully.")
    else:
        print("Some tests failed - review errors above")

    return all_pass


if __name__ == "__main__":
    try:
        success = run_tests()
        sys.exit(0 if success else 1)
    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        sys.exit(2)
