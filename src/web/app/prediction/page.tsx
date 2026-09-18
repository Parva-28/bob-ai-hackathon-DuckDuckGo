"use client";

/**
 * Prediction & abstention — the CMP conformal layer.
 *
 * This is the only screen backed entirely by MEASURED data: PHM 2016 CMP records
 * the process traces and the removal rate on the same wafer, so the truth is
 * known and displayed next to every prediction. Coverage is checkable live rather
 * than asserted.
 *
 * Two behaviours the rest of the product does not have:
 *   - the answer is an INTERVAL, and the point estimate is secondary
 *   - the system sometimes REFUSES, and the refusal is shown as the answer
 */

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { AsyncBoundary, ProvenanceChip } from "@/components/AsyncBoundary";
import { useCmpRuns, useCmpPredict, useMetrics } from "@/lib/api";
import { Ban, RefreshCw, Target, TrendingUp } from "lucide-react";

const ALPHAS = [0.05, 0.1, 0.2];

export default function PredictionPage() {
  const { data, error, loading, reload } = useCmpRuns(60);
  const { data: metrics } = useMetrics();
  const [sel, setSel] = useState<{ w: string; s: string } | null>(null);
  const [alpha, setAlpha] = useState(0.1);

  const runs = data?.runs ?? [];
  const limits = data?.control_limits ?? {};
  const chosen = sel ?? (runs[0] ? { w: runs[0].wafer_id, s: runs[0].stage } : null);
  const { data: pred, loading: predLoading } =
    useCmpPredict(chosen?.w ?? null, chosen?.s ?? "A", alpha);

  const p = pred?.prediction;
  const truth = pred?.measured_removal_rate;
  const covered = p && !p.abstained && truth != null
    && truth >= p.interval[0] && truth <= p.interval[1];

  // Headline pair, read from the measured results rather than restated.
  const exc = useMemo(() => {
    const e = metrics?.cmp?.conformal?.[`alpha_${alpha.toFixed(2)}`]?.test?.excursion;
    return e ? {
      point: e.point_prediction?.sensitivity,
      interval: e.conformal_interval?.sensitivity,
      n: e.n_excursions,
    } : null;
  }, [metrics, alpha]);

  const cov = metrics?.cmp?.conformal?.[`alpha_${alpha.toFixed(2)}`]?.test?.coverage;

  return (
    <AppShell>
      <AsyncBoundary loading={loading} error={error} onRetry={reload}
                     empty={!runs.length} label="CMP runs">
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow accent-eyebrow">
                <span className="pulse-dot" /> CONFORMAL PREDICTION
              </div>
              <h1>Prediction &amp; <span>abstention</span></h1>
              <p>
                PHM 2016 CMP removal rate. Sensors and outcome measured on the same
                wafer <ProvenanceChip kind="measured" />, so every interval below can be
                checked against the truth.
              </p>
            </div>
            <div className="heading-actions">
              <button className="button primary" onClick={reload} disabled={loading}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-top"><span>Point sensitivity</span><Target size={15} /></div>
              <div className="metric-value">
                {exc?.point != null ? `${(exc.point * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="metric-detail">excursions caught by the point estimate</div>
            </div>
            <div className="metric-card metric-good">
              <div className="metric-top"><span>Interval sensitivity</span><TrendingUp size={15} /></div>
              <div className="metric-value">
                {exc?.interval != null ? `${(exc.interval * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="metric-detail">same model, interval instead of a number</div>
            </div>
            <div className="metric-card">
              <div className="metric-top"><span>Empirical coverage</span></div>
              <div className="metric-value">
                {cov?.marginal_coverage != null ? `${(cov.marginal_coverage * 100).toFixed(1)}%` : "—"}
              </div>
              <div className="metric-detail">target {((1 - alpha) * 100).toFixed(0)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-top"><span>Abstention rate</span><Ban size={15} /></div>
              <div className="metric-value">
                {metrics?.abstention?.splits?.[0]
                  ? `${(metrics.abstention.splits[0].abstention_rate * 100).toFixed(1)}%`
                  : "—"}
              </div>
              <div className="metric-detail">
                declined runs carry {metrics?.abstention?.splits?.[0]
                  ?.mae_ratio_abstained_over_retained ?? "—"}× the error
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Confidence level</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {ALPHAS.map((a) => (
                <button key={a} className={`button ${a === alpha ? "primary" : "ghost"}`}
                        onClick={() => setAlpha(a)}>
                  α = {a} ({((1 - a) * 100).toFixed(0)}%)
                </button>
              ))}
            </div>
            {cov?.conditional && (
              <>
                <h2 style={{ marginTop: 16 }}>Conditional coverage</h2>
                <p className="metric-detail">
                  Marginal coverage is an average. Where it falls below target is where the
                  decisions are made — report this table, not just the headline.
                </p>
                <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={{ textAlign: "left" }}>Stratum</th>
                    <th style={{ textAlign: "right" }}>n</th>
                    <th style={{ textAlign: "right" }}>Coverage</th>
                    <th style={{ textAlign: "right" }}>Mean width</th>
                  </tr></thead>
                  <tbody>
                    {cov.conditional.map((c: any) => {
                      const below = c.coverage < 1 - alpha;
                      return (
                        <tr key={c.stratum}>
                          <td>{c.stratum}</td>
                          <td style={{ textAlign: "right" }}>{c.n}</td>
                          <td style={{ textAlign: "right", color: below ? "#b3403a" : "#2e6e58",
                                       fontWeight: below ? 600 : 400 }}>
                            {(c.coverage * 100).toFixed(1)}%
                          </td>
                          <td style={{ textAlign: "right" }}>{c.mean_width.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Run {chosen?.w} · stage {chosen?.s}</h2>
            {predLoading && <p className="metric-detail">Predicting…</p>}
            {p?.abstained && (
              <div className="alert-banner">
                <span className="alert-leading"><Ban size={15} className="alert-icon" /></span>
                <span>
                  <b>Declined — no prediction returned.</b>
                  <div className="metric-detail">{p.reason}</div>
                  {p.novel_variables?.length > 0 && (
                    <div className="metric-detail">
                      Novel variables: {p.novel_variables.join(", ")}
                    </div>
                  )}
                  <div className="metric-detail">{p.guidance}</div>
                </span>
              </div>
            )}
            {p && !p.abstained && (
              <>
                <div className="action-row">
                  <span>Interval ({((1 - alpha) * 100).toFixed(0)}%)</span>
                  <b>[{p.interval[0]}, {p.interval[1]}]</b>
                </div>
                <div className="action-row">
                  <span>Measured truth</span>
                  <b style={{ color: covered ? "#2e6e58" : "#b3403a" }}>
                    {truth?.toFixed(2)} {covered ? "· covered" : "· OUTSIDE interval"}
                  </b>
                </div>
                <div className="action-row">
                  <span>Point estimate</span><b>{p.predicted_removal_rate}</b>
                </div>
                <div className="action-row">
                  <span>Control limits</span>
                  <b>[{limits.lcl?.toFixed(1)}, {limits.ucl?.toFixed(1)}]</b>
                </div>
                <div className="action-row">
                  <span>Excursion possible (interval crosses a limit)</span>
                  <b style={{ color: p.excursion_possible ? "#b3403a" : "#2e6e58" }}>
                    {p.excursion_possible ? "YES" : "no"}
                  </b>
                </div>
                <div className="action-row">
                  <span>Excursion likely (point estimate outside)</span>
                  <b>{p.excursion_likely ? "yes" : "no"}</b>
                </div>
                {p.coverage_caveat && (
                  <div className="alert-banner">
                    <span className="alert-leading">
                      <Target size={15} className="alert-icon" />
                    </span>
                    <span>{p.coverage_caveat}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="panel">
            <h2>Runs ({data?.total ?? 0} available)</h2>
            <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ textAlign: "left" }}>Wafer</th>
                <th style={{ textAlign: "left" }}>Stage</th>
                <th style={{ textAlign: "right" }}>Measured removal rate</th>
              </tr></thead>
              <tbody>
                {runs.map((r: any) => (
                  <tr key={`${r.wafer_id}-${r.stage}`}
                      onClick={() => setSel({ w: r.wafer_id, s: r.stage })}
                      style={{ cursor: "pointer",
                               background: chosen?.w === r.wafer_id && chosen?.s === r.stage
                                 ? "#eef3f7" : undefined }}>
                    <td>{r.wafer_id}</td>
                    <td>{r.stage}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.measured_removal_rate.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="page-footer">
            <span><span className="live-dot" /> Live from predict_removal_rate</span>
            <span>YieldGuard · conformal layer</span>
          </footer>
        </div>
      </AsyncBoundary>
    </AppShell>
  );
}
