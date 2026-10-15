"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { blankWafer } from "@/lib/wafer";
import type { NetClient } from "./netClient";
import s from "./atlas.module.css";

const BLANK = Uint8Array.from(blankWafer().flat());
const inside = (r: number, c: number) => BLANK[r * 64 + c] > 0;

type Preset = { name: string; paint: (m: Uint8Array) => void };

function disc(m: Uint8Array, r0: number, c0: number, rad: number, v: number) {
  for (let r = Math.floor(r0 - rad); r <= r0 + rad; r++) {
    for (let c = Math.floor(c0 - rad); c <= c0 + rad; c++) {
      if (r < 0 || c < 0 || r > 63 || c > 63 || !inside(r, c)) continue;
      if ((r - r0) ** 2 + (c - c0) ** 2 <= rad * rad) m[r * 64 + c] = v;
    }
  }
}

function ring(m: Uint8Array, r0: number, r1: number, a0 = 0, a1 = Math.PI * 2) {
  for (let r = 0; r < 64; r++) {
    for (let c = 0; c < 64; c++) {
      const d = Math.hypot(c - 31.5, r - 31.5);
      let a = Math.atan2(r - 31.5, c - 31.5);
      if (a < 0) a += Math.PI * 2;
      if (inside(r, c) && d >= r0 && d <= r1 && a >= a0 && a <= a1) m[r * 64 + c] = 2;
    }
  }
}

const PRESETS: Preset[] = [
  { name: "Scratch", paint: (m) => { for (let t = 0; t <= 1; t += 0.01) disc(m, 14 + 34 * t + 5 * Math.sin(t * 3), 18 + 30 * t, 0.8, 2); } },
  { name: "Donut", paint: (m) => ring(m, 9, 14) },
  { name: "Edge ring", paint: (m) => ring(m, 27, 31) },
  { name: "Center", paint: (m) => disc(m, 31.5, 31.5, 8, 2) },
  { name: "Edge arc", paint: (m) => ring(m, 23, 31, 3.6, 4.5) },
];

/**
 * A blank wafer you paint failing dies onto. Every stroke runs the CNN in the
 * browser (one pass while drawing, full TTA-8 on release); pausing triggers a
 * search of all 811,457 real wafers for the ones that look most like it.
 */
export default function SketchPad({
  net,
  onLive,
  onSettled,
}: {
  net: NetClient | null;
  onLive: (probs: Float32Array) => void;
  onSettled: (probs: Float32Array, z: Float32Array, scale: number) => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const map = useRef(BLANK.slice());
  const painting = useRef<0 | 1 | 2>(0);
  const last = useRef<[number, number] | null>(null);
  const settleTimer = useRef(0);
  const [brush, setBrush] = useState(1.6);
  const [erase, setErase] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  const draw = useCallback(() => {
    const ctx = cv.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(64, 64);
    for (let i = 0; i < 4096; i++) {
      const v = map.current[i], k = i * 4;
      const col = v === 2 ? [255, 179, 71, 255] : v === 1 ? [36, 50, 72, 255] : [0, 0, 0, 0];
      img.data.set(col, k);
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const live = useCallback(() => {
    net?.live(map.current, (r) => {
      onLive(r.probs);
      setMs(Math.round(r.ms));
    });
  }, [net, onLive]);

  const settle = useCallback(() => {
    if (!net) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(async () => {
      const r = await net.settle(map.current);
      onSettled(r.probs, r.z!, r.scale);
    }, 350);
  }, [net, onSettled]);

  useEffect(draw, [draw]);
  useEffect(() => { live(); }, [live]);

  const cell = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [((e.clientY - r.top) / r.height) * 64, ((e.clientX - r.left) / r.width) * 64] as [number, number];
  };

  const stroke = (to: [number, number]) => {
    const v = painting.current;
    const from = last.current ?? to;
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      disc(map.current, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, brush, v);
    }
    last.current = to;
    draw();
    live();
  };

  const reset = (paint?: (m: Uint8Array) => void) => {
    map.current = BLANK.slice();
    paint?.(map.current);
    draw();
    live();
    settle();
  };

  return (
    <div className={s.sketch}>
      <div className={s.sketchStage}>
        <canvas
          ref={cv}
          width={64}
          height={64}
          className={s.sketchCanvas}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            painting.current = e.button === 2 || erase ? 1 : 2;
            last.current = null;
            stroke(cell(e));
          }}
          onPointerMove={(e) => painting.current && stroke(cell(e))}
          onPointerUp={() => {
            painting.current = 0;
            last.current = null;
            settle();
          }}
          aria-label="Wafer sketch pad: drag to paint failing dies"
        />
      </div>
      <div className={s.sketchTools}>
        <div className={s.seg}>
          {[["Fine", 0.9], ["Brush", 1.6], ["Wide", 2.8]].map(([label, v]) => (
            <button key={label} className={brush === v && !erase ? s.segOn : ""} onClick={() => { setBrush(v as number); setErase(false); }}>
              {label}
            </button>
          ))}
          <button className={erase ? s.segOn : ""} onClick={() => setErase(true)}>Erase</button>
        </div>
        <button className={s.ghostBtn} onClick={() => reset()}>Clear</button>
      </div>
      <div className={s.presetRow}>
        <span className={s.kicker}>Or start from</span>
        {PRESETS.map((p) => (
          <button key={p.name} className={s.chip} onClick={() => reset(p.paint)}>{p.name}</button>
        ))}
      </div>
      <div className={s.fine}>
        {net ? <>CNN running in your browser · {ms ?? "–"} ms per pass · no server round-trip</> : "Loading the model into your browser…"}
      </div>
    </div>
  );
}
