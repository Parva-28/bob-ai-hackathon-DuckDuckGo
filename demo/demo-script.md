# Demo Video Script — 3:00

Spoken word count ≈ 430. Read it at a normal pace, don't rush. The cap is 5:00, so 3:00
leaves room — better a tight three than a padded five.

**Two windows, side by side.** Left: BobShell (or the Bob IDE terminal). Right: the analyst
console at `http://127.0.0.1:8787`. The console is what a camera can follow; Bob is what is
being judged. You need both on screen.

**Before you record**

```bash
.venv/bin/python src/dashboard/console.py          # right window
.venv/bin/python src/eval/run_eval.py              # confirm 17/18, then close it
```

Leave `USE_MOCK_LLM=true`. Live watsonx works, but it currently exceeds the confidence
ceiling on Case 6c — the one moment the pitch rests on. Demo the mock, and *say* that live
inference is wired and what it costs you. Honesty about that is worth more than the
appearance of a bigger integration.

---

## 0:00 – 0:20 · The problem

> "At 3nm, a one percent yield drop costs a fab tens of millions a month. When yield falls,
> the cause is hidden across thousands of sensors, hundreds of process steps and defect
> images in three different systems. Engineers correlate that by hand — days to weeks. And
> nobody flags the lots that are *about* to fail, because you only start looking after test
> comes back."

*Screen: the console, already open on a lot. Don't show slides.*

## 0:20 – 0:35 · What it is

> "YieldGuard is an IBM Bob agent. Bob talks to a YieldGuard MCP server — ten tools —
> and **Bob decides which ones to call.** Nothing here is a fixed pipeline. Watch."

*Screen: switch focus to the Bob window.*

## 0:35 – 1:25 · Beat 1 — it chains the tools itself

Type it live. **Phrase it your own way** — a scripted prompt proves nothing.

> *"Lot L-4471 came back at 61% yield and the failures cluster near the wafer edge. What
> went wrong and what should I do?"*

While the tool calls scroll:

> "I haven't told it which tools to use. It's fetching the lot, classifying the wafer map,
> scoring the sensors, pulling similar historical cases, checking telemetry on the tool
> those cases point at — then passing all four results *into* the reasoning step. Bob
> orchestrates. The server just exposes capabilities."

Switch to the console, click **L-4471**:

> "Same tools, rendered. That's the real WM-811K bin map — red is failing die. Edge-Ring at
> 0.98 confidence, from a classifier we trained to macro-F1 0.86. RF power instability after
> the tool PM, 0.81. And every hypothesis cites its source — historical case HC-033,
> sensor_23 at plus 2.8 sigma, telemetry oscillating on ETCH-07. That's the difference
> between a ranked list and a justified one."

**Screenshot 1** here.

## 1:25 – 1:55 · Beat 2 — before the lot runs

Click a scheduled lot (**L-4502**):

> "This is the half that usually gets skipped because it's harder to demo. This lot hasn't
> run. There is no wafer map and no test data — so the classifier and the anomaly detector
> don't apply at all, and the system doesn't pretend otherwise. It scores the *planned*
> process parameters against historically low-yield profiles. This one resembles the profile
> that preceded case HC-018, and the tool it's scheduled on is already drifting. That's a
> triage signal for an engineer, not an automated hold."

**Screenshot 2** here.

## 1:55 – 2:35 · Beat 3 — the one that matters

Back to Bob:

> *"Lot L-5502 just came back with almost every die failing. Is this a process excursion?
> Should I scrap it?"*

Let it answer, then:

> "Watch what it does *not* do. Near-full failure map, 100% confidence — the obvious call is
> a catastrophic process excursion, scrap the lot. But the anomaly sits on the test head and
> the process sensors are quiet. So the top hypothesis is that the **tester** is
> miscalibrated and the wafers may be fine. Hold and retest. Do not scrap."

> "And the confidence is capped at 0.70, not 0.85. That's deliberate — a claim that the
> measurement is wrong is a claim the data is untrustworthy. You can't be highly confident
> about a wafer whose measurement you're disputing. A system tuned to sound confident gets
> this backwards and scraps good material."

**Screenshot 3** here. Do not rush this — it is the strongest forty seconds you have.

## 2:35 – 3:00 · What we won't claim

> "Honestly: SECOM and WM-811K are separate public datasets, so any case pairing a wafer map
> with a sensor signature is constructed, not a real fab incident. Telemetry is simulated.
> Confidence is a relative ranking, not a calibrated probability. The reasoning here is
> running on mocked responses — live watsonx Granite is wired and working, but it currently
> overstates confidence on exactly this case, so we're showing you the honest one and fixing
> the prompt. The system reports which of its own tools are trained, every run."

> "Bob orchestrating MCP tools, watsonx Granite behind the reasoning, running locally. That's
> YieldGuard."

---

## Checklist

- [ ] Under 3:30 — aim 3:00
- [ ] Application **running**, not slides
- [ ] Questions phrased naturally, typed live
- [ ] Tool calls visible as Bob makes them
- [ ] At least one evidence citation read aloud
- [ ] Limitations in the **audio**, not just on a slide
- [ ] 3 screenshots captured from this same take
- [ ] Link sharing "anyone with the link" — check in a private window
- [ ] URL into `demo/demo-video-link.txt`

## If you only get one take

Beats 1 and 3. The pre-run beat is the differentiator on paper, but Case 6c is what a judge
remembers, and beat 1 is what proves Bob is load-bearing.
