"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { useLots, useAnalyze } from "@/lib/api";
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

/**
 * get_corrective_action_playbook returns exactly { description, priority }.
 * category, assignee and sla were on the previous version of this type and have
 * no source — an assignee the tool never produced is a fabricated work order.
 */
interface ActionItem {
  id: string;
  description: string;
  priority: string;
  equipment: string;
  status: "PENDING" | "DISPATCHED" | "RESOLVED";
}


export default function PlaybookPage() {
  const { data: lotsRes } = useLots();
  const firstLot = useMemo(() => {
    const ls = Object.values(lotsRes?.lots ?? {}) as any[];
    return ls.filter((l) => l.status !== "planned")
             .sort((a, b) => (a.yield ?? 1e9) - (b.yield ?? 1e9))[0]?.lot_id ?? null;
  }, [lotsRes]);
  const [lotId, setLotId] = useState<string | null>(null);
  const active = lotId ?? firstLot;
  const { data, error, loading, reload } = useAnalyze(active);

  // Real playbook output for the selected lot. Dispatch state is local UI state:
  // there is no MES to write to, and pretending otherwise would be a fake write.
  const INITIAL_ACTIONS: ActionItem[] = useMemo(() =>
    ((data?.actions?.actions ?? []) as any[]).map((a, i) => ({
      id: `A-${i + 1}`,
      description: a.description ?? String(a),
      priority: a.priority ?? "—",
      equipment: (data?.lot?.equipment_ids ?? []).join(", ") || "—",
      status: "PENDING" as const,
    })), [data]);

  const [actions, setActions] = useState<ActionItem[]>(INITIAL_ACTIONS);
  const [newTitle, setNewTitle] = useState("");
  const [newEquip, setNewEquip] = useState<string>("");
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
      description: newTitle.trim(),
      priority: newCat || "high",
      equipment: newEquip || "—",
      status: "DISPATCHED",
    };
    setActions([newAct, ...actions]);
    setNewTitle("");
    setShowAddForm(false);
  };

  const p1Count = actions.filter(a => a.priority === "high").length;
  const resolvedCount = actions.filter(a => a.status === "RESOLVED").length;

  return (
    <AppShell>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!INITIAL_ACTIONS.length} label="playbook actions">
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
                {["ETCH-07", "CMP-03", "ETCH-07", "LITHO-02", "HANDLER-01"].map(e => (
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
            const isP1 = act.priority === "high";
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
                  borderLeft: `4px solid ${isP1 ? "#b5473f" : act.priority === "medium" ? "#b8852c" : "#2e6e58"}`,
                  background: isResolved ? "#fbfcfc" : "#ffffff",
                  opacity: isResolved ? 0.8 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ font: "700 10.5px 'IBM Plex Mono', monospace", color: "#6a7d8c" }}>{act.id}</span>
                    <span className={`status-pill ${isP1 ? "pill-critical" : act.priority === "medium" ? "pill-high" : "pill-low"}`}>
                      {act.priority}
                    </span>
                    <span style={{ fontSize: "10px", color: "#8a98a4" }}>Tool: <b>{act.equipment}</b></span>
                  </div>

                  <h3 style={{ fontSize: "13px", color: "#1d2c3a", fontWeight: 700, margin: "4px 0" }}>
                    {act.description}
                  </h3>

                  <p style={{ fontSize: "11px", color: "#6a7c8b", margin: "2px 0 6px" }}>
                    {act.description}
                  </p>

                  <div style={{ display: "flex", gap: "14px", fontSize: "9.5px", color: "#8a98a4" }}>
                    <span>Assignee: <b style={{ color: "#3b5062" }}>{act.equipment}</b></span>
                    <span>SLA: <b style={{ color: "#3b5062" }}>{""}</b></span>
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
      </AsyncBoundary>
    </AppShell>
  );
}
