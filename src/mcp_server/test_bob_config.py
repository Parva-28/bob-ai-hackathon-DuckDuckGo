"""
test_bob_config.py — pre-flight the Bob integration without needing Bob.

Reads .bob/mcp.json and launches the server EXACTLY as Bob will: same command,
same args, same cwd, same env. Then performs the MCP handshake and checks every
tool Bob would see is present and described.

Why this is separate from test_stdio.py: that one launches the server with
sys.executable and its own arguments, so it proves the server works. This one
proves the *registration Bob actually reads* is correct. Bob requires absolute
paths, so .bob/mcp.json is machine-specific and silently wrong on every machine
but the one that wrote it — the failure mode is Bob simply not listing the tools,
with no error to explain why.

What it cannot check: whether Bob's model chooses the right tools for a given
question. That needs Bob. See docs/setup-guide.md.

    python src/mcp_server/test_bob_config.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[2]
CFG = ROOT / ".bob" / "mcp.json"
SKILL = ROOT / ".bob" / "skills" / "yieldguard" / "SKILL.md"
EXPECTED = {
    "classify_wafer_map", "score_sensor_anomaly", "retrieve_similar_cases",
    "query_telemetry", "rank_root_causes", "get_corrective_action_playbook",
    "flag_at_risk_batch", "submit_feedback", "pipeline_status",
}

fails: list[str] = []
def check(ok, msg):
    if not ok:
        fails.append(msg)


async def _run() -> int:
    if not CFG.exists():
        print(f"FAIL: {CFG} not found")
        return 1
    cfg = json.load(CFG.open())["mcpServers"]["yieldguard"]

    print(f"config   : {CFG.relative_to(ROOT)}")
    print(f"command  : {cfg['command']}")
    print(f"args     : {cfg['args']}")
    print(f"cwd      : {cfg['cwd']}\n")

    # Bob requires absolute paths and silently lists no tools if they are wrong.
    for p in [cfg["command"], *cfg["args"], cfg["cwd"]]:
        exists = os.path.exists(p)
        print(f"  {'ok  ' if exists else 'MISS'}  {p}")
        check(exists, f"path does not exist on this machine: {p}")
        check(os.path.isabs(p), f"path is not absolute (Bob requires absolute): {p}")
    check(cfg.get("disabled") is not True, "server is marked disabled in .bob/mcp.json")

    # Credentials must never live in a committed file.
    for k, v in (cfg.get("env") or {}).items():
        check(not str(v).strip(),
              f"env.{k} has a value — .bob/mcp.json is committed, put secrets in src/.env")

    if fails:
        print("\nFAILED before launch:")
        for f in fails:
            print(f"  - {f}")
        print("\nRegenerate .bob/mcp.json for this machine — see docs/setup-guide.md.")
        return 1

    params = StdioServerParameters(command=cfg["command"], args=cfg["args"],
                                   cwd=cfg["cwd"], env={**os.environ, **(cfg.get("env") or {})})
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            init = await s.initialize()
            print(f"\nhandshake OK -> {init.server_info.name}")
            tools = {t.name: t for t in (await s.list_tools()).tools}
            print(f"tools Bob will see: {len(tools)}")
            missing = EXPECTED - set(tools)
            check(not missing, f"tools missing from the server: {sorted(missing)}")
            for name, t in sorted(tools.items()):
                # A tool with no description is a tool Bob cannot decide when to call.
                check(bool(t.description), f"{name}: no description")
                print(f"  {name:<32} {(t.description or '')[:56]}...")
            st = json.loads((await s.call_tool("pipeline_status", {})).content[0].text)
            print(f"\npipeline: {st['real_count']} real / {st['stub_count']} stub"
                  f" · reasoning={st.get('reasoning_mode')}")

    # The skill is what tells Bob WHEN to reach for these tools.
    check(SKILL.exists(), f"missing {SKILL.relative_to(ROOT)}")
    if SKILL.exists():
        head = SKILL.read_text()[:400]
        check("name:" in head, "SKILL.md frontmatter has no 'name:'")
        # Bob silently ignores a skill whose frontmatter lacks a description.
        check("description:" in head, "SKILL.md frontmatter has no 'description:' — Bob ignores it")
        print(f"skill    : {SKILL.relative_to(ROOT)} (frontmatter ok)")

    if fails:
        print(f"\nFAILED ({len(fails)}):")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("\nPASS - the server Bob launches starts, handshakes, and advertises all 9 tools.")
    print("NOTE: this cannot verify that Bob's model picks the right tools for a question.")
    print("      Open the repo in Bob, refresh MCP servers, and ask in your own words.")
    return 0


def main() -> int:
    return anyio.run(_run)


if __name__ == "__main__":
    raise SystemExit(main())
