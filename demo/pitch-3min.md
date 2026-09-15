# YieldGuard — 3:00 pitch

One narrative, told in four movements: **the cost → why it's hard → what we built → what we
won't claim.** Roughly 430 spoken words. Say it like you're explaining it to a colleague, not
reading a deck.

Two windows: **Bob** on the left, the **analyst console** on the right.

---

## 1 · The engineer at 7am  ·  0:00 – 0:25

> "It's seven in the morning and a lot has come back at 61% yield. At 3nm, a one percent
> yield drop costs a fab tens of millions a month — so this one lot is somebody's whole
> quarter.
>
> The engineer now opens three systems. Wafer maps in one. Sensor traces in another.
> Tool maintenance logs in a third. And they start correlating by hand. That takes days.
> Sometimes weeks. The line keeps running the whole time."

*Screen: the console, open on L-4471.*

## 2 · Why it's still hard  ·  0:25 – 0:45

> "This isn't an unsolved data problem. Yield platforms are good at surfacing correlations,
> and predicting a lot's outcome before it runs is a whole standardised discipline —
> virtual metrology, SEMI E133. Vendors ship it.
>
> The gap is the last mile. The best published model on fab sensor data catches 96% of
> failures at 66% precision — so **one in three flags is a false alarm.** The bottleneck
> isn't detection. It's that an engineer can't verify the flag fast enough to trust it. A
> flag you can't check is a flag you learn to ignore."

## 3 · So we built the verification layer  ·  0:45 – 2:25

> "YieldGuard is an IBM Bob agent over ten MCP tools. The important word is *agent* —
> watch what I do here, which is nothing."

**Type it live, in your own words:**

> *"Lot L-4471 came back at 61% yield, failures cluster near the wafer edge. What went
> wrong and what should I do?"*

*As the tool calls scroll:*

> "I never told it which tools to use. It's pulling the lot, classifying the wafer map,
> scoring the sensors, retrieving similar historical cases, checking telemetry on the tool
> those cases point at — then passing all four results *into* the reasoning step. Bob
> orchestrates. Our server just exposes capabilities."

*Switch to the console, click L-4471:*

> "Same tools, rendered. That's a real WM-811K bin map — red is failing die. Edge-Ring at
> 0.98, from a classifier we trained to macro-F1 0.86. RF power instability after the tool
> PM, confidence 0.81.
>
> And every hypothesis carries its receipts: case HC-033, sensor_23 at plus 2.8 sigma,
> telemetry oscillating on ETCH-07. **That's the verification the engineer couldn't do fast
> enough.** Minutes, not days."

*Click a scheduled lot — L-4502:*

> "Now the other half. This lot hasn't run. No wafer map, no test data — so the classifier
> and the anomaly detector don't apply, and the system says so rather than inventing
> something. It scores the *planned* parameters against historically low-yield profiles.
> This one resembles the profile that preceded case HC-018, and the tool it's booked on is
> already drifting. Triage for a human, not an automated hold."

*Back to Bob:*

> *"Lot L-5502 came back with almost every die failing. Is this a process excursion? Should
> I scrap it?"*

> "Near-full map, 100% confidence. The obvious call is a catastrophic excursion — scrap it.
> But the anomaly sits on the **test head**, and the process sensors are quiet. So it says
> the tester is miscalibrated, the wafers may be fine, hold and retest.
>
> And look at the confidence — 0.55, not 0.85. Capped, deliberately. A claim that the
> measurement is wrong is a claim the data is untrustworthy; you can't be certain about a
> wafer whose measurement you're disputing. That cap is enforced in our server, not left to
> the model's goodwill — we tested it, and the model *didn't* comply on its own."

## 4 · What we won't claim  ·  2:25 – 3:00

> "Honestly. SECOM and WM-811K are separate public datasets, so any case pairing a wafer map
> with a sensor signature is constructed — not a real fab incident. Telemetry is simulated.
> Confidence is a relative ranking, not a calibrated probability. Our anomaly detector
> catches 6 of 21 failing lots on held-out data — we'd rather tell you that than quote the
> 93% accuracy you get by predicting 'pass' every time.
>
> The system reports which of its own tools are trained, every single run.
>
> IBM Bob orchestrating MCP tools, watsonx Granite behind the reasoning, running locally.
> The engineer still decides. We just made the evidence checkable in minutes. That's
> YieldGuard."

---

## Why this order

The problem opens on a **person**, not a statistic — the number lands harder after the
scene. Movement 2 concedes the field is crowded *before* a judge can raise it, then narrows
to the gap we actually fill, so everything after reads as aimed rather than naive. Movement 3
is three beats of rising interest: it works → it works before the lot runs → **it refuses to
overclaim.** Movement 4 is the close, because a system whose whole value is honest reasoning
cannot end by overselling.

## Delivery notes

- Type the questions live and phrase them yourself. A pasted prompt proves nothing, and
  Bob choosing its own tools is the single most valuable thing on screen.
- Don't rush 6c. It's forty seconds and it's what a judge remembers.
- Say the limitations out loud. On a slide they look like fine print; spoken, they read as
  confidence.
- If a take runs long, cut the pre-run beat — not 6c.
