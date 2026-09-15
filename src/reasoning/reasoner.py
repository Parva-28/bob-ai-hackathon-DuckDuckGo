"""
reasoner.py — canonical entry point for the MCP server adapter (see CONTRACTS.md A6).

The MCP server (src/mcp_server/adapters.py) imports:
    from src.reasoning.reasoner import rank_root_causes, get_corrective_action_playbook

This module re-exports both functions from the main implementation module so the
adapter finds them regardless of which file name it uses.
"""

from reasoning.reasoning import rank_root_causes, get_corrective_action_playbook  # noqa: F401

__all__ = ["rank_root_causes", "get_corrective_action_playbook"]
