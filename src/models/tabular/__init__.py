# src/models/tabular/__init__.py
# Public API for the tabular track — import this for MCP server integration.
from .anomaly import score_sensor_anomaly, flag_at_risk_batch  # noqa: F401
