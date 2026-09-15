# Demo Video Script — 4:00 target (5:00 hard cap)

The submission guide requires the video show **the application running, not slides**, and
walk at least one key feature end-to-end. Audio narration strongly recommended.

**Record in one take against a live Bob session.** Do not screen-record a rehearsed
transcript — the judged claim is that Bob *chooses* the tools, and that only reads as true
if the question is phrased naturally and the tool calls appear live.

Before recording: run `.venv/bin/python src/eval/run_eval.py` once to confirm the pipeline
is healthy, and check `pipeline_status` so you can state the real/stub split accurately.

---

## 0:00–0:30 — The problem

> "At 3nm, a one percent yield drop costs a fab tens of millions a month. When yield falls,
> the cause is hidden across thousands of sensors, hundreds of process steps and defect
> images in three different systems. Engineers correlate that by hand — it takes days to
> weeks. And nobody flags the lots that are *about* to fail, because you only start looking
> after test comes back."

Screen: the problem slide, or the repo. Keep it to 30 seconds — the demo is the evidence.

## 0:30–1:00 — Start the application

Show the server coming up and Bob connecting. On screen:

```
.venv/bin/python src/mcp_server/test_stdio.py
```

> "This is the YieldGuard MCP server. Bob connects to it over stdio and gets nine tools."

Then switch to Bob with the `yieldguard` server toggled on, tools visible.

**Screenshot 1** — `01-bob-tools-connected.png`

## 1:00–2:00 — Case 1a: the clean win

Type into Bob, in your own words — **do not paste a script**:

> *"Lot L-4471 came back at 61% yield. The failures cluster at the centre of the wafer.
> What happened, and what should I do about it?"*

Narrate what is actually happening on screen:

> "Bob is choosing the tools here — I haven't told it which to call. It classifies the
> wafer map, scores the sensor vector, pulls similar historical cases, then checks the
> telemetry on the tool those cases point at. Then it passes all four results *into* the
> reasoning tool. Bob is doing the orchestration; the server just exposes capabilities."

Land on the output and read one evidence line aloud:

> "Slurry flow rate drift on CMP-03, confidence 0.85. And critically — every hypothesis
> cites its source. Historical case HC-018, sensor_12, telemetry showing slurry flow
> decreasing at minus 2.4 sigma. That's the difference between a ranked list and a
> justified one."

**Screenshot 2** — `02-ranked-root-causes-with-evidence.png`

## 2:00–2:45 — The pre-run half

> *"Which of tomorrow's lots should I be worried about?"*

> "This is the half of the problem that usually gets skipped, because it's harder to demo.
> There's no wafer map here and no test data — these lots haven't run. So the classifier
> and the anomaly detector don't apply at all. It scores the *planned* process parameters
> against historically low-yield profiles."

> "Two of these resemble the profile that preceded case HC-018 — and the tool they're
> scheduled on is already drifting. This is a triage signal for an engineer, not an
> automated go/no-go gate. We're deliberately advisory-only."

**Screenshot 3** — `03-pre-run-at-risk-lots.png`

## 2:45–3:30 — Case 6c: the honest one

> *"Lot L-5502 just came back with almost every die failing. Is this a process excursion?"*

Let the answer land, then narrate the important part:

> "Watch what it does *not* do. Nearly every die failed, so the obvious answer is a
> catastrophic process excursion. But the anomaly is concentrated on the test head — the
> process sensors are quiet. So the top hypothesis is that the *tester* is miscalibrated
> and the wafers may actually be fine. Hold and retest, don't scrap."

> "And the confidence is capped at 0.7, not 0.85. That's deliberate: a claim that the
> measurement is wrong is a claim the data is untrustworthy. You can't be highly confident
> about a wafer whose measurement you're disputing. A system tuned to sound confident gets
> this exactly backwards and scraps good material."

This is the strongest 45 seconds in the submission. Do not rush it.

## 3:30–4:00 — Limits, then architecture

Say the limitations out loud — do not bury them on a slide:

> "Honestly: SECOM and WM-811K are separate public datasets, so any case pairing a wafer map
> with a sensor signature is constructed, not a real joined record. The telemetry is
> simulated. Confidence values are relative rankings, not calibrated probabilities. And
> right now [N] of nine tools are backed by trained models — the tool tells you which."

Close on the architecture diagram:

> "Bob orchestrates, calling MCP tools. watsonx.ai with Granite does the reasoning behind
> those tools. Everything runs locally."

---

## Checklist before you upload

- [ ] Under 5:00, ideally ~4:00
- [ ] Application visibly **running** — not a slideshow
- [ ] Questions phrased naturally, not pasted
- [ ] Tool calls visible on screen as Bob makes them
- [ ] At least one evidence citation read aloud
- [ ] Limitations stated in audio, not just on a slide
- [ ] Real/stub split stated accurately — check `pipeline_status` first
- [ ] 3 screenshots captured from this same run
- [ ] Link sharing set to "anyone with the link"
- [ ] URL pasted into `demo/demo-video-link.txt`
