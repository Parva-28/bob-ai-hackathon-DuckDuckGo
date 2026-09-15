# `src/mcp_server/` — YieldGuard MCP Server (Track 3)

The interaction surface. IBM Bob connects to this over stdio and calls its tools;
**Bob does the orchestrating** — this server never chains its own tools.

## Files

| File | Role |
|---|---|
| `server.py` | The 8 contract tools + `pipeline_status`, registered on an `MCPServer` |
| `stores.py` | `CaseStore` (retrieval), `TelemetryStore` (simulated SECS/GEM), `FeedbackStore` (FR-10) — stdlib only |
| `adapters.py` | Resolves each tool to real track code, else a schema-valid stub |
| `data/cases.json` | 18 historical cases — the shared `case_id` space |
| `data/telemetry.json` | Simulated equipment telemetry for 6 tools |
| `test_server.py` | Self-test: all 18 fixtures through the full chain |
| `test_stdio.py` | Self-test: real MCP handshake + chain over the wire |

## Run

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python src/mcp_server/test_server.py   # logic
.venv/bin/python src/mcp_server/test_stdio.py    # transport
```

Bob launches it via `.bob/mcp.json`; you do not run it by hand for normal use.
After editing `.bob/mcp.json`, use **Refresh servers** in Bob and toggle the server on.

## Design notes

**No vector database.** Cosine similarity over 18 cases in pure Python. Chroma or Qdrant
would pull onnxruntime and a server process to index eighteen records, and would make
this server uninstallable whenever the ML stack breaks on a new Python. `CaseStore.search()`
is the seam — swap it for an ANN index past a few thousand cases.

**One dependency: `mcp`.** Stores, adapters and stubs are stdlib-only, so Track 3 stays
installable independently of torch/scikit-learn. Real models are imported opportunistically.

**Stubs are coherent, not random.** They derive answers from the nearest eval fixture, so
the whole pipeline is demoable and testable before any model is trained — and
`pipeline_status` always reports which tools are actually real.

**The citation rule is enforced in code.** `rank_root_causes` drops any hypothesis with an
empty `evidence_summary` and lists the dropped ids in `rejected_uncited`. With no evidence
at all it returns a `warning` rather than an uncited guess.

**Two behaviours the stub reasoner deliberately reproduces**, so they are testable before
Track 4 lands: a measurement-category hypothesis is confidence-capped (you cannot be
confident about a wafer whose measurement you are disputing — Case 6c), and near-equally
similar precedents from *different* categories cap confidence further and say so in the
evidence (Case 3c).
