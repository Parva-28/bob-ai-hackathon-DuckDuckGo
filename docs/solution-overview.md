# Solution Overview

**YieldGuard** is a Bob-native assistant a process engineer talks to directly. It
classifies wafer-map defect patterns, scores sensor anomalies, retrieves precedent, ranks
probable root causes with cited evidence, recommends corrective actions, and flags upcoming
lots as at-risk before they run.

## The three things that make it non-obvious

Most "AI for defect analysis" demos are a classifier with a chat interface on top. Three
design choices separate this from that, and all three are testable — each has dedicated
sub-cases in the eval suite.

### 1. Absence of signal is treated as evidence

A Scratch-pattern defect with **no** correlated process-sensor deviation should push the
ranking toward mechanical handling, not toward a forced process explanation. Most systems
stop at the label. This one reasons about the *absence* of correlation as a positive
finding, and can cite it as such — the evidence model has an explicit `absence_of_signal`
citation type.

This is not decorative. Case Study 3's entire premise is clean sensors, and it exposed a
real structural flaw during design review: the original data model hung every hypothesis
off an anomaly score, which made an image-only, quiet-sensor diagnosis literally
unrepresentable. The schema was rebuilt around an analysis run with *optional* classification
and anomaly evidence.

### 2. The system is built to be honestly uncertain

Case 6c is constructed so the correct top hypothesis is *"this may be a test-equipment
measurement artifact, not a real wafer defect."* The wafers may be fine; the tester may be
wrong. A system optimising for confident-sounding output gets this exactly backwards and
recommends scrapping good material.

Honest uncertainty is enforced mechanically, not hoped for:

- **Measurement-category hypotheses are confidence-capped.** A claim that the measurement
  is wrong is a claim that the data is untrustworthy — you cannot be highly confident about
  a wafer whose measurement you are simultaneously disputing.
- **Competing near-equal precedents from different categories cap confidence further**, and
  the conflict is named in the evidence summary rather than smoothed over.
- **Case 3c asserts a confidence *ceiling*.** A single-occurrence mis-pick must come back
  low-confidence — a confident answer there fails the test **even when the named cause is
  correct**.

### 3. Batch risk runs before test data exists

The pre-run path is not the post-mortem path with different inputs. `classify_wafer_map`
and `score_sensor_anomaly` are **unavailable by construction** — there is no wafer map and
no test result yet. `rank_root_causes` is called with two of its four evidence inputs null
and must produce *risk drivers*, not a diagnosis of a failure that has not happened.

That asymmetry is a real design constraint, and it is why the pre-run flow has its own
sequence diagram rather than being treated as a variant of the other one.

## How it works

Two detection models feed a reasoning step that fuses their outputs with retrieved
historical cases and equipment telemetry, producing a ranked, cited root-cause list.

**Post-mortem** — *"Lot L-4471 came back at 61% yield. What happened?"*

1. `classify_wafer_map` → defect pattern + confidence
2. `score_sensor_anomaly` → anomaly score + top deviating sensors
3. `retrieve_similar_cases` → precedent with confirmed root causes
4. `query_telemetry` → tool state, as `direction` + `magnitude_sigma`
5. `rank_root_causes` → ranked hypotheses, **each citing named evidence**
6. `get_corrective_action_playbook` → specific prioritised actions
7. `submit_feedback` → the engineer's verdict returns to the case store

**Pre-run** — *"Which of tomorrow's twelve lots should I worry about?"*

1. `flag_at_risk_batch` per planned lot, on process parameters alone
2. For flagged lots only: retrieve precedent, check whether the tool they are *about* to
   run on is already drifting
3. `rank_root_causes` with `classification=null, anomaly=null`
4. Preventive actions, framed as **triage for engineer review — not a go/no-go gate**

## Key design decisions

**Bob orchestrates; the server does not chain itself.** `rank_root_causes` takes
classification, anomaly, cases and telemetry as *arguments*. Bob gathers them and passes
them in. A server that fetched its own inputs would reduce Bob to a chat skin over a fixed
pipeline — and a judge reading `src/` would see that immediately.

**The evidence-citation rule is enforced in code, not in review.** The server drops any
hypothesis with an empty `evidence_summary` and reports the dropped ids in
`rejected_uncited`. With no evidence at all it returns a warning rather than an uncited
guess. A rule enforced only by code review is a rule that fails at 2am before a deadline.

**Advisory-only, deliberately.** The brief asks for *recommended* corrective actions, and
we stop there. The run-to-run control literature shows any predictive signal injected into
a fab sits inside a provable stability region; automating a fab tool is a safety-relevant
decision no hackathon team should ship. This is engineering judgement, not a missing feature.

**Integration is automatic.** Each tool resolves to real track code at import and falls
back to a schema-valid stub if the model is absent or untrained. A teammate merging and
training makes their tool live with no server edit. `pipeline_status` reports the real/stub
split so any run can be labelled honestly.

**No vector database.** Cosine similarity over the case store in pure Python. Chroma or
Qdrant would pull a heavy dependency tree and a server process to index a few dozen
records. The search method is the seam if the case count ever justifies a real index.

## What the engineer sees

A ranked list where every line carries its evidence:

```
1. Slurry flow rate drift from a degrading slurry pump on CMP-03      conf 0.85  equipment
   evidence: matches historical case HC-018 (similarity 1.00); top deviating sensor
   sensor_12; telemetry slurry_flow_rate decreasing at -2.4 sigma on CMP-03

ACTIONS
   [high]   Verify the implicated tool parameter against its qualification limits
   [high]   Pull the tool for condition-based maintenance if out of spec
   [medium] Re-qualify with a send-ahead wafer before releasing the queue
```

And when the evidence does not support confidence, it says so instead of guessing.

See [`case-studies.md`](case-studies.md) for all 18 sub-cases and
[`lld/`](lld/README.md) for the low-level design.
