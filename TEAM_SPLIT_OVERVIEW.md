# TEAM_SPLIT_OVERVIEW.md — YieldGuard Parallel Build Plan

## Why this split avoids conflicts

Every track owns a directory nobody else touches. The only files more than one
person could plausibly edit — `README.md`, `submission.yaml`, root `requirements.txt`
— are edited by exactly one person (the lead), at defined integration points, never
mid-stream by track owners. Each track maintains its own `requirements-<track>.txt`
so dependency additions never collide.

Nobody needs anyone else's real code to make progress. The lead ships a stub MCP
server on day 1 that returns fake-but-schema-valid responses for all 8 tools. Every
other track builds and self-tests against fixtures, independent of that stub or of
each other. Integration is the lead swapping stub calls for real ones, one at a time.

## Sequence

**Phase 0 — Kickoff (lead, solo, before anyone else starts):**
1. Create repo from `bob-ai-hackathon-submission-template`.
2. Write `CONTRACTS.md` and the JSON schemas in `src/contracts/` (provided below —
   do not let track owners redesign these mid-build; changing a contract after
   people have branched is the one thing that *will* cause conflicts).
3. Convert the 6 case studies (from `S1_Wafer_Yield_Solution_Blueprint.md`) into
   fixture files under `src/eval/fixtures/case_1.json` ... `case_6.json`, each
   containing sub-case variants.
4. Build the stub MCP server: all 8 tools registered, each returns a canned
   schema-valid response pulled from the fixtures.
5. Push to `main`. This is the commit everyone branches from.

**Phase 1 — Parallel build (all 5 people, independent branches):**
- `feat/vision-classifier` (Track 1)
- `feat/anomaly-batchrisk` (Track 2)
- `feat/mcp-bob-integration` (Track 3, lead)
- `feat/reasoning-watsonx` (Track 4)
- `feat/docs-demo-eval` (Track 5)

Each person works entirely inside their owned directory. Merge to `main` as soon as
your own self-test passes — order doesn't matter, directories don't overlap, so
there is nothing to merge-conflict on.

**Sync 1 (roughly the 1/3 mark):** everyone posts their self-test output in the team
channel. Lead confirms every track's output shape actually matches `CONTRACTS.md`
(this is the moment to catch a schema mismatch, before it's baked into two tracks).

**Sync 2 (roughly the 2/3 mark):** lead integrates. Real functions from Tracks 1, 2,
4 get imported into the MCP server, replacing stubs one tool at a time. Track 5's
eval harness runs against the now-real pipeline for all 6 case studies.

**Sync 3 (final stretch):** full run-through live in Bob. Record the demo video.
Freeze `submission.yaml` and `README.md`. Confirm the GitHub Action is green.

## Ground rules

- Track owners never edit another track's directory. If you need a change to
  someone else's output shape, raise it — don't silently change it.
- Track owners never edit `README.md`, `submission.yaml`, `.github/workflows/`, or
  root `requirements.txt`. Propose changes to the lead.
- If your self-test can't pass without another track's real code, you've scoped it
  wrong — go back to the stub/mock and unblock yourself.
- Commit to your own branch early and often; merge to `main` the moment your
  self-test is green, don't wait for a "big" PR at the end.
