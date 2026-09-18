"""
provenance.py — one place that states where every number comes from.

The project now serves two kinds of entity and they are NOT equally evidenced.
Presenting them with the same authority is the single most misleading thing this
system could do, so provenance travels with the data rather than living in a
README nobody reads at demo time.

CONSTRUCTED — the SECOM/WM-811K lots (L-3310 … L-5540)
    SECOM sensor readings and WM-811K wafer maps come from different fabs and
    different wafers. Each component is real and each model is genuinely trained
    on real data, but the JOIN is ours: we paired a sensor row with a defect map
    and called it one lot. Nothing downstream can establish that this sensor
    drift caused that defect pattern, because they were never measured together.

MEASURED — the PHM 2016 CMP runs
    Process traces and the removal-rate outcome are recorded on the SAME wafer,
    in the same tool, in the same run. The causal link is measured. This is the
    only place in the project where a sensor-to-outcome claim is evidenced.

Keep both: the constructed lots carry the vision classifier (macro-F1 0.9232 on
9,357 real maps) and the root-cause reasoning demo, which CMP cannot because it
has no wafer maps. Just never let a reader mistake one for the other.
"""

from __future__ import annotations

CONSTRUCTED = {
    "kind": "constructed",
    "join": "fabricated",
    "summary": "Sensor signature and wafer map are real data from two UNRELATED "
               "datasets, paired by us. This lot was never a physical lot.",
    "components": {
        "sensor_signature": "SECOM (UCI id=179) — real readings, anonymised channels",
        "wafer_map": "WM-811K / LSWMD — a real wafer map",
        "pairing": "CONSTRUCTED BY US. The sensors and the map describe different "
                   "wafers in different fabs.",
    },
    "valid_claims": [
        "The defect pattern classification is real: a trained CNN on a real map.",
        "The anomaly score is real: a trained detector on a real sensor vector.",
        "The reasoning chain is a faithful demonstration of how evidence is fused.",
    ],
    "invalid_claims": [
        "That this sensor deviation CAUSED this defect pattern. The two were never "
        "measured on the same wafer, so no causal claim survives here.",
        "Any yield-impact or cost figure derived from the pairing.",
    ],
}

MEASURED = {
    "kind": "measured",
    "join": "native",
    "summary": "Process traces and the removal-rate outcome are recorded on the same "
               "wafer in the same polish run. The sensor-to-outcome link is measured.",
    "components": {
        "process_trace": "PHM 2016 CMP Data Challenge (Seagate / Siemens) — per-run "
                         "time series of pressures, slurry flows, rotations, and "
                         "consumable wear counters",
        "outcome": "AVG_REMOVAL_RATE measured on that same wafer and stage",
        "pairing": "NATIVE TO THE DATASET. Nothing joined by us.",
    },
    "valid_claims": [
        "Process conditions predict removal rate, with conformal intervals whose "
        "coverage is measured (94.0% empirical at a 90% target).",
        "Excursion detection sensitivity: 34.7% point vs 93.9% interval.",
    ],
    "invalid_claims": [
        "Comparison to the PHM 2016 leaderboard. The competition's val/test labels "
        "were never released, so our figures are on our own grouped split.",
        "That R² 0.94 beats published virtual metrology. Easier target, and a "
        "closer train/test distribution than deployment would face.",
    ],
}

DATASETS = [
    {"name": "PHM 2016 CMP Data Challenge", "role": "process -> outcome prediction",
     "provenance": "measured", "n": 2006,
     "note": "Sensors and outcome on the same wafers. Used by predict_removal_rate."},
    {"name": "WM-811K (LSWMD)", "role": "spatial defect classification",
     "provenance": "measured", "n": 811457,
     "note": "Real maps, real labels. Used standalone by classify_wafer_map — the "
             "classifier itself involves no constructed pairing."},
    {"name": "SECOM (UCI id=179)", "role": "imbalanced anomaly detection",
     "provenance": "measured", "n": 1567,
     "note": "Real readings, anonymised channels, no fault labels — so it can "
             "validate detection but not root-cause attribution."},
    {"name": "YieldGuard demo lots", "role": "end-to-end reasoning demo",
     "provenance": "constructed", "n": 12,
     "note": "SECOM rows paired with WM-811K maps BY US. Each component is real; "
             "the join is not. Retained because CMP has no wafer maps and so "
             "cannot carry the vision or root-cause demo."},
]


def summary() -> dict:
    """The honest one-call picture, for pipeline_status and /api/transparency."""
    return {
        "datasets": DATASETS,
        "rule": "Entities carry a data_provenance block. 'measured' means the "
                "sensor-to-outcome link exists in the source data. 'constructed' "
                "means we joined unrelated real datasets and no causal claim "
                "survives the join.",
        "measured_entities": ["cmp_run"],
        "constructed_entities": ["lot"],
    }
