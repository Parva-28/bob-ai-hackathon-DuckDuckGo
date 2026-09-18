"use client";

/**
 * api.ts — the only place the frontend talks to the backend.
 *
 * Every screen reads live data through useApi(). Previously each page shipped a
 * hardcoded array, which is how "0.942 F1" and a lot table contradicting the real
 * one survived: a literal in a component is a number nobody re-checks.
 *
 * No data-fetching dependency. An in-flight map plus a TTL cache is ~40 lines and
 * covers what we need (dedup, cache, revalidate); SWR would add a package to do
 * the same for this size of app.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TTL_MS = 30_000;

type Entry = { at: number; data: unknown };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidate(prefix?: string) {
  if (!prefix) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

async function request<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;

  // Dedup: two components mounting at once must not fire the same request twice.
  const running = inflight.get(path);
  if (running) return running as Promise<T>;

  const p = (async () => {
    const res = await fetch(path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
    const data = await res.json();
    cache.set(path, { at: Date.now(), data });
    inflight.delete(path);
    return data;
  })();
  inflight.set(path, p);
  p.catch(() => inflight.delete(path));
  return p as Promise<T>;
}

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/** Fetch `path`, or nothing when `path` is null (for dependent queries). */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [nonce, setNonce] = useState(0);
  // Guards a setState after unmount, and a slow response overwriting a newer one.
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    if (!path) { setData(null); setLoading(false); return; }
    setLoading(true);
    request<T>(path)
      .then((d) => { if (live.current) { setData(d); setError(null); } })
      .catch((e) => { if (live.current) setError(String(e.message ?? e)); })
      .finally(() => { if (live.current) setLoading(false); });
    return () => { live.current = false; };
  }, [path, nonce]);

  const reload = useCallback(() => { invalidate(path ?? undefined); setNonce((n) => n + 1); }, [path]);
  return { data, error, loading, reload };
}

// ── typed endpoint helpers ───────────────────────────────────────────────────

export type Lot = {
  lot_id: string; status: string; yield: number | null;
  product: string; line: string; equipment: string[];
};
export type Provenance = {
  kind: "measured" | "constructed"; join: string; summary: string;
  components: Record<string, string>;
  valid_claims: string[]; invalid_claims: string[];
};

export const useLots        = () => useApi<{ lots: Record<string, Lot> }>("/api/lots");
export const useStatus      = () => useApi<any>("/api/status");
export const useAnalyze     = (lot: string | null) => useApi<any>(lot ? `/api/analyze?lot=${encodeURIComponent(lot)}` : null);
export const useEquipment   = (w = "14d") => useApi<any>(`/api/equipment?window=${w}`);
export const useCases       = (p?: string) => useApi<any>(p ? `/api/cases?pattern=${encodeURIComponent(p)}` : "/api/cases");
export const useMetrics     = () => useApi<any>("/api/metrics");
export const useEval        = () => useApi<any>("/api/eval");
export const useTransparency= () => useApi<any>("/api/transparency");
export const useCmpRuns     = (limit = 50) => useApi<any>(`/api/cmp/runs?limit=${limit}`);
export const useCmpPredict  = (w: string | null, s = "A", alpha = 0.1) =>
  useApi<any>(w ? `/api/cmp/predict?wafer_id=${encodeURIComponent(w)}&stage=${s}&alpha=${alpha}` : null);
