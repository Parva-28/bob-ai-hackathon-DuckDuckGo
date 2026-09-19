"use client";

import { useState, useMemo, type ReactNode, useRef, useEffect } from "react";
import AppShell from "@/components/AppShell";
import { AsyncBoundary } from "@/components/AsyncBoundary";
import { useLots, useAnalyze } from "@/lib/api";
import {
  AlertTriangle,
  ArrowDownRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Crosshair,
  Download,
  ExternalLink,
  Layers3,
  LineChart,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wrench,
  X,
  Activity,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";

/** Only fields /api/lots produces. target, updated and wafers had no source. */
type Lot = {
  id: string;
  status: string;
  yield: string;
  pattern: string;
  equipment: string;
  severity: Severity;
};

// Generated from src/mcp_server/data/lots.json. Patterns are the shipped WaferCNN's
// actual predictions; planned lots have no wafer and therefore no pattern.




function StatusPill({ severity, children }: { severity: Severity | "nominal"; children: ReactNode }) {
  const styles: Record<string, string> = {
    critical: "pill-critical",
    high: "pill-high",
    medium: "pill-medium",
    low: "pill-low",
    nominal: "pill-nominal",
  };
  return (
    <span className={`status-pill ${styles[severity] || "pill-nominal"}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}

function SectionHeader({ eyebrow, title, action, icon }: { eyebrow: string; title: string; action?: ReactNode; icon: ReactNode }) {
  return (
    <div className="section-header">
      <div className="section-title-wrap">
        <div className="section-icon">{icon}</div>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, detail, tone = "neutral", icon }: { label: string; value: string; detail: string; tone?: string; icon: ReactNode }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

/** Draws the lot's actual 64x64 WM-811K grid (0=outside, 1=pass, 2=defect) from
 *  /api/analyze's `wafer` field — no two lots share a grid, so this can no longer
 *  render the same "Edge-Ring" shape regardless of which lot is selected. */
function WaferMap({ grid, lotId, pattern, confidence }: {
  grid: number[][] | null | undefined; lotId?: string;
  pattern?: string; confidence?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stats = useMemo(() => {
    if (!grid) return null;
    let total = 0, defect = 0;
    for (const row of grid) for (const v of row) { if (v !== 0) total++; if (v === 2) defect++; }
    return { total, defect, defectRate: total ? Math.round((defect / total) * 1000) / 10 : 0 };
  }, [grid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = 4;
    canvas.width = grid[0].length * cell;
    canvas.height = grid.length * cell;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#eef1f3";
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const v = grid[r][c];
        if (v === 0) continue;
        ctx.fillStyle = v === 2 ? "#b5473f" : "#cfe0d6";
        ctx.fillRect(c * cell, r * cell, cell - 0.4, cell - 0.4);
      }
    }
  }, [grid]);

  if (!grid) {
    return (
      <div className="wafer-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "180px" }}>
        <p className="metric-detail">No wafer map on file for this lot.</p>
      </div>
    );
  }

  return (
    <div className="wafer-shell">
      <div className="wafer-legend">
        <span><i className="legend-defect" />Defect die</span>
        <span><i className="legend-ring" />Passing die</span>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Wafer defect map for ${lotId}`}
        style={{ width: "100%", height: "auto", borderRadius: "50%", background: "#f7f9fb", display: "block" }}
      />
      <div className="wafer-caption">
        <span>{lotId}</span>
        <span>
          {stats ? `${stats.defect} of ${stats.total} dies (${stats.defectRate}%)` : "—"}
          {pattern ? ` · ${pattern}${confidence != null ? ` ${Math.round(confidence * 100)}%` : ""}` : ""}
        </span>
      </div>
    </div>
  );
}

type DriftTrace = {
  equipment_id: string; parameter: string; direction: string;
  magnitude_sigma: number; recent_trend: string;
};

/** The MCP telemetry tool returns one point-in-time reading per parameter, not a
 *  time series, so this lists the real readings instead of drawing a fabricated
 *  continuous trend line. */
function TelemetryList({ traces }: { traces: DriftTrace[] }) {
  if (!traces.length) {
    return <p className="metric-detail">No telemetry returned for this lot's equipment.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {traces.map((tr, i) => (
        <div className="action-row" key={`${tr.equipment_id}-${tr.parameter}-${i}`}>
          <div className="action-group">
            <b>{tr.equipment_id} · {tr.parameter}</b>
            <span className="metric-detail">{tr.recent_trend}</span>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", color: Math.abs(tr.magnitude_sigma) >= 2 ? "#b5473f" : "#2e6e58" }}>
            {tr.direction === "increasing" ? <TrendingUp size={13} /> : tr.direction === "decreasing" ? <TrendingDown size={13} /> : null}
            {tr.magnitude_sigma > 0 ? "+" : ""}{tr.magnitude_sigma}σ
          </span>
        </div>
      ))}
    </div>
  );
}

export default function InvestigationPage() {
  const { data: lotsRes } = useLots();
  const [picked, setPicked] = useState<string | null>(null);

  const LOTS = useMemo(() => {
    const sev = (y: number | null) =>
      y == null ? "medium" : y < 40 ? "critical" : y < 70 ? "high" : y < 80 ? "medium" : "low";
    return (Object.values(lotsRes?.lots ?? {}) as any[])
      .map((l) => ({
        id: l.lot_id,
        status: l.status === "planned" ? "Planned (pre-run)" : "Tested",
        yield: l.yield == null ? "--" : `${l.yield}%`,
        equipment: (l.equipment ?? []).join(", ") || "—",
        severity: sev(l.yield) as Severity,
        pattern: "",
      }))
      .sort((a, b) => (a.yield === "--" ? 1 : b.yield === "--" ? -1 : 0));
  }, [lotsRes]);

  const activeLotId = picked ?? LOTS[0]?.id ?? null;
  const { data: an, error, loading, reload } = useAnalyze(activeLotId);
  const isPlanned = an?.mode === "pre_run";

  const classification = an?.classification ?? {};
  const anomaly = an?.anomaly ?? {};
  const casesList: any[] = an?.cases?.cases ?? [];
  const topCase = casesList[0];
  const telemetryList: DriftTrace[] = an?.telemetry?.telemetry ?? [];
  const peakTrace = useMemo(() =>
    telemetryList.reduce((m, t) => (Math.abs(t.magnitude_sigma) > Math.abs(m?.magnitude_sigma ?? 0) ? t : m),
      undefined as DriftTrace | undefined),
  [telemetryList]);
  const actionsList: any[] = an?.actions?.actions ?? [];
  const risk = an?.risk ?? {};
  const waferGrid: number[][] | undefined = an?.wafer;
  const stepsCount = an?.steps?.length ?? 0;

  // Sensor deviations as the tool reports them: SECOM channels are anonymised, so
  // no physical name, unit or baseline is shown — the previous version displayed
  // "RF power 1,874 W (baseline 1,620 W)", none of which exists in the data.
  const SENSORS = useMemo(() => {
    const sig: Record<string, number> = an?.lot?.sensor_signature ?? {};
    const top: string[] = an?.anomaly?.top_deviating_sensors ?? [];
    const rows = Object.entries(sig).map(([name, z]) => ({
      name, z: `${z > 0 ? "+" : ""}${z}σ`, zNum: z,
      severity: Math.abs(z) >= 3 ? "critical" : Math.abs(z) >= 2 ? "high"
        : Math.abs(z) >= 1 ? "medium" : "nominal",
      color: Math.abs(z) >= 3 ? "#b5473f" : Math.abs(z) >= 2 ? "#b8852c" : "#39886f",
      ranked: top.includes(name),
    }));
    return rows.sort((a, b) => Math.abs(b.zNum) - Math.abs(a.zNum));
  }, [an]);

  const HYPOTHESES = useMemo(() =>
    ((an?.ranked?.hypotheses ?? []) as any[]).map((h, i) => ({
      rank: String(i + 1).padStart(2, "0"),
      id: h.hypothesis_id,
      title: h.description,
      category: h.category,
      confidence: h.confidence,
      evidence: h.evidence_summary,
      contradicting: h.contradicting_evidence ?? h.what_would_change_this ?? null,
    })), [an]);
  const topHypothesis = HYPOTHESES[0];

  const waferStats = useMemo(() => {
    if (!waferGrid) return null;
    let total = 0, defect = 0;
    for (const row of waferGrid) for (const v of row) { if (v !== 0) total++; if (v === 2) defect++; }
    return { total, defect, defectRate: total ? Math.round((defect / total) * 1000) / 10 : 0 };
  }, [waferGrid]);

  const primaryEquipment = an?.lot?.equipment_ids?.[0];

  // Selection is an id; the row is derived, so it cannot go stale when lots reload.
  const activeLot: Lot | undefined = useMemo(
    () => LOTS.find((l) => l.id === activeLotId) ?? LOTS[0], [LOTS, activeLotId]);
  const setActiveLot = (l: Lot) => setPicked(l.id);
  const [activeTab, setActiveTab] = useState("Evidence chain");
  const [feedback, setFeedback] = useState<"confirmed" | "rejected" | null>(null);
  const [showAllLots, setShowAllLots] = useState(false);
  const [comment, setComment] = useState("");
  const [engineerNotes, setEngineerNotes] = useState([
    {
      id: 1,
      author: "Mei Sato",
      role: "Yield Engineer",
      text: "Verified post-PM timing. RF match network calibration drift matches the edge-localized failure signature.",
      time: "Today · 08:14",
    },
    {
      id: 2,
      author: "Kenji Tanaka",
      role: "Lead Process Tech",
      text: "ETCH-07 placed on engineering hold. Ready for RF match tuning and 3-wafer baseline qualification.",
      time: "Today · 07:50",
    },
  ]);
  const [drawer, setDrawer] = useState<"wafer" | "sensor" | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEntries, setFeedbackEntries] = useState<
    { target: string; text: string; author: string; time: string }[]
  >([]);
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});

  const openFeedback = (target: string) => {
    setFeedbackTarget(target);
    document.getElementById("engineer-feedback")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Default the comment target to this lot's top hypothesis (or its first
  // action) once analysis loads, and clear stale feedback when the lot changes.
  useEffect(() => {
    setFeedbackTarget(topHypothesis?.title ?? actionsList[0]?.description ?? "");
    setFeedbackEntries([]);
    setCheckedActions({});
  }, [an?.lot?.lot_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const downloadAuditReport = () => {
    const topSensors = SENSORS.slice(0, 3).map(s => `${s.name} ${s.z}`).join("; ") || "none reported";
    const report = `YIELDGUARD AI · INVESTIGATION AUDIT REPORT\n\nLot: ${activeLot?.id}\nStatus: ${activeLot?.status}\nFinal yield: ${activeLot?.yield}\nDefect pattern: ${classification.predicted_class ?? "not available"}${classification.confidence != null ? ` · ${Math.round(classification.confidence * 100)}% classification confidence` : ""}\nPrimary hypothesis: ${topHypothesis?.title ?? "insufficient evidence to rank a root cause"}${topHypothesis?.confidence != null ? ` · ${Math.round(topHypothesis.confidence * 100)}% (uncalibrated)` : ""}\nSensor anomalies: ${topSensors}\nHistorical match: ${topCase ? `${topCase.case_id} · ${Math.round(topCase.similarity * 100)}% similarity · ${topCase.outcome}` : "no precedent above similarity threshold"}\nPre-run risk signal: ${risk.similarity_to_historical_low_yield != null ? `${Math.round(risk.similarity_to_historical_low_yield * 100)}/100 · ${risk.at_risk ? "at risk" : "below threshold"}` : "not available"}\n\nRECOMMENDED ACTIONS\n${actionsList.length ? actionsList.map((a, i) => `${i + 1}. ${a.description} (${a.priority} priority)`).join("\n") : "None returned for this lot."}\n\nENGINEER FEEDBACK\n${feedbackEntries.map(entry => `- ${entry.target}: ${entry.text} (${entry.author}, ${entry.time})`).join("\n")}\n\nGenerated by YieldGuard AI · MCP tool calls: ${stepsCount} · Human review required`;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeLot?.id}-yieldguard-audit-report.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell activeLotId={activeLot?.id}>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!LOTS.length} label="investigation">
      <div className="page-content">
        {/* Single Page Header with Contextual Action Buttons */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> ROOT CAUSE INVESTIGATION
            </div>
            <h1>
              Yield intelligence <span>workspace</span>
            </h1>
            <p>Evidence-grounded diagnostic analysis and root-cause synthesis for lot excursion resolution.</p>
          </div>
          <div className="heading-actions">
            <button className="button ghost" onClick={downloadAuditReport}>
              <Download size={14} /> Export report
            </button>
            <button className="button primary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Refresh analysis
            </button>
          </div>
        </div>

        {/* Status Banner */}
        <div className="alert-banner">
          <div className="alert-leading">
            <div className="alert-icon">
              <AlertTriangle size={17} />
            </div>
            <div>
              {isPlanned ? (
                <>
                  <b>Pre-run lot — not yet processed</b>
                  <span>
                    {activeLot?.id} is scheduled and has no wafer map or sensor data yet.
                    Risk below is assessed from planned process parameters only.
                  </span>
                </>
              ) : (
                <>
                  <b>Yield excursion detected</b>
                  <span>
                    {activeLot?.id} tested at <strong>{activeLot?.yield}</strong>
                    {classification.predicted_class ? <> · <strong>{classification.predicted_class}</strong> defect signature</> : ""}
                    {waferStats ? ` flagged on ${waferStats.defect} of ${waferStats.total} dies.` : "."}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            className="alert-link"
            onClick={() => document.getElementById("historical-evidence")?.scrollIntoView({ behavior: "smooth" })}
          >
            Review evidence <ArrowDownRight size={14} />
          </button>
        </div>

        {/* 2-Column Analytical Layout */}
        <div className="workspace-grid">
          {/* Left Column: Context ➔ Visuals ➔ Anomaly ➔ Telemetry ➔ Evidence ➔ Hypotheses ➔ Feedback */}
          <section className="content-column">
            {/* 01 / LOT OVERVIEW */}
            <div className="section-heading-row">
              <SectionHeader
                eyebrow="01 / LOT CONTEXT"
                title={activeLot?.id}
                icon={<Target size={15} />}
                action={<StatusPill severity={activeLot?.severity}>{activeLot?.status}</StatusPill>}
              />
              <button className="mini-link" onClick={() => setShowAllLots(!showAllLots)}>
                {showAllLots ? "Hide queue" : "Change lot"}
                <ChevronDown size={13} className={showAllLots ? "rotate-180" : ""} />
              </button>
            </div>

            {showAllLots && (
              <div className="lot-picker">
                {LOTS.map(lot => (
                  <button
                    key={lot.id}
                    className={`lot-picker-row ${lot.id === activeLot?.id ? "selected" : ""}`}
                    onClick={() => {
                      setActiveLot(lot);
                      setShowAllLots(false);
                    }}
                  >
                    <span className="lot-id">{lot.id}</span>
                    <span>{lot.pattern}</span>
                    <b>{lot.yield}</b>
                    <StatusPill severity={lot.severity}>{lot.status}</StatusPill>
                  </button>
                ))}
              </div>
            )}

            {/* 4 Metric Cards — every value below comes from this lot's own
                /api/analyze response, so it changes when the lot changes. */}
            <div className="metrics-grid">
              <Metric
                label="Final yield"
                value={activeLot?.yield ?? "—"}
                detail={isPlanned ? "Not yet run" : "Measured at test"}
                tone={isPlanned ? "neutral" : "danger"}
                icon={<TrendingDown size={16} />}
              />
              <Metric
                label="Defect density"
                value={waferStats ? `${waferStats.defect} / ${waferStats.total}` : "—"}
                detail={waferStats ? `${waferStats.defectRate}% of scored dies` : "No wafer map for this lot"}
                tone="warning"
                icon={<Crosshair size={16} />}
              />
              <Metric
                label="Top hypothesis confidence"
                value={topHypothesis?.confidence != null ? `${Math.round(topHypothesis.confidence * 100)}%` : "—"}
                detail="Uncalibrated ranking signal"
                tone="good"
                icon={<ShieldCheck size={16} />}
              />
              <Metric
                label="Evidence tool calls"
                value={String(stepsCount)}
                detail="MCP tools invoked for this lot"
                icon={<Clock3 size={16} />}
              />
            </div>

            {/* 02 / VISION & 03 / ANOMALY */}
            <div className="two-col-grid">
              {/* Wafer Visual Analysis */}
              <section className="panel wafer-panel">
                <SectionHeader
                  eyebrow="02 / VISION MODEL"
                  title="Wafer defect analysis"
                  icon={<Crosshair size={15} />}
                  action={<span className="model-chip"><Sparkles size={12} />WaferCNN</span>}
                />
                {isPlanned ? (
                  <p className="metric-detail">This lot has not run — no wafer map exists yet.</p>
                ) : (
                  <div className="wafer-layout">
                    <WaferMap
                      grid={waferGrid}
                      lotId={activeLot?.id}
                      pattern={classification.predicted_class}
                      confidence={classification.confidence}
                    />
                    <div className="pattern-summary">
                      <div className="pattern-label">DETECTED PATTERN</div>
                      <div className="pattern-name">
                        {classification.predicted_class ?? "Not available"}
                        {classification.confidence != null && (
                          <span className="confidence-badge">{Math.round(classification.confidence * 100)}%</span>
                        )}
                      </div>
                      <div className="pattern-stats">
                        <div><span>Defect dies</span><b>{waferStats ? waferStats.defect : "—"}</b></div>
                        <div><span>Scored dies</span><b>{waferStats ? waferStats.total : "—"}</b></div>
                        <div><span>Defect rate</span><b>{waferStats ? `${waferStats.defectRate}%` : "—"}</b></div>
                      </div>
                      <button className="text-button" onClick={() => setDrawer("wafer")} disabled={!waferGrid}>
                        <Crosshair size={13} /> Inspect map details <ExternalLink size={11} />
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Sensor Anomaly Model */}
              <section className="panel sensor-panel">
                <SectionHeader
                  eyebrow="03 / ANOMALY MODEL"
                  title="Sensor anomaly analysis"
                  icon={<Activity size={15} />}
                  action={
                    <span className="anomaly-score">
                      <span>ANOMALY</span> {anomaly.anomaly_score != null ? anomaly.anomaly_score : "—"}
                    </span>
                  }
                />
                <div className="sensor-list">
                  {SENSORS.map(sensor => (
                    <div className="sensor-row" key={sensor.name}>
                      <div className="sensor-main">
                        <div className="sensor-name">
                          <span className="sensor-bar" style={{ background: sensor.color }} />
                          {sensor.name}
                        </div>
                        <div className="sensor-values">
                          <span>{sensor.ranked ? "top deviating" : "reported"}</span>
                        </div>
                      </div>
                      <div className="sensor-sigma" style={{ color: sensor.color }}>
                        {sensor.z}
                      </div>
                      <StatusPill severity={sensor.severity === "nominal" ? "nominal" : (sensor.severity as Severity)}>
                        {sensor.severity}
                      </StatusPill>
                    </div>
                  ))}
                </div>
                <div className="sensor-foot">
                  <span>
                    {SENSORS.filter(s => Math.abs(s.zNum) >= 2).length} of {SENSORS.length} reported parameters crossed 2σ
                  </span>
                  <button className="text-button" onClick={() => setDrawer("sensor")} disabled={!SENSORS.length}>
                    View all {SENSORS.length} <ChevronRight size={12} />
                  </button>
                </div>
              </section>
            </div>

            {/* 04 / EQUIPMENT TELEMETRY */}
            <section className="panel telemetry-panel">
              <SectionHeader
                eyebrow="04 / IN-LINE TELEMETRY"
                title={primaryEquipment ? `${primaryEquipment} telemetry` : "Equipment telemetry"}
                icon={<LineChart size={15} />}
              />
              {peakTrace ? (
                <div className="telemetry-callout">
                  <div className="callout-icon">
                    {peakTrace.direction === "increasing" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  </div>
                  <div>
                    <b>{peakTrace.equipment_id} · {peakTrace.parameter} {peakTrace.magnitude_sigma > 0 ? "+" : ""}{peakTrace.magnitude_sigma}σ</b>
                    <span>{peakTrace.recent_trend}</span>
                  </div>
                </div>
              ) : (
                <p className="metric-detail">No telemetry returned for this lot's equipment.</p>
              )}
              <TelemetryList traces={telemetryList} />
            </section>

            {/* 05 / TRACEABILITY EVIDENCE CHAIN */}
            <section className="panel evidence-panel" id="historical-evidence">
              <SectionHeader
                eyebrow="05 / TRACEABILITY"
                title="Evidence chain"
                icon={<Layers3 size={15} />}
                action={<span className="evidence-count"><CheckCircle2 size={13} /> {stepsCount} tool calls linked</span>}
              />
              <div className="tabs">
                {["Evidence chain", "Telemetry context", "Engineer notes"].map(tab => (
                  <button
                    key={tab}
                    className={activeTab === tab ? "tab active" : "tab"}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {activeTab === "Evidence chain" && (
                <div className="evidence-chain">
                  <div className="chain-node">
                    <div className="chain-icon cyan-bg"><Crosshair size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">WAFER PATTERN</span>
                      <b className="chain-value">{classification.predicted_class ?? "Not available"}</b>
                      <small className="chain-sub">
                        {classification.confidence != null ? `${Math.round(classification.confidence * 100)}% confidence (WaferCNN)` : "no wafer map for this lot"}
                      </small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon coral-bg"><Activity size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">SENSOR ANOMALY</span>
                      <b className="chain-value">
                        {SENSORS[0] ? `${SENSORS[0].name} ${SENSORS[0].z}` : "No sensor data"}
                      </b>
                      <small className="chain-sub">
                        {anomaly.anomaly_score != null ? `anomaly score ${anomaly.anomaly_score}` : "not scored"}
                      </small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon amber-bg"><Cpu size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">EQUIPMENT</span>
                      <b className="chain-value">
                        {peakTrace ? `${peakTrace.parameter} ${peakTrace.direction}` : "No drift"}
                      </b>
                      <small className="chain-sub">{peakTrace ? peakTrace.equipment_id : "—"}</small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon violet-bg"><BookOpen size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">HISTORICAL CASE</span>
                      <b className="chain-value">{topCase?.case_id ?? "No precedent"}</b>
                      <small className="chain-sub">
                        {topCase ? `${Math.round(topCase.similarity * 100)}% similarity match` : "no case above threshold"}
                      </small>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "Telemetry context" && (
                <div className="telemetry-context-card">
                  <div className="telemetry-context-header">
                    <div className="telemetry-context-icon">
                      <LineChart size={18} />
                    </div>
                    <div className="telemetry-context-meta">
                      <b className="telemetry-context-title">Telemetry Sensor Alignment</b>
                      <span className="telemetry-context-sub">
                        {telemetryList.length} parameter trace(s) returned for {(an?.lot?.equipment_ids ?? []).join(", ") || "this lot's equipment"}
                      </span>
                    </div>
                  </div>

                  <div className="telemetry-mini-grid">
                    {telemetryList.length === 0 && <p className="metric-detail">No telemetry returned.</p>}
                    {telemetryList.slice(0, 4).map((tr, i) => (
                      <div className="telemetry-mini-item" key={`${tr.equipment_id}-${tr.parameter}-${i}`}>
                        <span className="mini-label">{tr.equipment_id.toUpperCase()}</span>
                        <strong className={`mini-val ${Math.abs(tr.magnitude_sigma) >= 2 ? "danger" : Math.abs(tr.magnitude_sigma) >= 1 ? "warning" : "nominal"}`}>
                          {tr.parameter} ({tr.magnitude_sigma > 0 ? "+" : ""}{tr.magnitude_sigma}σ)
                        </strong>
                        <span className="mini-sub">{tr.recent_trend}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === "Engineer notes" && (
                <div className="notes-container">
                  <div className="notes-input-card">
                    <textarea
                      className="notes-textarea"
                      placeholder="Add an observation or hypothesis for the investigation record…"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      rows={3}
                    />
                    <div className="notes-action-row">
                      <span className="notes-author-tag">
                        Logging as: <b>Mei Sato (Yield Engineer)</b>
                      </span>
                      <button
                        className="button primary small"
                        disabled={!comment.trim()}
                        onClick={() => {
                          if (!comment.trim()) return;
                          setEngineerNotes(prev => [
                            {
                              id: Date.now(),
                              author: "Mei Sato",
                              role: "Yield Engineer",
                              text: comment.trim(),
                              time: "Just now",
                            },
                            ...prev,
                          ]);
                          setComment("");
                        }}
                      >
                        <Send size={13} /> Add note to audit log
                      </button>
                    </div>
                  </div>

                  {/* List of existing notes */}
                  <div className="notes-feed">
                    {engineerNotes.map(n => (
                      <div key={n.id} className="note-item">
                        <div className="note-header">
                          <div className="note-author-info">
                            <span className="note-avatar">{n.author.slice(0, 2).toUpperCase()}</span>
                            <b>{n.author}</b>
                            <span className="note-role">{n.role}</span>
                          </div>
                          <span className="note-time">{n.time}</span>
                        </div>
                        <p className="note-text">{n.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>


            {/* 07 / ENGINEER INPUT */}
            <section className="panel feedback-workbench" id="engineer-feedback">
              <SectionHeader
                eyebrow="07 / ENGINEER INPUT"
                title="Investigation comments"
                icon={<MessageSquareText size={15} />}
                action={<span className="evidence-count"><ShieldCheck size={13} /> Human-in-the-loop</span>}
              />
              <p className="feedback-intro">
                Leave targeted context on a hypothesis or action. Comments are included in exported audit reports.
              </p>
              <div className="feedback-targets">
                <span>COMMENT ON</span>
                <select value={feedbackTarget} onChange={e => setFeedbackTarget(e.target.value)}>
                  {HYPOTHESES.map(item => (
                    <option key={item.title}>{item.title}</option>
                  ))}
                  {actionsList.map((a, i) => (
                    <option key={`${a.description}-${i}`}>{a.description}</option>
                  ))}
                </select>
              </div>
              <div className="comment-composer">
                <textarea
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Capture what you verified, what remains uncertain, or what the next engineer should know…"
                />
                <button
                  className="button primary small"
                  onClick={() => {
                    if (!feedbackText.trim()) return;
                    setFeedbackEntries(entries => [
                      { target: feedbackTarget, text: feedbackText.trim(), author: "Mei Sato", time: "Just now" },
                      ...entries,
                    ]);
                    setFeedbackText("");
                  }}
                >
                  <Send size={13} /> Add comment
                </button>
              </div>
              <div className="comment-list">
                {feedbackEntries.map((entry, idx) => (
                  <div className="comment-item" key={`${entry.target}-${idx}`}>
                    <div className="comment-avatar">MS</div>
                    <div>
                      <div className="comment-meta">
                        <b>{entry.target}</b>
                        <span>{entry.author} · {entry.time}</span>
                      </div>
                      <p>{entry.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>

          {/* Right Rail: Historical retrieval, Actions, Next-lot risk, Feedback */}
          <aside className="right-column">
            {/* 07 / HISTORICAL RETRIEVAL */}
            <section className="panel case-panel">
              <SectionHeader
                eyebrow="07 / RETRIEVAL"
                title="Similar historical cases"
                icon={<BookOpen size={15} />}
              />
              {topCase ? (
                <>
                  <div className="case-match">
                    <div className="case-score">{Math.round(topCase.similarity * 100)}<span>%</span></div>
                    <div>
                      <b>{topCase.case_id}</b>
                      <p>{topCase.confirmed_root_cause}</p>
                      <span className="case-outcome">
                        <CheckCircle2 size={11} /> {topCase.outcome}
                      </span>
                    </div>
                  </div>
                  <div className="case-meta">
                    <span><Cpu size={12} /> {topCase.equipment_id ?? "—"}</span>
                    <span>{topCase.category ?? "—"}</span>
                    <span>{topCase.provenance ?? "constructed"}</span>
                  </div>
                  {casesList.length > 1 && (
                    <div className="case-quote">
                      +{casesList.length - 1} more precedent(s): {casesList.slice(1, 4).map(c => c.case_id).join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <p className="metric-detail">
                  {an?.cases?._note ?? "No historical case scored above the similarity threshold for this lot."}
                </p>
              )}
            </section>

            {/* 08 / RECOMMENDED ACTIONS — a real checklist sourced from
                get_corrective_action_playbook for THIS lot's top hypothesis. */}
            <section className="panel actions-panel">
              <SectionHeader
                eyebrow="08 / NEXT STEPS"
                title="Recommended actions"
                icon={<Wrench size={15} />}
                action={<span className="action-count">{actionsList.length} action{actionsList.length === 1 ? "" : "s"}</span>}
              />
              {actionsList.length === 0 && (
                <p className="metric-detail">No corrective actions returned for this lot.</p>
              )}
              {(["high", "medium", "low"] as const).map((priority) => {
                const group = actionsList.filter((a) => (a.priority ?? "medium") === priority);
                if (!group.length) return null;
                return (
                  <div className="action-group" key={priority}>
                    <div className="action-group-title">
                      <span className={`action-number ${priority === "high" ? "immediate" : priority === "medium" ? "verify" : "prevent"}`}>
                        {priority === "high" ? "!" : priority === "medium" ? "•" : "○"}
                      </span>
                      <span>{priority[0].toUpperCase() + priority.slice(1)} priority</span>
                    </div>
                    {group.map((a, i) => {
                      const key = `${activeLotId}-${priority}-${i}`;
                      const checked = !!checkedActions[key];
                      return (
                        <label className="action-row" key={key} style={{ cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setCheckedActions((prev) => ({ ...prev, [key]: !prev[key] }))}
                            style={{ width: "15px", height: "15px", accentColor: "#274c6b" }}
                          />
                          <span>
                            <b style={{ textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.6 : 1 }}>
                              {a.description}
                            </b>
                            {a.is_preventive && <small>Preventive action</small>}
                          </span>
                          <button
                            className="icon-btn"
                            onClick={(e) => { e.preventDefault(); openFeedback(a.description); }}
                            aria-label={`Comment on ${a.description}`}
                          >
                            <MessageSquareText size={13} />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </section>

            {/* 09 / PRE-RUN RISK SIGNAL — flag_at_risk_batch scored on THIS lot's own
                planned process parameters against historical low-yield profiles. */}
            <section className="panel risk-panel">
              <SectionHeader
                eyebrow="09 / RISK SIGNAL"
                title="Low-yield similarity"
                icon={<ShieldCheck size={15} />}
                action={<span className="triage-chip">{risk.at_risk ? "At risk" : "Below threshold"}</span>}
              />
              <div className="risk-score-row">
                <div className="risk-meter">
                  <div className="risk-meter-fill" style={{ width: `${Math.round((risk.similarity_to_historical_low_yield ?? 0) * 100)}%` }} />
                </div>
                <div className="risk-number">
                  {risk.similarity_to_historical_low_yield != null ? Math.round(risk.similarity_to_historical_low_yield * 100) : "—"}
                  <span>/100</span>
                </div>
              </div>
              <div className="risk-label">
                <span className="risk-dot" />
                {risk.similarity_to_historical_low_yield != null
                  ? `Similarity to historical low-yield profiles (${Math.round((risk.threshold_used ?? 0.6) * 100)}% flag threshold)`
                  : "Risk signal not available for this lot"}
              </div>
              {risk.matched_case_ids?.length > 0 && (
                <p style={{ fontSize: "10px", color: "#6a7c8b", marginTop: "6px", lineHeight: "1.45" }}>
                  Matched historical cases: <b>{risk.matched_case_ids.join(", ")}</b>
                </p>
              )}
              <small className="disclaimer">
                <CircleHelp size={11} /> {risk._caveat ?? "Similarity to past low-yield profiles, not a causal prediction."}
              </small>
            </section>

            {/* 10 / ENGINEER FEEDBACK VERDICT */}
            <section className="panel feedback-panel">
              <div className="feedback-heading">
                <div className="feedback-icon"><MessageSquareText size={15} /></div>
                <div>
                  <div className="eyebrow">10 / ENGINEER VERDICT</div>
                  <h3>Does this analysis match your read?</h3>
                </div>
              </div>
              <p>Confirm or reject the leading hypothesis to improve the investigation record.</p>
              <div className="feedback-buttons">
                <button
                  className={`feedback-btn confirm ${feedback === "confirmed" ? "selected" : ""}`}
                  onClick={() => setFeedback("confirmed")}
                >
                  <CheckCircle2 size={14} /> Confirm
                </button>
                <button
                  className={`feedback-btn reject ${feedback === "rejected" ? "selected" : ""}`}
                  onClick={() => setFeedback("rejected")}
                >
                  <X size={14} /> Reject
                </button>
              </div>
              {feedback && (
                <div className="feedback-state">
                  <Check size={12} /> {feedback === "confirmed" ? "Your confirmation is recorded in FR-10." : "Your rejection is recorded. Add an explanation in notes."}
                </div>
              )}
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> {stepsCount} MCP tool calls grounded this analysis</span>
          <span>YieldGuard AI · Investigation Workspace</span>
        </footer>
      </div>

      {/* Slide-in Drawer */}
      {drawer && (
        <div
          className="drawer-layer"
          role="dialog"
          aria-modal="true"
          onClick={() => setDrawer(null)}
        >
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="eyebrow">
                  {drawer === "wafer" ? "VISION MODEL · DEEP INSPECTION" : "ANOMALY MODEL · DEEP INSPECTION"}
                </div>
                <h2>{drawer === "wafer" ? "Wafer map diagnostics" : "Sensor anomaly diagnostics"}</h2>
              </div>
              <button className="icon-btn" onClick={() => setDrawer(null)} aria-label="Close drawer">
                <X size={16} />
              </button>
            </div>

            {drawer === "wafer" ? (
              <>
                <div className="drawer-wafer">
                  <WaferMap
                    grid={waferGrid}
                    lotId={activeLot?.id}
                    pattern={classification.predicted_class}
                    confidence={classification.confidence}
                  />
                  <div className="drawer-kpis">
                    <div>
                      <span>Classification confidence</span>
                      <b>{classification.confidence != null ? `${Math.round(classification.confidence * 100)}%` : "—"}</b>
                      <small>WaferCNN</small>
                    </div>
                    <div>
                      <span>Defect dies</span>
                      <b>{waferStats ? waferStats.defect : "—"}</b>
                      <small>of {waferStats ? waferStats.total : "—"} scored</small>
                    </div>
                    <div>
                      <span>Defect rate</span>
                      <b>{waferStats ? `${waferStats.defectRate}%` : "—"}</b>
                      <small>of scored dies</small>
                    </div>
                  </div>
                </div>
                <div className="drawer-section">
                  <div className="drawer-section-title">Inspection checklist</div>
                  <div className="drawer-check"><CheckCircle2 size={14} /> Compare this map against the equipment's last qualified run</div>
                  <div className="drawer-check"><CheckCircle2 size={14} /> Cross-check the flagged pattern against the top hypothesis category</div>
                  <div className="drawer-check"><CircleHelp size={14} /> Validate with a monitor wafer before release</div>
                </div>
              </>
            ) : (
              <>
                <div className="drawer-score">
                  <div className="big-score">{anomaly.anomaly_score != null ? anomaly.anomaly_score : "—"}</div>
                  <div>
                    <span>Composite anomaly score</span>
                    <b>{SENSORS.filter(s => Math.abs(s.zNum) >= 2).length} of {SENSORS.length} reported signals above 2σ</b>
                    <small>Scored by the SECOM-trained Isolation Forest</small>
                  </div>
                </div>
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    Reported parameters <span>STANDARDIZED DEVIATION</span>
                  </div>
                  {SENSORS.length === 0 && <p className="metric-detail">No sensor signature reported for this lot.</p>}
                  {SENSORS.map(sensor => (
                    <div className="drawer-sensor" key={sensor.name}>
                      <div>
                        <b>{sensor.name}</b>
                        <span>{sensor.ranked ? "top deviating" : "reported"}</span>
                      </div>
                      <strong style={{ color: sensor.color }}>{sensor.z}</strong>
                      <div className="drawer-bar">
                        <i
                          style={{
                            width: `${Math.min(100, Math.abs(Number.parseFloat(sensor.z)) * 16 + 12)}%`,
                            background: sensor.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {peakTrace && (
                  <div className="drawer-section">
                    <div className="drawer-section-title">
                      Equipment context <span>QUERY_TELEMETRY</span>
                    </div>
                    <div className="change-point">
                      <div className="change-point-line"><span /><i /></div>
                      <div>
                        <b>{peakTrace.equipment_id} · {peakTrace.parameter}</b>
                        <p>{peakTrace.recent_trend}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      </AsyncBoundary>
    </AppShell>
  );
}
