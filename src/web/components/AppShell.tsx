"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Boxes,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  Cpu,
  Crosshair,
  FileText,
  Gauge,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import YieldGuardCopilot from "./YieldGuardCopilot";

type Toast = { id: number; title: string; desc?: string };

interface AppShellProps {
  children: ReactNode;
  activeLotId?: string;
}

// Global in-memory variable to persist sidebar state across Next.js page unmount/mount cycles
let globalSidebarOpen = true;
const sidebarListeners = new Set<(open: boolean) => void>();

function setPersistedSidebarOpen(open: boolean) {
  globalSidebarOpen = open;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("yieldguard_sidebar_open", open ? "1" : "0");
    } catch { }
  }
  sidebarListeners.forEach(fn => fn(open));
}

export default function AppShell({ children, activeLotId }: AppShellProps) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(globalSidebarOpen);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("yieldguard_sidebar_open");
      if (saved !== null) {
        const val = saved === "1";
        globalSidebarOpen = val;
        setSidebarOpen(val);
      }
    } catch { }

    const listener = (newVal: boolean) => setSidebarOpen(newVal);
    sidebarListeners.add(listener);
    return () => {
      sidebarListeners.delete(listener);
    };
  }, []);

  const toggleSidebar = () => {
    setPersistedSidebarOpen(!sidebarOpen);
  };

  const addToast = (title: string, desc?: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, desc }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const workspaceNav: [string, string, LucideIcon, number?][] = [
    ["Command center", "/overview", LayoutDashboard],
    ["Investigation", "/investigation", Crosshair],
    ["Lot queue", "/lot-analysis", Boxes, 8],
    ["Equipment", "/equipment", Cpu],
    ["Historical cases", "/cases", BookOpen],
  ];

  const analysisNav: [string, string, LucideIcon][] = [
    ["Risk monitor", "/batch-risk", ShieldCheck],
    ["Action playbook", "/playbook", Wrench],
    ["Model governance", "/governance", BrainCircuit],
    ["18-Case benchmark", "/benchmark", Gauge],
    ["Reports", "/reports", FileText],
  ];

  const systemNav: [string, string, LucideIcon][] = [
    ["Settings", "/settings", Settings2],
  ];

  const getBreadcrumbContext = () => {
    if (pathname === "/" || pathname.startsWith("/overview")) return "Command Center";
    if (pathname.startsWith("/investigation") || pathname.startsWith("/root-cause")) return "Investigation Workspace";
    if (pathname.startsWith("/lot-analysis") || pathname.startsWith("/lots")) return "Lot Queue";
    if (pathname.startsWith("/equipment") || pathname.startsWith("/fleet")) return "Equipment Telemetry";
    if (pathname.startsWith("/cases") || pathname.startsWith("/historical-cases")) return "Historical Cases";
    if (pathname.startsWith("/batch-risk") || pathname.startsWith("/risk")) return "Batch Risk Triage";
    if (pathname.startsWith("/playbook") || pathname.startsWith("/action-playbook")) return "Action Playbook";
    if (pathname.startsWith("/governance") || pathname.startsWith("/ai-governance")) return "Model Governance";
    if (pathname.startsWith("/benchmark") || pathname.startsWith("/eval")) return "18-Case Benchmark";
    if (pathname.startsWith("/reports")) return "Investigation Reports";
    if (pathname.startsWith("/settings")) return "Workspace Settings";
    return "YieldGuard AI";
  };

  const searchResults = [
    { title: "Lot WFR-24-0817", category: "Lot Excursion", href: "/investigation", detail: "74.2% Yield · Edge-Ring Pattern" },
    { title: "Lot WFR-24-0818", category: "Planned Lot", href: "/batch-risk", detail: "Risk Score 68/100 · ETCH-04" },
    { title: "ETCH-04", category: "Equipment", href: "/equipment", detail: "RF Power +4.8σ Transient Spike" },
    { title: "CMP-03", category: "Equipment", href: "/equipment", detail: "Slurry Flow Drift -2.4σ" },
    { title: "CASE-1042", category: "Historical Case", href: "/cases", detail: "Edge-ring defects after RF match PM (91% Match)" },
    { title: "Inspect RF Match Network", category: "Action Playbook", href: "/playbook", detail: "Priority 1 Immediate Action" },
    { title: "18-Case Evaluation Matrix", category: "Benchmark", href: "/benchmark", detail: "100% Pass Rate Across 6 Failure Modes" },
  ].filter(
    item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.detail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-shell">
      {/* ── Left Sidebar (Primary Navigation) ── */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
        {/* Brand Header */}
        <div className="brand-row">
          <div
            className="brand-mark"
            title="YieldGuard AI - Command Center"
            onClick={() => router.push("/overview")}
            style={{ cursor: "pointer" }}
          >
            <span>Y</span>
          </div>
          {sidebarOpen && (
            <>
              <div className="brand-text">
                <div className="brand-name">YieldGuard</div>
                <div className="brand-sub">AI INVESTIGATION OS</div>
              </div>
              <button
                className="icon-btn sidebar-toggle"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </>
          )}
        </div>

        {sidebarOpen && (
          <div className="workspace-switcher">
            <div className="workspace-kicker">FAB SECTOR</div>
            <div className="workspace-name">
              Fab 07 · Process Control <ChevronDown size={13} />
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="sidebar-nav-scroll">
          {/* Group 1: WORKSPACE */}
          {sidebarOpen && <div className="nav-label">WORKSPACE</div>}
          <nav className="main-nav">
            {workspaceNav.map(([label, href, Icon, count]) => {
              const isActive = pathname === href || (href !== "/overview" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  title={label}
                  data-tooltip={label}
                >
                  <span className="nav-icon">
                    <Icon size={17} />
                  </span>
                  {sidebarOpen && (
                    <>
                      <span>{label}</span>
                      {count !== undefined && <span className="nav-count">{count}</span>}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>
          {!sidebarOpen && <div className="nav-divider" />}

          {/* Group 2: ANALYSIS */}
          {sidebarOpen && <div className="nav-label">ANALYSIS</div>}
          <nav className="main-nav">
            {analysisNav.map(([label, href, Icon]) => {
              const isActive = pathname === href || pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  title={label}
                  data-tooltip={label}
                >
                  <span className="nav-icon">
                    <Icon size={17} />
                  </span>
                  {sidebarOpen && <span>{label}</span>}
                </Link>
              );
            })}
          </nav>
          {!sidebarOpen && <div className="nav-divider" />}

          {/* Group 3: SYSTEM */}
          {sidebarOpen && <div className="nav-label">SYSTEM</div>}
          <nav className="main-nav">
            {systemNav.map(([label, href, Icon]) => {
              const isActive = pathname === href || pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive ? "active" : ""}`}
                  title={label}
                  data-tooltip={label}
                >
                  <span className="nav-icon">
                    <Icon size={17} />
                  </span>
                  {sidebarOpen && <span>{label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer (Pinned to bottom as a single compact unit) */}
        {sidebarOpen ? (
          <div className="sidebar-footer">
            <button
              className="sidebar-bottom-toggle"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
              <span>Collapse sidebar</span>
            </button>
            <div className="sidebar-footer-divider" />
            <div className="user-row">
              <div className="avatar">MS</div>
              <div className="user-copy">
                <b>Mei Sato</b>
                <span>Yield engineer</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="sidebar-collapsed-footer">
            <button
              className="sidebar-rail-toggle"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={16} />
            </button>
            <div className="sidebar-footer-divider" style={{ width: "24px" }} />
            <div
              className="avatar"
              title="Mei Sato (Yield Engineer)"
              style={{ width: "28px", height: "28px", fontSize: "10px" }}
            >
              MS
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Application Content ── */}
      <div className="main-content">
        {/* Simplified Top Bar (Context + Utilities only) */}
        <header className="topbar">
          <div className="breadcrumb">
            <span style={{ color: "#7a8c98" }}>Fab 07</span>
            <ChevronRight size={13} color="#9cb1c0" />
            <span>{getBreadcrumbContext()}</span>
            {activeLotId && (
              <>
                <ChevronRight size={13} color="#9cb1c0" />
                <b>{activeLotId}</b>
              </>
            )}
          </div>
          {/* 4-Step Golden Path Stepper */}
          <div className="workflow-stepper">
            <span className="workflow-stepper-label">WORKFLOW:</span>
            <Link
              href="/overview"
              className={`workflow-step ${pathname === "/" || pathname.startsWith("/overview") ? "active" : ""}`}
              title="Step 1: Check fleet yield and excursion alerts"
            >
              <span className="workflow-step-num">1</span>
              <span>Alert</span>
            </Link>
            <span className="workflow-sep">›</span>
            <Link
              href="/investigation"
              className={`workflow-step ${pathname.startsWith("/investigation") || pathname.startsWith("/root-cause") ? "active" : ""}`}
              title="Step 2: Root-cause diagnosis with wafer map and sensors"
            >
              <span className="workflow-step-num">2</span>
              <span>Diagnose</span>
            </Link>
            <span className="workflow-sep">›</span>
            <Link
              href="/playbook"
              className={`workflow-step ${pathname.startsWith("/playbook") || pathname.startsWith("/action-playbook") ? "active" : ""}`}
              title="Step 3: Containment and machine repair checklist"
            >
              <span className="workflow-step-num">3</span>
              <span>Contain</span>
            </Link>
            <span className="workflow-sep">›</span>
            <Link
              href="/batch-risk"
              className={`workflow-step ${pathname.startsWith("/batch-risk") || pathname.startsWith("/risk") ? "active" : ""}`}
              title="Step 4: Quarantine upcoming at-risk lots"
            >
              <span className="workflow-step-num">4</span>
              <span>Protect</span>
            </Link>
          </div>

          <div className="topbar-actions">
            <button
              className="command-search"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={14} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-btn"
              onClick={() => addToast("Fab notifications", "All real-time sensors nominal on Fab 07.")}
              aria-label="Notifications"
            >
              <Bell size={16} />
              <i className="notification-dot" />
            </button>
          </div>
        </header>

        {/* Page Inner Content */}
        {children}
      </div>

      {/* ── Search Modal ── */}
      {searchOpen && (
        <div
          className="drawer-layer"
          style={{ justifyContent: "center", alignItems: "flex-start", paddingTop: "80px" }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="panel"
            style={{ width: "min(560px, 92vw)", padding: "18px", background: "#ffffff", boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #edebe4", paddingBottom: "12px" }}>
              <Search size={17} color="#274c6b" />
              <input
                autoFocus
                type="text"
                placeholder="Search lots, equipment, cases, playbook actions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", fontSize: "13px", color: "#1c2733", background: "transparent" }}
              />
              <button className="icon-btn" onClick={() => setSearchOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ maxHeight: "320px", overflowY: "auto", marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  className="lot-picker-row"
                  style={{ borderRadius: "6px", textAlign: "left", display: "flex", justifyContent: "space-between", padding: "10px 12px" }}
                  onClick={() => {
                    setSearchOpen(false);
                    router.push(res.href);
                  }}
                >
                  <div>
                    <b style={{ color: "#274c6b", fontSize: "11.5px" }}>{res.title}</b>
                    <div style={{ color: "#7b8e9c", fontSize: "10px", marginTop: "2px" }}>{res.detail}</div>
                  </div>
                  <span style={{ fontSize: "9px", color: "#8a98a4", textTransform: "uppercase" }}>{res.category}</span>
                </button>
              ))}
              {searchResults.length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", color: "#8a98a4", fontSize: "11px" }}>
                  No matching items found for "{searchQuery}".
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-item">
            <b>{t.title}</b>
            {t.desc && <span>{t.desc}</span>}
          </div>
        ))}
      </div>

      {/* ── Conversational AI Copilot ── */}
      <YieldGuardCopilot activeLotId={activeLotId} currentRoute={pathname} />
    </div>
  );
}
