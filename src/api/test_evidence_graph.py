"""Unit tests for evidence_graph.link_evidence: python -m pytest src/api/test_evidence_graph.py"""

from evidence_graph import link_evidence

EVIDENCE = {
    "lot": {"sensor_signature": {"sensor_23": 2.8, "sensor_24": 2.2},
            "planned_process_params": {"rf_power_w": 1480.0, "days_since_pm": 2.0},
            "equipment_ids": ["ETCH-07"]},
    "classification": {"predicted_class": "Edge-Ring", "confidence": 0.99},
    "anomaly": {"anomaly_score": 1.0, "top_deviating_sensors": ["Pressure", "RF Load"],
                "_named_deviations": {"Pressure": 21.2, "RF Load": 4.7}},
    "cases": {"cases": [{"case_id": "HC-033", "similarity": 1.0, "equipment_id": "ETCH-07"}]},
    "telemetry": {"telemetry": [{"equipment_id": "ETCH-07", "parameter": "gas_flow_sccm",
                                 "magnitude_sigma": -2.1}]},
}


def check(summary):
    return link_evidence({"description": "test hypothesis", "evidence_summary": summary}, EVIDENCE)


def status(result, ref):
    return next(l["status"] for l in result["links"] if l["ref"] == ref)


def test_verified_case_sensor_and_param():
    r = check("sensor_23 z-score=2.8, rf_power_w=1480, matches HC-033 on ETCH-07")
    assert status(r, "sensor_23") == "verified"
    assert status(r, "rf_power_w") == "verified"
    assert status(r, "HC-033") == "verified"
    assert status(r, "ETCH-07") == "verified"


def test_wrong_number_is_a_mismatch():
    r = check("sensor_23 z-score=-2.8 and rf_power_w=1600")
    assert status(r, "sensor_23") == "value_mismatch"      # sign flipped
    assert status(r, "rf_power_w") == "value_mismatch"     # 8% off a raw value


def test_invented_references_are_not_in_evidence():
    r = check("sensor_999 spiked, see HC-999 and the made_up_param=3 reading on ETCH-99")
    for ref in ("sensor_999", "HC-999", "made_up_param", "ETCH-99"):
        assert status(r, ref) == "not_in_evidence", ref


def test_flagged_signals_not_cited_are_listed():
    r = check("sensor_23 z-score=2.8")
    uncited = {u["ref"] for u in r["uncited"]}
    assert {"Pressure", "RF Load", "HC-033", "gas_flow_sccm"} <= uncited


def test_prose_is_not_a_sensor_citation():
    # "chamber pressure" in prose must not count as citing the Pressure sensor.
    r = check("chamber pressure drift suspected")
    assert all(l["ref"] != "Pressure" for l in r["links"])


def test_wafer_pattern_claim_checked_against_classifier():
    assert status(check("wafer_map_pattern=Edge-Ring"), "wafer_map_pattern") == "verified"
    assert status(check("wafer_map_pattern=Scratch"), "wafer_map_pattern") == "value_mismatch"
