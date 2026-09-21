"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, RotateCcw } from "lucide-react";
import type { Scenario } from "@/lab/contracts";
import { journeyScenarios, runPath } from "@/demo/journey";
import { beginJourney, pendingCheckout, recentOrder } from "@/demo/browser";
export function GuidedStart({ enabled }: { enabled: boolean }) {
  const [selected, setSelected] = useState<Scenario>("accepted_timeout");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (enabled) {
        try {
          setPending(Boolean(pendingCheckout(sessionStorage)));
          setLast(recentOrder(localStorage));
        } catch {
          setError(
            "Browser checkout state could not be read. Don’t discard an unfinished order. Open checkout to inspect it, or enable browser storage.",
          );
        }
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled]);
  function start() {
    if (!enabled || !ready || error || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const next = beginJourney(sessionStorage, localStorage, selected);
      router.push(next === "resume" ? "/store/checkout" : "/store#collection");
    } catch {
      setError(
        "The demo could not save its starting state. Nothing was purchased. Check browser storage, then reload this page.",
      );
      lock.current = false;
      setBusy(false);
    }
  }
  const choice = journeyScenarios.find((s) => s.id === selected)!;
  function card(s: typeof choice) {
    return (
      <button
        className="journey-choice"
        key={s.id}
        disabled={!enabled || pending || !ready || Boolean(error)}
        aria-pressed={selected === s.id}
        onClick={() => setSelected(s.id)}
      >
        <div>
          <span>
            {s.id === "accepted_timeout"
              ? "RECOMMENDED FIRST"
              : "ANOTHER JOURNEY"}
          </span>
          {selected === s.id && <Check size={17} />}
        </div>
        <h3>{s.title}</h3>
        <p>{s.description}</p>
      </button>
    );
  }
  return (
    <div className="journey-start">
      <Link href="/demo" className="journey-back">
        ← About this demo
      </Link>
      <p className="journey-eyebrow">STEP 1 OF 3 / SET THE SCENE</p>
      <h1>What happens after checkout?</h1>
      <p className="journey-intro">
        Choose a problem to demonstrate. Then shop as the customer.
        <br />
        Relay will show you what happened to that same order.
      </p>
      {!enabled && (
        <div className="journey-notice">
          <strong>You’re in a browsing-only preview.</strong>
          <p>
            You can explore the store, but purchases and order records are
            disabled here. For the connected demo, use{" "}
            <code>npm run demo:dev</code> on your computer with the worker and
            simulator running.
          </p>
          <Link href="/store">Browse Northline instead ↗</Link>
        </div>
      )}
      {error && (
        <div role="alert" className="journey-notice journey-notice-warning">
          {error} <Link href="/store/checkout">Inspect pending checkout →</Link>
        </div>
      )}
      {pending && (
        <div className="journey-notice">
          <strong>You have an unfinished checkout.</strong>
          <p>
            Its original bag, scenario, and request ID are preserved. Finish
            confirming that order before starting a new one.
          </p>
          <Link href="/store/checkout">
            Resume the same checkout <ArrowRight size={15} />
          </Link>
        </div>
      )}
      <div className="journey-choice-grid">
        {journeyScenarios.slice(0, 3).map(card)}
      </div>
      <details className="journey-more">
        <summary>
          Explore three more scenarios <ChevronDown size={15} />
        </summary>
        <div className="journey-choice-grid">
          {journeyScenarios.slice(3).map(card)}
        </div>
      </details>
      <div className="journey-start-bottom">
        <div>
          <span className="journey-eyebrow">WHAT TO LOOK FOR</span>
          <p>{choice.expected}</p>
          <small>
            This is the planned scenario. The result page reports actual saved
            evidence.
          </small>
        </div>
        <button
          className="journey-primary"
          disabled={!enabled || pending || !ready || Boolean(error) || busy}
          onClick={start}
        >
          {busy ? "Opening Northline…" : "Shop this demo"}
          <ArrowRight size={17} />
        </button>
      </div>
      <p className="journey-start-tip">
        On the next page: choose a product → add it to your bag → demo checkout.
        You won’t enter card or personal details. Starting here does not place
        an order or clear your bag.
      </p>
      {last && (
        <Link href={runPath(last)} className="journey-recent">
          <RotateCcw size={15} /> View your last demo result
        </Link>
      )}
      <details className="journey-setup">
        <summary>Need help starting the local demo?</summary>
        <p>
          Keep these commands running in three separate terminals inside your
          configured Relay project. Then open{" "}
          <strong>http://localhost:3000/demo</strong> in your own browser—not
          the chat preview.
        </p>
        <div>
          <code>npm run simulator</code>
          <code>npm run worker</code>
          <code>npm run demo:dev</code>
        </div>
        <p>
          Local execution settings are not a health check. If an order waits,
          check those terminals. No database reset is required.
        </p>
      </details>
    </div>
  );
}
