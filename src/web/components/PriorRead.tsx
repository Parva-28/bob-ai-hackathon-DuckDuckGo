"use client";

/**
 * PriorRead — the cognitive forcing function.
 *
 * Why this exists rather than "show the AI answer with a good explanation":
 * Bansal et al. (CHI 2021) found explanations raised the rate at which people
 * accepted AI recommendations *regardless of whether they were correct*, without
 * improving team performance. Bucinca et al. found explanations do not reduce
 * over-reliance and may increase it — only cognitive forcing functions did.
 *
 * So the ordering is the intervention. The engineer commits their own hypothesis,
 * it is persisted, and only then is the model's ranking fetched.
 *
 * Note `children` is a render prop, not a hidden <div>. Until the read is
 * committed the ranking is not fetched and not in the DOM, so it cannot be
 * revealed with devtools or read by a screen reader. A gate you can peek behind
 * is not a gate.
 */

import { ReactNode, useState } from "react";
import { Lock, Check, AlertTriangle } from "lucide-react";
import { invalidate } from "@/lib/api";

const CATEGORIES = ["equipment", "material", "handling",
                    "software", "process", "measurement"] as const;

type Prior = { category: string; hypothesis: string; confidence: number };

/**
 * Controlled: the committed read lives in the PAGE, because the page needs it to
 * decide whether to fetch the ranking at all. Holding a second copy here meant a
 * remount silently reset the gate while the page still thought it was committed —
 * the form reappeared and the ranking was fetched anyway. One source of truth.
 */
export function PriorReadGate({ lotId, committed, onCommit, children }: {
  lotId: string | null;
  committed: Prior | null;
  onCommit: (p: Prior) => void;
  children: (prior: Prior) => ReactNode;
}) {
  const [hypothesis, setHypothesis] = useState("");
  const [category, setCategory] = useState<string>("");
  const [confidence, setConfidence] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!lotId) return null;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/prior-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id: lotId, hypothesis, category, confidence }),
      });
      const j = await res.json();
      if (j.status !== "ok") throw new Error(j.error ?? "could not record");
      invalidate("/api/prior-read");
      onCommit({ category, hypothesis, confidence });
    } catch (e: any) {
      setErr(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (committed) {
    return (
      <>
        <div className="prior-committed">
          <Check size={14} />
          <div>
            <b>Your read, recorded before the model&rsquo;s:</b>
            <div className="prior-detail">
              {committed.category} · {committed.confidence}% · {committed.hypothesis}
            </div>
          </div>
        </div>
        {children(committed)}
      </>
    );
  }

  const ready = hypothesis.trim().length >= 10 && !!category;

  return (
    <div className="prior-gate">
      <div className="prior-gate-head">
        <Lock size={15} />
        <div>
          <b>Record your assessment first</b>
          <div className="prior-detail">
            The model&rsquo;s ranking for <code>{lotId}</code> has not been requested yet and
            is not on this page. Commit your own read and it will be.
          </div>
        </div>
      </div>

      <label className="prior-label" htmlFor="prior-hyp">
        What do you think caused this?
      </label>
      <textarea id="prior-hyp" className="prior-input" rows={3}
                placeholder="e.g. slurry flow dropped after the pad change, thinning the centre"
                value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />

      <label className="prior-label" htmlFor="prior-cat">Category</label>
      <div id="prior-cat" className="prior-chips">
        {CATEGORIES.map((c) => (
          <button key={c} type="button"
                  className={`button ${category === c ? "primary" : "ghost"}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <label className="prior-label" htmlFor="prior-conf">
        How confident are you? <b>{confidence}%</b>
      </label>
      <input id="prior-conf" type="range" min={0} max={100} step={5} value={confidence}
             onChange={(e) => setConfidence(Number(e.target.value))}
             className="prior-range" />

      {err && (
        <div className="prior-detail" role="alert" style={{ color: "#b3403a" }}>
          <AlertTriangle size={12} /> {err}
        </div>
      )}

      <button className="button primary" disabled={!ready || busy} onClick={submit}>
        {busy ? "Recording…" : "Commit my read and show the model"}
      </button>
      {!ready && (
        <div className="prior-detail">
          Pick a category and write at least a sentence. Skipping this is the
          behaviour the step exists to prevent.
        </div>
      )}
    </div>
  );
}

/** Verdict capture. A typed rationale is required — no one-click accept. */
export function Disposition({ hypothesisId, priorCategory, modelCategory }: {
  hypothesisId?: string; priorCategory?: string; modelCategory?: string;
}) {
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const disagree = priorCategory && modelCategory && priorCategory !== modelCategory;

  const send = async (verdict: "confirmed" | "rejected") => {
    setErr(null);
    const res = await fetch("/api/disposition", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis_id: hypothesisId, verdict, notes }),
    });
    const j = await res.json();
    if (j.status === "ok") setDone(verdict); else setErr(j.error ?? "failed");
  };

  if (!hypothesisId) return null;
  if (done) return <div className="prior-committed"><Check size={14} /> Recorded: {done}</div>;

  return (
    <div className="prior-gate">
      <b>Disposition</b>
      {disagree && (
        <div className="prior-detail" style={{ color: "#8a5a12" }}>
          <AlertTriangle size={12} /> You said <b>{priorCategory}</b>; the model says{" "}
          <b>{modelCategory}</b>. Worth resolving before you disposition this lot.
        </div>
      )}
      <textarea className="prior-input" rows={2} value={notes}
                placeholder="Why? This is written back and shapes future retrieval."
                onChange={(e) => setNotes(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="button primary" disabled={!notes.trim()}
                onClick={() => send("confirmed")}>Confirm</button>
        <button className="button ghost" disabled={!notes.trim()}
                onClick={() => send("rejected")}>Reject</button>
      </div>
      {!notes.trim() && (
        <div className="prior-detail">A rationale is required. No one-click accept.</div>
      )}
      {err && <div className="prior-detail" style={{ color: "#b3403a" }}>{err}</div>}
    </div>
  );
}
