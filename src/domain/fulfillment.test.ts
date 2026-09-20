import { describe, expect, it } from "vitest";
import {
  exceptionStatusFor,
  fulfillmentEventSchema,
  transitionFulfillment,
  type FulfillmentSnapshot,
} from "./fulfillment";

const current = (state: FulfillmentSnapshot["state"]): FulfillmentSnapshot => ({
  state,
  externalReference: "northline-10482-fulfillment-v1",
  warehouseReference: state === "acknowledged" ? "WH-1" : null,
  version: 0,
});
const evidence = {
  reference: current("submitting").externalReference,
  detail: "Simulated connector lookup returned a matching record.",
};

describe("fulfillment policy", () => {
  it("starts a pending submission without mutating its input", () => {
    const before = current("awaiting_submission");
    expect(
      transitionFulfillment(before, { type: "submission_started" }),
    ).toMatchObject({ state: "submitting", version: 1 });
    expect(before.version).toBe(0);
  });
  it("treats a timeout as unknown, not a retry authorization", () => {
    expect(
      transitionFulfillment(current("submitting"), {
        type: "submission_timed_out",
      }).state,
    ).toBe("acknowledgement_unknown");
    expect(() =>
      transitionFulfillment(current("acknowledgement_unknown"), {
        type: "submission_started",
      }),
    ).toThrow();
  });
  it("requires a human review for an address rejection", () => {
    expect(
      transitionFulfillment(current("submitting"), { type: "address_rejected" })
        .state,
    ).toBe("needs_review");
    expect(() =>
      transitionFulfillment(current("needs_review"), {
        type: "retry_authorized",
        evidence: { ...evidence, basis: "provider_idempotency" },
      }),
    ).toThrow();
  });
  it("requires structured evidence before permitting retry", () => {
    expect(
      fulfillmentEventSchema.safeParse({ type: "retry_authorized" }).success,
    ).toBe(false);
    expect(
      transitionFulfillment(current("acknowledgement_unknown"), {
        type: "retry_authorized",
        evidence: { ...evidence, basis: "confirmed_not_accepted" },
      }).state,
    ).toBe("retry_scheduled");
  });
  it("rejects evidence for a different fulfillment reference", () => {
    expect(() =>
      transitionFulfillment(current("acknowledgement_unknown"), {
        type: "acceptance_confirmed",
        warehouseReference: "WH-1",
        evidence: { ...evidence, reference: "another-request" },
      }),
    ).toThrow("Evidence does not match");
  });
  it("requires a nonempty warehouse reference for confirmation", () => {
    expect(
      fulfillmentEventSchema.safeParse({
        type: "acceptance_confirmed",
        warehouseReference: "  ",
        evidence,
      }).success,
    ).toBe(false);
  });
  it("records confirmed acceptance and advances the version", () => {
    expect(
      transitionFulfillment(current("acknowledgement_unknown"), {
        type: "acceptance_confirmed",
        warehouseReference: "WH-1",
        evidence,
      }),
    ).toMatchObject({
      state: "acknowledged",
      warehouseReference: "WH-1",
      version: 1,
    });
  });
  it("does not resubmit or reopen acknowledged fulfillment", () => {
    expect(() =>
      transitionFulfillment(current("acknowledged"), {
        type: "submission_started",
      }),
    ).toThrow();
    expect(() =>
      transitionFulfillment(current("acknowledged"), {
        type: "review_required",
        reason: "try again",
      }),
    ).toThrow();
  });
  it("maps domain states to queue states without conflating the two", () => {
    expect(exceptionStatusFor("acknowledgement_unknown")).toBe("investigating");
    expect(exceptionStatusFor("acknowledged")).toBe("resolved");
    expect(exceptionStatusFor("retry_scheduled")).toBe("retry_scheduled");
  });
  it("rejects unknown event fields and types", () => {
    expect(
      fulfillmentEventSchema.safeParse({
        type: "submission_started",
        force: true,
      }).success,
    ).toBe(false);
    expect(fulfillmentEventSchema.safeParse({ type: "refund" }).success).toBe(
      false,
    );
  });
});
