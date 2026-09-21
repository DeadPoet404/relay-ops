import Link from "next/link";
import {
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  Warehouse,
  Check,
  Code2,
  FlaskConical,
} from "lucide-react";
import { demoEnabled } from "@/lab/config";
export const dynamic = "force-dynamic";
export default function DemoHome() {
  const enabled = demoEnabled();
  return (
    <>
      <section className="journey-hero">
        <div>
          <p className="journey-eyebrow">A SMALL FAILURE. A BIG QUESTION.</p>
          <h1>
            The order is paid.
            <br />
            But did the warehouse
            <br />
            <em>receive it?</em>
          </h1>
          <p className="journey-intro">
            A missing reply doesn’t mean a missing order. See how Relay finds
            out what happened—without blindly sending the order again.
          </p>
          <div className="journey-hero-actions">
            <Link className="journey-primary" href="/demo/start">
              Try the demo <ArrowRight size={17} />
            </Link>
            <a href="#how-it-works">How it works ↓</a>
          </div>
          <p className="journey-mode-note">
            {enabled
              ? "Local execution is enabled. Keep the web app, worker, and simulator running."
              : "Browsing preview. Interactive purchases require the configured local development app."}
          </p>
        </div>
        <div
          className="journey-illustration"
          aria-label="Illustration of a missing warehouse reply, not a live order"
        >
          <div className="journey-illustration-label">
            <span className="journey-dot" /> THE PROBLEM, ILLUSTRATED
          </div>
          <div className="journey-system">
            <ShoppingBag size={21} />
            <div>
              <strong>Northline Supply</strong>
              <span>The customer places a demo order.</span>
            </div>
            <span className="journey-example-badge">Paid*</span>
          </div>
          <div className="journey-connector">Order sent to warehouse ↓</div>
          <div className="journey-system">
            <Warehouse size={22} />
            <div>
              <strong>The warehouse</strong>
              <span>Receives the request. Its reply goes missing.</span>
            </div>
          </div>
          <div className="journey-missing">
            ··· No reliable acknowledgement ···
          </div>
          <div className="journey-system journey-system-relay">
            <ShieldCheck size={22} />
            <div>
              <strong>Relay asks the safer question.</strong>
              <span>“Do you already have this order?”</span>
            </div>
          </div>
          <p>
            *Simulated payment. This diagram is an illustration, not live
            execution evidence.
          </p>
        </div>
      </section>
      <section className="journey-how" id="how-it-works">
        <div className="journey-section-title">
          <p className="journey-eyebrow">FOLLOW THE SAME ORDER</p>
          <h2>Three steps. One complete story.</h2>
          <p>
            You’ll act as the customer first, then see what the operations
            system did.
          </p>
        </div>
        <div className="journey-steps">
          {[
            [
              "01",
              "Choose a problem",
              "Pick what happens at the pretend warehouse. Start with a missing reply.",
            ],
            [
              "02",
              "Make a demo purchase",
              "Shop at Northline and check out. No card details and no money charged.",
            ],
            [
              "03",
              "See how Relay handled it",
              "Open that exact order. Read the result, attempt counts, and saved audit trail.",
            ],
          ].map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="journey-boundary">
        <div className="journey-section-title">
          <p className="journey-eyebrow">NO SMOKE AND MIRRORS</p>
          <h2>Fictional commerce. Real engineering.</h2>
        </div>
        <div className="journey-boundary-grid">
          <article>
            <Code2 size={22} />
            <h3>What actually works</h3>
            <ul>
              {[
                "Orders saved in PostgreSQL",
                "Durable jobs and a separate worker",
                "Authenticated local HTTP requests",
                "Bounded retries and reference lookups",
                "A persisted audit trail you can inspect",
              ].map((t) => (
                <li key={t}>
                  <Check size={14} />
                  {t}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <FlaskConical size={22} />
            <h3>What is simulated</h3>
            <ul>
              {[
                "The Northline merchant and products",
                "The customer and paid status",
                "The warehouse and its failures",
                "Product imagery is AI-generated",
                "No Shopify, real payment, or shipment",
              ].map((t) => (
                <li key={t}>
                  <span>—</span>
                  {t}
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className="journey-boundary-note">
          Warehouse acknowledgement is where this demo ends. It is not packing,
          shipping, or delivery—and this is not a production OMS replacement.
        </p>
      </section>
      <section className="journey-final-cta">
        <div>
          <h2>
            See the difference between
            <br />
            “try again” and “check first.”
          </h2>
          <p>No account required. No real purchase.</p>
        </div>
        <Link className="journey-primary" href="/demo/start">
          Try the demo <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
