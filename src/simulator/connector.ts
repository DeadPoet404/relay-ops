import {
  acceptedSchema,
  type ConnectorResult,
  type Submission,
} from "./protocol";

/** Never retry HTTP submission here. A transport failure is an unknown outcome. */
export async function submitToSimulator(
  baseUrl: string,
  token: string,
  data: Submission,
  timeoutMs = 1500,
): Promise<ConnectorResult> {
  try {
    const response = await fetch(`${baseUrl}/fulfillments`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    const body: unknown = await response.json();
    if (response.status === 200) {
      const accepted = acceptedSchema.safeParse(body);
      if (accepted.success && accepted.data.reference === data.reference)
        return {
          kind: "accepted",
          warehouseReference: accepted.data.warehouseReference,
        };
    }
    if (
      body &&
      typeof body === "object" &&
      "reference" in body &&
      body.reference === data.reference &&
      "code" in body
    ) {
      if (response.status === 422 && body.code === "ADDRESS_REJECTED")
        return { kind: "rejected" };
      if (response.status === 503 && body.code === "TEMPORARY_UNAVAILABLE")
        return { kind: "unavailable" };
    }
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}
