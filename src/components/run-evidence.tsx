"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { LabRun } from "@/lab/contracts";
import { summarizeRun } from "@/demo/journey";
import { GuidedExecutionFlow } from "./guided-execution";
import "./guided-execution.css";
export function RunEvidence({ id, enabled }: { id: string; enabled: boolean }) {
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [read, setRead] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function load() {
      try {
        if (document.hidden) return;
        const response = await fetch(`/api/lab/runs/${id}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        if (response.status === 404) {
          if (active) {
            setRun(null);
            setMissing(true);
            setError(
              "This demo order was not found. Check the original confirmation link. Nothing has been created or resubmitted.",
            );
          }
          return;
        }
        if (!response.ok) throw Error("Read failed");
        const body = await response.json();
        if (active) {
          setRun(body.run);
          setError(null);
          setMissing(false);
          setRead(new Date().toLocaleTimeString());
        }
      } catch {
        if (active)
          setError(
            "We couldn’t refresh the evidence. Any displayed result is the last known state and may be stale. Check your connection and local services; do not reorder.",
          );
      } finally {
        if (active) timer = setTimeout(() => void load(), 2500);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, enabled, refresh]);
  const summary = run ? summarizeRun(run) : null;
  if (!enabled)
    return (
      <div className="journey-disabled">
        <ShieldCheck size={30} />
        <h1>Order evidence stays in the local demo.</h1>
        <p>
          This browsing preview does not expose order records. Open this same
          path in your configured localhost app to inspect the purchase.
        </p>
        <code>/runs/{id}</code>
        <Link href="/demo" className="journey-primary">
          How the demo works <ArrowRight size={16} />
        </Link>
      </div>
    );
  return (
    <div className="journey-evidence">
      <div className="journey-evidence-breadcrumb">
        <Link href="/demo">The guided demo</Link>
        <span>/</span>
        <span>Order result</span>
      </div>
      <p className="journey-eyebrow">STEP 3 OF 3 / THE OPERATOR’S VIEW</p>
      <div className="journey-evidence-heading">
        <h1>Here’s what happened.</h1>
        <button
          className="journey-secondary"
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={14} /> Refresh evidence
        </button>
      </div>
      <p className="journey-evidence-intro">
        This is the same order from checkout—not a new scenario run. Opening or
        refreshing this page never submits it again.
      </p>
      {error && (
        <div className="journey-notice journey-notice-warning" role="alert">
          <strong>
            {missing
              ? "Order not found"
              : "Last known evidence · refresh failed"}
          </strong>
          <p>{error}</p>
        </div>
      )}
      {!run ? (
        <div className="journey-loading" role="status">
          {missing
            ? "No order evidence is available for this link."
            : error
              ? "Waiting for a successful read."
              : "Reading the saved order and its audit trail…"}
        </div>
      ) : (
        <>
          <div className="journey-order-strip">
            <strong>{run.orderNumber}</strong>
            <span>Persisted demo order{run.demoPacing ? " · pacing enabled" : ""}</span>
            <small>
              {read ? `Last checked ${read}` : ""}
              {error ? " · may be stale" : ""}
              {run.demoPacing ? " · 6s queue + 2s handoff" : ""}
            </small>
          </div>
          <div style={{ margin: "14px 0 18px" }}>
            <GuidedExecutionFlow run={run} />
          </div>
          <section
            className={`journey-result journey-result-${summary!.tone}`}
            aria-label="Order result summary"
          >
            <div className="journey-result-icon">
              {summary!.tone === "success" ? (
                <CheckCheck size={28} />
              ) : summary!.tone === "review" ? (
                <TriangleAlert size={28} />
              ) : (
                <Clock3 size={28} />
              )}
            </div>
            <div>
              <span className="journey-result-label">{summary!.outcome}</span>
              <h2>{summary!.title}</h2>
              <p>{summary!.description}</p>
            </div>
          </section>
          <div className="journey-evidence-stats">
            <div>
              <strong>
                {run.attemptCount}
                <small> / 3 maximum</small>
              </strong>
              <span>Submission attempts recorded</span>
              <p>Requests to send the order.</p>
            </div>
            <div>
              <strong>
                {run.lookupCount}
                <small> / 3 maximum</small>
              </strong>
              <span>Read-only checks recorded</span>
              <p>Asking whether it already exists.</p>
            </div>
            <div>
              <strong>
                {summary!.tone === "success"
                  ? "Confirmed"
                  : summary!.tone === "review"
                    ? "Needs review"
                    : "Not yet confirmed"}
              </strong>
              <span>Warehouse acknowledgement</span>
              <p>Not shipment or delivery.</p>
            </div>
          </div>
          <p className="journey-count-note">
            Counts are durable claims recorded before network calls. A crash can
            consume an attempt without sending a request; these are not a
            universal exactly-once guarantee.
          </p>
          <section className="journey-result-story">
            <h2>The journey in plain language</h2>
            <ol>
              <li>
                <Check size={16} />
                <div>
                  <strong>Order saved</strong>
                  <p>
                    The demo order and its submission job were recorded
                    together.
                  </p>
                </div>
              </li>
              <li>
                {run.attemptCount ? <Check size={16} /> : <Clock3 size={16} />}
                <div>
                  <strong>
                    {run.attemptCount
                      ? `${run.attemptCount} submission ${run.attemptCount === 1 ? "attempt" : "attempts"} recorded`
                      : "Waiting for the first submission"}
                  </strong>
                  <p>
                    {run.attemptCount > 1
                      ? "Retries required confirmed temporary-failure evidence and the original reference."
                      : run.attemptCount
                        ? "The worker claimed the order before attempting the warehouse request."
                        : "Keep the worker running. Saving the order does not mean it has been sent."}
                  </p>
                </div>
              </li>
              {(run.lookupCount > 0 || run.pendingAction === "lookup") && (
                <li>
                  <ShieldCheck size={16} />
                  <div>
                    <strong>
                      {run.recoveredByLookup
                        ? "Original reference recovered"
                        : run.lookupCount
                          ? "Read-only check attempts recorded"
                          : "Read-only check scheduled"}
                    </strong>
                    <p>
                      A missing acknowledgement calls for investigation, not
                      blind resubmission.
                    </p>
                  </div>
                </li>
              )}
              <li>
                {summary!.tone === "success" ? (
                  <CheckCheck size={16} />
                ) : summary!.tone === "review" ? (
                  <TriangleAlert size={16} />
                ) : (
                  <Clock3 size={16} />
                )}
                <div>
                  <strong>{summary!.outcome}</strong>
                  <p>
                    {summary!.tone === "success"
                      ? "Relay has a matching warehouse reference saved against this order."
                      : summary!.tone === "review"
                        ? "Automation has stopped. A corrected-address or force-submit workflow is not implemented."
                        : "The current evidence does not yet establish warehouse acceptance."}
                  </p>
                </div>
              </li>
            </ol>
          </section>
          {run.pendingAction && run.nextActionAt && (
            <div className="journey-notice">
              <strong>
                {run.pendingAction === "lookup"
                  ? "A read-only check is scheduled"
                  : "An authorized retry is scheduled"}
              </strong>
              <p>
                Due{" "}
                <time dateTime={run.nextActionAt}>
                  {new Date(run.nextActionAt).toLocaleString()}
                </time>
                . Actual processing depends on worker availability; this is not
                a countdown guarantee.
              </p>
            </div>
          )}
          {run.reviewReason && (
            <div className="journey-notice journey-notice-warning">
              <strong>Why automation stopped</strong>
              <p>{run.reviewReason}</p>
            </div>
          )}
          <details className="journey-audit">
            <summary>
              <span>
                Inspect the saved evidence{" "}
                <small>{run.events.length} audit events</small>
              </span>
              <span>+</span>
            </summary>
            <div className="journey-identities">
              <div>
                <span>Original order reference</span>
                <code>{run.reference}</code>
              </div>
              <div>
                <span>Warehouse acknowledgement</span>
                <code>{run.warehouseReference ?? "Not confirmed"}</code>
              </div>
            </div>
            <ol>
              {run.events.map((e) => (
                <li key={e.id}>
                  <time dateTime={e.occurredAt}>{e.time} UTC</time>
                  <div>
                    <strong>{e.title}</strong>
                    <p>{e.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          <div className="journey-result-actions">
            {run.orderNumber.startsWith("NL-") && (
              <Link className="journey-primary" href={`/store/orders/${id}`}>
                Back to the customer’s order <ArrowRight size={16} />
              </Link>
            )}
            <Link href="/demo/start" className="journey-secondary">
              Try another scenario
            </Link>
            <Link href="/">Open operations console ↗</Link>
          </div>
        </>
      )}
      <section className="journey-evidence-boundary">
        <strong>Working evidence. Simulated commerce.</strong>
        <p>
          The saved order, background jobs, HTTP integration, and recovery are
          real software behavior. The products, payment, customer, and warehouse
          are fictional. No goods are shipped.
        </p>
      </section>
    </div>
  );
}
