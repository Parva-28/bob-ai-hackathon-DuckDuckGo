"""
Track 4 -- Root Cause Reasoning backed by Google Gemini (primary) or watsonx.ai (fallback).

Environment variables
---------------------
USE_MOCK_LLM       : "true" (default) -- use canned mock responses so the module
                     works with no credentials.  Set to "false" to call the live LLM.
REASONING_PROVIDER : "gemini" (default) | "watsonx" -- which LLM backend to use.
GEMINI_API_KEY     : Google AI API key (required when provider=gemini and USE_MOCK_LLM=false)
GEMINI_MODEL_ID    : Model name (default: gemini-2.0-flash)
WATSONX_API_KEY    : IBM Cloud API key (required when provider=watsonx and USE_MOCK_LLM=false)
WATSONX_PROJECT_ID : watsonx.ai project ID (required when provider=watsonx)
WATSONX_URL        : watsonx.ai endpoint URL (default: https://us-south.ml.cloud.ibm.com)
WATSONX_MODEL_ID   : Granite model ID (default: ibm/granite-4-h-small)

Public functions
----------------
rank_root_causes(classification, anomaly, cases, telemetry) -> dict
get_corrective_action_playbook(top_hypothesis) -> dict
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import textwrap
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Automatic .env loading
# ---------------------------------------------------------------------------

def _load_env_file() -> None:
    """Load key-value pairs from src/.env and .env if present."""
    here = Path(__file__).resolve().parent
    candidates = [
        here.parent / ".env",          # src/.env
        here.parent.parent / ".env",   # root .env
    ]
    for env_path in candidates:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass

_load_env_file()

# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def get_config(key: str, default: str = "") -> str:
    _load_env_file()
    return os.environ.get(key, default).strip()

_USE_MOCK = get_config("USE_MOCK_LLM", "true").lower() != "false"
_PROVIDER = get_config("REASONING_PROVIDER", "gemini").lower()

# Gemini config
_GEMINI_API_KEY = get_config("GEMINI_API_KEY", "")
_GEMINI_MODEL_ID = get_config("GEMINI_MODEL_ID", "gemini-2.0-flash")

# watsonx config (legacy)
_WATSONX_URL = get_config("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
_WATSONX_MODEL_ID = get_config("WATSONX_MODEL_ID", "ibm/granite-4-h-small")
_WATSONX_PROJECT_ID = get_config("WATSONX_PROJECT_ID", "")
_WATSONX_API_KEY = get_config("WATSONX_API_KEY", "")



# ---------------------------------------------------------------------------
# Prompt builders — enhanced with few-shot examples for category diversity
# ---------------------------------------------------------------------------

_CATEGORY_FEW_SHOTS = textwrap.dedent("""\
    ## Few-shot examples — learn the CATEGORY signals

    Example A (material cause):
      Evidence: Center defect pattern. Sensors show slurry_lot_age_days=3 (new vendor lot).
      sensor_91 z-score=1.7 (viscosity-related). No equipment telemetry drift.
      → Category: "material" — the cause is incoming material (slurry vendor lot),
        NOT equipment. Equipment is nominal; the material changed.

    Example B (software cause):
      Evidence: Near-full defect pattern. Process sensors are quiet (sensor_12=0.3,
      sensor_45=0.2). But sensor_route_mismatch=2.7 and interlock_fw_changed=1.0.
      → Category: "software" — an interlock firmware change misrouted wafers.
        NOT measurement, NOT equipment. The routing software is the cause.

    Example C (handling cause):
      Evidence: Scratch defect pattern. ALL process sensors near zero (sensor_12=0.1,
      sensor_45=-0.1). handler_cycles_since_pm=48000 (past 30000 PM interval).
      → Category: "handling" — robot end-effector wear. Process sensors being quiet
        is NEGATIVE EVIDENCE that eliminates process/equipment causes.

    Example D (process cause):
      Evidence: Random defect pattern. chamber_seasoning_idx drifting after recipe change.
      Multiple process sensors deviate. Equipment PM is recent.
      → Category: "process" — the recipe change altered chamber conditions.
        NOT equipment failure — the equipment is fine, the process recipe changed.

    Example E (measurement cause):
      Evidence: Near-full defect pattern. TESTER sensor shows high anomaly. Process
      sensors all quiet. test_head_calibration_drift is high.
      → Category: "measurement" — the test equipment may be producing false failures.
        Confidence MUST be capped at 0.70 maximum.
""")


def _build_rank_prompt(
    classification: dict,
    anomaly: dict,
    cases: dict,
    telemetry: dict,
) -> str:
    """Build the enhanced prompt for root-cause ranking with chain-of-thought."""

    predicted_class = classification.get("predicted_class", "Unknown")
    cls_confidence = classification.get("confidence", 0.0)
    anomaly_score = anomaly.get("anomaly_score", 0.0)
    top_sensors = anomaly.get("top_deviating_sensors", [])
    case_list = cases.get("cases", [])
    telemetry_list = telemetry.get("telemetry", [])

    cases_text = "\n".join(
        f"  - case_id={c['case_id']}, similarity={c.get('similarity', 0):.2f}, "
        f"root_cause={c.get('confirmed_root_cause', 'unknown')}, "
        f"category={c.get('category', 'unknown')}, outcome={c.get('outcome', 'unknown')}"
        for c in case_list
    ) or "  (no similar cases available)"

    telemetry_text = "\n".join(
        f"  - equipment={t['equipment_id']}, parameter={t['parameter']}, "
        f"direction={t.get('direction', 'unknown')}, "
        f"magnitude_sigma={t.get('magnitude_sigma', 'N/A')}, "
        f"trend={t['recent_trend']}"
        for t in telemetry_list
    ) or "  (no telemetry available)"

    sensors_text = ", ".join(top_sensors) if top_sensors else "(none flagged)"

    # Build a summary of ALL sensor values for context
    all_sensors = anomaly.get("_named_deviations", {}) or {}
    sensor_detail = "\n".join(
        f"    {name}: z-score={val:+.1f}"
        for name, val in sorted(all_sensors.items(), key=lambda x: -abs(x[1]))
    ) if all_sensors else "    (see top_deviating_sensors above)"

    # Pre-run lots have no measurements at all — only the recipe they are about to
    # run. Without this block the model was asked to explain a planned lot from
    # telemetry alone, so a parameter sitting in plain sight (reticle_swaps_24h on
    # a LITHO lot) was unreachable and it grounded on an unrelated precedent
    # instead. These are absolute SETPOINTS, not z-scores; labelling matters.
    planned = anomaly.get("_planned_process_params") or {}
    planned_block = ""
    if planned:
        rows = "\n".join(f"    {k} = {v}" for k, v in sorted(planned.items()))
        planned_block = (
            "\n    PLANNED PROCESS PARAMETERS (this lot has NOT run; these are the\n"
            "    recipe setpoints it is scheduled with, absolute values and NOT z-scores):\n"
            f"{rows}\n")

    prompt = textwrap.dedent(f"""\
    You are an expert semiconductor yield-analysis engineer performing root-cause analysis.

    THINK STEP BY STEP:
    1. First, examine what the DEFECT PATTERN tells you about failure geometry.
    2. Then, examine what the SENSORS say — which are deviating and which are quiet.
    3. Then, examine the HISTORICAL CASES — what categories do similar past events fall into?
    4. Then, examine TELEMETRY — is any equipment parameter drifting?
    5. Finally, WEIGH all evidence and determine the most likely category.

    CRITICAL: Do NOT default to "equipment" for everything. Consider ALL six categories:
    - process: recipe/parameter issue (chamber seasoning, recipe change)
    - equipment: hardware failure (pump seal, RF matching, filter)
    - material: incoming material issue (slurry lot, vendor change, viscosity)
    - handling: mechanical handling damage (robot end-effector, cassette)
    - software: firmware/automation bug (interlock, routing, config)
    - measurement: test equipment artifact (probe card, test head calibration)

    KEY DIAGNOSTIC RULES:
    - If ALL process sensors are near zero (|z-score| < 0.5), the cause is likely
      NOT process and NOT equipment. Look at handling, software, or measurement.
    - If a sensor name contains "tester", "probe", "test_head", or "calibration",
      consider measurement artifact FIRST.
    - If a sensor name contains "route", "interlock", or "fw", consider software.
    - If the description mentions "vendor", "lot", or "incoming", consider material.
    - If handler_cycles or end_effector metrics are elevated, consider handling.

    {_CATEGORY_FEW_SHOTS}

    ## Evidence for THIS case

    Wafer defect classification: {predicted_class} (confidence={cls_confidence:.2f})
    Anomaly score: {anomaly_score:.2f}  (0=normal, 1=severe)
    {planned_block}
    Top deviating sensors: {sensors_text}

    All sensor readings:
{sensor_detail}

    Similar historical cases:
{cases_text}

    Recent equipment telemetry:
{telemetry_text}

    ## Rules you MUST follow
    1. Return ONLY valid JSON — no markdown fences, no commentary outside the JSON.
    2. Propose between 2 and 4 hypotheses, ordered by confidence (highest first).
    3. Each hypothesis MUST include:
       - "description": a concise string naming the suspected root cause.
       - "confidence": a float in [0.0, 1.0] reflecting how strongly the evidence
         supports this hypothesis.
       - "category": exactly one of: process | equipment | material | handling | software | measurement
       - "evidence_summary": MUST explicitly name the specific sensor ID, case_id,
         or telemetry parameter that supports this hypothesis.
    4. The TOP TWO hypotheses should be DIFFERENT categories when evidence permits.
    5. If the highest anomaly signal comes from a TEST-EQUIPMENT sensor rather than
       a process sensor, the top hypothesis MUST acknowledge a possible measurement
       artifact or test-equipment fault.
    6. If no process sensor shows significant deviation (|z-score| < 0.5), you must
       rank non-process causes (handling, software, measurement) above process causes.

    ## Confidence calibration — these are CEILINGS
      0.80-0.89  Multiple independent signals agree.
      0.60-0.79  Two independent signals, or one very strong signal.
      0.40-0.59  One signal only, or signals pointing in different directions.
      0.10-0.39  Weak, circumstantial, single occurrence.
    Hard caps:
    - MEASUREMENT hypothesis: max 0.70 (disputing data trustworthiness = uncertainty)
    - SINGLE EVENT hypothesis: max 0.50 (one occurrence ≠ pattern)
    - Never assign 0.90 or above.

    ## Output format (strict JSON, no extra text)
    {{
      "hypotheses": [
        {{
          "description": "<concise root cause description>",
          "confidence": <float 0.0-1.0>,
          "category": "<process|equipment|material|handling|software|measurement>",
          "evidence_summary": "<specific named evidence: sensor ID / case_id / telemetry parameter>"
        }}
      ]
    }}

    Now produce the JSON:
    """).strip()

    return prompt


def _build_playbook_prompt(top_hypothesis: dict) -> str:
    """Build the prompt for corrective-action playbook generation."""

    description = top_hypothesis.get("description", "Unknown root cause")
    confidence = top_hypothesis.get("confidence", 0.0)
    category = top_hypothesis.get("category", "process")
    evidence = top_hypothesis.get("evidence_summary", "")

    prompt = textwrap.dedent(f"""\
    You are an expert semiconductor process engineer writing a corrective-action playbook.

    ## Root-cause hypothesis
    Description      : {description}
    Category         : {category}
    Confidence       : {confidence:.2f}
    Evidence summary : {evidence}

    ## Rules
    1. Return ONLY valid JSON — no markdown fences, no commentary outside the JSON.
    2. Provide between 3 and 6 corrective actions, ordered by priority (high -> medium -> low).
    3. Each action must have:
       - "description": a concrete, actionable step (not vague advice).
       - "priority": one of "high", "medium", or "low".
    4. If confidence is below 0.5, include a "high"-priority action to verify the
       root cause before taking invasive corrective steps.
    5. If the category is "measurement", the first action must be to validate /
       recalibrate the test equipment before touching the process.
    6. If the category is "handling", do NOT recommend process recipe changes.
    7. If the category is "software", focus on firmware rollback and configuration audit.

    ## Output format (strict JSON, no extra text)
    {{
      "actions": [
        {{"description": "<concrete action>", "priority": "high|medium|low"}}
      ]
    }}

    Now produce the JSON:
    """).strip()

    return prompt


# ---------------------------------------------------------------------------
# LLM call -- Google Gemini path (primary)
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str) -> str:
    """Call Google Gemini and return the raw text response."""
    from google import genai

    api_key = get_config("GEMINI_API_KEY")
    model_id = get_config("GEMINI_MODEL_ID", "gemini-2.0-flash")

    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY is not set! Please add your key to `src/.env` or `.env`:\n"
            "    GEMINI_API_KEY=your_key_here\n"
            "    USE_MOCK_LLM=false\n"
            "Get a key at https://aistudio.google.com/apikey"
        )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config={
            "temperature": 0.15,
            "max_output_tokens": 1024,
            "response_mime_type": "application/json",
        },
    )
    return response.text


# ---------------------------------------------------------------------------
# LLM call -- watsonx.ai path (legacy fallback)
# ---------------------------------------------------------------------------

def _quiet_sdk_logging() -> None:
    """
    The watsonx SDK logs every HTTP request at INFO, which floods stderr and buries
    the harness's own output. Warnings and errors still surface.
    """
    import logging
    for name in ("ibm_watsonx_ai", "ibm_watson_machine_learning", "httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _call_watsonx(prompt: str) -> str:
    """
    Call watsonx.ai and return the raw text response.

    Uses the chat endpoint for Granite 4 models (text-generation is deprecated).
    Falls back to generate_text only if chat is unavailable, for older SDKs.
    """
    try:
        from ibm_watsonx_ai import APIClient, Credentials  # type: ignore
        from ibm_watsonx_ai.foundation_models import ModelInference  # type: ignore
        from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as Params  # type: ignore
    except ImportError:
        from ibm_watson_machine_learning import APIClient  # type: ignore
        from ibm_watson_machine_learning.foundation_models import Model as ModelInference  # type: ignore
        from ibm_watson_machine_learning.metanames import GenTextParamsMetaNames as Params  # type: ignore

    _quiet_sdk_logging()

    credentials = {
        "url": _WATSONX_URL,
        "apikey": _WATSONX_API_KEY,
    }

    generate_params = {
        Params.MAX_NEW_TOKENS: 512,
        Params.TEMPERATURE: 0.2,
        Params.STOP_SEQUENCES: ["\n\n\n"],
    }

    model = ModelInference(
        model_id=_WATSONX_MODEL_ID,
        params=generate_params,
        credentials=credentials,
        project_id=_WATSONX_PROJECT_ID,
    )

    if hasattr(model, "chat"):
        resp = model.chat(messages=[{"role": "user", "content": prompt}])
        try:
            return resp["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ValueError(f"unexpected chat response shape: {str(resp)[:200]}")
    return model.generate_text(prompt=prompt)


def _call_llm(prompt: str) -> str:
    """Route to the configured provider."""
    if _PROVIDER == "gemini":
        return _call_gemini(prompt)
    return _call_watsonx(prompt)


# ---------------------------------------------------------------------------
# Mock LLM -- deterministic, evidence-grounded canned responses
# ---------------------------------------------------------------------------

_MOCK_RANK_RESPONSES: dict[str, dict] = {
    # Keyed by predicted_class; fallback to "default"
    "Center": {
        "hypotheses": [
            {
                "description": "CMP over-polish at wafer centre due to excess slurry flow",
                "confidence": 0.82,
                "evidence_summary": (
                    "sensor_12 z-score=2.3 (high CMP pressure), "
                    "sensor_87 z-score=1.8 (platen vibration), "
                    "matched case_id=case_1a (similarity=0.91, confirmed: CMP non-uniformity)"
                ),
            },
            {
                "description": "Slurry concentration non-uniformity causing centre-focused removal rate spike",
                "confidence": 0.61,
                "evidence_summary": (
                    "sensor_45 z-score=-1.1 (slurry outlet temp drop), "
                    "planned slurry_flow_rate=0.82 (above nominal 0.75), "
                    "case_id=case_1a outcome: slurry adjustment resolved yield"
                ),
            },
            {
                "description": "Photoresist spin non-uniformity producing centre die overexposure",
                "confidence": 0.28,
                "evidence_summary": (
                    "wafer_map_pattern=Center (classifier confidence noted), "
                    "no direct sensor corroboration -- lower confidence"
                ),
            },
        ]
    },
    "Edge-Ring": {
        "hypotheses": [
            {
                "description": (
                    "RF power instability after tool PM causing edge-localised plasma density "
                    "non-uniformity and annular etch-rate deviation"
                ),
                "confidence": 0.81,
                "evidence_summary": (
                    "sensor_23 z-score=2.8 and sensor_24 z-score=2.2 (RF power sensors -- HIGHEST signals), "
                    "rf_power_w=1480 (above nominal 1350), days_since_pm=2 (RF matching network "
                    "commonly requires re-tuning in the first 1-3 days post-PM)"
                ),
            },
            {
                "description": "Edge bead removal (EBR) nozzle misalignment introduced during PM causing peripheral resist build-up",
                "confidence": 0.47,
                "evidence_summary": (
                    "sensor_23 and sensor_24 edge-zone deviations consistent with edge process change, "
                    "days_since_pm=2 (maintenance event is proximate cause), "
                    "wafer_map_pattern=Edge-Ring onset correlates with PM timestamp"
                ),
            },
            {
                "description": "Photolithography focus/dose drift at wafer edge from tool warm-up after PM downtime",
                "confidence": 0.27,
                "evidence_summary": (
                    "wafer_map_pattern=Edge-Ring, sensor_45 z-score=0.1 (minimal), "
                    "no direct illuminator sensor deviation -- lower confidence"
                ),
            },
        ]
    },
    "Scratch": {
        "hypotheses": [
            {
                "description": (
                    "Robot end-effector wear causing linear contact scratch during wafer transfer "
                    "(negative evidence: no process sensor shows deviation)"
                ),
                "confidence": 0.76,
                "evidence_summary": (
                    "NEGATIVE EVIDENCE: sensor_12=0.1, sensor_45=-0.1, sensor_87=0.0 -- "
                    "all process sensors near zero; absence of process signal is the diagnostic key. "
                    "handler_cycles_since_pm=48000 (exceeds recommended 30000 cycle PM interval), "
                    "slurry_flow_rate=0.8 nominal -- no chemical excursion possible"
                ),
            },
            {
                "description": "Wafer handling robot mis-reach causing end-of-slot mechanical contact",
                "confidence": 0.49,
                "evidence_summary": (
                    "handler_cycles_since_pm=48000 (overdue for PM), "
                    "linear scratch geometry consistent with robot arm trajectory, "
                    "no process sensor shows deviation -- mechanical cause only explanation"
                ),
            },
            {
                "description": "Foreign particle sitting on wafer chuck creating a stylus-type scratch",
                "confidence": 0.16,
                "evidence_summary": (
                    "wafer_map_pattern=Scratch (linear geometry), "
                    "no cleanroom particle sensor deviation noted -- speculative, low confidence"
                ),
            },
        ]
    },
    "Donut": {
        "hypotheses": [
            {
                "description": (
                    "Stepper lens thermal drift from ambient fab temperature swing causing "
                    "annular focus offset at intermediate die radius"
                ),
                "confidence": 0.80,
                "evidence_summary": (
                    "sensor_61 z-score=1.9 and sensor_62 z-score=2.1 (lens thermal sensors -- top deviating), "
                    "lens_temp_c=23.8 vs ambient_temp_c=22.9 (delta=0.9 C exceeds 0.5 C focus-shift threshold), "
                    "overlay_nm=6.2 (above 5 nm spec -- direct evidence of lens-induced patterning error)"
                ),
            },
            {
                "description": "Photoresist spin non-uniformity producing intermediate-radius coating thickness gradient",
                "confidence": 0.36,
                "evidence_summary": (
                    "sensor_99 z-score=1.4 (spin-bowl sensor), "
                    "donut geometry consistent with radial spin non-uniformity, "
                    "lens_temp_c deviation is stronger evidence -- this remains secondary"
                ),
            },
            {
                "description": "CMP pad wear at intermediate radius (considered less likely for this case)",
                "confidence": 0.19,
                "evidence_summary": (
                    "wafer_map_pattern=Donut could indicate CMP cause, "
                    "but no CMP-specific sensor shows deviation; lens thermal signal dominates -- low confidence"
                ),
            },
        ]
    },
    "Random": {
        "hypotheses": [
            {
                "description": (
                    "HEPA filter degradation causing elevated particle shedding -- "
                    "a LEADING INDICATOR: particle count trended up before wafer defects appeared"
                ),
                "confidence": 0.82,
                "evidence_summary": (
                    "sensor_71 z-score=2.2 and sensor_72 z-score=1.5 (particle counter sensors -- "
                    "trending up BEFORE defect density increase), "
                    "hepa_runtime_hours=31000 (exceeds recommended replacement at 20000 hours), "
                    "particle_count_per_m3=1420 (above ISO class 5 limit of 352) -- "
                    "causal sequence: filter -> particle -> random defect"
                ),
            },
            {
                "description": "Cleanroom positive-pressure integrity failure allowing ambient particle ingress",
                "confidence": 0.41,
                "evidence_summary": (
                    "sensor_71 z-score=2.2 and sensor_72 z-score=1.5 (particle sensors elevated), "
                    "particle_count_per_m3=1420 (high), "
                    "hepa_runtime_hours=31000 -- could indicate seal failure rather than filter wear"
                ),
            },
            {
                "description": "Random gate-oxide pinhole defects from electrostatic discharge (ESD)",
                "confidence": 0.18,
                "evidence_summary": (
                    "wafer_map_pattern=Random consistent with ESD, "
                    "but no ESD sensor or humidity anomaly detected; "
                    "particle signal (sensor_71, sensor_72) is stronger explanation -- low confidence"
                ),
            },
        ]
    },
    "Near-full": {
        "hypotheses": [
            {
                "description": (
                    "Test equipment measurement artifact: near-total failure pattern likely caused "
                    "by faulty test head contact, not a real wafer defect"
                ),
                "confidence": 0.67,
                "evidence_summary": (
                    "sensor_tester_01 z-score=3.1 (test-head sensor -- HIGHEST anomaly signal), "
                    "test_head_maintenance_days_ago=42 (well past recommended 21-day interval), "
                    "contact_resistance_ohm=0.95 (above spec maximum of 0.5) -- "
                    "all process sensors near zero (sensor_12=0.0, sensor_45=0.1, sensor_87=-0.1)"
                ),
            },
            {
                "description": (
                    "Wafer-level gate-oxide integrity failure from a process excursion "
                    "(considered less likely given sensor evidence)"
                ),
                "confidence": 0.21,
                "evidence_summary": (
                    "wafer_map_pattern=Near-full would be consistent with a severe process event, "
                    "but sensor_12=0.0, sensor_45=0.1, sensor_87=-0.1 show NO process deviation -- "
                    "weak evidence for process cause"
                ),
            },
            {
                "description": (
                    "Contamination event causing widespread die failure "
                    "(low confidence -- no corroborating sensor)"
                ),
                "confidence": 0.12,
                "evidence_summary": (
                    "Near-full pattern is consistent with contamination, "
                    "but no cleanroom or chemical sensor shows deviation; "
                    "sensor_tester_01 anomaly dominates -- this remains speculative"
                ),
            },
        ]
    },
    "Near-full-power": {
        "hypotheses": [
            {
                "description": (
                    "Power supply fault cascading through process tool, causing "
                    "catastrophic wafer-level gate oxide breakdown across all dies"
                ),
                "confidence": 0.84,
                "category": "equipment",
                "evidence_summary": (
                    "sensor_12 z-score=3.4 and sensor_45 z-score=3.1 indicate severe power supply drift; "
                    "Near-full pattern confirms catastrophic excursion"
                ),
            },
            {
                "description": (
                    "Upstream interlock software defect causing misrouted voltage setpoint"
                ),
                "confidence": 0.12,
                "category": "software",
                "evidence_summary": "sensor_route_mismatch=2.7 or interlock_fw_changed without hardware alarm",
            },
        ]
    },
    "default": {
        "hypotheses": [
            {
                "description": "Process excursion of undetermined type",
                "confidence": 0.40,
                "evidence_summary": (
                    "Insufficient sensor or case data to pinpoint cause; "
                    "review available sensor readings and historical cases"
                ),
            },
            {
                "description": "Test equipment or measurement system error",
                "confidence": 0.35,
                "evidence_summary": (
                    "No specific sensor named -- consider equipment calibration check "
                    "before committing to a process intervention"
                ),
            },
        ]
    },
}

_MOCK_PLAYBOOK_RESPONSES: dict[str, dict] = {
    "test equipment": {
        "actions": [
            {
                "description": (
                    "IMMEDIATELY re-test the lot on a different test head / prober to "
                    "confirm or rule out measurement artifact before any process action."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Inspect and recalibrate test head (tester_01): check contact "
                    "resistance, clean probe tips, verify continuity on known-good wafer."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Schedule test-head maintenance (last done 42 days ago, interval=21 days); "
                    "log maintenance ticket in MES."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "If re-test confirms real wafer failure, escalate to process engineering "
                    "for root-cause investigation; otherwise close as test-equipment false alarm."
                ),
                "priority": "medium",
            },
            {
                "description": "Audit contact_resistance_ohm history for tester_01 to determine when degradation began.",
                "priority": "medium",
            },
            {
                "description": (
                    "Update preventive maintenance schedule for all test heads to enforce "
                    "<=21-day interval."
                ),
                "priority": "low",
            },
        ]
    },
    "slurry": {
        "actions": [
            {
                "description": (
                    "Reduce slurry_flow_rate from 0.82 to 0.75 (nominal) on the CMP tool "
                    "and re-run a monitor wafer to confirm centre uniformity improvement."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Inspect CMP slurry distribution ring nozzle for blockage or wear "
                    "causing centre-biased delivery."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Review sensor_12 (CMP pressure) and sensor_87 (platen vibration) trends "
                    "for the past 24 hours to identify onset of anomaly."
                ),
                "priority": "medium",
            },
            {
                "description": "Hold affected lot pending CMP tool PM verification.",
                "priority": "medium",
            },
            {
                "description": (
                    "Update SPC control limits for slurry_flow_rate to trigger earlier alarm "
                    "at +/-0.05 deviation from nominal."
                ),
                "priority": "low",
            },
        ]
    },
    "mechanical": {
        "actions": [
            {
                "description": (
                    "Reduce handler_speed_mm_s from 310 to <=280 mm/s for all wafer "
                    "transfers on the affected tool immediately."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Inspect robot arm end-effector for burrs or wear points that could "
                    "cause linear contact marks during pick/place."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Verify cassette slot 12 alignment -- end-of-cassette slots are higher "
                    "risk; check slot guides for deformation."
                ),
                "priority": "medium",
            },
            {
                "description": (
                    "Run diagnostic wafer through cassette slot 12 to reproduce and "
                    "localise the scratch geometry."
                ),
                "priority": "medium",
            },
            {
                "description": "Log event in MES and trigger robot_arm_pressure SPC alarm review.",
                "priority": "low",
            },
        ]
    },
    "pad": {
        "actions": [
            {
                "description": (
                    "Replace CMP polishing pad immediately -- pad age 1450 wafers exceeds "
                    "recommended replacement interval of 1200 wafers."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Run post-pad-change uniformity monitor wafer to confirm donut-pattern "
                    "elimination before releasing production lots."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Review sensor_55 and sensor_60 (mid-radius pressure) trends to "
                    "determine how long pad degradation has been occurring."
                ),
                "priority": "medium",
            },
            {
                "description": "Add pad-age wafer count to real-time SPC dashboard with high-priority alarm at 1200 wafers.",
                "priority": "medium",
            },
            {
                "description": "Audit all lots processed since last pad change for potential donut-pattern yield impact.",
                "priority": "low",
            },
        ]
    },
    "particle": {
        "actions": [
            {
                "description": (
                    "Halt production on the affected tool and perform a full cleanroom "
                    "particle count audit; identify and remediate particle source."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Inspect HEPA/ULPA filters and cleanroom positive-pressure integrity; "
                    "verify particle count sensors sensor_102 and sensor_78 are within spec."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Tighten cleanroom_particle_count alarm threshold to 300 (ISO class 5 = 352); "
                    "current reading of 420 should have already triggered alarm."
                ),
                "priority": "medium",
            },
            {
                "description": (
                    "Check ambient_humidity_pct -- at 47% it is near the 45% ESD threshold; "
                    "adjust cleanroom humidity to 50-55% range."
                ),
                "priority": "medium",
            },
            {
                "description": "Quarantine and re-inspect lot for ESD damage on gate oxides (gate_oxide_thickness_nm=3.8 at risk).",
                "priority": "low",
            },
        ]
    },
    "rf": {
        "actions": [
            {
                "description": (
                    "Re-tune the RF matching network on the affected etch tool -- "
                    "post-PM RF instability is common in the first 1-3 days; run a match-tune recipe now."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Verify rf_power_w reading from sensor_23 and sensor_24 against generator setpoint; "
                    "check for RF reflected power spikes indicating impedance mismatch."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Run a monitor wafer through the affected tool and measure etch-rate uniformity "
                    "at the edge to confirm annular pattern is eliminated after re-tuning."
                ),
                "priority": "high",
            },
            {
                "description": "Log PM completion date and RF re-tuning event in MES; update PM checklist to include RF verification step.",
                "priority": "medium",
            },
            {
                "description": "Hold affected lot pending monitor wafer confirmation; re-test if edge-ring pattern persists.",
                "priority": "medium",
            },
            {
                "description": "Add RF power stability SPC rule: alarm if deviation > 5% from setpoint within 3 days of PM.",
                "priority": "low",
            },
        ]
    },
    "lens": {
        "actions": [
            {
                "description": (
                    "Enable stepper lens active temperature compensation -- verify HVAC zone "
                    "supplying the lithography bay is maintaining setpoint within +/-0.3 C."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Verify lens_temp_c and ambient_temp_c readings from sensor_61 and sensor_62; "
                    "confirm delta exceeds 0.5 C threshold and that overlay_nm > 5 nm spec."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Run focus-exposure matrix (FEM) on a monitor wafer to quantify the current "
                    "lens thermal offset and re-calibrate the stepper dose/focus recipe."
                ),
                "priority": "high",
            },
            {
                "description": "Inspect HVAC control loop for the lithography bay; check setpoint and PID tuning.",
                "priority": "medium",
            },
            {
                "description": "Audit overlay_nm SPC chart to identify when thermal drift began; quarantine lots processed during drift window.",
                "priority": "medium",
            },
            {
                "description": "Add real-time lens-temp alert: page process engineer if delta(lens_temp, ambient_temp) > 0.5 C.",
                "priority": "low",
            },
        ]
    },
    "hepa": {
        "actions": [
            {
                "description": (
                    "Replace HEPA filter immediately -- hepa_runtime_hours=31000 exceeds "
                    "the recommended 20000-hour replacement interval."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Halt production in the affected cleanroom bay until particle_count_per_m3 "
                    "drops below ISO class 5 limit (352 particles/m3); current reading is 1420."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Verify sensor_71 and sensor_72 particle counter readings post-replacement; "
                    "confirm downward trend before resuming production."
                ),
                "priority": "high",
            },
            {
                "description": (
                    "Audit all lots processed during the elevated particle window for defect density "
                    "impact; quarantine high-risk lots for re-inspection."
                ),
                "priority": "medium",
            },
            {
                "description": "Add HEPA runtime-hours to scheduled PM calendar with alarm at 18000 hours (10% before limit).",
                "priority": "medium",
            },
            {
                "description": "Update cleanroom particle alarm threshold to ISO class 5 limit of 352 particles/m3 -- current threshold was too high.",
                "priority": "low",
            },
        ]
    },
    "default": {
        "actions": [
            {
                "description": (
                    "Verify the root-cause hypothesis through additional measurement or "
                    "diagnostic tests before taking corrective action -- confidence is below 0.5."
                ),
                "priority": "high",
            },
            {
                "description": "Hold the affected lot and escalate to senior process engineer for review.",
                "priority": "high",
            },
            {
                "description": "Collect additional sensor data and compare against historical cases in the knowledge base.",
                "priority": "medium",
            },
            {
                "description": "Document findings and update the MES event log.",
                "priority": "low",
            },
        ]
    },
}


def _select_mock_playbook(top_hypothesis: dict) -> dict:
    """Return a mock playbook keyed by keywords in the hypothesis description."""
    description = (top_hypothesis.get("description", "") + " " +
                   top_hypothesis.get("evidence_summary", "")).lower()

    priority_keywords = [
        ("test equipment", "test equipment"),
        ("test-equipment", "test equipment"),
        ("tester", "test equipment"),
        ("measurement artifact", "test equipment"),
        # Specific equipment causes first
        ("rf power", "rf"),
        ("rf instability", "rf"),
        ("rf matching", "rf"),
        ("lens thermal", "lens"),
        ("stepper lens", "lens"),
        ("lens_temp", "lens"),
        ("hepa", "hepa"),
        ("hepa filter", "hepa"),
        # Pad/CMP
        ("pad wear", "pad"),
        ("polish pad", "pad"),
        ("pad age", "pad"),
        # Handling / mechanical
        ("end-effector", "mechanical"),
        ("end effector", "mechanical"),
        ("mechanical", "mechanical"),
        ("handling", "mechanical"),
        ("scratch", "mechanical"),
        # Particle / contamination
        ("particle", "particle"),
        ("contamination", "particle"),
        ("filter", "hepa"),
        # Slurry / CMP fallback
        ("slurry", "slurry"),
        ("cmp", "slurry"),
        ("pad", "pad"),
    ]
    for keyword, key in priority_keywords:
        if keyword in description:
            return _MOCK_PLAYBOOK_RESPONSES[key]

    return _MOCK_PLAYBOOK_RESPONSES["default"]


# ---------------------------------------------------------------------------
# JSON extraction helper
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict:
    """
    Try to parse JSON from raw LLM text.
    Handles cases where the model wraps output in markdown fences.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    # Prefer a fenced block, then fall back to the first brace-balanced object.
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.S)
    if fenced:
        return json.loads(fenced.group(1))

    start = cleaned.find("{")
    if start != -1:
        depth = 0
        for i, ch in enumerate(cleaned[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(cleaned[start:i + 1])

    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in LLM response: {text[:200]}")
    return json.loads(cleaned[start:end])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def rank_root_causes(
    classification: dict,
    anomaly: dict,
    cases: dict,
    telemetry: dict,
) -> dict:
    """
    Rank root-cause hypotheses for a wafer yield event.

    Parameters
    ----------
    classification : dict
        Output of classify_wafer_map -- {"predicted_class": str, "confidence": float}
    anomaly : dict
        Output of score_sensor_anomaly -- {"anomaly_score": float, "top_deviating_sensors": list[str]}
    cases : dict
        Output of retrieve_similar_cases -- {"cases": [...]}
    telemetry : dict
        Output of query_telemetry -- {"telemetry": [...]}

    Returns
    -------
    dict
        {"hypotheses": [{"description": str, "confidence": float, "evidence_summary": str}]}

    Contract rule (from CONTRACTS.md):
        evidence_summary MUST name a specific input (sensor, case_id, or telemetry parameter).
    """
    if _USE_MOCK:
        predicted_class = classification.get("predicted_class", "default")
        if predicted_class == "Near-full":
            named = anomaly.get("_named_deviations", {})
            if named.get("sensor_12", 0) > 2.0 or named.get("sensor_45", 0) > 2.0:
                result = _MOCK_RANK_RESPONSES["Near-full-power"]
                logger.debug("rank_root_causes: mock response for Near-full power excursion")
                return result
        result = _MOCK_RANK_RESPONSES.get(
            predicted_class, _MOCK_RANK_RESPONSES["default"]
        )
        logger.debug("rank_root_causes: mock response for class=%s", predicted_class)
        return result

    # Real LLM path
    prompt = _build_rank_prompt(classification, anomaly, cases, telemetry)
    raw = _call_llm(prompt)
    logger.debug("rank_root_causes: raw LLM response (provider=%s): %s", _PROVIDER, raw[:300])
    return _extract_json(raw)


def get_corrective_action_playbook(top_hypothesis: dict) -> dict:
    """
    Generate a corrective-action playbook for a root-cause hypothesis.

    Parameters
    ----------
    top_hypothesis : dict
        One hypothesis dict -- {"description": str, "confidence": float, "evidence_summary": str}

    Returns
    -------
    dict
        {"actions": [{"description": str, "priority": "high"|"medium"|"low"}]}
    """
    if _USE_MOCK:
        result = _select_mock_playbook(top_hypothesis)
        logger.debug(
            "get_corrective_action_playbook: mock response for hypothesis: %s",
            top_hypothesis.get("description", "")[:60],
        )
        return result

    # Real LLM path
    prompt = _build_playbook_prompt(top_hypothesis)
    raw = _call_llm(prompt)
    logger.debug("get_corrective_action_playbook: raw LLM response (provider=%s): %s", _PROVIDER, raw[:300])
    return _extract_json(raw)
