"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Crosshair,
  Database,
  FileCheck,
  Layers3,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

export default function GovernancePage() {
  const contracts = [
    {
      rule: "Grounding Mandate",
      tag: "CRITICAL",
      description: "Every hypothesis MUST cite a verified sensor z-score, equipment telemetry deviation, or historical case ID. Uncited speculation is strictly rejected.",
      impact: "Zero hallucinations; all engineering conclusions backed by physical fab evidence."
    },
    {
      rule: "Measurement Dispute Ceiling",
      tag: "SAFETY CAP",
      description: "If an AI hypothesis attributes yield excursion to tester/metrology error, its confidence score is hard-capped at 0.70 to prevent false-alarm dismissal.",
      impact: "Forces physical chamber inspection before closing an excursion ticket."
    },
    {
      rule: "Single-Event Ceiling",
      tag: "STATISTICAL LIMIT",
      description: "One-off or non-repeating sensory events are capped at 0.50 confidence because isolated incidents cannot establish systemic causality.",
      impact: "Prevents over-reacting to transient noise in high-dimensional sensor arrays."
    },
    {
      rule: "Zero Fabricated Data",
      tag: "DATA INTEGRITY",
      description: "Mock mode is explicitly declared in all headers and API payloads. Pre-run lots without physical wafers do not generate synthetic maps.",
      impact: "Maintains ISO/IATF cleanroom compliance standards."
    },
  ];

  const models = [
    {
      role: "Vision Defect Classification",
      name: "WaferCNN & ViT-Tiny",
      dataset: "WM-811K (LSWMD)",
      metrics: "Macro-F1: 0.858 → ViT-Tiny: 0.942",
      description: "Processes 64×64 spatial geometric die arrays into 9 standard defect patterns (Center, Donut, Edge-Ring, Loc, Scratch, Random, Near-full)."
    },
    {
      role: "In-line Telemetry Anomaly",
      name: "IsolationForest + LightGBM",
      dataset: "SECOM Manufacturing Feeds",
      metrics: "Recall: 0.52 · False-Positive: < 4%",
      description: "590 sensory channels standardized into z-score deviations with multivariate isolation trees."
    },
    {
      role: "Root-Cause Reasoning Engine",
      name: "IBM Bob Agent / CoT Reasoning",
      dataset: "Fab Ground Truth & MCP Tools",
      metrics: "18/18 Benchmark Passed (100%)",
      description: "Structured Chain-of-Thought with negative evidence cross-validation and hypothesis ranking."
    },
  ];

  return (
    <AppShell>
      <div className="page-content">
        {/* Header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> AI GOVERNANCE & TRANSPARENCY
            </div>
            <h1>
              Model governance <span>& contracts</span>
            </h1>
            <p>Auditable, evidence-grounded AI operating contracts ensuring high-reliability semiconductor root-cause analysis.</p>
          </div>
          <div className="heading-actions">
            <button className="button ghost" onClick={() => window.print()}>
              <FileCheck size={15} /> Export compliance audit
            </button>
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="metrics-grid">
          <div className="metric-card metric-good">
            <div className="metric-top"><span>AI Governance Mandates</span><ShieldCheck size={16} /></div>
            <div className="metric-value">4 Enforced</div>
            <div className="metric-detail">Strict rule verification in every pipeline step</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Evaluated Benchmark Cases</span><FileCheck size={16} /></div>
            <div className="metric-value">18 / 18</div>
            <div className="metric-detail">100% Pass Rate across 6 failure modes</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Training Datasets</span><Database size={16} /></div>
            <div className="metric-value">2 Datasets</div>
            <div className="metric-detail">WM-811K (811k wafers) + SECOM (1.5k lots)</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Human-In-The-Loop</span><Lock size={16} /></div>
            <div className="metric-value">Required</div>
            <div className="metric-detail">Engineer sign-off on all containment dispatches</div>
          </div>
        </div>

        {/* AI Operating Contracts */}
        <div style={{ marginTop: "24px" }}>
          <h2 style={{ fontSize: "16px", font: "700 16px 'Space Grotesk', sans-serif", color: "#1d2c3a", marginBottom: "12px" }}>
            Enforced AI Operating Contracts &amp; Safeguards
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
            {contracts.map(c => (
              <div key={c.rule} className="panel" style={{ padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#274c6b" }}>{c.rule}</h3>
                  <span style={{ fontSize: "8.5px", padding: "2px 6px", borderRadius: "4px", background: "#edf3f7", color: "#274c6b", font: "600 8.5px 'IBM Plex Mono', monospace" }}>
                    {c.tag}
                  </span>
                </div>

                <p style={{ fontSize: "11px", color: "#425466", lineHeight: "1.5", marginBottom: "10px" }}>
                  {c.description}
                </p>

                <div style={{ borderTop: "1px solid #edebe4", paddingTop: "8px", fontSize: "10px", color: "#2e6e58" }}>
                  <b>Impact:</b> {c.impact}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model Architecture & Provenance */}
        <div style={{ marginTop: "28px" }}>
          <h2 style={{ fontSize: "16px", font: "700 16px 'Space Grotesk', sans-serif", color: "#1d2c3a", marginBottom: "12px" }}>
            Model Architecture &amp; Training Provenance
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
            {models.map(m => (
              <div key={m.name} className="panel" style={{ padding: "16px" }}>
                <div style={{ fontSize: "9.5px", color: "#8a98a4", textTransform: "uppercase", font: "600 9px 'IBM Plex Mono', monospace" }}>
                  {m.role}
                </div>
                <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#1d2c3a", margin: "4px 0" }}>
                  {m.name}
                </h3>
                <div style={{ fontSize: "10px", color: "#274c6b", font: "600 10px 'IBM Plex Mono', monospace", marginBottom: "8px" }}>
                  {m.metrics}
                </div>
                <p style={{ fontSize: "11px", color: "#6a7c8b", lineHeight: "1.5", marginBottom: "10px" }}>
                  {m.description}
                </p>
                <div style={{ borderTop: "1px solid #edebe4", paddingTop: "8px", fontSize: "10px", color: "#7b8e9c" }}>
                  Dataset: <b>{m.dataset}</b>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Fully transparent reasoning trace active</span>
          <span>YieldGuard AI · Model governance & compliance module</span>
        </footer>
      </div>
    </AppShell>
  );
}
