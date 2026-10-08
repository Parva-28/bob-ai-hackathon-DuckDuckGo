"""
stream.py — the live fab feed: a Server-Sent Events replay of real recorded tool data.

    GET /api/stream/fab?speed=30&start=auto      (text/event-stream)

Nothing here is a live fab connection and nothing is synthesised. Two recorded sources
are replayed on their own clocks, and the page labels both as replays:

  ETCH-07   LAM 9600 metal-etch traces, 1 sample/s, wafer after wafer in real run
            order, at `speed`x. When a wafer's trace ends the LAM detector scores it
            (src/models/etch/detector.py); the wafer's recorded fault label is sent
            after the score, so the page can show caught / missed / false alarm.
            Caveat: the detector's baseline was fitted on the normal wafers, so those
            are scored in-sample; the 21 fault wafers never were in its training.
  Ion mill  PHM 2018 Flowcool pressure / flow in 10-minute windows, 40x faster than
            the etch clock, with the faults the tools themselves logged. YieldGuard
            does not predict these (src/models/ionmill/NOTES.md); they are shown as
            the tools' own records.

On an etch alarm, YieldGuard opens an investigation itself (auto-triage): it runs
query_telemetry, retrieve_similar_cases and rank_root_causes on that wafer's
evidence, checks every citation (evidence_graph), and sends the result as a
`triage` event. At most one runs at a time, at least 20 s apart: in live mode each
is an LLM call.

Events: etch.samples, etch.wafer, mill.windows, mill.fault, stats, triage, loop.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

import adapters
import evidence_graph
import server as tools

router = APIRouter()
DATA = Path(__file__).parent / "data" / "stream"
_fn = lambda t: getattr(t, "fn", t)                   # noqa: E731  MCPServer wraps each tool
query_telemetry = _fn(tools.query_telemetry)
retrieve_cases = _fn(tools.retrieve_similar_cases)
rank_causes = _fn(tools.rank_root_causes)

TICK_S = 0.1
MILL_RATIO = 40           # ion-mill tool-seconds per etch tool-second
TRIAGE_GAP_S = 20
_ETCH = json.loads((DATA / "etch_traces.json").read_text())
_MILL = json.loads((DATA / "ionmill_slices.json").read_text())


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


def _verdict(alarm: bool, fault: str | None) -> str:
    if alarm and fault:
        return "caught"
    if alarm:
        return "false_alarm"
    return "missed" if fault else "clean"


def _triage(wafer_id: str, scored: dict) -> dict:
    """Open an investigation for an alarmed ETCH-07 wafer, with the server's own tools."""
    t0 = time.monotonic()
    anomaly = {k: scored.get(k) for k in ("anomaly_score", "top_deviating_sensors", "_named_deviations", "_scored_on")}
    tel = query_telemetry(["ETCH-07"], "14d")
    cases = retrieve_cases(None, scored.get("_named_deviations") or {}, 5)
    ranked = rank_causes(None, anomaly, cases, tel)
    evidence_graph.attach(ranked, {"lot": {"equipment_ids": ["ETCH-07"]}, "anomaly": anomaly,
                                   "cases": cases, "telemetry": tel})
    # Context for the engineer, not evidence for the ranking: past incidents on this tool.
    prior = [{"case_id": c["case_id"], "root_cause": c["confirmed_root_cause"]}
             for c in tools.cases._cases if c.get("equipment_id") == "ETCH-07"][:4]
    hyps = ranked.get("hypotheses") or []
    return {
        "wafer": wafer_id,
        "tool": "ETCH-07",
        "alarm_on": list((scored.get("_named_deviations") or {}).items())[:3],
        "hypotheses": [{"title": h.get("description"), "confidence": h.get("confidence"),
                        "category": h.get("category"),
                        "evidence_check": (h.get("evidence_check") or {}).get("summary")} for h in hyps[:2]],
        "no_precedent": bool(cases.get("_no_precedent")),
        "prior_incidents": prior,
        "reasoning_mode": adapters.reasoning_mode(),
        "tool_calls": ["score_sensor_anomaly (LAM 9600 detector)", "query_telemetry", "retrieve_similar_cases",
                       "rank_root_causes"],
        "took_s": round(time.monotonic() - t0, 2),
    }


@router.get("/api/stream/fab")
async def stream_fab(request: Request, speed: float = 30.0, start: str = "auto", mill_t: float = 0.0):
    """`start` is a wafer index (or "auto") and `mill_t` an ion-mill offset, so a paused
    or re-speeded page reconnects where it left off."""
    speed = max(1.0, min(240.0, speed))
    wafers = _ETCH["wafers"]
    first_fault = next((i for i, w in enumerate(wafers) if w["fault"]), 0)
    w0 = int(start) % len(wafers) if start.isdigit() else max(0, first_fault - 3)

    async def gen():
        wi, si = w0, 0                         # etch wafer / sample cursor
        etch_budget = 0.0
        mill_clock = max(0.0, mill_t) % (7 * 24 * 3600)
        mill_idx = [sum(w[0] <= mill_clock for w in t["windows"]) for t in _MILL["tools"]]
        mill_fault_idx = [sum(f["t"] <= mill_clock for f in t["faults"]) for t in _MILL["tools"]]
        counts = {"values": 0, "wafers": 0, "alarms": 0, "caught": 0, "missed": 0, "false_alarm": 0}
        t_start = last_stats = time.monotonic()
        last_triage = -1e9
        triage_task: asyncio.Task | None = None

        yield _sse("hello", {
            "etch": {"tool": _ETCH["tool"], "source": _ETCH["source"], "variables": _ETCH["variables"],
                     "speed": speed, "wafers": len(wafers)},
            "mill": {"source": _MILL["source"], "note": _MILL["note"], "speed": speed * MILL_RATIO,
                     "tools": [t["tool"] for t in _MILL["tools"]]},
        })
        while True:
            if await request.is_disconnected():
                if triage_task:
                    triage_task.cancel()
                return
            # ── ETCH-07: release this tick's samples, score wafers as they end ──
            etch_budget += speed * TICK_S
            rows = []
            while etch_budget >= 1.0:
                etch_budget -= 1.0
                w = wafers[wi]
                rows.append([w["id"], w["step"][si]] + [w["series"][v][si] for v in _ETCH["variables"]])
                si += 1
                if si >= len(w["step"]):
                    if rows:
                        yield _sse("etch.samples", {"rows": rows}); counts["values"] += 6 * len(rows); rows = []
                    scored = dict(adapters.real_score_etch_wafer(w["id"])) if adapters.real_score_etch_wafer else {}
                    alarm = bool(scored.get("alarm"))
                    verdict = _verdict(alarm, w["fault"])
                    counts["wafers"] += 1; counts["alarms"] += alarm; counts[verdict] = counts.get(verdict, 0) + 1
                    yield _sse("etch.wafer", {
                        "id": w["id"], "index": wi, "experiment": w["experiment"],
                        "score": scored.get("anomaly_score"),
                        "alarm": alarm, "top": scored.get("top_deviating_sensors"),
                        "deviations": scored.get("_named_deviations"), "peak": scored.get("_peak_feature"),
                        "recorded_fault": w["fault"], "verdict": verdict,
                    })
                    now = time.monotonic()
                    if alarm and (triage_task is None or triage_task.done()) and now - last_triage >= TRIAGE_GAP_S:
                        last_triage = now
                        yield _sse("triage.start", {"wafer": w["id"]})
                        triage_task = asyncio.create_task(asyncio.to_thread(_triage, w["id"], scored))
                    wi, si = wi + 1, 0
                    if wi >= len(wafers):
                        wi = 0
                        yield _sse("loop", {"source": "etch"})
            if rows:
                yield _sse("etch.samples", {"rows": rows}); counts["values"] += 6 * len(rows)

            # ── ion mill: 10-minute windows and the tools' own fault records ──
            mill_clock += speed * MILL_RATIO * TICK_S
            out, faults = [], []
            for k, t in enumerate(_MILL["tools"]):
                while mill_idx[k] < len(t["windows"]) and t["windows"][mill_idx[k]][0] <= mill_clock:
                    out.append([t["tool"]] + t["windows"][mill_idx[k]]); mill_idx[k] += 1
                while mill_fault_idx[k] < len(t["faults"]) and t["faults"][mill_fault_idx[k]]["t"] <= mill_clock:
                    faults.append({"tool": t["tool"], **t["faults"][mill_fault_idx[k]]}); mill_fault_idx[k] += 1
            if out:
                yield _sse("mill.windows", {"rows": out, "clock": mill_clock}); counts["values"] += 2 * len(out)
            for f in faults:
                yield _sse("mill.fault", f)
            if mill_clock > 7 * 24 * 3600:
                mill_clock, mill_idx, mill_fault_idx = 0.0, [0] * len(mill_idx), [0] * len(mill_idx)
                yield _sse("loop", {"source": "mill"})

            # ── finished triage ──
            if triage_task and triage_task.done():
                try:
                    yield _sse("triage", triage_task.result())
                except Exception as e:  # noqa: BLE001 - report, keep streaming
                    yield _sse("triage", {"error": f"{type(e).__name__}: {e}"})
                triage_task = None

            now = time.monotonic()
            if now - last_stats >= 1.0:
                last_stats = now
                yield _sse("stats", {**counts, "uptime_s": round(now - t_start, 1)})
            await asyncio.sleep(TICK_S)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             # no-transform: the Next dev proxy gzips otherwise, which holds every event back
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})
