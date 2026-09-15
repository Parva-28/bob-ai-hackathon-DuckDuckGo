"""
run_eval.py — YieldGuard evaluation harness (Track 5).

Drives the YieldGuard MCP server over a REAL stdio MCP connection — the same way
IBM Bob does — across all 18 case-study sub-cases, and reports pass/fail per
assertion.

Going over the wire rather than importing the tool functions is deliberate: it
exercises the transport, the tool schemas and the JSON round-trip, so a result
here means "a client like Bob can actually do this", not merely "the Python
works".

Every run prints which tools are backed by trained models and which are stubs,
and the summary is labelled accordingly. A green run against a stubbed pipeline
proves the wiring, not the science — the harness says so rather than letting a
reader assume otherwise.

    python src/eval/run_eval.py              # all 18 sub-cases
    python src/eval/run_eval.py --case 6     # one case study
    python src/eval/run_eval.py --verbose    # per-assertion detail
    python src/eval/run_eval.py --json out.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "src" / "mcp_server" / "server.py"
FIXTURES = ROOT / "src" / "eval" / "fixtures"

G, R, Y, DIM, RST = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    G = R = Y = DIM = RST = ""


def _body(res):
    return json.loads(res.content[0].text)


class Result:
    def __init__(self, case_id: str):
        self.case_id = case_id
        self.checks: list[tuple[str, bool, str]] = []
        self.skipped: list[tuple[str, str]] = []
        self.summary: dict = {}

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append((name, bool(ok), detail))
        return bool(ok)

    def skip(self, name: str, why: str) -> None:
        self.skipped.append((name, why))

    @property
    def passed(self) -> bool:
        return all(ok for _, ok, _ in self.checks)

    @property
    def failures(self) -> list[tuple[str, str]]:
        return [(n, d) for n, ok, d in self.checks if not ok]


async def evaluate(session: ClientSession, fx: dict, mock: bool = False) -> Result:
    """Run one sub-case through the full chain Bob would drive."""
    r = Result(fx["case_id"])
    sig = fx["sensor_signature"]

    # 1-2. evidence gathering (independent)
    cls = _body(await session.call_tool("classify_wafer_map",
                                        {"image_path": f"{fx['case_id']}.png"}))
    an = _body(await session.call_tool("score_sensor_anomaly",
                                       {"lot_id": fx["case_id"], "sensors": sig}))

    # 3-4. precedent + tool state
    rc = _body(await session.call_tool("retrieve_similar_cases",
                                       {"defect_class": cls["predicted_class"],
                                        "sensor_signature": sig, "top_k": 5}))
    equipment = sorted({c["equipment_id"] for c in rc["cases"] if c.get("equipment_id")})
    tl = _body(await session.call_tool("query_telemetry",
                                       {"equipment_ids": equipment or ["CMP-03"]}))

    # 5. the orchestration point — all four results passed IN as arguments
    rk = _body(await session.call_tool("rank_root_causes",
                                       {"classification": cls, "anomaly": an,
                                        "cases": rc, "telemetry": tl}))
    hyps = rk.get("hypotheses", [])

    # ---- classification ----
    if fx.get("expected_predicted_class"):
        r.check("predicted_class",
                cls["predicted_class"] == fx["expected_predicted_class"],
                f"expected {fx['expected_predicted_class']}, got {cls['predicted_class']}")
    r.check("confidence_in_range", 0.0 <= cls["confidence"] <= 1.0,
            f"confidence={cls['confidence']}")

    # ---- anomaly ----
    r.check("anomaly_in_range", 0.0 <= an["anomaly_score"] <= 1.0,
            f"anomaly_score={an['anomaly_score']}")
    r.check("top_sensors_capped", len(an.get("top_deviating_sensors", [])) <= 5,
            "contract caps top_deviating_sensors at 5")
    if fx.get("expected_anomaly_low"):
        r.check("negative_evidence", an["anomaly_score"] < 0.30,
                f"quiet-sensor case should score low, got {an['anomaly_score']:.2f}")

    # ---- retrieval ----
    r.check("cases_retrieved", bool(rc["cases"]), "no historical cases returned")

    # ---- ranking ----
    if not r.check("hypotheses_returned", bool(hyps), "rank_root_causes returned none"):
        r.summary = {"predicted_class": cls["predicted_class"],
                     "anomaly_score": an["anomaly_score"]}
        return r

    top = hyps[0]
    k = fx.get("expected_in_top_k", 1)
    topk = hyps[:k]

    r.check("every_hypothesis_cites_evidence",
            all(str(h.get("evidence_summary") or "").strip() for h in hyps),
            "a hypothesis carried no evidence_summary")
    r.check("hypothesis_ids_minted", all(h.get("hypothesis_id") for h in hyps),
            "submit_feedback needs a hypothesis_id")
    r.check("rank_ordered", [h.get("rank") for h in hyps] == sorted(h.get("rank", 0) for h in hyps),
            "hypotheses not returned in rank order")

    if fx.get("expected_category"):
        cats = [h.get("category") for h in topk]
        if all(c is None for c in cats):
            # The reasoning layer emits no `category` at all (CONTRACTS A1 makes it
            # recommended, not required). Report it once as a capability gap rather
            # than as 18 identical assertion failures.
            r.skip(f"category_in_top_{k}", "reasoning layer emits no 'category' field")
        else:
            r.check(f"category_in_top_{k}", fx["expected_category"] in cats,
                    f"expected '{fx['expected_category']}', top {k} = {cats}")

    if fx.get("expected_hypothesis_matches_any"):
        if mock:
            # Mock responses are keyed by defect pattern, so all sub-cases of a case
            # study share one canned answer. Asserting sub-case wording here would
            # test the mock, not the system.
            r.skip(f"hypothesis_wording_in_top_{k}", "mock reasoning: canned per defect pattern")
        else:
            blob = " ".join(f"{h.get('description','')} {h.get('evidence_summary','')}"
                            for h in topk).lower()
            hit = [m for m in fx["expected_hypothesis_matches_any"] if m.lower() in blob]
            r.check(f"hypothesis_wording_in_top_{k}", bool(hit),
                    f"none of {fx['expected_hypothesis_matches_any']} appeared")

    if fx.get("max_confidence_ceiling") is not None and not mock:
        r.check("honest_uncertainty",
                top["confidence"] <= fx["max_confidence_ceiling"],
                f"overconfident: {top['confidence']} > {fx['max_confidence_ceiling']}")

    # ---- corrective actions ----
    pb = _body(await session.call_tool("get_corrective_action_playbook",
                                       {"top_hypothesis": top}))
    r.check("actions_returned", bool(pb.get("actions")), "no corrective actions")
    r.check("action_priorities_valid",
            all(a.get("priority") in ("high", "medium", "low") for a in pb.get("actions", [])),
            "invalid priority value")

    # ---- pre-run path (FR-8) ----
    ar = _body(await session.call_tool("flag_at_risk_batch",
                                       {"lot_id": fx["case_id"],
                                        "planned_process_params": fx["planned_process_params"]}))
    r.check("at_risk_is_bool", isinstance(ar.get("at_risk"), bool), "at_risk not boolean")
    if fx.get("expected_at_risk"):
        r.check("pre_run_flag_fires", ar["at_risk"] is True,
                f"expected at_risk=True, got {ar.get('at_risk')} "
                f"(sim={ar.get('similarity_to_historical_low_yield')})")

    # ---- feedback loop (FR-10) ----
    fb = _body(await session.call_tool("submit_feedback",
                                       {"hypothesis_id": top["hypothesis_id"],
                                        "verdict": "confirmed",
                                        "notes": f"run_eval {fx['case_id']}"}))
    r.check("feedback_written", fb.get("status") == "ok", str(fb))

    r.summary = {
        "predicted_class": cls["predicted_class"],
        "anomaly_score": round(an["anomaly_score"], 3),
        "top_hypothesis": top.get("description", ""),
        "confidence": top.get("confidence"),
        "category": top.get("category"),
        "at_risk": ar.get("at_risk"),
        "evidence": top.get("evidence_summary", ""),
    }
    return r


async def _run(args) -> int:
    fixtures = [json.loads(p.read_text()) for p in sorted(FIXTURES.glob("case_*.json"))]
    if args.case:
        fixtures = [f for f in fixtures if str(f.get("case_study")) == str(args.case)]
    if not fixtures:
        print(f"no fixtures matched --case {args.case}")
        return 2

    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    async with stdio_client(params) as (rd, wr):
        async with ClientSession(rd, wr) as session:
            await session.initialize()
            status = _body(await session.call_tool("pipeline_status", {}))
            mock = status.get("reasoning_mode") == "mock"

            print(f"\nYieldGuard eval — {len(fixtures)} sub-cases over MCP stdio")
            print(f"pipeline: {status['real_count']} real / {status['stub_count']} stub")
            stubbed = [n for n, m in status["tools"].items() if m == "stub"]
            if stubbed:
                print(f"{Y}stubbed: {', '.join(stubbed)}{RST}")
                for name, why in (status.get("stub_reasons") or {}).items():
                    print(f"{DIM}    {name}: {why[:90]}{RST}")
            print(f"reasoning: {status.get('reasoning_mode', 'unknown')}")
            if mock:
                print(f"{Y}MOCK reasoning — canned responses keyed by defect pattern. "
                      f"Sub-case wording and confidence-ceiling assertions are SKIPPED,{RST}")
                print(f"{Y}      because they would test the mock. Run with USE_MOCK_LLM=false "
                      f"for the real result.{RST}")
            print()

            results = [await evaluate(session, fx, mock) for fx in fixtures]

    # ---- report ----
    w = 54
    print(f"{'case':<9} {'class':<10} {'anom':>5}  {'top hypothesis':<{w}} {'conf':>5} "
          f"{'category':<12} {'risk':<5} result")
    print("-" * (9 + 11 + 7 + w + 7 + 13 + 6 + 8))
    current = None
    for r in results:
        study = r.case_id.split("_")[1][0]
        if study != current:
            current = study
            print(f"{DIM}--- Case Study {study} {'-' * 100}{RST}"[:130])
        s = r.summary
        mark = f"{G}PASS{RST}" if r.passed else f"{R}FAIL{RST}"
        print(f"{r.case_id:<9} {str(s.get('predicted_class','-')):<10} "
              f"{s.get('anomaly_score', 0):>5.2f}  "
              f"{str(s.get('top_hypothesis',''))[:w]:<{w}} "
              f"{str(s.get('confidence','-')):>5} {str(s.get('category','-')):<12} "
              f"{('YES' if s.get('at_risk') else '-'):<5} {mark}")
        if args.verbose or not r.passed:
            for name, ok, detail in r.checks:
                if args.verbose:
                    print(f"    {G+'ok  '+RST if ok else R+'FAIL'+RST} {name}"
                          + (f" — {detail}" if detail and not ok else ""))
                elif not ok:
                    print(f"    {R}FAIL{RST} {name} — {detail}")

    npass = sum(1 for r in results if r.passed)
    total_checks = sum(len(r.checks) for r in results)
    failed_checks = sum(len(r.failures) for r in results)
    nskip = sum(len(r.skipped) for r in results)
    print("-" * (9 + 11 + 7 + w + 7 + 13 + 6 + 8))
    print(f"\n{npass}/{len(results)} sub-cases passed "
          f"({total_checks - failed_checks}/{total_checks} assertions"
          + (f", {nskip} skipped" if nskip else "") + ")")
    if nskip:
        reasons = sorted({w for r in results for _, w in r.skipped})
        for w in reasons:
            print(f"{Y}  skipped: {w}{RST}")

    studies = {}
    for r in results:
        studies.setdefault(r.case_id.split("_")[1][0], []).append(r.passed)
    print("by case study: " + "  ".join(
        f"{k}:{sum(v)}/{len(v)}" for k, v in sorted(studies.items())))

    if stubbed:
        print(f"\n{Y}NOTE: {len(stubbed)} of 9 tools are stubs. This run proves the "
              f"pipeline wiring and contract compliance,{RST}")
        print(f"{Y}      not model accuracy. Do not quote it as a model result.{RST}")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "pipeline": status,
            "passed": npass, "total": len(results),
            "results": [{"case_id": r.case_id, "passed": r.passed,
                         "failures": r.failures, **r.summary} for r in results],
        }, indent=2))
        print(f"\nwrote {args.json}")

    return 0 if npass == len(results) else 1


def main() -> int:
    p = argparse.ArgumentParser(description="YieldGuard eval harness")
    p.add_argument("--case", help="run only one case study, e.g. 6")
    p.add_argument("--verbose", action="store_true", help="show every assertion")
    p.add_argument("--json", help="write machine-readable results to this path")
    return anyio.run(_run, p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
