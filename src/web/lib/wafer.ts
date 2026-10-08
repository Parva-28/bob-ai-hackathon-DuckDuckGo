"use client";

import { useEffect, useRef, useState } from "react";

/** /api/vision/explain: WaferCNN's prediction plus a 64×64 LayerCAM map in [0, 1]. */
export type WaferExplanation = {
  predicted_class: string;
  confidence: number;
  class_probabilities: Record<string, number>;
  cam: number[][];
};

/** A blank 64×64 WM-811K wafer: 1 (pass) inside the circle, 0 (off-wafer) outside —
 *  the same circle the image-upload path in Pipeline Studio rasterises to. */
export function blankWafer(): number[][] {
  return Array.from({ length: 64 }, (_, r) =>
    Array.from({ length: 64 }, (_, c) => (Math.hypot(c - 31.5, r - 31.5) <= 30.5 ? 1 : 0)));
}

/** Die colours while the attention map is shown: defects go slate so the red heat
 *  reads as the model's attention, not as more defects. */
export const MUTED_DIE = { pass: "#e3e8ec", fail: "#3a4a58" };

/** Paints the attention map over the dies already drawn at `cell` px per die. */
export function drawCamOverlay(ctx: CanvasRenderingContext2D, grid: number[][], cam: number[][], cell: number) {
  for (let r = 0; r < 64; r++) {
    for (let c = 0; c < 64; c++) {
      const v = cam[r]?.[c] ?? 0;
      if (!grid[r]?.[c] || v < 0.08) continue;
      ctx.fillStyle = `rgba(181, 71, 63, ${(0.85 * v ** 1.3).toFixed(3)})`;
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
}

/**
 * Explains `grid` whenever it changes while `enabled`. One request in flight at a
 * time; edits made meanwhile collapse into a single follow-up with the latest grid,
 * so drawing never queues a backlog of stale requests.
 */
export function useWaferExplain(grid: number[][] | null | undefined, enabled: boolean) {
  const [data, setData] = useState<WaferExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const latest = useRef<number[][] | null>(null);

  useEffect(() => {
    if (!enabled || !grid) return;
    latest.current = grid;
    if (busy.current) return;

    const send = async () => {
      busy.current = true;
      while (latest.current) {
        const g = latest.current;
        latest.current = null;
        try {
          const res = await fetch("/api/vision/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grid: g }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
          setData(body);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
      busy.current = false;
    };
    send();
  }, [grid, enabled]);

  // A "None" prediction has no defect pattern to point at; its map is noise.
  const cam = enabled && data && data.predicted_class !== "None" ? data.cam : undefined;
  return { data: enabled ? data : null, error: enabled ? error : null, cam };
}
