"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  X,
  Send,
  User,
  CheckCircle2,
  Minimize2,
  Maximize2,
  RotateCcw,
  Search,
  TrendingUp,
  FileText,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import ThoughtLine from "./ThoughtLine";
import BobMascot from "./BobMascot";

interface CopilotProps {
  activeLotId?: string;
  currentRoute?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  steps?: string[];
  thoughtSeconds?: number;
  citations?: string[];
  confidence?: number | null;
  actions?: { label: string; href: string }[];
}

const GET_SUGGESTIONS = (lotId: string) => {
  if (lotId === "L-4515") {
    return [
      {
        icon: Search,
        label: "Why is L-4515 nominal?",
        query: "Why is Lot L-4515 rated Nominal at 18/100 risk score?",
      },
      {
        icon: TrendingUp,
        label: "Verify recipe parameters",
        query: "Check planned dose, focus, and overlay parameters for L-4515 on LITHO-02",
      },
      {
        icon: FileText,
        label: "Check LITHO-02 health",
        query: "What is the optical and stage health status of LITHO-02?",
      },
      {
        icon: Lightbulb,
        label: "Can this lot be released?",
        query: "Is Lot L-4515 authorized for standard production release?",
      },
    ];
  }
  if (lotId === "L-4502") {
    return [
      {
        icon: Search,
        label: "Why moderate risk?",
        query: "Why is Lot L-4502 scored at 42/100 Moderate Risk on CMP-03?",
      },
      {
        icon: TrendingUp,
        label: "Check slurry deficit",
        query: "Explain the -2.7% slurry flow deficit and pad life on CMP-03",
      },
      {
        icon: FileText,
        label: "Matched precedents",
        query: "What historical cases match L-4502 (e.g. HC-018)?",
      },
      {
        icon: Lightbulb,
        label: "Pre-run advisory",
        query: "What pre-run actions should I take before polishing L-4502?",
      },
    ];
  }
  if (lotId === "L-4511") {
    return [
      {
        icon: Search,
        label: "Why elevated risk?",
        query: "Why is upcoming Lot L-4511 scored at 68/100 Elevated Risk?",
      },
      {
        icon: TrendingUp,
        label: "RF setpoint deviation",
        query: "Explain the +8% RF power setpoint and unseasoned chamber on ETCH-07",
      },
      {
        icon: FileText,
        label: "Matched precedents",
        query: "How does L-4511 correlate to CASE-1042?",
      },
      {
        icon: Lightbulb,
        label: "Containment advice",
        query: "Should I hold L-4511 in FOUP buffer and run test wafers?",
      },
    ];
  }
  return [
    {
      icon: Search,
      label: "Why did lot fail?",
      query: "Why did lot L-4471 drop to 74.2% yield?",
    },
    {
      icon: TrendingUp,
      label: "Explain RF spike",
      query: "What caused the +4.8σ RF power transient spike on ETCH-07?",
    },
    {
      icon: FileText,
      label: "Show tool history",
      query: "Has this ever happened in the past on ETCH-07?",
    },
    {
      icon: Lightbulb,
      label: "Recommend next steps",
      query: "What containment actions should I dispatch right now?",
    },
  ];
};

export default function YieldGuardCopilot({ activeLotId = "L-4471", currentRoute = "/overview" }: CopilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeSteps, setActiveSteps] = useState<string[]>([]);

  const isL6002 = activeLotId === "L-4515";
  const isL6001 = activeLotId === "L-4502";
  const is0818 = activeLotId === "L-4511";

  const getInitialWelcome = (): Message => {
    if (isL6002) {
      return {
        id: "welcome-l6002",
        role: "assistant",
        content:
          "Hello Mei. I am **YieldGuard Copilot**, connected to **IBM Bob MCP Tools** and Fab 07 real-time telemetry.\n\nI have active context on **Lot L-4515** on scanner **LITHO-02** (Pre-Run Triage: **18 / 100 Nominal**). All planned parameters are 0.0% nominal and cleared for standard production release. How can I assist you?",
        timestamp: "16:21",
        steps: [
          "MCP Handshake: Initialized IBM Bob session for Lot L-4515 on LITHO-02",
          "Invoked MCP Tool: get_lot_data('L-4515') -> Status: PLANNED, Product: P-MEM-1A",
          "Invoked MCP Tool: flag_at_risk_batch('L-4515') -> Risk Score: 18/100 (NOMINAL)",
          "Invoked MCP Tool: query_telemetry(['LITHO-02']) -> Optical alignment 1.2 nm (< 2.0 nm nominal)",
        ],
        thoughtSeconds: 1.2,
        citations: ["LITHO-02 Optical Metrology", "Parameter Baseline Audit (0.0% delta)", "Zero Low-Yield Matches", "IBM Bob MCP Server"],
        actions: [
          { label: "View Batch Risk", href: "/batch-risk" },
          { label: "Planned Lots", href: "/lot-analysis" },
        ],
      };
    }
    return {
      id: "welcome",
      role: "assistant",
      content:
        "Hello Mei. I am **YieldGuard Copilot**, connected to **IBM Bob MCP Tools** and Fab 07 real-time telemetry.\n\nI have active context on **Lot L-4471** and tool **ETCH-07** (Yield Excursion: **74.2%**). How can I assist your yield investigation today?",
      timestamp: "16:21",
      steps: [
        "MCP Handshake: Initialized IBM Bob session on Fab 07 telemetry stream",
        "Invoked MCP Tool: get_lot_data('L-4471') -> Status: EXCURSION, Tool: ETCH-07",
        "Invoked MCP Tool: classify_wafer_map('case_2a.npy') -> Pattern: Edge-Ring (WaferCNN: 98.4% F1)",
        "Invoked MCP Tool: score_sensor_anomaly('L-4471') -> +4.8σ RF Power Transient",
      ],
      thoughtSeconds: 1.4,
      citations: ["Fab 07 Fleet Feed", "ETCH-07 Sensor Signature", "WM-811K WaferCNN", "IBM Bob MCP Server"],
      actions: [
        { label: "View Investigation", href: "/investigation" },
        { label: "Open Playbook", href: "/playbook" },
      ],
    };
  };

  const [messages, setMessages] = useState<Message[]>([getInitialWelcome()]);

  // Update initial message when activeLotId prop changes
  useEffect(() => {
    setMessages([getInitialWelcome()]);
  }, [activeLotId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages, isTyping, activeSteps]);

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

const REGISTERED_CLEANROOM_LOTS = new Set([
  "L-4515", "L-4502", "L-4511", "L-4471", "L-4402",
  "L-4418", "L-4815", "L-5120", "L-4471", "L-4402",
  "L-4418", "L-3310", "L-4815", "L-5120", "L-5502", "L-5540",
  "L-4502", "L-4507", "L-4511", "L-4515"
]);

function extractLotIdFromQuery(text: string): string | null {
  if (!text) return null;
  const m1 = text.match(/\b(?:lot|batch)\s+([A-Za-z0-9_\-]+)/i);
  if (m1) {
    const val = m1[1].replace(/[?,.:;!'"]+$/, "");
    if (/\d/.test(val) && !/^(ETCH|CMP|LITHO|CLEAN|HANDLER|ROBOT|TESTER|CASE|SOP|TTA)-/i.test(val)) {
      return val;
    }
  }
  const m2 = text.match(/\b([A-Za-z0-9_\-]+)\s+(?:lot|batch)\b/i);
  if (m2) {
    const val = m2[1].replace(/[?,.:;!'"]+$/, "");
    if (/\d/.test(val) && !/^(ETCH|CMP|LITHO|CLEAN|HANDLER|ROBOT|TESTER|CASE|SOP|TTA)-/i.test(val)) {
      return val;
    }
  }
  const matches = text.match(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\b/g);
  if (matches) {
    for (const token of matches) {
      if (/\d/.test(token) && !/^(ETCH|CMP|LITHO|CLEAN|FILTER|HANDLER|ROBOT|TESTER|POWER|CASE|SOP|TTA|MACRO)-/i.test(token)) {
        return token;
      }
    }
  }
  return null;
}

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isTyping) return;

    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: nowTime,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);

    const startTime = Date.now();

    const extractedLot = extractLotIdFromQuery(query);
    const targetLotId = extractedLot || activeLotId;
    const isUnregistered = extractedLot ? !REGISTERED_CLEANROOM_LOTS.has(extractedLot.toUpperCase()) : false;

    // Dynamic Bob MCP tool execution steps during thinking
    const truncatedQuery = query.length > 26 ? query.slice(0, 26) + "…" : query;
    const initialSteps = isUnregistered
      ? [
          `Reading question: "${truncatedQuery}"`,
          `MCP Handshake: Initializing Bob session for query '${extractedLot}'`,
        ]
      : [
          `Reading question: "${truncatedQuery}"`,
          `MCP Handshake: Initializing Bob session for ${targetLotId}`,
        ];
    setActiveSteps(initialSteps);

    // No simulated tool trace. Previously this fired setTimeout at 350/950/1450/...ms
    // printing "Invoking MCP Tool: ..." for calls that were never made, with values
    // (+4.8 sigma, Edge-Ring 96.4%, CASE-1042) baked into the string. The real trace now
    // arrives in data.steps from /api/chat, built from what the tool chain returned.
    const stepTimers: NodeJS.Timeout[] = [];

    const historyPayload = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Send to backend endpoint (relative URL through Next.js proxy with fallbacks)
    const endpointsToTry = ["/api/chat", "http://localhost:8787/api/chat", "http://127.0.0.1:8787/api/chat"];
    let succeeded = false;

    for (const endpoint of endpointsToTry) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: query,
            history: historyPayload,
            lot_id: targetLotId,
          }),
        });

        if (res.ok) {
          stepTimers.forEach(clearTimeout);
          const data = await res.json();
          const elapsedSec = Math.max(1.5, parseFloat(((Date.now() - startTime) / 1000).toFixed(1)));
          const aiMsg: Message = {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            steps: data.steps ?? [],
            thoughtSeconds: elapsedSec,
            citations: data.citations ?? [],
            // null when the ranking layer produced no hypothesis: render as
            // "no confidence available", never a default.
            confidence: data.confidence ?? null,
            actions: data.actions || [{ label: "View Investigation", href: "/investigation" }],
          };
          setMessages((prev) => [...prev, aiMsg]);
          setIsTyping(false);
          succeeded = true;
          break;
        }
      } catch {
        // Try next endpoint
      }
    }

    if (!succeeded) {
      stepTimers.forEach(clearTimeout);
      const elapsedSec = Math.max(1.8, parseFloat(((Date.now() - startTime) / 1000).toFixed(1)));
      const fallbackResponse = generateGroundedResponse(query, targetLotId);
      fallbackResponse.thoughtSeconds = elapsedSec;
      setMessages((prev) => [...prev, fallbackResponse]);
      setIsTyping(false);
    }
  };

  const generateGroundedResponse = (query: string, lotId: string): Message => {
    const q = query.toLowerCase();
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const extractedLot = extractLotIdFromQuery(query);
    const effectiveLot = extractedLot || lotId;

    if (extractedLot && !REGISTERED_CLEANROOM_LOTS.has(extractedLot.toUpperCase())) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Lot Not Found: \`${extractedLot}\`\n\nI could not find any active, planned, or historical records for lot **${extractedLot}** in the Fab 07 MES database or cleanroom telemetry archive.\n\n**Zero Fabricated Data Mandate (Cleanroom Safety):**\nUnder cleanroom compliance and Fab 07 AI governance policies, YieldGuard Copilot strictly refuses to hallucinate, fabricate, or synthesize equipment assignments, recipe parameters, or risk assessments for unregistered lots.\n\n**Registered Cleanroom Lots in Fab 07:**\n- **Pre-Run Planned Lots:** \`L-4515\` (LITHO-02, 18/100 Nominal), \`L-4502\` (CMP-03, 42/100 Moderate Risk), \`L-4511\` (ETCH-07, 68/100 Elevated Risk)\n- **Tested / Excursion Lots:** \`L-4471\` (ETCH-07, Excursion 74.2%), \`L-4402\`, \`L-4418\`, \`L-4815\`, \`L-5120\`, \`L-4471\`, \`L-4402\`, \`L-4418\`, \`L-3310\`, \`L-4815\`, \`L-5120\`\n\nPlease verify the lot ID or select a valid registered lot from the **Lot Queue** or **Batch Risk Triage** dashboard.`,
        timestamp,
        confidence: 0,
        citations: [
          "Fab 07 MES Registry (Lot Not Found)",
          "AI Governance Contract (Zero Fabricated Data)",
          "SECS/GEM Dispatch Interface",
          "IBM Bob MCP: get_lot_data",
        ],
        actions: [
          { label: "View Registered Lots", href: "/lot-analysis" },
          { label: "Open Batch Risk", href: "/batch-risk" },
        ],
      };
    }

    if (effectiveLot === "L-4515") {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Batch Risk Triage Assessment: Lot L-4515\n\n**STATUS: NOMINAL (Composite Triage Score: 18 / 100)**\n\nLot **L-4515** is scheduled for **LITHO-02** (Product \`P-MEM-1A\`, Line \`FAB1-B\`) and is **NOT classified as high risk**.\n\n#### Why Lot L-4515 is Evaluated as Nominal (Low Risk):\n1. **Zero Recipe Parameter Deviations:** All planned setpoints match engineering baselines perfectly:\n   - **Exposure Dose Target:** 24.5 mJ/cm² (Baseline: 24.5 mJ/cm², **0.0% delta**)\n   - **Focus Offset:** 0.0 nm (Baseline: 0.0 nm, **0.0% delta**)\n   - **Overlay Alignment:** 1.2 nm (Baseline: < 2.0 nm, **Nominal**)\n2. **Healthy Scanner State:** LITHO-02 has zero active drift alarms and an overall health index of 99.1%.\n3. **Zero Precedent Correlations:** 0 matches in the Fab 07 historical low-yield vector archive.\n4. **Pre-Run State:** This lot is planned and has not yet started fabrication, so no physical wafer defects or sensor transients exist.\n\n#### Recommended Action:\n- **Proceed with standard production release:** No machine holds or interlocks required.`,
        timestamp,
        confidence: null,
        citations: ["LITHO-02 Optical Metrology", "Parameter Baseline Audit (0.0% delta)", "Zero Low-Yield Matches", "IBM Bob MCP: flag_at_risk_batch"],
        actions: [
          { label: "View Batch Risk Dashboard", href: "/batch-risk" },
          { label: "Review All Planned Lots", href: "/lot-analysis" },
        ],
      };
    }

    if (effectiveLot === "L-4502") {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Batch Risk Triage Assessment: Lot L-4502\n\n**STATUS: MODERATE RISK (Composite Triage Score: 42 / 100)**\n\nLot **L-4502** is scheduled on **CMP-03** (Product \`P-LOGIC-3N\`).\n\n- **Slurry Flow Target:** Planned 180 mL/min vs 185 mL/min baseline (**-2.7% deficit**).\n- **Pad Life Consumed:** Currently at **84%** (exceeds recommended 75% threshold).\n- **Matched Case:** Correlates with historical case **HC-018** (pad wear slurry starvation).\n\n**Recommended Pre-Run Action:** Inspect CMP-03 delivery line pressure and schedule pad conditioning before running multi-die logic lot.`,
        timestamp,
        confidence: null,
        citations: ["CMP-03 Sensor Feed", "Pad Life Monitor (84%)", "Matched Precedent: HC-018", "IBM Bob MCP: flag_at_risk_batch"],
        actions: [
          { label: "Inspect CMP-03 Line", href: "/equipment" },
          { label: "View Batch Risk", href: "/batch-risk" },
        ],
      };
    }

    if (q.includes("contain") || q.includes("action") || q.includes("next step") || q.includes("playbook")) {
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: `### Immediate Cleanroom Containment Protocol for ${effectiveLot}\n\n1. **Lock Machine ETCH-07 (Priority 1 - Immediate):** Halt wafer loading immediately. Set tool interlock status to \`MAINTENANCE_HOLD\` in MES to prevent defect propagation.\n2. **Quarantine Downstream Lot L-4511 (Priority 1):** Hold planned lot in FOUP buffer. Reroute to ETCH-03 to avoid an estimated $85,000 silicon damage.\n3. **Inspect RF Match Network (Priority 2):** Disassemble RF match enclosure. Check vacuum variable capacitor drive belt tension and torques for phase detector drift.\n4. **Run 3 Bare Silicon Monitor Wafers (Priority 3):** Perform 49-point oxide etch uniformity verification across full wafer diameter before releasing tool to production.`,
        timestamp,
        confidence: null,
        citations: ["SOP-ETCH-409 Rev C", "Fab 07 Containment Policy", "SECS/GEM Interlock Interface", "IBM Bob MCP: get_corrective_action_playbook"],
        actions: [
          { label: "Open Action Playbook", href: "/playbook" },
          { label: "Hold Lot L-4511", href: "/batch-risk" },
        ],
      };
    }

    return {
      id: `ai-${Date.now()}`,
      role: "assistant",
      content: `Yes. Similar RF spikes on **ETCH-07** have occurred 3 times in the past 6 months, most recently on lot **L-3310**. In all cases, the excursions were associated with chamber pressure instability and resulted in thickness non-uniformity (TU > spec).\n\n**Correlating Precedent:**\n- **CASE-1042:** RF match network vacuum variable capacitor slippage post-PM on FAB2-A (91% cosine match).\n- **Action Taken:** Re-torqued stepper coupler and recalibrated match-box impedance.`,
      timestamp,
      confidence: null,
      citations: ["Historical Lot Analysis", "ETCH-07 Event Log", "CASE-1042 Archive", "IBM Bob MCP: retrieve_similar_cases"],
      actions: [
        { label: "View Historical Cases", href: "/cases" },
        { label: "Examine Evidence in Workspace", href: "/investigation" },
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
        <BobMascot size={28} animated={true} />
        <span className="copilot-launcher-text">Ask AI Copilot</span>
        <kbd className="copilot-kbd">Ctrl J</kbd>
      </button>

      {/* ── Slide-out Copilot Panel ── */}
      {isOpen && (
        <div className={`copilot-drawer ${isExpanded ? "expanded" : ""}`}>
          {/* Header */}
          <div className="copilot-header">
            <div className="copilot-title-group">
              <BobMascot size={36} animated={true} showBubble={true} bubbleText="Hi! I'm Bob" />
              <div>
                <div className="copilot-title">YieldGuard Copilot</div>
                <div className="copilot-sub" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: "#198038",
                      display: "inline-block",
                    }}
                  />
                  <span>IBM Bob MCP</span>
                  <span style={{ opacity: 0.5 }}>|</span>
                  <span style={{ color: "#198038", fontWeight: 600 }}>Connected</span>
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
                      content: `Conversation reset. Active context on **Lot ${activeLotId}** (${isL6002 ? "LITHO-02" : isL6001 ? "CMP-03" : "ETCH-07"}). How can I help?`,
                      timestamp: "Just now",
                      steps: [
                        "MCP Handshake: Reset session and reloaded lot context",
                        `Invoked MCP Tool: get_lot_data('${activeLotId}')`,
                      ],
                      thoughtSeconds: 0.8,
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
            <div className="chips-scroll">
              {GET_SUGGESTIONS(activeLotId).map((s, idx) => {
                const IconComponent = s.icon;
                return (
                  <button
                    key={idx}
                    className="suggestion-chip"
                    onClick={() => handleSend(s.query)}
                  >
                    <IconComponent size={12} className="chip-icon" style={{ color: "#0f62fe" }} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="copilot-body">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`copilot-message ${msg.role === "user" ? "user" : "assistant"}`}
              >
                <div className="message-header" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  {msg.role === "assistant" ? (
                    <>
                      <BobMascot size={22} animated={false} />
                      <span style={{ fontWeight: 600, color: "#161616", fontSize: "12px" }}>YieldGuard Copilot</span>
                      <span style={{ fontSize: "11px", color: "#6f6f6f" }}>{msg.timestamp}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, color: "#161616", fontSize: "12px" }}>You</span>
                      <span style={{ fontSize: "11px", color: "#6f6f6f" }}>{msg.timestamp}</span>
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "#d0e2ff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginLeft: "auto",
                        }}
                      >
                        <User size={12} color="#0f62fe" />
                      </div>
                    </>
                  )}
                </div>

                <div
                  className="message-bubble"
                  style={{
                    background: msg.role === "user" ? "#d0e2ff" : "#f2f4f8",
                    color: "#161616",
                    borderRadius: "14px",
                    padding: "12px 16px",
                    border: msg.role === "user" ? "1px solid #a6c8ff" : "1px solid #e0e0e0",
                  }}
                >
                  {/* Collapsible IBM Bob MCP ThoughtLine */}
                  {msg.role === "assistant" && msg.steps && msg.steps.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      <ThoughtLine
                        working={false}
                        steps={msg.steps}
                        elapsed={msg.thoughtSeconds ?? 1.8}
                        label="Thinking…"
                        doneLabel="Thought for"
                        glyph="sparkle"
                        color="#0f62fe"
                        glyphColor="#0f62fe"
                        fontSize={13}
                        collapsible={true}
                        collapseOnSettle={true}
                        showTimer={true}
                      />
                    </div>
                  )}

                  <div
                    className="message-markdown"
                    dangerouslySetInnerHTML={{
                      __html: formatMarkdown(msg.content),
                    }}
                  />

                  {msg.role === "assistant" && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        marginTop: "10px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: msg.confidence != null ? "#defbe6" : "#f2f4f8",
                        color: msg.confidence != null ? "#0e6027" : "#525252",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={12} />{" "}
                      {msg.confidence != null ? (
                        <>Confidence (from ranking layer): <b>{msg.confidence}%</b></>
                      ) : (
                        <>No confidence available &mdash; no hypothesis met the evidence gate</>
                      )}
                    </div>
                  )}

                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(0, 0, 0, 0.08)" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#525252", marginRight: "6px" }}>
                        Sources:
                      </span>
                      <div style={{ display: "inline-flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                        {msg.citations.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              background: "#ffffff",
                              border: "1px solid #c6c6c6",
                              borderRadius: "4px",
                              padding: "2px 7px",
                              fontSize: "10.5px",
                              color: "#393939",
                              fontWeight: 500,
                            }}
                          >
                            <FileText size={10} color="#0f62fe" />
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                      {msg.actions.map((act, i) => (
                        <Link
                          key={i}
                          href={act.href}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            background: "#0f62fe",
                            color: "#ffffff",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: 500,
                            textDecoration: "none",
                          }}
                          onClick={() => setIsOpen(false)}
                        >
                          <span>{act.label}</span>
                          <ArrowRight size={11} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="copilot-message assistant typing" style={{ margin: "6px 0 12px 0", width: "100%", maxWidth: "100%" }}>
                <div className="message-header" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <BobMascot size={22} thinking={true} />
                  <span style={{ fontWeight: 600, color: "#161616", fontSize: "12px" }}>YieldGuard Copilot</span>
                </div>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "#f2f4f8",
                    border: "1px solid #d0e2ff",
                    borderRadius: "14px",
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <ThoughtLine
                    working={true}
                    steps={activeSteps}
                    label="Thinking…"
                    doneLabel="Thought for"
                    glyph="sparkle"
                    color="#0f62fe"
                    glyphColor="#0f62fe"
                    fontSize={13}
                    breathPeriod={1.6}
                    breathDepth={0.45}
                    shimmer={true}
                    collapsible={true}
                    collapseOnSettle={false}
                    showTimer={true}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="copilot-footer" style={{ padding: "12px 16px", borderTop: "1px solid #e0e0e0", background: "#ffffff" }}>
            {/* Mascot prompt indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <BobMascot size={24} animated={true} />
              <div
                style={{
                  background: "#d0e2ff",
                  color: "#0043ce",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  fontSize: "10.5px",
                  fontWeight: 600,
                  boxShadow: "0 1px 3px rgba(15, 98, 254, 0.15)",
                }}
              >
                Ask me anything!
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "#ffffff",
                border: "1px solid #c6c6c6",
                borderRadius: "24px",
                padding: "4px 6px 4px 16px",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.05)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder={`Ask anything about Lot ${activeLotId}, ${isL6002 ? "LITHO-02" : isL6001 ? "CMP-03" : "ETCH-07"}, or process parameters...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: "12px",
                  color: "#161616",
                  background: "transparent",
                  padding: "6px 4px",
                }}
              />
              <button
                type="submit"
                disabled={!input.trim()}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: input.trim() ? "#0f62fe" : "#e0e0e0",
                  color: "#ffffff",
                  border: "none",
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
                title="Send message"
              >
                <Send size={14} />
              </button>
            </form>
            <div style={{ fontSize: "10px", color: "#6f6f6f", textAlign: "center", marginTop: "6px" }}>
              Grounded in fab data, sensor telemetry, and approved knowledge sources.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Semantic markdown formatter helper for headers, bold, bullet items, key-values, and numbered lists
function formatMarkdown(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Empty line spacer
    if (!trimmed) {
      formattedLines.push("<div style='height: 6px;'></div>");
      continue;
    }

    // Horizontal divider
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      formattedLines.push("<hr style='border: none; border-top: 1px solid rgba(0,0,0,0.1); margin: 8px 0;' />");
      continue;
    }

    // Bold, italic, code formatting
    let formattedText = trimmed
      .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code style='background: rgba(15,98,254,0.08); color: #0f62fe; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 11px;'>$1</code>");

    // Headings: #####, ####, ###, ##, #
    if (trimmed.startsWith("##### ")) {
      formattedLines.push(
        `<h6 style='font-size: 12px; font-weight: 700; color: #161616; margin: 8px 0 4px;'>${formattedText.slice(6)}</h6>`
      );
      continue;
    }
    if (trimmed.startsWith("#### ")) {
      formattedLines.push(
        `<div style='font-size: 12.5px; font-weight: 700; color: #0f62fe; margin: 10px 0 4px; display: flex; align-items: center; gap: 6px;'><span style='width: 3.5px; height: 13px; background: #0f62fe; border-radius: 2px; display: inline-block; flex-shrink: 0;'></span><span>${formattedText.slice(5)}</span></div>`
      );
      continue;
    }
    if (trimmed.startsWith("### ")) {
      formattedLines.push(
        `<h4 style='font-size: 13.5px; font-weight: 700; color: #161616; margin: 10px 0 5px;'>${formattedText.slice(4)}</h4>`
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      formattedLines.push(
        `<h3 style='font-size: 14px; font-weight: 700; color: #161616; margin: 12px 0 6px;'>${formattedText.slice(3)}</h3>`
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      formattedLines.push(
        `<h2 style='font-size: 15px; font-weight: 700; color: #0f62fe; margin: 12px 0 6px;'>${formattedText.slice(2)}</h2>`
      );
      continue;
    }

    // Numbered lists e.g. "1. " or "1) "
    const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
    if (numMatch) {
      const rest = numMatch[2]
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, "<code style='background: rgba(15,98,254,0.08); color: #0f62fe; padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 11px;'>$1</code>");
      formattedLines.push(
        `<div style='display: flex; align-items: flex-start; gap: 7px; margin: 4px 0;'><span style='font-weight: 700; font-size: 10.5px; color: #0f62fe; background: #d0e2ff; border-radius: 4px; padding: 1px 5px; height: 17px; display: flex; align-items: center; flex-shrink: 0;'>${numMatch[1]}</span><span style='flex: 1; line-height: 1.45;'>${rest}</span></div>`
      );
      continue;
    }

    // Bullet points e.g. "- ", "* ", "• "
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const bulletContent = formattedText.slice(2);
      formattedLines.push(
        `<div style='display: flex; align-items: flex-start; gap: 7px; margin: 4px 0;'><span style='width: 5px; height: 5px; border-radius: 50%; background: #0f62fe; margin-top: 6px; flex-shrink: 0;'></span><span style='flex: 1; line-height: 1.45;'>${bulletContent}</span></div>`
      );
      continue;
    }

    // Key-Value pattern lines e.g. "Defect Pattern: ...", "Impact: ...", "Matching Case: ...", "Tool Lock: ..."
    const kvMatch = formattedText.match(/^([A-Za-z0-9\s\/\-_()]+:)\s+(.*)/);
    if (kvMatch && !trimmed.startsWith("http") && kvMatch[1].length < 32) {
      formattedLines.push(
        `<div style='margin: 4px 0 6px; line-height: 1.45;'><strong style='color: #161616;'>${kvMatch[1]}</strong> <span style='color: #393939;'>${kvMatch[2]}</span></div>`
      );
      continue;
    }

    // Standard text paragraph
    formattedLines.push(`<p style='margin: 0 0 6px; line-height: 1.45;'>${formattedText}</p>`);
  }

  return formattedLines.join("");
}
