"""
evidence_graph.py — check what a hypothesis cites against what the tools returned.

The MCP server's citation gate only rejects a hypothesis whose evidence_summary is
empty. That stops an uncited guess, but not a wrong citation: a hypothesis can name
a case nobody retrieved, quote a sensor value the tools never reported, or skip the
strongest signal the anomaly tool flagged. This module reads the hypothesis text,
finds every evidence reference in it, and checks each one against the evidence
bundle the chain actually produced.

    link_evidence(hypothesis, evidence) -> {"links": [...], "uncited": [...], "summary": {...}}

Each link is {kind, ref, status, claimed, actual, source}; status is "verified",
"value_mismatch" or "not_in_evidence". "uncited" lists signals a tool flagged that
the hypothesis does not mention. Nothing here changes a hypothesis or its rank: it
is shown to the engineer, next to the hypothesis, as a check they can audit.
"""

from __future__ import annotations

import re

_NUM = r"([+-]?\d+(?:\.\d+)?)"
_CASE = re.compile(r"\bHC-(?:FB)?\d+\b")
_SNAKE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b")
_EQUIP = re.compile(r"\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{2,}\b")
# Field names, not evidence: `case_id=case_1a` cites case_1a, not "case_id".
_FIELDS = {"case_id", "lot_id", "hypothesis_id", "wafer_map_pattern", "z_score"}


def _claimed_number(text: str, name: str) -> float | None:
    """The number written right after `name`: `name=1480`, `name z-score=2.8`, `name (+2.8σ)`."""
    m = re.search(re.escape(name) + r"\s*(?:z-score\s*)?(?:=|:|\()?\s*" + _NUM, text)
    return float(m.group(1)) if m else None


def _close(claimed: float, actual: float) -> bool:
    # σ values are compared to ±0.15σ; raw recipe values (hundreds, thousands) to ±1%.
    return abs(claimed - actual) <= (0.15 if abs(actual) < 20 else 0.01 * abs(actual))


def _mentions(text: str, name: str, case_sensitive: bool) -> bool:
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.search(r"(?<![\w-])" + re.escape(name) + r"(?![\w-])", text, flags) is not None


def link_evidence(hypothesis: dict, evidence: dict) -> dict:
    text = f"{hypothesis.get('description', '')} {hypothesis.get('evidence_summary', '')}"
    lot = evidence.get("lot") or {}
    cls = evidence.get("classification") or {}
    an = evidence.get("anomaly") or {}
    cases = (evidence.get("cases") or {}).get("cases") or []
    tel = (evidence.get("telemetry") or {}).get("telemetry") or []

    # Every named value the chain produced, with the tool it came from.
    sensors: dict[str, tuple[float, str]] = {}
    for k, v in (lot.get("sensor_signature") or {}).items():
        sensors[k] = (float(v), "get_lot_data")
    for k, v in (an.get("_named_deviations") or {}).items():
        sensors[k] = (float(v), "score_sensor_anomaly")
    params = {k: float(v) for k, v in (lot.get("planned_process_params") or {}).items()
              if isinstance(v, (int, float))}
    tel_params = {t["parameter"]: t for t in tel if t.get("parameter")}
    case_ids = {c["case_id"]: c for c in cases if c.get("case_id")}
    equipment = set(lot.get("equipment_ids") or []) | {t.get("equipment_id") for t in tel} \
        | {c.get("equipment_id") for c in cases}
    equipment.discard(None)

    links: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def add(kind, ref, status, source, claimed=None, actual=None):
        if (kind, ref) in seen:
            return
        seen.add((kind, ref))
        links.append({"kind": kind, "ref": ref, "status": status, "source": source,
                      "claimed": claimed, "actual": actual})

    def check_value(kind, name, actual, source):
        claimed = _claimed_number(text, name)
        ok = claimed is None or _close(claimed, actual)
        add(kind, name, "verified" if ok else "value_mismatch", source, claimed, actual)

    # Sensors: names the chain reported. sensor_NN is matched exactly; tool variable
    # names ("Pressure", "RF Load") case-sensitively, so prose like "chamber pressure"
    # is not taken for a citation of the Pressure sensor.
    for name, (actual, source) in sensors.items():
        if _mentions(text, name, case_sensitive=True):
            check_value("sensor", name, actual, source)
    for name in sorted(set(re.findall(r"\bsensor_[a-z0-9_]+\b", text)) - set(sensors)):
        add("sensor", name, "not_in_evidence", "—", _claimed_number(text, name))

    # Recipe / process parameters from the lot record, and telemetry parameters.
    for name, actual in params.items():
        if _mentions(text, name, case_sensitive=False):
            check_value("process_param", name, actual, "get_lot_data")
    for name, row in tel_params.items():
        if name in params:
            continue                      # already checked against the recipe value
        if _mentions(text, name, case_sensitive=False):
            add("telemetry", name, "verified", "query_telemetry",
                actual=row.get("magnitude_sigma"))

    # Defect class, written as wafer_map_pattern=<class> or by name.
    predicted = cls.get("predicted_class")
    m = re.search(r"wafer_map_pattern\s*=\s*([A-Za-z-]+)", text)
    if m:
        add("defect_class", "wafer_map_pattern", "verified" if m.group(1) == predicted else
            ("value_mismatch" if predicted else "not_in_evidence"),
            "classify_wafer_map", m.group(1), predicted)
    elif predicted and _mentions(text, predicted, case_sensitive=False):
        add("defect_class", predicted, "verified", "classify_wafer_map", actual=predicted)

    # Historical cases and equipment.
    cited_cases = set(_CASE.findall(text)) | set(re.findall(r"case_id\s*=\s*([\w-]+)", text))
    for cid in sorted(cited_cases):
        c = case_ids.get(cid)
        add("case", cid, "verified" if c else "not_in_evidence", "retrieve_similar_cases",
            actual=c.get("similarity") if c else None)
    for eq in sorted(set(_EQUIP.findall(text))):
        add("equipment", eq, "verified" if eq in equipment else "not_in_evidence",
            "get_lot_data")

    # Identifier-shaped tokens that match nothing the chain produced.
    known = set(sensors) | set(params) | set(tel_params) | _FIELDS | cited_cases
    for tok in sorted(set(_SNAKE.findall(text)) - known):
        if not tok.startswith("sensor_"):
            add("unknown", tok, "not_in_evidence", "—", _claimed_number(text, tok))

    # Signals a tool flagged that the hypothesis does not mention.
    cited = {(l["kind"], l["ref"]) for l in links}
    uncited = []
    for s in an.get("top_deviating_sensors") or []:
        if ("sensor", s) not in cited:
            uncited.append({"kind": "sensor", "ref": s, "source": "score_sensor_anomaly",
                            "actual": sensors.get(s, (None,))[0]})
    if cases and ("case", cases[0]["case_id"]) not in cited:
        uncited.append({"kind": "case", "ref": cases[0]["case_id"],
                        "source": "retrieve_similar_cases", "actual": cases[0].get("similarity")})
    for t in tel:
        p = t.get("parameter")
        if p and abs(t.get("magnitude_sigma") or 0) >= 2 \
                and ("telemetry", p) not in cited and ("process_param", p) not in cited:
            uncited.append({"kind": "telemetry", "ref": p, "source": "query_telemetry",
                            "actual": t.get("magnitude_sigma")})

    summary = {s: sum(l["status"] == s for l in links)
               for s in ("verified", "value_mismatch", "not_in_evidence")}
    summary["uncited"] = len(uncited)
    return {"links": links, "uncited": uncited, "summary": summary}


def attach(ranked: dict, evidence: dict) -> dict:
    """Adds evidence_check to every hypothesis in a rank_root_causes result, in place."""
    for h in (ranked or {}).get("hypotheses") or []:
        h["evidence_check"] = link_evidence(h, evidence)
    return ranked
