import { describe, expect, it } from "vitest";
import { canRetrySubmission, retryDelayMs } from "./policy";
import { lookupSimulator, submitToSimulator } from "../simulator/connector";
import { vi } from "vitest";
const reference = `relay-lab-${crypto.randomUUID()}`;
describe("bounded recovery policy", () => {
  it("only retries confirmed temporary unavailability inside the total submission budget", () => {
    expect(canRetrySubmission("unavailable", 1)).toBe(true);
    expect(canRetrySubmission("unavailable", 2)).toBe(true);
    expect(canRetrySubmission("unavailable", 3)).toBe(false);
    for (const result of ["unknown", "rejected", "accepted", "timeout"])
      expect(canRetrySubmission(result, 1)).toBe(false);
  });
  it("uses bounded exponential delays with bounded jitter", () => {
    expect(retryDelayMs(1, 0)).toBe(2000);
    expect(retryDelayMs(2, 0)).toBe(4000);
    expect(retryDelayMs(10, 1)).toBe(10500);
  });
  it("does not trust a 503 lacking the simulator idempotency contract", async () => {
    const stub = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json(
          { code: "TEMPORARY_UNAVAILABLE", reference },
          { status: 503 },
        ),
      );
    try {
      expect(
        await submitToSimulator("http://127.0.0.1", "token", {
          reference,
          scenario: "unavailable",
          currency: "USD",
          amountMinor: 10,
        }),
      ).toEqual({ kind: "unknown" });
    } finally {
      stub.mockRestore();
    }
  });
  it("treats mismatched positive lookup evidence as unavailable, not acceptance", async () => {
    const stub = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({
          accepted: true,
          reference: "wrong",
          warehouseReference: crypto.randomUUID(),
        }),
      );
    try {
      expect(
        await lookupSimulator("http://127.0.0.1", "token", reference),
      ).toEqual({ kind: "unavailable" });
    } finally {
      stub.mockRestore();
    }
  });
  it("never turns a missing or malformed lookup into retry permission", async () => {
    const stub = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          { code: "REFERENCE_NOT_FOUND", reference },
          { status: 404 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ other: true }, { status: 404 }));
    try {
      expect(
        await lookupSimulator("http://127.0.0.1", "token", reference),
      ).toEqual({ kind: "not_found" });
      expect(
        await lookupSimulator("http://127.0.0.1", "token", reference),
      ).toEqual({ kind: "unavailable" });
    } finally {
      stub.mockRestore();
    }
  });
});
