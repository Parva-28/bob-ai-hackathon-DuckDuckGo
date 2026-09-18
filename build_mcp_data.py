"""
build_mcp_data.py — Generate src/mcp_server/data/{cases.json, telemetry.json, lots.json, wafer_maps/*.npy}
"""

import json
from pathlib import Path
import numpy as np

DATA_DIR = Path(__file__).parent / "src" / "mcp_server" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
MAPS_DIR = DATA_DIR / "wafer_maps"
MAPS_DIR.mkdir(parents=True, exist_ok=True)

# ── 1. cases.json ─────────────────────────────────────────────────────────────
CASES = [
    {
        "case_id": "HC-018",
        "defect_class": "Center",
        "confirmed_root_cause": "Slurry flow rate drift from a degrading slurry pump on CMP-03",
        "outcome": "Pump seal replaced; yield recovered to 94% within 2 lots",
        "category": "equipment",
        "equipment_id": "CMP-03",
        "sensor_signature": {"sensor_12": -2.4, "sensor_45": -1.9, "sensor_87": 0.2},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-021",
        "defect_class": "Center",
        "confirmed_root_cause": "Polishing pad used past qualified life; calendar PM had not yet triggered",
        "outcome": "Pad replaced; PM policy moved to condition-based",
        "category": "equipment",
        "equipment_id": "CMP-03",
        "sensor_signature": {"sensor_12": -1.8, "sensor_45": -2.1},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-024",
        "defect_class": "Center",
        "confirmed_root_cause": "Incoming slurry vendor lot with out-of-spec viscosity",
        "outcome": "Vendor lot quarantined; incoming QC gate added",
        "category": "material",
        "equipment_id": "CMP-03",
        "sensor_signature": {"sensor_12": -0.4, "sensor_45": -0.3},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-033",
        "defect_class": "Edge-Ring",
        "confirmed_root_cause": "RF power edge effect following chamber PM reassembly",
        "outcome": "RF match network retuned",
        "category": "equipment",
        "equipment_id": "ETCH-07",
        "sensor_signature": {"sensor_23": 2.8, "sensor_24": 2.2, "sensor_45": 0.1},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-035",
        "defect_class": "Edge-Ring",
        "confirmed_root_cause": "Partially clogged edge gas nozzle causing flow distribution imbalance",
        "outcome": "Nozzle cleaned; flow symmetry restored",
        "category": "equipment",
        "equipment_id": "ETCH-07",
        "sensor_signature": {"sensor_23": 2.1, "sensor_24": 1.9, "sensor_31": -2.3},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-038",
        "defect_class": "Edge-Ring",
        "confirmed_root_cause": "Chamber wall seasoning drift after another product line changed the recipe on a shared tool",
        "outcome": "Seasoning requalified; shared-tool recipe change notification added",
        "category": "process",
        "equipment_id": "ETCH-07",
        "sensor_signature": {"sensor_23": 1.4, "sensor_24": 1.1, "sensor_32": 1.9},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-042",
        "defect_class": "Scratch",
        "confirmed_root_cause": "Wafer-handling robot end-effector wear causing positional misalignment not detectable by process sensors",
        "outcome": "End-effector replaced and recalibrated",
        "category": "handling",
        "equipment_id": "HANDLER-01",
        "sensor_signature": {"sensor_12": 0.0, "sensor_45": 0.0, "sensor_87": 0.0},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-051",
        "defect_class": "Donut",
        "confirmed_root_cause": "Stepper lens thermal drift causing overlay radial trend",
        "outcome": "Thermal control loop retuned; chiller serviced",
        "category": "equipment",
        "equipment_id": "LITHO-02",
        "sensor_signature": {"sensor_61": 2.4, "sensor_62": 2.1, "sensor_63": 1.8},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-061",
        "defect_class": "Random",
        "confirmed_root_cause": "HEPA filter degradation leading to increased particle contamination",
        "outcome": "HEPA filters replaced across bay B12; particle counts normalized",
        "category": "equipment",
        "equipment_id": "FILTER-B12",
        "sensor_signature": {"sensor_71": 2.2, "sensor_72": 1.5, "sensor_12": 0.2},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-063",
        "defect_class": "Random",
        "confirmed_root_cause": "Chamber seal wear generating particles only during long runs",
        "outcome": "Chamber seals replaced on preventative schedule",
        "category": "equipment",
        "equipment_id": "CMP-03",
        "sensor_signature": {"sensor_73": 1.9, "sensor_74": 1.6, "sensor_12": 0.1},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-071",
        "defect_class": "Near-full",
        "confirmed_root_cause": "Power supply fault cascading through the CMP process step",
        "outcome": "Supply replaced; 3 lots scrapped",
        "category": "equipment",
        "equipment_id": "CMP-03",
        "sensor_signature": {"sensor_12": 3.4, "sensor_45": 3.1, "sensor_87": 2.9, "sensor_tester_01": 0.2},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-074",
        "defect_class": "Near-full",
        "confirmed_root_cause": "Equipment interlock software bug misrouted otherwise-good wafers",
        "outcome": "Interlock firmware patched; lots reworked, not scrapped",
        "category": "software",
        "equipment_id": "HANDLER-01",
        "sensor_signature": {"sensor_12": 0.3, "sensor_45": 0.2, "sensor_87": 0.1, "sensor_route_mismatch": 2.7},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-077",
        "defect_class": "Near-full",
        "confirmed_root_cause": "Parametric test head miscalibration produced false failure readings - wafers were within spec",
        "outcome": "Test head recalibrated; lots retested and released",
        "category": "measurement",
        "equipment_id": "TESTER-04",
        "sensor_signature": {"sensor_tester_01": 3.1, "sensor_12": 0.0, "sensor_45": 0.1, "sensor_87": -0.1},
        "provenance": "constructed"
    },
    {
        "case_id": "HC-079",
        "defect_class": "Near-full",
        "confirmed_root_cause": "Probe card contact resistance drift causing systematic false fails",
        "outcome": "Probe card cleaned; retest passed",
        "category": "measurement",
        "equipment_id": "TESTER-04",
        "sensor_signature": {"sensor_tester_01": 2.9, "sensor_12": 0.0, "sensor_45": 0.0, "sensor_87": 0.0},
        "provenance": "constructed"
    }
]

(DATA_DIR / "cases.json").write_text(json.dumps({"cases": CASES}, indent=2), encoding="utf-8")


# ── 2. telemetry.json ─────────────────────────────────────────────────────────
TELEMETRY = {
    "equipment": {
        "CMP-03": {
            "tool_type": "CMP",
            "chamber_id": "CH-1",
            "is_shared_tool": False,
            "is_metrology": False,
            "days_since_pm": 12,
            "parameters": [
                {
                    "parameter": "slurry_flow_rate",
                    "direction": "decreasing",
                    "magnitude_sigma": -2.4,
                    "recent_trend": "declining steadily over the last 6 lots"
                },
                {
                    "parameter": "pad_life_pct",
                    "direction": "increasing",
                    "magnitude_sigma": 1.1,
                    "recent_trend": "approaching qualified life limit"
                },
                {
                    "parameter": "head_pressure_psi",
                    "direction": "stable",
                    "magnitude_sigma": 0.1,
                    "recent_trend": "nominal"
                }
            ]
        },
        "ETCH-07": {
            "tool_type": "Etch",
            "chamber_id": "CH-2",
            "is_shared_tool": True,
            "is_metrology": False,
            "days_since_pm": 2,
            "parameters": [
                {
                    "parameter": "rf_power_w",
                    "direction": "oscillating",
                    "magnitude_sigma": 2.8,
                    "recent_trend": "edge ringing since the PM 2 days ago"
                },
                {
                    "parameter": "gas_flow_sccm",
                    "direction": "decreasing",
                    "magnitude_sigma": -2.1,
                    "recent_trend": "edge zone below setpoint"
                },
                {
                    "parameter": "chamber_seasoning_idx",
                    "direction": "increasing",
                    "magnitude_sigma": 1.9,
                    "recent_trend": "drifting since a shared-tool recipe change"
                }
            ]
        },
        "FILTER-B12": {
            "tool_type": "Facility",
            "chamber_id": "BAY-B12",
            "is_shared_tool": True,
            "is_metrology": False,
            "days_since_pm": 180,
            "parameters": [
                {
                    "parameter": "particle_count_per_m3",
                    "direction": "increasing",
                    "magnitude_sigma": 2.3,
                    "recent_trend": "rising 3 days AHEAD of the wafer defect trend - leading indicator"
                },
                {
                    "parameter": "hepa_runtime_hours",
                    "direction": "increasing",
                    "magnitude_sigma": 2.0,
                    "recent_trend": "31k hours, past the 28k replacement guideline"
                }
            ]
        },
        "HANDLER-01": {
            "tool_type": "Handler",
            "chamber_id": "ARM-1",
            "is_shared_tool": False,
            "is_metrology": False,
            "days_since_pm": 45,
            "parameters": [
                {
                    "parameter": "end_effector_cycles",
                    "direction": "increasing",
                    "magnitude_sigma": 2.2,
                    "recent_trend": "48k cycles, past 40k wear guideline"
                },
                {
                    "parameter": "process_sensor_correlation",
                    "direction": "stable",
                    "magnitude_sigma": 0.0,
                    "recent_trend": "no process sensor correlation detected"
                }
            ]
        },
        "LITHO-02": {
            "tool_type": "Litho",
            "chamber_id": "STEP-1",
            "is_shared_tool": False,
            "is_metrology": False,
            "days_since_pm": 8,
            "parameters": [
                {
                    "parameter": "lens_temp_c",
                    "direction": "increasing",
                    "magnitude_sigma": 2.0,
                    "recent_trend": "tracking ambient fab temperature swings"
                },
                {
                    "parameter": "overlay_nm",
                    "direction": "increasing",
                    "magnitude_sigma": 1.8,
                    "recent_trend": "radial trend growing at mid-radius"
                },
                {
                    "parameter": "firmware_version",
                    "direction": "stable",
                    "magnitude_sigma": 0.0,
                    "recent_trend": "updated 4 days ago, unchanged since"
                }
            ]
        },
        "TESTER-04": {
            "tool_type": "Tester",
            "chamber_id": "HEAD-4",
            "is_shared_tool": False,
            "is_metrology": True,
            "days_since_pm": 42,
            "parameters": [
                {
                    "parameter": "test_head_calibration_drift",
                    "direction": "increasing",
                    "magnitude_sigma": 3.1,
                    "recent_trend": "drifting since last calibration 42 days ago"
                },
                {
                    "parameter": "contact_resistance_ohm",
                    "direction": "increasing",
                    "magnitude_sigma": 2.3,
                    "recent_trend": "rising across all probe channels"
                },
                {
                    "parameter": "process_sensor_correlation",
                    "direction": "stable",
                    "magnitude_sigma": 0.1,
                    "recent_trend": "process sensors quiet - deviation is confined to the measurement path"
                }
            ]
        }
    }
}

(DATA_DIR / "telemetry.json").write_text(json.dumps(TELEMETRY, indent=2), encoding="utf-8")


# ── 3. lots.json ──────────────────────────────────────────────────────────────
LOTS = {
    "L-4471": {
        "lot_id": "L-4471",
        "case_id": "case_2a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "tested",
        "equipment_ids": ["ETCH-07", "CMP-03"],
        "final_yield_pct": 61.0
    },
    "L-4402": {
        "lot_id": "L-4402",
        "case_id": "case_1a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "tested",
        "equipment_ids": ["CMP-03"],
        "final_yield_pct": 68.5
    },
    "L-4418": {
        "lot_id": "L-4418",
        "case_id": "case_1b",
        "product_id": "P-MEM-1A",
        "fab_line": "FAB1-B",
        "status": "tested",
        "equipment_ids": ["CMP-03"],
        "final_yield_pct": 72.0
    },
    "L-3310": {
        "lot_id": "L-3310",
        "case_id": "case_3a",
        "product_id": "P-LOGIC-5N",
        "fab_line": "FAB2-B",
        "status": "tested",
        "equipment_ids": ["HANDLER-01"],
        "final_yield_pct": 54.0
    },
    "L-4815": {
        "lot_id": "L-4815",
        "case_id": "case_4a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "tested",
        "equipment_ids": ["LITHO-02"],
        "final_yield_pct": 64.0
    },
    "L-5120": {
        "lot_id": "L-5120",
        "case_id": "case_5a",
        "product_id": "P-MEM-1A",
        "fab_line": "FAB1-A",
        "status": "tested",
        "equipment_ids": ["FILTER-B12"],
        "final_yield_pct": 78.0
    },
    "L-5502": {
        "lot_id": "L-5502",
        "case_id": "case_6a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "tested",
        "equipment_ids": ["CMP-03"],
        "final_yield_pct": 12.0
    },
    "L-5540": {
        "lot_id": "L-5540",
        "case_id": "case_6c",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "tested",
        "equipment_ids": ["TESTER-04"],
        "final_yield_pct": 8.0
    },
    # Planned lots
    "L-4502": {
        "lot_id": "L-4502",
        "case_id": "case_1a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "planned",
        "equipment_ids": ["CMP-03"],
        "scheduled_start": "2026-09-19T08:00:00Z"
    },
    "L-4507": {
        "lot_id": "L-4507",
        "case_id": "case_5a",
        "product_id": "P-MEM-1A",
        "fab_line": "FAB1-A",
        "status": "planned",
        "equipment_ids": ["FILTER-B12"],
        "scheduled_start": "2026-09-19T10:30:00Z"
    },
    "L-4511": {
        "lot_id": "L-4511",
        "case_id": "case_2a",
        "product_id": "P-LOGIC-3N",
        "fab_line": "FAB2-A",
        "status": "planned",
        "equipment_ids": ["ETCH-07"],
        "scheduled_start": "2026-09-19T13:00:00Z"
    },
    "L-4515": {
        "lot_id": "L-4515",
        "case_id": "case_3a",
        "product_id": "P-LOGIC-5N",
        "fab_line": "FAB2-B",
        "status": "planned",
        "equipment_ids": ["HANDLER-01"],
        "scheduled_start": "2026-09-19T15:30:00Z"
    }
}

# Add entries for all 18 case IDs directly so case_id queries also work
for num in range(1, 7):
    for sub in ['a', 'b', 'c']:
        cid = f"case_{num}{sub}"
        if cid not in LOTS:
            LOTS[cid] = {
                "lot_id": cid,
                "case_id": cid,
                "product_id": "P-LOGIC-3N",
                "fab_line": "FAB2-A",
                "status": "tested",
                "equipment_ids": ["CMP-03" if num in (1,5) else ("ETCH-07" if num == 2 else ("HANDLER-01" if num == 3 else ("LITHO-02" if num == 4 else "TESTER-04")))],
                "final_yield_pct": 65.0
            }

(DATA_DIR / "lots.json").write_text(json.dumps({"lots": LOTS}, indent=2), encoding="utf-8")


# ── 4. wafer_maps/*.npy ───────────────────────────────────────────────────────
def make_wafer_map(pattern: str, size: int = 64) -> np.ndarray:
    m = np.ones((size, size), dtype=np.uint8)  # 1 = pass
    cx, cy = size // 2, size // 2
    r_wafer = size // 2 - 2

    # Circular wafer mask: 0 = outside wafer
    for y in range(size):
        for x in range(size):
            if (x - cx) ** 2 + (y - cy) ** 2 > r_wafer ** 2:
                m[y, x] = 0

    if pattern == "Center":
        r = size // 8
        for y in range(size):
            for x in range(size):
                if m[y, x] != 0 and (x - cx) ** 2 + (y - cy) ** 2 < r ** 2:
                    m[y, x] = 2
    elif pattern == "Edge-Ring":
        r_in, r_out = int(size * 0.38), int(size * 0.46)
        for y in range(size):
            for x in range(size):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if m[y, x] != 0 and r_in <= d <= r_out:
                    m[y, x] = 2
    elif pattern == "Scratch":
        for i in range(12, 52):
            for w in range(-1, 2):
                y = int(10 + (i - 12) * 0.8) + w
                x = i
                if 0 <= y < size and 0 <= x < size and m[y, x] != 0:
                    m[y, x] = 2
    elif pattern == "Donut":
        r_in, r_out = size // 6, size // 3
        for y in range(size):
            for x in range(size):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if m[y, x] != 0 and r_in <= d <= r_out:
                    m[y, x] = 2
    elif pattern == "Random":
        rng = np.random.default_rng(42)
        for y in range(size):
            for x in range(size):
                if m[y, x] != 0 and rng.random() < 0.12:
                    m[y, x] = 2
    elif pattern == "Near-full":
        rng = np.random.default_rng(42)
        for y in range(size):
            for x in range(size):
                if m[y, x] != 0 and rng.random() < 0.88:
                    m[y, x] = 2

    return m

patterns = {
    1: "Center",
    2: "Edge-Ring",
    3: "Scratch",
    4: "Donut",
    5: "Random",
    6: "Near-full"
}

for num in range(1, 7):
    for sub in ['a', 'b', 'c']:
        cid = f"case_{num}{sub}"
        pat = patterns[num]
        arr = make_wafer_map(pat)
        np.save(MAPS_DIR / f"{cid}.npy", arr)

print(f"Successfully generated MCP data in {DATA_DIR}")
