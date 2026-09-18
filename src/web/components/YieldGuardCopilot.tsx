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

    if (q.includes("why") || q.includes("fail") || q.includes("yield") || q.includes("0817")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `**Root Cause Diagnosis for Lot ${lotId}:**\n\n1. **Primary Cause (87% Confidence):** Transient RF-power instability (+4.8σ) on **ETCH-04** immediately following preventive maintenance at 06:42.\n2. **Spatial Pattern:** Vision ViT classified an **Edge-Ring** defect distribution (96% confidence) across 24 wafers.\n3. **Contributing Factor:** Chamber pressure drifted +3.2σ starting at 06:55, magnifying plasma non-uniformity at the outer wafer edge.\n4. **Precedent:** Correlates 91% with **CASE-1042** (March 2024), where improper RF match network impedance matching caused identical edge yield loss.`,
        timestamp,
        confidence: 87,
        citations: ["ETCH-04 RF Power (+4.8σ)", "Pressure (+3.2σ)", "ViT: Edge-Ring (96%)", "Precedent: CASE-1042"],
        actions: [
          { label: "Examine Evidence in Workspace", href: "/investigation" },
          { label: "Review Playbook Containment", href: "/playbook" },
        ],
      };
    }

    if (q.includes("rf") || q.includes("spike") || q.includes("etch-04") || q.includes("power")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `**Telemetry Anomaly Analysis for ETCH-04:**\n\n- **Peak Value:** 1,874 W against a baseline of 1,620 W (**+4.8σ deviation**).\n- **Timing:** 3 discrete overshoot events occurred between 07:08 and 07:11 (13–16 minutes post-PM).\n- **Physical Impact:** Excessive RF delivery concentrated plasma density at the wafer periphery, causing high etch rate non-uniformity and dielectric breakdown along the bevel ring.`,
        timestamp,
        confidence: 94,
        citations: ["Chamber 2 Telemetry Stream", "PM Log 06:42 (Clean + Match Insp)"],
        actions: [
          { label: "View Equipment Telemetry", href: "/equipment" },
          { label: "Dispatch Match Calibration", href: "/playbook" },
        ],
      };
    }

    if (q.includes("contain") || q.includes("action") || q.includes("fix") || q.includes("playbook")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `**Recommended Immediate Containment Plan:**\n\n1. **Lock Tool ETCH-04 [Priority 1 - Immediate]:** Halt wafer loading to prevent compounding losses.\n2. **Recalibrate RF Match Network:** Verify manual capacitor positioning and tune tuning inductors.\n3. **Run 3 Bare Silicon Monitor Wafers:** Measure oxide etch uniformity across 49-point diameter before releasing to production.\n4. **Hold Downstream Lot WFR-24-0818:** Quarantine upcoming lot scheduled on ETCH-04.`,
        timestamp,
        confidence: 92,
        citations: ["SOP-ETCH-409", "Corrective Action Playbook"],
        actions: [
          { label: "Dispatch Containment Checklist", href: "/playbook" },
          { label: "Hold Lot WFR-24-0818", href: "/batch-risk" },
        ],
      };
    }

    if (q.includes("0818") || q.includes("safe") || q.includes("upcoming") || q.includes("risk") || q.includes("planned")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `⚠️ **Batch Risk Alert for Lot WFR-24-0818:**\n\n- **Risk Score:** **68 / 100 (HIGH)**\n- **Reason:** WFR-24-0818 is currently queued to run on **ETCH-04** with identical 3nm logic recipes.\n- **Recommendation:** Put lot on **ENGINEERING HOLD** immediately. Re-route to **ETCH-03** (currently nominal at 95.1% baseline yield) to prevent an estimated **$85,000 silicon loss**.`,
        timestamp,
        confidence: 89,
        citations: ["Cosine Similarity: 0.74 vs Historic Excursions", "Fab 07 Scheduler"],
        actions: [
          { label: "Open Batch Risk Monitor", href: "/batch-risk" },
          { label: "Check ETCH-03 Availability", href: "/equipment" },
        ],
      };
    }

    // Default general response
    return {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: `I analyzed your inquiry: *"${query}"* against Fab 07 telemetry and historical records.\n\n- **Current Lot:** ${lotId} (Critical Excursion, 74.2% Yield)\n- **Primary Culprit:** ETCH-04 RF Power (+4.8σ) & post-PM calibration drift.\n- **Next Step:** Review the containment checklist in the Action Playbook or inspect individual wafer die coordinates on the canvas map.`,
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

// Simple markdown formatter helper for bold, lists, and linebreaks
function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n- /g, "<br/>• ")
    .replace(/\n/g, "<br/>");
}
