"""
src/reasoning — Track 4: Root Cause Reasoning (watsonx.ai)

Public API:
    rank_root_causes(classification, anomaly, cases, telemetry) -> dict
    get_corrective_action_playbook(top_hypothesis) -> dict

MCP server entry point (CONTRACTS.md A6):
    src.reasoning.reasoner — re-exports both functions for adapters.py
"""

from .reasoning import rank_root_causes, get_corrective_action_playbook

__all__ = ["rank_root_causes", "get_corrective_action_playbook"]
