"use client";

/**
 * Equipment telemetry — fleet view from query_telemetry + equipment_meta.
 *
 * Every column here exists in the tool output: tool_type, chamber_id,
 * days_since_pm, is_shared_tool, is_metrology, and the per-parameter drift
 * traces (parameter, direction, magnitude_sigma, recent_trend).
 *
 * Dropped from the previous version because no backend source produces them:
 * health index, uptime %, OEE, wafer counts, next-PM dates.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { useEquipment } from "@/lib/api";
import { Cpu, RefreshCw, TrendingDown, TrendingUp, Wrench } from "lucide-react";

type Trace = {
  equipment_id: string; parameter: string; direction: string;
  magnitude_sigma: number; recent_trend: string; tool_type: string;
};

export default function EquipmentPage() {
  const { data, error, loading, reload } = useEquipment();
  const [selected, setSelected] = useState<string | null>(null);

  const tools = useMemo(() => {
    const meta = data?.equipment_meta ?? {};
    const byEq: Record<string, string[]> = data?.lots_by_equipment ?? {};
    const traces: Trace[] = data?.telemetry ?? [];
    return ((data?.equipment_ids ?? []) as string[]).map((id) => {
      const t = traces.filter((x) => x.equipment_id === id);
      const peak = t.reduce(
        (m, x) => (Math.abs(x.magnitude_sigma) > Math.abs(m) ? x.magnitude_sigma : m), 0);
      return {
        id,
        toolType: meta[id]?.tool_type ?? "—",
        chamber: meta[id]?.chamber_id ?? "—",
        daysSincePm: meta[id]?.days_since_pm ?? null,
        shared: !!meta[id]?.is_shared_tool,
        metrology: !!meta[id]?.is_metrology,
        lots: byEq[id] ?? [],
        traces: t,
        peakSigma: peak,
      };
    }).sort((a, b) => Math.abs(b.peakSigma) - Math.abs(a.peakSigma));
  }, [data]);

  const active = tools.find((t) => t.id === selected) ?? tools[0];
  const drifting = tools.filter((t) => Math.abs(t.peakSigma) >= 2).length;

  return (
    <AppShell>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!tools.length} label="equipment telemetry">
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow accent-eyebrow">
                <span className="pulse-dot" /> FLEET TELEMETRY
              </div>
              <h1>Equipment <span>telemetry</span></h1>
              <p>
                Simulated SECS/GEM parameter drift over a {data?.window ?? "14d"} window,
                from <code>query_telemetry</code>.
              </p>
            </div>
            <div className="heading-actions">
              <button className="button primary" onClick={reload} disabled={loading}>
                <RefreshCw size={14} /> {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-top"><span>Tools in fleet</span><Cpu size={15} /></div>
              <div className="metric-value">{tools.length}</div>
              <div className="metric-detail">derived from the lot table</div>
            </div>
            <div className="metric-card">
              <div className="metric-top"><span>Drifting ≥ 2σ</span><TrendingDown size={15} /></div>
              <div className="metric-value">{drifting}</div>
              <div className="metric-detail">on at least one parameter</div>
            </div>
            <div className="metric-card">
              <div className="metric-top"><span>Traces</span></div>
              <div className="metric-value">{data?.telemetry?.length ?? 0}</div>
              <div className="metric-detail">parameter series returned</div>
            </div>
          </div>

          <section className="panel" style={{ padding: "0" }}>
            <div style={{ padding: "16px 18px 4px" }}>
              <h2 style={{ margin: 0 }}>Fleet</h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#fcfbf9", borderBottom: "1px solid #edebe4", color: "#8a98a4", font: "600 8.5px 'IBM Plex Mono', monospace" }}>
                    <th style={{ padding: "10px 14px" }}>TOOL</th>
                    <th style={{ padding: "10px 14px" }}>TYPE</th>
                    <th style={{ padding: "10px 14px" }}>CHAMBER</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>DAYS SINCE PM</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>PEAK DRIFT</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>LOTS</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      style={{
                        cursor: "pointer", borderBottom: "1px solid #f4f2eb",
                        background: active?.id === t.id ? "#eef3f7" : undefined,
                      }}
                    >
                      <td style={{ padding: "11px 14px", font: "600 11px 'IBM Plex Mono', monospace", color: "#274c6b" }}>
                        {t.id}
                        {t.shared && <span style={{ color: "#8a98a4", fontWeight: 400 }}> · shared</span>}
                        {t.metrology && <span style={{ color: "#8a98a4", fontWeight: 400 }}> · metrology</span>}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#3b5062" }}>{t.toolType}</td>
                      <td style={{ padding: "11px 14px", color: "#6a7d8c", font: "9px 'IBM Plex Mono', monospace" }}>{t.chamber}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: "#3b5062" }}>{t.daysSincePm ?? "—"}</td>
                      <td style={{
                        padding: "11px 14px", textAlign: "right", font: "700 11px 'IBM Plex Mono', monospace",
                        color: Math.abs(t.peakSigma) >= 2 ? "#b5473f" : "#2e6e58",
                      }}>
                        {t.peakSigma > 0 ? "+" : ""}{t.peakSigma.toFixed(1)}σ
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", color: "#3b5062" }}>{t.lots.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {active && (
            <section className="panel">
              <h2 style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Wrench size={15} /> {active.id} — parameter drift
              </h2>
              {active.traces.length === 0 && (
                <p className="metric-detail">No drift traces returned for this tool.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {active.traces.map((tr, i) => (
                  <div className="action-row" key={`${tr.parameter}-${i}`}>
                    <div className="action-group">
                      <b>{tr.parameter}</b>
                      <span className="metric-detail">{tr.recent_trend}</span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: Math.abs(tr.magnitude_sigma) >= 2 ? "#b3403a" : "#2e6e58" }}>
                      {tr.direction === "increasing" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {tr.magnitude_sigma > 0 ? "+" : ""}{tr.magnitude_sigma}σ
                    </span>
                  </div>
                ))}
              </div>
              {active.lots.length > 0 && (
                <div className="action-row">
                  <span>Lots on this tool</span>
                  <span style={{ display: "flex", gap: "10px" }}>
                    {active.lots.map((l) => (
                      <Link key={l} href={`/investigation?lot=${l}`}>{l}</Link>
                    ))}
                  </span>
                </div>
              )}
            </section>
          )}

          <footer className="page-footer">
            <span><span className="live-dot" /> Live from query_telemetry</span>
            <span>YieldGuard · fleet telemetry</span>
          </footer>
        </div>
      </AsyncBoundary>
    </AppShell>
  );
}
