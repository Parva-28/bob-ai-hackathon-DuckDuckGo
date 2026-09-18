"use client";

import { useState, useMemo, type ReactNode } from "react";
import AppShell from "@/components/AppShell";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
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
  Gauge,
  Layers3,
  LineChart,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";

type Lot = {
  id: string;
  status: string;
  yield: string;
  target: string;
  pattern: string;
  equipment: string;
  updated: string;
  severity: Severity;
  wafers: string;
};

// Generated from src/mcp_server/data/lots.json. Patterns are the shipped WaferCNN's
// actual predictions; planned lots have no wafer and therefore no pattern.
const LOTS: Lot[] = [
  { id: "L-5502", status: "Excursion active", yield: "8.2%", target: "92.0%", pattern: "Near-full", equipment: "TESTER-04", updated: "-", severity: "critical", wafers: "25 / 25" },
  { id: "L-5540", status: "Excursion active", yield: "11.5%", target: "92.0%", pattern: "Near-full", equipment: "HANDLER-01", updated: "-", severity: "critical", wafers: "25 / 25" },
  { id: "L-4471", status: "Review required", yield: "61.0%", target: "92.0%", pattern: "Edge-Ring", equipment: "ETCH-07", updated: "-", severity: "high", wafers: "25 / 25" },
  { id: "L-4402", status: "Review required", yield: "68.4%", target: "92.0%", pattern: "Center", equipment: "CMP-03", updated: "-", severity: "high", wafers: "25 / 25" },
  { id: "L-4815", status: "Monitoring", yield: "70.2%", target: "92.0%", pattern: "Donut", equipment: "LITHO-02", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-4418", status: "Monitoring", yield: "72.1%", target: "92.0%", pattern: "Center", equipment: "CMP-03", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-5120", status: "Monitoring", yield: "74.8%", target: "92.0%", pattern: "Random", equipment: "FILTER-B12", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-3310", status: "Monitoring", yield: "79.6%", target: "92.0%", pattern: "Scratch", equipment: "HANDLER-01", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-4502", status: "Planned (pre-run)", yield: "--", target: "92.0%", pattern: "Pre-run, no wafer yet", equipment: "CMP-03", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-4507", status: "Planned (pre-run)", yield: "--", target: "92.0%", pattern: "Pre-run, no wafer yet", equipment: "FILTER-B12", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-4511", status: "Planned (pre-run)", yield: "--", target: "92.0%", pattern: "Pre-run, no wafer yet", equipment: "ETCH-07", updated: "-", severity: "medium", wafers: "25 / 25" },
  { id: "L-4515", status: "Planned (pre-run)", yield: "--", target: "92.0%", pattern: "Pre-run, no wafer yet", equipment: "LITHO-02", updated: "-", severity: "medium", wafers: "25 / 25" },
];

const SENSORS = [
  { name: "RF power", value: "1,874 W", baseline: "1,620 W", z: "+4.8σ", severity: "critical", color: "#b5473f" },
  { name: "Chamber pressure", value: "84.2 mT", baseline: "78.0 mT", z: "+3.2σ", severity: "high", color: "#b8852c" },
  { name: "ESC temperature", value: "63.1 °C", baseline: "60.4 °C", z: "+2.6σ", severity: "medium", color: "#9f8c2b" },
  { name: "O₂ flow", value: "18.4 sccm", baseline: "18.2 sccm", z: "+0.7σ", severity: "nominal", color: "#39886f" },
];

const HYPOTHESES = [
  {
    rank: "01",
    title: "RF-power instability after PM",
    confidence: 87,
    tone: "coral",
    text: "Transient RF-power overshoot is consistent with the edge-localised defect signature and post-maintenance timing.",
    evidence: ["RF power +4.8σ", "Edge-ring signature", "PM completed 06:42"],
    tag: "Primary hypothesis"
  },
  {
    rank: "02",
    title: "Chamber pressure drift",
    confidence: 64,
    tone: "amber",
    text: "Pressure deviation may be amplifying the etch non-uniformity, but evidence is less specific to the wafer edge.",
    evidence: ["Pressure +3.2σ", "2 prior matches", "Drift began 06:55"],
    tag: "Contributing factor"
  },
  {
    rank: "03",
    title: "ESC temperature excursion",
    confidence: 38,
    tone: "slate",
    text: "Temperature is abnormal but the signal does not yet explain the spatial defect distribution on its own.",
    evidence: ["ESC +2.6σ", "Weak spatial fit", "No recent recurrence"],
    tag: "Monitor"
  },
];

const TIMELINE = [
  { time: "06:42", label: "Preventive maintenance completed", type: "pm", detail: "ETCH-07 chamber clean + RF match inspection" },
  { time: "06:55", label: "Pressure drift begins", type: "shift", detail: "Chamber pressure crosses +2σ baseline" },
  { time: "07:08", label: "RF power instability detected", type: "alert", detail: "Three overshoot events in 90 seconds" },
  { time: "07:19", label: "Lot L-4471 completes", type: "lot", detail: "Final yield 74.2% · 18 defects / wafer avg" },
];

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

function WaferMap({ lotId = "L-4471" }: { lotId?: string }) {
  const dots = useMemo(() => {
    return Array.from({ length: 120 }, (_, i) => {
      const angle = i * 2.399;
      const radius = 22 + ((i * 17) % 160);
      const x = 50 + (Math.cos(angle) * radius) / 2.12;
      const y = 50 + (Math.sin(angle) * radius) / 2.12;
      const dist = Math.sqrt((x - 50) ** 2 + (y - 50) ** 2);
      const isEdge = dist > 31 && dist < 42;
      return { x, y, isEdge, inWafer: dist <= 41, key: i };
    }).filter(d => d.inWafer);
  }, []);

  return (
    <div className="wafer-shell">
      <div className="wafer-legend">
        <span><i className="legend-defect" />Defect</span>
        <span><i className="legend-ring" />Edge region</span>
      </div>
      <svg className="wafer-map" viewBox="0 0 100 100" role="img" aria-label="Wafer defect map showing edge-ring defects">
        <defs>
          <radialGradient id="waferFillLight" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#f7f9fb" />
            <stop offset="100%" stopColor="#e2e8ec" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="41" fill="url(#waferFillLight)" stroke="#cbd7df" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="#b5473f" strokeOpacity="0.65" strokeDasharray="1.5 1.5" strokeWidth="1" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="#39886f" strokeOpacity="0.2" strokeWidth="0.5" />
        <g>
          {dots.map(dot => (
            <circle
              key={dot.key}
              cx={dot.x}
              cy={dot.y}
              r={dot.isEdge ? 1.05 : 0.6}
              fill={dot.isEdge ? "#b5473f" : "#b8852c"}
              opacity={dot.isEdge ? 0.95 : 0.45}
            />
          ))}
        </g>
        <text x="50" y="52" textAnchor="middle" fill="#6a7d8c" fontSize="3.4" fontFamily="IBM Plex Mono" fontWeight="600">
          {lotId}
        </text>
      </svg>
      <div className="wafer-caption">
        <span>18.4 defects / wafer</span>
        <span>Edge concentration <b>82%</b></span>
      </div>
    </div>
  );
}

function TelemetryChart() {
  const points = "0,77 15,72 30,74 45,66 60,68 75,57 90,61 105,54 120,57 135,46 150,50 165,44 180,36 195,42 210,28 225,34 240,18 255,24 270,14 285,20 300,8";
  return (
    <div className="telemetry-chart">
      <div className="chart-y">
        <span>+5σ</span>
        <span>+2σ</span>
        <span>0</span>
        <span>-2σ</span>
      </div>
      <svg viewBox="0 0 300 92" preserveAspectRatio="none" aria-label="RF power telemetry chart">
        <defs>
          <linearGradient id="areaLight" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#274c6b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#274c6b" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d="M0 77 L15 72 L30 74 L45 66 L60 68 L75 57 L90 61 L105 54 L120 57 L135 46 L150 50 L165 44 L180 36 L195 42 L210 28 L225 34 L240 18 L255 24 L270 14 L285 20 L300 8 L300 92 L0 92 Z" fill="url(#areaLight)" />
        <line x1="0" y1="54" x2="300" y2="54" stroke="#b8852c" strokeDasharray="4 4" strokeOpacity="0.55" strokeWidth="1.2" />
        <polyline points={points} fill="none" stroke="#274c6b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="240" cy="18" r="3.5" fill="#b5473f" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="270" cy="14" r="3.5" fill="#b5473f" stroke="#ffffff" strokeWidth="1.5" />
      </svg>
      <div className="chart-x">
        <span>05:30</span>
        <span>06:00</span>
        <span>06:42 PM</span>
        <span>07:00</span>
        <span>07:30</span>
      </div>
    </div>
  );
}

export default function InvestigationPage() {
  const [activeLot, setActiveLot] = useState<Lot>(LOTS[0]);
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
  const [feedbackTarget, setFeedbackTarget] = useState("RF-power instability after PM");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEntries, setFeedbackEntries] = useState([
    { target: "RF-power instability after PM", text: "Matches the post-maintenance timing. Verify RF match calibration first.", author: "Mei Sato", time: "Today · 08:14" },
  ]);

  const openFeedback = (target: string) => {
    setFeedbackTarget(target);
    document.getElementById("engineer-feedback")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const downloadAuditReport = () => {
    const report = `YIELDGUARD AI · INVESTIGATION AUDIT REPORT\n\nLot: ${activeLot.id}\nStatus: ${activeLot.status}\nFinal yield: ${activeLot.yield} (target ${activeLot.target})\nDefect pattern: Edge-Ring · 96% classification confidence\nPrimary hypothesis: RF-power instability after PM · 87% confidence\nSensor anomalies: RF power +4.8σ; Chamber pressure +3.2σ; ESC temperature +2.6σ\nHistorical match: CASE-1042 · 91% similarity · Yield recovered to 94.6%\nNext-lot risk: 68/100 · Elevated similarity to low-yield conditions\n\nRECOMMENDED ACTIONS\n1. Inspect RF match network\n2. Place ETCH-07 on watch\n3. Run monitor wafer\n4. Update PM checklist\n\nENGINEER FEEDBACK\n${feedbackEntries.map(entry => `- ${entry.target}: ${entry.text} (${entry.author}, ${entry.time})`).join("\n")}\n\nGenerated by YieldGuard AI · Evidence sources linked: 9 · Human review required`;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeLot.id}-yieldguard-audit-report.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell activeLotId={activeLot.id}>
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

        {/* Excursion Banner */}
        <div className="alert-banner">
          <div className="alert-leading">
            <div className="alert-icon">
              <AlertTriangle size={17} />
            </div>
            <div>
              <b>Yield excursion detected</b>
              <span>
                {activeLot.id} is <strong>{activeLot.yield}</strong> against a {activeLot.target} target · Edge-ring signature flagged on {activeLot.wafers} wafers.
              </span>
            </div>
          </div>
          <button
            className="alert-link"
            onClick={() => document.getElementById("root-cause")?.scrollIntoView({ behavior: "smooth" })}
          >
            Review hypotheses <ArrowDownRight size={14} />
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
                title={activeLot.id}
                icon={<Target size={15} />}
                action={<StatusPill severity={activeLot.severity}>{activeLot.status}</StatusPill>}
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
                    className={`lot-picker-row ${lot.id === activeLot.id ? "selected" : ""}`}
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

            {/* 4 Metric Cards */}
            <div className="metrics-grid">
              <Metric
                label="Final yield"
                value={activeLot.yield}
                detail={`↓ 17.8 pts vs target · ${activeLot.target}`}
                tone="danger"
                icon={<TrendingDown size={16} />}
              />
              <Metric
                label="Defect density"
                value="18.4 / wafer"
                detail="+14.2 above lot baseline"
                tone="warning"
                icon={<Crosshair size={16} />}
              />
              <Metric
                label="Analysis confidence"
                value="87%"
                detail="High · 9 evidence sources"
                tone="good"
                icon={<ShieldCheck size={16} />}
              />
              <Metric
                label="Time to insight"
                value="06:18"
                detail="Analysis completed 8 min ago"
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
                  action={<span className="model-chip"><Sparkles size={12} />Vision v2.4</span>}
                />
                <div className="wafer-layout">
                  <WaferMap lotId={activeLot.id} />
                  <div className="pattern-summary">
                    <div className="pattern-label">DETECTED PATTERN</div>
                    <div className="pattern-name">
                      Edge-Ring <span className="confidence-badge">96%</span>
                    </div>
                    <p>Defects cluster within outer 4 mm perimeter ring, highest density at north-east quadrant.</p>
                    <div className="pattern-stats">
                      <div><span>Defect count</span><b>460</b></div>
                      <div><span>Edge concentration</span><b>82%</b></div>
                      <div><span>Spatial fit</span><b>Strong</b></div>
                    </div>
                    <button className="text-button" onClick={() => setDrawer("wafer")}>
                      <Crosshair size={13} /> Inspect map details <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Sensor Anomaly Model */}
              <section className="panel sensor-panel">
                <SectionHeader
                  eyebrow="03 / ANOMALY MODEL"
                  title="Sensor anomaly analysis"
                  icon={<Activity size={15} />}
                  action={<span className="anomaly-score"><span>ANOMALY</span> 0.91</span>}
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
                          <b>{sensor.value}</b>
                          <span>baseline {sensor.baseline}</span>
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
                    <span className="signal-icon"><Zap size={12} /></span>
                    3 parameters crossed 2σ threshold
                  </span>
                  <button className="text-button" onClick={() => setDrawer("sensor")}>
                    View all 42 <ChevronRight size={12} />
                  </button>
                </div>
              </section>
            </div>

            {/* 04 / EQUIPMENT TELEMETRY */}
            <section className="panel telemetry-panel">
              <SectionHeader
                eyebrow="04 / IN-LINE TELEMETRY"
                title="ETCH-07 · RF power"
                icon={<LineChart size={15} />}
                action={
                  <div className="chart-controls">
                    <span className="legend-line cyan" /> RF power
                    <span className="legend-line amber" /> 2σ threshold
                  </div>
                }
              />
              <div className="telemetry-callout">
                <div className="callout-icon">
                  <ArrowUpRight size={15} />
                </div>
                <div>
                  <b>Deviation begins 06:55</b>
                  <span>13 min after preventive maintenance · 3 overshoot events detected</span>
                </div>
              </div>
              <TelemetryChart />
              <div className="timeline-section-title">
                <Clock3 size={13} /> Chamber Event Sequence (05:30 – 07:30)
              </div>
              <div className="timeline-strip">
                {TIMELINE.map(item => (
                  <div className={`timeline-event ${item.type}`} key={item.time}>
                    <div className="timeline-time-badge">
                      <Clock3 size={11} /> {item.time}
                    </div>
                    <div className="timeline-copy">
                      <b>{item.label}</b>
                      <span>{item.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 05 / TRACEABILITY EVIDENCE CHAIN */}
            <section className="panel evidence-panel">
              <SectionHeader
                eyebrow="05 / TRACEABILITY"
                title="Evidence chain"
                icon={<Layers3 size={15} />}
                action={<span className="evidence-count"><CheckCircle2 size={13} /> 9 sources linked</span>}
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
                      <b className="chain-value">Edge-Ring</b>
                      <small className="chain-sub">96% confidence (WaferCNN)</small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon coral-bg"><Activity size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">SENSOR ANOMALY</span>
                      <b className="chain-value">RF power +4.8σ</b>
                      <small className="chain-sub">3 overshoot events</small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon amber-bg"><Cpu size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">EQUIPMENT</span>
                      <b className="chain-value">Post-PM drift</b>
                      <small className="chain-sub">13 min post-service</small>
                    </div>
                  </div>
                  <div className="chain-node">
                    <div className="chain-icon violet-bg"><BookOpen size={17} /></div>
                    <div className="chain-node-content">
                      <span className="chain-label">HISTORICAL CASE</span>
                      <b className="chain-value">CASE-1042</b>
                      <small className="chain-sub">91% similarity match</small>
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
                      <span className="telemetry-context-sub">42 in-line sensor streams aligned with lot processing window (05:30 – 07:19 UTC)</span>
                    </div>
                    <span className="sync-badge">
                      <CheckCircle2 size={13} /> 100% Synchronized
                    </span>
                  </div>

                  <div className="telemetry-mini-grid">
                    <div className="telemetry-mini-item">
                      <span className="mini-label">PRIMARY EXCURSION</span>
                      <strong className="mini-val danger">RF Power (+4.8σ)</strong>
                      <span className="mini-sub">1,874 W (Baseline: 1,620 W)</span>
                    </div>
                    <div className="telemetry-mini-item">
                      <span className="mini-label">DRIFT ANOMALY</span>
                      <strong className="mini-val warning">Chamber Pressure (+3.2σ)</strong>
                      <span className="mini-sub">84.2 mT (Baseline: 78.0 mT)</span>
                    </div>
                    <div className="telemetry-mini-item">
                      <span className="mini-label">THERMAL STABILITY</span>
                      <strong className="mini-val warning">ESC Temperature (+2.6σ)</strong>
                      <span className="mini-sub">63.1 °C (Baseline: 60.4 °C)</span>
                    </div>
                    <div className="telemetry-mini-item">
                      <span className="mini-label">GAS INJECTION</span>
                      <strong className="mini-val nominal">O₂ Gas Flow (+0.7σ)</strong>
                      <span className="mini-sub">18.4 sccm (Baseline: 18.2 sccm)</span>
                    </div>
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

            {/* 06 / ROOT CAUSE HYPOTHESES (Prominent Primary Standout) */}
            <section className="panel root-panel" id="root-cause">
              <SectionHeader
                eyebrow="06 / AI SYNTHESIS"
                title="Root-cause hypotheses"
                icon={<BrainCircuit size={15} />}
                action={<div className="governance-chip"><ShieldCheck size={12} /> Human review required</div>}
              />
              <div className="synthesis-summary">
                <div className="synthesis-badge">
                  <Sparkles size={13} /> AI SYNTHESIS
                </div>
                <p>
                  RF-power instability is the leading explanation for the edge-ring excursion. Conclusion is supported by independent wafer, sensor, telemetry, and historical evidence.
                </p>
              </div>
              <div className="hypothesis-list">
                {HYPOTHESES.map(item => (
                  <div className={`hypothesis-card ${item.tone}`} key={item.rank}>
                    <div className="hypothesis-rank">{item.rank}</div>
                    <div className="hypothesis-body">
                      <div className="hypothesis-top">
                        <div>
                          <span className="hypothesis-tag">{item.tag}</span>
                          <h3>{item.title}</h3>
                        </div>
                        <div className="confidence-ring">
                          <b>{item.confidence}%</b>
                          <span>confidence</span>
                        </div>
                      </div>
                      <p>{item.text}</p>
                      <div className="hypothesis-evidence">
                        {item.evidence.map(e => (
                          <span key={e}>
                            <Check size={11} /> {e}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      className="icon-btn hypothesis-open"
                      onClick={() => openFeedback(item.title)}
                      aria-label={`Comment on ${item.title}`}
                    >
                      <MessageSquareText size={14} />
                    </button>
                  </div>
                ))}
              </div>
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
                  {[
                    "Inspect RF match network",
                    "Place ETCH-07 on watch",
                    "Run monitor wafer",
                    "Update PM checklist",
                  ].map(item => (
                    <option key={item}>{item}</option>
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
              <div className="case-match">
                <div className="case-score">91<span>%</span></div>
                <div>
                  <b>CASE-1042</b>
                  <p>Edge-ring defects after RF match replacement</p>
                  <span className="case-outcome">
                    <CheckCircle2 size={11} /> Yield recovered to 94.6%
                  </span>
                </div>
              </div>
              <div className="case-meta">
                <span><Clock3 size={12} /> Nov 14, 2025</span>
                <span><Cpu size={12} /> ETCH-07</span>
                <span><Gauge size={12} /> Similarity high</span>
              </div>
              <div className="case-quote">
                “RF match calibration was out of tolerance after PM. Recalibration and chamber seasoning cleared the edge signature.”
              </div>
            </section>

            {/* 08 / RECOMMENDED ACTIONS */}
            <section className="panel actions-panel">
              <SectionHeader
                eyebrow="08 / NEXT STEPS"
                title="Recommended actions"
                icon={<Wrench size={15} />}
                action={<span className="action-count">3 actions</span>}
              />
              <div className="action-group">
                <div className="action-group-title">
                  <span className="action-number immediate">1</span>
                  <span>Immediate containment</span>
                </div>
                <button className="action-row" onClick={() => openFeedback("Inspect RF match network")}>
                  <span className="action-check" />
                  <span>
                    <b>Inspect RF match network</b>
                    <small>Compare post-PM calibration against spec</small>
                  </span>
                  <MessageSquareText size={13} />
                </button>
                <button className="action-row" onClick={() => openFeedback("Place ETCH-07 on watch")}>
                  <span className="action-check" />
                  <span>
                    <b>Place ETCH-07 on watch</b>
                    <small>Do not auto-change equipment settings</small>
                  </span>
                  <MessageSquareText size={13} />
                </button>
              </div>
              <div className="action-group">
                <div className="action-group-title">
                  <span className="action-number verify">2</span>
                  <span>Verification</span>
                </div>
                <button className="action-row" onClick={() => openFeedback("Run monitor wafer")}>
                  <span className="action-check" />
                  <span>
                    <b>Run monitor wafer</b>
                    <small>Verify edge uniformity after recalibration</small>
                  </span>
                  <MessageSquareText size={13} />
                </button>
              </div>
              <div className="action-group">
                <div className="action-group-title">
                  <span className="action-number prevent">3</span>
                  <span>Preventive action</span>
                </div>
                <button className="action-row" onClick={() => openFeedback("Update PM checklist")}>
                  <span className="action-check" />
                  <span>
                    <b>Update PM checklist</b>
                    <small>Add RF match validation step</small>
                  </span>
                  <MessageSquareText size={13} />
                </button>
              </div>
            </section>

            {/* 09 / NEXT LOT RISK */}
            <section className="panel risk-panel">
              <SectionHeader
                eyebrow="09 / NEXT LOT"
                title="Batch risk triage"
                icon={<ShieldCheck size={15} />}
                action={<span className="triage-chip">Triage signal</span>}
              />
              <div className="risk-score-row">
                <div className="risk-meter">
                  <div className="risk-meter-fill" style={{ width: "68%" }} />
                </div>
                <div className="risk-number">68<span>/100</span></div>
              </div>
              <div className="risk-label">
                <span className="risk-dot" /> Elevated similarity to low-yield conditions
              </div>
              <p style={{ fontSize: "10px", color: "#6a7c8b", marginTop: "6px", lineHeight: "1.45" }}>
                Upcoming lot <b>L-4511</b> shares the same equipment and 4 of 6 high-weight process parameters.
              </p>
              <div className="risk-params">
                <div><span>RF power setpoint</span><b>+2.4%</b></div>
                <div><span>Chamber pressure</span><b>+1.1%</b></div>
                <div><span>Post-PM interval</span><b>12 min</b></div>
              </div>
              <small className="disclaimer">
                <CircleHelp size={11} /> Risk is a triage signal, not an automatic production decision.
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
          <span><span className="live-dot" /> Real-time investigation evidence grounded</span>
          <span>YieldGuard AI · Investigation Workspace v2.4.0</span>
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
                  <WaferMap lotId={activeLot.id} />
                  <div className="drawer-kpis">
                    <div>
                      <span>Pattern fit</span>
                      <b>96%</b>
                      <small>High confidence</small>
                    </div>
                    <div>
                      <span>Defect centroid</span>
                      <b>NE quadrant</b>
                      <small>+18° from nominal</small>
                    </div>
                    <div>
                      <span>Ring density</span>
                      <b>82%</b>
                      <small>of all detected defects</small>
                    </div>
                  </div>
                </div>
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    Spatial interpretation <span>MODEL EXPLANATION</span>
                  </div>
                  <p>
                    Defects are concentrated in the outer 4 mm ring and are strongest in the north-east quadrant. The spatial signature aligns with non-uniform edge etch behavior.
                  </p>
                </div>
                <div className="drawer-section">
                  <div className="drawer-section-title">Inspection checklist</div>
                  <div className="drawer-check"><CheckCircle2 size={14} /> Compare edge exclusion against previous lots</div>
                  <div className="drawer-check"><CheckCircle2 size={14} /> Review RF match calibration and seasoning</div>
                  <div className="drawer-check"><CircleHelp size={14} /> Validate with monitor wafer before release</div>
                </div>
              </>
            ) : (
              <>
                <div className="drawer-score">
                  <div className="big-score">0.91</div>
                  <div>
                    <span>Composite anomaly score</span>
                    <b>High severity · 3 signals above threshold</b>
                    <small>Baseline window: previous 30 lots on ETCH-07</small>
                  </div>
                </div>
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    Top abnormal parameters <span>STANDARDIZED DEVIATION</span>
                  </div>
                  {SENSORS.map(sensor => (
                    <div className="drawer-sensor" key={sensor.name}>
                      <div>
                        <b>{sensor.name}</b>
                        <span>{sensor.value} · baseline {sensor.baseline}</span>
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
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    Temporal read <span>CHANGE POINT</span>
                  </div>
                  <div className="change-point">
                    <div className="change-point-line"><span /><i /></div>
                    <div>
                      <b>06:55</b>
                      <p>
                        Pressure drift begins 13 min after preventive maintenance. RF power overshoot follows at 07:08, strengthening the post-PM causal link.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
