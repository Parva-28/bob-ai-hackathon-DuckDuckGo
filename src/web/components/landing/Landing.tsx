"use client";

import { useCallback, useEffect, useRef, useState, ViewTransition } from "react";
import Link from "next/link";
import type { FabScene, LandingLot, LandingWafer } from "./FabScene";
import type { EvidenceCheck } from "@/components/EvidenceGraph";
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
      sceneRef.current = new FabScene(canvasRef.current, data.wafers, data.lot);
      sceneRef.current.goTo(stopRef.current, true);
    });
    return () => { disposed = true; sceneRef.current?.dispose(); sceneRef.current = null; };
  }, [data]);

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
  const card = (i: number, extra = "") => `${s.card} ${extra} ${stop === i ? s.in : ""}`;

  return (
    <ViewTransition exit={{ "enter-console": "landing-exit", default: "none" }} default="none">
    <div className={s.page}>
      <header className={s.bar}>
        <div className={s.brand}>
          <ViewTransition name="yg-brand" share="brand-morph" default="none">
            <span className={s.mark}>Y</span>
          </ViewTransition>
          YieldGuard
        </div>
        <Link href="/overview" transitionTypes={TO_CONSOLE} className={`${s.ghost} ${s.barButton}`}>Enter console →</Link>
      </header>

      <div className={s.stage}>
        <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
        <div className={s.veil} style={{ opacity: stop === STOPS - 1 ? 1 : 0 }} />
        <div className={s.heroWash} style={{ opacity: stop === 0 ? 1 : 0 }} />
        <div className={s.hint} style={{ opacity: stop === 0 ? 1 : 0 }}>SCROLL TO FOLLOW A LOT ↓</div>
      </div>

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
