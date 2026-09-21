"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
  Loader2,
  Clock,
  Truck,
  Search,
} from "lucide-react";
import { money } from "@/store/catalog";
import { runPath } from "@/demo/journey";
import type { StoreOrder } from "@/store/cart";
import type { LabRun } from "@/lab/contracts";
import { deriveLiveJourney, type LiveJourney } from "@/demo/live-stages";

const copy = {
  placed: {
    title: "Your next chapter starts here.",
    description:
      "Your demo order is recorded. Real pacing is active — 6s queue + 2s handoff after durable claim. No payment charged.",
    label: "Order placed",
  },
  confirming: {
    title: "A little care behind the scenes.",
    description:
      "We’re confirming your order with our simulated warehouse. Original reference is kept — never a silent duplicate.",
    label: "Confirming with warehouse",
  },
  review: {
    title: "Your order needs a closer look.",
    description:
      "The demo operations team needs to investigate before this order can move forward. No auto-correction — this is intentional.",
    label: "Needs attention",
  },
  acknowledged: {
    title: "You’re in good hands.",
    description:
      "Our simulated warehouse has acknowledged your order. Confirms receipt — not packing, shipment, or delivery.",
    label: "Warehouse acknowledged",
  },
};

export function StoreOrderView({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [labRun, setLabRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        const [oRes, rRes] = await Promise.all([
          fetch(`/api/store/orders/${id}`, {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
            ]),
          }),
          fetch(`/api/lab/runs/${id}`, {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(8000),
            ]),
          }),
        ]);
        if (!oRes.ok)
          throw new Error(
            oRes.status === 404
              ? "This demo order could not be found. Check the original confirmation link; do not place a replacement."
              : "Order status is temporarily unavailable. Any displayed status may be stale; please refresh, not reorder.",
          );
        const oData = await oRes.json();
        if (active) {
          setOrder(oData.order);
          setRead(new Date().toLocaleTimeString());
          setError(null);
        }
        if (rRes.ok) {
          const rData = await rRes.json();
          if (active && rData.run) setLabRun(rData.run);
        }
      } catch (err) {
        if (active)
          setError(
            err instanceof Error ? err.message : "Status unavailable",
          );
      } finally {
        if (active) timer = setTimeout(() => void load(), 2200);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, enabled, refresh]);

  if (!enabled)
    return (
      <div className="nl-status-wrap">
        <h1>Order tracking is local-only.</h1>
        <p>
          Production and fixture previews do not expose demo purchase records.
        </p>
        <Link href="/store" className="nl-back">
          Return to Northline
        </Link>
      </div>
    );

  const state = order ? copy[order.status] : null;
  const journey: LiveJourney | null = labRun ? deriveLiveJourney(labRun) : null;

  return (
    <div className="nl-status-wrap">
      {error && (
        <div className="nl-alert" role="alert">
          {error}
        </div>
      )}
      {!order ? (
        <p role="status" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={16} className="animate-spin" />
          {error
            ? "Your order has not been confirmed here."
            : "Finding your demo order — real pacing active…"}
        </p>
      ) : (
        <>
          <div
            className={`nl-status-icon ${order.status === "review" ? "nl-status-warning" : ""}`}
          >
            {order.status === "acknowledged" ? (
              <PackageCheck size={28} strokeWidth={1.4} />
            ) : order.status === "review" ? (
              <TriangleAlert size={28} strokeWidth={1.4} />
            ) : order.status === "confirming" ? (
              <Loader2 size={28} strokeWidth={1.4} className="animate-spin" />
            ) : (
              <Check size={28} strokeWidth={1.4} />
            )}
          </div>
          <p className="nl-eyebrow">THANK YOU, ALEX / {order.number}</p>
          <h1>{state!.title}</h1>
          <p className="nl-status-description">{state!.description}</p>
          <span
            className={`nl-status-pill nl-status-${order.status}`}
            role="status"
          >
            {state!.label}
          </span>

          {/* 4-stage live progress - task management style */}
          <div className="nl-status-progress" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
            {(journey?.stages ?? [
              { key: "recorded", title: "Demo order placed", detail: "No money charged", state: "done" as const },
              { key: "submission", title: "Warehouse handoff", detail: order.status === "placed" ? "Waiting for worker" : "Submission attempted", state: order.status !== "placed" ? "done" as const : "active" as const },
              { key: "checking", title: "Checking", detail: order.status === "acknowledged" ? "Response received" : "Awaiting confirmation", state: order.status === "acknowledged" ? "done" as const : "active" as const },
              { key: "final", title: "Acknowledgement", detail: order.status === "acknowledged" ? "Original reference confirmed" : order.status === "review" ? "Needs investigation" : "In progress", state: order.status === "acknowledged" || order.status === "review" ? "done" as const : "pending" as const },
            ]).map((st) => (
              <div key={st.key} className={st.state === "done" ? "done" : st.state === "active" ? "active" : ""}>
                <span>
                  {st.state === "done" ? <Check size={15} /> : st.state === "active" ? <Loader2 size={14} className="animate-spin" /> : st.key === "recorded" ? <Clock size={12} /> : st.key === "submission" ? <Truck size={12} /> : st.key === "checking" ? <Search size={12} /> : st.state === "error" ? <TriangleAlert size={12} /> : st.key.slice(0,1).toUpperCase()}
                </span>
                <strong>{st.title}</strong>
                <small>{st.detail}</small>
              </div>
            ))}
          </div>

          {journey && (
            <div style={{ marginTop: 18, padding: "12px 14px", background: "#f6f5f9", border: "1px solid #e8e6f0", borderRadius: 10, fontSize: 11, lineHeight: 1.6, color: "#5a5a6a" }}>
              <strong style={{ fontSize: 10, letterSpacing: 1, color: "#7a7694" }}>LIVE JOURNEY · {journey.progress}%</strong>
              <div style={{ height: 3, background: "#eceaf5", borderRadius: 3, margin: "8px 0 10px", overflow: "hidden" }}>
                <div style={{ width: `${journey.progress}%`, height: "100%", background: "linear-gradient(90deg,#6d65e0,#a59cf0)", transition: "width .6s ease" }} />
              </div>
              {journey.stages.filter(s => s.state !== "pending").slice(-2).map(s => (
                <div key={s.key} style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <span style={{ color: s.state === "done" ? "#5a52d6" : "#c0a04a" }}>•</span>
                  <span><b>{s.title}:</b> {s.detail}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 10, color: "#8b8aa0" }}>
                Pacing: 6s queue + 2s first handoff after durable claim. Budgets unchanged. {journey.isComplete ? (journey.needsReview ? "Intentionally needs review." : "Ack ≠ packing/shipment.") : "Live — polling every 2.5s."}
              </div>
            </div>
          )}

          <div className="nl-status-order">
            <div className="nl-status-order-heading">
              <h2>Your essentials</h2>
              <span>{order.number}</span>
            </div>
            {order.items.map((i) => (
              <div className="nl-summary-item" key={i.productId}>
                <Image src={i.image} alt={i.name} width={70} height={80} />
                <section>
                  <h3>{i.name}</h3>
                  <p>
                    {i.color} · Quantity {i.quantity}
                  </p>
                </section>
                <strong>{money(i.unitPrice * i.quantity)}</strong>
              </div>
            ))}
            <div className="nl-total">
              <span>Demo total · no charge</span>
              <strong>{money(order.totalMinor)} USD</strong>
            </div>
          </div>
          <div className="nl-status-actions">
            <Link href={runPath(id)} className="nl-primary">
              See how Relay handled this order <ArrowRight size={17} />
            </Link>
            <Link href="/store">Back to the collection</Link>
          </div>
          <p className="nl-fine-print">
            Opens this exact order’s saved result and audit trail. No searching
            or copying order numbers required. Live tracker persists across pages.
          </p>
        </>
      )}
      <div className="nl-status-read">
        <span>
          {read ? `Last checked ${read}` : "Waiting for a successful read"}
        </span>
        <button onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={13} /> Refresh status
        </button>
      </div>
      <p className="nl-fine-print">
        Demonstration only. No payment, shipment, or real customer support
        action is taking place. Pacing is local presentation — recovery policy unchanged.
      </p>
    </div>
  );
}
