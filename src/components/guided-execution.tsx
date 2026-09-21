"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useMemo, useRef } from "react";
import { Check, Loader2, Clock, Truck, Search, Package, ShieldCheck, AlertTriangle } from "lucide-react";
import { deriveLiveJourney, type LiveJourney } from "@/demo/live-stages";
import type { LabRun } from "@/lab/contracts";
import "./guided-execution.css";

// Calm, fixed pacing - no random jitter that causes glitchy replays
const STAGE_DURATIONS: Record<string, number> = {
  recorded: 420,
  submission: 780,
  checking: 720,
  final: 420,
};

export function GuidedExecutionFlow({ run, compact = false }: { run: LabRun | null; compact?: boolean }) {
  const journey: LiveJourney | null = useMemo(() => (run ? deriveLiveJourney(run) : null), [run]);
  const [reveal, setReveal] = useState(1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastRunIdRef = useRef<string | null>(null);

  const stageKey = journey ? journey.stages.map(s => `${s.key}:${s.state}`).join("|") : "";
  const isLiveActive = journey ? journey.stages.some(s => s.state === "active") && !journey.isComplete : false;

  // Only replay when runId changes, not on every poll - prevents repetitive glitch
  useEffect(() => {
    const runId = journey?.runId ?? null;
    const isNewRun = runId !== lastRunIdRef.current;
    if (isNewRun) {
      lastRunIdRef.current = runId;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setReveal(1);
    }

    if (!journey) {
      return;
    }

    if (isLiveActive) {
      const done = journey.stages.filter(s => s.state === "done").length;
      const activeIdx = journey.stages.findIndex(s => s.state === "active");
      const target = activeIdx >= 0 ? activeIdx + 1 : Math.max(1, done);
      setReveal(target);
      return;
    }

    // Completed replay: only if this is a new run, do staged reveal
    if (!isNewRun) return;

    const total = journey.stages.length;
    let acc = 0;
    for (let i = 2; i <= total; i++) {
      const key = journey.stages[i - 1]?.key ?? `s${i}`;
      const dur = STAGE_DURATIONS[key] ?? 500;
      acc += dur;
      timersRef.current.push(
        setTimeout(() => setReveal(i), acc)
      );
    }
    return () => timersRef.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.runId, isLiveActive, stageKey]);

  if (!journey) {
    return (
      <div className={`ge-flow ${compact ? "ge-compact" : ""}`} aria-busy="true">
        <div className="ge-header">
          <span className="ge-live-dot"><i /></span>
          <div className="ge-header-text">
            <strong>Relay is preparing your order</strong>
            <span className="ge-sub">Real DB transaction starting…</span>
          </div>
        </div>
        <div className="ge-progress"><i style={{ width: "18%" }} /></div>
        <div className="ge-stages">
          {[1,2,3,4].map(i => (
            <div key={i} className="ge-stage pending">
              <div className="ge-track"><div className="ge-dot pending" /></div>
              <div className="ge-content">
                <div className="ge-line" style={{ width: `${58 + i*8}%`, opacity: 0.6 }} />
                <div className="ge-line short" style={{ opacity: 0.4 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="ge-footnote">Click triggers real work — DB commit + 6s queue + 2s handoff.</div>
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
            {journey.orderNumber} · {visibleStages.length}/{journey.stages.length} stages
            {journey.stages.find(s => s.state === "active") ? ` · ${journey.stages.find(s => s.state === "active")?.title}` : ""}
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
        {visibleStages.map((st) => {
          const isActive = st.state === "active";
          return (
            <div
              key={st.key}
              className={`ge-stage ${st.state}`}
            >
              <div className="ge-track">
                <div className={`ge-dot ${st.state}`}>
                  {st.state === "done" ? <Check size={12} strokeWidth={2.5} /> : isActive ? <Loader2 size={12} className="spin" /> : st.state === "error" ? <AlertTriangle size={12} /> : st.key === "recorded" ? <Package size={11} /> : st.key === "submission" ? <Truck size={11} /> : st.key === "checking" ? <Search size={11} /> : <Clock size={10} />}
                </div>
                <div className={`ge-connector ${st.state === "done" ? "done" : isActive ? "active" : ""}`} />
              </div>
              <div className="ge-content">
                <strong>{st.title}{st.at ? <time>{st.at}</time> : null}</strong>
                <small className={isActive ? "typing" : ""}>{st.detail}</small>
                {isActive && (
                  <span className="ge-typing"><i /><i /><i /></span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {run && run.events.length > 0 && !compact && reveal >= 2 && (
        <div className="ge-log">
          <div className="ge-log-header">
            <ShieldCheck size={11} /> System activity · {run.events.length} events
          </div>
          <div className="ge-log-items">
            {run.events.slice(-4).map((ev) => (
              <div key={ev.id} className="ge-log-item">
                <time>{ev.time}</time>
                <strong>{ev.title}</strong>
                <span>{ev.description.slice(0, 88)}{ev.description.length > 88 ? "…" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ge-footnote">
        {journey.isPaced ? "6s queue via startAfter + 2s handoff after durable claim." : "Live polling every 2.5s."} {journey.isComplete ? (journey.needsReview ? "Intentionally needs review." : "Ack ≠ packing/shipment.") : "Real backend work, not a linear loader."}
      </div>
    </div>
  );
}
