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
} from "lucide-react";
import { money } from "@/store/catalog";
import type { StoreOrder } from "@/store/cart";
const copy = {
  placed: {
    title: "Your next chapter starts here.",
    description:
      "Your demo order is recorded. We’re preparing to send it to our simulated warehouse.",
    label: "Order placed",
  },
  confirming: {
    title: "A little care behind the scenes.",
    description:
      "We’re confirming your order with our simulated warehouse. There’s no need to place it again.",
    label: "Confirming with warehouse",
  },
  review: {
    title: "Your order needs a closer look.",
    description:
      "The demo operations team needs to investigate before this order can move forward. Please don’t place a replacement order.",
    label: "Needs attention",
  },
  acknowledged: {
    title: "You’re in good hands.",
    description:
      "Our simulated warehouse has acknowledged your order. This confirms receipt—not packing, shipment, or delivery.",
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
        const response = await fetch(`/api/store/orders/${id}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This demo order could not be found. Check the original confirmation link; do not place a replacement."
              : "Order status is temporarily unavailable. Any displayed status may be stale; please refresh, not reorder.",
          );
        const data = await response.json();
        if (active) {
          setOrder(data.order);
          setError(null);
          setRead(new Date().toLocaleTimeString());
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error ? error.message : "Status unavailable",
          );
      } finally {
        if (active) timer = setTimeout(() => void load(), 2000);
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
  return (
    <div className="nl-status-wrap">
      {error && (
        <div className="nl-alert" role="alert">
          {error}
        </div>
      )}
      {!order ? (
        <p role="status">
          {error
            ? "Your order has not been confirmed here."
            : "Finding your demo order…"}
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
          <div className="nl-status-progress">
            <div className="done">
              <span>
                <Check size={15} />
              </span>
              <strong>Demo order placed</strong>
              <small>No money charged</small>
            </div>
            <div className={order.status !== "placed" ? "done" : ""}>
              <span>
                {order.status !== "placed" ? <Check size={15} /> : "2"}
              </span>
              <strong>Warehouse handoff</strong>
              <small>
                {order.status === "placed"
                  ? "Waiting for worker"
                  : "Submission attempted"}
              </small>
            </div>
            <div className={order.status === "acknowledged" ? "done" : ""}>
              <span>
                {order.status === "acknowledged" ? <Check size={15} /> : "3"}
              </span>
              <strong>Acknowledgement</strong>
              <small>
                {order.status === "acknowledged"
                  ? "Original reference confirmed"
                  : order.status === "review"
                    ? "Needs investigation"
                    : "Awaiting confirmation"}
              </small>
            </div>
          </div>
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
            <Link href="/" className="nl-primary">
              Follow this order in Relay <ArrowRight size={17} />
            </Link>
            <Link href="/store">Back to the collection</Link>
          </div>
          <p className="nl-fine-print">
            Find {order.number} under Demo lab → Recent runs in Relay. Only the
            latest 10 runs appear there.
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
        action is taking place.
      </p>
    </div>
  );
}
