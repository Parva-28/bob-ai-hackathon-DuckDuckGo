#!/usr/bin/env python3
"""
Write .bob/mcp.json for THIS machine.

Bob needs absolute paths, so this file cannot be committed once and shared. It was
checked in pointing at a Windows install (C:/Users/heet1/...), which meant Bob
silently failed to start the MCP server for everyone else on the team. Run this
after cloning, and again if you move the repo.

    python3 scripts/setup-bob-mcp.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
venv = ROOT / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
python = venv if venv.exists() else Path(sys.executable)

cfg = {
    "mcpServers": {
        "yieldguard": {
            "command": str(python),
            "args": [str(ROOT / "src" / "mcp_server" / "server.py")],
            "cwd": str(ROOT),
            # Credentials are NOT set here. This file is committed so judges can see
            # the Bob wiring; the server reads src/.env itself.
            "env": {},
            "alwaysAllow": [],
            "disabled": False,
        }
    }
}
out = ROOT / ".bob" / "mcp.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(cfg, indent=2) + "\n")
print(f"wrote {out}")
print(f"  python : {python}")
print(f"  server : {cfg['mcpServers']['yieldguard']['args'][0]}")
if not venv.exists():
    print("  NOTE: no .venv found, used the current interpreter.")
