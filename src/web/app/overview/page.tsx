"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import {
  AlertTriangle,
  Boxes,
  Cpu,
  FileText,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export default function OverviewPage() {
  const [filter, setFilter] = useState("all");

  const kpis = [
    { label: "Fab Average Yield", value: "91.2%", detail: "↓ 0.8 pts vs 92.0% target", tone: "warning", icon: <TrendingDown size={16} /> },
    { label: "Active Excursions", value: "1 Lot", detail: "WFR-24-0817 (74.2% yield)", tone: "danger", icon: <AlertTriangle size={16} /> },
    { label: "Equipment on Watch", value: "2 Tools", detail: "ETCH-04 (+4.8σ), CMP-03 (-2.4σ)", tone: "warning", icon: <Cpu size={16} /> },
    { label: "AI Reasoning Health", value: "100%", detail: "18/18 Benchmark Cases Validated", tone: "good", icon: <ShieldCheck size={16} /> },
  ];

  const lots = [
    { id: "WFR-24-0817", product: "P-LOGIC-3N", line: "FAB2-A", equipment: "ETCH-04", yield: "74.2%", status: "Excursion Active", pattern: "Edge-Ring", severity: "critical", time: "8 min ago" },
    { id: "WFR-24-0816", product: "P-LOGIC-3N", line: "FAB2-A", equipment: "ETCH-04", yield: "88.6%", status: "Review Required", pattern: "Center", severity: "high", time: "42 min ago" },
    { id: "WFR-24-0814", product: "P-MEM-1A", line: "FAB1-B", equipment: "CMP-02", yield: "91.4%", status: "Monitoring", pattern: "None", severity: "medium", time: "1 hr ago" },
    { id: "WFR-24-0818", product: "P-LOGIC-3N", line: "FAB2-A", equipment: "ETCH-04", yield: "--", status: "Planned (Pre-run)", pattern: "Risk 68/100", severity: "high", time: "Upcoming" },
    { id: "WFR-24-0811", product: "P-LOGIC-5N", line: "FAB2-B", equipment: "LITHO-07", yield: "93.8%", status: "Nominal", pattern: "None", severity: "low", time: "3 hr ago" },
    { id: "WFR-24-0809", product: "P-LOGIC-3N", line: "FAB2-A", equipment: "ETCH-03", yield: "95.1%", status: "Nominal", pattern: "None", severity: "low", time: "5 hr ago" },
  ];

  const filteredLots = lots.filter(l => {
    if (filter === "excursion") return l.severity === "critical" || l.severity === "high";
    if (filter === "planned") return l.status.includes("Planned");
    return true;
  });

  const exportSummary = () => {
    const report = `YIELDGUARD AI · FAB 07 FLEET OVERVIEW\nDate: ${new Date().toISOString()}\nFab Average Yield: 91.2% (Target: 92.0%)\nActive Excursions: WFR-24-0817 (74.2% yield, ETCH-04)\nEquipment on Watch: ETCH-04 (+4.8σ), CMP-03 (-2.4σ)\n\nLOT REGISTRY SNAPSHOT\n${lots.map(l => `- ${l.id}: ${l.product} | ${l.equipment} | Yield: ${l.yield} | Status: ${l.status}`).join("\n")}`;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fab07-fleet-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell activeLotId="WFR-24-0817">
      <div className="page-content">
        {/* Single Page Header with Contextual Actions */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> FAB 07 COMMAND CENTER
            </div>
            <h1>
              Fleet yield <span>overview</span>
            </h1>
            <p>Real-time semiconductor manufacturing intelligence across in-line inspection and process telemetry.</p>
          </div>
          <div className="heading-actions">
            <button className="button ghost" onClick={exportSummary}>
              <FileText size={14} /> Export fab summary
            </button>
            <button className="button primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Refresh telemetry
            </button>
          </div>
        </div>

        {/* Excursion Banner */}
        <div className="alert-banner">
          <div className="alert-leading">
            <div className="alert-icon">
              <AlertTriangle size={17} />
            </div>
            <div>
              <b>Urgent Excursion: Lot WFR-24-0817</b>
              <span>
                Final yield dropped to <strong>74.2%</strong> on <strong>ETCH-04</strong> · Edge-ring defect pattern detected across 24 wafers.
              </span>
            </div>
          </div>
        </div>

        {/* 4 Fleet KPIs */}
        <div className="metrics-grid">
          {kpis.map((kpi, i) => (
            <div key={i} className={`metric-card metric-${kpi.tone}`}>
              <div className="metric-top">
                <span>{kpi.label}</span>
                <span className="metric-icon">{kpi.icon}</span>
              </div>
              <div className="metric-value">{kpi.value}</div>
              <div className="metric-detail">{kpi.detail}</div>
            </div>
          ))}
        </div>

        {/* 2-Column Clean Workspace Grid */}
        <div className="workspace-grid" style={{ marginTop: "20px" }}>
          {/* Left: Lot Registry Queue */}
          <section className="panel" style={{ padding: "0" }}>
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #edebe4" }}>
              <div className="section-title-wrap">
                <div className="section-icon"><Boxes size={15} /></div>
                <div>
                  <div className="eyebrow">IN-LINE QUEUE</div>
                  <h2>Active fab lots &amp; inspection status</h2>
                </div>
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <button
                  className={`button small ${filter === "all" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("all")}
                >
                  All ({lots.length})
                </button>
                <button
                  className={`button small ${filter === "excursion" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("excursion")}
                >
                  Excursions (3)
                </button>
                <button
                  className={`button small ${filter === "planned" ? "primary" : "ghost"}`}
                  onClick={() => setFilter("planned")}
                >
                  Planned (1)
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#fcfbf9", borderBottom: "1px solid #edebe4", color: "#8a98a4", font: "600 8.5px 'IBM Plex Mono', monospace" }}>
                    <th style={{ padding: "10px 14px" }}>LOT ID</th>
                    <th style={{ padding: "10px 14px" }}>PRODUCT</th>
                    <th style={{ padding: "10px 14px" }}>TOOL</th>
                    <th style={{ padding: "10px 14px" }}>PATTERN</th>
                    <th style={{ padding: "10px 14px" }}>YIELD</th>
                    <th style={{ padding: "10px 14px" }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map(lot => (
                    <tr key={lot.id} style={{ borderBottom: "1px solid #f4f2eb" }}>
                      <td style={{ padding: "11px 14px", font: "600 11px 'IBM Plex Mono', monospace", color: "#274c6b" }}>
                        {lot.id}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#425466" }}>{lot.product}</td>
                      <td style={{ padding: "11px 14px", color: "#425466" }}>{lot.equipment}</td>
                      <td style={{ padding: "11px 14px", color: "#6a7d8c" }}>{lot.pattern}</td>
                      <td style={{ padding: "11px 14px", font: "700 11px 'IBM Plex Mono', monospace", color: lot.severity === "critical" ? "#b5473f" : "#2e6e58" }}>
                        {lot.yield}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span className={`status-pill pill-${lot.severity}`}>
                          <span className="status-dot" /> {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right: Fleet Health Feeds */}
          <aside className="right-column">
            {/* Equipment Feeds */}
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Cpu size={15} /></div>
                  <div>
                    <div className="eyebrow">EQUIPMENT TELEMETRY</div>
                    <h2>Chamber Anomaly Status</h2>
                  </div>
                </div>
              </div>

              <div className="sensor-list">
                <div className="sensor-row">
                  <div>
                    <b style={{ color: "#273e51", fontSize: "10.5px" }}>ETCH-04</b>
                    <div style={{ color: "#7b8e9c", fontSize: "9px" }}>RF Power transient spike (1,874 W)</div>
                  </div>
                  <strong style={{ color: "#b5473f", font: "600 11px 'IBM Plex Mono', monospace" }}>+4.8σ</strong>
                  <span className="status-pill pill-critical"><span className="status-dot" />Excursion</span>
                </div>
                <div className="sensor-row">
                  <div>
                    <b style={{ color: "#273e51", fontSize: "10.5px" }}>CMP-03</b>
                    <div style={{ color: "#7b8e9c", fontSize: "9px" }}>Slurry flow rate drift (Pump cavitation)</div>
                  </div>
                  <strong style={{ color: "#b8852c", font: "600 11px 'IBM Plex Mono', monospace" }}>-2.4σ</strong>
                  <span className="status-pill pill-high"><span className="status-dot" />Warning</span>
                </div>
                <div className="sensor-row">
                  <div>
                    <b style={{ color: "#273e51", fontSize: "10.5px" }}>LITHO-07</b>
                    <div style={{ color: "#7b8e9c", fontSize: "9px" }}>Dose uniformity &amp; focus nominal</div>
                  </div>
                  <strong style={{ color: "#2e6e58", font: "600 11px 'IBM Plex Mono', monospace" }}>+0.2σ</strong>
                  <span className="status-pill pill-nominal"><span className="status-dot" />Nominal</span>
                </div>
              </div>
            </section>

            {/* Pre-Run Batch Risk Snapshot */}
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><ShieldCheck size={15} /></div>
                  <div>
                    <div className="eyebrow">PRE-RUN ADVISORY</div>
                    <h2>Upcoming Lot Triage</h2>
                  </div>
                </div>
                <span className="triage-chip">WFR-24-0818</span>
              </div>
              <div className="risk-score-row">
                <div className="risk-meter">
                  <div className="risk-meter-fill" style={{ width: "68%" }} />
                </div>
                <div className="risk-number">68<span>/100</span></div>
              </div>
              <p style={{ color: "#6a7c8b", fontSize: "10px", marginTop: "8px", lineHeight: "1.45" }}>
                Upcoming lot shares 4 high-weight parameters with low-yield conditions on ETCH-04.
              </p>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Real-time fab telemetry active</span>
          <span>YieldGuard AI · Fab 07 Sector Command Center</span>
        </footer>
      </div>
    </AppShell>
  );
}
