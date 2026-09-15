# Setup Guide

Written assuming you have never seen this repository. Every command below was run on a
clean virtual environment on macOS (Apple Silicon, Python 3.14.6) before being written down.

**The fastest useful path is Quickstart — one dependency, about 30 seconds, and it runs the
whole pipeline and the full 18-case eval.** Training the models is optional and only needed
to replace stubs with real inference.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | **3.11 – 3.14** | Verified on 3.14.6. `ibm-watsonx-ai` requires `>=3.11,<3.15` |
| git | any recent | |
| IBM Bob | current | Only needed for the interactive demo, not for the tests |
| Kaggle account | — | Only to train the vision model (WM-811K) |
| IBM Cloud / watsonx.ai | — | Only for live reasoning; `USE_MOCK_LLM=true` avoids it |

No GPU required. Inference is CPU-pinned for portability.

---

## Quickstart — run the pipeline and the eval suite

```bash
git clone https://github.com/Parva-28/bob-ai-hackathon-DuckDuckGo.git
cd bob-ai-hackathon-DuckDuckGo
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

That installs exactly one package (`mcp`). The MCP server, its stores and its stubs are
otherwise standard-library only, so this step does not depend on the ML stack.

**Verify the server logic** — all 18 sub-cases through the full chain:

```bash
.venv/bin/python src/mcp_server/test_server.py
```

Expect a table of 18 rows ending in `PASS - 18 fixtures through the full chain`.

**Verify the MCP transport** — launches the server as a subprocess and performs a real
MCP handshake, exactly as Bob does:

```bash
.venv/bin/python src/mcp_server/test_stdio.py
```

Expect `handshake OK -> yieldguard`, `tools exposed: 9`, then
`PASS - MCP stdio transport, tool schemas, and full chain verified.`

**Run the evaluation harness** — drives the server over MCP and asserts contract rules:

```bash
.venv/bin/python src/eval/run_eval.py
```

```
16/18 sub-cases passed (237/239 assertions, 36 skipped)
by case study: 1:2/3  2:3/3  3:3/3  4:3/3  5:2/3  6:3/3
```

**16/18 with skips is the expected result today, not a broken install.**

The skips are honest: with `USE_MOCK_LLM=true` (the default) the reasoning layer returns
canned responses keyed by defect *pattern*, so all three sub-cases of a case study get an
identical answer. Asserting sub-case wording against that would test the mock, not the
system, so the harness skips those assertions and says so. Contract-level assertions —
evidence citation, `hypothesis_id`, value ranges, rank ordering — still run.

The two failures are real: **`flag_at_risk_batch` does not fire on sub-cases 1a and 5a**,
which are the fixtures designed to be at-risk. See Known Limitations. Useful flags:

```bash
.venv/bin/python src/eval/run_eval.py --case 6        # one case study
.venv/bin/python src/eval/run_eval.py --verbose       # every assertion
.venv/bin/python src/eval/run_eval.py --json out.json # machine-readable
```

---

## Connect it to IBM Bob

`.bob/mcp.json` is committed, but **Bob requires absolute paths**, so the committed copy
points at the original author's checkout. Regenerate it for your machine:

```bash
python3 - <<'PY'
import json, os, sys
repo = os.getcwd()
json.dump({"mcpServers": {"yieldguard": {
    "command": f"{repo}/.venv/bin/python",
    "args": [f"{repo}/src/mcp_server/server.py"],
    "cwd": repo, "env": {}, "alwaysAllow": [], "disabled": False}}},
    open(".bob/mcp.json", "w"), indent=2)
print("wrote .bob/mcp.json for", repo)
PY
```

Verify the registration before opening Bob — this launches the server exactly as
`.bob/mcp.json` specifies and checks every tool is present and described:

```bash
.venv/bin/python src/mcp_server/test_bob_config.py
```

It catches the common failure, which is silent: Bob requires absolute paths, so a
`.bob/mcp.json` written on someone else's machine makes Bob list no tools at all, with no
error explaining why.

Then, in Bob:

1. Open this repository as your workspace — Bob reads `.bob/mcp.json` from the project root.
2. Settings → MCP → **Refresh servers**, then toggle `yieldguard` **on**. Bob does not pick
   up edits to the JSON until you refresh.
3. Switch to **Advanced mode** so `.bob/skills/yieldguard/SKILL.md` loads.
4. **Headless alternative** (BobShell, if `bob` is on your PATH — install it from the IDE's
   command palette, "Install bobshell in PATH"):

   ```bash
   bob -p "Lot L-4471 came back at 61% yield with failures at the wafer centre. What happened?"
   ```

   Output is wrapped in `---output---` tags so a script can parse it. Note `bob -p`
   pre-approves every tool call, which is fine for CI but the opposite of what you want in
   the demo, where the visible approval is the evidence.

5. Ask it something in your own words — the point is that Bob *chooses* the tools:

   > *"Lot L-4471 came back at 61% yield with a ring of failures near the wafer edge. What happened and what should I do?"*
   >
   > *"Which of tomorrow's lots should I be worried about?"*
   >
   > *"How much of this pipeline is actually trained right now?"* (calls `pipeline_status`)

   Lots that exist in the registry: `L-4471`, `L-4402`, `L-4418`, `L-3310`, `L-4815`,
   `L-5120`, `L-5502`, `L-5540` (already run) and `L-4502`, `L-4507`, `L-4511`, `L-4515`
   (planned, for the pre-run path). Asking about any other lot id returns an explicit
   "unknown lot" with the list — the system will not invent data for it.

   Verified transcripts of Bob doing exactly this are in `demo/bob-sessions/`.

Leave `alwaysAllow` empty so you can watch each tool call being approved — that visibility
is the point of the demo.

---

## Optional — train the models to replace stubs

`pipeline_status` reports 3 real / 5 stub until the models are trained. Nothing else needs
to change: the server resolves real implementations at import automatically, so training a
model is all that is required to make its tool go live.

### Sensor anomaly + batch risk (Track 2, SECOM — fast)

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python src/models/tabular/data_prep.py
.venv/bin/python src/models/tabular/train.py
.venv/bin/python src/models/tabular/test_anomaly.py
```

SECOM downloads automatically via `ucimlrepo`. Report **recall and precision on the fail
class** — accuracy is ~93% for "predict all pass" and meaningless at this 1:14 imbalance.

### Wafer defect classifier (Track 1, WM-811K — slower)

```bash
.venv/bin/pip install -r requirements.txt
# Kaggle credentials required: https://www.kaggle.com/settings -> Create New Token
# saves kaggle.json to ~/.kaggle/kaggle.json
.venv/bin/python src/models/vision/data_prep.py
.venv/bin/python src/models/vision/train.py
.venv/bin/python src/models/vision/test_classifier.py
```

Report **macro-F1 on your held-out split**, not a figure from a paper.

### Reasoning (Track 4, watsonx.ai)

```bash
cp src/.env.example src/.env      # .env is gitignored — never commit it
```

Set `WATSONX_API_KEY`, `WATSONX_PROJECT_ID` (watsonx project → Manage → General) and a
**region-matched** `WATSONX_URL` (e.g. `https://us-south.ml.cloud.ibm.com`). A mismatched
region is the most common cause of confusing auth failures.

Set `USE_MOCK_LLM=true` to develop without credentials. **Keep it true in CI** — the
watsonx.ai Lite tier allows 300,000 tokens/month, and repeated 18-fixture eval runs will
exhaust that quickly.

---

## Verifying it works

| Check | Command | Expected |
|---|---|---|
| Server logic | `src/mcp_server/test_server.py` | `PASS - 18 fixtures` |
| MCP transport | `src/mcp_server/test_stdio.py` | `PASS - MCP stdio transport` |
| Full eval | `src/eval/run_eval.py` | `17/18 sub-cases passed` |
| Held-out model performance | `src/eval/holdout_eval.py` | recall 0.286 / precision 0.194 on the fail class |
| Real vs stub | ask Bob, or call `pipeline_status` | `7 real / 1 stub` once Tracks 2 and 4 are installed |
| Bob registration | `src/mcp_server/test_bob_config.py` | `PASS - ... advertises all 9 tools` |
| Bob wiring | ask Bob a novel-phrasing question | Bob calls several tools in sequence |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'mcp.server.fastmcp'` | MCP SDK 2.x renamed FastMCP | Already handled — we use `from mcp.server.mcpserver import MCPServer`. If you pinned `mcp<2`, unpin it |
| Bob does not list the `yieldguard` tools | Relative paths, or the server list was not refreshed | Regenerate `.bob/mcp.json` with absolute paths (above), then Settings → MCP → **Refresh servers** and toggle on |
| Bob ignores `SKILL.md` | Skills need **Advanced mode**; a skill with no `description` frontmatter is silently ignored | Switch to Advanced mode; confirm the frontmatter has both `name` and `description` |
| `run_eval.py` reports 16/18 | Expected — known limitation on 3a/3b | See Known Limitations below |
| `pipeline_status` still shows a tool as `stub` after training | The checkpoint is missing, or the module does not import | Run that track's `test_*.py` standalone first. Track 1 note: `classifier.py` uses `from model import ...` instead of `from .model import ...`, which makes `import src.models.vision` fail and forces a stub fallback |
| `TypeError: ReduceLROnPlateau.__init__() got an unexpected keyword argument 'verbose'` | `verbose` was deprecated in torch 2.2 and removed in later 2.x; it raised before epoch 1 | Fixed in `train.py`. If you see it, you are on an older checkout |
| `RuntimeError: ... expected input[1, 128, 64, 64] to have 1 channels` | `X_*.npy` lacks the channel dimension | `data_prep.py` must save `(N, 1, 64, 64)`. Re-run it rather than hand-building arrays |
| `FileNotFoundError: Model checkpoint not found` | Model not trained | Intentional — the module refuses to guess. Run `data_prep.py` then `train.py` |
| watsonx auth fails with a confusing 404 | Region mismatch between `WATSONX_URL` and the project | Match the URL to your project's region |
| Eval passes but results look identical each run | Stubs are deterministic by design | Check `pipeline_status`; train a model to get real inference |
| `.env` appears in `git status` | Should never happen | `.gitignore` line 7 covers it. If tracked, `git rm --cached src/.env` immediately |

---

## Known limitations in the current build

- **Sensor signatures are expanded to a full vector before scoring.** A case study names
  three or four sensors; the model needs all 582. A sparse signature imputes the rest to
  the median, and a near-all-median vector is maximally *typical* to an Isolation Forest,
  so it scores 0.0 regardless of the named sensors. The MCP boundary therefore expands a
  signature into a representative SECOM row of the lot's class with the named deviations
  overlaid in sigma. Clean-sensor cases (3a-3c, 6b, 6c) build from a pass-class row and
  score 0.000-0.002; excursion cases build from a fail-class row and score 0.134-0.160.
  This is a constructed pairing like every other in the project — a real observation with
  the case's stated deviation overlaid, not a real lot's trace.
- **Anomaly detection performance on unseen data is weak, and this is the measured number.**
  On the held-out SECOM validation split (314 lots, 21 fails) the Isolation Forest achieves
  **recall 0.286, precision 0.194, F1 0.231, ROC-AUC 0.583** at its locked threshold. It
  catches 6 of 21 failing lots and raises 25 false alarms — an engineer reviews 31 lots to
  find 6. ROC-AUC 0.583 is only modestly better than random (0.500), and this is *below* the
  55–70% recall range the literature reports for unsupervised Isolation Forest on SECOM.
  These figures reproduce Track 2's own reported metrics exactly and are what must be quoted
  — never accuracy, which reads 0.873 while the all-pass baseline scores 0.933 and catches
  nothing. Run `src/eval/holdout_eval.py --sweep` for the threshold trade-off.
- **Batch-risk similarity is poorly separated.** With the parameter mapping in place, FR-8
  fires correctly on the designed at-risk lots (1a, 5a at ~0.598), but all 18 sub-cases land
  in a narrow 0.41–0.60 band and 12 of 18 cross the 0.45 threshold. That threshold sits only
  ~0.02 above the documented uninformative-median baseline of 0.4288, so the signal is thin.
  Cosine similarity in 582 dimensions where only two or three features carry information is
  dominated by the median-imputed remainder.
- **The physical-to-SECOM parameter mapping is a constructed correspondence.** SECOM's
  features are anonymised by the dataset authors, so no true physical mapping exists. The
  table in `src/mcp_server/param_map.py` targets features that genuinely separate SECOM's
  fail class from its pass class, but it is not a claim that `sensor_103` is a slurry flow
  meter — it is the same category of construction as the wafer-map/sensor pairings.
- **The vision classifier is trained: macro-F1 0.8576** on a held-out 9,357-map split,
  40 epochs on a Colab T4. Weakest class is **Scratch at F1 0.695 (precision 0.572)**, which
  is also Case Study 3's beat — it classifies the case-study map at 0.987 confidence but is
  not generally reliable on that class. Near-full's F1 of 0.917 rests on only 22 validation
  samples. Full per-class table in `src/models/vision/NOTES.md`. Quote macro-F1, not accuracy:
  "None" is 59% of the split, so predicting it always already scores 0.591.
- **Sub-cases 3a and 3b are indistinguishable by sensor similarity alone.** Both are Scratch
  patterns with deliberately clean sensors, so retrieval cannot separate "end-effector wear"
  from "cassette slot misalignment". Separating them needs non-sensor context (slot number,
  handler cycle count) that `retrieve_similar_cases` does not receive.
- **The reasoning layer emits no `category` field.** The MCP server backfills it from the
  cited or nearest retrieved case, so the field is always present, but it reflects
  *retrieval*, not the reasoner's own judgement. `_category_source` records which.
- **5 of 9 tools are stubs** until the models are trained. Stubs are fixture-derived and
  schema-valid, so the pipeline is coherent end-to-end, but a green eval run proves the
  **wiring and contract compliance, not model accuracy**. `pipeline_status` always reports
  which is which.
- **Telemetry is simulated**, not a live SECS/GEM connection.
- **Case studies are constructed**, not disclosed fab incidents. SECOM and WM-811K are
  unrelated datasets; any wafer-map/sensor pairing is a constructed pairing.
- **Confidence values are relative rankings**, not calibrated probabilities.
- **`at_risk` is a triage signal for engineer review**, not an automated go/no-go gate.
