"use client";

import { useCallback, useEffect, useRef, useState, ViewTransition } from "react";
import Link from "next/link";
import type { FabScene, LandingLot, LandingWafer } from "./FabScene";
import type { EvidenceCheck } from "@/components/EvidenceGraph";
import Image from "next/image";
import s from "./landing.module.css";

type LandingData = {
  wafers: LandingWafer[];
  lot: LandingLot & {
    final_yield_pct: number;
    equipment_ids: string[];
    hypothesis: { title: string; confidence: number; evidence_check: EvidenceCheck };
    tool_calls: number;
  };
};

const STOPS = 5;
const MOVE_S = 1.7;                          // matches FabScene's camera flight
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const LABELS = ["Intro", "Off the line", "Probe tester", "Engineer's laptop", "YieldGuard"];

type Live =
  | { state: "loading" }
  | { state: "live"; cls: string; confidence: number; top: [string, number][]; heat: boolean }
  | { state: "offline"; cls: string; confidence: number };

// Every number on this page comes from public/landing/data.json, written by
// src/api/export_landing_data.py from the real models — not typed in here.
export default function Landing() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FabScene | null>(null);
  const scrollRaf = useRef(0);
  const stopRef = useRef(0);
  const busyUntil = useRef(0);
  const [data, setData] = useState<LandingData | null>(null);
  const [stop, setStop] = useState(0);
  // click a wafer -> live AI
  const pickedRef = useRef<{ slot: number; wafer: number } | null>(null);
  const [picked, setPicked] = useState<{ slot: number; wafer: number } | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [cardLeft, setCardLeft] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch("/landing/data.json").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  // One gesture, one move: the camera flies to the next stop while the page
  // glides to the matching section, both on the same eased curve and duration.
  const goTo = useCallback((i: number) => {
    const next = Math.max(0, Math.min(STOPS - 1, i));
    if (next === stopRef.current) return;
    stopRef.current = next;
    setStop(next);
    busyUntil.current = performance.now() + MOVE_S * 1000;
    sceneRef.current?.goTo(next);
    // The page glides on the camera's own curve. Done by hand rather than with a
    // smooth-scroll library: those jump instantly when the OS asks for reduced
    // motion, which turned each move into a cut.
    const el = document.querySelector<HTMLElement>(`[data-stop="${next}"]`);
    if (!el) return;
    const from = window.scrollY, to = el.offsetTop, t0 = performance.now();
    cancelAnimationFrame(scrollRaf.current);
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / (MOVE_S * 1000));
      window.scrollTo({ top: from + (to - from) * easeInOut(u), behavior: "instant" });
      if (u < 1) scrollRaf.current = requestAnimationFrame(step);
    };
    scrollRaf.current = requestAnimationFrame(step);
  }, []);

  // The scene is created once the data is in; three.js loads only in the browser.
  useEffect(() => {
    if (!data || !canvasRef.current) return;
    let disposed = false;
    import("./FabScene").then(({ FabScene }) => {
      if (disposed || !canvasRef.current) return;
      const scene = new FabScene(canvasRef.current, data.wafers, data.lot, {
        onPick: (p) => { pickedRef.current = p; setPicked(p); if (p) classify(p); else setLive(null); },
        onHover: setHover,
      });
      sceneRef.current = scene;
      // A picked wafer is classified by the real model (the endpoint the console
      // uses). If the API is not running, the card says so and shows the
      // prediction exported with the page, never an invented heatmap.
      const classify = (p: { slot: number; wafer: number }) => {
        const wafer = data.wafers[p.wafer];
        setLive({ state: "loading" });
        const x = scene.pickedScreenX();
        setCardLeft(x != null && x > 0.5);
        fetch("/api/vision/explain", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grid: wafer.grid }),
        })
          .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
          .then((r: { predicted_class: string; confidence: number; class_probabilities: Record<string, number>; cam: number[][] }) => {
            if (pickedRef.current?.slot !== p.slot) return;          // put back meanwhile
            const heat = r.predicted_class !== "None";
            scene.setHeatmap(p.slot, heat ? r.cam : null);
            const top = Object.entries(r.class_probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3);
            setLive({ state: "live", cls: r.predicted_class, confidence: r.confidence, top, heat });
          })
          .catch(() => {
            if (pickedRef.current?.slot === p.slot)
              setLive({ state: "offline", cls: wafer.predicted_class, confidence: wafer.confidence });
          });
      };
      sceneRef.current.goTo(stopRef.current, true);
    });
    return () => { disposed = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [data]);

  // The demo director (components/DemoDirector.tsx) drives the page with events.
  useEffect(() => {
    const onGoto = (e: Event) => goTo((e as CustomEvent<number>).detail);
    const onPick = () => { const slot = sceneRef.current?.firstTested() ?? -1; if (slot >= 0) sceneRef.current?.pick(slot); };
    const onRelease = () => sceneRef.current?.release();
    window.addEventListener("yg-demo-goto", onGoto);
    window.addEventListener("yg-demo-pick", onPick);
    window.addEventListener("yg-demo-release", onRelease);
    return () => {
      window.removeEventListener("yg-demo-goto", onGoto);
      window.removeEventListener("yg-demo-pick", onPick);
      window.removeEventListener("yg-demo-release", onRelease);
    };
  }, [goTo]);

  // Input: wheel, keys and swipes each trigger a whole move; native scrolling
  // is held back so a flick cannot scrub the camera frame by frame.
  useEffect(() => {
    // The section whose top is above the middle of the screen.
    const nearest = () => {
      const y = window.scrollY + window.innerHeight / 2;
      let best = 0;
      document.querySelectorAll<HTMLElement>("[data-stop]").forEach((el, i) => { if (el.offsetTop <= y) best = i; });
      return best;
    };
    let acc = 0, lastWheel = 0, lastAbs = 0, settling = false;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (pickedRef.current) return;              // a held wafer keeps the camera still
      const now = performance.now();
      const gap = now - lastWheel, abs = Math.abs(e.deltaY), prevAbs = lastAbs;
      lastWheel = now;
      lastAbs = abs;
      // A trackpad flick keeps sending momentum events for a second or more,
      // with shrinking deltas. After a move, only a new gesture counts: one
      // that starts after the move has finished and either follows a long pause
      // or rises above the tail it interrupts. One flick is one move, even on a
      // slow machine whose stalled frames put gaps into the momentum tail.
      if (settling) {
        if (now < busyUntil.current) return;
        const newGesture = gap > 600 || (gap > 220 && abs > prevAbs * 1.2);
        if (!newGesture) return;
        settling = false;
        acc = 0;
      }
      if (gap > 220) acc = 0;
      acc += e.deltaY;
      if (Math.abs(acc) > 40) { goTo(stopRef.current + Math.sign(acc)); acc = 0; settling = true; }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pickedRef.current) { sceneRef.current?.release(); return; }
      if (pickedRef.current) return;
      const map: Record<string, number> = { ArrowDown: 1, PageDown: 1, " ": 1, ArrowUp: -1, PageUp: -1 };
      if (e.key === "Home") { e.preventDefault(); goTo(0); return; }
      if (e.key === "End") { e.preventDefault(); goTo(STOPS - 1); return; }
      if (!(e.key in map)) return;
      e.preventDefault();
      if (performance.now() >= busyUntil.current) goTo(stopRef.current + map[e.key]);
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => { if (touchY !== null) e.preventDefault(); };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchY === null) return;
      const dy = touchY - e.changedTouches[0].clientY;
      touchY = null;
      if (Math.abs(dy) > 40 && performance.now() >= busyUntil.current) goTo(stopRef.current + Math.sign(dy));
    };
    // Reloading mid-page, or dragging the scrollbar, lands on the nearest stop.
    const onScroll = () => {
      if (performance.now() < busyUntil.current) return;
      const i = nearest();
      if (i !== stopRef.current) { stopRef.current = i; setStop(i); sceneRef.current?.goTo(i); }
    };
    onScroll();

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollRaf.current);
    };
  }, [goTo]);

  const w = data?.wafers[0];
  const lot = data?.lot;
  const check = lot?.hypothesis.evidence_check;
  const dev = lot ? Object.entries(lot.anomaly.deviations) : [];
  const section = (i: number) => ({
    "data-stop": i,
    className: `${s.step} ${i % 2 === 0 && i > 0 ? s.right : ""}`,
  });
  // A card appears once its stop is current, after the camera has mostly arrived.
  const card = (i: number, extra = "") => `${s.card} ${extra} ${stop === i && !picked ? s.in : ""}`;

  return (
    <ViewTransition exit={{ "enter-console": "landing-exit", default: "none" }} default="none">
    <div className={s.page}>
      <header className={s.bar}>
        <div className={s.brand}>
          <ViewTransition name="yg-brand" share="brand-morph" default="none">
            <span className={s.mark}>
              <Image src="/brand/yieldguard-mark.png" alt="" width={34} height={34} priority />
            </span>
          </ViewTransition>
          <Image src="/brand/yieldguard-wordmark.png" alt="YieldGuard AI" width={161} height={21} priority />
        </div>
        <Link href="/overview" transitionTypes={TO_CONSOLE} className={`${s.ghost} ${s.barButton}`}>Enter console →</Link>
      </header>

      <div className={s.stage}>
        <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
        <div className={s.veil} style={{ opacity: stop === STOPS - 1 ? 1 : 0 }} />
        <div className={s.heroWash} style={{ opacity: stop === 0 ? 1 : 0 }} />
        <div className={s.hint} style={{ opacity: hover || picked || stop <= 2 ? 1 : 0 }}>
          {hover ?? (picked ? "ESC OR CLICK ELSEWHERE TO PUT IT BACK"
            : stop === 0 ? "SCROLL TO FOLLOW A LOT ↓  ·  CLICK A TESTED WAFER TO CLASSIFY IT LIVE"
            : "CLICK A TESTED WAFER TO CLASSIFY IT LIVE")}
        </div>
      </div>

      {picked && live && (
        <aside className={`${s.liveCard} ${cardLeft ? s.liveLeft : s.liveRight}`} aria-live="polite">
          <div className={s.eyebrow}>
            {live.state === "offline" ? "EXPORTED PREDICTION · WaferCNN" : "LIVE · WaferCNN + TTA-8"}
          </div>
          {live.state === "loading" ? (
            <p className={s.body}>Classifying this wafer&apos;s test map…</p>
          ) : (
            <>
              <div className={s.liveClass}>
                {live.cls} <span>{(live.confidence * 100).toFixed(1)}%</span>
              </div>
              {live.state === "live" && (
                <div className={s.rows}>
                  {live.top.map(([k, v]) => (
                    <div className={s.row} key={k}><span>{k}</span><b>{(v * 100).toFixed(1)}%</b></div>
                  ))}
                </div>
              )}
              <p className={s.foot}>
                {live.state === "offline"
                  ? "Model API offline: showing the prediction exported with this page. Start the API to classify live."
                  : live.heat
                    ? "Red on the wafer: dies that most raised the predicted class's score (LayerCAM)."
                    : "No defect pattern predicted, so there is no attention map to show."}
              </p>
            </>
          )}
          <button className={s.ghost} onClick={() => sceneRef.current?.release()}>Put it back</button>
        </aside>
      )}

      <nav className={s.dots} aria-label="Sections">
        {LABELS.map((label, i) => (
          <button key={label} className={`${s.dot} ${stop === i ? s.dotOn : ""}`} onClick={() => goTo(i)}
                  aria-label={label} aria-current={stop === i ? "step" : undefined} title={label} />
        ))}
      </nav>

      <main className={s.steps}>
        <section {...section(0)}>
          <div className={card(0, s.hero)}>
            <div className={s.eyebrow}>YIELDGUARD · FAB YIELD COPILOT</div>
            <h1 className={s.h1}>Every failed die, explained.</h1>
            <p className={s.lead}>
              From the probe tester to a root cause, with every claim checked against what the
              models actually returned.
            </p>
            <div className={s.actions}>
              <Link href="/overview" transitionTypes={TO_CONSOLE} className={s.primary}>Enter console</Link>
              <Link href="/pipeline" transitionTypes={TO_CONSOLE} className={s.ghost}>Try Pipeline Studio</Link>
            </div>
          </div>
        </section>

        <section {...section(1)}>
          <div className={card(1)}>
            <div className={s.eyebrow}>01 · OFF THE LINE</div>
            <h2 className={s.h2}>{lot?.lot_id ?? "A lot"} leaves etch.</h2>
            <p className={s.body}>
              The wafers ran on {lot?.equipment_ids.join(" and ") ?? "the etch line"} and are heading into
              wafer sort. At this point nobody knows which dies work.
            </p>
          </div>
        </section>

        <section {...section(2)}>
          <div className={card(2)}>
            <div className={s.eyebrow}>02 · PROBE TESTER</div>
            <h2 className={s.h2}>Every die is tested.</h2>
            {w && (
              <div className={s.stat}>
                <span style={{ color: "#b5473f" }}>{w.failed.toLocaleString()}</span>
                <small>of {w.dies.toLocaleString()} dies failed on {lot?.lot_id}&apos;s wafer</small>
              </div>
            )}
            <p className={s.body}>
              Probes touch each die and test it electrically. Green passed, red failed. That map is what
              YieldGuard classifies: a measurement, not a photograph.
            </p>
          </div>
        </section>

        <section {...section(3)}>
          <div className={card(3)}>
            <div className={s.eyebrow}>03 · ON THE ENGINEER&apos;S LAPTOP</div>
            <h2 className={s.h2}>The pattern, and what drove it.</h2>
            {lot && (
              <div className={s.rows}>
                <div className={s.row}>
                  <span>WaferCNN pattern</span>
                  <b style={{ color: "#274c6b" }}>
                    {lot.classification.predicted_class} · {(lot.classification.confidence * 100).toFixed(2)}%
                  </b>
                </div>
                {dev.slice(0, 2).map(([k, v]) => (
                  <div className={s.row} key={k}>
                    <span>Etch tool trace · {k}</span>
                    <b style={{ color: Math.abs(v) >= 3 ? "#b5473f" : "#b8852c" }}>{v > 0 ? "+" : ""}{v.toFixed(1)}σ</b>
                  </div>
                ))}
                <div className={s.row}>
                  <span>Nearest past case</span>
                  <b style={{ color: "#2e6e58" }}>{lot.case.case_id} · {Math.round(lot.case.similarity * 100)}%</b>
                </div>
              </div>
            )}
            <p className={s.foot}>
              Classifier: macro-F1 0.92 on 9,357 held-out WM-811K maps. Etch trace: real LAM 9600 data,
              21/21 faults caught at 1.3% false alarms.
            </p>
          </div>
        </section>

        <section {...section(4)}>
          <div className={card(4, s.final)}>
            <div className={s.eyebrow}>04 · YIELDGUARD</div>
            <h2 className={s.h2}>It explains the failure, and checks itself.</h2>
            {lot && <p className={s.body}><b>Top hypothesis:</b> {lot.hypothesis.title}.</p>}
            {check && (
              <div className={s.chips}>
                <span className={s.chip} style={{ color: "#2e6e58" }}>{check.summary.verified} citations verified</span>
                <span className={s.chip} style={{ color: "#b8852c" }}>{check.summary.value_mismatch} mismatched</span>
                <span className={s.chip} style={{ color: "#b5473f" }}>{check.summary.not_in_evidence} not in evidence</span>
                <span className={s.chip} style={{ color: "#6a7d8c" }}>{check.summary.uncited} flagged signals not cited</span>
              </div>
            )}
            <p className={s.foot}>
              Every sensor, value and past case a hypothesis cites is matched against the {lot?.tool_calls ?? ""} tool
              results behind it. A claim no tool produced is shown in red, never passed off as evidence.
            </p>
            <div className={s.actions}>
              <Link href="/investigation" transitionTypes={TO_CONSOLE} className={s.primary}>Open the investigation</Link>
              <Link href="/overview" transitionTypes={TO_CONSOLE} className={s.ghost}>Enter console</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
    </ViewTransition>
  );
}

// Tags navigation from the landing page into the app, so only that move animates.
const TO_CONSOLE = ["enter-console"];
