"""
test_stdio.py — prove the server actually speaks MCP over stdio.

test_server.py calls the tool functions directly, which verifies the logic but
NOT the transport. This one launches the server as a subprocess exactly the way
Bob does (per .bob/mcp.json), performs the real initialize handshake, lists
tools, and drives a full post-mortem chain over the wire.

This is the automatable half of the "Bob spike" from AGENT_3: it cannot prove
Bob's model chooses the right tools, but it does prove the server Bob connects
to is well-formed, that every tool has a usable schema, and that a client can
carry one tool's output into the next.

    python src/mcp_server/test_stdio.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).parent / "server.py"
EXPECTED_TOOLS = {
    "classify_wafer_map", "score_sensor_anomaly", "retrieve_similar_cases",
    "query_telemetry", "rank_root_causes", "get_corrective_action_playbook",
    "flag_at_risk_batch", "submit_feedback", "pipeline_status",
}


def _body(res):
    c = res.content[0]
    return json.loads(c.text)


async def _run() -> int:
    fails: list[str] = []
    def check(cond, msg):
        if not cond:
            fails.append(msg)

    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            init = await s.initialize()
            print(f"handshake OK -> {init.server_info.name}")

            tools = {t.name: t for t in (await s.list_tools()).tools}
            print(f"tools exposed: {len(tools)}")
            check(EXPECTED_TOOLS <= set(tools),
                  f"missing tools: {sorted(EXPECTED_TOOLS - set(tools))}")
            for name, t in sorted(tools.items()):
                check(bool(t.description),
                      f"{name}: no description - Bob cannot tell when to call it")
                check(isinstance(t.input_schema, dict),
                      f"{name}: no input schema")
                print(f"    {name:<32} required={(t.input_schema or {}).get('required', [])}")

            st = _body(await s.call_tool("pipeline_status", {}))
            mock = st.get("reasoning_mode") == "mock"
            print(f"\npipeline: {st['real_count']} real / {st['stub_count']} stub"
                  f"  reasoning={st.get('reasoning_mode')}")

            # Full post-mortem chain over the wire, Case 6c (the honest-uncertainty case).
            sig = {"sensor_tester_01": 3.1, "sensor_12": 0.0, "sensor_45": 0.1}
            cls = _body(await s.call_tool("classify_wafer_map", {"image_path": "case_6c.png"}))
            an = _body(await s.call_tool("score_sensor_anomaly",
                                         {"lot_id": "L-6c", "sensors": sig}))
            rc = _body(await s.call_tool("retrieve_similar_cases",
                                         {"defect_class": cls["predicted_class"],
                                          "sensor_signature": sig, "top_k": 3}))
            eq = sorted({c["equipment_id"] for c in rc["cases"] if c.get("equipment_id")})
            tl = _body(await s.call_tool("query_telemetry", {"equipment_ids": eq}))
            rk = _body(await s.call_tool("rank_root_causes",
                                         {"classification": cls, "anomaly": an,
                                          "cases": rc, "telemetry": tl}))
            check(rk["hypotheses"], "rank_root_causes returned nothing over stdio")
            top = rk["hypotheses"][0]
            print(f"chain -> {cls['predicted_class']} | anomaly {an['anomaly_score']:.2f} "
                  f"| {top.get('category')} @ {top['confidence']}")

            check(top.get("hypothesis_id"), "no hypothesis_id returned over stdio")
            if not mock:
                check(top.get("category") == "measurement",
                      f"Case 6c should rank a measurement cause first, got {top.get('category')}")
                check(top["confidence"] <= 0.75,
                      f"Case 6c overconfident over stdio: {top['confidence']}")

            pb = _body(await s.call_tool("get_corrective_action_playbook",
                                         {"top_hypothesis": top}))
            check(pb["actions"], "no corrective actions over stdio")

            ar = _body(await s.call_tool("flag_at_risk_batch",
                                         {"lot_id": "L-NEXT",
                                          "planned_process_params": {"slurry_flow_rate": 0.61,
                                                                     "pad_life_pct": 0.42,
                                                                     "head_pressure_psi": 5.1}}))
            check(ar["at_risk"] is True,
                  f"pre-run flag should fire on a Case-1a-like profile, got {ar}")
            print(f"pre-run -> at_risk={ar['at_risk']} "
                  f"sim={ar['similarity_to_historical_low_yield']} {ar['matched_case_ids']}")

            fb = _body(await s.call_tool("submit_feedback",
                                         {"hypothesis_id": top["hypothesis_id"],
                                          "verdict": "confirmed", "notes": "stdio test"}))
            check(fb["status"] == "ok", "submit_feedback failed over stdio")

            bad = _body(await s.call_tool("submit_feedback",
                                          {"hypothesis_id": "H-x", "verdict": "nope"}))
            check(bad["status"] == "error", "invalid verdict must be rejected over stdio")

    if fails:
        print(f"\nFAILED ({len(fails)}):")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("\nPASS - MCP stdio transport, tool schemas, and full chain verified.")
    return 0


def main() -> int:
    return anyio.run(_run)


if __name__ == "__main__":
    raise SystemExit(main())
