"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Gauge,
  RefreshCw,
  ShieldAlert,
  Target,
  Wrench,
} from "lucide-react";

interface PlannedLotRisk {
  lotId: string;
  productId: string;
  equipment: string;
  riskScore: number;
  status: "Elevated Risk" | "Moderate Risk" | "Nominal";
  matchedCases: string[];
  parameters: { name: string; planned: string; historicalBaseline: string; delta: string; severity: "critical" | "high" | "nominal" }[];
  recommendations: string[];
}

const PLANNED_LOTS: PlannedLotRisk[] = [
  {
    lotId: "L-4511",
    productId: "P-LOGIC-3N",
    equipment: "ETCH-07",
    riskScore: 68,
    status: "Elevated Risk",
    matchedCases: ["CASE-1042", "HC-033"],
    parameters: [
      { name: "RF Power Setpoint", planned: "1,750 W", historicalBaseline: "1,620 W", delta: "+8.0%", severity: "critical" },
      { name: "Chamber Pressure Target", planned: "82.0 mT", historicalBaseline: "78.0 mT", delta: "+5.1%", severity: "high" },
      { name: "Post-PM Service Interval", planned: "12 min", historicalBaseline: "> 60 min seasoning", delta: "Immediate run", severity: "high" },
      { name: "Edge Gas Flow Rate", planned: "18.4 sccm", historicalBaseline: "18.2 sccm", delta: "+1.1%", severity: "nominal" },
    ],
    recommendations: [
      "Run monitor test wafer before committing 25-wafer production cassette",
      "Verify RF match network impedance phase angle against post-PM calibration",
      "Extend chamber RF seasoning cycle by 15 minutes",
    ]
  },
  {
    lotId: "L-4502",
    productId: "P-LOGIC-3N",
    equipment: "CMP-03",
    riskScore: 42,
    status: "Moderate Risk",
    matchedCases: ["HC-018"],
    parameters: [
      { name: "Slurry Flow Target", planned: "180 mL/min", historicalBaseline: "185 mL/min", delta: "-2.7%", severity: "high" },
      { name: "Head Pressure PSI", planned: "4.5 psi", historicalBaseline: "4.5 psi", delta: "0.0%", severity: "nominal" },
      { name: "Pad Life Consumed", planned: "84%", historicalBaseline: "< 75%", delta: "+9.0%", severity: "high" },
    ],
    recommendations: [
      "Inspect CMP-03 delivery line pressure before running multi-die logic lot",
      "Schedule pad conditioning cycle prior to polish step",
    ]
  },
  {
    lotId: "L-4515",
    productId: "P-MEM-1A",
    equipment: "LITHO-02",
    riskScore: 18,
    status: "Nominal",
    matchedCases: [],
    parameters: [
      { name: "Exposure Dose Target", planned: "24.5 mJ/cm²", historicalBaseline: "24.5 mJ/cm²", delta: "0.0%", severity: "nominal" },
      { name: "Focus Offset", planned: "0.0 nm", historicalBaseline: "0.0 nm", delta: "0.0%", severity: "nominal" },
      { name: "Overlay Alignment", planned: "1.2 nm", historicalBaseline: "< 2.0 nm", delta: "Nominal", severity: "nominal" },
    ],
    recommendations: [
      "Proceed with standard production release",
    ]
  },
];

export default function BatchRiskPage() {
  const [selectedLot, setSelectedLot] = useState<PlannedLotRisk>(PLANNED_LOTS[0]);

  return (
    <AppShell activeLotId={selectedLot.lotId}>
      <div className="page-content">
        {/* Single Page Header with Contextual Action */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> PRE-RUN BATCH TRIAGE
            </div>
            <h1>
              Batch risk <span>triage</span>
            </h1>
            <p>Proactive pre-fabrication risk scoring based on planned recipe parameters and chamber states.</p>
          </div>
          <div className="heading-actions">
            <button className="button primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Refresh pre-run score
            </button>
          </div>
        </div>

        {/* Advisory Triage Disclaimer Banner */}
        <div className="alert-banner" style={{ background: "#fffdf5", borderColor: "#f0e6c8" }}>
          <div className="alert-leading">
            <div className="alert-icon" style={{ background: "#fef6dc", color: "#a87928" }}>
              <ShieldAlert size={17} />
            </div>
            <div>
              <b style={{ color: "#7a5818" }}>Advisory Triage Signal</b>
              <span style={{ color: "#78694a" }}>
                Batch risk provides decision support for process engineers. It is <strong>not</strong> an automated fab shutdown or production lock.
              </span>
            </div>
          </div>
        </div>

        {/* Lot Selector Grid */}
        <div className="metrics-grid">
          {PLANNED_LOTS.map(lot => {
            const isSelected = lot.lotId === selectedLot.lotId;
            const tone = lot.riskScore > 60 ? "danger" : lot.riskScore > 30 ? "warning" : "good";
            return (
              <div
                key={lot.lotId}
                className={`metric-card metric-${tone}`}
                style={{ cursor: "pointer", border: isSelected ? "2px solid #274c6b" : undefined }}
                onClick={() => setSelectedLot(lot)}
              >
                <div className="metric-top">
                  <span>{lot.lotId}</span>
                  <span className={`status-pill ${lot.riskScore > 60 ? "pill-critical" : lot.riskScore > 30 ? "pill-high" : "pill-low"}`}>
                    {lot.status}
                  </span>
                </div>
                <div className="metric-value">{lot.riskScore} <span style={{ fontSize: "11px", color: "#8a98a4" }}>/ 100</span></div>
                <div className="metric-detail">{lot.productId} · {lot.equipment}</div>
              </div>
            );
          })}
        </div>

        {/* 2-Column Risk Deep Dive */}
        <div className="workspace-grid" style={{ marginTop: "20px" }}>
          {/* Left: Parameter Deltas */}
          <section className="panel">
            <div className="section-header">
              <div className="section-title-wrap">
                <div className="section-icon"><Gauge size={15} /></div>
                <div>
                  <div className="eyebrow">RECIPE PARAMETER AUDIT</div>
                  <h2>{selectedLot.lotId} Parameter Deviations</h2>
                </div>
              </div>
              <span className={`status-pill ${selectedLot.riskScore > 60 ? "pill-critical" : selectedLot.riskScore > 30 ? "pill-high" : "pill-low"}`}>
                <span className="status-dot" /> {selectedLot.status}
              </span>
            </div>

            <p style={{ color: "#6a7c8b", fontSize: "10.5px", marginBottom: "14px" }}>
              Comparing planned setpoints for <b>{selectedLot.lotId}</b> against historical nominal baselines on tool <b>{selectedLot.equipment}</b>.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {selectedLot.parameters.map((param, i) => (
                <div key={i} className="sensor-row" style={{ paddingBottom: "10px" }}>
                  <div className="sensor-main">
                    <div className="sensor-name">
                      <span className="sensor-bar" style={{ background: param.severity === "critical" ? "#b5473f" : param.severity === "high" ? "#b8852c" : "#2e6e58" }} />
                      {param.name}
                    </div>
                    <div className="sensor-values">
                      <b>{param.planned}</b>
                      <span>Baseline: {param.historicalBaseline}</span>
                    </div>
                  </div>
                  <strong style={{ color: param.severity === "critical" ? "#b5473f" : param.severity === "high" ? "#b8852c" : "#2e6e58", font: "600 10.5px 'IBM Plex Mono', monospace" }}>
                    {param.delta}
                  </strong>
                  <span className={`status-pill ${param.severity === "critical" ? "pill-critical" : param.severity === "high" ? "pill-high" : "pill-low"}`}>
                    {param.severity}
                  </span>
                </div>
              ))}
            </div>

            {/* Matched Low-Yield Cases */}
            <div style={{ marginTop: "18px", borderTop: "1px solid #edebe4", paddingTop: "14px" }}>
              <h3 style={{ fontSize: "11.5px", color: "#273e51", marginBottom: "6px" }}>Historical Low-Yield Pattern Matches</h3>
              {selectedLot.matchedCases.length > 0 ? (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {selectedLot.matchedCases.map(c => (
                    <span key={c} style={{ background: "#f6f3fa", padding: "4px 8px", borderRadius: "5px", color: "#6d5b93", fontSize: "9.5px", font: "600 9.5px 'IBM Plex Mono', monospace" }}>
                      Matched {c} (High parameter correlation)
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "10px", color: "#2e6e58" }}>No correlation to low-yield historical cases.</span>
              )}
            </div>
          </section>

          {/* Right: Preventive Actions */}
          <aside className="right-column">
            {/* Risk Gauge Panel */}
            <section className="panel risk-panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Target size={15} /></div>
                  <div>
                    <div className="eyebrow">RISK LEVEL</div>
                    <h2>Composite Triage Score</h2>
                  </div>
                </div>
              </div>
              <div className="risk-score-row">
                <div className="risk-meter">
                  <div className="risk-meter-fill" style={{ width: `${selectedLot.riskScore}%` }} />
                </div>
                <div className="risk-number">{selectedLot.riskScore}<span>/100</span></div>
              </div>
              <p style={{ color: "#6a7c8b", fontSize: "10px", marginTop: "8px", lineHeight: "1.45" }}>
                Calculated from multivariate distance to known low-yield operating states.
              </p>
            </section>

            {/* Recommended Preventive Actions */}
            <section className="panel actions-panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Wrench size={15} /></div>
                  <div>
                    <div className="eyebrow">PREVENTIVE ADVISORY</div>
                    <h2>Recommended pre-run steps</h2>
                  </div>
                </div>
              </div>
              <div className="action-group">
                {selectedLot.recommendations.map((rec, i) => (
                  <div key={i} className="action-row" style={{ alignItems: "flex-start", padding: "7px 4px" }}>
                    <span className="action-check" style={{ marginTop: "2px" }} />
                    <span>
                      <b style={{ color: "#273e51", fontSize: "10px" }}>{rec}</b>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Pre-run simulation validated against SECOM dataset</span>
          <span>YieldGuard AI · Pre-run batch risk module</span>
        </footer>
      </div>
    </AppShell>
  );
}
