"""
stores.py — Track 3 backing stores for the YieldGuard MCP server.

Three real implementations owned by Track 3:
  * CaseStore      -> retrieve_similar_cases  (similarity search over historical cases)
  * TelemetryStore -> query_telemetry         (simulated SECS/GEM)
  * FeedbackStore  -> submit_feedback         (engineer verdict write-back, FR-10)

Deliberately stdlib-only. No numpy, no vector database.

# ponytail: cosine similarity over ~18 cases in pure Python, not Chroma/Qdrant.
# A vector DB pulls onnxruntime and a server process to index eighteen records,
# and it would make this server uninstallable whenever torch/numpy break on a new
# Python. Swap CaseStore.search() for a real ANN index when the case count passes
# a few thousand or embeddings stop being raw sensor dicts - the method signature
# is the seam, nothing else changes.
"""

from __future__ import annotations

import json
import math
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

_DATA = Path(__file__).parent / "data"
# `.get(name, default)` returns "" when the var is SET BUT EMPTY, which is exactly how
# it appears in a .env template. Path("") then fails every write. Treat empty as unset.
_FEEDBACK_PATH = Path(os.environ.get("YIELDGUARD_FEEDBACK_PATH") or (_DATA / "feedback.jsonl"))
_PRIOR_PATH = Path(os.environ.get("YIELDGUARD_PRIOR_PATH") or (_DATA / "prior_reads.jsonl"))


# ── similarity ────────────────────────────────────────────────────────────────

def cosine_similarity(a: dict[str, float], b: dict[str, float]) -> float:
    """
    Cosine similarity over the union of two sparse sensor dicts, missing = 0.0.

    Union rather than intersection is deliberate: Case Study 3 (Scratch) has an
    all-quiet sensor signature, and intersection-only scoring would rate it
    identical to every other quiet case. Union keeps non-shared deviations in the
    denominator, so a quiet signature stays far from a loud one.

    Returns 0.0 when either side has no magnitude - two all-zero vectors are not
    "perfectly similar", they are simply uninformative.
    """
    keys = set(a) | set(b)
    if not keys:
        return 0.0
    dot = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    na = math.sqrt(sum(a.get(k, 0.0) ** 2 for k in keys))
    nb = math.sqrt(sum(b.get(k, 0.0) ** 2 for k in keys))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (na * nb)))


# ── case store ────────────────────────────────────────────────────────────────

class CaseStore:
    """
    Historical case store backing retrieve_similar_cases (FR-5).

    This is the single shared case_id space: Track 2's flag_at_risk_batch
    matched_case_ids and Track 3's retrieved case_id refer to the same records,
    so a ranked report can cross-reference them without the evidence trail
    silently breaking (see docs/setup-guide.md).
    """

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or (_DATA / "cases.json")
        self._cases: list[dict] = json.loads(self._path.read_text())["cases"]
        self._lock = threading.Lock()

    def all_ids(self) -> list[str]:
        return [c["case_id"] for c in self._cases]

    def get(self, case_id: str) -> dict | None:
        return next((c for c in self._cases if c["case_id"] == case_id), None)

    # Below this, a "match" is not a precedent. Cosine over disjoint key spaces
    # is exactly 0.0, and returning the top_k of an all-zero ranking hands back
    # whichever case_id sorts first — which is how a LITHO lot was given three
    # CMP-03 slurry precedents and the model grounded a hypothesis on them.
    MIN_SIMILARITY = 0.05

    def search(
        self,
        defect_class: str | None,
        sensor_signature: dict[str, float],
        top_k: int = 5,
        min_similarity: float | None = None,
    ) -> list[dict]:
        """
        Rank cases by sensor similarity, with a modest boost for a matching
        defect class rather than a hard filter.

        Not a hard filter on purpose: Case 6c's whole point is that the wafer map
        says "Near-full" while the real cause sits on the tester. Filtering to the
        predicted class first would hide exactly the cross-class precedent that
        makes the measurement-artifact hypothesis reachable.
        """
        scored = []
        for c in self._cases:
            sim = cosine_similarity(sensor_signature, c.get("sensor_signature", {}))
            if defect_class and c.get("defect_class") == defect_class:
                sim = min(1.0, sim + 0.15)
            scored.append((sim, c))
        scored.sort(key=lambda t: (-t[0], t[1]["case_id"]))
        floor = self.MIN_SIMILARITY if min_similarity is None else min_similarity
        scored = [(sim, c) for sim, c in scored if sim >= floor]
        return [
            {
                "case_id": c["case_id"],
                "similarity": round(sim, 4),
                "confirmed_root_cause": c["confirmed_root_cause"],
                "outcome": c["outcome"],
                "category": c.get("category"),
                "equipment_id": c.get("equipment_id"),
                "provenance": c.get("provenance", "constructed"),
            }
            # No max(1, ...): an empty result is the correct answer when nothing
            # clears the floor. Padding it to one guarantees a spurious precedent.
            for sim, c in scored[:top_k]
        ]

    def add_confirmed(self, case: dict) -> str:
        """Promote an engineer-confirmed hypothesis into the case store (FR-10)."""
        with self._lock:
            case_id = case.get("case_id") or f"HC-FB{len(self._cases) + 1:03d}"
            case["case_id"] = case_id
            case.setdefault("provenance", "engineer_confirmed")
            self._cases.append(case)
            return case_id


# ── telemetry store ───────────────────────────────────────────────────────────

class TelemetryStore:
    """
    Simulated SECS/GEM telemetry backing query_telemetry (FR-4 support).

    Returns `direction` (enum) and `magnitude_sigma` (float) alongside the
    human-readable `recent_trend`. The contract originally returned free text
    only, which an eval harness cannot assert on and a hypothesis cannot cite
    precisely (see docs/setup-guide.md). recent_trend is retained so nothing downstream
    breaks.
    """

    DIRECTIONS = ("increasing", "decreasing", "stable", "oscillating")

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or (_DATA / "telemetry.json")
        self._equipment: dict = json.loads(self._path.read_text())["equipment"]

    def known_equipment(self) -> list[str]:
        return sorted(self._equipment)

    def equipment_meta(self, equipment_id: str) -> dict:
        e = self._equipment.get(equipment_id, {})
        return {
            "tool_type": e.get("tool_type"),
            "chamber_id": e.get("chamber_id"),
            "is_shared_tool": e.get("is_shared_tool", False),
            "is_metrology": e.get("is_metrology", False),
            "days_since_pm": e.get("days_since_pm"),
        }

    def query(self, equipment_ids: list[str], time_window: str = "14d") -> list[dict]:
        out: list[dict] = []
        for eid in equipment_ids:
            e = self._equipment.get(eid)
            if e is None:
                # Explicit miss rather than a silent empty list - the reasoning
                # layer must be able to tell "no drift" from "no such tool".
                out.append({
                    "equipment_id": eid,
                    "parameter": None,
                    "direction": None,
                    "magnitude_sigma": None,
                    "recent_trend": None,
                    "error": f"unknown equipment_id '{eid}'. Known: {', '.join(self.known_equipment())}",
                })
                continue
            for p in e["parameters"]:
                out.append({
                    "equipment_id": eid,
                    "tool_type": e.get("tool_type"),
                    "parameter": p["parameter"],
                    "direction": p["direction"],
                    "magnitude_sigma": p["magnitude_sigma"],
                    "recent_trend": p["recent_trend"],
                    "time_window": time_window,
                })
        return out


# ── feedback store ────────────────────────────────────────────────────────────

class FeedbackStore:
    """
    Engineer verdict write-back (FR-10), appended as JSONL.

    Rejections are recorded as deliberately as confirmations: a false positive
    that is never written back gets reinforced as precedent on the next retrieval.
    """

    VERDICTS = ("confirmed", "rejected")

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or _FEEDBACK_PATH
        self._lock = threading.Lock()

    def submit(self, hypothesis_id: str, verdict: str, notes: str = "") -> dict:
        if verdict not in self.VERDICTS:
            raise ValueError(
                f"verdict must be one of {self.VERDICTS}, got '{verdict}'"
            )
        record = {
            "feedback_id": f"FB-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}",
            "hypothesis_id": hypothesis_id,
            "verdict": verdict,
            "notes": notes,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a") as f:
                f.write(json.dumps(record) + "\n")
        return record

    def all(self) -> list[dict]:
        if not self._path.exists():
            return []
        return [json.loads(l) for l in self._path.read_text().splitlines() if l.strip()]


class PriorReadStore:
    """
    The engineer's own read of a lot, recorded BEFORE the model's ranking is shown.

    This is a cognitive forcing function, and it exists because explanations alone
    make the problem worse. Bansal et al. (CHI 2021) found explanations raised the
    rate at which people accepted AI recommendations regardless of whether those
    recommendations were correct. Bucinca et al. found explanations do not reduce
    over-reliance and may increase it -- only cognitive forcing functions did.

    So the ordering is the intervention: commit your own hypothesis first, then see
    the model's. Persisting it is what makes it more than theatre -- the pair
    (prior read, model ranking, final disposition) is auditable afterwards, and the
    agreement rate between engineer and model becomes a measurable quantity rather
    than an assumption.
    """

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or _PRIOR_PATH
        self._lock = threading.Lock()

    def submit(self, lot_id: str, hypothesis: str, category: str,
               confidence: int, engineer: str = "unknown") -> dict:
        if not str(hypothesis).strip():
            raise ValueError("a prior read needs a hypothesis; an empty one is not a read")
        if not 0 <= int(confidence) <= 100:
            raise ValueError("confidence must be 0-100")
        record = {
            "prior_id": f"PR-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')}",
            "lot_id": lot_id,
            "hypothesis": str(hypothesis).strip(),
            "category": category,
            "confidence": int(confidence),
            "engineer": engineer,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a") as f:
                f.write(json.dumps(record) + "\n")
        return record

    def for_lot(self, lot_id: str) -> list[dict]:
        return [r for r in self.all() if r.get("lot_id") == lot_id]

    def all(self) -> list[dict]:
        if not self._path.exists():
            return []
        return [json.loads(l) for l in self._path.read_text().splitlines() if l.strip()]
