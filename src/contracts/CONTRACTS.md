# CONTRACTS.md — Frozen Interfaces (do not change mid-build)

These are the exact input/output shapes every track builds against. If a shape
needs to change, that's a lead decision made explicitly and announced to all
tracks — never a silent edit by whoever hits the limitation first.

## Directory structure (each path owned by exactly one track)

```
src/
  contracts/          # owned by lead, read-only to everyone else after kickoff
  eval/
    fixtures/         # owned by lead at kickoff (case studies), then Track 5
  models/
    vision/           # Track 1 — exclusive
    tabular/          # Track 2 — exclusive
  reasoning/          # Track 4 — exclusive
  mcp-server/         # Track 3 (lead) — exclusive
  bob-config/         # Track 3 (lead) — exclusive
docs/                 # Track 5 — exclusive
demo/                 # Track 5 — exclusive
presentation/         # Track 5 — exclusive
README.md             # lead only, at integration points
submission.yaml       # lead only
requirements.txt      # Track 1 owns
requirements.txt     # Track 2 owns
requirements.txt         # Track 3 owns
requirements.txt   # Track 4 owns
requirements-eval.txt        # Track 5 owns
requirements.txt             # lead merges all of the above at integration
```

## Tool contracts (each is a Python function signature + JSON shape)

### `classify_wafer_map` — Track 1 implements
```python
def classify_wafer_map(image_path: str) -> dict:
    """
    Returns:
    {
      "predicted_class": str,   # one of: Center, Donut, Edge-Loc, Edge-Ring,
                                 # Local, Random, Scratch, Near-full, None
      "confidence": float       # 0.0–1.0
    }
    """
```

### `score_sensor_anomaly` — Track 2 implements
```python
def score_sensor_anomaly(sensor_vector: dict) -> dict:
    """
    Input: {"lot_id": str, "sensors": {sensor_name: float, ...}}
    Returns:
    {
      "anomaly_score": float,               # 0.0–1.0
      "top_deviating_sensors": list[str]    # max 5, most deviant first
    }
    """
```

### `flag_at_risk_batch` — Track 2 implements
```python
def flag_at_risk_batch(planned_parameters: dict) -> dict:
    """
    Input: {"lot_id": str, "planned_process_params": {param: float, ...}}
    Returns:
    {
      "at_risk": bool,
      "similarity_to_historical_low_yield": float,  # 0.0–1.0
      "matched_case_ids": list[str]
    }
    """
```

### `retrieve_similar_cases` — Track 3 (lead) implements, backed by vector store
```python
def retrieve_similar_cases(defect_class: str, sensor_signature: dict, top_k: int = 5) -> dict:
    """
    Returns:
    { "cases": [
        {"case_id": str, "similarity": float, "confirmed_root_cause": str, "outcome": str}
      ]
    }
    """
```

### `query_telemetry` — Track 3 (lead) implements, simulated SECS/GEM
```python
def query_telemetry(equipment_ids: list[str], time_window: str) -> dict:
    """
    Returns:
    { "telemetry": [
        {"equipment_id": str, "parameter": str, "recent_trend": str}
      ]
    }
    """
```

### `rank_root_causes` — Track 4 implements, watsonx.ai-backed
```python
def rank_root_causes(classification: dict, anomaly: dict, cases: dict, telemetry: dict) -> dict:
    """
    Returns:
    { "hypotheses": [
        {"description": str, "confidence": float, "evidence_summary": str}
      ]
    }
    Rule: evidence_summary MUST name a specific input (a sensor, a case_id, or a
    telemetry parameter) it draws on. A hypothesis without a named evidence source
    fails review.
    """
```

### `get_corrective_action_playbook` — Track 4 implements, watsonx.ai-backed
```python
def get_corrective_action_playbook(top_hypothesis: dict) -> dict:
    """
    Returns:
    { "actions": [ {"description": str, "priority": str} ] }  # priority: high/medium/low
    """
```

### `submit_feedback` — Track 3 (lead) implements
```python
def submit_feedback(hypothesis_id: str, verdict: str, notes: str = "") -> dict:
    """
    verdict: "confirmed" | "rejected"
    Returns: {"status": "ok"}
    """
```

## Fixture format (in `src/eval/fixtures/case_N.json`)

Every case study from the blueprint doc becomes:
```json
{
  "case_id": "case_1a",
  "wafer_map_pattern": "Center",
  "sensor_signature": { "sensor_12": 2.3, "sensor_45": -1.1 },
  "planned_process_params": { "slurry_flow_rate": 0.82 },
  "expected_hypothesis_contains": "slurry",
  "notes": "Constructed scenario, not a real fab incident — see docs/problem-statement.md."
}
```
Tracks 1, 2, and 4 each read these fixtures for their own self-tests; nobody needs
the other tracks' code running to do this.

---

# AMENDMENTS — Track 3, applied at MCP-server build

Three of these fix contracts that could not be implemented as frozen. **All are
additive**: every field the original contract specified still returns with its
original name and meaning, so Tracks 1, 2 and 4 need no code change.

### A1. `rank_root_causes` — `hypothesis_id` is minted by the MCP server

The frozen contract returned no id, but `submit_feedback(hypothesis_id, ...)` requires
one and the ER model has it as a PK — so FR-10 was unimplementable. The server now mints
`hypothesis_id` (and `rank`) when the tool returns.

**Track 4 does not need to emit ids.** Keep `rank_root_causes` a stateless function
returning `{"hypotheses":[{"description","confidence","evidence_summary"}]}`. An optional
`category` field (one of `process | equipment | material | handling | software |
measurement`) is now read if present and is what the eval fixtures assert on — adding it
is recommended, not required.

The server **drops any hypothesis whose `evidence_summary` is empty** and reports the ids
it dropped in `rejected_uncited`. The citation rule is enforced in code, not review.

### A2. `query_telemetry` — structured trend fields added

Now returns, per parameter:

```python
{"equipment_id": str, "tool_type": str, "parameter": str,
 "direction": "increasing" | "decreasing" | "stable" | "oscillating",
 "magnitude_sigma": float,
 "recent_trend": str,      # unchanged, still the human-readable form
 "time_window": str}
```

Free text alone could not be asserted on by the eval harness or cited precisely as
evidence. An unknown `equipment_id` returns a row carrying an `error` key rather than
being silently omitted — "no drift" and "no such tool" must be distinguishable.
The response also carries `equipment_meta` (`is_shared_tool`, `is_metrology`,
`days_since_pm`), which Cases 2c, 4b and 6c need.

### A3. `HISTORICAL_CASE.case_id` is one shared ID space

`flag_at_risk_batch.matched_case_ids` (Track 2) and `retrieve_similar_cases.case_id`
(Track 3) now refer to the same records, seeded from `src/mcp_server/data/cases.json`
(`HC-018`, `HC-021`, …). Track 2 should return ids from that file so a ranked report can
cross-cite them. Previously these were separate namespaces and the evidence trail broke
silently.

### A4. Fixture schema extended (`src/eval/fixtures/case_*.json`, 18 sub-cases)

Original keys are unchanged. Added:

| Key | Purpose |
|---|---|
| `expected_hypothesis_matches_any` | list of acceptable substrings, not one |
| `expected_in_top_k` | the right answer may legitimately rank 2nd or 3rd (Case 6b) |
| `expected_category` | asserts the *kind* of cause, not just wording |
| `max_confidence_ceiling` | asserts the system was appropriately **un**confident (3c, 6c) |
| `require_evidence_citation` | every hypothesis names a source |
| `expected_at_risk` | pre-run flag must fire (1a, 5a) |
| `expected_anomaly_low` | negative-evidence cases (3a, 3b, 3c) |

A single `expected_hypothesis_contains` substring could not express Case 6c (correct
answer may rank 2nd) or Case 3c (must be low-confidence), i.e. the two cases the pitch
depends on.

### A5. Directory and path corrections

- `src/mcp-server/` → **`src/mcp_server/`** (a hyphen is not importable in Python).
- `src/bob-config/` → **`.bob/`** at repo root. Bob reads `.bob/mcp.json`,
  `.bob/skills/<name>/SKILL.md` and `.bob/custom_modes.yaml`; it never looks in `src/`.
  Adding top-level directories is explicitly permitted by the submission template.

### A6. Integration is automatic — there is no manual stub swap

`src/mcp_server/adapters.py` resolves each tool to real track code at import, falling
back to a stub if the module is missing or its model is untrained. Sync 2 therefore
happens when a teammate merges and trains — **no server edit, no merge conflict**.

To make your track go live, just satisfy the import:

| Tool | Module the server imports | Also needs |
|---|---|---|
| `classify_wafer_map` | `src.models.vision.classifier` | trained `checkpoints/best_model.pt` |
| `score_sensor_anomaly`, `flag_at_risk_batch` | `src.models.tabular.anomaly` | trained `checkpoints/isolation_forest.pkl` |
| `rank_root_causes`, `get_corrective_action_playbook` | **`src.reasoning.reasoner`** | — |

**Track 4: name your module `src/reasoning/reasoner.py`** and export those two functions.

Call the `pipeline_status` tool at any time to see which tools are real and which are
stubs. Report that honestly in the demo rather than implying everything is trained.

> **Known blocker for Track 1:** `src/models/vision/classifier.py` uses `from model import
> ...` and `train.py` uses `from model import` / `from data_prep import`. These are
> implicit top-level imports, so `import src.models.vision` raises
> `ModuleNotFoundError: No module named 'model'` and the adapter falls back to a stub even
> once a checkpoint exists. Fix: make them relative (`from .model import ...`). Track 2 is
> already clean.
