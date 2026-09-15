"""
param_map.py — bridge physical process-parameter names into SECOM feature space.

Why this exists
---------------
Bob and the fixtures speak physics: `slurry_flow_rate`, `hepa_runtime_hours`,
`overlay_nm`. Track 2's batch-risk model compares against SECOM, whose 582
features are anonymised (`sensor_0` .. `sensor_581`). The two vocabularies share
no keys, so every planned-parameter dict imputed to the training median and
scored 0.4288 — precisely the "uninformative median profile" baseline Track 2
documents — which meant FR-8 never fired on any lot, including the ones built to
be at-risk.

What this is, honestly
----------------------
SECOM's features are anonymised by the dataset's own authors. **No true physical
mapping exists and none can be recovered.** This table is an explicitly
constructed correspondence for demonstration, in exactly the same category as the
wafer-map/sensor pairings described in the PRD: it lets the real model machinery
run end-to-end on physically-named inputs, and it is not a claim that
`sensor_103` is a slurry flow meter.

What is NOT invented: the target features. Each physical parameter is mapped onto
one of the features that genuinely separate SECOM's fail class from its pass
class, ranked by |fail centroid - pass centroid| in scaled space (sensor_103
+0.693, sensor_510 +0.578, sensor_59 +0.506, ...). And the scoring is untouched —
cosine similarity against the real fail centroid, with Track 2's own 0.45
threshold.

How a value is converted
------------------------
Each parameter carries a nominal, a tolerance, and the sign of the deviation that
indicates trouble:

    z = (value - nominal) / tolerance,  then oriented so that a
    trouble-direction deviation pushes TOWARD the fail centroid.

A parameter sitting at nominal contributes ~0 and therefore does not drag the lot
toward the fail profile. Unmapped parameters are dropped rather than guessed at,
and reported in `_unmapped` so a caller can see what was ignored.
"""

from __future__ import annotations

# param -> (secom_feature, nominal, tolerance, trouble_sign)
#   trouble_sign = +1 when a HIGHER value is the worrying direction, -1 when LOWER is.
PARAM_MAP: dict[str, tuple[str, float, float, int]] = {
    # --- CMP (Case Study 1) ---
    "slurry_flow_rate":            ("sensor_103", 0.80,    0.08,   -1),
    "pad_life_pct":                ("sensor_510", 0.50,    0.25,   +1),
    "head_pressure_psi":           ("sensor_59",  5.00,    0.50,   +1),
    "slurry_lot_age_days":         ("sensor_348", 30.0,    15.0,   -1),
    # --- Etch (Case Study 2) ---
    "rf_power_w":                  ("sensor_129", 1500.0,  25.0,   -1),
    "gas_flow_sccm":               ("sensor_431", 220.0,   15.0,   -1),
    "days_since_pm":               ("sensor_64",  30.0,    20.0,   -1),
    "chamber_shared":              ("sensor_21",  0.0,     1.0,    +1),
    # --- Handling (Case Study 3) ---
    "handler_cycles_since_pm":     ("sensor_430", 20000.0, 12000.0, +1),
    "cassette_slot":               ("sensor_434", 12.0,    6.0,    +1),
    "operator_assisted":           ("sensor_100", 0.0,     1.0,    +1),
    # --- Litho (Case Study 4) ---
    "lens_temp_c":                 ("sensor_125", 23.0,    0.4,    -1),
    "ambient_temp_c":              ("sensor_21",  22.0,    0.6,    +1),
    "overlay_nm":                  ("sensor_348", 4.0,     1.5,    +1),
    "reticle_swaps_24h":           ("sensor_430", 0.0,     1.0,    +1),
    "firmware_version_changed":    ("sensor_100", 0.0,     1.0,    +1),
    # --- Contamination (Case Study 5) ---
    "particle_count_per_m3":       ("sensor_103", 800.0,   250.0,  +1),
    "hepa_runtime_hours":          ("sensor_510", 20000.0, 5000.0, +1),
    "chamber_seal_age_days":       ("sensor_59",  180.0,   120.0,  +1),
    "run_length_min":              ("sensor_129", 120.0,   45.0,   +1),
    "unscheduled_entry_hours_ago": ("sensor_431", 72.0,    36.0,   -1),
    # --- Catastrophic / software / measurement (Case Study 6) ---
    "supply_voltage_v":            ("sensor_64",  220.0,   10.0,   -1),
    "interlock_fw_changed":        ("sensor_21",  0.0,     1.0,    +1),
    "route_deviation_steps":       ("sensor_434", 0.0,     1.0,    +1),
    "test_head_maintenance_days_ago": ("sensor_348", 14.0,  14.0,  +1),
    "contact_resistance_ohm":      ("sensor_125", 0.50,    0.20,   +1),
}

# Sign of each target feature's fail-class deviation, measured from SECOM training
# data (fail centroid minus pass centroid, scaled space). A "trouble" deviation is
# steered to match this so it moves the lot toward the fail centroid rather than
# away from it.
_FAIL_DIRECTION: dict[str, int] = {
    "sensor_103": +1, "sensor_510": +1, "sensor_59": +1, "sensor_348": +1,
    "sensor_129": +1, "sensor_431": +1, "sensor_64": +1, "sensor_21": +1,
    "sensor_125": -1, "sensor_430": +1, "sensor_434": +1, "sensor_100": +1,
}

Z_CLAMP = 3.0


def to_secom_space(planned: dict[str, float]) -> tuple[dict[str, float], list[str]]:
    """
    Translate physically-named planned parameters into SECOM feature space.

    Keys already in SECOM space (`sensor_N`) pass through untouched, so a caller
    may mix the two. Returns (secom_params, unmapped_keys).

    Where two parameters map to the same feature, the larger-magnitude deviation
    wins — a lot is as at-risk as its worst parameter, not the average of them.
    """
    out: dict[str, float] = {}
    unmapped: list[str] = []

    for key, raw in (planned or {}).items():
        if key.startswith("sensor_"):
            out[key] = float(raw)
            continue
        spec = PARAM_MAP.get(key)
        if spec is None:
            unmapped.append(key)
            continue
        feature, nominal, tol, trouble_sign = spec
        try:
            value = float(raw)
        except (TypeError, ValueError):
            unmapped.append(key)
            continue
        if tol == 0:
            continue
        z = (value - nominal) / tol
        # Orient: positive means "deviating in the worrying direction".
        severity = z * trouble_sign
        # Steer onto the feature's own fail direction.
        contribution = severity * _FAIL_DIRECTION.get(feature, +1)
        contribution = max(-Z_CLAMP, min(Z_CLAMP, contribution))
        if abs(contribution) > abs(out.get(feature, 0.0)):
            out[feature] = round(contribution, 4)

    return out, unmapped


# ── sensor signature: sigma space -> SECOM raw space ──────────────────────────

def sigma_to_secom_raw(signature: dict[str, float],
                       means: dict[str, float],
                       scales: dict[str, float]) -> tuple[dict[str, float], list[str]]:
    """
    Convert a sensor signature expressed in SIGMA (standard deviations from normal)
    into the raw units SECOM's scaler expects.

    Everything else in this system speaks sigma: the fixtures say `sensor_12: -2.4`
    meaning "2.4 standard deviations low", the telemetry returns `magnitude_sigma`,
    and the evidence summaries read "sensor_12 at -2.4 sigma". The anomaly model
    expects raw instrument readings and standardises them itself.

    Passing sigma where raw is expected does not merely lose signal, it manufactures
    noise. sensor_45 has mean 136.7 and scale 7.9, so a signature value of 0.1 -
    intended as "essentially nominal" - standardises to **-17.3 sigma**, the most
    extreme value in the vector. Meanwhile sensor_23 (mean -3799, scale 1398) turned
    2.8 into +2.7 sigma by luck. The resulting vector is arbitrary.

    raw = mean + z * scale  inverts the scaler exactly, so standardising the result
    returns the z the caller meant.

    Unknown sensor names are dropped and returned, rather than silently imputed to a
    median that would read as "measured and normal".
    """
    out: dict[str, float] = {}
    unknown: list[str] = []
    for name, z in (signature or {}).items():
        if name not in means or name not in scales:
            unknown.append(name)
            continue
        try:
            out[name] = float(means[name]) + float(z) * float(scales[name])
        except (TypeError, ValueError):
            unknown.append(name)
    return out, unknown
