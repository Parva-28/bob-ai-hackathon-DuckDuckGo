"use client";

// Live fab feed: recorded tool data replayed as a stream (GET /api/stream/fab,
// src/api/stream.py) and scored as it arrives. Nothing here is a live fab
// connection, and the page says so: ETCH-07 is a LAM 9600 etcher's recorded
// traces, the ion-mill bay is the PHM 2018 tools' logs. Samples go straight
// into canvas ring buffers; React state holds only the slow-moving parts.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, Bot, Pause, Play, Radio } from "lucide-react";
import AppShell from "@/components/AppShell";
import StripChart, { Ring } from "@/components/StripChart";
import { STATUS_STYLE } from "@/components/EvidenceGraph";
import s from "./live.module.css";

const ETCH_VARS = ["RF Pwr", "RF Load", "Pressure", "TCP Top Pwr", "BCl3 Flow", "Cl2 Flow"];
const MILL_TOOLS = ["01_M02", "02_M02", "03_M01", "04_M01", "06_M01"];
const SPEEDS = [10, 30, 90];
const MILL_RATIO = 40;            // matches stream.py
const CHIPS = 30, LOG = 60;

type Verdict = "clean" | "caught" | "missed" | "false_alarm";
type Wafer = { seq: number; id: string; index: number; score: number | null; alarm: boolean; recorded_fault: string | null; verdict: Verdict };
type TriageResult = {
  wafer: string; alarm_on: [string, number][]; no_precedent: boolean; reasoning_mode: string; tool_calls: string[];
  hypotheses: { title: string; confidence: number; evidence_check: Record<"verified" | "value_mismatch" | "not_in_evidence" | "uncited", number> | null }[];
  prior_incidents: { case_id: string; root_cause: string }[];
  took_s?: number; error?: string;
};
type Triage = { wafer: string; fault: string | null; startedAt: number; result?: TriageResult };
type LogLine = { seq: number; at: string; tone: string; text: string };

const VERDICT: Record<Verdict, { cls: string; glyph: string; label: string }> = {
  clean: { cls: s.clean, glyph: "", label: "Clean, passed" },
  caught: { cls: s.caught, glyph: "✓", label: "Fault caught" },
  false_alarm: { cls: s.falseAlarm, glyph: "!", label: "False alarm" },
  missed: { cls: s.missed, glyph: "✗", label: "Fault missed" },
};

const shortMode = (m: string) =>
  /below/i.test(m) ? "pressure low" : /high/i.test(m) ? "pressure high" : /leak/i.test(m) ? "leak" : m.slice(0, 18);
const clock = () => new Date().toLocaleTimeString([], { hour12: false });
const fmtZ = (z: number) => `${z > 0 ? "+" : ""}${z.toFixed(1)}σ`;

export default function LivePage() {
  const [speed, setSpeed] = useState(30);
  const [paused, setPaused] = useState(false);
  const [conn, setConn] = useState<"connecting" | "live" | "error">("connecting");
  const [retry, setRetry] = useState(0);

  const [rings] = useState(() => ({
    etch: Object.fromEntries(ETCH_VARS.map((v) => [v, new Ring(600)])) as Record<string, Ring>,
    mill: Object.fromEntries(MILL_TOOLS.map((t) => [t, new Ring(240)])) as Record<string, Ring>,
  }));
  const [alarmed] = useState(() => new Set<string>());
  // Where to pick up after a pause or a speed change: the next wafer and the mill clock.
  const resume = useRef<{ wafer: number | null; mill: number }>({ wafer: null, mill: 0 });
  const pendingMark = useRef<Record<string, string>>({});
  const faultOf = useRef<Record<string, string | null>>({});
  const valuesRef = useRef(0);
  const seq = useRef(0);             // stable keys for chips and log lines
  // Fast-changing readouts live in refs and reach the screen four times a second,
  // so ten events a second don't re-render the page ten times.
  const curRef = useRef<{ id: string; step: number; values: number[] } | null>(null);
  const millRef = useRef<Record<string, { p: number; f: number; faults: number; last?: string }>>({});
  const dirty = useRef(false);

  const [current, setCurrent] = useState<{ id: string; step: number; values: number[] } | null>(null);
  const [chips, setChips] = useState<Wafer[]>([]);
  const [counts, setCounts] = useState({ wafers: 0, alarms: 0, caught: 0, missed: 0, false_alarm: 0, clean: 0 });
  const [values, setValues] = useState({ total: 0, rate: 0 });
  const [mill, setMill] = useState<Record<string, { p: number; f: number; faults: number; last?: string }>>({});
  const [triages, setTriages] = useState<Triage[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);

  const say = (tone: string, text: string) => setLog((l) => [{ seq: ++seq.current, at: clock(), tone, text }, ...l].slice(0, LOG));

  // readings per second, sampled once a second
  useEffect(() => {
    let prev = valuesRef.current;
    const id = setInterval(() => {
      const now = valuesRef.current;
      setValues({ total: now, rate: now - prev });
      prev = now;
    }, 1000);
    const flush = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setCurrent(curRef.current);
      setMill({ ...millRef.current });
    }, 250);
    return () => { clearInterval(id); clearInterval(flush); };
  }, []);

  useEffect(() => {
    if (paused) return;
    const r = resume.current;
    const es = new EventSource(
      `/api/stream/fab?speed=${speed}&start=${r.wafer ?? "auto"}&mill_t=${Math.round(r.mill)}`);
    const on = <T,>(ev: string, fn: (d: T) => void) =>
      es.addEventListener(ev, (e) => fn(JSON.parse((e as MessageEvent).data) as T));

    es.onopen = () => setConn("live");
    es.onerror = () => {            // reconnect ourselves, from where we got to
      es.close();
      setConn("error");
      setTimeout(() => setRetry((n) => n + 1), 2000);
    };

    on("etch.samples", ({ rows }: { rows: (string | number)[][] }) => {
      for (const row of rows) {
        const id = row[0] as string;
        ETCH_VARS.forEach((v, i) => rings.etch[v].push(row[2 + i] as number, id));
      }
      valuesRef.current += rows.length * ETCH_VARS.length;
      const last = rows[rows.length - 1];
      if (last) curRef.current = { id: last[0] as string, step: last[1] as number, values: last.slice(2) as number[] };
      dirty.current = true;
    });

    on("etch.wafer", (w: Wafer) => {
      if (w.alarm) alarmed.add(w.id);
      faultOf.current[w.id] = w.recorded_fault;
      resume.current.wafer = w.index + 1;
      setChips((c) => [...c, { ...w, seq: ++seq.current }].slice(-CHIPS));
      setCounts((c) => ({ ...c, wafers: c.wafers + 1, alarms: c.alarms + (w.alarm ? 1 : 0), [w.verdict]: c[w.verdict] + 1 }));
      const score = w.score == null ? "—" : w.score.toFixed(2);
      if (w.verdict === "caught") say("#b5473f", `ETCH-07 ${w.id} alarmed (score ${score}). Recorded fault: ${w.recorded_fault}. Caught.`);
      if (w.verdict === "false_alarm") say("#b5473f", `ETCH-07 ${w.id} alarmed (score ${score}) with no recorded fault. False alarm.`);
      if (w.verdict === "missed") say("#b8852c", `ETCH-07 ${w.id} passed (score ${score}) but the record shows ${w.recorded_fault}. Missed.`);
    });

    on("triage.start", ({ wafer }: { wafer: string }) => {
      setTriages((t) => [{ wafer, fault: faultOf.current[wafer] ?? null, startedAt: performance.now() }, ...t].slice(0, 6));
      say("#274c6b", `YieldGuard opened an investigation on ${wafer} by itself.`);
    });

    on("triage", (res: TriageResult & { wafer?: string }) => {
      setTriages((t) => {
        const i = res.wafer ? t.findIndex((x) => x.wafer === res.wafer) : t.findIndex((x) => !x.result);
        if (i < 0) return t;
        const next = [...t];
        next[i] = { ...next[i], result: res };
        return next;
      });
      say(res.error ? "#b8852c" : "#2e6e58",
          res.error ? `Auto-triage failed: ${res.error}` : `Auto-triage on ${res.wafer} finished: ${res.hypotheses?.[0]?.title ?? "no hypothesis"}.`);
    });

    on("mill.windows", ({ rows, clock: millClock }: { rows: [string, number, number, number][]; clock: number }) => {
      const latest: Record<string, { p: number; f: number }> = {};
      for (const [tool, , p, f] of rows) {
        rings.mill[tool]?.push(p, null, pendingMark.current[tool] ?? null);
        delete pendingMark.current[tool];
        latest[tool] = { p, f };
      }
      valuesRef.current += rows.length * 2;
      resume.current.mill = millClock;
      const m = millRef.current;
      for (const [tool, v] of Object.entries(latest)) m[tool] = { faults: m[tool]?.faults ?? 0, last: m[tool]?.last, ...v };
      dirty.current = true;
    });

    on("mill.fault", ({ tool, mode }: { tool: string; mode: string }) => {
      pendingMark.current[tool] = shortMode(mode);
      const m = millRef.current;
      m[tool] = { p: m[tool]?.p ?? NaN, f: m[tool]?.f ?? NaN, faults: (m[tool]?.faults ?? 0) + 1, last: mode };
      dirty.current = true;
      say("#8a98a4", `Ion mill ${tool} logged a fault: ${mode}.`);
    });

    on("loop", ({ source }: { source: string }) =>
      say("#8a98a4", `${source === "etch" ? "ETCH-07" : "Ion-mill"} replay reached the end of its recording and started again.`));

    return () => es.close();
  }, [speed, paused, retry, rings, alarmed]);

  const faults = counts.caught + counts.missed;
  const live = !paused && conn === "live";

  return (
    <AppShell>
      <div className="page-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow accent-eyebrow">
              <span className={live ? s.liveDot : conn === "error" && !paused ? s.warnDot : s.idleDot} />
              {paused ? "PAUSED" : conn === "live" ? "STREAMING" : conn === "error" ? "RECONNECTING" : "CONNECTING"}
            </div>
            <h1>Live <span>fab feed</span></h1>
            <p>Tool sensor data streams in, YieldGuard scores every wafer as its trace ends, and opens an investigation itself when one alarms.</p>
          </div>
          <div className="heading-actions">
            <div className={s.speeds} role="group" aria-label="Replay speed">
              {SPEEDS.map((x) => (
                <button key={x} className={x === speed ? s.speedOn : ""} onClick={() => setSpeed(x)}
                        aria-pressed={x === speed}>{x}×</button>
              ))}
            </div>
            <button className="button primary" onClick={() => { setPaused((p) => !p); setConn("connecting"); }}>
              {paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
            </button>
          </div>
        </div>

        <div className={s.replay}>
          <span className={s.replayTag}>REPLAY</span>
          <span>Recorded data, not a live fab connection.</span>
          <span>ETCH-07: LAM 9600 metal etcher (Wise et al. 1999) at {speed}×</span>
          <span>·</span>
          <span>Ion-mill bay: PHM 2018 tool logs at {speed * MILL_RATIO}×</span>
        </div>

        <div className={`metrics-grid ${s.metrics}`}>
          <Metric label="Readings streamed" value={values.total.toLocaleString()} tone="neutral"
                  detail={`${values.rate.toLocaleString()} / s · 6 etch + 2 ion-mill channels`} />
          <Metric label="Wafers scored" value={`${counts.wafers}`} tone="neutral"
                  detail={`ETCH-07 · ${counts.alarms} alarm${counts.alarms === 1 ? "" : "s"}`} />
          <Metric label="Recorded faults caught" value={faults ? `${counts.caught}/${faults}` : "—"}
                  tone={counts.missed ? "warning" : "good"}
                  detail={counts.missed ? `${counts.missed} missed by the detector` : "every fault so far alarmed"} />
          <Metric label="False alarms" value={`${counts.false_alarm}`} tone={counts.false_alarm ? "danger" : "good"}
                  detail={`${counts.clean} clean wafers passed`} />
        </div>

        <div className={s.grid}>
          <div className={s.column}>
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <span className="section-icon"><Activity size={14} /></span>
                  <h2>ETCH-07 · metal etch chamber</h2>
                  <span className="model-chip">LAM 9600 detector</span>
                </div>
                <div className={s.now}>
                  <span>wafer <b>{current?.id ?? "—"}</b></span>
                  <span>step <b>{current?.step ?? "—"}</b></span>
                </div>
              </div>
              <div className={s.charts}>
                {ETCH_VARS.map((v, i) => (
                  <div key={v}>
                    <div className={s.chartHead}>
                      <span>{v.toUpperCase()}</span>
                      <b>{current?.values[i] ?? "—"}</b>
                    </div>
                    <div className={s.chartBox}><StripChart ring={rings.etch[v]} alarmed={alarmed} /></div>
                  </div>
                ))}
              </div>

              <div className={s.timelineHead}>
                <span>LAST {CHIPS} WAFERS · RECORDED LABEL SHOWN AFTER SCORING</span>
                <span>{counts.wafers ? `${counts.wafers} scored` : "waiting for the first wafer to finish"}</span>
              </div>
              <div className={s.chips}>
                {chips.map((w) => {
                  const v = VERDICT[w.verdict];
                  return (
                    <span key={w.seq} className={`${s.chip} ${v.cls}`}
                          title={`${w.id} · score ${w.score?.toFixed(2) ?? "—"} · ${w.recorded_fault ? `recorded fault ${w.recorded_fault}` : "no recorded fault"} · ${v.label}`}>
                      {v.glyph}
                    </span>
                  );
                })}
              </div>
              <div className={s.legend}>
                {(Object.keys(VERDICT) as Verdict[]).map((k) => (
                  <span key={k}><i className={VERDICT[k].cls} />{VERDICT[k].label}</span>
                ))}
              </div>
              <p className={s.note}>
                Red trace segments are wafers the detector alarmed on. The 21 fault wafers were never in the
                detector&apos;s training; the normal wafers formed its baseline, so clean and false-alarm counts are in-sample.
              </p>
            </section>

            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <span className="section-icon"><Radio size={14} /></span>
                  <h2>Ion-mill bay · Flowcool pressure</h2>
                </div>
                <span className="model-chip">faults logged by the tools</span>
              </div>
              {MILL_TOOLS.map((t) => {
                const m = mill[t];
                return (
                  <div key={t} className={s.millRow}>
                    <div className={s.millTool}>
                      {t}
                      <span>{m && Number.isFinite(m.p) ? `p ${m.p.toFixed(2)} · flow ${m.f.toFixed(2)}` : "—"}</span>
                    </div>
                    <div className={s.chartBox}><StripChart ring={rings.mill[t]} height={42} color="#6a8da9" /></div>
                    <div className={`${s.millFaults} ${m?.faults ? s.millFaultsOn : ""}`} title={m?.last}>
                      {m?.faults ? `${m.faults} fault${m.faults === 1 ? "" : "s"}` : "no faults"}
                    </div>
                  </div>
                );
              })}
              <p className={s.note}>
                Standardised units from the PHM 2018 challenge. Fault markers are the tools&apos; own records:
                YieldGuard does not predict these (our ion-mill model did not generalise across tools).
              </p>
            </section>
          </div>

          <div className={s.column}>
            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <span className="section-icon"><Bot size={14} /></span>
                  <h2>Auto-triage</h2>
                </div>
                <span className="model-chip">at most one every 20 s</span>
              </div>
              {triages.length === 0 && (
                <div className={s.empty}>
                  When the detector alarms on a wafer, YieldGuard runs the same tools an engineer would
                  (telemetry, past cases, root-cause ranking) and posts what it found here.
                </div>
              )}
              {triages.map((t) => <TriageCard key={`${t.wafer}-${t.startedAt}`} t={t} />)}
            </section>

            <section className="panel">
              <div className="section-header">
                <div className="section-title-wrap">
                  <span className="section-icon"><Activity size={14} /></span>
                  <h2>Event log</h2>
                </div>
              </div>
              {log.length === 0 ? <div className={s.empty}>Alarms, missed faults and tool-logged faults appear here.</div> : (
                <ul className={s.log}>
                  {log.map((l) => (
                    <li key={l.seq}>
                      <time>{l.at}</time><i style={{ background: l.tone }} /><span>{l.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="metric-top"><span>{label}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function TriageCard({ t }: { t: Triage }) {
  const r = t.result;
  const top = r?.hypotheses?.[0];
  return (
    <div className={s.triage}>
      <div className={s.triageHead}>
        <b>Investigation · {t.wafer}</b>
        {!r ? <span className={s.spinner} aria-label="running" />
          : <span className={`status-pill ${r.error ? "pill-high" : "pill-nominal"}`}>
              <span className="status-dot" />{r.error ? "failed" : r.took_s == null ? "done" : `done in ${r.took_s < 0.1 ? "<0.1" : r.took_s.toFixed(1)} s`}
            </span>}
      </div>

      <div className={s.kicker}>DETECTOR FLAGGED</div>
      <div className={s.flags}>
        {r?.alarm_on?.length ? r.alarm_on.map(([name, z]) => <span key={name} className={s.flag}>{name} {fmtZ(z)}</span>)
          : <span className={s.note} style={{ margin: 0 }}>{r ? "—" : "running the tools…"}</span>}
      </div>
      {t.fault && <div className={s.note} style={{ marginTop: 6 }}>Recorded fault on this wafer: <b>{t.fault}</b></div>}

      {r?.error && <div className={s.mock}>{r.error}</div>}
      {top && (
        <>
          <div className={s.kicker}>TOP HYPOTHESIS</div>
          <div className={s.hyp}>{top.title}<span>{Math.round(top.confidence * 100)}%</span></div>
          {top.evidence_check && (
            <div className={s.checks}>
              {(["verified", "value_mismatch", "not_in_evidence", "uncited"] as const).map((k) => (
                <span key={k}><i style={{ background: STATUS_STYLE[k].color }} />{top.evidence_check![k]} {STATUS_STYLE[k].label.toLowerCase()}</span>
              ))}
            </div>
          )}
          {r!.reasoning_mode === "mock" && (
            <div className={s.mock}>
              Reasoning is in mock mode: this hypothesis is a canned answer, not reasoned from the evidence above.
              With a live LLM it would cite those signals.
            </div>
          )}
          {r!.no_precedent && <div className={s.note}>No past case is close enough to cite as precedent.</div>}
        </>
      )}

      {!!r?.prior_incidents?.length && (
        <>
          <div className={s.kicker}>PAST INCIDENTS ON ETCH-07 (CONTEXT, NOT EVIDENCE)</div>
          <ul className={s.prior}>
            {r.prior_incidents.slice(0, 3).map((p) => <li key={p.case_id}><b>{p.case_id}</b>{p.root_cause}</li>)}
          </ul>
        </>
      )}

      {r && !r.error && (
        <>
          <div className={s.calls}>{r.tool_calls.join(" → ")}</div>
          <div className={s.triageFoot}>
            <span className="model-chip">reasoning: {r.reasoning_mode === "mock" ? "mock (canned)" : r.reasoning_mode}</span>
            <Link className="mini-link" href="/investigation?lot=L-4471">
              Open ETCH-07 lot L-4471 <ArrowRight size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
