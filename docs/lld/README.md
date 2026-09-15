# Low-Level Design — YieldGuard

Five diagrams. All five were rendered with `@mermaid-js/mermaid-cli@11` and confirmed to parse —
if you edit them, re-run the check below before committing.

| # | File | What it shows | Status vs the original LLD set |
|---|---|---|---|
| 1 | [`01_architecture.mermaid`](01_architecture.mermaid) | Component architecture: Bob as orchestrator, 8 MCP tools, models and stores | **Corrected** — the original had the MCP server orchestrating itself |
| 2 | [`02_sequence_rca.mermaid`](02_sequence_rca.mermaid) | Runtime sequence, **post-mortem** path: "lot X failed, why?" | **Corrected** — adds parallel evidence gathering, the validation gate, graceful degradation, and the explicit no-analysis-warranted branch |
| 3 | [`03_sequence_batch_risk.mermaid`](03_sequence_batch_risk.mermaid) | Runtime sequence, **pre-run** path: "which of tomorrow's lots are at risk?" | **New** — FR-8 had no diagram at all |
| 4 | [`04_data_model.mermaid`](04_data_model.mermaid) | Entity-relationship model | **Corrected** — 5 structural fixes, incl. one that made Case Study 3 unrepresentable |
| 5 | [`05_eval_and_build_flow.mermaid`](05_eval_and_build_flow.mermaid) | Build sequencing, integration gates, and the eval assertion chain | **New** |

Each file carries a header comment naming exactly what changed from the original and why. The
reasoning behind every correction is in [`../setup-guide.md`](../setup-guide.md).

## The three corrections that matter most

**1 — Bob must do the orchestrating (diagram 1).** The original drew
`rank_root_causes -.reads.-> classify / score / retrieve / query`, i.e. the MCP server fetching its
own inputs. But the frozen contract is `rank_root_causes(classification, anomaly, cases, telemetry)`
— those arrive as **arguments**. If the server self-orchestrates, Bob is a chat skin over a fixed
pipeline, which is the exact failure mode docs/solution-overview.md was written to prevent. Diagrams 1 and 2 now show
Bob gathering T1–T4 and passing the results into T5.

**2 — FR-8 needed its own sequence (diagram 3).** The pre-run path is not the post-mortem path with
different data: `classify_wafer_map` and `score_sensor_anomaly` are **unavailable by construction**,
because no wafer map and no test results exist yet. That means `rank_root_causes` is called with two
of its four inputs null, and the prompt has to produce *risk drivers* rather than a diagnosis of a
failure that hasn't happened. That's a real design constraint the original LLD never surfaced — and
it's half the problem statement.

**3 — Case Study 3 was unrepresentable (diagram 4).** The original hung every
`ROOT_CAUSE_HYPOTHESIS` off an `ANOMALY_SCORE` via `score_id`. Case 3 (Scratch pattern, clean
sensors, mechanical handling) is the flagship negative-evidence differentiator — and it has no
meaningful anomaly score to hang off. `ANALYSIS_RUN` is now the anchor, with classification and
anomaly as *optional* evidence, either of which may be absent. The model also gains
`BATCH_RISK_ASSESSMENT` (FR-8 previously persisted nowhere), an explicit `EVIDENCE_CITATION` table
that makes the evidence-citation NFR a schema constraint rather than a code convention, and an
`absence_of_signal` evidence type so "no sensor deviation" is a citable finding.

## Verify they render

```bash
for f in docs/lld/*.mermaid; do npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "/tmp/$(basename "$f" .mermaid).svg" || echo "FAILED: $f"; done
```

Two mermaid gotchas that bit during authoring, in case you extend these: in sequence diagrams a
**semicolon terminates the statement**, so `sigma; matches case` silently truncates the message and
throws a parse error on the *following* line. **Braces and double quotes** in message text break the
parser too — write payloads as `hypotheses:[id:H-1, confidence:0.72]` rather than JSON.
