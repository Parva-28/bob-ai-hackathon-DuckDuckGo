"""
export_landing_data.py — the real numbers the landing page shows.

    python src/api/export_landing_data.py

Writes src/web/public/landing/data.json so the landing page works without the API
running, but shows nothing that was not produced by the models: five case-study
wafer maps with WaferCNN's own prediction for each, and lot L-4471's analysis as
the pipeline returns it (anomaly from the LAM 9600 trace, retrieved case, top
hypothesis and its evidence check). Re-run it after any model change.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.argv = sys.argv[:1]
sys.path.insert(0, str(HERE))
import main  # noqa: E402  (sets up the MCP adapters exactly as the API does)

OUT = HERE.parent / "web" / "public" / "landing" / "data.json"
WAFERS = ["case_2a", "case_3a", "case_1a", "case_4a", "case_5a"]
MAPS = HERE.parent / "mcp_server" / "data" / "wafer_maps"


def wafer(case: str) -> dict:
    g = np.load(MAPS / f"{case}.npy").astype(np.uint8)
    r = main.adapters.real_classify_wafer_array(g, return_probs=True)
    return {"case_id": case, "grid": g.astype(int).tolist(), "predicted_class": r["predicted_class"],
            "confidence": r["confidence"], "dies": int((g > 0).sum()), "failed": int((g == 2).sum())}


def main_():
    a = main.analyse("L-4471")
    an, top = a["anomaly"], a["ranked"]["hypotheses"][0]
    case = a["cases"]["cases"][0]
    data = {
        "wafers": [wafer(c) for c in WAFERS],
        "lot": {
            "lot_id": "L-4471",
            "final_yield_pct": a["lot"].get("final_yield_pct"),
            "equipment_ids": a["lot"].get("equipment_ids"),
            "classification": {k: a["classification"][k] for k in ("predicted_class", "confidence")},
            "anomaly": {"score": an["anomaly_score"], "alarm": an.get("alarm"),
                        "scored_on": an.get("_scored_on"),
                        "deviations": dict(list((an.get("_named_deviations") or {}).items())[:3])},
            "case": {k: case[k] for k in ("case_id", "similarity", "confirmed_root_cause", "equipment_id")},
            "hypothesis": {"title": top["description"], "confidence": top["confidence"],
                           "evidence_check": top["evidence_check"]},
            "tool_calls": len(a["steps"]),
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data))
    print("->", OUT, f"{OUT.stat().st_size // 1024} KB")
    for w in data["wafers"]:
        print(f"  {w['case_id']}: {w['predicted_class']} {w['confidence']}  ({w['failed']}/{w['dies']} failed)")
    print("  L-4471:", data["lot"]["anomaly"], data["lot"]["case"]["case_id"],
          data["lot"]["hypothesis"]["evidence_check"]["summary"])


if __name__ == "__main__":
    main_()
