import { z } from "zod";

export const fulfillmentStates = [
  "awaiting_submission",
  "submitting",
  "acknowledgement_unknown",
  "retry_scheduled",
  "needs_review",
  "acknowledged",
] as const;
export const failureKinds = [
  "address_rejected",
  "warehouse_unavailable",
  "acknowledgement_unknown",
] as const;
export const exceptionStatuses = [
  "needs_review",
  "retry_scheduled",
  "investigating",
  "resolved",
] as const;
export const fulfillmentStateSchema = z.enum(fulfillmentStates);
export type FulfillmentState = z.infer<typeof fulfillmentStateSchema>;

export const fulfillmentSnapshotSchema = z
  .object({
    state: fulfillmentStateSchema,
    externalReference: z.string().min(1),
    warehouseReference: z.string().min(1).nullable(),
    version: z.number().int().nonnegative(),
  })
  .refine(
    (value) =>
      value.state !== "acknowledged" || value.warehouseReference !== null,
    "Acknowledged fulfillment requires a warehouse reference",
  );
export type FulfillmentSnapshot = z.infer<typeof fulfillmentSnapshotSchema>;

const evidence = z
  .object({
    reference: z.string().min(1),
    detail: z.string().trim().min(1).max(1000),
  })
  .strict();
export const fulfillmentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("submission_started") }).strict(),
  z.object({ type: z.literal("submission_timed_out") }).strict(),
  z.object({ type: z.literal("address_rejected") }).strict(),
  z
    .object({
      type: z.literal("retry_authorized"),
      evidence: evidence.extend({
        basis: z.enum(["provider_idempotency", "confirmed_not_accepted"]),
      }),
    })
    .strict(),
  z
    .object({
      type: z.literal("acceptance_confirmed"),
      warehouseReference: z.string().trim().min(1).max(200),
      evidence,
    })
    .strict(),
  z
    .object({
      type: z.literal("review_required"),
      reason: z.string().trim().min(1).max(1000),
      kind: z.enum(failureKinds).optional(),
    })
    .strict(),
]);
export type FulfillmentEvent = z.infer<typeof fulfillmentEventSchema>;

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

const allowedFrom: Record<
  FulfillmentEvent["type"],
  readonly FulfillmentState[]
> = {
  submission_started: ["awaiting_submission", "retry_scheduled"],
  submission_timed_out: ["submitting"],
  address_rejected: ["submitting"],
  retry_authorized: ["submitting", "acknowledgement_unknown"],
  acceptance_confirmed: [
    "submitting",
    "acknowledgement_unknown",
    "retry_scheduled",
    "needs_review",
  ],
  review_required: ["submitting", "acknowledgement_unknown", "retry_scheduled"],
};

/** Pure policy only: callers must obtain trustworthy evidence from their connector.
 * This function does not perform HTTP requests, verify evidence, or schedule jobs.
 */
export function transitionFulfillment(
  rawCurrent: FulfillmentSnapshot,
  rawEvent: FulfillmentEvent,
): FulfillmentSnapshot {
  const current = fulfillmentSnapshotSchema.parse(rawCurrent);
  const event = fulfillmentEventSchema.parse(rawEvent);
  if (!allowedFrom[event.type].includes(current.state)) {
    throw new InvalidTransitionError(
      `Cannot apply ${event.type} to ${current.state}`,
    );
  }
  if (
    "evidence" in event &&
    event.evidence.reference !== current.externalReference
  ) {
    throw new InvalidTransitionError(
      "Evidence does not match the fulfillment reference",
    );
  }
  const nextState: Record<FulfillmentEvent["type"], FulfillmentState> = {
    submission_started: "submitting",
    submission_timed_out: "acknowledgement_unknown",
    address_rejected: "needs_review",
    retry_authorized: "retry_scheduled",
    acceptance_confirmed: "acknowledged",
    review_required: "needs_review",
  };
  return {
    ...current,
    state: nextState[event.type],
    warehouseReference:
      event.type === "acceptance_confirmed"
        ? event.warehouseReference
        : current.warehouseReference,
    version: current.version + 1,
  };
}

export function exceptionStatusFor(
  state: FulfillmentState,
): (typeof exceptionStatuses)[number] {
  if (state === "acknowledged") return "resolved";
  if (state === "needs_review") return "needs_review";
  if (state === "retry_scheduled") return "retry_scheduled";
  return "investigating";
}
