---
name: yieldguard
description: Use when analysing semiconductor wafer yield - diagnosing why a lot failed, identifying defect patterns, ranking root causes, recommending corrective actions, or flagging upcoming lots as at-risk before they run. Triggers on wafer, lot, yield, defect, wafer map, excursion, root cause, CMP, etch, litho, scratch, edge-ring, or at-risk batch.
---

# YieldGuard — wafer yield root cause analysis

You orchestrate the `yieldguard` MCP server. **You** decide which tools to call and in
what order, and **you** carry each tool's result into the next. The server does not
chain its own tools.

## Two workflows

### Post-mortem — "why did lot X fail?"
A wafer map and test results exist.

1. `classify_wafer_map` — the defect pattern
2. `score_sensor_anomaly` — the sensor signature
3. `retrieve_similar_cases` — precedent, using the class and signature from 1 and 2
4. `query_telemetry` — tool state for the equipment named in the retrieved cases
5. `rank_root_causes` — **pass the results of 1–4 in as arguments**
6. `get_corrective_action_playbook` — on the top hypothesis
7. `submit_feedback` — when the engineer confirms or rejects, using `hypothesis_id`

Steps 1 and 2 are independent; either order is fine.

### Pre-run — "which upcoming lots are at risk?"
No wafer map and no test data exist yet, so steps 1 and 2 **do not apply**.

1. `flag_at_risk_batch` per planned lot
2. For flagged lots only: `retrieve_similar_cases` + `query_telemetry`
3. `rank_root_causes` with `classification=null, anomaly=null` — this yields pre-run
   risk drivers, not a diagnosis of a failure that has not happened
4. `get_corrective_action_playbook(..., preventive=true)`

## Rules

- **Every hypothesis must cite named evidence** — a sensor, a `case_id`, or a telemetry
  parameter. The server strips uncited hypotheses; if it returns a `warning`, report that
  there was insufficient evidence rather than filling the gap yourself.
- **A low anomaly score is evidence, not an absence of it.** Quiet process sensors on a
  Scratch pattern point *toward* mechanical handling. Do not manufacture a process cause.
- **Do not flatten a distributed ranking into one answer.** If the top hypothesis is at
  0.55 with two live alternatives, present it that way.
- **Confidence values are relative rankings, not calibrated probabilities.** Never present
  them as the latter.
- **`at_risk` is a triage signal for engineer review, not a go/no-go gate.**
- When a measurement-path cause ranks first, say plainly that the wafers may be fine and
  the lot should be held and retested, not scrapped.
- Call `pipeline_status` when asked what is real: it reports which tools are backed by
  trained models and which are still schema-valid stubs. Report that honestly.

## Data provenance

Historical cases are **constructed** from the WM-811K defect taxonomy and documented fab
failure modes — they are not disclosed fab incidents. SECOM and WM-811K are separate,
unrelated datasets, so any wafer-map/sensor pairing is a constructed pairing. State this
if asked where the data comes from.
