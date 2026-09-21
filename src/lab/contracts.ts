import { z } from "zod";
import type { TimelineEvent } from "../lib/demo-data";

export const scenarios = [
  "accepted",
  "address_rejected",
  "unavailable",
  "accepted_timeout",
  "temporary_outage",
  "lookup_unavailable",
] as const;
export const runStates = [
  "queued",
  "running",
  "accepted",
  "rejected",
  "unavailable",
  "unknown",
] as const;
export const scenarioSchema = z.enum(scenarios);
export const createRunSchema = z
  .object({ requestId: z.uuid(), scenario: scenarioSchema })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type RunState = (typeof runStates)[number];
export interface LabRun {
  id: string;
  orderNumber: string;
  scenario: Scenario;
  status: RunState;
  createdAt: string;
  reference: string;
  warehouseReference: string | null;
  attemptCount: number;
  lookupCount: number;
  nextActionAt: string | null;
  pendingAction: "retry" | "lookup" | null;
  pendingActionId: string | null;
  recoveryJobState?: string;
  reviewReason: string | null;
  jobState?: string;
  events: TimelineEvent[];
}
export const scenarioLabels: Record<Scenario, string> = {
  accepted: "Normal acceptance",
  address_rejected: "Address rejected",
  unavailable: "Warehouse unavailable",
  accepted_timeout: "Accepted, response lost",
  temporary_outage: "Transient outage, then recovery",
  lookup_unavailable: "Status lookup unavailable",
};
export const runLabels: Record<RunState, string> = {
  queued: "Queued",
  running: "Submitting",
  accepted: "Acknowledged",
  rejected: "Needs address review",
  unavailable: "Service unavailable",
  unknown: "Outcome unknown",
};
