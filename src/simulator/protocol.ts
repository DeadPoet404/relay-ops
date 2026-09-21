import { z } from "zod";
import { scenarioSchema } from "../lab/contracts";
export const submissionSchema = z
  .object({
    reference: z.string().regex(/^relay-lab-[0-9a-f-]{36}$/),
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    scenario: scenarioSchema,
  })
  .strict();
export const acceptedSchema = z
  .object({
    reference: z.string(),
    warehouseReference: z.uuid(),
    accepted: z.literal(true),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;
export type ConnectorResult =
  | { kind: "accepted"; warehouseReference: string }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "unknown" };
