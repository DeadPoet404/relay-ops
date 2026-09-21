import type { Scenario, LabRun } from "../lab/contracts";
export const journeyScenarios: {
  id: Scenario;
  title: string;
  description: string;
  expected: string;
}[] = [
  {
    id: "accepted_timeout",
    title: "The warehouse reply goes missing",
    description:
      "The warehouse receives the order, but its confirmation arrives too late.",
    expected: "Relay checks the original order instead of sending it again.",
  },
  {
    id: "temporary_outage",
    title: "The warehouse needs a moment",
    description:
      "The warehouse temporarily refuses the first two requests, then recovers.",
    expected:
      "Relay retries only when safe, with a limit of three total attempts.",
  },
  {
    id: "address_rejected",
    title: "The address needs attention",
    description: "The warehouse rejects the order because of its address.",
    expected:
      "Relay stops and asks for human review rather than repeating bad input.",
  },
  {
    id: "unavailable",
    title: "The warehouse stays unavailable",
    description:
      "Every submission receives a documented temporary-failure response.",
    expected:
      "Relay stops after three submission attempts. No endless retry loop.",
  },
  {
    id: "lookup_unavailable",
    title: "The warehouse cannot confirm what happened",
    description: "The reply is lost, and follow-up checks also fail.",
    expected:
      "Relay preserves the uncertainty and stops for review. It does not blindly resend.",
  },
  {
    id: "accepted",
    title: "Everything goes to plan",
    description: "The warehouse receives the order and confirms it normally.",
    expected:
      "One submission attempt and a recorded acknowledgement. No recovery needed.",
  },
];
export type EvidenceSummary = {
  title: string;
  description: string;
  tone: "success" | "review" | "pending";
  outcome: string;
};
/** Describe stored evidence, never the planned scenario or provider-only receipt. */
export function summarizeRun(
  run: Pick<
    LabRun,
    | "status"
    | "warehouseReference"
    | "attemptCount"
    | "lookupCount"
    | "reviewReason"
    | "pendingAction"
    | "recoveredByLookup"
  >,
): EvidenceSummary {
  if (run.status === "accepted" && run.warehouseReference) {
    if (run.recoveredByLookup && run.lookupCount > 0 && run.attemptCount === 1)
      return {
        title: "Order confirmed. No repeat submission recorded.",
        description:
          "Relay recorded one submission attempt, then recovered the original warehouse acknowledgement with a read-only check.",
        tone: "success",
        outcome: "Original order confirmed",
      };
    return {
      title:
        run.attemptCount > 1
          ? "Order confirmed after bounded recovery."
          : "Order confirmed by the warehouse.",
      description:
        run.attemptCount > 1
          ? "Relay saved an acknowledgement for the original reference after multiple authorized attempt claims. The audit shows the recorded retry and lookup outcomes."
          : "A matching warehouse reference confirms acceptance. This is not proof of packing, shipment, or delivery.",
      tone: "success",
      outcome: "Warehouse acknowledged",
    };
  }
  if (run.reviewReason || run.status === "rejected")
    return {
      title: "Automation stopped. A person needs to review.",
      description:
        run.status === "rejected"
          ? "The address was rejected. Sending the same information again would not fix it. Address correction is not implemented in this demo."
          : "Relay could not safely finish recovery. It has stopped automation without inventing a warehouse confirmation.",
      tone: "review",
      outcome: "Human review needed",
    };
  if (run.status === "queued")
    return {
      title: "Your order is waiting to be processed.",
      description:
        "The order is saved. Keep the worker and simulated warehouse running; a saved job is not proof that either service is online.",
      tone: "pending",
      outcome: "Waiting for the worker",
    };
  if (run.pendingAction === "lookup")
    return {
      title: "Checking the original order. Not resending it.",
      description:
        "The acknowledgement is uncertain. Relay has scheduled a read-only warehouse check instead of another submission.",
      tone: "pending",
      outcome: "Read-only check scheduled",
    };
  if (run.pendingAction === "retry")
    return {
      title: "Another safe attempt is scheduled.",
      description:
        "A documented temporary failure permits a retry using the same reference. The three-submission limit still applies.",
      tone: "pending",
      outcome: "Safe retry scheduled",
    };
  return {
    title: "Relay is still establishing the outcome.",
    description:
      "No warehouse acceptance can be confirmed from the current evidence. Don’t place a replacement order to work around an uncertain result.",
    tone: "pending",
    outcome: "Confirmation pending",
  };
}
export const runPath = (id: string) => `/runs/${encodeURIComponent(id)}`;
