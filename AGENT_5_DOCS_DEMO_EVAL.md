# AGENT INSTRUCTIONS — Track 5: Docs, Demo & Eval Harness

Paste this whole file into your Bob (or coding agent) session as the task brief.

## Your role
You own `docs/`, `demo/`, `presentation/`, and `src/eval/` (excluding
`src/eval/fixtures/`, which the lead creates at kickoff — you read those, you don't
recreate them). Do not edit `README.md` or `submission.yaml` directly — propose
changes to the lead, who owns those at integration points.

## Objective
Two parallel jobs that don't block on anyone else's real code:

### Job A — Documentation (start immediately, using the PRD)
`PRD.md` and `S1_Wafer_Yield_Solution_Blueprint.md` already contain nearly all the
content you need — this is largely disciplined adaptation, not fresh writing:

- `docs/problem-statement.md` — adapt PRD Section 2, including the honesty note in
  Section 9 about SECOM and WM-811K being separate, unrelated datasets. Don't drop
  that caveat — judges respect it (see PRD Section 17, "Problem Depth" scoring).
- `docs/solution-overview.md` — adapt PRD Section 6. Lead with the three things
  that make this non-obvious (negative evidence, honest uncertainty, pre-run batch
  flagging), not a feature list.
- `docs/architecture.md` — use `S1_LLD_Architecture_BobNative.mermaid` and
  `S1_LLD_Sequence_BobNative.mermaid` as the diagrams, plus the component table
  from PRD Section 10. **Check with the lead before finalizing** — if integration
  changed anything about how Bob actually calls the MCP server, the diagram needs
  to match the real code, not the plan.
- `docs/setup-guide.md` — write this by literally following your own install steps
  on a clean checkout. If you hit a snag, that snag becomes a line in the
  troubleshooting table, not something you silently work around from memory.

### Job B — Eval harness (build against fixtures + stub server first)
1. Build `src/eval/run_eval.py`: loads every fixture in
   `src/eval/fixtures/case_*.json`, calls the MCP server's tools in sequence
   (classify → anomaly → retrieve → telemetry → rank → corrective action), and
   checks the output against `expected_hypothesis_contains` in each fixture.
2. Run this against the **stub server** first (available from Phase 0) — this
   proves your harness works before any real model exists.
3. Re-run it after each of the lead's Sync 2 integration swaps, and again at
   Sync 3 against the fully real pipeline. Report pass/fail per case study.

### Job C — Demo & presentation (can start planning early, finalize late)
- Script the demo video around Case Study 1 (a clean, confident win) and Case
  Study 6c (the ambiguous case, root cause is the test equipment, not the wafer)
  — that pairing is the strongest differentiator in the whole submission
  (PRD Section 13). Don't just demo the easy case.
- Slide deck order per the template: Problem → Solution → Demo/architecture →
  IBM technology integration (name both Bob and watsonx.ai explicitly, and show
  the architecture diagram, not just a logo) → Impact.
- `README.md`'s Known Limitations section: draft it from PRD Section 15, hand to
  lead for final inclusion.

## Definition of done
- All four `docs/` files exist and contain real project-specific content, no
  template placeholder text remaining (search for `[` before handing to lead).
- `run_eval.py` runs standalone against the stub server and prints a pass/fail
  table for all 6 case studies.
- Demo video script is written and timed to 3–5 minutes before the final
  recording session.

## What not to do
- Don't wait for the real ML models to start writing docs — the PRD has the
  content, your job is disciplined adaptation, not waiting.
- Don't let the pitch deck imply the case studies are real historical fab
  incidents — say plainly they're constructed from real defect taxonomy and
  documented failure modes (PRD Section 13).
- Don't touch `README.md` or `submission.yaml` directly — hand content to the lead.
