# Analyst console

A read-only window onto the same MCP tools IBM Bob calls. **Not a second implementation** —
`console.py` imports the tool functions from `src/mcp_server/server.py`, so every value on
screen is one Bob could also produce, and the console cannot drift from the agent.

```bash
.venv/bin/python src/dashboard/console.py     # http://127.0.0.1:8787
```

stdlib only. No Flask, no npm, no build step.

## What it shows

- **Lot rail** — completed lots with final yield, and scheduled lots that have not run
- **Wafer map** — the actual WM-811K bin map for the lot, drawn from the `.npy` the
  classifier reads. Blue = passing die, red = failing die
- **Sensor anomaly** — score from the full 582-feature vector, with the case's named
  deviations in sigma
- **Ranked root causes** — with the evidence string, and case ids / sensor names highlighted
- **Corrective actions**, **telemetry**, **historical precedent**
- **MCP tool chain** — the tools that ran, in order. This is the orchestration made visible;
  in a terminal it is invisible, which is the main reason this console exists

Selecting a scheduled lot switches to the pre-run view: no wafer map and no anomaly panel,
because neither exists before a lot runs.

## Honesty in the UI

The console reports its own limitations rather than looking better than the system is:

- A **REASONING MOCK/LIVE** pill and an **n/8 TOOLS TRAINED** pill in the header
- A banner over the hypotheses when `USE_MOCK_LLM=true`, explaining that responses are canned
  per defect pattern so sub-cases sharing a pattern return identical text
- Category badges rendered **dashed** and labelled `derived from HC-xxx` when the category was
  backfilled from retrieved precedent rather than produced by the reasoner — these can
  disagree with the wording above them
- A note when retrieval found no close precedent, instead of a column of 0.00 similarities
- Quiet sensors labelled as **measured** evidence, not a missing measurement
- A footer stating the constructed-pairing provenance

## For the demo

Good beats: **L-4471** (clean post-mortem), **L-3310** (Scratch — the negative-evidence
reasoning is spelled out in the evidence line), **L-5502** (test-head artifact), and any
scheduled lot for the pre-run path.

Run it beside the Bob session rather than instead of it — Bob choosing the tools is the
thing being judged, and this shows the result of those same calls.
