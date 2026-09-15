# Plan Review — YieldGuard / S1 Wafer Yield Root Cause Analyser

Reviewed: `PRD.md`, `S1_Wafer_Yield_Solution_Blueprint.md`, the 3 original `.mermaid` files,
`CONTRACTS.md`, `TEAM_SPLIT_OVERVIEW.md`, the 5 agent briefs, and the current repo state.
All external citations were independently verified; all IBM Bob claims were checked against
`bob.ibm.com/docs` rather than assumed.

**Verdict:** the plan is genuinely strong — the honesty discipline around SECOM/WM-811K,
the negative-evidence idea (Case 3), and the pre-run batch flagging are real differentiators,
not hackathon garnish. It does not need rewriting. But there are five things that are
**wrong or blocking**, and the single most important one is that the part of the plan labelled
"de-risk this first" is the part that hasn't been done.

---

## P0 — Blocking or factually wrong

### 0. The headline differentiator has established prior art under a different name.
"Flag upcoming batches before they run" is **Virtual Metrology**, formally defined in **SEMI E133**
(Automated Process Control Systems Interface) as predicting post-process metrology from process and
sensor data. The flagging half is the **Fault Prediction** functional group in that same standard,
sitting alongside run-to-run control, fault detection, fault classification and SPC. And it ships
commercially: **Tignis PAICe Maker** (now Cohu) has VM built into a controller with wafer-to-wafer
recipe recommendations; **INFICON FabGuard SmartFDC** does unsupervised trace-shift detection in
production fabs; **PDF Solutions Exensio Aurora** (beta Sept 2026) ships LLM-enabled yield agents with
feed-forward deployment.

So PRD §6's framing — that pre-run flagging is "the half that's easy to skip" — reads as unaware of
the field rather than insightful. **This is fixable in a paragraph and worth fixing**, because a judge
with fab background will notice, and the fix actually strengthens the pitch:

- **Adopt the vocabulary.** Virtual metrology, fault prediction, feed-forward control, excursion
  detection, lot disposition, wafers-at-risk. Fluency reads as credibility.
- **Re-aim the novelty claim at the real gap.** The IRDS virtual-metrology white paper surveys APC
  practitioners and the blockers they name are *not* accuracy: model trust, data quality, absent
  process-knowledge correlation, model maintenance under context shift, and **the lack of a
  standardized prediction-quality metric**. The best published rare-class model on fab sensors runs
  recall 0.96 at **precision 0.66** — roughly **one in three flagged lots is a false alarm**. The
  binding constraint is engineer triage time, not AUC. That is exactly what an evidence-citing
  explanation layer addresses.
- **Two things are genuinely unclaimed**, and both are already in the plan: cross-module fusion of
  wafer-map pattern + trace anomaly + route context into one causal narrative (today three
  disconnected tools), and the forward-looking predictor **combined with** an LLM agent — which
  appears nowhere in the literature and which no cloud vendor publishes on.
- **Lead with advisory-only as rigor.** The EWMA run-to-run stability literature shows any predictive
  signal injected into a fab lives inside a provable stability region. The PRD already refuses
  closed-loop control as a non-goal; present that as engineering judgment, not as a missing feature.

Full sourcing in `docs/research/engineering-references.md` §0.

### 1. `src/bob-config/` is not a path IBM Bob reads. Bob will never see it.
`CONTRACTS.md` gives Track 3 exclusive ownership of `src/bob-config/`. Per the actual Bob docs,
configuration lives at repo root under `.bob/`:

| What | Real path | Scope |
|---|---|---|
| MCP server registration | **`.bob/mcp.json`** (project, overrides global) or `~/.bob/mcp.json` | commit the project one |
| Skills | **`.bob/skills/<name>/SKILL.md`** (YAML frontmatter: `name`, `description` — a skill with no `description` is silently ignored) | Advanced mode only |
| Custom modes | **`.bob/custom_modes.yaml`** | `customModes[].slug/name/roleDefinition/groups` |

Anything placed in `src/bob-config/` is inert decoration. Since Criterion "Bob integration" is
judged by a human opening the repo and looking for real wiring, this is the highest-leverage
correction in this document.

Registration shape for our 8-tool server over stdio:
```json
{ "mcpServers": { "yieldguard": {
    "command": "python", "args": ["-m", "src.mcp_server.server"],
    "cwd": "/absolute/path/to/repo", "alwaysAllow": [], "disabled": false } } }
```
Gotchas that are documented and will cost an hour each if ignored: **absolute paths only**;
install deps *before* registering; after editing the JSON you must hit **Refresh servers** and
toggle the server on; leave `alwaysAllow` empty at first so you can watch the tool calls happen.
And do not put the watsonx API key in `.bob/mcp.json` `env` — that file is meant to be committed.

Also note: `src/mcp-server/` (hyphen) is not importable as a Python module. Use `src/mcp_server/`.

### 2. Phase 0 never finished, but Tracks 1 and 2 built on top of it anyway.
Current repo state versus the plan:

| Track | Planned | Actual |
|---|---|---|
| 1 · vision | `classify_wafer_map` | code present, **model never trained** — `NOTES.md` macro-F1 is still `___` |
| 2 · tabular | anomaly + batch risk | code present, **never trained** — recall/precision still `___` |
| 3 · MCP + Bob (lead) | stub server, `.bob/` wiring, **Bob spike** | **absent entirely** — no `src/mcp_server/`, no `.bob/` |
| 4 · reasoning | `rank_root_causes` | **absent entirely** |
| 5 · docs/eval | 4 docs + `run_eval.py` | `docs/*.md` are still raw template placeholders; no eval harness |
| fixtures | 18 sub-cases | **6** (`1a, 2a, 3a, 4a, 5a, 6c`) |

The plan says the Bob spike is "the single most important thing to de-risk first" and a blocking
problem if it fails. It is the one thing not started, while two tracks have already shipped code
that can only be scored *through* it. That inversion is the project's actual risk right now — not
model accuracy.

**Fix the Phase 0 bottleneck while you're at it.** The plan makes four people wait on the lead for
both the fixtures *and* the stub server *and* the spike. Ship the 18 fixture JSONs first — they're
hand-written data, they unblock Tracks 1, 2 and 4 immediately, and they don't depend on the spike.

### 3. `rank_root_causes` emits no `hypothesis_id`, so `submit_feedback` cannot work.
The contract returns `{"hypotheses":[{"description","confidence","evidence_summary"}]}` — no ID.
But `submit_feedback(hypothesis_id, verdict, notes)` requires one, the ER model has
`ROOT_CAUSE_HYPOTHESIS.hypothesis_id` as PK, and the sequence diagram literally calls
`submit_feedback(hypothesis_id, verdict=confirmed)`. **FR-10 is unimplementable as frozen.**

Recommended fix: the **MCP server mints the ID** when T5 returns, rather than Track 4 emitting it.
Keeps Track 4 a pure stateless function and means no change to their code. One-line contract edit
now; a cross-track rework if found at Sync 2.

### 4. The architecture diagram contradicts the frozen contract — and hands orchestration to the server.
The original diagram draws `rank_root_causes -.reads.-> classify / score / retrieve / query`.
The contract says `rank_root_causes(classification, anomaly, cases, telemetry)` — those arrive as
**arguments**. These are two different systems. If the server fetches its own inputs, Bob is reduced
to a chat skin over a fixed pipeline, which is precisely the failure mode PRD §0 warns about.
Corrected in `docs/lld/01_architecture.mermaid`: Bob gathers T1–T4 and passes them into T5.

### 5. MixedWM38 is cited to the wrong paper.
The blueprint cites `arxiv.org/pdf/2604.13236` for MixedWM38 — that ID is the *SemiFA* paper.
Correct source: **Wang, Xu, Yang, Zhang, Li, "Deformable Convolutional Networks for Efficient
Mixed-Type Wafer Defect Pattern Recognition", IEEE Trans. Semicond. Manuf. 33(4):587–596, 2020**
([IEEE 9184890](https://ieeexplore.ieee.org/document/9184890), data:
[github.com/Junliangwangdhu/WaferMap](https://github.com/Junliangwangdhu/WaferMap)).
Real figures: 38,015 maps, 52×52, 38 classes = 1 normal + 8 single + 29 mixed.

---

## P1 — Will bite at Sync 2

### 6. Nobody owns the embedding function.
`retrieve_similar_cases(defect_class, sensor_signature, top_k)` does a vector search. Track 2 owns
sensor features; Track 3 owns the vector store; **`CONTRACTS.md` never says how a `sensor_signature`
dict becomes a vector.** An unowned interface between two tracks is exactly what the directory-isolation
scheme was designed to prevent, and it slipped through. Assign it to Track 3, pin
`embedder_version`, and state the vector construction in the contract.

### 7. `matched_case_ids` and `case_id` are two different ID spaces.
Track 2's `flag_at_risk_batch` returns `matched_case_ids` derived from SECOM fail rows. Track 3's
`retrieve_similar_cases` returns `case_id` from the fixture-seeded vector store. Nothing reconciles
them. The moment a report tries to cross-reference "at-risk because it matches HC-018" against a
retrieved case, the evidence trail breaks — quietly, while still looking plausible. Declare
`HISTORICAL_CASE.case_id` the single shared ID space.

### 8. `query_telemetry` returns free text, which can neither be asserted on nor cited precisely.
`{"recent_trend": str}` is unassertable by an eval harness and vague as evidence. Replace with
`direction` (enum: increasing/decreasing/stable/oscillating) + `magnitude_sigma` (float). Keeps a
human-readable string if you want, but the machine-checkable fields are what make the
evidence-citation NFR testable rather than aspirational.

### 9. The fixture schema cannot express the two cases the whole pitch rests on.
`expected_hypothesis_contains: str` is a single substring match. But:
- **Case 6c**'s entire point is a *ranked list* where the correct answer may legitimately sit at #2.
- **Case 3c**'s entire point is that confidence must be **low** — a substring match cannot assert
  "and it wasn't overconfident".

So Track 5's harness is structurally incapable of testing the two differentiators the PRD says the
submission depends on. Extend the fixture schema before freezing:
```json
{ "expected_hypothesis_matches_any": ["test equipment", "measurement", "tester"],
  "expected_in_top_k": 3,
  "max_confidence_ceiling": 0.60,
  "expected_category": "measurement",
  "require_evidence_citation": true }
```

### 10. Twelve of eighteen fixtures are missing — and they're the interesting twelve.
Present: `1a, 2a, 3a, 4a, 5a, 6c`. Missing: `1b, 1c, 2b, 2c, 3b, 3c, 4b, 4c, 5b, 5c, 6a, 6b`.
Every sub-case that tests a **non-process** root cause is in the missing set — 1c (incoming
material), 2c (shared-tool contamination), 3b (positional metadata, not a sensor at all),
4c (firmware change), 5c (access log), 6b (automation software). Those are the cases that prove the
system reasons rather than pattern-matches. See `docs/case-studies.md`.

### 11. The watsonx.ai free tier will run out, quietly, mid-integration.
Lite plan is **20 CUH + 300,000 tokens/month**. Track 4 has 2 LLM calls per case; 18 fixtures re-run
after each of ~5 Sync-2 stub swaps is ~180 calls of fused evidence bundles, plus prompt iteration.
Keep `USE_MOCK_LLM=true` as the **default in CI**, cache real responses to disk as fixtures, and
spend live tokens only on the demo run and one full verification pass.

### 11b. A cheap upgrade worth taking: swap Isolation Forest for Granite TimeSeries.
`ibm-granite/granite-timeseries-ttm-r2` (**TinyTimeMixers, 805k params, Apache 2.0**) fine-tunes on a
laptop in minutes with no GPU — comparable effort to the current Isolation Forest, and it's **IBM's own
model**, which the IBM-technology criterion rewards. The larger
`granite-timeseries-patchtst-fm-r2` (~385M, released 9 Sept 2026) adds a **99-quantile probabilistic
head**, which gives a *calibrated* anomaly band instead of the current hand-tuned 0.60 threshold — and
the same forecast **is** the pre-run risk signal, so FR-4 and FR-8 stop being two unrelated models. It
also does missing-value imputation, which SECOM needs anyway.

Not a blocker, and Isolation Forest is a defensible choice — but this is the highest
value-per-hour change available on Track 2. One caution: **`granite-vision-3.3-2b` is a *document*
VLM** (DocVQA/ChartQA — tables, charts, plots). Do not claim it classifies WM-811K patterns. Its real
fit is the reporting layer.

### 12. Granite model ID is stale.
PRD says "Granite 3.x". Current pay-per-token Granite on watsonx.ai is **`ibm/granite-4-h-small`**
(`ibm/granite-3-8b-base` also available; `granite-8b-code-instruct` and `granite-guardian-3-8b` are
deprecated). SDK is `ibm-watsonx-ai`, and you need three things that fail confusingly if wrong:
API key, `project_id`, and a **region-matched URL** (`https://us-south.ml.cloud.ibm.com` etc).

---

## P2 — Accuracy and hygiene

13. **WM-811K numbers need tightening.** Real: 811,457 maps; **172,950 expert-labeled**, of which
    only **25,519 carry a defect pattern** (147,431 are "none"). And it's **8 defect patterns +
    "none"**, not "9 defect classes" — saying 9 implies nine defect types. Track 1's `NOTES.md` says
    "~125,000 labeled", which matches neither figure; reconcile it against the actual pkl.
14. **The blueprint still carries the exact problem PRD §0 was written to fix.** Part 1.D is titled
    "where Claude fits in", Part 3's closing paragraph says "a single Claude tool-using agent", and
    Part 3 references `S1_LLD_Architecture.mermaid` / `S1_LLD_Sequence_Flow.mermaid` — filenames that
    don't exist (the real ones are `..._BobNative.mermaid`). The §0 correction never propagated
    backwards into the source doc. If a judge reads the blueprint, they read the uncorrected version.
15. **NVIDIA figures are imprecise.** Real: **93.84% → 98.51%**, with 1M unlabeled + 600 labeled
    images via SSL + TAO. "94% → 98.5%" reads like a remembered number rather than a cited one.
16. **One URL has moved:** the Claude Agent SDK post now 308-redirects from `anthropic.com/engineering/`
    to [`claude.com/blog/building-agents-with-the-claude-agent-sdk`](https://claude.com/blog/building-agents-with-the-claude-agent-sdk).
17. **Case Study 6 is the only case with no "Ranked root causes" line** — inconsistent with 1–5, and
    it's the case that most needs an explicit expected ranking. Added in `docs/case-studies.md`.
18. **`__pycache__/*.pyc` is committed.** Nine tracked `.pyc` files. `git rm -r --cached` them.
19. **Nothing has been measured yet.** Both `NOTES.md` files are `___` placeholders and both
    "paste self-test output here" blocks are empty. Every metric in the PRD is currently unbacked.
    The PRD is right that only measured numbers may be quoted — so right now, no number may be quoted.
20. **~~Verify which rubric actually applies~~ — RESOLVED, the PRD was right.** The official
    submission guide confirms PRD §17 exactly: 25 Technical Implementation Quality · 25 Innovation &
    Differentiation · 15 Problem Depth & Vision · 15 Working Demo & Functionality · 10 IBM Bob
    Integration · 10 Documentation & Reproducibility. Video is 3–5 min as the PRD said, track "AI" is
    valid, and `drijesh-ppatel/bob-ai-hackathon-submission-template` is the organiser-designated
    template. No action needed. See `SUBMISSION_GAP.md` for what the guide *does* change.
21. **FR-3 promises a mixed-type flag the contract has no field for.** Either drop the MixedWM38
    language from FR-3 or add an optional `mixed_types: list[str]` now. Given time pressure, dropping
    it is the honest choice — the PRD already lists MixedWM38 as the first thing to cut.

---

## What I'd do in the next work session, in order

1. **Bob spike.** `.bob/mcp.json` + a 3-tool stub. Confirm Bob chains tools from novel phrasing.
   Everything else is worth less until this is proven. (P0-1, P0-2)
2. **Apply the contract edits** — `hypothesis_id`, telemetry enum, fixture schema, embedder owner,
   shared case-ID space — then re-freeze. All five are minutes now, days at Sync 2. (P0-3, P1-6/7/8/9)
3. **Write the remaining 12 fixtures.** Hand-written data, unblocks three tracks. (P1-10)
4. **Actually train the two models** and paste real numbers into both `NOTES.md`. (P2-19)
5. **Fix the citations** and propagate §0 into the blueprint. (P0-5, P2-14/15/16)

## What's good and should not be touched

- The SECOM/WM-811K honesty note. It's rare, it's correct, and it's genuinely differentiating.
- Negative evidence as signal (Case 3) and honest uncertainty (Case 6c). These are the two ideas
  that separate this from a classifier with a chat interface. Protect them in the demo script.
- Pre-run batch flagging as the thing to defend over polish. Correct call — and it's half the brief.
- Directory-exclusive ownership with per-track requirements files. Sound, and it worked: Tracks 1
  and 2 produced conflict-free code without coordination.
- `USE_MOCK_LLM` to avoid blocking on credentials. Exactly right, and now also your token budget.
