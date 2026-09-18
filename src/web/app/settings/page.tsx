"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  Bell,
  BrainCircuit,
  Check,
  Cpu,
  Database,
  Lock,
  RefreshCw,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Zap,
} from "lucide-react";

export default function SettingsPage() {
  const [anomalyThreshold, setAnomalyThreshold] = useState("2.0");
  const [yieldTarget, setYieldTarget] = useState("92.0");
  const [edgeExclusion, setEdgeExclusion] = useState("4");
  const [reasoningProvider, setReasoningProvider] = useState("gemini-2.0-flash");
  const [autoTriage, setAutoTriage] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <AppShell>
      <div className="page-content">
        {/* Header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> FAB CONFIGURATION & SYSTEM SETTINGS
            </div>
            <h1>
              Workspace <span>settings</span>
            </h1>
            <p>Configure fab process limits, AI reasoning provider parameters, and anomaly detection sensitivities.</p>
          </div>
          <div className="heading-actions">
            <button className="button primary" onClick={handleSave}>
              {saved ? <Check size={15} /> : <Save size={15} />}
              {saved ? "Settings Saved" : "Save Configurations"}
            </button>
          </div>
        </div>

        {/* 2-Column Settings Grid */}
        <div className="workspace-grid">
          {/* Left: Fab & Statistical Limits */}
          <section className="content-column">
            <div className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><SlidersHorizontal size={17} /></div>
                  <div>
                    <div className="eyebrow">PROCESS LIMITS</div>
                    <h2>Statistical Process Control (SPC)</h2>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#273e51", marginBottom: "4px" }}>
                    Sensor Anomaly Sigma Threshold (σ)
                  </label>
                  <p style={{ fontSize: "10px", color: "#7b8e9c", marginBottom: "6px" }}>
                    Sensors exceeding this deviation from baseline will be flagged as anomalous.
                  </p>
                  <input
                    type="number"
                    step="0.1"
                    value={anomalyThreshold}
                    onChange={e => setAnomalyThreshold(e.target.value)}
                    style={{ height: "34px", width: "160px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11.5px", outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#273e51", marginBottom: "4px" }}>
                    Fab Qualified Yield Target (%)
                  </label>
                  <p style={{ fontSize: "10px", color: "#7b8e9c", marginBottom: "6px" }}>
                    Lots falling below this final yield threshold will trigger an active yield excursion ticket.
                  </p>
                  <input
                    type="number"
                    step="0.5"
                    value={yieldTarget}
                    onChange={e => setYieldTarget(e.target.value)}
                    style={{ height: "34px", width: "160px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11.5px", outline: "none" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#273e51", marginBottom: "4px" }}>
                    Wafer Edge Exclusion Margin (mm)
                  </label>
                  <p style={{ fontSize: "10px", color: "#7b8e9c", marginBottom: "6px" }}>
                    Outer wafer edge perimeter region monitored for spatial ring defect clustering.
                  </p>
                  <input
                    type="number"
                    step="1"
                    value={edgeExclusion}
                    onChange={e => setEdgeExclusion(e.target.value)}
                    style={{ height: "34px", width: "160px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11.5px", outline: "none" }}
                  />
                </div>
              </div>
            </div>

            {/* AI Reasoning Settings */}
            <div className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><BrainCircuit size={17} /></div>
                  <div>
                    <div className="eyebrow">AI REASONING ENGINE</div>
                    <h2>Model Provider &amp; Governance</h2>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#273e51", marginBottom: "4px" }}>
                    Reasoning Model Provider
                  </label>
                  <select
                    value={reasoningProvider}
                    onChange={e => setReasoningProvider(e.target.value)}
                    style={{ height: "34px", width: "100%", maxWidth: "340px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11.5px", outline: "none", background: "#ffffff" }}
                  >
                    <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Recommended)</option>
                    <option value="structured-cot-offline">Structured CoT Offline Reasoning Engine</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "6px" }}>
                  <input
                    type="checkbox"
                    id="auto-triage"
                    checked={autoTriage}
                    onChange={e => setAutoTriage(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <label htmlFor="auto-triage" style={{ fontSize: "11px", color: "#3b5062", cursor: "pointer" }}>
                    Enable real-time batch risk triage simulation for upcoming planned lots
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Right: Backend Diagnostic & Environment */}
          <aside className="right-column">
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Server size={17} /></div>
                  <div>
                    <div className="eyebrow">SERVICE DIAGNOSTICS</div>
                    <h2>API &amp; MCP Integration</h2>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #edebe4" }}>
                  <span style={{ color: "#8a98a4" }}>FastAPI Backend:</span>
                  <b style={{ color: "#2e6e58" }}>http://127.0.0.1:8787 (Online)</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #edebe4" }}>
                  <span style={{ color: "#8a98a4" }}>MCP Protocol:</span>
                  <b style={{ color: "#274c6b" }}>STDIO JSON-RPC 2.0</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #edebe4" }}>
                  <span style={{ color: "#8a98a4" }}>Pipeline Tools:</span>
                  <b style={{ color: "#2e6e58" }}>9 Real Tools Active</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "8px", borderBottom: "1px solid #edebe4" }}>
                  <span style={{ color: "#8a98a4" }}>Historical Fixtures:</span>
                  <b style={{ color: "#3b5062" }}>18 Test Cases Loaded</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8a98a4" }}>Fab Node Line:</span>
                  <b style={{ color: "#3b5062" }}>Fab 07 · 3nm / 5nm Node</b>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <div className="section-icon"><Lock size={17} /></div>
                  <div>
                    <div className="eyebrow">USER PROFILE</div>
                    <h2>Lead Engineer Workspace</h2>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div><span style={{ color: "#8a98a4" }}>Engineer: </span><b>Mei Sato</b></div>
                <div><span style={{ color: "#8a98a4" }}>Role: </span><b>Senior Yield &amp; Defect Analysis Lead</b></div>
                <div><span style={{ color: "#8a98a4" }}>Permissions: </span><b style={{ color: "#2e6e58" }}>Full Fab Dispatch Authority</b></div>
                <div><span style={{ color: "#8a98a4" }}>Organization: </span><b>Fab 07 Semiconductor Quality</b></div>
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Configuration synced with clean room gateway</span>
          <span>YieldGuard AI · Fab 07 Workspace settings</span>
        </footer>
      </div>
    </AppShell>
  );
}
