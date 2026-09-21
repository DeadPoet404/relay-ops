"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical } from "lucide-react";
import {
  scenarios,
  scenarioLabels,
  scenarioSchema,
  type Scenario,
} from "@/lab/contracts";
const descriptions: Record<Scenario, string> = {
  accepted:
    "The warehouse acknowledges the order normally. One submission; no recovery needed.",
  accepted_timeout:
    "The warehouse accepts, but its response times out. Relay looks up the original reference—one POST, one GET, no duplicate submission.",
  temporary_outage:
    "Two documented failures, then acceptance on the third submission. Show the durable retry schedule and unchanged reference.",
  unavailable:
    "Every submission returns a documented temporary failure. Three submissions total, then human review.",
  lookup_unavailable:
    "Accepted with a lost response, then three failed lookups. No resubmission; human review retains the uncertainty.",
  address_rejected:
    "A confirmed address rejection. One submission, then review; corrected-address submission is not implemented.",
};
export function StorePresenter({ enabled }: { enabled: boolean }) {
  const [selected, setSelected] = useState<Scenario>("accepted");
  const [message, setMessage] = useState("");
  useEffect(() => {
    function read() {
      try {
        const parsed = scenarioSchema.safeParse(
          localStorage.getItem("northline.nextScenario") ?? "accepted",
        );
        if (parsed.success) setSelected(parsed.data);
      } catch {
        setMessage(
          "Browser storage is unavailable. Presenter selection cannot be saved.",
        );
      }
    }
    const timer = setTimeout(read, 0);
    window.addEventListener("storage", read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("storage", read);
    };
  }, []);
  function select(scenario: Scenario) {
    try {
      localStorage.setItem("northline.nextScenario", scenario);
      setSelected(scenario);
      setMessage(
        "Ready for the next new checkout in this browser. Existing or pending orders will not change.",
      );
    } catch {
      setMessage(
        "Selection was not saved. Enable browser storage before presenting.",
      );
    }
  }
  return (
    <main className="nl nl-presenter">
      <div className="nl-presenter-top">
        <Link href="/" className="nl-back">
          ← Relay console
        </Link>
        <span>ADVANCED PRESENTER / 006</span>
      </div>
      <div className="nl-alert">
        New here? <Link href="/demo">Start the guided demo →</Link> It takes you
        from a purchase directly to that order’s result.
      </div>
      <FlaskConical size={28} strokeWidth={1.4} />
      <p className="nl-eyebrow">THE STORY BEHIND THE STOREFRONT</p>
      <h1>
        One purchase.
        <br />
        Six possible journeys.
      </h1>
      <p className="nl-presenter-intro">
        Choose what happens at the simulated warehouse. Then shop at Northline
        as a customer and follow the same order through Relay.
      </p>
      {!enabled && (
        <div className="nl-alert">
          Read-only preview. Run the configured local development app,
          simulator, and worker to make demo purchases. Production checkout is
          disabled.
        </div>
      )}
      <div className="nl-presenter-grid">
        {scenarios.map((s) => (
          <button
            disabled={!enabled}
            aria-pressed={selected === s}
            key={s}
            onClick={() => select(s)}
          >
            <div>
              <span>{scenarioLabels[s]}</span>
              {selected === s && <Check size={18} />}
            </div>
            <p>{descriptions[s]}</p>
          </button>
        ))}
      </div>
      {message && (
        <p role="status" className="nl-alert">
          {message}
        </p>
      )}
      <div className="nl-presenter-actions">
        <Link href="/store" className="nl-primary">
          Open Northline Supply <ArrowRight size={17} />
        </Link>
        <Link href="/">Open Relay console ↗</Link>
      </div>
      <ol className="nl-presenter-instructions">
        <li>
          <strong>Set the scene.</strong> Choose a warehouse outcome here,
          before starting a new checkout.
        </li>
        <li>
          <strong>Place a demo purchase.</strong> Add a product, review the
          fictional customer, and confirm no payment will be made.
        </li>
        <li>
          <strong>Follow the evidence.</strong> On the confirmation page, choose
          “See how Relay handled this order” to open its saved result directly.
        </li>
      </ol>
      <p className="nl-fine-print">
        Selection is local browser configuration, not authorization. It resets
        to normal acceptance after a confirmed checkout in that browser. A
        pending checkout always retains its original scenario. Use one checkout
        tab during a presentation. Shopify, payments, and shipment tracking are
        not connected.
      </p>
    </main>
  );
}
