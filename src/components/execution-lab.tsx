"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCheck,
  ChevronDown,
  CirclePause,
  Clock3,
  FlaskConical,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  createRunSchema,
  scenarioLabels,
  runLabels,
  type LabRun,
  type Scenario,
} from "@/lab/contracts";
import Link from "next/link";
import { runPath } from "@/demo/journey";
import type { ConsoleData } from "@/lib/console-data";

const cards: {
  scenario: Scenario;
  label: string;
  title: string;
  description: string;
  icon: typeof CheckCheck;
}[] = [
  {
    scenario: "accepted",
    label: "THE HAPPY PATH",
    title: "An order, acknowledged.",
    description:
      "A queued order reaches the simulator and receives a matching warehouse reference.",
    icon: CheckCheck,
  },
  {
    scenario: "address_rejected",
    label: "CONFIRMED REJECTION",
    title: "An address needs a person.",
    description:
      "The simulator rejects the address. Relay opens a review item instead of retrying bad input.",
    icon: TriangleAlert,
  },
  {
    scenario: "unavailable",
    label: "SERVICE FAILURE",
    title: "The warehouse is unavailable.",
    description:
      "A persistent outage exhausts three safe submissions, then stops for human review. No endless retry loop.",
    icon: CirclePause,
  },
  {
    scenario: "accepted_timeout",
    label: "THE IMPORTANT EDGE CASE",
    title: "Accepted. But no answer.",
    description:
      "The warehouse accepts but its reply is lost. Relay finds the original fulfillment by reference—without a second submission.",
    icon: Clock3,
  },
  {
    scenario: "temporary_outage",
    label: "BOUNDED RECOVERY",
    title: "Back online on attempt three.",
    description:
      "Two confirmed temporary failures, then acceptance. Retries reuse the original reference and unchanged payload.",
    icon: RefreshCw,
  },
  {
    scenario: "lookup_unavailable",
    label: "KNOW WHEN TO STOP",
    title: "No reliable answer yet.",
    description:
      "The warehouse accepts, but status lookups fail. Three read-only checks end in human review—not another order.",
    icon: ShieldCheck,
  },
];

export function ExecutionLab({
  enabled,
  onData,
}: {
  enabled: boolean;
  onData: (data: ConsoleData) => void;
}) {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    requestId: string;
    scenario: Scenario;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const callback = useRef(onData);
  // Keep polling callback stable when the parent receives fresh console data.
  useEffect(() => {
    callback.current = onData;
  }, [onData]);
  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const [labResponse, consoleResponse] = await Promise.all([
        fetch("/api/lab", {
          cache: "no-store",
          signal: AbortSignal.timeout(7000),
        }),
        fetch("/api/console", {
          cache: "no-store",
          signal: AbortSignal.timeout(7000),
        }),
      ]);
      if (!labResponse.ok || !consoleResponse.ok)
        throw new Error("Read failed");
      const lab = (await labResponse.json()) as { runs: LabRun[] };
      const consoleData = (await consoleResponse.json()) as ConsoleData;
      if (alive.current) {
        setRuns(lab.runs);
        callback.current(consoleData);
        setLastRead(new Date().toLocaleTimeString());
        setError(null);
      }
    } catch {
      if (alive.current)
        setError(
          "Could not refresh. Displayed results may be stale. Check the database, queue:init, local origin, and terminal output.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    const firstRead = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("relay.pendingDemoRequest");
        if (saved) {
          const parsed = createRunSchema.safeParse(JSON.parse(saved));
          if (parsed.success) setPending(parsed.data);
          else sessionStorage.removeItem("relay.pendingDemoRequest");
        }
      } catch {
        /* Session storage may be unavailable; in-memory retry still works. */
      }
      void refresh();
    }, 0);
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 2500);
    return () => {
      alive.current = false;
      clearTimeout(firstRead);
      clearInterval(timer);
    };
  }, [enabled, refresh]);

  async function start(scenario: Scenario) {
    if (busy) return;
    const request = pending ?? { requestId: crypto.randomUUID(), scenario };
    try {
      sessionStorage.setItem(
        "relay.pendingDemoRequest",
        JSON.stringify(request),
      );
    } catch {
      /* Optional browser persistence. */
    }
    setPending(request);
    setBusy(true);
    try {
      const response = await fetch("/api/lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "The 100-run local demo limit has been reached."
            : "The request was not confirmed. Check the setup, then retry the same request.",
        );
      const result = (await response.json()) as { runId: string };
      if (alive.current) {
        setExpanded(result.runId);
        setPending(null);
        try {
          sessionStorage.removeItem("relay.pendingDemoRequest");
        } catch {
          /* Optional browser persistence. */
        }
        setActionError(null);
      }
      await refresh();
    } catch (err) {
      if (alive.current)
        setActionError(
          err instanceof Error
            ? err.message
            : "Submission was not confirmed. Retry the same request.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function checkWarehouse(runId: string) {
    setChecking(runId);
    try {
      const response = await fetch("/api/lab/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw new Error(
          "Lookup request not confirmed. Refresh before trying again; do not create a replacement order.",
        );
      const result = (await response.json()) as { reason: string };
      if (alive.current) {
        setLookupNote(result.reason);
        setActionError(null);
      }
      await refresh();
    } catch (error) {
      if (alive.current)
        setActionError(
          error instanceof Error ? error.message : "Lookup request failed.",
        );
    } finally {
      if (alive.current) setChecking(null);
    }
  }

  return (
    <section className="execution-lab" aria-label="Executable local demo">
      <div className={`execution-notice ${enabled ? "execution-enabled" : ""}`}>
        <FlaskConical size={21} />
        <div>
          <strong>
            {enabled
              ? "Real execution. Fictional orders."
              : "Execution is safely switched off."}
          </strong>
          <p>
            {enabled
              ? "Each run creates one paid demo order and a durable job. Keep the worker and simulator running in separate terminals. No Shopify requests are made."
              : "Run npm run demo:configure, then use npm run demo:dev locally. Production builds and fixture mode never enable these controls."}
          </p>
        </div>
        <span className="subtle-chip">
          {enabled ? "LOCAL LAB" : "READ ONLY"}
        </span>
      </div>
      <div className="recovery-policy" aria-label="Local recovery limits">
        <span>
          <strong>3</strong> submissions maximum
        </span>
        <span>
          <strong>3</strong> read-only lookups maximum
        </span>
        <span>
          <strong>60s</strong> reconciliation backstop
        </span>
      </div>
      <div className="execution-grid">
        {cards.map(
          ({ scenario, label, title, description, icon: Icon }, index) => (
            <article className="execution-card" key={scenario}>
              <div className="scenario-top">
                <span className="scenario-icon">
                  <Icon size={22} />
                </span>
                <span>0{index + 1}</span>
              </div>
              <span className="eyebrow">{label}</span>
              <h2>{title}</h2>
              <p>{description}</p>
              <button
                className="button button-primary"
                disabled={!enabled || busy || pending !== null}
                onClick={() => void start(scenario)}
              >
                <Play size={13} />
                Run scenario
                <ArrowRight size={15} />
              </button>
            </article>
          ),
        )}
      </div>
      {pending && !busy && (
        <div className="lab-pending">
          <InfoLabel />
          <div>
            <strong>One request still needs confirmation.</strong>
            <p>
              Retry uses the same request ID. If the first request already
              committed, no second order is created. The request ID is retained
              for this browser tab when session storage is available.
            </p>
            <code>{pending.requestId}</code>
          </div>
          <button
            className="button button-secondary"
            onClick={() => void start(pending.scenario)}
          >
            Retry same request
          </button>
        </div>
      )}
      {busy && (
        <p className="lab-progress" role="status">
          <LoaderCircle size={15} />
          Recording a durable demo request…
        </p>
      )}
      {lookupNote && (
        <p className="lab-progress" role="status">
          {lookupNote}
        </p>
      )}
      {actionError && (
        <p className="lab-error" role="alert">
          {actionError}
        </p>
      )}
      {error && (
        <p className="lab-error" role="alert">
          {error}
        </p>
      )}
      {enabled && (
        <div className="lab-results">
          <div className="section-bar">
            <div>
              <h2>Recent runs</h2>
              <span className="lab-updated">
                Latest 10 ·{" "}
                {lastRead ? `Read at ${lastRead}` : "Waiting for first read"} ·
                not a worker-health signal
              </span>
            </div>
            <button
              className="button button-secondary"
              onClick={() => void refresh()}
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
          {loading && (
            <div className="empty-state" role="status">
              Loading persisted runs…
            </div>
          )}
          {!loading && !runs.length && (
            <div className="empty-state">
              <FlaskConical size={24} />
              <h3>The first run starts here.</h3>
              <p>
                Choose a scenario above. The result will be recorded even if you
                leave the page.
              </p>
            </div>
          )}
          {runs.map((run) => (
            <article className="lab-run" key={run.id}>
              <button
                className="lab-run-heading"
                aria-expanded={expanded === run.id}
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                <div>
                  <strong>{run.orderNumber}</strong>
                  <span>{scenarioLabels[run.scenario]}</span>
                </div>
                <span className={`run-state run-${run.status}`}>
                  {run.reviewReason
                    ? "Needs review"
                    : run.pendingAction === "retry"
                      ? "Retry scheduled"
                      : run.pendingAction === "lookup"
                        ? "Checking warehouse"
                        : runLabels[run.status]}
                </span>
                <ChevronDown
                  size={16}
                  className={expanded === run.id ? "rotated" : ""}
                />
              </button>
              {expanded === run.id && (
                <div className="lab-run-detail">
                  <Link
                    className="button button-secondary"
                    href={runPath(run.id)}
                  >
                    Explain this order’s result <ArrowRight size={14} />
                  </Link>
                  <div className="lab-run-facts">
                    <span>
                      Submission job:{" "}
                      <strong>{run.jobState ?? "unknown"}</strong>
                    </span>
                    <span>
                      Submissions: <strong>{run.attemptCount}/3</strong>
                    </span>
                    <span>
                      Warehouse:{" "}
                      <strong>
                        {run.warehouseReference ?? "Not acknowledged"}
                      </strong>
                    </span>
                  </div>
                  <div className="recovery-run-meta">
                    <span>
                      Reference lookups: <strong>{run.lookupCount}/3</strong>
                    </span>
                    <span>
                      Recovery job:{" "}
                      <strong>{run.recoveryJobState ?? "none"}</strong>
                    </span>
                  </div>
                  {run.pendingAction && run.nextActionAt && (
                    <p className="recovery-scheduled">
                      <Clock3 size={14} />
                      {run.pendingAction === "retry"
                        ? "Authorized retry"
                        : "Read-only lookup"}{" "}
                      due at{" "}
                      <time dateTime={run.nextActionAt}>
                        {run.nextActionAt.slice(11, 19)} UTC
                      </time>
                    </p>
                  )}
                  {run.reviewReason && (
                    <p className="lab-hint recovery-review">
                      <TriangleAlert size={16} />
                      <span>
                        <strong>Human review required.</strong>{" "}
                        {run.reviewReason}
                      </span>
                    </p>
                  )}
                  {!run.pendingAction &&
                    !run.reviewReason &&
                    ["unknown", "unavailable"].includes(run.status) &&
                    run.lookupCount < 3 && (
                      <button
                        className="button button-secondary recovery-check"
                        disabled={checking !== null}
                        onClick={() => void checkWarehouse(run.id)}
                      >
                        <RefreshCw size={14} />
                        {checking === run.id
                          ? "Queueing lookup…"
                          : "Check warehouse"}
                      </button>
                    )}
                  <code className="lab-reference">{run.reference}</code>
                  {!run.warehouseReference &&
                    (run.jobState === "failed" ||
                      run.recoveryJobState === "failed") && (
                      <p className="lab-error">
                        A queue delivery exhausted its infrastructure retries.
                        Check the worker output. The periodic scan can re-arm
                        eligible overdue work; no force-submit action is
                        available.
                      </p>
                    )}
                  {run.status === "queued" && (
                    <p className="lab-hint">
                      Persisted and waiting for the worker. Queueing is not
                      proof the worker is running.
                    </p>
                  )}
                  {run.status === "unknown" && (
                    <p className="lab-hint">
                      No new warehouse submission will be made on queue
                      redelivery. Establish the original outcome before any
                      recovery.
                    </p>
                  )}
                  <ol className="timeline">
                    {run.events.map((event) => (
                      <li key={event.id}>
                        <span className={`timeline-dot dot-${event.tone}`}>
                          <span />
                        </span>
                        <div>
                          <div className="event-heading">
                            <strong>{event.title}</strong>
                            <time dateTime={event.occurredAt}>
                              {event.time} UTC
                            </time>
                          </div>
                          <p>{event.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="execution-footnote">
        <ShieldCheck size={15} />
        Unknown outcome? Check the original reference. Confirmed temporary
        failure? Retry within the budget. Unverified or exhausted? Stop for
        human review.
      </p>
    </section>
  );
}
function InfoLabel() {
  return <ShieldCheck size={20} />;
}
