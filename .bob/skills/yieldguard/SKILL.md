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

0. **`get_lot_data` — ALWAYS FIRST when the question names a lot.** It returns the
   `wafer_map_ref`, `sensor_signature`, `equipment_ids` and planned parameters that every
   other tool needs. **Never invent an image path or a sensor dict.** If it returns an
   error, say the lot is unknown and list the ones that exist — do not substitute a guess.
1. `classify_wafer_map` — pass `wafer_map_ref` from step 0
2. `score_sensor_anomaly` — pass `sensor_signature` from step 0
3. `retrieve_similar_cases` — precedent, using the class and signature from 1 and 2
4. `query_telemetry` — tool state for the equipment named in the retrieved cases
5. `rank_root_causes` — **pass the results of 1–4 in as arguments**
6. `get_corrective_action_playbook` — on the top hypothesis
7. `submit_feedback` — when the engineer confirms or rejects, using `hypothesis_id`

Steps 1 and 2 are independent; either order is fine.

### Pre-run — "which upcoming lots are at risk?"
No wafer map and no test data exist yet, so steps 1 and 2 **do not apply**.

0. `get_lot_data` for each named lot, to get its planned parameters
1. `flag_at_risk_batch` per planned lot
2. For flagged lots only: `retrieve_similar_cases` + `query_telemetry`
3. `rank_root_causes` with `classification=null, anomaly=null` — this yields pre-run
   risk drivers, not a diagnosis of a failure that has not happened
4. `get_corrective_action_playbook(..., preventive=true)`

## Rules

- **Never claim more confidence than `rank_root_causes` returned.** If it returns 0.4 and
  "undetermined", your answer says the cause is undetermined at low confidence. Do not
  write "almost certainly", "the dominant cause is", or a single bolded conclusion on top
  of a low-confidence or uncited ranking. Report the number the tool gave you.
- **An empty or missing input is a data gap, not a finding.** `anomaly_score: 0.0` from an
  empty `sensors` dict means *no sensor data was supplied* — it does not mean the sensors
  were clean, and it must never be reported as negative evidence. Say the data is missing
  and what it would take to get it.
- **Do not fill gaps from the tool descriptions, the skill text, or the case store.**
  Historical cases are precedent to cite, not evidence about *this* lot. If the tools
  returned little, the honest answer is short.
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

## Data provenance — two kinds of entity, not equally evidenced

Every entity you receive carries a `data_provenance` block. Read it and honour it.

**`measured` — CMP runs (`get_cmp_run`, `predict_removal_rate`).**
PHM 2016 CMP: the process traces and the removal-rate outcome were recorded on the
*same wafer* in the same polish run. A sensor-to-outcome claim is evidenced here. You may
say process conditions predict removal rate, and quote the conformal interval.

**`constructed` — demo lots (`get_lot_data`, L-3310 … L-5540).**
SECOM sensor readings and WM-811K wafer maps come from different fabs and different
wafers. Each component is real and each model is genuinely trained on real data, but *we*
paired them. So:

- You **may** say the defect classification is real (a trained CNN on a real map), the
  anomaly score is real, and the reasoning chain is a faithful demonstration.
- You **may not** say this sensor deviation *caused* that defect pattern. They were never
  measured on the same wafer. No causal claim survives the join.
- You **may not** derive a yield-impact or cost figure from the pairing.

If asked to compare the two, say it plainly: the CMP result is evidence, the lot analysis
is a demonstration. Do not present them with equal authority.

## Pre-run lots and precedents

For a **planned** lot there is no wafer map and no measurement — the recipe is the
evidence. Pass its `planned_process_params` to `rank_root_causes` (as
`_planned_process_params` inside the anomaly argument). Without them the only inputs are
telemetry and precedents, and a parameter sitting in plain sight in the recipe becomes
unreachable.

`retrieve_similar_cases` may return `_no_precedent: true` and an empty list. That means
**no historical case resembles this lot** — it is a finding, not an empty slot to fill.
Do not cite a case, and do not name equipment that appears only in the case store. Reason
from this lot's own sensors and telemetry, or say the evidence is insufficient.

This matters because the failure it prevents actually happened: a LITHO lot was handed
three CMP-03 precedents at similarity 0.0, and the ranking blamed CMP slurry flow on a
tool the lot never ran on.

## Intervals

`predict_removal_rate` returns an interval, and the interval is the answer — the point
estimate is secondary. Two fields differ and the difference matters:

- `excursion_likely` — the point estimate is outside the control limits.
- `excursion_possible` — the **interval** crosses a limit, so an excursion cannot be
  ruled out.

Report `excursion_possible`. On our held-out split a point estimate caught 34.7% of real
excursions; the interval caught 93.9%. A run can be `excursion_likely: false` and
`excursion_possible: true`, and that run needs review.

**`predict_removal_rate` may refuse.** If the response has `abstained: true` there is no
interval and no prediction in it. Say the system declined and give the `reason` and any
`novel_variables`. Do **not** substitute an estimate of your own, and do not fall back to
another tool to manufacture a number — the refusal is the answer, and the correct advice
is to measure the run rather than predict it.

Refusal is a designed behaviour, not a failure. It fires when two structurally different
models disagree by more than the process tolerance, or when the input is unlike anything
in training. On our held-out split the runs it declined had 1.76x the error of the runs it
kept, including the single worst prediction in the set.

If `coverage_caveat` is set, pass it on. It means the prediction landed in the band where
measured conditional coverage was 84.0% against a 90% target, so the interval is weaker
than its nominal level right where the decision is being made.

Historical cases are constructed from the WM-811K taxonomy and documented fab failure
modes — they are not disclosed fab incidents.
