"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Boxes,
  FileText,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

interface LotItem {
  id: string;
  product: string;
  line: string;
  equipment: string[];
  yield: number | null;
  status: "tested" | "planned";
  pattern?: string;
  caseId?: string;
  sensors?: Record<string, number>;
  plannedParams?: Record<string, number>;
}

const LOT_REGISTRY: LotItem[] = [
  { id: "WFR-24-0817", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["ETCH-04", "CMP-03"], yield: 74.2, status: "tested", pattern: "Edge-Ring", caseId: "case_2a", sensors: { rf_power_w: 1874, chamber_pressure_mt: 84.2, esc_temp_c: 63.1 } },
  { id: "WFR-24-0816", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["ETCH-04"], yield: 88.6, status: "tested", pattern: "Center", caseId: "case_1a", sensors: { rf_power_w: 1720, chamber_pressure_mt: 80.5 } },
  { id: "WFR-24-0814", product: "P-MEM-1A", line: "FAB1-B", equipment: ["CMP-02"], yield: 91.4, status: "tested", pattern: "None", caseId: "case_5a" },
  { id: "WFR-24-0818", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["ETCH-04"], yield: null, status: "planned", pattern: "Pre-run (Risk 68)", plannedParams: { rf_power_setpoint_w: 1750, pressure_target_mt: 82.0 } },
  { id: "L-4471", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["ETCH-07", "CMP-03"], yield: 61.0, status: "tested", pattern: "Edge-Ring", caseId: "case_2a", sensors: { rf_power_w: 1890, slurry_flow: 140 } },
  { id: "L-4402", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["CMP-03"], yield: 68.5, status: "tested", pattern: "Center", caseId: "case_1a", sensors: { slurry_flow_rate: -2.4 } },
  { id: "L-4418", product: "P-MEM-1A", line: "FAB1-B", equipment: ["CMP-03"], yield: 72.0, status: "tested", pattern: "Center", caseId: "case_1b", sensors: { pad_life_pct: 1.1 } },
  { id: "L-3310", product: "P-LOGIC-5N", line: "FAB2-B", equipment: ["HANDLER-01"], yield: 54.0, status: "tested", pattern: "Scratch", caseId: "case_3a", sensors: { vibration_g: 3.4 } },
  { id: "L-4815", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["LITHO-02"], yield: 64.0, status: "tested", pattern: "Donut", caseId: "case_4a", sensors: { focus_offset_nm: 2.9 } },
  { id: "L-5120", product: "P-MEM-2B", line: "FAB1-A", equipment: ["ETCH-07"], yield: 79.5, status: "tested", pattern: "Edge-Ring", caseId: "case_2b", sensors: { gas_flow_sccm: -2.1 } },
  { id: "L-6001", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["CMP-03"], yield: null, status: "planned", plannedParams: { slurry_flow_target: 180, head_pressure_psi: 4.5 } },
  { id: "L-6002", product: "P-MEM-1A", line: "FAB1-B", equipment: ["LITHO-07"], yield: null, status: "planned", pattern: "Nominal (Risk 18)", plannedParams: { exposure_dose_target_mj: 24.5, focus_offset_nm: 0.0, overlay_alignment_nm: 1.2 } },
  { id: "WFR-24-0811", product: "P-LOGIC-5N", line: "FAB2-B", equipment: ["LITHO-07"], yield: 93.8, status: "tested", pattern: "None" },
  { id: "WFR-24-0809", product: "P-LOGIC-3N", line: "FAB2-A", equipment: ["ETCH-03"], yield: 95.1, status: "tested", pattern: "None" },
];

export default function LotAnalysisPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLot, setSelectedLot] = useState<LotItem | null>(null);

  const filteredLots = LOT_REGISTRY.filter(lot => {
    const matchesSearch =
      lot.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.line.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.equipment.some(e => e.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (statusFilter === "tested-excursion") return lot.status === "tested" && (lot.yield || 100) < 90;
    if (statusFilter === "tested-nominal") return lot.status === "tested" && (lot.yield || 0) >= 90;
    if (statusFilter === "planned") return lot.status === "planned";
    return true;
  });

  const exportRegistry = () => {
    const report = `YIELDGUARD AI · LOT REGISTRY EXPORT\nDate: ${new Date().toISOString()}\nTotal Lots: ${LOT_REGISTRY.length}\n\n${filteredLots.map(l => `${l.id} | ${l.product} | ${l.line} | Tools: ${l.equipment.join(", ")} | Yield: ${l.yield !== null ? l.yield + "%" : "Planned"} | Status: ${l.status}`).join("\n")}`;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fab07-lot-registry.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="page-content">
        {/* Single Page Header with Contextual Action */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> LOT REPOSITORY &amp; QUEUE
            </div>
            <h1>
              Lot analysis <span>&amp; queue</span>
            </h1>
            <p>Comprehensive wafer lot tracking across production, inspection, and planned pre-run states.</p>
          </div>
          <div className="heading-actions">
            <button className="button ghost" onClick={exportRegistry}>
              <FileText size={14} /> Export lot list
            </button>
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-top"><span>Total Registered Lots</span><Boxes size={15} /></div>
            <div className="metric-value">{LOT_REGISTRY.length}</div>
            <div className="metric-detail">Tracking on Fab 07</div>
          </div>
          <div className="metric-card metric-danger">
            <div className="metric-top"><span>Yield Excursions</span><TrendingDown size={15} /></div>
            <div className="metric-value">6 Lots</div>
            <div className="metric-detail">Tested &lt; 90.0% target</div>
          </div>
          <div className="metric-card metric-good">
            <div className="metric-top"><span>Nominal Tested</span><TrendingUp size={15} /></div>
            <div className="metric-value">5 Lots</div>
            <div className="metric-detail">Passed yield qualification</div>
          </div>
          <div className="metric-card metric-warning">
            <div className="metric-top"><span>Planned Lots</span><Target size={15} /></div>
            <div className="metric-value">3 Lots</div>
            <div className="metric-detail">Pre-run qualification</div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "20px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#ffffff", border: "1px solid #dcdad0", borderRadius: "6px", padding: "0 10px", height: "33px", minWidth: "250px" }}>
            <Search size={14} color="#8a98a4" />
            <input
              type="text"
              placeholder="Search by lot ID, product, fab line..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: "11px", color: "#1c2733", background: "transparent", width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: "5px" }}>
            <button
              className={`button small ${statusFilter === "all" ? "primary" : "ghost"}`}
              onClick={() => setStatusFilter("all")}
            >
              All ({LOT_REGISTRY.length})
            </button>
            <button
              className={`button small ${statusFilter === "tested-excursion" ? "primary" : "ghost"}`}
              onClick={() => setStatusFilter("tested-excursion")}
            >
              Excursions (6)
            </button>
            <button
              className={`button small ${statusFilter === "tested-nominal" ? "primary" : "ghost"}`}
              onClick={() => setStatusFilter("tested-nominal")}
            >
              Nominal (5)
            </button>
            <button
              className={`button small ${statusFilter === "planned" ? "primary" : "ghost"}`}
              onClick={() => setStatusFilter("planned")}
            >
              Planned (3)
            </button>
          </div>
        </div>

        {/* Clean Data Table */}
        <section className="panel" style={{ padding: "0" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#fcfbf9", borderBottom: "1px solid #edebe4", color: "#8a98a4", font: "600 8.5px 'IBM Plex Mono', monospace" }}>
                  <th style={{ padding: "10px 14px" }}>LOT ID</th>
                  <th style={{ padding: "10px 14px" }}>PRODUCT</th>
                  <th style={{ padding: "10px 14px" }}>FAB LINE</th>
                  <th style={{ padding: "10px 14px" }}>EQUIPMENT</th>
                  <th style={{ padding: "10px 14px" }}>PATTERN</th>
                  <th style={{ padding: "10px 14px" }}>YIELD</th>
                  <th style={{ padding: "10px 14px" }}>STATUS</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>INSPECT</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map(lot => {
                  const isExcursion = lot.yield !== null && lot.yield < 90;
                  return (
                    <tr key={lot.id} style={{ borderBottom: "1px solid #f4f2eb" }}>
                      <td style={{ padding: "11px 14px", font: "600 11px 'IBM Plex Mono', monospace", color: "#274c6b" }}>
                        {lot.id}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#3b5062" }}>{lot.product}</td>
                      <td style={{ padding: "11px 14px", color: "#6a7d8c", font: "9px 'IBM Plex Mono', monospace" }}>{lot.line}</td>
                      <td style={{ padding: "11px 14px", color: "#3b5062" }}>{lot.equipment.join(", ")}</td>
                      <td style={{ padding: "11px 14px", color: isExcursion ? "#b5473f" : "#6a7d8c" }}>
                        {lot.pattern || "None"}
                      </td>
                      <td style={{ padding: "11px 14px", font: "700 11px 'IBM Plex Mono', monospace", color: lot.yield === null ? "#8a98a4" : isExcursion ? "#b5473f" : "#2e6e58" }}>
                        {lot.yield !== null ? `${lot.yield}%` : "Planned"}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span className={`status-pill ${lot.status === "planned" ? "pill-medium" : isExcursion ? "pill-critical" : "pill-low"}`}>
                          <span className="status-dot" /> {lot.status === "planned" ? "Planned (Pre-run)" : isExcursion ? "Excursion" : "Nominal"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <button
                          className="button ghost small"
                          onClick={() => setSelectedLot(lot)}
                        >
                          Inspect details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Drawer for Inspecting Single Lot */}
        {selectedLot && (
          <div
            className="drawer-layer"
            onClick={() => setSelectedLot(null)}
          >
            <div className="drawer-panel" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <div className="eyebrow">LOT INSPECTOR</div>
                  <h2>{selectedLot.id} Dossier</h2>
                </div>
                <button className="icon-btn" onClick={() => setSelectedLot(null)}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="metric-card">
                  <div className="metric-top"><span>Manufacturing Record</span></div>
                  <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "10.5px" }}>
                    <div><span style={{ color: "#8a98a4" }}>Product: </span><b>{selectedLot.product}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Fab Line: </span><b>{selectedLot.line}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Tools: </span><b>{selectedLot.equipment.join(", ")}</b></div>
                    <div><span style={{ color: "#8a98a4" }}>Yield: </span><b>{selectedLot.yield !== null ? `${selectedLot.yield}%` : "Pre-run Planned"}</b></div>
                  </div>
                </div>

                {selectedLot.sensors && (
                  <div className="panel" style={{ padding: "13px" }}>
                    <h3 style={{ fontSize: "11.5px", marginBottom: "6px", color: "#273e51" }}>Sensor Signature Deviations</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {Object.entries(selectedLot.sensors).map(([key, val]) => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", padding: "5px 0", borderBottom: "1px solid #edebe4" }}>
                          <span style={{ color: "#6a7d8c", fontFamily: "'IBM Plex Mono', monospace" }}>{key}</span>
                          <b style={{ color: "#274c6b" }}>{val}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedLot.plannedParams && (
                  <div className="panel" style={{ padding: "13px" }}>
                    <h3 style={{ fontSize: "11.5px", marginBottom: "6px", color: "#273e51" }}>Planned Recipe Parameters</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {Object.entries(selectedLot.plannedParams).map(([key, val]) => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", padding: "5px 0", borderBottom: "1px solid #edebe4" }}>
                          <span style={{ color: "#6a7d8c", fontFamily: "'IBM Plex Mono', monospace" }}>{key}</span>
                          <b style={{ color: "#b8852c" }}>{val}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> In-line tracking synchronized</span>
          <span>YieldGuard AI · Lot Queue Management</span>
        </footer>
      </div>
    </AppShell>
  );
}
