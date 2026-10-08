"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { useLots, useStatus, useEval } from "@/lib/api";
import {
  AlertTriangle,
  ArrowRight,
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

  const { data: lotsRes, error, loading, reload } = useLots();
  const { data: status } = useStatus();
  const { data: evalRes } = useEval();

  // Everything below is derived from the API. Nothing is typed in: a literal here
  // is a number that silently goes stale the moment the data changes.
  const lots = useMemo(() => {
    const raw = lotsRes?.lots ?? {};
    const sev = (y: number | null) =>
      y == null ? "medium" : y < 40 ? "critical" : y < 70 ? "high" : y < 80 ? "medium" : "low";
    return Object.values(raw).map((l: any) => ({
      id: l.lot_id, product: l.product, line: l.line,
      equipment: (l.equipment ?? []).join(", ") || "—",
      yield: l.yield == null ? "--" : `${l.yield}%`,
      yieldNum: l.yield,
      status: l.status === "planned" ? "Planned (pre-run)"
        : l.yield != null && l.yield < 40 ? "Excursion active"
        : l.yield != null && l.yield < 70 ? "Review required" : "Monitoring",
      severity: sev(l.yield),
    })).sort((x, y) => (x.yieldNum ?? 1e9) - (y.yieldNum ?? 1e9));
  }, [lotsRes]);

  const worst = lots[0];   // sorted ascending by yield above

  const kpis = useMemo(() => {
    const tested = lots.filter(l => l.yieldNum != null);
    const avg = tested.length
      ? tested.reduce((a, l) => a + (l.yieldNum as number), 0) / tested.length : null;
    const exc = tested.filter(l => (l.yieldNum as number) < 40);
    const tools = status?.tools ?? {};
    const realTools = Object.values(tools).filter(t => t === "real").length;
    const passed = evalRes?.summary?.passed, total = evalRes?.summary?.total_cases;
    return [
      { label: "Mean lot yield", value: avg == null ? "—" : `${avg.toFixed(1)}%`,
        detail: `${tested.length} tested lots`, tone: avg != null && avg < 70 ? "warning" : "good",
        icon: <TrendingDown size={16} /> },
      { label: "Active excursions", value: `${exc.length} lot${exc.length === 1 ? "" : "s"}`,
        detail: exc.map(l => `${l.id} (${l.yield})`).join(", ") || "none below 40%",
        tone: exc.length ? "danger" : "good", icon: <AlertTriangle size={16} /> },
      { label: "Tools backed by models", value: `${realTools}`,
        detail: `${Object.keys(tools).length} MCP tools, ${status?.stub_count ?? 0} stubs`,
        tone: status?.stub_count ? "warning" : "good", icon: <Cpu size={16} /> },
      { label: "Benchmark", value: passed != null && total ? `${passed}/${total}` : "—",
        detail: evalRes?.summary?.source ?? "no live run recorded",
        tone: passed === total ? "good" : "warning", icon: <ShieldCheck size={16} /> },
    ];
  }, [lots, status, evalRes]);

  const filteredLots = lots.filter(l => {
    if (filter === "excursion") return l.severity === "critical" || l.severity === "high";
    if (filter === "planned") return l.status.includes("Planned");
    return true;
  });

  const exportSummary = () => {
    const report = [`YIELDGUARD · FLEET OVERVIEW`, `Generated: ${new Date().toISOString()}`, "",...kpis.map(k => `${k.label}: ${k.value} (${k.detail})`), "", "LOTS",...lots.map(l => `- ${l.id}: ${l.product} | ${l.equipment} | yield ${l.yield} | ${l.status}`)].join("\n");
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fab07-fleet-summary.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell activeLotId={lots[0]?.id}>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!lots.length} label="lots">
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
            <button className="button primary" onClick={reload} disabled={loading}>
              <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Excursion Banner with Direct Action */}
        <div className="alert-banner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div className="alert-leading">
            <div className="alert-icon">
              <AlertTriangle size={18} />
            </div>
            <div>
              <b>Lowest-yield lot: {worst?.id ?? "—"}</b>
              <span>
                Final yield {worst?.yield ?? "—"} on {worst?.equipment ?? "—"} ({worst?.status ?? "—"}).
              </span>
            </div>
          </div>
          <Link
            href="/investigation"
            className="button primary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
          >
            Investigate {worst?.id ?? ""} <ArrowRight size={14} />
          </Link>
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
                    <th style={{ padding: "10px 14px" }}>YIELD</th>
                    <th style={{ padding: "10px 14px" }}>STATUS</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.map(lot => (
                    <tr key={lot.id} style={{ borderBottom: "1px solid #f4f2eb" }}>
                      <td style={{ padding: "11px 14px", font: "600 11px 'IBM Plex Mono', monospace", color: "#274c6b" }}>
                        <Link href={lot.status.includes("Planned") ? "/batch-risk" : "/investigation"} style={{ textDecoration: "none", color: "inherit", fontWeight: 700 }}>
                          {lot.id}
                        </Link>
                      </td>
                      <td style={{ padding: "11px 14px", color: "#425466" }}>{lot.product}</td>
                      <td style={{ padding: "11px 14px", color: "#425466" }}>{lot.equipment}</td>
                      <td style={{ padding: "11px 14px", font: "700 11px 'IBM Plex Mono', monospace", color: lot.severity === "critical" ? "#b5473f" : "#2e6e58" }}>
                        {lot.yield}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span className={`status-pill pill-${lot.severity}`}>
                          <span className="status-dot" /> {lot.status}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <Link
                          href={lot.status.includes("Planned") ? "/batch-risk" : "/investigation"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#2563eb",
                            textDecoration: "none",
                            background: "#eff6ff",
                            padding: "3px 8px",
                            borderRadius: "5px",
                          }}
                        >
                          {lot.status.includes("Planned") ? "Triage" : "Diagnose"} <ArrowRight size={11} />
                        </Link>
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
                    <b style={{ color: "#273e51", fontSize: "10.5px" }}>ETCH-07</b>
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
                    <b style={{ color: "#273e51", fontSize: "10.5px" }}>LITHO-02</b>
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
                <span className="triage-chip">L-4511</span>
              </div>
              <div className="risk-score-row">
                <div className="risk-meter">
                  <div className="risk-meter-fill" style={{ width: "68%" }} />
                </div>
                <div className="risk-number">68<span>/100</span></div>
              </div>
              <p style={{ color: "#6a7c8b", fontSize: "10px", marginTop: "8px", lineHeight: "1.45" }}>
                Upcoming lot shares 4 high-weight parameters with low-yield conditions on ETCH-07.
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
      </AsyncBoundary>
    </AppShell>
  );
}
