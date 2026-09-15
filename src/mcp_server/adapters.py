"""
adapters.py — resolve each tool implementation to real track code, else a stub.

Why this exists
---------------
TEAM_SPLIT_OVERVIEW plans a Sync 2 where the lead swaps stubs for real code one
tool at a time. Doing that by editing the server means an edit (and a possible
merge conflict) per swap, under time pressure, on the day.

Instead each tool resolves itself at import: try the real track function, fall
back to a schema-valid stub if it is absent or its model is untrained. Sync 2
then happens by a teammate merging their branch and training their model - no
server edit at all - and `describe_pipeline()` reports which mode each tool is in
so the eval harness can label results honestly instead of quietly scoring stubs.

Stubs derive their answers from the nearest eval fixture, so a stubbed pipeline
is coherent end-to-end rather than random - you can demo and test the wiring
before any model exists.
"""

from __future__ import annotations

import json
from pathlib import Path

from stores import cosine_similarity

_FIXTURES = Path(__file__).resolve().parents[1] / "eval" / "fixtures"

MODE: dict[str, str] = {}   # tool name -> "real" | "stub"


def _load_fixtures() -> list[dict]:
    if not _FIXTURES.is_dir():
        return []
    return [json.loads(p.read_text()) for p in sorted(_FIXTURES.glob("case_*.json"))]


FIXTURES = _load_fixtures()


def nearest_fixture(
    vector: dict[str, float],
    field: str = "sensor_signature",
    floor: float = 0.30,
) -> dict | None:
    """
    Closest fixture by cosine similarity on `field` - the stubs' source of truth.

    `field` matters: planned_process_params and sensor_signature use disjoint key
    spaces ("slurry_flow_rate" vs "sensor_12"), so comparing a planned-parameter
    vector against sensor signatures scores 0.0 against every fixture and max()
    then returns whichever happens to be first. That silently made the pre-run
    flag inherit the first fixture's verdict for every lot.

    Returns None below `floor` rather than the least-bad match: "nothing resembles
    this" is a real answer and the caller must be able to see it.
    """
    if not FIXTURES:
        return None
    best, best_sim = None, 0.0
    for f in FIXTURES:
        sim = cosine_similarity(vector, f.get(field, {}))
        if sim > best_sim:
            best, best_sim = f, sim
    return best if best_sim >= floor else None


def fixture_by_pattern(pattern: str) -> dict | None:
    return next((f for f in FIXTURES if f.get("wafer_map_pattern") == pattern), None)


def _try(tool: str, importer):
    """Resolve a real implementation, recording the mode. None => caller stubs."""
    try:
        fn = importer()
    except Exception:
        MODE[tool] = "stub"
        return None
    MODE[tool] = "real"
    return fn


def _import_classify():
    import sys
    root = str(Path(__file__).resolve().parents[2])
    if root not in sys.path:
        sys.path.insert(0, root)
    from src.models.vision.classifier import classify_wafer_map  # noqa
    # Touch the model so an untrained checkpoint downgrades us to stub now,
    # rather than throwing mid-demo on the first real call.
    from src.models.vision import classifier as _c
    _c._get_model()
    return classify_wafer_map


def _import_tabular(name: str):
    def _imp():
        import sys
        root = str(Path(__file__).resolve().parents[2])
        if root not in sys.path:
            sys.path.insert(0, root)
        import importlib
        mod = importlib.import_module("src.models.tabular.anomaly")
        mod._load_artifacts()
        return getattr(mod, name)
    return _imp


def _import_reasoning(name: str):
    def _imp():
        import sys
        root = str(Path(__file__).resolve().parents[2])
        if root not in sys.path:
            sys.path.insert(0, root)
        import importlib
        mod = importlib.import_module("src.reasoning.reasoner")
        return getattr(mod, name)
    return _imp


real_classify_wafer_map = _try("classify_wafer_map", _import_classify)
real_score_sensor_anomaly = _try("score_sensor_anomaly", _import_tabular("score_sensor_anomaly"))
real_flag_at_risk_batch = _try("flag_at_risk_batch", _import_tabular("flag_at_risk_batch"))
real_rank_root_causes = _try("rank_root_causes", _import_reasoning("rank_root_causes"))
real_playbook = _try("get_corrective_action_playbook", _import_reasoning("get_corrective_action_playbook"))

# Track 3 owns these outright - always real.
MODE["retrieve_similar_cases"] = "real"
MODE["query_telemetry"] = "real"
MODE["submit_feedback"] = "real"


def describe_pipeline() -> dict:
    return {
        "tools": dict(sorted(MODE.items())),
        "real_count": sum(1 for v in MODE.values() if v == "real"),
        "stub_count": sum(1 for v in MODE.values() if v == "stub"),
    }
