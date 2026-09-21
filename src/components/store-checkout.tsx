"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { checkoutSchema, priceCart, type CheckoutRequest } from "@/store/cart";
import { money } from "@/store/catalog";
import { scenarioSchema } from "@/lab/contracts";
import { useCart } from "./store-shell";
import { GuidedExecutionFlow } from "./guided-execution";
import type { LabRun } from "@/lab/contracts";

export function StoreCheckout({ enabled }: { enabled: boolean }) {
  const { cart, ready, clear } = useCart();
  const router = useRouter();
  const [pending, setPending] = useState<CheckoutRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [justOrderedId, setJustOrderedId] = useState<string | null>(null);
  const [liveRun, setLiveRun] = useState<LabRun | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("northline.checkout");
        if (saved) setPending(checkoutSchema.parse(JSON.parse(saved)));
      } catch {
        setBlocked(true);
        setError(
          "Stored checkout could not be read. Inspect this browser’s pending request before placing a replacement order.",
        );
      }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // poll live run after order placed to show real system activity
  useEffect(() => {
    if (!justOrderedId || !enabled) return;
    let active = true;
    const ctrl = new AbortController();
    async function load() {
      try {
        if (document.hidden) return;
        const res = await fetch(`/api/lab/runs/${justOrderedId}`, {
          cache: "no-store",
          signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(8000)]),
        });
        if (res.ok) {
          const data = (await res.json()) as { run: LabRun };
          if (active && data.run) setLiveRun(data.run);
        }
      } catch {}
      if (active) setTimeout(() => void load(), 1200);
    }
    void load();
    const redirectTimer = setTimeout(() => {
      if (active) {
        clear();
        router.replace(`/store/orders/${justOrderedId}`);
      }
    }, 4200);
    return () => {
      active = false;
      ctrl.abort();
      clearTimeout(redirectTimer);
    };
  }, [justOrderedId, enabled, clear, router]);

  const quote =
    pending?.items.length || cart.length
      ? priceCart(pending?.items ?? cart)
      : null;

  async function submit() {
    if (lock.current || !enabled || !quote || blocked || !agreed) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      let request = pending;
      if (!request) {
        const chosen = scenarioSchema.safeParse(
          localStorage.getItem("northline.nextScenario") ?? "accepted",
        );
        request = {
          requestId: crypto.randomUUID(),
          scenario: chosen.success ? chosen.data : "accepted",
          items: cart,
          paced: true,
        };
        sessionStorage.setItem("northline.checkout", JSON.stringify(request));
        setPending(request);
      }
      const response = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "The shared 100-order demo limit has been reached. Preserve existing evidence; do not reset the database."
            : response.status === 409
              ? "This request ID conflicts with an existing order. Inspect it in Relay; do not create a replacement."
              : "Checkout was not confirmed. Retry this same request; it will not create a second order if the first one committed.",
        );
      const result = (await response.json()) as { runId: string };
      if (result.runId !== request.requestId)
        throw new Error(
          "Unexpected checkout response. Keep the original request and retry safely.",
        );
      try {
        sessionStorage.removeItem("northline.checkout");
        if (localStorage.getItem("northline.nextScenario") === request.scenario)
          localStorage.removeItem("northline.nextScenario");
        localStorage.setItem("northline.lastOrder", result.runId);
      } catch {}
      // guided: show live execution for a moment so user feels system working, then navigate
      setJustOrderedId(result.runId);
      // keep pending cleared for UI
      setPending(null);
    } catch (err) {
      setError(
        err instanceof TypeError || err instanceof DOMException
          ? "Checkout was not confirmed. Check browser storage and your connection, then retry the same checkout. Do not place a replacement order."
          : err instanceof Error
            ? err.message
            : "Checkout was not confirmed. Retry the same request.",
      );
      lock.current = false;
      setBusy(false);
    }
  }

  if (!ready || !loaded)
    return (
      <div className="nl-checkout-wrap">
        <p role="status">Preparing your bag…</p>
      </div>
    );

  if (justOrderedId) {
    return (
      <div className="nl-checkout-wrap">
        <Link href="/store#collection" className="nl-back">
          <ArrowLeft size={15} /> Continue exploring
        </Link>
        <p className="nl-eyebrow">ORDER SAVED · REAL SYSTEM WORKING</p>
        <h1>Good choice. Relay is on it.</h1>
        <p className="nl-checkout-intro">
          You clicked — now watch the system work. Real DB transaction, real queue job with 6s pacing, real worker claim before HTTP.
        </p>
        <div style={{ marginTop: 22, maxWidth: 640 }}>
          <GuidedExecutionFlow run={liveRun} />
          <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", fontSize: 11, color: "#6d7586" }}>
            <LoaderCircle size={14} className="nl-spin" />
            <span>Opening your order status in a moment — live tracker will follow you.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nl-checkout-wrap">
      <Link href="/store#collection" className="nl-back">
        <ArrowLeft size={15} /> Continue exploring
      </Link>
      <p className="nl-eyebrow">A FEW GOOD THINGS, ON THEIR WAY</p>
      <h1>Make it yours.</h1>
      <p className="nl-checkout-intro">
        A real order journey. A completely simulated purchase. Click Place — watch Relay work in real time.
      </p>
      {!enabled && (
        <div className="nl-alert">
          Browsing preview only. Purchases are disabled in production and
          fixture mode. Use the configured local development lab for the
          connected demonstration.
        </div>
      )}
      {error && (
        <div className="nl-alert" role="alert">
          {error}
        </div>
      )}
      {pending && (
        <div className="nl-alert">
          One checkout still needs confirmation. Its original bag and request ID
          are preserved: <code>{pending.requestId}</code>. Retry uses that same
          order, regardless of subsequent bag changes.
        </div>
      )}
      {!quote ? (
        <div className="nl-empty">
          <h2>Your bag is taking a breather.</h2>
          <p>
            Add an essential from the collection to start your demo purchase.
          </p>
          <Link href="/store#collection" className="nl-primary">
            Explore the collection <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="nl-checkout-grid">
          <div className="nl-checkout-form">
            <section>
              <div className="nl-step-label">
                <span>01</span>
                <h2>Delivery details</h2>
                <Check size={17} />
              </div>
              <p className="nl-muted">
                A fixed fictional customer. Please don’t enter personal
                information.
              </p>
              <div className="nl-address">
                <strong>
                  Alex Morgan <span>DEMO CUSTOMER</span>
                </strong>
                <p>
                  24 Example Lane
                  <br />
                  Demo City, DC 00000
                  <br />
                  United States
                </p>
                <p>demo.customer@example.com</p>
              </div>
              <p className="nl-fine-print">
                This illustrative address is not sent to a carrier.
              </p>
            </section>
            <section>
              <div className="nl-step-label">
                <span>02</span>
                <h2>Delivery</h2>
                <Check size={17} />
              </div>
              <div className="nl-delivery">
                <div>
                  <strong>Simulated warehouse handoff</strong>
                  <p>Follow the order’s acknowledgement after checkout — live.</p>
                </div>
                <span>$0</span>
              </div>
            </section>
            <section>
              <div className="nl-step-label">
                <span>03</span>
                <h2>Payment</h2>
                <LockKeyhole size={17} />
              </div>
              <div className="nl-payment">
                <strong>
                  Demo payment <span>NO CHARGE</span>
                </strong>
                <p>
                  Payment is recorded as simulated. No card details, payment
                  provider, or real transaction are involved.
                </p>
              </div>
              <label className="nl-consent">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />{" "}
                <span>
                  I understand this is a demo purchase. No money will be charged
                  and no goods will be shipped.
                </span>
              </label>
              <button
                className="nl-primary"
                disabled={!enabled || busy || blocked || !agreed}
                onClick={() => void submit()}
                style={{ transform: busy ? "scale(0.97)" : "scale(1)", transition: "transform 0.15s ease, opacity 0.15s ease" }}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={17} className="nl-spin" /> Saving your order — watch what happens…
                  </>
                ) : (
                  <>
                    {pending ? "Retry same demo checkout" : "Place demo order"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="nl-fine-print nl-center">
                Click triggers real DB + queue work · 6s pacing + 2s handoff · live tracker follows you
              </p>
            </section>
          </div>
          <aside className="nl-order-summary">
            <p className="nl-eyebrow">YOUR CONSIDERED ESSENTIALS</p>
            <h2>Order summary</h2>
            {quote.items.map((i) => (
              <div className="nl-summary-item" key={i.productId}>
                <div>
                  <Image src={i.image} alt={i.name} width={90} height={105} />
                  <span>{i.quantity}</span>
                </div>
                <section>
                  <h3>{i.name}</h3>
                  <p>{i.color}</p>
                </section>
                <strong>{money(i.unitPrice * i.quantity)}</strong>
              </div>
            ))}
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(quote.totalMinor)}</dd>
              </div>
              <div>
                <dt>Demo delivery</dt>
                <dd>$0</dd>
              </div>
              <div>
                <dt>Demo tax</dt>
                <dd>$0</dd>
              </div>
              <div className="nl-summary-total">
                <dt>Demo total</dt>
                <dd>
                  {money(quote.totalMinor)} <small>USD</small>
                </dd>
              </div>
            </dl>
            <p>Calculated from our catalog. No real payment is collected.</p>
            <div style={{ marginTop: 18, padding: 12, background: "#f6f5fa", border: "1px solid #e8e6f0", borderRadius: 10, fontSize: 11, lineHeight: 1.6 }}>
              <strong style={{ fontSize: 10, letterSpacing: 0.8 }}>WHAT HAPPENS WHEN YOU CLICK</strong>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <span>• Order + job saved in same DB transaction</span>
                <span>• Job delayed 6s via startAfter — real queue pacing</span>
                <span>• Worker claims before HTTP, pauses 2s — you’ll see it live</span>
                <span>• Tracker follows you — not just UI, real system</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
