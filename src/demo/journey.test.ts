import { describe, expect, it } from "vitest";
import { summarizeRun, runPath, journeyScenarios } from "./journey";
import {
  beginJourney,
  pendingCheckout,
  recentOrder,
  guidedKey,
} from "./browser";
type Evidence = Parameters<typeof summarizeRun>[0];
const base: Evidence = {
  status: "unknown",
  warehouseReference: null,
  attemptCount: 1,
  lookupCount: 0,
  pendingAction: null,
  reviewReason: null,
  recoveredByLookup: false,
};
function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}
describe("plain-language evidence", () => {
  it("does not claim acceptance just because a missing-reply scenario was selected", () => {
    expect(summarizeRun(base)).toMatchObject({
      tone: "pending",
      outcome: "Confirmation pending",
    });
  });
  it("requires a warehouse reference even when the stored status says accepted", () => {
    expect(summarizeRun({ ...base, status: "accepted" }).tone).toBe("pending");
  });
  it("requires actual lookup recovery evidence for the no-repeat recovery summary", () => {
    expect(
      summarizeRun({
        ...base,
        status: "accepted",
        warehouseReference: "warehouse",
        lookupCount: 1,
        recoveredByLookup: true,
      }).title,
    ).toBe("Order confirmed. No repeat submission recorded.");
  });
  it("does not present a lookup claim alone as completed recovery", () => {
    expect(
      summarizeRun({
        ...base,
        status: "accepted",
        warehouseReference: "warehouse",
        lookupCount: 1,
      }).title,
    ).toBe("Order confirmed by the warehouse.");
  });
  it("does not claim no repeated submission after multiple recorded attempts", () => {
    expect(
      summarizeRun({
        ...base,
        status: "accepted",
        warehouseReference: "warehouse",
        lookupCount: 1,
        recoveredByLookup: true,
        attemptCount: 2,
      }).title,
    ).toBe("Order confirmed after bounded recovery.");
  });
  it("labels address rejection as human review", () => {
    expect(summarizeRun({ ...base, status: "rejected" }).tone).toBe("review");
  });
  it("preserves uncertainty when failed lookups require review", () => {
    expect(
      summarizeRun({ ...base, lookupCount: 3, reviewReason: "Unverified" }),
    ).toMatchObject({ tone: "review", outcome: "Human review needed" });
  });
  it("distinguishes scheduled checks, retries and queued work", () => {
    expect(summarizeRun({ ...base, pendingAction: "lookup" }).outcome).toBe(
      "Read-only check scheduled",
    );
    expect(summarizeRun({ ...base, pendingAction: "retry" }).outcome).toBe(
      "Safe retry scheduled",
    );
    expect(
      summarizeRun({ ...base, status: "queued", attemptCount: 0 }).outcome,
    ).toBe("Waiting for the worker");
  });
  it("covers all six warehouse scenarios without changing their identifiers", () => {
    expect(new Set(journeyScenarios.map((s) => s.id)).size).toBe(6);
    expect(journeyScenarios[0].id).toBe("accepted_timeout");
  });
  it("keeps exact order identity in the result link", () => {
    const id = crypto.randomUUID();
    expect(runPath(id)).toBe(`/runs/${id}`);
    expect(runPath("a/b")).toBe("/runs/a%2Fb");
  });
});
describe("guided browser state", () => {
  it("starts a journey without clearing the cart or creating a purchase identity", () => {
    const session = storage();
    const local = storage({ "northline.cart": "existing bag" });
    expect(beginJourney(session, local, "accepted_timeout")).toBe("shop");
    expect(local.getItem("northline.nextScenario")).toBe("accepted_timeout");
    expect(session.getItem(guidedKey)).toBe("true");
    expect(session.getItem("northline.checkout")).toBeNull();
    expect(local.getItem("northline.cart")).toBe("existing bag");
  });
  it("preserves an unfinished checkout instead of changing its scenario", () => {
    const pending = JSON.stringify({
      requestId: crypto.randomUUID(),
      scenario: "address_rejected",
      items: [{ productId: "ridge-pack", quantity: 1 }],
    });
    const session = storage({ "northline.checkout": pending });
    const local = storage({ "northline.nextScenario": "address_rejected" });
    expect(beginJourney(session, local, "accepted_timeout")).toBe("resume");
    expect(session.getItem("northline.checkout")).toBe(pending);
    expect(local.getItem("northline.nextScenario")).toBe("address_rejected");
  });
  it("blocks unreadable pending identity rather than silently replacing it", () => {
    const session = storage({ "northline.checkout": "invalid" });
    const local = storage();
    expect(() => beginJourney(session, local, "accepted")).toThrow();
    expect(local.getItem("northline.nextScenario")).toBeNull();
  });
  it("propagates unavailable browser storage without pretending to start", () => {
    const unavailable = {
      getItem: () => {
        throw Error("Storage blocked");
      },
      setItem: () => {
        throw Error("Storage blocked");
      },
    };
    expect(() => beginJourney(unavailable, storage(), "accepted")).toThrow(
      "Storage blocked",
    );
  });
  it("accepts only a UUID as a recent-order shortcut", () => {
    const id = crypto.randomUUID();
    expect(recentOrder(storage({ "northline.lastOrder": id }))).toBe(id);
    expect(
      recentOrder(storage({ "northline.lastOrder": "javascript:alert(1)" })),
    ).toBeNull();
    expect(recentOrder(storage())).toBeNull();
  });
  it("reads no pending order when no request has been recorded", () => {
    expect(pendingCheckout(storage())).toBeNull();
  });
});
