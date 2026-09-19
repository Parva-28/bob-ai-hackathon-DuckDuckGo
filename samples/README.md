# Upload samples — live tool calling on unseen data

Two wafers plus their sensor vectors, for demonstrating the tool chain on data
supplied at request time rather than replayed from a fixture.

| file | what it is |
|---|---|
| `wafer_defect.npy` + `sensors_defect.json` | Edge-Ring defect, RF sensors deviating |
| `wafer_clean.npy` + `sensors_clean.json` | nominal wafer, every channel quiet |

Both maps are **real WM-811K wafers**, taken as the class medoid — the most
typical member of the class, not a flattering outlier. They are not drawings. A
hand-drawn ring would be a picture of a defect rather than a defect, and the
point of the demo is that the classifier is reading real silicon.

## Run it

```bash
curl -X POST http://127.0.0.1:8787/api/analyze-upload \
  -F "wafer_map=@samples/wafer_defect.npy" \
  -F 'sensors={"sensor_23":2.8,"sensor_24":2.2,"sensor_45":0.1}' \
  -F "equipment_ids=ETCH-07" \
  -F "sample_id=SAMPLE-DEFECT-001"
```

The response carries a `trace` — one entry per tool, with what it returned:

```
classify_wafer_map(64x64 uploaded map) -> Edge-Ring (0.9998)
score_sensor_anomaly(3 sensors)        -> anomaly_score=0.1489
retrieve_similar_cases(Edge-Ring)      -> 3 case(s), top HC-033 (similarity 1.0)
query_telemetry(ETCH-07)               -> 3 trace(s)
rank_root_causes(4 evidence inputs)    -> 2 hypothesis(es), top=equipment
get_corrective_action_playbook         -> 4 action(s)
```

Every line is a real call on the uploaded array. No fixture is consulted, and the
endpoint reports `data_provenance.kind = "uploaded"`.

## The clean sample is the more interesting one

Run it with no `equipment_ids` and the chain reports, correctly:

```
classify_wafer_map -> None (0.9686)        no defect pattern
score_sensor_anomaly -> 0.0004             sensors quiet
retrieve_similar_cases -> 0 case(s)        NO PRECEDENT
```

Three independent signals all saying *nothing is wrong* — including the
no-precedent finding, which the system states rather than padding with the
nearest unrelated case.

**Then `rank_root_causes` still returns three hypotheses, the top at 0.65.**

That is a real limitation and worth saying out loud. The reasoning layer always
produces a ranking; it has no abstention gate, and its confidence is an ordinal
signal (`confidence_basis: "llm_uncalibrated"`) under policy ceilings, not a
calibrated probability.

Where we did solve it is the CMP conformal layer — `predict_removal_rate`
returns `abstained: true` with a reason and no interval when two structurally
different models disagree beyond the process tolerance, and on the held-out split
the runs it declined carried 1.76x the error of the runs it kept. Extending that
gate to lot reasoning is the honest next step, not something already shipped.

## Making your own

Any 2-D `.npy`, values `0` untested / `1` pass / `2` fail, any resolution — it is
resized to 64x64 with nearest-neighbour, which preserves the categorical pixel
meaning. Sensors are z-scores keyed by SECOM channel name.
