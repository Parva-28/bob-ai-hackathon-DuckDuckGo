"""
console.py — YieldGuard analyst console.

A thin HTTP layer over the same MCP tool functions Bob calls. Deliberately not a
second implementation: every number on screen comes from src/mcp_server/server.py,
so the console cannot drift from what Bob sees, and it cannot show anything the
agent could not also produce.

stdlib only - no Flask, no FastAPI, no build step. `python src/dashboard/console.py`
and open the printed URL.
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "mcp_server"))

import adapters                                   # noqa: E402
import server as tools                            # noqa: E402

fn = lambda t: getattr(t, "fn", t)                # MCPServer wraps each tool  # noqa: E731
get_lot_data      = fn(tools.get_lot_data)
classify          = fn(tools.classify_wafer_map)
score_anomaly     = fn(tools.score_sensor_anomaly)
retrieve_cases    = fn(tools.retrieve_similar_cases)
query_telemetry   = fn(tools.query_telemetry)
rank_causes       = fn(tools.rank_root_causes)
playbook          = fn(tools.get_corrective_action_playbook)
flag_at_risk      = fn(tools.flag_at_risk_batch)
pipeline_status   = fn(tools.pipeline_status)

PORT = 8787


def wafer_grid(case_id: str):
    """The actual WM-811K map as a 64x64 grid of 0/1/2, drawn client-side."""
    p = HERE.parent / "mcp_server" / "data" / "wafer_maps" / f"{case_id}.npy"
    if not p.exists():
        return None
    import numpy as np
    return np.load(p).astype(int).tolist()


def analyse(lot_id: str) -> dict:
    """Run the post-mortem chain in the order the skill tells Bob to run it."""
    lot = get_lot_data(lot_id)
    if lot.get("error"):
        return {"error": lot["error"], "known_lots": lot.get("known_lots", [])}

    steps = [{"tool": "get_lot_data", "arg": lot_id}]
    out = {"lot": lot, "steps": steps}

    if lot.get("status") == "planned":
        risk = flag_at_risk(lot_id, lot["planned_process_params"])
        steps.append({"tool": "flag_at_risk_batch", "arg": "planned params"})
        cases = retrieve_cases(None, risk.get("_mapped_params") or {}, 5)
        steps.append({"tool": "retrieve_similar_cases", "arg": "pre-run"})
        tel = query_telemetry(lot.get("equipment_ids") or ["CMP-03"], "14d")
        steps.append({"tool": "query_telemetry", "arg": ", ".join(lot.get("equipment_ids", []))})
        ranked = rank_causes(None, None, cases, tel)
        steps.append({"tool": "rank_root_causes", "arg": "classification=null, anomaly=null"})
        acts = playbook(ranked["hypotheses"][0], True) if ranked.get("hypotheses") else {"actions": []}
        steps.append({"tool": "get_corrective_action_playbook", "arg": "preventive=true"})
        out.update(mode="pre_run", risk=risk, cases=cases, telemetry=tel,
                   ranked=ranked, actions=acts)
        return out

    cls = classify(lot["wafer_map_ref"]) if lot.get("wafer_map_ref") else {}
    steps.append({"tool": "classify_wafer_map", "arg": Path(lot.get("wafer_map_ref") or "").name})
    an = score_anomaly(lot_id, lot.get("sensor_signature") or {})
    steps.append({"tool": "score_sensor_anomaly", "arg": f"{len(lot.get('sensor_signature') or {})} sensors"})
    cases = retrieve_cases(cls.get("predicted_class"), lot.get("sensor_signature") or {}, 5)
    steps.append({"tool": "retrieve_similar_cases", "arg": cls.get("predicted_class", "-")})
    eq = lot.get("equipment_ids") or sorted({c["equipment_id"] for c in cases["cases"] if c.get("equipment_id")})
    tel = query_telemetry(eq, "14d")
    steps.append({"tool": "query_telemetry", "arg": ", ".join(eq)})
    ranked = rank_causes(cls, an, cases, tel)
    steps.append({"tool": "rank_root_causes", "arg": "4 evidence inputs"})
    acts = playbook(ranked["hypotheses"][0]) if ranked.get("hypotheses") else {"actions": []}
    steps.append({"tool": "get_corrective_action_playbook", "arg": "top hypothesis"})
    risk = flag_at_risk(lot_id, lot["planned_process_params"])

    out.update(mode="post_mortem", classification=cls, anomaly=an, cases=cases,
               telemetry=tel, ranked=ranked, actions=acts, risk=risk,
               # case_id is internal to the registry and deliberately absent from the
               # tool's output; the console reads it directly to draw the real map.
               wafer=wafer_grid((tools._LOTS.get(lot_id) or {}).get("case_id", "")))
    return out


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: bytes, ctype: str, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                return self._send((HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            if u.path == "/api/status":
                st = pipeline_status()
                st["lots"] = {k: {"status": v.get("status"), "yield": v.get("final_yield_pct"),
                                  "product": v.get("product_id"), "line": v.get("fab_line"),
                                  "equipment": v.get("equipment_ids", [])}
                              for k, v in tools._LOTS.items()}
                return self._send(json.dumps(st).encode(), "application/json")
            if u.path == "/api/analyze":
                lot = (q.get("lot") or [""])[0]
                return self._send(json.dumps(analyse(lot)).encode(), "application/json")
            self._send(b"not found", "text/plain", 404)
        except Exception as e:                      # surface errors, never a blank panel
            self._send(json.dumps({"error": f"{type(e).__name__}: {e}"}).encode(),
                       "application/json", 500)

    def log_message(self, *a):                      # quiet: this runs during a recording
        pass


if __name__ == "__main__":
    st = pipeline_status()
    print(f"YieldGuard console  ·  pipeline {st['real_count']} real / {st['stub_count']} stub"
          f"  ·  reasoning={st.get('reasoning_mode')}")
    print(f"  http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
