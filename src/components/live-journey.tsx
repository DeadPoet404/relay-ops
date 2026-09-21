"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Loader2, AlertTriangle, ChevronDown, ChevronUp, Package, Search, Truck, Clock } from "lucide-react";
import { deriveLiveJourney, pendingJourney, type LiveJourney } from "@/demo/live-stages";
import type { LabRun, Scenario } from "@/lab/contracts";
import { scenarioLabels } from "@/lab/contracts";
import "./live-journey.css";

function safeJsonParse(s: string | null): { requestId?: string; scenario?: string } | null {
  if (!s) return null;
  try { return JSON.parse(s) as { requestId?: string; scenario?: string }; } catch { return null; }
}

function isUuid(v: string | null): v is string {
  return Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
}

export function LiveJourneyWidget() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingScenario, setPendingScenario] = useState<Scenario | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshIds = useCallback(() => {
    try {
      const pathRunMatch = pathname?.match(/\/store\/orders\/([0-9a-f-]{36})|\/runs\/([0-9a-f-]{36})/i);
      const pathId = pathRunMatch ? (pathRunMatch[1] || pathRunMatch[2]) : null;
      const last = localStorage.getItem("northline.lastOrder");
      const pendingRaw = sessionStorage.getItem("northline.checkout");
      const pendingParsed = safeJsonParse(pendingRaw);
      const pId = pendingParsed?.requestId && isUuid(pendingParsed.requestId) ? pendingParsed.requestId : null;
      const scenRaw = localStorage.getItem("northline.nextScenario") || pendingParsed?.scenario || null;
      const scen = scenRaw && (scenRaw in scenarioLabels) ? (scenRaw as Scenario) : null;

      if (pathId && isUuid(pathId)) setRunId(pathId);
      else if (isUuid(last)) setRunId(last);
      else setRunId(null);

      setPendingId(pId);
      setPendingScenario(scen);
    } catch {
      // storage unavailable
    }
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    // initial read from browser storage is external state
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshIds();
    const iv = setInterval(() => {
      refreshIds();
      setTick((t) => t + 1);
    }, 1000);
    window.addEventListener("storage", refreshIds);
    return () => {
      clearInterval(iv);
      window.removeEventListener("storage", refreshIds);
    };
  }, [refreshIds]);

  // fetch run - avoid direct setState in effect body for empty case via callback
  useEffect(() => {
    if (!runId) {
      const t = setTimeout(() => setRun(null), 0);
      return () => clearTimeout(t);
    }
    let active = true;
    const ctrl = new AbortController();
    async function load() {
      try {
        if (document.hidden) return;
        const res = await fetch(`/api/lab/runs/${runId}`, {
          cache: "no-store",
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)]),
        });
        if (!res.ok) {
          if (res.status === 403) {
            const sRes = await fetch(`/api/store/orders/${runId}`, { cache: "no-store", signal: ctrl.signal });
            if (sRes.ok) {
              const { order } = (await sRes.json()) as { order: { number: string; status: string; createdAt?: string } };
              if (order && active) {
                const synth: LabRun = {
                  id: runId!,
                  orderNumber: order.number,
                  scenario: pendingScenario || "accepted_timeout",
                  status: order.status === "acknowledged" ? "accepted" : order.status === "review" ? "rejected" : order.status === "confirming" ? "running" : "queued",
                  createdAt: order.createdAt || new Date().toISOString(),
                  reference: `relay-lab-${runId}`,
                  warehouseReference: null,
                  attemptCount: order.status === "placed" ? 0 : 1,
                  lookupCount: 0,
                  nextActionAt: null,
                  pendingAction: null,
                  pendingActionId: null,
                  reviewReason: order.status === "review" ? "Review" : null,
                  events: [],
                  demoPacing: true,
                  submissionNotBefore: null,
                };
                setRun(synth);
                setError(null);
                return;
              }
            }
          }
          throw new Error(res.status === 404 ? "Order not found" : "Status unavailable");
        }
        const data = (await res.json()) as { run: LabRun };
        if (active && data.run) {
          setRun(data.run);
          setError(null);
        }
      } catch (e) {
        if (active) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "Unavailable");
        }
      } finally {
        if (active && timerRef.current) clearTimeout(timerRef.current);
        if (active) {
          timerRef.current = setTimeout(() => void load(), 2500);
        }
      }
    }
    void load();
    return () => {
      active = false;
      ctrl.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId, pendingScenario]);

  // tick is used only to force re-derive of pacing countdown inside deriveLiveJourney (which reads Date.now())
  void tick;

  if (!ready || dismissed) return null;

  let journey: LiveJourney | null = null;
  if (run) {
    journey = deriveLiveJourney(run);
  } else if (pendingId) {
    journey = pendingJourney(pendingId, pendingScenario ? scenarioLabels[pendingScenario] : undefined);
  } else {
    return null;
  }

  const activeStage = journey.stages.find((s) => s.state === "active") || journey.stages.find((s) => s.state === "pending") || journey.stages[journey.stages.length - 1];
  const isReview = journey.needsReview;

  return (
    <div className={`live-journey ${collapsed ? "collapsed" : ""}`} role="status" aria-live="polite" aria-label={`Order ${journey.orderNumber} progress`}>
      <div className="live-journey-header">
        <div className="live-journey-title">
          <strong>{journey.orderNumber} · {journey.finalLabel}</strong>
          <span>{journey.isPaced ? "Local pacing · real delays · no fake progress" : "Live order journey"} {error ? `· ${error}` : ""}</span>
        </div>
        <span className={`live-journey-pill ${journey.isComplete ? (isReview ? "review" : "done") : journey.stages.some((s) => s.state === "active") ? "running" : "pending"}`}>
          {journey.isComplete ? (isReview ? "Review" : "Done") : activeStage.state === "active" ? "Live" : "Queued"}
        </span>
        <button className="live-journey-toggle" aria-label={collapsed ? "Expand order journey" : "Collapse order journey"} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <div className="live-journey-progress" aria-hidden>
        <i style={{ width: `${journey.progress}%` }} />
      </div>

      {collapsed ? (
        <div className="live-journey-mini">
          <div className={`live-journey-dot ${activeStage.state}`}>
            {activeStage.state === "done" ? <Check size={12} /> : activeStage.state === "active" ? <Loader2 size={12} className="animate-spin" /> : activeStage.state === "error" ? <AlertTriangle size={12} /> : <Clock size={11} />}
          </div>
          <div>
            <strong>{activeStage.title}</strong>
            <span>{activeStage.detail}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="live-journey-body">
            <div className="live-journey-stages">
              {journey.stages.map((st) => (
                <div key={st.key} className={`live-journey-stage ${st.state}`}>
                  <div className={`live-journey-dot ${st.state}`} aria-hidden>
                    {st.state === "done" ? <Check size={12} strokeWidth={2.5} /> : st.state === "active" ? <Loader2 size={12} className="animate-spin" /> : st.state === "error" ? <AlertTriangle size={12} /> : st.key === "recorded" ? <Package size={12} /> : st.key === "submission" ? <Truck size={12} /> : st.key === "checking" ? <Search size={12} /> : <Clock size={11} />}
                  </div>
                  <div className="live-journey-stage-content">
                    <strong>{st.title}{st.at ? <time>{st.at}</time> : null}</strong>
                    <small>{st.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="live-journey-footer">
            <Link className="primary" href={`/runs/${journey.runId}`}>Evidence →</Link>
            <Link className="secondary" href={`/store/orders/${journey.runId}`}>Order status →</Link>
          </div>
          <div className="live-journey-note">
            Demo pacing: 6s queue + 2s first handoff after durable claim. Recovery budgets unchanged. {isReview ? "This order intentionally needs review — no auto-correction." : "Warehouse ack ≠ packing/shipment."} <button onClick={() => setDismissed(true)} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: 0, padding: 0, fontSize: "9px", color: "#7b8190" }}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}
