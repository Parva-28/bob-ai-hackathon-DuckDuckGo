"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Activity,
  AlertTriangle,
  Cpu,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

interface EquipmentTool {
  id: string;
  type: string;
  chamber: string;
  status: "Excursion" | "Warning" | "Nominal";
  daysSincePm: number;
  anomalyScore: string;
  isShared?: boolean;
  parameters: {
    parameter: string;
    value: string;
    sigma: number;
    trend: string;
    direction: "increasing" | "decreasing" | "oscillating" | "stable";
  }[];
  maintenanceHistory: { date: string; action: string; engineer: string }[];
}

const TOOLS: EquipmentTool[] = [
  {
    id: "ETCH-07",
    type: "Etch Chamber",
    chamber: "CH-1",
    status: "Excursion",
    daysSincePm: 1,
    anomalyScore: "+4.8σ",
    isShared: false,
    parameters: [
      { parameter: "rf_power_w", value: "1,874 W", sigma: 4.8, trend: "3 overshoot spikes in 90s post-PM", direction: "oscillating" },
      { parameter: "chamber_pressure_mt", value: "84.2 mT", sigma: 3.2, trend: "drifting above baseline since 06:55", direction: "increasing" },
      { parameter: "esc_temperature_c", value: "63.1 °C", sigma: 2.6, trend: "elevated chuck temperature", direction: "increasing" },
      { parameter: "o2_gas_flow_sccm", value: "18.4 sccm", sigma: 0.7, trend: "nominal flow rate", direction: "stable" },
    ],
    maintenanceHistory: [
      { date: "Today · 06:42", action: "Preventive maintenance & RF match inspection", engineer: "K. Vance" },
      { date: "14 days ago", action: "Chamber dry clean and optical window replacement", engineer: "R. Chen" },
    ]
  },
  {
    id: "CMP-03",
    type: "Chemical Mechanical Polisher",
    chamber: "CH-1",
    status: "Warning",
    daysSincePm: 12,
    anomalyScore: "-2.4σ",
    isShared: false,
    parameters: [
      { parameter: "slurry_flow_rate", value: "142 mL/min", sigma: -2.4, trend: "declining steadily over the last 6 lots", direction: "decreasing" },
      { parameter: "pad_life_pct", value: "84%", sigma: 1.1, trend: "approaching qualified life limit (85%)", direction: "increasing" },
      { parameter: "head_pressure_psi", value: "4.5 psi", sigma: 0.1, trend: "nominal mechanical pressure", direction: "stable" },
    ],
    maintenanceHistory: [
      { date: "12 days ago", action: "Polishing pad replacement and dresser calibration", engineer: "S. Miller" },
    ]
  },
  {
    id: "ETCH-07",
    type: "Etch Chamber",
    chamber: "CH-2",
    status: "Warning",
    daysSincePm: 2,
    anomalyScore: "+2.8σ",
    isShared: true,
    parameters: [
      { parameter: "rf_power_w", value: "1,890 W", sigma: 2.8, trend: "edge ringing observed since PM", direction: "oscillating" },
      { parameter: "gas_flow_sccm", value: "17.1 sccm", sigma: -2.1, trend: "edge zone delivery below setpoint", direction: "decreasing" },
      { parameter: "chamber_seasoning_idx", value: "1.42", sigma: 1.9, trend: "drifting since shared-tool recipe switch", direction: "increasing" },
    ],
    maintenanceHistory: [
      { date: "2 days ago", action: "Chamber clean and gas injector nozzle flush", engineer: "K. Vance" },
    ]
  },
  {
    id: "LITHO-02",
    type: "Photolithography Scanner",
    chamber: "BAY-02",
    status: "Warning",
    daysSincePm: 18,
    anomalyScore: "+2.9σ",
    isShared: false,
    parameters: [
      { parameter: "focus_offset_nm", value: "+14.2 nm", sigma: 2.9, trend: "thermal drift in lens column", direction: "increasing" },
      { parameter: "laser_dose_mj", value: "24.5 mJ", sigma: 0.3, trend: "nominal illumination", direction: "stable" },
    ],
    maintenanceHistory: [
      { date: "18 days ago", action: "Reticle stage calibration and laser optics tuning", engineer: "M. Tanaka" },
    ]
  },
  {
    id: "HANDLER-01",
    type: "Wafer Robot Handler",
    chamber: "STATION-A",
    status: "Excursion",
    daysSincePm: 35,
    anomalyScore: "+3.4σ",
    isShared: true,
    parameters: [
      { parameter: "end_effector_vibration", value: "0.48 g", sigma: 3.4, trend: "mechanical chatter during vacuum transfer", direction: "increasing" },
      { parameter: "arm_repeatability_um", value: "8.2 µm", sigma: 2.1, trend: "end-of-travel position jitter", direction: "oscillating" },
    ],
    maintenanceHistory: [
      { date: "35 days ago", action: "End-effector pad replacement and bearing lube", engineer: "T. Gomez" },
    ]
  },
  {
    id: "LITHO-02",
    type: "Photolithography Scanner",
    chamber: "BAY-07",
    status: "Nominal",
    daysSincePm: 4,
    anomalyScore: "+0.2σ",
    parameters: [
      { parameter: "focus_offset_nm", value: "+0.4 nm", sigma: 0.1, trend: "nominal focus baseline", direction: "stable" },
      { parameter: "overlay_error_nm", value: "1.1 nm", sigma: 0.2, trend: "sub-2nm overlay within specification", direction: "stable" },
    ],
    maintenanceHistory: [
      { date: "4 days ago", action: "Routine optical alignment", engineer: "M. Tanaka" },
    ]
  },
];

export default function EquipmentPage() {
  const [selectedTool, setSelectedTool] = useState<EquipmentTool>(TOOLS[0]);
  const [filterType, setFilterType] = useState("all");

  const filteredTools = TOOLS.filter(t => {
    if (filterType === "excursions") return t.status === "Excursion" || t.status === "Warning";
    if (filterType === "etch") return t.type.includes("Etch");
    if (filterType === "cmp") return t.type.includes("CMP");
    if (filterType === "litho") return t.type.includes("Lithography");
    return true;
  });

  return (
    <AppShell>
      <div className="page-content">
        {/* Single Page Header with Contextual Action */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> FLEET EQUIPMENT TELEMETRY
            </div>
            <h1>
              Fleet <span>&amp; equipment</span>
            </h1>
            <p>Real-time telemetry feeds, sensor deviation sigma scores, and maintenance tracking across all fab chambers.</p>
          </div>
          <div className="heading-actions">
            <button className="button primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Refresh feeds
            </button>
          </div>
        </div>

        {/* 4 Tool KPIs */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-top"><span>Total Monitored Tools</span><Cpu size={15} /></div>
            <div className="metric-value">14 Tools</div>
            <div className="metric-detail">Etch, CMP, Litho, Handlers</div>
          </div>
          <div className="metric-card metric-danger">
            <div className="metric-top"><span>Excursion Warnings</span><AlertTriangle size={15} /></div>
            <div className="metric-value">2 Active</div>
            <div className="metric-detail">ETCH-07 (+4.8σ), HANDLER-01 (+3.4σ)</div>
          </div>
          <div className="metric-card metric-warning">
            <div className="metric-top"><span>Parameter Drift</span><Activity size={15} /></div>
            <div className="metric-value">2 Tools</div>
            <div className="metric-detail">CMP-03 (-2.4σ), ETCH-07 (+2.8σ)</div>
          </div>
          <div className="metric-card metric-good">
            <div className="metric-top"><span>Healthy Fleet</span><ShieldCheck size={15} /></div>
            <div className="metric-value">10 Tools</div>
            <div className="metric-detail">Operating within ±1.5σ baseline</div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "5px", marginTop: "20px", marginBottom: "14px", flexWrap: "wrap" }}>
          {["all", "excursions", "etch", "cmp", "litho"].map(f => (
            <button
              key={f}
              className={`button small ${filterType === f ? "primary" : "ghost"}`}
              onClick={() => setFilterType(f)}
              style={{ textTransform: "capitalize" }}
            >
              {f === "all" ? "All Tools (6)" : f}
            </button>
          ))}
        </div>

        {/* 2-Column: Tool List & Selected Tool Detail */}
        <div className="workspace-grid">
          {/* Left: Tool Cards */}
          <section className="content-column">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
              {filteredTools.map(tool => {
                const isSelected = tool.id === selectedTool.id;
                const statusTone = tool.status === "Excursion" ? "danger" : tool.status === "Warning" ? "warning" : "good";
                return (
                  <div
                    key={tool.id}
                    className={`metric-card metric-${statusTone}`}
                    style={{ cursor: "pointer", border: isSelected ? "2px solid #274c6b" : undefined, padding: "12px 14px" }}
                    onClick={() => setSelectedTool(tool)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ font: "700 14px 'Space Grotesk', sans-serif", color: "#1d2c3a" }}>{tool.id}</div>
                        <div style={{ fontSize: "9.5px", color: "#7b8e9c", marginTop: "1px" }}>{tool.type} · {tool.chamber}</div>
                      </div>
                      <span className={`status-pill ${tool.status === "Excursion" ? "pill-critical" : tool.status === "Warning" ? "pill-high" : "pill-low"}`}>
                        <span className="status-dot" /> {tool.status}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "12px" }}>
                      <div>
                        <span style={{ fontSize: "8.5px", color: "#8a98a4", textTransform: "uppercase" }}>Peak Deviation</span>
                        <div style={{ font: "700 15px 'IBM Plex Mono', monospace", color: tool.status === "Excursion" ? "#b5473f" : tool.status === "Warning" ? "#b8852c" : "#2e6e58" }}>
                          {tool.anomalyScore}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: "8.5px", color: "#8a98a4", textTransform: "uppercase" }}>Days Since PM</span>
                        <div style={{ font: "600 12px 'IBM Plex Mono', monospace", color: "#3b5062" }}>
                          {tool.daysSincePm} d
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right: Selected Tool Telemetry Breakdown */}
          <aside className="right-column">
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Cpu size={15} /></div>
                  <div>
                    <div className="eyebrow">CHAMBER TELEMETRY</div>
                    <h2>{selectedTool.id} Telemetry</h2>
                  </div>
                </div>
                <span className={`status-pill ${selectedTool.status === "Excursion" ? "pill-critical" : selectedTool.status === "Warning" ? "pill-high" : "pill-low"}`}>
                  {selectedTool.status}
                </span>
              </div>

              <p style={{ fontSize: "10px", color: "#6a7c8b", marginBottom: "12px" }}>
                Active in-line parameters streamed from <b>{selectedTool.id}</b> ({selectedTool.type}).
              </p>

              <div className="sensor-list">
                {selectedTool.parameters.map((param, i) => (
                  <div key={i} className="sensor-row" style={{ paddingBottom: "9px" }}>
                    <div className="sensor-main">
                      <div className="sensor-name">
                        <span className="sensor-bar" style={{ background: Math.abs(param.sigma) > 3 ? "#b5473f" : Math.abs(param.sigma) > 1.5 ? "#b8852c" : "#2e6e58" }} />
                        {param.parameter}
                      </div>
                      <div className="sensor-values">
                        <b>{param.value}</b>
                        <span>{param.trend}</span>
                      </div>
                    </div>
                    <strong style={{ color: Math.abs(param.sigma) > 3 ? "#b5473f" : Math.abs(param.sigma) > 1.5 ? "#b8852c" : "#2e6e58", font: "600 10.5px 'IBM Plex Mono', monospace" }}>
                      {param.sigma > 0 ? `+${param.sigma}σ` : `${param.sigma}σ`}
                    </strong>
                  </div>
                ))}
              </div>

              {/* Maintenance History */}
              <div style={{ marginTop: "16px", borderTop: "1px solid #edebe4", paddingTop: "12px" }}>
                <h3 style={{ fontSize: "11px", color: "#273e51", marginBottom: "6px" }}>Recent Maintenance Events</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {selectedTool.maintenanceHistory.map((m, i) => (
                    <div key={i} style={{ fontSize: "9.5px", color: "#5d6f7e", background: "#fbfbf9", padding: "7px 9px", borderRadius: "5px", border: "1px solid #edebe4" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#8a98a4", marginBottom: "1px" }}>
                        <span>{m.date}</span>
                        <span>{m.engineer}</span>
                      </div>
                      <b>{m.action}</b>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> High-frequency SECS/GEM fab telemetry active</span>
          <span>YieldGuard AI · Equipment health monitor</span>
        </footer>
      </div>
    </AppShell>
  );
}
