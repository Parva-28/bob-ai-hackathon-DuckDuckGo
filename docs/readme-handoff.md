# README & submission.yaml Handoff → Lead (Track 3)

Track 5 does not edit `README.md` or `submission.yaml`. This is the drafted content for the
lead to paste in. Everything below is **verified against the repo as built**, not aspirational.

---

## `submission.yaml` — every REQUIRED field is currently empty, so validation fails

```yaml
team:
  name: "DuckDuckGo"                 # CONFIRM
  track: "AI"
  lead:
    name: ""                         # FILL
    email: ""                        # FILL
  members: []                        # FILL

submission:
  title: "YieldGuard — Wafer Yield Root Cause & Defect Pattern Analyser"

  problem_statement: >
    At 3nm process nodes a 1% yield drop costs a fab tens of millions per month, but the
    root cause hides across thousands of equipment sensors, hundreds of process steps and
    defect images in disconnected systems. Process engineers correlate these by hand, taking
    days to weeks, and lots whose planned parameters already resemble historical low-yield
    profiles run anyway because nothing flags them in advance.

  solution_summary: >
    YieldGuard is a Bob-native assistant that classifies wafer-map defect patterns, scores
    sensor anomalies, retrieves precedent and telemetry, and ranks probable root causes where
    every hypothesis cites a named evidence source. It also flags upcoming lots as at-risk
    before they run, using process parameters alone. IBM Bob orchestrates eight MCP tools;
    watsonx.ai Granite performs the reasoning behind them.

  key_features:
    - "IBM Bob orchestrates 9 MCP tools over stdio and chains them from natural-language questions"
    - "Ranked root causes where every hypothesis cites a sensor, case id or telemetry parameter - enforced in code, not review"
    - "Negative evidence: clean process sensors are treated as a positive finding pointing toward mechanical handling"
    - "Honest uncertainty: measurement-artifact hypotheses are confidence-capped rather than tuned to sound confident"
    - "Pre-run batch risk flagging before any wafer map or test data exists"

  tech_stack:
    languages: ["Python"]
    frameworks: ["MCP (Model Context Protocol) SDK 2.x", "PyTorch", "scikit-learn"]
    ibm_technologies: ["IBM Bob", "watsonx.ai", "IBM Granite"]
    databases: []
    other: ["WM-811K / LSWMD", "SECOM (UCI)", "Mermaid"]

  what_we_are_most_proud_of: >
    Case 6c. Nearly every die on the wafer failed, so the obvious answer is a catastrophic
    process excursion - but the anomaly sits on the test head while process sensors are quiet,
    so the system ranks "possible test-equipment measurement artifact" first, caps its own
    confidence at 0.70, and recommends hold-and-retest rather than scrap. Getting a system to
    be appropriately unconfident is harder than getting it to be right, and the eval suite
    asserts on a confidence ceiling, not just correctness.

  known_limitations: >
    SECOM and WM-811K are separate, unrelated public datasets, so every case pairing a wafer
    map with a sensor signature is a constructed pairing, not a real joined record - and the
    18 sub-cases are constructed from the real WM-811K taxonomy and documented failure modes,
    not disclosed fab incidents. Telemetry is simulated, not a live SECS/GEM connection.
    Confidence values are relative rankings, not calibrated probabilities. Batch-risk flagging
    is validated on parameter similarity, not causally proven, and is a triage signal rather
    than a go/no-go gate. The eval suite reports 16/18 - sub-cases 3a and 3b are left failing
    because similarity retrieval cannot separate two deliberately clean-sensor scratch cases
    without non-sensor context. Call pipeline_status to see which tools are backed by trained
    models and which are still stubs.
```

---

## `README.md` — Known Limitations section

> ### Known Limitations
>
> - **The case studies are constructed, not real incidents.** No fab publicly releases
>   root-cause-labelled data. The 18 sub-cases are built from the real WM-811K defect
>   taxonomy and documented fab failure modes.
> - **SECOM and WM-811K are separate, unrelated datasets.** They are not from the same fab,
>   line or lots. Any case pairing a wafer map with a sensor signature is a constructed
>   pairing for demonstration, not a real joined record.
> - **Telemetry is simulated.** There is no live SECS/GEM equipment connection.
> - **Batch-risk flagging is a triage signal, not a gate.** It is validated on parameter
>   similarity to historically low-yield profiles, not causally proven to predict future
>   yield loss.
> - **Confidence scores are relative rankings, not calibrated probabilities.**
> - **Advisory only.** The system recommends corrective actions; it never takes a
>   closed-loop control action on fab equipment.
> - **The eval suite reports 16/18 sub-cases passing.** 3a and 3b are known failures, left
>   visible rather than masked — see `docs/setup-guide.md`.
> - **Not all tools are backed by trained models.** Call `pipeline_status` for the current
>   real/stub split; stubs are schema-valid and fixture-derived, so a green eval proves
>   wiring and contract compliance, not model accuracy.
> - Any classifier or detector metric quoted must be the team's **own measured number** on
>   its held-out split — not a figure from the literature.

---

## `README.md` — How to Run

Copy the Quickstart verbatim from `docs/setup-guide.md`. One dependency, ~30 seconds:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-mcp.txt
.venv/bin/python src/eval/run_eval.py
```

---

## Still open for the lead

1. `submission.yaml` — team/lead/member fields (the Validate Submission Action fails until filled)
2. `demo/demo-video-link.txt` — real URL after recording per `demo/demo-script.md`
3. `demo/screenshots/` — 3 minimum, captured from the demo run
4. `presentation/slides.pdf` — build from `presentation/slides-content.md`
5. `git rm -r --cached src/models/*/__pycache__` — 9 `.pyc` files are tracked, which the
   submission guide names explicitly
6. Confirm the repository is **Public**
