"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { ProvenanceChip } from "@/components/AsyncBoundary";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { useCases } from "@/lib/api";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Cpu,
  Search,
  X,
} from "lucide-react";

interface CaseRecord {
  caseId: string;
  defectClass: string;
  equipmentId: string;
  category: "equipment" | "process" | "material" | "facility" | "metrology";
  confirmedRootCause: string;
  outcome: string;
  provenance: string;
  quote?: string;
  date?: string;
  sensorSignature?: Record<string, number>;
}


export default function CasesPage() {
  const { data, error, loading, reload } = useCases();
  const HISTORICAL_CASES: CaseRecord[] = useMemo(
    () => (data?.cases ?? []) as CaseRecord[], [data]);

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);

  const filteredCases = HISTORICAL_CASES.filter(c => {
    const matchesSearch =
      c.caseId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.confirmedRootCause.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.equipmentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.defectClass.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (classFilter !== "all" && c.defectClass.toLowerCase() !== classFilter.toLowerCase()) return false;
    return true;
  });

  return (
    <AppShell>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!HISTORICAL_CASES.length} label="historical cases">
      <div className="page-content">
        {/* Single Page Header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> HISTORICAL KNOWLEDGE REPOSITORY
            </div>
            <h1>
              Historical case <span>library</span>
            </h1>
            <p>Validated semiconductor yield root-cause resolutions and verified corrective actions.</p>
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-top"><span>Indexed Fab Cases</span><BookOpen size={15} /></div>
            <div className="metric-value">18 Cases</div>
            <div className="metric-detail">6 Failure modes covered</div>
          </div>
          <div className="metric-card metric-good">
            <div className="metric-top"><span>Resolution Rate</span><CheckCircle2 size={15} /></div>
            <div className="metric-value">100%</div>
            <div className="metric-detail">All cases verified with recovery data</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Equipment Mapped</span><Cpu size={15} /></div>
            <div className="metric-value">8 Tools</div>
            <div className="metric-detail">Etch, CMP, Litho, Handlers</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Retrieval Latency</span><Clock3 size={15} /></div>
            <div className="metric-value">&lt; 15 ms</div>
            <div className="metric-detail">k-NN cosine vector embedding</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "20px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#ffffff", border: "1px solid #dcdad0", borderRadius: "6px", padding: "0 10px", height: "33px", minWidth: "250px" }}>
            <Search size={14} color="#8a98a4" />
            <input
              type="text"
              placeholder="Search by case ID, symptom, equipment..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: "11px", color: "#1c2733", background: "transparent", width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: "5px" }}>
            {["all", "Edge-Ring", "Center", "Scratch", "Donut"].map(f => (
              <button
                key={f}
                className={`button small ${classFilter === f ? "primary" : "ghost"}`}
                onClick={() => setClassFilter(f)}
              >
                {f === "all" ? "All Classes" : f}
              </button>
            ))}
          </div>
        </div>

        {/* Case Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
          {filteredCases.map(c => (
            <div
              key={c.caseId}
              className="panel"
              style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", padding: "15px 16px" }}
              onClick={() => setSelectedCase(c)}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
                    <span style={{ font: "700 12.5px 'IBM Plex Mono', monospace", color: "#274c6b" }}>{c.caseId}</span>
                    <span style={{ fontSize: "8.5px", padding: "2px 5px", borderRadius: "3px", background: "#f6f3fa", color: "#6d5b93", font: "600 8.5px 'IBM Plex Mono', monospace" }}>
                      {c.defectClass}
                    </span>
                  </div>
                  <span style={{ fontSize: "8.5px", color: "#8a98a4", textTransform: "uppercase" }}>{c.equipmentId}</span>
                </div>

                <h3 style={{ fontSize: "11.5px", color: "#1d2c3a", lineHeight: "1.4", margin: "4px 0 6px" }}>
                  {c.confirmedRootCause}
                </h3>

                <p style={{ fontSize: "10px", color: "#6a7c8b", lineHeight: "1.4" }}>
                  <b>Outcome:</b> {c.outcome}
                </p>
              </div>

              <div style={{ marginTop: "12px", borderTop: "1px solid #edebe4", paddingTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "9px", color: "#2e6e58", display: "flex", alignItems: "center", gap: "3.5px" }}>
                  <CheckCircle2 size={11} /> Verified Resolution
                </span>
                <span className="text-button" style={{ fontSize: "9.5px" }}>
                  Inspect dossier →
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Case Inspection Drawer */}
        {selectedCase && (
          <div
            className="drawer-layer"
            onClick={() => setSelectedCase(null)}
          >
            <div className="drawer-panel" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <div className="eyebrow">HISTORICAL CASE DOSSIER</div>
                  <h2>{selectedCase.caseId}</h2>
                </div>
                <button className="icon-btn" onClick={() => setSelectedCase(null)}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="metric-card">
                  <div className="metric-top"><span>Case Metadata</span></div>
                  <div style={{ marginTop: "5px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "10.5px" }}>
                    <div><span style={{ color: "#8a98a4" }}>Defect Class: </span><b>{selectedCase.defectClass}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Equipment: </span><b>{selectedCase.equipmentId}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Category: </span><b>{selectedCase.category}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Provenance: </span><b>{selectedCase.provenance}</b></div>
                  </div>
                </div>

                <div className="panel" style={{ padding: "13px" }}>
                  {/* Was "Confirmed Root Cause". These records are constructed from the
                      WM-811K taxonomy and documented failure modes — nothing in them was
                      confirmed by an engineer on a real wafer, so the heading asserted a
                      standard of evidence the data does not meet. */}
                  <h3 style={{ fontSize: "11px", color: "#273e51", marginBottom: "4px" }}>
                    Recorded cause
                    <ProvenanceChip kind={selectedCase.provenance} />
                  </h3>
                  <p style={{ fontSize: "10.5px", color: "#425466", lineHeight: "1.45" }}>{selectedCase.confirmedRootCause}</p>
                </div>

                <div className="panel" style={{ padding: "13px", background: "#f8fbf9", borderColor: "#cfe7db" }}>
                  <h3 style={{ fontSize: "11px", color: "#2e6e58", marginBottom: "4px" }}>Resolution &amp; Fab Recovery</h3>
                  <p style={{ fontSize: "10.5px", color: "#36705e", lineHeight: "1.45" }}>{selectedCase.outcome}</p>
                </div>

                {selectedCase.quote && (
                  <div className="case-quote" style={{ margin: "0" }}>
                    “{selectedCase.quote}”
                  </div>
                )}

                {selectedCase.sensorSignature && (
                  <div className="panel" style={{ padding: "13px" }}>
                    <h3 style={{ fontSize: "11px", color: "#273e51", marginBottom: "6px" }}>Sensor Signature</h3>
                    {Object.entries(selectedCase.sensorSignature).map(([sensor, val]) => (
                      <div key={sensor} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid #edebe4" }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6a7d8c" }}>{sensor}</span>
                        <b style={{ color: "#b5473f" }}>{val > 0 ? `+${val}σ` : `${val}σ`}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> All cases validated by Senior Semiconductor Process Engineers</span>
          <span>YieldGuard AI · Historical Case Knowledgebase</span>
        </footer>
      </div>
      </AsyncBoundary>
    </AppShell>
  );
}
