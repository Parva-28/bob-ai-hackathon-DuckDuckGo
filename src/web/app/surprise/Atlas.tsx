"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CLASSES, CLASS_COLORS, CLASS_RGB, NONE, Galaxy, parsePoints, unpackMap, type Points } from "./galaxy";
import { NetClient } from "./netClient";
import SketchPad from "./SketchPad";
import s from "./atlas.module.css";

// ── data shapes (written by src/models/vision/screen_all.py) ──────────────────

type ClassRow = {
  name: string; predicted: number; label_ready: number; threshold: number | null; prior: number; labeled_count: number;
  near_clean_called: number; near_clean_ready: number; near_clean_human_share: number;
};
type Family = {
  id: number; size: number; unlabeled: number; mean_conf: number;
  mean_probs: Record<string, number>; human_labels: Record<string, number>;
  samples: number[]; centroid_q: [number, number]; image: string;
  name: string; note: string; fail_density: number;
};
type Summary = {
  n_total: number; n_labeled: number; n_unlabeled: number;
  n_never_seen_none: number; never_seen_none_false_alarm_total: number;
  never_seen_none_false_alarms: Record<string, number>;
  target_precision: number; by_class: ClassRow[]; label_ready_total: number;
  calibration: Record<string, [number, number, number][]>;
  holdout: { macro_f1: number; accuracy: number; n: number } | null;
  families: Family[]; uncertain_total: number;
};
type Detail = {
  id: number; lot: string; waferIndex: number; rows: number; cols: number;
  gt: number; split: number; probs: number[]; map: string;
  siblings: { id: number; waferIndex: number; probs: number[]; gt: number }[];
};
type Hit = { id: number; d: number; x: number; y: number };
type SketchResult = { hits: Hit[]; ms: number; at: [number, number]; probs: Float32Array };

type Tab = "atlas" | "patterns" | "sketch" | "verdict";
type Mode = "pred" | "human" | "uncertainty" | "ready";
type Scope = "all" | "labeled" | "unlabeled";

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const argmax = (a: ArrayLike<number>) => { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; };
const GOLD = [255, 214, 102];
const HOT = [255, 138, 76];
const PASS = [38, 54, 79];
const qx = (v: number) => v / 65535;
const qy = (v: number) => 1 - v / 65535;
const familyName = (f: Family) => f.name;
const SUSPECT = [245, 165, 36];
/** A defect call on a wafer where under 1% of dies fail: humans almost never label those as defects. */
const isSuspect = (pts: Points, i: number) => pts.clean[i] === 1 && pts.pred[i] !== NONE;
const SPLIT_TEXT: Record<number, string> = {
  [-1]: "Never labeled by a human",
  0: "Human-labeled · the model never saw it",
  1: "Human-labeled · in the training set",
  2: "Human-labeled · in the holdout set",
};

// ── wafer map fetching + thumbnails ───────────────────────────────────────────

const mapCache = new Map<number, Uint8Array>();

async function fetchMaps(ids: number[]) {
  const need = [...new Set(ids)].filter((id) => !mapCache.has(id));
  if (!need.length) return;
  const res = await fetch("/surprise/api/wafers", { method: "POST", body: new Uint32Array(need) });
  const b = new Uint8Array(await res.arrayBuffer());
  need.forEach((id, j) => mapCache.set(id, b.slice(j * 1024, (j + 1) * 1024)));
}

function useMaps(ids: number[]) {
  const [, bump] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    if (ids.length) fetchMaps(ids).then(() => live && bump((v) => v + 1)).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return mapCache;
}

function Thumb({ bytes, map, fail, size, pass = PASS }: {
  bytes?: Uint8Array; map?: Uint8Array; fail: number[]; size: number; pass?: number[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const m = map ?? (bytes ? unpackMap(bytes) : null);
    const img = ctx.createImageData(64, 64);
    if (m) {
      for (let i = 0; i < 4096; i++) {
        const v = m[i], k = i * 4;
        if (v === 2) img.data.set([fail[0], fail[1], fail[2], 255], k);
        else if (v === 1) img.data.set([pass[0], pass[1], pass[2], 255], k);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [bytes, map, fail, pass]);
  return <canvas ref={ref} width={64} height={64} className={s.thumb} style={{ width: size, height: size }} />;
}

function ProbBars({ probs, limit = 9 }: { probs: ArrayLike<number>; limit?: number }) {
  const rows = Array.from(probs, (p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, limit);
  return (
    <div className={s.bars}>
      {rows.map(([p, i]) => (
        <div key={i} className={s.barRow}>
          <span className={s.swatch} style={{ background: CLASS_COLORS[i] }} />
          <span className={s.barName}>{CLASSES[i]}</span>
          <span className={s.barTrack}><span className={s.barFill} style={{ width: `${p * 100}%`, background: CLASS_COLORS[i] }} /></span>
          <span className={s.barVal}>{pct(p)}</span>
        </div>
      ))}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Atlas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gRef = useRef<Galaxy | null>(null);
  const [pts, setPts] = useState<Points | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("atlas");
  const [mode, setMode] = useState<Mode>("pred");
  const [scope, setScope] = useState<Scope>("all");
  const [solo, setSolo] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [hoverMap, setHoverMap] = useState<number | null>(null);
  const [family, setFamily] = useState<number | null>(null);
  const [net, setNet] = useState<NetClient | null>(null);
  const netStarted = useRef(false);
  const [liveProbs, setLiveProbs] = useState<Float32Array | null>(null);
  const [sketch, setSketch] = useState<SketchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [hud, setHud] = useState({ z: 1, tiles: 0 });

  // Load everything the galaxy needs.
  useEffect(() => {
    Promise.all([
      fetch("/surprise/points.bin").then((r) => { if (!r.ok) throw new Error("points"); return r.arrayBuffer(); }),
      fetch("/surprise/summary.json").then((r) => { if (!r.ok) throw new Error("summary"); return r.json(); }),
    ])
      .then(([buf, sum]) => { setPts(parsePoints(buf)); setSummary(sum); })
      .catch(() => setError("The screening data isn't built yet. Run: python src/models/vision/screen_all.py all"));
  }, []);

  const openTab = (k: Tab) => {
    setTab(k);
    // The verdict panel covers the right half: frame the galaxy in the gap to its left.
    if (k === "verdict") gRef.current?.goHome(1200, window.innerWidth > 1100 ? 0.62 : 1, window.innerWidth > 1100 ? -(window.innerWidth / 2 - 330 - (window.innerWidth - 740 - 330) / 2) : 0);
    if (k === "sketch" && !netStarted.current) {
      netStarted.current = true;
      const c = new NetClient();
      c.ready.then(() => setNet(c));
    }
  };

  const thresholds = useMemo(
    () => (summary ? summary.by_class.map((c) => c.threshold ?? 2) : Array(9).fill(2)),
    [summary],
  );

  const counts = useMemo(() => {
    if (!pts) return null;
    const pred = new Array(9).fill(0), human = new Array(9).fill(0), ready = new Array(9).fill(0);
    let unl = 0;
    for (let i = 0; i < pts.n; i++) {
      const lab = pts.gt[i] !== 255;
      if (lab) human[pts.gt[i]]++;
      else {
        unl++;
        if (pts.conf[i] / 255 >= thresholds[pts.pred[i]] && !isSuspect(pts, i)) ready[pts.pred[i]]++;
      }
      if (scope === "all" || (scope === "labeled") === lab) pred[pts.pred[i]]++;
    }
    return { pred, human, ready, unl };
  }, [pts, scope, thresholds]);

  // Where to print each class name: the densest cell of that class in the layout.
  const labelPos = useMemo(() => {
    if (!pts) return [];
    const G = 48;
    const h = Array.from({ length: 9 }, () => new Uint32Array(G * G));
    for (let i = 0; i < pts.n; i++) {
      h[pts.pred[i]][Math.min(G - 1, (pts.x[i] * G) | 0) * G + Math.min(G - 1, (pts.y[i] * G) | 0)]++;
    }
    return h.map((cells) => {
      const b = argmax(cells);
      return [(Math.floor(b / G) + 0.5) / G, ((b % G) + 0.5) / G] as [number, number];
    });
  }, [pts]);

  // Create the galaxy once the data and canvas exist.
  useEffect(() => {
    if (!pts || !canvasRef.current) return;
    const g = new Galaxy(canvasRef.current, pts);
    gRef.current = g;
    g.onHover = (id, x, y) => setHover(id >= 0 ? { id, x, y } : null);
    g.onPick = (id) => setSelected(id >= 0 ? id : null);
    let t = 0;
    g.onCamera = () => {
      if (t) return;
      t = window.setTimeout(() => { t = 0; setHud({ z: g.zRel, tiles: g.tilesShown }); }, 120);
    };
    g.startIntro();
    return () => { g.destroy(); gRef.current = null; };
  }, [pts]);

  // Restyle the 811k points whenever the view changes.
  const viewMode: Mode = tab === "verdict" ? "ready" : mode;
  const focusFamily = tab === "patterns" ? family : null;
  useEffect(() => {
    const g = gRef.current;
    if (!g || !pts) return;
    const dim = [70, 80, 96];
    const lo = [36, 48, 66], hi = [130, 205, 255];
    g.restyle((i, o) => {
      const p = pts.pred[i], gt = pts.gt[i], lab = gt !== 255;
      if ((scope === "labeled" && !lab) || (scope === "unlabeled" && lab)) { o[3] = 0; return; }
      let c = CLASS_RGB[p], a = p === NONE ? 0.32 : 1, cls = p;
      if (viewMode === "human") {
        cls = lab ? gt : 255;
        if (!lab) { c = dim; a = 0.1; } else { c = CLASS_RGB[gt]; a = gt === NONE ? 0.32 : 1; }
      } else if (viewMode === "uncertainty") {
        const u = Math.min(1, (1 - pts.conf[i] / 255) * 2.2);
        c = [lo[0] + (hi[0] - lo[0]) * u, lo[1] + (hi[1] - lo[1]) * u, lo[2] + (hi[2] - lo[2]) * u];
        a = 0.22 + 0.78 * u;
      } else if (viewMode === "ready") {
        if (lab) { o[3] = 0; return; }
        if (pts.conf[i] / 255 < thresholds[p]) { c = dim; a = 0.16; }
        else if (isSuspect(pts, i)) { c = SUSPECT; a = 1; cls = 255; }
      }
      if (solo !== null && cls !== solo) a *= 0.04;
      if (focusFamily !== null) {
        if (pts.fam[i] === focusFamily) { c = [255, 214, 102]; a = 1; } else a *= 0.06;
      }
      o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = a;
    });
  }, [pts, viewMode, scope, solo, focusFamily, thresholds]);

  // Selected wafer details.
  useEffect(() => {
    if (selected === null) return;
    let live = true;
    fetch(`/surprise/api/wafer?id=${selected}`).then((r) => r.json()).then((d) => live && setDetail(d)).catch(() => {});
    return () => { live = false; };
  }, [selected]);

  // Only fetch a hover thumbnail once the pointer rests on a wafer.
  useEffect(() => {
    const id = hover?.id ?? null;
    const t = window.setTimeout(() => setHoverMap(id), 110);
    return () => window.clearTimeout(t);
  }, [hover?.id]);

  const flyToWafer = useCallback((id: number, zRel?: number) => {
    const g = gRef.current;
    if (!g || !pts) return;
    g.flyTo(pts.x[id], pts.y[id], zRel ?? Math.max(g.zRel, 60));
  }, [pts]);

  const inspect = useCallback((id: number) => {
    setSelected(id);
    setTab("atlas");
    flyToWafer(id);
  }, [flyToWafer]);

  const onSettled = useCallback(async (probs: Float32Array, z: Float32Array, scale: number) => {
    setSearching(true);
    try {
      const res = await fetch("/surprise/api/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ z: Array.from(z), scale }),
      });
      const { hits, ms } = (await res.json()) as { hits: Hit[]; ms: number };
      const xs = hits.slice(0, 12).map((h) => qx(h.x)).sort((a, b) => a - b);
      const ys = hits.slice(0, 12).map((h) => qy(h.y)).sort((a, b) => a - b);
      const at: [number, number] = [xs[xs.length >> 1], ys[ys.length >> 1]];
      setSketch({ hits, ms, at, probs });
      gRef.current?.flyTo(at[0], at[1], 22, 1800);
    } finally {
      setSearching(false);
    }
  }, []);

  // Overlay: class names, family markers, sketch landing site, selection.
  const drawOverlay = (ctx: CanvasRenderingContext2D, g: Galaxy, now: number) => {
    const d = g.dpr;
    const label = (text: string, x: number, y: number, color: string, big = false) => {
      ctx.font = `${big ? 600 : 500} ${(big ? 13 : 11.5) * d}px "IBM Plex Mono", monospace`;
      ctx.lineWidth = 4 * d;
      ctx.strokeStyle = "rgba(6,9,14,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    if ((tab === "atlas" || tab === "verdict") && g.zRel < 10) {
      labelPos.forEach(([x, y], c) => {
        if (counts && counts.pred[c] === 0) return;
        const [sx, sy] = g.toScreen(x, y);
        if (sx < 0 || sy < 0 || sx > g.W || sy > g.H) return;
        ctx.fillStyle = CLASS_COLORS[c];
        ctx.beginPath(); ctx.arc(sx, sy, 3.5 * d, 0, Math.PI * 2); ctx.fill();
        label(CLASSES[c], sx + 8 * d, sy + 4 * d, solo === null || solo === c ? "#e8edf4" : "#5d6879");
      });
    }
    if (tab === "patterns" && summary) {
      for (const f of summary.families) {
        const [sx, sy] = g.toScreen(qx(f.centroid_q[0]), qy(f.centroid_q[1]));
        const on = family === f.id;
        ctx.strokeStyle = on ? "#ffd166" : "rgba(255,214,102,0.45)";
        ctx.lineWidth = (on ? 2 : 1) * d;
        ctx.beginPath(); ctx.arc(sx, sy, (on ? 16 : 10) * d, 0, Math.PI * 2); ctx.stroke();
        label(String.fromCharCode(65 + f.id), sx - 4 * d, sy + 4 * d, on ? "#ffd166" : "#c9b27a", on);
      }
    }
    if (tab === "sketch" && sketch) {
      sketch.hits.forEach((h, i) => {
        const [sx, sy] = g.toScreen(qx(h.x), qy(h.y));
        const r = (5 + 2.5 * Math.sin(now / 260 + i)) * d;
        ctx.strokeStyle = `rgba(255,214,102,${0.55 + 0.35 * Math.sin(now / 260 + i)})`;
        ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
      });
      const [sx, sy] = g.toScreen(sketch.at[0], sketch.at[1]);
      const pulse = (now / 1400) % 1;
      ctx.strokeStyle = `rgba(255,214,102,${1 - pulse})`;
      ctx.lineWidth = 2 * d;
      ctx.beginPath(); ctx.arc(sx, sy, (14 + 46 * pulse) * d, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.moveTo(sx, sy - 7 * d); ctx.lineTo(sx + 7 * d, sy); ctx.lineTo(sx, sy + 7 * d); ctx.lineTo(sx - 7 * d, sy); ctx.fill();
      label("YOUR SKETCH", sx + 14 * d, sy - 10 * d, "#ffd166", true);
    }
    if (selected !== null && pts) {
      const [sx, sy] = g.toScreen(pts.x[selected], pts.y[selected]);
      const r = (13 + 2 * Math.sin(now / 300)) * d;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 * d;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath(); ctx.moveTo(sx + dx * (r + 3 * d), sy + dy * (r + 3 * d)); ctx.lineTo(sx + dx * (r + 10 * d), sy + dy * (r + 10 * d)); ctx.stroke();
      }
    }
    if (hover && pts && hover.id !== selected) {
      const [sx, sy] = g.toScreen(pts.x[hover.id], pts.y[hover.id]);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1 * d;
      ctx.beginPath(); ctx.arc(sx, sy, 7 * d, 0, Math.PI * 2); ctx.stroke();
    }
  };

  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.overlay = drawOverlay;
    g.animate = selected !== null || (tab === "sketch" && !!sketch);
    g.kick();
  });

  const hoverMaps = useMaps(hoverMap !== null ? [hoverMap] : []);
  const familyObj = summary?.families.find((f) => f.id === family) ?? null;
  const familyMaps = useMaps(tab === "patterns" && familyObj ? familyObj.samples : []);
  const sketchMaps = useMaps(tab === "sketch" && sketch ? sketch.hits.map((h) => h.id) : []);
  const shown = selected !== null && detail?.id === selected ? detail : null;
  const siblingMaps = useMaps(shown ? shown.siblings.map((x) => x.id) : []);

  if (error) {
    return (
      <div className={s.root}>
        <div className={s.loading}><div className={s.loadTitle}>Wafer Atlas</div><p>{error}</p></div>
      </div>
    );
  }

  const legendCounts = viewMode === "human" ? counts?.human : viewMode === "ready" ? counts?.ready : counts?.pred;

  return (
    <div className={s.root}>
      <div className={s.vignette} />
      <canvas ref={canvasRef} className={s.canvas} />

      {!pts && (
        <div className={s.loading}>
          <div className={s.loadDisc} />
          <div className={s.loadTitle}>Loading 811,457 wafers</div>
          <p>Every wafer in WM-811K, placed by what our CNN sees in it.</p>
        </div>
      )}

      {/* ── top bar ── */}
      <header className={s.top}>
        <Link href="/overview" className={s.brand}>
          <span className={s.brandMark} />
          <span>YieldGuard</span>
          <span className={s.brandSub}>Wafer Atlas</span>
        </Link>
        <nav className={s.tabs}>
          {([
            ["atlas", "Atlas"],
            ["patterns", "Unnamed patterns"],
            ["sketch", "Sketch search"],
            ["verdict", "Can we pseudo-label?"],
          ] as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={tab === k ? s.tabOn : s.tab} onClick={() => openTab(k)}>
              {k === "sketch" && <span className={s.newDot} />}
              {label}
            </button>
          ))}
        </nav>
        <button className={s.ghostBtn} onClick={() => gRef.current?.goHome()}>Reset view</button>
      </header>

      {/* ── left rail ── */}
      {pts && summary && counts && (
        <aside className={s.left}>
          {tab === "atlas" && (
            <>
              <div className={s.hero}>
                <div className={s.heroNum}>{fmt(summary.n_total)}</div>
                <div className={s.heroLabel}>wafers on screen, every one of WM-811K</div>
                <div className={s.heroSplit}>
                  <span><b>{fmt(summary.n_labeled)}</b> labeled by humans</span>
                  <span><b>{fmt(summary.n_unlabeled)}</b> never labeled, screened by our model</span>
                </div>
              </div>
              <div className={s.kicker}>Color by</div>
              <div className={s.seg}>
                {([["pred", "Model's call"], ["human", "Human label"], ["uncertainty", "Doubt"], ["ready", "Label-ready"]] as [Mode, string][]).map(([k, l]) => (
                  <button key={k} className={mode === k ? s.segOn : ""} onClick={() => setMode(k)}>{l}</button>
                ))}
              </div>
              <p className={s.modeNote}>
                {mode === "pred" && "Each dot is one wafer, colored by the class the CNN assigns it (TTA-8). Position comes from the CNN's own 128-d embedding, so similar-looking wafers sit together."}
                {mode === "human" && "Only 21% of WM-811K ever got a human label. Everything grey is what we're asking the model to fill in."}
                {mode === "uncertainty" && "Brighter blue means the model is less sure. Doubt piles up on the borders between classes, which is where pseudo-labels would go wrong."}
                {mode === "ready" && `Colored: unlabeled wafers the model calls at ≥${pct(summary.target_precision, 0)} estimated precision, at real-world class frequencies. Amber: confident defect calls on near-clean wafers, which humans almost never label as defects, so don't trust them. Grey: needs a human.`}
              </p>
              <div className={s.seg}>
                {(["all", "labeled", "unlabeled"] as Scope[]).map((k) => (
                  <button key={k} className={scope === k ? s.segOn : ""} onClick={() => setScope(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
                ))}
              </div>
              {mode !== "uncertainty" && legendCounts && (
                <div className={s.legend}>
                  {CLASSES.map((c, i) => (
                    <button key={c} className={`${s.legendRow} ${solo !== null && solo !== i ? s.legendOff : ""}`} onClick={() => setSolo(solo === i ? null : i)}>
                      <span className={s.swatch} style={{ background: CLASS_COLORS[i] }} />
                      <span className={s.legendName}>{c}</span>
                      <span className={s.legendCount}>{fmt(legendCounts[i])}</span>
                    </button>
                  ))}
                  <div className={s.fine}>{solo === null ? "Click a class to isolate it." : "Click again to show all."}</div>
                </div>
              )}
            </>
          )}

          {tab === "patterns" && (
            <>
              <div className={s.panelTitle}>Patterns the 9 classes can&apos;t name</div>
              <FamilyIntro summary={summary} />
              <div className={s.famList}>
                {summary.families.map((f) => {
                  const human = Object.entries(f.human_labels);
                  const humanTotal = human.reduce((a, [, v]) => a + v, 0);
                  const split = humanTotal >= 10 && human.length > 1 && human[0][1] / humanTotal < 0.8;
                  return (
                    <button key={f.id} className={`${s.famCard} ${family === f.id ? s.famOn : ""}`}
                      onClick={() => { setFamily(f.id); gRef.current?.flyTo(qx(f.centroid_q[0]), qy(f.centroid_q[1]), 7, 1500); }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image} alt="" className={s.famImg} />
                      <span className={s.famBody}>
                        <span className={s.famName}><b>{String.fromCharCode(65 + f.id)}</b> {familyName(f)}</span>
                        <span className={s.famMeta}>{fmt(f.size)} wafers · {fmt(f.unlabeled)} unlabeled</span>
                        <span className={s.famMeta}>Model splits: {Object.entries(f.mean_probs).slice(0, 2).map(([k, v]) => `${k} ${pct(v, 0)}`).join(" / ")}</span>
                        {split && <span className={s.flag}>Human labels disagree here too</span>}
                        {humanTotal === 0 && <span className={s.flag}>No human ever labeled one</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {tab === "sketch" && (
            <>
              <div className={s.panelTitle}>Draw a defect. We&apos;ll find it.</div>
              <p className={s.modeNote}>
                Paint failing dies on the blank wafer. The CNN runs in this browser tab as you draw. When you stop, your sketch is
                matched against all {fmt(summary.n_total)} real wafers and the galaxy flies to where it belongs.
              </p>
              <SketchPad net={net} onLive={setLiveProbs} onSettled={onSettled} />
              {liveProbs && (
                <>
                  <div className={s.kicker}>The model reads your sketch as</div>
                  <ProbBars probs={liveProbs} limit={4} />
                </>
              )}
            </>
          )}

          {tab === "verdict" && <VerdictLegend summary={summary} />}
        </aside>
      )}

      {/* ── right rail ── */}
      {pts && summary && tab !== "verdict" && (
        <aside className={s.right}>
          {tab === "atlas" && (
            shown ? (
              <Inspector detail={shown} thresholds={thresholds} siblingMaps={siblingMaps} onPick={inspect} onClose={() => setSelected(null)} />
            ) : (
              <div className={s.empty}>
                <div className={s.panelTitle}>Click any wafer</div>
                <p className={s.modeNote}>
                  Scroll to zoom in. Past about 4× the dots turn into the actual wafer maps, so you can browse all{" "}
                  {fmt(summary.n_total)} of them one by one.
                </p>
                {summary.holdout && (
                  <div className={s.statRow}>
                    <div><b>{summary.holdout.macro_f1.toFixed(4)}</b><span>holdout macro-F1, recomputed here on the reconstructed split ({fmt(summary.holdout.n)} wafers)</span></div>
                  </div>
                )}
              </div>
            )
          )}

          {tab === "patterns" && (
            familyObj ? (
              <div>
                <div className={s.panelTitle}>{String.fromCharCode(65 + familyObj.id)} · {familyName(familyObj)}</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={familyObj.image} alt={`Average fail map of ${familyName(familyObj)}`} className={s.ghost} />
                <div className={s.fine}>Average failure rate per die across the family. Hot means the die fails often.</div>
                {familyObj.note && <p className={s.modeNote}>{familyObj.note}</p>}
                <div className={s.kicker}>Model&apos;s average vote</div>
                <ProbBars probs={CLASSES.map((c) => familyObj.mean_probs[c] ?? 0)} limit={3} />
                {Object.keys(familyObj.human_labels).length > 0 && (
                  <>
                    <div className={s.kicker}>What humans called the {fmt(Object.values(familyObj.human_labels).reduce((a, b) => a + b, 0))} they labeled</div>
                    <div className={s.humanRow}>
                      {Object.entries(familyObj.human_labels).slice(0, 5).map(([k, v]) => (
                        <span key={k} className={s.humanChip}><span className={s.swatch} style={{ background: CLASS_COLORS[CLASSES.indexOf(k)] }} />{k} {fmt(v)}</span>
                      ))}
                    </div>
                  </>
                )}
                <div className={s.kicker}>Most typical members</div>
                <div className={s.grid}>
                  {familyObj.samples.slice(0, 30).map((id) => (
                    <button key={id} className={s.gridCell} onClick={() => inspect(id)} title={`Wafer #${id}`}>
                      <Thumb bytes={familyMaps.get(id)} fail={GOLD} size={44} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={s.empty}>
                <div className={s.panelTitle}>Pick a pattern</div>
                <p className={s.modeNote}>Each card on the left is a cluster of wafers the taxonomy has no word for. Click one to light it up in the galaxy.</p>
              </div>
            )
          )}

          {tab === "sketch" && (
            sketch ? (
              <div>
                <div className={s.panelTitle}>Your sketch lands in {CLASSES[argmax(sketch.probs)]} territory</div>
                <div className={s.fine}>Searched {fmt(summary.n_total)} wafers in {sketch.ms} ms · nearest neighbours in the CNN&apos;s embedding space</div>
                <SketchNeighbours hits={sketch.hits} pts={pts} maps={sketchMaps} onPick={inspect} />
              </div>
            ) : (
              <div className={s.empty}>
                <div className={s.panelTitle}>{searching ? "Searching 811,457 wafers…" : "Waiting for your first stroke"}</div>
                <p className={s.modeNote}>Try a thin line across the wafer, then a ring near the edge, and watch where each one lands.</p>
              </div>
            )
          )}
        </aside>
      )}

      {tab === "verdict" && summary && <Verdict summary={summary} />}

      {/* ── hover card ── */}
      {hover && pts && (
        <div className={s.tip} style={{ left: hover.x + 16, top: hover.y + 16 }}>
          <Thumb bytes={hoverMaps.get(hover.id)} fail={CLASS_RGB[pts.pred[hover.id]]} size={72} />
          <div>
            <div className={s.tipId}>#{fmt(hover.id)}</div>
            <div><span className={s.swatch} style={{ background: CLASS_COLORS[pts.pred[hover.id]] }} /> {CLASSES[pts.pred[hover.id]]} {pct(pts.conf[hover.id] / 255, 0)}</div>
            <div className={s.tipDim}>{pts.gt[hover.id] === 255 ? "never labeled" : `human: ${CLASSES[pts.gt[hover.id]]}`}</div>
          </div>
        </div>
      )}

      {pts && (
        <div className={s.hud}>
          <span>×{hud.z.toFixed(1)}</span>
          <span>{hud.z >= 4 ? `${fmt(hud.tiles)} wafer maps on screen` : "zoom past ×4 to see the wafers themselves"}</span>
          <span className={s.hudHint}>scroll to zoom · drag to pan · click a wafer</span>
        </div>
      )}
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────────

function Inspector({ detail, thresholds, siblingMaps, onPick, onClose }: {
  detail: Detail; thresholds: number[]; siblingMaps: Map<number, Uint8Array>;
  onPick: (id: number) => void; onClose: () => void;
}) {
  const map = useMemo(() => Uint8Array.from(atob(detail.map), (c) => c.charCodeAt(0)), [detail.map]);
  const p = argmax(detail.probs);
  const conf = detail.probs[p];
  const m = unpackMap(map);
  let on = 0, fail = 0;
  for (let i = 0; i < 4096; i++) { if (m[i]) on++; if (m[i] === 2) fail++; }
  const suspect = p !== NONE && fail / Math.max(on, 1) < 0.01;
  const ready = detail.gt < 0 && conf >= thresholds[p] && !suspect;
  return (
    <div>
      <div className={s.inspHead}>
        <div>
          <div className={s.kicker}>Wafer</div>
          <div className={s.inspId}>#{fmt(detail.id)}</div>
        </div>
        <button className={s.ghostBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className={s.bigWafer}>
        <Thumb bytes={map} fail={HOT} size={232} />
      </div>
      <div className={s.inspMeta}>
        {detail.lot} · wafer {detail.waferIndex} · {detail.rows}×{detail.cols} die grid
      </div>
      <div className={detail.gt >= 0 ? s.labelYes : s.labelNo}>
        {SPLIT_TEXT[detail.split]}
        {detail.gt >= 0 && <b> · {CLASSES[detail.gt]}</b>}
      </div>
      <div className={s.callRow}>
        <span className={s.kicker}>Model&apos;s call</span>
        <span className={s.call}><span className={s.swatch} style={{ background: CLASS_COLORS[p] }} />{CLASSES[p]} · {pct(conf)}</span>
        {detail.gt < 0 && <span className={ready ? s.readyYes : s.readyNo}>{ready ? "label-ready" : "needs a human"}</span>}
      </div>
      {suspect && (
        <div className={s.fine}>
          Only {pct(fail / Math.max(on, 1), 2)} of this wafer&apos;s dies fail. Humans almost never label a wafer this clean as a
          defect, so treat this call as suspect whatever its confidence.
        </div>
      )}
      <ProbBars probs={detail.probs} limit={5} />
      {detail.siblings.length > 1 && (
        <>
          <div className={s.kicker}>The rest of {detail.lot} ({detail.siblings.length} wafers)</div>
          <div className={s.lotStrip}>
            {detail.siblings.map((w) => {
              const c = argmax(w.probs);
              return (
                <button key={w.id} className={`${s.lotCell} ${w.id === detail.id ? s.lotOn : ""}`} onClick={() => onPick(w.id)} title={`Wafer ${w.waferIndex}: ${CLASSES[c]}`}>
                  <Thumb bytes={siblingMaps.get(w.id)} fail={CLASS_RGB[c]} size={30} />
                  <span className={s.lotBar} style={{ background: CLASS_COLORS[c] }} />
                </button>
              );
            })}
          </div>
          <div className={s.fine}>Lots that repeat one pattern across wafers point at a tool, not at chance.</div>
        </>
      )}
    </div>
  );
}

function SketchNeighbours({ hits, pts, maps, onPick }: {
  hits: Hit[]; pts: Points; maps: Map<number, Uint8Array>; onPick: (id: number) => void;
}) {
  const human = new Array(9).fill(0);
  let labeled = 0;
  for (const h of hits) if (pts.gt[h.id] !== 255) { labeled++; human[pts.gt[h.id]]++; }
  return (
    <>
      <div className={s.grid}>
        {hits.map((h) => (
          <button key={h.id} className={s.gridCell} onClick={() => onPick(h.id)} title={`Wafer #${h.id} · ${CLASSES[pts.pred[h.id]]}`}>
            <Thumb bytes={maps.get(h.id)} fail={CLASS_RGB[pts.pred[h.id]]} size={52} />
            {pts.gt[h.id] !== 255 && <span className={s.gridTag}>H</span>}
          </button>
        ))}
      </div>
      <div className={s.fine}>
        {labeled > 0
          ? <>{labeled} of these {hits.length} carry a human label (H): {human.map((v, i) => [v, i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).map(([v, i]) => `${CLASSES[i]} ×${v}`).join(", ")}. The rest no human has ever looked at.</>
          : <>None of these {hits.length} were ever labeled by a human. Your sketch found wafers nobody had looked at.</>}
      </div>
    </>
  );
}

function VerdictLegend({ summary }: { summary: Summary }) {
  const defect = summary.by_class.filter((r) => r.name !== "None");
  const suspect = defect.reduce((a, r) => a + r.near_clean_ready, 0);
  const ready = summary.by_class.reduce((a, r) => a + r.label_ready, 0) - suspect;
  const rows: [string, string, number, string][] = [
    ["Label-ready", "linear-gradient(90deg, #3987e5, #199e70, #c98500, #9085e9)", ready, "class color: safe to pseudo-label"],
    ["Suspect", "#f5a524", suspect, "confident defect call on a near-clean wafer"],
    ["Needs a human", "#465060", summary.n_unlabeled - ready - suspect, "below its class's confidence threshold"],
  ];
  return (
    <>
      <div className={s.panelTitle}>The verdict, on every wafer</div>
      <p className={s.modeNote}>Only the {fmt(summary.n_unlabeled)} unlabeled wafers are shown. Zoom into the amber ones to see what the model is calling a defect.</p>
      <div className={s.legend}>
        {rows.map(([name, bg, n, note]) => (
          <div key={name} className={s.verdictKey}>
            <span className={s.swatch} style={{ background: bg }} />
            <span><b>{name}</b><span className={s.fine}>{note}</span></span>
            <span className={s.legendCount}>{fmt(n)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function FamilyIntro({ summary }: { summary: Summary }) {
  const sum = (fs: Family[]) => fs.reduce((a, f) => a + f.size, 0);
  const clean = summary.families.filter((f) => f.name.startsWith("Near-clean"));
  const layout = summary.families.filter((f) => f.name.startsWith("Non-standard"));
  const unseen = summary.families.filter((f) => Object.keys(f.human_labels).length === 0);
  return (
    <p className={s.modeNote}>
      {fmt(summary.uncertain_total)} wafers get no class above 60%, and the model doesn&apos;t call them clean either.
      Clustering them in the galaxy gives {summary.families.length} groups. Most aren&apos;t new defects:{" "}
      {clean.length} groups ({fmt(sum(clean))} wafers) are near-clean wafers with a few dead dies, a case the taxonomy has no
      rule for.{layout.length > 0 && <> {layout.length} ({fmt(sum(layout))} wafers) use a die layout the 9 classes were never defined on.</>}{" "}
      {unseen.length} of the {summary.families.length} groups contain no human-labeled wafer at all.
    </p>
  );
}

function Verdict({ summary }: { summary: Summary }) {
  const rows = summary.by_class;
  const isDefect = (r: ClassRow) => r.name !== "None";
  // A confident defect call on a near-clean wafer fails the shift check, whatever its confidence.
  const ready = (r: ClassRow) => r.label_ready - (isDefect(r) ? r.near_clean_ready : 0);
  const readyTotal = rows.reduce((a, r) => a + ready(r), 0);
  const needs = summary.n_unlabeled - readyTotal;
  const nearClean = rows.reduce((a, r) => a + r.near_clean_called, 0);
  const precAt = (name: string, t: number | null) =>
    t === null ? null : summary.calibration[name]?.find(([th]) => Math.abs(th - t) < 1e-6)?.[1] ?? null;
  // Precision if every argmax call at >= 50% confidence were accepted as a label.
  const naive = (name: string) => summary.calibration[name]?.[0]?.[1] ?? null;
  const fa = summary.never_seen_none_false_alarm_total;
  const trap = rows.filter(isDefect).sort((a, b) => b.near_clean_called - a.near_clean_called)[0];
  const shifted = (r: ClassRow) =>
    isDefect(r) && r.predicted > 0 && r.near_clean_called / r.predicted > Math.max(0.05, 10 * r.near_clean_human_share);
  return (
    <div className={s.verdictWrap}>
      <div className={s.verdict}>
        <div className={s.kicker}>The question</div>
        <h2 className={s.verdictTitle}>Can we just run the {fmt(summary.n_unlabeled)} unlabeled wafers through the model and call them labeled?</h2>
        <p className={s.verdictLead}>
          For <b>{fmt(readyTotal)}</b> of them, yes, and almost all of those are clean wafers. For the other <b>{fmt(needs)}</b>,
          not without a human. The galaxy behind this panel shows which are which.
        </p>
        <div className={s.statRow}>
          <div><b>{fmt(readyTotal)}</b><span>label-ready: ≥{pct(summary.target_precision, 0)} estimated precision and pass the shift check</span></div>
          <div><b>{fmt(nearClean)}</b><span>unlabeled wafers cleaner than almost anything a human labeled ({pct(nearClean / summary.n_unlabeled, 0)} of the pool)</span></div>
          <div><b>{pct(fa / summary.n_never_seen_none, 1)}</b><span>false alarms on {fmt(summary.n_never_seen_none)} human-labeled clean wafers the model never saw</span></div>
        </div>
        {trap && shifted(trap) && (
          <div className={s.callout}>
            <b>The trap is {trap.name}.</b> The model calls {fmt(trap.predicted)} unlabeled wafers {trap.name}; humans labeled{" "}
            {fmt(trap.labeled_count)} in the whole dataset. <b>{fmt(trap.near_clean_called)} of those calls ({pct(trap.near_clean_called / trap.predicted, 0)})</b>{" "}
            are on wafers where under 1% of dies fail, a kind of wafer humans almost never labeled {trap.name} ({pct(trap.near_clean_human_share, 1)} of
            their examples). The unlabeled pool is full of ultra-clean wafers the labeled set barely contains. The model barely saw
            one in training, and it reads a few dead dies in a row as a scratch. Confidence doesn&apos;t save you: even at ≥
            {trap.threshold === null ? "–" : pct(trap.threshold, 0)}, {fmt(trap.near_clean_ready)} of the {fmt(trap.label_ready)} &quot;confident&quot; calls are
            these wafers.
          </div>
        )}
        <table className={s.table}>
          <thead>
            <tr>
              <th>Class</th><th>Model calls</th><th>If you trust every call</th><th>On near-clean wafers</th>
              <th>Label-ready</th><th>Confidence needed</th><th>Precision there</th><th>Human examples</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = precAt(r.name, r.threshold);
              const nv = naive(r.name);
              return (
                <tr key={r.name}>
                  <td><span className={s.swatch} style={{ background: CLASS_COLORS[CLASSES.indexOf(r.name)] }} />{r.name}</td>
                  <td>{fmt(r.predicted)}</td>
                  <td className={nv !== null && nv < 0.9 ? s.warnTxt : ""}>{nv === null ? "—" : `${pct(nv, 0)} right`}</td>
                  <td className={shifted(r) ? s.warnTxt : ""}>
                    {r.predicted ? pct(r.near_clean_called / r.predicted, r.near_clean_called / r.predicted < 0.01 ? 2 : 0) : "—"}
                    <span className={s.dimNum}> vs {pct(r.near_clean_human_share, r.near_clean_human_share < 0.01 ? 2 : 1)}</span>
                  </td>
                  <td>{fmt(ready(r))} <span className={s.dimNum}>{r.predicted ? pct(ready(r) / r.predicted, 0) : ""}</span></td>
                  <td>{r.threshold === null ? <span className={s.warnTxt}>never reaches {pct(summary.target_precision, 0)}</span> : `≥ ${pct(r.threshold, 0)}`}</td>
                  <td>{p === null ? "—" : pct(p)}</td>
                  <td>{fmt(r.labeled_count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={s.fine}>
          &quot;On near-clean wafers&quot;: share of the model&apos;s calls on wafers with under 1% failing dies, vs the same share among
          human-labeled examples of that class. Amber means the model is applying the class somewhere humans never did.
        </div>
        <div className={s.method}>
          <div>
            <b>Why not just trust 0.92 macro-F1?</b> That score comes from a holdout with &quot;None&quot; cut to 25%. In the real data, None is{" "}
            {pct(rows[NONE].prior, 0)} of wafers, so even a small false-alarm rate on clean wafers swamps a rare class. Every precision
            here is re-weighted to real class frequencies, using the {fmt(summary.n_never_seen_none)} clean wafers the 25% subsample left out
            as an untouched test set (the model called {fmt(fa)} of them a defect).
          </div>
          <div>
            <b>The shift no calibration can see.</b> Calibration only measures wafers that look like the labeled ones. {fmt(nearClean)} unlabeled
            wafers are cleaner than {pct(1 - rows[NONE].near_clean_human_share, 2)} of the wafers humans labeled None. The pool you&apos;d be
            labeling isn&apos;t the pool the model was tested on.
          </div>
          <div>
            <b>What to do with it.</b> Take the {fmt(readyTotal)} label-ready wafers at a lower loss weight, keep the holdout human-only, and
            keep them only if macro-F1 <i>and</i> Scratch/Local F1 go up. Before any of that, have an engineer label a few hundred of the
            ultra-clean wafers. That one batch tells the model what a clean wafer looks like, and it will likely fix the Scratch over-calling
            at its source.
          </div>
        </div>
      </div>
    </div>
  );
}
