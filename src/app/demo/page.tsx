import Link from "next/link";
import {
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
  Warehouse,
  Check,
  Code2,
  FlaskConical,
  Clock,
  Activity,
  Eye,
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
            out what happened—without blindly sending the order again. Now with a
            persistent live journey that follows you from store to evidence.
          </p>
          <div className="journey-hero-actions">
            <Link className="journey-primary" href="/demo/start">
              Try the demo <ArrowRight size={17} />
            </Link>
            <a href="#how-it-works">How it works ↓</a>
          </div>
          <p className="journey-mode-note">
            {enabled
              ? "Local execution enabled. Real pacing: 6s queue + 2s handoff after durable claim. Live tracker persists across pages."
              : "Browsing preview. Interactive purchases require the configured local development app."}
          </p>
        </div>
        <div
          className="journey-illustration"
          aria-label="Illustration of a missing warehouse reply, not a live order"
        >
          <div className="journey-illustration-label">
            <span className="journey-dot" /> LIVE JOURNEY PREVIEW
          </div>
          <div className="journey-system">
            <ShoppingBag size={21} />
            <div>
              <strong>Northline Supply</strong>
              <span>Demo order recorded · no charge</span>
            </div>
            <span className="journey-example-badge">✓ Saved</span>
          </div>
          <div className="journey-connector">
            <Clock size={10} style={{ display: "inline", marginRight: 6 }} />
            Queued — presentation pacing active (6s)
          </div>
          <div className="journey-system">
            <Warehouse size={22} />
            <div>
              <strong>The warehouse</strong>
              <span>Submitting — claim before HTTP · 2s handoff</span>
            </div>
            <Activity size={14} className="animate-pulse" />
          </div>
          <div className="journey-missing">
            ··· Checking original order — not resending ···
          </div>
          <div className="journey-system journey-system-relay">
            <ShieldCheck size={22} />
            <div>
              <strong>Relay confirms via lookup</strong>
              <span>“Do you already have this order?” No repeat POST.</span>
            </div>
            <Eye size={14} />
          </div>
          <p>
            Persistent widget follows you. Short, real-time status — not decorative loaders.
            Evidence stays truthful.
          </p>
        </div>
      </section>
      <section className="journey-how" id="how-it-works">
        <div className="journey-section-title">
          <p className="journey-eyebrow">FOLLOW THE SAME ORDER</p>
          <h2>Four stages. One persistent tracker.</h2>
          <p>
            You’ll act as the customer first, then watch the same order move through recovery — live on every page.
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
              "Shop at Northline and check out. Pacing makes it feel real: 6s queue, 2s handoff.",
            ],
            [
              "03",
              "Watch the live journey",
              "A task-style widget shows Order recorded → Submission → Checking → Confirmed. Short, truthful copy in real time.",
            ],
            [
              "04",
              "Open the evidence",
              "Same order ID everywhere. Attempt counts, lookup checks, and audit trail — not a toy animation.",
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
                "Real 6s startAfter + 2s handoff after claim",
                "Authenticated local HTTP requests",
                "Bounded retries and reference lookups",
                "Persistent live widget polling real state",
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
                "Pacing is presentation — policy unchanged",
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
          The persistent tracker shows real saved state, never invented progress.
        </p>
      </section>
      <section className="journey-final-cta">
        <div>
          <h2>
            See the difference between
            <br />
            “try again” and “check first.”
          </h2>
          <p>Live tracker · real delays · evidence you can inspect.</p>
        </div>
        <Link className="journey-primary" href="/demo/start">
          Try the demo <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
