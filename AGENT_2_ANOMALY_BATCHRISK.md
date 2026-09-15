# AGENT INSTRUCTIONS — Track 2: Sensor Anomaly Detection & Batch Risk Flagging

Paste this whole file into your Bob (or coding agent) session as the task brief.

## Your role
You own `src/models/tabular/` and `requirements-tabular.txt` exclusively. Do not
create, edit, or read files outside these paths except `src/contracts/CONTRACTS.md`
and `src/eval/fixtures/*.json` (read-only reference).

## Objective
Build two functions against SECOM data:

```python
def score_sensor_anomaly(sensor_vector: dict) -> dict:
    """
    Input: {"lot_id": str, "sensors": {sensor_name: float, ...}}
    Returns: {"anomaly_score": float, "top_deviating_sensors": list[str]}  # max 5
    """

def flag_at_risk_batch(planned_parameters: dict) -> dict:
    """
    Input: {"lot_id": str, "planned_process_params": {param: float, ...}}
    Returns:
    {
      "at_risk": bool,
      "similarity_to_historical_low_yield": float,
      "matched_case_ids": list[str]
    }
    """
```

## Steps
1. Download SECOM (UCI). It has 1,567 observations, 590 sensors, only 104 labeled
   fails — a real 1:14 imbalance — and roughly 4.5% missing values spread across
   about 28 sensors. Handle missing values explicitly (document your imputation
   choice); do not silently drop rows, that throws away most of your fail cases.
2. Train an anomaly/fail detector (Isolation Forest or an autoencoder reconstruction
   error are both reasonable choices — pick one, don't build both).
3. **Report recall and precision on the fail class specifically.** Accuracy alone is
   meaningless on this imbalance — a model that predicts "pass" every time gets
   ~93% accuracy and is useless. State the actual recall/precision you achieve.
4. For `flag_at_risk_batch`: treat the SECOM fail-class sensor profile as a stand-in
   for "historically low-yield parameter profiles" (documented limitation, this is
   also flagged in the PRD — SECOM doesn't literally have "upcoming lot" data, so
   you're building a similarity score against past-fail profiles as the best
   available proxy). Score similarity of planned parameters against that profile.
5. Wrap both in `src/models/tabular/anomaly.py`.
6. Write `src/models/tabular/test_anomaly.py`: a standalone self-test that runs both
   functions against the fixtures in `src/eval/fixtures/*.json` (specifically the
   `sensor_signature` and `planned_process_params` fields) and prints results for
   all 6 case studies. Must run without the MCP server or any other track's code.
7. Add dependencies only to `requirements-tabular.txt`.

## Definition of done
- `test_anomaly.py` runs standalone against all 6 case study fixtures.
- A `NOTES.md` in your directory states: imputation method used, model type,
  measured recall/precision on the fail class (not accuracy).
- You have not touched any file outside `src/models/tabular/` and
  `requirements-tabular.txt`.

## What not to do
- Don't report accuracy as your headline metric — it will look good and mean
  nothing, and it will get caught by anyone who checks the class balance.
- Don't wait on Track 1 or Track 4 — you need SECOM and the fixtures, nothing else.
- Don't overstate `flag_at_risk_batch` as causally validated — it's a similarity
  score against a proxy dataset. Say so in `NOTES.md`.
