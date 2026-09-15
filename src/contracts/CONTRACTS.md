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
requirements-vision.txt      # Track 1 owns
requirements-tabular.txt     # Track 2 owns
requirements-mcp.txt         # Track 3 owns
requirements-reasoning.txt   # Track 4 owns
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
  "notes": "Constructed scenario, not a real fab incident — see PRD Section 9/15."
}
```
Tracks 1, 2, and 4 each read these fixtures for their own self-tests; nobody needs
the other tracks' code running to do this.
