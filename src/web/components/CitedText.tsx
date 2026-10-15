"use client";

// Prose with every evidence reference marked in the colour of the server's
// citation check (src/api/evidence_graph.py): verified, value mismatch, or not in
// any tool's output. The verdicts come from the server; this only finds where
// each reference sits in the text, matching the way the checker matched it.

import { STATUS_STYLE, type EvidenceLink } from "./EvidenceGraph";
import s from "./CitedText.module.css";

const CASE_INSENSITIVE = new Set(["process_param", "telemetry", "defect_class"]);

type Span = { start: number; end: number; link: EvidenceLink };

function spans(text: string, links: EvidenceLink[]): Span[] {
  const found: Span[] = [];
  for (const link of links) {
    const hay = CASE_INSENSITIVE.has(link.kind) ? text.toLowerCase() : text;
    const ref = CASE_INSENSITIVE.has(link.kind) ? link.ref.toLowerCase() : link.ref;
    for (let i = hay.indexOf(ref); i >= 0; i = hay.indexOf(ref, i + ref.length)) {
      const before = text[i - 1], after = text[i + ref.length];
      if ((before && /[\w-]/.test(before)) || (after && /[\w-]/.test(after))) continue;
      found.push({ start: i, end: i + ref.length, link });
    }
  }
  // longest first at the same start, then drop overlaps
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const sp of found) if (!out.length || sp.start >= out[out.length - 1].end) out.push(sp);
  return out;
}

/** The links whose reference appears in `text`: what a reader has seen so far. */
export function citedIn(text: string, links: EvidenceLink[]) {
  return spans(text, links).map((sp) => sp.link)
    .filter((l, i, all) => all.findIndex((m) => m.kind === l.kind && m.ref === l.ref) === i);
}

export default function CitedText({ text, links }: { text: string; links: EvidenceLink[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const sp of spans(text, links)) {
    if (sp.start > at) parts.push(<span key={`t${at}`}>{text.slice(at, sp.start)}</span>);
    const st = STATUS_STYLE[sp.link.status];
    parts.push(
      <mark key={`m${sp.start}`} className={s.cite} title={`${st.label} · ${sp.link.source}`}
            style={{ color: st.color, background: `${st.color}1a`, borderBottomColor: st.color }}>
        {text.slice(sp.start, sp.end)}
      </mark>);
    at = sp.end;
  }
  if (at < text.length) parts.push(<span key={`t${at}`}>{text.slice(at)}</span>);
  return <>{parts}</>;
}
