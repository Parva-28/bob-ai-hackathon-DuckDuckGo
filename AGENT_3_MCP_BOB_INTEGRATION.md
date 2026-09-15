# AGENT INSTRUCTIONS — Track 3: MCP Server & Bob Integration (Lead Track)

This is the lead's own track — the highest scoring risk in the whole project
(Criterion 5, IBM Bob Integration, 10 pts, explicitly penalizes Bob being
name-dropped rather than load-bearing). Do this one carefully, don't delegate the
verification step even if you delegate the coding.

## Your role
You own `src/mcp-server/`, `src/bob-config/`, `src/contracts/`, and — at
integration points only — `README.md`, `submission.yaml`, and root
`requirements.txt`. You are also the only person who merges other tracks' real
code into the pipeline.

## Objective, Phase 0 (before anyone else starts)
1. Write `src/contracts/CONTRACTS.md` (already drafted — copy it in) and freeze it.
2. Convert the 6 case studies into `src/eval/fixtures/case_1.json` ... `case_6.json`
   with sub-cases, per the fixture format in CONTRACTS.md.
3. Build the **stub MCP server**: register all 8 tools
   (`classify_wafer_map`, `score_sensor_anomaly`, `flag_at_risk_batch`,
   `retrieve_similar_cases`, `query_telemetry`, `rank_root_causes`,
   `get_corrective_action_playbook`, `submit_feedback`), each returning a
   schema-valid canned response pulled from the fixtures. Nobody else can start
   until this is on `main`.
4. **Do the Bob spike now, not later.** Register this stub server with Bob (custom
   mode or MCP config) and confirm Bob will call a tool conditionally based on how
   a question is phrased — not by following one fixed hardcoded prompt template.
   If Bob can't do this reliably with a stub server, that's a blocking problem to
   solve before four people build real code on top of an integration that doesn't
   actually work. This is the single most important thing to de-risk first.

## Objective, Phase 1 (in parallel with everyone else)
- Build the real implementations you own directly: `retrieve_similar_cases`
  (vector store — Qdrant or Chroma, seeded from the fixtures), `query_telemetry`
  (simulated SECS/GEM, can be a lookup table keyed by equipment_id for the
  hackathon), `submit_feedback` (writes verdict back into the vector store).
- Do not start importing Track 1/2/4's real code yet — keep using stubs for
  `classify_wafer_map`, `score_sensor_anomaly`, `flag_at_risk_batch`,
  `rank_root_causes`, `get_corrective_action_playbook` until Sync 2.

## Objective, Sync 2 (integration)
- Pull each track's merged branch. Import their real functions into the MCP
  server, replacing stubs one tool at a time — after each swap, rerun the eval
  harness (Track 5's) against all 6 case study fixtures before swapping the next.
- If a track's real function doesn't match the contract shape, fix the call site
  in your integration code, don't ask them to change their internal
  implementation under time pressure — the contract was the interface, not their
  internals.
- Merge `requirements-vision.txt`, `requirements-tabular.txt`,
  `requirements-reasoning.txt`, `requirements-eval.txt` into root
  `requirements.txt`.

## Objective, Sync 3 (final)
- Full run-through live in Bob, engineer-phrased questions, not scripted commands.
- Update `docs/architecture.md` if the real implementation deviated from the PRD's
  Bob-native diagram in any material way — don't ship a diagram that no longer
  matches the code, a judge will read both.
- Fill and freeze `submission.yaml` and `README.md`.
- Confirm the GitHub Action (`Validate Submission`) is green.

## Definition of done
- A judge can ask Bob a question in their own words and watch it choose and chain
  the right MCP tool calls — this is what "load-bearing" needs to look like when
  someone reads the code and watches the demo.
- All 6 case study fixtures produce a hypothesis with a named evidence source
  (per the `rank_root_causes` contract rule) when run through the real pipeline.
