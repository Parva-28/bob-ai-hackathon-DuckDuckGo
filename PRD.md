# PRD — YieldGuard: Wafer Yield Root Cause & Defect Pattern Analyser
**Hackathon:** IBM Bob AI Hackathon 2026 — Semiconductor Track (S1)
**Doc status:** Draft v1.0 — source-of-truth PRD; sections map directly onto `bob-ai-hackathon-submission-template`
**Owner:** [team lead] · **Track:** AI

---

## 0. Read This First — A Correction From the Last Round

The earlier LLD in this thread labeled the reasoning agent "Claude." Now that we've confirmed what IBM Bob actually is — a real agentic dev tool with MCP + watsonx Orchestrate integration, not a placeholder name — that labeling is a real scoring risk, not a cosmetic detail. **Criterion 5 (10 pts) explicitly penalizes Bob being name-dropped rather than load-bearing.**

This PRD corrects that: **Bob is the orchestrator** (CLI/chat front end, custom MCP server, tool-calling loop), and **watsonx.ai is the model behind the MCP tools**, matching the template's own reference diagram exactly. If the team still wants best-in-class reasoning quality behind a specific tool call, that's an implementation detail inside your MCP server — but Bob must be the thing doing the orchestrating that a judge sees when they read the code, or this 10 points is at risk regardless of how good the underlying model is.

---

## 1. Executive Summary

Fabs lose tens of millions per month to yield drops whose root cause takes engineers weeks to isolate manually, across thousands of sensors and defect images. YieldGuard is a Bob-native assistant that an engineer chats with directly: it classifies wafer map defect patterns, scores sensor-level anomalies, ranks probable root causes with cited evidence, recommends corrective actions, and flags upcoming lots whose process parameters historically correlate with low yield — before those lots run.

It is built as **Bob Skills + a custom MCP server**, not a bespoke web app that happens to mention Bob. An engineer opens Bob, asks about a lot, and Bob calls tools that run real models (WM-811K-trained CNN, SECOM-trained anomaly detector) and a watsonx.ai-backed reasoning tool that ranks causes.

---

## 2. Problem Statement

**Who:** Process/yield engineers and fab ops managers at high-mix or leading-edge (3nm/5nm) fabs.

**What:** At advanced nodes, a 1% yield drop costs tens of millions per month. Root causes hide across thousands of equipment sensors, process parameters, and defect images. Engineers currently correlate these manually — a process that takes days to weeks per excursion, during which the fab keeps producing at reduced yield. Separately, there is no mechanism today to flag that an *upcoming* batch's process parameters resemble those of past low-yield batches before it runs.

**Why existing tooling doesn't solve it:** Existing yield management systems (Spotfire, Synopsys Silicon.da, yieldHUB-class tools) are strong at visualization and correlation surfacing, but leave the final root-cause judgment and next-action decision to the engineer — they don't close the loop from "here's a correlation" to "here's a ranked, evidence-cited hypothesis and what to do about it." That last-mile reasoning step is what this solution targets.

**Why now:** Vision foundation models and agentic tool-calling have both become production-viable in the last 18 months (see Appendix A), and the specific combination — vision classification + tabular anomaly detection + an LLM tool-calling agent to fuse them into a ranked explanation — has exactly one close published precedent (SemiFA, arXiv 2604.13236), meaning this is timely but not yet a solved, commoditized problem.

**Honest scope caveat:** No fab publicly releases root-cause-labeled incident data. This solution is built and validated against two real public datasets (SECOM, WM-811K) plus the published failure-mode literature — not against a real disclosed fab incident history. Section 15 (Known Limitations) makes this explicit; do not let the demo narrative imply otherwise.

---

## 3. Goals & Success Metrics

Metrics are written to be checkable, not aspirational, and are pre-mapped to the rubric in Section 17.

| Goal | Metric | Target for hackathon demo |
|---|---|---|
| Wafer defect classification works | Macro-F1 on a held-out WM-811K validation split | Report the actual number achieved — do not assert a target you haven't measured; literature range for comparable CNN baselines is roughly 92–98% macro accuracy, but your number is whatever you measure |
| Sensor anomaly detection is meaningfully better than naive | Recall on the SECOM fail class at a stated precision/false-alarm rate | Beat the "everything is normal" baseline (0% recall) by a wide, *reported* margin — do not report accuracy alone (SECOM's 1:14 imbalance makes accuracy meaningless, see Appendix A) |
| Root cause ranking is evidence-based, not just relabeled anomaly detection | Every ranked hypothesis in the demo cites which sensor(s)/telemetry/historical case supports it | 100% of hypotheses shown in the demo carry a visible evidence trail |
| Batch risk flagging works pre-run | At-risk lots flagged before test results exist, using only process-parameter similarity to past low-yield lots | Demonstrate on at least 2 of the 6 case studies (Section 13) |
| Bob is genuinely load-bearing | Judge can open `src/` and see Bob orchestrating MCP tool calls, not a Flask app that mentions Bob in a comment | Architecture doc + demo video both show the Bob chat/CLI surface as the actual interaction point |

---

## 4. Non-Goals (Hackathon Scope)

Explicitly **not** attempting in this build:

- Real-time SECS/GEM integration with live fab equipment (SemiFA and the ISTFA paper both note this requires industry partnerships we don't have in a hackathon timeframe — simulate telemetry from the SECOM dataset instead)
- Closed-loop automatic equipment adjustment (the S1 brief asks for *recommended* corrective actions, not automated control — automating an actual fab tool is a safety-relevant decision no hackathon team should ship)
- Training a novel vision architecture from scratch — use an existing CNN backbone per Appendix A precedent (ResNet/lightweight CNN), the innovation is in the fusion + reasoning layer, not novel computer vision research
- Multi-fab / multi-line generalization — single simulated line is in scope

---

## 5. Users & Personas

| Persona | Need | How they touch the product |
|---|---|---|
| Process/Yield Engineer | "Why did this lot fail, and what do I do about it?" | Chats with Bob directly; receives ranked root causes + corrective action plan |
| Fab Ops Manager | "Which upcoming lots are at risk before they run?" | Views the at-risk batch report (could be the same Bob session or a summarized dashboard view) |
| Hackathon Judge | "Does this actually work, and is Bob load-bearing?" | Runs the setup guide, drives a live Bob session, reads `src/` |

---

## 6. Solution Overview

**Core mechanism:** Two independent detection models (image-based defect classifier, tabular anomaly detector) feed a single reasoning tool that fuses their outputs with retrieved historical cases and equipment telemetry, then produces a ranked, cited root-cause list. This mirrors the SemiFA precedent's separation of concerns (Appendix A.4) but consolidates its four agents into one reasoning tool for a scope this size.

**What makes it non-obvious, not just a classifier wrapped in a chatbot:**
1. **Negative evidence is used as a signal.** A Scratch-pattern defect with *no* correlated process-sensor deviation (Case Study 3) should push the ranked causes toward mechanical/handling, not toward a forced process explanation. Most defect-classification demos stop at the label; this one reasons about the *absence* of correlation too.
2. **The system is designed to be honestly uncertain.** Case Study 6 is built specifically so the top-ranked hypothesis can be "this may be a test-equipment measurement artifact, not a real wafer defect" — the opposite of what a system optimizing for confident-sounding output would produce.
3. **Batch-risk flagging runs before test data exists**, using process-parameter similarity to historically low-yield lots — this is the "predict before it runs" half of the brief that's easy to skip in favor of the more demo-friendly "detect after it fails" half.

**Key design decisions:**
- Bob is the interaction surface (chat), not a bolted-on badge. All model calls happen behind MCP tools Bob invokes.
- watsonx.ai is the model behind the MCP tools' reasoning step, matching the template's reference architecture.
- Vector retrieval (historical cases) keeps the reasoning tool's context small — raw sensor time series never enter the reasoning prompt directly, only extracted features and retrieved case summaries (per Anthropic's context-engineering pattern cited in Appendix A, applied here regardless of which model executes the call).

---

## 7. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-1 | Ingest and normalize wafer bin map images | Accepts WM-811K-format images at native resolutions (15×15 to 200×200 px), resizes/normalizes consistently |
| FR-2 | Ingest and normalize SECOM-format sensor vectors | Handles missing values (SECOM has real sensor dropout) without crashing; imputation strategy documented |
| FR-3 | Classify wafer defect pattern | Returns one of the 9 WM-811K classes (or a mixed-type flag per MixedWM38 precedent) with a confidence score |
| FR-4 | Score sensor-level anomaly | Returns an anomaly score for a lot's sensor vector, calibrated against SECOM's fail-class distribution |
| FR-5 | Retrieve similar historical cases | Given a defect class + sensor signature, returns top-k most similar stored cases with their confirmed (or simulated) root cause |
| FR-6 | Rank root cause hypotheses | Given classifier output + anomaly score + retrieved cases + telemetry snapshot, returns a ranked list of hypotheses, each with a confidence and a cited evidence summary |
| FR-7 | Recommend corrective actions | Given the top hypothesis, returns a short, specific corrective action list (not generic "improve monitoring" advice) |
| FR-8 | Flag at-risk upcoming batches | Given a new lot's planned process parameters (before test results exist), scores similarity to historically low-yield parameter profiles and flags if above threshold |
| FR-9 | Present findings through Bob | All of the above are exposed as MCP tools Bob calls in response to a natural-language engineer query; no separate UI is required to view the core result, though a summarized dashboard view is a stretch goal |
| FR-10 | Capture engineer feedback | Engineer can confirm or reject a ranked hypothesis; confirmed/rejected outcome is written back to the historical case store |

---

## 8. Non-Functional Requirements

- **Latency:** End-to-end root-cause report generation under ~60 seconds per lot (SemiFA precedent: 48 seconds full pipeline — a reasonable target ceiling, not a promise).
- **Explainability:** Every root-cause hypothesis shown to the user must carry a visible evidence citation (which sensor, which historical case, which telemetry window). A ranked list with no evidence trail fails this requirement even if the ranking is statistically sound.
- **Graceful degradation:** If an MCP tool call fails (e.g., vector store unreachable), Bob should report the failure and return whatever partial result it has, not silently produce a confident-sounding hallucinated root cause.
- **Data provenance:** No real fab data is used or implied. Any case in the demo must be clearly traceable to SECOM, WM-811K, MixedWM38, or an explicitly labeled constructed scenario (Section 13).
- **Reproducibility:** Setup guide must be tested by a teammate on a clean machine before submission (per template checklist).

---

## 9. Data & Datasets

| Dataset | Size | Use | Key caveat |
|---|---|---|---|
| SECOM (UCI) | 1,567 obs., 590 sensors, 104 fails | Anomaly detection training/eval | Severe 1:14 imbalance; ~4.5% missing values across ~28 sensors — must be handled explicitly, not dropped silently |
| WM-811K / LSWMD | 811,457 wafer maps, 9 classes | Defect classification training/eval | Only ~25,519 of these are labeled with a real defect pattern (~14.8%); the rest are "None" or unlabeled — sampling strategy must account for this |
| MixedWM38 | 38 mixed defect classes | Stretch goal: multi-label classification | Referenced in literature (Appendix A.2); only use if time allows after single-label classification works |

**Important honesty note:** SECOM and WM-811K are **separate, unrelated datasets** — they do not come from the same fab or the same lots. Any case study that "fuses" a sensor signature with a wafer map pattern (Section 13) is a constructed pairing for demo purposes, not a real joined record. State this plainly in `docs/problem-statement.md` and again in `README.md`'s Known Limitations — this is exactly the kind of honest gap the rubric says judges respect.

---

## 10. System Architecture (Bob-Native)

See `S1_LLD_Architecture_BobNative.mermaid` for the diagram. Summary:

```
Engineer ──(chat)──> IBM Bob (CLI/IDE agent loop)
                         │  MCP tool calls
                         ▼
                 YieldGuard MCP Server
        ┌───────────┬───────────┬─────────────┬──────────────┐
        ▼           ▼           ▼             ▼              ▼
 classify_wafer  score_    retrieve_    query_        flag_at_risk_
   _map (CNN)    anomaly   similar_     telemetry     batch (similarity
              (SECOM ML)   cases (VDB)  (simulated     model)
                                        SECS/GEM)
        │           │           │             │              │
        └─────┬─────┴─────┬─────┴──────┬──────┴──────┬───────┘
              ▼            ▼            ▼             ▼
        rank_root_causes tool (watsonx.ai-backed reasoning)
              │
              ▼
     get_corrective_action_playbook tool
              │
              ▼
     Ranked report returned to Bob ──> Bob renders to engineer
              │
              ▼
     Engineer feedback ──> written back into vector store
```

Component responsibilities:

| Component | Technology | Responsibility |
|---|---|---|
| Bob | IBM Bob (CLI/IDE agent) | Interaction surface, tool-call orchestration, conversation state |
| YieldGuard MCP Server | Python (FastMCP or equivalent) | Exposes all tools below to Bob over MCP |
| Defect classifier | CNN (e.g. ResNet-style backbone), trained on WM-811K | FR-3 |
| Anomaly detector | Isolation Forest / autoencoder, trained on SECOM | FR-4 |
| Vector store | e.g. Qdrant or Chroma | FR-5, stores historical + constructed cases |
| Reasoning tool | watsonx.ai (e.g. Granite) call inside the MCP server | FR-6 |
| Corrective action tool | Rule-based lookup + watsonx.ai refinement | FR-7 |
| Batch risk model | Similarity scoring against historical parameter profiles | FR-8 |
| Feedback store | Same vector store, tagged with engineer verdict | FR-10 |

---

## 11. MCP Tool Specification

Following Anthropic's tool-design guidance (Appendix A.4) — even though the model behind these tools is watsonx.ai, the *design discipline* (clear names, token-efficient responses, explicit error messages) still applies and is model-agnostic:

| Tool name | Input | Output | Notes |
|---|---|---|---|
| `classify_wafer_map` | wafer map image ref | `{predicted_class, confidence}` | Keep response small — no raw pixel data back to Bob |
| `score_sensor_anomaly` | lot_id, sensor feature vector | `{anomaly_score, top_deviating_sensors[]}` | Return only the top-N deviating sensors, not all 590 |
| `retrieve_similar_cases` | defect_class, sensor_signature | `{cases: [{case_id, similarity, confirmed_root_cause, outcome}]}` | Cap at top-k (e.g. 5) to control context size |
| `query_telemetry` | equipment_ids, time_window | `{equipment_id, parameter, recent_trend}[]` | Simulated SECS/GEM in hackathon scope |
| `rank_root_causes` | classifier output + anomaly score + retrieved cases + telemetry | `{hypotheses: [{description, confidence, evidence_summary}]}` | This is the watsonx.ai-backed call |
| `get_corrective_action_playbook` | top hypothesis | `{actions: [{description, priority}]}` | |
| `flag_at_risk_batch` | planned process parameters for an upcoming lot | `{at_risk: bool, similarity_to_historical_low_yield, matched_case_ids[]}` | Runs pre-test, this is the "before it runs" requirement |
| `submit_feedback` | hypothesis_id, verdict, notes | `{status}` | Writes back to vector store |

---

## 12. Repository & Submission Mapping

| PRD section | Goes into |
|---|---|
| §2, §9 (honesty note) | `docs/problem-statement.md` |
| §6, §7 | `docs/solution-overview.md` |
| §10, §11, mermaid files | `docs/architecture.md` |
| §5, §9 tech table | `README.md` → Tech Stack, Key Features |
| §15 | `README.md` → Known Limitations |
| §17 | Internal self-check before submitting — do not paste rubric scoring into the repo verbatim, use it to verify coverage |
| §11 tool list + actual code | `src/` (suggest `src/mcp-server/`, `src/models/`, `src/bob-config/`) |
| §13 case studies | Use as your demo script and as your MCP server's test/eval fixtures |

---

## 13. Case Studies as Test Scenarios (from prior research pass)

Reuse the 6 case studies and 18 sub-cases already built (`S1_Wafer_Yield_Solution_Blueprint.md`, Part 2) as:
1. The demo video script (pick 2–3 for the 3–5 minute video — Case 1 for a clean win, Case 6c for the "we handle ambiguity honestly" moment, since that's the single strongest differentiator against a naive classifier-with-a-chatbot submission)
2. The MCP server's automated eval suite (per Anthropic's tool-writing guidance in Appendix A.4: define expected output per scenario, run the agent loop, track success rate)

Do not present these as real historical incidents in the pitch deck — say explicitly they are constructed from the real WM-811K taxonomy and documented failure modes (Section 9).

---

## 14. Tech Stack

| Layer | Technology |
|---|---|
| Agent/interaction layer | IBM Bob (CLI/IDE agent, custom Skills, custom mode) |
| Orchestration | MCP (Model Context Protocol) — custom server |
| Reasoning model | watsonx.ai (e.g. Granite 3.x) |
| Vision model | CNN (framework: PyTorch or TensorFlow), trained on WM-811K |
| Tabular ML | scikit-learn (Isolation Forest) or autoencoder, trained on SECOM |
| Vector store | Qdrant or Chroma (self-hosted, no external data leaves the demo environment) |
| Language (MCP server) | Python |
| Optional dashboard (stretch) | Lightweight web view summarizing at-risk batches — not required if Bob chat is the primary surface |

---

## 15. Known Limitations (be explicit in `README.md`)

- SECOM and WM-811K are not from the same fab or lots; case studies pairing them are constructed, not real joined records (Section 9).
- No real SECS/GEM equipment connection — telemetry is simulated from SECOM features.
- Batch-risk flagging (FR-8) is validated on historical *pattern similarity*, not causally proven to predict future yield loss — frame it as a triage signal for engineer review, not an automated go/no-go gate.
- Root cause "confidence" scores are relative rankings from the reasoning tool, not calibrated probabilities in a statistical sense — do not present them as such in the pitch.
- Classifier performance numbers in the pitch must be the team's actually-measured numbers on their held-out split, not literature figures from Appendix A papers (those used different splits/preprocessing).

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bob ends up as a thin wrapper around a hardcoded script (scores poorly on Criterion 5) | Verify: can a judge ask Bob a *novel* phrasing of a root-cause question and see it choose which MCP tools to call, rather than following one fixed hardcoded prompt path? If not, that's the first thing to fix before submission. |
| SECOM's 1:14 imbalance produces a model that just predicts "pass" | Report recall/precision on the fail class explicitly in the demo and docs, not accuracy (Appendix A.1) |
| Scope creep across 5 bundled capabilities (classification, anomaly detection, RCA, corrective actions, batch flagging) | If time-boxed, cut MixedWM38 multi-label and the dashboard stretch goal first — FR-1 through FR-7 plus FR-9 are the non-negotiable core; FR-8 (batch flagging) is the differentiator worth protecting over polish |
| Reasoning tool produces confident-sounding but evidence-free output | Enforce the evidence-citation NFR in code review before demo — reject any hypothesis without a cited source |

---

## 17. Evaluation Rubric Self-Check

| Criterion | Pts | What in this PRD covers it |
|---|---|---|
| Technical Implementation Quality | 25 | §7 FRs with acceptance criteria, §11 tool spec — build against these, not vibes |
| Innovation & Differentiation | 25 | §6 (negative-evidence reasoning, honest uncertainty in Case 6c, pre-run batch flagging) |
| Problem Depth & Vision | 15 | §2, §9, §15 — explicit honesty about data limitations is itself evidence of depth |
| Working Demo & Functionality | 15 | §13 — script the demo around 2–3 case studies, show real output, not mocked |
| IBM Bob Integration | 10 | §0, §10, §11 — Bob as orchestrator, watsonx.ai behind the tools, verify per the Risks table |
| Documentation & Reproducibility | 10 | §12 mapping table, §15 Known Limitations, tested setup guide |

---

## Appendix A — Engineering References (condensed; full list in prior blueprint doc)

- A.1 SECOM imbalance handling: ["From 14% to 85% Recall" (Medium)](https://medium.com/@amy2598877/from-14-to-85-recall-how-i-got-ai-to-finally-catch-faulty-products-using-public-secom-data-04f64a804968)
- A.2 WM-811K / MixedWM38 classification precedent: [arXiv 2411.11029](https://arxiv.org/abs/2411.11029), [Dual-Head CNN, ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0957417423028038)
- A.3 Root-cause tooling precedent (cross-industry): [Uber Argos](https://eng.uber.com/argos-real-time-alerts/), [Uber D3 drift detection](https://www.uber.com/us/en/blog/d3-an-automated-system-to-detect-data-drifts/)
- A.4 Agentic architecture precedent: [SemiFA (arXiv 2604.13236)](https://arxiv.org/abs/2604.13236), [Anthropic: Writing Effective Tools for AI Agents](https://www.anthropic.com/engineering/writing-tools-for-agents), [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- A.5 IBM Bob + MCP + watsonx reference patterns: [Build AI agents with IBM Bob and watsonx Orchestrate](https://developer.ibm.com/tutorials/build-agents-mcp-tools-watsonx-orchestrate-using-bob/), [Developing watsonx Orchestrate Agents with IBM Bob](https://heidloff.net/article/bob-orchestrate/), [Accessing watsonx Orchestrate from Bob via CLI](https://heidloff.net/article/watsonx-orchestrate-skill-cli/)
- Full source list with per-source rationale: `S1_Wafer_Yield_Solution_Blueprint.md`, Part 1.
