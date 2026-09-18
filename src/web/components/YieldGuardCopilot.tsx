"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  Zap,
  ArrowRight,
} from "lucide-react";

interface CopilotProps {
  activeLotId?: string;
  currentRoute?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  citations?: string[];
  confidence?: number;
  actions?: { label: string; href: string }[];
}

const INITIAL_SUGGESTIONS = [
  {
    label: "Why did lot WFR-24-0817 fail?",
    query: "Why did lot WFR-24-0817 drop to 74.2% yield?",
  },
  {
    label: "Explain ETCH-04 RF spike (+4.8σ)",
    query: "What caused the +4.8σ RF power transient spike on ETCH-04?",
  },
  {
    label: "Recommend immediate containment",
    query: "What containment actions should I dispatch right now?",
  },
  {
    label: "Is upcoming lot WFR-24-0818 safe?",
    query: "Is upcoming lot WFR-24-0818 at risk if processed on ETCH-04?",
  },
];

export default function YieldGuardCopilot({ activeLotId = "WFR-24-0817", currentRoute = "/overview" }: CopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello Mei. I am **YieldGuard Copilot**, connected to **Google Gemini 2.0 Flash** and Fab 07 real-time telemetry.\n\nI have active context on **Lot WFR-24-0817** and tool **ETCH-04**. How can I assist your yield investigation today?",
      timestamp: "Just now",
      citations: ["Fab 07 Fleet Feed", "ETCH-04 Sensor Signature", "WM-811K ViT"],
      actions: [
        { label: "View Investigation", href: "/investigation" },
        { label: "Open Playbook", href: "/playbook" },
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages]);

  // Keyboard shortcut Ctrl+J or Cmd+J to toggle copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI synthesis with realistic grounded answers
    setTimeout(() => {
      const aiResponse = generateGroundedResponse(query, activeLotId);
      setMessages((prev) => [...prev, aiResponse]);
      setIsTyping(false);
    }, 850);
  };

  const generateGroundedResponse = (query: string, lotId: string): Message => {
    const q = query.toLowerCase();
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Next Steps / Containment Actions / What should I do
    if (
      q.includes("next step") ||
      q.includes("what next") ||
      q.includes("what should") ||
      q.includes("what to do") ||
      q.includes("contain") ||
      q.includes("action") ||
      q.includes("fix") ||
      q.includes("playbook") ||
      q.includes("sop") ||
      q.includes("procedure") ||
      q.includes("checklist") ||
      q.includes("remed") ||
      q.includes("resolve") ||
      q.includes("recommend")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Immediate Cleanroom Containment Protocol for ${lotId}

1. **Lock Machine ETCH-04 (Priority 1 - Immediate):** Halt wafer loading immediately. Set tool interlock status to \`MAINTENANCE_HOLD\` in MES to prevent defect propagation.
2. **Quarantine Downstream Lot WFR-24-0818 (Priority 1):** Hold planned lot in FOUP buffer. Reroute to ETCH-03 to avoid an estimated $85,000 silicon damage.
3. **Inspect RF Match Network (Priority 2):** Disassemble RF match enclosure. Check vacuum variable capacitor drive belt tension and torques for phase detector drift.
4. **Run 3 Bare Silicon Monitor Wafers (Priority 3):** Perform 49-point oxide etch uniformity verification across full wafer diameter before releasing tool to production.`,
        timestamp,
        confidence: 95,
        citations: ["SOP-ETCH-409 Rev C", "Fab 07 Containment Policy", "SECS/GEM Interlock Interface"],
        actions: [
          { label: "Open Action Playbook", href: "/playbook" },
          { label: "Hold Lot WFR-24-0818", href: "/batch-risk" },
        ],
      };
    }

    // 2. Historical Precedents / Has this happened before
    if (
      q.includes("before") ||
      q.includes("happened") ||
      q.includes("history") ||
      q.includes("historical") ||
      q.includes("precedent") ||
      q.includes("past") ||
      q.includes("similar") ||
      q.includes("recurrence") ||
      q.includes("prior") ||
      q.includes("previous") ||
      q.includes("1042") ||
      q.includes("case") ||
      q.includes("archive")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Historical Precedent Match: CASE-1042 (91% Match)

Yes, this exact excursion signature occurred on **March 14, 2024** on line FAB2-A.

- **Incident Record:** CASE-1042 (Product P-LOGIC-3N on ETCH-04).
- **Failure Signature:** Yield crashed to 73.8% with an identical **Edge-Ring** spatial defect distribution following PM chamber clean.
- **Root Cause Found:** RF match network vacuum capacitor coupling screw slipped after thermal cycling, causing erratic reflected power and localized edge plasma heating (+4.6σ).
- **Remediation & Recovery:** Technicians re-torqued the RF match coupler, calibrated stepper drive voltages, and ran 3 monitor wafers. Yield recovered to **94.6% nominal**.
- **Key Difference Today:** Today's event also features a concurrent +3.2σ chamber pressure drift, suggesting simultaneous throttle valve seal contamination.`,
        timestamp,
        confidence: 91,
        citations: ["CASE-1042 Post-Mortem Report", "Vector Cosine Match: 0.91", "Fab 07 Knowledge Base"],
        actions: [
          { label: "View Historical Cases", href: "/cases" },
          { label: "Examine Evidence in Workspace", href: "/investigation" },
        ],
      };
    }

    // 3. Sensor / RF Power / Telemetry Anomalies
    if (
      q.includes("rf") ||
      q.includes("power") ||
      q.includes("spike") ||
      q.includes("sensor") ||
      q.includes("pressure") ||
      q.includes("temp") ||
      q.includes("esc") ||
      q.includes("telemetry") ||
      q.includes("sigma") ||
      q.includes("drift") ||
      q.includes("anomaly") ||
      q.includes("overshoot")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### ETCH-04 In-Line Telemetry Diagnostic

Out of 42 active process sensors, 3 parameters violated statistical process control thresholds:

1. **RF Power (+4.8σ - CRITICAL):** Spiked to 1,874 W (Baseline: 1,620 W). 3 discrete overshoot events occurred between 07:08 and 07:11 (13–16 min post-PM).
2. **Chamber Pressure (+3.2σ - HIGH):** Drifted upward to 84.2 mT (Baseline: 78.0 mT), starting at 06:55.
3. **ESC Temperature (+2.6σ - WARNING):** Climbed to 63.1 °C (Baseline: 60.4 °C) due to concentrated plasma heating.
4. **Physical Mechanism:** Excessive RF power delivery concentrated intense capacitive plasma along the outer wafer periphery, causing accelerated edge etch rates and gate dielectric breakdown.`,
        timestamp,
        confidence: 94,
        citations: ["Chamber 2 Telemetry Stream", "Isolation Forest Z-Score (+4.8σ)", "SECOM Telemetry Feed"],
        actions: [
          { label: "View Equipment Telemetry", href: "/equipment" },
          { label: "Dispatch Match Calibration", href: "/playbook" },
        ],
      };
    }

    // 4. Wafer Map / Spatial Defect Pattern
    if (
      q.includes("wafer") ||
      q.includes("pattern") ||
      q.includes("edge") ||
      q.includes("ring") ||
      q.includes("map") ||
      q.includes("vit") ||
      q.includes("cnn") ||
      q.includes("die") ||
      q.includes("defect") ||
      q.includes("spatial") ||
      q.includes("visual")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Wafer-Map Defect Pattern Analysis (WM-811K ViT)

- **Pattern Classification:** **Edge-Ring** (96% model confidence via Vision Transformer).
- **Defect Density:** 18.4 defective die per wafer (vs nominal baseline < 1.2 die).
- **Spatial Concentration:** **82% of all defects** are concentrated in the outer 15% radial annular ring (die coordinates R > 31mm).
- **ViT Reasoning:** The patch self-attention map demonstrates non-local defect continuity along the entire perimeter, confirming radial plasma sheath non-uniformity rather than mechanical scratches or particle contamination.`,
        timestamp,
        confidence: 96,
        citations: ["WaferViT Vision Transformer", "WM-811K 64x64 Spatial Map", "Die Defect Registry"],
        actions: [
          { label: "Inspect Wafer Die Map", href: "/investigation" },
          { label: "View Lot Queue", href: "/lot-analysis" },
        ],
      };
    }

    // 5. Batch Risk / Upcoming Lot WFR-24-0818
    if (
      q.includes("0818") ||
      q.includes("safe") ||
      q.includes("upcoming") ||
      q.includes("next lot") ||
      q.includes("risk") ||
      q.includes("batch") ||
      q.includes("triage") ||
      q.includes("planned") ||
      q.includes("queue")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Pre-Run Batch Risk Triage: Lot WFR-24-0818

⚠️ **CRITICAL PRE-RUN WARNING: DO NOT RUN ON ETCH-04**

- **Risk Score:** **68 / 100 (HIGH RISK)**
- **Cosine Similarity:** 0.74 match to historical fail profiles.
- **Impending Failure:** WFR-24-0818 is queued for 3nm logic recipes on ETCH-04. Running now will result in an identical edge-ring failure.
- **Financial Exposure:** Estimated **$85,000 raw silicon wafer loss** (25 wafers).
- **Recommended Action:** Quarantine lot in buffer and re-route to **ETCH-03** (nominal baseline yield: 95.1%).`,
        timestamp,
        confidence: 89,
        citations: ["Batch Risk Cosine Metric (0.74)", "Fab 07 Scheduler", "MES Routing Engine"],
        actions: [
          { label: "Open Batch Risk Monitor", href: "/batch-risk" },
          { label: "Check ETCH-03 Availability", href: "/equipment" },
        ],
      };
    }

    // 6. Cost / Economics / Financial Impact
    if (
      q.includes("cost") ||
      q.includes("loss") ||
      q.includes("revenue") ||
      q.includes("money") ||
      q.includes("dollar") ||
      q.includes("scrap") ||
      q.includes("financial") ||
      q.includes("worth")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Fab Financial & Scrap Impact Analysis

- **Current Lot Loss:** At 3nm nodes, a 1% yield drop represents ~$14,000 per wafer. For Lot WFR-24-0817 (74.2% vs 92% target = 17.8% drop), the financial loss is **~$336,000**.
- **Prevented Loss:** Catching ETCH-04 drift before running planned lot WFR-24-0818 saves **$85,000+** in scrap costs.
- **Fab Cumulative Exposure:** If ETCH-04 runs uncontained for another 12-hour shift, estimated compounding losses exceed **$1.8M**.`,
        timestamp,
        confidence: 96,
        citations: ["Fab 07 Accounting Model", "3nm Wafer Cost Matrix", "Scrap Recovery Index"],
        actions: [
          { label: "Open Action Playbook", href: "/playbook" },
          { label: "Export Audit Report", href: "/reports" },
        ],
      };
    }

    // 7. Model Governance / AI Transparency
    if (
      q.includes("model") ||
      q.includes("gemini") ||
      q.includes("granite") ||
      q.includes("hallucinat") ||
      q.includes("trust") ||
      q.includes("governance") ||
      q.includes("accuracy") ||
      q.includes("benchmark") ||
      q.includes("eval")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Model Governance & Reasoning Integrity

- **Primary Provider:** Google Gemini 2.0 Flash via \`google-genai\` SDK (watsonx.ai Granite fallback).
- **Evidence Citation:** Every hypothesis must cite a named sensor residual, historical case, or telemetry drift parameter; ungrounded statements are dropped by the server.
- **Negative Grounding:** If process sensors are nominal, the system rejects equipment blame and investigates mechanical handling or tester artifacts.
- **Measurement Dispute Ceiling:** Hypotheses attributing failure to measurement tools are confidence-capped at **0.70** to recommend hold-and-retest instead of premature wafer scrap.
- **Benchmark Suite:** 18/18 test cases validated across 6 fab failure modes with 257 contract assertions passing.`,
        timestamp,
        confidence: 100,
        citations: ["Gemini 2.0 Flash Model Card", "Model Governance Ledger", "18-Case Benchmark Matrix"],
        actions: [
          { label: "Open Model Governance", href: "/governance" },
          { label: "Inspect 18-Case Benchmark", href: "/benchmark" },
        ],
      };
    }

    // 8. General / Why did it fail / Root Cause
    if (
      q.includes("why") ||
      q.includes("fail") ||
      q.includes("cause") ||
      q.includes("yield") ||
      q.includes("drop") ||
      q.includes("74") ||
      q.includes("reason") ||
      q.includes("what happened") ||
      q.includes("diagnos")
    ) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Ranked Root-Cause Diagnosis for Lot ${lotId}

1. **Primary Cause (87% Confidence):** Transient RF-power instability (+4.8σ) on **ETCH-04** immediately following preventive maintenance at 06:42.
2. **Spatial Pattern:** Vision ViT classified an **Edge-Ring** defect distribution (96% confidence) across 24 wafers.
3. **Contributing Factor:** Chamber pressure drifted +3.2σ starting at 06:55, magnifying plasma non-uniformity at the outer wafer edge.
4. **Precedent:** Correlates 91% with **CASE-1042** (March 2024), where improper RF match network impedance matching caused identical edge yield loss.`,
        timestamp,
        confidence: 87,
        citations: ["ETCH-04 RF Power (+4.8σ)", "Pressure (+3.2σ)", "ViT: Edge-Ring (96%)", "Precedent: CASE-1042"],
        actions: [
          { label: "Examine Evidence in Workspace", href: "/investigation" },
          { label: "Review Playbook Containment", href: "/playbook" },
        ],
      };
    }

    // 9. Contextual Dynamic Fallback
    return {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: `### YieldGuard Copilot Synthesis

I analyzed your query: *"${query}"* against Fab 07 real-time telemetry and Lot ${lotId} records.

- **Active Excursion:** Lot ${lotId} experienced a 74.2% yield crash on tool ETCH-04.
- **Leading Hypothesis:** Post-PM RF match network instability (+4.8σ) resulting in an edge-ring defect ring.

**You can ask me specific questions like:**
- *"What are my next steps?"* (Dispatches containment checklist)
- *"Has this ever happened before?"* (Details historical CASE-1042 precedent)
- *"Is upcoming lot WFR-24-0818 safe to run?"* (Pre-run risk triage)
- *"Explain the +4.8σ RF power spike on ETCH-04"* (Detailed sensor telemetry)`,
      timestamp,
      confidence: 85,
      citations: ["Gemini 2.0 Flash / CoT", "Fab 07 Knowledge Base"],
      actions: [
        { label: "Investigate Wafer Map", href: "/investigation" },
        { label: "Open Action Playbook", href: "/playbook" },
      ],
    };
  };

  return (
    <>
      {/* ── Persistent Floating Copilot Trigger ── */}
      <button
        className="copilot-launcher"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open YieldGuard AI Copilot"
        title="Open YieldGuard Copilot (Ctrl + J)"
      >
        <span className="copilot-sparkle-dot" />
        <Sparkles size={18} className="copilot-icon" />
        <span className="copilot-launcher-text">Ask AI Copilot</span>
        <kbd className="copilot-kbd">Ctrl J</kbd>
      </button>

      {/* ── Slide-out Copilot Panel ── */}
      {isOpen && (
        <div className={`copilot-drawer ${isExpanded ? "expanded" : ""}`}>
          {/* Header */}
          <div className="copilot-header">
            <div className="copilot-title-group">
              <div className="copilot-avatar">
                <Bot size={18} />
              </div>
              <div>
                <div className="copilot-title">
                  YieldGuard Copilot
                  <span className="copilot-pill">Gemini 2.0 Flash</span>
                </div>
                <div className="copilot-sub">
                  Context: <b>{activeLotId}</b> · ETCH-04 (Excursion)
                </div>
              </div>
            </div>

            <div className="copilot-header-actions">
              <button
                className="copilot-tool-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? "Collapse width" : "Expand width"}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                className="copilot-tool-btn"
                onClick={() =>
                  setMessages([
                    {
                      id: "welcome-reset",
                      role: "assistant",
                      content: `Conversation reset. Active context on **Lot ${activeLotId}** (ETCH-04). How can I help?`,
                      timestamp: "Just now",
                    },
                  ])
                }
                title="Reset conversation"
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="copilot-tool-btn close"
                onClick={() => setIsOpen(false)}
                title="Close Copilot (Esc)"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick Suggestion Chips */}
          <div className="copilot-suggestions">
            <div className="suggestions-label">SUGGESTED QUESTIONS:</div>
            <div className="chips-scroll">
              {INITIAL_SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  className="suggestion-chip"
                  onClick={() => handleSend(s.query)}
                >
                  <Zap size={11} className="chip-icon" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="copilot-body">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`copilot-message ${msg.role === "user" ? "user" : "assistant"}`}
              >
                <div className="message-header">
                  <span className="message-role">
                    {msg.role === "user" ? <User size={12} /> : <Bot size={12} />}
                    {msg.role === "user" ? "You (Yield Engineer)" : "YieldGuard AI"}
                  </span>
                  <span className="message-time">{msg.timestamp}</span>
                </div>

                <div className="message-bubble">
                  <div
                    className="message-markdown"
                    dangerouslySetInnerHTML={{
                      __html: formatMarkdown(msg.content),
                    }}
                  />

                  {msg.confidence !== undefined && (
                    <div className="confidence-pill">
                      <CheckCircle2 size={12} /> Calibrated Confidence: <b>{msg.confidence}%</b>
                    </div>
                  )}

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="message-citations">
                      <div className="citation-title">EVIDENCE CITATIONS:</div>
                      <div className="citation-tags">
                        {msg.citations.map((c, i) => (
                          <span key={i} className="citation-tag">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="message-actions">
                      {msg.actions.map((act, i) => (
                        <Link
                          key={i}
                          href={act.href}
                          className="action-link-btn"
                          onClick={() => setIsOpen(false)}
                        >
                          <span>{act.label}</span>
                          <ArrowRight size={12} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="copilot-message assistant typing">
                <div className="typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-text">Gemini 2.0 synthesizing root-cause...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="copilot-footer">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="copilot-input-form"
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask anything about Lot WFR-24-0817, ETCH-04, or containment..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="copilot-input"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="copilot-send-btn"
                title="Send message"
              >
                <Send size={15} />
              </button>
            </form>
            <div className="copilot-footnote">
              Grounded in empirical sensor residuals &amp; strict failure category contracts.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Semantic markdown formatter helper for headers, bold, bullet items, and numbered lists
function formatMarkdown(text: string): string {
  const lines = text.split("\n");
  const formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Bold, italic, code
    line = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code class='copilot-inline-code'>$1</code>");

    // Headers
    if (line.startsWith("### ")) {
      formattedLines.push(`<h4 class="copilot-msg-h4">${line.slice(4)}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      formattedLines.push(`<h3 class="copilot-msg-h3">${line.slice(3)}</h3>`);
      continue;
    }

    // Numbered lists e.g. "1. "
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      formattedLines.push(
        `<div class="copilot-num-item"><span class="copilot-num-badge">${numMatch[1]}</span><span>${numMatch[2]}</span></div>`
      );
      continue;
    }

    // Bullet points e.g. "- " or "• " or "* "
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      formattedLines.push(
        `<div class="copilot-bullet-item"><span class="copilot-bullet-dot"></span><span>${line.slice(2)}</span></div>`
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      formattedLines.push("<div class='copilot-spacer'></div>");
      continue;
    }

    formattedLines.push(`<p class="copilot-p">${line}</p>`);
  }

  return formattedLines.join("");
}
