"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  Check,
  CheckCircle2,
  Clock3,
  Cpu,
  Crosshair,
  FileText,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";

interface ActionItem {
  id: string;
  title: string;
  category: "Immediate (P1)" | "Verification (P2)" | "Preventive (P3)";
  equipment: string;
  description: string;
  assignee: string;
  sla: string;
  status: "PENDING" | "DISPATCHED" | "RESOLVED";
}

const INITIAL_ACTIONS: ActionItem[] = [
  {
    id: "ACT-101",
    title: "Inspect RF Match Network on ETCH-04",
    category: "Immediate (P1)",
    equipment: "ETCH-04",
    description: "Compare post-PM calibration impedance phase angle against golden spec. Verify capacitor preset positions.",
    assignee: "K. Vance (RF Specialist)",
    sla: "30 min",
    status: "DISPATCHED"
  },
  {
    id: "ACT-102",
    title: "Place ETCH-04 on Engineering Watch",
    category: "Immediate (P1)",
    equipment: "ETCH-04",
    description: "Lock automated production dispatch. Require engineer sign-off for next cassette run.",
    assignee: "M. Sato (Yield Lead)",
    sla: "Immediate",
    status: "RESOLVED"
  },
  {
    id: "ACT-103",
    title: "Run Monitor Test Wafer",
    category: "Verification (P2)",
    equipment: "ETCH-04",
    description: "Process single bare-silicon test wafer to measure 4mm edge exclusion etch rate uniformity before batch release.",
    assignee: "Fab 07 Tech Crew",
    sla: "2 hours",
    status: "PENDING"
  },
  {
    id: "ACT-104",
    title: "Inspect Slurry Delivery Pump on CMP-03",
    category: "Verification (P2)",
    equipment: "CMP-03",
    description: "Check slurry line pressure transducer and pump seal for mechanical cavitation / flow degradation (-2.4σ).",
    assignee: "S. Miller (CMP Eng)",
    sla: "4 hours",
    status: "PENDING"
  },
  {
    id: "ACT-105",
    title: "Update Standard PM Checklist SOP-3401",
    category: "Preventive (P3)",
    equipment: "ETCH-04",
    description: "Add mandatory 20-minute chamber RF seasoning cycle following any RF match assembly PM.",
    assignee: "Quality Assurance",
    sla: "24 hours",
    status: "PENDING"
  },
];

export default function PlaybookPage() {
  const [actions, setActions] = useState<ActionItem[]>(INITIAL_ACTIONS);
  const [newTitle, setNewTitle] = useState("");
  const [newEquip, setNewEquip] = useState("ETCH-04");
  const [newCat, setNewCat] = useState<"Immediate (P1)" | "Verification (P2)" | "Preventive (P3)">("Immediate (P1)");
  const [showAddForm, setShowAddForm] = useState(false);

  const toggleStatus = (id: string) => {
    setActions(prev =>
      prev.map(act => {
        if (act.id !== id) return act;
        const nextStatus = act.status === "PENDING" ? "DISPATCHED" : act.status === "DISPATCHED" ? "RESOLVED" : "PENDING";
        return { ...act, status: nextStatus };
      })
    );
  };

  const addAction = () => {
    if (!newTitle.trim()) return;
    const newAct: ActionItem = {
      id: `ACT-${Math.floor(100 + Math.random() * 900)}`,
      title: newTitle.trim(),
      category: newCat,
      equipment: newEquip,
      description: "Added by yield engineer during investigation workspace review.",
      assignee: "Mei Sato",
      sla: "1 hour",
      status: "DISPATCHED"
    };
    setActions([newAct, ...actions]);
    setNewTitle("");
    setShowAddForm(false);
  };

  const p1Count = actions.filter(a => a.category.includes("P1")).length;
  const resolvedCount = actions.filter(a => a.status === "RESOLVED").length;

  return (
    <AppShell>
      <div className="page-content">
        {/* Header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> FAB CORRECTIVE ACTION SYSTEM
            </div>
            <h1>
              Action <span>playbook</span>
            </h1>
            <p>Prioritized corrective and preventive containment actions dispatched directly to cleanroom maintenance engineers.</p>
          </div>
          <div className="heading-actions">
            <button className="button ghost" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={15} /> {showAddForm ? "Cancel" : "Add custom action"}
            </button>
            <button className="button primary" onClick={() => setActions(INITIAL_ACTIONS)}>
              <RefreshCw size={15} /> Refresh dispatch SLA
            </button>
          </div>
        </div>

        {/* 4 Summary KPIs */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-top"><span>Total Actions</span><Wrench size={16} /></div>
            <div className="metric-value">{actions.length}</div>
            <div className="metric-detail">Active corrective playbook</div>
          </div>
          <div className="metric-card metric-danger">
            <div className="metric-top"><span>Priority 1 Immediate</span><Zap size={16} /></div>
            <div className="metric-value">{p1Count} Actions</div>
            <div className="metric-detail">Critical excursion containment</div>
          </div>
          <div className="metric-card metric-good">
            <div className="metric-top"><span>Resolved &amp; Closed</span><CheckCircle2 size={16} /></div>
            <div className="metric-value">{resolvedCount} / {actions.length}</div>
            <div className="metric-detail">Verified by lead engineer</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Mean SLA Target</span><Clock3 size={16} /></div>
            <div className="metric-value">&lt; 2 hrs</div>
            <div className="metric-detail">Excursion response SLA</div>
          </div>
        </div>

        {/* Add Action Form */}
        {showAddForm && (
          <div className="panel" style={{ marginTop: "18px", padding: "16px", background: "#fbfcfd" }}>
            <h3 style={{ fontSize: "13px", color: "#1d2c3a", marginBottom: "10px" }}>Create New Playbook Task</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr auto", gap: "10px", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Action title (e.g. Inspect RF match network)..."
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11px", outline: "none" }}
              />
              <select
                value={newEquip}
                onChange={e => setNewEquip(e.target.value)}
                style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11px", outline: "none", background: "#ffffff" }}
              >
                {["ETCH-04", "CMP-03", "ETCH-07", "LITHO-02", "HANDLER-01"].map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <select
                value={newCat}
                onChange={e => setNewCat(e.target.value as any)}
                style={{ height: "34px", padding: "0 10px", borderRadius: "6px", border: "1px solid #dce4e8", fontSize: "11px", outline: "none", background: "#ffffff" }}
              >
                <option value="Immediate (P1)">Immediate (P1)</option>
                <option value="Verification (P2)">Verification (P2)</option>
                <option value="Preventive (P3)">Preventive (P3)</option>
              </select>
              <button className="button primary" onClick={addAction}>
                Dispatch Task
              </button>
            </div>
          </div>
        )}

        {/* Action Items List */}
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {actions.map(act => {
            const isP1 = act.category.includes("P1");
            const isResolved = act.status === "RESOLVED";
            const isDispatched = act.status === "DISPATCHED";

            return (
              <div
                key={act.id}
                className="panel"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  padding: "16px 18px",
                  borderLeft: `4px solid ${isP1 ? "#b5473f" : act.category.includes("P2") ? "#b8852c" : "#2e6e58"}`,
                  background: isResolved ? "#fbfcfc" : "#ffffff",
                  opacity: isResolved ? 0.8 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ font: "700 10.5px 'IBM Plex Mono', monospace", color: "#6a7d8c" }}>{act.id}</span>
                    <span className={`status-pill ${isP1 ? "pill-critical" : act.category.includes("P2") ? "pill-high" : "pill-low"}`}>
                      {act.category}
                    </span>
                    <span style={{ fontSize: "10px", color: "#8a98a4" }}>Tool: <b>{act.equipment}</b></span>
                  </div>

                  <h3 style={{ fontSize: "13px", color: "#1d2c3a", fontWeight: 700, margin: "4px 0" }}>
                    {act.title}
                  </h3>

                  <p style={{ fontSize: "11px", color: "#6a7c8b", margin: "2px 0 6px" }}>
                    {act.description}
                  </p>

                  <div style={{ display: "flex", gap: "14px", fontSize: "9.5px", color: "#8a98a4" }}>
                    <span>Assignee: <b style={{ color: "#3b5062" }}>{act.assignee}</b></span>
                    <span>SLA: <b style={{ color: "#3b5062" }}>{act.sla}</b></span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                  <button
                    onClick={() => toggleStatus(act.id)}
                    className="button"
                    style={{
                      height: "32px",
                      background: isResolved ? "#edf7f3" : isDispatched ? "#edf3f7" : "#fff8f7",
                      borderColor: isResolved ? "#cde7dc" : isDispatched ? "#dce6ed" : "#f7d2cd",
                      color: isResolved ? "#2e6e58" : isDispatched ? "#274c6b" : "#b5473f",
                      font: "700 10.5px 'IBM Plex Mono', monospace",
                    }}
                  >
                    {isResolved ? <Check size={14} /> : isDispatched ? <Clock3 size={14} /> : <Zap size={14} />}
                    [{act.status}] (Click to toggle)
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Connected to Fab MES Dispatch Engine</span>
          <span>YieldGuard AI · Corrective Action Module</span>
        </footer>
      </div>
    </AppShell>
  );
}
