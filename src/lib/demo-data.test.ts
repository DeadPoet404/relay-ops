import { describe, expect, it } from "vitest";
import { demoOrders, filterOrders, formatAge, formatMoney } from "./demo-data";

describe("fixture integrity", () => {
  it("uses unique IDs and external references", () => {
    expect(new Set(demoOrders.map((order) => order.id)).size).toBe(
      demoOrders.length,
    );
    expect(new Set(demoOrders.map((order) => order.reference)).size).toBe(
      demoOrders.length,
    );
  });
  it("has 8 open, 3 needs-review, 3 retry and 2 resolved records", () => {
    expect(filterOrders(demoOrders, "open", "", "all")).toHaveLength(8);
    expect(filterOrders(demoOrders, "needs_review", "", "all")).toHaveLength(3);
    expect(filterOrders(demoOrders, "retry_scheduled", "", "all")).toHaveLength(
      3,
    );
    expect(filterOrders(demoOrders, "resolved", "", "all")).toHaveLength(2);
  });
  it("keeps timelines in order and not later than the fixed snapshot", () => {
    for (const order of demoOrders) {
      const times = order.events.map((event) => event.time);
      expect(times).toEqual([...times].sort());
      expect(times.every((time) => time <= "10:00")).toBe(true);
      expect(order.email.endsWith("@example.com")).toBe(true);
    }
  });
});

describe("queue filtering", () => {
  it("matches customer names case insensitively and trims whitespace", () => {
    expect(
      filterOrders(demoOrders, "open", "  AMARA  ", "all").map(
        (order) => order.orderNumber,
      ),
    ).toEqual(["10479"]);
  });
  it("matches order numbers with or without a hash", () => {
    expect(filterOrders(demoOrders, "open", "#10482", "all")).toHaveLength(1);
    expect(filterOrders(demoOrders, "open", "10482", "all")).toHaveLength(1);
  });
  it("combines the status, type, and search constraints", () => {
    expect(
      filterOrders(demoOrders, "needs_review", "", "address_rejected"),
    ).toHaveLength(2);
    expect(
      filterOrders(demoOrders, "needs_review", "Jordan", "address_rejected"),
    ).toHaveLength(0);
  });
  it("does not expose resolved orders in the open queue", () => {
    expect(filterOrders(demoOrders, "open", "10473", "all")).toHaveLength(0);
    expect(filterOrders(demoOrders, "resolved", "10473", "all")).toHaveLength(
      1,
    );
  });
  it("does not mutate source records", () => {
    const before = JSON.stringify(demoOrders);
    filterOrders(demoOrders, "open", "", "all").reverse();
    expect(JSON.stringify(demoOrders)).toBe(before);
  });
});

describe("display helpers", () => {
  it("formats the whole-dollar USD demo amounts", () => {
    expect(formatMoney(104600)).toBe("$1,046");
  });
  it("derives $1,104 in open order value from the fixture amounts", () => {
    const value = filterOrders(demoOrders, "open", "", "all").reduce(
      (sum, order) => sum + order.amountCents,
      0,
    );
    expect(formatMoney(value)).toBe("$1,104");
  });
  it("formats durations", () => {
    expect(formatAge(9)).toBe("9m");
    expect(formatAge(84)).toBe("1h 24m");
    expect(formatAge(60)).toBe("1h 0m");
  });
});
