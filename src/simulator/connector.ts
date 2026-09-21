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
      if (
        response.status === 503 &&
        body.code === "TEMPORARY_UNAVAILABLE" &&
        "retrySafe" in body &&
        body.retrySafe === true &&
        "idempotency" in body &&
        body.idempotency === "reference-v1"
      )
        return { kind: "unavailable" };
    }
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

/** Read-only status lookup. A negative or malformed response NEVER authorizes a POST. */
export async function lookupSimulator(
  baseUrl: string,
  token: string,
  reference: string,
  timeoutMs = 1500,
): Promise<import("./protocol").LookupResult> {
  try {
    const response = await fetch(
      `${baseUrl}/fulfillments/${encodeURIComponent(reference)}`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const body: unknown = await response.json();
    const accepted = acceptedSchema.safeParse(body);
    if (
      response.status === 200 &&
      accepted.success &&
      accepted.data.reference === reference
    )
      return {
        kind: "found",
        warehouseReference: accepted.data.warehouseReference,
      };
    if (
      response.status === 404 &&
      body &&
      typeof body === "object" &&
      "code" in body &&
      body.code === "REFERENCE_NOT_FOUND" &&
      "reference" in body &&
      body.reference === reference
    )
      return { kind: "not_found" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
