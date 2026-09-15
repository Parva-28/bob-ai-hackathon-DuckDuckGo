# AGENT INSTRUCTIONS — Track 4: Root Cause Reasoning (watsonx.ai)

Paste this whole file into your Bob (or coding agent) session as the task brief.

## Your role
You own `src/reasoning/` and `requirements-reasoning.txt` exclusively. Do not
create, edit, or read files outside these paths except `src/contracts/CONTRACTS.md`
and `src/eval/fixtures/*.json` (read-only reference).

## Objective
Build two functions, both calling watsonx.ai internally:

```python
def rank_root_causes(classification: dict, anomaly: dict, cases: dict, telemetry: dict) -> dict:
    """
    Returns:
    { "hypotheses": [
        {"description": str, "confidence": float, "evidence_summary": str}
      ]
    }
    """

def get_corrective_action_playbook(top_hypothesis: dict) -> dict:
    """
    Returns: { "actions": [ {"description": str, "priority": str} ] }
    """
```

## Steps
1. Get watsonx.ai API access set up (Granite model). While waiting on credentials
   or quota, build against a **mocked LLM call** behind an environment variable
   (e.g. `USE_MOCK_LLM=true` returns a canned but realistic response) so you are
   never blocked waiting on infra access. Swap to the real call once credentials
   land — same function signature either way.
2. Design the prompt so every hypothesis in the output **must name a specific
   piece of evidence it draws on** — a sensor name, a `case_id`, or a telemetry
   parameter. A hypothesis like "process drift" with no named source fails the
   contract rule in CONTRACTS.md and should fail your own review before it fails
   someone else's.
3. Deliberately test against Case Study 6 (the fixture with the ambiguous,
   multi-signal excursion). Your prompt should be able to produce a hypothesis
   like "this may be a test-equipment measurement artifact rather than a real
   wafer defect" when the evidence supports it — do not tune the prompt to always
   sound confident. A system that can say "top hypothesis has 40% confidence, here
   are two alternatives" is doing its job; one that always outputs a single
   90%-confidence answer regardless of input isn't reasoning, it's performing.
4. Write `src/reasoning/test_reasoning.py`: run both functions against all 6 case
   study fixtures (using the fixture's `sensor_signature`, mocked classification
   output, and mocked `cases`/`telemetry` — you don't need Track 1/2/3's real code,
   construct plausible mock inputs matching the contract shapes yourself). Print
   each hypothesis and confirm it names evidence.
5. Add dependencies only to `requirements-reasoning.txt`.

## Definition of done
- `test_reasoning.py` runs standalone (mocked LLM is fine) against all 6 fixtures.
- Every hypothesis printed names a specific evidence source.
- Case Study 6's output includes at least one non-process-related hypothesis
  (e.g. measurement/test-equipment) among the ranked list, not just process causes.
- You have not touched any file outside `src/reasoning/` and
  `requirements-reasoning.txt`.

## What not to do
- Don't wait on real watsonx.ai credentials to make progress — mock it and keep
  the same interface.
- Don't wait on Track 1/2's real models — construct mock classification/anomaly
  inputs yourself matching the contract shapes, they're simple dicts.
- Don't optimize your prompt for confident-sounding output on the easy cases at
  the expense of honest uncertainty on Case 6 — that trade-off is exactly what
  the pitch's differentiation depends on (see PRD Section 6).
