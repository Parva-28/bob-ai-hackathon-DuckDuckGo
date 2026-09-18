"use client";

import { useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  CheckCircle2,
  Clock3,
  Crosshair,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Filter,
  Search,
  ShieldCheck,
} from "lucide-react";

interface ReportItem {
  id: string;
  lotId: string;
  title: string;
  author: string;
  date: string;
  severity: "critical" | "high" | "nominal";
  status: "Finalized" | "Pending Review";
  defectClass: string;
  findings: string;
}

const REPORTS: ReportItem[] = [
  {
    id: "REP-2026-0817",
    lotId: "WFR-24-0817",
    title: "Yield Excursion Investigation Dossier: Edge-Ring Anomaly",
    author: "Mei Sato (Yield Engineer)",
    date: "Today · 08:14",
    severity: "critical",
    status: "Finalized",
    defectClass: "Edge-Ring",
    findings: "RF power overshoot (+4.8σ) on ETCH-04 after 06:42 PM clean. Matched CASE-1042 at 91% similarity."
  },
  {
    id: "REP-2026-0816",
    lotId: "WFR-24-0816",
    title: "Center Defect Cluster Root Cause Audit",
    author: "Mei Sato (Yield Engineer)",
    date: "Yesterday",
    severity: "high",
    status: "Finalized",
    defectClass: "Center",
    findings: "Slurry delivery pump cavitation on CMP-03. Slurry flow deficit -2.4σ."
  },
  {
    id: "REP-2026-0814",
    lotId: "WFR-24-0814",
    title: "Routine Qualification Audit: FAB1-B Memory Line",
    author: "Quality Assurance",
    date: "3 days ago",
    severity: "nominal",
    status: "Finalized",
    defectClass: "None",
    findings: "Lot completed within 91.4% yield specification. All process parameters nominal."
  },
  {
    id: "REP-2026-0810",
    lotId: "WFR-24-0810",
    title: "Robotic Transfer End-Effector Scratch Containment Dossier",
    author: "T. Gomez (Automation Lead)",
    date: "1 week ago",
    severity: "high",
    status: "Finalized",
    defectClass: "Scratch",
    findings: "HANDLER-01 vibration chatter (+3.4σ). Re-taught robotic trajectory."
  },
];

export default function ReportsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const downloadReport = (rep: ReportItem) => {
    const content = `YIELDGUARD AI AUDIT REPORT\nReport ID: ${rep.id}\nLot: ${rep.lotId}\nTitle: ${rep.title}\nAuthor: ${rep.author}\nDate: ${rep.date}\nDefect Pattern: ${rep.defectClass}\nFindings: ${rep.findings}\nStatus: ${rep.status}\n\nCompliance: ISO 9001 / IATF 16949 Verified`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${rep.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filteredReports = REPORTS.filter(r =>
    r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.lotId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.defectClass.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell>
      <div className="page-content">
        {/* Header */}
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className="pulse-dot" /> AUDIT TRAIL & COMPLIANCE ARCHIVE
            </div>
            <h1>
              Investigation <span>reports</span>
            </h1>
            <p>Exportable semiconductor yield engineering dossiers and ISO 9001 quality audit reports.</p>
          </div>
          <div className="heading-actions">
            {searchTerm && (
              <button className="button ghost" onClick={() => setSearchTerm("")}>
                <Filter size={15} /> Clear search filter
              </button>
            )}
            <button className="button primary" onClick={() => downloadReport(REPORTS[0])}>
              <Download size={15} /> Export latest dossier
            </button>
          </div>
        </div>

        {/* 4 Summary Stats */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-top"><span>Archived Reports</span><FileText size={16} /></div>
            <div className="metric-value">{REPORTS.length} Dossiers</div>
            <div className="metric-detail">Stored on Fab 07 encrypted archive</div>
          </div>
          <div className="metric-card metric-good">
            <div className="metric-top"><span>ISO 9001 Compliance</span><CheckCircle2 size={16} /></div>
            <div className="metric-value">100% Verified</div>
            <div className="metric-detail">All evidence sources traceable</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Lead Engineer Sign-off</span><ShieldCheck size={16} /></div>
            <div className="metric-value">Mei Sato</div>
            <div className="metric-detail">Authorized semiconductor lead</div>
          </div>
          <div className="metric-card">
            <div className="metric-top"><span>Retention Period</span><Clock3 size={16} /></div>
            <div className="metric-value">10 Years</div>
            <div className="metric-detail">Automotive grade traceability</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ marginTop: "20px", marginBottom: "14px", display: "flex", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#ffffff", border: "1px solid #dcdad0", borderRadius: "7px", padding: "0 10px", height: "35px", minWidth: "280px" }}>
            <Search size={15} color="#8a98a4" />
            <input
              type="text"
              placeholder="Search reports by ID, lot, defect pattern..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: "11px", color: "#1c2733", background: "transparent", width: "100%" }}
            />
          </div>
        </div>

        {/* Reports List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredReports.map(rep => (
            <div
              key={rep.id}
              className="panel"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                padding: "16px 18px",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ font: "700 11px 'IBM Plex Mono', monospace", color: "#274c6b" }}>{rep.id}</span>
                  <span style={{ font: "600 10px 'IBM Plex Mono', monospace", color: "#6a7d8c" }}>Lot: {rep.lotId}</span>
                  <span className={`status-pill ${rep.severity === "critical" ? "pill-critical" : rep.severity === "high" ? "pill-high" : "pill-low"}`}>
                    {rep.defectClass}
                  </span>
                </div>

                <h3 style={{ fontSize: "13px", color: "#1d2c3a", fontWeight: 700, margin: "4px 0" }}>
                  {rep.title}
                </h3>

                <p style={{ fontSize: "11px", color: "#6a7c8b", margin: "2px 0 6px" }}>
                  {rep.findings}
                </p>

                <div style={{ display: "flex", gap: "14px", fontSize: "9.5px", color: "#8a98a4" }}>
                  <span>Author: <b style={{ color: "#3b5062" }}>{rep.author}</b></span>
                  <span>Date: <b style={{ color: "#3b5062" }}>{rep.date}</b></span>
                  <span>Status: <b style={{ color: "#2e6e58" }}>{rep.status}</b></span>
                </div>
              </div>

              <div>
                <button
                  className="button primary small"
                  onClick={() => downloadReport(rep)}
                >
                  <Download size={14} /> Download Dossier (.txt)
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="page-footer">
          <span><span className="live-dot" /> Audit trails meet IATF 16949 / ISO 9001 specs</span>
          <span>YieldGuard AI · Reports & Documentation Archive</span>
        </footer>
      </div>
    </AppShell>
  );
}
