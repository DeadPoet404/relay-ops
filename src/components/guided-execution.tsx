"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useMemo } from "react";
import { Check, Loader2, Clock, Truck, Search, Package, ShieldCheck, AlertTriangle } from "lucide-react";
import { deriveLiveJourney, type LiveJourney } from "@/demo/live-stages";
import type { LabRun } from "@/lab/contracts";
import "./guided-execution.css";

export function GuidedExecutionFlow({ run, compact = false }: { run: LabRun | null; compact?: boolean }) {
  const journey: LiveJourney | null = useMemo(() => (run ? deriveLiveJourney(run) : null), [run]);
  const [reveal, setReveal] = useState(1);
  const [prevKeys, setPrevKeys] = useState<string>("");

  const stageKey = journey ? journey.stages.map(s => `${s.key}:${s.state}`).join("|") : "";

  // reveal animation is intentional guided replay
    useEffect(() => {
    if (!journey) {
      setReveal(1);
      return;
    }
    setReveal(1);
    const total = journey.stages.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i++) {
      timers.push(setTimeout(() => setReveal(i), i * 420));
    }
    return () => timers.forEach(clearTimeout);
  }, [stageKey, journey?.runId]);

  useEffect(() => {
    if (!journey) return;
    const keys = journey.stages.filter(s => s.state !== "pending").map(s => s.key).join("|");
    setPrevKeys((prev) => (prev ? prev : keys));
    const t = setTimeout(() => setPrevKeys(keys), 120);
    return () => clearTimeout(t);
      }, [stageKey]);

  if (!journey) {
    return (
      <div className={`ge-flow ${compact ? "ge-compact" : ""}`} aria-busy="true">
        <div className="ge-header">
          <span className="ge-live-dot"><i /></span>
          <div className="ge-header-text">
            <strong>Relay is preparing your order</strong>
            <span className="ge-sub">You clicked — real DB transaction starting…</span>
          </div>
        </div>
        <div className="ge-progress"><i style={{ width: "12%" }} /></div>
        <div className="ge-stages">
          {[1,2,3,4].map(i => (
            <div key={i} className="ge-stage pending" style={{ animationDelay: `${i*90}ms` }}>
              <div className="ge-track"><div className="ge-dot shimmer" /></div>
              <div className="ge-content">
                <div className="ge-line shimmer" style={{ width: `${60 + i*10}%` }} />
                <div className="ge-line shimmer short" />
              </div>
            </div>
          ))}
        </div>
        <div className="ge-footnote">Click triggers real work — not just UI. Watch the stages light up.</div>
      </div>
    );
  }

  const visibleStages = journey.stages.slice(0, reveal);

  return (
    <div className={`ge-flow ${compact ? "ge-compact" : ""} ${journey.isComplete ? "ge-done" : "ge-live"}`}>
      <div className="ge-header">
        <span className={`ge-live-dot ${journey.isComplete ? "done" : "live"}`}><i /></span>
        <div className="ge-header-text">
          <strong>
            {journey.isComplete ? (journey.needsReview ? "Needs review — intentional" : "Order confirmed — no repeat submission") : "Relay is working on your order"}
          </strong>
          <span className="ge-sub">
            {journey.isPaced ? `Real pacing · ${journey.orderNumber} · live` : `${journey.orderNumber} · live`}
            {journey.stages.find(s => s.state === "active") ? ` · ${journey.stages.find(s => s.state === "active")?.title} — ${journey.stages.find(s => s.state === "active")?.detail}` : ` · ${visibleStages.length}/${journey.stages.length} stages`}
          </span>
        </div>
        <span className={`ge-pill ${journey.isComplete ? (journey.needsReview ? "review" : "done") : "running"}`}>
          {journey.isComplete ? (journey.needsReview ? "Review" : "Done") : `${journey.progress}%`}
        </span>
      </div>
      <div className="ge-progress" aria-hidden>
        <i style={{ width: `${journey.progress}%` }} className={journey.needsReview ? "review" : ""} />
      </div>

      <div className="ge-stages">
        {visibleStages.map((st, idx) => {
          const isNew = prevKeys ? !prevKeys.includes(st.key) && st.state !== "pending" : idx === visibleStages.length - 1;
          return (
            <div
              key={st.key}
              className={`ge-stage ${st.state} ${isNew ? "ge-enter" : ""}`}
              style={{ animationDelay: `${idx * 90}ms` }}
            >
              <div className="ge-track">
                <div className={`ge-dot ${st.state}`}>
                  {st.state === "done" ? <Check size={12} strokeWidth={3} /> : st.state === "active" ? <Loader2 size={12} className="spin" /> : st.state === "error" ? <AlertTriangle size={12} /> : st.key === "recorded" ? <Package size={12} /> : st.key === "submission" ? <Truck size={12} /> : st.key === "checking" ? <Search size={12} /> : <Clock size={11} />}
                </div>
                {idx < visibleStages.length - 1 && <div className={`ge-connector ${st.state === "done" ? "done" : st.state === "active" ? "active" : ""}`} />}
              </div>
              <div className="ge-content">
                <strong>{st.title}{st.at ? <time>{st.at}</time> : null}</strong>
                <small className={st.state === "active" ? "typing" : ""}>{st.detail}</small>
                {st.state === "active" && (
                  <span className="ge-typing"><i /><i /><i /></span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {run && run.events.length > 0 && !compact && reveal >= 3 && (
        <div className="ge-log">
          <div className="ge-log-header">
            <ShieldCheck size={12} /> System activity · {run.events.length} events · real DB + worker · you triggered this
          </div>
          <div className="ge-log-items">
            {run.events.slice(-4).map((ev, i) => (
              <div key={ev.id} className="ge-log-item" style={{ animationDelay: `${i*80}ms` }}>
                <time>{ev.time}</time>
                <strong>{ev.title}</strong>
                <span>{ev.description.slice(0, 90)}{ev.description.length > 90 ? "…" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ge-footnote">
        {journey.isPaced ? "6s queue via startAfter + 2s handoff after durable claim. You clicked → system working." : "Live polling every 2.5s. No fake progress."} {journey.isComplete ? (journey.needsReview ? "Intentionally needs review." : "Ack ≠ packing/shipment.") : "Feel the real delay — not a toy."}
      </div>
    </div>
  );
}
