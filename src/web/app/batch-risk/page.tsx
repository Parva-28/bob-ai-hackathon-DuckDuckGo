"use client";

/**
 * Batch risk triage — planned lots, before they run.
 *
 * Rewritten against what flag_at_risk_batch actually returns:
 *   at_risk (bool) · similarity_to_historical_low_yield (0-1) · matched_case_ids
 *
 * The previous version was built around a 0-100 "composite triage score" with
 * values like 18/100 and 68/100. No such score exists anywhere in the tool
 * output — it was invented for the layout. Similarity is the real ranking signal,
 * so the meter shows that and says what it is.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { AsyncBoundary, ProvenanceChip } from "@/components/AsyncBoundary";
import { useLots, useApi } from "@/lib/api";
import { AlertTriangle, ArrowRight, ShieldCheck, RefreshCw } from "lucide-react";

type Risk = {
  id: string; product: string; line: string; equipment: string;
  atRisk: boolean | null; similarity: number | null; matched: string[];
  loading: boolean;
};

function useRisk(lotId: string) {
  // /api/analyze runs the real pre-run chain for a planned lot.
  const { data } = useApi<any>(`/api/analyze?lot=${encodeURIComponent(lotId)}`);
  return {
    atRisk: data?.risk?.at_risk ?? null,
    similarity: data?.risk?.similarity_to_historical_low_yield ?? null,
    matched: data?.risk?.matched_case_ids ?? [],
    provenance: data?.lot?.data_provenance?.kind,
  };
}

function RiskRow({ lot, onSelect, selected }: {
  lot: { id: string; product: string; line: string; equipment: string };
  onSelect: (id: string) => void; selected: boolean;
}) {
  const r = useRisk(lot.id);
  const pct = r.similarity == null ? null : Math.round(r.similarity * 100);
  return (
    <div className={`action-row ${selected ? "active" : ""}`}
         onClick={() => onSelect(lot.id)} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === "Enter" && onSelect(lot.id)}>
      <div className="action-group">
        <b>{lot.id}</b>
        <span className="metric-detail">
          {lot.product} · {lot.line} · {lot.equipment}
        </span>
      </div>
      <div style={{ minWidth: 190 }}>
        <div className="risk-meter" aria-label="similarity to historical low-yield profiles">
          <div className="risk-meter-fill"
               style={{
                 width: `${pct ?? 0}%`,
                 background: r.atRisk ? "#b3403a" : "#2e6e58",
               }} />
        </div>
        <span className="metric-detail">
          {pct == null ? "scoring…" : `similarity ${pct}% · ${r.atRisk ? "AT RISK" : "not flagged"}`}
        </span>
      </div>
    </div>
  );
}

export default function BatchRiskPage() {
  const { data, error, loading, reload } = useLots();
  const [selected, setSelected] = useState<string | null>(null);

  const planned = useMemo(() =>
    (Object.values(data?.lots ?? {}) as any[])
      .filter((l) => l.status === "planned")
      .map((l) => ({
        id: l.lot_id, product: l.product, line: l.line,
        equipment: (l.equipment ?? []).join(", ") || "—",
      })), [data]);

  const detail = useRisk(selected ?? "");

  return (
    <AppShell activeLotId={selected ?? planned[0]?.id}>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!planned.length} label="planned lots">
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow accent-eyebrow">
                <span className="pulse-dot" /> PRE-RUN TRIAGE
              </div>
              <h1>Batch <span>risk</span></h1>
              <p>
                Planned lots scored against historically low-yield parameter profiles
                by <code>flag_at_risk_batch</code>, before any wafer is processed.
              </p>
            </div>
            <div className="heading-actions">
              <button className="button primary" onClick={reload} disabled={loading}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <div className="alert-banner">
            <span className="alert-leading">
              <AlertTriangle size={15} className="alert-icon" />
            </span>
            <span>
              A triage signal for engineer review, <b>not an automated go/no-go gate</b>.
              Similarity to past low-yield profiles is not a causal prediction.
            </span>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-top"><span>Planned lots</span><ShieldCheck size={15} /></div>
              <div className="metric-value">{planned.length}</div>
              <div className="metric-detail">awaiting release</div>
            </div>
            <div className="metric-card">
              <div className="metric-top"><span>Signal</span></div>
              <div className="metric-value">similarity</div>
              <div className="metric-detail">
                0–1 cosine vs low-yield profiles. No 0–100 score exists in the tool output.
              </div>
            </div>
          </div>

          <div className="panel risk-panel">
            <h2>Planned lots</h2>
            {planned.map((l) => (
              <RiskRow key={l.id} lot={l} selected={selected === l.id}
                       onSelect={setSelected} />
            ))}
          </div>

          {selected && (
            <div className="panel actions-panel">
              <h2>
                {selected} <ProvenanceChip kind={detail.provenance} />
              </h2>
              <div className="action-row">
                <span>At risk</span>
                <b>{detail.atRisk == null ? "…" : detail.atRisk ? "YES" : "no"}</b>
              </div>
              <div className="action-row">
                <span>Similarity to historical low-yield</span>
                <b>{detail.similarity == null ? "…" : detail.similarity.toFixed(4)}</b>
              </div>
              <div className="action-row">
                <span>Matched cases</span>
                <b>{detail.matched.length ? detail.matched.join(", ") : "none"}</b>
              </div>
              <Link className="button primary" href={`/investigation?lot=${selected}`}>
                Open in investigation <ArrowRight size={14} />
              </Link>
            </div>
          )}

          <footer className="page-footer">
            <span><span className="live-dot" /> Live from flag_at_risk_batch</span>
            <span>YieldGuard · pre-run triage</span>
          </footer>
        </div>
      </AsyncBoundary>
    </AppShell>
  );
}
