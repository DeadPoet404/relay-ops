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
} from "lucide-react";
import { money } from "@/store/catalog";
import { runPath } from "@/demo/journey";
import type { StoreOrder } from "@/store/cart";
import type { LabRun } from "@/lab/contracts";
import { GuidedExecutionFlow } from "./guided-execution";

const copy = {
  placed: {
    title: "Your next chapter starts here.",
    description:
      "Your demo order is recorded. Real pacing is active — 6s queue + 2s handoff after durable claim. Watch it live below.",
    label: "Order placed",
  },
  confirming: {
    title: "Relay is working on it.",
    description:
      "You clicked Place — now the worker is handling your order. Original reference kept, never silent duplicate. Live below.",
    label: "Confirming with warehouse",
  },
  review: {
    title: "Your order needs a closer look.",
    description:
      "The demo operations team needs to investigate before this order can move forward. This path intentionally needs review.",
    label: "Needs attention",
  },
  acknowledged: {
    title: "You’re in good hands.",
    description:
      "Our simulated warehouse has acknowledged your order. This confirms receipt — not packing, shipment, or delivery. Live evidence below.",
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
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
          }),
          fetch(`/api/lab/runs/${id}`, {
            cache: "no-store",
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
          }),
        ]);
        if (!oRes.ok)
          throw new Error(
            oRes.status === 404
              ? "This demo order could not be found. Check the original confirmation link; do not place a replacement."
              : "Order status is temporarily unavailable. Any displayed status may be stale; please refresh, not reorder.",
          );
        const oData = (await oRes.json()) as { order: StoreOrder };
        if (active) {
          setOrder(oData.order);
          setRead(new Date().toLocaleTimeString());
          setError(null);
        }
        if (rRes.ok) {
          const rData = (await rRes.json()) as { run: LabRun };
          if (active && rData.run) setLabRun(rData.run);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Status unavailable");
      } finally {
        if (active) timer = setTimeout(() => void load(), 1800);
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
        <p>Production and fixture previews do not expose demo purchase records.</p>
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
        <p role="status" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 size={16} className="animate-spin" />
          Finding your demo order — real pacing active…
        </p>
      ) : (
        <>
          <div className={`nl-status-icon ${order.status === "review" ? "nl-status-warning" : ""}`}>
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
          <span className={`nl-status-pill nl-status-${order.status}`} role="status">
            {state!.label}
          </span>

          <div style={{ marginTop: 24 }}>
            <GuidedExecutionFlow run={labRun} />
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
                  <p>{i.color} · Quantity {i.quantity}</p>
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
            This order’s tracker is live — polling real DB/worker state every 1.8s. Same ID everywhere.
          </p>
        </>
      )}
      <div className="nl-status-read">
        <span>{read ? `Last checked ${read}` : "Waiting for a successful read"}</span>
        <button onClick={() => setRefresh((n) => n + 1)}>
          <RefreshCw size={13} /> Refresh status
        </button>
      </div>
      <p className="nl-fine-print">
        Demonstration only. No payment, shipment, or real support action. Pacing is local presentation — recovery policy unchanged.
      </p>
    </div>
  );
}
