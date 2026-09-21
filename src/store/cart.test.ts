import { describe, expect, it } from "vitest";
import { checkoutSchema, customerStatus, priceCart } from "./cart";
describe("storefront trust boundary", () => {
  it("prices quantities in integer minor units from the server catalog", () => {
    expect(
      priceCart([
        { productId: "ridge-pack", quantity: 2 },
        { productId: "daily-bottle", quantity: 1 },
      ]),
    ).toMatchObject({ totalMinor: 29000, itemCount: 3 });
  });
  it("canonicalizes line ordering for retry identity", () => {
    const a = [
      { productId: "ridge-pack", quantity: 1 },
      { productId: "daily-bottle", quantity: 2 },
    ];
    expect(priceCart(a).fingerprint).toBe(
      priceCart([...a].reverse()).fingerprint,
    );
  });
  it.each(
    [
      [],
      [{ productId: "unknown", quantity: 1 }],
      [{ productId: "ridge-pack", quantity: 0 }],
      [{ productId: "ridge-pack", quantity: 6 }],
      [{ productId: "ridge-pack", quantity: 1.5 }],
      [
        { productId: "ridge-pack", quantity: 1 },
        { productId: "ridge-pack", quantity: 1 },
      ],
      [{ productId: "ridge-pack", quantity: 1, unitPrice: 1 }],
    ].map((cart) => ({ cart })),
  )("rejects invalid or caller-priced cart %#", ({ cart }) => {
    expect(() => priceCart(cart)).toThrow();
  });
  it("rejects caller totals, customer details, payment inputs and extra fields", () => {
    const input = {
      requestId: crypto.randomUUID(),
      scenario: "accepted",
      items: [{ productId: "ridge-pack", quantity: 1 }],
    };
    for (const extra of [
      { totalMinor: 1 },
      { customerEmail: "real@example.com" },
      { card: "123" },
      { forceSubmit: true },
    ])
      expect(checkoutSchema.safeParse({ ...input, ...extra }).success).toBe(
        false,
      );
  });
  it("does not project uncertain, rejected or queued orders as acknowledged", () => {
    for (const status of [
      "queued",
      "unknown",
      "running",
      "unavailable",
      "rejected",
    ])
      expect(customerStatus({ status, reviewReason: null })).not.toBe(
        "acknowledged",
      );
    expect(
      customerStatus({ status: "unknown", reviewReason: "Unverified" }),
    ).toBe("review");
    expect(customerStatus({ status: "accepted", reviewReason: null })).toBe(
      "acknowledged",
    );
  });
});
