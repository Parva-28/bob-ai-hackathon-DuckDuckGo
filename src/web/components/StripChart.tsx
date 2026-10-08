"use client";

// A scrolling strip chart for streamed sensor values. The page pushes samples
// into a Ring (no React state per sample); each chart redraws on the next frame
// only when its ring has changed. A sample can carry a group (the wafer it came
// from) and a mark (an event logged at that moment): groups the detector
// alarmed are shaded red after the fact, marks are drawn as labelled ticks.

import { useEffect, useRef } from "react";

export class Ring {
  v: Float32Array; group: (string | null)[]; mark: (string | null)[];
  head = 0; len = 0; version = 0;
  constructor(readonly cap: number) {
    this.v = new Float32Array(cap);
    this.group = new Array(cap).fill(null);
    this.mark = new Array(cap).fill(null);
  }
  push(v: number, group: string | null = null, mark: string | null = null) {
    this.v[this.head] = v; this.group[this.head] = group; this.mark[this.head] = mark;
    this.head = (this.head + 1) % this.cap;
    this.len = Math.min(this.len + 1, this.cap);
    this.version++;
  }
  /** i = 0 is the oldest sample still held. */
  at(i: number) { return (this.head - this.len + i + this.cap) % this.cap; }
  last() { return this.len ? this.v[this.at(this.len - 1)] : NaN; }
  clear() { this.head = 0; this.len = 0; this.version++; }
}

const INK = "#274c6b", ALARM = "#b5473f", GRID = "#ece9e1", MARK = "#b5473f";

export default function StripChart({ ring, alarmed, height = 74, color = INK }: {
  ring: Ring;
  /** Groups to shade as alarmed. The page adds to it before the next samples
      arrive, and those samples trigger the redraw. */
  alarmed?: Set<string>;
  height?: number;
  color?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0, drawn = -1, w = 0, h = 0;
    let lo = NaN, hi = NaN, targetLo = NaN, targetHi = NaN;   // eased y range, so the trace doesn't jump

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawn = -1;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(c); resize();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const settling = Math.abs(lo - targetLo) + Math.abs(hi - targetHi) > 1e-3 * (hi - lo || 1);
      if (ring.version === drawn && !settling) return;
      drawn = ring.version;
      ctx.clearRect(0, 0, w, h);
      for (let y = 1; y < 4; y++) {
        ctx.fillStyle = GRID; ctx.fillRect(0, Math.round((h * y) / 4), w, 1);
      }
      const n = ring.len;
      if (n < 2) return;
      const dx = w / (ring.cap - 1);
      const x0 = w - (n - 1) * dx;                // newest sample sits on the right edge

      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = ring.v[ring.at(i)];
        if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
      }
      if (!Number.isFinite(mn)) return;
      const pad = Math.max((mx - mn) * 0.12, Math.abs(mx) * 0.002, 1e-3);
      targetLo = mn - pad; targetHi = mx + pad;
      if (!Number.isFinite(lo)) { lo = targetLo; hi = targetHi; }
      lo += (targetLo - lo) * 0.18; hi += (targetHi - hi) * 0.18;
      const y = (v: number) => h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6);

      // alarmed groups: shaded span; group boundaries: hairline
      let start = 0;
      for (let i = 1; i <= n; i++) {
        const g = ring.group[ring.at(start)];
        if (i < n && ring.group[ring.at(i)] === g) continue;
        if (g && alarmed?.has(g)) {
          ctx.fillStyle = "rgba(181, 71, 63, 0.10)";
          ctx.fillRect(x0 + start * dx, 0, (i - start) * dx, h);
        }
        if (g && i < n) { ctx.fillStyle = "#e1ddd3"; ctx.fillRect(Math.round(x0 + i * dx), 0, 1, h); }
        start = i;
      }

      // the trace, one path per run of same colour
      ctx.lineWidth = 1.4; ctx.lineJoin = "round";
      let path = false, cur = "";
      for (let i = 0; i < n; i++) {
        const k = ring.at(i), v = ring.v[k], g = ring.group[k];
        const col = g && alarmed?.has(g) ? ALARM : color;
        if (!Number.isFinite(v)) { if (path) ctx.stroke(); path = false; continue; }
        if (!path || col !== cur) {
          if (path) { ctx.lineTo(x0 + i * dx, y(v)); ctx.stroke(); }
          ctx.beginPath(); ctx.strokeStyle = col; cur = col;
          ctx.moveTo(x0 + Math.max(0, i - 1) * dx, y(ring.v[ring.at(Math.max(0, i - 1))]));
          path = true;
        }
        ctx.lineTo(x0 + i * dx, y(v));
      }
      if (path) ctx.stroke();

      // logged events
      ctx.font = "600 9px 'IBM Plex Mono', monospace";
      for (let i = 0; i < n; i++) {
        const m = ring.mark[ring.at(i)];
        if (!m) continue;
        const x = Math.round(x0 + i * dx);
        ctx.fillStyle = MARK; ctx.fillRect(x, 0, 1.5, h);
        ctx.beginPath(); ctx.moveTo(x - 4, 0); ctx.lineTo(x + 5.5, 0); ctx.lineTo(x + 0.75, 6); ctx.fill();
        const tw = ctx.measureText(m).width;
        ctx.fillText(m, x + 5 + tw > w ? x - 5 - tw : x + 5, 15);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ring, alarmed, color]);

  return <canvas ref={canvas} style={{ display: "block", width: "100%", height }} />;
}
