import { describe, expect, it } from "vitest";
import { fixtureConsoleData, snapshotLabel } from "./console-data";
import { formatMoney } from "./demo-data";
describe("console data contract", () => {
  it("identifies fixture mode explicitly", () => {
    expect(fixtureConsoleData()).toMatchObject({
      source: "fixtures",
      storeName: "Northline Supply",
      snapshotAt: "2026-09-20T10:00:00.000Z",
    });
    expect(fixtureConsoleData().orders).toHaveLength(10);
  });
  it("formats snapshots explicitly in UTC", () => {
    expect(snapshotLabel("2026-09-20T10:00:00.000Z")).toBe(
      "20 Sept 2026 · 10:00 UTC",
    );
  });
  it("does not silently round away monetary cents", () => {
    expect(formatMoney(12345)).toBe("$123.45");
    expect(formatMoney(12300)).toBe("$123");
  });
});
