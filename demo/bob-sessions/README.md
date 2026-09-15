# Bob session transcripts — evidence that Bob is load-bearing

Raw NDJSON from two headless BobShell runs, captured with:

```bash
bob run --format stream-json --max-turns 16 --trust \
  "Lot L-4471 came back at 61% yield and the failures cluster near the wafer edge. \
   Work out what went wrong and tell me what to do about it."
```

The question was phrased as an engineer would phrase it and was never given to Bob in
advance. **Bob chose and ordered every tool call itself** — nothing here is scripted.

## `session-before-fix.ndjson` — 7 tool calls, 51.2s, 0.242 Bobcoins

Bob loaded the skill and chained the tools in the documented order. But it had **no way to
get lot data**: `classify_wafer_map` wanted an image path and `score_sensor_anomaly` wanted
a sensor dict, and nothing mapped a `lot_id` to either. So it invented them.

| Call | Argument Bob passed | Result |
|---|---|---|
| `classify_wafer_map` | `image_path: "edge"` | returned **Center** — contradicting the question |
| `score_sensor_anomaly` | `sensors: {}` | `anomaly_score: 0.0` from no data |
| `retrieve_similar_cases` | `defect_class: "Edge"` | not a valid WM-811K class |
| `rank_root_causes` | — | *"Process excursion of undetermined type"*, **confidence 0.4**, *"insufficient sensor or case data"* |

Despite that, the final answer read: *"The dominant cause is **almost certainly** the
ETCH-07 PM reassembly"* — confident prose on top of an explicitly undetermined ranking.
That is the failure mode this project exists to prevent, so it was fixed rather than
demoed.

## `session-after-fix.ndjson` — 8 tool calls, 45.9s, 0.287 Bobcoins

Two changes: a `get_lot_data` tool giving Bob an entry point from a lot_id, and two rules
in `SKILL.md` about not exceeding the tool's stated confidence and not treating an empty
input as a finding.

| Call | Argument Bob passed | Result |
|---|---|---|
| `get_lot_data` | `lot_id: "L-4471"` | wafer map ref, sensor signature, equipment |
| `classify_wafer_map` | `image_path: "case_2a.png"` | **Edge-Ring** — matches the question |
| `score_sensor_anomaly` | real signature | top deviating sensors populated |
| `retrieve_similar_cases` | `defect_class: "Edge-Ring"` | valid class, similarity 1.0 on HC-033 |
| `rank_root_causes` | — | *"RF power instability after tool PM…"*, **confidence 0.81** |

And the answer's language changed. Zero occurrences of "almost certainly", "dominant
cause", "definitely", "certainly" or "conclusive". It quotes 0.81 explicitly, presents
ranked alternatives at 0.47 and 0.27, and states *"the ranking is not a single definitive
answer."* It flags the 0.0 anomaly score as **"not a clean-process signal"** rather than as
negative evidence, and labels the classifier *"(stub model)"* unprompted.

## `session-after-anomaly-fix.ndjson` — 8 tool calls, 74.7s, 0.288 Bobcoins

Same question again, after fixing the anomaly scoring (sparse signatures were collapsing
to 0.0 because ~579 of 582 features imputed to the median).

`score_sensor_anomaly` now returns **0.1489** on a full 582-feature vector instead of 0.0,
and carries `_named_deviations` so the case's own sensors stay visible alongside the
model's raw top-deviating list.

Bob's reading of it is the interesting part:

> **Overall anomaly score 0.15 (low)** — *"Process body is unremarkable; the deviation is
> edge-localised"*

It quoted `sensor_23` at +2.8 σ and `sensor_24` at +2.2 σ from `_named_deviations` rather
than the model's raw top-deviating sensors, which is the right narrative choice — and it
did not treat a low overall score as "clean lot". Overclaim scan still zero.

## Reading the transcripts

```bash
python3 -c "
import json,sys
for l in open(sys.argv[1]):
    e=json.loads(l)
    if e.get('type')=='tool_use': print(e['tool_name'], json.dumps(e.get('parameters'))[:100])
" demo/bob-sessions/session-after-fix.ndjson
```

Event types: `message`, `tool_use`, `tool_result`, `result`. The `result` event carries
`stats` with `tool_calls`, `duration_ms` and `session_costs`.

> Note: `bob run` pre-approves every tool call, which is right for scripted capture and
> wrong for the demo video — there the visible per-call approval is the point. Record the
> video from the interactive IDE session, not from this.
