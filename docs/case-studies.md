# Case Studies & Sub-Cases — Test Scenarios and Demo Script

**6 case studies · 18 sub-cases.** Each is anchored to a real WM-811K defect class and a documented
fab failure mode. Every one doubles as an eval fixture (`src/eval/fixtures/case_N<x>.json`).

> **These are constructed scenarios, not disclosed fab incidents.** No fab publicly releases
> root-cause-labeled incident data. Patterns come from the real WM-811K taxonomy and the published
> failure-mode literature; sensor signatures are constructed. SECOM and WM-811K are separate,
> unrelated datasets — any case pairing a wafer map with a sensor signature is a constructed pairing,
> never a real joined record. Say this plainly in the pitch; it is the kind of gap judges respect.

## Why these six, and what each one is actually testing

The set is designed so that **a system that merely classifies defects and narrates the label will
visibly fail on half of it.** Coverage by root-cause category:

| Category | Sub-cases | Why it's in the set |
|---|---|---|
| Process / equipment drift | 1a, 1b, 2a, 2b, 4a, 5b, 6a | The expected path — must work reliably |
| **Incoming material** | 1c | Cause is not the tool at all |
| **Shared-tool cross-contamination** | 2c | Cause originates on another product line |
| **Mechanical / handling** | 3a | Correct only if the system reasons from *clean* sensors |
| **Positional metadata** | 3b | Cause is a slot number — not a sensor reading in any form |
| **Facility-level** | 4a, 5a | Cause is HVAC / cleanroom, above the tool layer |
| **Logged discrete events** | 2a, 4b, 5c | Cause is an event in a log, not a trend in a trace |
| **Software / firmware / automation** | 4c, 6b | Cause is code, not physics |
| **Measurement system** | 6c | The wafer may be fine — the *tester* is wrong |
| **Genuinely low confidence** | 3c | Correct answer is "I don't know, here's why" |

Nine of eighteen sub-cases have a root cause that is **not** a process-sensor excursion. That ratio
is deliberate: it's what separates diagnosis from relabeled anomaly detection.

**Assertion vocabulary** used below (see `PLAN_REVIEW.md` P1-9 — the current single-substring fixture
schema cannot express rows 3c, 6b or 6c, and must be extended before Phase 0 refreezes):

- `expected_hypothesis_matches_any` — list of acceptable substrings, not one
- `expected_in_top_k` — the right answer may legitimately rank 2nd or 3rd
- `max_confidence_ceiling` — asserts the system was appropriately *un*confident
- `expected_category` — process / equipment / material / handling / software / measurement
- `require_evidence_citation` — every hypothesis names a sensor, case_id or telemetry parameter

---

## Case Study 1 — Center Pattern → CMP Non-Uniformity

**Signature:** Radially symmetric defect cluster at wafer center. Sensor group tied to the CMP
(Chemical Mechanical Planarization) station shows a mean/variance shift over recent lots.

**Expected ranked output:**
1. Slurry flow rate drift — *high evidence: sensor trending outside 2σ across last 6 lots*
2. Polishing pad wear past qualified life
3. Polish-head pressure miscalibration

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **1a** | Slurry pump degrading gradually over 2 weeks | The **pre-run batch flag** fires days before yield actually drops — the "predict before it runs" half of the brief | `at_risk=true` *before* any test data exists; `expected_category: equipment` |
| **1b** | Pad exceeded qualified life, but calendar-based PM hadn't triggered yet | Condition-based reasoning catching what fixed-schedule maintenance misses | Hypothesis must reference `EQUIPMENT.last_pm_at`, not just the sensor |
| **1c** | New slurry vendor lot with different viscosity | **Cause is incoming material, not equipment.** Does the agent consider non-equipment hypotheses at all? | `expected_category: material`; a top hypothesis blaming the tool is a **fail** |

**Demo role:** 1a is the clean, confident win. Open the video with it.

---

## Case Study 2 — Edge-Ring Pattern → Etch Plasma Non-Uniformity

**Signature:** Ring of defects near the wafer edge. RF power / gas-flow sensors show edge-zone
asymmetry during etch.

**Expected ranked output:** RF power edge effect → gas flow distribution imbalance → chamber wall
seasoning drift.

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **2a** | RF power edge ringing appearing right after a tool PM | **Time-correlation against a discrete logged event**, not a gradual trend | Hypothesis cites the PM timestamp; onset must post-date it |
| **2b** | Gas flow imbalance from a partially clogged edge nozzle | Requires **cross-referencing multiple correlated sensors**, not one outlier | ≥2 distinct sensors in the evidence citations |
| **2c** | Chamber wall seasoning drifted after a recipe change **on a shared tool, by another product line** | **Shared-tool cross-contamination** — the cause originates outside the lot's own process history | Hypothesis references `EQUIPMENT.is_shared_tool`; must look beyond this lot's route |

---

## Case Study 3 — Scratch Pattern → Mechanical Handling Damage

**Signature:** Linear defect trail. **No correlation with any process sensor** — and that absence is
itself the diagnostic signal. This is the flagship "negative evidence" case.

**Expected ranked output:** Wafer-handling robot end-effector wear → cassette slot misalignment →
mis-pick during transport.

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **3a** | End-effector wear building up gradually | Does the agent **rule out process causes when sensors are clean**, rather than forcing a process explanation? | `expected_category: handling`; anomaly_score is LOW yet a confident handling hypothesis still ranks #1. An `evidence_type: absence_of_signal` citation is the correct form here |
| **3b** | Cassette slot misalignment on one specific slot number | **Cause is positional metadata — not a sensor reading in any form.** Nothing in the 590-sensor vector can express it | Hypothesis references slot position; requires the data model to carry it |
| **3c** | One-off mis-pick during an operator-assisted transfer | **Single occurrence, genuinely low confidence.** The agent should say so instead of manufacturing a definitive answer | `max_confidence_ceiling: 0.50` — a confident answer here is a **fail, even if the cause is right** |

**Why 3a matters more than it looks:** the existing ER model hung every hypothesis off an
`ANOMALY_SCORE`. Case 3 has no meaningful anomaly score, so this case was structurally
unrepresentable until the data model was corrected (see `docs/lld/04_data_model.mermaid`).

---

## Case Study 4 — Donut Pattern → Lithography Overlay/Focus Drift

**Signature:** Ring-shaped defect band at mid-radius. Overlay/focus metrology shows a radial trend.

**Expected ranked output:** Stepper lens thermal drift → reticle contamination → focus/exposure map
miscalibration.

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **4a** | Lens thermal drift correlating with ambient fab temperature swings | Fusing **facility-level data (HVAC logs)** into root cause, not just tool-level telemetry | Evidence citation includes a non-tool, facility source |
| **4b** | Reticle contamination introduced during a reticle swap | Traces to a **specific logged event**, not a gradual drift | Onset aligns to the swap; `direction` on the telemetry is a step, not a ramp |
| **4c** | Focus map miscalibration after a stepper **firmware update** | **Correlating a software/config change log with a physical defect** | `expected_category: software`; pure sensor reasoning cannot reach this |

---

## Case Study 5 — Random Scatter Above Baseline → Particle Contamination

**Signature:** No spatial pattern, but defect density elevated versus the historical baseline for the
"None" class. Note this case requires reasoning about a *rate* against a baseline, not a shape.

**Expected ranked output:** HEPA filter degradation → worn chamber seals generating particles →
contamination introduced during unscheduled maintenance entry.

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **5a** | Cleanroom particle counter trending up **ahead of** the wafer defect trend | Uses a **leading indicator** instead of waiting for the lagging defect signal — directly relevant to FR-8 | Evidence cites the particle counter with an earlier timestamp than the defect onset |
| **5b** | Seal wear on one chamber generating particles **only during long runs** | **Duty-cycle-dependent** causation — the signal is conditional, not constant | Hypothesis conditions on run length; a flat correlation check misses this |
| **5c** | Particle spike right after an **unscheduled emergency maintenance entry** | Correlating a **logged human access event** with contamination onset | Evidence cites the access log |

---

## Case Study 6 — Near-Full Failure → Ambiguous Multi-Signal Excursion (the hard case)

**Signature:** Majority of die on the wafer fail. Multiple correlated sensor groups show simultaneous
excursions. Deliberately constructed so the root cause is **not** obvious — because "rank root causes
by probability" is only credible if the system can also be honest about ambiguity.

**Expected ranked output** *(this was the one case with no ranking stated in the original blueprint)*:
the correct behaviour is a **genuinely distributed ranking** — roughly 40 / 30 / 25 across a process
excursion, an automation fault, and a measurement artifact — rather than one 90%-confidence answer.
When the primary deviation sits on a tester channel while process sensors are quiet, the measurement
hypothesis should rank first.

| Sub-case | Variation | What it tests | Key assertion |
|---|---|---|---|
| **6a** | Genuine catastrophic process excursion (e.g. power supply fault cascading through a process step) | The **true positive**: real yield loss, real equipment root cause | `expected_category: equipment`; high confidence is correct here |
| **6b** | Upstream equipment **interlock software bug** misrouted otherwise-good wafers | Cause is **automation/software** — the agent must look beyond process sensors entirely | `expected_category: software`; `expected_in_top_k: 2` |
| **6c** | **Parametric test head miscalibration produced a false failure reading** | Cause is the **measurement system, not the wafer** — the wafers may be fine. The single sharpest test of whether "root cause" is genuine diagnosis or relabeled anomaly detection | `expected_category: measurement`; `expected_hypothesis_matches_any: [test equipment, measurement, tester, calibration]`; `expected_in_top_k: 1`; and it must **not** assert a process excursion |

**Demo role:** 6c is the strongest differentiator in the whole submission. Pair it with 1a — a clean
win followed by honest ambiguity — and the contrast does the persuading for you.

---

## Coverage check before submission

| Requirement | Covered by | Currently a fixture? |
|---|---|---|
| FR-3 defect classification across classes | 1 (Center), 2 (Edge-Ring), 3 (Scratch), 4 (Donut), 5 (Random/None), 6 (Near-full) | 6 of 6 classes ✅ |
| FR-4 sensor anomaly scoring | all except 3a/3b (deliberately clean) | ✅ |
| FR-5 historical case retrieval | all | ✅ |
| FR-6 ranked, evidence-cited hypotheses | all 18 | ✅ |
| FR-7 corrective actions | all 18 | ✅ |
| **FR-8 pre-run batch flagging** | **1a, 5a** (+ 1b as a stretch) | ⚠️ only 1a exists |
| FR-10 feedback write-back | 1a confirm path, 6c reject path | ❌ neither written |
| Negative-evidence reasoning | **3a, 3b** | ❌ 3b missing |
| Honest uncertainty | **3c, 6c** | ⚠️ only 6c exists |
| Non-process root causes | 1c, 2c, 3b, 4c, 5c, 6b, 6c | ⚠️ only 6c exists |

**Fixtures present:** `1a, 2a, 3a, 4a, 5a, 6c` (6 of 18).
**Missing:** `1b, 1c, 2b, 2c, 3b, 3c, 4b, 4c, 5b, 5c, 6a, 6b` — which is **every sub-case that tests a
non-process root cause except 6c**. They're hand-written JSON and they unblock three tracks; write
them before anything else on the critical path.

## Demo script (3–5 minutes per the submission guide)

Target ~4:00, leaving headroom under the 5:00 cap. The guide requires the video show the
**application running, not slides**, and walk one key feature end-to-end.

| Time | Beat | Case |
|---|---|---|
| 0:00–0:30 | The problem: a 1% yield drop costs tens of millions/month; root cause takes weeks | — |
| 0:30–1:00 | App starting up — the guide asks explicitly for this | — |
| 1:00–2:00 | Engineer asks Bob a **novel-phrasing** question; Bob chains MCP tools; ranked causes with cited evidence | **1a** |
| 2:00–2:45 | Same system, pre-run: "which of tomorrow's lots should I worry about?" | **1a / 5a** |
| 2:45–3:30 | The honest case: system ranks *test-head miscalibration* first and declines to blame the process | **6c** |
| 3:30–4:00 | Known limitations stated out loud, then architecture diagram naming Bob and watsonx.ai | — |

Take the three required `demo/screenshots/` from this same run — one per feature beat — rather than
staging them separately.

Do not demo only the easy case. The 6c moment is what a judge remembers, and it is the one thing a
classifier-with-a-chatbot submission cannot fake.
