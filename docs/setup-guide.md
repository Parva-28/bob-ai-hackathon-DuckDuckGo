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
.venv/bin/pip install -r requirements-mcp.txt
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
16/18 sub-cases passed (275/277 assertions)
by case study: 1:3/3  2:3/3  3:1/3  4:3/3  5:3/3  6:3/3
```

**16/18 is the expected result today, not a broken install.** Sub-cases 3a and 3b currently
fail a known limitation documented below and in `README.md`. Useful flags:

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

Then, in Bob:

1. Open this repository as your workspace — Bob reads `.bob/mcp.json` from the project root.
2. Settings → MCP → **Refresh servers**, then toggle `yieldguard` **on**. Bob does not pick
   up edits to the JSON until you refresh.
3. Switch to **Advanced mode** so `.bob/skills/yieldguard/SKILL.md` loads.
4. Ask it something in your own words — the point is that Bob *chooses* the tools:

   > *"Lot L-4471 came back at 61% yield with a ring of failures near the wafer edge. What happened and what should I do?"*
   >
   > *"Which of tomorrow's lots should I be worried about?"*
   >
   > *"How much of this pipeline is actually trained right now?"* (calls `pipeline_status`)

Leave `alwaysAllow` empty so you can watch each tool call being approved — that visibility
is the point of the demo.

---

## Optional — train the models to replace stubs

`pipeline_status` reports 3 real / 5 stub until the models are trained. Nothing else needs
to change: the server resolves real implementations at import automatically, so training a
model is all that is required to make its tool go live.

### Sensor anomaly + batch risk (Track 2, SECOM — fast)

```bash
.venv/bin/pip install -r requirements-tabular.txt
.venv/bin/python src/models/tabular/data_prep.py
.venv/bin/python src/models/tabular/train.py
.venv/bin/python src/models/tabular/test_anomaly.py
```

SECOM downloads automatically via `ucimlrepo`. Report **recall and precision on the fail
class** — accuracy is ~93% for "predict all pass" and meaningless at this 1:14 imbalance.

### Wafer defect classifier (Track 1, WM-811K — slower)

```bash
.venv/bin/pip install -r requirements-vision.txt
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
| Full eval | `src/eval/run_eval.py` | `16/18 sub-cases passed` |
| Real vs stub | ask Bob, or call `pipeline_status` | `3 real / 5 stub` before training |
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
| `FileNotFoundError: Model checkpoint not found` | Model not trained | Intentional — the module refuses to guess. Run `data_prep.py` then `train.py` |
| watsonx auth fails with a confusing 404 | Region mismatch between `WATSONX_URL` and the project | Match the URL to your project's region |
| Eval passes but results look identical each run | Stubs are deterministic by design | Check `pipeline_status`; train a model to get real inference |
| `.env` appears in `git status` | Should never happen | `.gitignore` line 7 covers it. If tracked, `git rm --cached src/.env` immediately |

---

## Known limitations in the current build

- **Sub-cases 3a and 3b fail (16/18).** Both are Scratch patterns with deliberately clean
  sensors, and their signatures are near-identical, so similarity retrieval cannot separate
  "end-effector wear" from "cassette slot misalignment" and returns them swapped. The
  *category* (handling) is correct in both; the specific cause is not. Distinguishing them
  requires non-sensor context — slot number and handler cycle count — which
  `retrieve_similar_cases` does not currently receive. This is a genuine capability gap, and
  it is left failing rather than masked by a weaker assertion.
- **5 of 9 tools are stubs** until the models are trained. Stubs are fixture-derived and
  schema-valid, so the pipeline is coherent end-to-end, but a green eval run proves the
  **wiring and contract compliance, not model accuracy**. `pipeline_status` always reports
  which is which.
- **Telemetry is simulated**, not a live SECS/GEM connection.
- **Case studies are constructed**, not disclosed fab incidents. SECOM and WM-811K are
  unrelated datasets; any wafer-map/sensor pairing is a constructed pairing.
- **Confidence values are relative rankings**, not calibrated probabilities.
- **`at_risk` is a triage signal for engineer review**, not an automated go/no-go gate.
