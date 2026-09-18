"use client";

/**
 * Shared loading / error / empty states.
 *
 * Every screen now depends on a live backend, so "the API is down" is a state the
 * UI must render honestly rather than falling back to placeholder numbers. Showing
 * plausible-looking sample data when the backend is unreachable is exactly the
 * failure this refactor exists to remove.
 */

import { ReactNode } from "react";

export function AsyncBoundary({
  loading, error, empty, onRetry, children, label = "data",
}: {
  loading: boolean; error: string | null; empty?: boolean;
  onRetry?: () => void; children: ReactNode; label?: string;
}) {
  if (loading) {
    return (
      <div className="async-state" role="status" aria-live="polite">
        <div className="async-spinner" aria-hidden="true" />
        <span>Loading {label}…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="async-state async-error" role="alert">
        <div>
          <b>Could not load {label}.</b>
          <div className="async-detail">{error}</div>
          <div className="async-detail">
            Start the API: <code>uvicorn src.api.main:app --port 8787</code>
          </div>
        </div>
        {onRetry && <button className="button ghost" onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  if (empty) {
    return <div className="async-state">No {label} returned by the backend.</div>;
  }
  return <>{children}</>;
}

/** Marks any value that came from a constructed dataset rather than a measured one. */
export function ProvenanceChip({ kind }: { kind?: string }) {
  if (!kind) return null;
  const measured = kind === "measured";
  return (
    <span className={`prov-chip ${measured ? "prov-measured" : "prov-constructed"}`}
          title={measured
            ? "Sensors and outcome measured on the same wafers — causal claims are evidenced."
            : "Real data from unrelated datasets, paired by us. No causal claim survives the join."}>
      {measured ? "measured" : "constructed"}
    </span>
  );
}
