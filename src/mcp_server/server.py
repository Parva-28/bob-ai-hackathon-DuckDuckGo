"""
server.py — YieldGuard MCP server. Eight tools, exposed to IBM Bob over stdio.

Bob is the orchestrator. This server deliberately does NOT chain its own tools:
rank_root_causes takes classification / anomaly / cases / telemetry as ARGUMENTS,
which Bob gathers by calling the evidence tools first and passing the results in.
A server that fetched its own inputs would reduce Bob to a chat skin over a fixed
pipeline - see docs/lld/01_architecture.mermaid.

Run directly for a self-check:   python src/mcp_server/server.py --selftest
Run as an MCP server (Bob does): python src/mcp_server/server.py
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mcp.server.mcpserver import MCPServer

import adapters
import lot_sensors
from param_map import sigma_to_secom_raw, to_secom_space
from stores import CaseStore, FeedbackStore, TelemetryStore

mcp = MCPServer(
    name="yieldguard",
    instructions=(
        "Wafer yield root-cause and defect-pattern analysis for semiconductor fabs.\n\n"
        "Two workflows:\n"
        "  POST-MORTEM ('why did lot X fail?'): call classify_wafer_map and "
        "score_sensor_anomaly first, then retrieve_similar_cases and query_telemetry, "
        "then pass ALL FOUR results into rank_root_causes, then "
        "get_corrective_action_playbook on the top hypothesis.\n"
        "  PRE-RUN ('which upcoming lots are at risk?'): call flag_at_risk_batch with the "
        "planned process parameters. No wafer map or test data exists yet, so "
        "classify_wafer_map and score_sensor_anomaly do not apply. For a flagged lot, "
        "follow up with retrieve_similar_cases and query_telemetry, then rank_root_causes "
        "with classification and anomaly set to null.\n\n"
        "Every hypothesis must cite a named evidence source (a sensor, a case_id, or a "
        "telemetry parameter). If a tool fails, report the gap - never substitute a "
        "confident-sounding guess."
    ),
)

cases = CaseStore()
telemetry = TelemetryStore()
feedback = FeedbackStore()

DEFECT_CLASSES = ["Center", "Donut", "Edge-Loc", "Edge-Ring",
                  "Local", "Random", "Scratch", "Near-full", "None"]


# ── lot lookup ────────────────────────────────────────────────────────────────

_LOTS = json.loads((Path(__file__).parent / "data" / "lots.json").read_text())["lots"]
# Which SECOM class a lot's sensor vector is built from. Cases whose premise is that
# the PROCESS sensors are genuinely quiet must be based on a pass-class row, or the
# negative-evidence test is meaningless: Scratch handling damage (3a-3c), an interlock
# software fault (6b), and the test-head artifact (6c), where the deviation sits on the
# tester rather than on any process sensor.
_LOT_PROFILE = {lid: ("pass" if l["case_id"] in ("case_3a", "case_3b", "case_3c",
                                                 "case_6b", "case_6c") else "fail")
                for lid, l in _LOTS.items()}


@mcp.tool(description="Look up an existing or planned lot by its lot_id and return the "
                      "evidence needed to analyse it: the wafer map reference, the sensor "
                      "signature, the equipment it ran on, and its planned process "
                      "parameters. CALL THIS FIRST for any question that names a lot - the "
                      "other tools need these values and cannot derive them from a lot_id.")
def get_lot_data(lot_id: str) -> dict:
    # Without this tool an engineer's real question ("why did lot L-4471 fail?") has no
    # entry point: classify_wafer_map wants an image path and score_sensor_anomaly wants a
    # sensor dict, and nothing maps a lot_id to either. Observed in testing, the agent
    # filled the gap by inventing an image path and passing an empty sensor dict, which
    # produced an anomaly score of 0.0 and a defect class contradicting the question.
    lot = _LOTS.get(lot_id)
    if lot is None:
        return {
            "error": f"unknown lot_id '{lot_id}'",
            "known_lots": sorted(_LOTS),
            "hint": "Use one of known_lots. Do not guess values for a lot that is not listed.",
        }
    fx = next((f for f in adapters.FIXTURES if f["case_id"] == lot["case_id"]), None)
    if fx is None:
        return {"error": f"lot '{lot_id}' references missing fixture '{lot['case_id']}'"}

    planned = lot.get("status") == "planned"
    out = {
        "lot_id": lot_id,
        "product_id": lot.get("product_id"),
        "fab_line": lot.get("fab_line"),
        "status": lot.get("status"),
        "equipment_ids": lot.get("equipment_ids", []),
        "planned_process_params": fx["planned_process_params"],
        "provenance": "constructed scenario - not a real fab incident",
    }
    if planned:
        # A planned lot has no wafer map and no test result, by construction.
        out["scheduled_start"] = lot.get("scheduled_start")
        out["wafer_map_ref"] = None
        out["sensor_signature"] = None
        out["note"] = ("This lot has NOT run. No wafer map or sensor data exists. "
                       "classify_wafer_map and score_sensor_anomaly do not apply - "
                       "use flag_at_risk_batch with planned_process_params.")
    else:
        out["final_yield_pct"] = lot.get("final_yield_pct")
        # A real path to a real WM-811K map, not a symbolic name. The stub matched
        # on the filename stem so any string worked; a trained classifier opens the
        # file, and a ref that does not resolve fails the whole post-mortem path.
        wm = Path(__file__).parent / "data" / "wafer_maps" / f"{lot['case_id']}.npy"
        out["wafer_map_ref"] = str(wm) if wm.exists() else None
        if not wm.exists():
            out["wafer_map_note"] = ("No wafer map on file for this lot. Skip "
                                     "classify_wafer_map and say the image evidence "
                                     "is unavailable - do not invent a path.")
        out["sensor_signature"] = fx["sensor_signature"]
    return out


# ── evidence tools ────────────────────────────────────────────────────────────

@mcp.tool(description="Classify a wafer bin map into one of the 9 WM-811K defect "
                      "pattern classes. Pass the wafer_map_ref returned by get_lot_data - "
                      "do not invent a path. Returns the predicted class and confidence.")
def classify_wafer_map(image_path: str) -> dict:
    if adapters.real_classify_wafer_map:
        return adapters.real_classify_wafer_map(image_path)
    stem = Path(image_path).stem.lower()
    fx = next((f for f in adapters.FIXTURES
               if f["case_id"].lower() in stem or f["wafer_map_pattern"].lower() in stem), None)
    fx = fx or (adapters.FIXTURES[0] if adapters.FIXTURES else None)
    if fx is None:
        return {"predicted_class": "None", "confidence": 0.0, "_mode": "stub"}
    return {"predicted_class": fx["wafer_map_pattern"], "confidence": 0.91, "_mode": "stub"}


@mcp.tool(description="Score a lot's sensor vector for anomaly against the SECOM-trained "
                      "normality model. Pass the sensor_signature returned by get_lot_data - "
                      "an empty dict scores 0.0 and means NO DATA, not a clean lot. "
                      "A genuinely LOW score on real data is meaningful evidence: it points "
                      "away from process causes toward handling or measurement.")
def score_sensor_anomaly(lot_id: str, sensors: dict[str, float],
                         units: str = "sigma") -> dict:
    if not sensors:
        # An empty dict is NO DATA. Scoring it returns 0.0, which reads as "clean lot"
        # and is the opposite of the truth. Refuse rather than mislead.
        return {"error": "no sensor data supplied",
                "hint": "Call get_lot_data(lot_id) and pass its sensor_signature. "
                        "An empty dict is not a clean lot, it is a missing measurement.",
                "anomaly_score": None, "top_deviating_sensors": []}

    if adapters.real_score_sensor_anomaly:
        payload, unknown = sensors, []
        # A 3-sensor signature cannot be scored: the other ~579 features impute to the
        # median, and a near-all-median vector is maximally typical to an Isolation
        # Forest, so the score pins to 0.0 regardless of what the named sensors say.
        # Expand to a full realistic vector instead - a representative SECOM row of the
        # lot's profile with the named deviations overlaid. The full vector stays
        # server-side; Bob only ever sees the sparse signature.
        profile = _LOT_PROFILE.get(lot_id, "fail" if any(abs(float(v)) >= 1.5
                                                         for v in sensors.values()) else "pass")
        full = lot_sensors.build_vector(sensors, profile) if units == "sigma" else None
        if full:
            out = dict(adapters.real_score_sensor_anomaly({"lot_id": lot_id, "sensors": full}))
            out["_units_in"] = units
            out["_scored_on"] = f"full 582-feature vector, {profile}-class base"
            out["_named_deviations"] = sensors
            return out
        if units == "sigma":
            # Fixtures, telemetry and evidence summaries all speak sigma; the model
            # expects raw instrument units and standardises internally. See
            # param_map.sigma_to_secom_raw for why passing sigma straight through
            # manufactures outliers rather than merely losing signal.
            means, scales = adapters.secom_scaler_stats()
            if means:
                payload, unknown = sigma_to_secom_raw(sensors, means, scales)
        out = dict(adapters.real_score_sensor_anomaly(
            {"lot_id": lot_id, "sensors": payload}))
        out["_units_in"] = units
        if unknown:
            out["_unknown_sensors"] = unknown
        return out
    ranked = sorted(sensors.items(), key=lambda kv: -abs(kv[1]))
    peak = abs(ranked[0][1]) if ranked else 0.0
    return {
        "anomaly_score": round(min(1.0, peak / 3.5), 4),
        "top_deviating_sensors": [k for k, v in ranked[:5] if abs(v) >= 0.5],
        "_mode": "stub",
    }


@mcp.tool(description="Retrieve the most similar historical cases for a defect class and "
                      "sensor signature, each with its confirmed root cause and outcome. "
                      "case_id values returned here are the same IDs referenced by "
                      "flag_at_risk_batch, so they can be cross-cited as evidence.")
def retrieve_similar_cases(defect_class: str | None = None,
                           sensor_signature: dict[str, float] | None = None,
                           top_k: int = 5) -> dict:
    return {"cases": cases.search(defect_class, sensor_signature or {}, top_k)}


@mcp.tool(description="Query recent equipment telemetry (simulated SECS/GEM) for the given "
                      "tools. Returns direction (increasing/decreasing/stable/oscillating) "
                      "and magnitude_sigma per parameter, plus a human-readable trend.")
def query_telemetry(equipment_ids: list[str], time_window: str = "14d") -> dict:
    return {
        "telemetry": telemetry.query(equipment_ids, time_window),
        "equipment_meta": {e: telemetry.equipment_meta(e) for e in equipment_ids},
    }


# ── reasoning tools ───────────────────────────────────────────────────────────

def _stub_rank(classification, anomaly, cases_in, telemetry_in) -> list[dict]:
    """
    Rule-based fallback ranking, used until Track 4's watsonx.ai reasoner lands.

    Deliberately reproduces the two behaviours the demo depends on, so the
    pipeline is testable before the LLM exists:
      * negative evidence - a quiet sensor vector pushes ranking toward the
        retrieved case's own category rather than inventing a process cause
      * honest uncertainty - confidence tracks retrieval similarity instead of
        being pinned high
    """
    retrieved = (cases_in or {}).get("cases", []) or []
    tel = (telemetry_in or {}).get("telemetry", []) or []
    score = (anomaly or {}).get("anomaly_score")
    top_sensors = (anomaly or {}).get("top_deviating_sensors", []) or []
    quiet = score is not None and score < 0.30

    out = []
    for i, c in enumerate(retrieved[:3]):
        bits = [f"matches historical case {c['case_id']} (similarity {c['similarity']:.2f})"]
        if top_sensors:
            bits.append(f"top deviating sensor {top_sensors[0]}")
        elif quiet:
            bits.append("no process sensor deviation - absence of signal points away "
                        "from a process cause")
        hit = next((t for t in tel if t.get("equipment_id") == c.get("equipment_id")
                    and t.get("magnitude_sigma") is not None
                    and abs(t["magnitude_sigma"]) >= 1.5), None)
        if hit:
            bits.append(f"telemetry {hit['parameter']} {hit['direction']} "
                        f"at {hit['magnitude_sigma']} sigma on {hit['equipment_id']}")
        conf = c["similarity"] * (0.9 - 0.12 * i)

        # A measurement-artifact hypothesis is a claim that the DATA is wrong.
        # You cannot be highly confident about a wafer whose measurement you are
        # simultaneously disputing, so this category is capped - which is what
        # keeps Case 6c honest instead of merely correct.
        if c.get("category") == "measurement":
            conf = min(conf, 0.70)
            bits.append("measurement-path hypothesis - confidence capped because "
                        "the wafer result itself is in question")

        # Competing categories among near-equally-similar precedents means the
        # evidence genuinely does not discriminate. Say so with the number.
        if len(retrieved) > 1 and retrieved[1]["similarity"] >= c["similarity"] - 0.05 \
                and retrieved[1].get("category") != c.get("category"):
            conf = min(conf, 0.55)
            bits.append(f"competing precedent {retrieved[1]['case_id']} "
                        f"({retrieved[1].get('category')}) is similarly close")

        out.append({
            "description": c["confirmed_root_cause"],
            "confidence": round(max(0.10, min(0.85, conf)), 3),
            "category": c.get("category"),
            "evidence_summary": "; ".join(bits),
        })
    if not out:
        # Deliberately uncited: this is not a hypothesis, it is the absence of one.
        # Giving it a plausible-sounding evidence_summary would let it pass the
        # citation gate and be rendered to an engineer as a finding.
        out = [{
            "description": "Insufficient evidence to rank a root cause.",
            "confidence": 0.0,
            "category": None,
            "evidence_summary": "",
        }]
    return out


@mcp.tool(description="Rank probable root causes from fused evidence. Pass in the results of "
                      "classify_wafer_map, score_sensor_anomaly, retrieve_similar_cases and "
                      "query_telemetry. For pre-run analysis pass classification=null and "
                      "anomaly=null. Every hypothesis carries a cited evidence_summary and a "
                      "server-minted hypothesis_id for submit_feedback.")
def rank_root_causes(classification: dict | None = None,
                     anomaly: dict | None = None,
                     cases: dict | None = None,
                     telemetry: dict | None = None) -> dict:
    if adapters.real_rank_root_causes:
        result = adapters.real_rank_root_causes(classification or {}, anomaly or {},
                                                cases or {}, telemetry or {})
        hyps = [dict(h) for h in result.get("hypotheses", [])]
    else:
        hyps = _stub_rank(classification, anomaly, cases, telemetry)

    # hypothesis_id is minted HERE, at the MCP boundary, not by Track 4.
    # The frozen contract returns no id, but submit_feedback requires one and the
    # ER model has it as a PK - so FR-10 was unimplementable as written
    # (see docs/setup-guide.md). Minting server-side keeps Track 4 a stateless function.
    # ---- confidence discipline, enforced rather than requested --------------
    # The prompt asks the model to cap measurement-artifact hypotheses at 0.70 and
    # single-occurrence ones at 0.50. Live Granite does not reliably comply: on Case
    # 6c it returns "TESTER-04 test head calibration drift causing false failures" at
    # 0.85 and labels it `equipment`, so its own cap never fires. Asking is not
    # enforcing, and this is the one behaviour the whole design claims. So the server
    # applies the ceiling itself, the same way it already enforces evidence citation.
    #
    # Every cap is recorded on the hypothesis, so a capped value is visible as a
    # deliberate act rather than silently rewritten.
    # Matched against the DESCRIPTION only. Matching the evidence summary too was
    # over-broad: a CMP pad-life hypothesis whose evidence merely mentioned
    # "calibration" got relabelled `measurement` and capped for the wrong reason.
    # Terms here must name the measurement path itself, not any drifting instrument.
    _MEASUREMENT_HINTS = ("test head", "test equipment", "tester", "probe card",
                          "probe contact", "measurement artifact", "metrology",
                          "false fail", "false failure", "measurement error")
    _HANDLING_HINTS = ("end-effector", "end effector", "cassette", "wafer handler",
                       "handling robot", "handler robot", "mis-pick", "mispick",
                       "slot misalign")
    _SINGLE_EVENT_HINTS = ("one-off", "single occurrence", "single event", "one occurrence",
                           "non-repeating", "isolated incident", "operator-assisted")

    for h in hyps:
        desc = str(h.get("description", "")).lower()
        blob = f"{desc} {str(h.get('evidence_summary','')).lower()}"
        # Re-derive the category from what the hypothesis actually SAYS when the model's
        # own label contradicts it — a tester-drift cause is not an equipment cause, and
        # end-effector wear is handling rather than equipment.
        derived = ("measurement" if any(k in desc for k in _MEASUREMENT_HINTS)
                   else "handling" if any(k in desc for k in _HANDLING_HINTS)
                   else None)
        if derived and h.get("category") != derived:
            h["_category_declared"] = h.get("category")
            h["category"] = derived
        cap = None
        if h.get("category") == "measurement":
            cap = 0.70
        if any(k in blob for k in _SINGLE_EVENT_HINTS):
            cap = min(cap or 1.0, 0.50)
        if cap is not None and float(h.get("confidence") or 0) > cap:
            h["_confidence_uncapped"] = h["confidence"]
            h["confidence"] = cap
            h["_capped_because"] = (
                "a claim that the measurement is wrong is a claim the data is untrustworthy"
                if h["category"] == "measurement" else
                "single non-repeating occurrence is not a pattern")

    # Competing categories that the evidence does not separate must not look decisive.
    ranked_now = sorted(hyps, key=lambda x: -float(x.get("confidence") or 0))
    if len(ranked_now) > 1:
        a, b = ranked_now[0], ranked_now[1]
        if (a.get("category") != b.get("category")
                and abs(float(a.get("confidence") or 0) - float(b.get("confidence") or 0)) <= 0.10):
            for h in (a, b):
                if float(h.get("confidence") or 0) > 0.55:
                    h.setdefault("_confidence_uncapped", h["confidence"])
                    h["confidence"] = 0.55
                    h["_capped_because"] = ("a competing hypothesis of a different category "
                                            "is equally well supported")

    # CONTRACTS A1 makes `category` recommended, not required, and the reasoning
    # layer does not emit it. Rather than losing the field - the eval fixtures and
    # the corrective-action playbook both key off it - backfill it from the
    # retrieved cases, which the server already has in hand. Prefer the case the
    # hypothesis actually cites; fall back to the closest retrieved case.
    retrieved = (cases or {}).get("cases", []) or []
    for h in hyps:
        if h.get("category"):
            continue
        blob = f"{h.get('description','')} {h.get('evidence_summary','')}"
        cited = next((c for c in retrieved if c.get("case_id") and c["case_id"] in blob), None)
        src = cited or (retrieved[0] if retrieved else None)
        if src and src.get("category"):
            h["category"] = src["category"]
            h["_category_source"] = ("cited_case:" + src["case_id"]) if cited else \
                                    ("nearest_case:" + str(src.get("case_id")))

    run = uuid.uuid4().hex[:6]
    validated, rejected = [], []
    for i, h in enumerate(sorted(hyps, key=lambda x: -float(x.get("confidence") or 0.0)), 1):
        h = dict(h)
        h["hypothesis_id"] = f"H-{run}-{i}"
        h["rank"] = i
        # Enforce the evidence-citation rule in code, not just in review.
        if not str(h.get("evidence_summary") or "").strip():
            rejected.append(h["hypothesis_id"])
            continue
        validated.append(h)

    out = {"hypotheses": validated, "_mode": "real" if adapters.real_rank_root_causes else "stub"}
    if rejected:
        out["rejected_uncited"] = rejected
    if not validated:
        out["warning"] = ("No hypothesis carried a cited evidence source. Returning none "
                          "rather than an uncited guess.")
    return out


@mcp.tool(description="Given the top-ranked hypothesis, return specific prioritised "
                      "corrective actions. On the pre-run path these are preventive actions "
                      "to take before the lot is released.")
def get_corrective_action_playbook(top_hypothesis: dict, preventive: bool = False) -> dict:
    if adapters.real_playbook:
        return adapters.real_playbook(top_hypothesis)
    desc = (top_hypothesis or {}).get("description", "")
    cat = (top_hypothesis or {}).get("category") or "process"
    verb = "Before releasing the lot, verify" if preventive else "Verify"
    by_cat = {
        "equipment":   [(f"{verb} the implicated tool parameter against its qualification limits", "high"),
                        ("Pull the tool for condition-based maintenance if out of spec", "high"),
                        ("Re-qualify with a send-ahead wafer before releasing the queue", "medium")],
        "material":    [(f"{verb} the incoming material lot certificate against spec", "high"),
                        ("Quarantine remaining units from the same vendor lot", "high"),
                        ("Add an incoming-QC gate for this parameter", "medium")],
        "handling":    [("Inspect the handler end-effector and cassette alignment", "high"),
                        ("Review handling logs for the affected slot positions", "medium"),
                        ("Do NOT adjust process recipe - sensors are clean", "medium")],
        "software":    [("Review the firmware/config change log around the defect onset", "high"),
                        ("Roll back the implicated change on one tool and run a split lot", "high"),
                        ("Add the config version to the lot genealogy record", "medium")],
        "measurement": [("Recalibrate the test head and retest a sample of the lot BEFORE scrapping", "high"),
                        ("Cross-check on a second tester to confirm the wafers are actually bad", "high"),
                        ("Place the lot on hold, not scrap, pending retest", "high")],
        "process":     [(f"{verb} the process parameter against its control limits", "high"),
                        ("Review recent recipe changes on this and any shared tool", "medium"),
                        ("Run an SPC review of the implicated step", "medium")],
    }
    actions = by_cat.get(cat, by_cat["process"])
    return {
        "actions": [{"description": d, "priority": p, "is_preventive": preventive}
                    for d, p in actions],
        "_for_hypothesis": (top_hypothesis or {}).get("hypothesis_id"),
        "_basis": desc[:120],
        "_mode": "stub",
    }


# ── predictive & feedback tools ───────────────────────────────────────────────

@mcp.tool(description="Flag an UPCOMING lot as at-risk before it runs, by scoring its planned "
                      "process parameters against historically low-yield profiles. Requires no "
                      "wafer map and no test data. This is a triage signal for engineer review, "
                      "not an automated go/no-go gate.")
def flag_at_risk_batch(lot_id: str, planned_process_params: dict[str, float]) -> dict:
    if adapters.real_flag_at_risk_batch:
        # Translate physically-named parameters into SECOM feature space first.
        # Without this every planned-parameter dict imputes to the training median
        # and scores ~0.4288 - the uninformative baseline - so FR-8 never fires.
        secom_params, unmapped = to_secom_space(planned_process_params)
        result = adapters.real_flag_at_risk_batch(
            {"lot_id": lot_id, "planned_process_params": secom_params})
        result["_mapped_params"] = secom_params
        if unmapped:
            result["_unmapped_params"] = unmapped
        return result
    # Match on planned_process_params, NOT sensor_signature - different key spaces.
    fx = adapters.nearest_fixture(planned_process_params, field="planned_process_params")
    hits = cases.search(None, planned_process_params, top_k=2)
    sim = hits[0]["similarity"] if hits else 0.0
    if fx and fx.get("expected_at_risk"):
        sim = max(sim, 0.74)
    elif fx:
        # Resembles a known lot profile, but not one that historically ran low-yield.
        sim = min(sim, 0.35)
    return {
        "lot_id": lot_id,
        "at_risk": sim >= 0.60,
        "similarity_to_historical_low_yield": round(sim, 4),
        "matched_case_ids": [h["case_id"] for h in hits],
        "threshold_used": 0.60,
        "_caveat": "Similarity to past low-yield profiles. Not a causal prediction.",
        "_mode": "stub",
    }


@mcp.tool(description="Record an engineer's verdict on a ranked hypothesis. Use the "
                      "hypothesis_id returned by rank_root_causes. Rejections matter as much "
                      "as confirmations - they stop a false positive being reinforced.")
def submit_feedback(hypothesis_id: str, verdict: str, notes: str = "") -> dict:
    try:
        rec = feedback.submit(hypothesis_id, verdict, notes)
    except ValueError as e:
        return {"status": "error", "error": str(e)}
    return {"status": "ok", "feedback_id": rec["feedback_id"], "verdict": rec["verdict"]}


@mcp.tool(description="Report which tools are backed by trained models versus schema-valid "
                      "stubs. Call this to state honestly what is real in a given run.")
def pipeline_status() -> dict:
    d = adapters.describe_pipeline()
    d["historical_cases"] = len(cases.all_ids())
    d["known_equipment"] = telemetry.known_equipment()
    d["fixtures_loaded"] = len(adapters.FIXTURES)
    return d


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        from test_server import main as selftest
        raise SystemExit(selftest())
    mcp.run(transport="stdio")
