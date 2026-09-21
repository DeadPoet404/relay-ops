import type { LabRun } from "@/lab/contracts";

export type StageState = "done" | "active" | "pending" | "error";

export interface LiveStage {
  key: string;
  title: string;
  detail: string;
  state: StageState;
  at?: string;
}

export interface LiveJourney {
  orderNumber: string;
  runId: string;
  stages: LiveStage[];
  progress: number; // 0-100
  finalLabel: string;
  isPaced: boolean;
  isComplete: boolean;
  needsReview: boolean;
}

function fmtTime(iso?: string | null) {
  if (!iso) return undefined;
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return undefined; }
}

export function deriveLiveJourney(run: LabRun): LiveJourney {
  const isPaced = Boolean(run.demoPacing);
  const attempt = run.attemptCount;
  const lookup = run.lookupCount;
  const status = run.status;
  const recovered = Boolean(run.recoveredByLookup);
  const stages: LiveStage[] = [];

  // 1 - recorded
  stages.push({
    key: "recorded",
    title: "Order recorded",
    detail: isPaced
      ? `Saved locally · pacing enabled · ${run.orderNumber}`
      : `Saved locally · ${run.orderNumber} · no charge`,
    state: "done",
    at: fmtTime(run.createdAt),
  });

  // 2 - submission
  let s2State: StageState = "pending";
  let s2Detail = "Waiting to submit";
  let s2At: string | undefined;

  if (status === "queued") {
    const notBefore = run.submissionNotBefore ? new Date(run.submissionNotBefore).getTime() : 0;
    const now = Date.now();
    if (isPaced && notBefore > now) {
      s2State = "active";
      const sec = Math.max(1, Math.ceil((notBefore - now) / 1000));
      s2Detail = `Queued — presentation pacing active · submitting in ${sec}s`;
    } else {
      s2State = "active";
      s2Detail = isPaced ? "Queued — pacing complete, handing off now" : "Queued for submission";
    }
  } else if (status === "running") {
    s2State = "active";
    s2Detail = isPaced && attempt === 0
      ? "Submitting to warehouse — first handoff pauses 2s after durable claim"
      : "Submitting to warehouse — claim recorded before HTTP";
    s2At = fmtTime(run.events.find(e => e.title.toLowerCase().includes("submission started"))?.occurredAt);
  } else if (attempt >= 1) {
    s2State = "done";
    s2Detail = `${attempt} submission attempt${attempt === 1 ? "" : "s"} · original reference kept`;
    s2At = fmtTime(run.events.find(e => e.title.toLowerCase().includes("acceptance") || e.title.toLowerCase().includes("retry"))?.occurredAt);
  } else {
    s2State = "pending";
    s2Detail = "Waiting for worker";
  }

  stages.push({
    key: "submission",
    title: "Warehouse submission",
    detail: s2Detail,
    state: s2State,
    at: s2At,
  });

  // 3 - checking
  let s3State: StageState = "pending";
  let s3Detail = "Awaiting warehouse response";
  if (status === "queued" || status === "running") {
    if (run.pendingAction === "lookup") {
      s3State = "active";
      s3Detail = "No reply yet. Checking original order via lookup.";
    } else if (run.pendingAction === "retry") {
      s3State = "active";
      s3Detail = `Temporary failure (${attempt}/3). Retrying same reference.`;
    } else {
      s3State = status === "running" ? "active" : "pending";
      s3Detail = status === "running" ? "Waiting for warehouse response" : "Will check confirmation after submission";
    }
  } else if (status === "unknown") {
    if (run.pendingAction === "lookup") {
      s3State = "active";
      s3Detail = "Outcome unknown. Lookup scheduled — never blind resubmit.";
    } else {
      s3State = "active";
      s3Detail = "Outcome unknown — investigating original reference.";
    }
  } else if (status === "unavailable") {
    if (lookup > 0) {
      s3State = "done";
      s3Detail = `${lookup} warehouse check${lookup === 1 ? "" : "s"} · budget exhausted`;
    } else {
      s3State = "done";
      s3Detail = "Checked warehouse — no confirmation";
    }
  } else if (status === "accepted" || status === "rejected") {
    s3State = "done";
    if (lookup > 0 || recovered) {
      s3Detail = recovered
        ? `Recovered via lookup (${lookup} check${lookup === 1 ? "" : "s"}) · no repeat POST`
        : `${lookup} lookup${lookup === 1 ? "" : "s"} recorded before confirmation`;
    } else if (attempt > 1) {
      s3Detail = "Confirmed after bounded recovery";
    } else {
      s3Detail = "Warehouse response received";
    }
  }

  stages.push({
    key: "checking",
    title: "Checking confirmation",
    detail: s3Detail,
    state: s3State,
    at: fmtTime(run.events.find(e => e.title.toLowerCase().includes("lookup") || e.title.toLowerCase().includes("reconciled"))?.occurredAt),
  });

  // 4 - final
  let s4State: StageState = "pending";
  let s4Title = "Final outcome";
  let s4Detail = "Awaiting final state";
  let finalLabel = "In progress";
  let isComplete = false;
  let needsReview = false;

  if (status === "accepted") {
    s4State = "done";
    s4Title = "Order confirmed";
    finalLabel = recovered ? "Confirmed via lookup" : attempt === 1 ? "Confirmed · no repeat" : "Confirmed after recovery";
    s4Detail = recovered
      ? "Order confirmed via read-only lookup. No repeat submission recorded."
      : attempt === 1
        ? "Order confirmed. No repeat submission recorded."
        : "Order confirmed after bounded recovery. Original reference reused.";
    isComplete = true;
  } else if (status === "rejected") {
    s4State = "error";
    s4Title = "Needs review";
    s4Detail = "Shipping address rejected. No auto-correction enabled.";
    finalLabel = "Needs review";
    isComplete = true;
    needsReview = true;
  } else if (status === "unavailable") {
    s4State = "error";
    s4Title = "Needs review";
    s4Detail = "Submission budget exhausted (3/3). Investigate warehouse before any future action.";
    finalLabel = "Budget exhausted";
    isComplete = true;
    needsReview = true;
  } else if (status === "unknown") {
    s4State = run.pendingAction ? "active" : "error";
    s4Title = run.pendingAction ? "Investigating" : "Outcome unknown";
    s4Detail = run.pendingAction === "lookup"
      ? "Interrupted submission — lookup authorized, not another POST."
      : "Outcome unknown — held for review.";
    finalLabel = "Investigating";
    needsReview = !run.pendingAction;
  } else {
    s4State = "pending";
    s4Title = "Awaiting confirmation";
    s4Detail = "Will resolve to confirmed or needs review — never silent duplicate.";
    finalLabel = status === "running" ? "Submitting" : "Queued";
  }

  stages.push({
    key: "final",
    title: s4Title,
    detail: s4Detail,
    state: s4State,
  });

  const doneCount = stages.filter(s => s.state === "done").length;
  const activeWeight = stages.some(s => s.state === "active") ? 0.5 : 0;
  const progress = Math.min(100, Math.round(((doneCount + activeWeight) / stages.length) * 100));

  return {
    orderNumber: run.orderNumber,
    runId: run.id,
    stages,
    progress,
    finalLabel,
    isPaced,
    isComplete,
    needsReview,
  };
}

export function pendingJourney(requestId: string, scenarioLabel?: string): LiveJourney {
  return {
    orderNumber: `NL-${requestId.slice(0, 8).toUpperCase()}`,
    runId: requestId,
    stages: [
      { key: "recorded", title: "Checkout preserved", detail: "Original bag + request ID saved. Same request will be retried.", state: "done" },
      { key: "submission", title: "Awaiting confirmation", detail: "Checkout not yet confirmed. Retry uses same order — never a duplicate.", state: "active" },
      { key: "checking", title: "Checking confirmation", detail: "Will check warehouse after confirmation.", state: "pending" },
      { key: "final", title: "Awaiting result", detail: scenarioLabel ? `Scenario: ${scenarioLabel}` : "Complete checkout to see recovery.", state: "pending" },
    ],
    progress: 25,
    finalLabel: "Checkout pending",
    isPaced: true,
    isComplete: false,
    needsReview: false,
  };
}
