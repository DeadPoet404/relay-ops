import { createServer, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { simulatorReceipts, simulatorRequests } from "../db/schema";
import { submissionSchema } from "./protocol";

function json(response: ServerResponse, code: number, body: object) {
  if (response.destroyed) return;
  response.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}
function authorized(actual: string | undefined, token: string) {
  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(actual ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
export function createSimulator(
  db: Database,
  token: string,
  responseDelayMs = 3500,
) {
  const server = createServer(async (req, res) => {
    if (!authorized(req.headers.authorization, token))
      return json(res, 401, { error: "UNAUTHORIZED" });
    try {
      if (req.method === "GET" && req.url === "/health")
        return json(res, 200, {
          service: "relay-warehouse-simulator",
          simulated: true,
        });
      if (req.method === "GET" && req.url?.startsWith("/fulfillments/")) {
        const reference = decodeURIComponent(
          req.url.slice("/fulfillments/".length),
        );
        if (!/^relay-lab-[0-9a-f-]{36}$/.test(reference))
          return json(res, 400, { error: "INVALID_REFERENCE" });
        const [request] = await db
          .select()
          .from(simulatorRequests)
          .where(eq(simulatorRequests.reference, reference));
        if (request?.scenario === "lookup_unavailable")
          return json(res, 503, { code: "LOOKUP_UNAVAILABLE", reference });
        const [receipt] = await db
          .select()
          .from(simulatorReceipts)
          .where(eq(simulatorReceipts.reference, reference));
        return receipt
          ? json(res, 200, {
              accepted: true,
              reference,
              warehouseReference: receipt.warehouseReference,
            })
          : json(res, 404, { code: "REFERENCE_NOT_FOUND", reference });
      }
      if (req.method !== "POST" || req.url !== "/fulfillments")
        return json(res, 404, { error: "NOT_FOUND" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { error: "JSON_REQUIRED" });
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 4096) {
          json(res, 413, { error: "BODY_TOO_LARGE" });
          req.resume();
          return;
        }
      }
      const parsed = submissionSchema.safeParse(JSON.parse(body));
      if (!parsed.success)
        return json(res, 400, { error: "INVALID_SUBMISSION" });
      const data = parsed.data;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            amountMinor: data.amountMinor,
            currency: data.currency,
            scenario: data.scenario,
          }),
        )
        .digest("hex");
      // Provider-side request count and idempotency are durable. Only HTTP exposes
      // these outcomes to Relay; the worker never queries simulator tables.
      const reply = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${data.reference}, 7304))`,
        );
        const [receipt] = await tx
          .select()
          .from(simulatorReceipts)
          .where(eq(simulatorReceipts.reference, data.reference));
        const [previous] = await tx
          .select()
          .from(simulatorRequests)
          .where(eq(simulatorRequests.reference, data.reference));
        if (
          (receipt && receipt.fingerprint !== fingerprint) ||
          (previous && previous.fingerprint !== fingerprint)
        )
          return { code: 409, body: { error: "REFERENCE_PAYLOAD_MISMATCH" } };
        const count = (previous?.submissionCount ?? 0) + 1;
        await tx
          .insert(simulatorRequests)
          .values({
            reference: data.reference,
            fingerprint,
            scenario: data.scenario,
            submissionCount: count,
          })
          .onConflictDoUpdate({
            target: simulatorRequests.reference,
            set: { submissionCount: count },
          });
        if (receipt)
          return {
            code: 200,
            body: {
              accepted: true,
              reference: data.reference,
              warehouseReference: receipt.warehouseReference,
            },
          };
        if (data.scenario === "address_rejected")
          return {
            code: 422,
            body: { code: "ADDRESS_REJECTED", reference: data.reference },
          };
        if (
          data.scenario === "unavailable" ||
          (data.scenario === "temporary_outage" && count < 3)
        )
          return {
            code: 503,
            body: {
              code: "TEMPORARY_UNAVAILABLE",
              reference: data.reference,
              retrySafe: true,
              idempotency: "reference-v1",
            },
          };
        const [accepted] = await tx
          .insert(simulatorReceipts)
          .values({ reference: data.reference, fingerprint })
          .returning();
        return {
          code: 200,
          body: {
            accepted: true,
            reference: data.reference,
            warehouseReference: accepted.warehouseReference,
          },
        };
      });
      if (
        (data.scenario === "accepted_timeout" ||
          data.scenario === "lookup_unavailable") &&
        reply.code === 200
      ) {
        const timer = setTimeout(
          () => json(res, reply.code, reply.body),
          responseDelayMs,
        );
        res.once("close", () => clearTimeout(timer));
      } else json(res, reply.code, reply.body);
    } catch (error) {
      json(res, error instanceof SyntaxError ? 400 : 503, {
        error:
          error instanceof SyntaxError
            ? "INVALID_JSON"
            : "SIMULATOR_UNAVAILABLE",
      });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}
