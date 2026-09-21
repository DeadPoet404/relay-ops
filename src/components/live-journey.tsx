"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, AlertTriangle, ChevronDown, ChevronUp, Clock, ShoppingBag } from "lucide-react";
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
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [cartActivity, setCartActivity] = useState<string | null>(null);
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

      // Only use path ID when on order/evidence pages, otherwise only lastOrder if not on demo landing
      if (pathId && isUuid(pathId)) setRunId(pathId);
      else if (pathname?.startsWith("/store/orders") || pathname?.startsWith("/runs")) {
        if (isUuid(last)) setRunId(last);
        else setRunId(null);
      } else if (pathname?.startsWith("/demo")) {
        // on demo pages, don't show last completed order — only pending
        setRunId(null);
      } else {
        // store catalog / checkout: show last only if pending exists or we are in checkout
        if (pId && isUuid(last)) setRunId(last);
        else if (pathname === "/store/checkout" && isUuid(last)) setRunId(last);
        else setRunId(null);
      }

      setPendingId(pId);
      setPendingScenario(scen);
    } catch {}
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshIds();
    const iv = setInterval(() => {
      refreshIds();
      setTick((t) => t + 1);
    }, 1000);
    const onStorage = () => refreshIds();
    const onCart = (e: Event) => {
      const custom = e as CustomEvent<{ count?: number }>;
      const count = custom.detail?.count;
      if (typeof count === "number") {
        setCartActivity(count === 0 ? "Bag emptied" : `Bag updated · ${count} item${count === 1 ? "" : "s"}`);
        setTimeout(() => setCartActivity(null), 3000);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("northline:cart-updated" as unknown as string, onCart as EventListener);
    return () => {
      clearInterval(iv);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("northline:cart-updated" as unknown as string, onCart as EventListener);
    };
  }, [refreshIds]);

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
        if (!res.ok) throw new Error("pending");
        const data = (await res.json()) as { run: LabRun };
        if (active && data.run) setRun(data.run);
      } catch {}
      if (active) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void load(), 2500);
      }
    }
    void load();
    return () => {
      active = false;
      ctrl.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId]);

  void tick;

  if (!ready || dismissed) return null;

  // cart activity transient
  if (cartActivity && !pendingId && !run) {
    return (
      <div className="live-journey" role="status" aria-live="polite">
        <div className="live-journey-header">
          <div className="live-journey-title">
            <strong><ShoppingBag size={12} style={{ display: "inline", marginRight: 6 }} />{cartActivity}</strong>
            <span>Local bag · no charge · system will track after checkout</span>
          </div>
          <button className="live-journey-toggle" onClick={() => setCartActivity(null)}><ChevronDown size={14} /></button>
        </div>
        <div className="live-journey-progress"><i style={{ width: "35%" }} /></div>
      </div>
    );
  }

  let journey: LiveJourney | null = null;
  if (run) journey = deriveLiveJourney(run);
  else if (pendingId) journey = pendingJourney(pendingId, pendingScenario ? scenarioLabels[pendingScenario] : undefined);
  else return null;

  const activeStage = journey.stages.find((s) => s.state === "active") || journey.stages.find((s) => s.state === "pending") || journey.stages[journey.stages.length - 1];

  return (
    <div className={`live-journey ${collapsed ? "collapsed" : ""}`} role="status" aria-live="polite" aria-label={`Order ${journey.orderNumber} activity`}>
      <div className="live-journey-header">
        <div className="live-journey-title">
          <strong>{journey.isComplete ? journey.finalLabel : `Working on ${journey.orderNumber}`}</strong>
          <span>{activeStage.title} · {activeStage.detail}</span>
        </div>
        <span className={`live-journey-pill ${journey.isComplete ? (journey.needsReview ? "review" : "done") : "running"}`}>
          {journey.isComplete ? (journey.needsReview ? "Review" : "Done") : "Live"}
        </span>
        <button className="live-journey-toggle" aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed((c) => !c)}>
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
            <div className="live-journey-mini" style={{ padding: 0, marginBottom: 10 }}>
              <span style={{ fontSize: 9, letterSpacing: 1, color: "#7a7694", fontWeight: 700 }}>SYSTEM ACTIVITY · CLICK → REAL WORK</span>
            </div>
            <div className="live-journey-stages">
              {journey.stages.slice(0, 3).map((st) => (
                <div key={st.key} className={`live-journey-stage ${st.state}`} style={{ padding: "6px 0" }}>
                  <div className={`live-journey-dot ${st.state}`} aria-hidden>
                    {st.state === "done" ? <Check size={10} strokeWidth={3} /> : st.state === "active" ? <Loader2 size={10} className="animate-spin" /> : <Clock size={9} />}
                  </div>
                  <div className="live-journey-stage-content">
                    <strong style={{ fontSize: 11 }}>{st.title}</strong>
                    <small style={{ fontSize: 10 }}>{st.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="live-journey-note">
            {journey.isPaced ? "6s queue + 2s handoff — you clicked, system is working." : "Live polling every 2.5s."} <button onClick={() => setDismissed(true)} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: 0, padding: 0, fontSize: 9, color: "#7b8190" }}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  );
}
