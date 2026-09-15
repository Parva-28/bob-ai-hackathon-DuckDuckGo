# Slide Deck Content — YieldGuard

Slide order follows the submission guide: **Problem → Solution → Demo/architecture → IBM
technology integration → Impact.** Nine slides, ~30 seconds each if presented live.

Body text is what goes on the slide. *Speaker notes* are what you say. Keep the slide text
short — the notes carry the argument.

---

## 1 — Title

**YieldGuard**
Wafer Yield Root Cause & Defect Pattern Analyser
Team DuckDuckGo · Track: AI · IBM Bob AI Hackathon 2026

---

## 2 — The problem

- At 3nm, a **1% yield drop costs tens of millions per month**
- Root cause hides across thousands of sensors, hundreds of process steps, and defect images
  in three disconnected systems
- Engineers correlate it **by hand — days to weeks**
- Nobody flags lots that are *about* to fail; you only look after test comes back

*Speaker notes: the second bullet from the bottom is the money one — every day of delay is
lost revenue on wafers still running. The last bullet is the half of the brief most teams
will skip because it is harder to demo.*

---

## 3 — Why this isn't already solved

- Yield platforms (Spotfire, Silicon.da, Exensio) are good at **surfacing correlations**
- They leave the **last mile** to the engineer: correlation → ranked, evidence-cited
  hypothesis → action
- Pre-run prediction is a **mature field** — Virtual Metrology, SEMI E133, where *fault
  prediction* is a named functional group. Tignis and INFICON ship it.
- **The gap is not accuracy — it is trust.** Best published rare-class model on fab sensors:
  recall 0.96 at **precision 0.66**. One in three flagged lots is a false alarm.

*Speaker notes: lead with the prior art rather than letting a judge with fab background
catch you. It strengthens the pitch — we know the field, and we are aiming at the blocker
the IRDS practitioner survey actually names, which is model trust and explanation, not AUC.
A flag an engineer cannot verify quickly is a flag they learn to ignore.*

---

## 4 — What we built

**An engineer asks Bob a question. Bob gathers evidence and answers with citations.**

- Classifies wafer-map defect patterns (WM-811K, 8 patterns + none)
- Scores sensor anomalies (SECOM, 590 sensors, 1:14 imbalance)
- Retrieves precedent and equipment telemetry
- **Ranks root causes — every hypothesis cites a named source**
- Recommends corrective actions
- **Flags upcoming lots before they run**

*Speaker notes: emphasise that Bob decides which tools to call. This is not a fixed pipeline
with a chat box on top.*

---

## 5 — Three things that make it non-obvious

1. **Absence of signal is evidence.** Clean sensors on a Scratch pattern point *toward*
   mechanical handling. We cite "no deviation" as a finding.
2. **Built to be honestly uncertain.** Measurement-category hypotheses are
   confidence-capped; competing precedents cap it further and say so.
3. **Pre-run risk, not just post-mortem.** No wafer map, no test data — two of four evidence
   inputs are null by construction.

*Speaker notes: all three are testable, each has dedicated sub-cases, and the eval suite
asserts on them — including a confidence* ceiling *on Case 3c, where a confident answer
fails even if the named cause is right.*

---

## 6 — Demo / architecture

Architecture diagram (`docs/lld/01_architecture.mermaid`), plus:

- Bob (orchestrator) → MCP tool calls → YieldGuard server → models + watsonx.ai
- **9 tools over stdio**; Bob chooses and chains them
- `rank_root_causes` takes evidence as **arguments** — the server never chains itself

*Speaker notes: point at the Bob→T5 edge. If the server fetched its own inputs, Bob would
be a chat skin over a fixed pipeline. That distinction is visible in the code.*

---

## 7 — The case that proves it reasons

**Case 6c — Near-full failure**

- Almost every die failed → obvious answer is a catastrophic process excursion
- But the anomaly sits on the **test head**; process sensors are quiet
- Top hypothesis: **"possible test-equipment measurement artifact — the wafers may be fine"**
- Confidence **capped at 0.70**, and the recommendation is **hold and retest, not scrap**

*Speaker notes: this is the slide that separates diagnosis from relabeled anomaly detection.
A system tuned for confident output gets this backwards and scraps good material. Say the
reasoning out loud: a claim that the measurement is wrong is a claim that the data is
untrustworthy, so you cannot be highly confident about it.*

---

## 8 — IBM technology integration

- **IBM Bob** — the interaction surface *and* the orchestrator. `.bob/mcp.json` registers a
  custom MCP server; `.bob/skills/yieldguard/SKILL.md` teaches Bob both workflows
- **MCP** — 9 tools over stdio, schemas visible to Bob
- **watsonx.ai (Granite)** — the reasoning behind `rank_root_causes`, called from inside our
  MCP server
- Verified with a real MCP handshake in `src/mcp_server/test_stdio.py`

*Speaker notes: show the architecture diagram here, not a logo. Bob routes across its own
models; watsonx.ai is something our server calls — Bob → MCP → our server → Granite. Say
that explicitly, it shows we understand the stack rather than name-dropping it.*

---

## 9 — Impact & honest limits

**Impact**
- Root cause in minutes with a cited evidence trail, instead of days of manual correlation
- Pre-run triage on lots that have not been committed yet
- Every verdict feeds back into the case store

**Limits — stated plainly**
- SECOM and WM-811K are unrelated datasets; paired cases are **constructed**
- Telemetry is simulated; no live SECS/GEM
- Confidence is a **relative ranking**, not a calibrated probability
- **Advisory only** — never a closed-loop control action
- `pipeline_status` reports exactly how much is trained vs stubbed

*Speaker notes: end on the limits deliberately. The entire value proposition is honest,
evidence-cited reasoning — a pitch that overclaims contradicts the product. Judges respect
this, and the rubric says so.*

---

## The built deck

`presentation/slides.pptx` is generated from this content by `presentation/build-deck.js`
(pptxgenjs). All 9 slides carry their speaker notes in the notes pane, not on the slide.

```bash
npm install pptxgenjs && node presentation/build-deck.js
```

Regenerate from the script rather than hand-editing the .pptx, so this file stays the source
of truth. To export a PDF:

```bash
soffice --headless --convert-to pdf presentation/slides.pptx
```

Design notes: the repeated motif is a wafer bin map — scratch, near-full, edge-ring and
center patterns drawn as real defect geometries rather than stock icons, so the visual
language is the subject matter. Dark slides bookend the deck (title, Case 6c, closing) with
light content slides between. Two things worth swapping in before presenting: a real
screenshot on slide 7, and the rendered architecture diagram on slide 6.
