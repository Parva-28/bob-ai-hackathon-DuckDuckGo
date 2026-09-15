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

MODE: dict[str, str] = {}     # tool name -> "real" | "stub"
REASON: dict[str, str] = {}   # tool name -> why it fell back to a stub


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


def _try(tool: str, importer, probe=None):
    """
    Resolve a real implementation, recording the mode. None => caller stubs.

    `probe` is a sample input the function is actually CALLED with before being
    accepted. Importing cleanly is not enough: Track 2's `_load_artifacts()`
    assigns the model global before it loads its preprocessing artifacts and
    short-circuits on `if _model is not None`, so the first call raises and the
    SECOND returns successfully having loaded nothing. Without a probe call this
    layer reported a tool as "real" that would then fail on first use - the exact
    failure mode it exists to prevent.

    Probes must be cheap and side-effect free. Tools whose probe would cost a
    watsonx.ai call are accepted on import alone.
    """
    try:
        fn = importer()
        if probe is not None:
            fn(*probe)
    except Exception as e:
        MODE[tool] = "stub"
        REASON[tool] = f"{type(e).__name__}: {e}"
        return None
    MODE[tool] = "real"
    return fn


def _import_classify():
    import sys
    root = str(Path(__file__).resolve().parents[2])
    if root not in sys.path:
        sys.path.insert(0, root)

    # Track 1's classifier.py and train.py use implicit top-level imports
    # (`from model import ...`), which only resolve when run from inside their own
    # directory - so `import src.models.vision` raises ModuleNotFoundError and the
    # tool falls back to a stub even once a checkpoint exists.
    #
    # Fixed here rather than in their files: the integration brief says to fix the
    # call site rather than ask a track to change its internals under time
    # pressure. Putting their package directory on sys.path lets `model` resolve as
    # a top-level module. The proper fix is a relative import on their side
    # (`from .model import ...`) - raised with Track 1; this keeps the pipeline
    # working either way.
    vision_dir = str(Path(root) / "src" / "models" / "vision")
    if vision_dir not in sys.path:
        sys.path.append(vision_dir)

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


# Track 4 shipped the module as `reasoning.py`; CONTRACTS.md A6 asked for
# `reasoner.py`. Accepting both is a two-line change here versus a rename plus a
# re-test on their side, so the adapter adapts - which is its job.
_REASONING_MODULES = ("src.reasoning.reasoning", "src.reasoning.reasoner")


def _import_reasoning(name: str):
    def _imp():
        import sys
        root = str(Path(__file__).resolve().parents[2])
        if root not in sys.path:
            sys.path.insert(0, root)
        import importlib
        last = None
        for modname in _REASONING_MODULES:
            try:
                mod = importlib.import_module(modname)
            except Exception as e:
                last = e
                continue
            if hasattr(mod, name):
                return getattr(mod, name)
            last = AttributeError(f"{modname} has no {name}")
        raise last or ModuleNotFoundError("no reasoning module found")
    return _imp


real_classify_wafer_map = _try("classify_wafer_map", _import_classify)
real_score_sensor_anomaly = _try(
    "score_sensor_anomaly", _import_tabular("score_sensor_anomaly"),
    probe=({"lot_id": "_probe", "sensors": {"sensor_12": 0.0}},))
real_flag_at_risk_batch = _try(
    "flag_at_risk_batch", _import_tabular("flag_at_risk_batch"),
    probe=({"lot_id": "_probe", "planned_process_params": {"slurry_flow_rate": 0.8}},))
# No probe on the reasoning tools: a probe call could spend live watsonx.ai tokens.
real_rank_root_causes = _try("rank_root_causes", _import_reasoning("rank_root_causes"))
real_playbook = _try("get_corrective_action_playbook",
                     _import_reasoning("get_corrective_action_playbook"))

# Track 3 owns these outright - always real.
MODE["retrieve_similar_cases"] = "real"
MODE["query_telemetry"] = "real"
MODE["submit_feedback"] = "real"


def reasoning_mode() -> str:
    """
    "mock" | "live" | "none".

    Matters for evaluation: in mock mode the reasoning layer returns canned
    responses keyed by defect pattern, so every sub-case of a case study gets an
    identical answer. Asserting sub-case-level wording against that tests the
    mock, not the system - so the harness needs to know which mode it is in.
    """
    if not real_rank_root_causes:
        return "none"
    try:
        import importlib
        for modname in _REASONING_MODULES:
            try:
                mod = importlib.import_module(modname)
            except Exception:
                continue
            if hasattr(mod, "_USE_MOCK"):
                return "mock" if mod._USE_MOCK else "live"
    except Exception:
        pass
    return "live"


def describe_pipeline() -> dict:
    return {
        "reasoning_mode": reasoning_mode(),
        "tools": dict(sorted(MODE.items())),
        "real_count": sum(1 for v in MODE.values() if v == "real"),
        "stub_count": sum(1 for v in MODE.values() if v == "stub"),
        "stub_reasons": dict(sorted(REASON.items())),
    }
