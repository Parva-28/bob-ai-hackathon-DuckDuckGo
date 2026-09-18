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

          <div className="panel">
            <h2>Fleet</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Tool</th>
                  <th style={{ textAlign: "left" }}>Type</th>
                  <th style={{ textAlign: "left" }}>Chamber</th>
                  <th style={{ textAlign: "right" }}>Days since PM</th>
                  <th style={{ textAlign: "right" }}>Peak drift</th>
                  <th style={{ textAlign: "left" }}>Lots</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.id} onClick={() => setSelected(t.id)}
                      style={{ cursor: "pointer",
                               background: active?.id === t.id ? "#eef3f7" : undefined }}>
                    <td><b>{t.id}</b>{t.shared && <span className="metric-detail"> · shared</span>}
                        {t.metrology && <span className="metric-detail"> · metrology</span>}</td>
                    <td>{t.toolType}</td>
                    <td>{t.chamber}</td>
                    <td style={{ textAlign: "right" }}>{t.daysSincePm ?? "—"}</td>
                    <td style={{ textAlign: "right",
                                 color: Math.abs(t.peakSigma) >= 2 ? "#b3403a" : undefined }}>
                      {t.peakSigma > 0 ? "+" : ""}{t.peakSigma.toFixed(1)}σ
                    </td>
                    <td>{t.lots.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {active && (
            <div className="panel">
              <h2><Wrench size={15} /> {active.id} — parameter drift</h2>
              {active.traces.length === 0 && (
                <p className="metric-detail">No drift traces returned for this tool.</p>
              )}
              {active.traces.map((tr, i) => (
                <div className="action-row" key={`${tr.parameter}-${i}`}>
                  <div className="action-group">
                    <b>{tr.parameter}</b>
                    <span className="metric-detail">{tr.recent_trend}</span>
                  </div>
                  <span style={{ color: Math.abs(tr.magnitude_sigma) >= 2 ? "#b3403a" : "#2e6e58" }}>
                    {tr.direction === "increasing" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {" "}{tr.magnitude_sigma > 0 ? "+" : ""}{tr.magnitude_sigma}σ
                  </span>
                </div>
              ))}
              {active.lots.length > 0 && (
                <div className="action-row">
                  <span>Lots on this tool</span>
                  <span>
                    {active.lots.map((l) => (
                      <Link key={l} href={`/investigation?lot=${l}`}
                            style={{ marginLeft: 6 }}>{l}</Link>
                    ))}
                  </span>
                </div>
              )}
            </div>
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
